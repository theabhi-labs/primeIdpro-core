import os
import uuid
import asyncio
from datetime import datetime
from typing import List
from fastapi import APIRouter, UploadFile, File, Form, Request

from app.core.config import UPLOAD_DIR
from app.core.state import uploaded_images, processing_status
from app.services.pipeline import process_image_async

router = APIRouter(prefix="/upload", tags=["Upload"])


@router.post("/single")
async def upload_single(
    request: Request,
    file: UploadFile = File(...),
    country_code: str = Form("india"),
    bg_color: str = Form("white"),
    restore_vintage: bool = Form(False)
):
    image_id = str(uuid.uuid4()).replace("-", "")[:24]
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    save_path = os.path.join(UPLOAD_DIR, f"{image_id}_original.{ext}")

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    uploaded_images[image_id] = {
        "id": image_id,
        "original_path": save_path,
        "original_url": f"/uploads/{image_id}_original.{ext}",
        "filename": file.filename,
        "uploaded_at": datetime.now().isoformat(),
        "is_vintage_restored": restore_vintage,
    }
    processing_status[image_id] = {"status": "pending", "progress": 0}

    # Retrieve models from app state
    face_mesh = getattr(request.app.state, "mp_face_mesh", None)
    face_cascade = getattr(request.app.state, "face_cascade", None)
    alt_cascade = getattr(request.app.state, "face_cascade_alt", None)

    asyncio.create_task(
        process_image_async(
            image_id,
            country_code,
            bg_color,
            restore_vintage=restore_vintage,
            face_mesh=face_mesh,
            face_cascade=face_cascade,
            alt_cascade=alt_cascade
        )
    )

    return {
        "success": True,
        "data": {
            "image_id": image_id,
            "filename": file.filename,
            "bg_color": bg_color,
            "restore_vintage": restore_vintage,
            "message": f"Processing started (vintage_restore={restore_vintage}). Use /status/{{image_id}} to check progress."
        }
    }


@router.post("/batch")
async def upload_batch(
    request: Request,
    files: List[UploadFile] = File(...),
    country_code: str = Form("india"),
    bg_color: str = Form("white"),
    restore_vintage: bool = Form(False)
):
    results = []
    face_mesh = getattr(request.app.state, "mp_face_mesh", None)
    face_cascade = getattr(request.app.state, "face_cascade", None)
    alt_cascade = getattr(request.app.state, "face_cascade_alt", None)

    for file in files:
        image_id = str(uuid.uuid4()).replace("-", "")[:24]
        ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
        save_path = os.path.join(UPLOAD_DIR, f"{image_id}_original.{ext}")

        content = await file.read()
        with open(save_path, "wb") as f:
            f.write(content)

        uploaded_images[image_id] = {
            "id": image_id,
            "original_path": save_path,
            "original_url": f"/uploads/{image_id}_original.{ext}",
            "filename": file.filename,
            "uploaded_at": datetime.now().isoformat(),
            "is_vintage_restored": restore_vintage,
        }
        processing_status[image_id] = {"status": "pending", "progress": 0}

        asyncio.create_task(
            process_image_async(
                image_id,
                country_code,
                bg_color,
                restore_vintage=restore_vintage,
                face_mesh=face_mesh,
                face_cascade=face_cascade,
                alt_cascade=alt_cascade
            )
        )
        results.append({
            "image_id": image_id,
            "filename": file.filename,
            "bg_color": bg_color,
            "restore_vintage": restore_vintage,
        })

    return {
        "success": True,
        "data": results,
        "message": f"{len(results)} images queued for processing (vintage_restore={restore_vintage})."
    }