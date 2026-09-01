# PRIME ID PRO — DATABASE SCHEMA & MIGRATIONS

## 1. Storage Engine

* **Engine:** SQLite 3 via `better-sqlite3`.
* **Path:** `%APPDATA%/PrimeIdPro/data/primeidpro.sqlite`.
* **Pragmas:**
  * `journal_mode = WAL` (Write-Ahead Logging for maximum concurrency and crash durability)
  * `synchronous = NORMAL`
  * `foreign_keys = ON`
  * `busy_timeout = 5000`

---

## 2. Table Definitions

### `schema_migrations`
Tracks applied database schema versions.
```sql
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
);
```

### `jobs`
Stores generic jobs and order lifecycle state.
```sql
CREATE TABLE jobs (
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
```

### `job_items`
Individual photo items belonging to a parent batch job.
```sql
CREATE TABLE job_items (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    item_index INTEGER NOT NULL,
    original_path TEXT,
    processed_url TEXT,
    transparent_url TEXT,
    bg_color TEXT,
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL
);
```

### `sync_queue`
Server events pending remote delivery with idempotency protection.
```sql
CREATE TABLE sync_queue (
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
```

### `device_state`
Single-row table holding CSC device binding and encrypted credentials.
```sql
CREATE TABLE device_state (
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
```

### `cleanup_queue`
Temporary print artifacts pending 10-minute deletion.
```sql
CREATE TABLE cleanup_queue (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    job_id TEXT,
    delete_after TEXT NOT NULL,
    status TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
```
