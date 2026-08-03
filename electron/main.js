const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const waitOn = require("wait-on");

let backendProcess;
const isDev = !app.isPackaged;

// ========================================================================
// PRINTING
//
// Electron/Chromium's built-in print dialog does not support a real print
// preview for pages that were never shown on screen — that's the source of
// the "This app doesn't support print preview" error when printing a photo
// sheet generated in a hidden/offscreen context. The fix is to do all
// printing through a purpose-built hidden BrowserWindow (so Chromium always
// has a real render surface to work with), wait for every image in the
// sheet to finish loading before calling print, and fall back to
// generating a PDF (via printToPDF) + opening it in the system's PDF viewer
// whenever the native print dialog can't produce a preview.
// ========================================================================

const printLogPrefix = "[PRINT]";

function logPrint(...args) {
    console.log(printLogPrefix, ...args);
}

// Writes the sheet HTML to a temp file rather than a data: URL — sheets can
// embed many base64 images, and data: URLs have practical length limits
// that silently truncate large pages.
async function writeTempHtml(html) {
    const tempDir = path.join(os.tmpdir(), "primeidpro-print");
    await fsp.mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, `sheet-${crypto.randomUUID()}.html`);
    await fsp.writeFile(filePath, html, "utf-8");
    return filePath;
}

// Creates a hidden BrowserWindow, loads the sheet HTML into it, and resolves
// once every <img> on the page has finished loading (or errored) — printing
// before images are ready is what produces blank/half-rendered pages.
async function createPrintWindow(html) {
    const tempHtmlPath = await writeTempHtml(html);

    const printWin = new BrowserWindow({
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            offscreen: false,
        },
    });

    await printWin.loadFile(tempHtmlPath);

    // Wait for all images to be fully loaded (or to fail) before printing.
    await printWin.webContents.executeJavaScript(`
        new Promise((resolve) => {
            const imgs = Array.from(document.images);
            if (imgs.length === 0) return resolve();
            let remaining = imgs.length;
            const done = () => { remaining -= 1; if (remaining <= 0) resolve(); };
            imgs.forEach((img) => {
                if (img.complete) return done();
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
            });
            // Safety timeout so a single broken image can't hang printing forever.
            setTimeout(resolve, 10000);
        })
    `);

    return { printWin, tempHtmlPath };
}

async function cleanupPrintWindow(printWin, tempHtmlPath) {
    try {
        if (printWin && !printWin.isDestroyed()) printWin.destroy();
    } catch (e) {
        logPrint("Error destroying print window:", e);
    }
    try {
        if (tempHtmlPath) await fsp.unlink(tempHtmlPath);
    } catch (e) {
        // Non-fatal — temp dir gets cleaned by the OS eventually.
    }
}

// Generates a PDF from the sheet HTML and opens it with the system's
// default PDF viewer. Used both as the primary "Download PDF" action and as
// the automatic fallback when native print-preview isn't supported.
async function printSheetToPdf(html, options = {}) {
    let printWin, tempHtmlPath;
    try {
        ({ printWin, tempHtmlPath } = await createPrintWindow(html));

        const pdfBuffer = await printWin.webContents.printToPDF({
            printBackground: true,
            landscape: options.orientation === "Landscape",
            pageSize: options.paperSize === "Letter" ? "Letter" : "A4",
            margins: { marginType: "none" },
        });

        const outDir = path.join(os.tmpdir(), "primeidpro-print");
        await fsp.mkdir(outDir, { recursive: true });
        const pdfPath = path.join(outDir, `passport-sheet-${Date.now()}.pdf`);
        await fsp.writeFile(pdfPath, pdfBuffer);

        logPrint("PDF generated:", pdfPath);

        const openError = await shell.openPath(pdfPath);
        if (openError) {
            logPrint("Failed to open PDF viewer:", openError);
            return { success: true, pdfPath, viewerError: openError };
        }

        return { success: true, pdfPath };
    } catch (err) {
        logPrint("printToPDF failed:", err);
        return { success: false, error: err.message || String(err) };
    } finally {
        await cleanupPrintWindow(printWin, tempHtmlPath);
    }
}

// Tries the native OS print dialog (so the user can pick a real printer or
// "Microsoft Print to PDF" themselves). If Chromium reports the print
// failed/unsupported, we transparently fall back to the PDF-and-open flow
// instead of leaving the user with a blank preview.
async function printSheetNative(html, options = {}) {
    let printWin, tempHtmlPath;
    try {
        ({ printWin, tempHtmlPath } = await createPrintWindow(html));

        const printResult = await new Promise((resolve) => {
            printWin.webContents.print(
                {
                    silent: false,
                    printBackground: true,
                    landscape: options.orientation === "Landscape",
                    color: true,
                },
                (success, errorType) => {
                    resolve({ success, errorType });
                }
            );
        });

        if (printResult.success) {
            logPrint("Native print dialog completed successfully");
            return { success: true, mode: "native" };
        }

        logPrint("Native print failed/unsupported:", printResult.errorType, "— falling back to PDF");
        await cleanupPrintWindow(printWin, tempHtmlPath);
        printWin = null;
        tempHtmlPath = null;

        const pdfResult = await printSheetToPdf(html, options);
        return { ...pdfResult, mode: "pdf-fallback", nativeError: printResult.errorType };
    } catch (err) {
        logPrint("Native print threw an error:", err, "— falling back to PDF");
        await cleanupPrintWindow(printWin, tempHtmlPath);
        printWin = null;
        tempHtmlPath = null;
        const pdfResult = await printSheetToPdf(html, options);
        return { ...pdfResult, mode: "pdf-fallback", nativeError: err.message || String(err) };
    } finally {
        if (printWin) await cleanupPrintWindow(printWin, tempHtmlPath);
    }
}

ipcMain.handle("print:native", async (event, { html, options }) => {
    if (!html) return { success: false, error: "No sheet HTML provided to print" };
    try {
        return await printSheetNative(html, options || {});
    } catch (err) {
        logPrint("Unexpected error in print:native handler:", err);
        return { success: false, error: err.message || String(err) };
    }
});

ipcMain.handle("print:pdf", async (event, { html, options }) => {
    if (!html) return { success: false, error: "No sheet HTML provided to print" };
    try {
        return await printSheetToPdf(html, options || {});
    } catch (err) {
        logPrint("Unexpected error in print:pdf handler:", err);
        return { success: false, error: err.message || String(err) };
    }
});

ipcMain.on("get-api-url", (event) => {
    event.returnValue = `http://127.0.0.1:${process.env.PORT || 10000}/api/v1`;
});

async function startBackend() {

    const backendPath = isDev
        ? path.join(
            __dirname,
            "..",
            "backend",
            "dist",
            "PrimeIdProBackend",
            "PrimeIdProBackend.exe"
        )
        : path.join(
            process.resourcesPath,
            "backend",
            "PrimeIdProBackend.exe"
        );

    console.log("Backend Path:", backendPath);

    backendProcess = spawn(backendPath, [], {
        cwd: path.dirname(backendPath),
        detached: false,
        windowsHide: true,
        stdio: "pipe"
    });

    backendProcess.stdout.on("data", data => {
        console.log("BACKEND:", data.toString());
    });

    backendProcess.stderr.on("data", data => {
        console.log("BACKEND ERR:", data.toString());
    });

    backendProcess.on("exit", (code) => {
        console.log("BACKEND EXIT:", code);
    });

    backendProcess.on("error", (err) => {
        console.error("Backend Error:", err);
    });


    console.log("Waiting for backend...");

    await waitOn({
        resources: ["http-get://127.0.0.1:10000/health"],
        timeout: 60000,
        interval: 1000
    });

    console.log(" Backend Ready");
}

async function createWindow() {

    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    const indexPath = isDev
        ? path.join(
            __dirname,
            "..",
            "frontend",
            "dist",
            "index.html"
        )
        : path.join(
            process.resourcesPath,
            "frontend",
            "index.html"
        );

    console.log("Loading:", indexPath);

    await win.loadFile(indexPath);

    win.once("ready-to-show", () => {
        win.show();
        win.webContents.openDevTools();
    });

    if (isDev) {
        win.webContents.openDevTools();
    }
}

app.whenReady().then(async () => {

    try {

        await startBackend();

        await createWindow();

        console.log(" Application Started");

    } catch (err) {

        console.error("Startup Error:", err);

        app.quit();

    }

});

app.on("window-all-closed", () => {

    if (backendProcess) {
        backendProcess.kill();
    }

    if (process.platform !== "darwin") {
        app.quit();
    }

});

app.on("activate", async () => {

    if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
    }

});