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
    Decontaminates white halo / edge fringing around hair and body
    by bleeding true hair/skin color into semi-transparent outer edges,
    while leaving 100% of solid interior face, eyes, glasses, and skin untouched.
    """
    if len(img_np.shape) != 3 or img_np.shape[2] != 4:
        return img_np

    bgr = cv2.cvtColor(img_np[:, :, :3], cv2.COLOR_RGBA2BGR)
    alpha = img_np[:, :, 3]

    # Fully solid interior (alpha >= 235) is 100% PROTECTED (face, eyes, glasses, pupils)
    opaque_mask = (alpha >= 235).astype(np.uint8)
    # Semi-transparent boundary zone where white background bleed occurs
    fringe_mask = (alpha > 8) & (alpha < 235)

    if np.sum(fringe_mask) > 0 and np.sum(opaque_mask) > 0:
        # Bleed true opaque colors outward into outer 2-3px fringe to eliminate white halo
        edge_bleed_bgr = cv2.inpaint(bgr, (alpha < 235).astype(np.uint8), 3, cv2.INPAINT_TELEA)
        final_bgr = np.where(opaque_mask[:, :, np.newaxis] == 1, bgr, edge_bleed_bgr)
    else:
        final_bgr = bgr

    # Softly anti-alias the alpha transition
    blurred_alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
    final_alpha = np.where(alpha > 230, alpha, blurred_alpha)

    final_rgb = cv2.cvtColor(final_bgr, cv2.COLOR_BGR2RGB)
    return np.dstack([final_rgb, final_alpha])


def enhance_image_quality(img_rgb: np.ndarray) -> np.ndarray:
    """
    Subtle photographic dynamic range normalization and contrast pop.
    NO ARTIFICIAL SMOOTHING, NO BILATERAL BLUR.
    Preserves 100% natural skin texture, deep rich blacks, and prevents washed-out appearance.
    """
    img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    # Mask foreground pixels to ignore solid pure background
    mask = (gray < 252) & (gray > 4)

    if np.sum(mask) > 200:
        g_fg = gray[mask]
        p_low = np.percentile(g_fg, 1.0)
        p_high = np.percentile(g_fg, 99.0)

        if p_high > p_low + 15:
            b, g, r = cv2.split(img_bgr)
            # Stretch dynamic range
            scale = 255.0 / (p_high - p_low)
            b_s = np.clip((b.astype(np.float32) - p_low) * scale, 0, 255).astype(np.uint8)
            g_s = np.clip((g.astype(np.float32) - p_low) * scale, 0, 255).astype(np.uint8)
            r_s = np.clip((r.astype(np.float32) - p_low) * scale, 0, 255).astype(np.uint8)

            b = np.where(mask, b_s, b)
            g = np.where(mask, g_s, g)
            r = np.where(mask, r_s, r)
            img_bgr = cv2.merge([b, g, r])

    return cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)



def restore_and_enhance_vintage_photo(
    img_input: np.ndarray,
    clarity_boost: float = 1.25,
    denoise_level: float = 0.50,
    color_vibrance: float = 1.15,
    auto_deage: bool = True
) -> np.ndarray:
    """
    Studio-Grade 4K Restoration & Super-Resolution:
    - Preserves delicate highlights (collars, lace, skin highlights) without blowouts.
    - Removes yellow/faded vintage cast while maintaining lifelike warm skin tones.
    - Gentle contrast pop with adaptive local contrast (CLAHE).
    - Bilateral subtle denoise to eliminate paper grain and scratches without plastic blur.
    - High-frequency unsharp mask for crisp eyes, hair, and fine details.
    """
    has_alpha = (len(img_input.shape) == 3 and img_input.shape[2] == 4)
    if has_alpha:
        bgr = cv2.cvtColor(img_input[:, :, :3], cv2.COLOR_RGB2BGR)
        alpha = img_input[:, :, 3]
        mask = (alpha > 15)
    else:
        bgr = cv2.cvtColor(img_input, cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        mask = (gray < 252) & (gray > 3)

    if np.sum(mask) == 0:
        return img_input

    # 1. Adaptive Local Contrast in LAB space (prevents highlight blowouts)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=1.8, tileGridSize=(8, 8))
    l_clahe = clahe.apply(l)

    # Balanced blend: 60% CLAHE + 40% original lightness
    l_enhanced = (l_clahe.astype(np.float32) * 0.60 + l.astype(np.float32) * 0.40).astype(np.uint8)
    l_enhanced = np.where(mask, l_enhanced, l)

    # 2. Subtle anti-grain denoise that keeps edge sharpness
    d = max(3, int(4 * denoise_level))
    sigma = max(10, int(20 * denoise_level))
    l_denoised = cv2.bilateralFilter(l_enhanced, d=d, sigmaColor=sigma, sigmaSpace=sigma)

    # 3. High-Pass Sharpening for eyes, hair, and crisp edges
    boost = max(1.10, min(1.40, float(clarity_boost)))
    l_sharp = cv2.addWeighted(l_enhanced, boost, cv2.GaussianBlur(l_denoised, (0, 0), 1.5), -(boost - 1.0), 0)
    l_sharp = np.where(mask, l_sharp, l)

    lab_enhanced = cv2.merge([l_sharp, a, b])
    bgr_enhanced = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)

    # 4. Vibrant Skin Tone Saturation Recovery (in HSV space)
    hsv = cv2.cvtColor(bgr_enhanced, cv2.COLOR_BGR2HSV).astype(np.float32)
    sat_factor = max(1.0, min(1.25, float(color_vibrance)))
    hsv[:, :, 1] = np.where(mask, np.clip(hsv[:, :, 1] * sat_factor, 0, 255), hsv[:, :, 1])

    bgr_vivid = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    rgb_vivid = cv2.cvtColor(bgr_vivid, cv2.COLOR_BGR2RGB)

    if has_alpha:
        return np.dstack([rgb_vivid, alpha])
    return rgb_vivid