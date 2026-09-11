const sqliteDb = require("../database/sqliteDb");
const logger = require("../logging/logger");
const crypto = require("crypto");

class AnalyticsManager {
    trackEvent(eventType, payload = {}) {
        try {
            const db = sqliteDb.getDb();
            const now = new Date().toISOString();
            
            // Generate a local event ID
            const eventId = "evt_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);

            // Fetch current state
            const state = db.prepare("SELECT account_id, installation_id FROM credit_state WHERE id = 1").get();
            const device = db.prepare("SELECT center_id FROM device_state WHERE id = 1").get();

            const fullPayload = JSON.stringify({
                eventId,
                eventType,
                accountId: state?.account_id || null,
                installationId: state?.installation_id || null,
                centerId: device?.center_id || null,
                timestamp: now,
                ...payload
            });

            // Push to sync queue directly
            db.prepare(`
                INSERT INTO sync_queue (
                    id, event_type, payload, status, created_at, updated_at
                ) VALUES (?, ?, ?, 'PENDING', ?, ?)
            `).run(eventId, "ANALYTICS_EVENT", fullPayload, now, now);

            logger.info("ANALYTICS_EVENT_TRACKED", { eventType });
            return { success: true, eventId };
        } catch (err) {
            logger.warn("ANALYTICS_TRACKING_FAILED", { error: err.message });
            return { success: false, error: err.message };
        }
    }
}

const analyticsManager = new AnalyticsManager();
module.exports = analyticsManager;
