import os
import cv2
import numpy as np
import logging
from PIL import Image
from typing import Tuple, Optional, Dict, Any

from app.services.face_detection.detector import align_and_crop_face
from app.services.enhancement.enhancer import (
    flatten_onto_bg,
    refine_edges_and_halo,
    restore_and_enhance_vintage_photo,
)
from app.services.background.remover import remove_background_lightweight

logger = logging.getLogger("primeidpro.restorer")


def run_4k_vintage_restoration(
    input_path: str,
    output_final_path: str,
    output_transparent_path: str,
    country_code: str = "india",
    bg_color: str = "#FFFFFF",
    clarity_boost: float = 1.25,
    denoise_level: float = 0.50,
    color_vibrance: float = 1.15,
    face_mesh=None,
    face_cascade=None,
    alt_cascade=None,
) -> Tuple[bool, list, list]:
    """
    Executes the High-Fidelity 4K AI Old Photo Restoration Pipeline:
    1. AI Matting & Background Removal on full image with hair/ribbon preservation.
    2. Precision Biometric Headroom & Eye-Level Alignment.
    3. Anti-Halo Edge Refinement and Matting.
    4. Studio-Grade CLAHE, Paper Grain Removal, and Super-Resolution.
    5. Natural Warm Skin Tone & Highlights Protection.
    6. Seamless 300 DPI Studio Output Generation.
    """
    temp_dir = os.path.dirname(output_final_path)
    temp_nobg = os.path.join(temp_dir, f"temp_nobg_{os.path.basename(output_final_path)}.png")

    try:
        # Step 1: Background Removal on full input image
        success = remove_background_lightweight(input_path, temp_nobg)
        if not success or not os.path.exists(temp_nobg):
            raise Exception("Background matting failed")

        nobg_pil = Image.open(temp_nobg).convert("RGBA")

        # Step 2: Precision biometric alignment and cropping
        cropped_rgba, metrics = align_and_crop_face(
            nobg_pil,
            country_code=country_code,
            dpi=300,
            face_mesh=face_mesh,
            face_cascade=face_cascade,
            alt_cascade=alt_cascade,
        )

        # Step 3: Edge Matting and Anti-Halo
        refined_np = refine_edges_and_halo(np.array(cropped_rgba))
        
        # Step 4: Apply 4K Super-Resolution & Studio Tone Restoration on Human Subject
        vivid_rgba_np = restore_and_enhance_vintage_photo(
            refined_np,
            clarity_boost=clarity_boost,
            denoise_level=denoise_level,
            color_vibrance=color_vibrance,
            auto_deage=True,
        )
        vivid_rgba = Image.fromarray(vivid_rgba_np, "RGBA")
        vivid_rgba.save(output_transparent_path, "PNG", dpi=(300, 300))

        # Step 5: Composite vivid subject onto chosen Studio Color
        flat_rgb = flatten_onto_bg(vivid_rgba, bg_color, target_size=cropped_rgba.size)
        flat_rgb.save(output_final_path, "JPEG", quality=98, dpi=(300, 300))

        logs = [
            f"Biometric face aligned with scale {metrics.get('scale', 1.0):.2f}",
            "AI 4K Super-Resolution & Studio Tone Grading applied",
            "Anti-grain de-aging & highlight protection complete",
            "Studio background composited @ 300 DPI",
        ]
        return True, logs, []

    finally:
        # Clean temporary file
        if os.path.exists(temp_nobg):
            try:
                os.remove(temp_nobg)
            except Exception:
                pass
