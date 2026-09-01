// electron/src/network/syncQueue.js
const crypto = require("crypto");
const config = require("../config");
const sqliteDb = require("../database/sqliteDb");
const logger = require("../logging/logger");
const apiClient = require("./apiClient");

const BACKOFF_SCHEDULE_MS = [
    5 * 1000,
    15 * 1000,
    45 * 1000,
    2 * 60 * 1000,
    5 * 60 * 1000,
    15 * 60 * 1000
];

class SyncQueue {
    constructor() {
        this.timer = null;
        this.isProcessing = false;
    }

    start() {
        this.processQueue();
        this.timer = setInterval(() => this.processQueue(), config.SYNC_INTERVAL_MS);
        logger.info("SYNC_QUEUE_STARTED");
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    enqueueSyncEvent(eventType, payload = {}, jobId = null, customIdempotencyKey = null) {
        const db = sqliteDb.getDb();
        const id = crypto.randomUUID();
        const idempotencyKey = customIdempotencyKey || crypto.randomUUID();
        const now = new Date().toISOString();

        try {
            db.prepare(`
                INSERT INTO sync_queue (
                    id, job_id, event_type, idempotency_key, payload,
                    status, retry_count, next_retry_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)
            `).run(
                id,
                jobId,
                eventType,
                idempotencyKey,
                JSON.stringify(payload),
                now,
                now,
                now
            );

            logger.info("SYNC_EVENT_ENQUEUED", { id, eventType, jobId, idempotencyKey });
            // Immediate tick
            setImmediate(() => this.processQueue());
            return { id, idempotencyKey };
        } catch (err) {
            logger.error("ENQUEUE_SYNC_ERROR", { error: err.message, eventType });
            return null;
        }
    }

    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const db = sqliteDb.getDb();
            const now = new Date().toISOString();

            const pending = db.prepare(`
                SELECT * FROM sync_queue
                WHERE status = 'PENDING' AND (next_retry_at IS NULL OR next_retry_at <= ?)
                ORDER BY created_at ASC
                LIMIT 20
            `).all(now);

            for (const item of pending) {
                await this.syncItem(item);
            }
        } catch (err) {
            logger.error("PROCESS_SYNC_QUEUE_ERROR", { error: err.message });
        } finally {
            this.isProcessing = false;
        }
    }

    async syncItem(item) {
        const db = sqliteDb.getDb();
        const payload = JSON.parse(item.payload);

        let endpoint = "/sync/events";
        if (item.event_type === "JOB_COMPLETED" || item.event_type === "PRINT_COMPLETED") {
            const serverJobId = payload.jobId || item.job_id;
            endpoint = serverJobId ? `/app/jobs/${serverJobId}/complete` : "/jobs/complete";
        } else if (item.event_type === "DEVICE_HEARTBEAT") {
            endpoint = "/devices/heartbeat";
        }

        try {
            const result = await apiClient.post(endpoint, {
                eventType: item.event_type,
                jobId: item.job_id,
                idempotencyKey: item.idempotency_key,
                ...payload
            }, {
                idempotencyKey: item.idempotency_key,
                retries: 1
            });

            const now = new Date().toISOString();

            if (result.success) {
                db.prepare(`
                    UPDATE sync_queue 
                    SET status = 'SYNCED', updated_at = ?, last_error = NULL 
                    WHERE id = ?
                `).run(now, item.id);

                logger.info("SYNC_ITEM_SUCCESS", { id: item.id, eventType: item.event_type });
            } else {
                const nextRetryIdx = Math.min(item.retry_count, BACKOFF_SCHEDULE_MS.length - 1);
                const delayMs = BACKOFF_SCHEDULE_MS[nextRetryIdx];
                const nextRetryAt = new Date(Date.now() + delayMs).toISOString();

                // If fatal auth error (401/403), mark failed
                const isFatal = result.status === 401 || result.status === 403;
                const newStatus = isFatal ? "FAILED" : "PENDING";
                const errorStr = typeof result.error === "string" ? result.error : (result.error?.message || (result.error ? JSON.stringify(result.error) : "Sync failed"));

                db.prepare(`
                    UPDATE sync_queue 
                    SET status = ?, retry_count = retry_count + 1, next_retry_at = ?, last_error = ?, updated_at = ?
                    WHERE id = ?
                `).run(newStatus, nextRetryAt, errorStr, now, item.id);

                logger.warn("SYNC_ITEM_FAILED", { id: item.id, status: newStatus, error: errorStr, nextRetryAt });
            }
        } catch (err) {
            logger.error("SYNC_ITEM_EXCEPTION", { id: item.id, error: err.message });
        }
    }
}

const syncQueue = new SyncQueue();
module.exports = syncQueue;
