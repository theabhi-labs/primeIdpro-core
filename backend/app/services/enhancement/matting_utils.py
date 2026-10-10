"""
High-Performance Edge Matting & Color Decontamination Utilities.
Zero heavy dependencies: Built entirely with NumPy and OpenCV (cv2.boxFilter).
No cv2.ximgproc reliance. Vectorized and optimized for CPU desktop environments (<100ms).
"""
from typing import Optional
import logging
import cv2
import numpy as np

logger = logging.getLogger("primeidpro.matting")


def guided_filter(
    guide_gray_float: np.ndarray,
    src_float: np.ndarray,
    radius: int = 4,
    eps: float = 1e-4
) -> np.ndarray:
    """
    Standard Guided Image Filter (He et al. 2010) using cv2.boxFilter.
    Args:
        guide_gray_float: 2D float32 array normalized to [0.0, 1.0] (I).
        src_float: 2D float32 array normalized to [0.0, 1.0] (p).
        radius: Box filter radius in pixels.
        eps: Regularization parameter.
    Returns:
        Refined 2D float32 array normalized to [0.0, 1.0] (q).
    """
    ksize = (2 * radius + 1, 2 * radius + 1)

    mean_I = cv2.boxFilter(guide_gray_float, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT)
    mean_p = cv2.boxFilter(src_float, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT)
    mean_Ip = cv2.boxFilter(guide_gray_float * src_float, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT)

    cov_Ip = mean_Ip - mean_I * mean_p

    mean_II = cv2.boxFilter(guide_gray_float * guide_gray_float, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT)
    var_I = mean_II - mean_I * mean_I

    a = cov_Ip / (var_I + eps)
    b = mean_p - a * mean_I

    mean_a = cv2.boxFilter(a, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT)
    mean_b = cv2.boxFilter(b, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT)

    q = mean_a * guide_gray_float + mean_b
    return np.clip(q, 0.0, 1.0)


def _get_head_protection_mask(rgb_uint8: np.ndarray) -> Optional[np.ndarray]:
    """
    Generates a binary protection mask (1 inside head/ear region, 0 elsewhere)
    to prevent aggressive erosion and accidental background bleaching of ears, earlobes, and hair contours.
    """
    if rgb_uint8 is None or len(rgb_uint8.shape) != 3:
        return None
    h, w = rgb_uint8.shape[:2]

    # 1. MediaPipe Face Detection
    try:
        import mediapipe as mp

        mp_fd = getattr(mp.solutions, "face_detection", None)
        if mp_fd:
            with mp_fd.FaceDetection(min_detection_confidence=0.40, model_selection=1) as fd:
                res = fd.process(rgb_uint8)
                if res and res.detections:
                    det = max(
                        res.detections,
                        key=lambda d: d.location_data.relative_bounding_box.width
                        * d.location_data.relative_bounding_box.height,
                    )
                    bbox = det.location_data.relative_bounding_box
                    fx = int(bbox.xmin * w)
                    fy = int(bbox.ymin * h)
                    fw = int(bbox.width * w)
                    fh = int(bbox.height * h)

                    # Expand laterally by 45% on each side (covers left and right ears completely)
                    # Expand vertically: 50% above (hair crown) and 20% below (jaw/lobes)
                    hx1 = max(0, int(fx - 0.45 * fw))
                    hx2 = min(w, int(fx + fw + 0.45 * fw))
                    hy1 = max(0, int(fy - 0.50 * fh))
                    hy2 = min(h, int(fy + fh + 0.20 * fh))

                    mask = np.zeros((h, w), dtype=np.uint8)
                    mask[hy1:hy2, hx1:hx2] = 1
                    return mask
    except Exception as e:
        logger.debug(f"[Matting] MP head protection fallback: {e}")

    # 2. Secondary Fallback: Haar Cascade
    try:
        from app.core.cascade import safe_load_cascade

        gray = cv2.cvtColor(rgb_uint8, cv2.COLOR_RGB2GRAY)
        cascade = safe_load_cascade("haarcascade_frontalface_default.xml")
        if not cascade.empty():
            faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
            if len(faces) > 0:
                fx, fy, fw, fh = max(faces, key=lambda r: r[2] * r[3])
                hx1 = max(0, int(fx - 0.45 * fw))
                hx2 = min(w, int(fx + fw + 0.45 * fw))
                hy1 = max(0, int(fy - 0.50 * fh))
                hy2 = min(h, int(fy + fh + 0.20 * fh))
                mask = np.zeros((h, w), dtype=np.uint8)
                mask[hy1:hy2, hx1:hx2] = 1
                return mask
    except Exception as e:
        logger.debug(f"[Matting] Cascade head protection fallback: {e}")

    return None


def refine_alpha(rgb_uint8: np.ndarray, alpha_uint8: np.ndarray) -> np.ndarray:
    """
    Refines alpha channel using Guided Image Filtering across an adaptive unknown boundary band:
    1. Uses conservative band radius to preserve delicate anatomical structures (ears, earlobes, fine hair).
    2. Protects the head/ear anatomical zone so ears can never be eroded or washed out.
    3. Runs guided filtering using high-frequency RGB luminance as guide.
    4. Preserves sure-foreground (255) and sure-background (0) unmodified.
    5. Cleans isolated floating noise blobs while preserving connected hair wisps.
    """
    if rgb_uint8 is None or alpha_uint8 is None:
        return alpha_uint8

    h, w = alpha_uint8.shape[:2]
    if h < 4 or w < 4:
        return alpha_uint8

    # Adaptive narrow band radius (~0.35% of shorter side, clamped [2, 6] px)
    # Using a narrow band prevents eroding delicate ear cartilage & earlobe contours
    band_radius = max(2, min(6, int(min(h, w) * 0.0035)))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * band_radius + 1, 2 * band_radius + 1))

    # Base foreground seed (confidence threshold 160)
    fg_seed = (alpha_uint8 >= 160).astype(np.uint8)

    # Anatomical Head & Ear Protection:
    head_mask = _get_head_protection_mask(rgb_uint8)
    if head_mask is not None:
        # Morphological closing inside head/ear zone to seal any micro-notches in ears/hair
        k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        closed_head = cv2.morphologyEx((alpha_uint8 >= 100).astype(np.uint8), cv2.MORPH_CLOSE, k_close)
        fg_seed = np.maximum(fg_seed, closed_head * head_mask)

    # Compute sure-foreground and sure-background
    sure_fg = cv2.erode(fg_seed, kernel)
    if head_mask is not None:
        # Inside the head/ear zone, keep solid foreground intact (zero aggressive erosion)
        sure_fg = np.maximum(sure_fg, (fg_seed * head_mask))

    sure_bg = cv2.dilate((alpha_uint8 <= 15).astype(np.uint8), kernel)
    if head_mask is not None:
        # Never let sure_bg encroach on head/ear area where subject is present
        sure_bg = np.where((head_mask > 0) & (alpha_uint8 > 25), 0, sure_bg)

    unknown_band = (sure_fg == 0) & (sure_bg == 0)

    # Normalize guide and source
    if len(rgb_uint8.shape) == 3 and rgb_uint8.shape[2] >= 3:
        guide_gray = cv2.cvtColor(rgb_uint8[:, :, :3], cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    else:
        guide_gray = rgb_uint8.astype(np.float32) / 255.0

    src_alpha = alpha_uint8.astype(np.float32) / 255.0

    # Execute Guided Filter
    gf_alpha = guided_filter(guide_gray, src_alpha, radius=band_radius, eps=1e-4)
    gf_alpha_uint8 = (gf_alpha * 255.0).astype(np.uint8)

    # Blend: apply refined alpha strictly inside unknown band
    refined_alpha = alpha_uint8.copy()
    refined_alpha[unknown_band] = gf_alpha_uint8[unknown_band]
    refined_alpha[sure_fg > 0] = 255
    refined_alpha[sure_bg > 0] = 0

    # Gentle morphological cleanup of tiny disconnected floating specks
    binary_fg = (refined_alpha > 20).astype(np.uint8)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary_fg, connectivity=8)
    if num_labels > 2:
        areas = stats[1:, cv2.CC_STAT_AREA]
        max_area = np.max(areas)
        min_keep_area = max(100, int(max_area * 0.002))
        keep_labels = [i + 1 for i, a in enumerate(areas) if a >= min_keep_area]
        keep_mask = np.isin(labels, keep_labels)
        refined_alpha = np.where(keep_mask, refined_alpha, 0).astype(np.uint8)

    return refined_alpha


def decontaminate_edges(rgba_np: np.ndarray) -> np.ndarray:
    """
    High-Fidelity Edge Color Decontamination:
    Replaces background color bleed/spill in semi-transparent edge pixels (0 < alpha < 250)
    with true estimated foreground colors propagated from nearby sure-foreground pixels (alpha >= 250).
    Uses vectorized multi-scale normalized convolution (zero Python loops over pixels).
    """
    if not isinstance(rgba_np, np.ndarray) or len(rgba_np.shape) != 3 or rgba_np.shape[2] != 4:
        return rgba_np

    h, w = rgba_np.shape[:2]
    if h < 4 or w < 4:
        return rgba_np

    rgb = rgba_np[:, :, :3].astype(np.float32)
    alpha = rgba_np[:, :, 3]

    sure_fg_mask = (alpha >= 250).astype(np.float32)
    fg_pixel_count = np.sum(sure_fg_mask)
    if fg_pixel_count < 50:
        return rgba_np

    # Multi-scale normalized convolution
    # Scale 1: Fine local radius
    r1 = max(3, int(min(h, w) * 0.006))
    k1 = (2 * r1 + 1, 2 * r1 + 1)
    num1 = cv2.boxFilter(rgb * sure_fg_mask[:, :, None], cv2.CV_32F, k1, borderType=cv2.BORDER_REFLECT)
    den1 = cv2.boxFilter(sure_fg_mask, cv2.CV_32F, k1, borderType=cv2.BORDER_REFLECT)[:, :, None]
    fg_color1 = np.where(den1 > 1e-4, num1 / np.maximum(den1, 1e-4), rgb)

    # Scale 2: Coarse broad radius (recovers hair strands extending further from core body)
    r2 = max(11, int(min(h, w) * 0.025))
    k2 = (2 * r2 + 1, 2 * r2 + 1)
    num2 = cv2.boxFilter(rgb * sure_fg_mask[:, :, None], cv2.CV_32F, k2, borderType=cv2.BORDER_REFLECT)
    den2 = cv2.boxFilter(sure_fg_mask, cv2.CV_32F, k2, borderType=cv2.BORDER_REFLECT)[:, :, None]
    fg_color2 = np.where(den2 > 1e-4, num2 / np.maximum(den2, 1e-4), rgb)

    # Combine multi-scale propagated foreground colors
    fg_color = np.where(den1 > 1e-4, fg_color1, fg_color2)

    # Apply decontamination strictly to semi-transparent edge pixels
    edge_pixels = (alpha > 0) & (alpha < 250)
    decont_rgb = np.where(edge_pixels[:, :, None], np.clip(fg_color, 0, 255), rgb)

    return np.dstack([decont_rgb.astype(np.uint8), alpha])
