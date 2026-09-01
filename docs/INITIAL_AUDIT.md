# PRIME ID PRO — INITIAL ARCHITECTURE & CODEBASE AUDIT

**Date:** 2026-08-31  
**Project:** Prime ID Pro Windows Desktop Application  
**Auditor:** Senior Desktop Architect  

---

## 1. System & Runtime Versions

| Component | Target / Current Version | Notes |
| :--- | :--- | :--- |
| **Node.js** | `v22.19.0` | Active host environment |
| **npm** | `10.8.1` | Package manager |
| **Electron** | `^43.1.1` (or current 34.x/43.x runtime) | Production desktop shell |
| **electron-builder** | `^26.15.3` | NSIS packaging for Windows x64 |
| **React** | `^18.2.0` | Frontend UI framework |
| **Vite** | `^5.0.8` | Frontend bundler |
| **Python** | `3.11.0` (venv) / `3.13.7` (host) | Local photo engine backend |
| **FastAPI** | `0.104.1` | Local REST/API server |
| **OpenCV** | `4.8.1.78` | Haar cascades & biometric cropping |
| **MediaPipe** | `0.10.7` | Biometric FaceMesh landmark detection |
| **Rembg / ONNX** | `2.0.69` / `1.16.3` | AI background removal |

---

## 2. Current Architecture Overview

```text
+-------------------------------------------------------------------+
|                        PRIME ID PRO APPLICATION                   |
+---------------------------------+---------------------------------+
|        FRONTEND (React 18)      |      ELECTRON (Main Process)    |
| - PhotoUploader / Dropzone      | - Spawns Python backend         |
| - PhotoEditor (canvas, crop)    | - Waits for /health (10000)     |
| - PhotoCopyEditor (multi-card)  | - Main BrowserWindow (loads UI) |
| - PrintSettingsModal (margins)  | - Offscreen print BrowserWindow |
| - Sheet Layout (CSS @page 300DPI)| - print:native / print:pdf IPC |
| - api.js (Axios -> 127.0.0.1)   | - Preload (contextBridge)       |
+---------------------------------+---------------------------------+
                                  |
                                  v
                    +-----------------------------+
                    |  BACKEND (Python / FastAPI) |
                    | - Haar cascade face detect  |
                    | - MediaPipe FaceMesh        |
                    | - Rembg background removal  |
                    | - Image enhancement / PIL   |
                    | - /upload, /process, /status|
                    +-----------------------------+
```

---

## 3. Detailed Component Audit

### 3.1 Main Process (`electron/main.js`)
* **Backend Lifecycle:** Launches `PrimeIdProBackend.exe` from `backend/dist/PrimeIdProBackend/` (dev) or `resources/backend/` (packaged). Waits on `http://127.0.0.1:10000/health` up to 60s.
* **BrowserWindow:** `contextIsolation: true`, `nodeIntegration: false`, `preload: preload.js`.
* **Print Window:** Creates dedicated offscreen `BrowserWindow`, renders HTML print sheet, checks `document.images` load completion before triggering `webContents.print()` or `webContents.printToPDF()`.
* **PDF Fallback:** If native print dialog fails, automatically falls back to `printToPDF` and opens the generated PDF in the default OS viewer (`shell.openPath`).
* **Weaknesses:**
  * Synchronous IPC channel `get-api-url` (`ipcRenderer.sendSync`) blocks renderer loop.
  * Incomplete validation on `html` and `options` payload sizes in `print:native` and `print:pdf`.
  * Missing navigation guards (`will-navigate`, `setWindowOpenHandler`).
  * Missing Content Security Policy (CSP).
  * DevTools opened unconditionally in production fallback scenarios.
  * Generated PDF/HTML files in `%TEMP%/primeidpro-print` have no automated 10-minute cleanup retention policy.

### 3.2 Preload Process (`electron/preload.js`)
* Exposes `window.electronAPI` with `isElectron`, `getApiUrl`, `printSheet`, `printSheetToPdf`.
* **Weaknesses:** Lacks namespaces, lacks device/job/updater APIs, exposes synchronous `sendSync`.

### 3.3 Frontend Architecture (`frontend/src/`)
* **State & Processing:** `usePhotoProcessing.js` manages uploads, progress polling, transparent PNG storage, and canvas background color preservation.
* **Batch Processing:** Users can select 1, 2, 5, 20+ photos simultaneously and process them together.
* **Print Layout:** `App.jsx` dynamically calculates multi-page grid layouts (A4, Letter, 4x6) with customizable margins, rows/columns, gap, cut marks, and borders.
* **Preservation Status:** 100% active, essential business logic. Must not be rewritten or broken.

### 3.4 Python Backend (`backend/app/main.py`)
* **Lifespan:** Loads OpenCV Haar cascades (`haarcascade_frontalface_default.xml`, `haarcascade_frontalface_alt2.xml`) and MediaPipe FaceMesh.
* **MongoDB Integration:** Optional; non-blocking fallback if MongoDB is not running locally.
* **Endpoints:** `/upload`, `/process-status/{image_id}`, `/generate-passport-photo`, `/crop-biometric`, `/health`.
* **Preservation Status:** 100% active, reliable photo processing engine.

---

## 4. File Classification

### Critical Files (Active & Required)
* `electron/main.js` — Main process entry point (to be modularized).
* `electron/preload.js` — Secure contextBridge bridge.
* `electron/package.json` — Electron runtime & builder configuration.
* `frontend/src/App.jsx` — Core UI, sheet generator, and print triggers.
* `frontend/src/services/api.js` — Local backend client.
* `frontend/src/hooks/usePhotoProcessing.js` — Multi-photo upload and status polling.
* `frontend/src/hooks/usePrintSettings.js` — Print margins and paper size configuration.
* `frontend/src/components/Studio/*` — Photo editor, copy editor, print settings, uploader.
* `backend/app/main.py` — Face detection, background removal, passport standards.
* `backend/PrimeIdProBackend.spec` — PyInstaller freeze specification.

### Legacy / Redundant Files
* `desktop-installer/` — Outdated early prototype wrapper; superseded by `electron/`.
* Root `package.json` with `"pyinstaller": "^0.0.1"` — Legacy artifact.

---

## 5. Security & Production Gap Analysis

1. **Local Database:** No persistent SQLite database in Electron for generic jobs (`PHOTO`, `ID_CARD`, etc.), sync queue, or device state.
2. **Crash Recovery:** If the app restarts while processing or printing, there is no state recovery mechanism.
3. **Device Binding:** Missing `installationId` generation, hardware-independent device registration, center binding, and `safeStorage` encryption for tokens.
4. **Auto-Updater:** `electron-updater` dependency is present but not configured or wired into lifecycle events.
5. **Temporary Customer Data:** No background 10-minute cleanup timer for temporary HTML/PDF/photo artifacts.
6. **Print Completion & Credit Authority:** PDF generation was conflated with print completion; idempotency tokens were missing.
7. **Security Logging:** Missing log rotation (5MB / 5 files) and automatic redaction of sensitive credentials and image data.

---

## 6. Action Plan Summary
- Build modular Electron services under `electron/src/` (Security, Identity, Database, Jobs, Printing, Cleanup, Network, Device, Updater, Logging, Diagnostics, IPC).
- Retain full backward compatibility for `window.electronAPI` while introducing `window.primeIdPro`.
- Implement robust SQLite storage with migrations for jobs and sync queue.
- Implement 10-minute temporary data privacy cleanup with startup sweep.
- Connect production auto-updater with mandatory update enforcement.
- Harden Electron security defaults (CSP, navigation guards, safeStorage).
