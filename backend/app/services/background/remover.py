import os
import sys
import shutil
import logging
import threading
import time
from typing import Optional, Tuple, List, Dict, Any

import numpy as np
from PIL import Image, ImageOps, ImageFile

# Truncated / half-downloaded JPEGs recovery enabled
ImageFile.LOAD_TRUNCATED_IMAGES = True  # type: ignore[assignment]

logger = logging.getLogger("primeidpro.background")

_cached_rembg_sessions = {}
_rembg_lock = threading.Lock()

# Segmentation max longer side constraint for performance and memory sanity
MAX_SIDE = 2500

# Feature toggles
ENABLE_PERSON_ROI = True
ENABLE_EDGE_REFINE = True

# Quality Mode setting ("fast" | "balanced" | "hq")
# - "fast": u2net_human_seg only (+ Person-ROI)
# - "balanced" (default): u2net_human_seg, escalates to isnet-general-use only if score < 0.6
# - "hq": runs both u2net_human_seg and isnet-general-use and keeps the higher-scoring mask
QUALITY_MODE = os.environ.get("PRIMEID_BG_MODE", "balanced").strip().lower()

# Model files & Priority order on CPU
# isnet-general-use (1024x1024 tensor) provides pristine ear, hair and boundary fidelity.
# birefnet-general-lite is intentionally excluded from the default chain because it takes 25-30s on CPU.
# It can be opted-in via env var PRIMEID_ENABLE_BIREFNET=1
_DEFAULT_CPU_MODELS = [
    ("isnet-general-use", "isnet-general-use.onnx"),
    ("u2net_human_seg", "u2net_human_seg.onnx"),
    ("u2net", "u2net.onnx"),
    ("u2netp", "u2netp.onnx"),
]

_OPT_IN_MODELS = [
    ("birefnet-general-lite", "birefnet-general-lite.onnx"),
]


# --------------------------------------------------------------------------
# Helpers & Lifecycle
# --------------------------------------------------------------------------
def is_model_loaded() -> bool:
    """Check if any model is cached in memory or present on local disk."""
    if len(_cached_rembg_sessions) > 0:
        return True
    try:
        _ensure_u2net_home()
    except Exception:
        pass
    user_u2net = os.path.expanduser("~/.u2net")
    return (
        os.path.exists(os.path.join(user_u2net, "u2net_human_seg.onnx"))
        or os.path.exists(os.path.join(user_u2net, "isnet-general-use.onnx"))
        or os.path.exists(os.path.join(user_u2net, "u2net.onnx"))
        or os.path.exists(os.path.join(user_u2net, "u2netp.onnx"))
    )


def decontaminate_edges(rgba_np: np.ndarray) -> np.ndarray:
    """Delegates to high-fidelity vectorized edge color decontamination in matting_utils."""
    if not isinstance(rgba_np, np.ndarray) or len(rgba_np.shape) != 3 or rgba_np.shape[2] != 4:
        return rgba_np
    try:
        from app.services.enhancement.matting_utils import decontaminate_edges as mat_decont

        return mat_decont(rgba_np)
    except Exception as e:
        logger.warning(f"[BG] decontaminate_edges fallback: {e}", exc_info=True)
        return rgba_np


def _ensure_u2net_home():
    """Ensure U2NET_HOME points to bundled models folder and ~/.u2net is populated for 100% offline usage on any PC."""
    candidates = []
    if hasattr(sys, "_MEIPASS"):
        candidates.append(os.path.join(sys._MEIPASS, "models"))
    exe_dir = os.path.dirname(sys.executable)
    candidates.append(os.path.join(exe_dir, "models"))
    candidates.append(os.path.join(exe_dir, "_internal", "models"))
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    candidates.append(os.path.join(backend_dir, "models"))
    candidates.append(os.path.join(backend_dir, "backend", "models"))

    found_models_dir = None
    for cand in candidates:
        if os.path.isdir(cand) and any(f.endswith(".onnx") for f in os.listdir(cand)):
            found_models_dir = cand
            break

    user_u2net = os.path.expanduser("~/.u2net")
    os.environ["U2NET_HOME"] = user_u2net

    if found_models_dir:
        try:
            os.makedirs(user_u2net, exist_ok=True)
            for fname in os.listdir(found_models_dir):
                if fname.endswith(".onnx"):
                    dst = os.path.join(user_u2net, fname)
                    src = os.path.join(found_models_dir, fname)
                    if not os.path.exists(dst) or os.path.getsize(dst) != os.path.getsize(src):
                        logger.info(f"Copying bundled model {fname} -> {dst}")
                        shutil.copy2(src, dst)
        except Exception as e:
            logger.warning(f"Could not copy models to ~/.u2net: {e}")


def _models_to_try() -> List[str]:
    """
    Returns only models present locally on disk in priority order.
    birefnet-general-lite is only included if explicitly enabled via PRIMEID_ENABLE_BIREFNET=1.
    """
    home = os.environ.get("U2NET_HOME", os.path.expanduser("~/.u2net"))

    model_chain = list(_DEFAULT_CPU_MODELS)
    enable_birefnet = os.environ.get("PRIMEID_ENABLE_BIREFNET", "").strip().lower() in ("1", "true", "yes")
    if enable_birefnet:
        model_chain.extend(_OPT_IN_MODELS)

    present = [name for name, fname in model_chain if os.path.exists(os.path.join(home, fname))]
    if present:
        return present
    return [name for name, _ in model_chain]


def load_image_normalized(path: str, max_side: int = MAX_SIDE) -> Image.Image:
    """
    Standardizes any input into a clean 8-bit RGB image:
    - Applies EXIF orientation (fixes sideways / inverted phone photos)
    - Normalizes CMYK / Grayscale / Palette / 16-bit / Alpha channels to pure RGB
    - Downscales extremely large resolutions to max_side while retaining aspect ratio
    """
    img = Image.open(path)
    img.load()

    try:
        img = ImageOps.exif_transpose(img)
    except Exception as e:
        logger.warning(f"[BG] EXIF transpose skipped: {e}")

    # 16-bit / float / integer modes -> 8-bit grayscale
    if img.mode in ("I", "I;16", "I;16L", "I;16B", "F"):
        arr = np.array(img).astype(np.float32)
        if arr.max() > 255:
            arr = arr / 256.0
        img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="L")

    # If alpha channel is present, composite cleanly over white background
    has_alpha = img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info)
    if has_alpha:
        rgba = img.convert("RGBA")
        canvas = Image.new("RGB", rgba.size, (255, 255, 255))
        canvas.paste(rgba, mask=rgba.split()[-1])
        img = canvas
    elif img.mode != "RGB":
        img = img.convert("RGB")

    w, h = img.size
    if w < 2 or h < 2:
        raise ValueError(f"Image dimensions too small: {w}x{h}")

    longest = max(w, h)
    if longest > max_side:
        scale = max_side / float(longest)
        img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)

    return img


def _judge_alpha(alpha: np.ndarray) -> str:
    """Classifies alpha mask: 'ok' | 'solid' (near-opaque) | 'empty' (near-transparent)."""
    fg_ratio = float((alpha > 127).mean())
    if fg_ratio < 0.02:
        return "empty"
    if int((alpha < 200).sum()) > 50:
        return "ok"
    return "solid"


def _save_rgba(img: Image.Image, output_path: str):
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    img.save(output_path, "PNG")


# --------------------------------------------------------------------------
# Person-ROI Face & Bounding Box Detection
# --------------------------------------------------------------------------
def _detect_faces_for_roi(img_rgb: np.ndarray) -> List[Tuple[int, int, int, int]]:
    """
    Detects faces in RGB image array.
    Returns list of bounding boxes: [(x, y, w, h), ...] sorted by area descending.
    """
    h, w = img_rgb.shape[:2]
    faces: List[Tuple[int, int, int, int]] = []

    # 1. Primary: MediaPipe Face Detection
    try:
        import mediapipe as mp

        mp_fd = getattr(mp.solutions, "face_detection", None)
        if mp_fd:
            with mp_fd.FaceDetection(min_detection_confidence=0.45, model_selection=1) as fd:
                res = fd.process(img_rgb)
                if res and res.detections:
                    for det in res.detections:
                        bbox = det.location_data.relative_bounding_box
                        fx = max(0, int(bbox.xmin * w))
                        fy = max(0, int(bbox.ymin * h))
                        fw = min(w - fx, int(bbox.width * w))
                        fh = min(h - fy, int(bbox.height * h))
                        if fw > 10 and fh > 10:
                            faces.append((fx, fy, fw, fh))
    except Exception as mp_err:
        logger.debug(f"[BG] MediaPipe face detection for ROI fallback: {mp_err}")

    # 2. Secondary Fallback: OpenCV Haar Cascade (with Unicode path safety)
    if not faces:
        try:
            import cv2
            from app.core.cascade import safe_load_cascade

            gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
            cascade = safe_load_cascade("haarcascade_frontalface_default.xml")
            if not cascade.empty():
                detected = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
                for fx, fy, fw, fh in detected:
                    faces.append((int(fx), int(fy), int(fw), int(fh)))
        except Exception as cv_err:
            logger.debug(f"[BG] Haar cascade face detection for ROI fallback: {cv_err}")

    # Sort faces by area descending (largest primary subject first)
    faces.sort(key=lambda r: r[2] * r[3], reverse=True)
    return faces


def _calculate_person_roi(pil_img: Image.Image) -> Optional[Tuple[int, int, int, int]]:
    """
    Calculates Person-ROI bounding box around the primary subject:
    - Width = 4.5x face width centered on face (prevents ear and shoulder clipping)
    - Top = 1.2x face height above face top (captures full hair/head)
    - Bottom = 3.5x face height below face bottom (captures full shoulders and chest)
    - Minimum dimension = 512px (if image allows)
    - If ROI width exceeds 70% of image width, expands horizontally to full width [0, img_w]
      to completely eliminate vertical side boundary clipping.
    - Skips ROI if multiple similar-sized faces exist (group photo) or if ROI covers >85% of image area.
    """
    img_w, img_h = pil_img.size
    img_rgb = np.array(pil_img)
    faces = _detect_faces_for_roi(img_rgb)

    if not faces:
        logger.info("[BG] ROI skipped: no face detected")
        return None

    # Check for group photo (multiple similar-sized faces)
    if len(faces) >= 2:
        area1 = faces[0][2] * faces[0][3]
        area2 = faces[1][2] * faces[1][3]
        if area1 > 0 and (area2 / float(area1)) > 0.70:
            logger.info(f"[BG] ROI skipped: multiple similar-sized faces detected (ratio={area2/area1:.2f})")
            return None

    fx, fy, fw, fh = faces[0]

    # Calculate generous portrait bounding geometry
    roi_w = int(4.5 * fw)
    roi_x = int(fx + fw / 2.0 - roi_w / 2.0)
    roi_top = int(fy - 1.2 * fh)
    roi_bot = int(fy + fh + 3.5 * fh)

    # Initial clamp to image boundaries
    x1 = max(0, roi_x)
    y1 = max(0, roi_top)
    x2 = min(img_w, roi_x + roi_w)
    y2 = min(img_h, roi_bot)

    # If horizontal coverage is >=70% of image width, expand to full width to prevent vertical edge cuts
    if (x2 - x1) >= 0.70 * img_w:
        x1 = 0
        x2 = img_w

    cur_w = x2 - x1
    cur_h = y2 - y1

    # Ensure ROI is at least 512px on the shorter side if image dimensions permit
    target_min = 512
    if min(cur_w, cur_h) < target_min:
        target_w = min(img_w, max(cur_w, target_min))
        target_h = min(img_h, max(cur_h, target_min))

        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0

        x1 = max(0, int(cx - target_w / 2.0))
        x2 = min(img_w, x1 + target_w)
        if x2 == img_w:
            x1 = max(0, img_w - target_w)

        y1 = max(0, int(cy - target_h / 2.0))
        y2 = min(img_h, y1 + target_h)
        if y2 == img_h:
            y1 = max(0, img_h - target_h)

        cur_w = x2 - x1
        cur_h = y2 - y1

    # If ROI covers >85% of total image area, cropping gives minimal benefit; skip
    roi_area = cur_w * cur_h
    img_area = img_w * img_h
    if (roi_area / float(img_area)) > 0.85:
        logger.info(f"[BG] ROI skipped: ROI covers {roi_area/img_area*100:.1f}% (>85%) of image area")
        return None

    logger.info(f"[BG] ROI used: (x={x1}, y={y1}, w={cur_w}, h={cur_h})")
    return (x1, y1, x2, y2)


# --------------------------------------------------------------------------
# Single Model Execution & Mask Scoring Core
# --------------------------------------------------------------------------
def _run_single_rembg_model(
    pil_input: Image.Image,
    model_name: str,
) -> Tuple[bool, Optional[Image.Image], float, List[str], str]:
    """
    Executes a single rembg ONNX model on a PIL image and calculates deterministic mask quality.
    Returns:
        (success: bool, rgba_image: Optional[Image.Image], score: float [0..1], reasons: List[str], err: str)
    """
    try:
        import rembg
        from app.services.background.validator import mask_quality_score

        remove_func = getattr(rembg, "remove", None)
        new_session_func = getattr(rembg, "new_session", None)

        if not callable(remove_func) or not callable(new_session_func):
            return False, None, 0.0, ["rembg_unavailable"], "rembg functions not callable"

        with _rembg_lock:
            if model_name not in _cached_rembg_sessions:
                logger.info(f"[BG] Initializing rembg session: {model_name}")
                _cached_rembg_sessions[model_name] = new_session_func(model_name)
            session = _cached_rembg_sessions[model_name]

            raw_output = remove_func(
                pil_input,
                session=session,
                post_process_mask=True,
                alpha_matting=False,
            )

        if not isinstance(raw_output, Image.Image):
            return False, None, 0.0, ["unexpected_output_type"], f"output type {type(raw_output).__name__}"

        rgba = raw_output if raw_output.mode == "RGBA" else raw_output.convert("RGBA")
        rgb_arr = np.array(rgba.convert("RGB"))
        alpha_arr = np.array(rgba.split()[-1])

        # Evaluate deterministic mask quality score (0.0 to 1.0)
        score, reasons, metrics = mask_quality_score(rgb_arr, alpha_arr)
        verdict = _judge_alpha(alpha_arr)

        logger.info(
            f"[BG] Model '{model_name}' output verdict='{verdict}', "
            f"score={score:.3f}, fg={metrics.get('fg_ratio')}, "
            f"comp={metrics.get('num_components')}, reasons={reasons}"
        )

        if verdict == "empty" or score <= 0.05:
            return False, rgba, score, reasons, f"empty mask (score={score:.3f})"

        return True, rgba, score, reasons, ""

    except Exception as e:
        logger.warning(f"[BG] rembg model '{model_name}' execution error: {type(e).__name__}: {e}", exc_info=True)
        with _rembg_lock:
            _cached_rembg_sessions.pop(model_name, None)
        return False, None, 0.0, [f"exception_{type(e).__name__}"], str(e)


# --------------------------------------------------------------------------
# Multi-Model Quality Modes (fast / balanced / hq)
# --------------------------------------------------------------------------
def _segment_image_pil(
    pil_input: Image.Image,
    allow_cloud: bool = True,
    quality_mode: Optional[str] = None,
) -> Tuple[bool, Optional[Image.Image], str]:
    """
    Executes background segmentation using the configured Quality Mode:
    - "fast": u2net_human_seg only (+ ROI). Fast path ~0.6s.
    - "balanced" (default): u2net_human_seg, escalating to isnet-general-use only if mask score < 0.6.
    - "hq": runs both u2net_human_seg and isnet-general-use and keeps the higher-scoring mask.
    Falls back cleanly to Cloud AI, solid retention, and GrabCut.
    """
    mode = (quality_mode or os.environ.get("PRIMEID_BG_MODE", "balanced")).strip().lower()
    if mode not in ("fast", "balanced", "hq"):
        mode = "balanced"

    _ensure_u2net_home()
    models = _models_to_try()
    if not models:
        models = [m for m, _ in _DEFAULT_CPU_MODELS]

    errors: List[str] = []
    candidates: List[Tuple[float, str, Image.Image]] = []  # (score, model_name, rgba)

    # 1. FAST MODE: Try primary model; if fails, fall down the list
    if mode == "fast":
        for model_name in models:
            ok, rgba, score, reasons, err = _run_single_rembg_model(pil_input, model_name)
            if ok and rgba is not None:
                logger.info(f"✅ [BG] (FAST) Model '{model_name}' accepted (score={score:.3f})")
                return True, rgba, ""
            errors.append(f"{model_name}: {err or 'failed'}")

    # 2. BALANCED MODE (Default): Run u2net_human_seg, escalate to isnet if score < 0.6
    elif mode == "balanced":
        primary_model = models[0]
        ok1, rgba1, score1, reasons1, err1 = _run_single_rembg_model(pil_input, primary_model)
        if ok1 and rgba1 is not None:
            candidates.append((score1, primary_model, rgba1))
            if score1 >= 0.60:
                logger.info(f"✅ [BG] (BALANCED) Primary '{primary_model}' score {score1:.3f} >= 0.60 (accepted fast path)")
                return True, rgba1, ""
            else:
                logger.warning(
                    f"[BG] (BALANCED) Primary '{primary_model}' score {score1:.3f} < 0.60 ({reasons1}). "
                    f"Escalating to next model in chain..."
                )
        else:
            errors.append(f"{primary_model}: {err1 or 'failed'}")

        # Escalate through remaining models on disk (e.g. isnet-general-use, u2net, etc.)
        for model_name in models[1:]:
            ok2, rgba2, score2, reasons2, err2 = _run_single_rembg_model(pil_input, model_name)
            if ok2 and rgba2 is not None:
                candidates.append((score2, model_name, rgba2))
                if score2 >= 0.60:
                    logger.info(f"✅ [BG] (BALANCED) Escalation model '{model_name}' succeeded with score {score2:.3f}")
                    return True, rgba2, ""
            else:
                errors.append(f"{model_name}: {err2 or 'failed'}")

    # 3. HQ MODE: Evaluate top 2 models (e.g. u2net_human_seg & isnet-general-use) and pick the best mask
    elif mode == "hq":
        logger.info("[BG] (HQ) Running multi-model evaluation...")
        for model_name in models[:2]:
            ok, rgba, score, reasons, err = _run_single_rembg_model(pil_input, model_name)
            if ok and rgba is not None:
                candidates.append((score, model_name, rgba))
            else:
                errors.append(f"{model_name}: {err or 'failed'}")

    # If any local model generated a usable candidate mask, select the highest-scoring one
    if candidates:
        candidates.sort(key=lambda c: c[0], reverse=True)
        best_score, best_model, best_rgba = candidates[0]
        if best_score >= 0.20:
            logger.info(f"✅ [BG] Selected best local mask from '{best_model}' with quality score {best_score:.3f}")
            return True, best_rgba, ""

    # 4. Cloud Fallback
    if allow_cloud:
        logger.info("[BG] Attempting cloud AI fallback...")
        temp_cloud_in = os.path.join(os.environ.get("TEMP", "."), f"cloud_in_{id(pil_input)}.jpg")
        temp_cloud_out = os.path.join(os.environ.get("TEMP", "."), f"cloud_out_{id(pil_input)}.png")
        try:
            from app.services.background.cloud_remover import remove_background_rmbg2_sync

            pil_input.save(temp_cloud_in, "JPEG", quality=95)
            if remove_background_rmbg2_sync(temp_cloud_in, temp_cloud_out) and os.path.exists(temp_cloud_out):
                with Image.open(temp_cloud_out) as check:
                    if check.mode == "RGBA":
                        res_rgba = check.copy()
                        logger.info("✅ Cloud fallback succeeded")
                        return True, res_rgba, ""
            errors.append("cloud: no usable result")
        except Exception as cloud_err:
            logger.warning(f"[BG] Cloud AI fallback error: {type(cloud_err).__name__}: {cloud_err}", exc_info=True)
            errors.append(f"cloud: {type(cloud_err).__name__}: {cloud_err}")
        finally:
            for p in (temp_cloud_in, temp_cloud_out):
                if os.path.exists(p):
                    try:
                        os.remove(p)
                    except Exception:
                        pass

    # 5. Near-solid mask candidate retention (for ultra-close headshots)
    if candidates:
        best_score, best_model, best_rgba = candidates[0]
        logger.warning(f"[BG] Using best available mask from '{best_model}' (score={best_score:.3f})")
        return True, best_rgba, ""

    # 6. Last Resort: OpenCV GrabCut Segmentation
    logger.info("[BG] Running OpenCV GrabCut fallback...")
    try:
        import cv2
        from app.core.cascade import safe_load_cascade

        img_rgb = np.array(pil_input)
        img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
        h, w = img_bgr.shape[:2]
        mask = np.zeros((h, w), np.uint8)
        bgd_model = np.zeros((1, 65), np.float64)
        fgd_model = np.zeros((1, 65), np.float64)

        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        cascade = safe_load_cascade("haarcascade_frontalface_default.xml")
        faces = (
            cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
            if not cascade.empty()
            else ()
        )

        rect = None
        if len(faces) > 0:
            x, y, fw, fh = max(faces, key=lambda r: r[2] * r[3])
            margin_top = int(fh * 0.5)
            margin_bottom = int(fh * 2.5)
            margin_side = int(fw * 1.0)
            rect_x = max(0, int(x) - margin_side)
            rect_y = max(0, int(y) - margin_top)
            rect_w = min(w - rect_x, int(fw) + 2 * margin_side)
            rect_h = min(h - rect_y, int(fh) + margin_top + margin_bottom)
            if rect_w >= 10 and rect_h >= 10:
                rect = (rect_x, rect_y, rect_w, rect_h)

        if rect is None:
            margin = max(1, int(min(w, h) * 0.05))
            rect = (margin, margin, max(10, w - 2 * margin), max(10, h - 2 * margin))

        cv2.grabCut(img_bgr, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
        mask2 = np.where((mask == 2) | (mask == 0), 0, 255).astype("uint8")
        mask2 = cv2.GaussianBlur(mask2, (5, 5), 0)

        rgba_np = np.dstack([img_rgb, mask2])
        out_rgba = Image.fromarray(rgba_np, mode="RGBA")
        logger.info("✅ GrabCut fallback completed")
        return True, out_rgba, ""
    except Exception as gc_err:
        logger.error(f"[BG] GrabCut fallback failed: {type(gc_err).__name__}: {gc_err}", exc_info=True)
        errors.append(f"grabcut: {type(gc_err).__name__}: {gc_err}")

    reason = " | ".join(errors) if errors else "unknown segmentation failure"
    return False, None, reason[:300]


# --------------------------------------------------------------------------
# Main Background Removal Engine Orchestrator
# --------------------------------------------------------------------------
def _remove_background_core(
    input_path: str,
    output_path: str,
    allow_cloud: bool = True,
    quality_mode: Optional[str] = None,
) -> Tuple[bool, str]:
    """
    Main background removal engine:
    1. Loads and normalizes input image.
    2. Performs Person-ROI two-pass segmentation if ENABLE_PERSON_ROI is True.
    3. Seamlessly falls back to full-image segmentation if ROI is skipped or fails.
    4. Applies Guided Filter Alpha Refinement & Color Decontamination.
    5. Saves 300 DPI-ready transparent RGBA PNG.
    """
    logger.info(f"[BG] Background removal started for {input_path}")

    # 0. Load and normalize input image
    try:
        pil_input = load_image_normalized(input_path)
    except Exception as e:
        reason = f"Image could not be read ({type(e).__name__}: {e})"
        logger.error(f"[BG] {reason} | file={input_path}", exc_info=True)
        return False, reason

    img_w, img_h = pil_input.size
    logger.info(f"[BG] Normalized input: size={pil_input.size} mode={pil_input.mode}")

    full_rgba: Optional[Image.Image] = None

    # 1. Person-ROI Two-Pass Segmentation
    if ENABLE_PERSON_ROI:
        try:
            roi_box = _calculate_person_roi(pil_input)
            if roi_box is not None:
                x1, y1, x2, y2 = roi_box
                pil_roi = pil_input.crop((x1, y1, x2, y2))
                logger.info(f"[BG] Executing segmentation on Person-ROI ({x2 - x1}x{y2 - y1})")

                ok_roi, roi_rgba, reason_roi = _segment_image_pil(
                    pil_roi, allow_cloud=allow_cloud, quality_mode=quality_mode
                )
                if ok_roi and roi_rgba is not None:
                    # Construct full-size alpha canvas (alpha=0 outside ROI)
                    roi_alpha = np.array(roi_rgba.split()[-1])
                    full_alpha = np.zeros((img_h, img_w), dtype=np.uint8)
                    full_alpha[y1:y2, x1:x2] = roi_alpha

                    verdict = _judge_alpha(full_alpha)
                    if verdict != "empty":
                        full_rgb = np.array(pil_input.convert("RGB"))
                        full_rgba = Image.fromarray(np.dstack([full_rgb, full_alpha]), mode="RGBA")
                        logger.info(f"✅ Background removal succeeded via Person-ROI ({x2 - x1}x{y2 - y1})")
                    else:
                        logger.warning("[BG] ROI segmentation produced empty mask, falling back to full-image")
                else:
                    logger.warning(f"[BG] ROI segmentation failed ({reason_roi}), falling back to full-image")
        except Exception as roi_exc:
            logger.warning(f"[BG] Person-ROI pipeline exception ({roi_exc}), falling back to full-image", exc_info=True)

    # 2. Full-Image Segmentation (Standard / Fallback Path)
    if full_rgba is None:
        logger.info("[BG] Running full-image segmentation")
        ok_full, full_rgba_raw, reason_full = _segment_image_pil(
            pil_input, allow_cloud=allow_cloud, quality_mode=quality_mode
        )
        if ok_full and full_rgba_raw is not None:
            full_rgba = full_rgba_raw
            logger.info("✅ Background removal succeeded via full-image")
        else:
            logger.error(f"[BG] ALL methods failed for {input_path}: {reason_full}")
            return False, reason_full

    # 3. High-Fidelity Edge Refinement & Color Decontamination
    if ENABLE_EDGE_REFINE and full_rgba is not None:
        try:
            from app.services.enhancement.matting_utils import refine_alpha, decontaminate_edges as mat_decont

            full_rgb_np = np.array(full_rgba.convert("RGB"))
            full_alpha_np = np.array(full_rgba.split()[-1])

            # Refine alpha boundary via Guided Filter
            refined_alpha_np = refine_alpha(full_rgb_np, full_alpha_np)

            # Decontaminate background color spill from semi-transparent edge pixels
            refined_rgba_np = np.dstack([full_rgb_np, refined_alpha_np])
            decont_rgba_np = mat_decont(refined_rgba_np)

            full_rgba = Image.fromarray(decont_rgba_np, mode="RGBA")
            logger.info("✅ Edge refinement & color decontamination applied successfully")
        except Exception as ref_err:
            logger.warning(f"[BG] Edge refinement exception ({ref_err}), using unrefined output", exc_info=True)

    # 4. Save final high-resolution asset
    _save_rgba(full_rgba, output_path)
    return True, ""


def remove_background_with_reason(
    input_path: str,
    output_path: str,
    allow_cloud: bool = True,
    quality_mode: Optional[str] = None,
) -> Tuple[bool, str]:
    """Returns (success, reason) tuple for pipeline error tracking."""
    return _remove_background_core(input_path, output_path, allow_cloud, quality_mode=quality_mode)


def remove_background_lightweight(
    input_path: str,
    output_path: str,
    allow_cloud: bool = True,
    quality_mode: Optional[str] = None,
) -> bool:
    """Backward-compatible boolean API for existing services."""
    ok, _ = _remove_background_core(input_path, output_path, allow_cloud, quality_mode=quality_mode)
    return ok


def preload_models():
    """Background task to pre-load and warm up local AI model for instantaneous 1st photo processing."""
    try:
        _ensure_u2net_home()
        import rembg

        new_session_func = getattr(rembg, "new_session", None)
        remove_func = getattr(rembg, "remove", None)
        if callable(new_session_func):
            with _rembg_lock:
                for candidate in _models_to_try():
                    if candidate in _cached_rembg_sessions:
                        break
                    try:
                        logger.info(f"Pre-loading local AI model: {candidate}")
                        session = new_session_func(candidate)
                        _cached_rembg_sessions[candidate] = session
                        # Execute warm-up dummy forward pass so ONNX tensor buffers are pre-allocated
                        if callable(remove_func):
                            dummy = Image.fromarray(np.full((128, 128, 3), 200, dtype=np.uint8), mode="RGB")
                            remove_func(dummy, session=session)
                        logger.info(f"✅ {candidate} pre-loaded and warmed up successfully in memory")
                        break
                    except Exception as load_err:
                        logger.warning(f"Could not preload {candidate}: {load_err}")
    except Exception as e:
        logger.warning(f"Background model pre-load warning: {e}")


def check_bg_engine() -> Dict[str, Any]:
    """
    Startup diagnostic and health check for the background removal engine.
    Returns:
        Dict with ONNX runtime status, available models on disk, active quality mode,
        and dummy 64x64 inference latency.
    """
    _ensure_u2net_home()
    u2net_home = os.environ.get("U2NET_HOME", os.path.expanduser("~/.u2net"))

    res: Dict[str, Any] = {
        "status": "healthy",
        "onnxruntime_version": "not_installed",
        "providers": [],
        "quality_mode": os.environ.get("PRIMEID_BG_MODE", "balanced").lower(),
        "birefnet_enabled": os.environ.get("PRIMEID_ENABLE_BIREFNET", "").strip().lower() in ("1", "true", "yes"),
        "models_present": {},
        "default_model_chain": [name for name, _ in _DEFAULT_CPU_MODELS],
        "active_model_chain": _models_to_try(),
        "dummy_test": {},
    }

    try:
        import onnxruntime as ort

        res["onnxruntime_version"] = ort.__version__
        res["providers"] = ort.get_available_providers()
    except Exception as e:
        res["onnxruntime_version"] = f"error: {e}"
        res["status"] = "degraded"

    for name, fname in _DEFAULT_CPU_MODELS + _OPT_IN_MODELS:
        res["models_present"][fname] = os.path.exists(os.path.join(u2net_home, fname))

    # Run a fast 64x64 dummy inference to verify tensor allocation and runtime health
    try:
        import rembg

        dummy_img = Image.fromarray(np.full((64, 64, 3), 200, dtype=np.uint8), mode="RGB")
        t0 = time.perf_counter()
        first_model = res["active_model_chain"][0] if res["active_model_chain"] else "u2net_human_seg"

        with _rembg_lock:
            if first_model not in _cached_rembg_sessions:
                _cached_rembg_sessions[first_model] = rembg.new_session(first_model)
            session = _cached_rembg_sessions[first_model]

        out = rembg.remove(dummy_img, session=session)
        t1 = time.perf_counter()

        res["dummy_test"] = {
            "success": True,
            "model_tested": first_model,
            "latency_ms": round((t1 - t0) * 1000.0, 2),
            "output_mode": out.mode,
            "output_size": out.size,
            "error": None,
        }
    except Exception as err:
        res["status"] = "degraded"
        res["dummy_test"] = {
            "success": False,
            "error": str(err),
        }

    return res


remove_background = remove_background_lightweight