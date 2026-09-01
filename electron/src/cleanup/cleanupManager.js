// electron/src/cleanup/cleanupManager.js
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const config = require("../config");
const sqliteDb = require("../database/sqliteDb");
const logger = require("../logging/logger");

const ALLOWED_TEMP_DIRS = [
    path.resolve(config.TEMP_PRINT_DIR),
    path.resolve(config.STAGED_PHOTOS_DIR),
    path.resolve(path.join(os.tmpdir(), "primeidpro-print"))
];

function isSafeToDelete(filePath) {
    if (!filePath || typeof filePath !== "string") return false;
    const resolved = path.resolve(filePath);
    return ALLOWED_TEMP_DIRS.some(dir => resolved.startsWith(dir) && resolved !== dir);
}

class CleanupManager {
    constructor() {
        this.timer = null;
    }

    start() {
        this.ensureDirs();
        this.sweep();
        this.timer = setInterval(() => this.sweep(), config.CLEANUP_INTERVAL_MS);
        logger.info("CLEANUP_MANAGER_STARTED", { intervalMs: config.CLEANUP_INTERVAL_MS });
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    ensureDirs() {
        ALLOWED_TEMP_DIRS.forEach(dir => {
            try {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
            } catch (err) {
                logger.error("CLEANUP_MKDIR_ERROR", { dir, error: err.message });
            }
        });
    }

    scheduleCleanup(filePath, jobId = null, delayMs = config.RETENTION_MS) {
        if (!isSafeToDelete(filePath)) {
            logger.warn("CLEANUP_SKIPPED_UNSAFE_PATH", { filePath });
            return;
        }

        const db = sqliteDb.getDb();
        const id = crypto.randomUUID();
        const deleteAfter = new Date(Date.now() + delayMs).toISOString();
        const now = new Date().toISOString();

        try {
            db.prepare(`
                INSERT INTO cleanup_queue (id, file_path, job_id, delete_after, status, retry_count, created_at)
                VALUES (?, ?, ?, ?, 'PENDING', 0, ?)
            `).run(id, filePath, jobId, deleteAfter, now);

            logger.info("CLEANUP_SCHEDULED", { filePath, jobId, deleteAfter });
        } catch (err) {
            logger.error("SCHEDULE_CLEANUP_ERROR", { error: err.message, filePath });
        }
    }

    async sweep() {
        try {
            const db = sqliteDb.getDb();
            const now = new Date().toISOString();

            // 1. Process database cleanup queue items that are due
            const dueItems = db.prepare(`
                SELECT * FROM cleanup_queue
                WHERE status = 'PENDING' AND delete_after <= ?
                LIMIT 50
            `).all(now);

            for (const item of dueItems) {
                await this.deleteItem(item);
            }

            // 2. Filesystem sweep of temp directories for orphaned files older than retention period
            await this.sweepDirectory(config.TEMP_PRINT_DIR);
            const osTempDir = path.join(os.tmpdir(), "primeidpro-print");
            if (fs.existsSync(osTempDir)) {
                await this.sweepDirectory(osTempDir);
            }
        } catch (err) {
            logger.error("CLEANUP_SWEEP_ERROR", { error: err.message });
        }
    }

    async deleteItem(item) {
        const db = sqliteDb.getDb();
        if (!isSafeToDelete(item.file_path)) {
            db.prepare("UPDATE cleanup_queue SET status = 'FAILED' WHERE id = ?").run(item.id);
            return;
        }

        try {
            if (fs.existsSync(item.file_path)) {
                await fsp.unlink(item.file_path);
                logger.info("CLEANUP_FILE_DELETED", { filePath: item.file_path });
            }
            db.prepare("UPDATE cleanup_queue SET status = 'COMPLETED' WHERE id = ?").run(item.id);
        } catch (err) {
            logger.warn("CLEANUP_DELETE_FAILED_RETRYING_LATER", { filePath: item.file_path, error: err.message });
            db.prepare(`
                UPDATE cleanup_queue 
                SET retry_count = retry_count + 1,
                    delete_after = ?
                WHERE id = ?
            `).run(new Date(Date.now() + 60 * 1000).toISOString(), item.id);
        }
    }

    async sweepDirectory(dirPath) {
        try {
            if (!fs.existsSync(dirPath)) return;
            const entries = await fsp.readdir(dirPath, { withFileTypes: true });
            const now = Date.now();

            for (const entry of entries) {
                if (entry.isFile()) {
                    const fullPath = path.join(dirPath, entry.name);
                    try {
                        const stats = await fsp.stat(fullPath);
                        const ageMs = now - stats.mtimeMs;
                        if (ageMs >= config.RETENTION_MS) {
                            if (isSafeToDelete(fullPath)) {
                                await fsp.unlink(fullPath);
                                logger.info("CLEANUP_ORPHAN_DELETED", { path: fullPath, ageMinutes: Math.round(ageMs / 60000) });
                            }
                        }
                    } catch (e) {
                        // File locked or inaccessible — ignore for next sweep
                    }
                }
            }
        } catch (err) {
            logger.error("SWEEP_DIR_ERROR", { dirPath, error: err.message });
        }
    }
}

const cleanupManager = new CleanupManager();
module.exports = cleanupManager;
