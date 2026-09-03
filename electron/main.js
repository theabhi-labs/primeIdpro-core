// electron/main.js
const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const config = require("./src/config");
const logger = require("./src/logging/logger");
const sqliteDb = require("./src/database/sqliteDb");
const appIdentity = require("./src/identity/appIdentity");
const { applyCsp } = require("./src/security/csp");
const { setupNavigationGuards } = require("./src/security/navigation");
const pythonManager = require("./src/python/pythonManager");
const { jobEngine } = require("./src/jobs/jobEngine");
const cleanupManager = require("./src/cleanup/cleanupManager");
const syncQueue = require("./src/network/syncQueue");
const jobPoller = require("./src/network/jobPoller");
const heartbeatWorker = require("./src/network/heartbeatWorker");
const { deviceManager } = require("./src/device/deviceManager");
const updateManager = require("./src/updater/updateManager");
const { registerIpcHandlers } = require("./src/ipc/router");

let mainWindow = null;

async function createWindow() {
    logger.info("CREATING_MAIN_WINDOW");

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        show: true,
        autoHideMenuBar: true,
        backgroundColor: "#0f172a",
        icon: path.join(__dirname, "assets", "icon.ico"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false, // Isolated preload bridge
            devTools: false // DevTools strictly disabled
        }
    });

    // Navigation & popup security guards
    setupNavigationGuards(mainWindow);

    const indexPath = config.isDev
        ? path.join(__dirname, "..", "frontend", "dist", "index.html")
        : path.join(process.resourcesPath, "frontend", "index.html");

    logger.info("LOADING_FRONTEND", { indexPath });

    await mainWindow.loadFile(indexPath);

    mainWindow.show();
    mainWindow.focus();
    mainWindow.setAlwaysOnTop(true);
    setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setAlwaysOnTop(false);
        }
    }, 1000);

    mainWindow.on("closed", () => {
        mainWindow = null;
    });

    // Initialize auto-updater with window context
    updateManager.init(mainWindow);

    // Non-blocking update check
    setTimeout(() => {
        updateManager.checkForUpdates().catch(() => {});
    }, 5000);
}

// Ensure single instance lock to prevent duplicate processes
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    logger.warn("ANOTHER_INSTANCE_ALREADY_RUNNING_QUITTING");
    app.quit();
} else {
    app.on("second-instance", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    // ========================================================================
    // APPLICATION STARTUP ORCHESTRATION
    // ========================================================================
    app.whenReady().then(async () => {
        logger.info("PRIME_ID_PRO_APP_READY", {
            appId: config.APP_ID,
            version: config.APP_VERSION,
            isDev: config.isDev
        });

        try {
            // 1. Apply Session-level Content Security Policy
            applyCsp();

            // 2. Initialize Local SQLite Database & Schema Migrations
            sqliteDb.init();

            // 3. Initialize Persistent Application Identity
            appIdentity.initIdentity();

            // 4. Initialize Device State
            deviceManager.init();

            // 5. Recover Interrupted Jobs from Previous Crashes
            jobEngine.recoverInterruptedJobs();

            // 6. Start Background 10-Minute Retention Cleanup Worker & Startup Sweep
            cleanupManager.start();

            // 7. Start Sync Queue Background Worker
            syncQueue.start();

            // 8. Start Device Heartbeat Worker & Inbound Job Poller
            heartbeatWorker.start();
            jobPoller.start();

            // 9. Register All IPC Handlers
            registerIpcHandlers();

            // 10. Create Main Application Window IMMEDIATELY for instant UI feedback
            await createWindow();

            // 11. Launch & Health-Check Local Python/FastAPI Backend in parallel
            pythonManager.startBackend().then(() => {
                logger.info("PYTHON_BACKEND_ONLINE");
            }).catch((backendErr) => {
                logger.error("PYTHON_BACKEND_FAILED", { error: backendErr.message });
                dialog.showErrorBox(
                    "AI Processing Engine Error",
                    `PrimeIdPro backend failed to start: ${backendErr.message}\n\nPlease check the application logs in %APPDATA%\\primeidpro\\logs for details.`
                );
            });

            logger.info("APPLICATION_INITIALIZATION_COMPLETE");
        } catch (err) {
            logger.error("FATAL_STARTUP_ERROR", { error: err.message, stack: err.stack });
            dialog.showErrorBox(
                "Application Startup Error",
                `Failed to launch PrimeIdPro: ${err.message}`
            );
            // Clean shutdown on startup error
            jobPoller.stop();
            heartbeatWorker.stop();
            cleanupManager.stop();
            syncQueue.stop();
            pythonManager.stopBackend();
            app.quit();
        }
    });

// ========================================================================
// APPLICATION LIFECYCLE HANDLERS
// ========================================================================
app.on("window-all-closed", () => {
    logger.info("WINDOW_ALL_CLOSED");
    jobPoller.stop();
    heartbeatWorker.stop();
    cleanupManager.stop();
    syncQueue.stop();
    pythonManager.stopBackend();
    sqliteDb.close();

    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("before-quit", () => {
    logger.info("BEFORE_QUIT");
    jobPoller.stop();
    heartbeatWorker.stop();
    cleanupManager.stop();
    syncQueue.stop();
    pythonManager.stopBackend();
    sqliteDb.close();
});

app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
    }
});
}