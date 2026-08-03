// preload.js
const { contextBridge, ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
    console.log("Preload loaded");
});

// Exposed to the renderer as `window.electronAPI`. The frontend uses this
// (see printLayout() in App.jsx) instead of window.print()/iframe.print(),
// since Electron's built-in print preview does not work for pages that
// were never shown on screen.
contextBridge.exposeInMainWorld("electronAPI", {
    isElectron: true,
    getApiUrl: () => ipcRenderer.sendSync("get-api-url"),

    // Opens the native OS print dialog (lets the user pick a real printer
    // or "Microsoft Print to PDF"). Automatically falls back to generating
    // and opening a PDF if the native dialog can't produce a preview.
    printSheet: (html, options) => ipcRenderer.invoke("print:native", { html, options }),

    // Skips the native dialog entirely: generates a PDF straight away and
    // opens it in the system's default PDF viewer.
    printSheetToPdf: (html, options) => ipcRenderer.invoke("print:pdf", { html, options }),
});
