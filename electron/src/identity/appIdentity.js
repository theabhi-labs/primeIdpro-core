// electron/src/identity/appIdentity.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");
const logger = require("../logging/logger");

let cachedIdentity = null;

function getIdentityFilePath() {
    return path.join(config.DATA_DIR, "identity.json");
}

function initIdentity() {
    if (cachedIdentity) return cachedIdentity;

    const identityFile = getIdentityFilePath();
    
    try {
        if (!fs.existsSync(config.DATA_DIR)) {
            fs.mkdirSync(config.DATA_DIR, { recursive: true });
        }

        if (fs.existsSync(identityFile)) {
            const raw = fs.readFileSync(identityFile, "utf-8");
            const data = JSON.parse(raw);
            if (data.installationId) {
                cachedIdentity = {
                    appId: config.APP_ID,
                    appName: config.APP_NAME,
                    appVersion: config.APP_VERSION,
                    installationId: data.installationId,
                    createdAt: data.createdAt || new Date().toISOString()
                };
                logger.info("IDENTITY_LOADED", { installationId: cachedIdentity.installationId });
                return cachedIdentity;
            }
        }

        // Generate new installationId on first run
        const newInstallationId = crypto.randomUUID();
        const newIdentity = {
            appId: config.APP_ID,
            appName: config.APP_NAME,
            appVersion: config.APP_VERSION,
            installationId: newInstallationId,
            createdAt: new Date().toISOString()
        };

        fs.writeFileSync(identityFile, JSON.stringify(newIdentity, null, 2), "utf-8");
        cachedIdentity = newIdentity;
        logger.info("IDENTITY_INITIALIZED", { installationId: newInstallationId });
        return cachedIdentity;
    } catch (err) {
        logger.error("IDENTITY_INIT_ERROR", { error: err.message });
        // Fallback in-memory identity
        cachedIdentity = {
            appId: config.APP_ID,
            appName: config.APP_NAME,
            appVersion: config.APP_VERSION,
            installationId: crypto.randomUUID(),
            createdAt: new Date().toISOString()
        };
        return cachedIdentity;
    }
}

function getInstallationId() {
    const identity = initIdentity();
    return identity.installationId;
}

function getAppIdentity() {
    return initIdentity();
}

module.exports = {
    initIdentity,
    getInstallationId,
    getAppIdentity
};
