// electron/src/network/jobPoller.js
const EventEmitter = require("events");
const config = require("../config");
const apiClient = require("./apiClient");
const { deviceManager, DEVICE_STATUS } = require("../device/deviceManager");
const { onlineJobAdapter } = require("../jobs/onlineJobAdapter");
const sqliteDb = require("../database/sqliteDb");
const logger = require("../logging/logger");

class JobPoller extends EventEmitter {
    constructor() {
        super();
        this.timer = null;
        this.isPolling = false;
        this.consecutiveFailures = 0;
        this.pollIntervalMs = config.POLL_INTERVAL_MS;
        this.lastPollAt = null;
        this.lastSuccessAt = null;
    }

    start() {
        if (this.timer) return;
        logger.info("JOB_POLLER_STARTED", { intervalMs: this.pollIntervalMs });
        this.scheduleNext(1000); // Initial poll after 1 second
    }

    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        logger.info("JOB_POLLER_STOPPED");
    }

    scheduleNext(delayMs) {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.poll(), delayMs);
    }

    async poll() {
        if (this.isPolling) return;
        this.isPolling = true;
        this.lastPollAt = new Date().toISOString();

        try {
            const devStatus = deviceManager.getDeviceStatus();

            // Only poll if device is ACTIVE and bound
            if (devStatus.status !== DEVICE_STATUS.ACTIVE || !devStatus.isBound) {
                this.scheduleNext(this.pollIntervalMs);
                this.isPolling = false;
                return;
            }

            const res = await apiClient.get("/app/pending-jobs", { timeout: 15000 });

            if (res.success) {
                this.consecutiveFailures = 0;
                this.lastSuccessAt = new Date().toISOString();

                const pendingJobs = Array.isArray(res.data) ? res.data : [];
                if (pendingJobs.length > 0) {
                    logger.info("PENDING_JOBS_DISCOVERED", { count: pendingJobs.length });
                    await this.processPendingJobs(pendingJobs);
                }

                this.scheduleNext(this.pollIntervalMs);
            } else {
                this.consecutiveFailures++;
                const backoffMs = Math.min(this.pollIntervalMs * Math.pow(1.5, this.consecutiveFailures), 120000); // Cap at 2m

                if (res.status === 403) {
                    logger.warn("POLLER_DEVICE_REVOKED_BY_SERVER");
                    deviceManager.revokeDevice();
                    this.emit("device-revoked");
                } else {
                    logger.warn("POLLER_CYCLE_FAILED", {
                        status: res.status,
                        error: res.error,
                        consecutiveFailures: this.consecutiveFailures,
                        nextRetryInMs: backoffMs
                    });
                }

                this.scheduleNext(backoffMs);
            }
        } catch (err) {
            this.consecutiveFailures++;
            const backoffMs = Math.min(this.pollIntervalMs * Math.pow(1.5, this.consecutiveFailures), 120000);
            logger.error("POLLER_UNEXPECTED_ERROR", { error: err.message, nextRetryInMs: backoffMs });
            this.scheduleNext(backoffMs);
        } finally {
            this.isPolling = false;
        }
    }

    async processPendingJobs(jobs) {
        const db = sqliteDb.getDb();

        for (const centralJob of jobs) {
            const serverJobId = String(centralJob.jobId || centralJob._id || centralJob.jobCode);

            // 1. Duplicate check in local SQLite
            const existing = db.prepare("SELECT id FROM jobs WHERE server_job_id = ?").get(serverJobId);
            if (existing) {
                continue; // Already processed
            }

            logger.info("CLAIMING_REMOTE_JOB", { serverJobId, jobCode: centralJob.jobCode });

            // 2. Claim lock on Central Platform
            const ackRes = await apiClient.post(`/app/jobs/${serverJobId}/ack`, {});
            if (ackRes.success) {
                logger.info("REMOTE_JOB_CLAIMED_SUCCESS", { serverJobId });

                // 3. Ingest into local SQLite JobEngine and stage photos
                try {
                    const ingestResult = await onlineJobAdapter.ingestCentralJob(centralJob);
                    this.emit("job-received", {
                        serverJobId,
                        localJob: ingestResult.localJob,
                        stagedItems: ingestResult.stagedItems
                    });
                } catch (ingestErr) {
                    logger.error("INGEST_CENTRAL_JOB_ERROR", { serverJobId, error: ingestErr.message });
                }
            } else if (ackRes.status === 409) {
                logger.info("JOB_ALREADY_CLAIMED_BY_ANOTHER_CLIENT", { serverJobId });
            } else {
                logger.warn("JOB_CLAIM_FAILED", { serverJobId, status: ackRes.status, error: ackRes.error });
            }
        }
    }

    getStatus() {
        return {
            isRunning: !!this.timer,
            isPolling: this.isPolling,
            consecutiveFailures: this.consecutiveFailures,
            lastPollAt: this.lastPollAt,
            lastSuccessAt: this.lastSuccessAt
        };
    }
}

const jobPoller = new JobPoller();
module.exports = jobPoller;
