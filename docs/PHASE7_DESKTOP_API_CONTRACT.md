# PRIME ID PRO — PHASE 7 DESKTOP ↔ CENTRAL API INTEGRATION CONTRACT

**Specification Version:** 1.0.0  
**Effective Date:** September 1, 2026  
**Projects:** `primeidpro-central-platform` (Project A) ↔ `primeIdpro-core` / `primeidpro-desktop` (Project B)  
**Security Level:** Production / Server-Authoritative  

---

## 1. Architectural Overview & Boundary Principles

The integration between the Central Platform and the Electron Desktop Application follows strict microservice and client-server boundaries:

```text
+---------------------------------------------------------------------------------------+
|                                CENTRAL PLATFORM (CLOUD)                               |
| - CSC Center Management & Pairing Code Generation                                     |
| - Customer QR Upload & Payment Gateways (Razorpay / CSC Cash)                         |
| - Server-Authoritative Credit Wallet & Transaction Ledger                             |
| - Short-Lived Pre-Signed Photo URLs (Cloudflare R2)                                   |
| - 10-Minute Cloud Photo Auto-Purge Worker                                            |
+---------------------------------------------------------------------------------------+
                                           │
                         HTTPS REST API    │ (X-Device-Token, X-Device-Id,
                                           │  X-Installation-Id, X-App-Version)
                                           v
+---------------------------------------------------------------------------------------+
|                              PRIME ID PRO DESKTOP (LOCAL)                             |
| - Device Manager & Windows DPAPI SafeStorage                                          |
| - Inbound Background Job Poller (15s Interval + Exponential Backoff)                  |
| - Secure Photo Download Stager (%APPDATA%/PrimeIdPro/temp-print/staged/)              |
| - Local Biometric Processing (MediaPipe FaceMesh 478-landmarks, Rembg ONNX)           |
| - Interactive Studio Editor & 300 DPI Canvas Recolor                                  |
| - Layout Registry & 300 DPI Multi-Page Print Engine                                   |
| - Persistent SQLite Job Engine & Idempotent Completion Sync Queue                     |
| - 10-Minute Local Privacy Cleanup Worker                                              |
| - 100% Autonomous Offline Operation When Disconnected                                |
+---------------------------------------------------------------------------------------+
```

---

## 2. Authentication & Identity Headers

Every authenticated request from the Desktop to the Central API must include the following headers:

| Header Name | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `X-Device-Token` | String | JWT issued upon pairing, stored in Windows DPAPI | `eyJhbGciOi...` |
| `X-Device-Id` | String | Unique hardware/logical device identifier | `PIP-DEV-47081B95` |
| `X-Installation-Id` | String | Persistent installation UUID v4 | `a381d631-cf31-449f-b669-f66b4604b5e7` |
| `X-App-Version` | String | Semantic desktop client version | `1.0.0` |
| `X-Idempotency-Key` | String (Optional) | Unique UUID v4 for non-idempotent actions | `3fa85f64-5717-4562-b3fc-2c963f66afa6` |

---

## 3. Endpoints Specification

### 3.1 Device Registration / Pairing
* **Endpoint:** `POST /api/v1/devices/register`
* **Access:** Public (Rate limited)
* **Request Payload:**
```json
{
  "installationId": "a381d631-cf31-449f-b669-f66b4604b5e7",
  "pairingCode": "491823",
  "deviceName": "Front Counter PC",
  "hardwareFingerprint": "BFEBFBFF000906EA-WIN32",
  "appVersion": "1.0.0",
  "osPlatform": "win32"
}
```
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Device paired successfully",
  "data": {
    "deviceId": "PIP-DEV-47081B95",
    "deviceToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "center": {
      "id": "6a96d5ea04cf2eb242b082fb",
      "centerName": "Patel CSC Digital Seva",
      "centerCode": "CSC-DL-4001",
      "walletBalance": 150
    }
  }
}
```
* **Error Responses:**
  * `400 Bad Request`: Invalid or expired pairing code.
  * `400 Bad Request`: Installation already bound to another center.
  * `403 Forbidden`: Center account is suspended or blocked.

---

### 3.2 Device Heartbeat
* **Endpoint:** `POST /api/v1/devices/heartbeat`
* **Access:** Authenticated (`deviceAuthMiddleware`)
* **Request Payload:**
```json
{
  "printerStatus": {
    "name": "EPSON L8050 Series",
    "isDefault": true,
    "status": "IDLE"
  },
  "diskSpaceMb": 42150,
  "pendingJobsInQueue": 0
}
```
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Heartbeat acknowledged",
  "data": {
    "deviceId": "PIP-DEV-47081B95",
    "status": "ACTIVE",
    "pendingJobsCount": 1,
    "serverTime": "2026-09-01T13:45:00.000Z"
  }
}
```

---

### 3.3 Inbound Pending Jobs Polling
* **Endpoint:** `GET /api/v1/app/pending-jobs`
* **Access:** Authenticated (`deviceAuthMiddleware`)
* **Query Params:** None (Filtered server-side by authenticated `device.centerId` where `jobStatus IN ('QUEUED', 'SENT_TO_APP')`)
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Pending jobs retrieved",
  "data": [
    {
      "jobId": "6a96d5eb04cf2eb242b08352",
      "jobCode": "PIP-2026-B89B83",
      "orderId": "6a96d5ea04cf2eb242b08340",
      "serviceType": "PASSPORT_PHOTO",
      "templateId": "india",
      "paperSize": "A4",
      "dimensions": {
        "width": 35,
        "height": 45,
        "unit": "mm"
      },
      "customerName": "Rahul Sharma",
      "customerPhone": "+919876543210",
      "copies": 8,
      "itemsCount": 1,
      "temporaryPhotoUrl": "https://storage.primeidpro.online/photos/temp-6a96...jpg?sig=...",
      "backgroundColor": "#FFFFFF",
      "cropSettings": {
        "zoom": 1.0,
        "rotation": 0,
        "aspectRatio": 0.777
      },
      "printOptions": {
        "margins": { "top": 10, "bottom": 10, "left": 10, "right": 10 },
        "spacingMm": 2.0,
        "cutMarks": true,
        "border": true,
        "orientation": "portrait"
      },
      "items": [
        {
          "photoIndex": 1,
          "storageKey": "centers/6a96.../photos/item1.jpg",
          "photoUrl": "https://storage.primeidpro.online/photos/item1.jpg?sig=...",
          "downloadUrl": "https://storage.primeidpro.online/photos/item1.jpg?sig=...",
          "originalFileName": "passport_photo.jpg",
          "copies": 8,
          "backgroundColor": "#FFFFFF",
          "cropSettings": {
            "zoom": 1.0,
            "rotation": 0,
            "aspectRatio": 0.777
          }
        }
      ]
    }
  ]
}
```

---

### 3.4 Job Claim / Acknowledgment
* **Endpoint:** `POST /api/v1/app/jobs/:jobId/ack`
* **Access:** Authenticated (`deviceAuthMiddleware`)
* **URL Param:** `jobId` (MongoDB `_id` or alphanumeric `jobCode`)
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Job acknowledged and locked to device",
  "data": {
    "jobId": "6a96d5eb04cf2eb242b08352",
    "jobCode": "PIP-2026-B89B83",
    "jobStatus": "ACKNOWLEDGED",
    "claimedByDeviceId": "PIP-DEV-47081B95"
  }
}
```
* **Conflict Response (`409 Conflict`):** Job was already claimed by another counter terminal or cancelled.

---

### 3.5 Job Status Reporting
* **Endpoint:** `POST /api/v1/app/jobs/:jobId/status`
* **Access:** Authenticated (`deviceAuthMiddleware`)
* **Request Payload:**
```json
{
  "status": "PROCESSING",
  "message": "Applying MediaPipe FaceMesh pupil alignment and Rembg AI background removal"
}
```
* **Allowed Statuses:** `DOWNLOADING`, `PROCESSING`, `READY`, `PRINTING`, `FAILED`
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Status updated",
  "data": {
    "jobId": "6a96d5eb04cf2eb242b08352",
    "jobStatus": "PROCESSING"
  }
}
```

---

### 3.6 Physical Print Completion & Settlement
* **Endpoint:** `POST /api/v1/app/jobs/:jobId/complete`
* **Access:** Authenticated (`deviceAuthMiddleware`)
* **Request Payload:**
```json
{
  "idempotencyKey": "complete_6a96d5eb04cf2eb242b08352_PIP-2026-B89B83_1788270000000",
  "printMetrics": {
    "printedItemCount": 1,
    "totalCopies": 8,
    "paperSize": "A4",
    "printerName": "EPSON L8050 Series"
  }
}
```
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Job marked completed and platform credits deducted",
  "data": {
    "jobId": "6a96d5eb04cf2eb242b08352",
    "jobStatus": "COMPLETED",
    "creditsDeducted": 2,
    "remainingBalance": 148,
    "photoExpiresInSeconds": 600,
    "isDuplicate": false
  }
}
```
* **Idempotent Duplicate Response (`200 OK`):** Returns existing settlement details with `"isDuplicate": true` without debiting credits again.

---

## 4. Canonical Template & Layout Mapping

The desktop integration translates incoming Central parameters to local registered presets:

### 4.1 Templates
| Central `templateId` | Desktop Preset | Dimensions | Target DPI Pixels |
| :--- | :--- | :--- | :--- |
| `india` | India Passport | 35 × 45 mm | 413 × 531 px |
| `usa` | USA Passport / Visa | 50.8 × 50.8 mm (2×2 in) | 600 × 600 px |
| `uk` | United Kingdom Passport | 35 × 45 mm | 413 × 531 px |
| `canada` | Canada Passport | 50 × 70 mm | 591 × 827 px |
| `australia` | Australia Passport | 35 × 45 mm | 413 × 531 px |
| `germany` | Germany Passport | 35 × 45 mm | 413 × 531 px |
| `france` | France Passport | 35 × 45 mm | 413 × 531 px |
| `europe` | Schengen / EU Visa | 35 × 45 mm | 413 × 531 px |
| `japan` | Japan Passport | 35 × 45 mm | 413 × 531 px |
| `china` | China Passport | 33 × 48 mm | 390 × 567 px |
| `uae` | UAE Passport | 35 × 45 mm | 413 × 531 px |
| `saudi` | Saudi Arabia / Umrah | 35 × 45 mm | 413 × 531 px |
| `brazil` | Brazil Passport | 35 × 45 mm | 413 × 531 px |
| `russia` | Russia Passport | 35 × 45 mm | 413 × 531 px |
| `south_africa` | South Africa Passport | 35 × 45 mm | 413 × 531 px |
| `new_zealand` | New Zealand Passport | 35 × 45 mm | 413 × 531 px |

### 4.2 Paper Layouts
| Central `paperSize` | Dimensions | Description |
| :--- | :--- | :--- |
| `A4` | 210 × 297 mm | Standard Document / Multi-Photo Sheet |
| `4x6` | 101.6 × 152.4 mm | Standard 4×6 in Photo Paper |
| `Letter` | 215.9 × 279.4 mm | US Letter Size |
| `A3` | 297 × 420 mm | Large Format Sheet |
| `B`, `C`, `D`... | Metric Presets | Professional Studio Cut Sheets |

---

## 5. Security & Privacy Guarantees

1. **No Shared Cloud Secrets:** The Desktop client NEVER possesses AWS/Cloudflare R2 access keys or Razorpay secret keys.
2. **Short-Lived Signed URLs:** Download links expire in 15–30 minutes and are used immediately upon download.
3. **Local Staging Sandbox:** Photos are saved to `%APPDATA%/PrimeIdPro/temp-print/staged/` and automatically scheduled for 10-minute deletion by `cleanupManager`.
4. **Offline Autonomy:** If Central API is unreachable, local photo import, editing, AI face detection, and native printing continue to execute with zero interruption.
