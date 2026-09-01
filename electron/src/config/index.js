// electron/src/config/index.js
const path = require("path");
const os = require("os");
const { app } = require("electron");

const isDev = process.env.NODE_ENV === "development" || !app?.isPackaged;
const APP_ID = "com.primeidpro.desktop";
const APP_NAME = "PrimeIdPro";
const APP_VERSION = "1.0.0";

// Directory resolution
const getUserDataPath = () => {
    try {
        return app ? app.getPath("userData") : path.join(os.homedir(), ".primeidpro");
    } catch {
        return path.join(os.homedir(), ".primeidpro");
    }
};

const USER_DATA_PATH = getUserDataPath();
const DATA_DIR = path.join(USER_DATA_PATH, "data");
const LOGS_DIR = path.join(USER_DATA_PATH, "logs");
const TEMP_PRINT_DIR = path.join(USER_DATA_PATH, "temp-print");
const STAGED_PHOTOS_DIR = path.join(TEMP_PRINT_DIR, "staged");
const DB_PATH = path.join(DATA_DIR, "primeidpro.sqlite");

module.exports = {
    APP_ID,
    APP_NAME,
    APP_VERSION,
    isDev,
    USER_DATA_PATH,
    DATA_DIR,
    LOGS_DIR,
    TEMP_PRINT_DIR,
    STAGED_PHOTOS_DIR,
    DB_PATH,
    
    // Python local backend
    PYTHON_PORT: parseInt(process.env.PORT || "10000", 10),
    PYTHON_HOST: "127.0.0.1",
    get LOCAL_API_URL() {
        return `http://${this.PYTHON_HOST}:${this.PYTHON_PORT}/api/v1`;
    },
    get LOCAL_HEALTH_URL() {
        return `http://${this.PYTHON_HOST}:${this.PYTHON_PORT}/health`;
    },

    // Production remote Central Server (Authority)
    REMOTE_API_BASE_URL: process.env.PRIMEIDPRO_API_URL || "https://primeidpro-central-platform.onrender.com/api/v1",
    REMOTE_API_FALLBACK_URL: process.env.PRIMEIDPRO_FALLBACK_URL || "https://primeidpro.online/api/v1",
    UPDATE_SERVER_URL: process.env.PRIMEIDPRO_UPDATE_URL || "https://updates.primeidpro.online",
    DEFAULT_RELEASE_CHANNEL: "stable",

    // Retention and Queue Limits
    RETENTION_MS: 10 * 60 * 1000, // 10 minutes temporary file cleanup
    CLEANUP_INTERVAL_MS: 60 * 1000, // 1 minute background sweep check
    SYNC_INTERVAL_MS: 15 * 1000, // 15 seconds sync queue processor check
    POLL_INTERVAL_MS: 15 * 1000, // 15 seconds inbound job polling interval
    HEARTBEAT_INTERVAL_MS: 60 * 1000, // 60 seconds device heartbeat
    MAX_SYNC_RETRIES: 10,
    MAX_SYNC_BACKOFF_MS: 15 * 60 * 1000, // 15 minutes max backoff

    // Logging
    LOG_MAX_BYTES: 5 * 1024 * 1024, // 5 MB per log file
    LOG_MAX_FILES: 5,

    // Disk Space
    MIN_FREE_DISK_MB: 200, // 200 MB safety threshold
};

