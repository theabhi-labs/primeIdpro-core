const Job = require('../models/Job');
const StudioCenter = require('../models/StudioCenter');
const Device = require('../models/Device');
const creditLedgerService = require('./creditLedgerService');
const { JOB_STATUS, PAYMENT_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

class JobEngineService {
  /**
   * Creates a new customer print job
   */
  async createJob({
    jobCode,
    trackingPin,
    customerId = null,
    customerName,
    customerPhone,
    customerEmail = '',
    centerId,
    serviceType,
    serviceName,
    paperSize,
    copies,
    priceInr,
    creditCost,
    temporaryPhotoUrl,
    storageKey,
    cropSettings = {},
    backgroundColor = '#FFFFFF',
    paymentMethod = 'RAZORPAY',
    razorpayOrderId = null
  }) {
    const job = await Job.create({
      jobCode,
      trackingPin,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      centerId,
      serviceType,
      serviceName,
      paperSize,
      copies,
      priceInr,
      creditCost,
      temporaryPhotoUrl,
      storageKey,
      cropSettings,
      backgroundColor,
      paymentMethod,
      razorpayOrderId,
      paymentStatus: paymentMethod === 'CASH_AT_COUNTER' ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PENDING,
      jobStatus: paymentMethod === 'CASH_AT_COUNTER' ? JOB_STATUS.DISPATCHED : JOB_STATUS.CREATED,
      statusHistory: [
        {
          status: JOB_STATUS.CREATED,
          message: 'Order created and waiting for payment/confirmation',
          source: 'CUSTOMER'
        }
      ]
    });

    logger.info(`[JobEngine] Job created: ${job.jobCode} for Center ${centerId}`);
    return job;
  }

  /**
   * Marks a job as paid and dispatches it to the CSC center's desktop queue
   */
  async markJobPaid(jobId, paymentId, signature) {
    const job = await Job.findById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    job.paymentStatus = PAYMENT_STATUS.PAID;
    job.razorpayPaymentId = paymentId;
    job.razorpaySignature = signature;
    job.jobStatus = JOB_STATUS.DISPATCHED;

    job.statusHistory.push({
      status: JOB_STATUS.PAID,
      message: `Payment of ₹${job.priceInr} received via Razorpay (${paymentId})`,
      source: 'RAZORPAY'
    });

    job.statusHistory.push({
      status: JOB_STATUS.DISPATCHED,
      message: 'Job dispatched to Studio Desktop Queue',
      source: 'SYSTEM'
    });

    await job.save();
    logger.info(`[JobEngine] Job ${job.jobCode} marked PAID and DISPATCHED`);
    return job;
  }

  /**
   * Retrieves pending jobs for a specific studio center
   */
  async getPendingJobsForCenter(centerId, deviceId = null, limit = 10) {
    const filters = [
      {
        $or: [
          { centerId },
          { centerId: centerId ? centerId.toString() : null }
        ]
      },
      {
        $or: [
          { jobStatus: { $in: ['QUEUED', 'SENT_TO_APP', 'DISPATCHED', 'DOWNLOADING', 'PROCESSING', 'READY', 'PRINTING', 'CONFIRMED', 'ACKNOWLEDGED'] } },
          { paymentStatus: 'PAID', jobStatus: { $nin: ['COMPLETED', 'FAILED', 'CANCELLED'] } }
        ]
      }
    ];

    if (deviceId) {
      filters.push({
        $or: [
          { claimedByDeviceId: null },
          { claimedByDeviceId: deviceId }
        ]
      });
    }

    return Job.find({ $and: filters })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();
  }

  /**
   * Desktop client claims a job to begin downloading and processing
   */
  async claimJob(jobId, deviceId) {
    const job = await Job.findById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    job.claimedByDeviceId = deviceId;
    job.jobStatus = JOB_STATUS.DOWNLOADING;
    job.statusHistory.push({
      status: JOB_STATUS.DOWNLOADING,
      message: `Job claimed by Desktop Device ID ${deviceId}`,
      source: 'DESKTOP_CLIENT'
    });

    await job.save();
    logger.info(`[JobEngine] Job ${job.jobCode} claimed by device ${deviceId}`);
    return job;
  }

  /**
   * Updates job status state machine
   */
  async updateJobStatus(jobId, status, message = '', source = 'DESKTOP_CLIENT') {
    const job = await Job.findById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    job.jobStatus = status;
    job.statusHistory.push({
      status,
      message: message || `Status updated to ${status}`,
      source
    });

    await job.save();
    logger.info(`[JobEngine] Job ${job.jobCode} status transitioned to: ${status}`);
    return job;
  }

  /**
   * Desktop client completion callback
   * Debits the credit ledger and schedules the 10-minute privacy purge for the photo
   */
  async completeJob(jobId, deviceId, idempotencyKey = null, metrics = {}) {
    const job = await Job.findById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    // 1. Mark job status as completed
    job.jobStatus = JOB_STATUS.COMPLETED;
    job.completedAt = new Date();
    job.idempotencyKey = idempotencyKey || job.idempotencyKey;

    // 2. Schedule 10-minute retention expiration for temporary photo
    job.photoExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    job.statusHistory.push({
      status: JOB_STATUS.COMPLETED,
      message: `Print completed successfully on desktop client. Photo scheduled for 10-min privacy auto-purge.`,
      source: 'DESKTOP_CLIENT'
    });

    await job.save();

    // 3. Debit CSC center credit ledger if not already debited
    if (!job.isLedgerDebited && job.creditCost > 0) {
      try {
        await creditLedgerService.debitJobPrint({
          centerId: job.centerId,
          jobId: job._id,
          creditCost: job.creditCost,
          idempotencyKey: `debit_${job._id}_${idempotencyKey || Date.now()}`
        });
        job.isLedgerDebited = true;
        await job.save();
      } catch (debitErr) {
        logger.error(`[JobEngine] Failed to debit ledger for job ${job._id}:`, debitErr);
      }
    }

    // 4. Update device metrics
    if (deviceId) {
      try {
        await Device.findByIdAndUpdate(deviceId, {
          $inc: { 'metrics.jobsCompleted': 1 },
          $set: { 'metrics.lastPrintedAt': new Date() }
        });
      } catch (devErr) {
        logger.warn(`[JobEngine] Error updating device metrics for ${deviceId}:`, devErr);
      }
    }

    logger.info(`[JobEngine] Job ${job.jobCode} successfully COMPLETED and ledger updated`);
    return job;
  }
}

module.exports = new JobEngineService();
