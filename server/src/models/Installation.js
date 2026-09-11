const mongoose = require('mongoose');

const installationSchema = new mongoose.Schema({
  installationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
    index: true
  },
  deviceName: {
    type: String,
    default: 'PrimeIdPro Desktop'
  },
  hardwareFingerprint: {
    type: String
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'REVOKED'],
    default: 'ACTIVE'
  },
  lastSeenAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Ensure one account = one installation for V1
installationSchema.index({ accountId: 1 }, { unique: true });

module.exports = mongoose.model('Installation', installationSchema);
