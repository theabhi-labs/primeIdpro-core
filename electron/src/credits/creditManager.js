const crypto = require('crypto');
const sqliteDb = require('../database/sqliteDb');
const logger = require('../logging/logger');
const syncQueue = require('../network/syncQueue');

class CreditManager {
  
  /**
   * Initialize or update local credit state based on server response.
   */
  updateServerState(accountId, installationId, serverBalance) {
    const db = sqliteDb.getDb();
    const now = new Date().toISOString();
    
    // UPSERT credit_state
    db.prepare(`
      INSERT INTO credit_state (id, account_id, installation_id, server_confirmed_balance, local_available_balance, updated_at)
      VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        account_id = excluded.account_id,
        installation_id = excluded.installation_id,
        server_confirmed_balance = excluded.server_confirmed_balance,
        local_available_balance = excluded.server_confirmed_balance - (
           SELECT COALESCE(SUM(amount), 0) FROM credit_transactions WHERE status = 'PENDING' OR status = 'SYNCING'
        ),
        updated_at = excluded.updated_at
    `).run(accountId, installationId, serverBalance, serverBalance, now);
  }

  /**
   * Get the current locally available balance and status.
   */
  getBalance() {
    const db = sqliteDb.getDb();
    const state = db.prepare('SELECT local_available_balance FROM credit_state WHERE id = 1').get();
    const device = db.prepare('SELECT status FROM device_state WHERE id = 1').get();
    
    return {
      balance: state ? state.local_available_balance : 0,
      status: device ? device.status : 'ACTIVE'
    };
  }

  canConsume(amount) {
    const { balance, status } = this.getBalance();
    return status !== 'DEACTIVATED' && balance >= amount;
  }

  /**
   * Reserves credit before processing.
   * Actually creates a PENDING debit transaction locally.
   */
  reserve(amount, reason, referenceId) {
    const db = sqliteDb.getDb();
    const state = db.prepare('SELECT account_id, installation_id, local_available_balance FROM credit_state WHERE id = 1').get();
    
    if (!state) throw new Error('CREDIT_STATE_NOT_FOUND');
    if (state.local_available_balance < amount) throw new Error('INSUFFICIENT_CREDITS');

    const txId = crypto.randomUUID();
    const idempotencyKey = \`\${state.installation_id}_\${referenceId}_\${txId}\`;
    const now = new Date().toISOString();

    const applyTx = db.transaction(() => {
      // 1. Insert Transaction
      db.prepare(\`
        INSERT INTO credit_transactions (
          id, account_id, installation_id, type, amount, reason, reference_id, idempotency_key, status, created_at
        ) VALUES (?, ?, ?, 'DEBIT', ?, ?, ?, ?, 'PENDING', ?)
      \`).run(txId, state.account_id, state.installation_id, amount, reason, referenceId, idempotencyKey, now);

      // 2. Update local_available_balance
      db.prepare(\`
        UPDATE credit_state 
        SET local_available_balance = local_available_balance - ?, updated_at = ?
        WHERE id = 1
      \`).run(amount, now);

      // 3. Enqueue to Sync Queue
      db.prepare(\`
        INSERT INTO sync_queue (
            id, event_type, idempotency_key, payload, status, retry_count, created_at, updated_at
        ) VALUES (?, 'CREDIT_TRANSACTION', ?, ?, 'PENDING', 0, ?, ?)
      \`).run(crypto.randomUUID(), idempotencyKey, JSON.stringify({ transactionId: txId }), now, now);
    });

    try {
      applyTx();
      logger.info('CREDIT_RESERVED', { txId, amount, reason });
      return txId;
    } catch (err) {
      logger.error('CREDIT_RESERVE_FAILED', { error: err.message });
      throw err;
    }
  }

  /**
   * Confirm reservation after processing succeeds.
   * Since we already deducted locally, we just mark it as ready if we used a 2-step process.
   * In V1, reservation is essentially a PENDING debit. 
   * If it fails, we call release().
   */
  consume(txId) {
    logger.info('CREDIT_CONSUMED_SUCCESS', { txId });
    // Already deducted during reserve(), no op needed unless we want to change status.
    // SyncManager will handle uploading PENDING transactions.
  }

  /**
   * Release reservation if processing fails.
   * This reverses the local debit and marks the transaction as FAILED/REJECTED.
   */
  release(txId) {
    const db = sqliteDb.getDb();
    const now = new Date().toISOString();
    
    const tx = db.prepare('SELECT * FROM credit_transactions WHERE id = ?').get(txId);
    if (!tx || tx.status !== 'PENDING') return;

    const rollbackTx = db.transaction(() => {
      // Mark as FAILED
      db.prepare("UPDATE credit_transactions SET status = 'FAILED', updated_at = ? WHERE id = ?").run(now, txId);
      
      // Restore local balance
      db.prepare("UPDATE credit_state SET local_available_balance = local_available_balance + ?, updated_at = ? WHERE id = 1").run(tx.amount, now);
      
      // Remove or mark Sync Queue event as failed
      db.prepare("UPDATE sync_queue SET status = 'FAILED' WHERE idempotency_key = ?").run(tx.idempotency_key);
    });

    try {
      rollbackTx();
      logger.info('CREDIT_RELEASED', { txId, amount: tx.amount });
    } catch (err) {
      logger.error('CREDIT_RELEASE_FAILED', { error: err.message });
    }
  }

}

module.exports = new CreditManager();
