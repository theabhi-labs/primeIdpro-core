const Installation = require('../models/Installation');
const Account = require('../models/Account');
const User = require('../models/User');
const CreditService = require('./CreditService');

class ActivationService {
  /**
   * Activates a desktop installation and idempotently grants the 20 initial credits.
   */
  async activateInstallation({ userId, installationId, deviceName, hardwareFingerprint }) {
    // 1. Validate User & Find/Create Account
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');

    let account = await Account.findOne({ userId: user._id });
    if (!account) {
      account = await Account.create({ userId: user._id, status: 'ACTIVE' });
    }

    if (account.status === 'DEACTIVATED') {
      throw new Error('ACCOUNT_DEACTIVATED');
    }

    // 2. Validate/Create Installation (One Account = One Installation for V1)
    // Check if account already has an active installation
    const existingInstallation = await Installation.findOne({ accountId: account._id });
    
    if (existingInstallation && existingInstallation.installationId !== installationId) {
       // The V1 rule states ONE Account = ONE Installation. 
       // If they try to activate a DIFFERENT installation with the same account, reject.
       if (existingInstallation.status === 'ACTIVE') {
         throw new Error('ACCOUNT_ALREADY_BOUND_TO_DIFFERENT_INSTALLATION');
       }
    }

    // Check if installation is already bound to someone else
    const installationByHardware = await Installation.findOne({ installationId });
    if (installationByHardware && installationByHardware.accountId.toString() !== account._id.toString()) {
       throw new Error('INSTALLATION_ALREADY_BOUND_TO_DIFFERENT_ACCOUNT');
    }

    let installation = installationByHardware;
    if (!installation) {
      installation = await Installation.create({
        installationId,
        accountId: account._id,
        deviceName,
        hardwareFingerprint,
        status: 'ACTIVE'
      });
    }

    // 3. Grant Initial 20 Credits Idempotently
    // Idempotency key ensures that even if this is called 100 times, only 1 grant happens.
    const idempotencyKey = `init_grant_${account._id}`;
    
    const creditResult = await CreditService.recordTransaction({
      accountId: account._id,
      installationId: installation.installationId,
      type: 'CREDIT',
      amount: 20,
      reason: 'INITIAL_ACTIVATION',
      referenceId: 'SYS_GRANT',
      idempotencyKey: idempotencyKey,
      metadata: { description: 'Welcome 20 Free Credits' },
      allowNegative: false
    });

    return {
      success: true,
      account,
      installation,
      balance: creditResult.currentBalance,
      wasAlreadyGranted: creditResult.isDuplicate
    };
  }
}

module.exports = new ActivationService();
