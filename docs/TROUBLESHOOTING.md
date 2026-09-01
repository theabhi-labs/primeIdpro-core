# PRIME ID PRO — TROUBLESHOOTING & DIAGNOSTICS GUIDE

## 1. Diagnostics Tooling

To inspect the application's runtime state:
* Open DevTools in development (`Ctrl+Shift+I`) or invoke the diagnostic bridge in renderer:
```javascript
const diagnostics = await window.primeIdPro.diagnostics.get();
console.log(diagnostics);
```

Sample output:
```json
{
  "app": {
    "version": "1.0.0",
    "installationId": "a381d631-cf31-449f-b669-f66b4604b5e7",
    "platform": "win32"
  },
  "services": {
    "pythonBackend": "HEALTHY",
    "centralServer": "ONLINE",
    "database": "HEALTHY"
  },
  "disk": {
    "freeMb": 42150,
    "isSufficient": true
  }
}
```

---

## 2. Common Issues & Solutions

### Issue 1: "This app doesn't support print preview"
* **Cause:** Printing an offscreen HTML element without an active render surface.
* **Resolution:** Handled automatically by `printEngine.js` using a dedicated offscreen `BrowserWindow` with image load synchronization, with seamless fallback to `printToPDF` and the system default PDF viewer.

### Issue 2: Python Backend Fails to Start
* **Symptoms:** App hangs on "Waiting for backend..." or exits with startup error.
* **Checks:**
  1. Check `%APPDATA%/PrimeIdPro/logs/primeidpro.log` for backend exit codes.
  2. Verify port `10000` is not in use:
     ```powershell
     netstat -ano | findstr :10000
     ```
  3. Ensure OpenCV cascade XML files exist in the distribution directory.

### Issue 3: Temporary Files Accumulating on Disk
* **Resolution:** Handled automatically by `cleanupManager.js`. Every generated HTML sheet and PDF is scheduled for 10-minute deletion. A startup sweep purges any leftover files from previous sessions.

### Issue 4: Device Unbound / Unauthorized
* **Symptoms:** Remote online sync fails with `401 Unauthorized`.
* **Resolution:** The CSC Center credential may have been revoked. In the settings panel, call `window.primeIdPro.device.bind()` with fresh center login credentials.
