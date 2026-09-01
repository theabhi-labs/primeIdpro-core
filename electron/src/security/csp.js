// electron/src/security/csp.js
const { session } = require("electron");
const config = require("../config");
const logger = require("../logging/logger");

function getCspString() {
    const backendOrigin = `http://${config.PYTHON_HOST}:${config.PYTHON_PORT}`;
    const remoteOrigin = "https://primeidpro-central-platform.onrender.com https://*.onrender.com https://*.primeidpro.online https://primeidpro.online";

    return [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline' ${config.isDev ? "'unsafe-eval'" : ""}`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        `img-src 'self' data: blob: ${backendOrigin} https://primeidpro-central-platform.onrender.com https://*.onrender.com https://*.r2.cloudflarestorage.com https://*.primeidpro.online https://primeidpro.online`,
        "media-src 'self' data: blob:",
        `connect-src 'self' ${backendOrigin} ${remoteOrigin}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'"
    ].filter(Boolean).join("; ");
}

function applyCsp(targetSession = session.defaultSession) {
    if (!targetSession) return;

    const csp = getCspString();

    targetSession.webRequest.onHeadersReceived((details, callback) => {
        const responseHeaders = { ...details.responseHeaders };
        
        // Remove any existing CSP headers to avoid conflicts
        delete responseHeaders["content-security-policy"];
        delete responseHeaders["Content-Security-Policy"];

        // Apply hardened CSP
        responseHeaders["Content-Security-Policy"] = [csp];

        callback({ responseHeaders });
    });

    logger.info("CSP_APPLIED", { csp });
}

module.exports = {
    getCspString,
    applyCsp
};
