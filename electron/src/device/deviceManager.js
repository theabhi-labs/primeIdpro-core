// electron/src/device/deviceManager.js
const sqliteDb = require("../database/sqliteDb");
const appIdentity = require("../identity/appIdentity");
const safeStorage = require("../security/safeStorage");
const logger = require("../logging/logger");
const config = require("../config");

const DEVICE_STATUS = {
    PENDING: "PENDING",
    ACTIVE: "ACTIVE",
    REVOKED: "REVOKED",
    BLOCKED: "BLOCKED"
};

class DeviceManager {
    init() {
        const db = sqliteDb.getDb();
        const installationId = appIdentity.getInstallationId();

        const existing = db.prepare("SELECT * FROM device_state WHERE id = 1").get();
        if (!existing) {
            const now = new Date().toISOString();
            db.prepare(`
                INSERT INTO device_state (
                    id, center_id, device_id, installation_id,
                    status, encrypted_credential, bound_at, last_seen, updated_at
                ) VALUES (1, NULL, NULL, ?, ?, NULL, NULL, ?, ?)
            `).run(installationId, DEVICE_STATUS.PENDING, now, now);
            logger.info("DEVICE_STATE_INITIALIZED", { installationId, status: DEVICE_STATUS.PENDING });
        }
    }

    getDeviceStatus() {
        this.init();
        const db = sqliteDb.getDb();
        const row = db.prepare("SELECT * FROM device_state WHERE id = 1").get();
        const installationId = appIdentity.getInstallationId();

        let centerMeta = {};
        try {
            const metaRow = db.prepare("SELECT value FROM app_state WHERE key = 'center_metadata'").get();
            if (metaRow?.value) {
                centerMeta = JSON.parse(metaRow.value);
            }
        } catch (e) {
            // Ignore parse error
        }

        // Auto-sync with license_wallet.json if centerMeta is not already set
        try {
            const fs = require("fs");
            const path = require("path");
            const walletPaths = [
                path.join(__dirname, "../../../backend/app/processed/license_wallet.json"),
                path.join(process.env.APPDATA || "", "PrimeIDPro", "processed", "license_wallet.json")
            ];
            for (const wp of walletPaths) {
                if (fs.existsSync(wp)) {
                    const raw = JSON.parse(fs.readFileSync(wp, "utf8"));
                    if (raw && (raw.isConnected || raw.connectedAccount)) {
                        if (!centerMeta.centerCode && raw.centerCode) centerMeta.centerCode = raw.centerCode;
                        if (!centerMeta.centerName && raw.connectedAccount) centerMeta.centerName = raw.connectedAccount;
                        if (centerMeta.walletBalance === undefined && raw.credits !== undefined) centerMeta.walletBalance = raw.credits;
                    }
                    break;
                }
            }
        } catch (e) {}

        if (!row) {
            return {
                installationId,
                appVersion: config.APP_VERSION,
                status: DEVICE_STATUS.PENDING,
                centerId: null,
                deviceId: null,
                centerName: centerMeta.centerName || null,
                centerCode: centerMeta.centerCode || "CSC-GR-6112",
                walletBalance: centerMeta.walletBalance ?? 500,
                isBound: false,
                boundAt: null,
                lastSeen: null
            };
        }

        return {
            installationId,
            appVersion: config.APP_VERSION,
            status: row.status,
            centerId: row.center_id,
            deviceId: row.device_id || "PIP-DESK-ACTIVE",
            centerName: centerMeta.centerName || null,
            centerCode: centerMeta.centerCode || "CSC-GR-6112",
            walletBalance: centerMeta.walletBalance ?? null,
            isBound: row.status === DEVICE_STATUS.ACTIVE && !!row.encrypted_credential,
            boundAt: row.bound_at,
            lastSeen: row.last_seen
        };
    }

    bindDevice({ centerId, deviceId, credential, centerName = null, centerCode = null, walletBalance = null }) {
        this.init();
        const db = sqliteDb.getDb();
        const now = new Date().toISOString();
        const encryptedCredential = credential ? safeStorage.encrypt(credential) : null;

        db.prepare(`
            UPDATE device_state SET
                center_id = ?,
                device_id = ?,
                status = ?,
                encrypted_credential = ?,
                bound_at = ?,
                last_seen = ?,
                updated_at = ?
            WHERE id = 1
        `).run(
            centerId,
            deviceId,
            DEVICE_STATUS.ACTIVE,
            encryptedCredential,
            now,
            now,
            now
        );

        if (centerName || centerCode || walletBalance !== null) {
            const meta = { centerName, centerCode, walletBalance };
            db.prepare(`
                INSERT OR REPLACE INTO app_state (key, value, updated_at)
                VALUES ('center_metadata', ?, ?)
            `).run(JSON.stringify(meta), now);
        }

        logger.info("DEVICE_BOUND_SUCCESSFULLY", { centerId, deviceId, status: DEVICE_STATUS.ACTIVE });
        return this.getDeviceStatus();
    }

    async pairWithCentral({ pairingCode, deviceName = "Front Counter PC" }) {
        this.init();
        if (!pairingCode || typeof pairingCode !== "string" || pairingCode.trim().length !== 6) {
            throw new Error("A valid 6-digit pairing code is required");
        }

        const apiClient = require("../network/apiClient");
        const installationId = appIdentity.getInstallationId();

        const payload = {
            installationId,
            pairingCode: pairingCode.trim(),
            deviceName: deviceName || "Front Counter PC",
            appVersion: config.APP_VERSION,
            osPlatform: process.platform
        };

        const res = await apiClient.post("/devices/register", payload, { retries: 1 });

        if (!res.success) {
            throw new Error(res.error || "Failed to pair with Central Platform");
        }

        const data = res.data;
        const center = data.center || {};

        return this.bindDevice({
            centerId: center.id || center._id,
            deviceId: data.deviceId,
            credential: data.deviceToken,
            centerName: center.centerName,
            centerCode: center.centerCode,
            walletBalance: center.walletBalance
        });
    }

    unpair() {
        const db = sqliteDb.getDb();
        const now = new Date().toISOString();

        db.prepare(`
            UPDATE device_state SET
                center_id = NULL,
                device_id = NULL,
                status = ?,
                encrypted_credential = NULL,
                bound_at = NULL,
                last_seen = ?,
                updated_at = ?
            WHERE id = 1
        `).run(DEVICE_STATUS.PENDING, now, now);

        db.prepare("DELETE FROM app_state WHERE key = 'center_metadata'").run();

        logger.info("DEVICE_UNPAIRED_RESET_TO_PENDING");
        return this.getDeviceStatus();
    }

    revokeDevice() {
        const db = sqliteDb.getDb();
        const now = new Date().toISOString();

        db.prepare(`
            UPDATE device_state SET
                status = ?,
                encrypted_credential = NULL,
                updated_at = ?
            WHERE id = 1
        `).run(DEVICE_STATUS.REVOKED, now);

        logger.warn("DEVICE_REVOKED");
        return this.getDeviceStatus();
    }

    blockDevice() {
        const db = sqliteDb.getDb();
        const now = new Date().toISOString();

        db.prepare(`
            UPDATE device_state SET
                status = ?,
                encrypted_credential = NULL,
                updated_at = ?
            WHERE id = 1
        `).run(DEVICE_STATUS.BLOCKED, now);

        logger.warn("DEVICE_BLOCKED");
        return this.getDeviceStatus();
    }

    updateLastSeen() {
        const db = sqliteDb.getDb();
        const now = new Date().toISOString();
        db.prepare("UPDATE device_state SET last_seen = ?, updated_at = ? WHERE id = 1").run(now, now);
    }

    getDecryptedCredential() {
        const db = sqliteDb.getDb();
        const row = db.prepare("SELECT encrypted_credential FROM device_state WHERE id = 1").get();
        if (!row || !row.encrypted_credential) return null;
        return safeStorage.decrypt(row.encrypted_credential);
    }
}

const deviceManager = new DeviceManager();
module.exports = {
    deviceManager,
    DEVICE_STATUS
};
