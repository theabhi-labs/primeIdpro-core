# PRIME ID PRO — BUILD & PACKAGING GUIDE

## 1. Prerequisites

* **Node.js:** `v18+` or `v20+` (LTS recommended)
* **npm:** `v9+` or `v10+`
* **Python:** `3.11.x` with required packages (`requirements.txt`)
* **PyInstaller:** `v6.x` (for building the backend frozen executable)
* **Platform:** Windows 10/11 x64

---

## 2. Development Setup

### 2.1 Backend Environment
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python server.py
```

### 2.2 Frontend Environment
```bash
cd frontend
npm install
npm run dev
```

### 2.3 Electron Environment
```bash
cd electron
npm install
npm start
```

---

## 3. Production Build Pipeline

### Step 1: Build React Frontend
```bash
cd frontend
npm install
npm run build
```
* Generates compiled HTML, JS, and CSS assets in `frontend/dist/`.

### Step 2: Build Python Backend Executable
```bash
cd backend
.venv\Scripts\activate
pyinstaller PrimeIdProBackend.spec --noconfirm --clean
```
* Generates frozen backend distribution in `backend/dist/PrimeIdProBackend/`.

### Step 3: Package Electron Desktop Installer
```bash
cd electron
npm install
npm run dist
```
* Generates signed production NSIS installer executable in `electron/release/` (e.g. `PrimeIdPro-Setup-1.0.0.exe`).

---

## 4. Packaging Structure (`extraResources`)

The Electron builder copies:
1. `backend/dist/PrimeIdProBackend` -> `resources/backend`
2. `frontend/dist` -> `resources/frontend`

In packaged execution:
* Electron loads `process.resourcesPath/frontend/index.html`
* Python manager spawns `process.resourcesPath/backend/PrimeIdProBackend.exe`
