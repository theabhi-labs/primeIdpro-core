from PIL import Image, ImageDraw
import os
import logging
from datetime import datetime
from app.core.config import settings

# Add logger
logger = logging.getLogger(__name__)

class SheetGenerator:
    def __init__(self):
        self.dpi = 300
        self.paper_sizes = {
            "A4": {"width": 210, "height": 297, "unit": "mm"},
            "Letter": {"width": 216, "height": 279, "unit": "mm"},
            "4x6": {"width": 4, "height": 6, "unit": "inch"}
        }
        logger.info("✅ Sheet Generator initialized")
    
    def mm_to_pixels(self, mm):
        """Convert mm to pixels at 300 DPI"""
        inches = mm / 25.4
        return int(inches * self.dpi)
    
    def inches_to_pixels(self, inches):
        """Convert inches to pixels at 300 DPI"""
        return int(inches * self.dpi)
    
    def generate_sheet(self, image_paths, config, session_id, sheet_id):
        """Generate photo sheet from multiple images"""
        try:
            # Get paper size
            paper = self.paper_sizes.get(config.get("paper_size", "A4"), self.paper_sizes["A4"])
            
            # Convert dimensions to pixels
            if paper["unit"] == "mm":
                paper_width_px = self.mm_to_pixels(paper["width"])
                paper_height_px = self.mm_to_pixels(paper["height"])
            else:
                paper_width_px = self.inches_to_pixels(paper["width"])
                paper_height_px = self.inches_to_pixels(paper["height"])
            
            # Get photo dimensions
            photo_width_mm = config.get("photo_width", 35)
            photo_height_mm = config.get("photo_height", 45)
            photo_width_px = self.mm_to_pixels(photo_width_mm)
            photo_height_px = self.mm_to_pixels(photo_height_mm)
            
            # Get grid settings
            rows = config.get("rows", 4)
            cols = config.get("columns", 6)
            spacing_px = self.mm_to_pixels(config.get("spacing", 5))
            margin_px = self.mm_to_pixels(config.get("margin", 10))
            
            # Create blank sheet
            bg_color = config.get("background_color", "#FFFFFF")
            sheet = Image.new("RGB", (paper_width_px, paper_height_px), bg_color)
            draw = ImageDraw.Draw(sheet)
            
            # Calculate grid dimensions
            grid_width = (cols * photo_width_px) + ((cols - 1) * spacing_px)
            grid_height = (rows * photo_height_px) + ((rows - 1) * spacing_px)
            
            # Calculate starting position to center grid
            start_x = (paper_width_px - grid_width) // 2
            start_y = (paper_height_px - grid_height) // 2
            
            # Place photos
            photo_count = 0
            for idx, img_path in enumerate(image_paths):
                if photo_count >= rows * cols:
                    break
                
                row = photo_count // cols
                col = photo_count % cols
                
                x = start_x + col * (photo_width_px + spacing_px)
                y = start_y + row * (photo_height_px + spacing_px)
                
                try:
                    # Load and resize photo
                    photo = Image.open(img_path)
                    photo = photo.resize((photo_width_px, photo_height_px), Image.Resampling.LANCZOS)
                    
                    # Paste photo
                    sheet.paste(photo, (x, y))
                    
                    # Draw border if enabled
                    if config.get("border", False):
                        draw.rectangle(
                            [x, y, x + photo_width_px, y + photo_height_px],
                            outline="black",
                            width=2
                        )
                    
                    photo_count += 1
                    
                except Exception as e:
                    logger.error(f"Error placing photo {idx}: {e}")
                    continue
            
            # Add cut marks if enabled
            if config.get("cut_marks", False):
                self._add_cut_marks(draw, paper_width_px, paper_height_px, 
                                    start_x, start_y, grid_width, grid_height)
            
            # Save sheet
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{timestamp}_{sheet_id}_sheet.jpg"
            
            save_dir = os.path.join(settings.upload_dir, "sessions", session_id, "sheets")
            os.makedirs(save_dir, exist_ok=True)
            
            file_path = os.path.join(save_dir, filename)
            sheet.save(file_path, "JPEG", quality=95)
            
            logger.info(f"✅ Sheet generated: {filename}")
            return f"/uploads/sessions/{session_id}/sheets/{filename}"
            
        except Exception as e:
            logger.error(f"Sheet generation error: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _add_cut_marks(self, draw, width, height, start_x, start_y, grid_width, grid_height):
        """Add cut marks to sheet"""
        mark_length = 20  # pixels
        mark_width = 2    # pixels
        
        # Corner marks
        corners = [
            (start_x, start_y),  # Top-left
            (start_x + grid_width, start_y),  # Top-right
            (start_x, start_y + grid_height),  # Bottom-left
            (start_x + grid_width, start_y + grid_height)  # Bottom-right
        ]
        
        for x, y in corners:
            # Horizontal line
            draw.line([(x, y), (x + mark_length, y)], fill="black", width=mark_width)
            draw.line([(x, y), (x - mark_length, y)], fill="black", width=mark_width)
            # Vertical line
            draw.line([(x, y), (x, y + mark_length)], fill="black", width=mark_width)
            draw.line([(x, y), (x, y - mark_length)], fill="black", width=mark_width)
    
    def get_available_paper_sizes(self):
        """Get list of available paper sizes"""
        return list(self.paper_sizes.keys())