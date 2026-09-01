// electron/src/database/migrations.js

const migrations = [
    {
        version: 1,
        name: "initial_schema",
        up: (db) => {
            db.exec(`
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    applied_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    server_job_id TEXT,
                    order_id TEXT,
                    type TEXT NOT NULL,
                    source TEXT NOT NULL,
                    status TEXT NOT NULL,
                    processing_status TEXT NOT NULL,
                    print_status TEXT NOT NULL,
                    sync_status TEXT NOT NULL,
                    item_count INTEGER DEFAULT 1,
                    metadata TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
                CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);

                CREATE TABLE IF NOT EXISTS job_items (
                    id TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL,
                    item_index INTEGER NOT NULL,
                    original_path TEXT,
                    processed_url TEXT,
                    transparent_url TEXT,
                    bg_color TEXT,
                    status TEXT NOT NULL,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_job_items_job_id ON job_items(job_id);

                CREATE TABLE IF NOT EXISTS sync_queue (
                    id TEXT PRIMARY KEY,
                    job_id TEXT,
                    event_type TEXT NOT NULL,
                    idempotency_key TEXT NOT NULL UNIQUE,
                    payload TEXT NOT NULL,
                    status TEXT NOT NULL,
                    retry_count INTEGER DEFAULT 0,
                    next_retry_at TEXT,
                    last_error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status, next_retry_at);

                CREATE TABLE IF NOT EXISTS device_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    center_id TEXT,
                    device_id TEXT,
                    installation_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    encrypted_credential TEXT,
                    bound_at TEXT,
                    last_seen TEXT,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS cleanup_queue (
                    id TEXT PRIMARY KEY,
                    file_path TEXT NOT NULL,
                    job_id TEXT,
                    delete_after TEXT NOT NULL,
                    status TEXT NOT NULL,
                    retry_count INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_cleanup_due ON cleanup_queue(status, delete_after);

                CREATE TABLE IF NOT EXISTS app_state (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at TEXT NOT NULL
                );
            `);
        }
    }
];

module.exports = migrations;
