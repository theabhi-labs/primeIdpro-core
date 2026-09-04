import uuid
import logging
from datetime import datetime
from bson import ObjectId  # pyrefly: ignore [missing-import]
from bson.errors import InvalidId  # pyrefly: ignore [missing-import]
from fastapi import APIRouter, HTTPException, Depends  # pyrefly: ignore [missing-import]
from fastapi.responses import JSONResponse  # pyrefly: ignore [missing-import]
from pymongo import errors as mongo_errors  # pyrefly: ignore [missing-import]

from app.core.state import uploaded_images, processing_status  # pyrefly: ignore [missing-import]
from app.core.dependencies import get_db_instance  # pyrefly: ignore [missing-import]
from app.models.project import SaveProjectRequest  # pyrefly: ignore [missing-import]

logger = logging.getLogger("primeidpro.project")
router = APIRouter(prefix="/project", tags=["Project"])


async def save_project_logic(request: SaveProjectRequest, mongo_db):
    """Core logic to validate referenced images and persist project to MongoDB."""
    logger.info(
        f"[SAVE] request received: session={request.session_id} "
        f"images={len(request.image_ids)} country={request.country_code}"
    )

    # 1. Validate referenced images actually exist & are completed
    missing_ids, not_ready_ids = [], []
    photos = []
    for image_id in request.image_ids:
        record = uploaded_images.get(image_id)
        if not record:
            missing_ids.append(image_id)
            continue
        status = processing_status.get(image_id, {})
        if status.get("status") != "completed":
            not_ready_ids.append(image_id)
            continue
        photos.append({
            "image_id": image_id,
            "filename": record.get("filename"),
            "processed_url": status.get("processed_url"),
            "transparent_url": status.get("transparent_url"),
            "bg_color": status.get("bg_color", "white"),
        })

    if missing_ids:
        logger.warning(f"[SAVE] unknown image_id(s): {missing_ids}")
        raise HTTPException(
            status_code=400,
            detail=f"Unknown image_id(s), please re-upload: {', '.join(missing_ids)}",
        )
    if not_ready_ids:
        logger.warning(f"[SAVE] image(s) not finished processing: {not_ready_ids}")
        raise HTTPException(
            status_code=400,
            detail=f"Image(s) still processing, wait for them to finish before saving: {', '.join(not_ready_ids)}",
        )

    # 2. Persist
    project_doc = {
        "session_id": request.session_id or "anonymous",
        "name": request.project_name or f"Project_{uuid.uuid4().hex[:8]}",
        "country_code": request.country_code,
        "paper_size": request.paper_size,
        "image_ids": request.image_ids,
        "photos": photos,
        "created_at": datetime.utcnow(),
    }

    try:
        result = await mongo_db["projects"].insert_one(project_doc)
    except mongo_errors.ServerSelectionTimeoutError as e:
        logger.error(f"[SAVE] MongoDB timed out: {e}")
        raise HTTPException(
            status_code=503,
            detail="Could not reach the database (timed out). Please check your connection and retry.",
        )
    except mongo_errors.PyMongoError as e:
        logger.error(f"[SAVE] MongoDB error while saving project: {e}")
        raise HTTPException(status_code=500, detail=f"Database error while saving project: {e}")

    project_id = str(result.inserted_id)
    logger.info(f"[SAVE] ✅ project saved: {project_id}")

    return JSONResponse({
        "success": True,
        "project_id": project_id,
        "sheet_id": project_id,
        "share_id": project_id[:8],
        "message": "Project saved successfully",
    })


@router.post("/save")
async def save_project(request: SaveProjectRequest, mongo_db=Depends(get_db_instance)):
    """Save project metadata and photo collection to MongoDB."""
    return await save_project_logic(request, mongo_db)


@router.get("/{project_id}")
async def get_project(project_id: str, mongo_db=Depends(get_db_instance)):
    """Fetch a saved project by ID."""
    try:
        oid = ObjectId(project_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"'{project_id}' is not a valid project id")

    doc = await mongo_db["projects"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    doc["_id"] = str(doc["_id"])
    return {"success": True, "data": doc}
