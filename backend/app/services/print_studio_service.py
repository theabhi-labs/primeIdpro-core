import os
import cv2
import re
import fitz  # PyMuPDF
from PIL import Image, ImageOps
import pytesseract
import numpy as np
import uuid

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

def apply_document_scanner_filter(img_bgr: np.ndarray, target_w: int = 1011, target_h: int = 638) -> np.ndarray:
    """
    True Document Scanner / CamScanner style Natural Enhancement for CR80 ID Cards:
    1. Perspective deskew & illumination leveling (removes room shadows, yellowish tint, gray scanner shadows).
       - Uses Gaussian background estimation on the Value/Luminance channel.
       - Chrominance is preserved so face colors, Tiranga (saffron/green), and official stamps stay 100% natural.
    2. Contrast balancing & unsharp mask (for ultra-crisp 300 DPI text and QR codes).
    3. CR80 Resize (1011x638) using Lanczos4 interpolation.
    """
    try:
        h, w = img_bgr.shape[:2]
        if target_w and target_h and (w, h) != (target_w, target_h):
            img_bgr = cv2.resize(img_bgr, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)

        lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
        l_chan, a_chan, b_chan = cv2.split(lab)

        bg_illum = cv2.GaussianBlur(l_chan, (55, 55), 0)
        l_norm = np.clip((l_chan.astype(np.float32) / (bg_illum.astype(np.float32) + 1.0)) * 235.0, 0, 255).astype(np.uint8)

        clahe = cv2.createCLAHE(clipLimit=1.4, tileGridSize=(8, 8))
        l_final = clahe.apply(l_norm)
        l_blend = cv2.addWeighted(l_final, 0.75, l_chan, 0.25, 0)

        enhanced_lab = cv2.merge((l_blend, a_chan, b_chan))
        enhanced_bgr = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)

        gaussian = cv2.GaussianBlur(enhanced_bgr, (0, 0), sigmaX=1.1)
        sharpened = cv2.addWeighted(enhanced_bgr, 1.25, gaussian, -0.25, 0)

        return sharpened
    except Exception as e:
        print(f"Error in scanner filter: {e}")
        return img_bgr

def enhance_card_image(card_bgr: np.ndarray, target_w: int = 1011, target_h: int = 638) -> np.ndarray:
    """Wrapper that applies the natural document scanner filter at 300 DPI CR80."""
    return apply_document_scanner_filter(card_bgr, target_w, target_h)

def apply_fullpage_scanner_filter(img_bgr: np.ndarray) -> np.ndarray:
    """
    Natural Scanner Enhancement for Full A4 Documents (Marksheets, Stamp Papers, Certificates, Passbooks):
    1. Removes room lighting shadows & yellowish phone cast.
    2. Levels background paper to crisp #FFFFFF.
    3. Preserves authentic color for stamps (blue/purple/red ink), seals, and emblems.
    4. Sharpens text characters and table lines.
    """
    try:
        lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
        l_chan, a_chan, b_chan = cv2.split(lab)

        bg_illum = cv2.GaussianBlur(l_chan, (75, 75), 0)
        l_norm = np.clip((l_chan.astype(np.float32) / (bg_illum.astype(np.float32) + 1.0)) * 240.0, 0, 255).astype(np.uint8)

        clahe = cv2.createCLAHE(clipLimit=1.3, tileGridSize=(8, 8))
        l_final = clahe.apply(l_norm)
        l_blend = cv2.addWeighted(l_final, 0.80, l_chan, 0.20, 0)

        enhanced_lab = cv2.merge((l_blend, a_chan, b_chan))
        enhanced_bgr = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)

        gaussian = cv2.GaussianBlur(enhanced_bgr, (0, 0), sigmaX=1.0)
        sharpened = cv2.addWeighted(enhanced_bgr, 1.20, gaussian, -0.20, 0)

        return sharpened
    except Exception as e:
        print(f"Error in fullpage filter: {e}")
        return img_bgr

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
    """
    try:
        pil_img = Image.fromarray(cv2.cvtColor(image_np, cv2.COLOR_BGR2RGB))
        text = pytesseract.image_to_string(pil_img)
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
    """Matches OCR text or visual color cues against known ID card types."""
    if text:
        text_up = text.upper()
        if 'आधार' in text or 'UIDAI' in text_up or 'UNIQUE IDENTIFICATION' in text_up or 'AADHAAR' in text_up:
            return "Aadhaar Card"
        if 'निर्वाचन' in text or 'ELECTION' in text_up or 'VOTER' in text_up:
            return "Voter ID"
        if 'आयकर' in text or 'INCOME TAX' in text_up or 'PERMANENT ACCOUNT' in text_up or re.search(r'[A-Z]{5}[0-9]{4}[A-Z]', text_up):
            return "PAN Card"
        if 'DRIVING' in text_up or 'TRANSPORT' in text_up:
            return "Driving License"

    if img is not None:
        try:
            h, w = img.shape[:2]
            top_band = img[0:int(h * 0.35), :]
            hsv = cv2.cvtColor(top_band, cv2.COLOR_BGR2HSV)
            # Tricolor check (Aadhaar)
            green = np.sum((hsv[:, :, 0] >= 35) & (hsv[:, :, 0] <= 85) & (hsv[:, :, 1] > 30))
            saffron = np.sum((hsv[:, :, 0] >= 5) & (hsv[:, :, 0] <= 25) & (hsv[:, :, 1] > 50))
            if green > 1000 and saffron > 1000:
                return "Aadhaar Card"
            # Blue band check (PAN)
            blue = np.sum((hsv[:, :, 0] >= 95) & (hsv[:, :, 0] <= 130) & (hsv[:, :, 1] > 40))
            if blue > 2500:
                return "PAN Card"
        except Exception:
            pass

    return "ID Card"

def detect_eaadhaar_full_letter(img_bgr: np.ndarray, face_cascade=None) -> tuple[bool, int]:
    """
    Detects if the file is an official A4 e-Aadhaar letter with bottom cards.
    Returns (is_eaadhaar, split_y).
    """
    try:
        h, w = img_bgr.shape[:2]
        aspect = w / float(h)
        if not (0.42 <= aspect <= 0.88):
            return False, 0

        # Check for UIDAI Red flame logo in top 45%
        top_hsv = cv2.cvtColor(img_bgr[0:int(h * 0.45), :], cv2.COLOR_BGR2HSV)
        red1 = np.sum((top_hsv[:, :, 0] <= 10) & (top_hsv[:, :, 1] > 80) & (top_hsv[:, :, 2] > 80))
        red2 = np.sum((top_hsv[:, :, 0] >= 170) & (top_hsv[:, :, 1] > 80) & (top_hsv[:, :, 2] > 80))
        top_area = top_hsv.shape[0] * top_hsv.shape[1]
        red_ratio = (red1 + red2) / float(max(1, top_area))

        # Check for card face in bottom 40% (y > 0.55H)
        faces = detect_face_rects(img_bgr, face_cascade)
        bot_faces = [f for f in faces if f[1] >= h * 0.55]

        # Scissor line search in [0.55H, 0.72H]
        mid_gray = cv2.cvtColor(img_bgr[int(h * 0.55):int(h * 0.72), :], cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(mid_gray, 50, 150)
        row_sums = np.sum(edges > 0, axis=1) / float(w)
        peak = np.argmax(row_sums)
        has_cut_line = row_sums[peak] > 0.38
        split_y = int(h * 0.55) + peak if has_cut_line else int(h * 0.62)

        # Check bottom tricolor
        bot_hsv = cv2.cvtColor(img_bgr[int(h * 0.60):, :], cv2.COLOR_BGR2HSV)
        bot_green = np.sum((bot_hsv[:, :, 0] >= 35) & (bot_hsv[:, :, 0] <= 85) & (bot_hsv[:, :, 1] > 40))
        bot_saffron = np.sum((bot_hsv[:, :, 0] >= 5) & (bot_hsv[:, :, 0] <= 25) & (bot_hsv[:, :, 1] > 50))
        has_bot_tricolor = (bot_green > 600 and bot_saffron > 600)

        if (red_ratio > 0.005 and (len(bot_faces) >= 1 or has_bot_tricolor or has_cut_line)):
            return True, split_y
        if red_ratio > 0.02 and (len(bot_faces) >= 1 or has_bot_tricolor):
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
    Identifies full-size documents (Marksheets, Stamp Papers, Certificates, Passbooks, General Receipts).
    """
    try:
        h, w = img_bgr.shape[:2]
        aspect = w / float(h)
        if not (0.42 <= aspect <= 1.08 or 1.10 <= aspect <= 1.75):
            return False, ""

        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(15, int(w * 0.06)), 1))
        h_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, h_kernel)
        row_sums = np.sum(h_lines > 0, axis=1) / float(w)
        active_rows = np.where(row_sums > 0.03)[0]

        if len(active_rows) < 10:
            return False, ""

        y_span = (active_rows[-1] - active_rows[0]) / float(h)
        if y_span < 0.50:
            return False, ""

        top_hsv = cv2.cvtColor(img_bgr[0:int(h * 0.35), :], cv2.COLOR_BGR2HSV)
        stamp_g = np.sum((top_hsv[:, :, 0] >= 35) & (top_hsv[:, :, 0] <= 85) & (top_hsv[:, :, 1] > 40))
        stamp_o = np.sum((top_hsv[:, :, 0] >= 10) & (top_hsv[:, :, 0] <= 25) & (top_hsv[:, :, 1] > 50))
        top_area = top_hsv.shape[0] * top_hsv.shape[1]
        is_stamp = (stamp_g / float(top_area) > 0.07) or (stamp_o / float(top_area) > 0.07)

        h_line_rows = np.sum(row_sums > 0.18)

        if is_stamp:
            return True, "Stamp Paper"
        elif 1.18 <= aspect <= 1.55:
            return True, "Bank Passbook"
        elif h_line_rows >= 4:
            return True, "Marksheet"
        else:
            return True, "Certificate"
    except Exception:
        return False, ""

def process_full_page_document(img_bgr: np.ndarray, doc_label: str, upload_dir: str, group_id: str) -> list[dict]:
    """
    Processes full A4 document (Marksheet, Stamp Paper, Certificate, Passbook)
    with natural whitening & sharpening without slicing or card squishing.
    """
    enhanced = apply_fullpage_scanner_filter(img_bgr)
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
        "lowConfidenceCrop": False
    }]

def process_upload_and_split(file_path: str, upload_dir: str, face_cascade=None) -> list[dict]:
    """
    Master Autonomous Document Engine:
    1. e-Aadhaar Letters: Automatically isolates bottom-left (Front) and bottom-right (Back) and pairs them.
    2. Full-Size Documents (Marksheet, Stamp Paper, Certificate, Passbook): Preserved in full A4 with 300 DPI enhancement.
    3. Isolated Card Boxes on Background (Bedsheets, Tables, Tilted Photos): 4-Point Deskew + CR80 300 DPI Scanner Filter.
    4. PAN Cards: Strictly protected from false splitting (always 1 single front card).
    5. Dual 2-in-1 Cards: Auto-segments 2 distinct cards and links them.
    6. Single ID Cards: High-fidelity natural CR80 scanner output.
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
    aspect_ratio = w / h if h > 0 else 1.0
    group_id = str(uuid.uuid4())[:8]

    # Pre-extract OCR text if available
    full_code, full_text = extract_id_code(img)

    # =========================================================================
    # STEP 1: CHECK FOR E-AADHAAR FULL LETTER (A4 UIDAI Official Letter)
    # =========================================================================
    is_eaadhaar, split_y = detect_eaadhaar_full_letter(img, face_cascade)
    if is_eaadhaar:
        return extract_eaadhaar_bottom_cards(img, split_y, upload_dir, group_id, face_cascade)

    # =========================================================================
    # STEP 2: CHECK FOR FULL-PAGE DOCUMENTS (Marksheet, Stamp Paper, Certificate, Passbook)
    # =========================================================================
    is_full_page, doc_label = detect_full_page_document(img)
    if is_full_page:
        return process_full_page_document(img, doc_label, upload_dir, group_id)

    # =========================================================================
    # STEP 3: CHECK FOR ISOLATED ID CARD BOXES ON BACKGROUND (Camera Photos on Bedsheets/Tables)
    # =========================================================================
    card_boxes = find_and_extract_card_boxes(img)

    # 3A: Two distinct card boxes detected
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

    # 3B: Single card box detected
    if len(card_boxes) == 1:
        warped = four_point_transform(img, card_boxes[0])
        wh, ww = warped.shape[:2]
        warped = warped[int(wh * 0.02):int(wh * 0.98), int(ww * 0.02):int(ww * 0.98)]
        oriented = auto_orient_card(warped, face_cascade)
        enhanced = apply_document_scanner_filter(oriented)

        is_pan = is_pan_card_content(full_text, enhanced, face_cascade)
        has_face = detect_face(enhanced, face_cascade)
        has_qr = detect_qr_code(enhanced)
        code, text = extract_id_code(enhanced)

        if is_pan:
            doc_label = "PAN Card"
            side = "front"
        else:
            doc_label = get_doc_type_label(text or full_text, enhanced)
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
            "extractedCode": code or full_code,
            "extractedText": text or full_text,
            "isDarkPage": check_dark_page(enhanced),
            "pageCount": 1,
            "status": "matched" if side == "front" else "unmatched",
            "lowConfidenceCrop": False
        }]

    # =========================================================================
    # STEP 4: CHECK FOR DUAL CARDS (Wide Horizontal or Vertical Stacked Scan)
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

    if 0.50 <= aspect_ratio <= 1.25:
        split_y = int(h * 0.50)
        top_half = img[0:split_y, :]
        bot_half = img[split_y:h, :]

        top_f = detect_face(top_half, face_cascade)
        bot_f = detect_face(bot_half, face_cascade)
        top_q = detect_qr_code(top_half)
        bot_q = detect_qr_code(bot_half)

        if (top_f and bot_q) or (bot_f and top_q) or (top_f and bot_f):
            top_crop = trim_card_margins(top_half)
            bot_crop = trim_card_margins(bot_half)
            top_enh = apply_document_scanner_filter(auto_orient_card(top_crop, face_cascade))
            bot_enh = apply_document_scanner_filter(auto_orient_card(bot_crop, face_cascade))

            if bot_f and not top_f:
                front_crop, back_crop = bot_enh, top_enh
            else:
                front_crop, back_crop = top_enh, bot_enh

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
    # STEP 5: CHECK FOR FULL FRAME PAN CARD
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
    # STEP 6: FALLBACK: SINGLE ID CARD (Camera photo or single scanned side)
    # =========================================================================
    trimmed = trim_card_margins(img)
    oriented = auto_orient_card(trimmed, face_cascade)
    enhanced = apply_document_scanner_filter(oriented)

    has_face = detect_face(enhanced, face_cascade)
    has_qr = detect_qr_code(enhanced)
    doc_label = get_doc_type_label(full_text, enhanced)

    if has_face or "AADHAAR" in doc_label.upper():
        side = "front"
    elif has_qr:
        side = "back"
    else:
        side = "front"

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
