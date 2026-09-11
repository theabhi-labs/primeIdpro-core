const apiClient = require('../network/apiClient');
const sqliteDb = require('../database/sqliteDb');
const creditManager = require('../credits/creditManager');
const logger = require('../logging/logger');
const config = require('../config');

class AccountVerifier {
  constructor() {
    this.timer = null;
    this.VERIFICATION_INTERVAL_MS = 60 * 60 * 1000; // 1 hour offline grace period policy
  }

  start() {
    this.verify();
    this.timer = setInterval(() => this.verify(), this.VERIFICATION_INTERVAL_MS);
    logger.info("ACCOUNT_VERIFIER_STARTED");
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async verify() {
    try {
      const db = sqliteDb.getDb();
      const state = db.prepare('SELECT account_id, installation_id FROM credit_state WHERE id = 1').get();
      if (!state) return;

      const result = await apiClient.get('/account/status');
      
      if (result.success && result.data) {
        const { status, balance } = result.data;
        
        if (status === 'DEACTIVATED') {
          logger.warn("ACCOUNT_DEACTIVATED_BY_SERVER");
          // Zero out local balance and block processing
          creditManager.updateServerState(state.account_id, state.installation_id, 0);
          db.prepare("UPDATE device_state SET status = 'DEACTIVATED' WHERE id = 1").run();
        } else if (status === 'ACTIVE') {
          // Sync confirmed balance
          creditManager.updateServerState(state.account_id, state.installation_id, balance);
          db.prepare("UPDATE device_state SET status = 'ACTIVE' WHERE id = 1").run();
        }
      }
    } catch (err) {
      logger.warn("ACCOUNT_VERIFICATION_FAILED_OFFLINE", { error: err.message });
      // Offline policy: do not deactivate immediately, rely on last known state.
    }
  }
}

module.exports = new AccountVerifier();
