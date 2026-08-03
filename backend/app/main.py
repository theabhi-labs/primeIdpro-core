import os
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
    Remove background using rembg (AI) or GrabCut with minimal post‑processing.
    Preserves clothes and body edges as much as possible.
    """
    # -------- 1. rembg with u2net and u2netp --------
    rembg_success = False
    for model_name in ['u2net', 'u2netp']:
        try:
            from rembg import remove, new_session
            session = new_session(model_name)
            with open(input_path, 'rb') as f:
                input_data = f.read()
            output_data = remove(input_data, session=session)
            with open(output_path, 'wb') as out:
                out.write(output_data)

            # Validate alpha (transparency)
            check = Image.open(output_path)
            if check.mode == "RGBA":
                alpha = np.array(check.split()[-1])
                if (alpha < 250).sum() > (alpha.size * 0.02):
                    rembg_success = True
                    print(f" rembg ({model_name}) worked")
                    break
            # if no alpha, try next model
        except Exception as e:
            print(f" rembg ({model_name}) failed: {e}")
            continue

    # -------- 2. If rembg failed, use GrabCut with face detection --------
    if not rembg_success:
        print(" Falling back to GrabCut with face detection")
        try:
            img_bgr = cv2.imread(input_path)
            if img_bgr is None:
                raise ValueError("Could not read image")
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
                # generous margins to include shoulders
                margin_top = int(fh * 0.4)
                margin_bottom = int(fh * 2.2)
                margin_side = int(fw * 0.7)
                rect_x = max(0, x - margin_side)
                rect_y = max(0, y - margin_top)
                rect_w = min(w - rect_x, fw + 2 * margin_side)
                rect_h = min(h - rect_y, fh + margin_top + margin_bottom)
                rect = (rect_x, rect_y, rect_w, rect_h)
            else:
                # fallback central rectangle
                margin = int(min(w, h) * 0.1)
                rect = (margin, margin, w - 2*margin, h - 2*margin)

            cv2.grabCut(img_bgr, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
            mask2 = np.where((mask == 2) | (mask == 0), 0, 1).astype("uint8")
            # slight blur to soften edges
            mask2 = cv2.GaussianBlur(mask2.astype(np.float32), (3, 3), 0)
            mask2 = (mask2 * 255).astype(np.uint8)
            img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
            rgba = np.dstack([img_rgb, mask2])
            Image.fromarray(rgba, mode="RGBA").save(output_path, "PNG")
        except Exception as e2:
            print(f" GrabCut failed: {e2}")
            # Last resort: simple white strip
            try:
                img = Image.open(input_path).convert("RGBA")
                np_img = np.array(img)
                r, g, b = np_img[:, :, 0], np_img[:, :, 1], np_img[:, :, 2]
                mask = (r > 220) & (g > 220) & (b > 220)
                np_img[:, :, 3] = np.where(mask, 0, 255)
                Image.fromarray(np_img, mode="RGBA").save(output_path, "PNG")
                return True
            except Exception:
                return False

    # -------- 3. Minimal edge refinement (no erosion/dilation) --------
    try:
        img = Image.open(output_path).convert("RGBA")
        rgba_np = np.array(img)
        r, g, b, a = rgba_np[:, :, 0], rgba_np[:, :, 1], rgba_np[:, :, 2], rgba_np[:, :, 3]

        # only slight Gaussian blur to smooth jagged edges (radius 1.5)
        alpha_np = a.astype(np.float32)
        alpha_np = cv2.GaussianBlur(alpha_np, (3, 3), 1.5)
        alpha_np = alpha_np.astype(np.uint8)

        # Anti-shadow: blend semi-transparent pixels towards white
        alpha_float = alpha_np.astype(np.float32) / 255.0
        r = (r.astype(np.float32) * alpha_float + 255.0 * (1.0 - alpha_float)).astype(np.uint8)
        g = (g.astype(np.float32) * alpha_float + 255.0 * (1.0 - alpha_float)).astype(np.uint8)
        b = (b.astype(np.float32) * alpha_float + 255.0 * (1.0 - alpha_float)).astype(np.uint8)

        final_rgba = np.stack([r, g, b, alpha_np], axis=2)
        final_img = Image.fromarray(final_rgba, mode="RGBA")
        final_img.save(output_path, "PNG")
        print(" Minimal refinement applied")
        return True

    except Exception as e:
        print(f" Refinement error, but image exists: {e}")
        return True


# ========== COUNTRY PRESETS & CROP ENGINE ==========

COUNTRY_PRESETS = {
    "india": {
        "name": "India",
        "width_mm": 35,
        "height_mm": 45,
        "head_height_ratio_min": 0.70,
        "head_height_ratio_max": 0.80,
        "eye_level_ratio_min": 0.55,
        "eye_level_ratio_max": 0.60,
        "bg_color": "white",
        "min_dpi": 300,
    },
    "usa": {
        "name": "USA",
        "width_mm": 50.8,
        "height_mm": 50.8,
        "head_height_ratio_min": 0.50,
        "head_height_ratio_max": 0.69,
        "eye_level_ratio_min": 0.56,
        "eye_level_ratio_max": 0.69,
        "bg_color": "white",
        "min_dpi": 300,
    },
    "uk": {
        "name": "United Kingdom",
        "width_mm": 35,
        "height_mm": 45,
        "head_height_ratio_min": 0.65,
        "head_height_ratio_max": 0.75,
        "eye_level_ratio_min": 0.55,
        "eye_level_ratio_max": 0.60,
        "bg_color": "light grey",
        "min_dpi": 300,
    },
    "canada": {
        "name": "Canada",
        "width_mm": 50,
        "height_mm": 70,
        "head_height_ratio_min": 0.44,
        "head_height_ratio_max": 0.52,
        "eye_level_ratio_min": 0.50,
        "eye_level_ratio_max": 0.60,
        "bg_color": "white",
        "min_dpi": 300,
    },
    "australia": {
        "name": "Australia",
        "width_mm": 35,
        "height_mm": 45,
        "head_height_ratio_min": 0.71,
        "head_height_ratio_max": 0.80,
        "eye_level_ratio_min": 0.55,
        "eye_level_ratio_max": 0.60,
        "bg_color": "light grey",
        "min_dpi": 300,
    },
    "germany": {
        "name": "Germany",
        "width_mm": 35,
        "height_mm": 45,
        "head_height_ratio_min": 0.70,
        "head_height_ratio_max": 0.80,
        "eye_level_ratio_min": 0.55,
        "eye_level_ratio_max": 0.60,
        "bg_color": "light grey",
        "min_dpi": 300,
    },
    "france": {
        "name": "France",
        "width_mm": 35,
        "height_mm": 45,
        "head_height_ratio_min": 0.70,
        "head_height_ratio_max": 0.80,
        "eye_level_ratio_min": 0.55,
        "eye_level_ratio_max": 0.60,
        "bg_color": "light grey",
        "min_dpi": 300,
    },
    "new_zealand": {
        "name": "New Zealand",
        "width_mm": 35,
        "height_mm": 45,
        "head_height_ratio_min": 0.70,
        "head_height_ratio_max": 0.80,
        "eye_level_ratio_min": 0.55,
        "eye_level_ratio_max": 0.60,
        "bg_color": "light grey",
        "min_dpi": 300,
    },
    "singapore": {
        "name": "Singapore",
        "width_mm": 35,
        "height_mm": 45,
        "head_height_ratio_min": 0.70,
        "head_height_ratio_max": 0.80,
        "eye_level_ratio_min": 0.55,
        "eye_level_ratio_max": 0.60,
        "bg_color": "white",
        "min_dpi": 300,
    },
    "uae": {
        "name": "UAE",
        "width_mm": 35,
        "height_mm": 45,
        "head_height_ratio_min": 0.70,
        "head_height_ratio_max": 0.80,
        "eye_level_ratio_min": 0.55,
        "eye_level_ratio_max": 0.60,
        "bg_color": "white",
        "min_dpi": 300,
    }
}


def align_and_crop_face(rgba_img: Image.Image, country_code: str, dpi: int = 300, scale_adjust: float = 1.0, center_shift: tuple = (0.0, 0.0)):
    """
    Precision cropping and alignment using MediaPipe FaceMesh landmarks.
    Automatically aligns eye centers horizontally, normalizes head size,
    and applies padding.
    """
    img_np = np.array(rgba_img)
    if img_np.shape[2] == 4:
        img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR)
        alpha = img_np[:, :, 3]
    else:
        img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        alpha = np.ones(img_np.shape[:2], dtype=np.uint8) * 255
        
    h, w = img_bgr.shape[:2]
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    
    face_mesh = getattr(app.state, "mp_face_mesh", None)
    if face_mesh is None:
        logger.warning("FaceMesh not initialized, falling back to Haar Cascade")
        return align_crop_cascade_fallback(img_np, country_code, dpi)
        
    results = face_mesh.process(img_rgb)
    
    if not results.multi_face_landmarks:
        logger.warning("No face landmarks detected, falling back to Haar Cascade")
        return align_crop_cascade_fallback(img_np, country_code, dpi)
        
    if len(results.multi_face_landmarks) > 1:
        raise ValueError("Multiple faces detected. Please ensure only one person is in the photo.")
        
    face_landmarks = results.multi_face_landmarks[0]
    num_landmarks = len(face_landmarks.landmark)
    
    # 1. Get eye centers
    if num_landmarks >= 478:
        p_right = face_landmarks.landmark[468] # viewer's left eye center
        p_left = face_landmarks.landmark[473]  # viewer's right eye center
    else:
        p_right_x = (face_landmarks.landmark[33].x + face_landmarks.landmark[133].x) / 2
        p_right_y = (face_landmarks.landmark[33].y + face_landmarks.landmark[133].y) / 2
        p_left_x = (face_landmarks.landmark[263].x + face_landmarks.landmark[362].x) / 2
        p_left_y = (face_landmarks.landmark[263].y + face_landmarks.landmark[362].y) / 2
        
        class Point:
            def __init__(self, x, y):
                self.x = x
                self.y = y
        p_right = Point(p_right_x, p_right_y)
        p_left = Point(p_left_x, p_left_y)
        
    right_eye = np.array([p_right.x * w, p_right.y * h])
    left_eye = np.array([p_left.x * w, p_left.y * h])
    
    chin = np.array([face_landmarks.landmark[152].x * w, face_landmarks.landmark[152].y * h])
    forehead = np.array([face_landmarks.landmark[10].x * w, face_landmarks.landmark[10].y * h])
    
    # 2. Alignment Angle
    dy = left_eye[1] - right_eye[1]
    dx = left_eye[0] - right_eye[0]
    angle_rad = np.arctan2(dy, dx)
    angle_deg = np.degrees(angle_rad)
    
    eye_mid = (right_eye + left_eye) / 2.0
    
    # Rotate landmarks to horizontal eye plane to compute exact vertical height
    cos_val = np.cos(-angle_rad)
    sin_val = np.sin(-angle_rad)
    
    def rotate_point(pt):
        rx = eye_mid[0] + (pt[0] - eye_mid[0]) * cos_val - (pt[1] - eye_mid[1]) * sin_val
        ry = eye_mid[1] + (pt[0] - eye_mid[0]) * sin_val + (pt[1] - eye_mid[1]) * cos_val
        return np.array([rx, ry])
        
    rotated_chin = rotate_point(chin)
    rotated_forehead = rotate_point(forehead)
    rotated_eye_mid = rotate_point(eye_mid)
    
    # 3. Calculate Head Height (chin to forehead * 1.35 for anatomical head top)
    face_mesh_height = rotated_chin[1] - rotated_forehead[1]
    estimated_head_height = face_mesh_height * 1.35
    
    # Optional silhouette verification for actual hair top
    rot_mat = cv2.getRotationMatrix2D(tuple(eye_mid), angle_deg, 1.0)
    rotated_alpha = cv2.warpAffine(alpha, rot_mat, (w, h), flags=cv2.INTER_NEAREST)
    
    col_start = max(0, int(rotated_eye_mid[0] - face_mesh_height * 0.5))
    col_end = min(w, int(rotated_eye_mid[0] + face_mesh_height * 0.5))
    y_indices, _ = np.where(rotated_alpha[:, col_start:col_end] > 127)
    
    if len(y_indices) > 0:
        actual_hair_top = np.min(y_indices)
        min_hair_y = rotated_chin[1] - face_mesh_height * 2.0
        max_hair_y = rotated_chin[1] - face_mesh_height * 1.15
        if min_hair_y <= actual_hair_top <= max_hair_y:
            estimated_head_height = rotated_chin[1] - actual_hair_top
            
    # 4. Sizing & Targeting
    preset = COUNTRY_PRESETS.get(country_code.lower(), COUNTRY_PRESETS["india"])
    width_mm = preset["width_mm"]
    height_mm = preset["height_mm"]
    
    W = int(width_mm / 25.4 * dpi)
    H = int(height_mm / 25.4 * dpi)
    
    target_head_ratio = (preset["head_height_ratio_min"] + preset["head_height_ratio_max"]) / 2.0
    target_eye_ratio = (preset["eye_level_ratio_min"] + preset["eye_level_ratio_max"]) / 2.0
    
    target_head_height_px = H * target_head_ratio
    target_eye_y_px = H * (1.0 - target_eye_ratio)
    
    # 5. Transform Matrix (combining scale, center shifts, and horizontal alignment)
    scale = (target_head_height_px / estimated_head_height) * scale_adjust
    
    dst_center = (W / 2.0 + center_shift[0] * W, target_eye_y_px + center_shift[1] * H)
    src_center = tuple(eye_mid)
    
    M = cv2.getRotationMatrix2D(src_center, angle_deg, scale)
    M[0, 2] += (dst_center[0] - src_center[0])
    M[1, 2] += (dst_center[1] - src_center[1])
    
    # 6. Apply warp affine with transparent padding
    warped_np = cv2.warpAffine(img_np, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    warped_rgba = Image.fromarray(warped_np, mode="RGBA")
    
    metrics = {
        "head_height_ratio": target_head_ratio,
        "eye_level_ratio": target_eye_ratio,
        "target_size_px": (W, H),
        "angle_deg": angle_deg,
        "face_mesh_height": face_mesh_height,
        "estimated_head_height": estimated_head_height,
        "scale": scale,
        "chin_pos": rotated_chin,
        "eye_mid_pos": rotated_eye_mid,
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
    face_cy = y + fh / 2.0
    estimated_head_height = fh * 1.30
    
    preset = COUNTRY_PRESETS.get(country_code.lower(), COUNTRY_PRESETS["india"])
    W = int(preset["width_mm"] / 25.4 * dpi)
    H = int(preset["height_mm"] / 25.4 * dpi)
    
    target_head_ratio = (preset["head_height_ratio_min"] + preset["head_height_ratio_max"]) / 2.0
    target_eye_ratio = (preset["eye_level_ratio_min"] + preset["eye_level_ratio_max"]) / 2.0
    
    target_head_height_px = H * target_head_ratio
    target_eye_y_px = H * (1.0 - target_eye_ratio)
    
    scale = target_head_height_px / estimated_head_height
    est_eye_y = y + fh * 0.45
    
    M = np.float32([
        [scale, 0, W / 2.0 - face_cx * scale],
        [0, scale, target_eye_y_px - est_eye_y * scale]
    ])
    
    warped_np = cv2.warpAffine(img_np, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    warped_rgba = Image.fromarray(warped_np, mode="RGBA")
    
    metrics = {
        "head_height_ratio": target_head_ratio,
        "eye_level_ratio": target_eye_ratio,
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
    W = int(preset["width_mm"] / 25.4 * dpi)
    H = int(preset["height_mm"] / 25.4 * dpi)
    
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
    warped_rgba = Image.fromarray(warped_np, mode="RGBA")
    
    metrics = {
        "head_height_ratio": 0.0,
        "eye_level_ratio": 0.0,
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
        # Blend decontaminated color into border regions based on alpha
        alpha_weight = (refined_alpha.astype(np.float32) / 255.0)[:, :, np.newaxis]
        final_bgr = (bgr.astype(np.float32) * alpha_weight + decontaminated_bgr.astype(np.float32) * (1.0 - alpha_weight)).astype(np.uint8)
    else:
        final_bgr = bgr
        
    # 3. Apply soft feathering to the alpha mask
    refined_alpha = cv2.GaussianBlur(refined_alpha, (3, 3), 0)
    
    final_rgba = np.dstack([cv2.cvtColor(final_bgr, cv2.COLOR_BGR2RGB), refined_alpha])
    return final_rgba


def enhance_image_quality(img_rgb):
    """
    Normalize brightness/contrast (CLAHE), white balance,
    apply bilateral filtering for skin smoothing, and mild unsharp masking.
    """
    img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
    
    # 1. Robust White Balance (Perfect Reflective Method)
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
            
            # Dampen scales (50%) to keep changes subtle and natural
            scale_b = 1.0 + (scale_b - 1.0) * 0.5
            scale_g = 1.0 + (scale_g - 1.0) * 0.5
            scale_r = 1.0 + (scale_r - 1.0) * 0.5
            
            b = np.clip(b * scale_b, 0, 255).astype(np.uint8)
            g = np.clip(g * scale_g, 0, 255).astype(np.uint8)
            r = np.clip(r * scale_r, 0, 255).astype(np.uint8)
            img_bgr = cv2.merge((b, g, r))
            
    # 2. CLAHE (LAB space illumination normalization)
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a_ch, b_ch = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=1.2, tileGridSize=(8, 8))
    cl = clahe.apply(l)
    l_final = cv2.addWeighted(l, 0.6, cl, 0.4, 0)
    img_bgr = cv2.merge((l_final, a_ch, b_ch))
    img_bgr = cv2.cvtColor(img_bgr, cv2.COLOR_LAB2BGR)
    
    # 3. Bilateral Filter Skin smoothing (reduces noise, preserves key edges)
    smoothed = cv2.bilateralFilter(img_bgr, d=5, sigmaColor=10, sigmaSpace=10)
    
    # 4. Sharpening via mild Unsharp Masking
    gaussian = cv2.GaussianBlur(smoothed, (0, 0), 1.5)
    sharpened = cv2.addWeighted(smoothed, 1.2, gaussian, -0.2, 0)
    
    return cv2.cvtColor(sharpened, cv2.COLOR_BGR2RGB)


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
    target_w = int(preset["width_mm"] / 25.4 * dpi)
    target_h = int(preset["height_mm"] / 25.4 * dpi)
    
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
            if pt[0] < 254 or pt[1] < 254 or pt[2] < 254:
                non_white += 1
        if non_white > 4:
            is_valid = False
            validation_log["background"] = "FAIL"
            suggestions.append("Non-white background or background shadows detected.")
        else:
            validation_log["background"] = "PASS"
            
    # 3. Facial Metrics Validation
    face_mesh = getattr(app.state, "mp_face_mesh", None)
    if face_mesh:
        img_rgb = cv2.cvtColor(cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR), cv2.COLOR_BGR2RGB)
        res = face_mesh.process(img_rgb)
        if not res.multi_face_landmarks:
            is_valid = False
            validation_log["face_detected"] = "FAIL"
            suggestions.append("Face verification failed: face not found in output.")
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
            if abs(angle) > 1.5:
                is_valid = False
                validation_log["tilt_compliance"] = "FAIL"
                suggestions.append("Face alignment issue: tilt angle exceeds 1.5 degrees.")
            else:
                validation_log["tilt_compliance"] = "PASS"
                
            # Face Center Check
            mid_x = (p_right.x + p_left.x) / 2.0
            horizontal_offset = abs(mid_x - 0.5)
            validation_log["centering"] = f"{horizontal_offset * 100:.1f}% offset"
            if horizontal_offset > 0.05:
                is_valid = False
                validation_log["center_compliance"] = "FAIL"
                suggestions.append("Face is horizontally off-center.")
            else:
                validation_log["center_compliance"] = "PASS"
                
            # Head Height Ratio Check
            p_chin = fl.landmark[152]
            p_forehead = fl.landmark[10]
            estimated_head = (p_chin.y - p_forehead.y) * 1.35
            validation_log["head_ratio"] = f"{estimated_head * 100:.1f}%"
            min_r = preset["head_height_ratio_min"]
            max_r = preset["head_height_ratio_max"]
            if estimated_head < (min_r - 0.04) or estimated_head > (max_r + 0.04):
                is_valid = False
                validation_log["scale_compliance"] = "FAIL"
                suggestions.append(f"Head height {estimated_head * 100:.1f}% is out of bounds ({min_r * 100:.0f}%-{max_r * 100:.0f}%).")
            else:
                validation_log["scale_compliance"] = "PASS"
                
            # Eyes closed check
            r_eye_h = abs(fl.landmark[159].y - fl.landmark[145].y)
            l_eye_h = abs(fl.landmark[386].y - fl.landmark[374].y)
            r_eye_w = abs(fl.landmark[133].x - fl.landmark[33].x)
            l_eye_w = abs(fl.landmark[263].x - fl.landmark[362].x)
            r_ratio = r_eye_h / r_eye_w if r_eye_w > 0 else 0
            l_ratio = l_eye_h / l_eye_w if l_eye_w > 0 else 0
            if r_ratio < 0.12 or l_ratio < 0.12:
                is_valid = False
                validation_log["eyes_closed"] = "FAIL"
                suggestions.append("Eyes appear closed or blink detected.")
            else:
                validation_log["eyes_closed"] = "PASS"
    else:
        validation_log["face_mesh"] = "NOT_AVAILABLE"
        
    # 4. Blur Check (Laplacian Variance)
    gray = cv2.cvtColor(cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR), cv2.COLOR_BGR2GRAY)
    blur_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    validation_log["sharpness"] = f"{blur_var:.1f}"
    if blur_var < 75.0:
        is_valid = False
        validation_log["sharpness_compliance"] = "FAIL"
        suggestions.append("Image is blurry. Please upload a sharper photo.")
    else:
        validation_log["sharpness_compliance"] = "PASS"
        
    return is_valid, validation_log, suggestions


def flatten_onto_bg(rgba_img: Image.Image, bg_color: str, target_size=(600, 750)) -> Image.Image:
    """Composite an already-cropped transparent image onto a flat studio color."""
    bg_rgb = get_bg_rgb(bg_color)
    flat = Image.new("RGB", target_size, bg_rgb)
    flat.paste(rgba_img, (0, 0), mask=rgba_img.split()[3])
    return flat


def detect_face_crop(image_path: str, output_path: str, transparent_output_path: str,
                      country_code: str = "india", bg_color: str = "white", dpi: int = 300):
    """
    Crop face with precise alignment, normalization and edge refinement.
    Saves transparent asset PNG and background-composited final PNG.
    Supports self-correction/regeneration.
    """
    pil_img = Image.open(image_path)
    rgba_img = pil_img.convert("RGBA") if pil_img.mode != "RGBA" else pil_img
    
    # Run crop and self-correct up to 2 times if needed
    scale_adj = 1.0
    shift = (0.0, 0.0)
    
    for attempt in range(3):
        transparent_crop, metrics = align_and_crop_face(rgba_img, country_code, dpi, scale_adj, shift)
        
        # Edge Matting and Anti-Halo
        refined_np = refine_edges_and_halo(np.array(transparent_crop))
        refined_rgba = Image.fromarray(refined_np, mode="RGBA")
        
        # Flatten on Background
        flat = flatten_onto_bg(refined_rgba, bg_color, refined_rgba.size)
        
        # Validate output quality
        is_valid, v_log, suggestions = verify_passport_quality(refined_rgba, country_code, dpi)
        
        # Self-correction logic
        if not is_valid and attempt < 2 and "cascade_fallback" not in metrics and "center_fallback" not in metrics:
            # Check if we can fix scale
            if v_log.get("scale_compliance") == "FAIL" and "head_ratio" in v_log:
                current_ratio = float(v_log["head_ratio"].replace("%", "")) / 100.0
                target_ratio = metrics["head_height_ratio"]
                if 0.2 < current_ratio < 1.5:
                    scale_adj *= (target_ratio / current_ratio)
            # Check if we can fix centering
            if v_log.get("center_compliance") == "FAIL" and "centering" in v_log:
                # shift center slightly
                fl = getattr(app.state, "mp_face_mesh", None)
                if fl:
                    # we shift by the centering offset
                    fl_results = fl.process(cv2.cvtColor(np.array(refined_rgba), cv2.COLOR_RGBA2RGB))
                    if fl_results.multi_face_landmarks:
                        landmarks = fl_results.multi_face_landmarks[0]
                        p_right = landmarks.landmark[33]
                        p_left = landmarks.landmark[263]
                        mid_x = (p_right.x + p_left.x) / 2.0
                        shift = (shift[0] - (mid_x - 0.5) * 0.5, shift[1])
            logger.info(f"Quality validation failed on attempt {attempt+1}. Adjusting parameters: scale_adj={scale_adj:.3f}, shift={shift}")
            continue
        else:
            break
            
    # Enhancement (natural adjustments)
    enhanced_np = enhance_image_quality(np.array(flat.convert("RGB")))
    enhanced_flat = Image.fromarray(enhanced_np, mode="RGB")
    
    # Save with embedded DPI metadata
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
        countries_list.append({
            "code": code,
            "name": info["name"],
            "size": f"{info['width_mm']}x{info['height_mm']} mm",
            "bg": info["bg_color"]
        })
    return {
        "success": True,
        "data": countries_list
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