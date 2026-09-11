const Account = require('../models/Account');
const Installation = require('../models/Installation');
const CreditService = require('../services/CreditService');

class AccountController {
  async getStatus(req, res) {
    try {
      // Assuming middleware extracts these from JWT/session
      const accountId = req.user.accountId;
      const installationId = req.user.installationId;

      const account = await Account.findById(accountId);
      if (!account) {
        return res.status(404).json({ success: false, error: 'ACCOUNT_NOT_FOUND' });
      }

      const installation = await Installation.findOne({ installationId });
      if (!installation || installation.accountId.toString() !== accountId.toString()) {
        return res.status(403).json({ success: false, error: 'INVALID_INSTALLATION' });
      }

      // V1 Rule: Update Last Seen for offline tracking
      installation.lastSeenAt = new Date();
      await installation.save();

      const balance = await CreditService.getBalance(accountId);

      return res.json({
        success: true,
        data: {
          status: account.status,
          balance: balance,
          installationStatus: installation.status
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new AccountController();
