import os
import io
import csv
import re
import zipfile
from datetime import date, datetime
from typing import List, Dict, Any, Tuple, Optional

HEADER_KEYWORDS = {
    "name", "student", "student_name", "candidate", "candidate_name", "fullname", "full_name",
    "roll", "roll_no", "rollno", "roll_num", "id", "id_no", "id_number", "class",
    "standard", "std", "grade", "section", "sec", "division", "father",
    "father_name", "fathers_name", "mother", "mother_name", "dob",
    "date_of_birth", "birth_date", "blood", "blood_group", "bg",
    "mobile", "phone", "contact", "address", "city", "email", "photo",
    "image", "pic", "sr", "sr_no", "s_no", "sno", "adm", "admission",
    "reg", "registration", "emp", "employee", "designation", "department"
}


def _normalize_text(text: Any) -> str:
    if not text:
        return ""
    t = str(text).lower().strip()
    return re.sub(r'[^a-z0-9]', '_', t).strip('_')


def _format_cell_value(val: Any) -> str:
    """Safely format Excel/CSV cell values into clean strings."""
    if val is None:
        return ""
    if isinstance(val, (datetime, date)):
        return val.strftime("%d/%m/%Y")
    if isinstance(val, float):
        if val.is_integer():
            return str(int(val))
        return f"{val:.4f}".rstrip("0").rstrip(".")
    if isinstance(val, int):
        return str(val)
    if isinstance(val, bool):
        return "true" if val else "false"
    return str(val).strip()


def _find_best_header_row(rows: List[List[Any]], max_search_rows: int = 15) -> int:
    """
    Intelligently identifies the TRUE header row in a spreadsheet.
    Skips top school banner titles or blank lines by evaluating keyword matches & column density.
    """
    best_idx = 0
    best_score = -1

    limit = min(len(rows), max_search_rows)
    for idx in range(limit):
        row = rows[idx]
        if not row or not any(c is not None and str(c).strip() for c in row):
            continue

        non_empty_count = 0
        keyword_matches = 0
        for cell in row:
            if cell is None:
                continue
            s = str(cell).strip()
            if not s:
                continue
            non_empty_count += 1
            norm = _normalize_text(s)
            if norm in HEADER_KEYWORDS:
                keyword_matches += 1
            else:
                for kw in HEADER_KEYWORDS:
                    if kw in norm or norm in kw:
                        keyword_matches += 1
                        break

        # A row with multiple column titles / keyword matches wins over a single title cell
        score = (keyword_matches * 10) + non_empty_count
        if score > best_score:
            best_score = score
            best_idx = idx

    return best_idx


def parse_csv_data(file_bytes: bytes, filename: str = "data.csv") -> Tuple[List[str], List[Dict[str, Any]], Dict[str, Any]]:
    """Parse CSV data into headers and list of row dicts."""
    text = ""
    for enc in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
        try:
            text = file_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue

    if not text:
        text = file_bytes.decode("utf-8", errors="replace")

    reader = csv.reader(io.StringIO(text))
    rows = [list(r) for r in reader]

    if not rows:
        return [], [], {"error": "Empty CSV file"}

    header_idx = _find_best_header_row(rows)
    if header_idx >= len(rows):
        return [], [], {"error": "No valid header or data rows found in CSV"}

    raw_headers = [str(h).strip() if h is not None else "" for h in rows[header_idx]]
    headers = []
    seen = {}
    for idx, h in enumerate(raw_headers):
        clean_h = h if h else f"Column_{idx + 1}"
        if clean_h in seen:
            seen[clean_h] += 1
            headers.append(f"{clean_h}_{seen[clean_h]}")
        else:
            seen[clean_h] = 0
            headers.append(clean_h)

    data_rows = []
    for row_idx in range(header_idx + 1, len(rows)):
        raw_row = rows[row_idx]
        if not any(cell and str(cell).strip() for cell in raw_row):
            continue  # Skip completely blank lines

        row_dict = {}
        for col_idx, header in enumerate(headers):
            val = raw_row[col_idx] if col_idx < len(raw_row) else ""
            row_dict[header] = _format_cell_value(val)
        data_rows.append(row_dict)

    metadata = {
        "sheet_name": "CSV",
        "total_rows": len(data_rows),
        "embedded_images": 0
    }
    return headers, data_rows, metadata


def extract_embedded_images_from_xlsx(file_path: str, extract_dir: str) -> Dict[int, str]:
    """
    Extract embedded images from an XLSX workbook zip structure and map by row index if possible.
    Returns a dict of row_index (1-based) -> extracted_image_path.
    """
    row_to_image = {}
    os.makedirs(extract_dir, exist_ok=True)

    try:
        import openpyxl
        wb = openpyxl.load_workbook(file_path, data_only=True)
        ws = wb.active

        if hasattr(ws, "_images") and ws._images:
            for idx, img in enumerate(ws._images):
                try:
                    row = None
                    if hasattr(img, "anchor"):
                        anchor = img.anchor
                        if hasattr(anchor, "_from") and hasattr(anchor._from, "row"):
                            row = anchor._from.row + 1  # 1-indexed
                        elif hasattr(anchor, "row"):
                            row = anchor.row

                    if row is None:
                        row = idx + 2

                    img_filename = f"embedded_row_{row}_{idx + 1}.png"
                    save_path = os.path.join(extract_dir, img_filename)

                    image_data = img._data()
                    with open(save_path, "wb") as f:
                        f.write(image_data)

                    row_to_image[row] = save_path
                except Exception as img_err:
                    print(f"[IMPORTER] Could not extract image {idx}: {img_err}")
    except Exception as e:
        print(f"[IMPORTER] Openpyxl image extraction fallback: {e}")

    # Fallback to direct ZIP inspection if openpyxl found no images
    if not row_to_image:
        try:
            with zipfile.ZipFile(file_path, 'r') as z:
                media_files = [f for f in z.namelist() if f.startswith('xl/media/')]
                for idx, media in enumerate(media_files):
                    img_data = z.read(media)
                    ext = media.split('.')[-1]
                    target_filename = f"embedded_img_{idx + 1}.{ext}"
                    save_path = os.path.join(extract_dir, target_filename)
                    with open(save_path, "wb") as f:
                        f.write(img_data)
                    row_to_image[idx + 2] = save_path
        except Exception as zip_err:
            print(f"[IMPORTER] Zip fallback error: {zip_err}")

    return row_to_image


def parse_xlsx_data(file_path: str, sheet_name: Optional[str] = None, extract_embedded: bool = True, extract_dir: Optional[str] = None) -> Tuple[List[str], List[Dict[str, Any]], Dict[str, Any]]:
    """Parse XLSX worksheet and return headers, rows, and metadata."""
    import openpyxl
    wb = openpyxl.load_workbook(file_path, data_only=True)
    sheet_names = wb.sheetnames

    target_sheet = sheet_name if sheet_name and sheet_name in sheet_names else sheet_names[0]
    ws = wb[target_sheet]

    # Convert all worksheet rows to in-memory list
    all_raw_rows = [list(r) for r in ws.iter_rows(values_only=True)]
    if not all_raw_rows:
        return [], [], {"sheets": sheet_names, "selected_sheet": target_sheet, "total_rows": 0, "embedded_images_count": 0}

    # Find the best header row index
    header_idx = _find_best_header_row(all_raw_rows)
    raw_header_vals = all_raw_rows[header_idx]

    # Clean & unique headers
    headers = []
    seen = {}
    for idx, val in enumerate(raw_header_vals):
        clean_h = str(val).strip() if val is not None and str(val).strip() else f"Column_{idx + 1}"
        if clean_h in seen:
            seen[clean_h] += 1
            headers.append(f"{clean_h}_{seen[clean_h]}")
        else:
            seen[clean_h] = 0
            headers.append(clean_h)

    # Extract embedded images if requested
    embedded_images = {}
    if extract_embedded and extract_dir:
        embedded_images = extract_embedded_images_from_xlsx(file_path, extract_dir)

    # Read data rows
    data_rows = []
    for row_idx in range(header_idx + 1, len(all_raw_rows)):
        raw_row = all_raw_rows[row_idx]
        # Skip completely empty rows
        if not any(v is not None and str(v).strip() for v in raw_row):
            continue

        row_dict = {}
        for col_idx, header in enumerate(headers):
            val = raw_row[col_idx] if col_idx < len(raw_row) else None
            row_dict[header] = _format_cell_value(val)

        # Attach embedded image reference if found for this physical row
        physical_row = row_idx + 1
        if physical_row in embedded_images:
            row_dict["_embedded_photo_path"] = embedded_images[physical_row]

        data_rows.append(row_dict)

    metadata = {
        "sheets": sheet_names,
        "selected_sheet": target_sheet,
        "total_rows": len(data_rows),
        "embedded_images_count": len(embedded_images)
    }

    return headers, data_rows, metadata
