from PIL import Image
import logging
from app.services.resize.presets import PASSPORT_PRESETS, get_preset_by_country

logger = logging.getLogger(__name__)

class PassportResizer:
    def __init__(self):
        self.dpi = 300
        self.standards = {
            "35x45": {"width": 35, "height": 45, "unit": "mm", "name": "35mm x 45mm"},
            "2x2": {"width": 2, "height": 2, "unit": "inch", "name": "2 inch x 2 inch"},
            "50x70": {"width": 50, "height": 70, "unit": "mm", "name": "50mm x 70mm"},
            "33x48": {"width": 33, "height": 48, "unit": "mm", "name": "33mm x 48mm"},
            "35x45": {"width": 35, "height": 45, "unit": "mm", "name": "35mm x 45mm"}
        }
        logger.info("✅ Passport Resizer initialized with presets")
    
    def mm_to_pixels(self, mm):
        inches = mm / 25.4
        return int(inches * self.dpi)
    
    def inches_to_pixels(self, inches):
        return int(inches * self.dpi)
    
    def resize_to_standard(self, image_input, standard="35x45"):
        """Resize to standard size"""
        try:
            if isinstance(image_input, str):
                img = Image.open(image_input)
            else:
                img = image_input
            
            specs = self.standards.get(standard, self.standards["35x45"])
            
            if specs["unit"] == "mm":
                width_px = self.mm_to_pixels(specs["width"])
                height_px = self.mm_to_pixels(specs["height"])
            else:
                width_px = self.inches_to_pixels(specs["width"])
                height_px = self.inches_to_pixels(specs["height"])
            
            # Resize maintaining aspect ratio
            img_ratio = img.width / img.height
            target_ratio = width_px / height_px
            
            if img_ratio > target_ratio:
                new_width = width_px
                new_height = int(width_px / img_ratio)
            else:
                new_height = height_px
                new_width = int(height_px * img_ratio)
            
            img_resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # Create white canvas
            canvas = Image.new("RGB", (width_px, height_px), (255, 255, 255))
            x_offset = (width_px - new_width) // 2
            y_offset = (height_px - new_height) // 2
            canvas.paste(img_resized, (x_offset, y_offset))
            
            return canvas, specs
            
        except Exception as e:
            logger.error(f"Resize error: {e}")
            return None, None
    
    def resize_with_preset(self, image_input, country_code="india"):
        """Resize using country preset"""
        preset = get_preset_by_country(country_code)
        standard = preset["standard"]
        return self.resize_to_standard(image_input, standard), preset
    
    def get_available_standards(self):
        return {key: value["name"] for key, value in self.standards.items()}