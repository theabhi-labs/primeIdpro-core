import os
import cv2
import re
import fitz  # PyMuPDF
from PIL import Image, ImageOps
import pytesseract
import numpy as np
import uuid

# Fix 1: Named constant for defensive inward margin shrink percentage
DOC_QUAD_INWARD_SHRINK_PERCENT = 0.018  # 1.8% inward margin shrink towards centroid

def shrink_quad_inward(quad: np.ndarray, shrink_pct: float = DOC_QUAD_INWARD_SHRINK_PERCENT) -> np.ndarray:
    """
    Fix 1: Shrinks the 4-point quad slightly inward towards its centroid by shrink_pct.
    Guarantees that no background table/floor pixels are included in the warp.
    """
    if quad is None or len(quad) != 4:
        return quad
    center = np.mean(quad, axis=0)
    shrunk = np.zeros_like(quad, dtype=np.float32)
    for i in range(4):
        pt = quad[i]
        shrunk[i] = pt + (center - pt) * shrink_pct
    return shrunk

def order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]

    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect

def four_point_transform(image: np.ndarray, pts: np.ndarray) -> np.ndarray:
    """
    Extracts a perspective-corrected quadrilateral region from an image.
    """
    rect = order_points(pts)
    (tl, tr, br, bl) = rect

    widthA = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
    widthB = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
    maxWidth = max(int(widthA), int(widthB))

    heightA = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
    heightB = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
    maxHeight = max(int(heightA), int(heightB))

    if maxWidth < 50 or maxHeight < 50:
        return image

    dst = np.array([
        [0, 0],
        [maxWidth - 1, 0],
        [maxWidth - 1, maxHeight - 1],
        [0, maxHeight - 1]], dtype="float32")

    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight), flags=cv2.INTER_LANCZOS4)
    return warped

def detect_face(image_np: np.ndarray, face_cascade) -> bool:
    """
    Uses the pre-loaded Haar Cascade to detect if a face is present.
    """
    if face_cascade is None or image_np is None or image_np.size == 0:
        return False
    try:
        gray = cv2.cvtColor(image_np, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=3, minSize=(18, 18))
        return len(faces) > 0
    except Exception:
        return False

def detect_face_rects(image_np: np.ndarray, face_cascade) -> list:
    """
    Returns detected face bounding boxes [(x, y, w, h), ...].
    """
    if face_cascade is None or image_np is None or image_np.size == 0:
        return []
    try:
        gray = cv2.cvtColor(image_np, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=3, minSize=(18, 18))
        return faces
    except Exception:
        return []

def detect_qr_code(img_bgr: np.ndarray) -> bool:
    """Detects if an image region contains a QR code or dense 2D barcode."""
    if img_bgr is None or img_bgr.size == 0:
        return False
    try:
        detector = cv2.QRCodeDetector()
        val, pts, _ = detector.detectAndDecode(img_bgr)
        if pts is not None and len(pts) > 0:
            return True
    except Exception:
        pass
    try:
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 3)
        contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        qr_like = 0
        h, w = img_bgr.shape[:2]
        total_area = h * w
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if 300 < area < (total_area * 0.40):
                bx, by, bw, bh = cv2.boundingRect(cnt)
                aspect = bw / float(bh)
                if 0.75 <= aspect <= 1.30:
                    qr_like += 1
        return qr_like >= 2
    except Exception:
        return False

def auto_orient_card(card_bgr: np.ndarray, face_cascade=None) -> np.ndarray:
    """
    Ensures the ID card is oriented landscape and right-side up.
    1. Landscape normalization (rotates 90 deg clockwise if portrait).
    2. 180-degree flip detection using Aadhaar/Govt header tricolor bands and Haar face detector.
    """
    try:
        h, w = card_bgr.shape[:2]
        # 1. Normalize portrait to landscape
        if h > w:
            card_bgr = cv2.rotate(card_bgr, cv2.ROTATE_90_CLOCKWISE)
            h, w = card_bgr.shape[:2]

        # 2. Check 180-degree flip
        top_band = card_bgr[0:int(h * 0.32), :]
        bot_band = card_bgr[int(h * 0.68):, :]

        hsv_top = cv2.cvtColor(top_band, cv2.COLOR_BGR2HSV)
        hsv_bot = cv2.cvtColor(bot_band, cv2.COLOR_BGR2HSV)

        green_top = np.sum((hsv_top[:, :, 0] >= 35) & (hsv_top[:, :, 0] <= 85) & (hsv_top[:, :, 1] > 40))
        green_bot = np.sum((hsv_bot[:, :, 0] >= 35) & (hsv_bot[:, :, 0] <= 85) & (hsv_bot[:, :, 1] > 40))

        saffron_top = np.sum((hsv_top[:, :, 0] >= 5) & (hsv_top[:, :, 0] <= 25) & (hsv_top[:, :, 1] > 60))
        saffron_bot = np.sum((hsv_bot[:, :, 0] >= 5) & (hsv_bot[:, :, 0] <= 25) & (hsv_bot[:, :, 1] > 60))

        tricolor_top = green_top * 2 + saffron_top
        tricolor_bot = green_bot * 2 + saffron_bot

        if tricolor_bot > tricolor_top * 1.30 and tricolor_bot > 3000:
            return cv2.rotate(card_bgr, cv2.ROTATE_180)

        # Face detection check
        if face_cascade is not None:
            try:
                gray = cv2.cvtColor(card_bgr, cv2.COLOR_BGR2GRAY)
                faces_0 = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=3, minSize=(30, 30))
                gray_180 = cv2.rotate(gray, cv2.ROTATE_180)
                faces_180 = face_cascade.detectMultiScale(gray_180, scaleFactor=1.1, minNeighbors=3, minSize=(30, 30))

                if len(faces_180) > 0 and len(faces_0) == 0:
                    return cv2.rotate(card_bgr, cv2.ROTATE_180)
                elif len(faces_0) > 0:
                    fx, fy, fw, fh = faces_0[0]
                    if (fy + fh / 2) > h * 0.55:
                        return cv2.rotate(card_bgr, cv2.ROTATE_180)
            except Exception:
                pass

        return card_bgr
    except Exception:
        return card_bgr

def detect_document_quad(img_bgr: np.ndarray) -> np.ndarray | None:
    """
    Intelligent Autonomous Document Boundary & Corner Detector:
    Uses a multi-scale, multi-method ensemble (Paper Luminance Thresholding +
    Adaptive Gaussian + Otsu Grayscale/Saturation + Multi-threshold Canny +
    Bilateral Filtering + RETR_LIST Contour Hierarchy + Convex Polygon Approximation)
    to detect exact 4-corner document vertices inside binders/folders, on granite/marble floors,
    wooden tables, cloth/bedsheets, and desks.
    """
    try:
        h, w = img_bgr.shape[:2]
        if h < 100 or w < 100:
            return None

        scale = 900.0 / max(h, w)
        small = cv2.resize(img_bgr, (int(w * scale), int(h * scale)))
        sh, sw = small.shape[:2]
        total_area = sw * sh

        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        filtered = cv2.bilateralFilter(gray, 9, 75, 75)
        hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
        s_chan = hsv[:, :, 1]

        candidate_masks = []
        # 1. Paper Luminance thresholds (vital for documents on dark binders, folders, wooden/granite floors)
        for th in [70, 90, 110, 130, 150]:
            candidate_masks.append(('lum_th', (gray > th).astype(np.uint8) * 255))

        # 2. Otsu and Adaptive on Grayscale
        _, otsu_gray = cv2.threshold(filtered, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        candidate_masks.append(('otsu_gray', otsu_gray))
        _, otsu_inv = cv2.threshold(filtered, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        candidate_masks.append(('otsu_inv', otsu_inv))

        adapt = cv2.adaptiveThreshold(filtered, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 4)
        candidate_masks.append(('adapt', adapt))

        # 3. HSV Saturation Otsu (separates white/cream paper from colored background/cloth)
        if s_chan.max() - s_chan.min() > 30:
            _, s_otsu = cv2.threshold(s_chan, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            candidate_masks.append(('hsv_s', s_otsu))

        # 4. Multi-threshold Canny
        for c1, c2 in [(20, 80), (30, 100), (50, 150)]:
            candidate_masks.append(('canny', cv2.Canny(filtered, c1, c2)))

        # 5. Color channel Canny
        for i in range(3):
            candidate_masks.append(('col_canny', cv2.Canny(small[:, :, i], 25, 90)))

        best_quad = None
        best_score = 0.0

        for mask_name, m in candidate_masks:
            for k_size in [(9, 9), (15, 15), (21, 21)]:
                close_k = cv2.getStructuringElement(cv2.MORPH_RECT, k_size)
                closed = cv2.morphologyEx(m, cv2.MORPH_CLOSE, close_k, iterations=2)
                opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)), iterations=1)

                # RETR_LIST finds both outer and inner contours (e.g. paper sheet inside binder or on floor)
                contours, _ = cv2.findContours(opened, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
                if not contours:
                    continue
                contours = sorted(contours, key=cv2.contourArea, reverse=True)

                for c in contours[:10]:
                    area = cv2.contourArea(c)
                    if area < total_area * 0.12 or area > total_area * 0.96:
                        continue

                    rect = cv2.minAreaRect(c)
                    rw, rh = rect[1]
                    if rw < 30 or rh < 30:
                        continue

                    aspect = max(rw, rh) / min(rw, rh)
                    # Standard document aspect ratios: Marksheet ~1.0-1.4, A4 ~1.41, Legal ~1.75, Passbook ~1.4-1.6, ID card ~1.58
                    if aspect < 0.92 or aspect > 2.40:
                        continue

                    rect_area = rw * rh
                    solidity = area / max(1.0, rect_area)
                    if solidity < 0.70:
                        continue

                    # Attempt 4-corner polygon approximation
                    hull = cv2.convexHull(c)
                    peri = cv2.arcLength(hull, True)
                    pts = None

                    for factor in [0.015, 0.02, 0.028, 0.038, 0.05]:
                        approx = cv2.approxPolyDP(hull, factor * peri, True)
                        if len(approx) == 4 and cv2.isContourConvex(approx):
                            pts = approx.reshape(4, 2)
                            break

                    # Fallback to minimum area rectangle box points if approximate polygon is notched
                    if pts is None:
                        pts = cv2.boxPoints(rect)

                    # Check internal corner angles (between 55 and 125 degrees)
                    angles = []
                    for i in range(4):
                        p0 = pts[i]
                        p1 = pts[(i + 1) % 4]
                        p2 = pts[(i + 2) % 4]
                        v1 = p0 - p1
                        v2 = p2 - p1
                        cos_angle = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
                        angle = np.degrees(np.arccos(np.clip(cos_angle, -1.0, 1.0)))
                        angles.append(angle)

                    if not all(55 <= a <= 125 for a in angles):
                        continue

                    # Measure average luminance inside candidate
                    mask_c = np.zeros((sh, sw), dtype=np.uint8)
                    cv2.fillPoly(mask_c, [np.int32(pts)], 255)
                    mean_val = cv2.mean(gray, mask=mask_c)[0]

                    # Score candidate: balances area, rectangularity, and paper luminance
                    lum_factor = max(0.4, min(1.3, mean_val / 120.0))
                    score = (area / total_area) * (solidity ** 2) * lum_factor

                    # Center bonus
                    cx, cy = rect[0]
                    dist_from_center = np.sqrt(((cx - sw / 2) / sw) ** 2 + ((cy - sh / 2) / sh) ** 2)
                    center_bonus = 1.0 - (dist_from_center * 0.3)
                    score *= center_bonus

                    if score > best_score:
                        best_score = score
                        best_quad = pts * (1.0 / scale)

        if best_quad is not None:
            best_quad = refine_document_corners(img_bgr, best_quad)

        return best_quad
    except Exception as e:
        print(f"Error detecting document quad: {e}")
        return None

def refine_document_corners(img_bgr: np.ndarray, initial_quad: np.ndarray) -> np.ndarray:
    """
    Fix 2: Sub-pixel corner refinement (cv2.cornerSubPix) + Sobel gradient ray snap + Fix 1 defensive inward margin.
    Snaps initial quad corners directly to the true physical document paper edge
    and shrinks slightly inward towards centroid to eliminate all table/floor background.
    """
    try:
        if initial_quad is None or len(initial_quad) != 4:
            return initial_quad
        h, w = img_bgr.shape[:2]
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        
        # 1. OpenCV cornerSubPix on float32 corner coordinates
        corners_f32 = np.array(initial_quad, dtype=np.float32).reshape(-1, 1, 2)
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)
        try:
            cv2.cornerSubPix(gray, corners_f32, winSize=(7, 7), zeroZone=(-1, -1), criteria=criteria)
            subpix_quad = corners_f32.reshape(4, 2)
        except Exception:
            subpix_quad = initial_quad

        # 2. Gradient magnitude ray search to snap to step-edge
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        grad_x = cv2.Sobel(blurred, cv2.CV_32F, 1, 0, ksize=3)
        grad_y = cv2.Sobel(blurred, cv2.CV_32F, 0, 1, ksize=3)
        grad_mag = np.sqrt(grad_x**2 + grad_y**2)

        center = np.mean(subpix_quad, axis=0)
        refined_quad = np.zeros_like(subpix_quad, dtype=np.float32)
        for i in range(4):
            pt = subpix_quad[i]
            vec = center - pt
            vec_len = np.linalg.norm(vec)
            if vec_len < 1e-5:
                refined_quad[i] = pt
                continue
            unit_vec = vec / vec_len

            best_pos = pt.copy()
            best_grad = 0.0

            for dist in np.linspace(-15, 25, 41):
                sample_pt = pt + unit_vec * dist
                sx, sy = int(round(sample_pt[0])), int(round(sample_pt[1]))
                if 0 <= sx < w and 0 <= sy < h:
                    g_val = grad_mag[sy, sx]
                    lum = gray[sy, sx]
                    score = g_val * (1.0 if lum > 100 else 0.5)
                    if score > best_grad:
                        best_grad = score
                        best_pos = sample_pt

            refined_quad[i] = best_pos

        # 3. Apply defensive inward margin towards centroid (Fix 1)
        final_shrunk_quad = shrink_quad_inward(refined_quad, DOC_QUAD_INWARD_SHRINK_PERCENT)
        return final_shrunk_quad
    except Exception:
        return initial_quad

def check_crop_confidence(img_bgr: np.ndarray, quad: np.ndarray) -> tuple[bool, float]:
    """
    Fix 4: Sanity check: Samples pixel luminance just inside vs just outside the quad boundary.
    Returns (is_low_confidence, mean_contrast_delta).
    """
    try:
        if quad is None or len(quad) != 4:
            return True, 0.0
        h, w = img_bgr.shape[:2]
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        center = np.mean(quad, axis=0)

        deltas = []
        for i in range(4):
            p1 = quad[i]
            p2 = quad[(i + 1) % 4]
            edge_vec = p2 - p1
            edge_len = np.linalg.norm(edge_vec)
            if edge_len < 10:
                continue

            mid = (p1 + p2) / 2.0
            outward_vec = mid - center
            outward_len = np.linalg.norm(outward_vec)
            if outward_len < 1e-5:
                continue
            normal = outward_vec / outward_len

            # Sample at 20%, 40%, 60%, 80% along edge
            for t in [0.20, 0.40, 0.60, 0.80]:
                pt_on_edge = p1 + edge_vec * t
                pt_in = pt_on_edge - normal * 7.0
                pt_out = pt_on_edge + normal * 7.0

                ix, iy = int(round(pt_in[0])), int(round(pt_in[1]))
                ox, oy = int(round(pt_out[0])), int(round(pt_out[1]))

                if 0 <= ix < w and 0 <= iy < h and 0 <= ox < w and 0 <= oy < h:
                    lum_in = float(gray[iy, ix])
                    lum_out = float(gray[oy, ox])
                    deltas.append(abs(lum_in - lum_out))

        if not deltas:
            return True, 0.0

        mean_delta = float(np.mean(deltas))
        # Weak transition if mean contrast delta < 18.0
        is_low_confidence = (mean_delta < 18.0)
        return is_low_confidence, mean_delta
    except Exception:
        return True, 0.0

def enhance_scanned_document(img_bgr: np.ndarray, mode: str = "magic-color") -> np.ndarray:
    """
    CamScanner / Adobe Scan Grade 'Magic Color' Engine:
    1. Multi-scale Background Illumination Division (Per-channel shadow & glare removal -> Pure #FFFFFF paper).
    2. S-Curve Dynamic Range Level Mapping (Deep black text + vibrant official seals/photos).
    3. Chrominance & Vibrancy Boost (Official board logos, stamps, student photos).
    4. Typography High-Boost Unsharp Masking for pristine 300+ DPI physical print quality.
    """
    try:
        if img_bgr is None or img_bgr.size == 0:
            return img_bgr

        h, w = img_bgr.shape[:2]
        if h < 20 or w < 20:
            return img_bgr

        # 1. Background illumination estimation and division per channel
        norm_channels = []
        for i in range(3):
            chan = img_bgr[:, :, i].astype(np.float32)
            k_sz = max(31, int(min(h, w) * 0.08) | 1)
            dilated = cv2.dilate(chan, cv2.getStructuringElement(cv2.MORPH_RECT, (k_sz, k_sz)))
            bg_blur = cv2.medianBlur(dilated.astype(np.uint8), k_sz).astype(np.float32)
            bg_blur = cv2.GaussianBlur(bg_blur, (k_sz, k_sz), 0)

            # Division normalization: img / bg * 255
            norm = np.clip((chan / (bg_blur + 1e-5)) * 255.0, 0, 255)
            norm_channels.append(norm)

        norm_bgr = cv2.merge([c.astype(np.uint8) for c in norm_channels])

        if mode == "crisp-bw":
            gray_n = cv2.cvtColor(norm_bgr, cv2.COLOR_BGR2GRAY)
            bw = cv2.adaptiveThreshold(gray_n, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 21, 10)
            return cv2.cvtColor(bw, cv2.COLOR_GRAY2BGR)

        # 2. Dynamic Range S-Curve / Auto-Levels (Magic Color Levels)
        gray_norm = cv2.cvtColor(norm_bgr, cv2.COLOR_BGR2GRAY)
        p_low = np.percentile(gray_norm, 1.5)
        p_high = np.percentile(gray_norm, 88.0)

        in_min = max(0.0, float(p_low * 0.85))
        in_max = max(in_min + 30.0, min(255.0, float(p_high * 1.05)))

        levels_bgr = np.clip(((norm_bgr.astype(np.float32) - in_min) / (in_max - in_min)) * 255.0, 0, 255).astype(np.uint8)

        # 3. Saturation & Vibrancy Boost for Official Emblems / Stamps / Student Photos
        hsv = cv2.cvtColor(levels_bgr, cv2.COLOR_BGR2HSV)
        h_c, s_c, v_c = cv2.split(hsv)

        s_factor = 1.30 if mode == "magic-color" else 1.50 if mode == "high-contrast" else 1.05
        s_boosted = np.clip(s_c.astype(np.float32) * s_factor, 0, 255).astype(np.uint8)
        v_boosted = np.where(v_c > 220, 255, np.clip(v_c.astype(np.float32) * 1.04, 0, 255)).astype(np.uint8)

        vibrant_hsv = cv2.merge([h_c, s_boosted, v_boosted])
        vibrant_bgr = cv2.cvtColor(vibrant_hsv, cv2.COLOR_HSV2BGR)

        # 4. Typography High-Boost Unsharp Masking
        gaussian = cv2.GaussianBlur(vibrant_bgr, (0, 0), sigmaX=1.1)
        sharpened = cv2.addWeighted(vibrant_bgr, 1.40, gaussian, -0.40, 0)

        # 5. Clean outer border feathering to pure white (#FFFFFF)
        for i in range(4):
            alpha = i / 4.0
            sharpened[i, :] = np.clip(sharpened[i, :].astype(np.float32) * alpha + (1.0 - alpha) * 255, 0, 255).astype(np.uint8)
            sharpened[-(i+1), :] = np.clip(sharpened[-(i+1), :].astype(np.float32) * alpha + (1.0 - alpha) * 255, 0, 255).astype(np.uint8)
            sharpened[:, i] = np.clip(sharpened[:, i].astype(np.float32) * alpha + (1.0 - alpha) * 255, 0, 255).astype(np.uint8)
            sharpened[:, -(i+1)] = np.clip(sharpened[:, -(i+1)].astype(np.float32) * alpha + (1.0 - alpha) * 255, 0, 255).astype(np.uint8)

        return sharpened
    except Exception as e:
        print(f"Error in enhance_scanned_document: {e}")
        return img_bgr

def apply_document_scanner_filter(img_bgr: np.ndarray, target_w: int = 1011, target_h: int = 638, mode: str = "magic-color") -> np.ndarray:
    """Applies document scanner enhancement with optional CR80 resizing."""
    try:
        enhanced = enhance_scanned_document(img_bgr, mode=mode)
        if target_w and target_h:
            h, w = enhanced.shape[:2]
            if (w, h) != (target_w, target_h):
                enhanced = cv2.resize(enhanced, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)
        return enhanced
    except Exception as e:
        print(f"Error in apply_document_scanner_filter: {e}")
        return img_bgr

def enhance_card_image(card_bgr: np.ndarray, target_w: int = 1011, target_h: int = 638) -> np.ndarray:
    """Wrapper that applies the Magic Color document scanner filter at 300 DPI CR80."""
    return apply_document_scanner_filter(card_bgr, target_w, target_h, mode="magic-color")

def apply_fullpage_scanner_filter(img_bgr: np.ndarray, mode: str = "magic-color") -> np.ndarray:
    """Magic Color Scanner Enhancement for Full A4 Documents (Marksheets, Stamp Papers, Certificates, Passbooks)."""
    return enhance_scanned_document(img_bgr, mode=mode)

def rotate_document_image(file_path: str, degrees: int = 90) -> bool:
    """Rotates a document image file in place by 90, 180, or 270 degrees."""
    try:
        if not os.path.exists(file_path):
            return False
        img = cv2.imread(file_path)
        if img is None:
            return False
        
        deg = degrees % 360
        if deg == 90:
            rotated = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
        elif deg == 180:
            rotated = cv2.rotate(img, cv2.ROTATE_180)
        elif deg == 270:
            rotated = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
        else:
            return True
            
        cv2.imwrite(file_path, rotated, [cv2.IMWRITE_JPEG_QUALITY, 96])
        return True
    except Exception as e:
        print(f"Error rotating document {file_path}: {e}")
        return False

def reapply_filter_to_document(file_path: str, mode: str = "magic-color") -> bool:
    """Re-applies a scanner filter mode (magic-color, high-contrast, crisp-bw, natural) to a document file in place."""
    try:
        if not os.path.exists(file_path):
            return False
        img = cv2.imread(file_path)
        if img is None:
            return False
        
        enhanced = enhance_scanned_document(img, mode=mode)
        cv2.imwrite(file_path, enhanced, [cv2.IMWRITE_JPEG_QUALITY, 96])
        return True
    except Exception as e:
        print(f"Error reapplying filter to {file_path}: {e}")
        return False

def find_and_extract_card_boxes(img_bgr: np.ndarray) -> list:
    """
    Finds 1 or 2 ID card bounding quadrilaterals from a camera photo
    (robustly segments cards on bedsheets, tables, desks, colored/red cloth backgrounds).
    """
    try:
        h, w = img_bgr.shape[:2]
        scale = 800.0 / max(h, w)
        small = cv2.resize(img_bgr, (int(w * scale), int(h * scale)))
        sh, sw = small.shape[:2]
        total_area = sw * sh

        # Bilateral filter suppresses fabric weave/cloth texture noise while strictly preserving card step-edges
        filtered = cv2.bilateralFilter(small, 9, 75, 75)
        gray = cv2.cvtColor(filtered, cv2.COLOR_BGR2GRAY)
        hsv = cv2.cvtColor(filtered, cv2.COLOR_BGR2HSV)
        s_chan = hsv[:, :, 1]

        candidate_masks = []
        candidate_masks.append(cv2.Canny(gray, 30, 100))
        candidate_masks.append(cv2.Canny(gray, 50, 150))

        b_edges = cv2.Canny(filtered[:, :, 0], 30, 100)
        g_edges = cv2.Canny(filtered[:, :, 1], 30, 100)
        r_edges = cv2.Canny(filtered[:, :, 2], 30, 100)
        candidate_masks.append(cv2.bitwise_or(cv2.bitwise_or(b_edges, g_edges), r_edges))

        if s_chan.max() - s_chan.min() > 30:
            _, s_otsu = cv2.threshold(s_chan, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            candidate_masks.append(s_otsu)

        adapt = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 4)
        candidate_masks.append(adapt)
        _, gray_otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        candidate_masks.append(gray_otsu)

        best_found = []

        for raw_mask in candidate_masks:
            close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
            closed = cv2.morphologyEx(raw_mask, cv2.MORPH_CLOSE, close_kernel, iterations=2)
            dilate_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            dilated = cv2.dilate(closed, dilate_kernel, iterations=1)

            contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            contours = sorted(contours, key=cv2.contourArea, reverse=True)

            found = []
            for cnt in contours[:12]:
                area = cv2.contourArea(cnt)
                if area < (total_area * 0.08) or area > (total_area * 0.78):
                    continue

                rect = cv2.minAreaRect(cnt)
                (rw, rh) = rect[1]
                if rw == 0 or rh == 0:
                    continue
                aspect = max(rw, rh) / min(rw, rh)
                if 1.20 <= aspect <= 2.20:
                    hull = cv2.convexHull(cnt)
                    peri = cv2.arcLength(hull, True)
                    approx = None
                    for factor in [0.015, 0.02, 0.025, 0.03, 0.035, 0.04]:
                        app = cv2.approxPolyDP(hull, factor * peri, True)
                        if len(app) == 4:
                            approx = app
                            break

                    if approx is not None and len(approx) == 4:
                        orig_pts = approx.reshape(4, 2) * (1.0 / scale)
                    else:
                        box = cv2.boxPoints(rect)
                        orig_pts = box * (1.0 / scale)
                    found.append((area, orig_pts, rect[0]))

            if len(found) >= 2 and found[1][0] >= found[0][0] * 0.35:
                c1, c2 = found[0][2], found[1][2]
                if abs(c1[1] - c2[1]) > abs(c1[0] - c2[0]):
                    sorted_boxes = sorted([found[0], found[1]], key=lambda x: x[2][1])
                else:
                    sorted_boxes = sorted([found[0], found[1]], key=lambda x: x[2][0])
                return [sorted_boxes[0][1], sorted_boxes[1][1]]
            elif len(found) >= 1 and len(best_found) == 0:
                best_found = [found[0][1]]

        return best_found
    except Exception as e:
        print(f"Error finding card boxes: {e}")
        return []

def trim_card_margins(img_bgr: np.ndarray, tol: int = 240) -> np.ndarray:
    """
    Intelligently trims outer background margins (scanner beds, colored cloth, tables).
    """
    try:
        h, w = img_bgr.shape[:2]
        if h < 50 or w < 50:
            return img_bgr

        top_strip = img_bgr[0:max(2, int(h * 0.04)), :]
        bot_strip = img_bgr[min(h - 2, int(h * 0.96)):, :]
        left_strip = img_bgr[:, 0:max(2, int(w * 0.04))]
        right_strip = img_bgr[:, min(w - 2, int(w * 0.96)):]

        border_pixels = np.vstack([
            top_strip.reshape(-1, 3),
            bot_strip.reshape(-1, 3),
            left_strip.reshape(-1, 3),
            right_strip.reshape(-1, 3)
        ])

        bg_color = np.median(border_pixels, axis=0)
        bg_std = np.std(border_pixels, axis=0)
        bg_gray = 0.299 * bg_color[2] + 0.587 * bg_color[1] + 0.114 * bg_color[0]

        if bg_gray > 225 and np.mean(bg_std) < 25:
            gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
            mask = (gray < 230).astype(np.uint8) * 255
        elif bg_gray < 35 and np.mean(bg_std) < 20:
            gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
            mask = (gray > 45).astype(np.uint8) * 255
        else:
            diff = np.abs(img_bgr.astype(np.float32) - bg_color.astype(np.float32))
            dist = np.sqrt(np.sum(diff ** 2, axis=2))
            thresh_val = max(35.0, float(np.mean(bg_std) * 3.0))
            mask = (dist > thresh_val).astype(np.uint8) * 255

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        cleaned = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, kernel)

        coords = np.argwhere(cleaned > 0)
        if coords.size > 0:
            y0, x0 = coords.min(axis=0)
            y1, x1 = coords.max(axis=0) + 1
            if (y1 - y0) > h * 0.25 and (x1 - x0) > w * 0.25:
                pad = 4
                y0 = max(0, y0 - pad)
                x0 = max(0, x0 - pad)
                y1 = min(h, y1 + pad)
                x1 = min(w, x1 + pad)
                cropped = img_bgr[y0:y1, x0:x1]
                ch, cw = cropped.shape[:2]
                if ch > 20 and cw > 20:
                    return cropped[int(ch * 0.02):int(ch * 0.98), int(cw * 0.02):int(cw * 0.98)]

        return img_bgr[int(h * 0.025):int(h * 0.975), int(w * 0.025):int(w * 0.975)]
    except Exception:
        return img_bgr

def extract_id_code(image_np: np.ndarray) -> tuple[str, str]:
    """
    Extracts text via OCR and looks for ID-like patterns if tesseract is available.
    Uses downscaled image and fast timeout to guarantee instantaneous response.
    """
    if image_np is None or image_np.size == 0:
        return None, ""
    try:
        h, w = image_np.shape[:2]
        if max(h, w) > 1000:
            scale = 1000.0 / max(h, w)
            small = cv2.resize(image_np, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
            pil_img = Image.fromarray(cv2.cvtColor(small, cv2.COLOR_BGR2RGB))
        else:
            pil_img = Image.fromarray(cv2.cvtColor(image_np, cv2.COLOR_BGR2RGB))

        text = pytesseract.image_to_string(pil_img, timeout=2.0)
        text_clean = re.sub(r'[^A-Z0-9]', '', text.upper())

        digit_match = re.search(r'\d{8,12}', text_clean)
        if digit_match:
            return digit_match.group(0), text

        pan_match = re.search(r'[A-Z]{5}\d{4}[A-Z]', text_clean)
        if pan_match:
            return pan_match.group(0), text

        words = re.findall(r'[A-Z0-9]{8,15}', text_clean)
        if words:
            return max(words, key=len), text

        return None, text
    except Exception:
        return None, ""

def check_dark_page(image_np: np.ndarray, threshold: int = 65) -> bool:
    """Analyzes an image to see if it's mostly dark/black."""
    try:
        gray = cv2.cvtColor(image_np, cv2.COLOR_BGR2GRAY)
        dark_pixels = np.sum(gray < 50)
        total_pixels = gray.size
        dark_percentage = (dark_pixels / total_pixels) * 100
        return dark_percentage >= threshold
    except Exception:
        return False

def is_pan_card_content(text: str = "", img: np.ndarray = None, face_cascade=None) -> bool:
    """Detects if document is an Indian PAN card."""
    if text:
        t_up = text.upper()
        if 'INCOME TAX' in t_up or 'PERMANENT ACCOUNT' in t_up or 'आयकर' in text:
            return True
        if re.search(r'[A-Z]{5}[0-9]{4}[A-Z]', t_up):
            return True

    if img is not None:
        try:
            h, w = img.shape[:2]
            if h > w:
                img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
                h, w = img.shape[:2]

            aspect = w / float(h)
            if 1.25 <= aspect <= 1.95:
                top_band = img[0:int(h * 0.35), :]
                hsv = cv2.cvtColor(top_band, cv2.COLOR_BGR2HSV)
                blue_px = np.sum((hsv[:, :, 0] >= 95) & (hsv[:, :, 0] <= 130) & (hsv[:, :, 1] > 40) & (hsv[:, :, 2] > 40))
                band_area = top_band.shape[0] * top_band.shape[1]
                blue_ratio = blue_px / float(max(1, band_area))

                has_face_left = detect_face(img[:, 0:int(w * 0.50)], face_cascade)
                has_qr_right = detect_qr_code(img[:, int(w * 0.40):])

                if blue_ratio > 0.12 or (has_face_left and has_qr_right):
                    return True
                if blue_ratio > 0.08 and (has_face_left or has_qr_right):
                    return True
        except Exception:
            pass
    return False

def get_doc_type_label(text: str = "", img: np.ndarray = None) -> str:
    """Matches OCR text or visual color cues against known document and card types."""
    if text:
        text_up = text.upper()
        # Marksheet / Educational Certificate check
        if any(w in text_up for w in ['MARK', 'MARKSHEET', 'SECONDARY', 'BOARD', 'EXAMINATION', 'EDUCATION', 'ROLL NO', 'CBSE', 'RBSE', 'ICSE', 'PRADESH', 'UNIVERSITY', 'DEGREE', 'DIPLOMA', 'RESULT', 'THEORY', 'PRACTICAL']):
            return "Marksheet"
        # Government / Caste / Income Certificate check
        if any(w in text_up for w in ['CERTIFICATE', 'CASTE', 'INCOME', 'DOMICILE', 'NIVAS', 'PRAMAN PATRA', 'GOVERNMENT', 'DISTRICT', 'TAHSIL', 'TEHSIL', 'REVENUE']):
            return "Certificate"
        # Bank Passbook check
        if any(w in text_up for w in ['PASSBOOK', 'BANK', 'ACCOUNT', 'IFSC', 'BRANCH', 'STATEMENT']):
            return "Bank Passbook"
        # Identity Cards check
        if 'आधार' in text or 'UIDAI' in text_up or 'UNIQUE IDENTIFICATION' in text_up or 'AADHAAR' in text_up:
            return "Aadhaar Card"
        if 'निर्वाचन' in text or 'ELECTION' in text_up or 'VOTER' in text_up:
            return "Voter ID"
        if 'आयकर' in text or 'INCOME TAX' in text_up or 'PERMANENT ACCOUNT' in text_up or re.search(r'[A-Z]{5}[0-9]{4}[A-Z]', text_up):
            return "PAN Card"
        if 'DRIVING' in text_up or 'TRANSPORT' in text_up or 'LICENSE' in text_up or 'LICENCE' in text_up:
            return "Driving License"

    if img is not None:
        try:
            h, w = img.shape[:2]
            aspect = w / float(h)

            # If document is vertical (portrait A4 format), it is NEVER an ID card!
            if aspect < 0.95:
                is_full, f_label = detect_full_page_document(img)
                return f_label if is_full else "Marksheet" if aspect < 0.85 else "General Document"

            top_band = img[0:int(h * 0.35), :]
            hsv = cv2.cvtColor(top_band, cv2.COLOR_BGR2HSV)
            # Tricolor check (Aadhaar)
            green = np.sum((hsv[:, :, 0] >= 35) & (hsv[:, :, 0] <= 85) & (hsv[:, :, 1] > 30))
            saffron = np.sum((hsv[:, :, 0] >= 5) & (hsv[:, :, 0] <= 25) & (hsv[:, :, 1] > 50))
            if green > 1000 and saffron > 1000 and 1.25 <= aspect <= 1.95:
                return "Aadhaar Card"
            # Blue band check (PAN)
            blue = np.sum((hsv[:, :, 0] >= 95) & (hsv[:, :, 0] <= 130) & (hsv[:, :, 1] > 40))
            if blue > 2500 and 1.25 <= aspect <= 1.95:
                return "PAN Card"
        except Exception:
            pass

    return "General Document"

def detect_eaadhaar_full_letter(img_bgr: np.ndarray, face_cascade=None) -> tuple[bool, int]:
    """
    Detects if the file is an official A4 e-Aadhaar letter with bottom cards.
    Requires UIDAI official red sunburst flame logo + scissor cut line or bottom tricolor card ribbon.
    Returns (is_eaadhaar, split_y).
    """
    try:
        h, w = img_bgr.shape[:2]
        aspect = w / float(h)
        # e-Aadhaar official letters are always portrait format (0.42 to 0.88)
        if not (0.42 <= aspect <= 0.88):
            return False, 0

        # Check for UIDAI Red flame sunburst logo in top 40%
        top_hsv = cv2.cvtColor(img_bgr[0:int(h * 0.40), :], cv2.COLOR_BGR2HSV)
        red1 = cv2.inRange(top_hsv, (0, 90, 90), (10, 255, 255))
        red2 = cv2.inRange(top_hsv, (170, 90, 90), (180, 255, 255))
        top_area = top_hsv.shape[0] * top_hsv.shape[1]
        red_ratio = (cv2.countNonZero(red1) + cv2.countNonZero(red2)) / float(max(1, top_area))

        # Check for card face in bottom 40% (y > 0.55H)
        faces = detect_face_rects(img_bgr, face_cascade)
        bot_faces = [f for f in faces if f[1] >= h * 0.55]

        # Scissor line search in [0.55H, 0.72H]
        mid_gray = cv2.cvtColor(img_bgr[int(h * 0.55):int(h * 0.72), :], cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(mid_gray, 50, 150)
        row_sums = cv2.reduce(edges, 1, cv2.REDUCE_SUM, dtype=cv2.CV_32F).flatten() / (255.0 * w)
        peak = row_sums.max()
        has_cut_line = peak > 0.38
        split_y = int(h * 0.55) + np.argmax(row_sums) if has_cut_line else int(h * 0.62)

        # Check bottom tricolor (Aadhaar cards at bottom have green and saffron stripes)
        bot_hsv = cv2.cvtColor(img_bgr[int(h * 0.60):, :], cv2.COLOR_BGR2HSV)
        bot_green = cv2.inRange(bot_hsv, (35, 40, 40), (85, 255, 255))
        bot_saffron = cv2.inRange(bot_hsv, (5, 50, 50), (25, 255, 255))
        g_cnt = cv2.countNonZero(bot_green)
        s_cnt = cv2.countNonZero(bot_saffron)
        has_bot_tricolor = (g_cnt > 1200 and s_cnt > 1500)

        # Check for QR code in bottom right card
        has_bot_qr = detect_qr_code(img_bgr[int(h * 0.60):, int(w * 0.45):])

        # UIDAI e-Aadhaar MUST have UIDAI red logo AND (cut line + (bot_face or bot_qr or bot_tricolor))
        if red_ratio > 0.008 and (has_cut_line and (len(bot_faces) >= 1 or has_bot_qr or has_bot_tricolor)):
            return True, split_y
        if red_ratio > 0.015 and (has_bot_tricolor and (len(bot_faces) >= 1 or has_bot_qr)):
            return True, split_y

        return False, 0
    except Exception:
        return False, 0

def extract_eaadhaar_bottom_cards(img_bgr: np.ndarray, split_y: int, upload_dir: str, group_id: str, face_cascade=None) -> list[dict]:
    """
    Crops bottom section of e-Aadhaar letter and extracts:
    - Left half as Aadhaar Front (Deskewed, CR80 300 DPI)
    - Right half as Aadhaar Back (Deskewed, CR80 300 DPI)
    """
    h, w = img_bgr.shape[:2]
    bot_crop = img_bgr[split_y:h, :]
    bh, bw = bot_crop.shape[:2]

    mid_x = bw // 2
    left_card = bot_crop[:, 0:mid_x]
    right_card = bot_crop[:, mid_x:bw]

    left_has_face = detect_face(left_card, face_cascade)
    right_has_face = detect_face(right_card, face_cascade)

    left_crop = trim_card_margins(left_card)
    right_crop = trim_card_margins(right_card)

    left_enh = apply_document_scanner_filter(auto_orient_card(left_crop, face_cascade))
    right_enh = apply_document_scanner_filter(auto_orient_card(right_crop, face_cascade))

    if right_has_face and not left_has_face:
        front_img, back_img = right_enh, left_enh
    else:
        front_img, back_img = left_enh, right_enh

    front_id = str(uuid.uuid4())
    front_save_name = f"{front_id}_front.jpg"
    cv2.imwrite(os.path.join(upload_dir, front_save_name), front_img, [cv2.IMWRITE_JPEG_QUALITY, 96])

    back_id = str(uuid.uuid4())
    back_save_name = f"{back_id}_back.jpg"
    cv2.imwrite(os.path.join(upload_dir, back_save_name), back_img, [cv2.IMWRITE_JPEG_QUALITY, 96])

    return [
        {
            "id": front_id,
            "save_name": front_save_name,
            "fileType": "image",
            "jobType": "id-card",
            "docTypeLabel": "Aadhaar Card",
            "side": "front",
            "groupId": group_id,
            "extractedCode": None,
            "extractedText": "Aadhaar Front (e-Aadhaar Letter)",
            "isDarkPage": check_dark_page(front_img),
            "pageCount": 1,
            "status": "matched",
            "lowConfidenceCrop": False
        },
        {
            "id": back_id,
            "save_name": back_save_name,
            "fileType": "image",
            "jobType": "id-card",
            "docTypeLabel": "Aadhaar Card",
            "side": "back",
            "groupId": group_id,
            "extractedCode": None,
            "extractedText": "Aadhaar Back (e-Aadhaar Letter)",
            "isDarkPage": check_dark_page(back_img),
            "pageCount": 1,
            "status": "matched",
            "lowConfidenceCrop": False
        }
    ]

def detect_full_page_document(img_bgr: np.ndarray) -> tuple[bool, str]:
    """
    Identifies full-size documents (Bank Passbooks, Marksheets, Stamp Papers, Certificates, Receipts).
    """
    try:
        h, w = img_bgr.shape[:2]
        aspect = w / float(h)
        if not (0.40 <= aspect <= 1.05 or 1.10 <= aspect <= 1.95):
            return False, ""

        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(12, int(w * 0.05)), 1))
        h_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, h_kernel)
        row_sums = np.sum(h_lines > 0, axis=1) / float(w)
        active_rows = np.where(row_sums > 0.025)[0]
        h_line_count = np.sum(row_sums > 0.12)

        top_hsv = cv2.cvtColor(img_bgr[0:int(h * 0.35), :], cv2.COLOR_BGR2HSV)
        stamp_g = np.sum((top_hsv[:, :, 0] >= 35) & (top_hsv[:, :, 0] <= 85) & (top_hsv[:, :, 1] > 60) & (top_hsv[:, :, 2] > 60))
        stamp_o = np.sum((top_hsv[:, :, 0] >= 10) & (top_hsv[:, :, 0] <= 25) & (top_hsv[:, :, 1] > 70) & (top_hsv[:, :, 2] > 70))
        top_area = top_hsv.shape[0] * top_hsv.shape[1]
        is_stamp_paper = (stamp_g / float(top_area) > 0.10) or (stamp_o / float(top_area) > 0.10)

        # 1. Stamp Paper (High saturation official seal / crest at top)
        if is_stamp_paper and aspect < 1.05:
            return True, "Stamp Paper"

        # 2. Bank Passbook (Landscape aspect 1.10 - 1.85 with account tables or statement details)
        if 1.10 <= aspect <= 1.85:
            if h_line_count >= 2 or len(active_rows) >= 8 or 1.15 <= aspect <= 1.55:
                return True, "Bank Passbook"

        # 3. Marksheet (Vertical A4 format with marks grid / table lines)
        if h_line_count >= 5 and aspect <= 1.05:
            return True, "Marksheet"

        # 4. General Certificate / Full A4 Document / Open Passbook photo
        if len(active_rows) >= 12:
            y_span = (active_rows[-1] - active_rows[0]) / float(h)
            if y_span > 0.40:
                if 1.10 <= aspect <= 1.80:
                    return True, "Bank Passbook" if h_line_count >= 2 else "Certificate"
                elif aspect <= 1.05:
                    if h_line_count >= 3:
                        return True, "Marksheet"
                    elif is_stamp_paper:
                        return True, "Stamp Paper"
                    else:
                        return True, "Bank Passbook" if (0.65 <= aspect <= 0.85 and h_line_count >= 2) else "Certificate"

        return False, ""
    except Exception:
        return False, ""

def process_full_page_document(img_bgr: np.ndarray, doc_label: str, upload_dir: str, group_id: str) -> list[dict]:
    """
    Processes full A4 document (Marksheet, Stamp Paper, Certificate, Passbook)
    with perspective deskewing and CamScanner-grade Magic Color enhancement.
    """
    # Attempt 4-corner quad detection first
    quad = detect_document_quad(img_bgr)
    is_low_conf, _ = check_crop_confidence(img_bgr, quad)
    if quad is not None:
        warped = four_point_transform(img_bgr, quad)
        wh, ww = warped.shape[:2]
        # Inset margin
        pad_y = max(4, int(wh * 0.015))
        pad_x = max(4, int(ww * 0.015))
        processed = warped[pad_y:wh - pad_y, pad_x:ww - pad_x]
    else:
        processed = img_bgr

    # Normalize orientation if marksheet is horizontal
    ph, pw = processed.shape[:2]
    if doc_label == "Marksheet" and pw > ph:
        processed = cv2.rotate(processed, cv2.ROTATE_90_CLOCKWISE)

    enhanced = enhance_scanned_document(processed, mode="magic-color")
    doc_id = str(uuid.uuid4())
    save_name = f"{doc_id}.jpg"
    cv2.imwrite(os.path.join(upload_dir, save_name), enhanced, [cv2.IMWRITE_JPEG_QUALITY, 96])

    return [{
        "id": doc_id,
        "save_name": save_name,
        "fileType": "image",
        "jobType": "general-document",
        "docTypeLabel": doc_label,
        "side": None,
        "groupId": group_id,
        "extractedCode": None,
        "extractedText": None,
        "isDarkPage": check_dark_page(enhanced),
        "pageCount": 1,
        "status": "matched",
        "lowConfidenceCrop": is_low_conf
    }]

def process_upload_and_split(file_path: str, upload_dir: str, face_cascade=None) -> list[dict]:
    """
    Master Autonomous Document Engine:
    1. Full-Size Documents (Marksheets, Stamp Papers, Certificates, Passbooks): 4-Corner Quad Perspective Warp + CamScanner Magic Color.
    2. e-Aadhaar Letters: Automatically isolates bottom-left (Front) and bottom-right (Back) and pairs them.
    3. Dual 2-in-1 Cards: Auto-segments 2 distinct cards and links them.
    4. Isolated Card Boxes: 4-Point Deskew + CR80 300 DPI Scanner Filter.
    5. Single ID Cards: High-fidelity natural CR80 scanner output.
    """
    ext = os.path.splitext(file_path)[1].lower()

    # Handle PDF files
    if ext == '.pdf':
        page_count = 1
        try:
            doc = fitz.open(file_path)
            page_count = len(doc)
            doc.close()
        except Exception:
            pass

        return [{
            "id": str(uuid.uuid4()),
            "save_name": os.path.basename(file_path),
            "fileType": "pdf",
            "jobType": "general-document",
            "docTypeLabel": "PDF Document",
            "side": None,
            "groupId": str(uuid.uuid4())[:8],
            "extractedCode": None,
            "extractedText": None,
            "isDarkPage": False,
            "pageCount": page_count,
            "status": "matched",
            "lowConfidenceCrop": False
        }]

    # Handle Image files
    img = cv2.imread(file_path)
    if img is None:
        return [{
            "id": str(uuid.uuid4()),
            "save_name": os.path.basename(file_path),
            "fileType": "image",
            "jobType": "general-document",
            "docTypeLabel": "General Document",
            "side": None,
            "groupId": str(uuid.uuid4())[:8],
            "extractedCode": None,
            "extractedText": None,
            "isDarkPage": False,
            "pageCount": 1,
            "status": "matched",
            "lowConfidenceCrop": False
        }]

    h, w = img.shape[:2]
    aspect_ratio = w / float(h) if h > 0 else 1.0
    group_id = str(uuid.uuid4())[:8]

    # Pre-extract OCR text if available (downscaled and fast)
    full_code, full_text = extract_id_code(img)

    # =========================================================================
    # STEP 1: CHECK FOR E-AADHAAR FULL LETTER (A4 UIDAI Official Letter)
    # =========================================================================
    is_eaadhaar, split_y = detect_eaadhaar_full_letter(img, face_cascade)
    if is_eaadhaar:
        return extract_eaadhaar_bottom_cards(img, split_y, upload_dir, group_id, face_cascade)

    # =========================================================================
    # STEP 2: CHECK FOR 2 DISTINCT ID CARD BOXES ON BACKGROUND
    # =========================================================================
    card_boxes = find_and_extract_card_boxes(img)
    if len(card_boxes) == 2:
        cards = []
        for i, box in enumerate(card_boxes):
            warped = four_point_transform(img, box)
            wh, ww = warped.shape[:2]
            warped = warped[int(wh * 0.02):int(wh * 0.98), int(ww * 0.02):int(ww * 0.98)]
            oriented = auto_orient_card(warped, face_cascade)
            enhanced = apply_document_scanner_filter(oriented)
            has_face = detect_face(enhanced, face_cascade)
            code, text = extract_id_code(enhanced)
            cards.append({"img": enhanced, "has_face": has_face, "code": code, "text": text})

        if cards[1]["has_face"] and not cards[0]["has_face"]:
            front_info, back_info = cards[1], cards[0]
        else:
            front_info, back_info = cards[0], cards[1]

        combined_text = (front_info["text"] or "") + " " + (back_info["text"] or "")
        doc_label = get_doc_type_label(combined_text, front_info["img"])
        extracted_code = front_info["code"] or back_info["code"]

        front_id = str(uuid.uuid4())
        front_save_name = f"{front_id}_front.jpg"
        cv2.imwrite(os.path.join(upload_dir, front_save_name), front_info["img"], [cv2.IMWRITE_JPEG_QUALITY, 96])

        back_id = str(uuid.uuid4())
        back_save_name = f"{back_id}_back.jpg"
        cv2.imwrite(os.path.join(upload_dir, back_save_name), back_info["img"], [cv2.IMWRITE_JPEG_QUALITY, 96])

        return [
            {
                "id": front_id,
                "save_name": front_save_name,
                "fileType": "image",
                "jobType": "id-card",
                "docTypeLabel": doc_label,
                "side": "front",
                "groupId": group_id,
                "extractedCode": extracted_code,
                "extractedText": front_info["text"],
                "isDarkPage": check_dark_page(front_info["img"]),
                "pageCount": 1,
                "status": "matched",
                "lowConfidenceCrop": False
            },
            {
                "id": back_id,
                "save_name": back_save_name,
                "fileType": "image",
                "jobType": "id-card",
                "docTypeLabel": doc_label,
                "side": "back",
                "groupId": group_id,
                "extractedCode": extracted_code,
                "extractedText": back_info["text"],
                "isDarkPage": check_dark_page(back_info["img"]),
                "pageCount": 1,
                "status": "matched",
                "lowConfidenceCrop": False
            }
        ]

    # =========================================================================
    # STEP 3: CHECK FOR DUAL CARDS (Wide Horizontal 2-in-1 Scan)
    # =========================================================================
    if aspect_ratio >= 2.05:
        split_x = int(w * 0.50)
        left_half = img[:, 0:split_x]
        right_half = img[:, split_x:w]

        left_crop = trim_card_margins(left_half)
        right_crop = trim_card_margins(right_half)
        left_enh = apply_document_scanner_filter(auto_orient_card(left_crop, face_cascade))
        right_enh = apply_document_scanner_filter(auto_orient_card(right_crop, face_cascade))

        left_f = detect_face(left_enh, face_cascade)
        right_f = detect_face(right_enh, face_cascade)

        if right_f and not left_f:
            front_crop, back_crop = right_enh, left_enh
        else:
            front_crop, back_crop = left_enh, right_enh

        doc_label = get_doc_type_label(full_text, front_crop)

        front_id = str(uuid.uuid4())
        front_save_name = f"{front_id}_front.jpg"
        cv2.imwrite(os.path.join(upload_dir, front_save_name), front_crop, [cv2.IMWRITE_JPEG_QUALITY, 96])

        back_id = str(uuid.uuid4())
        back_save_name = f"{back_id}_back.jpg"
        cv2.imwrite(os.path.join(upload_dir, back_save_name), back_crop, [cv2.IMWRITE_JPEG_QUALITY, 96])

        return [
            {
                "id": front_id,
                "save_name": front_save_name,
                "fileType": "image",
                "jobType": "id-card",
                "docTypeLabel": doc_label,
                "side": "front",
                "groupId": group_id,
                "extractedCode": full_code,
                "extractedText": full_text,
                "isDarkPage": check_dark_page(front_crop),
                "pageCount": 1,
                "status": "matched",
                "lowConfidenceCrop": False
            },
            {
                "id": back_id,
                "save_name": back_save_name,
                "fileType": "image",
                "jobType": "id-card",
                "docTypeLabel": doc_label,
                "side": "back",
                "groupId": group_id,
                "extractedCode": full_code,
                "extractedText": full_text,
                "isDarkPage": check_dark_page(back_crop),
                "pageCount": 1,
                "status": "matched",
                "lowConfidenceCrop": False
            }
        ]

    # =========================================================================
    # STEP 4: AUTONOMOUS 4-CORNER DOCUMENT QUAD PERSPECTIVE WARP & ENHANCEMENT
    # Catches Marksheets, Certificates, Passbooks, Stamp Papers, and Cards on backgrounds!
    # =========================================================================
    doc_quad = detect_document_quad(img)
    if doc_quad is not None:
        is_low_conf, _ = check_crop_confidence(img, doc_quad)
        warped = four_point_transform(img, doc_quad)
        wh, ww = warped.shape[:2]
        pad_y = max(4, int(wh * 0.015))
        pad_x = max(4, int(ww * 0.015))
        clean_warped = warped[pad_y:wh - pad_y, pad_x:ww - pad_x]
        c_h, c_w = clean_warped.shape[:2]
        c_aspect = c_w / float(c_h)

        c_code, c_text = extract_id_code(clean_warped)
        is_pan = is_pan_card_content(c_text or full_text, clean_warped, face_cascade)
        has_face = detect_face(clean_warped, face_cascade)
        doc_label = get_doc_type_label(c_text or full_text, clean_warped)

        # ID Cards are strictly landscape CR80 aspect (1.15 to 2.10) and match ID card types (PAN, Aadhaar, Voter, DL)
        # Vertical documents (c_aspect < 1.0) or marksheets/certificates/passbooks are NEVER ID cards!
        is_id_card = False
        if doc_label not in ["Marksheet", "Certificate", "Bank Passbook", "Stamp Paper", "General Document", "PDF Document"]:
            if is_pan:
                is_id_card = True
            elif ("AADHAAR" in doc_label.upper() or "VOTER" in doc_label.upper() or "DRIVING" in doc_label.upper()) and (1.15 <= c_aspect <= 2.10):
                is_id_card = True

        if is_id_card:
            oriented = auto_orient_card(clean_warped, face_cascade)
            enhanced = apply_document_scanner_filter(oriented)
            side = "front"

            doc_id = str(uuid.uuid4())
            save_name = f"{doc_id}.jpg"
            cv2.imwrite(os.path.join(upload_dir, save_name), enhanced, [cv2.IMWRITE_JPEG_QUALITY, 96])

            return [{
                "id": doc_id,
                "save_name": save_name,
                "fileType": "image",
                "jobType": "id-card",
                "docTypeLabel": doc_label if not is_pan else "PAN Card",
                "side": side,
                "groupId": group_id,
                "extractedCode": c_code or full_code,
                "extractedText": c_text or full_text,
                "isDarkPage": check_dark_page(enhanced),
                "pageCount": 1,
                "status": "matched",
                "lowConfidenceCrop": is_low_conf
            }]
        else:
            # Full A4 Document (Marksheet, Certificate, Passbook, Stamp Paper, General Document)
            is_full, full_doc_label = detect_full_page_document(clean_warped)
            final_label = full_doc_label if is_full else doc_label if doc_label != "General Document" else ("Marksheet" if c_aspect <= 1.05 else "General Document")

            enhanced = enhance_scanned_document(clean_warped, mode="magic-color")
            doc_id = str(uuid.uuid4())
            save_name = f"{doc_id}.jpg"
            cv2.imwrite(os.path.join(upload_dir, save_name), enhanced, [cv2.IMWRITE_JPEG_QUALITY, 96])

            return [{
                "id": doc_id,
                "save_name": save_name,
                "fileType": "image",
                "jobType": "general-document",
                "docTypeLabel": final_label,
                "side": None,
                "groupId": group_id,
                "extractedCode": c_code or full_code,
                "extractedText": c_text or full_text,
                "isDarkPage": check_dark_page(enhanced),
                "pageCount": 1,
                "status": "matched",
                "lowConfidenceCrop": is_low_conf
            }]

    # =========================================================================
    # STEP 5: FULL-PAGE DOCUMENT WITHOUT DETECTABLE QUAD (Scanner / Full Frame)
    # =========================================================================
    is_full_page, doc_label = detect_full_page_document(img)
    if is_full_page:
        return process_full_page_document(img, doc_label, upload_dir, group_id)

    # =========================================================================
    # STEP 6: CHECK FOR FULL FRAME PAN CARD
    # =========================================================================
    is_pan = is_pan_card_content(full_text, img, face_cascade)
    if is_pan:
        trimmed = trim_card_margins(img)
        oriented = auto_orient_card(trimmed, face_cascade)
        enhanced = apply_document_scanner_filter(oriented)

        doc_id = str(uuid.uuid4())
        save_name = f"{doc_id}.jpg"
        cv2.imwrite(os.path.join(upload_dir, save_name), enhanced, [cv2.IMWRITE_JPEG_QUALITY, 96])

        return [{
            "id": doc_id,
            "save_name": save_name,
            "fileType": "image",
            "jobType": "id-card",
            "docTypeLabel": "PAN Card",
            "side": "front",
            "groupId": group_id,
            "extractedCode": full_code,
            "extractedText": full_text,
            "isDarkPage": check_dark_page(enhanced),
            "pageCount": 1,
            "status": "matched",
            "lowConfidenceCrop": False
        }]

    # =========================================================================
    # STEP 7: FALLBACK: SINGLE ID CARD / DOCUMENT
    # =========================================================================
    has_face = detect_face(img, face_cascade)
    has_qr = detect_qr_code(img)
    doc_label = get_doc_type_label(full_text, img)

    if (0.50 <= aspect_ratio <= 1.95) and (has_face or has_qr or "AADHAAR" in doc_label.upper()):
        trimmed = trim_card_margins(img)
        oriented = auto_orient_card(trimmed, face_cascade)
        enhanced = apply_document_scanner_filter(oriented)

        side = "front" if (has_face or "AADHAAR" in doc_label.upper()) else ("back" if has_qr else "front")
        doc_id = str(uuid.uuid4())
        save_name = f"{doc_id}.jpg"
        cv2.imwrite(os.path.join(upload_dir, save_name), enhanced, [cv2.IMWRITE_JPEG_QUALITY, 96])

        return [{
            "id": doc_id,
            "save_name": save_name,
            "fileType": "image",
            "jobType": "id-card",
            "docTypeLabel": doc_label,
            "side": side,
            "groupId": group_id,
            "extractedCode": full_code,
            "extractedText": full_text,
            "isDarkPage": check_dark_page(enhanced),
            "pageCount": 1,
            "status": "matched" if side == "front" else "unmatched",
            "lowConfidenceCrop": True
        }]
    else:
        # General Document fallback with Magic Color enhancement
        enhanced = enhance_scanned_document(img, mode="magic-color")
        doc_id = str(uuid.uuid4())
        save_name = f"{doc_id}.jpg"
        cv2.imwrite(os.path.join(upload_dir, save_name), enhanced, [cv2.IMWRITE_JPEG_QUALITY, 96])

        return [{
            "id": doc_id,
            "save_name": save_name,
            "fileType": "image",
            "jobType": "general-document",
            "docTypeLabel": "General Document",
            "side": None,
            "groupId": group_id,
            "extractedCode": full_code,
            "extractedText": full_text,
            "isDarkPage": check_dark_page(enhanced),
            "pageCount": 1,
            "status": "matched",
            "lowConfidenceCrop": True
        }]

def group_documents(documents: list) -> list:
    """
    Links front and back pairs by:
    1. Pre-assigned groupId (from single-image dual-card auto-split)
    2. Extracted Aadhaar/PAN code matching
    """
    for doc in documents:
        if not doc.get("docTypeLabel"):
            doc["docTypeLabel"] = "ID Card" if doc.get("jobType") == "id-card" else "General Document"

    code_to_group = {}
    for doc in documents:
        code = doc.get("extractedCode")
        gid = doc.get("groupId")
        if code and doc.get("side") == "front":
            if not gid:
                gid = str(uuid.uuid4())[:8]
                doc["groupId"] = gid
            code_to_group[code] = gid

    for doc in documents:
        code = doc.get("extractedCode")
        if doc.get("side") == "back" and code and code in code_to_group:
            doc["groupId"] = code_to_group[code]
            doc["status"] = "matched"

    group_front_counts = {}
    group_back_counts = {}
    for doc in documents:
        gid = doc.get("groupId")
        if gid:
            if doc.get("side") == "front":
                group_front_counts[gid] = group_front_counts.get(gid, 0) + 1
            elif doc.get("side") == "back":
                group_back_counts[gid] = group_back_counts.get(gid, 0) + 1

    unpaired_fronts = []
    unpaired_backs = []

    for doc in documents:
        gid = doc.get("groupId")
        side = doc.get("side")
        is_already_paired = gid and group_front_counts.get(gid, 0) >= 1 and group_back_counts.get(gid, 0) >= 1

        if not is_already_paired:
            if side == "front":
                unpaired_fronts.append(doc)
            elif side == "back":
                unpaired_backs.append(doc)
            else:
                if not gid:
                    doc["groupId"] = str(uuid.uuid4())[:8]
                doc["status"] = "matched"

    for f_doc in unpaired_fronts:
        if not f_doc.get("groupId"):
            f_doc["groupId"] = str(uuid.uuid4())[:8]
        f_doc["status"] = "matched"

    for b_doc in unpaired_backs:
        if not b_doc.get("groupId"):
            b_doc["groupId"] = str(uuid.uuid4())[:8]
        b_doc["status"] = "unmatched"

    return documents

def analyze_invert_safety(file_path: str) -> bool:
    """Heuristic to determine if it is SAFE to auto-invert a dark page."""
    try:
        img = cv2.imread(file_path)
        if img is None:
            return False

        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        s = hsv[:, :, 1]
        sat_pixels = np.sum(s > 50)
        if (sat_pixels / s.size) > 0.05:
            return False

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        std_dev = np.std(gray)
        if std_dev > 60:
            return False

        return True
    except Exception:
        return False

def invert_page(file_path: str, output_path: str) -> bool:
    """Inverts the colors of an image."""
    try:
        with Image.open(file_path) as img:
            if img.mode == 'RGBA':
                r, g, b, a = img.split()
                rgb_image = Image.merge('RGB', (r, g, b))
                inverted = ImageOps.invert(rgb_image)
                r2, g2, b2 = inverted.split()
                img = Image.merge('RGBA', (r2, g2, b2, a))
            else:
                img = img.convert('RGB')
                img = ImageOps.invert(img)

            img.save(output_path)
        return True
    except Exception as e:
        print(f"Invert Error: {e}")
        return False
