const CreditService = require('./CreditService');
const Account = require('../models/Account');

class TransactionService {
  /**
   * Processes a batch of sync transactions from the local desktop client.
   */
  async syncTransactions(accountId, transactions = []) {
    const results = [];
    
    // 1. Validate Account Status
    const account = await Account.findById(accountId);
    if (!account) {
      throw new Error('ACCOUNT_NOT_FOUND');
    }
    if (account.status === 'DEACTIVATED') {
      throw new Error('ACCOUNT_DEACTIVATED');
    }

    // 2. Process each transaction in the batch
    for (const tx of transactions) {
      try {
        const result = await CreditService.recordTransaction({
          accountId,
          installationId: tx.installation_id,
          type: tx.type,
          amount: tx.amount,
          reason: tx.reason,
          referenceId: tx.reference_id,
          idempotencyKey: tx.idempotency_key,
          allowNegative: false // V1 policy: server is source of truth. If local dropped below 0 erroneously, reject.
        });
        
        results.push({
          id: tx.id,
          status: result.isDuplicate ? 'ALREADY_SYNCED' : 'SYNCED',
          currentBalance: result.currentBalance
        });
      } catch (err) {
        // If there's an error (e.g. insufficient balance on server), mark as REJECTED
        results.push({
          id: tx.id,
          status: err.message.includes('INSUFFICIENT_CREDITS') ? 'REJECTED_INSUFFICIENT_FUNDS' : 'FAILED',
          error: err.message
        });
      }
    }

    // Get the latest confirmed balance to send back to the client
    const currentBalance = await CreditService.getBalance(accountId);

    return {
      success: true,
      currentBalance,
      results
    };
  }
}

module.exports = new TransactionService();
