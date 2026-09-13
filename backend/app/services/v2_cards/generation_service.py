import asyncio
import logging
from typing import Dict, Any, List
from datetime import datetime
from app.core.dependencies import get_db_instance
from app.models.card_studio_v2 import V2GenerationJob, V2Record
from app.services.v2_cards.a4_layout_engine import calculate_layout
from app.services.v2_cards.card_renderer import render_card_html
from app.services.v2_cards.pdf_generator import generate_a4_pdf

logger = logging.getLogger("primeidpro.v2_cards.generation")

async def _process_generation_job_background(job_id: str, db_name: str = "primeidpro"):
    """
    Background task to process a V2 generation job.
    Uses bounded batches to avoid loading all records/photos into memory.
    """
    try:
        from app.core.database import client
        db = client[db_name]
        
        job_doc = await db.v2_card_jobs.find_one({"job_id": job_id})
        if not job_doc:
            return
            
        job = V2GenerationJob(**job_doc)
        
        # Mark as processing
        await db.v2_card_jobs.update_one(
            {"job_id": job_id},
            {"$set": {"status": "PROCESSING", "started_at": datetime.utcnow(), "heartbeat_at": datetime.utcnow()}}
        )
        
        # Fetch template
        template = job.template_snapshot
        
        # Calculate layout limits
        layout_cfg = job.layout.dict()
        card_w = template.get("width", 85.6)
        card_h = template.get("height", 53.98)
        
        try:
            calc = calculate_layout(
                page_width_mm=layout_cfg["paper"] == "A4" and (297 if layout_cfg["orientation"] == "landscape" else 210) or 210,
                page_height_mm=layout_cfg["paper"] == "A4" and (210 if layout_cfg["orientation"] == "landscape" else 297) or 297,
                margin_top_mm=layout_cfg["margin_top_mm"],
                margin_right_mm=layout_cfg["margin_right_mm"],
                margin_bottom_mm=layout_cfg["margin_bottom_mm"],
                margin_left_mm=layout_cfg["margin_left_mm"],
                card_width_mm=card_w,
                card_height_mm=card_h,
                gap_x_mm=layout_cfg["gap_x_mm"],
                gap_y_mm=layout_cfg["gap_y_mm"]
            )
        except Exception as e:
            await db.v2_card_jobs.update_one(
                {"job_id": job_id},
                {"$set": {"status": "FAILED", "error_summary": [{"record_id": "all", "reason": str(e)}], "completed_at": datetime.utcnow()}}
            )
            return

        batch_size = 50
        rendered_htmls = []
        error_summary = []
        completed = 0
        failed = 0
        
        # Process in chunks
        for i in range(0, len(job.record_ids), batch_size):
            batch_ids = job.record_ids[i:i+batch_size]
            
            # Fetch records
            cursor = db.v2_card_records.find({
                "id": {"$in": batch_ids},
                "project_id": job.project_id,
                "organization_id": job.organization_id
            })
            records = await cursor.to_list(length=batch_size)
            
            # Map for O(1) lookup
            record_map = {r["id"]: r for r in records}
            
            for r_id in batch_ids:
                r_doc = record_map.get(r_id)
                if not r_doc:
                    failed += 1
                    error_summary.append({"record_id": r_id, "reason": "Record not found or unauthorized"})
                    continue
                    
                if r_doc.get("status") != "ready":
                    failed += 1
                    error_summary.append({"record_id": r_id, "reason": "Record is not READY"})
                    continue
                    
                try:
                    # Render
                    card_html = render_card_html(
                        template=template,
                        record_data=r_doc.get("data", {}),
                        organization_id=job.organization_id,
                        project_id=job.project_id
                    )
                    rendered_htmls.append(card_html)
                    completed += 1
                except Exception as e:
                    failed += 1
                    error_summary.append({"record_id": r_id, "reason": f"Render error: {str(e)}"})
            
        # Update progress and heartbeat
            await db.v2_card_jobs.update_one(
                {"job_id": job_id},
                {"$set": {"completed": completed, "failed": failed, "heartbeat_at": datetime.utcnow()}}
            )
            
        # PDF Generation
        if completed > 0:
            try:
                pdf_path = generate_a4_pdf(rendered_htmls, calc)
                final_status = "COMPLETED" if failed == 0 else "PARTIAL"
                await db.v2_card_jobs.update_one(
                    {"job_id": job_id},
                    {"$set": {
                        "status": final_status,
                        "pdf_path": pdf_path,
                        "error_summary": error_summary,
                        "completed_at": datetime.utcnow()
                    }}
                )
            except Exception as e:
                await db.v2_card_jobs.update_one(
                    {"job_id": job_id},
                    {"$set": {
                        "status": "FAILED",
                        "error_summary": error_summary + [{"record_id": "pdf", "reason": f"PDF Generation Error: {str(e)}"}],
                        "completed_at": datetime.utcnow()
                    }}
                )
        else:
            await db.v2_card_jobs.update_one(
                {"job_id": job_id},
                {"$set": {
                    "status": "FAILED",
                    "error_summary": error_summary,
                    "completed_at": datetime.utcnow()
                }}
            )
            
    except Exception as e:
        logger.exception("V2 Job processing failed catastrophically")
        # Try to mark failed
        try:
            from app.core.database import client
            db = client[db_name]
            await db.v2_card_jobs.update_one(
                {"job_id": job_id, "status": "PROCESSING"},
                {"$set": {"status": "FAILED", "error_summary": [{"record_id": "sys", "reason": "Internal worker error"}], "completed_at": datetime.utcnow()}}
            )
        except:
            pass

async def start_generation_job(job_id: str, db_name: str):
    """
    Entry point for the background task.
    """
    asyncio.create_task(_process_generation_job_background(job_id, db_name))

async def recover_stale_jobs(db):
    """
    Find and recover generation jobs that are stuck in PROCESSING state due to unexpected shutdown.
    """
    from datetime import datetime, timedelta
    cutoff = datetime.utcnow() - timedelta(minutes=5)
    
    # Jobs are stale if:
    # 1. status is PROCESSING
    # 2. heartbeat_at is older than cutoff OR (heartbeat_at is missing and started_at is older than cutoff)
    query = {
        "status": "PROCESSING",
        "$or": [
            {"heartbeat_at": {"$lt": cutoff}},
            {"heartbeat_at": None, "started_at": {"$lt": cutoff}}
        ]
    }
    
    stale_jobs = await db.v2_card_jobs.find(query).to_list(length=100)
    recovered = 0
    for job in stale_jobs:
        # Atomic update to ensure it's still PROCESSING
        res = await db.v2_card_jobs.update_one(
            {"job_id": job["job_id"], "status": "PROCESSING"},
            {"$set": {
                "status": "FAILED",
                "completed_at": datetime.utcnow()
            },
            "$push": {
                "error_summary": {"record_id": "sys", "reason": "Generation job interrupted because the processing worker stopped unexpectedly."}
            }}
        )
        if res.modified_count > 0:
            recovered += 1
            
    if recovered > 0:
        logger.info(f"Recovered {recovered} stale generation jobs.")
