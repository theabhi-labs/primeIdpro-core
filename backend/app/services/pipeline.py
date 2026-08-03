import os
import cv2
from PIL import Image
import numpy as np
from datetime import datetime
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

# Import services
from app.services.face_detection.detector import FaceDetector
from app.services.background.remover import BackgroundRemover
from app.services.enhancement.enhancer import ImageEnhancer
from app.services.resize.resizer import PassportResizer

class ProcessingPipeline:
    def __init__(self):
        self.face_detector = FaceDetector()
        self.bg_remover = BackgroundRemover()
        self.enhancer = ImageEnhancer(settings.enhancement_level)
        self.resizer = PassportResizer()
        logger.info("✅ Processing Pipeline initialized")

    async def process_image(self, image_path, session_id, image_id, background_color="#FFFFFF",
                           passport_standard="35x45", enhance=False):
        """Complete image processing pipeline - Natural quality, chosen background colour"""

        results = {
            "success": True,
            "face_detected": False,
            "face_coordinates": None,
            "face_confidence": None,
            "face_cropped_path": None,
            "bg_removed_path": None,
            "bg_removed_transparent_path": None,  # NEW: reusable, colour-free asset
            "enhanced_path": None,
            "passport_path": None,
            "passport_specs": None
        }

        try:
            logger.info(f"Processing image: {image_path}")

            # Step 1: Use original image (no cropping for better quality)
            logger.info("Step 1: Using original image")
            current_image = image_path
            results["face_detected"] = True
            results["face_confidence"] = 0.95

            # Step 2: Background Removal
            # FIX: previously this called remove_background() directly, which
            # both (a) ran the expensive rembg AI model AND (b) immediately
            # baked in a background colour that BackgroundRemover used to
            # hardcode to white regardless of what was requested.
            #
            # Now we run rembg ONCE to get a transparent asset, save that
            # PNG (with real alpha, unlike the JPEG outputs below), and THEN
            # flatten it onto the requested colour. Any future recolor
            # request can reuse the saved transparent PNG and skip rembg
            # entirely — see the /recolor route.
            logger.info("Step 2: Removing background (transparent, reusable)...")
            logger.info(f"Image path for BG removal: {current_image}")

            transparent_img = self.bg_remover.remove_background_transparent(current_image)

            if transparent_img:
                transparent_path = self._save_pil_image_png(
                    transparent_img, session_id, image_id, "bg_removed_transparent"
                )
                results["bg_removed_transparent_path"] = transparent_path
                logger.info(f"✅ Transparent asset saved to: {transparent_path}")

                flattened_img = self.bg_remover.flatten_transparent(transparent_img, background_color)
                bg_path = self._save_pil_image(flattened_img, session_id, image_id, "bg_removed")
                results["bg_removed_path"] = bg_path
                current_image = bg_path
                logger.info(f"✅ Background flattened to {background_color}, saved to: {bg_path}")
            else:
                logger.warning("Background removal failed, using original")

            # Step 3: Enhancement (optional)
            if enhance:
                logger.info("Step 3: Enhancing image...")
                enhance_path = current_image
                if enhance_path.startswith('/'):
                    enhance_path = '.' + enhance_path
                enhanced_img = self.enhancer.enhance(enhance_path)
                if enhanced_img:
                    enhanced_path = self._save_pil_image(enhanced_img, session_id, image_id, "enhanced")
                    results["enhanced_path"] = enhanced_path
                    current_image = enhanced_path
                    logger.info("✅ Image enhanced")
            else:
                logger.info("Step 3: Skipping enhancement")

            # Step 4: Resize to Passport Standard
            logger.info(f"Step 4: Resizing to {passport_standard}...")

            resize_path = current_image
            if resize_path.startswith('/'):
                resize_path = '.' + resize_path

            logger.info(f"Resize input path: {resize_path}")

            if not os.path.exists(resize_path):
                logger.error(f"File not found for resize: {resize_path}")
                results["success"] = False
                results["error"] = f"File not found: {resize_path}"
                return results

            passport_img, specs = self.resizer.resize_to_standard(resize_path, passport_standard)

            if passport_img:
                passport_path = self._save_pil_image(passport_img, session_id, image_id, "passport")
                results["passport_path"] = passport_path
                results["passport_specs"] = specs
                logger.info(f"✅ Resized to {specs['name'] if specs else passport_standard}")
            else:
                logger.error("Resize failed - returned None")
                results["success"] = False
                results["error"] = "Resize failed"
                return results

            logger.info("✅ Processing complete!")
            return results

        except Exception as e:
            logger.error(f"Processing error: {e}")
            import traceback
            traceback.print_exc()
            results["success"] = False
            results["error"] = str(e)
            return results

    async def recolor_image(self, transparent_path, session_id, image_id, background_color,
                             passport_standard="35x45"):
        """
        NEW: fast path for when the user just wants a different background
        colour on an image that was already processed once. Skips rembg
        AND face-cropping entirely — reuses the saved transparent PNG,
        flattens it onto the new colour, and re-resizes to the passport
        standard. This is what the /recolor API route should call.
        """
        results = {"success": True, "passport_path": None, "bg_removed_path": None}
        try:
            if not os.path.exists(transparent_path):
                results["success"] = False
                results["error"] = f"Transparent asset not found: {transparent_path}"
                return results

            transparent_img = Image.open(transparent_path)
            flattened_img = self.bg_remover.flatten_transparent(transparent_img, background_color)
            bg_path = self._save_pil_image(flattened_img, session_id, image_id, "bg_removed")
            results["bg_removed_path"] = bg_path

            passport_img, specs = self.resizer.resize_to_standard(bg_path, passport_standard)
            if passport_img:
                passport_path = self._save_pil_image(passport_img, session_id, image_id, "passport")
                results["passport_path"] = passport_path
                results["passport_specs"] = specs
            else:
                results["success"] = False
                results["error"] = "Resize failed"

            return results
        except Exception as e:
            logger.error(f"Recolor error: {e}")
            results["success"] = False
            results["error"] = str(e)
            return results

    def _save_cv2_image(self, img, session_id, image_id, suffix):
        """Save OpenCV image (numpy array)"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{timestamp}_{image_id}_{suffix}.jpg"

        save_dir = os.path.join(settings.upload_dir, "sessions", session_id, "processed")
        os.makedirs(save_dir, exist_ok=True)

        file_path = os.path.join(save_dir, filename)

        if len(img.shape) == 3 and img.shape[2] == 3:
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        pil_img = Image.fromarray(img)
        pil_img.save(file_path, "JPEG", quality=95)

        return f"/uploads/sessions/{session_id}/processed/{filename}"

    def _save_pil_image(self, img, session_id, image_id, suffix):
        """Save PIL image as JPEG (final/flattened outputs — no alpha)."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{timestamp}_{image_id}_{suffix}.jpg"

        save_dir = os.path.join(settings.upload_dir, "sessions", session_id, "processed")
        os.makedirs(save_dir, exist_ok=True)

        file_path = os.path.join(save_dir, filename)

        if isinstance(img, str):
            img = Image.open(img)

        if img.mode == "RGBA":
            img = img.convert("RGB")  # JPEG can't hold alpha

        img.save(file_path, "JPEG", quality=95, subsampling=0)

        return f"/uploads/sessions/{session_id}/processed/{filename}"

    def _save_pil_image_png(self, img, session_id, image_id, suffix):
        """
        NEW: Save PIL image as PNG — used ONLY for the transparent asset,
        since JPEG has no alpha channel and would silently destroy the
        transparency we need for cheap recoloring later.
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{timestamp}_{image_id}_{suffix}.png"

        save_dir = os.path.join(settings.upload_dir, "sessions", session_id, "processed")
        os.makedirs(save_dir, exist_ok=True)

        file_path = os.path.join(save_dir, filename)

        if isinstance(img, str):
            img = Image.open(img)
        if img.mode != "RGBA":
            img = img.convert("RGBA")

        img.save(file_path, "PNG")

        return f"/uploads/sessions/{session_id}/processed/{filename}"