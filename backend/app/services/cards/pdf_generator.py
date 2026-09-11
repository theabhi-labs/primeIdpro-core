import os
import uuid
import math
import shutil
import tempfile
import subprocess
import logging
from typing import List, Dict, Any, Optional, Tuple
import jinja2
from PIL import Image, ImageDraw
from app.core.config import PROCESSED_DIR
from app.models.card_studio import CardProject, CardRecord, GenerateBatchRequest, OrganizationData
from app.services.cards.template_engine import render_card_html, get_template_by_id, list_card_templates

logger = logging.getLogger("primeidpro.cards.pdf")

OUTPUT_DIR = os.path.join(PROCESSED_DIR, "card_outputs")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def _find_browser_executable() -> Optional[str]:
    """
    Locates Google Chrome or Microsoft Edge on Windows/Linux.
    """
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        shutil.which("chrome"),
        shutil.which("msedge"),
        shutil.which("google-chrome"),
        shutil.which("chromium"),
        shutil.which("chromium-browser"),
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return None


def get_template_dimensions_300dpi(template_id: str) -> Tuple[int, int, bool]:
    """
    Returns (pixel_width, pixel_height, is_vertical) at exact 300 DPI for CR80 standard:
    - Vertical: 53.98mm x 85.60mm -> 638 x 1011 px (CSS: 204 x 324 px)
    - Horizontal: 85.60mm x 53.98mm -> 1011 x 638 px (CSS: 324 x 204 px)
    """
    template_info = get_template_by_id(template_id)
    is_vertical = False
    if template_info:
        meta, _ = template_info
        if meta.size:
            if meta.size.orientation == "vertical" or (meta.size.height > meta.size.width):
                is_vertical = True
    elif "vertical" in (template_id or "").lower():
        is_vertical = True

    if is_vertical:
        return 638, 1011, True
    else:
        return 1011, 638, False


def _extract_template_parts(template_id: str) -> Tuple[str, jinja2.Template]:
    """Extracts CSS and Jinja2 body template from a template package."""
    template_info = get_template_by_id(template_id)
    if not template_info:
        all_t = list_card_templates()
        if all_t:
            template_info = get_template_by_id(all_t[0].id)

    raw_html = template_info[1] if template_info else ""
    css_content = ""
    if "<style>" in raw_html and "</style>" in raw_html:
        css_content = raw_html.split("<style>")[1].split("</style>")[0]

    body_template_str = raw_html
    if "<body>" in raw_html and "</body>" in raw_html:
        body_template_str = raw_html.split("<body>")[1].split("</body>")[0]
    elif '<div class="card-container">' in raw_html:
        body_template_str = raw_html[raw_html.find('<div class="card-container">'):]

    jinja_tpl = jinja2.Template(body_template_str)
    return css_content, jinja_tpl


def _resolve_image_to_data_uri_or_file(img_path_or_url: Optional[str]) -> str:
    """Converts relative URLs and local file paths to base64 Data URIs so headless browser renders images flawlessly."""
    if not img_path_or_url:
        return ""
    if img_path_or_url.startswith("data:"):
        return img_path_or_url

    from app.core.config import PROCESSED_DIR, UPLOAD_DIR, APP_DIR
    local_path = None
    if img_path_or_url.startswith("/processed/"):
        rel = img_path_or_url[len("/processed/"):]
        candidate = os.path.join(PROCESSED_DIR, rel)
        if os.path.exists(candidate):
            local_path = candidate
    elif img_path_or_url.startswith("/uploads/"):
        rel = img_path_or_url[len("/uploads/"):]
        candidate = os.path.join(UPLOAD_DIR, rel)
        if os.path.exists(candidate):
            local_path = candidate
    elif os.path.isabs(img_path_or_url) and os.path.exists(img_path_or_url):
        local_path = img_path_or_url
    else:
        for base in [PROCESSED_DIR, UPLOAD_DIR, APP_DIR, os.getcwd()]:
            cand = os.path.join(base, img_path_or_url.lstrip("/\\"))
            if os.path.exists(cand):
                local_path = cand
                break

    if local_path and os.path.exists(local_path):
        try:
            import base64
            with open(local_path, "rb") as f:
                encoded = base64.b64encode(f.read()).decode("utf-8")
            ext = os.path.splitext(local_path)[1].lower().replace(".", "")
            mime = "image/png" if ext == "png" else ("image/svg+xml" if ext == "svg" else "image/jpeg")
            return f"data:{mime};base64,{encoded}"
        except Exception:
            return f"file:///{local_path.replace(os.sep, '/')}"

    return img_path_or_url


def _build_record_context(record: CardRecord, org: OrganizationData, side: str = "front") -> Dict[str, Any]:
    """Builds template context for a single card side with resolved image data URIs."""
    org_data = org.model_dump()
    if org_data.get("logo"):
        org_data["logo"] = _resolve_image_to_data_uri_or_file(org_data["logo"])
    if org_data.get("signature"):
        org_data["signature"] = _resolve_image_to_data_uri_or_file(org_data["signature"])

    ctx = {
        "organization": org_data,
        "side": side,
    }
    for k, v in record.fields.items():
        ctx[k] = v

    # Fallbacks & Aliases
    if "phone" in ctx and "mobile" not in ctx:
        ctx["mobile"] = ctx["phone"]
    if "mobile" in ctx and "phone" not in ctx:
        ctx["phone"] = ctx["mobile"]
    if "className" in ctx and "class" not in ctx:
        ctx["class"] = ctx["className"]
    if "class" in ctx and "className" not in ctx:
        ctx["className"] = ctx["class"]
    if "rollNumber" in ctx and "rollNo" not in ctx:
        ctx["rollNo"] = ctx["rollNumber"]
    if "rollNo" in ctx and "rollNumber" not in ctx:
        ctx["rollNumber"] = ctx["rollNo"]

    photo_val = (
        record.fields.get("photo")
        or (getattr(record, "processedPhoto", None) and getattr(record.processedPhoto, "processedUrl", None))
        or (getattr(record, "photo", None) and getattr(record.photo, "originalPath", None))
        or ""
    )
    ctx["photo"] = _resolve_image_to_data_uri_or_file(photo_val)
    return ctx


def render_card_bitmap(
    template_id: str,
    record: CardRecord,
    organization: OrganizationData,
    side: str = "front",
    dpi: int = 300
) -> Image.Image:
    """
    Renders a single 300 DPI bitmap of a card from its HTML template.
    """
    pixel_w, pixel_h, is_vertical = get_template_dimensions_300dpi(template_id)
    css_w = 204 if is_vertical else 324
    css_h = 324 if is_vertical else 204

    html_content = render_card_html(
        template_id=template_id,
        record=record,
        organization=organization,
        side=side
    )

    print_override_css = f"""
    <style id="print-reset-style">
      @page {{ margin: 0; size: {css_w}px {css_h}px; }}
      html, body {{
        margin: 0 !important;
        padding: 0 !important;
        width: {css_w}px !important;
        height: {css_h}px !important;
        display: block !important;
        overflow: hidden !important;
        background: #ffffff !important;
      }}
      .card-container {{
        margin: 0 !important;
        padding: 0 !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: {css_w}px !important;
        height: {css_h}px !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
      }}
    </style>
    """
    if "</head>" in html_content:
        html_content = html_content.replace("</head>", print_override_css + "</head>")
    else:
        html_content = print_override_css + html_content

    browser_exe = _find_browser_executable()
    if browser_exe:
        temp_dir = tempfile.mkdtemp(prefix="single_card_")
        temp_html = os.path.join(temp_dir, "card.html")
        temp_png = os.path.join(temp_dir, "card.png")
        try:
            with open(temp_html, "w", encoding="utf-8") as f:
                f.write(html_content)

            cmd = [
                browser_exe,
                "--headless=new",
                "--disable-gpu",
                "--no-sandbox",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-background-networking",
                "--disable-sync",
                "--disable-translate",
                "--disable-extensions",
                "--disable-default-apps",
                "--hide-scrollbars",
                "--mute-audio",
                f"--user-data-dir={temp_dir}",
                "--force-device-scale-factor=3.125",
                f"--window-size={css_w},{css_h}",
                f"--screenshot={temp_png}",
                temp_html,
            ]
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
            if os.path.exists(temp_png):
                card_img = Image.open(temp_png).convert("RGB")
                if card_img.size != (pixel_w, pixel_h):
                    card_img = card_img.resize((pixel_w, pixel_h), Image.Resampling.LANCZOS)
                return card_img
        except Exception as err:
            logger.warning(f"Browser single card render failed: {err}")
        finally:
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass

    # Fallback Canvas
    card = Image.new("RGB", (pixel_w, pixel_h), (255, 255, 255))
    draw = ImageDraw.Draw(card)
    draw.rectangle([(0, 0), (pixel_w, 80)], fill=(30, 64, 175))
    draw.text((20, 30), str(organization.name or "IDENTITY CARD").upper(), fill=(255, 255, 255))
    draw.text((20, 120), f"Name: {record.fields.get('name', 'Student')}", fill=(15, 23, 42))
    return card


draw_card_bitmap = render_card_bitmap


def generate_card_batch_pdf(
    project: CardProject,
    req: GenerateBatchRequest
) -> str:
    """
    Generates an ultra-fast, print-ready 300 DPI vector PDF for all records in a CardProject.
    Uses single-shot headless browser compilation for instant batch processing.
    """
    records_to_process = project.records
    if req.recordIds:
        id_set = set(req.recordIds)
        records_to_process = [r for r in project.records if r.id in id_set]

    if not records_to_process:
        raise ValueError("No records found to generate cards.")

    template_id = project.templateId or "school-modern-blue"
    org = project.organization
    
    is_vertical = False
    if project.cardSize and project.cardSize.orientation == "vertical":
        is_vertical = True
    elif project.cardSize and project.cardSize.orientation == "horizontal":
        is_vertical = False
    else:
        _, _, is_vertical = get_template_dimensions_300dpi(template_id)

    output_filename = f"Cards_{project.name.replace(' ', '_')}_{uuid.uuid4().hex[:8]}.pdf"
    output_pdf_path = os.path.join(OUTPUT_DIR, output_filename)

    browser_exe = _find_browser_executable()
    css_content, jinja_tpl = _extract_template_parts(template_id)

    # ================= 1. DIRECT PVC (CR80 SINGLE CARD PER PAGE) =================
    if req.outputFormat in ("pvc", "cr80_single"):
        page_w = "53.98mm" if is_vertical else "85.60mm"
        page_h = "85.60mm" if is_vertical else "53.98mm"

        pvc_html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  {css_content}

  @page {{
    size: {page_w} {page_h};
    margin: 0;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html, body {{
    margin: 0 !important;
    padding: 0 !important;
    width: {page_w} !important;
    height: auto !important;
    background: #ffffff !important;
    font-family: 'Segoe UI', Arial, sans-serif !important;
    display: block !important;
    overflow: visible !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }}
  .pvc-page {{
    width: {page_w} !important;
    height: {page_h} !important;
    page-break-after: always !important;
    break-after: page !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    position: relative !important;
    overflow: hidden !important;
    display: block !important;
  }}
  .pvc-page:last-child {{
    page-break-after: avoid !important;
    break-after: avoid !important;
  }}
  .pvc-page .card-container {{
    width: {page_w} !important;
    height: {page_h} !important;
    margin: 0 !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
  }}
</style>
</head>
<body>
"""
        for rec in records_to_process:
            ctx_f = _build_record_context(rec, org, side="front")
            rendered_f = jinja_tpl.render(**ctx_f)
            pvc_html += f'<div class="pvc-page">{rendered_f}</div>\n'
            if req.duplex:
                ctx_b = _build_record_context(rec, org, side="back")
                rendered_b = jinja_tpl.render(**ctx_b)
                pvc_html += f'<div class="pvc-page">{rendered_b}</div>\n'

        pvc_html += "</body></html>"
        return _compile_html_to_pdf(pvc_html, output_pdf_path, browser_exe)

    # ================= 2. A4 SHEET - 5 CARDS FOLDING (POUCH LAMINATION) =================
    if req.rows == 5 or req.duplex or "folding" in str(req.outputFormat).lower():
        cards_per_sheet = 5
        num_sheets = math.ceil(len(records_to_process) / cards_per_sheet)

        # Transformation for vertical vs horizontal cards in standard 85.6mm x 54mm slot
        slot_transform_css = """
  .card-slot .card-container {
    width: 53.98mm !important;
    height: 85.60mm !important;
    margin: 0 !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
    position: absolute !important;
    transform-origin: center center !important;
  }
  .slot-front .card-container {
    transform: rotate(90deg) !important;
  }
  .slot-back .card-container {
    transform: rotate(270deg) !important;
  }
""" if is_vertical else """
  .card-slot .card-container {
    width: 85.60mm !important;
    height: 53.98mm !important;
    margin: 0 !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
  }
"""

        a4_folding_html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  {css_content}

  @page {{
    size: 210mm 297mm;
    margin: 0;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html, body {{
    margin: 0 !important;
    padding: 0 !important;
    width: 210mm !important;
    height: auto !important;
    background: #ffffff !important;
    font-family: 'Segoe UI', Arial, sans-serif !important;
    display: block !important;
    overflow: visible !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }}
  .a4-sheet {{
    width: 210mm !important;
    height: 297mm !important;
    min-height: 297mm !important;
    max-height: 297mm !important;
    position: relative !important;
    page-break-after: always !important;
    break-after: page !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    padding: 13.5mm 19.4mm !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: flex-start !important;
    overflow: hidden !important;
  }}
  .a4-sheet:last-child {{
    page-break-after: avoid !important;
    break-after: avoid !important;
  }}
  .card-row {{
    width: 171.2mm;
    height: 54.0mm;
    display: flex;
    position: relative;
    border: {"0.5px solid #cbd5e1" if req.cutMarks else "none"};
    margin-bottom: 0;
  }}
  .fold-line {{
    position: absolute;
    top: 0;
    bottom: 0;
    left: 85.6mm;
    width: 1px;
    border-left: 1px dashed #94a3b8;
    z-index: 100;
  }}
  .card-slot {{
    width: 85.6mm;
    height: 54.0mm;
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  {slot_transform_css}
</style>
</head>
<body>
"""
        for sheet_idx in range(num_sheets):
            a4_folding_html += '<div class="a4-sheet">\n'
            start_i = sheet_idx * cards_per_sheet
            end_i = min(start_i + cards_per_sheet, len(records_to_process))

            for rec_idx in range(start_i, end_i):
                rec = records_to_process[rec_idx]
                ctx_f = _build_record_context(rec, org, side="front")
                ctx_b = _build_record_context(rec, org, side="back")
                rendered_f = jinja_tpl.render(**ctx_f)
                rendered_b = jinja_tpl.render(**ctx_b)

                a4_folding_html += f"""
    <div class="card-row">
      <div class="fold-line"></div>
      <div class="card-slot slot-front">
        {rendered_f}
      </div>
      <div class="card-slot slot-back">
        {rendered_b}
      </div>
    </div>
"""
            a4_folding_html += '</div>\n'

        a4_folding_html += "</body></html>"
        return _compile_html_to_pdf(a4_folding_html, output_pdf_path, browser_exe)

    # ================= 3. A4 MULTI-UP GRID (SINGLE-SIDED GRID) =================
    # For Vertical (Portrait: 54x85.6mm) cards: 3 cols x 3 rows = 9 cards per page (fits 297mm height cleanly)
    # For Horizontal (Landscape: 85.6x54mm) cards: 2 cols x 5 rows = 10 cards per page (fits 297mm height cleanly)
    if is_vertical:
        cols = 3
        rows = 3
        gap_x = "5mm"
        gap_y = "5mm"
        pad_top_bottom = "14mm"
        pad_left_right = "17mm"
    else:
        cols = 2
        rows = 5
        gap_x = "6mm"
        gap_y = "3.5mm"
        pad_top_bottom = "8mm"
        pad_left_right = "16mm"

    cards_per_sheet = cols * rows
    num_sheets = math.ceil(len(records_to_process) / cards_per_sheet)

    grid_card_w = "53.98mm" if is_vertical else "85.60mm"
    grid_card_h = "85.60mm" if is_vertical else "53.98mm"

    a4_grid_html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  {css_content}

  @page {{
    size: 210mm 297mm;
    margin: 0;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html, body {{
    margin: 0 !important;
    padding: 0 !important;
    width: 210mm !important;
    height: auto !important;
    background: #ffffff !important;
    font-family: 'Segoe UI', Arial, sans-serif !important;
    display: block !important;
    overflow: visible !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }}
  .a4-grid-sheet {{
    width: 210mm !important;
    height: 297mm !important;
    min-height: 297mm !important;
    max-height: 297mm !important;
    position: relative !important;
    page-break-after: always !important;
    break-after: page !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    display: grid !important;
    grid-template-columns: repeat({cols}, {grid_card_w}) !important;
    grid-template-rows: repeat({rows}, {grid_card_h}) !important;
    column-gap: {gap_x} !important;
    row-gap: {gap_y} !important;
    padding: {pad_top_bottom} {pad_left_right} !important;
    justify-content: center !important;
    align-content: center !important;
    overflow: hidden !important;
  }}
  .a4-grid-sheet:last-child {{
    page-break-after: avoid !important;
    break-after: avoid !important;
  }}
  .grid-card-wrapper {{
    width: {grid_card_w} !important;
    height: {grid_card_h} !important;
    position: relative !important;
    overflow: hidden !important;
    border: {"0.5px solid #cbd5e1" if req.cutMarks else "none"} !important;
  }}
  .grid-card-wrapper .card-container {{
    width: {grid_card_w} !important;
    height: {grid_card_h} !important;
    margin: 0 !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
  }}
</style>
</head>
<body>
"""
    for sheet_idx in range(num_sheets):
        a4_grid_html += '<div class="a4-grid-sheet">\n'
        start_i = sheet_idx * cards_per_sheet
        end_i = min(start_i + cards_per_sheet, len(records_to_process))

        for rec_idx in range(start_i, end_i):
            rec = records_to_process[rec_idx]
            ctx_f = _build_record_context(rec, org, side="front")
            rendered_f = jinja_tpl.render(**ctx_f)
            a4_grid_html += f'<div class="grid-card-wrapper">{rendered_f}</div>\n'

        a4_grid_html += '</div>\n'

    a4_grid_html += "</body></html>"
    return _compile_html_to_pdf(a4_grid_html, output_pdf_path, browser_exe)


def _compile_html_to_pdf(html_content: str, output_pdf_path: str, browser_exe: Optional[str]) -> str:
    """Compiles complete HTML document to native vector PDF using headless browser in 1 single pass."""
    if not browser_exe:
        raise RuntimeError("No headless browser (Chrome/Edge) available to compile print PDF.")

    temp_dir = tempfile.mkdtemp(prefix="card_batch_pdf_")
    temp_html = os.path.join(temp_dir, "batch_print.html")
    temp_pdf = os.path.join(temp_dir, "batch_print.pdf")

    try:
        with open(temp_html, "w", encoding="utf-8") as f:
            f.write(html_content)

        cmd = [
            browser_exe,
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-background-networking",
            "--disable-sync",
            "--disable-translate",
            "--disable-extensions",
            "--disable-default-apps",
            "--hide-scrollbars",
            "--mute-audio",
            f"--user-data-dir={temp_dir}",
            "--no-pdf-header-footer",
            f"--print-to-pdf={temp_pdf}",
            temp_html,
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=40)

        if os.path.exists(temp_pdf):
            shutil.copy2(temp_pdf, output_pdf_path)
            return output_pdf_path
        else:
            raise RuntimeError("PDF file was not created by browser compiler.")
    finally:
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass
