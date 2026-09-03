import os
import json
import io
import base64
import logging
from typing import List, Dict, Any, Optional, Tuple
import jinja2
import qrcode
from app.core.config import PROCESSED_DIR
from app.models.card_studio import CardTemplateMeta, CardRecord, OrganizationData



logger = logging.getLogger("primeidpro.cards.templates")

TEMPLATES_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "templates", "cards")


def generate_qr_code_base64(data: str) -> str:
    """Generates a high-quality QR code image as a base64 Data URL."""
    if not data:
        return ""
    try:
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=2,
        )
        qr.add_data(str(data))
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"data:image/png;base64,{b64}"
    except Exception as e:
        logger.warning(f"QR generation error for data '{data}': {e}")
        return ""


def list_card_templates() -> List[CardTemplateMeta]:
    """Scans TEMPLATES_ROOT and returns metadata for all valid card templates."""
    templates = []
    if not os.path.exists(TEMPLATES_ROOT):
        return templates

    for item in os.listdir(TEMPLATES_ROOT):
        pkg_dir = os.path.join(TEMPLATES_ROOT, item)
        if os.path.isdir(pkg_dir):
            meta_path = os.path.join(pkg_dir, "template.json")
            html_path = os.path.join(pkg_dir, "template.html")

            if os.path.exists(meta_path) and os.path.exists(html_path):
                try:
                    with open(meta_path, "r", encoding="utf-8") as f:
                        meta_dict = json.load(f)

                    # Read preview image or svg if present
                    preview_path = os.path.join(pkg_dir, "preview.svg")
                    if not os.path.exists(preview_path):
                        preview_path = os.path.join(pkg_dir, "preview.png")

                    preview_data = None
                    if os.path.exists(preview_path):
                        with open(preview_path, "rb") as pf:
                            ext = preview_path.split(".")[-1]
                            mime = "image/svg+xml" if ext == "svg" else "image/png"
                            preview_data = f"data:{mime};base64,{base64.b64encode(pf.read()).decode('utf-8')}"

                    meta_dict["preview"] = preview_data
                    templates.append(CardTemplateMeta(**meta_dict))
                except Exception as err:
                    logger.error(f"Error loading template package '{item}': {err}")

    return templates


def get_template_by_id(template_id: str) -> Optional[Tuple[CardTemplateMeta, str]]:
    """Loads a specific template metadata and raw HTML by template_id."""
    pkg_dir = os.path.join(TEMPLATES_ROOT, template_id)
    meta_path = os.path.join(pkg_dir, "template.json")
    html_path = os.path.join(pkg_dir, "template.html")

    if not (os.path.exists(meta_path) and os.path.exists(html_path)):
        return None

    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            meta_dict = json.load(f)
        with open(html_path, "r", encoding="utf-8") as f:
            raw_html = f.read()

        return CardTemplateMeta(**meta_dict), raw_html
    except Exception as e:
        logger.error(f"Failed to read template '{template_id}': {e}")
        return None


def render_card_html(
    template_id: str,
    record: CardRecord,
    organization: OrganizationData,
    side: str = "front",
    server_base_url: str = ""
) -> str:
    """
    Renders card HTML for a specific record and side ('front' or 'back') using Jinja2.
    """
    template_info = get_template_by_id(template_id)
    if not template_info:
        # Fallback to first available template if given ID not found
        all_templates = list_card_templates()
        if all_templates:
            template_info = get_template_by_id(all_templates[0].id)
        if not template_info:
            return f"<html><body><h3>Template '{template_id}' not found.</h3></body></html>"

    meta, raw_html = template_info

    # Prepare Context
    context = {}
    # 1. Organization fields
    context["organization"] = organization.model_dump()

    # 2. Record fields
    for k, v in record.fields.items():
        context[k] = v

    # 3. Photo URL resolution with automatic Base64 Data URI encoding
    photo_url = ""
    if record.processedPhoto and record.processedPhoto.processedUrl:
        photo_url = record.processedPhoto.processedUrl
    elif record.photo and record.photo.originalPath:
        photo_url = record.photo.originalPath

    if photo_url:
        if photo_url.startswith("data:image/") or photo_url.startswith("http"):
            context["photo"] = photo_url
        else:
            candidate_path = photo_url
            if photo_url.startswith("/processed/"):
                clean_rel = photo_url.replace("/processed/", "").replace("/", os.sep)
                candidate_path = os.path.join(PROCESSED_DIR, clean_rel)

            if os.path.exists(candidate_path):
                try:
                    with open(candidate_path, "rb") as img_f:
                        encoded = base64.b64encode(img_f.read()).decode("utf-8")
                        ext = os.path.splitext(candidate_path)[1].lower().replace(".", "")
                        mime = "png" if ext == "png" else "jpeg"
                        context["photo"] = f"data:image/{mime};base64,{encoded}"
                except Exception as img_err:
                    logger.warning(f"Failed to read image {candidate_path}: {img_err}")
                    context["photo"] = photo_url
            else:
                context["photo"] = photo_url
    else:
        context["photo"] = ""


    # 4. QR Code generation
    qr_data = ""
    if meta.qr and meta.qr.get("enabled"):
        qr_source_field = meta.qr.get("sourceField", "rollNumber")
        qr_data = record.fields.get(qr_source_field) or record.fields.get("rollNumber") or record.fields.get("employeeId") or record.id
    else:
        qr_data = record.fields.get("rollNumber") or record.fields.get("employeeId") or record.id

    context["qrCode"] = generate_qr_code_base64(str(qr_data)) if qr_data else ""
    context["side"] = side

    # Jinja2 environment with safe sandboxing
    env = jinja2.Environment(autoescape=True)
    
    # Custom format filters
    env.filters["uppercase"] = lambda val: str(val).upper() if val else ""
    env.filters["lowercase"] = lambda val: str(val).lower() if val else ""
    env.filters["titlecase"] = lambda val: str(val).title() if val else ""

    template = env.from_string(raw_html)
    return template.render(**context)


SAMPLE_AVATAR = (
    "data:image/svg+xml;utf8,"
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 200' width='160' height='200'>"
    "<rect width='160' height='200' fill='%23f8fafc'/>"
    "<circle cx='80' cy='65' r='38' fill='%230284c7'/>"
    "<path d='M25,185 C25,125 50,110 80,110 C110,110 135,125 135,185 Z' fill='%230369a1'/>"
    "<circle cx='80' cy='60' r='28' fill='%23fed7aa'/>"
    "<path d='M65,48 Q80,38 95,48 Q80,42 65,48' fill='%231e293b'/>"
    "</svg>"
)

SAMPLE_LOGO = (
    "data:image/svg+xml;utf8,"
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' width='100' height='100'>"
    "<circle cx='50' cy='50' r='45' fill='%230284c7' stroke='%23ffffff' stroke-width='4'/>"
    "<text x='50' y='58' font-size='26' font-family='Arial, sans-serif' font-weight='900' fill='%23ffffff' text-anchor='middle'>ID</text>"
    "</svg>"
)

SAMPLE_SIGN = (
    "data:image/svg+xml;utf8,"
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 150 50' width='150' height='50'>"
    "<path d='M15,35 Q40,5 65,28 T105,18 T135,32' stroke='%230f172a' stroke-width='3' fill='none' stroke-linecap='round'/>"
    "</svg>"
)


def render_template_sample_html(
    template_id: str,
    side: str = "front",
    organization: Optional[OrganizationData] = None
) -> str:
    """
    Renders realistic sample HTML preview for a template package (Front or Back).
    """
    sample_org = organization or OrganizationData(
        name="DELHI PUBLIC ACADEMY",
        address="Sector 4, R.K. Puram, New Delhi • Ph: 011-26170000",
        phone="+91 98765 43210",
        email="info@academy.edu.in",
        website="www.academy.edu.in",
        session="2026-27",
        logo=SAMPLE_LOGO,
        signature=SAMPLE_SIGN
    )

    sample_fields = {
        "name": "MARIYA" if template_id == "mhrsa-inter-college-vertical" else "AARAV SHARMA",
        "rollNumber": "083" if template_id == "mhrsa-inter-college-vertical" else "DPA-2026-104",
        "class": "11th" if template_id == "mhrsa-inter-college-vertical" else "10th",
        "section": "A",
        "fatherName": "SHANU" if template_id == "mhrsa-inter-college-vertical" else "Rajesh Sharma",
        "motherName": "Sunita Sharma",
        "dob": "22/12/2011" if template_id == "mhrsa-inter-college-vertical" else "14/08/2010",
        "bloodGroup": "O+ (Positive)",
        "mobile": "9125264245" if template_id == "mhrsa-inter-college-vertical" else "+91 98765 43210",
        "emergencyContact": "9125264245" if template_id == "mhrsa-inter-college-vertical" else "+91 98765 43210",
        "address": "SHAHPUR JOT YUSUF 'HATHILA' BAHRAICH" if template_id == "mhrsa-inter-college-vertical" else "B-42, Vasant Vihar, New Delhi - 110057",
        "employeeId": "EMP-8842",
        "designation": "Sr. Systems Architect",
        "department": "Information Technology",
        "course": "B.Tech Computer Science",
        "memberId": "VIP-9920",
        "tier": "PLATINUM VIP",
        "validTill": "31/03/2027",
    }

    if template_id == "mhrsa-inter-college-vertical" and not organization:
        sample_org = OrganizationData(
            name="M.H.R.S.A.",
            address="Shahpur Jot Yusuf 'Hathila' Bahraich, Uttar Pradesh - 271801",
            phone="74088065057",
            session="2026-27",
            logo=SAMPLE_LOGO,
            signature=SAMPLE_SIGN
        )


    sample_rec = CardRecord(
        id="sample_rec_01",
        fields=sample_fields,
        processedPhoto={"status": "completed", "processedUrl": SAMPLE_AVATAR}
    )

    return render_card_html(
        template_id=template_id,
        record=sample_rec,
        organization=sample_org,
        side=side
    )

