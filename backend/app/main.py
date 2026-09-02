import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import mediapipe as mp

from app.core.config import settings, UPLOAD_DIR, PROCESSED_DIR
from app.core.database import db
from app.core.cascade import load_cascade_classifiers, get_cv2_data_path
from app.core.state import uploaded_images, processing_status
from app.middleware.logging import RequestLoggingMiddleware
from app.middleware.exceptions import register_exception_handlers
from app.api.v1 import api_v1_router
from app.services.resize.presets import COUNTRY_PRESETS, PASSPORT_CONFIG
from app.services.face_detection.detector import align_and_crop_face, calculate_passport_crop
from app.services.face_detection.fallbacks import center_crop_fallback, align_crop_cascade_fallback
from app.services.enhancement.enhancer import flatten_onto_bg, refine_edges_and_halo, enhance_image_quality
from app.services.enhancement.validator import verify_passport_quality
from app.services.background.remover import remove_background_lightweight
from app.services.pipeline import detect_face_crop, process_image_async, recolor_image_logic

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