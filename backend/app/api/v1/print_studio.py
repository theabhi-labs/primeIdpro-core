from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from fastapi.responses import JSONResponse
import uuid
import os
import shutil
from typing import List, Optional
from datetime import datetime

from app.core.config import UPLOAD_DIR
from app.models.print_studio_models import PrintJob, PrintDocument
from app.services.print_studio_service import process_upload_and_split, group_documents, analyze_invert_safety, invert_page
from app.services.print_layout_service import generate_composite, generate_single_print, generate_multipage_pdf, render_pdf_first_page
from app.services.printer_service import print_file, get_default_printer
from app.services.settings_service import global_settings, save_settings
from app.models.print_studio_models import PrintSettings
import win32print

router = APIRouter(prefix="/print-studio", tags=["Print Studio"])

# In-memory storage for jobs
jobs_db = {}

@router.post("/upload-manual")
async def upload_manual(request: Request, files: List[UploadFile] = File(...)):
    """
    Operator manual upload from desktop.
    Creates a new job automatically with pending-review status.
    Auto-detects and splits combined front/back cards with 300 DPI quality enhancement!
    """
    job_id = str(uuid.uuid4())
    job = PrintJob(id=job_id, customerLabel="Manual Upload", documents=[], status="pending-review", combineMode="side-by-side")
    
    face_cascade = getattr(request.app.state, "face_cascade", None)
    
    for file in files:
        doc_id = str(uuid.uuid4())
        file_ext = os.path.splitext(file.filename)[1]
        save_name = f"{doc_id}{file_ext}"
        save_path = os.path.join(UPLOAD_DIR, save_name)
        
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Process and auto-split file if dual-card
        card_results = process_upload_and_split(save_path, UPLOAD_DIR, face_cascade)
        
        for card in card_results:
            doc = PrintDocument(
                id=card["id"],
                fileUrl=f"/uploads/{card['save_name']}",
                fileType=card["fileType"],
                jobType=card["jobType"],
                docTypeLabel=card.get("docTypeLabel"),
                extractedCode=card.get("extractedCode"),
                extractedText=card.get("extractedText"),
                side=card.get("side"),
                groupId=card.get("groupId"),
                status=card.get("status", "matched"),
                isDarkPage=card.get("isDarkPage", False),
                pageCount=card.get("pageCount", 1)
            )
            job.documents.append(doc)
            
            if card.get("docTypeLabel") and card.get("docTypeLabel") != "General Document":
                job.customerLabel = f"{card['docTypeLabel']} Print"
        
    # Group documents
    doc_dicts = [d.model_dump(mode="json") for d in job.documents]
    grouped_dicts = group_documents(doc_dicts)
    
    # Update documents with group info
    job.documents = [PrintDocument(**gd) for gd in grouped_dicts]
        
    # Check if we have any unmatched documents
    has_unmatched = any(getattr(d, "status", None) == "unmatched" for d in job.documents)
    
    job.status = "pending-review"
    jobs_db[job_id] = job
    
    # Auto-print trigger if enabled and no unmatched documents
    if global_settings.printMode == "auto" and not has_unmatched:
        return await execute_print_job(job_id)
        
    return JSONResponse({"success": True, "job": job.model_dump(mode="json")})

@router.get("/jobs")
async def get_jobs():
    """
    Returns all active print jobs for the queue.
    """
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
        raise HTTPException(status_code=404, detail="Job not found")
        
    job = jobs_db.pop(job_id)
    for doc in job.documents:
        if doc.fileUrl:
            filename = os.path.basename(doc.fileUrl)
            file_path = os.path.join(UPLOAD_DIR, filename)
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception as e:
                    print(f"Failed to delete {file_path}: {e}")
                    
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
    return JSONResponse({"success": True, "job": jobs_db[job_id].model_dump(mode="json")})

@router.get("/jobs/{job_id}/preview")
async def get_job_preview(job_id: str, combine_mode: Optional[str] = None):
    """
    Generates preview sheets for each group in the job and returns their image URLs.
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
    
    for gid, g in groups.items():
        front_doc = g["front"]
        back_doc = g["back"]
        
        front_path = os.path.join(UPLOAD_DIR, os.path.basename(front_doc.fileUrl)) if front_doc and front_doc.fileUrl else None
        back_path = os.path.join(UPLOAD_DIR, os.path.basename(back_doc.fileUrl)) if back_doc and back_doc.fileUrl else None
        
        if front_doc or back_doc:
            preview_name = f"preview_{job_id}_{gid}_{mode}.jpg"
            preview_path = os.path.join(UPLOAD_DIR, preview_name)
            
            success = generate_composite(front_path, back_path, preview_path, mode=mode)
            if success:
                previews.append({
                    "groupId": gid,
                    "previewUrl": f"/uploads/{preview_name}",
                    "combineMode": mode,
                    "front": front_doc.model_dump(mode="json") if front_doc else None,
                    "back": back_doc.model_dump(mode="json") if back_doc else None,
                    "docTypeLabel": (front_doc.docTypeLabel if front_doc else (back_doc.docTypeLabel if back_doc else "ID Document")),
                    "type": "composite"
                })
                
        for u_doc in g["unclassified"]:
            u_path = os.path.join(UPLOAD_DIR, os.path.basename(u_doc.fileUrl)) if u_doc.fileUrl else None
            preview_name = f"preview_single_{u_doc.id}.jpg"
            preview_path = os.path.join(UPLOAD_DIR, preview_name)
            
            if u_doc.fileType == "pdf" and u_path and os.path.exists(u_path):
                if render_pdf_first_page(u_path, preview_path):
                    previews.append({
                        "groupId": gid,
                        "previewUrl": f"/uploads/{preview_name}",
                        "document": u_doc.model_dump(mode="json"),
                        "docTypeLabel": u_doc.docTypeLabel or "PDF Document",
                        "type": "pdf"
                    })
            elif u_path and os.path.exists(u_path):
                if generate_single_print(u_path, preview_path):
                    previews.append({
                        "groupId": gid,
                        "previewUrl": f"/uploads/{preview_name}",
                        "document": u_doc.model_dump(mode="json"),
                        "docTypeLabel": u_doc.docTypeLabel or "General Document",
                        "type": "single"
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
                filename = os.path.basename(doc.fileUrl)
                file_path = os.path.join(UPLOAD_DIR, filename)
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except Exception as e:
                        print(f"Failed to delete {file_path}: {e}")
                doc.extractedCode = "***MASKED***"
                
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
        
    filename = os.path.basename(doc.fileUrl)
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    if not os.path.exists(file_path):
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
    
    return JSONResponse({"success": True, "job": job.model_dump(mode="json")})

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
            
            front_path = os.path.join(UPLOAD_DIR, os.path.basename(front_doc.fileUrl)) if front_doc and front_doc.fileUrl else None
            back_path = os.path.join(UPLOAD_DIR, os.path.basename(back_doc.fileUrl)) if back_doc and back_doc.fileUrl else None
            
            if front_doc or back_doc:
                if job_combine_mode == "two-page":
                    if global_settings.duplexSupported:
                        output_name = f"duplex_{gid}.pdf"
                        output_path = os.path.join(UPLOAD_DIR, output_name)
                        if generate_multipage_pdf(front_path, back_path, output_path):
                            print_file(output_path, p_name)
                            if os.path.exists(output_path):
                                os.remove(output_path)
                    else:
                        requires_flip = True
                        if front_path:
                            output_name = f"single_{gid}_front.jpg"
                            output_path = os.path.join(UPLOAD_DIR, output_name)
                            if generate_single_print(front_path, output_path):
                                print_file(output_path, p_name)
                                if os.path.exists(output_path):
                                    os.remove(output_path)
                else:
                    output_name = f"composite_{gid}.jpg"
                    output_path = os.path.join(UPLOAD_DIR, output_name)
                    
                    if generate_composite(front_path, back_path, output_path, mode=job_combine_mode):
                        print_file(output_path, p_name)
                        if os.path.exists(output_path):
                            os.remove(output_path)
                        
            for u_doc in g["unclassified"]:
                u_path = os.path.join(UPLOAD_DIR, os.path.basename(u_doc.fileUrl)) if u_doc.fileUrl else None
                if not u_path or not os.path.exists(u_path):
                    continue
                
                if u_doc.fileType == "pdf":
                    print_file(u_path, p_name)
                else:
                    output_name = f"single_{u_doc.id}.jpg"
                    output_path = os.path.join(UPLOAD_DIR, output_name)
                    if generate_single_print(u_path, output_path):
                        print_file(output_path, p_name)
                        if os.path.exists(output_path):
                            os.remove(output_path)
                            
        if requires_flip:
            return await update_job_status(job_id, "waiting-flip")
            
        return await update_job_status(job_id, "printed")
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
            back_path = os.path.join(UPLOAD_DIR, os.path.basename(doc.fileUrl))
            output_name = f"single_{doc.groupId}_back.jpg"
            output_path = os.path.join(UPLOAD_DIR, output_name)
            
            if generate_single_print(back_path, output_path):
                print_file(output_path, p_name)
                if os.path.exists(output_path):
                    os.remove(output_path)
                    
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
    
    return JSONResponse({"success": True, "job": job.model_dump(mode="json")})

