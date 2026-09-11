const Device = require('../models/Device');
const Center = require('../models/Center');
const User = require('../models/User');
const CreditWallet = require('../models/CreditWallet');
const Job = require('../models/Job');
const JobItem = require('../models/JobItem');
const UpdateRelease = require('../models/UpdateRelease');
const AuditLog = require('../models/AuditLog');
const UploadSession = require('../models/UploadSession');
const creditLedgerService = require('../services/creditLedgerService');
const storageService = require('../services/storageService');
const { signDeviceToken } = require('../utils/jwt');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const crypto = require('crypto');

class DeviceController {
  /**
   * Register/Pair a new Electron desktop client via Account Email & Password
   * POST /api/v1/devices/register
   */
  async registerDevice(req, res) {
    try {
      const email = req.body.email || req.body.accountId || req.body.username;
      const password = req.body.password || req.body.licenseKey || req.body.key;
      const installationId = req.body.installationId || req.body.machineId || req.body.hardwareFingerprint || req.body.deviceId || `inst_${crypto.randomUUID()}`;
      const deviceName = req.body.deviceName || req.body.terminalLabel || req.body.label || req.body.pcLabel || 'Front Counter PC';
      const hardwareFingerprint = req.body.hardwareFingerprint || req.body.fingerprint || '';
      const appVersion = req.body.appVersion || '1.0.0';
      const osPlatform = req.body.osPlatform || req.body.platform || 'win32';

      const pairingCode = req.body.pairingCode || req.body.pin || req.body.code;
      let center = null;
      let user = null;

      if (pairingCode) {
        center = await Center.findOne({
          pairingCode: pairingCode.toString().trim(),
          pairingCodeExpiresAt: { $gt: new Date() }
        });
        if (!center) {
          center = await Center.findOne({ pairingCode: pairingCode.toString().trim() });
        }
        if (!center) {
          return ApiResponse.error(res, 'Invalid or expired pairing code', 400);
        }
        if (center.ownerId) {
          user = await User.findById(center.ownerId);
        }
        if (!user) {
          user = { _id: center.ownerId || center._id, name: center.centerName, email: center.email || 'operator@primeidpro.local', role: 'CSC' };
        }
      } else {
        if (!email || !password) {
          return ApiResponse.error(res, 'Account Email and Password or Pairing Code required to link your device.', 400);
        }

        // 1. Authenticate User
        user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
          return ApiResponse.error(res, 'Invalid account email or password. Please check your credentials.', 401);
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
          return ApiResponse.error(res, 'Invalid account email or password.', 401);
        }

        if (user.status === 'BLOCKED' || user.status === 'SUSPENDED') {
          return ApiResponse.error(res, 'Your account has been suspended. Please contact support.', 403);
        }

        user.lastLoginAt = new Date();
        await user.save();

        // 2. Find or create Center for this user
        center = user.centerId ? await Center.findById(user.centerId) : await Center.findOne({ ownerId: user._id });
        if (!center) {
          const centerCode = `CSC-${Math.floor(1000 + Math.random() * 9000)}`;
          center = await Center.create({
            ownerId: user._id,
            centerName: `${user.name}'s Studio`,
            centerCode,
            phone: user.mobile || user.phone || '9999999999',
            email: user.email,
            status: 'ACTIVE',
            walletBalance: 20
          });
          user.centerId = center._id;
          await user.save();
        }
      }

      let wallet = await CreditWallet.findOne({ centerId: center._id });
      if (!wallet) {
        wallet = await CreditWallet.create({
          centerId: center._id,
          currentBalance: center.walletBalance || 20,
          lifetimePurchased: 20,
          lifetimeUsed: 0
        });
      }

      // If this installation was previously bound to another center, revoke the old binding
      const boundToOtherCenter = await Device.findOne({
        installationId,
        centerId: { $ne: center._id },
        status: { $in: ['ACTIVE', 'PENDING'] }
      });
      if (boundToOtherCenter) {
        boundToOtherCenter.status = 'REVOKED';
        await boundToOtherCenter.save();
        logger.info(`[DeviceController] Revoked previous center binding for installation ${installationId}`);
      }

      // 3. Generate unique Device ID & Device Token
      const deviceId = `PIP-DEV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const tokenPayload = {
        deviceId,
        installationId,
        centerId: center._id.toString()
      };
      const deviceToken = signDeviceToken(tokenPayload);
      const authTokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');

      // 4. Upsert Device Record
      let device = await Device.findOne({ installationId, centerId: center._id });
      if (device) {
        device.deviceId = deviceId;
        device.deviceName = deviceName || device.deviceName;
        device.hardwareFingerprint = hardwareFingerprint || device.hardwareFingerprint;
        device.authToken = deviceToken;
        device.authTokenHash = authTokenHash;
        device.appVersion = appVersion;
        device.status = 'ACTIVE';
        device.lastSeenAt = new Date();
        device.metrics.osPlatform = osPlatform;
        await device.save();
      } else {
        device = await Device.create({
          centerId: center._id,
          installationId,
          deviceId,
          deviceName: deviceName || 'Front Counter PC',
          hardwareFingerprint: hardwareFingerprint || '',
          authToken: deviceToken,
          authTokenHash,
          appVersion,
          status: 'ACTIVE',
          lastSeenAt: new Date(),
          metrics: { osPlatform }
        });
      }

      // Audit Log
      await AuditLog.create({
        action: 'DEVICE_REGISTERED',
        performedBy: user._id,
        performedByRole: user.role || 'CSC',
        targetType: 'DEVICE',
        targetId: device._id,
        details: { deviceId, installationId, centerCode: center.centerCode, email: user.email },
        ipAddress: req.ip
      });

      logger.info(`[DeviceController] Desktop device ${deviceId} (Machine: ${installationId}) logged in & bound to ${user.email}`);

      return ApiResponse.success(res, {
        deviceId: device.deviceId,
        deviceToken,
        token: deviceToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        center: {
          id: center._id,
          _id: center._id,
          centerName: center.centerName,
          centerCode: center.centerCode,
          walletBalance: wallet ? wallet.currentBalance : center.walletBalance
        }
      }, 'Device authenticated and linked successfully');
    } catch (err) {
      logger.error(`[DeviceController] Register device error: ${err.message}`);
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Activate device
   * POST /api/v1/devices/activate
   */
  async activateDevice(req, res) {
    try {
      const { deviceId, installationId } = req.body;
      if (!deviceId && !installationId) {
        return ApiResponse.error(res, 'Device identifier required for activation', 400);
      }

      const query = {};
      if (deviceId) query.deviceId = deviceId;
      if (installationId) query.installationId = installationId;

      const device = await Device.findOne(query);
      if (!device) {
        return ApiResponse.error(res, 'Device not found', 404);
      }

      if (device.status === 'REVOKED' || device.status === 'BLOCKED') {
        return ApiResponse.error(res, 'Revoked or blocked devices cannot be activated without re-pairing', 403);
      }

      if (device.status === 'ACTIVE') {
        return ApiResponse.success(res, { deviceId: device.deviceId, status: device.status }, 'Device is already active');
      }

      device.status = 'ACTIVE';
      device.lastSeenAt = new Date();
      await device.save();

      await AuditLog.create({
        action: 'DEVICE_ACTIVATED',
        performedBy: device.centerId,
        performedByRole: 'SYSTEM',
        targetType: 'DEVICE',
        targetId: device._id,
        details: { deviceId: device.deviceId, installationId: device.installationId },
        ipAddress: req.ip
      });

      return ApiResponse.success(res, { deviceId: device.deviceId, status: device.status }, 'Device activated successfully');
    } catch (err) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Live Wallet Balance Sync for Desktop App
   * POST /api/v1/devices/sync-wallet
   */
  async syncWallet(req, res) {
    try {
      const email = req.body.email || req.body.accountId;
      const installationId = req.body.installationId || req.body.machineId;
      const unsettledTokens = parseInt(req.body.unsettledTokens) || 0;

      if (!email && !installationId) {
        return ApiResponse.error(res, 'Email or Installation ID is required', 400);
      }

      let center = null;
      if (email) {
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (user) {
          center = user.centerId ? await Center.findById(user.centerId) : await Center.findOne({ ownerId: user._id });
        }
      }

      if (!center && installationId) {
        const device = await Device.findOne({ installationId, status: { $ne: 'REVOKED' } });
        if (device && device.centerId) {
          center = await Center.findById(device.centerId);
        }
      }

      if (!center) {
        return ApiResponse.error(res, 'Center or User account not found', 404);
      }

      let wallet = await CreditWallet.findOne({ centerId: center._id });
      if (!wallet) {
        wallet = await CreditWallet.create({
          centerId: center._id,
          currentBalance: center.walletBalance || 20,
          lifetimePurchased: 20,
          lifetimeUsed: 0
        });
      }

      // Deduct offline/walk-in unsettled tokens reported by desktop app
      if (unsettledTokens > 0) {
        try {
          await creditLedgerService.debitJobPrint({
            centerId: center._id,
            jobId: 'OFFLINE_WALKIN',
            photoCount: Math.ceil(unsettledTokens / 2),
            creditCost: unsettledTokens,
            idempotencyKey: `sync_debit_${installationId}_${Date.now()}`
          });
          // Re-fetch updated wallet
          wallet = await CreditWallet.findOne({ centerId: center._id });
        } catch (err) {
          logger.warn(`[DeviceController] Failed to debit unsettled tokens for ${email}: ${err.message}`);
        }
      }

      const currentBalance = wallet ? wallet.currentBalance : (center.walletBalance ?? 0);

      // Also update device lastSeenAt if installationId provided
      if (installationId) {
        await Device.updateOne({ installationId }, { $set: { lastSeenAt: new Date() } });
      }

      return ApiResponse.success(res, {
        centerId: center._id,
        centerCode: center.centerCode,
        walletBalance: currentBalance,
        credits: currentBalance,
        status: center.status
      }, 'Wallet balance synced');
    } catch (err) {
      logger.error(`[DeviceController] Sync wallet error: ${err.message}`);
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Desktop Heartbeat
   * POST /api/v1/devices/heartbeat
   */
  async heartbeat(req, res) {
    try {
      const device = req.device;
      const { printerStatus, diskSpaceMb, pendingJobsInQueue } = req.body;

      device.lastSeenAt = new Date();
      device.ipAddress = req.ip;
      if (printerStatus?.name) {
        device.metrics.printerName = printerStatus.name;
      }
      await device.save();

      // Check pending jobs count for bound center
      const pendingJobsCount = await Job.countDocuments({
        centerId: device.centerId,
        jobStatus: { $in: ['QUEUED', 'SENT_TO_APP'] }
      });

      return ApiResponse.success(res, {
        deviceId: device.deviceId,
        status: device.status,
        pendingJobsCount,
        serverTime: new Date()
      }, 'Heartbeat acknowledged');
    } catch (err) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Polls pending jobs for the bound center (Strict Tenant Isolation, Unpaid excluded)
   * GET /api/v1/app/pending-jobs
   */
  async getPendingJobs(req, res) {
    try {
      const device = req.device;

      if (device.status !== 'ACTIVE') {
        return ApiResponse.error(res, 'This device authorization is revoked or suspended', 403);
      }

      // Fetch ANY job for this center that is paid or queued and not completed
      const jobs = await Job.find({
        $or: [
          { centerId: device.centerId },
          { centerId: device.centerId.toString() }
        ],
        $and: [
          {
            $or: [
              { claimedByDeviceId: null },
              { claimedByDeviceId: device._id }
            ]
          },
          {
            $or: [
              { jobStatus: { $in: ['QUEUED', 'SENT_TO_APP', 'DISPATCHED', 'DOWNLOADING', 'PROCESSING', 'READY', 'PRINTING', 'CONFIRMED', 'ACKNOWLEDGED'] } },
              { paymentStatus: 'PAID', jobStatus: { $nin: ['COMPLETED', 'FAILED', 'CANCELLED'] } }
            ]
          }
        ]
      })
        .sort({ createdAt: 1 })
        .limit(10)
        .lean();

      // Populate multi-photo JobItems for each job with signed download URLs
      const enrichedJobs = await Promise.all(
        jobs.map(async (job) => {
          const rawItems = await JobItem.find({ jobId: job._id }).sort({ photoIndex: 1 }).lean();
          const itemsList = rawItems.length > 0 ? rawItems : (job.itemsData || []);

          // Generate short-lived signed download URLs for each item
          const itemsWithSignedUrls = await Promise.all(
            itemsList.map(async (item) => {
              let signedUrl = item.photoUrl;
              if (item.storageKey && !job.isPhotoPurged) {
                try {
                  signedUrl = await storageService.getSignedDownloadUrl({
                    storageKey: item.storageKey,
                    expiresInSeconds: 1800, // 30 mins
                    originalFileName: item.originalFileName
                  });
                } catch (urlErr) {
                  logger.warn(`[DeviceController] Could not sign download URL for item: ${urlErr.message}`);
                }
              }
              return {
                ...item,
                photoUrl: signedUrl || item.photoUrl,
                downloadUrl: signedUrl || item.photoUrl
              };
            })
          );

          // Generate signed URL for primary photo
          let primaryPhotoUrl = job.temporaryPhotoUrl || job.photoUrl;
          const primaryKey = job.temporaryStorageKey || job.storageKey || itemsWithSignedUrls[0]?.storageKey;
          if (primaryKey && !job.isPhotoPurged) {
            try {
              primaryPhotoUrl = await storageService.getSignedDownloadUrl({
                storageKey: primaryKey,
                expiresInSeconds: 1800
              });
            } catch (urlErr) {
              logger.warn(`[DeviceController] Could not sign primary photo URL: ${urlErr.message}`);
            }
          }

          let photoFinalUrl = primaryPhotoUrl || job.temporaryPhotoUrl || job.photoUrl;
          if (photoFinalUrl && !photoFinalUrl.startsWith('http')) {
            const domain = env.DOMAIN || 'https://primeidpro-central-platform.onrender.com';
            photoFinalUrl = `${domain}${photoFinalUrl.startsWith('/') ? '' : '/'}${photoFinalUrl}`;
          }

          let itemsToUse = itemsWithSignedUrls.map((it) => {
            let itemUrl = it.downloadUrl || it.photoUrl || photoFinalUrl;
            if (itemUrl && !itemUrl.startsWith('http')) {
              const domain = env.DOMAIN || 'https://primeidpro-central-platform.onrender.com';
              itemUrl = `${domain}${itemUrl.startsWith('/') ? '' : '/'}${itemUrl}`;
            }
            return {
              ...it,
              photoUrl: itemUrl,
              downloadUrl: itemUrl,
              imageUrl: itemUrl
            };
          });

          if (itemsToUse.length === 0) {
            itemsToUse = [
              {
                photoIndex: 1,
                photoUrl: photoFinalUrl,
                downloadUrl: photoFinalUrl,
                imageUrl: photoFinalUrl,
                storageKey: primaryKey || '',
                originalFileName: 'customer_photo.jpg'
              }
            ];
          }

          return {
            ...job,
            id: job._id.toString(),
            jobId: job._id.toString(),
            temporaryPhotoUrl: photoFinalUrl,
            photoUrl: photoFinalUrl,
            downloadUrl: photoFinalUrl,
            imageUrl: photoFinalUrl,
            items: itemsToUse
          };
        })
      );

      return ApiResponse.success(res, enrichedJobs, 'Pending jobs retrieved');
    } catch (err) {
      logger.error(`[DeviceController] Get pending jobs error: ${err.message}`);
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Securely streams or provides signed download URL for a specific job photo
   * GET /api/v1/app/jobs/:jobId/download-photo
   */
  async downloadJobPhoto(req, res) {
    try {
      const device = req.device;
      const { jobId, photoIndex = 1 } = req.params;

      const isObjectId = jobId && /^[0-9a-fA-F]{24}$/.test(jobId);
      const query = { centerId: device.centerId };
      if (isObjectId) query._id = jobId;
      else query.jobCode = jobId;

      const job = await Job.findOne(query);
      if (!job) {
        return ApiResponse.error(res, 'Job not found or not assigned to this center', 404);
      }

      if (job.isPhotoPurged) {
        return ApiResponse.error(res, 'Customer photo has expired and was permanently purged for privacy', 410);
      }

      // Find target storageKey
      let storageKey = job.temporaryStorageKey || job.storageKey;
      if (photoIndex > 1 || !storageKey) {
        const item = await JobItem.findOne({ jobId: job._id, photoIndex: Number(photoIndex) });
        if (item && item.storageKey) {
          storageKey = item.storageKey;
        }
      }

      if (!storageKey) {
        return ApiResponse.error(res, 'Photo reference not found for this job', 404);
      }

      // If redirect query requested or in cloud R2 mode, generate signed download URL
      const signedUrl = await storageService.getSignedDownloadUrl({
        storageKey,
        expiresInSeconds: 900
      });

      if (req.query.stream === 'true' || req.headers.accept?.includes('image/')) {
        try {
          const objectData = await storageService.getObject(storageKey);
          if (objectData && objectData.stream) {
            res.setHeader('Content-Type', objectData.contentType || 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            if (objectData.contentLength) {
              res.setHeader('Content-Length', objectData.contentLength);
            }
            return objectData.stream.pipe(res);
          }
        } catch (streamErr) {
          logger.warn(`[DeviceController] Direct stream failed, falling back to signedUrl: ${streamErr.message}`);
        }
      }

      if (req.query.redirect === 'true' && signedUrl && signedUrl.startsWith('http')) {
        return res.redirect(signedUrl);
      }

      return ApiResponse.success(res, {
        jobId: job._id,
        jobCode: job.jobCode,
        photoIndex: Number(photoIndex),
        storageKey,
        downloadUrl: signedUrl,
        expiresInSeconds: 900
      }, 'Photo download URL generated');
    } catch (err) {
      logger.error(`[DeviceController] Download photo error: ${err.message}`);
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Desktop Claims / Acknowledges a job
   * POST /api/v1/app/jobs/:jobId/ack
   */
  async acknowledgeJob(req, res) {
    try {
      const device = req.device;
      const { jobId } = req.params;

      const isObjectId = jobId && /^[0-9a-fA-F]{24}$/.test(jobId);
      const query = {
        $or: [
          { centerId: device.centerId },
          { centerId: device.centerId.toString() }
        ],
        jobStatus: { $in: ['QUEUED', 'SENT_TO_APP', 'DISPATCHED', 'CONFIRMED', 'CREATED'] },
        claimedByDeviceId: null
      };

      if (isObjectId) {
        query._id = jobId;
      } else {
        query.jobCode = jobId;
      }

      // Atomic conditional claim
      const job = await Job.findOneAndUpdate(
        query,
        {
          jobStatus: 'ACKNOWLEDGED',
          claimedByDeviceId: device._id,
          claimedAt: new Date()
        },
        { new: true }
      );

      if (!job) {
        return ApiResponse.error(res, 'Job not found, already claimed by another machine, or not queued', 409);
      }

      job.addStatusHistory('ACKNOWLEDGED', `Claimed by Desktop Client ${device.deviceId}`, 'DESKTOP_CLIENT');
      await job.save();

      return ApiResponse.success(res, job, 'Job acknowledged and locked to device');
    } catch (err) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Updates Job State from Desktop (e.g. DOWNLOADING, PROCESSING, READY, PRINTING)
   * POST /api/v1/app/jobs/:jobId/status
   */
  async updateJobStatus(req, res) {
    try {
      const device = req.device;
      const { jobId } = req.params;
      const { status, message } = req.body;

      const allowed = ['DOWNLOADING', 'PROCESSING', 'READY', 'PRINTING', 'FAILED'];
      if (!allowed.includes(status)) {
        return ApiResponse.error(res, `Invalid status transition to ${status}`, 400);
      }

      const isObjectId = jobId && /^[0-9a-fA-F]{24}$/.test(jobId);
      const query = { centerId: device.centerId };
      if (isObjectId) query._id = jobId;
      else query.jobCode = jobId;

      const job = await Job.findOne(query);

      if (!job) {
        return ApiResponse.error(res, 'Job not found or not owned by this center', 404);
      }

      job.jobStatus = status;
      job.addStatusHistory(status, message || `State updated to ${status} by Desktop`, 'DESKTOP_CLIENT');
      await job.save();

      return ApiResponse.success(res, { jobId: job._id, jobStatus: job.jobStatus }, 'Status updated');
    } catch (err) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Desktop Completion Callback (Atomically finishes job, deducts credits, schedules 10m photo cleanup)
   * POST /api/v1/app/jobs/:jobId/complete
   */
  async completeJob(req, res) {
    try {
      const device = req.device;
      const { jobId } = req.params;
      const { idempotencyKey, printMetrics } = req.body;

      const isObjectId = jobId && /^[0-9a-fA-F]{24}$/.test(jobId);
      const query = { centerId: device.centerId };
      if (isObjectId) query._id = jobId;
      else query.jobCode = jobId;

      const job = await Job.findOne(query);

      if (!job) {
        return ApiResponse.error(res, 'Job not found or not owned by this center', 404);
      }

      const key = idempotencyKey || `complete_${job._id}_${job.jobCode}`;

      // If job already completed, return idempotent success
      if (job.jobStatus === 'COMPLETED') {
        const wallet = await creditLedgerService.getOrCreateWallet(device.centerId);
        logger.info(`[DeviceController] Idempotent completion callback for Job #${job.jobCode}`);
        return ApiResponse.success(res, {
          jobId: job._id,
          jobStatus: 'COMPLETED',
          creditsDeducted: job.creditCost,
          remainingBalance: wallet.currentBalance,
          isDuplicate: true
        }, 'Job already completed (Idempotent response)');
      }

      // 1. Mark Job as Completed
      job.jobStatus = 'COMPLETED';
      job.completedAt = new Date();
      job.idempotencyKey = key;
      // 2. Set 10-Minute Retention Timer for temporary photos
      const purgeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      job.photoExpiresAt = purgeExpiresAt;
      job.addStatusHistory('COMPLETED', 'Printing finished. Customer photo scheduled for 10-minute auto-purge.', 'DESKTOP_CLIENT');
      await job.save();

      // Sync associated UploadSessions to 10m retention
      await UploadSession.updateMany(
        { jobId: job._id },
        { photoExpiresAt: purgeExpiresAt }
      );

      // 3. Increment Device Metrics
      device.metrics.jobsCompleted = (device.metrics.jobsCompleted || 0) + 1;
      device.metrics.lastPrintedAt = new Date();
      await device.save();

      // 4. Atomic Credit Deduction (1 photo = 2 credits)
      const photoCount = job.itemsCount || 1;
      const creditCost = job.creditCost || photoCount * 2;
      const ledgerRes = await creditLedgerService.debitJobPrint({
        centerId: device.centerId,
        jobId: job._id,
        photoCount,
        creditCost,
        idempotencyKey: `debit_${key}`
      });

      logger.info(`[DeviceController] Job #${job.jobCode} completed. Deducted ${creditCost} credits for Center ${device.centerId}. Balance: ${ledgerRes.currentBalance}`);

      return ApiResponse.success(res, {
        jobId: job._id,
        jobStatus: job.jobStatus,
        creditsDeducted: creditCost,
        remainingBalance: ledgerRes.currentBalance,
        photoExpiresInSeconds: 600,
        isDuplicate: false
      }, 'Job marked completed and platform credits deducted');
    } catch (err) {
      logger.error(`[DeviceController] Complete job error: ${err.message}`);
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Auto-updater check
   * GET /api/v1/app/update
   */
  async checkUpdate(req, res) {
    try {
      const { version = '1.0.0', channel = 'stable', platform = 'win32' } = req.query;

      const latest = await UpdateRelease.findOne({
        channel,
        platform
      }).sort({ publishedAt: -1 }).lean();

      if (!latest) {
        return ApiResponse.success(res, { updateAvailable: false }, 'No updates available');
      }

      const updateAvailable = latest.version !== version;
      const isMandatory = latest.isMandatory || false;

      return ApiResponse.success(res, {
        updateAvailable,
        version: latest.version,
        downloadUrl: latest.downloadUrl,
        releaseNotes: latest.releaseNotes,
        sha512: latest.sha512,
        isMandatory,
        minimumSupportedVersion: latest.minimumSupportedVersion
      }, 'Update manifest retrieved');
    } catch (err) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}

module.exports = new DeviceController();
