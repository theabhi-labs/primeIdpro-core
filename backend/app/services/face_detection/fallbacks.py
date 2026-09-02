import logging
import cv2
import numpy as np
from PIL import Image
from app.services.resize.presets import COUNTRY_PRESETS

logger = logging.getLogger("primeidpro.face_fallbacks")


def center_crop_fallback(img_np: np.ndarray, country_code: str, dpi: int):
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
        "head_height_ratio": 0.58,
        "top_headroom_ratio": 0.12,
        "target_size_px": (W, H),
        "angle_deg": 0.0,
        "scale": scale,
        "center_fallback": True
    }
    return warped_rgba, metrics


def align_crop_cascade_fallback(img_np: np.ndarray, country_code: str, dpi: int, face_cascade=None, alt_cascade=None):
    """Fallback crop using Haar Cascade if FaceMesh fails."""
    h, w = img_np.shape[:2]
    if face_cascade is None or face_cascade.empty():
        return center_crop_fallback(img_np, country_code, dpi)

    gray = cv2.cvtColor(img_np, cv2.COLOR_RGBA2GRAY) if img_np.shape[2] == 4 else cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))

    if len(faces) == 0 and alt_cascade and not alt_cascade.empty():
        faces = alt_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))

    if len(faces) == 0:
        return center_crop_fallback(img_np, country_code, dpi)

    x, y, fw, fh = max(faces, key=lambda r: r[2] * r[3])
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
