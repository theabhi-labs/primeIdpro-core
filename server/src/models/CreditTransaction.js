const mongoose = require('mongoose');

const creditTransactionSchema = new mongoose.Schema({
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
    index: true
  },
  installationId: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['CREDIT', 'DEBIT', 'REVERSAL', 'ADJUSTMENT'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    enum: ['INITIAL_ACTIVATION', 'PHOTO_PRINT_ORDER', 'CARD_ORDER', 'ADMIN_ADJUSTMENT', 'FAILED_ORDER_REVERSAL', 'LEGACY_MIGRATION', 'RECHARGE'],
    required: true
  },
  referenceId: {
    type: String,
    index: true
  },
  idempotencyKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'REJECTED'],
    default: 'SYNCED'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  syncedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Compound index for quick history lookups
creditTransactionSchema.index({ accountId: 1, createdAt: -1 });
creditTransactionSchema.index({ accountId: 1, idempotencyKey: 1 }, { unique: true });

module.exports = mongoose.model('CreditTransaction', creditTransactionSchema);
