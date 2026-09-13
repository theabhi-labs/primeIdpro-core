from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.dependencies import get_db_instance, get_current_user
from app.models.card_studio_v2 import V2UserContext, V2GenerationRequest, V2GenerationJob, V2Project
from app.services.v2_cards.generation_service import start_generation_job
from fastapi.responses import FileResponse
import os

generation_router = APIRouter(tags=["V2 Generation"])

@generation_router.post("/projects/{project_id}/generation-jobs")
async def create_generation_job(
    project_id: str,
    request: V2GenerationRequest,
    background_tasks: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    """
    Creates a new bulk generation job for the given project and records.
    """
    if not request.record_ids:
        raise HTTPException(status_code=400, detail="No records selected.")
        
    # Verify Project
    project_doc = await db.v2_card_projects.find_one({
        "id": project_id, 
        "organization_id": user.organization_id
    })
    if not project_doc:
        raise HTTPException(status_code=404, detail="Project not found.")
        
    project = V2Project(**project_doc)
    if not project.snapshot_schema:
        raise HTTPException(status_code=400, detail="Project template snapshot is missing.")
        
    # Create Job
    job = V2GenerationJob(
        organization_id=user.organization_id,
        project_id=project_id,
        record_ids=request.record_ids,
        layout=request.layout,
        template_snapshot=project.snapshot_schema,
        status="QUEUED",
        total=len(request.record_ids),
        created_by=user.user_id
    )
    
    await db.v2_card_jobs.insert_one(job.dict())
    
    # We pass the db name implicitly or explicitly
    db_name = db.name
    # Trigger background
    background_tasks.add_task(start_generation_job, job.job_id, db_name)
    
    return {"job_id": job.job_id, "status": "QUEUED"}


@generation_router.get("/generation-jobs/{job_id}")
async def get_generation_job(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    """
    Gets the status and progress of a generation job.
    """
    job_doc = await db.v2_card_jobs.find_one({
        "job_id": job_id,
        "organization_id": user.organization_id
    })
    
    if not job_doc:
        raise HTTPException(status_code=404, detail="Job not found.")
        
    # Remove large template data from response
    if "template_snapshot" in job_doc:
        del job_doc["template_snapshot"]
    if "_id" in job_doc:
        del job_doc["_id"]
        
    return job_doc


@generation_router.get("/generation-jobs/{job_id}/pdf")
async def download_generation_pdf(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    """
    Securely downloads the generated PDF.
    """
    job_doc = await db.v2_card_jobs.find_one({
        "job_id": job_id,
        "organization_id": user.organization_id
    })
    
    if not job_doc:
        raise HTTPException(status_code=404, detail="Job not found.")
        
    if job_doc.get("status") not in ["COMPLETED", "PARTIAL"]:
        raise HTTPException(status_code=400, detail="Job has no PDF output ready.")
        
    pdf_path = job_doc.get("pdf_path")
    if not pdf_path or not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF file not found on disk.")
        
    return FileResponse(
        pdf_path, 
        media_type="application/pdf", 
        filename=f"Cards_{job_doc['project_id']}_{job_id[-8:]}.pdf"
    )
