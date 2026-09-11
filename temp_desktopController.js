const { v4: uuidv4 } = require('uuid');
const StudioCenter = require('../models/StudioCenter');
const Device = require('../models/Device');
const Job = require('../models/Job');
const UpdateRelease = require('../models/UpdateRelease');
const jobEngineService = require('../services/jobEngineService');
const { generateDeviceToken } = require('../utils/jwt');
const ApiResponse = require('../utils/apiResponse');
const { DEVICE_STATUS, JOB_STATUS } = require('../config/constants');
const deviceController = require('./deviceController');

/**
 * Registers or pairs an Electron desktop application with a CSC Studio Center
 */
const registerOrPairDevice = async (req, res, next) => {
  return deviceController.registerDevice(req, res, next);
};

/**
 * Desktop client heartbeat
 */
const heartbeat = async (req, res, next) => {
  try {
    const { printerStatus, diskSpaceMb, pendingJobsInQueue } = req.body;
    const device = req.device;

    if (printerStatus) {
      device.metrics.printerName = printerStatus.name || device.metrics.printerName;
    }
    await device.save();

    const pendingCount = await Job.countDocuments({
      $or: [
        { centerId: req.centerId },
        { centerId: req.centerId ? req.centerId.toString() : null }
      ],
      $and: [
        {
          $or: [
            { jobStatus: { $in: ['QUEUED', 'SENT_TO_APP', 'DISPATCHED', 'DOWNLOADING', 'PROCESSING', 'READY', 'PRINTING', 'CONFIRMED'] } },
            { paymentStatus: 'PAID', jobStatus: { $nin: ['COMPLETED', 'FAILED', 'CANCELLED'] } }
          ]
        }
      ]
    });

    const center = await StudioCenter.findById(req.centerId).select('walletBalance centerName centerCode');

    return ApiResponse.success(res, {
      status: 'OK',
      serverTime: new Date().toISOString(),
      pendingJobsCount: pendingCount,
      walletBalance: center ? center.walletBalance : 0
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Returns pending jobs to be processed and printed by the desktop client
 */
const getPendingJobs = async (req, res, next) => {
  try {
    const jobs = await jobEngineService.getPendingJobsForCenter(req.centerId, req.device._id);

    const formattedJobs = jobs.map((job) => {
      const photoUrl = job.temporaryPhotoUrl || job.photoUrl || '';
      return {
        id: job._id.toString(),
        jobId: job._id.toString(),
        jobCode: job.jobCode,
        customerName: job.customerName,
        customerPhone: job.customerPhone,
        serviceType: job.serviceType,
        serviceName: job.serviceName,
        paperSize: job.paperSize,
        copies: job.copies,
        priceInr: job.priceInr,
        creditCost: job.creditCost,
        jobStatus: job.jobStatus,
        temporaryPhotoUrl: photoUrl,
        photoUrl: photoUrl,
        downloadUrl: photoUrl,
        imageUrl: photoUrl,
        cropSettings: job.cropSettings,
        backgroundColor: job.backgroundColor,
        createdAt: job.createdAt
      };
    });

    return ApiResponse.success(res, formattedJobs, 'Pending print jobs');
  } catch (err) {
    next(err);
  }
};

/**
 * Desktop claims a job for downloading and local processing
 */
const claimJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await jobEngineService.claimJob(id, req.device._id);

    return ApiResponse.success(res, job, 'Job claimed successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * Desktop updates job state (e.g. PROCESSING, READY, PRINTING)
 */
const updateJobStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, message } = req.body;

    const job = await jobEngineService.updateJobStatus(id, status, message, 'DESKTOP_CLIENT');

    return ApiResponse.success(res, job, `Job status transitioned to ${status}`);
  } catch (err) {
    next(err);
  }
};

/**
 * Desktop posts print completion callback
 * Triggers credit ledger deduction and 10-min privacy auto-purge
 */
const completeJobCallback = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { idempotencyKey, printMetrics } = req.body;

    const job = await jobEngineService.completeJob(id, req.device._id, idempotencyKey, printMetrics);
    const center = await StudioCenter.findById(req.centerId).select('walletBalance');

    return ApiResponse.success(
      res,
      {
        job: {
          id: job._id,
          jobCode: job.jobCode,
          jobStatus: job.jobStatus,
          completedAt: job.completedAt,
          photoExpiresAt: job.photoExpiresAt
        },
        walletBalance: center ? center.walletBalance : 0
      },
      'Job print completed and credit ledger updated'
    );
  } catch (err) {
    next(err);
  }
};

/**
 * Auto-update manifest checker for Prime ID Pro desktop client
 */
const checkUpdates = async (req, res, next) => {
  try {
    const { version = '1.0.0', channel = 'stable' } = req.query;

    const latestRelease = await UpdateRelease.findOne({
      channel,
      isActive: true
    }).sort({ publishedAt: -1 });

    if (!latestRelease) {
      return ApiResponse.success(res, { updateAvailable: false }, 'No updates available');
    }

    const isNewer = latestRelease.version !== version;
    const isMandatory = latestRelease.isMandatory || (latestRelease.minimumSupportedVersion && version < latestRelease.minimumSupportedVersion);

    return ApiResponse.success(res, {
      updateAvailable: isNewer,
      version: latestRelease.version,
      releaseDate: latestRelease.publishedAt,
      downloadUrl: latestRelease.downloadUrl,
      releaseNotes: latestRelease.releaseNotes,
      sha512: latestRelease.sha512,
      isMandatory: Boolean(isMandatory),
      minimumSupportedVersion: latestRelease.minimumSupportedVersion
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  registerOrPairDevice,
  heartbeat,
  getPendingJobs,
  claimJob,
  updateJobStatus,
  completeJobCallback,
  checkUpdates
};
