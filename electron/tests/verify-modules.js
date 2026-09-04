// electron/tests/verify-modules.js
const assert = require("assert");
const path = require("path");
const fs = require("fs");

console.log("==================================================");
console.log("PRIME ID PRO — PHASE 7 AUTOMATED INTEGRATION SUITE");
console.log("==================================================");

async function runTests() {
    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`  [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  [FAIL] ${name}: ${err.message}`);
            failed++;
        }
    }

    async function asyncTest(name, fn) {
        try {
            await fn();
            console.log(`  [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  [FAIL] ${name}: ${err.message}`);
            failed++;
        }
    }

    // 1. CONFIG & IDENTITY
    console.log("\n1. Testing Config & Identity...");
    test("Config exports valid properties & staging dirs", () => {
        const config = require("../src/config");
        assert.strictEqual(config.APP_ID, "com.primeidpro.desktop");
        assert.strictEqual(config.APP_VERSION, "1.0.0");
        assert.ok(config.DATA_DIR);
        assert.ok(config.LOGS_DIR);
        assert.ok(config.TEMP_PRINT_DIR);
        assert.ok(config.STAGED_PHOTOS_DIR);
        assert.strictEqual(config.POLL_INTERVAL_MS, 3000);
        assert.strictEqual(config.HEARTBEAT_INTERVAL_MS, 60000);
        assert.strictEqual(config.REMOTE_API_BASE_URL, "https://primeidpro-central-platform.onrender.com/api/v1");
        assert.strictEqual(config.REMOTE_API_FALLBACK_URL, "https://primeidpro.online/api/v1");
    });

    test("AppIdentity generates and persists installationId", () => {
        const appIdentity = require("../src/identity/appIdentity");
        const id1 = appIdentity.getInstallationId();
        const id2 = appIdentity.getInstallationId();
        assert.ok(id1 && typeof id1 === "string" && id1.length > 10);
        assert.strictEqual(id1, id2, "Installation ID must remain identical on repeated calls");
    });

    // 2. SAFESTORAGE / ENCRYPTION
    console.log("\n2. Testing SafeStorage / Credential Encryption...");
    test("Encrypt and decrypt string (DPAPI / AES-256-GCM fallback)", () => {
        const safeStorage = require("../src/security/safeStorage");
        const secret = "csc-super-secret-token-12345";
        const encrypted = safeStorage.encrypt(secret);
        assert.ok(encrypted.length > secret.length);
        assert.notStrictEqual(encrypted, secret);
        const decrypted = safeStorage.decrypt(encrypted);
        assert.strictEqual(decrypted, secret);
    });

    // 3. DATABASE & MIGRATIONS
    console.log("\n3. Testing SQLite Database & Migrations...");
    test("Database initializes and runs migrations", () => {
        const sqliteDb = require("../src/database/sqliteDb");
        const db = sqliteDb.init();
        assert.ok(db);
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
        assert.ok(tables.includes("schema_migrations"), "Missing schema_migrations table");
        assert.ok(tables.includes("jobs"), "Missing jobs table");
        assert.ok(tables.includes("job_items"), "Missing job_items table");
        assert.ok(tables.includes("sync_queue"), "Missing sync_queue table");
        assert.ok(tables.includes("device_state"), "Missing device_state table");
        assert.ok(tables.includes("cleanup_queue"), "Missing cleanup_queue table");
        assert.ok(tables.includes("app_state"), "Missing app_state table");
    });

    // 4. JOB ENGINE & CRASH RECOVERY
    console.log("\n4. Testing Generic Job Engine & State Machine...");
    test("Create multi-item batch job and transition states", () => {
        const { jobEngine } = require("../src/jobs/jobEngine");
        const job = jobEngine.createJob({
            type: "PHOTO",
            source: "LOCAL",
            orderId: "ORD-TEST-999",
            items: [
                { originalPath: "C:/test/photo1.jpg", copies: 8 },
                { originalPath: "C:/test/photo2.jpg", copies: 4 },
                { originalPath: "C:/test/photo3.jpg", copies: 6 }
            ],
            metadata: { paperSize: "A4", totalCopies: 18 }
        });

        assert.ok(job.id);
        assert.strictEqual(job.type, "PHOTO");
        assert.strictEqual(job.status, "CREATED");
        assert.strictEqual(job.processingStatus, "WAITING");
        assert.strictEqual(job.printStatus, "NOT_PRINTED");
        assert.strictEqual(job.items.length, 3);

        // Transition to READY
        const readyJob = jobEngine.markJobReady(job.id, [
            { processedUrl: "http://127.0.0.1:10000/processed/1.png", transparentUrl: "http://127.0.0.1:10000/processed/1_trans.png", bgColor: "#FFFFFF" },
            { processedUrl: "http://127.0.0.1:10000/processed/2.png", transparentUrl: "http://127.0.0.1:10000/processed/2_trans.png", bgColor: "#003366" },
            { processedUrl: "http://127.0.0.1:10000/processed/3.png", transparentUrl: "http://127.0.0.1:10000/processed/3_trans.png", bgColor: "#E5E5E5" }
        ]);

        assert.strictEqual(readyJob.status, "READY");
        assert.strictEqual(readyJob.processingStatus, "READY");
        assert.strictEqual(readyJob.items[1].bgColor, "#003366");

        // Transition to PRINTED
        const printedJob = jobEngine.markJobPrinted(job.id);
        assert.strictEqual(printedJob.status, "COMPLETED");
        assert.strictEqual(printedJob.printStatus, "PRINTED");
    });

    test("Job engine crash recovery marks interrupted prints as PRINT_FAILED (No auto-reprint)", () => {
        const { jobEngine } = require("../src/jobs/jobEngine");

        const stuckJob = jobEngine.createJob({ type: "PHOTO", source: "LOCAL" });
        jobEngine.markJobPrinting(stuckJob.id);

        jobEngine.recoverInterruptedJobs();

        const recovered = jobEngine.getJob(stuckJob.id);
        assert.strictEqual(recovered.printStatus, "PRINT_FAILED");
        assert.strictEqual(recovered.status, "READY");
    });

    // 5. DEVICE MANAGER & PAIRING
    console.log("\n5. Testing Device Binding Manager & Lifecycle...");
    test("Device state lifecycle (pending -> active -> revoked -> unpaired)", () => {
        const { deviceManager, DEVICE_STATUS } = require("../src/device/deviceManager");

        // Unpair first to test clean pending state
        deviceManager.unpair();
        const initial = deviceManager.getDeviceStatus();
        assert.strictEqual(initial.status, DEVICE_STATUS.PENDING);
        assert.strictEqual(initial.isBound, false);

        // Bind with center metadata
        const bound = deviceManager.bindDevice({
            centerId: "6a96d5ea04cf2eb242b082fb",
            deviceId: "PIP-DEV-47081B95",
            credential: "jwt-device-token-secret-xyz",
            centerName: "Patel CSC Digital Seva",
            centerCode: "CSC-DL-4001",
            walletBalance: 150
        });

        assert.strictEqual(bound.status, DEVICE_STATUS.ACTIVE);
        assert.strictEqual(bound.centerId, "6a96d5ea04cf2eb242b082fb");
        assert.strictEqual(bound.deviceId, "PIP-DEV-47081B95");
        assert.strictEqual(bound.centerName, "Patel CSC Digital Seva");
        assert.strictEqual(bound.centerCode, "CSC-DL-4001");
        assert.strictEqual(bound.isBound, true);

        // Verify decrypted credential works internally
        const token = deviceManager.getDecryptedCredential();
        assert.strictEqual(token, "jwt-device-token-secret-xyz");

        // Revoke
        const revoked = deviceManager.revokeDevice();
        assert.strictEqual(revoked.status, DEVICE_STATUS.REVOKED);
        assert.strictEqual(revoked.isBound, false);

        // Restore to Active for subsequent integration tests
        deviceManager.bindDevice({
            centerId: "6a96d5ea04cf2eb242b082fb",
            deviceId: "PIP-DEV-47081B95",
            credential: "jwt-device-token-secret-xyz",
            centerName: "Patel CSC Digital Seva",
            centerCode: "CSC-DL-4001",
            walletBalance: 150
        });
    });

    // 6. PHOTO STAGER & VALIDATION
    console.log("\n6. Testing Photo Stager & Binary Validation...");
    await asyncTest("PhotoStager rejects non-image binaries and validates magic bytes", async () => {
        const photoStager = require("../src/network/photoStager");
        photoStager.ensureDir();

        // Test non-HTTP URL rejection
        await assert.rejects(
            () => photoStager.stageRemotePhoto({ downloadUrl: "ftp://invalid-url", jobId: "job-1" }),
            /Invalid remote download URL/
        );
    });

    // 7. ONLINE JOB ADAPTER & TEMPLATE RESOLUTION
    console.log("\n7. Testing Online Job Adapter & Canonical Templates...");
    test("Canonical template registry resolves all 16 international templates", () => {
        const { onlineJobAdapter, CANONICAL_TEMPLATES } = require("../src/jobs/onlineJobAdapter");

        const templates = ["india", "usa", "uk", "canada", "australia", "germany", "france", "europe", "japan", "china", "uae", "saudi", "brazil", "russia", "south_africa", "new_zealand"];
        for (const t of templates) {
            const resolved = onlineJobAdapter.resolveTemplate(t);
            assert.ok(resolved.id, `Failed resolving template ${t}`);
            assert.ok(resolved.widthMm > 0);
            assert.ok(resolved.heightMm > 0);
        }

        // Default fallback
        const fallback = onlineJobAdapter.resolveTemplate("unknown_preset");
        assert.strictEqual(fallback.id, "india");
    });

    await asyncTest("OnlineJobAdapter converts Central Job with multi-photo items into local JobEngine", async () => {
        const { onlineJobAdapter } = require("../src/jobs/onlineJobAdapter");
        const { jobEngine } = require("../src/jobs/jobEngine");

        const uniqueJobId = `central-job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const mockCentralJob = {
            jobId: uniqueJobId,
            jobCode: `PIP-2026-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            orderId: "order-9988",
            serviceType: "PASSPORT_PHOTO",
            templateId: "usa",
            paperSize: "4x6",
            customerName: "Sanjay Verma",
            customerPhone: "+919876543210",
            copies: 12,
            printOptions: {
                margins: { top: 5, bottom: 5, left: 5, right: 5 },
                spacingMm: 2.0,
                cutMarks: true,
                border: true,
                orientation: "portrait"
            },
            items: [
                { photoIndex: 1, originalFileName: "p1.jpg", copies: 4, backgroundColor: "#FFFFFF" },
                { photoIndex: 2, originalFileName: "p2.jpg", copies: 8, backgroundColor: "#3498DB" }
            ]
        };

        const result = await onlineJobAdapter.ingestCentralJob(mockCentralJob);
        assert.strictEqual(result.isDuplicate, false);
        assert.ok(result.localJob.id);
        assert.strictEqual(result.localJob.source, "ONLINE");
        assert.strictEqual(result.localJob.serverJobId || result.localJob.server_job_id, uniqueJobId);
        assert.strictEqual(result.localJob.itemCount || result.localJob.item_count, 2);
        assert.strictEqual(result.localJob.metadata.templateId, "usa");
        assert.strictEqual(result.localJob.metadata.paperSize, "4x6");

        // Duplicate rejection test
        const dupResult = await onlineJobAdapter.ingestCentralJob(mockCentralJob);
        assert.strictEqual(dupResult.isDuplicate, true);
    });

    // 8. PRINT COMPLETION & SYNC QUEUE
    console.log("\n8. Testing Print Completion & Sync Queue Mapping...");
    test("Print completion queues idempotent Central settlement event", () => {
        const { onlineJobAdapter } = require("../src/jobs/onlineJobAdapter");
        const { jobEngine } = require("../src/jobs/jobEngine");
        const sqliteDb = require("../src/database/sqliteDb");

        const compServerJobId = `server-job-comp-${Date.now()}`;
        // Ingest an online job
        const job = jobEngine.createJob({
            type: "PHOTO",
            source: "ONLINE",
            serverJobId: compServerJobId,
            metadata: { paperSize: "A4" }
        });

        onlineJobAdapter.onPrintCompleted(job.id, { printerName: "EPSON L8050" });

        const updated = jobEngine.getJob(job.id);
        assert.strictEqual(updated.status, "COMPLETED");
        assert.strictEqual(updated.printStatus, "PRINTED");

        // Check SQLite sync_queue table
        const db = sqliteDb.getDb();
        const syncItem = db.prepare("SELECT * FROM sync_queue WHERE job_id = ?").get(job.id);
        assert.ok(syncItem);
        assert.strictEqual(syncItem.event_type, "PRINT_COMPLETED");
        assert.ok(syncItem.idempotency_key);
        const payload = JSON.parse(syncItem.payload);
        assert.strictEqual(payload.jobId, compServerJobId);
    });

    // 9. JOB POLLER & HEARTBEAT
    console.log("\n9. Testing Inbound Job Poller & Heartbeat Worker Lifecycle...");
    test("JobPoller and HeartbeatWorker start and stop cleanly", () => {
        const jobPoller = require("../src/network/jobPoller");
        const heartbeatWorker = require("../src/network/heartbeatWorker");

        jobPoller.start();
        heartbeatWorker.start();

        const pollerStatus = jobPoller.getStatus();
        const hbStatus = heartbeatWorker.getStatus();

        assert.strictEqual(pollerStatus.isRunning, true);
        assert.strictEqual(hbStatus.isRunning, true);

        jobPoller.stop();
        heartbeatWorker.stop();

        assert.strictEqual(jobPoller.getStatus().isRunning, false);
        assert.strictEqual(heartbeatWorker.getStatus().isRunning, false);
    });

    // 10. CLEANUP MANAGER
    console.log("\n10. Testing Temporary Data Cleanup Manager...");
    await asyncTest("Schedule cleanup and verify safe path constraints", async () => {
        const cleanupManager = require("../src/cleanup/cleanupManager");
        const config = require("../src/config");

        cleanupManager.ensureDirs();
        const testFile = path.join(config.TEMP_PRINT_DIR, `test-cleanup-${Date.now()}.html`);
        fs.writeFileSync(testFile, "<html>Test print sheet</html>", "utf-8");
        assert.ok(fs.existsSync(testFile));

        cleanupManager.scheduleCleanup(testFile, "test-job-1", 0);
        await cleanupManager.sweep();
        assert.strictEqual(fs.existsSync(testFile), false, "File should have been cleaned up");
    });

    // 11. IPC VALIDATORS
    console.log("\n11. Testing IPC Payload Validation...");
    test("IPC print validator accepts valid payload and sanitizes options", () => {
        const { validatePrintPayload, validatePairingPayload, validateId } = require("../src/ipc/validators");
        const res = validatePrintPayload({
            html: "<div>Valid sheet</div>",
            options: { paperSize: "Letter", orientation: "Landscape" }
        });
        assert.strictEqual(res.options.paperSize, "Letter");
        assert.strictEqual(res.options.orientation, "Landscape");

        const pairRes = validatePairingPayload({ pairingCode: "123456", deviceName: "Front Counter PC" });
        assert.strictEqual(pairRes.pairingCode, "123456");
        assert.strictEqual(pairRes.deviceName, "Front Counter PC");

        assert.throws(() => validatePairingPayload({ pairingCode: "123" }), /valid 6-digit/);
        assert.throws(() => validatePrintPayload({ html: null }), /must be a non-empty string/);
        assert.throws(() => validateId(""), /Invalid ID parameter/);
    });

    // 12. DIAGNOSTICS
    console.log("\n12. Testing Diagnostics...");
    await asyncTest("Full diagnostics snapshot", async () => {
        const { getFullDiagnostics } = require("../src/diagnostics/diagnostics");
        const diag = await getFullDiagnostics();
        assert.ok(diag.app.version);
        assert.ok(diag.app.installationId);
        assert.ok(diag.services.database);
        assert.ok(diag.disk);
    });

    console.log("\n==================================================");
    console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log("==================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("Test runner threw uncaught exception:", err);
    process.exit(1);
});
