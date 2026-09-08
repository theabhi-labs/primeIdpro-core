import os
import sys
import shutil
import logging
import cv2  # pyrefly: ignore [missing-import]
import numpy as np  # pyrefly: ignore [missing-import]
from PIL import Image  # pyrefly: ignore [missing-import]
from app.core.cascade import get_cv2_data_path  # pyrefly: ignore [missing-import]

logger = logging.getLogger("primeidpro.background")


_cached_rembg_sessions = {}


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

    if found_models_dir:
        os.environ["U2NET_HOME"] = found_models_dir
        logger.info(f"Using bundled models from U2NET_HOME={found_models_dir}")
        user_u2net = os.path.expanduser("~/.u2net")
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


def remove_background_lightweight(input_path: str, output_path: str) -> bool:
    """
    Primary Background Removal Engine:
    1. Attempts RMBG-2.0 Cloud AI (Sub-pixel hair matting, zero clutter, 4K crispness) if configured.
    2. Gracefully falls back to local isnet-general-use / u2net_human_seg with soft-alpha continuous matting for 100% offline support.
    """
    # 1. Try RMBG-2.0 Cloud AI (Ultra-Sharp Portrait Matting)
    try:
        from app.services.background.cloud_remover import remove_background_rmbg2_sync
        if remove_background_rmbg2_sync(input_path, output_path):
            # Validate output exists and has valid alpha
            if os.path.exists(output_path):
                check = Image.open(output_path)
                if check.mode == "RGBA":
                    logger.info("✅ Background successfully removed via RMBG-2.0 Cloud AI")
                    return True
    except Exception as cloud_err:
        logger.debug(f"RMBG-2.0 Cloud AI skipped or failed: {cloud_err}")

    # 2. Local Offline Neural Segmentation (isnet-general-use / u2net_human_seg / u2netp)
    rembg_success = False

    try:
        _ensure_u2net_home()
        import rembg  # type: ignore
        remove_func = getattr(rembg, "remove", None)
        new_session_func = getattr(rembg, "new_session", None)

        if callable(remove_func) and callable(new_session_func):
            for model_name in ["isnet-general-use", "u2net_human_seg", "u2netp"]:
                try:
                    if model_name not in _cached_rembg_sessions:
                        _cached_rembg_sessions[model_name] = new_session_func(model_name)
                    session = _cached_rembg_sessions[model_name]

                    pil_input = Image.open(input_path)
                    # post_process_mask=False guarantees soft alpha matting (NO binary clipping of ears/hair)
                    raw_output = remove_func(pil_input, session=session, post_process_mask=False)

                    if isinstance(raw_output, Image.Image):
                        # Apply non-destructive anatomical cleanup and color decontamination
                        cleaned_output = clean_anatomical_portrait_mask(raw_output)
                        cleaned_output.save(output_path, "PNG")
                    else:
                        continue

                    # Validate alpha channel
                    check = Image.open(output_path)
                    if check.mode == "RGBA":
                        alpha = np.array(check.split()[-1])
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
            Image.fromarray(decont_rgba, mode="RGBA").save(output_path, "PNG")
        except Exception as e2:
            logger.error(f"GrabCut fallback failed: {e2}")
            try:
                img = Image.open(input_path).convert("RGBA")
                np_img = np.array(img)
                r, g, b = np_img[:, :, 0], np_img[:, :, 1], np_img[:, :, 2]
                mask = (r > 225) & (g > 225) & (b > 225)
                np_img[:, :, 3] = np.where(mask, 0, 255)
                decont_rgba = decontaminate_edges(np_img)
                Image.fromarray(decont_rgba, mode="RGBA").save(output_path, "PNG")
                return True
            except Exception as e3:
                logger.error(f"Basic threshold fallback failed: {e3}")
                return False

    return True


# Alias for backward compatibility
remove_background = remove_background_lightweight