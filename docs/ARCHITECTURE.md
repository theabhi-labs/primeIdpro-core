# PRIME ID PRO — ARCHITECTURE & SUBSYSTEM REFERENCE

## 1. System Overview

Prime ID Pro Desktop is an enterprise-grade Windows desktop application built with **Electron**, **React 18 / Vite**, and a local **Python / FastAPI / OpenCV / MediaPipe / Rembg** photo engine.

```text
+-------------------------------------------------------------------------------+
|                             PRIME ID PRO DESKTOP                              |
+---------------------------------------+---------------------------------------+
|                RENDERER               |                 MAIN                  |
| - React 18 SPA (Vite + TailwindCSS)   | - Electron Main Orchestrator          |
| - Multi-Photo Selection & Batch Queue | - Local Python Process Manager        |
| - Interactive Canvas Crop & Color     | - Generic Job Engine & State Machine  |
| - Dynamic Sheet Layout (A4, Letter)   | - SQLite Local Database & Migrations  |
| - Non-intrusive Update/Status Bridge  | - Hardened Hidden Print/PDF Engine    |
+---------------------------------------+ - 10-Minute Retention Cleanup Worker  |
                   |                    | - Central Sync Queue (Idempotency)    |
                   v                    | - Device Binding Manager (safeStorage)|
+---------------------------------------+ - Auto-Update Manager (electron-updt) |
|           SECURE PRELOAD              | - Structured Logger (5MB/5 Rotation)  |
| - window.primeIdPro (Namespaced APIs) | - Diagnostics & Disk Space Monitor    |
| - window.electronAPI (Compatibility)  +---------------------------------------+
+---------------------------------------+                   |
                   |                                        | Local HTTP
                   | Secure IPC                             v
                   +-------------------------> +--------------------------------+
                                               | PYTHON LOCAL BACKEND (10000)   |
                                               | - Haar Cascades & FaceMesh     |
                                               | - Rembg (ONNX Runtime)         |
                                               | - /upload, /process, /status   |
                                               +--------------------------------+
```

---

## 2. Directory Structure

```text
primeIdpro-core/
├── electron/
│   ├── main.js                      # Main process orchestrator & lifecycle
│   ├── preload.js                   # Secure contextBridge API bridge
│   ├── package.json                 # Electron dependencies & builder config
│   ├── assets/
│   │   └── icon.ico                 # Application window and installer icon
│   ├── tests/
│   │   └── verify-modules.js        # Automated module verification test suite
│   └── src/
│       ├── config/
│       │   └── index.js             # Constants, paths, timeouts, thresholds
│       ├── logging/
│       │   └── logger.js            # Structured logger with size rotation & redaction
│       ├── security/
│       │   ├── safeStorage.js       # DPAPI & AES-256-GCM credential encryption
│       │   ├── csp.js               # Content Security Policy generator
│       │   └── navigation.js        # Navigation and popup window guards
│       ├── identity/
│       │   └── appIdentity.js       # App ID and persistent installation ID
│       ├── database/
│       │   ├── migrations.js        # Versioned SQLite schema migrations
│       │   └── sqliteDb.js          # SQLite manager with WAL mode
│       ├── jobs/
│       │   ├── jobModel.js          # Job types, sources, and status enumerations
│       │   └── jobEngine.js         # Multi-item job queue & crash recovery
│       ├── printing/
│       │   └── printEngine.js       # Offscreen print window, PDF & image sync
│       ├── cleanup/
│       │   └── cleanupManager.js    # 10-minute temporary data retention & sweep
│       ├── network/
│       │   ├── apiClient.js         # HTTPS client with timeout & backoff
│       │   └── syncQueue.js         # SQLite sync queue with idempotency keys
│       ├── device/
│       │   └── deviceManager.js     # Device registration & center binding state
│       ├── updater/
│       │   └── updateManager.js     # Auto-updater with mandatory version check
│       ├── python/
│       │   └── pythonManager.js     # Python backend supervisor & health check
│       ├── diagnostics/
│       │   └── diagnostics.js       # System diagnostics & disk space check
│       └── ipc/
│           ├── validators.js        # Payload schemas & parameter sanitization
│           └── router.js            # Centralized secure IPC handler registry
├── frontend/                        # Preserved React 18 / Vite frontend
├── backend/                         # Preserved Python 3.11 / FastAPI backend
└── docs/                            # Production documentation
```

---

## 3. Separation of Responsibilities

1. **Renderer:** Pure presentation and user interaction. Strictly isolated from Node.js runtime (`nodeIntegration: false`, `contextIsolation: true`).
2. **Preload:** Controlled context bridge exposing explicit, validated methods under `window.primeIdPro` and preserving `window.electronAPI` backward compatibility.
3. **Electron Main:** Secure coordinator of local storage, hardware printer communication, background cleanup timers, process supervision, and central server sync.
4. **Python Backend:** Pure high-performance local biometric image processing engine, bound exclusively to `127.0.0.1:10000`.
5. **Central Server (PrimeIdPro.online):** Authoritative ledger for CSC accounts, QR orders, credit balances, and device authorization.
