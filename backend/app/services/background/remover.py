import logging
import cv2
import numpy as np
from PIL import Image
from app.core.cascade import get_cv2_data_path

logger = logging.getLogger("primeidpro.background")


def remove_background_lightweight(input_path: str, output_path: str) -> bool:
    """
    Remove background using rembg (AI) or GrabCut with clean alpha preservation.
    Preserves hair, beard, clothes, and body edges without artificial clipping.
    """
    rembg_success = False
    for model_name in ["u2net", "u2netp"]:
        try:
            from rembg import remove, new_session
            session = new_session(model_name)
            pil_input = Image.open(input_path)
            output_img = remove(pil_input, session=session)
            output_img.save(output_path, "PNG")

            # Validate alpha channel
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
                x, y, fw, fh = max(faces, key=lambda r: r[2] * r[3])
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
                rect = (margin, margin, w - 2 * margin, h - 2 * margin)

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