from rembg import remove
from PIL import Image
import logging

logger = logging.getLogger(__name__)


def _hex_to_rgb(hex_color: str):
    """Convert '#RRGGBB' (or '#RGB') to an (r, g, b) tuple. Falls back to
    white on anything malformed instead of crashing the pipeline."""
    if not hex_color:
        return (255, 255, 255)
    hex_color = hex_color.strip().lstrip('#')
    try:
        if len(hex_color) == 3:
            hex_color = ''.join(c * 2 for c in hex_color)
        if len(hex_color) != 6:
            return (255, 255, 255)
        return tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        logger.warning(f"⚠️ Could not parse background_color '{hex_color}', defaulting to white")
        return (255, 255, 255)


class BackgroundRemover:
    def __init__(self):
        logger.info("✅ Background Remover initialized")

    def remove_background(self, image_input, background_color="#FFFFFF"):
        """
        Remove background and replace with the requested colour.
        FIX: previously `background_color` was accepted but never used —
        the output was hardcoded to white regardless of what was passed
        in. Now it's actually parsed and applied.
        """
        try:
            if isinstance(image_input, str):
                img = Image.open(image_input)
            else:
                img = image_input

            bg_color = _hex_to_rgb(background_color)  # FIX: was hardcoded (255,255,255)

            logger.info(f"Removing background, target colour: {background_color} -> {bg_color}")
            img_no_bg = remove(img)
            if img_no_bg.mode != "RGBA":
                img_no_bg = img_no_bg.convert("RGBA")

            bg = Image.new("RGBA", img_no_bg.size, bg_color + (255,))
            result = Image.alpha_composite(bg, img_no_bg)

            logger.info(f"✅ Background removed, set to {background_color}")
            return result.convert("RGB")

        except Exception as e:
            logger.error(f"Background removal error: {e}")
            return None

    def remove_background_transparent(self, image_input):
        """
        NEW: returns the subject on a fully transparent canvas, with no
        colour baked in at all. Save this once per image and reuse it any
        time the user picks a different background colour — flattening a
        transparent PNG onto a new colour is a cheap Pillow composite, so
        you never need to re-run rembg (the expensive AI step) just
        because someone changed the Studio Color.
        """
        try:
            if isinstance(image_input, str):
                img = Image.open(image_input)
            else:
                img = image_input

            img_no_bg = remove(img)
            if img_no_bg.mode != "RGBA":
                img_no_bg = img_no_bg.convert("RGBA")
            return img_no_bg

        except Exception as e:
            logger.error(f"Transparent background removal error: {e}")
            return None

    def flatten_transparent(self, rgba_img, background_color="#FFFFFF"):
        """Composite an already-transparent RGBA image onto a flat colour.
        No AI call — safe/cheap to call repeatedly for recolor requests."""
        bg_color = _hex_to_rgb(background_color)
        if rgba_img.mode != "RGBA":
            rgba_img = rgba_img.convert("RGBA")
        bg = Image.new("RGBA", rgba_img.size, bg_color + (255,))
        result = Image.alpha_composite(bg, rgba_img)
        return result.convert("RGB")