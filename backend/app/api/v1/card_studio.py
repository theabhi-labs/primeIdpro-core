import os
import uuid
import json
import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Query  # pyrefly: ignore [missing-import]
from fastapi.responses import FileResponse, HTMLResponse  # pyrefly: ignore [missing-import]

from app.core.config import UPLOAD_DIR, PROCESSED_DIR  # pyrefly: ignore [missing-import]
from app.models.card_studio import (  # pyrefly: ignore [missing-import]
    CardProject,
    CardRecord,
    CardBatch,
    OrganizationData,
    CardTemplateMeta,
    ImportFileResponse,
    MatchPhotosRequest,
    ProcessQueueRequest,
    RenderPreviewRequest,
    GenerateBatchRequest,
    PreflightSummary,
)
from app.services.cards.importer import parse_xlsx_data, parse_csv_data  # pyrefly: ignore [missing-import]
from app.services.cards.mapper import auto_detect_mappings  # pyrefly: ignore [missing-import]
from app.services.cards.photo_matcher import match_photos_for_records  # pyrefly: ignore [missing-import]
from app.services.cards.photo_adapter import process_card_photo  # pyrefly: ignore [missing-import]
from app.services.cards.template_engine import list_card_templates, get_template_by_id, render_card_html, render_template_sample_html  # pyrefly: ignore [missing-import]
from app.services.cards.sync_engine import sync_templates_from_web
from app.services.cards.validator import run_preflight_validation  # pyrefly: ignore [missing-import]
from app.services.cards.pdf_generator import generate_card_batch_pdf  # pyrefly: ignore [missing-import]
from app.services.cards.project_store import (  # pyrefly: ignore [missing-import]
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


@card_router.post("/templates/sync")
async def sync_templates():
    """Triggers the sync engine to download templates from the web platform."""
    return await sync_templates_from_web()


@card_router.get("/templates/{template_id}/preview")
async def get_template_sample_preview(
    template_id: str,
    side: str = Query("front", pattern="^(front|back)$")
):
    """
    Renders a live realistic HTML sample preview of a template (Front or Back).
    Used for instant live visual inspection in template selection.
    """
    html = render_template_sample_html(template_id=template_id, side=side)
    return HTMLResponse(content=html)



# ---------------- 2. IMPORT DATA ----------------
@card_router.post("/import-file")
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

    return {
        "success": True,
        "fileName": filename,
        "fileType": ext,
        "sheets": sheets,
        "detectedHeaders": headers,
        "totalRows": len(rows),
        "sampleRows": rows[:10],
        "allRows": rows,
        "suggestedMappings": suggested,
        "embeddedImagesCount": embedded_count,
        "tempFilePath": temp_file_path
    }


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


from pydantic import BaseModel


class ProcessSinglePhotoRequest(BaseModel):
    projectId: str
    photoDataUrl: str
    recordName: Optional[str] = "Student"
    bgColor: Optional[str] = None
    forceReprocess: Optional[bool] = False


@card_router.post("/process-single-photo")
async def process_single_photo(req: ProcessSinglePhotoRequest):
    """
    Processes a single student photo locally using 100% Free Local AI (₹0 cost).
    Strips background and flattens onto the school's configured uniform background color.
    """
    project = load_project_from_disk(req.projectId)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    profile = project.photoProcessingProfile
    if req.bgColor:
        profile.bgColor = req.bgColor

    photo_info, is_hit, log_steps = process_card_photo(
        input_image_path=req.photoDataUrl,
        profile=profile,
        force_reprocess=req.forceReprocess or False,
        record_name=req.recordName or "Student"
    )

    return {
        "success": photo_info.status == "completed",
        "processedPhoto": photo_info.model_dump(),
        "isCacheHit": is_hit,
        "logs": log_steps
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
    If no records exist, renders a realistic template sample with the project's organization.
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
        html = render_template_sample_html(
            template_id=project.templateId,
            side=req.side,
            organization=project.organization
        )
        return HTMLResponse(content=html)

    # If record has a photo that is not yet processed into card cache, process it locally on-the-fly!
    if target_record.photo and target_record.photo.originalPath:
        proc_url = target_record.processedPhoto.processedUrl if target_record.processedPhoto else ""
        if not proc_url or not proc_url.startswith("/processed/card_cache/"):
            try:
                photo_info, _, _ = process_card_photo(
                    input_image_path=target_record.photo.originalPath,
                    profile=project.photoProcessingProfile,
                    force_reprocess=False,
                    record_name=target_record.fields.get("name") or "Student"
                )
                if photo_info.status == "completed":
                    target_record.processedPhoto = photo_info
                    if target_record.photo:
                        target_record.photo.processedPath = photo_info.processedUrl
                    for b in project.batches:
                        for br in b.records:
                            if br.id == target_record.id:
                                br.processedPhoto = photo_info
                                if br.photo:
                                    br.photo.processedPath = photo_info.processedUrl
                    save_project_to_disk(project)
            except Exception as proc_err:
                logger.warning(f"On-the-fly photo process error: {proc_err}")

    html = render_card_html(
        template_id=project.templateId,
        record=target_record,
        organization=project.organization,
        side=req.side
    )

    return HTMLResponse(content=html)


@card_router.post("/render-live-sample")
async def render_live_sample(
    templateId: str = Query("school-modern-blue"),
    side: str = Query("front"),
    org: Optional[OrganizationData] = None
):
    """
    Renders live HTML preview dynamically as the user types school details during project setup.
    """
    html = render_template_sample_html(
        template_id=templateId,
        side=side,
        organization=org
    )
    return HTMLResponse(content=html)



# ---------------- 7. GENERATE PDF / BATCH ----------------
@card_router.post("/generate-pdf")
def generate_pdf(req: GenerateBatchRequest):
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


# ---------------- 9. BATCH SESSIONS & LOCKING ----------------
@card_router.post("/projects/{project_id}/batches/{batch_id}/lock")
async def lock_batch_for_print(project_id: str, batch_id: str):
    """Locks a batch session so no further changes can be made by school web form."""
    project = load_project_from_disk(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    found = False
    for b in project.batches:
        if b.id == batch_id:
            b.status = "LOCKED_FOR_PRINT"
            found = True
            break

    if not found:
        # If no batches existed, initialize batch 1 as locked
        from app.models.card_studio import CardBatch
        project.batches = [
            CardBatch(
                id=batch_id,
                batchNumber=1,
                name="Batch 1",
                status="LOCKED_FOR_PRINT",
                totalRecords=len(project.records),
                records=project.records
            )
        ]

    project.status = "LOCKED_FOR_PRINT"
    save_project_to_disk(project)
    return {"success": True, "message": f"Batch {batch_id} locked for printing.", "project": project}


@card_router.post("/projects/{project_id}/batches/new")
async def create_new_batch(project_id: str, name: Optional[str] = None):
    """Creates a new batch session (e.g. for late admissions / next session)."""
    project = load_project_from_disk(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    from app.models.card_studio import CardBatch
    next_num = len(project.batches) + 1
    new_batch_id = f"batch_{uuid.uuid4().hex[:6]}"
    new_batch = CardBatch(
        id=new_batch_id,
        batchNumber=next_num,
        name=name or f"Batch {next_num} (Late Entries)",
        status="COLLECTING",
        totalRecords=0,
        records=[]
    )
    project.batches.append(new_batch)
    project.currentBatchId = new_batch_id
    project.status = "COLLECTING"
    save_project_to_disk(project)
    return {"success": True, "batch": new_batch, "project": project}


# ---------------- 10. CUSTOM TEMPLATE BACKGROUND UPLOAD ----------------
@card_router.post("/templates/custom-upload")
async def upload_custom_template_background(
    file: UploadFile = File(...),
    templateName: str = Form(...),
    orientation: str = Form("vertical")
):
    """Uploads a custom blank template background image (PNG/JPG) for a private school template."""
    file_bytes = await file.read()
    ext = os.path.splitext(file.filename or ".png")[1].lower()
    if ext not in [".png", ".jpg", ".jpeg", ".svg"]:
        raise HTTPException(status_code=400, detail="Only PNG, JPG, or SVG backgrounds are supported.")

    custom_id = f"custom-{uuid.uuid4().hex[:8]}"
    out_dir = os.path.join(UPLOAD_DIR, "custom_templates", custom_id)
    os.makedirs(out_dir, exist_ok=True)

    bg_path = os.path.join(out_dir, f"background{ext}")
    with open(bg_path, "wb") as f:
        f.write(file_bytes)

    # Generate data url for preview
    import base64
    b64 = base64.b64encode(file_bytes).decode("utf-8")
    mime = "image/svg+xml" if ext == ".svg" else ("image/jpeg" if "jp" in ext else "image/png")
    data_url = f"data:{mime};base64,{b64}"

    return {
        "success": True,
        "templateId": custom_id,
        "templateName": templateName,
        "orientation": orientation,
        "backgroundUrl": data_url,
        "filePath": bg_path
    }

