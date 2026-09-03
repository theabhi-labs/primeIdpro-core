print("[main.py] 1. importing core modules", flush=True)
import os
import logging
from contextlib import asynccontextmanager

print("[main.py] 2. importing fastapi", flush=True)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

print("[main.py] 3. importing app.core.config", flush=True)
from app.core.config import settings, UPLOAD_DIR, PROCESSED_DIR

print("[main.py] 4. importing app.core.database", flush=True)
from app.core.database import db

print("[main.py] 5. importing app.core.cascade", flush=True)
from app.core.cascade import load_cascade_classifiers, get_cv2_data_path

print("[main.py] 6. importing app.core.state", flush=True)
from app.core.state import uploaded_images, processing_status

print("[main.py] 7. importing middlewares", flush=True)
from app.middleware.logging import RequestLoggingMiddleware
from app.middleware.exceptions import register_exception_handlers

print("[main.py] 8. importing api_v1_router", flush=True)
from app.api.v1 import api_v1_router

print("[main.py] 9. all imports completed!", flush=True)

# ========== IMAGE CODECS (HEIC / AVIF / WEBP SUPPORT) ==========
try:
    import pillow_heif  # type: ignore
    pillow_heif.register_heif_opener()
except Exception:
    pass

try:
    import pillow_avif  # type: ignore
except Exception:
    pass


# ========== LOGGING ==========
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("primeidpro")


# ========== LIFESPAN ==========
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Server starting...")

    # Load OpenCV Haar Cascades
    primary_cascade, alt_cascade = load_cascade_classifiers()
    app.state.face_cascade = primary_cascade
    app.state.face_cascade_alt = alt_cascade

    if app.state.face_cascade.empty():
        logger.warning("Primary cascade not found, face detection will be degraded")
    else:
        logger.info("Face cascades loaded")

    # Load MediaPipe FaceMesh
    try:
        import mediapipe as mp
        app.state.mp_face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=2,
            refine_landmarks=True,
            min_detection_confidence=0.5
        )
        logger.info("✅ MediaPipe FaceMesh loaded successfully")
    except Exception as e:
        logger.error(f"❌ Failed to load MediaPipe FaceMesh: {e}")
        app.state.mp_face_mesh = None

    # Connect to MongoDB
    mongo_db = await db.connect()
    app.state.mongo_db = mongo_db
    app.state.mongo_client = db.client

    yield

    # Clean shutdown
    if hasattr(app.state, "mp_face_mesh") and app.state.mp_face_mesh:
        try:
            app.state.mp_face_mesh.close()
            logger.info("MediaPipe FaceMesh closed")
        except Exception as e:
            logger.error(f"Error closing FaceMesh: {e}")

    await db.disconnect()
    logger.info("Server shutting down")


# ========== FASTAPI APPLICATION ==========
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan
)

# ========== MIDDLEWARE ==========
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RequestLoggingMiddleware)

# ========== GLOBAL EXCEPTION HANDLERS ==========
register_exception_handlers(app)

# ========== STATIC FILE MOUNTS ==========
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/processed", StaticFiles(directory=PROCESSED_DIR), name="processed")

# ========== API ROUTERS ==========
app.include_router(api_v1_router, prefix="/api/v1")
# Prime ID Pro v3.2.0 with Universal Card Studio & Credit Wallet



# ========== ROOT & HEALTH CHECK ==========
@app.get("/health")
async def health():
    mongo_db = getattr(app.state, "mongo_db", None)
    if mongo_db is None:
        mongo_db = db.get_database()
    return {
        "status": "healthy",
        "version": settings.app_version,
        "rembg_fallback": "grabcut",
        "mongodb_connected": mongo_db is not None,
    }



@app.get("/")
async def root():
    return JSONResponse({
        "message": f"{settings.app_name} (Modular Architecture)",
        "version": settings.app_version,
        "features": [
            "AI background removal",
            "Biometric face detection crop",
            "Dynamic background recolor",
            "Quality enhancement",
            "300 DPI Printable PDF Sheets",
        ],
        "docs": "/docs"
    })


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", settings.port))
    uvicorn.run(app, host=settings.host, port=port)