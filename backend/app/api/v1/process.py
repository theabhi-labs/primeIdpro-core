import os
from fastapi import APIRouter, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from app.core.state import uploaded_images, processing_status
from app.services.resize.presets import COUNTRY_PRESETS
from app.services.pipeline import recolor_image_logic

router = APIRouter(prefix="/process", tags=["Process"])


from app.services.enhancement.enhancer import flatten_onto_bg, restore_and_enhance_vintage_photo
from app.utils.color import validate_and_normalize_color
from PIL import Image
import numpy as np
import time

@router.post("/recolor/{image_id}")
async def recolor_image(image_id: str, bg_color: str = Form(...)):
    """
    Re-flattens the already-cropped transparent asset onto a NEW bg_color.
    No face detection / no rembg call — instant recolor.
    """
    res = await recolor_image_logic(image_id, bg_color)
    return {"success": True, "data": res}


@router.post("/restore-4k/{image_id}")
async def restore_4k_enhancement(
    image_id: str,
    bg_color: str = Form("white"),
    clarity_boost: float = Form(1.40),
    denoise_level: float = Form(0.60),
    color_vibrance: float = Form(1.15),
    auto_deage: bool = Form(True)
):
    """
    Applies real-time 4K AI Super-Resolution, Denoising, and Vintage De-aging
    to an existing image asset.
    """
    if image_id not in uploaded_images:
        raise HTTPException(404, "Image not found")

    transparent_path = uploaded_images[image_id].get("transparent_path")
    if not transparent_path or not os.path.exists(transparent_path):
        raise HTTPException(409, "Transparent asset not ready")

    norm_bg = validate_and_normalize_color(bg_color)
    rgba = Image.open(transparent_path).convert("RGBA")

    # Enhance transparent RGBA subject directly to prevent background color flattening
    rgba_np = np.array(rgba)
    vivid_rgba_np = restore_and_enhance_vintage_photo(
        rgba_np,
        clarity_boost=float(clarity_boost),
        denoise_level=float(denoise_level),
        color_vibrance=float(color_vibrance),
        auto_deage=bool(auto_deage)
    )
    vivid_rgba = Image.fromarray(vivid_rgba_np, "RGBA")
    vivid_rgba.save(transparent_path, "PNG", dpi=(300, 300))

    # Composite vivid subject onto chosen background
    flat_rgb = flatten_onto_bg(vivid_rgba, norm_bg, vivid_rgba.size)
    final_path = uploaded_images[image_id]["processed_path"]
    flat_rgb.save(final_path, "PNG", dpi=(300, 300))


    timestamp = int(time.time())
    processed_url = f"/processed/{image_id}_final.png?t={timestamp}"
    uploaded_images[image_id]["processed_url"] = processed_url
    uploaded_images[image_id]["is_vintage_restored"] = True

    return {
        "success": True,
        "data": {
            "image_id": image_id,
            "processed_url": processed_url,
            "clarity_boost": clarity_boost,
            "denoise_level": denoise_level,
            "color_vibrance": color_vibrance,
            "message": "AI 4K Super-Resolution & Vintage Restoration applied successfully!"
        }
    }



@router.get("/status/{image_id}")
async def get_status(image_id: str):
    """Retrieve current processing progress and quality check results for an image."""
    if image_id not in processing_status:
        return JSONResponse(status_code=404, content={"success": False, "error": "Image not found"})
    return {"success": True, "data": processing_status[image_id]}


@router.get("/download/{image_id}")
async def download_processed(image_id: str):
    """Download the final processed high-resolution passport photo."""
    if image_id not in uploaded_images:
        raise HTTPException(404, "Image not found")
    proc_path = uploaded_images[image_id].get("processed_path")
    if not proc_path or not os.path.exists(proc_path):
        raise HTTPException(404, "Processed image not ready")
    return FileResponse(proc_path, filename=f"passport_{image_id}.png")


@router.get("/countries")
async def get_countries():
    """List all available passport & visa standard dimension presets."""
    countries_list = []
    for code, info in COUNTRY_PRESETS.items():
        size_str = f"{info['width_mm']}x{info['height_mm']} mm"
        countries_list.append({
            "code": code,
            "name": info["name"],
            "size": size_str,
            "standard": size_str,
            "bg": info["bg_color"]
        })
    return {
        "success": True,
        "data": countries_list
    }


@router.get("/countries/{country_code}")
async def get_country_standard(country_code: str):
    """Get preset standard for a specific country."""
    preset = COUNTRY_PRESETS.get(country_code.lower())
    if not preset:
        raise HTTPException(404, f"Country preset '{country_code}' not found")
    size_str = f"{preset['width_mm']}x{preset['height_mm']} mm"
    return {
        "success": True,
        "data": {
            "code": country_code.lower(),
            "name": preset["name"],
            "size": size_str,
            "standard": size_str,
            "bg": preset["bg_color"],
            "details": preset
        }
    }


@router.get("/standards")
async def get_standards():
    """Alias to get all country standards."""
    return await get_countries()