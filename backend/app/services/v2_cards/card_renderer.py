import base64
import os
import html
from typing import Dict, Any, List
from app.core.config import APP_DIR

# Private photo storage path
PRIVATE_PHOTOS_DIR = os.path.join(APP_DIR, "storage", "private_v2_photos")

def _escape_html(val: Any) -> str:
    """Escapes strings to prevent HTML injection."""
    if val is None:
        return ""
    return html.escape(str(val))

def _get_photo_data_uri(organization_id: str, project_id: str, photo_id: str) -> str:
    """Reads a private photo and returns a base64 data URI for temporary HTML rendering."""
    # Ensure no path traversal
    safe_photo_id = os.path.basename(photo_id)
    org_dir = os.path.join(PRIVATE_PHOTOS_DIR, str(organization_id))
    proj_dir = os.path.join(org_dir, str(project_id))
    
    # We don't know the exact extension just from ID in this context, so we search.
    # Typically it's saved with .jpg or .png or no extension.
    # In Phase 3C, we saved them with UUID.
    candidates = [safe_photo_id, f"{safe_photo_id}.jpg", f"{safe_photo_id}.png", f"{safe_photo_id}.webp"]
    
    for candidate in candidates:
        photo_path = os.path.join(proj_dir, candidate)
        if os.path.exists(photo_path):
            with open(photo_path, "rb") as f:
                b64_data = base64.b64encode(f.read()).decode('utf-8')
            # Determine mime
            mime = "image/jpeg"
            if candidate.endswith(".png"): mime = "image/png"
            elif candidate.endswith(".webp"): mime = "image/webp"
            return f"data:{mime};base64,{b64_data}"
            
    # Fallback to empty if not found
    return ""

def render_card_html(template: Dict[str, Any], record_data: Dict[str, Any], organization_id: str, project_id: str) -> str:
    """
    Renders a V2 template and record data into an HTML string suitable for PDF generation.
    Returns just the HTML body for one card.
    """
    card_width_mm = template.get("width", 85.60)
    card_height_mm = template.get("height", 53.98)
    elements = template.get("elements", [])
    
    # Base container for the card
    html_out = [
        f'<div class="v2-card-container" style="width: {card_width_mm}mm; height: {card_height_mm}mm; position: relative; overflow: hidden; background-color: white; box-sizing: border-box;">'
    ]
    
    # Sort elements by z-index
    elements_sorted = sorted(elements, key=lambda e: e.get("z_index", 0))
    
    for el in elements_sorted:
        el_type = el.get("type")
        x = el.get("x", 0)
        y = el.get("y", 0)
        w = el.get("width", 0)
        h = el.get("height", 0)
        rot = el.get("rotation", 0)
        z = el.get("z_index", 0)
        
        bind_key = el.get("bind")
        
        # Base styles
        style = f"position: absolute; left: {x}px; top: {y}px; width: {w}px; height: {h}px; z-index: {z}; transform: rotate({rot}deg);"
        
        if el_type == "text":
            font_size = el.get("fontSize", 14)
            font_family = _escape_html(el.get("fontFamily", "Arial"))
            font_weight = el.get("fontWeight", "normal")
            color = _escape_html(el.get("fill", "#000000"))
            align = el.get("textAlign", "left")
            
            style += f" font-size: {font_size}px; font-family: '{font_family}', sans-serif; font-weight: {font_weight}; color: {color}; text-align: {align};"
            
            # Resolve bound data or use raw text
            text_val = el.get("text", "")
            if bind_key and bind_key in record_data:
                text_val = record_data[bind_key]
                
            safe_text = _escape_html(text_val)
            # Replace newlines with <br>
            safe_text = safe_text.replace("\n", "<br>")
            
            html_out.append(f'<div style="{style}">{safe_text}</div>')
            
        elif el_type == "image":
            # Check if it's bound to a photo field
            photo_uri = ""
            if bind_key and bind_key in record_data and record_data[bind_key]:
                photo_id = record_data[bind_key]
                photo_uri = _get_photo_data_uri(organization_id, project_id, photo_id)
            elif el.get("src"):
                # Static image support if provided in template
                photo_uri = _escape_html(el.get("src"))
                
            if photo_uri:
                # Use object-fit cover to match typical photo bounds
                style += " object-fit: cover;"
                html_out.append(f'<img src="{photo_uri}" style="{style}" />')
            else:
                # Placeholder if missing
                style += " background-color: #f1f5f9; border: 1px dashed #cbd5e1;"
                html_out.append(f'<div style="{style}"></div>')
                
        elif el_type == "rect":
            fill = _escape_html(el.get("fill", "transparent"))
            stroke = _escape_html(el.get("stroke", "transparent"))
            stroke_width = el.get("strokeWidth", 0)
            style += f" background-color: {fill}; border: {stroke_width}px solid {stroke};"
            html_out.append(f'<div style="{style}"></div>')
            
        # Add support for lines/circles if needed based on Phase 2 schema
            
    html_out.append('</div>')
    
    return "".join(html_out)
