import os
import uuid
import math
import logging
import base64
import io
import urllib.request
from typing import Optional
from PIL import Image, ImageDraw  # pyrefly: ignore [missing-import]
from fastapi import HTTPException  # pyrefly: ignore [missing-import]
from fastapi.responses import FileResponse  # pyrefly: ignore [missing-import]
from app.core.config import UPLOAD_DIR, PROCESSED_DIR, APP_DIR  # pyrefly: ignore [missing-import]
from app.models.sheet import SheetPDFRequest  # pyrefly: ignore [missing-import]
from app.utils.color import get_bg_rgb  # pyrefly: ignore [missing-import]

logger = logging.getLogger("primeidpro.sheet_pdf")


def _load_photo_image(url_str: str) -> Optional[Image.Image]:
    """
    Robustly loads a PIL Image from:
    - Base64 data URLs
    - HTTP / HTTPS / Localhost URLs
    - /processed/ or /uploads/ paths
    - Local filesystem paths or file:// URLs
    """
    if not url_str:
        return None

    url_str = str(url_str).strip()

    # 1. Base64 Data URI
    if url_str.startswith("data:image"):
        try:
            b64_data = url_str.split(",", 1)[1]
            return Image.open(io.BytesIO(base64.b64decode(b64_data)))
        except Exception as e:
            logger.warning(f"Error decoding base64 image: {e}")

    # 2. Local Processed / Uploaded file paths from URL or string
    try:
        if "/processed/" in url_str:
            fname = url_str.split("/processed/")[-1].split("?")[0].lstrip("/\\")
            if "_final.png" in fname:
                trans_fname = fname.replace("_final.png", "_transparent.png")
                for dir_cand in (PROCESSED_DIR, os.path.join(APP_DIR, "processed")):
                    tp = os.path.join(dir_cand, trans_fname)
                    if os.path.exists(tp):
                        try:
                            return Image.open(tp)
                        except Exception:
                            pass
            cand1 = os.path.join(PROCESSED_DIR, fname)
            cand2 = os.path.join(APP_DIR, "processed", fname)
            for c in (cand1, cand2):
                if os.path.exists(c):
                    return Image.open(c)

        if "/uploads/" in url_str:
            fname = url_str.split("/uploads/")[-1].split("?")[0].lstrip("/\\")
            cand1 = os.path.join(UPLOAD_DIR, fname)
            cand2 = os.path.join(APP_DIR, "uploads", fname)
            for c in (cand1, cand2):
                if os.path.exists(c):
                    return Image.open(c)

        # 3. Direct local path on disk
        if os.path.exists(url_str):
            return Image.open(url_str)

        # 4. file:// URI
        if url_str.startswith("file://"):
            clean_p = url_str.replace("file:///", "").replace("file://", "")
            if os.path.exists(clean_p):
                return Image.open(clean_p)

        # 5. Remote HTTP/HTTPS fetch
        if url_str.startswith(("http://", "https://")):
            req = urllib.request.Request(
                url_str,
                headers={"User-Agent": "PrimeIDPro-Exporter/1.0"}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read()
                return Image.open(io.BytesIO(data))

    except Exception as img_err:
        logger.warning(f"Failed to load image from '{url_str[:120]}...': {img_err}")

    return None


def generate_sheet_pdf_file(req: SheetPDFRequest) -> FileResponse:
    """
    Generate a print-ready PDF at strict 300 DPI with exact millimeter sizing,
    optional cutting guides, and optimized grid packing to eliminate blank margins.
    """
    try:
        dpi = 300
        # 1. Paper size in pixels at 300 DPI
        paper_dims = {
            "a4": (210.0, 297.0),
            "letter": (215.9, 279.4),
            "4x6": (101.6, 152.4),
        }
        paper_key = req.paper_size.lower().replace(" ", "").split("(")[0]
        w_mm, h_mm = paper_dims.get(paper_key, (210.0, 297.0))

        if req.orientation.lower() == "landscape":
            w_mm, h_mm = h_mm, w_mm

        page_w_px = int(round(w_mm / 25.4 * dpi))
        page_h_px = int(round(h_mm / 25.4 * dpi))

        # 2. Photo size in pixels at 300 DPI
        if req.photo_size == "2x2":
            pw_px, ph_px = 600, 600
        else:
            pw_px, ph_px = 413, 531

        # 3. Margins & Spacing in pixels
        top_m_px = int(round(req.margin_top_mm / 25.4 * dpi))
        bottom_m_px = int(round(req.margin_bottom_mm / 25.4 * dpi))
        left_m_px = int(round(req.margin_left_mm / 25.4 * dpi))
        right_m_px = int(round(req.margin_right_mm / 25.4 * dpi))
        spacing_px = int(round(req.spacing_mm / 25.4 * dpi))

        cols = max(1, min(10, req.cols))
        usable_h_px = page_h_px - top_m_px - bottom_m_px

        if req.rows > 0:
            rows = req.rows
        else:
            rows = max(1, math.floor((usable_h_px + spacing_px) / (ph_px + spacing_px)))

        per_page = rows * cols

        # 4. Expand photo entries
        expanded_photos = []
        for p in req.photos:
            for _ in range(max(1, p.copies)):
                expanded_photos.append(p)

        if not expanded_photos:
            raise HTTPException(400, "No photos provided for sheet generation")

        pages_count = math.ceil(len(expanded_photos) / per_page)
        pages_images = []

        # Calculate grid starting offsets to center grid horizontally
        grid_w_px = cols * pw_px + (cols - 1) * spacing_px
        start_x_px = max(left_m_px, left_m_px + (page_w_px - left_m_px - right_m_px - grid_w_px) // 2)
        start_y_px = top_m_px

        for p_idx in range(pages_count):
            page_canvas = Image.new("RGB", (page_w_px, page_h_px), (255, 255, 255))
            draw = ImageDraw.Draw(page_canvas)

            page_start = p_idx * per_page
            page_end = min(page_start + per_page, len(expanded_photos))

            # Place photos on current page
            for i in range(page_start, page_end):
                item = expanded_photos[i]
                slot = i - page_start
                r = slot // cols
                c = slot % cols

                x = start_x_px + c * (pw_px + spacing_px)
                y = start_y_px + r * (ph_px + spacing_px)

                # Robust image loader
                photo_img = _load_photo_image(item.url)

                if photo_img:
                    try:
                        if photo_img.mode == "RGBA":
                            bg_c = get_bg_rgb(item.bgColor or "#FFFFFF")
                            flat_card = Image.new("RGB", (pw_px, ph_px), bg_c)
                            resized_p = photo_img.resize((pw_px, ph_px), Image.Resampling.LANCZOS)
                            flat_card.paste(resized_p, (0, 0), mask=resized_p.split()[3])
                            page_canvas.paste(flat_card, (x, y))
                        else:
                            rgb_img = photo_img.convert("RGB")
                            resized_p = rgb_img.resize((pw_px, ph_px), Image.Resampling.LANCZOS)
                            page_canvas.paste(resized_p, (x, y))
                    except Exception as paste_err:
                        logger.warning(f"Failed pasting photo at slot {slot}: {paste_err}")
                        draw.rectangle([x, y, x + pw_px, y + ph_px], fill=(245, 245, 245))
                else:
                    # Placeholder outline if image completely unavailable
                    draw.rectangle([x, y, x + pw_px, y + ph_px], fill=(245, 245, 245))

                # Draw subtle photo border
                if req.border:
                    draw.rectangle([x, y, x + pw_px - 1, y + ph_px - 1], outline=(210, 210, 210), width=1)

                # Draw cut guides if enabled
                if req.cut_marks:
                    tick_len = int(round(3.5 / 25.4 * dpi))  # ~41 px (~3.5mm)
                    corners = [
                        (x, y, -1, -1),
                        (x + pw_px, y, 1, -1),
                        (x, y + ph_px, -1, 1),
                        (x + pw_px, y + ph_px, 1, 1)
                    ]
                    for cx, cy, dx, dy in corners:
                        draw.line([(cx, cy), (cx + dx * tick_len, cy)], fill=(150, 150, 150), width=1)
                        draw.line([(cx, cy), (cx, cy + dy * tick_len)], fill=(150, 150, 150), width=1)

            pages_images.append(page_canvas)

        # 5. Export to PDF at strict 300 DPI
        pdf_filename = f"passport_sheet_{uuid.uuid4().hex[:12]}.pdf"
        pdf_out_path = os.path.join(PROCESSED_DIR, pdf_filename)

        pages_images[0].save(
            pdf_out_path,
            "PDF",
            resolution=300.0,
            save_all=True,
            append_images=pages_images[1:]
        )

        logger.info(f"✅ Generated 300 DPI PDF sheet: {pdf_out_path} ({len(pages_images)} pages)")
        return FileResponse(
            pdf_out_path,
            media_type="application/pdf",
            filename=f"primeidpro_sheet_{req.paper_size}.pdf"
        )

    except Exception as e:
        logger.error(f"Error generating PDF sheet: {e}")
        raise HTTPException(500, f"Failed to generate PDF sheet: {str(e)}")