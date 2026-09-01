# PRIME ID PRO — AUTO-UPDATE ARCHITECTURE & LIFECYCLE

## 1. Overview

Prime ID Pro utilizes `electron-updater` with custom lifecycle handling, release channel segmentation (`stable`, `beta`), and **mandatory version enforcement**.

---

## 2. Update Lifecycle

```text
Application Launch
        ↓
Wait 5s (Non-blocking)
        ↓
Check Update Server (https://updates.primeidpro.online/latest.yml)
        ↓
Version Available?
├── No  -> Status: NOT_AVAILABLE
└── Yes -> Compare with minimumSupportedVersion
             ├── currentVersion < minimumSupportedVersion -> Flag: MANDATORY
             └── currentVersion >= minimumSupportedVersion -> Flag: OPTIONAL
        ↓
Download Update (Background)
        ↓
Verify Checksum & Integrity
        ↓
Status: DOWNLOADED
        ↓
Install on App Quit or Prompt "Ready to Restart"
```

---

## 3. Mandatory Update Handling

When the central server introduces a breaking API change or security patch:
* The release metadata sets `minimumSupportedVersion: "1.2.0"`.
* If a client running `1.0.0` checks for updates, `updateManager` evaluates:
  ```javascript
  isMandatory = compareVersions(currentVersion, minimumSupportedVersion) < 0;
  ```
* The UI can display an inescapable modal requiring the user to restart and apply the update before continuing online operations.

---

## 4. Failure Safety

1. **Network Drop During Download:** The updater gracefully transitions to status `ERROR`, logging the transient failure. The existing running application remains 100% operational.
2. **Corrupted Download:** Checksum verification rejects invalid payloads before execution.
3. **Staged Replacement:** The running binary is never overwritten until the new package has passed full verification and the application is restarting.

---

## 5. IPC Interface

```javascript
// Check for updates
const status = await window.primeIdPro.updater.check();

// Listen to update status changes
const unsubscribe = window.primeIdPro.updater.onStatusChange((info) => {
    console.log("Update status:", info.status, info.progress);
});

// Install and restart
await window.primeIdPro.updater.install();
```
