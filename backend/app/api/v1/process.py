import os
from fastapi import APIRouter, Form, HTTPException  # pyrefly: ignore [missing-import]
from fastapi.responses import FileResponse, JSONResponse  # pyrefly: ignore [missing-import]

from app.core.state import uploaded_images, processing_status  # pyrefly: ignore [missing-import]
from app.services.resize.presets import COUNTRY_PRESETS  # pyrefly: ignore [missing-import]
from app.services.pipeline import recolor_image_logic  # pyrefly: ignore [missing-import]

router = APIRouter(prefix="/process", tags=["Process"])


from app.services.enhancement.enhancer import flatten_onto_bg, restore_and_enhance_vintage_photo  # pyrefly: ignore [missing-import]
from app.utils.color import validate_and_normalize_color  # pyrefly: ignore [missing-import]
from PIL import Image  # pyrefly: ignore [missing-import]
import numpy as np  # pyrefly: ignore [missing-import]
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
    clarity_boost: float = Form(1.25),
    denoise_level: float = Form(0.50),
    color_vibrance: float = Form(1.08),
    auto_deage: bool = Form(True),
    hair_depth: float = Form(1.30)
):
    """
    Applies real-time 4K AI Super-Resolution, Denoising, Hair & Eye Deep Black Retention,
    and Vintage De-aging to an existing image asset.
    """
    if image_id not in uploaded_images:
        raise HTTPException(404, "Image not found")

    transparent_path = uploaded_images[image_id].get("transparent_path")
    if not transparent_path or not os.path.exists(transparent_path):
        raise HTTPException(409, "Transparent asset not ready")

    base_transparent_path = uploaded_images[image_id].get("base_transparent_path")
    src_path = base_transparent_path if (base_transparent_path and os.path.exists(base_transparent_path)) else transparent_path

    norm_bg = validate_and_normalize_color(bg_color)
    rgba = Image.open(src_path).convert("RGBA")

    # Enhance transparent RGBA subject directly with landmark-guided 4K super-enhancement
    rgba_np = np.array(rgba)
    vivid_rgba_np = restore_and_enhance_vintage_photo(
        rgba_np,
        clarity_boost=float(clarity_boost),
        denoise_level=float(denoise_level),
        color_vibrance=float(color_vibrance),
        auto_deage=bool(auto_deage),
        hair_depth=float(hair_depth)
    )
    vivid_rgba = Image.fromarray(vivid_rgba_np, "RGBA")
    vivid_rgba.save(transparent_path, "PNG", dpi=(300, 300))

    # Composite vivid subject onto chosen background
    flat_rgb = flatten_onto_bg(vivid_rgba, norm_bg, vivid_rgba.size)
    final_path = uploaded_images[image_id]["processed_path"]
    flat_rgb.save(final_path, "PNG", dpi=(300, 300))

    timestamp = int(time.time())
    processed_url = f"/processed/{image_id}_final.png?t={timestamp}"
    transparent_url = f"/processed/{image_id}_transparent.png?t={timestamp}"
    uploaded_images[image_id]["processed_url"] = processed_url
    uploaded_images[image_id]["transparent_url"] = transparent_url
    uploaded_images[image_id]["is_vintage_restored"] = True

    return {
        "success": True,
        "data": {
            "image_id": image_id,
            "processed_url": processed_url,
            "transparent_url": transparent_url,
            "clarity_boost": clarity_boost,
            "denoise_level": denoise_level,
            "color_vibrance": color_vibrance,
            "hair_depth": hair_depth,
            "message": "AI 4K Super-Resolution & Vintage Restoration applied successfully!"
        }
    }


_magic_bg_in_flight = set()

@router.post("/magic-ai-bg/{image_id}")
async def magic_ai_bg_fix(
    image_id: str,
    bg_color: str = Form("white")
):
    """
    On-Demand Magic Pen / Magic AI Background Fix:
    1. Multi-click & spam protection (prevents redundant duplicate cloud calls).
    2. Runs high-precision Cloud RMBG-2.0 if available, with automatic high-fidelity local fallback.
    3. Aligns biometric crop, decontaminates edge colors, and re-flattens on the chosen background.
    """
    if image_id not in uploaded_images:
        raise HTTPException(404, "Image not found")

    if image_id in _magic_bg_in_flight:
        raise HTTPException(429, "Magic AI processing is already in progress for this photo. Please wait a moment.")

    _magic_bg_in_flight.add(image_id)
    try:
        from app.core.config import PROCESSED_DIR
        from app.services.face_detection.detector import align_and_crop_face
        from app.services.background.remover import remove_background_lightweight
        from app.services.enhancement.enhancer import refine_edges_and_halo

        original_path = uploaded_images[image_id]["original_path"]
        if not os.path.exists(original_path):
            raise HTTPException(404, "Original image file not found")

        temp_magic_nobg = os.path.join(PROCESSED_DIR, f"{image_id}_magic_nobg.png")
        norm_bg = validate_and_normalize_color(bg_color)

        provider = "local_enhanced"
        # 1. Attempt Cloud AI RMBG-2.0
        try:
            from app.services.background.cloud_remover import remove_background_rmbg2_sync
            if remove_background_rmbg2_sync(original_path, temp_magic_nobg):
                if os.path.exists(temp_magic_nobg):
                    check = Image.open(temp_magic_nobg)
                    if check.mode == "RGBA":
                        provider = "cloud_rmbg2"
        except Exception:
            pass

        # 2. Fallback to Local isnet-general-use if cloud was not used
        if provider != "cloud_rmbg2":
            ok = remove_background_lightweight(original_path, temp_magic_nobg)
            if not ok or not os.path.exists(temp_magic_nobg):
                raise HTTPException(500, "Background segmentation failed")

        nobg_pil = Image.open(temp_magic_nobg).convert("RGBA")
        country_code = uploaded_images[image_id].get("country_code", "india")

        # 3. Biometric Crop Alignment & Edge Decontamination
        cropped_rgba, metrics = align_and_crop_face(nobg_pil, country_code=country_code, dpi=300)
        refined_np = refine_edges_and_halo(np.array(cropped_rgba))
        refined_rgba = Image.fromarray(refined_np, "RGBA")

        # 4. Update transparent and base_transparent assets
        transparent_path = uploaded_images[image_id].get("transparent_path") or os.path.join(PROCESSED_DIR, f"{image_id}_transparent.png")
        base_transparent_path = os.path.join(PROCESSED_DIR, f"{image_id}_base_transparent.png")
        final_path = uploaded_images[image_id].get("processed_path") or os.path.join(PROCESSED_DIR, f"{image_id}_final.png")

        refined_rgba.save(transparent_path, "PNG", dpi=(300, 300))
        refined_rgba.save(base_transparent_path, "PNG", dpi=(300, 300))

        # 5. Flatten onto selected background
        flat_rgb = flatten_onto_bg(refined_rgba, norm_bg, refined_rgba.size)
        flat_rgb.save(final_path, "PNG", dpi=(300, 300))

        # Cleanup temporary file
        if os.path.exists(temp_magic_nobg):
            try:
                os.remove(temp_magic_nobg)
            except Exception:
                pass

        timestamp = int(time.time())
        processed_url = f"/processed/{image_id}_final.png?t={timestamp}"
        transparent_url = f"/processed/{image_id}_transparent.png?t={timestamp}"
        uploaded_images[image_id]["processed_url"] = processed_url
        uploaded_images[image_id]["transparent_url"] = transparent_url
        uploaded_images[image_id]["base_transparent_path"] = base_transparent_path

        msg = "✨ Magic AI Cut applied successfully!" if provider == "cloud_rmbg2" else "✨ Ultra-precision edge refinement applied!"

        return {
            "success": True,
            "data": {
                "image_id": image_id,
                "provider": provider,
                "processed_url": processed_url,
                "transparent_url": transparent_url,
                "message": msg
            }
        }
    finally:
        _magic_bg_in_flight.discard(image_id)



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


@router.get("/engine-status")
async def get_engine_status():
    """
    Returns the live AI engine status:
    - Cloud AI (RMBG-2.0 via Replicate / Bria / Custom) status
    - Local Neural Fallback (IS-Net / u2net_human_seg) status
    """
    from app.core.config import settings
    
    token = getattr(settings, "replicate_api_token", "") or os.environ.get("REPLICATE_API_TOKEN", "")
    rmbg_enabled = getattr(settings, "rmbg_enabled", True)
    custom_endpoint = getattr(settings, "custom_rmbg_endpoint", "") or os.environ.get("RMBG_CUSTOM_ENDPOINT", "")
    
    has_cloud_config = bool(token or custom_endpoint) and rmbg_enabled
    
    return {
        "success": True,
        "data": {
            "rmbg_enabled": rmbg_enabled,
            "has_cloud_config": has_cloud_config,
            "provider": getattr(settings, "rmbg_provider", "replicate"),
            "cloud_engine": "RMBG-2.0 Ultra Cloud AI (Sub-Pixel Hair)",
            "local_engine": "IS-Net High-Definition Engine (100% Offline)",
            "mode": "hybrid_auto",
            "offline_ready": True
        }
    }