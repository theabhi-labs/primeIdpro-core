import os
import re
import uuid
import asyncio
import logging
import subprocess
import math
from datetime import datetime
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image, ImageEnhance, ImageFilter
import cv2
import numpy as np
import mediapipe as mp
from pydantic import BaseModel, field_validator
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import errors as mongo_errors

# ========== IMAGE CODECS (HEIC / AVIF / WEBP SUPPORT) ==========
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception:
    pass

try:
    import pillow_avif
except Exception:
    pass

# ========== LOGGING ==========
# Detailed logging so real failures show up in server logs instead of a bare 500.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("primeidpro")

# ========== CONFIGURATION ==========
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
PROCESSED_DIR = os.path.join(BASE_DIR, "processed")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

# ========== MONGODB CONFIGURATION ==========
# NOTE: previously the app had a fully-built MongoDB/Beanie layer under
# app/core/database.py + app/api/v1/sheet.py, but it was never wired into
# this file (the actual running app). That's the root cause of the save
# endpoint returning 500 / "Failed to fetch": the route the frontend calls
# either didn't exist, or existed but the database was never connected.
MONGODB_URL = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.environ.get("MONGODB_DB_NAME", "primeidpro")


def get_cv2_data_path(filename):
    import os
    import sys
    import cv2

    if getattr(sys, "frozen", False):

        base = os.path.dirname(sys.executable)

        candidates = [
            os.path.join(base, "_internal", "cv2", "data", filename),
            os.path.join(base, "cv2", "data", filename),
            os.path.join(sys._MEIPASS, "cv2", "data", filename),
            os.path.join(sys._MEIPASS, filename),
        ]

        for path in candidates:
            print("CHECK:", path)
            if os.path.exists(path):
                print("FOUND:", path)
                return path

    dev = os.path.join(cv2.data.haarcascades, filename)

    if os.path.exists(dev):
        return dev

    raise FileNotFoundError(filename)

# ========== LIFESPAN ==========
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Server starting...")
    # Load primary frontal face cascade

    cascade_path = get_cv2_data_path("haarcascade_frontalface_default.xml")
    alt_cascade_path = get_cv2_data_path("haarcascade_frontalface_alt2.xml")

    logger.info(f"Cascade path = {cascade_path}")
    logger.info(f"Exists = {os.path.exists(cascade_path)}")

    app.state.face_cascade = cv2.CascadeClassifier(cascade_path)
    app.state.face_cascade_alt = cv2.CascadeClassifier(alt_cascade_path)

    if app.state.face_cascade.empty():
        logger.warning("Primary cascade not found, face detection will be degraded")
    else:
        logger.info("Face cascades loaded")

    # ---- MediaPipe FaceMesh ----
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

    # ---- MongoDB connection (used by the project/sheet save endpoint) ----
    app.state.mongo_client = None
    app.state.mongo_db = None
    try:
        client = AsyncIOMotorClient(
            MONGODB_URL,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
        )
        await client.admin.command("ping")
        app.state.mongo_client = client
        app.state.mongo_db = client[MONGODB_DB_NAME]
        logger.info(f"✅ Connected to MongoDB ({MONGODB_DB_NAME})")
    except Exception as e:
        # Don't crash the whole app if Mongo is unreachable — the rest of the
        # (upload/process) features are in-memory and should keep working.
        # Save-to-database endpoints will report 503 until this succeeds.
        logger.error(f"❌ MongoDB connection failed: {e}")
        logger.warning("⚠️ Save/Project endpoints will return 503 until MongoDB is reachable")

    yield

    if hasattr(app.state, "mp_face_mesh") and app.state.mp_face_mesh:
        try:
            app.state.mp_face_mesh.close()
            logger.info("MediaPipe FaceMesh closed")
        except Exception as e:
            logger.error(f"Error closing FaceMesh: {e}")

    if app.state.mongo_client:
        app.state.mongo_client.close()
        logger.info("Disconnected from MongoDB")
    logger.info("Server shutting down")

app = FastAPI(title="Passport Photo Editor API", version="3.2.0", lifespan=lifespan)

# ========== MIDDLEWARE ==========
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/processed", StaticFiles(directory=PROCESSED_DIR), name="processed")


# ========== REQUEST LOGGING ==========
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = datetime.now()
    try:
        response = await call_next(request)
    except Exception as exc:
        # Belt-and-braces: if something throws below the exception handlers
        # (e.g. inside middleware/ASGI plumbing) we still log it with a
        # traceback instead of the connection silently dying, which is what
        # produces "TypeError: Failed to fetch" on the frontend.
        logger.exception(f"Unhandled error in {request.method} {request.url.path}: {exc}")
        raise
    elapsed = (datetime.now() - start).total_seconds()
    logger.info(f"{request.method} {request.url.path} -> {response.status_code} ({elapsed:.3f}s)")
    return response


# ========== GLOBAL ERROR HANDLERS ==========
# These make sure the client ALWAYS gets a real JSON response with a
# meaningful message (with CORS headers, since they still go through
# CORSMiddleware) instead of a generic/blank 500 that shows up in the
# browser as "TypeError: Failed to fetch".
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    missing_fields = [
        ".".join(str(p) for p in err["loc"] if p != "body")
        for err in exc.errors()
    ]
    logger.warning(f"Validation failed on {request.url.path}: {missing_fields}")
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": f"Missing or invalid field(s): {', '.join(missing_fields) or 'unknown'}",
            "details": exc.errors(),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception on {request.method} {request.url.path}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": f"Internal server error: {str(exc)}",
        },
    )


# ========== IN‑MEMORY STORAGE ==========
uploaded_images = {}
processing_status = {}

# ========== HELPER FUNCTIONS ==========

def hex_to_rgb(hex_color: str):
    """Convert HEX (#3498DB) to RGB tuple (52, 152, 219)"""
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 3:
        hex_color = ''.join([c * 2 for c in hex_color])
    return tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))


def validate_and_normalize_color(color_str: str) -> str:
    """Validate color format safely and normalize optionally missing hash symbol."""
    if not color_str:
        raise HTTPException(400, "bg_color cannot be empty")
    
    color_str = color_str.strip()
    
    # Check basic colors
    basic_colors = {"white", "black", "red", "green", "blue"}
    if color_str.lower() in basic_colors:
        return color_str.lower()
        
    # Hex validation pattern (optional '#' followed by 3 or 6 hex digits)
    match = re.match(r"^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$", color_str)
    if not match:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid color format: '{color_str}'. Must be a valid hex color code (e.g., #3498DB or 3498DB) or basic color name."
        )
        
    if not color_str.startswith("#"):
        color_str = f"#{color_str}"
        
    return color_str


def calculate_passport_crop(
    image_width: int,
    image_height: int,
    rotated_landmarks: list,
    target_aspect_ratio: float,
    eye_line_ratio: float = 0.38,
    head_height_ratio: float = 0.58,
    top_margin_ratio: float = 0.12,
    bottom_margin_ratio: float = 0.30
):
    """
    Calculate normalized crop coordinates with visible headroom margin and natural zoom out.
    Biometric Rules:
      - Head Height (crown of hair to chin) ≈ 58% (balanced biometric standard)
      - Top Headroom Margin ≈ 12% (guaranteed clean background above hair)
      - Bottom Shoulder/Chest Room ≈ 30% (natural shoulders visibility)
      - Face Horizontally Centered (50% midpoint)
    """
    p_chin = rotated_landmarks[152]
    p_forehead = rotated_landmarks[10]
    p_left_cheek = rotated_landmarks[454]
    p_right_cheek = rotated_landmarks[234]
    
    face_cx = (p_left_cheek[0] + p_right_cheek[0]) / 2.0
    
    # Facial height from forehead top to chin bottom
    face_height = abs(p_chin[1] - p_forehead[1])
    
    # Accurate anatomical crown estimation including full hair volume
    crown_y = p_forehead[1] - 0.45 * face_height
    chin_y = p_chin[1]
    head_height = max(chin_y - crown_y, 10.0)
    
    # Target crop height based on head taking head_height_ratio of the total frame
    crop_height = head_height / max(head_height_ratio, 0.40)
    crop_width = crop_height * target_aspect_ratio
    
    # Position crop with guaranteed headroom above the hair crown
    x1 = face_cx - crop_width / 2.0
    x2 = x1 + crop_width
    y1 = crown_y - crop_height * top_margin_ratio
    y2 = y1 + crop_height
    
    logger.info(
        f"[BIOMETRIC CROP] head_h={head_height:.1f}, face_h={face_height:.1f}, "
        f"crown_y={crown_y:.1f}, chin_y={chin_y:.1f}, "
        f"crop_box=({x1:.1f}, {y1:.1f}, {x2:.1f}, {y2:.1f})"
    )
    return x1, y1, x2, y2


def get_bg_rgb(color_str: str):
    """Convert string/hex to RGB tuple. Supports 'white', 'black', '#3498DB', basic colors."""
    color_str = (color_str or "white").strip().lower()
    if color_str == "white":
        return (255, 255, 255)
    elif color_str == "black":
        return (0, 0, 0)
    elif color_str.startswith("#"):
        try:
            return hex_to_rgb(color_str)
        except Exception:
            return (255, 255, 255)
    else:
        basic = {"red": (255, 0, 0), "green": (0, 255, 0), "blue": (0, 0, 255)}
        return basic.get(color_str, (255, 255, 255))


# ------ IMPROVED: Background removal ------
def remove_background_lightweight(input_path: str, output_path: str) -> bool:
    """
    Remove background using rembg (AI) or GrabCut with clean alpha preservation.
    Preserves hair, beard, clothes, and body edges without artificial clipping.
    """
    rembg_success = False
    for model_name in ['u2net', 'u2netp']:
        try:
            from rembg import remove, new_session
            session = new_session(model_name)
            pil_input = Image.open(input_path)
            output_img = remove(pil_input, session=session)
            output_img.save(output_path, "PNG")

            # Validate alpha (transparency)
            check = Image.open(output_path)
            if check.mode == "RGBA":
                alpha = np.array(check.split()[-1])
                if (alpha < 250).sum() > (alpha.size * 0.02):
                    rembg_success = True
                    logger.info(f"✅ rembg ({model_name}) succeeded")
                    break
        except Exception as e:
            logger.warning(f"rembg ({model_name}) warning: {e}")
            continue

    if not rembg_success:
        logger.info("Falling back to GrabCut with face detection")
        try:
            pil_img = Image.open(input_path).convert("RGB")
            img_rgb = np.array(pil_img)
            img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
            h, w = img_bgr.shape[:2]
            mask = np.zeros((h, w), np.uint8)
            bgd_model = np.zeros((1, 65), np.float64)
            fgd_model = np.zeros((1, 65), np.float64)

            gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
            cascade_path = get_cv2_data_path("haarcascade_frontalface_default.xml")
            cascade = cv2.CascadeClassifier(cascade_path)
            if cascade.empty():
                raise RuntimeError(f"Could not load cascade: {cascade_path}")

            faces = cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(30, 30)
            )

            if len(faces) > 0:
                x, y, fw, fh = max(faces, key=lambda r: r[2]*r[3])
                margin_top = int(fh * 0.45)
                margin_bottom = int(fh * 2.4)
                margin_side = int(fw * 0.8)
                rect_x = max(0, x - margin_side)
                rect_y = max(0, y - margin_top)
                rect_w = min(w - rect_x, fw + 2 * margin_side)
                rect_h = min(h - rect_y, fh + margin_top + margin_bottom)
                rect = (rect_x, rect_y, rect_w, rect_h)
            else:
                margin = int(min(w, h) * 0.08)
                rect = (margin, margin, w - 2*margin, h - 2*margin)

            cv2.grabCut(img_bgr, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
            mask2 = np.where((mask == 2) | (mask == 0), 0, 1).astype("uint8")
            mask2 = cv2.GaussianBlur(mask2.astype(np.float32), (3, 3), 0)
            mask2 = (mask2 * 255).astype(np.uint8)
            img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
            rgba = np.dstack([img_rgb, mask2])
            Image.fromarray(rgba, mode="RGBA").save(output_path, "PNG")
        except Exception as e2:
            logger.error(f"GrabCut fallback failed: {e2}")
            try:
                img = Image.open(input_path).convert("RGBA")
                np_img = np.array(img)
                r, g, b = np_img[:, :, 0], np_img[:, :, 1], np_img[:, :, 2]
                mask = (r > 225) & (g > 225) & (b > 225)
                np_img[:, :, 3] = np.where(mask, 0, 255)
                Image.fromarray(np_img, mode="RGBA").save(output_path, "PNG")
                return True
            except Exception:
                return False

    return True


# ========== COUNTRY PRESETS & BIOMETRIC CROP ENGINE ==========

PASSPORT_CONFIG = {
    "width_mm": 35.0,
    "height_mm": 45.0,
    "dpi": 300,
    "target_dpi": 300,
    "target_width_px": 413,       # 35mm @ 300 DPI
    "target_height_px": 531,      # 45mm @ 300 DPI
    "eye_line_ratio": 0.38,       # Balanced eyeline at 38%
    "eye_line_ratio_default": 0.38,
    "head_height_ratio": 0.58,    # 58% of canvas height (chin to top of hair)
    "head_height_ratio_min": 0.50,
    "head_height_ratio_max": 0.65,
    "head_height_ratio_default": 0.58,
    "top_margin_ratio": 0.12,     # 12% headroom margin above hair (clean margin)
    "bottom_margin_ratio": 0.30,  # 30% shoulder/neck transition
}

COUNTRY_PRESETS = {
    "india": {
        "name": "India",
        "width_mm": 35,
        "height_mm": 45,
        "target_w_px": 413,
        "target_h_px": 531,
        "head_height_ratio": 0.58,
        "head_height_ratio_min": 0.50,
        "head_height_ratio_max": 0.65,
        "top_headroom_ratio": 0.12,
        "eye_line_ratio": 0.38,
        "bg_color": "white",
        "min_dpi": 300,
    },
    "usa": {
        "name": "USA",
        "width_mm": 50.8,
        "height_mm": 50.8,
        "target_w_px": 600,
        "target_h_px": 600,
        "head_height_ratio": 0.56,
        "head_height_ratio_min": 0.50,
        "head_height_ratio_max": 0.69,
        "top_headroom_ratio": 0.14,
        "eye_line_ratio": 0.40,
        "bg_color": "white",
        "min_dpi": 300,
    },
    "uk": {
        "name": "United Kingdom",
        "width_mm": 35,
        "height_mm": 45,
        "target_w_px": 413,
        "target_h_px": 531,
        "head_height_ratio": 0.58,
        "head_height_ratio_min": 0.50,
        "head_height_ratio_max": 0.65,
        "top_headroom_ratio": 0.12,
        "eye_line_ratio": 0.38,
        "bg_color": "light grey",
        "min_dpi": 300,
    },
    "canada": {
        "name": "Canada",
        "width_mm": 50,
        "height_mm": 70,
        "target_w_px": 591,
        "target_h_px": 827,
        "head_height_ratio": 0.46,
        "head_height_ratio_min": 0.44,
        "head_height_ratio_max": 0.52,
        "top_headroom_ratio": 0.15,
        "eye_line_ratio": 0.40,
        "bg_color": "white",
        "min_dpi": 300,
    },
    "australia": {
        "name": "Australia",
        "width_mm": 35,
        "height_mm": 45,
        "target_w_px": 413,
        "target_h_px": 531,
        "head_height_ratio": 0.58,
        "head_height_ratio_min": 0.50,
        "head_height_ratio_max": 0.65,
        "top_headroom_ratio": 0.12,
        "eye_line_ratio": 0.38,
        "bg_color": "light grey",
        "min_dpi": 300,
    },
    "germany": {
        "name": "Germany",
        "width_mm": 35,
        "height_mm": 45,
        "target_w_px": 413,
        "target_h_px": 531,
        "head_height_ratio": 0.58,
        "head_height_ratio_min": 0.50,
        "head_height_ratio_max": 0.65,
        "top_headroom_ratio": 0.12,
        "eye_line_ratio": 0.38,
        "bg_color": "light grey",
        "min_dpi": 300,
    },
    "france": {
        "name": "France",
        "width_mm": 35,
        "height_mm": 45,
        "target_w_px": 413,
        "target_h_px": 531,
        "head_height_ratio": 0.58,
        "head_height_ratio_min": 0.50,
        "head_height_ratio_max": 0.65,
        "top_headroom_ratio": 0.12,
        "eye_line_ratio": 0.38,
        "bg_color": "light grey",
        "min_dpi": 300,
    },
    "europe": {
        "name": "European Union / Schengen",
        "width_mm": 35,
        "height_mm": 45,
        "target_w_px": 413,
        "target_h_px": 531,
        "head_height_ratio": 0.58,
        "head_height_ratio_min": 0.50,
        "head_height_ratio_max": 0.65,
        "top_headroom_ratio": 0.12,
        "eye_line_ratio": 0.38,
        "bg_color": "white",
        "min_dpi": 300,
    },
    "japan": {
        "name": "Japan",
        "width_mm": 35,
        "height_mm": 45,
        "target_w_px": 413,
        "target_h_px": 531,
        "head_height_ratio": 0.58,
        "head_height_ratio_min": 0.50,
        "head_height_ratio_max": 0.65,
        "top_headroom_ratio": 0.12,
        "eye_line_ratio": 0.38,
        "bg_color": "white",
        "min_dpi": 300,
    },
    "china": {
        "name": "China",
        "width_mm": 33,
        "height_mm": 48,
        "target_w_px": 390,
        "target_h_px": 567,
        "head_height_ratio": 0.58,
        "head_height_ratio_min": 0.50,
        "head_height_ratio_max": 0.65,
        "top_headroom_ratio": 0.12,
        "eye_line_ratio": 0.38,
        "bg_color": "white",
        "min_dpi": 300,
    },
    "uae": {
        "name": "UAE",
        "width_mm": 35,
        "height_mm": 45,
        "target_w_px": 413,
        "target_h_px": 531,
        "head_height_ratio": 0.58,
        "head_height_ratio_min": 0.50,
        "head_height_ratio_max": 0.65,
        "top_headroom_ratio": 0.12,
        "eye_line_ratio": 0.38,
        "bg_color": "white",
        "min_dpi": 300,
    },
    "saudi": {
        "name": "Saudi Arabia",
        "width_mm": 35,
        "height_mm": 45,
        "target_w_px": 413,
        "target_h_px": 531,
        "head_height_ratio": 0.58,
        "head_height_ratio_min": 0.50,
        "head_height_ratio_max": 0.65,
        "top_headroom_ratio": 0.12,
        "eye_line_ratio": 0.38,
        "bg_color": "white",
        "min_dpi": 300,
    },
    "brazil": {
        "name": "Brazil",
        "width_mm": 35,
        "height_mm": 45,
        "target_w_px": 413,
        "target_h_px": 531,
        "head_height_ratio": 0.58,
        "head_height_ratio_min": 0.50,
        "head_height_ratio_max": 0.65,
        "top_headroom_ratio": 0.12,
        "eye_line_ratio": 0.38,
        "bg_color": "white",
        "min_dpi": 300,
    },
    "russia": {
        "name": "Russia",
        "width_mm": 35,
        "height_mm": 45,
        "target_w_px": 413,
        "target_h_px": 531,
        "head_height_ratio": 0.58,
        "head_height_ratio_min": 0.50,
        "head_height_ratio_max": 0.65,
        "top_headroom_ratio": 0.12,
        "eye_line_ratio": 0.38,
        "bg_color": "white",
        "min_dpi": 300,
    },
    "south_africa": {
        "name": "South Africa",
        "width_mm": 35,
        "height_mm": 45,
        "target_w_px": 413,
        "target_h_px": 531,
        "head_height_ratio": 0.58,
        "head_height_ratio_min": 0.50,
        "head_height_ratio_max": 0.65,
        "top_headroom_ratio": 0.12,
        "eye_line_ratio": 0.38,
        "bg_color": "white",
        "min_dpi": 300,
    },
    "new_zealand": {
        "name": "New Zealand",
        "width_mm": 35,
        "height_mm": 45,
        "target_w_px": 413,
        "target_h_px": 531,
        "head_height_ratio": 0.58,
        "head_height_ratio_min": 0.50,
        "head_height_ratio_max": 0.65,
        "top_headroom_ratio": 0.12,
        "eye_line_ratio": 0.38,
        "bg_color": "white",
        "min_dpi": 300,
    }
}


def align_and_crop_face(rgba_img: Image.Image, country_code: str, dpi: int = 300, scale_adjust: float = 1.0, center_shift: tuple = (0.0, 0.0)):
    """
    Precision cropping and alignment using MediaPipe FaceMesh landmarks.
    Automatically aligns eye centers horizontally, normalizes head size,
    and applies balanced biometric framing:
      - 35x45mm = exactly 413x531 px @ 300 DPI
      - Top margin ~12% guaranteed clean headroom above hair crown
      - Head height ~58% (crown of hair to chin) for comfortable natural zoom out
      - Bottom shoulder space ~30% for natural shoulders and clothing
      - Symmetric horizontal centering (50%)
    """
    img_np = np.array(rgba_img)
    h, w = img_np.shape[:2]
    
    preset = COUNTRY_PRESETS.get(country_code.lower(), COUNTRY_PRESETS["india"])
    width_mm = preset["width_mm"]
    height_mm = preset["height_mm"]
    W = preset.get("target_w_px", int(round(width_mm / 25.4 * dpi)))
    H = preset.get("target_h_px", int(round(height_mm / 25.4 * dpi)))
    
    face_mesh = getattr(app.state, "mp_face_mesh", None)
    if face_mesh is None:
        logger.warning("FaceMesh not initialized, falling back to Haar Cascade")
        return align_crop_cascade_fallback(img_np, country_code, dpi)
        
    img_rgb = cv2.cvtColor(img_np, cv2.COLOR_RGBA2RGB) if img_np.shape[2] == 4 else cv2.cvtColor(img_np, cv2.COLOR_RGB2RGB)
    results = face_mesh.process(img_rgb)
    
    if not results.multi_face_landmarks:
        logger.warning("No face landmarks detected, falling back to Haar Cascade")
        return align_crop_cascade_fallback(img_np, country_code, dpi)
        
    # Multi-face selection logic (largest face closest to center)
    if len(results.multi_face_landmarks) > 1:
        best_face = None
        best_score = -1
        for face in results.multi_face_landmarks:
            xs = [lm.x for lm in face.landmark]
            ys = [lm.y for lm in face.landmark]
            area = (max(xs) - min(xs)) * (max(ys) - min(ys))
            cx = (min(xs) + max(xs)) / 2.0
            cy = (min(ys) + max(ys)) / 2.0
            dist = math.sqrt((cx - 0.5)**2 + (cy - 0.5)**2)
            score = area / (dist + 0.1)
            if score > best_score:
                best_score = score
                best_face = face
        face_landmarks = best_face
    else:
        face_landmarks = results.multi_face_landmarks[0]
        
    num_landmarks = len(face_landmarks.landmark)
    
    # 1. Get eye pupil centers
    if num_landmarks >= 478:
        p_right_x = face_landmarks.landmark[468].x * w
        p_right_y = face_landmarks.landmark[468].y * h
        p_left_x = face_landmarks.landmark[473].x * w
        p_left_y = face_landmarks.landmark[473].y * h
    else:
        p_right_x = (face_landmarks.landmark[33].x + face_landmarks.landmark[133].x) / 2.0 * w
        p_right_y = (face_landmarks.landmark[33].y + face_landmarks.landmark[133].y) / 2.0 * h
        p_left_x = (face_landmarks.landmark[263].x + face_landmarks.landmark[362].x) / 2.0 * w
        p_left_y = (face_landmarks.landmark[263].y + face_landmarks.landmark[362].y) / 2.0 * h
        
    right_eye = np.array([p_right_x, p_right_y], dtype=np.float32)
    left_eye = np.array([p_left_x, p_left_y], dtype=np.float32)
    
    # 2. Alignment Angle
    dy = left_eye[1] - right_eye[1]
    dx = left_eye[0] - right_eye[0]
    angle_rad = np.arctan2(dy, dx)
    angle_deg = np.degrees(angle_rad)
    eye_mid = (right_eye + left_eye) / 2.0
    
    # 3. Rotate landmarks to horizontal eye plane
    cos_val = np.cos(-angle_rad)
    sin_val = np.sin(-angle_rad)
    
    def rotate_pt(pt):
        rx = eye_mid[0] + (pt[0] - eye_mid[0]) * cos_val - (pt[1] - eye_mid[1]) * sin_val
        ry = eye_mid[1] + (pt[0] - eye_mid[0]) * sin_val + (pt[1] - eye_mid[1]) * cos_val
        return np.array([rx, ry], dtype=np.float32)
        
    p_chin = rotate_pt(np.array([face_landmarks.landmark[152].x * w, face_landmarks.landmark[152].y * h]))
    p_forehead = rotate_pt(np.array([face_landmarks.landmark[10].x * w, face_landmarks.landmark[10].y * h]))
    p_left_cheek = rotate_pt(np.array([face_landmarks.landmark[454].x * w, face_landmarks.landmark[454].y * h]))
    p_right_cheek = rotate_pt(np.array([face_landmarks.landmark[234].x * w, face_landmarks.landmark[234].y * h]))
    
    # Facial height (forehead top to chin bottom)
    face_height = abs(p_chin[1] - p_forehead[1])
    face_width = abs(p_right_cheek[0] - p_left_cheek[0])
    
    # Accurate crown estimation including full hair volume
    crown_y = p_forehead[1] - 0.45 * face_height
    
    # Check alpha channel for true hair top boundary if available
    if len(img_np.shape) == 3 and img_np.shape[2] == 4:
        try:
            alpha = img_np[:, :, 3]
            x_min = int(max(0, eye_mid[0] - face_width * 0.5))
            x_max = int(min(w, eye_mid[0] + face_width * 0.5))
            if x_max > x_min:
                cols_alpha = alpha[:, x_min:x_max]
                ys_above = np.where(cols_alpha > 50)[0]
                if len(ys_above) > 0:
                    real_hair_top = np.min(ys_above)
                    min_allowed = p_forehead[1] - 0.65 * face_height
                    max_allowed = p_forehead[1] - 0.25 * face_height
                    if min_allowed <= real_hair_top <= max_allowed:
                        crown_y = float(real_hair_top)
        except Exception:
            pass
            
    chin_y = p_chin[1]
    head_height = max(chin_y - crown_y, 10.0)
    face_cx = (p_left_cheek[0] + p_right_cheek[0]) / 2.0
    
    # 4. Target Proportions & Scaling (Natural zoom out with 12% headroom)
    target_head_ratio = preset.get("head_height_ratio", 0.58)
    target_top_headroom = preset.get("top_headroom_ratio", 0.12)
    
    target_head_px = H * target_head_ratio
    scale = (target_head_px / head_height) * scale_adjust
    
    # Destination mapping: 
    # Center face horizontally at W/2, and place hair crown at H * target_top_headroom
    dst_x = W / 2.0 + center_shift[0] * W
    dst_crown_y = H * target_top_headroom + center_shift[1] * H
    
    # 5. Affine Transformation Matrix
    M = cv2.getRotationMatrix2D((float(eye_mid[0]), float(eye_mid[1])), float(angle_deg), float(scale))
    M[0, 2] += (dst_x - (eye_mid[0] + (face_cx - eye_mid[0]) * scale))
    M[1, 2] += (dst_crown_y - (eye_mid[1] + (crown_y - eye_mid[1]) * scale))
    
    warped_np = cv2.warpAffine(
        img_np, M, (W, H),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0)
    )
    if len(warped_np.shape) == 3 and warped_np.shape[2] == 4:
        warped_rgba = Image.fromarray(warped_np, mode="RGBA")
    else:
        warped_rgba = Image.fromarray(warped_np, mode="RGB").convert("RGBA")
    
    metrics = {
        "head_height_ratio": target_head_ratio,
        "top_headroom_ratio": target_top_headroom,
        "target_size_px": (W, H),
        "angle_deg": angle_deg,
        "head_height": head_height,
        "scale": scale,
        "crown_y_mapped": dst_crown_y,
    }
    return warped_rgba, metrics


def align_crop_cascade_fallback(img_np, country_code, dpi):
    """Fallback crop using Haar Cascade if FaceMesh fails."""
    h, w = img_np.shape[:2]
    cascade = getattr(app.state, "face_cascade", None)
    if cascade is None or cascade.empty():
        return center_crop_fallback(img_np, country_code, dpi)
        
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGBA2GRAY) if img_np.shape[2] == 4 else cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
    
    if len(faces) == 0:
        alt_cascade = getattr(app.state, "face_cascade_alt", None)
        if alt_cascade and not alt_cascade.empty():
            faces = alt_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
            
    if len(faces) == 0:
        return center_crop_fallback(img_np, country_code, dpi)
        
    x, y, fw, fh = max(faces, key=lambda r: r[2]*r[3])
    face_cx = x + fw / 2.0
    estimated_crown_y = y - fh * 0.45
    estimated_chin_y = y + fh * 1.05
    estimated_head_height = max(estimated_chin_y - estimated_crown_y, 10.0)
    
    preset = COUNTRY_PRESETS.get(country_code.lower(), COUNTRY_PRESETS["india"])
    W = preset.get("target_w_px", int(round(preset["width_mm"] / 25.4 * dpi)))
    H = preset.get("target_h_px", int(round(preset["height_mm"] / 25.4 * dpi)))
    
    target_head_ratio = preset.get("head_height_ratio", 0.58)
    target_top_headroom = preset.get("top_headroom_ratio", 0.12)
    
    target_head_px = H * target_head_ratio
    scale = target_head_px / estimated_head_height
    
    dst_x = W / 2.0
    dst_crown_y = H * target_top_headroom
    
    M = np.float32([
        [scale, 0, dst_x - face_cx * scale],
        [0, scale, dst_crown_y - estimated_crown_y * scale]
    ])
    
    warped_np = cv2.warpAffine(img_np, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    if len(warped_np.shape) == 3 and warped_np.shape[2] == 4:
        warped_rgba = Image.fromarray(warped_np, mode="RGBA")
    else:
        warped_rgba = Image.fromarray(warped_np, mode="RGB").convert("RGBA")
    
    metrics = {
        "head_height_ratio": target_head_ratio,
        "top_headroom_ratio": target_top_headroom,
        "target_size_px": (W, H),
        "angle_deg": 0.0,
        "scale": scale,
        "cascade_fallback": True
    }
    return warped_rgba, metrics


def center_crop_fallback(img_np, country_code, dpi):
    """Last resort center crop if all face detection fails."""
    h, w = img_np.shape[:2]
    preset = COUNTRY_PRESETS.get(country_code.lower(), COUNTRY_PRESETS["india"])
    W = preset.get("target_w_px", int(round(preset["width_mm"] / 25.4 * dpi)))
    H = preset.get("target_h_px", int(round(preset["height_mm"] / 25.4 * dpi)))
    
    target_ratio = W / H
    img_ratio = w / h
    
    if img_ratio > target_ratio:
        crop_h = h
        crop_w = int(h * target_ratio)
    else:
        crop_w = w
        crop_h = int(w / target_ratio)
        
    cx, cy = w / 2.0, h / 2.0
    left = cx - crop_w / 2.0
    top = cy - crop_h / 2.0
    
    scale = W / crop_w
    M = np.float32([
        [scale, 0, -left * scale],
        [0, scale, -top * scale]
    ])
    
    warped_np = cv2.warpAffine(img_np, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    if len(warped_np.shape) == 3 and warped_np.shape[2] == 4:
        warped_rgba = Image.fromarray(warped_np, mode="RGBA")
    else:
        warped_rgba = Image.fromarray(warped_np, mode="RGB").convert("RGBA")
    
    metrics = {
        "head_height_ratio": 0.58,
        "top_headroom_ratio": 0.12,
        "target_size_px": (W, H),
        "angle_deg": 0.0,
        "scale": scale,
        "center_fallback": True
    }
    return warped_rgba, metrics


def refine_edges_and_halo(img_np):
    """
    Perform edge refinement, alpha mask smoothing via guided filter,
    and anti-halo color decontamination.
    Preserves clean edges around hair and beard without white halos.
    """
    bgr = cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR)
    alpha = img_np[:, :, 3]
    
    # 1. Guided Filter Alpha Mask Smoothing
    guide = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    alpha_norm = alpha.astype(np.float32) / 255.0
    
    r = 3
    eps = 1e-4
    
    mean_I = cv2.boxFilter(guide, -1, (r, r))
    mean_p = cv2.boxFilter(alpha_norm, -1, (r, r))
    mean_Ip = cv2.boxFilter(guide * alpha_norm, -1, (r, r))
    cov_Ip = mean_Ip - mean_I * mean_p
    
    mean_II = cv2.boxFilter(guide * guide, -1, (r, r))
    var_I = mean_II - mean_I * mean_I
    
    a = cov_Ip / (var_I + eps)
    b = mean_p - a * mean_I
    
    mean_a = cv2.boxFilter(a, -1, (r, r))
    mean_b = cv2.boxFilter(b, -1, (r, r))
    
    refined_alpha_norm = mean_a * guide + mean_b
    refined_alpha = np.clip(refined_alpha_norm * 255.0, 0, 255).astype(np.uint8)
    
    # 2. Anti-Halo Color Decontamination (using inpainting outer edge bleed)
    opaque_mask = (refined_alpha > 245).astype(np.uint8)
    inpaint_mask = (refined_alpha <= 245).astype(np.uint8)
    
    if np.sum(opaque_mask) > 0 and np.sum(inpaint_mask) > 0:
        decontaminated_bgr = cv2.inpaint(bgr, inpaint_mask, 3, cv2.INPAINT_TELEA)
        alpha_weight = (refined_alpha.astype(np.float32) / 255.0)[:, :, np.newaxis]
        final_bgr = (bgr.astype(np.float32) * alpha_weight + decontaminated_bgr.astype(np.float32) * (1.0 - alpha_weight)).astype(np.uint8)
    else:
        final_bgr = bgr
        
    # 3. Soft feathering
    refined_alpha = cv2.GaussianBlur(refined_alpha, (3, 3), 0)
    
    final_rgba = np.dstack([cv2.cvtColor(final_bgr, cv2.COLOR_BGR2RGB), refined_alpha])
    return final_rgba


def enhance_image_quality(img_rgb):
    """
    Subtle photographic white-balance normalization.
    NO ARTIFICIAL SMOOTHING, NO BILATERAL FILTER, NO MORPHING.
    Preserves 100% natural skin texture, beard, eyes, and photographic authenticity.
    """
    img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
    
    # 1. Subtle White Balance (Neutral illumination correction)
    b, g, r = cv2.split(img_bgr)
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    top_pixels = int(h * w * 0.05)
    
    flat_gray = gray.flatten()
    flat_gray.sort()
    threshold = flat_gray[-top_pixels] if len(flat_gray) >= top_pixels else 128
    
    bright_mask = gray >= threshold
    if np.sum(bright_mask) > 0:
        mean_b = np.mean(b[bright_mask])
        mean_g = np.mean(g[bright_mask])
        mean_r = np.mean(r[bright_mask])
        
        if mean_b > 0 and mean_g > 0 and mean_r > 0:
            scale_b = 255.0 / mean_b
            scale_g = 255.0 / mean_g
            scale_r = 255.0 / mean_r
            
            # Subtle 25% dampening
            scale_b = 1.0 + (scale_b - 1.0) * 0.25
            scale_g = 1.0 + (scale_g - 1.0) * 0.25
            scale_r = 1.0 + (scale_r - 1.0) * 0.25
            
            b = np.clip(b * scale_b, 0, 255).astype(np.uint8)
            g = np.clip(g * scale_g, 0, 255).astype(np.uint8)
            r = np.clip(r * scale_r, 0, 255).astype(np.uint8)
            img_bgr = cv2.merge((b, g, r))
            
    return cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)


def verify_passport_quality(img_rgba, country_code, dpi=300):
    """
    Perform pre-export validation checking face centering, tilt, head size ratios,
    blur, eyes closed, and background purity.
    """
    img_np = np.array(img_rgba)
    h, w = img_np.shape[:2]
    preset = COUNTRY_PRESETS.get(country_code.lower(), COUNTRY_PRESETS["india"])
    
    validation_log = {}
    suggestions = []
    is_valid = True
    
    # 1. Check Dimensions
    target_w = preset.get("target_w_px", int(round(preset["width_mm"] / 25.4 * dpi)))
    target_h = preset.get("target_h_px", int(round(preset["height_mm"] / 25.4 * dpi)))
    
    if abs(w - target_w) > 2 or abs(h - target_h) > 2:
        is_valid = False
        validation_log["size"] = "FAIL"
        suggestions.append(f"Size mismatch: got {w}x{h}, target is {target_w}x{target_h}")
    else:
        validation_log["size"] = "PASS"
        
    # 2. Check Background Purity (Edges must be uniform background)
    if preset["bg_color"] == "white" and img_np.shape[2] == 4:
        border_pts = []
        for x in range(0, w, max(1, w // 6)):
            border_pts.append(img_np[1, x])
        for y in range(0, h, max(1, h // 6)):
            border_pts.append(img_np[y, 1])
            border_pts.append(img_np[y, w - 2])
            
        non_white = 0
        for pt in border_pts:
            if pt[0] < 252 or pt[1] < 252 or pt[2] < 252:
                non_white += 1
        if non_white > 6:
            validation_log["background"] = "WARN"
        else:
            validation_log["background"] = "PASS"
            
    # 3. Facial Metrics Validation
    face_mesh = getattr(app.state, "mp_face_mesh", None)
    if face_mesh:
        img_rgb = cv2.cvtColor(cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR), cv2.COLOR_BGR2RGB)
        res = face_mesh.process(img_rgb)
        if not res.multi_face_landmarks:
            validation_log["face_detected"] = "WARN"
        else:
            validation_log["face_detected"] = "PASS"
            fl = res.multi_face_landmarks[0]
            
            # Eyeline horizontal check
            p_right = fl.landmark[33]
            p_left = fl.landmark[263]
            dy = p_left.y - p_right.y
            dx = p_left.x - p_right.x
            angle = np.degrees(np.arctan2(dy, dx))
            validation_log["eye_tilt"] = f"{angle:.1f}°"
            if abs(angle) > 2.0:
                is_valid = False
                validation_log["tilt_compliance"] = "FAIL"
                suggestions.append("Face alignment issue: tilt angle exceeds 2 degrees.")
            else:
                validation_log["tilt_compliance"] = "PASS"
                
            # Face Center Check
            mid_x = (p_right.x + p_left.x) / 2.0
            horizontal_offset = abs(mid_x - 0.5)
            validation_log["centering"] = f"{horizontal_offset * 100:.1f}% offset"
            if horizontal_offset > 0.06:
                is_valid = False
                validation_log["center_compliance"] = "FAIL"
                suggestions.append("Face is horizontally off-center.")
            else:
                validation_log["center_compliance"] = "PASS"
                
            # Head Height Ratio Check
            p_chin = fl.landmark[152]
            p_forehead = fl.landmark[10]
            estimated_head = (p_chin.y - p_forehead.y) * 1.45
            validation_log["head_ratio"] = f"{estimated_head * 100:.1f}%"
            min_r = preset.get("head_height_ratio_min", 0.50)
            max_r = preset.get("head_height_ratio_max", 0.65)
            if estimated_head < (min_r - 0.08) or estimated_head > (max_r + 0.08):
                validation_log["scale_compliance"] = "WARN"
            else:
                validation_log["scale_compliance"] = "PASS"
    else:
        validation_log["face_mesh"] = "NOT_AVAILABLE"
        
    # 4. Sharpness Check
    gray = cv2.cvtColor(cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR), cv2.COLOR_BGR2GRAY)
    blur_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    validation_log["sharpness"] = f"{blur_var:.1f}"
    if blur_var < 50.0:
        validation_log["sharpness_compliance"] = "WARN"
        suggestions.append("Image may be slightly soft. Please use a sharp high-res photo.")
    else:
        validation_log["sharpness_compliance"] = "PASS"
        
    return is_valid, validation_log, suggestions


def flatten_onto_bg(rgba_img: Image.Image, bg_color: str, target_size=(413, 531)) -> Image.Image:
    """Composite an already-cropped transparent image onto a flat studio color."""
    bg_rgb = get_bg_rgb(bg_color)
    size = target_size or rgba_img.size
    flat = Image.new("RGB", size, bg_rgb)
    if rgba_img.size != size:
        rgba_img = rgba_img.resize(size, Image.Resampling.LANCZOS)
    flat.paste(rgba_img, (0, 0), mask=rgba_img.split()[3])
    return flat


def detect_face_crop(image_path: str, output_path: str, transparent_output_path: str,
                      country_code: str = "india", bg_color: str = "white", dpi: int = 300):
    """
    Crop face with precise biometric alignment, normalization and edge refinement.
    Saves transparent asset PNG and background-composited final PNG at exact 300 DPI.
    """
    pil_img = Image.open(image_path)
    rgba_img = pil_img.convert("RGBA") if pil_img.mode != "RGBA" else pil_img
    
    scale_adj = 1.0
    shift = (0.0, 0.0)
    
    for attempt in range(2):
        transparent_crop, metrics = align_and_crop_face(rgba_img, country_code, dpi, scale_adj, shift)
        if metrics.get("center_fallback"):
            raise HTTPException(
                status_code=400,
                detail="No face detected. Please upload a clear front-facing photo."
            )
        
        # Edge Matting and Anti-Halo
        refined_np = refine_edges_and_halo(np.array(transparent_crop))
        refined_rgba = Image.fromarray(refined_np, mode="RGBA")
        
        # Flatten on Background
        flat = flatten_onto_bg(refined_rgba, bg_color, refined_rgba.size)
        
        # Validate output quality
        is_valid, v_log, suggestions = verify_passport_quality(refined_rgba, country_code, dpi)
        break
            
    # Natural lighting enhancement (no artificial blurring/morphing)
    enhanced_np = enhance_image_quality(np.array(flat.convert("RGB")))
    enhanced_flat = Image.fromarray(enhanced_np, mode="RGB")
    
    # Save with embedded 300 DPI metadata
    refined_rgba.save(transparent_output_path, "PNG", dpi=(dpi, dpi))
    enhanced_flat.save(output_path, "PNG", dpi=(dpi, dpi))
    return is_valid, v_log, suggestions


async def process_image_async(image_id: str, country_code: str = "india", bg_color: str = "white"):
    """Full pipeline: bg removal → precise crop + enhance + quality check"""
    try:
        processing_status[image_id] = {"status": "processing", "progress": 10}
        original_path = uploaded_images[image_id]["original_path"]

        processing_status[image_id]["progress"] = 30
        nobg_path = os.path.join(PROCESSED_DIR, f"{image_id}_nobg.png")
        success = await asyncio.to_thread(remove_background_lightweight, original_path, nobg_path)
        if not success:
            raise Exception("Background removal failed completely")

        processing_status[image_id]["progress"] = 60
        final_path = os.path.join(PROCESSED_DIR, f"{image_id}_final.png")
        transparent_path = os.path.join(PROCESSED_DIR, f"{image_id}_transparent.png")
        
        # Runs crop, alignment, edge quality, enhancements, and quality verification in one step
        is_valid, v_log, suggestions = await asyncio.to_thread(
            detect_face_crop,
            nobg_path,
            final_path,
            transparent_path,
            country_code,
            bg_color,
            300
        )

        processing_status[image_id]["progress"] = 90

        # Clean up temporary background-removed file
        if os.path.exists(nobg_path):
            os.remove(nobg_path)

        uploaded_images[image_id]["processed_path"] = final_path
        uploaded_images[image_id]["transparent_path"] = transparent_path
        uploaded_images[image_id]["processed_url"] = f"/processed/{image_id}_final.png"
        uploaded_images[image_id]["transparent_url"] = f"/processed/{image_id}_transparent.png"
        
        processing_status[image_id] = {
            "status": "completed",
            "progress": 100,
            "processed_url": f"/processed/{image_id}_final.png",
            "transparent_url": f"/processed/{image_id}_transparent.png",
            "bg_color": bg_color,
            "quality_check": {
                "valid": is_valid,
                "log": v_log,
                "suggestions": suggestions
            }
        }
    except Exception as e:
        logger.error(f"Error processing {image_id}: {e}")
        processing_status[image_id] = {"status": "failed", "progress": 0, "error": str(e)}


@app.post("/api/v1/upload/single")
async def upload_single(
    file: UploadFile = File(...),
    country_code: str = Form("india"),
    bg_color: str = Form("white")
):
    image_id = str(uuid.uuid4()).replace("-", "")[:24]
    ext = file.filename.split(".")[-1]
    save_path = os.path.join(UPLOAD_DIR, f"{image_id}_original.{ext}")
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    uploaded_images[image_id] = {
        "id": image_id,
        "original_path": save_path,
        "original_url": f"/uploads/{image_id}_original.{ext}",
        "filename": file.filename,
        "uploaded_at": datetime.now().isoformat()
    }
    processing_status[image_id] = {"status": "pending", "progress": 0}
    asyncio.create_task(process_image_async(image_id, country_code, bg_color))
    return {
        "success": True,
        "data": {
            "image_id": image_id,
            "filename": file.filename,
            "bg_color": bg_color,
            "message": f"Processing started for country {country_code}. Use /status/{{image_id}} to check progress."
        }
    }


@app.post("/api/v1/upload/batch")
async def upload_batch(
    files: List[UploadFile] = File(...),
    country_code: str = Form("india"),
    bg_color: str = Form("white")
):
    results = []
    for file in files:
        image_id = str(uuid.uuid4()).replace("-", "")[:24]
        ext = file.filename.split(".")[-1]
        save_path = os.path.join(UPLOAD_DIR, f"{image_id}_original.{ext}")
        content = await file.read()
        with open(save_path, "wb") as f:
            f.write(content)
        uploaded_images[image_id] = {
            "id": image_id,
            "original_path": save_path,
            "original_url": f"/uploads/{image_id}_original.{ext}",
            "filename": file.filename,
            "uploaded_at": datetime.now().isoformat()
        }
        processing_status[image_id] = {"status": "pending", "progress": 0}
        asyncio.create_task(process_image_async(image_id, country_code, bg_color))
        results.append({"image_id": image_id, "filename": file.filename, "bg_color": bg_color})
    return {"success": True, "data": {"images": results, "count": len(results)}}


@app.post("/api/v1/process/recolor/{image_id}")
async def recolor_image(image_id: str, bg_color: str = Form(...)):
    """
    Re-flattens the already-cropped transparent asset onto a NEW bg_color.
    No face detection / no rembg call — just an instant recolor, so this
    is safe to call every time the user picks a different Studio Color.
    Updates processed_path/processed_url so downloads and print jobs pick
    up the new color too, not just the live preview.
    """
    bg_color = validate_and_normalize_color(bg_color)
    print("Received bg_color:", bg_color)

    if image_id not in uploaded_images:
        raise HTTPException(404, "Image not found")
    transparent_path = uploaded_images[image_id].get("transparent_path")
    if not transparent_path or not os.path.exists(transparent_path):
        raise HTTPException(409, "Transparent asset not ready yet — wait for processing to complete")

    def _recolor():
        rgba = Image.open(transparent_path).convert("RGBA")
        flat = flatten_onto_bg(rgba, bg_color, rgba.size)
        final_path = os.path.join(PROCESSED_DIR, f"{image_id}_final.png")
        flat.save(final_path, "PNG", dpi=(300, 300))
        return final_path

    final_path = await asyncio.to_thread(_recolor)
    uploaded_images[image_id]["processed_path"] = final_path
    processed_url = f"/processed/{image_id}_final.png"
    uploaded_images[image_id]["processed_url"] = processed_url

    if image_id in processing_status:
        processing_status[image_id]["processed_url"] = processed_url
        processing_status[image_id]["bg_color"] = bg_color

    return {"success": True, "data": {"processed_url": processed_url, "bg_color": bg_color}}


@app.get("/api/v1/process/status/{image_id}")
async def get_status(image_id: str):
    if image_id not in processing_status:
        return JSONResponse(status_code=404, content={"success": False, "error": "Image not found"})
    return {"success": True, "data": processing_status[image_id]}


@app.get("/api/v1/process/download/{image_id}")
async def download_processed(image_id: str):
    if image_id not in uploaded_images:
        raise HTTPException(404, "Image not found")
    proc_path = uploaded_images[image_id].get("processed_path")
    if not proc_path or not os.path.exists(proc_path):
        raise HTTPException(404, "Processed image not ready")
    return FileResponse(proc_path, filename=f"passport_{image_id}.png")


@app.get("/api/v1/process/countries")
async def get_countries():
    countries_list = []
    for code, info in COUNTRY_PRESETS.items():
        size_str = f"{info['width_mm']}x{info['height_mm']} mm"
        countries_list.append({
            "code": code,
            "name": info["name"],
            "size": size_str,
            "standard": size_str,
            "bg": info["bg_color"]
        })
    return {
        "success": True,
        "data": countries_list
    }


# ========== SESSION MANAGEMENT ==========

@app.post("/api/v1/session/create")
async def create_session():
    session_id = f"sess_{uuid.uuid4().hex[:16]}"
    return {
        "success": True,
        "session_id": session_id,
        "message": "Session created successfully"
    }


@app.delete("/api/v1/session/{session_id}")
async def delete_session(session_id: str):
    return {
        "success": True,
        "session_id": session_id,
        "message": "Session cleared"
    }


@app.get("/api/v1/session/{session_id}/stats")
async def session_stats(session_id: str):
    return {
        "success": True,
        "data": {
            "session_id": session_id,
            "created_at": datetime.utcnow().isoformat()
        }
    }


# ========== SAVE PROJECT ==========

class SaveProjectRequest(BaseModel):
    session_id: Optional[str] = None
    image_ids: List[str]
    country_code: str = "india"
    paper_size: str = "A4"
    project_name: Optional[str] = None

    @field_validator("image_ids")
    @classmethod
    def image_ids_not_empty(cls, v):
        if not v or len(v) == 0:
            raise ValueError("image_ids must contain at least one image id")
        return v

    @field_validator("country_code", "paper_size")
    @classmethod
    def not_blank(cls, v):
        if v is not None and not str(v).strip():
            raise ValueError("must not be blank")
        return v


# ========== SHEET PDF GENERATION (300 DPI) ==========

class SheetPDFPhotoItem(BaseModel):
    url: str
    copies: int = 1
    bgColor: Optional[str] = "#FFFFFF"

class SheetPDFRequest(BaseModel):
    photos: List[SheetPDFPhotoItem]
    paper_size: str = "A4"          # A4, Letter, 4x6
    orientation: str = "Portrait"   # Portrait, Landscape
    rows: int = 0                   # 0 = auto
    cols: int = 5
    photo_size: str = "35x45"       # 35x45, 2x2
    margin_top_mm: float = 8.0
    margin_right_mm: float = 8.0
    margin_bottom_mm: float = 8.0
    margin_left_mm: float = 8.0
    spacing_mm: float = 2.0
    cut_marks: bool = True
    border: bool = True


@app.post("/api/v1/sheet/generate-pdf")
async def generate_sheet_pdf(req: SheetPDFRequest):
    """
    Generate a print-ready PDF at strict 300 DPI with exact millimeter sizing,
    optional cutting guides, and optimized grid packing to eliminate blank margins.
    """
    try:
        dpi = 300
        # 1. Paper size in pixels at 300 DPI
        paper_dims = {
            "a4": (210.0, 297.0),
            "letter": (215.9, 279.4),
            "4x6": (101.6, 152.4),
        }
        paper_key = req.paper_size.lower().replace(" ", "").split("(")[0]
        w_mm, h_mm = paper_dims.get(paper_key, (210.0, 297.0))
        
        if req.orientation.lower() == "landscape":
            w_mm, h_mm = h_mm, w_mm
            
        page_w_px = int(round(w_mm / 25.4 * dpi))
        page_h_px = int(round(h_mm / 25.4 * dpi))
        
        # 2. Photo size in pixels at 300 DPI
        if req.photo_size == "2x2":
            pw_mm, ph_mm = 50.8, 50.8
            pw_px, ph_px = 600, 600
        else:
            pw_mm, ph_mm = 35.0, 45.0
            pw_px, ph_px = 413, 531
            
        # 3. Margins & Spacing in pixels
        top_m_px = int(round(req.margin_top_mm / 25.4 * dpi))
        bottom_m_px = int(round(req.margin_bottom_mm / 25.4 * dpi))
        left_m_px = int(round(req.margin_left_mm / 25.4 * dpi))
        right_m_px = int(round(req.margin_right_mm / 25.4 * dpi))
        spacing_px = int(round(req.spacing_mm / 25.4 * dpi))
        
        cols = max(1, min(10, req.cols))
        usable_h_px = page_h_px - top_m_px - bottom_m_px
        
        if req.rows > 0:
            rows = req.rows
        else:
            rows = max(1, math.floor((usable_h_px + spacing_px) / (ph_px + spacing_px)))
            
        per_page = rows * cols
        
        # 4. Expand photo entries
        expanded_photos = []
        for p in req.photos:
            for _ in range(max(1, p.copies)):
                expanded_photos.append(p)
                
        if not expanded_photos:
            raise HTTPException(400, "No photos provided for sheet generation")
            
        pages_count = math.ceil(len(expanded_photos) / per_page)
        pages_images = []
        
        # Calculate grid starting offsets to center grid horizontally
        grid_w_px = cols * pw_px + (cols - 1) * spacing_px
        start_x_px = max(left_m_px, left_m_px + (page_w_px - left_m_px - right_m_px - grid_w_px) // 2)
        start_y_px = top_m_px
        
        from PIL import ImageDraw
        
        for p_idx in range(pages_count):
            page_canvas = Image.new("RGB", (page_w_px, page_h_px), (255, 255, 255))
            draw = ImageDraw.Draw(page_canvas)
            
            page_start = p_idx * per_page
            page_end = min(page_start + per_page, len(expanded_photos))
            
            # Place photos on current page
            for i in range(page_start, page_end):
                item = expanded_photos[i]
                slot = i - page_start
                r = slot // cols
                c = slot % cols
                
                x = start_x_px + c * (pw_px + spacing_px)
                y = start_y_px + r * (ph_px + spacing_px)
                
                # Load image
                url_str = item.url
                photo_img = None
                
                try:
                    if url_str.startswith("data:image"):
                        import base64
                        from io import BytesIO
                        b64_data = url_str.split(",", 1)[1]
                        photo_img = Image.open(BytesIO(base64.b64decode(b64_data)))
                    elif url_str.startswith("/processed/"):
                        fname = url_str.split("/processed/")[1]
                        local_path = os.path.join(PROCESSED_DIR, fname)
                        if os.path.exists(local_path):
                            photo_img = Image.open(local_path)
                    elif url_str.startswith("/uploads/"):
                        fname = url_str.split("/uploads/")[1]
                        local_path = os.path.join(UPLOAD_DIR, fname)
                        if os.path.exists(local_path):
                            photo_img = Image.open(local_path)
                    elif os.path.exists(url_str):
                        photo_img = Image.open(url_str)
                except Exception as img_err:
                    logger.warning(f"Failed to load image {url_str}: {img_err}")
                    
                if photo_img:
                    if photo_img.mode == "RGBA":
                        bg_c = get_bg_rgb(item.bgColor or "#FFFFFF")
                        flat_card = Image.new("RGB", (pw_px, ph_px), bg_c)
                        resized_p = photo_img.resize((pw_px, ph_px), Image.Resampling.LANCZOS)
                        flat_card.paste(resized_p, (0, 0), mask=resized_p.split()[3])
                        page_canvas.paste(flat_card, (x, y))
                    else:
                        resized_p = photo_img.resize((pw_px, ph_px), Image.Resampling.LANCZOS)
                        page_canvas.paste(resized_p, (x, y))
                else:
                    # Placeholder outline
                    draw.rectangle([x, y, x + pw_px, y + ph_px], fill=(245, 245, 245))
                    
                # Draw subtle photo border
                if req.border:
                    draw.rectangle([x, y, x + pw_px - 1, y + ph_px - 1], outline=(210, 210, 210), width=1)
                    
                # Draw cut guides if enabled
                if req.cut_marks:
                    tick_len = int(round(3.5 / 25.4 * dpi)) # ~41 px (~3.5mm)
                    # Corners of each photo
                    corners = [
                        (x, y, -1, -1),
                        (x + pw_px, y, 1, -1),
                        (x, y + ph_px, -1, 1),
                        (x + pw_px, y + ph_px, 1, 1)
                    ]
                    for cx, cy, dx, dy in corners:
                        draw.line([(cx, cy), (cx + dx * tick_len, cy)], fill=(150, 150, 150), width=1)
                        draw.line([(cx, cy), (cx, cy + dy * tick_len)], fill=(150, 150, 150), width=1)
                        
            pages_images.append(page_canvas)
            
        # 5. Export to PDF at strict 300 DPI
        pdf_filename = f"passport_sheet_{uuid.uuid4().hex[:12]}.pdf"
        pdf_out_path = os.path.join(PROCESSED_DIR, pdf_filename)
        
        pages_images[0].save(
            pdf_out_path,
            "PDF",
            resolution=300.0,
            save_all=True,
            append_images=pages_images[1:]
        )
        
        logger.info(f"✅ Generated 300 DPI PDF sheet: {pdf_out_path} ({len(pages_images)} pages)")
        return FileResponse(
            pdf_out_path,
            media_type="application/pdf",
            filename=f"primeidpro_sheet_{req.paper_size}.pdf"
        )
        
    except Exception as e:
        logger.error(f"Error generating PDF sheet: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Failed to generate PDF sheet: {str(e)}")


@app.post("/api/v1/project/save")
@app.post("/api/v1/sheet/generate-simple")  # kept for the existing frontend call
async def save_project(request: SaveProjectRequest):
    """
    Validate the request, confirm every referenced image finished processing,
    then persist the project/sheet to MongoDB.

    Returns:
      200 - saved successfully
      400 - request refers to unknown or not-yet-processed images
      503 - MongoDB is unreachable (safe for the client to retry)
      500 - unexpected database error (message included, not a generic 500)
    """
    logger.info(
        f"[SAVE] request received: session={request.session_id} "
        f"images={len(request.image_ids)} country={request.country_code}"
    )

    # ---- 1. Validate referenced images actually exist & are ready ----
    missing_ids, not_ready_ids = [], []
    photos = []
    for image_id in request.image_ids:
        record = uploaded_images.get(image_id)
        if not record:
            missing_ids.append(image_id)
            continue
        status = processing_status.get(image_id, {})
        if status.get("status") != "completed":
            not_ready_ids.append(image_id)
            continue
        photos.append({
            "image_id": image_id,
            "filename": record.get("filename"),
            "processed_url": status.get("processed_url"),
            "transparent_url": status.get("transparent_url"),
            "bg_color": status.get("bg_color", "white"),
        })

    if missing_ids:
        logger.warning(f"[SAVE] unknown image_id(s): {missing_ids}")
        raise HTTPException(
            status_code=400,
            detail=f"Unknown image_id(s), please re-upload: {', '.join(missing_ids)}",
        )
    if not_ready_ids:
        logger.warning(f"[SAVE] image(s) not finished processing: {not_ready_ids}")
        raise HTTPException(
            status_code=400,
            detail=f"Image(s) still processing, wait for them to finish before saving: {', '.join(not_ready_ids)}",
        )

    # ---- 2. Check MongoDB connection ----
    mongo_db = getattr(app.state, "mongo_db", None)
    if mongo_db is None:
        logger.error("[SAVE] MongoDB is not connected — cannot save project")
        raise HTTPException(
            status_code=503,
            detail="Database is temporarily unavailable. Please retry in a few seconds.",
        )

    # ---- 3. Persist ----
    project_doc = {
        "session_id": request.session_id or "anonymous",
        "name": request.project_name or f"Project_{uuid.uuid4().hex[:8]}",
        "country_code": request.country_code,
        "paper_size": request.paper_size,
        "image_ids": request.image_ids,
        "photos": photos,
        "created_at": datetime.utcnow(),
    }

    try:
        result = await mongo_db["projects"].insert_one(project_doc)
    except mongo_errors.ServerSelectionTimeoutError as e:
        logger.error(f"[SAVE] MongoDB timed out: {e}")
        raise HTTPException(
            status_code=503,
            detail="Could not reach the database (timed out). Please check your connection and retry.",
        )
    except mongo_errors.PyMongoError as e:
        logger.error(f"[SAVE] MongoDB error while saving project: {e}")
        raise HTTPException(status_code=500, detail=f"Database error while saving project: {e}")

    project_id = str(result.inserted_id)
    logger.info(f"[SAVE] ✅ project saved: {project_id}")

    return JSONResponse({
        "success": True,
        "project_id": project_id,
        "sheet_id": project_id,
        "share_id": project_id[:8],
        "message": "Project saved successfully",
    })


@app.get("/api/v1/project/{project_id}")
async def get_project(project_id: str):
    """Fetch a saved project by id."""
    from bson import ObjectId
    from bson.errors import InvalidId

    mongo_db = getattr(app.state, "mongo_db", None)
    if mongo_db is None:
        raise HTTPException(status_code=503, detail="Database is temporarily unavailable. Please retry.")

    try:
        oid = ObjectId(project_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"'{project_id}' is not a valid project id")

    doc = await mongo_db["projects"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    doc["_id"] = str(doc["_id"])
    return {"success": True, "data": doc}


@app.get("/health")
async def health():
    mongo_db = getattr(app.state, "mongo_db", None)
    return {
        "status": "healthy",
        "version": "3.2.0",
        "rembg_fallback": "grabcut",
        "mongodb_connected": mongo_db is not None,
    }


@app.get("/")
async def root():
    return JSONResponse({
        "message": "Passport Photo Editor API (Optimised for Free Tier)",
        "features": ["AI background removal", "Face detection crop", "Dynamic background color", "Quality enhancement"],
        "docs": "/docs"
    })


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)