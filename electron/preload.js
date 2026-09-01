// electron/preload.js
const { contextBridge, ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
    console.log("[PRELOAD] Prime ID Pro secure preload initialized");
});

// ========================================================================
// NAMESPACED SECURE DESKTOP API (window.primeIdPro)
// ========================================================================
const primeIdProAPI = {
    app: {
        getIdentity: () => ipcRenderer.invoke("app:getIdentity"),
        getApiUrl: () => ipcRenderer.invoke("app:get-api-url"),
        getDiskSpace: () => ipcRenderer.invoke("app:getDiskSpace"),
    },
    jobs: {
        create: (payload) => ipcRenderer.invoke("jobs:create", payload),
        get: (jobId) => ipcRenderer.invoke("jobs:get", jobId),
        list: (params) => ipcRenderer.invoke("jobs:list", params),
        listOnline: () => ipcRenderer.invoke("jobs:listOnline"),
        updateStatus: (payload) => ipcRenderer.invoke("jobs:updateStatus", payload),
    },
    printing: {
        print: (html, options, jobId) => ipcRenderer.invoke("printing:print", { html, options, jobId }),
        createPdf: (html, options, jobId) => ipcRenderer.invoke("printing:createPdf", { html, options, jobId }),
    },
    device: {
        getStatus: () => ipcRenderer.invoke("device:status"),
        pair: (payload) => ipcRenderer.invoke("device:pair", payload),
        unpair: () => ipcRenderer.invoke("device:unpair"),
        bind: (payload) => ipcRenderer.invoke("device:bind", payload),
        revoke: () => ipcRenderer.invoke("device:revoke"),
    },
    poller: {
        getStatus: () => ipcRenderer.invoke("poller:status"),
        trigger: () => ipcRenderer.invoke("poller:trigger"),
    },
    sync: {
        enqueue: (payload) => ipcRenderer.invoke("sync:enqueue", payload),
    },
    updater: {
        getStatus: () => ipcRenderer.invoke("updater:status"),
        check: () => ipcRenderer.invoke("updater:check"),
        download: () => ipcRenderer.invoke("updater:download"),
        install: () => ipcRenderer.invoke("updater:install"),
        onStatusChange: (callback) => {
            if (typeof callback !== "function") return;
            const listener = (event, data) => callback(data);
            ipcRenderer.on("updater:status", listener);
            return () => ipcRenderer.removeListener("updater:status", listener);
        },
    },
    diagnostics: {
        get: () => ipcRenderer.invoke("diagnostics:get"),
    },
};

contextBridge.exposeInMainWorld("primeIdPro", primeIdProAPI);

// ========================================================================
// BACKWARD COMPATIBILITY BRIDGE (window.electronAPI)
// Preserves existing frontend code without changes
// ========================================================================
contextBridge.exposeInMainWorld("electronAPI", {
    isElectron: true,
    getApiUrl: () => ipcRenderer.sendSync("get-api-url"),
    printSheet: (html, options) => ipcRenderer.invoke("print:native", { html, options }),
    printSheetToPdf: (html, options) => ipcRenderer.invoke("print:pdf", { html, options }),
});
