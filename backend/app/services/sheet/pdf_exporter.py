import os
import uuid
import math
import logging
from PIL import Image, ImageDraw
from fastapi import HTTPException
from fastapi.responses import FileResponse
from app.core.config import UPLOAD_DIR, PROCESSED_DIR
from app.models.sheet import SheetPDFRequest
from app.utils.color import get_bg_rgb

logger = logging.getLogger("primeidpro.sheet_pdf")


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

                # Load image
                url_str = item.url
                photo_img = None

                try:
                    if url_str.startswith("data:image"):
                        import base64
                        from io import BytesIO
                        b64_data = url_str.split(",", 1)[1]
                        photo_img = Image.open(BytesIO(base64.b64decode(b64_data)))
                    elif url_str.startswith("/processed/"):
                        fname = url_str.split("/processed/")[1]
                        local_path = os.path.join(PROCESSED_DIR, fname)
                        if os.path.exists(local_path):
                            photo_img = Image.open(local_path)
                    elif url_str.startswith("/uploads/"):
                        fname = url_str.split("/uploads/")[1]
                        local_path = os.path.join(UPLOAD_DIR, fname)
                        if os.path.exists(local_path):
                            photo_img = Image.open(local_path)
                    elif os.path.exists(url_str):
                        photo_img = Image.open(url_str)
                except Exception as img_err:
                    logger.warning(f"Failed to load image {url_str}: {img_err}")

                if photo_img:
                    if photo_img.mode == "RGBA":
                        bg_c = get_bg_rgb(item.bgColor or "#FFFFFF")
                        flat_card = Image.new("RGB", (pw_px, ph_px), bg_c)
                        resized_p = photo_img.resize((pw_px, ph_px), Image.Resampling.LANCZOS)
                        flat_card.paste(resized_p, (0, 0), mask=resized_p.split()[3])
                        page_canvas.paste(flat_card, (x, y))
                    else:
                        resized_p = photo_img.resize((pw_px, ph_px), Image.Resampling.LANCZOS)
                        page_canvas.paste(resized_p, (x, y))
                else:
                    # Placeholder outline
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