// electron/src/updater/updateManager.js
let autoUpdater = null;
try {
    const updaterMod = require("electron-updater");
    autoUpdater = updaterMod.autoUpdater;
} catch (err) {
    // When running under pure node tests
}

const config = require("../config");
const logger = require("../logging/logger");

function compareVersions(v1, v2) {
    const p1 = (v1 || "0.0.0").split(".").map(n => parseInt(n, 10) || 0);
    const p2 = (v2 || "0.0.0").split(".").map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const num1 = p1[i] || 0;
        const num2 = p2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
}

class UpdateManager {
    constructor() {
        this.status = "IDLE"; // IDLE, CHECKING, AVAILABLE, DOWNLOADING, DOWNLOADED, ERROR, NOT_AVAILABLE
        this.updateInfo = null;
        this.isMandatory = false;
        this.downloadProgress = 0;
        this.lastError = null;
        this.listeners = new Set();
        this.channel = config.DEFAULT_RELEASE_CHANNEL;
    }

    init(mainWindow) {
        this.mainWindow = mainWindow;
        if (!autoUpdater) {
            logger.warn("AUTO_UPDATER_NOT_AVAILABLE");
            return;
        }

        try {
            autoUpdater.autoDownload = false; // Controlled download
            autoUpdater.autoInstallOnAppQuit = true;
            autoUpdater.channel = this.channel;

            autoUpdater.on("checking-for-update", () => {
                this.status = "CHECKING";
                logger.info("UPDATER_CHECKING");
                this.notify({ status: this.status });
            });

            autoUpdater.on("update-available", (info) => {
                this.status = "AVAILABLE";
                this.updateInfo = info;

                // Check if mandatory based on minimumSupportedVersion
                const minVersion = info.minimumSupportedVersion;
                this.isMandatory = minVersion ? compareVersions(config.APP_VERSION, minVersion) < 0 : !!info.mandatory;

                logger.info("UPDATER_AVAILABLE", { 
                    version: info.version, 
                    isMandatory: this.isMandatory,
                    minVersion 
                });

                this.notify({
                    status: this.status,
                    version: info.version,
                    releaseNotes: info.releaseNotes,
                    isMandatory: this.isMandatory
                });
            });

            autoUpdater.on("update-not-available", (info) => {
                this.status = "NOT_AVAILABLE";
                logger.info("UPDATER_UP_TO_DATE", { version: info?.version });
                this.notify({ status: this.status });
            });

            autoUpdater.on("download-progress", (progressObj) => {
                this.status = "DOWNLOADING";
                this.downloadProgress = Math.round(progressObj.percent);
                this.notify({
                    status: this.status,
                    progress: this.downloadProgress,
                    bytesPerSecond: progressObj.bytesPerSecond
                });
            });

            autoUpdater.on("update-downloaded", (info) => {
                this.status = "DOWNLOADED";
                logger.info("UPDATER_DOWNLOADED_READY", { version: info.version });
                this.notify({
                    status: this.status,
                    version: info.version,
                    isMandatory: this.isMandatory
                });
            });

            autoUpdater.on("error", (err) => {
                this.status = "ERROR";
                this.lastError = err.message;
                logger.error("UPDATER_ERROR", { error: err.message });
                this.notify({ status: this.status, error: err.message });
            });
        } catch (err) {
            logger.error("UPDATER_INIT_ERROR", { error: err.message });
        }
    }

    onUpdateEvent(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notify(payload) {
        for (const listener of this.listeners) {
            try { listener(payload); } catch (e) {}
        }
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send("updater:status", payload);
        }
    }

    async checkForUpdates() {
        if (!config.isDev && autoUpdater) {
            try {
                return await autoUpdater.checkForUpdates();
            } catch (err) {
                logger.error("CHECK_UPDATE_FAILED", { error: err.message });
                this.status = "ERROR";
                this.lastError = err.message;
                return null;
            }
        } else {
            logger.info("UPDATER_DEV_MODE_SKIPPED");
            return null;
        }
    }

    async downloadUpdate() {
        if (autoUpdater && (this.status === "AVAILABLE" || this.status === "ERROR")) {
            try {
                return await autoUpdater.downloadUpdate();
            } catch (err) {
                logger.error("DOWNLOAD_UPDATE_FAILED", { error: err.message });
                return null;
            }
        }
    }

    quitAndInstall() {
        if (autoUpdater && this.status === "DOWNLOADED") {
            autoUpdater.quitAndInstall(false, true);
        }
    }

    getStatus() {
        return {
            status: this.status,
            currentVersion: config.APP_VERSION,
            availableVersion: this.updateInfo?.version || null,
            isMandatory: this.isMandatory,
            progress: this.downloadProgress,
            lastError: this.lastError,
            channel: this.channel
        };
    }
}

const updateManager = new UpdateManager();
module.exports = updateManager;
