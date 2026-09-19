import os
import cv2
import fitz  # PyMuPDF
from PIL import Image
import numpy as np

# A4 at 300 DPI is 2480x3508 pixels
A4_WIDTH_300DPI = 2480
A4_HEIGHT_300DPI = 3508

# Standard Physical ID Card size: CR80 (85.6mm x 54.0mm) -> 1011x638 pixels at 300 DPI
ID_WIDTH_300DPI = 1011
ID_HEIGHT_300DPI = 638

def generate_composite(front_path: str, back_path: str, output_path: str, mode: str = "side-by-side") -> bool:
    """
    Generates A4 300 DPI print canvas.
    - mode="side-by-side" (Default): Front on Left, Back on Right (Standard ID Size: 85.6mm x 54.0mm each).
    - mode="stacked": Front on Top, Back on Bottom.
    """
    try:
        # Create a blank white A4 image at 300 DPI (3508 x 2480 x 3)
        canvas = np.ones((A4_HEIGHT_300DPI, A4_WIDTH_300DPI, 3), dtype=np.uint8) * 255
        
        id_w = ID_WIDTH_300DPI
        id_h = ID_HEIGHT_300DPI
        
        front_img = cv2.imread(front_path) if front_path and os.path.exists(front_path) else None
        back_img = cv2.imread(back_path) if back_path and os.path.exists(back_path) else None

        if front_img is None and back_img is None:
            return False

        # Resize cards to exact CR80 ID dimensions with high-quality Lanczos interpolation
        if front_img is not None:
            front_img = cv2.resize(front_img, (id_w, id_h), interpolation=cv2.INTER_LANCZOS4)
        if back_img is not None:
            back_img = cv2.resize(back_img, (id_w, id_h), interpolation=cv2.INTER_LANCZOS4)

        # Normalize mode
        layout_mode = "stacked" if mode == "stacked" else "side-by-side"

        if layout_mode == "side-by-side":
            if front_img is not None and back_img is not None:
                gap = 60  # 5mm gap
                total_w = id_w * 2 + gap
                x_start = (A4_WIDTH_300DPI - total_w) // 2  # ~199px from left
                y_start = 200  # ~17mm from top

                # Paste Front
                canvas[y_start:y_start+id_h, x_start:x_start+id_w] = front_img
                # Paste Back
                x_back = x_start + id_w + gap
                canvas[y_start:y_start+id_h, x_back:x_back+id_w] = back_img

                # Add subtle cutting guides (1px light gray border)
                cv2.rectangle(canvas, (x_start, y_start), (x_start+id_w, y_start+id_h), (210, 215, 220), 1)
                cv2.rectangle(canvas, (x_back, y_start), (x_back+id_w, y_start+id_h), (210, 215, 220), 1)
            else:
                # Single card
                single_img = front_img if front_img is not None else back_img
                x_start = (A4_WIDTH_300DPI - id_w) // 2
                y_start = 200
                canvas[y_start:y_start+id_h, x_start:x_start+id_w] = single_img
                cv2.rectangle(canvas, (x_start, y_start), (x_start+id_w, y_start+id_h), (210, 215, 220), 1)

        elif layout_mode == "stacked":
            x_start = (A4_WIDTH_300DPI - id_w) // 2
            y_start = 200
            
            if front_img is not None and back_img is not None:
                # Top Card (Front)
                canvas[y_start:y_start+id_h, x_start:x_start+id_w] = front_img
                cv2.rectangle(canvas, (x_start, y_start), (x_start+id_w, y_start+id_h), (210, 215, 220), 1)
                
                # Bottom Card (Back)
                y_back = y_start + id_h + 100
                canvas[y_back:y_back+id_h, x_start:x_start+id_w] = back_img
                cv2.rectangle(canvas, (x_start, y_back), (x_start+id_w, y_back+id_h), (210, 215, 220), 1)
            else:
                single_img = front_img if front_img is not None else back_img
                canvas[y_start:y_start+id_h, x_start:x_start+id_w] = single_img
                cv2.rectangle(canvas, (x_start, y_start), (x_start+id_w, y_start+id_h), (210, 215, 220), 1)

        # Save with PIL to embed 300 DPI metadata
        pil_canvas = Image.fromarray(cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB))
        pil_canvas.save(output_path, dpi=(300, 300), quality=96)
        return True
    except Exception as e:
        print(f"Error generating composite: {e}")
        return False

def generate_single_print(image_path: str, output_path: str) -> bool:
    """
    Places a single image (e.g. general document) on A4 canvas at 300 DPI.
    """
    try:
        canvas = Image.new('RGB', (A4_WIDTH_300DPI, A4_HEIGHT_300DPI), 'white')
        
        if image_path and os.path.exists(image_path):
            with Image.open(image_path) as img:
                img = img.convert('RGB')
                
                # Check if it's already an ID Card aspect ratio -> print at standard 85.6x54mm
                aspect = img.width / img.height if img.height > 0 else 1.0
                if 1.30 <= aspect <= 1.85:
                    id_resized = img.resize((ID_WIDTH_300DPI, ID_HEIGHT_300DPI), Image.Resampling.LANCZOS)
                    x = (A4_WIDTH_300DPI - ID_WIDTH_300DPI) // 2
                    y = 200
                    canvas.paste(id_resized, (x, y))
                else:
                    # General full document
                    max_w = A4_WIDTH_300DPI - 200
                    max_h = A4_HEIGHT_300DPI - 200
                    img.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
                    x = (A4_WIDTH_300DPI - img.width) // 2
                    y = (A4_HEIGHT_300DPI - img.height) // 2
                    canvas.paste(img, (x, y))
                
                canvas.save(output_path, dpi=(300, 300), quality=96)
                return True
        return False
    except Exception as e:
        print(f"Error generating single print: {e}")
        return False

def render_pdf_first_page(pdf_path: str, output_path: str) -> bool:
    """
    Renders page 1 of a PDF file to an image for preview and printing.
    """
    try:
        if not os.path.exists(pdf_path):
            return False
        doc = fitz.open(pdf_path)
        if len(doc) > 0:
            page = doc.load_page(0)
            pix = page.get_pixmap(dpi=300)
            pix.save(output_path)
            doc.close()
            return True
        doc.close()
        return False
    except Exception as e:
        print(f"Error rendering PDF page: {e}")
        return False

def generate_multipage_pdf(front_path: str, back_path: str, output_path: str) -> bool:
    """
    Creates a 2-page PDF (Page 1 = Front, Page 2 = Back) for duplex printing.
    """
    try:
        id_width = ID_WIDTH_300DPI
        id_height = ID_HEIGHT_300DPI
        y_offset = 200
        x_offset = (A4_WIDTH_300DPI - id_width) // 2
        
        pages = []
        
        # Front Page
        page1 = Image.new('RGB', (A4_WIDTH_300DPI, A4_HEIGHT_300DPI), 'white')
        if front_path and os.path.exists(front_path):
            with Image.open(front_path) as img:
                img = img.convert('RGB')
                resized = img.resize((id_width, id_height), Image.Resampling.LANCZOS)
                page1.paste(resized, (x_offset, y_offset))
        pages.append(page1)
        
        # Back Page
        page2 = Image.new('RGB', (A4_WIDTH_300DPI, A4_HEIGHT_300DPI), 'white')
        if back_path and os.path.exists(back_path):
            with Image.open(back_path) as img:
                img = img.convert('RGB')
                resized = img.resize((id_width, id_height), Image.Resampling.LANCZOS)
                page2.paste(resized, (x_offset, y_offset))
        pages.append(page2)
        
        # Save as multi-page PDF
        page1.save(output_path, "PDF", resolution=300.0, save_all=True, append_images=pages[1:])
        return True
    except Exception as e:
        print(f"Error generating multipage pdf: {e}")
        return False


