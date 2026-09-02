// electron/src/jobs/onlineJobAdapter.js
const path = require("path");
const sqliteDb = require("../database/sqliteDb");
const { jobEngine } = require("./jobEngine");
const { JOB_TYPES, JOB_SOURCES, JOB_STATUS, PROCESSING_STATUS, PRINT_STATUS, SYNC_STATUS } = require("./jobModel");
const photoStager = require("../network/photoStager");
const syncQueue = require("../network/syncQueue");
const logger = require("../logging/logger");

// Canonical template mapping to desktop presets
const CANONICAL_TEMPLATES = {
    india: { id: "india", name: "India Passport (35x45mm)", widthMm: 35, heightMm: 45, defaultCopies: 8 },
    usa: { id: "usa", name: "USA Passport/Visa (2x2in)", widthMm: 50.8, heightMm: 50.8, defaultCopies: 4 },
    uk: { id: "uk", name: "UK Passport (35x45mm)", widthMm: 35, heightMm: 45, defaultCopies: 8 },
    canada: { id: "canada", name: "Canada Passport (50x70mm)", widthMm: 50, heightMm: 70, defaultCopies: 2 },
    australia: { id: "australia", name: "Australia Passport (35x45mm)", widthMm: 35, heightMm: 45, defaultCopies: 8 },
    germany: { id: "germany", name: "Germany Passport (35x45mm)", widthMm: 35, heightMm: 45, defaultCopies: 8 },
    france: { id: "france", name: "France Passport (35x45mm)", widthMm: 35, heightMm: 45, defaultCopies: 8 },
    europe: { id: "europe", name: "Schengen Visa (35x45mm)", widthMm: 35, heightMm: 45, defaultCopies: 8 },
    japan: { id: "japan", name: "Japan Passport (35x45mm)", widthMm: 35, heightMm: 45, defaultCopies: 8 },
    china: { id: "china", name: "China Passport (33x48mm)", widthMm: 33, heightMm: 48, defaultCopies: 8 },
    uae: { id: "uae", name: "UAE Passport (35x45mm)", widthMm: 35, heightMm: 45, defaultCopies: 8 },
    saudi: { id: "saudi", name: "Saudi Arabia / Umrah (35x45mm)", widthMm: 35, heightMm: 45, defaultCopies: 8 },
    brazil: { id: "brazil", name: "Brazil Passport (35x45mm)", widthMm: 35, heightMm: 45, defaultCopies: 8 },
    russia: { id: "russia", name: "Russia Passport (35x45mm)", widthMm: 35, heightMm: 45, defaultCopies: 8 },
    south_africa: { id: "south_africa", name: "South Africa Passport (35x45mm)", widthMm: 35, heightMm: 45, defaultCopies: 8 },
    new_zealand: { id: "new_zealand", name: "New Zealand Passport (35x45mm)", widthMm: 35, heightMm: 45, defaultCopies: 8 }
};

class OnlineJobAdapter {
    resolveTemplate(templateId) {
        const key = (templateId || "india").toLowerCase().trim();
        return CANONICAL_TEMPLATES[key] || CANONICAL_TEMPLATES.india;
    }

    async ingestCentralJob(centralJob) {
        const db = sqliteDb.getDb();
        const serverJobId = centralJob.jobId || centralJob._id || centralJob.jobCode;

        // Idempotency: Check if already stored locally
        const existing = db.prepare("SELECT * FROM jobs WHERE server_job_id = ?").get(String(serverJobId));
        if (existing) {
            logger.info("ONLINE_JOB_ALREADY_EXISTS_LOCALLY", { serverJobId, localJobId: existing.id });
            return { isDuplicate: true, job: existing };
        }

        const template = this.resolveTemplate(centralJob.templateId);
        const paperSize = centralJob.paperSize || "A4";
        const printOptions = centralJob.printOptions || {
            margins: { top: 10, bottom: 10, left: 10, right: 10 },
            spacingMm: 2.0,
            cutMarks: true,
            border: true,
            orientation: "portrait"
        };

        // Determine job items
        const rawItems = Array.isArray(centralJob.items) && centralJob.items.length > 0
            ? centralJob.items
            : [{
                photoIndex: 1,
                downloadUrl: centralJob.temporaryPhotoUrl || centralJob.photoUrl,
                originalFileName: "photo.jpg",
                copies: centralJob.copies || template.defaultCopies,
                backgroundColor: centralJob.backgroundColor || "#FFFFFF",
                cropSettings: centralJob.cropSettings
            }];

        // Create local job
        const localJob = jobEngine.createJob({
            type: JOB_TYPES.PHOTO,
            source: JOB_SOURCES.ONLINE,
            serverJobId: String(serverJobId),
            orderId: centralJob.orderId ? String(centralJob.orderId) : null,
            metadata: {
                jobCode: centralJob.jobCode,
                customerName: centralJob.customerName,
                customerPhone: centralJob.customerPhone,
                serviceType: centralJob.serviceType || "PASSPORT_PHOTO",
                templateId: template.id,
                templateName: template.name,
                paperSize,
                printOptions,
                totalCopies: centralJob.copies || rawItems.reduce((acc, it) => acc + (it.copies || 1), 0),
                rawCentralJob: centralJob
            },
            items: rawItems.map((it, idx) => ({
                itemIndex: it.photoIndex || (idx + 1),
                originalPath: null, // Will be set upon staging
                bgColor: it.backgroundColor || centralJob.backgroundColor || "#FFFFFF",
                copies: it.copies || 1,
                cropSettings: it.cropSettings || null
            }))
        });

        logger.info("ONLINE_JOB_CREATED_LOCALLY", {
            localJobId: localJob.id,
            serverJobId,
            itemCount: rawItems.length
        });

        // Stage all photos asynchronously
        const stagedItems = [];
        for (const item of rawItems) {
            const downloadUrl = item.downloadUrl || item.photoUrl || centralJob.temporaryPhotoUrl;
            if (downloadUrl) {
                try {
                    const staged = await photoStager.stageRemotePhoto({
                        downloadUrl,
                        jobId: localJob.id,
                        photoIndex: item.photoIndex || 1,
                        originalFileName: item.originalFileName || "customer_photo.jpg"
                    });

                    // Update job_items in SQLite
                    db.prepare(`
                        UPDATE job_items 
                        SET original_path = ?, status = 'READY'
                        WHERE job_id = ?
                    `).run(staged.localPath, localJob.id);

                    stagedItems.push({
                        photoIndex: item.photoIndex || 1,
                        localPath: staged.localPath,
                        copies: item.copies || 1,
                        bgColor: item.backgroundColor || "#FFFFFF"
                    });
                } catch (stageErr) {
                    logger.error("PHOTO_STAGING_ERROR", {
                        localJobId: localJob.id,
                        photoIndex: item.photoIndex,
                        error: stageErr.message
                    });
                    db.prepare(`
                        UPDATE job_items 
                        SET status = 'FAILED', error = ?
                        WHERE job_id = ? AND item_index = ?
                    `).run(stageErr.message, localJob.id, item.photoIndex || 1);
                }
            }
        }

        // Check if all items staged successfully
        const failedItems = db.prepare("SELECT COUNT(*) as cnt FROM job_items WHERE job_id = ? AND status = 'FAILED'").get(localJob.id);
        if (failedItems.cnt === 0 && stagedItems.length > 0) {
            jobEngine.updateJob(localJob.id, {
                status: JOB_STATUS.READY,
                processingStatus: PROCESSING_STATUS.READY
            });
        } else {
            jobEngine.updateJob(localJob.id, {
                status: JOB_STATUS.PROCESSING,
                processingStatus: PROCESSING_STATUS.PROCESSING
            });
        }

        return {
            isDuplicate: false,
            localJob: jobEngine.getJob(localJob.id),
            stagedItems
        };
    }

    onPrintCompleted(localJobId, printMetrics = {}) {
        const localJob = jobEngine.getJob(localJobId);
        if (!localJob) return;

        jobEngine.markJobPrinted(localJobId);

        const serverJobId = localJob.serverJobId || localJob.server_job_id;

        // If this is an online job, queue completion event with Central Platform
        if (localJob.source === JOB_SOURCES.ONLINE && serverJobId) {
            const idempotencyKey = `complete_${serverJobId}_${localJobId}_${Date.now()}`;
            syncQueue.enqueueSyncEvent(
                "PRINT_COMPLETED",
                {
                    jobId: serverJobId,
                    localJobId,
                    idempotencyKey,
                    printMetrics: {
                        printedItemCount: localJob.itemCount || localJob.item_count || 1,
                        paperSize: localJob.metadata?.paperSize || "A4",
                        timestamp: new Date().toISOString(),
                        ...printMetrics
                    }
                },
                localJobId,
                idempotencyKey
            );

            logger.info("ONLINE_JOB_PRINT_COMPLETION_QUEUED", {
                localJobId,
                serverJobId: localJob.server_job_id,
                idempotencyKey
            });
        }
    }
}

const onlineJobAdapter = new OnlineJobAdapter();
module.exports = {
    onlineJobAdapter,
    CANONICAL_TEMPLATES
};
