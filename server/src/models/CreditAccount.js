const mongoose = require('mongoose');

const creditAccountSchema = new mongoose.Schema({
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
    unique: true,
    index: true
  },
  balance: {
    type: Number,
    required: true,
    default: 0
  },
  lifetimePurchased: {
    type: Number,
    default: 0
  },
  lifetimeUsed: {
    type: Number,
    default: 0
  },
  version: {
    type: Number,
    default: 1
  }
}, { timestamps: true });

module.exports = mongoose.model('CreditAccount', creditAccountSchema);
