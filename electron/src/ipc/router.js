// electron/src/ipc/router.js
const { ipcMain } = require("electron");
const config = require("../config");
const logger = require("../logging/logger");
const appIdentity = require("../identity/appIdentity");
const { validatePrintPayload, validateJobCreate, validatePairingPayload, validateId } = require("./validators");
const printEngine = require("../printing/printEngine");
const { jobEngine } = require("../jobs/jobEngine");
const { deviceManager } = require("../device/deviceManager");
const syncQueue = require("../network/syncQueue");
const jobPoller = require("../network/jobPoller");
const { onlineJobAdapter } = require("../jobs/onlineJobAdapter");
const updateManager = require("../updater/updateManager");
const { getFullDiagnostics, getDiskSpaceInfo } = require("../diagnostics/diagnostics");

function registerIpcHandlers() {
    logger.info("REGISTERING_IPC_HANDLERS");

    // ==========================================
    // BACKWARD COMPATIBILITY CHANNELS
    // ==========================================
    ipcMain.on("get-api-url", (event) => {
        event.returnValue = config.LOCAL_API_URL;
    });

    ipcMain.handle("app:get-api-url", () => {
        return config.LOCAL_API_URL;
    });

    ipcMain.handle("print:native", async (event, payload) => {
        try {
            const validated = validatePrintPayload(payload);
            return await printEngine.printSheetNative(validated.html, validated.options);
        } catch (err) {
            logger.error("IPC_PRINT_NATIVE_ERROR", { error: err.message });
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("print:pdf", async (event, payload) => {
        try {
            const validated = validatePrintPayload(payload);
            return await printEngine.printSheetToPdf(validated.html, validated.options);
        } catch (err) {
            logger.error("IPC_PRINT_PDF_ERROR", { error: err.message });
            return { success: false, error: err.message };
        }
    });

    // ==========================================
    // STRUCTURED NAMESPACED CHANNELS (primeIdPro)
    // ==========================================

    // APP
    ipcMain.handle("app:getIdentity", () => {
        return appIdentity.getAppIdentity();
    });

    ipcMain.handle("app:getDiskSpace", () => {
        return getDiskSpaceInfo();
    });

    // JOBS
    ipcMain.handle("jobs:create", async (event, payload) => {
        try {
            const validated = validateJobCreate(payload);
            const job = jobEngine.createJob(validated);
            return { success: true, job };
        } catch (err) {
            logger.error("IPC_JOB_CREATE_ERROR", { error: err.message });
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("jobs:get", async (event, jobId) => {
        try {
            const validId = validateId(jobId);
            const job = jobEngine.getJob(validId);
            if (!job) return { success: false, error: "Job not found" };
            return { success: true, job };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("jobs:list", async (event, params = {}) => {
        try {
            const jobs = jobEngine.listJobs(params);
            return { success: true, jobs };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("jobs:listOnline", async () => {
        try {
            const jobs = jobEngine.listJobs({ source: "ONLINE" });
            return { success: true, jobs };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("jobs:updateStatus", async (event, { jobId, status, processingStatus, printStatus }) => {
        try {
            const validId = validateId(jobId);
            const job = jobEngine.updateJob(validId, { status, processingStatus, printStatus });
            return { success: true, job };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // PRINTING
    ipcMain.handle("printing:print", async (event, { html, options, jobId } = {}) => {
        try {
            const validated = validatePrintPayload({ html, options });
            if (jobId) jobEngine.markJobPrinting(jobId);
            const result = await printEngine.printSheetNative(validated.html, validated.options, jobId);
            if (result.success && result.status === "PRINTED" && jobId) {
                onlineJobAdapter.onPrintCompleted(jobId, { mode: result.mode });
            }
            return result;
        } catch (err) {
            if (jobId) jobEngine.markJobPrintFailed(jobId, err.message);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("printing:createPdf", async (event, { html, options, jobId } = {}) => {
        try {
            const validated = validatePrintPayload({ html, options });
            return await printEngine.printSheetToPdf(validated.html, validated.options, jobId);
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // DEVICE
    ipcMain.handle("device:status", () => {
        return deviceManager.getDeviceStatus();
    });

    ipcMain.handle("device:pair", async (event, payload) => {
        try {
            const validated = validatePairingPayload(payload);
            const device = await deviceManager.pairWithCentral(validated);
            // Trigger immediate poll and heartbeat cycle
            jobPoller.poll();
            return { success: true, device };
        } catch (err) {
            logger.error("IPC_DEVICE_PAIR_ERROR", { error: err.message });
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("device:unpair", () => {
        try {
            const device = deviceManager.unpair();
            return { success: true, device };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("device:bind", async (event, { centerId, deviceId, credential } = {}) => {
        try {
            if (!centerId || !deviceId) throw new Error("Center ID and Device ID are required");
            const status = deviceManager.bindDevice({ centerId, deviceId, credential });
            return { success: true, device: status };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("device:revoke", () => {
        const status = deviceManager.revokeDevice();
        return { success: true, device: status };
    });

    // POLLER & SYNC
    ipcMain.handle("poller:status", () => {
        return jobPoller.getStatus();
    });

    ipcMain.handle("poller:trigger", async () => {
        await jobPoller.poll();
        return jobPoller.getStatus();
    });

    ipcMain.handle("sync:enqueue", async (event, { eventType, payload, jobId }) => {
        try {
            const enqueued = syncQueue.enqueueSyncEvent(eventType, payload, jobId);
            return { success: true, syncId: enqueued?.id };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // UPDATER
    ipcMain.handle("updater:status", () => {
        return updateManager.getStatus();
    });

    ipcMain.handle("updater:check", async () => {
        await updateManager.checkForUpdates();
        return updateManager.getStatus();
    });

    ipcMain.handle("updater:download", async () => {
        await updateManager.downloadUpdate();
        return updateManager.getStatus();
    });

    ipcMain.handle("updater:install", () => {
        updateManager.quitAndInstall();
    });

    // DIAGNOSTICS
    ipcMain.handle("diagnostics:get", async () => {
        try {
            return await getFullDiagnostics();
        } catch (err) {
            logger.error("IPC_DIAGNOSTICS_ERROR", { error: err.message });
            return { error: err.message };
        }
    });

    logger.info("IPC_HANDLERS_REGISTERED");
}

module.exports = {
    registerIpcHandlers
};
