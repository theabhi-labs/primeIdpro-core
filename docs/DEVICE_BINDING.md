# PRIME ID PRO — DEVICE BINDING & IDENTITY GUIDE

## 1. Identity & Binding Architecture

To support authorized CSC Centers while preventing unauthorized client cloning, Prime ID Pro implements a server-authoritative device binding model.

```text
Desktop First Launch
        ↓
Generate Installation ID (UUID v4)
        ↓
Persist locally in %APPDATA%/PrimeIdPro/data/identity.json
        ↓
Operator Logs in via CSC Portal / Center ID
        ↓
Register Device with PrimeIdPro.online Server
        ↓
Server Authorizes & Issues Device Credential
        ↓
Store in SQLite device_state using Electron safeStorage (DPAPI)
        ↓
Status: ACTIVE
```

---

## 2. Device Status Model

| Status | Description | Client Action |
| :--- | :--- | :--- |
| `PENDING` | Newly installed or unbound client | Local photo processing enabled; remote jobs require login |
| `ACTIVE` | Successfully bound to authorized CSC Center | Full online synchronization & credit deduction enabled |
| `REVOKED` | Center or admin revoked device access | Clear stored credential; prompt operator to re-authenticate |
| `BLOCKED` | Device blocked for policy or security violation | Disable remote communication; show administrative contact notice |

---

## 3. Storage Security

* The device token/credential is encrypted before write using `safeStorage.encrypt()` and stored in `device_state.encrypted_credential`.
* Raw tokens are never transmitted to the React renderer; renderer only receives sanitized state (`status`, `centerId`, `deviceId`, `isBound`).
* The central server remains the sole authority for device status and credit deductions.
