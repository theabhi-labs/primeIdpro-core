import cv2
import numpy as np
import logging
from typing import Tuple, List, Dict, Any

logger = logging.getLogger("primeidpro.background")


def mask_quality_score(rgb: np.ndarray, alpha: np.ndarray) -> Tuple[float, List[str], Dict[str, Any]]:
    """
    Evaluates the quality of a generated alpha mask using deterministic, high-speed CV metrics:
    1. Foreground area ratio sanity
    2. Connected components & subject dominance (floating clutter vs solid subject)
    3. Internal holes / missing body parts inside the foreground silhouette
    4. Alpha edge sharpness and contour smoothness
    5. Fraction of unknown/semi-transparent (0 < alpha < 255) pixels

    Returns:
        (score: float [0.0 .. 1.0], reasons: List[str], metrics: Dict[str, Any])
    """
    try:
        if not isinstance(alpha, np.ndarray) or alpha.size == 0:
            return 0.0, ["empty_alpha_array"], {"final_score": 0.0}

        if len(alpha.shape) > 2:
            alpha = alpha[:, :, 0] if alpha.shape[2] > 1 else alpha.squeeze()

        h, w = alpha.shape[:2]
        total_pixels = h * w
        if total_pixels == 0:
            return 0.0, ["zero_pixels"], {"final_score": 0.0}

        reasons: List[str] = []

        fg_pixels = int(np.count_nonzero(alpha > 128))
        fg_ratio = fg_pixels / float(total_pixels)

        # 0. Check immediate empty failure
        if fg_ratio < 0.03:
            return 0.0, [f"tiny_foreground({fg_ratio:.3f})"], {
                "fg_ratio": round(fg_ratio, 3),
                "num_components": 0,
                "dominance": 0.0,
                "hole_ratio": 0.0,
                "semi_ratio": 0.0,
                "final_score": 0.0,
            }

        # 1. Foreground Ratio Sanity (weight: 0.25)
        if fg_ratio > 0.95:
            s_fg = 0.0
            reasons.append(f"excessive_foreground({fg_ratio:.2f})")
        elif fg_ratio < 0.08:
            s_fg = max(0.2, (fg_ratio - 0.03) / 0.05)
            reasons.append(f"small_foreground({fg_ratio:.2f})")
        elif fg_ratio > 0.85:
            s_fg = max(0.3, (0.95 - fg_ratio) / 0.10)
            reasons.append(f"large_foreground({fg_ratio:.2f})")
        else:
            s_fg = 1.0

        # 2. Connected Components & Dominance (weight: 0.25)
        binary_mask = (alpha > 128).astype(np.uint8)
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(binary_mask, connectivity=8)
        num_components = num_labels - 1

        s_cc = 1.0
        largest_area = 0
        main_label = -1
        hole_ratio = 0.0
        num_holes = 0
        dominance = 0.0

        if num_components <= 0:
            return 0.0, ["no_foreground_components"], {
                "fg_ratio": round(fg_ratio, 3),
                "final_score": 0.0,
            }

        areas = stats[1:, cv2.CC_STAT_AREA]
        largest_area = int(np.max(areas))
        main_label = int(np.argmax(areas)) + 1
        dominance = largest_area / float(fg_pixels + 1e-5)

        if num_components > 5:
            penalty = min(0.8, (num_components - 5) * 0.12)
            s_cc = max(0.0, s_cc - penalty)
            reasons.append(f"fragmentation({num_components}_components)")
        elif num_components > 2:
            s_cc -= 0.15

        if dominance < 0.75:
            s_cc = max(0.0, s_cc - (0.75 - dominance) * 1.8)
            reasons.append(f"split_subject(dom={dominance:.2f})")

        # 3. Internal Holes in Main Body (weight: 0.20)
        s_holes = 1.0
        main_mask = (labels == main_label).astype(np.uint8)
        contours, hierarchy = cv2.findContours(main_mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        if hierarchy is not None:
            for i in range(len(contours)):
                if hierarchy[0][i][3] != -1:  # has parent -> hole inside body
                    num_holes += 1
                    hole_ratio += cv2.contourArea(contours[i])
            hole_ratio = hole_ratio / float(largest_area + 1e-5)

            if hole_ratio > 0.08:
                s_holes = max(0.0, 1.0 - (hole_ratio / 0.18))
                reasons.append(f"large_internal_holes({hole_ratio*100:.1f}%)")
            elif num_holes > 8:
                s_holes = max(0.2, 1.0 - (num_holes * 0.06))
                reasons.append(f"many_internal_holes({num_holes})")

        # 4. Alpha Edge Sharpness & Smoothness (weight: 0.15)
        s_edge = 1.0
        if contours:
            main_contour = max(contours, key=cv2.contourArea)
            perimeter = cv2.arcLength(main_contour, True)
            area = cv2.contourArea(main_contour)
            if area > 0:
                complexity = (perimeter * perimeter) / (4.0 * np.pi * area)
                if complexity > 16.0:
                    s_edge = max(0.2, 1.0 - (complexity - 16.0) * 0.06)
                    reasons.append(f"jagged_edges(c={complexity:.1f})")

        # 5. Unknown / Semi-Transparent Pixels Fraction (weight: 0.15)
        semi_count = int(np.count_nonzero((alpha > 10) & (alpha < 245)))
        semi_ratio = semi_count / float(fg_pixels + 1e-5)
        if semi_ratio > 0.25:
            s_alpha = 0.1
            reasons.append(f"excessive_alpha_uncertainty({semi_ratio*100:.1f}%)")
        elif semi_ratio > 0.15:
            s_alpha = 0.5
            reasons.append(f"high_alpha_uncertainty({semi_ratio*100:.1f}%)")
        elif semi_ratio > 0.08:
            s_alpha = 0.8
        else:
            s_alpha = 1.0

        raw_score = (
            0.25 * s_fg +
            0.25 * s_cc +
            0.20 * s_holes +
            0.15 * s_edge +
            0.15 * s_alpha
        )

        # Structural sanity dampeners
        if fg_ratio > 0.95:
            raw_score *= 0.15
        if dominance < 0.60:
            raw_score *= max(0.1, dominance / 0.60)

        final_score = max(0.0, min(1.0, float(raw_score)))
        metrics = {
            "fg_ratio": round(fg_ratio, 3),
            "num_components": num_components,
            "dominance": round(dominance, 3),
            "hole_ratio": round(hole_ratio, 3),
            "semi_ratio": round(semi_ratio, 3),
            "final_score": round(final_score, 3),
        }
        return round(final_score, 3), reasons, metrics

    except Exception as e:
        logger.error(f"[Validator] Quality score exception: {e}", exc_info=True)
        return 0.0, [f"exception_{type(e).__name__}"], {"final_score": 0.0}


def validate_bg_removal(original_image: np.ndarray, alpha_mask: np.ndarray) -> dict:
    """
    Backward-compatible wrapper for legacy validator calls.
    Returns:
        dict: {
            "score": int (0-100),
            "decision": str ("good" | "cloud"),
            "reasons": list of strings,
            "metrics": dict
        }
    """
    score_01, reasons, metrics = mask_quality_score(original_image, alpha_mask)
    score_100 = int(round(score_01 * 100))
    decision = "good" if score_100 >= 60 else "cloud"

    return {
        "score": score_100,
        "decision": decision,
        "reasons": reasons,
        "metrics": metrics,
    }
