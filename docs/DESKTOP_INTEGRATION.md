# PRIME ID PRO — DESKTOP INTEGRATION & OPERATOR GUIDE

**Document:** Desktop Integration Guide  
**Project:** `primeIdpro-core` / `primeidpro-desktop`  
**Target:** CSC Operators & Integration Engineers  

---

## 1. Quick Start: Pairing Front Counter PC with CSC Center

1. Log in to the CSC Portal on your browser (`https://portal.primeidpro.online`).
2. Go to **Device Settings** and click **Generate Pairing Code**.
3. A 6-digit PIN (e.g. `491823`) will be displayed (valid for 10 minutes).
4. Launch the **Prime ID Pro** desktop application on your counter PC.
5. Open **Settings** (gear icon) -> click the **CSC Connection** tab.
6. Enter the 6-digit pairing code and click **Pair Device**.
7. Once paired, the status indicator will turn **Active (Green)** and display your Center Name and Center Code.
8. The counter PC is now ready to receive online customer orders automatically!

---

## 2. Inbound Online Order Workflow

```text
Customer Scans QR at Desk
        ↓
Customer Uploads Photos & Selects Copies
        ↓
Customer Pays Online (Razorpay) or Counter Operator Confirms Cash
        ↓
Central Platform creates Job in QUEUED state
        ↓
Prime ID Pro Desktop Poller detects job (within ~15s)
        ↓
Desktop securely downloads customer photos into temporary staging
        ↓
Photos appear in Ready Assets Grid with "ONLINE" badge
        ↓
Operator clicks Print Sheet -> 300 DPI sheet rendered
        ↓
Physical Print completes on local printer
        ↓
Desktop sends completion event to Central API
        ↓
Central API deducts 2 credits per photo printed & updates tracking
        ↓
10-minute privacy timer purges customer photos locally and in cloud
```

---

## 3. Offline & Continuity Rules

* **Internet Disconnected:** If the internet connection drops, you can still import photos from your camera/USB, use AI face alignment, edit photos, create sheets, and print physically. The application NEVER blocks offline counter work.
* **Pending Completions:** If internet drops right after printing, the completion is saved in SQLite and will automatically sync once internet is restored. **It will NEVER reprint the job.**
* **Rebinding:** An installation is bound to one center at a time. To move the PC to another center, click **Disconnect / Unpair** in Settings first.
