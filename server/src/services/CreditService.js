const CreditAccount = require('../models/CreditAccount');
const CreditTransaction = require('../models/CreditTransaction');
const Account = require('../models/Account');
const logger = require('../../utils/logger'); // Assuming existing logger

class CreditService {
  /**
   * Applies an atomic transaction to the credit ledger.
   * Enforces idempotency via idempotencyKey.
   */
  async recordTransaction({
    accountId,
    installationId,
    type,
    amount,
    reason,
    referenceId = '',
    idempotencyKey,
    metadata = {},
    allowNegative = false
  }) {
    // 1. Check Idempotency First
    const existingTx = await CreditTransaction.findOne({ accountId, idempotencyKey });
    if (existingTx) {
      logger.info(`[CreditService] Idempotent transaction hit: ${idempotencyKey}`);
      const acc = await this.getOrCreateCreditAccount(accountId);
      return {
        success: true,
        transaction: existingTx,
        currentBalance: acc.balance,
        isDuplicate: true
      };
    }

    // 2. Ensure CreditAccount exists
    await this.getOrCreateCreditAccount(accountId);

    let updatedAccount;
    
    if (type === 'DEBIT') {
      const debitAmount = Math.abs(amount);
      if (!allowNegative) {
        updatedAccount = await CreditAccount.findOneAndUpdate(
          { 
            accountId, 
            balance: { $gte: debitAmount } 
          },
          { 
            $inc: { balance: -debitAmount, lifetimeUsed: debitAmount, version: 1 }
          },
          { new: true }
        );

        if (!updatedAccount) {
          const acc = await this.getOrCreateCreditAccount(accountId);
          throw new Error(`INSUFFICIENT_CREDITS: Required ${debitAmount}, Available ${acc.balance}`);
        }
      } else {
        updatedAccount = await CreditAccount.findOneAndUpdate(
          { accountId },
          { $inc: { balance: -debitAmount, lifetimeUsed: debitAmount, version: 1 } },
          { new: true }
        );
      }
    } else if (type === 'CREDIT' || type === 'ADJUSTMENT' || type === 'REVERSAL') {
      const creditAmount = Math.abs(amount);
      updatedAccount = await CreditAccount.findOneAndUpdate(
        { accountId },
        { $inc: { balance: creditAmount, lifetimePurchased: creditAmount, version: 1 } },
        { new: true }
      );
    } else {
      throw new Error(`INVALID_TRANSACTION_TYPE: ${type}`);
    }

    // 3. Create Immutable Ledger Entry
    try {
      const newTx = await CreditTransaction.create({
        accountId,
        installationId,
        type,
        amount: Math.abs(amount),
        reason,
        referenceId,
        idempotencyKey,
        metadata
      });

      return {
        success: true,
        transaction: newTx,
        currentBalance: updatedAccount.balance,
        isDuplicate: false
      };
    } catch (error) {
      // Catch unique index violation in case of race condition
      if (error.code === 11000) {
        const existingTx = await CreditTransaction.findOne({ accountId, idempotencyKey });
        return {
          success: true,
          transaction: existingTx,
          currentBalance: updatedAccount.balance,
          isDuplicate: true
        };
      }
      throw error;
    }
  }

  async getOrCreateCreditAccount(accountId) {
    let account = await CreditAccount.findOne({ accountId });
    if (!account) {
      account = await CreditAccount.create({ accountId, balance: 0 });
    }
    return account;
  }
  
  async getBalance(accountId) {
    const acc = await this.getOrCreateCreditAccount(accountId);
    return acc.balance;
  }
}

module.exports = new CreditService();
