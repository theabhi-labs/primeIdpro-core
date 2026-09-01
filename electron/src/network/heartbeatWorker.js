// electron/src/network/heartbeatWorker.js
const config = require("../config");
const apiClient = require("./apiClient");
const { deviceManager, DEVICE_STATUS } = require("../device/deviceManager");
const diagnostics = require("../diagnostics/diagnostics");
const sqliteDb = require("../database/sqliteDb");
const logger = require("../logging/logger");

class HeartbeatWorker {
    constructor() {
        this.timer = null;
        this.intervalMs = config.HEARTBEAT_INTERVAL_MS;
        this.lastHeartbeatAt = null;
    }

    start() {
        if (this.timer) return;
        logger.info("HEARTBEAT_WORKER_STARTED", { intervalMs: this.intervalMs });
        this.scheduleNext(5000); // First heartbeat 5 seconds after launch
    }

    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        logger.info("HEARTBEAT_WORKER_STOPPED");
    }

    scheduleNext(delayMs) {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.sendHeartbeat(), delayMs);
    }

    async sendHeartbeat() {
        try {
            const devStatus = deviceManager.getDeviceStatus();

            if (devStatus.status !== DEVICE_STATUS.ACTIVE || !devStatus.isBound) {
                this.scheduleNext(this.intervalMs);
                return;
            }

            const disk = diagnostics.getDiskSpaceInfo();
            let pendingJobsInQueue = 0;

            try {
                const db = sqliteDb.getDb();
                pendingJobsInQueue = db.prepare("SELECT COUNT(*) as cnt FROM jobs WHERE status IN ('CREATED', 'PROCESSING')").get()?.cnt || 0;
            } catch {
                // Ignore db count error
            }

            const payload = {
                printerStatus: {
                    name: "System Default Printer",
                    isDefault: true,
                    status: "READY"
                },
                diskSpaceMb: typeof disk.freeMb === "number" ? disk.freeMb : 5000,
                pendingJobsInQueue
            };

            const res = await apiClient.post("/devices/heartbeat", payload, { timeout: 10000 });

            if (res.success) {
                this.lastHeartbeatAt = new Date().toISOString();
                deviceManager.updateLastSeen();
                logger.info("HEARTBEAT_ACKNOWLEDGED", {
                    deviceId: devStatus.deviceId,
                    serverTime: res.data?.serverTime
                });
            } else if (res.status === 403) {
                logger.warn("HEARTBEAT_DEVICE_REVOKED");
                deviceManager.revokeDevice();
            } else {
                logger.warn("HEARTBEAT_FAILED", { status: res.status, error: res.error });
            }
        } catch (err) {
            logger.warn("HEARTBEAT_ERROR", { error: err.message });
        } finally {
            this.scheduleNext(this.intervalMs);
        }
    }

    getStatus() {
        return {
            isRunning: !!this.timer,
            lastHeartbeatAt: this.lastHeartbeatAt
        };
    }
}

const heartbeatWorker = new HeartbeatWorker();
module.exports = heartbeatWorker;
