import os
import uuid
import tempfile
import subprocess
import logging
from typing import List, Dict, Any, Optional
from app.core.config import PROCESSED_DIR
import shutil

logger = logging.getLogger("primeidpro.v2_cards.pdf")

# Use a separate V2 output directory
V2_OUTPUT_DIR = os.path.join(PROCESSED_DIR, "v2_card_outputs")
os.makedirs(V2_OUTPUT_DIR, exist_ok=True)

def _find_browser_executable() -> Optional[str]:
    """Locates Google Chrome or Microsoft Edge."""
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

def generate_a4_pdf(rendered_cards_html: List[str], layout_config: Dict[str, Any]) -> str:
    """
    Generates a PDF using headless Chromium from a list of rendered card HTML strings,
    arranged according to the layout config.
    Returns the absolute path to the generated PDF.
    """
    browser_exe = _find_browser_executable()
    if not browser_exe:
        raise Exception("Could not find a suitable Chromium/Chrome executable for PDF generation.")

    page_width_mm = layout_config.get("page_width_mm", 210)
    page_height_mm = layout_config.get("page_height_mm", 297)
    margin_top = layout_config.get("margin_top_mm", 5)
    margin_right = layout_config.get("margin_right_mm", 5)
    margin_bottom = layout_config.get("margin_bottom_mm", 5)
    margin_left = layout_config.get("margin_left_mm", 5)
    gap_x = layout_config.get("gap_x_mm", 2)
    gap_y = layout_config.get("gap_y_mm", 2)
    cards_per_page = layout_config.get("cards_per_page", 1)
    
    # We construct a multi-page HTML document
    pages_html = []
    current_page_cards = []
    
    for i, card_html in enumerate(rendered_cards_html):
        current_page_cards.append(card_html)
        if len(current_page_cards) == cards_per_page or i == len(rendered_cards_html) - 1:
            # Build page
            page_content = "".join(current_page_cards)
            
            # Use CSS Grid for exact placement
            grid_css = f"""
            display: grid;
            grid-template-columns: repeat({layout_config.get('columns', 1)}, {layout_config.get('card_width_mm', 85.6)}mm);
            grid-auto-rows: {layout_config.get('card_height_mm', 53.98)}mm;
            column-gap: {gap_x}mm;
            row-gap: {gap_y}mm;
            width: {layout_config.get('usable_width_mm', 200)}mm;
            height: {layout_config.get('usable_height_mm', 287)}mm;
            """
            
            page_wrapper = f"""
            <div class="page" style="width: {page_width_mm}mm; height: {page_height_mm}mm; padding-top: {margin_top}mm; padding-right: {margin_right}mm; padding-bottom: {margin_bottom}mm; padding-left: {margin_left}mm; box-sizing: border-box; page-break-after: always; overflow: hidden; background: white;">
                <div style="{grid_css}">
                    {page_content}
                </div>
            </div>
            """
            pages_html.append(page_wrapper)
            current_page_cards = []
            
    # Wrap in full HTML document with print-specific CSS
    orientation_css = "portrait"
    if page_width_mm > page_height_mm:
        orientation_css = "landscape"
        
    full_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            @page {{
                size: {page_width_mm}mm {page_height_mm}mm {orientation_css};
                margin: 0;
            }}
            body {{
                margin: 0;
                padding: 0;
                background-color: #fff;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }}
            .page {{
                page-break-after: always;
            }}
            /* Basic reset for card rendering */
            .v2-card-container * {{
                box-sizing: border-box;
            }}
        </style>
    </head>
    <body>
        {"".join(pages_html)}
    </body>
    </html>
    """
    
    # Save to temp HTML file
    job_uuid = str(uuid.uuid4())
    temp_html_path = os.path.join(tempfile.gettempdir(), f"v2_print_{job_uuid}.html")
    output_pdf_path = os.path.join(V2_OUTPUT_DIR, f"v2_output_{job_uuid}.pdf")
    
    with open(temp_html_path, "w", encoding="utf-8") as f:
        f.write(full_html)
        
    try:
        # Run headless chromium
        cmd = [
            browser_exe,
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            "--print-to-pdf-no-header",
            f"--print-to-pdf={output_pdf_path}",
            temp_html_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return output_pdf_path
        
    except subprocess.CalledProcessError as e:
        logger.error(f"Chromium PDF generation failed: {e.stderr}")
        raise Exception(f"PDF Generation Failed: {e.stderr}")
    finally:
        # Cleanup temporary HTML (PDF remains until job is cleaned/downloaded)
        if os.path.exists(temp_html_path):
            try:
                os.remove(temp_html_path)
            except:
                pass
