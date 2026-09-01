// electron/src/logging/logger.js
const fs = require("fs");
const path = require("path");
const config = require("../config");

// Redaction patterns
const SENSITIVE_KEYS = [
    "password", "secret", "token", "authorization", "auth", "jwt", 
    "apikey", "api_key", "devicecredential", "privatekey", "creditcard"
];

function redactSensitiveData(data) {
    if (data === null || data === undefined) return data;
    if (typeof data === "string") {
        // Redact base64 image data URIs
        if (data.startsWith("data:image/") && data.includes(";base64,")) {
            return "[REDACTED_IMAGE_DATA_URI]";
        }
        // Redact Bearer tokens
        if (/Bearer\s+[A-Za-z0-9\-._~+/]+=*/i.test(data)) {
            return data.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]");
        }
        // Redact long base64 strings
        if (data.length > 500 && /^[A-Za-z0-9+/=]+$/.test(data)) {
            return "[REDACTED_LONG_BASE64]";
        }
        return data;
    }
    if (Array.isArray(data)) {
        return data.map(redactSensitiveData);
    }
    if (typeof data === "object") {
        const result = {};
        for (const [key, value] of Object.entries(data)) {
            const lowerKey = key.toLowerCase();
            if (SENSITIVE_KEYS.some(k => lowerKey.includes(k))) {
                result[key] = "[REDACTED]";
            } else {
                result[key] = redactSensitiveData(value);
            }
        }
        return result;
    }
    return data;
}

class Logger {
    constructor() {
        this.logDir = config.LOGS_DIR;
        this.logFile = path.join(this.logDir, "primeidpro.log");
        this.ensureDir();
    }

    ensureDir() {
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }
        } catch (err) {
            console.error("Failed to create log directory:", err);
        }
    }

    rotateLogsIfNeeded() {
        try {
            if (!fs.existsSync(this.logFile)) return;
            const stats = fs.statSync(this.logFile);
            if (stats.size < config.LOG_MAX_BYTES) return;

            // Shift older logs: primeidpro.log.4 -> primeidpro.log.5, etc.
            for (let i = config.LOG_MAX_FILES - 1; i >= 1; i--) {
                const src = path.join(this.logDir, `primeidpro.log.${i}`);
                const dst = path.join(this.logDir, `primeidpro.log.${i + 1}`);
                if (fs.existsSync(src)) {
                    if (i === config.LOG_MAX_FILES - 1 && fs.existsSync(dst)) {
                        fs.unlinkSync(dst);
                    }
                    fs.renameSync(src, dst);
                }
            }

            // Rename current log to .1
            const backup1 = path.join(this.logDir, "primeidpro.log.1");
            if (fs.existsSync(backup1)) fs.unlinkSync(backup1);
            fs.renameSync(this.logFile, backup1);
        } catch (err) {
            console.error("Log rotation failed:", err);
        }
    }

    writeLog(level, event, meta = {}) {
        const timestamp = new Date().toISOString();
        const safeMeta = redactSensitiveData(meta);
        
        const logEntry = {
            timestamp,
            level,
            event,
            appVersion: config.APP_VERSION,
            ...safeMeta
        };

        const line = JSON.stringify(logEntry) + "\n";

        // Console output (pretty in dev, structured in prod)
        if (config.isDev) {
            const metaStr = Object.keys(safeMeta).length ? JSON.stringify(safeMeta) : "";
            console.log(`[${timestamp}] [${level.toUpperCase()}] ${event} ${metaStr}`);
        } else {
            console.log(line.trim());
        }

        try {
            this.rotateLogsIfNeeded();
            fs.appendFileSync(this.logFile, line, "utf-8");
        } catch (err) {
            console.error("Failed to write to log file:", err);
        }
    }

    info(event, meta) {
        this.writeLog("info", event, meta);
    }

    warn(event, meta) {
        this.writeLog("warn", event, meta);
    }

    error(event, meta) {
        this.writeLog("error", event, meta);
    }

    debug(event, meta) {
        if (config.isDev) {
            this.writeLog("debug", event, meta);
        }
    }
}

const logger = new Logger();
module.exports = logger;
