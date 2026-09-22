from fastapi import APIRouter, UploadFile, File, HTTPException, Request, Form
from fastapi.responses import JSONResponse
import uuid
import os
import shutil
import glob
from typing import List, Optional
from datetime import datetime

from app.core.config import UPLOAD_DIR
from app.models.print_studio_models import PrintJob, PrintDocument
from app.services.print_studio_service import (
    process_upload_and_split, group_documents, analyze_invert_safety, invert_page,
    rotate_document_image, reapply_filter_to_document
)
from app.services.print_layout_service import generate_composite, generate_single_print, generate_multipage_pdf, render_pdf_first_page
from app.services.printer_service import print_file, get_default_printer
from app.services.settings_service import global_settings, save_settings
from app.models.print_studio_models import PrintSettings
# pyrefly: ignore [untyped-import]
import win32print

import json
import cv2
import numpy as np

router = APIRouter(prefix="/print-studio", tags=["Print Studio"])

# In-memory storage for jobs with disk persistence
jobs_db = {}
JOBS_DB_FILE = os.path.join(UPLOAD_DIR, "jobs_db.json")

def load_jobs_db():
    global jobs_db
    if os.path.exists(JOBS_DB_FILE):
        try:
            with open(JOBS_DB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                for j_id, j_data in data.items():
                    jobs_db[j_id] = PrintJob(**j_data)
        except Exception as e:
            print(f"Failed to load jobs_db.json: {e}")

def save_jobs_db():
    try:
        data = {j_id: job.model_dump(mode="json") for j_id, job in jobs_db.items()}
        with open(JOBS_DB_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Failed to save jobs_db.json: {e}")

# Load persisted jobs on startup
load_jobs_db()

def get_file_path_from_url(file_url: Optional[str]) -> Optional[str]:
    """Safely extracts disk file path from URL, stripping any ?t= query parameters."""
    if not file_url:
        return None
    clean_url = file_url.split("?")[0]
    return os.path.join(UPLOAD_DIR, os.path.basename(clean_url))

@router.post("/upload-manual")
async def upload_manual(
    request: Request,
    files: List[UploadFile] = File(...),
    customer_label: Optional[str] = Form(None)
):
    """
    Operator manual upload from desktop or incoming QR kiosk order loading.
    Creates a new job automatically with pending-review status.
    Auto-detects and splits combined front/back cards with 300 DPI quality enhancement!
    """
    job_id = str(uuid.uuid4())
    default_label = customer_label.strip() if (customer_label and customer_label.strip()) else "Manual Upload"
    job = PrintJob(id=job_id, customerLabel=default_label, documents=[], status="pending-review", combineMode="side-by-side")
    
    face_cascade = getattr(request.app.state, "face_cascade", None)
    
    for file in files:
        doc_id = str(uuid.uuid4())
        file_ext = os.path.splitext(file.filename)[1]
        save_name = f"{doc_id}{file_ext}"
        save_path = os.path.join(UPLOAD_DIR, save_name)
        
        # Save raw uncropped original file for manual crop adjustments
        raw_save_name = f"raw_{doc_id}{file_ext}"
        raw_save_path = os.path.join(UPLOAD_DIR, raw_save_name)
        
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        try:
            shutil.copyfile(save_path, raw_save_path)
        except Exception as e:
            print(f"Failed to copy raw upload file: {e}")
            
        # Process and auto-split file if dual-card
        card_results = process_upload_and_split(save_path, UPLOAD_DIR, face_cascade)
        
        for card in card_results:
            doc = PrintDocument(
                id=card["id"],
                fileUrl=f"/uploads/{card['save_name']}",
                rawFileUrl=f"/uploads/{raw_save_name}" if os.path.exists(raw_save_path) else f"/uploads/{card['save_name']}",
                cropQuad=card.get("cropQuad"),
                fileType=card["fileType"],
                jobType=card["jobType"],
                docTypeLabel=card.get("docTypeLabel"),
                extractedCode=card.get("extractedCode"),
                extractedText=card.get("extractedText"),
                side=card.get("side"),
                groupId=card.get("groupId"),
                status=card.get("status", "matched"),
                isDarkPage=card.get("isDarkPage", False),
                pageCount=card.get("pageCount", 1),
                lowConfidenceCrop=card.get("lowConfidenceCrop", False)
            )
            job.documents.append(doc)
            
            if not customer_label and card.get("docTypeLabel") and card.get("docTypeLabel") != "General Document":
                job.customerLabel = f"{card['docTypeLabel']} Print"
        
    # Group documents
    doc_dicts = [d.model_dump(mode="json") for d in job.documents]
    grouped_dicts = group_documents(doc_dicts)
    
    # Update documents with group info
    job.documents = [PrintDocument(**gd) for gd in grouped_dicts]

    # Priority 5: Auto-invert dark pages during ingestion if safe and enabled in settings
    if global_settings.autoInvertDarkPages:
        for doc in job.documents:
            if doc.isDarkPage and doc.fileType == "image" and doc.fileUrl:
                fp = get_file_path_from_url(doc.fileUrl)
                if fp and os.path.exists(fp) and analyze_invert_safety(fp):
                    if invert_page(fp, fp):
                        doc.isDarkPage = False
        
    # Check if we have any unmatched documents
    has_unmatched = any(getattr(d, "status", None) == "unmatched" for d in job.documents)
    
    job.status = "pending-review"
    jobs_db[job_id] = job
    save_jobs_db()
    
    # Auto-print trigger if enabled and no unmatched documents
    if global_settings.printMode == "auto" and not has_unmatched:
        return await execute_print_job(job_id)
        
    return JSONResponse({"success": True, "job": job.model_dump(mode="json")})

@router.get("/jobs")
async def get_jobs():
    """
    Returns all active print jobs for the queue.
    """
    if len(jobs_db) == 0:
        load_jobs_db()
    jobs_list = [j.model_dump(mode="json") for j in jobs_db.values()]
    # Sort by timestamp desc
    jobs_list.sort(key=lambda x: x["timestamp"], reverse=True)
    return JSONResponse({"success": True, "jobs": jobs_list})

@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    """
    Deletes a job from the queue and cleans up uploaded files.
    """
    if job_id not in jobs_db:
        load_jobs_db()
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
        
    job = jobs_db.pop(job_id)
    save_jobs_db()
    for doc in job.documents:
        if doc.fileUrl:
            file_path = get_file_path_from_url(doc.fileUrl)
            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception as e:
                    print(f"Failed to delete {file_path}: {e}")

    # Priority 2: Purge any preview files generated for this job
    preview_pattern = os.path.join(UPLOAD_DIR, f"preview_{job_id}_*")
    for prev_file in glob.glob(preview_pattern):
        try:
            if os.path.exists(prev_file):
                os.remove(prev_file)
        except Exception as e:
            print(f"Failed to delete preview file {prev_file}: {e}")
                    
    return JSONResponse({"success": True, "message": "Job deleted"})

@router.put("/jobs/{job_id}/combine-mode")
async def update_job_combine_mode(job_id: str, payload: dict):
    """
    Update the combine mode for a specific job ('side-by-side', 'stacked', or 'two-page').
    """
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
        
    mode = payload.get("combineMode")
    valid_modes = ["side-by-side", "stacked", "two-page", "single-page"]
    if mode not in valid_modes:
        raise HTTPException(status_code=400, detail="Invalid combine mode")
        
    jobs_db[job_id].combineMode = mode
    save_jobs_db()
    return JSONResponse({"success": True, "job": jobs_db[job_id].model_dump(mode="json")})

@router.get("/jobs/{job_id}/preview")
async def get_job_preview(job_id: str, combine_mode: Optional[str] = None):
    """
    Generates preview sheets for each group in the job and returns their image URLs.
    Correctly sizes ID Cards (CR80) vs Full A4 General Documents (Bank Passbooks, Marksheets, Certificates).
    """
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
        
    job = jobs_db[job_id]
    mode = combine_mode or job.combineMode or global_settings.defaultCombineMode or "side-by-side"
    
    groups = {}
    for doc in job.documents:
        gid = doc.groupId or "unassigned"
        if gid not in groups:
            groups[gid] = {"front": None, "back": None, "unclassified": []}
            
        if doc.side == "front":
            groups[gid]["front"] = doc
        elif doc.side == "back":
            groups[gid]["back"] = doc
        else:
            groups[gid]["unclassified"].append(doc)
            
    previews = []
    ts = int(datetime.now().timestamp())
    
    for gid, g in groups.items():
        front_doc = g["front"]
        back_doc = g["back"]
        
        front_path = get_file_path_from_url(front_doc.fileUrl) if front_doc and front_doc.fileUrl else None
        back_path = get_file_path_from_url(back_doc.fileUrl) if back_doc and back_doc.fileUrl else None
        
        if front_doc and back_doc:
            if mode == "two-page":
                # Duplex 2-Page mode: Generate Sheet 1 (Front) and Sheet 2 (Back) separately
                preview_front_name = f"preview_{job_id}_{gid}_page1_front.jpg"
                preview_front_path = os.path.join(UPLOAD_DIR, preview_front_name)
                # pyrefly: ignore [bad-argument-type]
                success_f = generate_single_print(front_path, preview_front_path, is_id_card=True)

                preview_back_name = f"preview_{job_id}_{gid}_page2_back.jpg"
                preview_back_path = os.path.join(UPLOAD_DIR, preview_back_name)
                # pyrefly: ignore [bad-argument-type]
                success_b = generate_single_print(back_path, preview_back_path, is_id_card=True)

                if success_f:
                    previews.append({
                        "groupId": gid,
                        "previewUrl": f"/uploads/{preview_front_name}?t={ts}",
                        "combineMode": mode,
                        "front": front_doc.model_dump(mode="json"),
                        "back": back_doc.model_dump(mode="json"),
                        "document": front_doc.model_dump(mode="json"),
                        "docTypeLabel": f"{front_doc.docTypeLabel or 'ID Card'} (Front)",
                        "side": "front",
                        "duplexSide": "Front",
                        "pageNumber": 1,
                        "type": "duplex-front"
                    })
                if success_b:
                    previews.append({
                        "groupId": gid,
                        "previewUrl": f"/uploads/{preview_back_name}?t={ts}",
                        "combineMode": mode,
                        "front": front_doc.model_dump(mode="json"),
                        "back": back_doc.model_dump(mode="json"),
                        "document": back_doc.model_dump(mode="json"),
                        "docTypeLabel": f"{back_doc.docTypeLabel or 'ID Card'} (Back)",
                        "side": "back",
                        "duplexSide": "Back",
                        "pageNumber": 2,
                        "type": "duplex-back"
                    })
            else:
                # Both front and back cards present (CR80 ID composite layout: Side-by-side or Stacked)
                preview_name = f"preview_{job_id}_{gid}_{mode}.jpg"
                preview_path = os.path.join(UPLOAD_DIR, preview_name)
                
                # pyrefly: ignore [bad-argument-type]
                success = generate_composite(front_path, back_path, preview_path, mode=mode)
                if success:
                    previews.append({
                        "groupId": gid,
                        "previewUrl": f"/uploads/{preview_name}?t={ts}",
                        "combineMode": mode,
                        "front": front_doc.model_dump(mode="json"),
                        "back": back_doc.model_dump(mode="json"),
                        "document": front_doc.model_dump(mode="json"),
                        "docTypeLabel": front_doc.docTypeLabel or "ID Card",
                        "type": "composite"
                    })
        elif front_doc or back_doc:
            # Single ID card side (e.g. Single PAN Card or single Aadhaar side)
            single_doc = front_doc or back_doc
            single_path = front_path or back_path
            preview_name = f"preview_single_card_{job_id}_{gid}.jpg"
            preview_path = os.path.join(UPLOAD_DIR, preview_name)
            
            # pyrefly: ignore [bad-argument-type]
            success = generate_single_print(single_path, preview_path, is_id_card=True)
            if success:
                previews.append({
                    "groupId": gid,
                    "previewUrl": f"/uploads/{preview_name}?t={ts}",
                    "combineMode": mode,
                    "front": single_doc.model_dump(mode="json"),
                    "back": None,
                    "document": single_doc.model_dump(mode="json"),
                    "docTypeLabel": single_doc.docTypeLabel or "ID Card",
                    "side": single_doc.side or "front",
                    "duplexSide": "Front" if mode == "two-page" else None,
                    "type": "single-card"
                })
                
        for u_idx, u_doc in enumerate(g["unclassified"]):
            u_path = get_file_path_from_url(u_doc.fileUrl) if u_doc.fileUrl else None
            preview_name = f"preview_fullpage_{u_doc.id}.jpg"
            preview_path = os.path.join(UPLOAD_DIR, preview_name)
            
            duplex_side = ("Front" if u_idx % 2 == 0 else "Back") if mode == "two-page" else None
            doc_label = u_doc.docTypeLabel or "Document"
            if duplex_side:
                doc_label = f"{doc_label} ({duplex_side})"
            
            if u_doc.fileType == "pdf" and u_path and os.path.exists(u_path):
                if render_pdf_first_page(u_path, preview_path):
                    previews.append({
                        "groupId": gid,
                        "previewUrl": f"/uploads/{preview_name}?t={ts}",
                        "document": u_doc.model_dump(mode="json"),
                        "docTypeLabel": doc_label,
                        "duplexSide": duplex_side,
                        "side": duplex_side.lower() if duplex_side else None,
                        "type": "pdf"
                    })
            elif u_path and os.path.exists(u_path):
                # Full page document (Bank Passbook, Marksheet, Stamp Paper, Certificate, Receipt)
                if generate_single_print(u_path, preview_path, is_id_card=False):
                    previews.append({
                        "groupId": gid,
                        "previewUrl": f"/uploads/{preview_name}?t={ts}",
                        "document": u_doc.model_dump(mode="json"),
                        "docTypeLabel": doc_label,
                        "duplexSide": duplex_side,
                        "side": duplex_side.lower() if duplex_side else None,
                        "type": "full-page"
                    })
                    
    return JSONResponse({"success": True, "previews": previews, "combineMode": mode, "job": job.model_dump(mode="json")})

@router.put("/jobs/{job_id}/status")
async def update_job_status(job_id: str, status: str):
    """
    Update job status. If printed, we can trigger metadata sync and cleanup.
    """
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
        
    valid_statuses = ["uploading", "pending-review", "printing", "printed", "failed", "waiting-flip"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
        
    jobs_db[job_id].status = status
    
    if status == "printed":
        for doc in jobs_db[job_id].documents:
            if doc.fileUrl:
                file_path = get_file_path_from_url(doc.fileUrl)
                if file_path and os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except Exception as e:
                        print(f"Failed to delete {file_path}: {e}")
                doc.extractedCode = "***MASKED***"

        # Priority 2: Purge any preview files generated for this job
        preview_pattern = os.path.join(UPLOAD_DIR, f"preview_{job_id}_*")
        for prev_file in glob.glob(preview_pattern):
            try:
                if os.path.exists(prev_file):
                    os.remove(prev_file)
            except Exception as e:
                print(f"Failed to delete preview file {prev_file}: {e}")
                
    return JSONResponse({"success": True, "job": jobs_db[job_id].model_dump(mode="json")})

@router.post("/jobs/{job_id}/documents/{doc_id}/invert")
async def invert_document(job_id: str, doc_id: str, force: bool = False):
    """
    Invert a dark page. Checks safety heuristic unless forced.
    """
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
        
    job = jobs_db[job_id]
    doc = next((d for d in job.documents if d.id == doc_id), None)
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    if doc.fileType != "image":
        raise HTTPException(status_code=400, detail="Only images can be inverted")
        
    file_path = get_file_path_from_url(doc.fileUrl)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
        
    if not force:
        is_safe = analyze_invert_safety(file_path)
        if not is_safe:
            return JSONResponse({
                "success": False, 
                "requires_force": True, 
                "message": "Heuristic check failed. Image may contain photos or stamps. Pass force=true to proceed."
            }, status_code=400)
            
    success = invert_page(file_path, file_path)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to invert image")
        
    doc.isDarkPage = False
    clean_url = doc.fileUrl.split("?")[0] if doc.fileUrl else ""
    doc.fileUrl = f"{clean_url}?t={int(datetime.now().timestamp())}"
    save_jobs_db()
    
    return JSONResponse({"success": True, "job": job.model_dump(mode="json")})

@router.post("/jobs/{job_id}/documents/{doc_id}/rotate")
async def rotate_document(job_id: str, doc_id: str, degrees: int = 90):
    """
    Rotates a document image 90, 180, or 270 degrees.
    Purges stale previews and updates cache-buster query.
    """
    if job_id not in jobs_db:
        load_jobs_db()
        
    job = jobs_db.get(job_id)
    if not job:
        # Fallback search by doc_id
        for j in jobs_db.values():
            if any(d.id == doc_id for d in j.documents):
                job = j
                job_id = j.id
                break
                
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    doc = next((d for d in job.documents if d.id == doc_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    if doc.fileType != "image":
        raise HTTPException(status_code=400, detail="Only images can be rotated")
        
    file_path = get_file_path_from_url(doc.fileUrl)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
        
    success = rotate_document_image(file_path, degrees=degrees)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to rotate image")
        
    filename = os.path.basename(file_path)
    # Invalidate cache query param so frontend immediately refreshes image
    doc.fileUrl = f"/uploads/{filename}?t={int(datetime.now().timestamp())}"

    if doc.rawFileUrl:
        raw_path = get_file_path_from_url(doc.rawFileUrl)
        if raw_path and os.path.exists(raw_path) and raw_path != file_path:
            rotate_document_image(raw_path, degrees=degrees)
            raw_filename = os.path.basename(raw_path)
            doc.rawFileUrl = f"/uploads/{raw_filename}?t={int(datetime.now().timestamp())}"

    save_jobs_db()
    
    # Purge stale preview files for this job
    preview_pattern = os.path.join(UPLOAD_DIR, f"preview_{job_id}_*")
    for prev_file in glob.glob(preview_pattern):
        try:
            if os.path.exists(prev_file):
                os.remove(prev_file)
        except Exception as e:
            print(f"Failed to delete preview file {prev_file}: {e}")
            
    return JSONResponse({"success": True, "job": job.model_dump(mode="json")})

@router.post("/jobs/{job_id}/documents/{doc_id}/enhance")
async def enhance_document(job_id: str, doc_id: str, payload: Optional[dict] = None):
    """
    Re-applies a chosen enhancement filter mode (magic-color, high-contrast, crisp-bw, natural).
    """
    if job_id not in jobs_db:
        load_jobs_db()
        
    job = jobs_db.get(job_id)
    if not job:
        for j in jobs_db.values():
            if any(d.id == doc_id for d in j.documents):
                job = j
                job_id = j.id
                break
                
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    doc = next((d for d in job.documents if d.id == doc_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    if doc.fileType != "image":
        raise HTTPException(status_code=400, detail="Only images can be enhanced")
        
    mode = (payload.get("mode") if payload else "magic-color") or "magic-color"
    file_path = get_file_path_from_url(doc.fileUrl)
    
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
        
    success = reapply_filter_to_document(file_path, mode=mode)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to enhance image")
        
    filename = os.path.basename(file_path)
    doc.fileUrl = f"/uploads/{filename}?t={int(datetime.now().timestamp())}"
    save_jobs_db()
    
    preview_pattern = os.path.join(UPLOAD_DIR, f"preview_{job_id}_*")
    for prev_file in glob.glob(preview_pattern):
        try:
            if os.path.exists(prev_file):
                os.remove(prev_file)
        except Exception as e:
            print(f"Failed to delete preview file {prev_file}: {e}")
            
    return JSONResponse({"success": True, "job": job.model_dump(mode="json")})

@router.post("/jobs/{job_id}/documents/{doc_id}/crop")
async def manual_crop_document(job_id: str, doc_id: str, payload: dict):
    """
    Manually crops and perspective-warps a document from its raw original image
    using 4 operator-adjusted corner points.
    Payload: {"quad": [[x0,y0], [x1,y1], [x2,y2], [x3,y3]], "mode": "magic-color"}
    """
    if job_id not in jobs_db:
        load_jobs_db()
        
    job = jobs_db.get(job_id)
    if not job:
        for j in jobs_db.values():
            if any(d.id == doc_id for d in j.documents):
                job = j
                job_id = j.id
                break
                
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    doc = next((d for d in job.documents if d.id == doc_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    if doc.fileType != "image":
        raise HTTPException(status_code=400, detail="Only image documents can be cropped")
        
    raw_path = get_file_path_from_url(doc.rawFileUrl) if doc.rawFileUrl else None
    if not raw_path or not os.path.exists(raw_path):
        raw_path = get_file_path_from_url(doc.fileUrl)
        
    if not raw_path or not os.path.exists(raw_path):
        raise HTTPException(status_code=404, detail="Original image not found on disk")
        
    raw_img = cv2.imread(raw_path)
    if raw_img is None:
        raise HTTPException(status_code=500, detail="Failed to load raw image")
        
    rh, rw = raw_img.shape[:2]
    quad = payload.get("quad")
    if not quad or len(quad) != 4:
        raise HTTPException(status_code=400, detail="Invalid quad points (must be 4 coordinates)")
        
    # Convert points: if given in normalized percentages (0.0 to 1.0), scale to pixels
    pts = np.array(quad, dtype=np.float32)
    if np.max(pts) <= 1.05:
        pts[:, 0] *= rw
        pts[:, 1] *= rh
        
    from app.services.print_studio_service import four_point_transform, enhance_scanned_document
    warped = four_point_transform(raw_img, pts)
    
    mode = payload.get("mode", "magic-color") or "magic-color"
    enhanced = enhance_scanned_document(warped, mode=mode)
    
    target_file = get_file_path_from_url(doc.fileUrl)
    if not target_file:
        target_file = os.path.join(UPLOAD_DIR, f"{doc.id}.jpg")
        
    cv2.imwrite(target_file, enhanced, [cv2.IMWRITE_JPEG_QUALITY, 96])
    
    # Invalidate cache query param so frontend immediately refreshes image
    filename = os.path.basename(target_file)
    doc.fileUrl = f"/uploads/{filename}?t={int(datetime.now().timestamp())}"
    doc.cropQuad = pts.tolist()
    doc.lowConfidenceCrop = False
    save_jobs_db()
    
    # Purge stale preview files for this job
    preview_pattern = os.path.join(UPLOAD_DIR, f"preview_{job_id}_*")
    for prev_file in glob.glob(preview_pattern):
        try:
            if os.path.exists(prev_file):
                os.remove(prev_file)
        except Exception as e:
            print(f"Failed to delete preview file {prev_file}: {e}")
            
    return JSONResponse({
        "success": True, 
        "job": job.model_dump(mode="json"), 
        "document": doc.model_dump(mode="json")
    })

@router.post("/jobs/{job_id}/print")
async def execute_print_job(job_id: str, printer_name: str = None):
    """
    Executes the print operation for a job.
    Composites matched documents and sends them to the OS printer.
    """
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
        
    p_name = printer_name or global_settings.printerName or get_default_printer()
    if not p_name:
        raise HTTPException(status_code=400, detail="No printer configured or detected. Please select a printer in Settings.")

    job = jobs_db[job_id]
    job_combine_mode = job.combineMode or global_settings.defaultCombineMode or "side-by-side"
    
    # Mark status as printing
    job.status = "printing"
    
    groups = {}
    for doc in job.documents:
        gid = doc.groupId or "unassigned"
        if gid not in groups:
            groups[gid] = {"front": None, "back": None, "unclassified": []}
            
        if doc.side == "front":
            groups[gid]["front"] = doc
        elif doc.side == "back":
            groups[gid]["back"] = doc
        else:
            groups[gid]["unclassified"].append(doc)
            
    requires_flip = False
    
    try:
        for gid, g in groups.items():
            front_doc = g["front"]
            back_doc = g["back"]
            
            front_path = get_file_path_from_url(front_doc.fileUrl) if front_doc and front_doc.fileUrl else None
            back_path = get_file_path_from_url(back_doc.fileUrl) if back_doc and back_doc.fileUrl else None
            
            if front_doc and back_doc:
                if job_combine_mode == "two-page":
                    if global_settings.duplexSupported:
                        output_name = f"duplex_{gid}.pdf"
                        output_path = os.path.join(UPLOAD_DIR, output_name)
                        if generate_multipage_pdf(front_path, back_path, output_path):
                            print_success = print_file(output_path, p_name)
                            if os.path.exists(output_path):
                                os.remove(output_path)
                            if not print_success:
                                job.status = "failed"
                                raise HTTPException(status_code=500, detail=f"Failed to dispatch duplex job to printer '{p_name}'. Please verify printer connection and settings.")
                    else:
                        requires_flip = True
                        if front_path:
                            output_name = f"single_{gid}_front.jpg"
                            output_path = os.path.join(UPLOAD_DIR, output_name)
                            if generate_single_print(front_path, output_path, is_id_card=True):
                                print_success = print_file(output_path, p_name)
                                if os.path.exists(output_path):
                                    os.remove(output_path)
                                if not print_success:
                                    job.status = "failed"
                                    raise HTTPException(status_code=500, detail=f"Failed to dispatch front page to printer '{p_name}'. Please verify printer connection and settings.")
                else:
                    output_name = f"composite_{gid}.jpg"
                    output_path = os.path.join(UPLOAD_DIR, output_name)
                    
                    if generate_composite(front_path, back_path, output_path, mode=job_combine_mode):
                        print_success = print_file(output_path, p_name)
                        if os.path.exists(output_path):
                            os.remove(output_path)
                        if not print_success:
                            job.status = "failed"
                            raise HTTPException(status_code=500, detail=f"Failed to dispatch composite print to printer '{p_name}'. Please verify printer connection and settings.")
            elif front_doc or back_doc:
                # Single ID Card Print
                single_path = front_path or back_path
                output_name = f"single_card_{gid}.jpg"
                output_path = os.path.join(UPLOAD_DIR, output_name)
                if generate_single_print(single_path, output_path, is_id_card=True):
                    print_success = print_file(output_path, p_name)
                    if os.path.exists(output_path):
                        os.remove(output_path)
                    if not print_success:
                        job.status = "failed"
                        raise HTTPException(status_code=500, detail=f"Failed to dispatch single card print to printer '{p_name}'. Please verify printer connection and settings.")
                        
            for u_doc in g["unclassified"]:
                u_path = get_file_path_from_url(u_doc.fileUrl) if u_doc.fileUrl else None
                if not u_path or not os.path.exists(u_path):
                    continue
                
                if u_doc.fileType == "pdf":
                    print_success = print_file(u_path, p_name)
                    if not print_success:
                        job.status = "failed"
                        raise HTTPException(status_code=500, detail=f"Failed to dispatch PDF document to printer '{p_name}'. Please verify printer connection and settings.")
                else:
                    output_name = f"single_doc_{u_doc.id}.jpg"
                    output_path = os.path.join(UPLOAD_DIR, output_name)
                    if generate_single_print(u_path, output_path, is_id_card=False):
                        print_success = print_file(output_path, p_name)
                        if os.path.exists(output_path):
                            os.remove(output_path)
                        if not print_success:
                            job.status = "failed"
                            raise HTTPException(status_code=500, detail=f"Failed to dispatch single document print to printer '{p_name}'. Please verify printer connection and settings.")
                            
        if requires_flip:
            return await update_job_status(job_id, "waiting-flip")
            
        return await update_job_status(job_id, "printed")
    except HTTPException:
        raise
    except Exception as e:
        job.status = "failed"
        raise HTTPException(status_code=500, detail=f"Print failed: {str(e)}")


@router.post("/jobs/{job_id}/print-backs")
async def execute_print_backs(job_id: str, printer_name: str = None):
    """
    Executes the print operation for back pages after manual flip.
    """
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
        
    p_name = printer_name or global_settings.printerName or get_default_printer()
    if not p_name:
        raise HTTPException(status_code=400, detail="No printer configured.")
        
    job = jobs_db[job_id]
    if job.status != "waiting-flip":
        raise HTTPException(status_code=400, detail="Job is not waiting for a flip.")
        
    for doc in job.documents:
        if doc.side == "back" and doc.groupId:
            back_path = get_file_path_from_url(doc.fileUrl)
            output_name = f"single_{doc.groupId}_back.jpg"
            output_path = os.path.join(UPLOAD_DIR, output_name)
            
            if back_path and generate_single_print(back_path, output_path):
                print_success = print_file(output_path, p_name)
                if os.path.exists(output_path):
                    os.remove(output_path)
                if not print_success:
                    job.status = "failed"
                    raise HTTPException(status_code=500, detail=f"Failed to dispatch back page to printer '{p_name}'. Please verify printer connection.")
                    
    return await update_job_status(job_id, "printed")

@router.get("/printers")
async def get_printers():
    """Returns a list of available printer names from the OS, plus default printer."""
    try:
        flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        printers = win32print.EnumPrinters(flags)
        printer_names = [p[2] for p in printers]
        default_printer = get_default_printer()
        return JSONResponse({
            "success": True, 
            "printers": printer_names,
            "defaultPrinter": default_printer
        })
    except Exception as e:
        print(f"Error enumerating printers: {e}")
        return JSONResponse({"success": False, "printers": [], "defaultPrinter": ""})

@router.get("/settings")
async def get_settings():
    """Returns current print settings."""
    return JSONResponse({"success": True, "settings": global_settings.model_dump()})

@router.put("/settings")
async def update_settings(settings: PrintSettings):
    """Updates and persists print settings."""
    global global_settings
    global_settings = settings
    save_settings(global_settings)
    return JSONResponse({"success": True, "settings": global_settings.model_dump()})

@router.put("/jobs/{job_id}/documents/{doc_id}/pair")
async def pair_document(job_id: str, doc_id: str, payload: dict):
    """
    Manually pair an unmatched back document with a target front document's groupId.
    payload expects: {"target_group_id": "string"}
    """
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
        
    job = jobs_db[job_id]
    doc = next((d for d in job.documents if d.id == doc_id), None)
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    target_group_id = payload.get("target_group_id")
    if not target_group_id:
        raise HTTPException(status_code=400, detail="target_group_id is required")
        
    doc.groupId = target_group_id
    doc.status = "matched"
    save_jobs_db()
    
    return JSONResponse({"success": True, "job": job.model_dump(mode="json")})

