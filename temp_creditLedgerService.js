const Center = require('../models/Center');
const CreditWallet = require('../models/CreditWallet');
const CreditTransaction = require('../models/CreditTransaction');
const logger = require('../utils/logger');

class CreditLedgerService {
  /**
   * Records an immutable credit ledger transaction with atomic balance updates
   */
  async recordTransaction({
    centerId,
    type,
    amountInr,
    credits,
    referenceType = 'SYSTEM',
    referenceId = '',
    idempotencyKey = null,
    description,
    performedBy = null,
    allowNegative = false
  }) {
    // 1. Idempotency Check
    if (idempotencyKey) {
      const existing = await CreditTransaction.findOne({ idempotencyKey });
      if (existing) {
        logger.info(`[CreditLedger] Idempotent transaction already recorded: ${idempotencyKey}`);
        const wallet = await this.getOrCreateWallet(centerId);
        return {
          success: true,
          ledger: existing,
          currentBalance: wallet.currentBalance,
          isDuplicate: true
        };
      }
    }

    // 2. Ensure CreditWallet exists before mutation
    await this.getOrCreateWallet(centerId);

    let updatedWallet;
    if (credits < 0) {
      const required = Math.abs(credits);
      // Atomic conditional decrement: only succeeds if currentBalance >= required
      if (!allowNegative) {
        updatedWallet = await CreditWallet.findOneAndUpdate(
          {
            centerId,
            currentBalance: { $gte: required }
          },
          {
            $inc: {
              currentBalance: credits, // negative value
              lifetimeUsed: required
            }
          },
          { new: true }
        );

        if (!updatedWallet) {
          const current = await this.getOrCreateWallet(centerId);
          const error = new Error(`Insufficient credits in studio wallet. Required: ${required}, Available: ${current.currentBalance}`);
          error.statusCode = 400;
          error.code = 'INSUFFICIENT_CREDITS';
          throw error;
        }
      } else {
        updatedWallet = await CreditWallet.findOneAndUpdate(
          { centerId },
          {
            $inc: {
              currentBalance: credits,
              lifetimeUsed: required
            }
          },
          { new: true }
        );
      }
    } else {
      // Atomic increment for wallet recharges and credit grants
      updatedWallet = await CreditWallet.findOneAndUpdate(
        { centerId },
        {
          $inc: {
            currentBalance: credits,
            lifetimePurchased: credits
          }
        },
        { new: true, upsert: true }
      );
    }

    // 3. Sync Center.walletBalance
    await Center.findByIdAndUpdate(centerId, { walletBalance: updatedWallet.currentBalance });

    const balanceAfter = updatedWallet.currentBalance;
    const balanceBefore = balanceAfter - credits;

    // 4. Create immutable CreditTransaction record
    let ledgerEntry;
    try {
      ledgerEntry = await CreditTransaction.create({
        centerId,
        amount: amountInr !== undefined ? amountInr : Math.abs(credits),
        credits,
        balanceBefore,
        balanceAfter,
        transactionType: type,
        referenceType,
        referenceId,
        idempotencyKey,
        description,
        performedBy
      });
    } catch (err) {
      // Handle concurrent collision on unique idempotencyKey index
      if (err.code === 11000 && idempotencyKey) {
        const existing = await CreditTransaction.findOne({ idempotencyKey });
        if (existing) {
          return {
            success: true,
            ledger: existing,
            currentBalance: updatedWallet.currentBalance,
            isDuplicate: true
          };
        }
      }
      throw err;
    }

    logger.info(`[CreditLedger] Transaction: ${type} for Center ${centerId}. Credits: ${credits}, Balance: ${updatedWallet.currentBalance}`);

    return {
      success: true,
      ledger: ledgerEntry,
      currentBalance: updatedWallet.currentBalance,
      isDuplicate: false
    };
  }

  /**
   * Helper to ensure wallet exists
   */
  async getOrCreateWallet(centerId) {
    let wallet = await CreditWallet.findOne({ centerId });
    if (!wallet) {
      // Check Center for existing balance
      const center = await Center.findById(centerId);
      const initialBalance = center ? center.walletBalance || 0 : 0;
      wallet = await CreditWallet.create({
        centerId,
        currentBalance: initialBalance,
        lifetimePurchased: initialBalance,
        lifetimeUsed: 0
      });
    }
    return wallet;
  }

  /**
   * Recharges a studio wallet via successful payment
   */
  async rechargeWallet({ centerId, amountInr, credits, paymentId, idempotencyKey, userId = null }) {
    const creds = credits || amountInr; // 1 INR = 1 Credit default
    return this.recordTransaction({
      centerId,
      type: 'PURCHASE',
      amountInr,
      credits: creds,
      referenceType: 'PAYMENT',
      referenceId: paymentId,
      idempotencyKey: idempotencyKey || `recharge_${paymentId}`,
      description: `Wallet recharge of ${creds} credits via Razorpay (${paymentId})`,
      performedBy: userId
    });
  }

  /**
   * Debits a studio wallet for a completed print job (1 photo = 2 credits)
   */
  async debitJobPrint({ centerId, jobId, photoCount = 1, creditCost, idempotencyKey }) {
    const cost = creditCost !== undefined ? creditCost : photoCount * 2;
    return this.recordTransaction({
      centerId,
      type: 'JOB_DEDUCTION',
      amountInr: cost,
      credits: -Math.abs(cost),
      referenceType: 'JOB',
      referenceId: jobId.toString(),
      idempotencyKey: idempotencyKey || `debit_${jobId}`,
      description: `Credit deduction for Print Job #${jobId} (${photoCount} photos @ 2 credits/photo)`
    });
  }

  /**
   * Admin manual credit adjustment
   */
  async adminAdjustment({ centerId, credits, reason, adminUserId, idempotencyKey }) {
    return this.recordTransaction({
      centerId,
      type: 'ADMIN_ADJUSTMENT',
      amountInr: credits,
      credits: Number(credits),
      referenceType: 'ADMIN',
      referenceId: adminUserId ? adminUserId.toString() : 'ADMIN',
      idempotencyKey: idempotencyKey || `admin_adj_${centerId}_${Date.now()}`,
      description: reason || `Admin manual adjustment of ${credits} credits`,
      performedBy: adminUserId,
      allowNegative: false
    });
  }

  /**
   * Retrieves ledger transaction history for a center with pagination
   */
  async getCenterHistory(centerId, { page = 1, limit = 50, type = null }) {
    const query = { centerId };
    if (type) query.transactionType = type;

    const total = await CreditTransaction.countDocuments(query);
    const items = await CreditTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return { items, total, page, limit };
  }
}

module.exports = new CreditLedgerService();
