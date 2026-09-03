import os
from typing import List, Dict, Any, Tuple, Optional
from app.models.card_studio import CardRecord, PhotoMatchInfo

VALID_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".heic", ".avif"}


def scan_photo_folder(folder_path: str) -> Dict[str, str]:
    """
    Scans a local photo directory and returns two lookups:
    1. full_filename.lower() -> absolute_path
    2. base_filename.lower() -> absolute_path (without extension)
    """
    files_map = {}
    if not os.path.exists(folder_path) or not os.path.isdir(folder_path):
        return files_map

    for root, _, filenames in os.walk(folder_path):
        for fname in filenames:
            ext = os.path.splitext(fname)[1].lower()
            if ext in VALID_IMAGE_EXTS:
                full_path = os.path.join(root, fname)
                # Map full filename
                files_map[fname.lower()] = full_path
                # Map base filename (without ext)
                base = os.path.splitext(fname)[0].lower()
                files_map[base] = full_path

    return files_map


def match_photos_for_records(
    records: List[CardRecord],
    photo_folder: Optional[str] = None,
    uploaded_files: Optional[List[Dict[str, str]]] = None,
    match_strategy: str = "auto",
    identifier_field: str = "rollNumber"
) -> Tuple[List[CardRecord], Dict[str, int]]:
    """
    Match photos against CardRecords.
    Supports:
    1. Embedded photo reference in record sourceData ('_embedded_photo_path')
    2. Explicit photo column filename from record fields['photo']
    3. Identifier-based match (fields[identifier_field] + '.jpg' etc.)
    4. Uploaded photo files from frontend
    5. Local folder scanning
    """
    folder_files = scan_photo_folder(photo_folder) if photo_folder else {}

    # Also incorporate uploaded files from frontend if provided
    if uploaded_files:
        for uf in uploaded_files:
            fname = uf.get("filename", "")
            path = uf.get("path") or uf.get("dataUrl")
            if fname and path:
                folder_files[fname.lower()] = path
                base = os.path.splitext(fname)[0].lower()
                folder_files[base] = path

    stats = {
        "matched": 0,
        "missing": 0,
        "embedded": 0,
        "folder_matched": 0
    }

    updated_records = []
    for rec in records:
        fields = rec.fields
        source_data = rec.sourceData

        matched_path = None
        match_method = None
        confidence = 0.0

        # Strategy 1: Check embedded photo path from XLSX extraction
        if "_embedded_photo_path" in source_data and os.path.exists(source_data["_embedded_photo_path"]):
            matched_path = source_data["_embedded_photo_path"]
            match_method = "embedded"
            confidence = 1.0
            stats["embedded"] += 1

        # Strategy 2: Check mapped photo column value (e.g., '101.jpg' or 'photos/101.jpg')
        photo_col_val = str(fields.get("photo", "")).strip()
        if not matched_path and photo_col_val:
            raw_base = os.path.basename(photo_col_val).lower()
            raw_stem = os.path.splitext(raw_base)[0].lower()

            if raw_base in folder_files:
                matched_path = folder_files[raw_base]
                match_method = "exact_filename"
                confidence = 1.0
            elif raw_stem in folder_files:
                matched_path = folder_files[raw_stem]
                match_method = "base_filename"
                confidence = 0.95
            elif os.path.exists(photo_col_val):
                matched_path = photo_col_val
                match_method = "direct_path"
                confidence = 1.0

        # Strategy 3: Check Identifier field (e.g., rollNumber = '101' -> '101.jpg')
        id_val = str(fields.get(identifier_field, "")).strip().lower()
        if not matched_path and id_val:
            if id_val in folder_files:
                matched_path = folder_files[id_val]
                match_method = f"identifier_{identifier_field}"
                confidence = 0.90
            else:
                # Check with common extensions
                for ext in [".jpg", ".jpeg", ".png", ".webp"]:
                    test_name = f"{id_val}{ext}"
                    if test_name in folder_files:
                        matched_path = folder_files[test_name]
                        match_method = f"identifier_{identifier_field}"
                        confidence = 0.90
                        break

        # Strategy 4: Check student/person name if no ID
        name_val = str(fields.get("name", "")).strip().lower()
        if not matched_path and name_val:
            clean_name = name_val.replace(" ", "_")
            if clean_name in folder_files:
                matched_path = folder_files[clean_name]
                match_method = "name_match"
                confidence = 0.75

        # Update record photo match info
        if matched_path:
            rec.photo = PhotoMatchInfo(
                source="folder" if match_method != "embedded" else "embedded",
                originalFilename=os.path.basename(matched_path) if isinstance(matched_path, str) else "photo",
                originalPath=matched_path,
                matched=True,
                matchConfidence=confidence,
                matchMethod=match_method
            )
            stats["matched"] += 1
            if match_method != "embedded":
                stats["folder_matched"] += 1
        else:
            rec.photo = PhotoMatchInfo(
                source="none",
                matched=False,
                matchConfidence=0.0,
                matchMethod="none"
            )
            stats["missing"] += 1

        updated_records.append(rec)

    return updated_records, stats
