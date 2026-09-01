// electron/src/database/sqliteDb.js
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const config = require("../config");
const logger = require("../logging/logger");
const migrations = require("./migrations");

class SqliteDatabase {
    constructor() {
        this.db = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized && this.db) return this.db;

        try {
            if (!fs.existsSync(config.DATA_DIR)) {
                fs.mkdirSync(config.DATA_DIR, { recursive: true });
            }

            logger.info("DB_CONNECTING", { path: config.DB_PATH });
            this.db = new Database(config.DB_PATH, {
                verbose: config.isDev ? (sql) => logger.debug("SQL", { sql }) : null
            });

            // SQLite optimizations
            this.db.pragma("journal_mode = WAL");
            this.db.pragma("synchronous = NORMAL");
            this.db.pragma("foreign_keys = ON");
            this.db.pragma("busy_timeout = 5000");

            this.runMigrations();
            this.initialized = true;
            logger.info("DB_INITIALIZED", { path: config.DB_PATH });
            return this.db;
        } catch (err) {
            logger.error("DB_INIT_ERROR", { error: err.message, stack: err.stack });
            throw err;
        }
    }

    runMigrations() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL
            );
        `);

        const applied = new Set(
            this.db.prepare("SELECT version FROM schema_migrations").all().map(r => r.version)
        );

        for (const migration of migrations) {
            if (!applied.has(migration.version)) {
                logger.info("APPLYING_MIGRATION", { version: migration.version, name: migration.name });
                const runTx = this.db.transaction(() => {
                    migration.up(this.db);
                    this.db.prepare(
                        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
                    ).run(migration.version, migration.name, new Date().toISOString());
                });
                runTx();
                logger.info("MIGRATION_APPLIED", { version: migration.version });
            }
        }
    }

    getDb() {
        if (!this.initialized || !this.db) {
            return this.init();
        }
        return this.db;
    }

    close() {
        if (this.db) {
            try {
                this.db.close();
                this.initialized = false;
                this.db = null;
                logger.info("DB_CLOSED");
            } catch (err) {
                logger.error("DB_CLOSE_ERROR", { error: err.message });
            }
        }
    }
}

const sqliteDb = new SqliteDatabase();
module.exports = sqliteDb;
