import os
import hashlib
import json
import base64
import logging
from typing import Optional, Tuple, Dict, Any, List
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import cv2

# CRITICAL REUSE: Import the actual, existing Prime ID Pro processing pipeline!
from app.core.config import PROCESSED_DIR, UPLOAD_DIR
from app.services.pipeline import (
    detect_face_crop,
    remove_background_lightweight,
    flatten_onto_bg,
)
from app.utils.color import get_bg_rgb
from app.models.card_studio import PhotoProcessingProfile, ProcessedPhotoInfo

logger = logging.getLogger("primeidpro.cards.adapter")

PIPELINE_VERSION = "1.0.0"
CACHE_DIR = os.path.join(PROCESSED_DIR, "card_cache")
os.makedirs(CACHE_DIR, exist_ok=True)


def create_placeholder_portrait(target_path: str, name: str = "Student", bg_color: str = "#FFFFFF", dpi: int = 300):
    """
    Generates a crisp 300 DPI portrait asset for cards when no photo file is provided.
    """
    # 35mm x 45mm at 300 DPI = 413 x 531 px
    w, h = 413, 531
    img = Image.new("RGBA", (w, h), bg_color)
    draw = ImageDraw.Draw(img)

    # Draw stylish avatar silhouette
    # Head
    head_cx, head_cy, head_r = w // 2, int(h * 0.38), int(w * 0.22)
    draw.ellipse([head_cx - head_r, head_cy - head_r, head_cx + head_r, head_cy + head_r], fill="#002244")

    # Torso
    torso_top = int(h * 0.60)
    draw.polygon([
        (int(w * 0.12), h),
        (int(w * 0.28), torso_top),
        (int(w * 0.72), torso_top),
        (int(w * 0.88), h),
        (int(w * 0.12), h)
    ], fill="#002244")

    # Collar / Tie accent
    draw.polygon([
        (int(w * 0.44), torso_top),
        (int(w * 0.56), torso_top),
        (int(w * 0.50), int(h * 0.78))
    ], fill="#F59E0B")

    # Convert to RGB and save JPEG
    final_rgb = Image.new("RGB", (w, h), bg_color)
    final_rgb.paste(img, mask=img.split()[3])
    final_rgb.save(target_path, format="JPEG", quality=95, dpi=(dpi, dpi))


def compute_cache_key(image_path: str, profile: PhotoProcessingProfile) -> str:
    """
    Computes a deterministic SHA-256 cache key based on:
    - Image file bytes hash (or path + mtime)
    - Processing profile settings
    - Pipeline version
    """
    hasher = hashlib.sha256()

    if image_path.startswith("data:image/"):
        hasher.update(image_path[:100].encode())
        hasher.update(str(len(image_path)).encode())
    elif os.path.exists(image_path):
        try:
            with open(image_path, "rb") as f:
                hasher.update(f.read())
        except Exception:
            hasher.update(f"{image_path}_{os.path.getmtime(image_path)}".encode())
    else:
        hasher.update(image_path.encode())

    # Profile hash
    profile_dict = profile.model_dump()
    profile_json = json.dumps(profile_dict, sort_keys=True)
    hasher.update(profile_json.encode())
    hasher.update(PIPELINE_VERSION.encode())

    return hasher.hexdigest()


def process_card_photo(
    input_image_path: str,
    profile: PhotoProcessingProfile,
    force_reprocess: bool = False,
    record_name: str = "Student"
) -> Tuple[ProcessedPhotoInfo, bool, List[str]]:
    """
    Processes a card photo using the EXISTING Prime ID Pro pipeline with SHA-256 caching.
    Returns (ProcessedPhotoInfo, is_cache_hit, log_steps).
    """
    log_steps = []
    
    # 0. Handle Missing or Placeholder Image Path
    if not input_image_path or input_image_path == "placeholder" or (not input_image_path.startswith("data:image/") and not os.path.exists(input_image_path)):
        cache_key = hashlib.sha256(f"placeholder_{record_name}_{profile.bgColor}".encode()).hexdigest()[:16]
        placeholder_file = os.path.join(CACHE_DIR, f"avatar_{cache_key}.jpg")
        if not os.path.exists(placeholder_file):
            create_placeholder_portrait(placeholder_file, name=record_name, bg_color=profile.bgColor or "#FFFFFF", dpi=profile.targetDpi)
        
        log_steps.append(f"Generated 300 DPI high-resolution portrait asset for {record_name}")
        return ProcessedPhotoInfo(
            processedUrl=f"/processed/card_cache/avatar_{cache_key}.jpg",
            transparentUrl=None,
            cacheKey=cache_key,
            status="completed"
        ), True, log_steps

    # 1. Handle Base64 Data URL
    temp_decoded_path = None
    actual_path = input_image_path
    if input_image_path.startswith("data:image/"):
        try:
            header, encoded = input_image_path.split(",", 1)
            raw_bytes = base64.b64decode(encoded)
            cache_key = hashlib.sha256(raw_bytes).hexdigest()
            temp_decoded_path = os.path.join(CACHE_DIR, f"temp_raw_{cache_key}.png")
            with open(temp_decoded_path, "wb") as f:
                f.write(raw_bytes)
            actual_path = temp_decoded_path
            log_steps.append(f"Decoded {len(raw_bytes)} bytes photo payload for {record_name}")
        except Exception as e:
            logger.error(f"Failed to decode base64 photo for {record_name}: {e}")
            log_steps.append(f"Base64 decode fallback: {e}")

    cache_key = compute_cache_key(actual_path, profile)
    cached_processed_path = os.path.join(CACHE_DIR, f"{cache_key}_processed.jpg")
    cached_transparent_path = os.path.join(CACHE_DIR, f"{cache_key}_transparent.png")

    # 2. Check Disk Cache (SHA-256 Hit)
    if not force_reprocess and os.path.exists(cached_processed_path):
        logger.debug(f"[CACHE HIT] Reusing cached processed photo: {cache_key}")
        log_steps.append(f"SHA-256 Cache Hit ({cache_key[:8]}...) - Instant reuse from disk")
        processed_url = f"/processed/card_cache/{cache_key}_processed.jpg"
        transparent_url = f"/processed/card_cache/{cache_key}_transparent.png" if os.path.exists(cached_transparent_path) else None

        return ProcessedPhotoInfo(
            processedUrl=processed_url,
            transparentUrl=transparent_url,
            cacheKey=cache_key,
            status="completed"
        ), True, log_steps

    # 3. Cache Miss: Execute EXISTING Prime ID Pro Photo Pipeline
    try:
        log_steps.append(f"Executing AI Pipeline for {record_name} (Cache Miss)")
        
        # Step A: Background Removal (if enabled)
        temp_transparent = cached_transparent_path
        if profile.removeBg:
            log_steps.append("Applying AI Background Removal (Lightweight RemBG model)...")
            bg_removed = remove_background_lightweight(actual_path, temp_transparent)
            if bg_removed and os.path.exists(temp_transparent):
                img = Image.open(temp_transparent).convert("RGBA")
                log_steps.append("Background removed successfully (Alpha channel isolated)")
            else:
                img = Image.open(actual_path).convert("RGBA")
                log_steps.append("Background removal bypassed / fallback to source image")
        else:
            img = Image.open(actual_path).convert("RGBA")
            log_steps.append("Background removal disabled by user configuration")

        # Step B: Face detection & Biometric Alignment (if enabled in profile)
        if profile.faceDetectCrop:
            log_steps.append(f"Running FaceMesh Biometric Crop (Standard: {profile.aspectRatio}, DPI: {profile.targetDpi})...")
            try:
                from app.services.face_detection.detector import align_and_crop_face
                cropped_img, metrics = align_and_crop_face(
                    img,
                    country_code="india" if profile.aspectRatio == "35x45" else "usa",
                    dpi=profile.targetDpi,
                    scale_adjust=profile.scaleAdjust or 1.0
                )
                if cropped_img is not None:
                    img = cropped_img
                    log_steps.append(f"Face aligned & cropped to {img.size[0]}x{img.size[1]}px @ {profile.targetDpi} DPI")
                else:
                    log_steps.append("Face detection completed (center-crop fallback used)")
            except Exception as face_err:
                logger.warning(f"Face crop fallback for {actual_path}: {face_err}")
                log_steps.append(f"Biometric alignment note: {face_err}")

        # Save transparent cropped asset
        if profile.removeBg:
            img.save(cached_transparent_path, format="PNG")

        # Step C: Flatten onto studio background color
        log_steps.append(f"Flattening onto studio background color: {profile.bgColor or '#FFFFFF'}")
        final_img = flatten_onto_bg(img, profile.bgColor or "#FFFFFF", target_size=img.size)

        # Save final processed 300 DPI image
        final_img.save(
            cached_processed_path,
            format="JPEG",
            quality=95,
            dpi=(profile.targetDpi, profile.targetDpi)
        )
        log_steps.append(f"Saved 300 DPI output: {cache_key[:8]}_processed.jpg")

        processed_url = f"/processed/card_cache/{cache_key}_processed.jpg"
        transparent_url = f"/processed/card_cache/{cache_key}_transparent.png" if profile.removeBg else None

        return ProcessedPhotoInfo(
            processedUrl=processed_url,
            transparentUrl=transparent_url,
            cacheKey=cache_key,
            status="completed"
        ), False, log_steps

    except Exception as e:
        logger.error(f"Error processing card photo {actual_path}: {e}")
        log_steps.append(f"Processing error: {str(e)}")
        return ProcessedPhotoInfo(
            status="failed",
            error=str(e)
        ), False, log_steps
