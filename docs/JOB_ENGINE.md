# PRIME ID PRO — GENERIC JOB ENGINE REFERENCE

## 1. Generic Job Model

Prime ID Pro supports multiple document and card processing workflows through an extensible generic Job Engine.

### Supported Job Types
* `PHOTO`: Standard & biometric passport photo sheets (A4, Letter, 4x6).
* `ID_CARD`: Standard ID card formatting (front & back).
* `CERTIFICATE`: Certificate and document resizing.
* `PVC_CARD`: Direct PVC card tray layouts.

---

## 2. Multi-Item Support (Batch Processing)

A single customer order or batch operation can contain multiple photo items processed in a single transaction:

```text
Job (id: "PID-ORD-101")
├── Item 0: original photo 1 -> processed transparent PNG + white BG
├── Item 1: original photo 2 -> processed transparent PNG + blue BG
├── Item 2: original photo 3 -> processed transparent PNG + white BG
└── Metadata: { paperSize: "A4", copies: 8, rows: 4, cols: 2 }
```

---

## 3. Disaggregated Status Machine

To prevent ambiguous states, the Job Engine maintains separate sub-statuses:

```text
Processing Status:
[ WAITING ] -> [ DOWNLOADING ] -> [ PROCESSING ] -> [ READY ] / [ FAILED ]

Printing Status:
[ NOT_PRINTED ] -> [ PRINTING ] -> [ PRINTED ] / [ PRINT_FAILED ]

Sync Status:
[ NOT_REQUIRED ] -> [ PENDING ] -> [ SYNCING ] -> [ SYNCED ] / [ FAILED ]

Overall Status:
[ CREATED ] -> [ PROCESSING ] -> [ READY ] -> [ PRINTING ] -> [ COMPLETED ] / [ FAILED ]
```

---

## 4. Startup Crash Recovery

When Prime ID Pro launches after an abrupt power loss or application crash:
1. `jobEngine.recoverInterruptedJobs()` runs automatically.
2. In-flight jobs stuck in `PROCESSING` are reset to `WAITING` or `READY`.
3. In-flight jobs stuck in `PRINTING` are safely updated to `PRINT_FAILED` / `READY`.
   > **CRITICAL RULE:** Jobs interrupted during printing are **never automatically reprinted** on restart to prevent unintended consumption of expensive photo paper.
