// electron/src/jobs/jobEngine.js
const crypto = require("crypto");
const sqliteDb = require("../database/sqliteDb");
const logger = require("../logging/logger");
const {
    JOB_TYPES,
    JOB_SOURCES,
    OVERALL_STATUS,
    PROCESSING_STATUS,
    PRINT_STATUS,
    SYNC_STATUS
} = require("./jobModel");

class JobEngine {
    constructor() {
        this.listeners = new Set();
    }

    onJobUpdate(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    emitJobUpdate(job) {
        for (const listener of this.listeners) {
            try {
                listener(job);
            } catch (err) {
                logger.error("JOB_UPDATE_LISTENER_ERROR", { error: err.message });
            }
        }
    }

    createJob({
        type = JOB_TYPES.PHOTO,
        source = JOB_SOURCES.LOCAL,
        orderId = null,
        serverJobId = null,
        items = [],
        metadata = {}
    }) {
        const db = sqliteDb.getDb();
        const jobId = crypto.randomUUID();
        const now = new Date().toISOString();

        const syncStatus = source === JOB_SOURCES.ONLINE ? SYNC_STATUS.PENDING : SYNC_STATUS.NOT_REQUIRED;

        const tx = db.transaction(() => {
            db.prepare(`
                INSERT INTO jobs (
                    id, server_job_id, order_id, type, source,
                    status, processing_status, print_status, sync_status,
                    item_count, metadata, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                jobId,
                serverJobId,
                orderId,
                type,
                source,
                OVERALL_STATUS.CREATED,
                PROCESSING_STATUS.WAITING,
                PRINT_STATUS.NOT_PRINTED,
                syncStatus,
                items.length || 1,
                JSON.stringify(metadata),
                now,
                now
            );

            // Insert initial items
            const insertItem = db.prepare(`
                INSERT INTO job_items (
                    id, job_id, item_index, original_path,
                    processed_url, transparent_url, bg_color,
                    status, error, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            items.forEach((item, index) => {
                const itemId = item.id || crypto.randomUUID();
                insertItem.run(
                    itemId,
                    jobId,
                    index,
                    item.originalPath || null,
                    item.processedUrl || null,
                    item.transparentUrl || null,
                    item.bgColor || null,
                    item.status || PROCESSING_STATUS.WAITING,
                    item.error || null,
                    now
                );
            });
        });

        tx();
        logger.info("JOB_CREATED", { jobId, type, source, itemCount: items.length });
        const job = this.getJob(jobId);
        this.emitJobUpdate(job);
        return job;
    }

    getJob(jobId) {
        const db = sqliteDb.getDb();
        const jobRow = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
        if (!jobRow) return null;

        const items = db.prepare("SELECT * FROM job_items WHERE job_id = ? ORDER BY item_index ASC").all(jobId);

        return {
            id: jobRow.id,
            serverJobId: jobRow.server_job_id,
            orderId: jobRow.order_id,
            type: jobRow.type,
            source: jobRow.source,
            status: jobRow.status,
            processingStatus: jobRow.processing_status,
            printStatus: jobRow.print_status,
            syncStatus: jobRow.sync_status,
            itemCount: jobRow.item_count,
            metadata: jobRow.metadata ? JSON.parse(jobRow.metadata) : {},
            createdAt: jobRow.created_at,
            updatedAt: jobRow.updated_at,
            items: items.map(i => ({
                id: i.id,
                itemIndex: i.item_index,
                originalPath: i.original_path,
                processedUrl: i.processed_url,
                transparentUrl: i.transparent_url,
                bgColor: i.bg_color,
                status: i.status,
                error: i.error,
                createdAt: i.created_at
            }))
        };
    }

    listJobs({ limit = 50, offset = 0, status = null, type = null } = {}) {
        const db = sqliteDb.getDb();
        let query = "SELECT * FROM jobs WHERE 1=1";
        const params = [];

        if (status) {
            query += " AND status = ?";
            params.push(status);
        }
        if (type) {
            query += " AND type = ?";
            params.push(type);
        }

        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
        params.push(limit, offset);

        const rows = db.prepare(query).all(...params);
        return rows.map(r => ({
            id: r.id,
            serverJobId: r.server_job_id,
            orderId: r.order_id,
            type: r.type,
            source: r.source,
            status: r.status,
            processingStatus: r.processing_status,
            printStatus: r.print_status,
            syncStatus: r.sync_status,
            itemCount: r.item_count,
            createdAt: r.created_at,
            updatedAt: r.updated_at
        }));
    }

    updateJob(jobId, { status, processingStatus, printStatus, syncStatus, metadata } = {}) {
        const db = sqliteDb.getDb();
        const now = new Date().toISOString();
        const sets = ["updated_at = ?"];
        const params = [now];

        if (status) { sets.push("status = ?"); params.push(status); }
        if (processingStatus) { sets.push("processing_status = ?"); params.push(processingStatus); }
        if (printStatus) { sets.push("print_status = ?"); params.push(printStatus); }
        if (syncStatus) { sets.push("sync_status = ?"); params.push(syncStatus); }
        if (metadata) { sets.push("metadata = ?"); params.push(JSON.stringify(metadata)); }

        params.push(jobId);
        db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`).run(...params);

        const job = this.getJob(jobId);
        this.emitJobUpdate(job);
        return job;
    }

    markJobProcessing(jobId) {
        return this.updateJob(jobId, {
            status: OVERALL_STATUS.PROCESSING,
            processingStatus: PROCESSING_STATUS.PROCESSING
        });
    }

    markJobReady(jobId, items = []) {
        const db = sqliteDb.getDb();
        const now = new Date().toISOString();

        if (items.length > 0) {
            const updateItem = db.prepare(`
                UPDATE job_items 
                SET processed_url = ?, transparent_url = ?, bg_color = ?, status = ?
                WHERE job_id = ? AND item_index = ?
            `);
            const tx = db.transaction(() => {
                items.forEach((item, index) => {
                    updateItem.run(
                        item.processedUrl || null,
                        item.transparentUrl || null,
                        item.bgColor || null,
                        PROCESSING_STATUS.READY,
                        jobId,
                        index
                    );
                });
            });
            tx();
        }

        return this.updateJob(jobId, {
            status: OVERALL_STATUS.READY,
            processingStatus: PROCESSING_STATUS.READY
        });
    }

    markJobPrinting(jobId) {
        return this.updateJob(jobId, {
            status: OVERALL_STATUS.PRINTING,
            printStatus: PRINT_STATUS.PRINTING
        });
    }

    markJobPrinted(jobId) {
        return this.updateJob(jobId, {
            status: OVERALL_STATUS.COMPLETED,
            printStatus: PRINT_STATUS.PRINTED
        });
    }

    markJobPrintFailed(jobId, error) {
        logger.warn("JOB_PRINT_FAILED", { jobId, error });
        return this.updateJob(jobId, {
            status: OVERALL_STATUS.READY, // Can retry print
            printStatus: PRINT_STATUS.PRINT_FAILED
        });
    }

    markJobFailed(jobId, error) {
        logger.error("JOB_FAILED", { jobId, error });
        return this.updateJob(jobId, {
            status: OVERALL_STATUS.FAILED,
            processingStatus: PROCESSING_STATUS.FAILED
        });
    }

    // Startup Crash Recovery
    recoverInterruptedJobs() {
        const db = sqliteDb.getDb();
        const now = new Date().toISOString();

        logger.info("RECOVERING_INTERRUPTED_JOBS");

        // 1. Reset jobs stuck in PROCESSING -> WAITING
        const procResult = db.prepare(`
            UPDATE jobs
            SET status = ?, processing_status = ?, updated_at = ?
            WHERE processing_status = ? OR status = ?
        `).run(
            OVERALL_STATUS.CREATED,
            PROCESSING_STATUS.WAITING,
            now,
            PROCESSING_STATUS.PROCESSING,
            OVERALL_STATUS.PROCESSING
        );

        if (procResult.changes > 0) {
            logger.info("RECOVERED_PROCESSING_JOBS", { count: procResult.changes });
        }

        // 2. Safely mark jobs stuck in PRINTING -> PRINT_FAILED (DO NOT auto-reprint to avoid waste)
        const printResult = db.prepare(`
            UPDATE jobs
            SET status = ?, print_status = ?, updated_at = ?
            WHERE print_status = ? OR (status = ? AND print_status != ?)
        `).run(
            OVERALL_STATUS.READY,
            PRINT_STATUS.PRINT_FAILED,
            now,
            PRINT_STATUS.PRINTING,
            OVERALL_STATUS.PRINTING,
            PRINT_STATUS.PRINTED
        );

        if (printResult.changes > 0) {
            logger.info("RECOVERED_PRINTING_JOBS", { count: printResult.changes });
        }
    }
}

const jobEngine = new JobEngine();
jobEngine.jobEngine = jobEngine;
jobEngine.JobEngine = JobEngine;
module.exports = jobEngine;
