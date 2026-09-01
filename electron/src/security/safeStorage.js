// electron/src/security/safeStorage.js
const { safeStorage } = require("electron");
const crypto = require("crypto");
const os = require("os");
const logger = require("../logging/logger");

// Machine-specific key fallback when OS safeStorage is unavailable
function getMachineDerivedKey() {
    const rawKey = `${os.hostname()}-${os.platform()}-${os.arch()}-primeidpro-secure-salt-v1`;
    return crypto.createHash("sha256").update(rawKey).digest();
}

function encryptFallback(plainText) {
    const iv = crypto.randomBytes(16);
    const key = getMachineDerivedKey();
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Combined payload: iv + tag + encrypted
    const combined = Buffer.concat([iv, tag, encrypted]);
    return "FALLBACK:" + combined.toString("base64");
}

function decryptFallback(cipherBase64) {
    try {
        const raw = Buffer.from(cipherBase64.replace("FALLBACK:", ""), "base64");
        const iv = raw.subarray(0, 16);
        const tag = raw.subarray(16, 32);
        const encrypted = raw.subarray(32);
        const key = getMachineDerivedKey();
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString("utf8");
    } catch (err) {
        logger.error("Failed to decrypt with fallback cipher", { error: err.message });
        return null;
    }
}

function isSafeStorageAvailable() {
    try {
        return safeStorage && safeStorage.isEncryptionAvailable();
    } catch {
        return false;
    }
}

function encrypt(plainText) {
    if (!plainText) return "";
    try {
        if (isSafeStorageAvailable()) {
            const buffer = safeStorage.encryptString(plainText);
            return "DPAPI:" + buffer.toString("base64");
        } else {
            logger.warn("safeStorage not available, using AES-256-GCM fallback");
            return encryptFallback(plainText);
        }
    } catch (err) {
        logger.error("Encryption failed, falling back to machine cipher", { error: err.message });
        return encryptFallback(plainText);
    }
}

function decrypt(encryptedText) {
    if (!encryptedText) return "";
    try {
        if (encryptedText.startsWith("DPAPI:")) {
            const buffer = Buffer.from(encryptedText.replace("DPAPI:", ""), "base64");
            return safeStorage.decryptString(buffer);
        } else if (encryptedText.startsWith("FALLBACK:")) {
            return decryptFallback(encryptedText);
        } else {
            // Unencrypted legacy string
            return encryptedText;
        }
    } catch (err) {
        logger.error("Decryption failed", { error: err.message });
        return null;
    }
}

module.exports = {
    isAvailable: isSafeStorageAvailable,
    encrypt,
    decrypt
};
