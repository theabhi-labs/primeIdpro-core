// electron/src/printing/printEngine.js
const { BrowserWindow, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const crypto = require("crypto");
const config = require("../config");
const logger = require("../logging/logger");
const cleanupManager = require("../cleanup/cleanupManager");

class PrintEngine {
    async writeTempHtml(html) {
        const tempDir = config.TEMP_PRINT_DIR;
        await fsp.mkdir(tempDir, { recursive: true });
        const filePath = path.join(tempDir, `sheet-${crypto.randomUUID()}.html`);
        await fsp.writeFile(filePath, html, "utf-8");
        return filePath;
    }

    async createPrintWindow(html) {
        const tempHtmlPath = await this.writeTempHtml(html);

        const printWin = new BrowserWindow({
            show: false,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                offscreen: false,
            },
        });

        await printWin.loadFile(tempHtmlPath);

        // Wait for all images on the sheet to finish loading
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
                setTimeout(resolve, 10000);
            })
        `);

        return { printWin, tempHtmlPath };
    }

    async cleanupPrintWindow(printWin, tempHtmlPath, jobId = null) {
        try {
            if (printWin && !printWin.isDestroyed()) {
                printWin.destroy();
            }
        } catch (e) {
            logger.warn("PRINT_WIN_DESTROY_ERR", { error: e.message });
        }

        // Schedule temporary HTML cleanup
        if (tempHtmlPath) {
            cleanupManager.scheduleCleanup(tempHtmlPath, jobId, config.RETENTION_MS);
        }
    }

    async printSheetToPdf(html, options = {}, jobId = null) {
        let printWin, tempHtmlPath;
        try {
            ({ printWin, tempHtmlPath } = await this.createPrintWindow(html));

            const pdfBuffer = await printWin.webContents.printToPDF({
                printBackground: true,
                landscape: options.orientation === "Landscape",
                pageSize: options.paperSize === "Letter" ? "Letter" : (options.paperSize === "4x6" ? { width: 4, height: 6 } : "A4"),
                margins: { marginType: "none" },
            });

            const outDir = config.TEMP_PRINT_DIR;
            await fsp.mkdir(outDir, { recursive: true });
            const pdfPath = path.join(outDir, `passport-sheet-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.pdf`);
            await fsp.writeFile(pdfPath, pdfBuffer);

            logger.info("PDF_GENERATED", { pdfPath, jobId });

            // Schedule PDF for 10-minute cleanup
            cleanupManager.scheduleCleanup(pdfPath, jobId, config.RETENTION_MS);

            const openError = await shell.openPath(pdfPath);
            if (openError) {
                logger.warn("PDF_VIEWER_OPEN_FAILED", { error: openError, pdfPath });
                return { success: true, pdfPath, viewerError: openError, status: "PDF_READY" };
            }

            return { success: true, pdfPath, status: "PDF_READY" };
        } catch (err) {
            logger.error("PRINT_TO_PDF_ERROR", { error: err.message });
            return { success: false, error: err.message || String(err) };
        } finally {
            await this.cleanupPrintWindow(printWin, tempHtmlPath, jobId);
        }
    }

    async printSheetNative(html, options = {}, jobId = null) {
        let printWin, tempHtmlPath;
        try {
            ({ printWin, tempHtmlPath } = await this.createPrintWindow(html));

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
                logger.info("NATIVE_PRINT_SUCCESS", { jobId });
                return { success: true, mode: "native", status: "PRINTED" };
            }

            logger.warn("NATIVE_PRINT_UNSUPPORTED_OR_FAILED", { errorType: printResult.errorType, fallback: "pdf" });
            await this.cleanupPrintWindow(printWin, tempHtmlPath, jobId);
            printWin = null;
            tempHtmlPath = null;

            const pdfResult = await this.printSheetToPdf(html, options, jobId);
            return { ...pdfResult, mode: "pdf-fallback", nativeError: printResult.errorType };
        } catch (err) {
            logger.error("NATIVE_PRINT_EXCEPTION", { error: err.message, fallback: "pdf" });
            await this.cleanupPrintWindow(printWin, tempHtmlPath, jobId);
            printWin = null;
            tempHtmlPath = null;

            const pdfResult = await this.printSheetToPdf(html, options, jobId);
            return { ...pdfResult, mode: "pdf-fallback", nativeError: err.message || String(err) };
        } finally {
            if (printWin) {
                await this.cleanupPrintWindow(printWin, tempHtmlPath, jobId);
            }
        }
    }
}

const printEngine = new PrintEngine();
module.exports = printEngine;
