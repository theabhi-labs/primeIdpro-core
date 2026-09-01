// electron/src/diagnostics/diagnostics.js
const os = require("os");
const fs = require("fs");
const path = require("path");
const config = require("../config");
const sqliteDb = require("../database/sqliteDb");
const appIdentity = require("../identity/appIdentity");
const { deviceManager } = require("../device/deviceManager");
const updateManager = require("../updater/updateManager");
const logger = require("../logging/logger");

async function checkBackendHealth() {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(config.LOCAL_HEALTH_URL, { signal: controller.signal });
        clearTimeout(timer);
        return res.ok ? "HEALTHY" : "DEGRADED";
    } catch {
        return "OFFLINE";
    }
}

async function checkServerHealth() {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${config.REMOTE_API_BASE_URL.replace('/api/v1', '')}/health`, { signal: controller.signal });
        clearTimeout(timer);
        return res.ok ? "ONLINE" : "DEGRADED";
    } catch {
        return "OFFLINE";
    }
}

function getDiskSpaceInfo() {
    try {
        // Node 18.15+ / fs.statfsSync
        if (typeof fs.statfsSync === "function") {
            const stats = fs.statfsSync(config.USER_DATA_PATH);
            const freeBytes = stats.bfree * stats.bsize;
            const freeMb = Math.round(freeBytes / (1024 * 1024));
            return {
                freeMb,
                minRequiredMb: config.MIN_FREE_DISK_MB,
                isSufficient: freeMb >= config.MIN_FREE_DISK_MB
            };
        }
    } catch (err) {
        logger.warn("DISK_SPACE_CHECK_WARN", { error: err.message });
    }

    return {
        freeMb: "UNKNOWN",
        minRequiredMb: config.MIN_FREE_DISK_MB,
        isSufficient: true
    };
}

async function getFullDiagnostics() {
    const identity = appIdentity.getAppIdentity();
    const device = deviceManager.getDeviceStatus();
    const updater = updateManager.getStatus();
    const backendStatus = await checkBackendHealth();
    const serverStatus = await checkServerHealth();
    const disk = getDiskSpaceInfo();

    let dbStatus = "HEALTHY";
    let pendingJobs = 0;
    let pendingSync = 0;
    let pendingCleanup = 0;

    try {
        const db = sqliteDb.getDb();
        pendingJobs = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status IN ('CREATED', 'PROCESSING')").get()?.count || 0;
        pendingSync = db.prepare("SELECT COUNT(*) as count FROM sync_queue WHERE status = 'PENDING'").get()?.count || 0;
        pendingCleanup = db.prepare("SELECT COUNT(*) as count FROM cleanup_queue WHERE status = 'PENDING'").get()?.count || 0;
    } catch (err) {
        dbStatus = "ERROR";
        logger.error("DIAGNOSTICS_DB_ERROR", { error: err.message });
    }

    return {
        app: {
            appId: identity.appId,
            appName: identity.appName,
            version: identity.appVersion,
            installationId: identity.installationId,
            platform: process.platform,
            arch: process.arch,
            uptimeSeconds: Math.round(process.uptime()),
            isDev: config.isDev
        },
        versions: {
            electron: process.versions.electron,
            node: process.versions.node,
            chrome: process.versions.chrome,
            v8: process.versions.v8
        },
        services: {
            pythonBackend: backendStatus,
            centralServer: serverStatus,
            database: dbStatus
        },
        device: {
            status: device.status,
            isBound: device.isBound,
            centerId: device.centerId,
            deviceId: device.deviceId,
            lastSeen: device.lastSeen
        },
        queue: {
            pendingJobs,
            pendingSync,
            pendingCleanup
        },
        disk,
        updater
    };
}

module.exports = {
    getFullDiagnostics,
    getDiskSpaceInfo,
    checkBackendHealth
};
