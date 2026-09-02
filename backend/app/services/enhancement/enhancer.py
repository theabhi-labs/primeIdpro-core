import cv2
import numpy as np
from PIL import Image
from app.utils.color import get_bg_rgb


def flatten_onto_bg(rgba_img: Image.Image, bg_color: str, target_size=(413, 531)) -> Image.Image:
    """Composite an already-cropped transparent image onto a flat studio color."""
    bg_rgb = get_bg_rgb(bg_color)
    size = target_size or rgba_img.size
    flat = Image.new("RGB", size, bg_rgb)
    if rgba_img.size != size:
        rgba_img = rgba_img.resize(size, Image.Resampling.LANCZOS)
    flat.paste(rgba_img, (0, 0), mask=rgba_img.split()[3])
    return flat


def refine_edges_and_halo(img_np: np.ndarray) -> np.ndarray:
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


def enhance_image_quality(img_rgb: np.ndarray) -> np.ndarray:
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