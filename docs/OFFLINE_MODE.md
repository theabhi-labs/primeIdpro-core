# PRIME ID PRO — OFFLINE-FIRST ARCHITECTURE

## 1. Offline Core Principle

**Internet connectivity is NEVER required for local photo editing, background removal, passport standard cropping, sheet generation, or printing.**

The bundled Python backend runs locally at `http://127.0.0.1:10000`, containing all neural models (ONNX Rembg, MediaPipe FaceMesh) and OpenCV Haar cascade XML files.

```text
INTERNET OFFLINE
        ↓
Operator drags & drops photos
        ↓
Local Python backend removes background & detects faces
        ↓
Operator edits canvas & chooses background color
        ↓
Dynamic 300 DPI CSS print sheet generated
        ↓
Local printer produces physical sheet
        ↓
Completion recorded in local SQLite database
```

---

## 2. Server Sync Queue & Exponential Backoff

When internet connectivity is restored:
1. `syncQueue` detects network availability.
2. Unsynchronized events (`PRINT_COMPLETED`, `JOB_COMPLETED`) are submitted via HTTPS.
3. Every request includes a persistent `X-Idempotency-Key` (UUID v4) to prevent double billing if a request is retried.
4. Retry intervals follow an exponential backoff schedule: `5s`, `15s`, `45s`, `2m`, `5m`, `15m` (maximum).
5. Fatal client errors (`401 Unauthorized`, `403 Forbidden`) stop retries immediately to avoid hammering the central server.
