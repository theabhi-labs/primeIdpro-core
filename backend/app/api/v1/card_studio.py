import os
import uuid
import json
import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse, HTMLResponse

from app.core.config import UPLOAD_DIR, PROCESSED_DIR
from app.models.card_studio import (
    CardProject,
    CardRecord,
    CardTemplateMeta,
    ImportFileResponse,
    MatchPhotosRequest,
    ProcessQueueRequest,
    RenderPreviewRequest,
    GenerateBatchRequest,
    PreflightSummary,
)
from app.services.cards.importer import parse_xlsx_data, parse_csv_data
from app.services.cards.mapper import auto_detect_mappings
from app.services.cards.photo_matcher import match_photos_for_records
from app.services.cards.photo_adapter import process_card_photo
from app.services.cards.template_engine import list_card_templates, get_template_by_id, render_card_html, render_template_sample_html
from app.services.cards.validator import run_preflight_validation
from app.services.cards.pdf_generator import generate_card_batch_pdf
from app.services.cards.project_store import (
    save_project_to_disk,
    load_project_from_disk,
    list_saved_projects,
    delete_project_from_disk,
)

logger = logging.getLogger("primeidpro.cards.api")
card_router = APIRouter(prefix="/cards", tags=["Card Studio"])

TEMP_IMPORT_DIR = os.path.join(UPLOAD_DIR, "card_imports")
os.makedirs(TEMP_IMPORT_DIR, exist_ok=True)



# ---------------- 1. TEMPLATES ----------------
@card_router.get("/templates", response_model=List[CardTemplateMeta])
async def get_templates():
    """Lists all available Card Studio template packages."""
    return list_card_templates()


@card_router.get("/templates/{template_id}/preview")
async def get_template_sample_preview(
    template_id: str,
    side: str = Query("front", regex="^(front|back)$")
):
    """
    Renders a live realistic HTML sample preview of a template (Front or Back).
    Used for instant live visual inspection in template selection.
    """
    html = render_template_sample_html(template_id=template_id, side=side)
    return HTMLResponse(content=html)



# ---------------- 2. IMPORT DATA ----------------
@card_router.post("/import-file", response_model=ImportFileResponse)
async def upload_and_parse_file(
    file: UploadFile = File(...),
    sheetName: Optional[str] = Form(None)
):
    """
    Uploads and parses an Excel (.xlsx) or CSV file.
    Extracts embedded photos and suggests automatic column mappings.
    """
    file_bytes = await file.read()
    filename = file.filename or "data.xlsx"
    ext = os.path.splitext(filename)[1].lower()

    if ext not in [".xlsx", ".xls", ".csv"]:
        raise HTTPException(status_code=400, detail="Only .xlsx and .csv files are supported.")

    file_id = uuid.uuid4().hex[:8]
    temp_dir = os.path.join(TEMP_IMPORT_DIR, file_id)
    os.makedirs(temp_dir, exist_ok=True)

    temp_file_path = os.path.join(temp_dir, filename)
    with open(temp_file_path, "wb") as f:
        f.write(file_bytes)

    if ext == ".csv":
        headers, rows, meta = parse_csv_data(file_bytes, filename)
        sheets = ["CSV"]
        embedded_count = 0
    else:
        embedded_extract_dir = os.path.join(temp_dir, "embedded_photos")
        headers, rows, meta = parse_xlsx_data(
            temp_file_path,
            sheet_name=sheetName,
            extract_embedded=True,
            extract_dir=embedded_extract_dir
        )
        sheets = meta.get("sheets", ["Sheet1"])
        embedded_count = meta.get("embedded_images_count", 0)

    suggested = auto_detect_mappings(headers)

    return ImportFileResponse(
        success=True,
        fileName=filename,
        fileType=ext,
        sheets=sheets,
        detectedHeaders=headers,
        totalRows=len(rows),
        sampleRows=rows[:5],
        suggestedMappings=suggested,
        embeddedImagesCount=embedded_count,
        tempFilePath=temp_file_path
    )


# ---------------- 3. MATCH PHOTOS ----------------
@card_router.post("/match-photos")
async def match_photos(req: MatchPhotosRequest):
    """
    Executes multi-strategy photo matching for a project's records.
    """
    project = load_project_from_disk(req.projectId)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    updated_records, stats = match_photos_for_records(
        records=project.records,
        photo_folder=req.photoFolderPath,
        uploaded_files=req.uploadedPhotoFiles,
        match_strategy=req.matchStrategy,
        identifier_field=req.identifierField
    )

    project.records = updated_records
    project.photosMatched = stats["matched"]
    project.status = "DATA_READY"
    save_project_to_disk(project)

    return {
        "success": True,
        "projectId": project.id,
        "stats": stats,
        "records": [r.model_dump() for r in updated_records]
    }


# ---------------- 4. PROCESS PHOTO QUEUE (REUSING EXISTING PIPELINE) ----------------
@card_router.post("/process-queue")
async def process_photo_queue(req: ProcessQueueRequest):
    """
    Feeds card photos into the EXISTING Prime ID Pro photo pipeline with SHA-256 caching and detailed live execution logs.
    """
    project = load_project_from_disk(req.projectId)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    target_records = project.records
    if req.recordIds:
        id_set = set(req.recordIds)
        target_records = [r for r in project.records if r.id in id_set]

    processed_count = 0
    cache_hits = 0
    failed_count = 0
    pipeline_logs: List[Dict[str, Any]] = []

    for idx, rec in enumerate(target_records, 1):
        rec_name = rec.fields.get("name") or f"Record #{idx}"
        rec_roll = rec.fields.get("rollNumber") or rec.fields.get("employeeId") or str(idx)
        photo_path = rec.photo.originalPath if (rec.photo and rec.photo.matched and rec.photo.originalPath) else "placeholder"

        photo_info, is_hit, log_steps = process_card_photo(
            input_image_path=photo_path,
            profile=project.photoProcessingProfile,
            force_reprocess=req.forceReprocess,
            record_name=f"{rec_name} ({rec_roll})"
        )

        rec.processedPhoto = photo_info
        if photo_info.status == "completed":
            processed_count += 1
            if is_hit:
                cache_hits += 1
        elif photo_info.status == "failed":
            failed_count += 1

        pipeline_logs.append({
            "recordId": rec.id,
            "name": rec_name,
            "roll": rec_roll,
            "status": photo_info.status,
            "isCacheHit": is_hit,
            "photoUrl": photo_info.processedUrl,
            "steps": log_steps
        })

    project.photosProcessed = len([r for r in project.records if r.processedPhoto.status == "completed"])
    project.status = "PHOTOS_READY"
    save_project_to_disk(project)

    return {
        "success": True,
        "totalProcessed": processed_count,
        "cacheHits": cache_hits,
        "newProcessed": processed_count - cache_hits,
        "failed": failed_count,
        "pipelineLogs": pipeline_logs,
        "records": [r.model_dump() for r in project.records]
    }



# ---------------- 5. PREFLIGHT VALIDATION ----------------
@card_router.post("/validate/{project_id}", response_model=PreflightSummary)
async def validate_project(project_id: str):
    """Runs preflight validation on a CardProject."""
    project = load_project_from_disk(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    template_info = get_template_by_id(project.templateId)
    if not template_info:
        templates = list_card_templates()
        if not templates:
            raise HTTPException(status_code=500, detail="No templates installed.")
        template_meta = templates[0]
    else:
        template_meta, _ = template_info

    updated_records, summary = run_preflight_validation(project.records, template_meta)
    project.records = updated_records
    save_project_to_disk(project)

    return summary


# ---------------- 6. RENDER CARD PREVIEW ----------------
@card_router.post("/render-preview")
async def render_preview(req: RenderPreviewRequest):
    """
    Renders the HTML preview for a single card record (front or back).
    """
    project = load_project_from_disk(req.projectId)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    target_record = None
    if req.recordId:
        target_record = next((r for r in project.records if r.id == req.recordId), None)

    if not target_record and project.records:
        target_record = project.records[0]

    if not target_record:
        raise HTTPException(status_code=400, detail="No records available to render.")

    html = render_card_html(
        template_id=project.templateId,
        record=target_record,
        organization=project.organization,
        side=req.side
    )

    return HTMLResponse(content=html)


# ---------------- 7. GENERATE PDF / BATCH ----------------
@card_router.post("/generate-pdf")
async def generate_pdf(req: GenerateBatchRequest):
    """
    Generates a print-ready 300 DPI PDF (PVC CR80 or A4 Sheet) and returns the file download.
    """
    project = load_project_from_disk(req.projectId)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    try:
        pdf_path = generate_card_batch_pdf(project, req)
        if not os.path.exists(pdf_path):
            raise HTTPException(status_code=500, detail="Failed to create PDF output.")

        project.status = "GENERATED"
        project.cardsGenerated = len(project.records)
        save_project_to_disk(project)

        filename = os.path.basename(pdf_path)
        return FileResponse(
            path=pdf_path,
            filename=filename,
            media_type="application/pdf"
        )
    except Exception as e:
        logger.error(f"Error generating PDF for project {req.projectId}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------- 8. PROJECT CRUD ----------------
@card_router.post("/projects/save")
async def save_project(project: CardProject):
    """Saves or updates a CardProject."""
    project.totalRecords = len(project.records)
    saved = save_project_to_disk(project)
    if not saved:
        raise HTTPException(status_code=500, detail="Failed to save project.")
    return {"success": True, "projectId": project.id, "message": "Project saved successfully."}


@card_router.get("/projects")
async def get_all_projects():
    """Lists all saved card projects."""
    return list_saved_projects()


@card_router.get("/projects/{project_id}", response_model=CardProject)
async def get_project(project_id: str):
    """Loads a saved CardProject by ID."""
    project = load_project_from_disk(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@card_router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    """Deletes a saved CardProject by ID."""
    deleted = delete_project_from_disk(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found or could not be deleted.")
    return {"success": True, "message": "Project deleted successfully."}
