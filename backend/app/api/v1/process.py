import os
from fastapi import APIRouter, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from app.core.state import uploaded_images, processing_status
from app.services.resize.presets import COUNTRY_PRESETS
from app.services.pipeline import recolor_image_logic

router = APIRouter(prefix="/process", tags=["Process"])


@router.post("/recolor/{image_id}")
async def recolor_image(image_id: str, bg_color: str = Form(...)):
    """
    Re-flattens the already-cropped transparent asset onto a NEW bg_color.
    No face detection / no rembg call — instant recolor.
    """
    res = await recolor_image_logic(image_id, bg_color)
    return {"success": True, "data": res}


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