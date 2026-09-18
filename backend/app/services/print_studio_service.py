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

def enhance_card_image(card_bgr: np.ndarray, target_w: int = 1011, target_h: int = 638) -> np.ndarray:
    """
    Quality Enhancement Pipeline for 300 DPI ID Card Printing:
    1. Lanczos4 High-Quality Interpolation to exact standard CR80 size (1011x638).
    2. CLAHE (Contrast Limited Adaptive Histogram Equalization) on Luminance channel for crisp text & photos.
    3. Unsharp Masking (USM) for high edge definition.
    """
    try:
        # Resize to standard CR80 at 300 DPI
        upscaled = cv2.resize(card_bgr, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)
        
        # Adaptive contrast on L channel in LAB color space
        lab = cv2.cvtColor(upscaled, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=1.8, tileGridSize=(8, 8))
        l_enhanced = clahe.apply(l)
        enhanced_lab = cv2.merge((l_enhanced, a, b))
        enhanced_bgr = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
        
        # Unsharp mask for high-definition text, barcodes, and photo clarity
        gaussian = cv2.GaussianBlur(enhanced_bgr, (0, 0), sigmaX=1.5)
        sharpened = cv2.addWeighted(enhanced_bgr, 1.35, gaussian, -0.35, 0)
        
        return sharpened
    except Exception as e:
        print(f"Error enhancing card image: {e}")
        return card_bgr

def trim_card_margins(img_bgr: np.ndarray, tol: int = 240) -> np.ndarray:
    """
    Trims excessive white / scanner borders around an ID card.
    """
    try:
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        mask = gray < tol
        coords = np.argwhere(mask)
        if coords.size > 0:
            y0, x0 = coords.min(axis=0)
            y1, x1 = coords.max(axis=0) + 1
            # Ensure crop doesn't collapse image too much (> 55% of original dimensions)
            h, w = img_bgr.shape[:2]
            if (y1 - y0) > h * 0.55 and (x1 - x0) > w * 0.55:
                # Add a 4px safety padding
                pad = 4
                y0 = max(0, y0 - pad)
                x0 = max(0, x0 - pad)
                y1 = min(h, y1 + pad)
                x1 = min(w, x1 + pad)
                return img_bgr[y0:y1, x0:x1]
        return img_bgr
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
        
        # Clean up text
        text_clean = re.sub(r'[^A-Z0-9]', '', text.upper())
        
        # Look for 8-12 digit continuous numbers (e.g. Aadhar without spaces)
        digit_match = re.search(r'\d{8,12}', text_clean)
        if digit_match:
            return digit_match.group(0), text
            
        # Look for alphanumeric patterns typical for PAN (5 char, 4 digit, 1 char)
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
    Takes an uploaded file. If it contains both Front and Back in a single image,
    it automatically cuts them, enhances quality, and returns two separate documents!
    Otherwise returns a single document.
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
            "status": "matched"
        }]

    # Handle Image files
    img = cv2.imread(file_path)
    if img is None:
        # Fallback if OpenCV fails
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
            "status": "matched"
        }]

    h, w = img.shape[:2]
    aspect_ratio = w / h if h > 0 else 1.0

    group_id = str(uuid.uuid4())[:8]

    # CASE A: Vertical Dual Card (Front on Top, Back on Bottom)
    # Typical single image Aadhaar/PAN download where height is larger than or close to width (0.6 <= w/h <= 1.25)
    if 0.55 <= aspect_ratio <= 1.30:
        split_y = h // 2
        top_crop = trim_card_margins(img[0:split_y, :])
        bottom_crop = trim_card_margins(img[split_y:h, :])

        # Enhance both cards
        top_enh = enhance_card_image(top_crop)
        bottom_enh = enhance_card_image(bottom_crop)

        # Check face detection to accurately determine front vs back
        top_has_face = detect_face(top_crop, face_cascade)
        bottom_has_face = detect_face(bottom_crop, face_cascade)

        if bottom_has_face and not top_has_face:
            front_crop, back_crop = bottom_enh, top_enh
            front_raw, back_raw = bottom_crop, top_crop
        else:
            front_crop, back_crop = top_enh, bottom_enh
            front_raw, back_raw = top_crop, bottom_crop

        # Extract text & code
        f_code, f_text = extract_id_code(front_raw)
        b_code, b_text = extract_id_code(back_raw)
        extracted_code = f_code or b_code
        combined_text = (f_text or "") + " " + (b_text or "")
        doc_label = get_doc_type_label(combined_text)

        # Save Front
        front_id = str(uuid.uuid4())
        front_save_name = f"{front_id}_front.jpg"
        front_path = os.path.join(upload_dir, front_save_name)
        cv2.imwrite(front_path, front_crop, [cv2.IMWRITE_JPEG_QUALITY, 95])

        # Save Back
        back_id = str(uuid.uuid4())
        back_save_name = f"{back_id}_back.jpg"
        back_path = os.path.join(upload_dir, back_save_name)
        cv2.imwrite(back_path, back_crop, [cv2.IMWRITE_JPEG_QUALITY, 95])

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
                "status": "matched"
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
                "status": "matched"
            }
        ]

    # CASE B: Horizontal Dual Card (Front on Left, Back on Right)
    # Aspect ratio > 2.2
    if aspect_ratio >= 2.2:
        split_x = w // 2
        left_crop = trim_card_margins(img[:, 0:split_x])
        right_crop = trim_card_margins(img[:, split_x:w])

        left_enh = enhance_card_image(left_crop)
        right_enh = enhance_card_image(right_crop)

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
                "status": "matched"
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
                "status": "matched"
            }
        ]

    # CASE C: Single ID Card (1.30 <= aspect_ratio <= 1.95 or 0.5 <= aspect_ratio <= 0.77)
    is_card_aspect = (1.30 <= aspect_ratio <= 1.95) or (0.50 <= aspect_ratio <= 0.77)
    if is_card_aspect:
        trimmed = trim_card_margins(img)
        enhanced = enhance_card_image(trimmed)
        has_face = detect_face(trimmed, face_cascade)
        side = "front" if has_face else "back"
        code, text = extract_id_code(trimmed)
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
            "status": "matched" if side == "front" else "unmatched"
        }]

    # CASE D: General Document (Full page / document / receipt)
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
        "status": "matched"
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

    # Step 2: Check pre-matched groups (where groupId is already shared between a front and back)
    group_front_counts = {}
    group_back_counts = {}
    for doc in documents:
        gid = doc.get("groupId")
        if gid:
            if doc.get("side") == "front":
                group_front_counts[gid] = group_front_counts.get(gid, 0) + 1
            elif doc.get("side") == "back":
                group_back_counts[gid] = group_back_counts.get(gid, 0) + 1

    # Step 3: Code-based matching (Aadhaar / PAN numbers)
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

    # Step 4: Find remaining unassigned/unpaired fronts and backs
    unpaired_fronts = []
    unpaired_backs = []

    for doc in documents:
        gid = doc.get("groupId")
        side = doc.get("side")
        
        # Check if already part of a valid front+back pair
        is_already_paired = gid and group_front_counts.get(gid, 0) >= 1 and group_back_counts.get(gid, 0) >= 1
        
        if not is_already_paired:
            if side == "front":
                unpaired_fronts.append(doc)
            elif side == "back":
                unpaired_backs.append(doc)
            else:
                # General document or unclassified card
                if not gid:
                    doc["groupId"] = str(uuid.uuid4())[:8]
                doc["status"] = "matched"

    # Step 5: Sequential pairing for remaining batch cards (e.g. 5 fronts and 5 backs)
    pair_count = min(len(unpaired_fronts), len(unpaired_backs))
    for i in range(pair_count):
        new_gid = str(uuid.uuid4())[:8]
        unpaired_fronts[i]["groupId"] = new_gid
        unpaired_fronts[i]["status"] = "matched"
        unpaired_backs[i]["groupId"] = new_gid
        unpaired_backs[i]["status"] = "matched"

    # Any leftover fronts can be printed as single cards
    for f_doc in unpaired_fronts[pair_count:]:
        if not f_doc.get("groupId"):
            f_doc["groupId"] = str(uuid.uuid4())[:8]
        f_doc["status"] = "matched"

    # Any leftover backs without a front become unmatched (asking operator to pair)
    for b_doc in unpaired_backs[pair_count:]:
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


