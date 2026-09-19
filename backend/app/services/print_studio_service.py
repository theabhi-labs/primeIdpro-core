import os
import cv2
import re
import fitz  # PyMuPDF
from PIL import Image, ImageOps
import pytesseract
import numpy as np
import uuid

# Note: pytesseract requires Tesseract-OCR installed on the system if available.
# On Windows, fallback to CV heuristics if tesseract is not available.

def order_points(pts):
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
        # A. Tricolor / Header band check
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

        # B. Face detection check
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

def find_and_extract_card_boxes(img_bgr: np.ndarray) -> list:
    """
    Finds 1 or 2 ID card bounding quadrilaterals from a camera photo
    (robustly segments cards on bedsheets, tables, desks, colored/red cloth backgrounds).
    """
    try:
        h, w = img_bgr.shape[:2]
        scale = 1000.0 / max(h, w)
        small = cv2.resize(img_bgr, (int(w * scale), int(h * scale)))
        sh, sw = small.shape[:2]
        total_area = sw * sh

        # Bilateral filter suppresses fabric weave/cloth texture noise while strictly preserving card step-edges
        filtered = cv2.bilateralFilter(small, 9, 75, 75)
        gray = cv2.cvtColor(filtered, cv2.COLOR_BGR2GRAY)
        hsv = cv2.cvtColor(filtered, cv2.COLOR_BGR2HSV)
        lab = cv2.cvtColor(filtered, cv2.COLOR_BGR2LAB)

        s_chan = hsv[:, :, 1]
        l_chan, a_chan, b_chan = cv2.split(lab)

        candidate_masks = []

        # 1. Grayscale Canny edges
        candidate_masks.append(cv2.Canny(gray, 30, 100))
        candidate_masks.append(cv2.Canny(gray, 50, 150))

        # 2. Max-channel Color Canny (gradient across B, G, R)
        b_edges = cv2.Canny(filtered[:, :, 0], 30, 100)
        g_edges = cv2.Canny(filtered[:, :, 1], 30, 100)
        r_edges = cv2.Canny(filtered[:, :, 2], 30, 100)
        candidate_masks.append(cv2.bitwise_or(cv2.bitwise_or(b_edges, g_edges), r_edges))

        # 3. Saturation Otsu (cleanly segments ID cards from high-saturation cloth/bedsheets)
        if s_chan.max() - s_chan.min() > 35:
            _, s_otsu = cv2.threshold(s_chan, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            candidate_masks.append(cv2.Canny(s_otsu, 30, 100))
            candidate_masks.append(s_otsu)

        # 4. Adaptive threshold with morphological cleanup
        adapt = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 4)
        candidate_masks.append(adapt)

        # 5. Otsu on Gray
        _, gray_otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        candidate_masks.append(gray_otsu)

        best_found = []

        for raw_mask in candidate_masks:
            # Morphological close to bridge broken edge gaps
            close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
            closed = cv2.morphologyEx(raw_mask, cv2.MORPH_CLOSE, close_kernel, iterations=2)
            dilate_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            dilated = cv2.dilate(closed, dilate_kernel, iterations=1)

            contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            contours = sorted(contours, key=cv2.contourArea, reverse=True)

            found = []
            for cnt in contours[:15]:
                area = cv2.contourArea(cnt)
                if area < (total_area * 0.05) or area > (total_area * 0.96):
                    continue

                hull = cv2.convexHull(cnt)
                peri = cv2.arcLength(hull, True)
                approx = None
                for factor in [0.015, 0.02, 0.025, 0.03, 0.035, 0.04, 0.05]:
                    app = cv2.approxPolyDP(hull, factor * peri, True)
                    if len(app) == 4:
                        approx = app
                        break

                rect = cv2.minAreaRect(cnt)
                (rw, rh) = rect[1]
                if rw == 0 or rh == 0:
                    continue
                aspect = max(rw, rh) / min(rw, rh)
                if 1.15 <= aspect <= 2.40:
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
            elif len(found) == 1 and len(best_found) == 0:
                best_found = [found[0][1]]

        return best_found
    except Exception as e:
        print(f"Error finding card boxes: {e}")
        return []

def enhance_card_image(card_bgr: np.ndarray, target_w: int = 1011, target_h: int = 638) -> np.ndarray:
    """
    Quality Enhancement Pipeline for 300 DPI ID Card Printing:
    1. Lanczos4 High-Quality Interpolation to exact standard CR80 size (1011x638).
    2. CLAHE on Luminance channel for crisp text & photos.
    3. Unsharp Masking for sharp edge definition.
    """
    try:
        # Resize to standard CR80 at 300 DPI
        upscaled = cv2.resize(card_bgr, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)
        
        # Adaptive contrast on L channel in LAB color space
        lab = cv2.cvtColor(upscaled, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=1.6, tileGridSize=(8, 8))
        l_enhanced = clahe.apply(l)
        enhanced_lab = cv2.merge((l_enhanced, a, b))
        enhanced_bgr = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
        
        # Unsharp mask for crisp high-definition text, barcodes, and photo clarity
        gaussian = cv2.GaussianBlur(enhanced_bgr, (0, 0), sigmaX=1.2)
        sharpened = cv2.addWeighted(enhanced_bgr, 1.25, gaussian, -0.25, 0)
        
        return sharpened
    except Exception as e:
        print(f"Error enhancing card image: {e}")
        return card_bgr

def trim_card_margins(img_bgr: np.ndarray, tol: int = 240) -> np.ndarray:
    """
    Intelligently trims outer background margins (scanner beds, colored cloth, tables).
    """
    try:
        h, w = img_bgr.shape[:2]
        if h < 50 or w < 50:
            return img_bgr

        # Sample outer border strips (top, bottom, left, right 4%)
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
            # White scanner bed
            gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
            mask = (gray < 230).astype(np.uint8) * 255
        elif bg_gray < 35 and np.mean(bg_std) < 20:
            # Black scanner bed
            gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
            mask = (gray > 45).astype(np.uint8) * 255
        else:
            # Colored cloth / table background
            diff = np.abs(img_bgr.astype(np.float32) - bg_color.astype(np.float32))
            dist = np.sqrt(np.sum(diff ** 2, axis=2))
            thresh_val = max(35.0, float(np.mean(bg_std) * 3.0))
            mask = (dist > thresh_val).astype(np.uint8) * 255

        # Morphological clean up (OPEN removes isolated noise spots on fabric)
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

        # Fallback: shave 2.5% outer border
        return img_bgr[int(h * 0.025):int(h * 0.975), int(w * 0.025):int(w * 0.975)]
    except Exception:
        return img_bgr

def detect_face(image_np: np.ndarray, face_cascade) -> bool:
    """
    Uses the pre-loaded Haar Cascade to detect if a face is present.
    Returns True if face found (front of ID), False otherwise.
    """
    if face_cascade is None:
        return False
    try:
        gray = cv2.cvtColor(image_np, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=3, minSize=(15, 15))
        return len(faces) > 0
    except Exception:
        return False

def extract_id_code(image_np: np.ndarray) -> tuple[str, str]:
    """
    Extracts text via OCR and looks for ID-like patterns.
    Returns (extracted_code, raw_text).
    """
    try:
        pil_img = Image.fromarray(cv2.cvtColor(image_np, cv2.COLOR_BGR2RGB))
        text = pytesseract.image_to_string(pil_img)
        
        # pyrefly: ignore [missing-attribute]
        text_clean = re.sub(r'[^A-Z0-9]', '', text.upper())
        
        digit_match = re.search(r'\d{8,12}', text_clean)
        if digit_match:
            # pyrefly: ignore [bad-return]
            return digit_match.group(0), text
            
        pan_match = re.search(r'[A-Z]{5}\d{4}[A-Z]', text_clean)
        if pan_match:
            # pyrefly: ignore [bad-return]
            return pan_match.group(0), text
            
        words = re.findall(r'[A-Z0-9]{8,15}', text_clean)
        if words:
            # pyrefly: ignore [bad-return]
            return max(words, key=len), text
            
        # pyrefly: ignore [bad-return]
        return None, text
    except Exception:
        # pyrefly: ignore [bad-return]
        return None, ""

def check_dark_page(image_np: np.ndarray, threshold: int = 65) -> bool:
    """
    Analyzes an image to see if it's mostly dark/black.
    """
    try:
        gray = cv2.cvtColor(image_np, cv2.COLOR_BGR2GRAY)
        dark_pixels = np.sum(gray < 50)
        total_pixels = gray.size
        dark_percentage = (dark_pixels / total_pixels) * 100
        return dark_percentage >= threshold
    except Exception:
        return False

DOC_TYPE_LABELS = {
    "UIDAI": "Aadhaar Card",
    "AADHAAR": "Aadhaar Card",
    "GOVERNMENT OF INDIA": "Govt ID",
    "GOVT": "Govt ID",
    "INCOME TAX": "PAN Card",
    "PERMANENT ACCOUNT NUMBER": "PAN Card",
    "ELECTION": "Voter ID",
    "DRIVING": "Driving License",
    "TRANSPORT": "Driving License"
}

def get_doc_type_label(text: str) -> str:
    """Matches OCR text against known keywords to return a label."""
    if not text:
        return "ID Card"
    text_up = text.upper()
    for key, label in DOC_TYPE_LABELS.items():
        if key in text_up:
            return label
    return "ID Card"

def process_upload_and_split(file_path: str, upload_dir: str, face_cascade=None) -> list[dict]:
    """
    Core Processor:
    1. For camera/mobile uploads on textured surfaces (bedsheet, table, red cloth), automatically
       finds card contours, extracts quadrilateral with perspective correction, removes
       background, corrects orientation, and enhances to 300 DPI CR80 standard.
    2. For dual-card photos or scans (front and back in 1 image), automatically splits
       both, matches them, and assigns the same groupId.
    3. Handles multi-page PDFs and standard documents.
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

    # STEP 1: Smart Card Contour & Edge Detection on Camera/Scan Photos
    card_boxes = find_and_extract_card_boxes(img)

    if len(card_boxes) == 2:
        # 2 cards detected in the photo (e.g. Front & Back photographed together on table/bed/cloth)
        cards = []
        for i, box in enumerate(card_boxes):
            warped = four_point_transform(img, box)
            wh, ww = warped.shape[:2]
            # Shave 2.5% outer border to eliminate background remnants
            warped = warped[int(wh * 0.025):int(wh * 0.975), int(ww * 0.025):int(ww * 0.975)]
            oriented = auto_orient_card(warped, face_cascade)
            enhanced = enhance_card_image(oriented)
            has_face = detect_face(enhanced, face_cascade)
            code, text = extract_id_code(enhanced)
            cards.append({"img": enhanced, "has_face": has_face, "code": code, "text": text})

        if cards[1]["has_face"] and not cards[0]["has_face"]:
            front_info, back_info = cards[1], cards[0]
        else:
            front_info, back_info = cards[0], cards[1]

        # pyrefly: ignore [unsupported-operation]
        combined_text = (front_info["text"] or "") + " " + (back_info["text"] or "")
        # pyrefly: ignore [bad-argument-type]
        doc_label = get_doc_type_label(combined_text)
        extracted_code = front_info["code"] or back_info["code"]

        front_id = str(uuid.uuid4())
        front_save_name = f"{front_id}_front.jpg"
        # pyrefly: ignore [no-matching-overload]
        cv2.imwrite(os.path.join(upload_dir, front_save_name), front_info["img"], [cv2.IMWRITE_JPEG_QUALITY, 95])

        back_id = str(uuid.uuid4())
        back_save_name = f"{back_id}_back.jpg"
        # pyrefly: ignore [no-matching-overload]
        cv2.imwrite(os.path.join(upload_dir, back_save_name), back_info["img"], [cv2.IMWRITE_JPEG_QUALITY, 95])

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

    elif len(card_boxes) == 1:
        # Single card cleanly detected on photo background (e.g. camera photo on bed/table/cloth)
        warped = four_point_transform(img, card_boxes[0])
        wh, ww = warped.shape[:2]
        # Shave 2.5% outer border
        warped = warped[int(wh * 0.025):int(wh * 0.975), int(ww * 0.025):int(ww * 0.975)]
        oriented = auto_orient_card(warped, face_cascade)
        enhanced = enhance_card_image(oriented)
        has_face = detect_face(enhanced, face_cascade)
        side = "front" if has_face else "back"
        code, text = extract_id_code(enhanced)
        doc_label = get_doc_type_label(text)

        doc_id = str(uuid.uuid4())
        save_name = f"{doc_id}.jpg"
        cv2.imwrite(os.path.join(upload_dir, save_name), enhanced, [cv2.IMWRITE_JPEG_QUALITY, 95])

        return [{
            "id": doc_id,
            "save_name": save_name,
            "fileType": "image",
            "jobType": "id-card",
            "docTypeLabel": doc_label,
            "side": side,
            "groupId": group_id,
            "extractedCode": code,
            "extractedText": text,
            "isDarkPage": check_dark_page(enhanced),
            "pageCount": 1,
            "status": "matched",
            "lowConfidenceCrop": False
        }]

    # STEP 2: Fallback Heuristic Path (When contour detection finds no clean 4-corner polygon)
    # Case A: Vertical Dual Card (Front on Top, Back on Bottom, scanned square/tall format)
    if 0.55 <= aspect_ratio <= 1.25:
        split_y = h // 2
        top_crop = trim_card_margins(img[0:split_y, :])
        bottom_crop = trim_card_margins(img[split_y:h, :])
        top_enh = enhance_card_image(auto_orient_card(top_crop, face_cascade))
        bottom_enh = enhance_card_image(auto_orient_card(bottom_crop, face_cascade))

        top_has_face = detect_face(top_crop, face_cascade)
        bottom_has_face = detect_face(bottom_crop, face_cascade)

        if bottom_has_face and not top_has_face:
            front_crop, back_crop = bottom_enh, top_enh
            front_raw, back_raw = bottom_crop, top_crop
        else:
            front_crop, back_crop = top_enh, bottom_enh
            front_raw, back_raw = top_crop, bottom_crop

        f_code, f_text = extract_id_code(front_raw)
        b_code, b_text = extract_id_code(back_raw)
        extracted_code = f_code or b_code
        combined_text = (f_text or "") + " " + (b_text or "")
        doc_label = get_doc_type_label(combined_text)

        front_id = str(uuid.uuid4())
        front_save_name = f"{front_id}_front.jpg"
        cv2.imwrite(os.path.join(upload_dir, front_save_name), front_crop, [cv2.IMWRITE_JPEG_QUALITY, 95])

        back_id = str(uuid.uuid4())
        back_save_name = f"{back_id}_back.jpg"
        cv2.imwrite(os.path.join(upload_dir, back_save_name), back_crop, [cv2.IMWRITE_JPEG_QUALITY, 95])

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
                "extractedText": f_text,
                "isDarkPage": check_dark_page(front_crop),
                "pageCount": 1,
                "status": "matched",
                "lowConfidenceCrop": True
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
                "extractedText": b_text,
                "isDarkPage": check_dark_page(back_crop),
                "pageCount": 1,
                "status": "matched",
                "lowConfidenceCrop": True
            }
        ]

    # Case B: Ultra-wide horizontal scan with 2 cards placed side-by-side (aspect >= 2.35)
    if aspect_ratio >= 2.35:
        split_x = w // 2
        left_crop = trim_card_margins(img[:, 0:split_x])
        right_crop = trim_card_margins(img[:, split_x:w])
        left_enh = enhance_card_image(auto_orient_card(left_crop, face_cascade))
        right_enh = enhance_card_image(auto_orient_card(right_crop, face_cascade))

        left_has_face = detect_face(left_crop, face_cascade)
        right_has_face = detect_face(right_crop, face_cascade)

        if right_has_face and not left_has_face:
            front_crop, back_crop = right_enh, left_enh
            front_raw, back_raw = right_crop, left_crop
        else:
            front_crop, back_crop = left_enh, right_enh
            front_raw, back_raw = left_crop, right_crop

        f_code, f_text = extract_id_code(front_raw)
        b_code, b_text = extract_id_code(back_raw)
        extracted_code = f_code or b_code
        combined_text = (f_text or "") + " " + (b_text or "")
        doc_label = get_doc_type_label(combined_text)

        front_id = str(uuid.uuid4())
        front_save_name = f"{front_id}_front.jpg"
        cv2.imwrite(os.path.join(upload_dir, front_save_name), front_crop, [cv2.IMWRITE_JPEG_QUALITY, 95])

        back_id = str(uuid.uuid4())
        back_save_name = f"{back_id}_back.jpg"
        cv2.imwrite(os.path.join(upload_dir, back_save_name), back_crop, [cv2.IMWRITE_JPEG_QUALITY, 95])

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
                "extractedText": f_text,
                "isDarkPage": check_dark_page(front_crop),
                "pageCount": 1,
                "status": "matched",
                "lowConfidenceCrop": True
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
                "extractedText": b_text,
                "isDarkPage": check_dark_page(back_crop),
                "pageCount": 1,
                "status": "matched",
                "lowConfidenceCrop": True
            }
        ]

    # Case C: Single Card Camera / Phone Photo (standard smartphone 4:3, 16:9, or card aspect ratios)
    # Covers aspect ratios from 0.40 to 2.35 (standard single phone photos without splitting)
    trimmed = trim_card_margins(img)
    oriented = auto_orient_card(trimmed, face_cascade)
    enhanced = enhance_card_image(oriented)
    has_face = detect_face(enhanced, face_cascade)
    side = "front" if has_face else "back"
    code, text = extract_id_code(enhanced)
    doc_label = get_doc_type_label(text)

    # Check if this document is actually an ID card (either card aspect ratio, has face, or recognized govt ID text)
    is_id_card = (0.50 <= aspect_ratio <= 2.20) or has_face or (doc_label != "General Document" and doc_label != "ID Card")

    if is_id_card:
        doc_id = str(uuid.uuid4())
        save_name = f"{doc_id}.jpg"
        cv2.imwrite(os.path.join(upload_dir, save_name), enhanced, [cv2.IMWRITE_JPEG_QUALITY, 95])

        return [{
            "id": doc_id,
            "save_name": save_name,
            "fileType": "image",
            "jobType": "id-card",
            "docTypeLabel": doc_label,
            "side": side,
            "groupId": group_id,
            "extractedCode": code,
            "extractedText": text,
            "isDarkPage": check_dark_page(enhanced),
            "pageCount": 1,
            "status": "matched" if side == "front" else "unmatched",
            "lowConfidenceCrop": True
        }]

    # Case D: General Document (Full page / document / receipt / letter)
    doc_id = str(uuid.uuid4())
    save_name = f"{doc_id}.jpg"
    cv2.imwrite(os.path.join(upload_dir, save_name), img, [cv2.IMWRITE_JPEG_QUALITY, 95])

    return [{
        "id": doc_id,
        "save_name": save_name,
        "fileType": "image",
        "jobType": "general-document",
        "docTypeLabel": "General Document",
        "side": None,
        "groupId": group_id,
        "extractedCode": None,
        "extractedText": None,
        "isDarkPage": check_dark_page(img),
        "pageCount": 1,
        "status": "matched",
        "lowConfidenceCrop": False
    }]

def group_documents(documents: list) -> list:
    """
    Links front and back pairs by:
    1. Pre-assigned groupId (from single-image dual-card auto-split)
    2. Extracted Aadhaar/PAN code matching
    3. Positional/Sequential matching for batch uploads (e.g. 5 fronts + 5 backs)
    """
    # Step 1: Ensure basic docTypeLabel and side
    for doc in documents:
        if not doc.get("docTypeLabel"):
            doc["docTypeLabel"] = "ID Card" if doc.get("jobType") == "id-card" else "General Document"

    # Step 2: Code-based matching (Aadhaar / PAN numbers)
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

    # Step 3: Count fronts and backs per group (including pre-split and code-matched)
    group_front_counts = {}
    group_back_counts = {}
    for doc in documents:
        gid = doc.get("groupId")
        if gid:
            if doc.get("side") == "front":
                group_front_counts[gid] = group_front_counts.get(gid, 0) + 1
            elif doc.get("side") == "back":
                group_back_counts[gid] = group_back_counts.get(gid, 0) + 1

    # Step 4: Find remaining unassigned/unpaired fronts and backs
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

    # Step 5: Handling of remaining unassigned/unpaired cards
    # =====================================================================================
    # CRITICAL SAFETY RULE: DO NOT REINTRODUCE POSITIONAL/SEQUENTIAL FALLBACK MATCHING!
    # Unmatched fronts and backs must NEVER be guessed by index order or array position,
    # as that can silently cross-pair different people's government ID documents.
    # Only genuine extractedCode equality or pre-split groupId may automatically pair.
    # Everything else must be flagged as "unmatched" for explicit operator review & pairing.
    # =====================================================================================

    # Unpaired fronts can be printed as single cards or paired manually by operator
    for f_doc in unpaired_fronts:
        if not f_doc.get("groupId"):
            f_doc["groupId"] = str(uuid.uuid4())[:8]
        f_doc["status"] = "matched"

    # Any back that could not be matched by exact code equality MUST remain unmatched!
    for b_doc in unpaired_backs:
        if not b_doc.get("groupId"):
            b_doc["groupId"] = str(uuid.uuid4())[:8]
        b_doc["status"] = "unmatched"

    return documents

def analyze_invert_safety(file_path: str) -> bool:
    """
    Heuristic to determine if it is SAFE to auto-invert a dark page.
    """
    try:
        img = cv2.imread(file_path)
        if img is None:
            return False
            
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        s = hsv[:,:,1]
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
    """
    Inverts the colors of an image.
    """
    try:
        with Image.open(file_path) as img:
            if img.mode == 'RGBA':
                r,g,b,a = img.split()
                rgb_image = Image.merge('RGB', (r,g,b))
                inverted = ImageOps.invert(rgb_image)
                r2,g2,b2 = inverted.split()
                img = Image.merge('RGBA', (r2,g2,b2,a))
            else:
                img = img.convert('RGB')
                img = ImageOps.invert(img)
                
            img.save(output_path)
        return True
    except Exception as e:
        print(f"Invert Error: {e}")
        return False
