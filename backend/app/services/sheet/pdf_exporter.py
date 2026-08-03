from reportlab.lib import pagesizes
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image
import os
import logging

# Add logger
logger = logging.getLogger(__name__)

class PDFExporter:
    def __init__(self):
        self.paper_sizes = {
            "A4": pagesizes.A4,
            "Letter": pagesizes.LETTER,
            "4x6": (4 * 72, 6 * 72)  # 4x6 inches in points
        }
        logger.info("✅ PDF Exporter initialized")
    
    def export_sheet_to_pdf(self, sheet_image_path, output_path, paper_size="A4"):
        """Export sheet image to PDF"""
        try:
            # Check if file exists
            if not os.path.exists(sheet_image_path):
                logger.error(f"Sheet image not found: {sheet_image_path}")
                return False
            
            # Open sheet image
            img = Image.open(sheet_image_path)
            logger.info(f"Opened image: {img.size}")
            
            # Get paper size in points (1 point = 1/72 inch)
            if paper_size in self.paper_sizes:
                page_size = self.paper_sizes[paper_size]
            else:
                page_size = pagesizes.A4
            
            # Create PDF
            c = canvas.Canvas(output_path, pagesize=page_size)
            
            # Get page dimensions in points
            page_width, page_height = page_size
            
            # Get image dimensions
            img_width, img_height = img.size
            
            # Calculate scaling to fit page
            scale = min(page_width / img_width, page_height / img_height)
            
            # Calculate position to center
            x = (page_width - (img_width * scale)) / 2
            y = (page_height - (img_height * scale)) / 2
            
            # Draw image
            img_reader = ImageReader(img)
            c.drawImage(img_reader, x, y, 
                       width=img_width * scale, 
                       height=img_height * scale)
            
            c.save()
            logger.info(f"✅ PDF exported: {output_path}")
            return True
            
        except Exception as e:
            logger.error(f"PDF export error: {e}")
            import traceback
            traceback.print_exc()
            return False