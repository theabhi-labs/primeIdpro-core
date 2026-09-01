// electron/src/security/navigation.js
const { shell } = require("electron");
const logger = require("../logging/logger");

const ALLOWED_EXTERNAL_PROTOCOLS = ["https:", "mailto:"];
const ALLOWED_EXTERNAL_DOMAINS = [
    "primeidpro.online",
    "api.primeidpro.online",
    "updates.primeidpro.online",
    "github.com"
];

function isUrlAllowed(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        if (!ALLOWED_EXTERNAL_PROTOCOLS.includes(parsed.protocol)) {
            return false;
        }
        // Allow specific domains or general HTTPS if user explicitly opened
        return true;
    } catch {
        return false;
    }
}

function safeOpenExternal(rawUrl) {
    if (!isUrlAllowed(rawUrl)) {
        logger.warn("BLOCKED_EXTERNAL_NAVIGATION", { url: rawUrl });
        return Promise.resolve(false);
    }
    logger.info("OPENING_EXTERNAL_URL", { url: rawUrl });
    return shell.openExternal(rawUrl).then(() => true).catch(err => {
        logger.error("FAILED_OPEN_EXTERNAL", { error: err.message, url: rawUrl });
        return false;
    });
}

function setupNavigationGuards(win) {
    if (!win) return;

    // Prevent top-level window navigation to remote or untrusted origins
    win.webContents.on("will-navigate", (event, navigationUrl) => {
        const parsed = new URL(navigationUrl);
        const isFile = parsed.protocol === "file:";
        const isLocalHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

        if (!isFile && !isLocalHost) {
            event.preventDefault();
            logger.warn("BLOCKED_WILL_NAVIGATE", { url: navigationUrl });
        }
    });

    // Prevent frame navigation
    win.webContents.on("will-frame-navigate", (event) => {
        const frameUrl = event.url;
        if (!frameUrl.startsWith("file:") && !frameUrl.startsWith("http://127.0.0.1") && !frameUrl.startsWith("about:blank")) {
            event.preventDefault();
            logger.warn("BLOCKED_FRAME_NAVIGATE", { url: frameUrl });
        }
    });

    // Handle window.open / <a target="_blank">
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (isUrlAllowed(url)) {
            safeOpenExternal(url);
        } else {
            logger.warn("BLOCKED_WINDOW_OPEN", { url });
        }
        return { action: "deny" };
    });

    // Remove window menu (prevents default Electron dev shortcuts like Ctrl+Shift+I / F12 via menu)
    win.setMenu(null);

    // Block keyboard shortcuts for DevTools (F12, Ctrl+Shift+I/J/C, Cmd+Opt+I, Ctrl+U)
    win.webContents.on("before-input-event", (event, input) => {
        const key = input.key ? input.key.toUpperCase() : "";
        const isDevShortcut =
            key === "F12" ||
            ((input.control || input.meta) && input.shift && ["I", "J", "C"].includes(key)) ||
            ((input.control || input.meta) && key === "U");

        if (isDevShortcut) {
            event.preventDefault();
        }
    });

    // Hard fallback: immediately close DevTools if triggered by any mechanism
    win.webContents.on("devtools-opened", () => {
        win.webContents.closeDevTools();
    });
}

module.exports = {
    setupNavigationGuards,
    safeOpenExternal,
    isUrlAllowed
};
