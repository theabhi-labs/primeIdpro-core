import os
import asyncio
import logging
import numpy as np
from PIL import Image
from fastapi import HTTPException

from app.core.config import PROCESSED_DIR
from app.core.state import uploaded_images, processing_status
from app.services.background.remover import remove_background_lightweight
from app.services.face_detection.detector import align_and_crop_face
from app.services.enhancement.enhancer import (
    flatten_onto_bg,
    refine_edges_and_halo,
    enhance_image_quality,
    restore_and_enhance_vintage_photo,
)
from app.services.enhancement.validator import verify_passport_quality
from app.utils.color import validate_and_normalize_color

logger = logging.getLogger("primeidpro.pipeline")


def detect_face_crop(
    image_path: str,
    output_path: str,
    transparent_output_path: str,
    country_code: str = "india",
    bg_color: str = "white",
    dpi: int = 300,
    face_mesh=None,
    face_cascade=None,
    alt_cascade=None
):
    """
    Crop face with precise biometric alignment, normalization, and edge refinement.
    Saves transparent asset PNG and background-composited final PNG at exact 300 DPI.
    """
    pil_img = Image.open(image_path)
    rgba_img = pil_img.convert("RGBA") if pil_img.mode != "RGBA" else pil_img

    scale_adj = 1.0
    shift = (0.0, 0.0)

    transparent_crop, metrics = align_and_crop_face(
        rgba_img,
        country_code=country_code,
        dpi=dpi,
        scale_adjust=scale_adj,
        center_shift=shift,
        face_mesh=face_mesh,
        face_cascade=face_cascade,
        alt_cascade=alt_cascade
    )

    # Edge Matting, Defringing and Anti-Halo
    refined_np = refine_edges_and_halo(np.array(transparent_crop))
    
    # Natural lighting enhancement applied directly to the subject BEFORE background flattening
    rgb_only = enhance_image_quality(refined_np[:, :, :3])
    subject_rgba = np.dstack([rgb_only, refined_np[:, :, 3]])
    refined_rgba = Image.fromarray(subject_rgba, mode="RGBA")

    # Flatten on Background
    flat = flatten_onto_bg(refined_rgba, bg_color, refined_rgba.size)

    # Validate output quality
    is_valid, v_log, suggestions = verify_passport_quality(
        refined_rgba,
        country_code=country_code,
        dpi=dpi,
        face_mesh=face_mesh
    )

    # Save with embedded 300 DPI metadata
    refined_rgba.save(transparent_output_path, "PNG", dpi=(dpi, dpi))
    flat.save(output_path, "PNG", dpi=(dpi, dpi))
    return is_valid, v_log, suggestions


from app.services.enhancement.restorer import run_4k_vintage_restoration


async def process_image_async(
    image_id: str,
    country_code: str = "india",
    bg_color: str = "white",
    restore_vintage: bool = False,
    clarity_boost: float = 1.40,
    denoise_level: float = 0.60,
    color_vibrance: float = 1.15,
    face_mesh=None,
    face_cascade=None,
    alt_cascade=None
):
    """Full pipeline: bg removal -> precise crop + enhance + quality check"""
    try:
        processing_status[image_id] = {"status": "processing", "progress": 10}
        original_path = uploaded_images[image_id]["original_path"]

        final_path = os.path.join(PROCESSED_DIR, f"{image_id}_final.png")
        transparent_path = os.path.join(PROCESSED_DIR, f"{image_id}_transparent.png")

        processing_status[image_id]["progress"] = 30
        nobg_path = os.path.join(PROCESSED_DIR, f"{image_id}_nobg.png")
        success = await asyncio.to_thread(remove_background_lightweight, original_path, nobg_path)
        if not success:
            raise Exception("Background removal failed completely")

        processing_status[image_id]["progress"] = 60

        # Runs crop, alignment, defringing, edge quality, and biometric verification
        is_valid, v_log, suggestions = await asyncio.to_thread(
            detect_face_crop,
            nobg_path,
            final_path,
            transparent_path,
            country_code,
            bg_color,
            300,
            face_mesh,
            face_cascade,
            alt_cascade
        )

        # Clean up temporary background-removed file
        if os.path.exists(nobg_path):
            try:
                os.remove(nobg_path)
            except Exception:
                pass

        if restore_vintage:
            # Apply 4K Super-Resolution & Vintage De-aging directly to the transparent subject
            def _apply_4k():
                t_img = Image.open(transparent_path).convert("RGBA")
                vivid_np = restore_and_enhance_vintage_photo(
                    np.array(t_img),
                    clarity_boost=clarity_boost,
                    denoise_level=denoise_level,
                    color_vibrance=color_vibrance,
                    auto_deage=True
                )
                vivid_rgba = Image.fromarray(vivid_np, mode="RGBA")
                vivid_rgba.save(transparent_path, "PNG", dpi=(300, 300))
                flat_img = flatten_onto_bg(vivid_rgba, bg_color, vivid_rgba.size)
                flat_img.save(final_path, "PNG", dpi=(300, 300))

            await asyncio.to_thread(_apply_4k)

        processing_status[image_id]["progress"] = 90

        uploaded_images[image_id]["processed_path"] = final_path
        uploaded_images[image_id]["transparent_path"] = transparent_path
        uploaded_images[image_id]["processed_url"] = f"/processed/{image_id}_final.png"
        uploaded_images[image_id]["transparent_url"] = f"/processed/{image_id}_transparent.png"
        uploaded_images[image_id]["is_vintage_restored"] = restore_vintage

        processing_status[image_id] = {
            "status": "completed",
            "progress": 100,
            "processed_url": f"/processed/{image_id}_final.png",
            "transparent_url": f"/processed/{image_id}_transparent.png",
            "bg_color": bg_color,
            "is_vintage_restored": restore_vintage,
            "quality_check": {
                "valid": is_valid,
                "log": v_log,
                "suggestions": suggestions,
            },
        }
    except Exception as e:

        logger.error(f"Error processing {image_id}: {e}")
        processing_status[image_id] = {"status": "failed", "progress": 0, "error": str(e)}


async def recolor_image_logic(image_id: str, bg_color: str) -> dict:
    """
    Re-flattens the already-cropped transparent asset onto a NEW bg_color.
    No face detection / no rembg call — instant recolor.
    """
    bg_color = validate_and_normalize_color(bg_color)
    logger.info(f"Recoloring {image_id} to {bg_color}")

    if image_id not in uploaded_images:
        raise HTTPException(404, "Image not found")

    transparent_path = uploaded_images[image_id].get("transparent_path")
    if not transparent_path or not os.path.exists(transparent_path):
        raise HTTPException(409, "Transparent asset not ready yet — wait for processing to complete")

    def _recolor():
        rgba = Image.open(transparent_path).convert("RGBA")
        flat = flatten_onto_bg(rgba, bg_color, rgba.size)
        final_path = os.path.join(PROCESSED_DIR, f"{image_id}_final.png")
        flat.save(final_path, "PNG", dpi=(300, 300))
        return final_path

    final_path = await asyncio.to_thread(_recolor)
    uploaded_images[image_id]["processed_path"] = final_path
    processed_url = f"/processed/{image_id}_final.png"
    uploaded_images[image_id]["processed_url"] = processed_url

    if image_id in processing_status:
        processing_status[image_id]["processed_url"] = processed_url
        processing_status[image_id]["bg_color"] = bg_color

    return {"processed_url": processed_url, "bg_color": bg_color}