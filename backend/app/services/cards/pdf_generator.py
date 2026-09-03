import os
import uuid
import math
import io
import logging
from typing import List, Dict, Any, Optional
from PIL import Image, ImageDraw, ImageFont
import qrcode
from app.core.config import PROCESSED_DIR, APP_DIR
from app.models.card_studio import CardProject, CardRecord, GenerateBatchRequest
from app.utils.color import get_bg_rgb

logger = logging.getLogger("primeidpro.cards.pdf")

OUTPUT_DIR = os.path.join(PROCESSED_DIR, "card_outputs")
os.makedirs(OUTPUT_DIR, exist_ok=True)



def draw_card_bitmap(
    record: CardRecord,
    project: CardProject,
    side: str = "front",
    dpi: int = 300
) -> Image.Image:
    """
    Renders a single high-precision 300 DPI bitmap of a card.
    CR80 Standard: 85.60mm x 53.98mm = 1011 x 638 pixels at 300 DPI.
    """
    # CR80 Dimensions in pixels at 300 DPI
    card_w = int(round(85.60 / 25.4 * dpi))  # 1011 px
    card_h = int(round(53.98 / 25.4 * dpi))  # 638 px

    # Base Canvas
    card = Image.new("RGB", (card_w, card_h), (255, 255, 255))
    draw = ImageDraw.Draw(card)

    org = project.organization
    fields = record.fields

    # Colors
    header_color = (30, 64, 175)    # Blue
    text_dark = (15, 23, 42)        # Slate 900
    text_muted = (100, 116, 139)    # Slate 500
    accent_blue = (2, 132, 199)     # Sky 600

    if side == "back":
        # ---------------- BACK OF CARD ----------------
        # Header strip
        draw.rectangle([(0, 0), (card_w, 60)], fill=(241, 245, 249))
        draw.text((30, 18), str(org.name or "IDENTITY CARD").upper(), fill=header_color)
        draw.text((card_w - 240, 18), f"SESSION: {org.session or '2026-27'}", fill=text_muted)
        draw.line([(0, 60), (card_w, 60)], fill=(203, 213, 225), width=2)

        # Back details list
        y_pos = 90
        back_labels = [
            ("Father's Name", fields.get("fatherName")),
            ("Date of Birth", fields.get("dob")),
            ("Blood Group", fields.get("bloodGroup")),
            ("Emergency Phone", fields.get("mobile")),
            ("Address", fields.get("address")),
        ]
        for label, val in back_labels:
            if val:
                draw.text((40, y_pos), f"{label}:", fill=text_muted)
                draw.text((220, y_pos), str(val), fill=text_dark)
                y_pos += 38

        # QR Code on back right
        qr_data = fields.get("rollNumber") or fields.get("employeeId") or record.id
        qr = qrcode.QRCode(box_size=6, border=1)
        qr.add_data(str(qr_data))
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        qr_img = qr_img.resize((180, 180), Image.Resampling.LANCZOS)
        card.paste(qr_img, (card_w - 230, 100))
        draw.text((card_w - 210, 290), f"ID: {qr_data}", fill=accent_blue)

        # Footer Terms & Authority Signature
        draw.line([(30, card_h - 110), (card_w - 30, card_h - 110)], fill=(226, 232, 240), width=2)
        draw.text((40, card_h - 90), "• Property of institution. Return if found.", fill=text_muted)
        draw.text((40, card_h - 60), f"• Helpdesk: {org.phone or 'Office Campus'}", fill=text_muted)
        draw.text((card_w - 220, card_h - 50), "Authorized Signatory", fill=text_dark)

    else:
        # ---------------- FRONT OF CARD ----------------
        # 1. Header Banner
        draw.rectangle([(0, 0), (card_w, 130)], fill=header_color)

        # Org Logo (if present)
        if org.logo and os.path.exists(org.logo):
            try:
                logo_img = Image.open(org.logo).convert("RGBA")
                logo_img.thumbnail((90, 90), Image.Resampling.LANCZOS)
                card.paste(logo_img, (30, 20), mask=logo_img)
            except Exception:
                pass

        org_name_text = (org.name or "ACME PUBLIC SCHOOL").upper()
        draw.text((140, 25), org_name_text, fill=(255, 255, 255))
        draw.text((140, 70), org.address or "Affiliated to State Board • Estd. 2005", fill=(186, 230, 253))

        # 2. Student / Person Photo
        photo_box_x = 45
        photo_box_y = 160
        photo_box_w = 260
        photo_box_h = 330

        # Draw frame
        draw.rectangle(
            [(photo_box_x - 3, photo_box_y - 3), (photo_box_x + photo_box_w + 3, photo_box_y + photo_box_h + 3)],
            fill=(255, 255, 255),
            outline=accent_blue,
            width=3
        )

        photo_placed = False
        photo_path = None
        if record.processedPhoto and record.processedPhoto.processedUrl:
            raw_p = record.processedPhoto.processedUrl.lstrip("/")
            photo_path = os.path.join(APP_DIR, raw_p)
            if not os.path.exists(photo_path):
                photo_path = os.path.join(APP_DIR, "..", raw_p)
        elif record.photo and record.photo.originalPath and os.path.exists(record.photo.originalPath):
            photo_path = record.photo.originalPath


        if photo_path and os.path.exists(photo_path):
            try:
                p_img = Image.open(photo_path).convert("RGB")
                p_img = p_img.resize((photo_box_w, photo_box_h), Image.Resampling.LANCZOS)
                card.paste(p_img, (photo_box_x, photo_box_y))
                photo_placed = True
            except Exception as e:
                logger.warning(f"Failed pasting photo {photo_path}: {e}")

        if not photo_placed:
            draw.rectangle([(photo_box_x, photo_box_y), (photo_box_x + photo_box_w, photo_box_y + photo_box_h)], fill=(241, 245, 249))
            draw.text((photo_box_x + 80, photo_box_y + 140), "PHOTO", fill=text_muted)

        # 3. Details Column
        name_val = str(fields.get("name", "STUDENT NAME")).upper()
        draw.text((340, 160), name_val, fill=text_dark)
        draw.line([(340, 205), (card_w - 40, 205)], fill=accent_blue, width=3)

        det_y = 225
        sec_str = f"({fields.get('section')})" if fields.get("section") else ""
        class_sec = f"{fields.get('class', '')} {sec_str}".strip()
        detail_pairs = [
            ("Roll No", fields.get("rollNumber") or fields.get("employeeId") or fields.get("memberId")),
            ("Class / Sec", class_sec),
            ("Adm No", fields.get("admissionNo") or fields.get("registrationNumber")),
            ("Blood Grp", fields.get("bloodGroup")),
        ]

        for lbl, val in detail_pairs:
            if val:
                draw.text((340, det_y), f"{lbl}:", fill=text_muted)
                draw.text((490, det_y), str(val), fill=text_dark)
                det_y += 42

        # 4. Front Footer Strip
        draw.rectangle([(0, card_h - 55), (card_w, card_h)], fill=(15, 23, 42))
        draw.text((40, card_h - 40), f"{project.cardType.upper()} IDENTITY CARD", fill=(255, 255, 255))
        draw.text((card_w - 260, card_h - 40), f"SESSION: {org.session or '2026-27'}", fill=(186, 230, 253))

    # Outer border
    draw.rectangle([(0, 0), (card_w - 1, card_h - 1)], outline=(203, 213, 225), width=2)
    return card


def generate_card_batch_pdf(
    project: CardProject,
    req: GenerateBatchRequest
) -> str:
    """
    Generates a print-ready 300 DPI PDF for all records in a CardProject.
    Supports:
    - 'pvc': Individual CR80 card pages (1011 x 638 px / page)
    - 'a4_pdf': Multiple cards packed on standard A4 (210 x 297 mm) sheets with cut marks.
    """
    dpi = 300
    records_to_process = project.records
    if req.recordIds:
        id_set = set(req.recordIds)
        records_to_process = [r for r in project.records if r.id in id_set]

    if not records_to_process:
        raise ValueError("No records found to generate cards.")

    output_filename = f"Cards_{project.name.replace(' ', '_')}_{uuid.uuid4().hex[:8]}.pdf"
    output_pdf_path = os.path.join(OUTPUT_DIR, output_filename)

    if req.outputFormat == "pvc":
        # CR80 Individual Pages PDF (Front followed by Back)
        pdf_pages = []
        for rec in records_to_process:
            front_img = draw_card_bitmap(rec, project, side="front", dpi=dpi)
            pdf_pages.append(front_img)
            if req.duplex:
                back_img = draw_card_bitmap(rec, project, side="back", dpi=dpi)
                pdf_pages.append(back_img)

        if pdf_pages:
            first_page = pdf_pages[0]
            first_page.save(
                output_pdf_path,
                "PDF",
                resolution=float(dpi),
                save_all=True,
                append_images=pdf_pages[1:] if len(pdf_pages) > 1 else []
            )

    else:
        # A4 Multi-Card Sheet Layout (210mm x 297mm @ 300 DPI)
        a4_w = int(round(210.0 / 25.4 * dpi))  # 2480 px
        a4_h = int(round(297.0 / 25.4 * dpi))  # 3508 px

        card_w = int(round(85.60 / 25.4 * dpi))  # 1011 px
        card_h = int(round(53.98 / 25.4 * dpi))  # 638 px

        cols = 2
        rows = 5
        margin_x = int(round(12.0 / 25.4 * dpi))
        margin_y = int(round(12.0 / 25.4 * dpi))
        gap_x = int(round(4.0 / 25.4 * dpi))
        gap_y = int(round(4.0 / 25.4 * dpi))

        cards_per_sheet = cols * rows  # 10 cards per A4 page

        sheet_pages = []
        num_sheets = math.ceil(len(records_to_process) / cards_per_sheet)

        for sheet_idx in range(num_sheets):
            sheet = Image.new("RGB", (a4_w, a4_h), (255, 255, 255))
            draw = ImageDraw.Draw(sheet)

            start_i = sheet_idx * cards_per_sheet
            end_i = min(start_i + cards_per_sheet, len(records_to_process))

            for idx in range(start_i, end_i):
                slot = idx - start_i
                col = slot % cols
                row = slot // cols

                x = margin_x + col * (card_w + gap_x)
                y = margin_y + row * (card_h + gap_y)

                rec = records_to_process[idx]
                card_img = draw_card_bitmap(rec, project, side="front", dpi=dpi)
                sheet.paste(card_img, (x, y))

                # Draw optional cut marks
                if req.cutMarks:
                    draw.rectangle([(x - 2, y - 2), (x + card_w + 2, y + card_h + 2)], outline=(200, 200, 200), width=1)

            sheet_pages.append(sheet)

        if sheet_pages:
            sheet_pages[0].save(
                output_pdf_path,
                "PDF",
                resolution=float(dpi),
                save_all=True,
                append_images=sheet_pages[1:] if len(sheet_pages) > 1 else []
            )

    return output_pdf_path
