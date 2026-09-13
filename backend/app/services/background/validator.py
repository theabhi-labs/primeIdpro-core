import cv2
import numpy as np
import logging

logger = logging.getLogger("primeidpro.background")

def validate_bg_removal(original_image: np.ndarray, alpha_mask: np.ndarray) -> dict:
    """
    Validates the quality of a generated alpha mask against the original image.
    Uses deterministic computer-vision metrics to evaluate foreground quality,
    edges, holes, and noise.
    
    Returns:
        dict: {
            "score": int (0-100),
            "decision": str ("good" | "cloud"),
            "reasons": list of strings,
            "metrics": dict
        }
    """
    try:
        # Ensure alpha mask is 2D and original image is valid
        if len(alpha_mask.shape) > 2:
            alpha_mask = alpha_mask[:, :, 0] if alpha_mask.shape[2] > 1 else alpha_mask.squeeze()
            
        h, w = alpha_mask.shape[:2]
        total_pixels = h * w
        if total_pixels == 0:
            return _fail("zero_pixels")

        reasons = []
        
        # 1. Foreground Sanity (Max 15 points)
        # Check if foreground occupies an abnormal percentage of the image.
        fg_pixels = np.count_nonzero(alpha_mask > 128)
        fg_ratio = fg_pixels / total_pixels
        fg_sanity_score = 15
        if fg_ratio < 0.05:
            fg_sanity_score = 0
            reasons.append("tiny_foreground")
        elif fg_ratio > 0.95:
            fg_sanity_score = 5
            reasons.append("excessive_foreground")
        elif fg_ratio < 0.10 or fg_ratio > 0.85:
            fg_sanity_score = 10
            
        # 2. Connected Components (Max 15 points)
        # Penalize excessive disconnected components (floating blobs)
        binary_mask = (alpha_mask > 128).astype(np.uint8)
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(binary_mask, connectivity=8)
        
        # Ignore background (label 0)
        num_components = num_labels - 1 
        cc_score = 15
        if num_components > 5:
            cc_score = max(0, 15 - (num_components - 5) * 2)
            reasons.append(f"high_fragmentation({num_components}_components)")
        elif num_components > 2:
            cc_score = 12

        # Find the largest connected component (main subject)
        largest_comp_area = 0
        main_label = -1
        if num_components > 0:
            areas = stats[1:, cv2.CC_STAT_AREA]
            largest_comp_area = np.max(areas)
            main_label = np.argmax(areas) + 1
            
            # If the largest component is a small fraction of the total foreground, it's very fragmented
            if largest_comp_area / fg_pixels < 0.5:
                cc_score -= 5
                reasons.append("fragmented_main_subject")

        # 3. Holes / Fragmentation (Max 15 points)
        # Detect suspicious holes inside the foreground
        holes_score = 15
        if main_label != -1:
            main_subject_mask = (labels == main_label).astype(np.uint8)
            # Find contours of the main subject
            contours, hierarchy = cv2.findContours(main_subject_mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
            
            internal_holes = 0
            hole_area = 0
            if hierarchy is not None:
                for i in range(len(contours)):
                    # hierarchy[0][i][3] is the parent contour index. If it has a parent, it's a hole.
                    if hierarchy[0][i][3] != -1:
                        internal_holes += 1
                        hole_area += cv2.contourArea(contours[i])
                        
            # Penalize large abnormal holes
            if hole_area / (largest_comp_area + 1e-5) > 0.1:
                holes_score -= 10
                reasons.append("large_internal_holes")
            elif internal_holes > 10:
                holes_score -= 5
                reasons.append("many_internal_holes")
        
        # 4. Edge Quality (Max 20 points)
        # Evaluate contour quality for excessive jaggedness
        edge_score = 20
        if main_label != -1:
            contours, _ = cv2.findContours(main_subject_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if contours:
                main_contour = max(contours, key=cv2.contourArea)
                perimeter = cv2.arcLength(main_contour, True)
                area = cv2.contourArea(main_contour)
                
                # Perimeter to Area ratio (adjusted for scale)
                if area > 0:
                    complexity = (perimeter * perimeter) / (4 * np.pi * area)
                    # A perfect circle is 1. Human shapes are usually 1.5 - 5. Very jagged is > 10.
                    if complexity > 10:
                        edge_score = max(0, 20 - int((complexity - 10) * 1.5))
                        if edge_score < 20:
                            reasons.append(f"high_edge_complexity({round(complexity,1)})")

        # 5. Alpha Distribution / Noise (Max 15 points)
        # Analyze transparent, opaque, and semi-transparent pixels
        alpha_score = 15
        semi_transparent = np.count_nonzero((alpha_mask > 10) & (alpha_mask < 245))
        semi_ratio = semi_transparent / (fg_pixels + 1e-5)
        
        # Natural hair/edges require some soft transitions, but >25% semi-transparent is usually a bad mask
        if semi_ratio > 0.25:
            alpha_score = 0
            reasons.append("excessive_alpha_noise")
        elif semi_ratio > 0.15:
            alpha_score = 5
            reasons.append("high_alpha_noise")
        elif semi_ratio > 0.08:
            alpha_score = 10

        # 6. Bounding Box Sanity (Max 10 points)
        # Check bounding box
        bbox_score = 10
        if main_label != -1:
            x, y, bw, bh = stats[main_label, cv2.CC_STAT_LEFT: cv2.CC_STAT_HEIGHT+1]
            if bw < w * 0.1 or bh < h * 0.1:
                bbox_score -= 5
                reasons.append("tiny_bounding_box")
                
        # 7. Original + Mask Consistency (Max 10 points)
        # Check if the face is centered within the mask, and not capturing excess background.
        consistency_score = 10
        try:
            from app.core.cascade import get_cv2_data_path
            # Fallback to general cv2 cascades if get_cv2_data_path is unavailable or fails
            gray = cv2.cvtColor(original_image, cv2.COLOR_RGB2GRAY)
            cascade_path = get_cv2_data_path("haarcascade_frontalface_default.xml")
            cascade = cv2.CascadeClassifier(cascade_path)
            if not cascade.empty():
                faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
                if len(faces) > 0 and main_label != -1:
                    fx, fy, fw, fh = max(faces, key=lambda r: r[2] * r[3])
                    fcx = fx + fw / 2
                    
                    bx, by, bw, bh = stats[main_label, cv2.CC_STAT_LEFT: cv2.CC_STAT_HEIGHT+1]
                    bcx = bx + bw / 2
                    
                    # If face is highly off-center relative to the foreground mask, it means
                    # the mask grabbed a huge chunk of background on one side (e.g. an extra arm).
                    offset_ratio = abs(fcx - bcx) / float(bw + 1e-5)
                    if offset_ratio > 0.15:  # Face is more than 15% off-center in the mask
                        penalty = min(10, int((offset_ratio - 0.15) * 50))
                        consistency_score = max(0, consistency_score - penalty)
                        reasons.append(f"face_off_center_in_mask({round(offset_ratio, 2)})")
                        
                    # Check if mask extends abnormally far above the face (capturing background above head)
                    # Natural hair might extend up to 1x face height above the face. > 1.5x is highly suspicious.
                    if by < fy - fh * 1.5:
                        consistency_score = max(0, consistency_score - 5)
                        reasons.append("abnormal_headroom_in_mask")
        except Exception as face_err:
            logger.debug(f"Face check failed in validator: {face_err}")
        
        # Total Score calculation
        total_score = max(0, min(100, int(
            fg_sanity_score + 
            cc_score + 
            holes_score + 
            edge_score + 
            alpha_score + 
            bbox_score + 
            consistency_score
        )))
        
        decision = "good" if total_score >= 85 else "cloud"
        
        metrics = {
            "fg_ratio": round(fg_ratio, 3),
            "num_components": num_components,
            "semi_transparent_ratio": round(semi_ratio, 3)
        }
        
        return {
            "score": total_score,
            "decision": decision,
            "reasons": reasons,
            "metrics": metrics
        }
        
    except Exception as e:
        logger.error(f"Validator error: {e}")
        # Phase 8: If validator fails, we fallback to Cloud if allowed, so return 0
        return _fail("validator_exception")


def _fail(reason: str) -> dict:
    return {
        "score": 0,
        "decision": "cloud",
        "reasons": [reason],
        "metrics": {}
    }
