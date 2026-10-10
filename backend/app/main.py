import os

# --- High-Performance Multithreading for Local CPU AI Inference ---
cpu_count = os.cpu_count() or 4
optimal_threads = str(min(8, max(4, cpu_count // 2 if cpu_count > 4 else cpu_count)))
os.environ.setdefault("OMP_NUM_THREADS", optimal_threads)
os.environ.setdefault("OPENBLAS_NUM_THREADS", optimal_threads)
os.environ.setdefault("MKL_NUM_THREADS", optimal_threads)
os.environ["OMP_WAIT_POLICY"] = "PASSIVE"  # Free up CPU immediately when idle
os.environ["ORT_TENSORRT_MAX_WORKSPACE_SIZE"] = "1073741824"  # 1GB RAM Limit for ONNX
# ------------------------------------------------------------------
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from app.core.config import settings, UPLOAD_DIR, PROCESSED_DIR
from app.core.database import db
from app.core.cascade import load_cascade_classifiers, get_cv2_data_path
from app.core.state import uploaded_images, processing_status
from app.middleware.logging import RequestLoggingMiddleware
from app.middleware.exceptions import register_exception_handlers
from app.api.v1 import api_v1_router
from app.services.background.remover import check_bg_engine, preload_models

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

    # Load OpenCV Haar Cascades with Windows Unicode path safety
    primary_cascade, alt_cascade = load_cascade_classifiers()
    app.state.face_cascade = primary_cascade
    app.state.face_cascade_alt = alt_cascade

    if app.state.face_cascade.empty():
        logger.warning("Primary cascade not found, face detection will rely on MediaPipe")
    else:
        logger.info("Face cascades loaded successfully")

    # Connect to MongoDB
    mongo_db = await db.connect()
    app.state.mongo_db = mongo_db
    app.state.mongo_client = db.client

    # Background Engine Startup Self-Check & Model Preloading
    import asyncio

    def _startup_bg_check():
        try:
            diag = check_bg_engine()
            logger.info(
                f"[BG Engine] Startup self-check: status={diag.get('status')} | "
                f"mode={diag.get('quality_mode')} | "
                f"models={diag.get('active_model_chain')} | "
                f"dummy_latency={diag.get('dummy_test', {}).get('latency_ms')}ms"
            )
        except Exception as e:
            logger.warning(f"[BG Engine] Startup self-check exception: {e}")
        preload_models()

    asyncio.create_task(asyncio.to_thread(_startup_bg_check))

    yield

    # Clean shutdown
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
app.mount("/api/v1/uploads", StaticFiles(directory=UPLOAD_DIR), name="api_uploads")
app.mount("/api/v1/processed", StaticFiles(directory=PROCESSED_DIR), name="api_processed")

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


@app.get("/health/bg")
@app.get("/api/v1/health/bg")
async def health_bg():
    """Returns background engine diagnostics, available models, onnxruntime status, and latency."""
    return check_bg_engine()


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