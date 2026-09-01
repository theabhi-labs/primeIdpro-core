# PRIME ID PRO — SECURITY ARCHITECTURE & HARDENING GUIDE

## 1. Electron Process Security

### 1.1 BrowserWindow Security Defaults
The main application window is configured with strict security defaults:
```javascript
webPreferences: {
    preload: path.join(__dirname, "preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false, // Preload uses isolated contextBridge
    devTools: config.isDev
}
```
* **No Node in Renderer:** The renderer cannot call `require()`, `process`, `child_process`, or access the filesystem directly.
* **Context Isolation:** All interaction between renderer and main process goes through explicit `contextBridge.exposeInMainWorld()` APIs.

### 1.2 Content Security Policy (CSP)
Session-level HTTP headers and meta tags enforce:
* `default-src 'self'`
* `script-src 'self' 'unsafe-inline'` (eval disabled in production)
* `img-src 'self' data: blob: http://127.0.0.1:10000`
* `connect-src 'self' http://127.0.0.1:10000 https://*.primeidpro.online`
* `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`

### 1.3 Navigation & Window Open Guards
* `will-navigate`: Prevents top-level navigation away from local files and `127.0.0.1`.
* `will-frame-navigate`: Blocks remote framing attacks.
* `setWindowOpenHandler`: Intercepts `window.open` and `<a target="_blank">`, allowing only validated HTTPS URLs through `shell.openExternal()`.

---

## 2. Credential Protection & SafeStorage

* Sensitive tokens (such as CSC Center device credentials and server authentication tokens) are encrypted using Electron's `safeStorage` API (backed by Windows DPAPI).
* When DPAPI is unavailable, an AES-256-GCM cipher with machine-derived key derivation provides cryptographic fallback.
* Credentials are never logged and never sent to the renderer process.

---

## 3. IPC Validation & Sanitization

* Every IPC channel validates input parameter types, payload lengths, and allowed enumeration values.
* HTML print payloads are capped at 50 MB to prevent out-of-memory denial-of-service.
* File paths are never accepted directly from renderer inputs for deletion or execution.

---

## 4. Privacy & Temporary Data Retention

* Temporary customer photos, generated HTML sheets, and PDFs stored in `%APPDATA%/PrimeIdPro/temp-print` are governed by a **10-minute retention policy**.
* Deletion operations are constrained strictly to verified application temporary directories (`isSafeToDelete()`).
* On application launch, any leftover temporary artifacts from previous sessions older than 10 minutes are purged immediately.

---

## 5. Security Logging & Redaction

* Application logs written to `%APPDATA%/PrimeIdPro/logs/primeidpro.log` use automatic redaction for:
  * Passwords and API secrets
  * JWT Bearer tokens
  * Base64 image data URIs (`data:image/...;base64,...`)
  * Long base64 string payloads
* Logs are capped at 5 MB per file with 5 backup rotations.
