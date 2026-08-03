from PIL import Image, ImageEnhance, ImageFilter
import logging

logger = logging.getLogger(__name__)

class ImageEnhancer:
    def __init__(self, level="medium"):
        self.level = level
        self.settings = {
            "low": {"brightness": 1.05, "contrast": 1.05, "sharpness": 1.1, "color": 1.0},
            "medium": {"brightness": 1.1, "contrast": 1.1, "sharpness": 1.3, "color": 1.05},
            "high": {"brightness": 1.2, "contrast": 1.2, "sharpness": 1.5, "color": 1.1}
        }
        logger.info(f"✅ Image Enhancer initialized (level: {level})")
    
    def enhance(self, image_input):
        """Enhance image quality - accepts file path or PIL Image"""
        try:
            # If input is string (file path), open it
            if isinstance(image_input, str):
                img = Image.open(image_input)
            else:
                img = image_input
            
            settings = self.settings.get(self.level, self.settings["medium"])
            
            enhancer = ImageEnhance.Brightness(img)
            img = enhancer.enhance(settings["brightness"])
            
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(settings["contrast"])
            
            enhancer = ImageEnhance.Sharpness(img)
            img = enhancer.enhance(settings["sharpness"])
            
            enhancer = ImageEnhance.Color(img)
            img = enhancer.enhance(settings["color"])
            
            img = img.filter(ImageFilter.SMOOTH_MORE)
            
            logger.info("✅ Image enhanced successfully")
            return img
            
        except Exception as e:
            logger.error(f"Enhancement error: {e}")
            return None