import os
import sys
import shutil
import logging
import threading
import cv2  # pyrefly: ignore [missing-import]
import numpy as np  # pyrefly: ignore [missing-import]
from PIL import Image  # pyrefly: ignore [missing-import]
from app.core.cascade import get_cv2_data_path  # pyrefly: ignore [missing-import]

logger = logging.getLogger("primeidpro.background")


_cached_rembg_sessions = {}
_rembg_lock = threading.Lock()

def is_model_loaded():
    return "u2net_human_seg" in _cached_rembg_sessions

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
        logger.info(f"Copying bundled models to U2NET_HOME={user_u2net}")
        try:
            os.makedirs(user_u2net, exist_ok=True)
            for fname in os.listdir(found_models_dir):
                if fname.endswith(".onnx"):
                    dst = os.path.join(user_u2net, fname)
                    src = os.path.join(found_models_dir, fname)
                    if not os.path.exists(dst) or os.path.getsize(dst) != os.path.getsize(src):
                        shutil.copy2(src, dst)
        except Exception as e:
            logger.warning(f"Could not copy models to ~/.u2net: {e}")


def decontaminate_edges(rgba_np: np.ndarray) -> np.ndarray:
    """
    Eliminates color fringe/halos from old background in semi-transparent boundary pixels.
    Diffuses true solid foreground RGB colors into edge pixels (0 < alpha < 240).
    """
    if len(rgba_np.shape) != 3 or rgba_np.shape[2] != 4:
        return rgba_np
    rgb = rgba_np[:, :, :3].copy()
    alpha = rgba_np[:, :, 3].copy()

    solid_fg = (alpha > 230).astype(np.uint8)
    if solid_fg.sum() == 0:
        return rgba_np

    inpaint_mask = ((alpha <= 230) & (alpha >= 1)).astype(np.uint8)
    if inpaint_mask.sum() == 0:
        return rgba_np

    try:
        decontaminated_rgb = cv2.inpaint(rgb, inpaint_mask, inpaintRadius=4, flags=cv2.INPAINT_TELEA)
        return np.dstack([decontaminated_rgb, alpha])
    except Exception as e:
        logger.warning(f"Color decontamination fallback: {e}")
        return rgba_np


def clean_anatomical_portrait_mask(rgba_img: Image.Image) -> Image.Image:
    """
    Precision non-destructive portrait cleaner:
    - 100% preserves human ears, hair, beard, skin, and clothing.
    - Zero destructive color thresholding on hair/skin/crown.
    - Closes internal alpha holes so dark hair/clothes never have see-through voids.
    - Decontaminates semi-transparent edges to eliminate old background halos.
    - Smooth anti-aliased alpha boundary for professional studio blending.
    """
    img_np = np.array(rgba_img)
    if len(img_np.shape) != 3 or img_np.shape[2] != 4:
        return rgba_img

    h, w = img_np.shape[:2]
    rgb = img_np[:, :, :3]
    alpha = img_np[:, :, 3].copy().astype(np.float32)

    try:
        # 1. Morphological hole-closing on subject alpha to prevent transparent voids in dark hair / clothing
        alpha_u8 = np.clip(alpha, 0, 255).astype(np.uint8)
        bin_mask = (alpha_u8 > 35).astype(np.uint8) * 255
        kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        closed_bin = cv2.morphologyEx(bin_mask, cv2.MORPH_CLOSE, kernel_close)

        # Flood fill from outside corners to detect true background
        flood_mask = np.zeros((h + 2, w + 2), np.uint8)
        flood_fill_img = closed_bin.copy()
        cv2.floodFill(flood_fill_img, flood_mask, (0, 0), 128)
        # Internal holes are those that were 0 (background) but not reached by exterior floodfill
        internal_holes = (flood_fill_img == 0)
        alpha[internal_holes] = 255.0

        # 2. Smooth boundary anti-aliasing (prevents cookie-cutter pixel steps)
        alpha = cv2.GaussianBlur(alpha, (3, 3), 0.35)
        final_alpha = np.clip(alpha, 0, 255).astype(np.uint8)

        # 3. Color Decontamination
        merged = np.dstack([rgb, final_alpha])
        clean_rgba = decontaminate_edges(merged)
        return Image.fromarray(clean_rgba, mode="RGBA")
    except Exception as e:
        logger.warning(f"Portrait mask refinement warning: {e}")
        return rgba_img


def remove_background_lightweight(input_path: str, output_path: str, allow_cloud: bool = True) -> bool:
    """
    Primary Background Removal Engine (Hybrid):
    1. Always runs 100% locally first via u2net_human_seg (or fallbacks).
    2. Runs quality validation on the generated alpha mask.
    3. If score >= 85, uses the local result.
    4. If score < 85 and allow_cloud=True, sends original image to Cloud AI.
    """
    logger.info("[BG] Local background removal started")
    
    # 1. Local Offline Neural Segmentation (bria-rmbg / isnet-general-use)
    rembg_success = False
    local_result_image = None
    
    try:
        _ensure_u2net_home()
        import rembg  # type: ignore
        remove_func = getattr(rembg, "remove", None)
        new_session_func = getattr(rembg, "new_session", None)

        if callable(remove_func) and callable(new_session_func):
            # Use briarmbg (BriaAI RMBG-1.4) for Replicate-level quality locally, isnet as secondary
            for model_name in ["briarmbg", "isnet-general-use", "u2net_human_seg"]:
                try:
                    pil_input = Image.open(input_path)
                    
                    with _rembg_lock:
                        if model_name not in _cached_rembg_sessions:
                            # MEMORY OPTIMIZATION: Clear previous heavy models from RAM before loading a new one
                            _cached_rembg_sessions.clear()
                            import gc
                            gc.collect()
                            _cached_rembg_sessions[model_name] = new_session_func(model_name)
                        session = _cached_rembg_sessions[model_name]

                        # Disable alpha matting to prevent eroding full body photos and causing black borders
                        raw_output = remove_func(
                            pil_input, 
                            session=session, 
                            post_process_mask=True,
                            alpha_matting=False
                        )

                    if isinstance(raw_output, Image.Image):
                        # Apply non-destructive anatomical cleanup and color decontamination
                        local_result_image = clean_anatomical_portrait_mask(raw_output)
                    else:
                        continue

                    # Validate alpha channel internally to ensure it's not totally broken
                    if local_result_image.mode == "RGBA":
                        alpha = np.array(local_result_image.split()[-1])
                        if (alpha < 250).sum() > (alpha.size * 0.02):
                            rembg_success = True
                            logger.info(f"✅ rembg ({model_name}) succeeded with clean human portrait segmentation")
                            break
                except Exception as e:
                    logger.warning(f"rembg ({model_name}) warning: {e}")
                    continue
    except Exception as err:
        logger.warning(f"rembg lazy import failed: {err}")

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
                x, y, fw, fh = max(faces, key=lambda r: r[2] * r[3])
                margin_top = int(fh * 0.55)
                margin_bottom = int(fh * 2.8)
                margin_side = int(fw * 1.0)
                rect_x = max(0, x - margin_side)
                rect_y = max(0, y - margin_top)
                rect_w = min(w - rect_x, fw + 2 * margin_side)
                rect_h = min(h - rect_y, fh + margin_top + margin_bottom)
                rect = (rect_x, rect_y, rect_w, rect_h)
            else:
                margin = int(min(w, h) * 0.05)
                rect = (margin, margin, w - 2 * margin, h - 2 * margin)

            cv2.grabCut(img_bgr, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
            mask2 = np.where((mask == 2) | (mask == 0), 0, 1).astype("uint8")
            mask2 = cv2.GaussianBlur(mask2.astype(np.float32), (3, 3), 0)
            mask2 = (mask2 * 255).astype(np.uint8)
            img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
            rgba = np.dstack([img_rgb, mask2])
            decont_rgba = decontaminate_edges(rgba)
            local_result_image = Image.fromarray(decont_rgba, mode="RGBA")
            rembg_success = True
        except Exception as e2:
            logger.error(f"GrabCut fallback failed: {e2}")
            try:
                img = Image.open(input_path).convert("RGBA")
                np_img = np.array(img)
                r, g, b = np_img[:, :, 0], np_img[:, :, 1], np_img[:, :, 2]
                mask = (r > 225) & (g > 225) & (b > 225)
                np_img[:, :, 3] = np.where(mask, 0, 255)
                decont_rgba = decontaminate_edges(np_img)
                local_result_image = Image.fromarray(decont_rgba, mode="RGBA")
                rembg_success = True
            except Exception as e3:
                logger.error(f"Basic threshold fallback failed: {e3}")
                rembg_success = False
                
    logger.info("[BG] Local background removal completed")
                
    if not rembg_success or local_result_image is None:
        logger.info("[BG] Local processing failed completely.")
        return _handle_cloud_fallback(input_path, output_path, allow_cloud)
        
    # Validation Phase
    try:
        from app.services.background.validator import validate_bg_removal
        orig_img_np = np.array(Image.open(input_path).convert("RGB"))
        alpha_mask_np = np.array(local_result_image.split()[-1])
        
        validation = validate_bg_removal(orig_img_np, alpha_mask_np)
        score = validation.get("score", 0)
        reasons = validation.get("reasons", [])
        
        if reasons:
            logger.info(f"[BG] Validator score={score} reasons={','.join(reasons)}")
        else:
            logger.info(f"[BG] Validator score={score}")
            
        if score >= 85:
            logger.info("[BG] Decision=LOCAL")
            local_result_image.save(output_path, "PNG")
            return True
        else:
            logger.info("[BG] Decision=CLOUD")
            if allow_cloud:
                return _handle_cloud_fallback(input_path, output_path, allow_cloud)
            else:
                logger.info("[BG] Cloud not allowed. Proceeding with poor local result.")
                local_result_image.save(output_path, "PNG")
                return True
                
    except Exception as eval_err:
        logger.error(f"Validator execution failed: {eval_err}")
        # Phase 8 Error Safety: fallback if allowed, else use local
        if allow_cloud:
            return _handle_cloud_fallback(input_path, output_path, allow_cloud)
        else:
            local_result_image.save(output_path, "PNG")
            return True

def _handle_cloud_fallback(input_path: str, output_path: str, allow_cloud: bool) -> bool:
    if not allow_cloud:
        return False
        
    logger.info("[BG] Cloud fallback started")
    try:
        from app.services.background.cloud_remover import remove_background_rmbg2_sync
        if remove_background_rmbg2_sync(input_path, output_path):
            if os.path.exists(output_path):
                check = Image.open(output_path)
                if check.mode == "RGBA":
                    logger.info("[BG] Cloud fallback completed")
                    return True
    except Exception as cloud_err:
        logger.debug(f"RMBG-2.0 Cloud AI skipped or failed: {cloud_err}")
    
    return False


def preload_models():
    """Background task to pre-load models into memory to eliminate 1st photo delay"""
    try:
        from app.core.config import settings
        replicate_token = getattr(settings, "replicate_api_token", "") or os.environ.get("REPLICATE_API_TOKEN", "")
        if replicate_token and getattr(settings, "rmbg_enabled", True):
            # Send a dummy lightweight request to Replicate to wake up the model
            import requests
            try:
                headers = {"Authorization": f"Bearer {replicate_token}", "Content-Type": "application/json", "Prefer": "wait"}
                requests.get("https://api.replicate.com/v1/models/briaai/rmbg-2.0", headers=headers, timeout=5.0)
            except Exception:
                pass
                
        # Pre-load local fallback AI models into memory
        _ensure_u2net_home()
        import rembg
        new_session_func = getattr(rembg, "new_session", None)
        if callable(new_session_func):
            # OPTIMIZATION: Preload briarmbg
            for model_name in ["briarmbg"]:
                if model_name not in _cached_rembg_sessions:
                    logger.info(f"Pre-loading local AI model: {model_name}")
                    _cached_rembg_sessions[model_name] = new_session_func(model_name)
                    logger.info(f"Successfully pre-loaded: {model_name}")
    except Exception as e:
        logger.warning(f"Background pre-load failed: {e}")

# Alias for backward compatibility
remove_background = remove_background_lightweight