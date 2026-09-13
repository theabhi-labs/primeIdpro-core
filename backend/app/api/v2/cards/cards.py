import hashlib
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

from app.core.dependencies import get_current_user, get_db_instance
from app.models.card_studio_v2 import (
    V2UserContext,
    V2Template,
    V2Project,
    V2Record,
    V2CollectionLink,
    V2Photo
)
import os
import shutil
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

cards_v2_router = APIRouter()


def get_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ---------------------------------------------------------
# TEMPLATES
# ---------------------------------------------------------
@cards_v2_router.get("/templates", response_model=List[V2Template])
async def list_templates(
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0)
):
    """List templates belonging to the user's organization."""
    cursor = db.v2_card_templates.find({"organization_id": user.organization_id}).skip(skip).limit(limit)
    templates = await cursor.to_list(length=limit)
    return [V2Template(**t) for t in templates]


@cards_v2_router.post("/templates", response_model=V2Template)
async def create_template(
    template: V2Template,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    """Create a new template."""
    template.organization_id = user.organization_id
    template.created_by = user.user_id
    template.updated_by = user.user_id
    
    # Validation: Ensure binds point to valid fields
    field_keys = {f.key for f in template.field_schema}
    for el in template.elements:
        if el.bind and el.bind not in field_keys:
            raise HTTPException(
                status_code=422,
                detail=f"Element bind '{el.bind}' does not match any field_schema key."
            )
            
    # Check duplicate IDs inside elements
    el_ids = [el.id for el in template.elements]
    if len(el_ids) != len(set(el_ids)):
        raise HTTPException(status_code=422, detail="Duplicate element IDs are not allowed.")

    template_dict = template.model_dump()
    await db.v2_card_templates.insert_one(template_dict)
    return template


@cards_v2_router.get("/templates/{template_id}", response_model=V2Template)
async def get_template(
    template_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    doc = await db.v2_card_templates.find_one({"id": template_id, "organization_id": user.organization_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
    return V2Template(**doc)


@cards_v2_router.put("/templates/{template_id}", response_model=V2Template)
async def update_template(
    template_id: str,
    template_update: V2Template,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    """Update an existing template."""
    # 1. Verify existence and ownership
    doc = await db.v2_card_templates.find_one({"id": template_id, "organization_id": user.organization_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
        
    # 2. Prevent changing ID/org/etc
    template_update.id = template_id
    template_update.organization_id = user.organization_id
    template_update.created_by = doc.get("created_by")
    template_update.created_at = doc.get("created_at")
    template_update.updated_by = user.user_id
    template_update.updated_at = datetime.utcnow()
    
    # 3. Validation
    field_keys = {f.key for f in template_update.field_schema}
    for el in template_update.elements:
        if el.bind and el.bind not in field_keys:
            raise HTTPException(
                status_code=422,
                detail=f"Element bind '{el.bind}' does not match any field_schema key."
            )
            
    el_ids = [el.id for el in template_update.elements]
    if len(el_ids) != len(set(el_ids)):
        raise HTTPException(status_code=422, detail="Duplicate element IDs are not allowed.")

    # 4. Save
    await db.v2_card_templates.replace_one(
        {"id": template_id, "organization_id": user.organization_id},
        template_update.model_dump()
    )
    
    return template_update


@cards_v2_router.post("/templates/{template_id}/duplicate", response_model=V2Template)
async def duplicate_template(
    template_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    """Duplicate an existing template."""
    doc = await db.v2_card_templates.find_one({"id": template_id, "organization_id": user.organization_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
        
    template = V2Template(**doc)
    template.id = str(uuid.uuid4())
    template.name = f"{template.name} (Copy)"
    template.created_at = datetime.utcnow()
    template.updated_at = datetime.utcnow()
    template.created_by = user.user_id
    template.updated_by = user.user_id
    
    # generate new element IDs so they are completely independent
    for el in template.elements:
        el.id = str(uuid.uuid4())
        
    await db.v2_card_templates.insert_one(template.model_dump())
    return template


@cards_v2_router.post("/templates/{template_id}/archive")
async def archive_template(
    template_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    """Archive an existing template."""
    res = await db.v2_card_templates.update_one(
        {"id": template_id, "organization_id": user.organization_id},
        {"$set": {"active": False, "updated_at": datetime.utcnow(), "updated_by": user.user_id}}
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=404, detail="Template not found or already archived")
    return {"success": True}



# ---------------------------------------------------------
# PROJECTS
# ---------------------------------------------------------
@cards_v2_router.get("/projects", response_model=List[V2Project])
async def list_projects(
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0)
):
    """List projects belonging to the user's organization."""
    cursor = db.v2_card_projects.find({"organization_id": user.organization_id}).sort("created_at", -1).skip(skip).limit(limit)
    projects = await cursor.to_list(length=limit)
    return [V2Project(**p) for p in projects]


@cards_v2_router.post("/projects", response_model=V2Project)
async def create_project(
    project_create: V2Project,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    """Create a project by snapshotting a template."""
    template_doc = await db.v2_card_templates.find_one({
        "id": project_create.template_id,
        "organization_id": user.organization_id
    })
    
    if not template_doc:
        raise HTTPException(status_code=404, detail="Template not found or unauthorized.")
        
    template = V2Template(**template_doc)
    
    project_create.organization_id = user.organization_id
    project_create.created_by = user.user_id
    project_create.updated_by = user.user_id
    
    # IMMUTABLE SNAPSHOT
    project_create.snapshot_schema = {
        "schema_version": template.schema_version,
        "width": template.width,
        "height": template.height,
        "unit": template.unit,
        "dpi": template.dpi,
        "elements": [el.model_dump() for el in template.elements]
    }
    project_create.field_schema = template.field_schema
    
    project_dict = project_create.model_dump()
    await db.v2_card_projects.insert_one(project_dict)
    return project_create


@cards_v2_router.get("/projects/{project_id}", response_model=V2Project)
async def get_project(
    project_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    doc = await db.v2_card_projects.find_one({"id": project_id, "organization_id": user.organization_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    return V2Project(**doc)


@cards_v2_router.get("/projects/{project_id}/summary")
async def get_project_summary(
    project_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    """Get count of records by status for a project."""
    doc = await db.v2_card_projects.find_one({"id": project_id, "organization_id": user.organization_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    pipeline = [
        {"$match": {"project_id": project_id, "organization_id": user.organization_id}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    cursor = db.v2_card_records.aggregate(pipeline)
    results = await cursor.to_list(length=None)
    
    summary = {"total": 0, "draft": 0, "ready": 0, "printed": 0}
    for r in results:
        status = r["_id"]
        count = r["count"]
        if status in summary:
            summary[status] = count
        summary["total"] += count
        
    return summary


# ---------------------------------------------------------
# RECORDS
# ---------------------------------------------------------
def _validate_record_data(data: dict, field_schema: list):
    """Validates record data against the project field schema."""
    schema_map = {f.key: f for f in field_schema}
    
    for key, value in data.items():
        if key not in schema_map:
            raise HTTPException(status_code=422, detail=f"Unknown field '{key}'.")
            
    for f in field_schema:
        if f.required and (f.key not in data or data[f.key] is None or data[f.key] == ""):
            raise HTTPException(status_code=422, detail=f"Required field '{f.key}' is missing or empty.")
            
        if f.key in data and data[f.key] is not None and data[f.key] != "":
            val = data[f.key]
            # Basic type validation
            if f.data_type == "text" and not isinstance(val, str):
                raise HTTPException(status_code=422, detail=f"Field '{f.key}' must be text.")
            if f.data_type == "number" and not isinstance(val, (int, float)):
                raise HTTPException(status_code=422, detail=f"Field '{f.key}' must be a number.")
            if f.data_type == "boolean" and not isinstance(val, bool):
                raise HTTPException(status_code=422, detail=f"Field '{f.key}' must be a boolean.")
            if f.data_type in ("email", "phone", "url", "date", "image") and not isinstance(val, str):
                raise HTTPException(status_code=422, detail=f"Field '{f.key}' ({f.data_type}) must be a string representation.")
            if f.data_type == "email" and "@" not in val:
                raise HTTPException(status_code=422, detail=f"Field '{f.key}' must be a valid email.")
            if f.data_type == "url" and not val.startswith(("http://", "https://")):
                raise HTTPException(status_code=422, detail=f"Field '{f.key}' must be a valid URL starting with http:// or https://.")


@cards_v2_router.post("/projects/{project_id}/records", response_model=V2Record)
async def create_record(
    project_id: str,
    record: V2Record,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    """Creates a record in a project, ensuring tenant isolation."""
    # 1. Load project to verify ownership and get schema
    project_doc = await db.v2_card_projects.find_one({
        "id": project_id,
        "organization_id": user.organization_id
    })
    
    if not project_doc:
        raise HTTPException(status_code=404, detail="Project not found")
        
    project = V2Project(**project_doc)
    
    # 2. Validate data
    if record.status == "ready":
        _validate_record_data(record.data, project.field_schema)
        record.validation_status = "valid"
    else:
        # For DRAFT, validate structurally but don't enforce 'required'
        temp_schema = [f.model_copy(update={"required": False}) for f in project.field_schema]
        _validate_record_data(record.data, temp_schema)
        record.validation_status = "pending"
    
    # 3. Create
    record.organization_id = user.organization_id
    record.project_id = project_id
    
    record_dict = record.model_dump()
    await db.v2_card_records.insert_one(record_dict)
    return record


@cards_v2_router.get("/projects/{project_id}/records")
async def list_records(
    project_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
    search: Optional[str] = None,
    status: Optional[str] = None,
    sort: Optional[str] = Query("updated_desc")
):
    # Verify project access
    proj_doc = await db.v2_card_projects.find_one({"id": project_id, "organization_id": user.organization_id})
    if not proj_doc:
        raise HTTPException(status_code=404, detail="Project not found")
        
    project = V2Project(**proj_doc)

    query = {"project_id": project_id, "organization_id": user.organization_id}
    
    if status and status != "all":
        query["status"] = status
        
    if search:
        # Search against searchable text fields
        searchable_fields = [f.key for f in project.field_schema if f.data_type in ["text", "email", "phone"]]
        import re
        safe_search = re.escape(search)
        
        if searchable_fields:
            or_conditions = []
            for field in searchable_fields:
                or_conditions.append({f"data.{field}": {"$regex": safe_search, "$options": "i"}})
            if "status" in query:
                query = {"$and": [{"status": query["status"], "project_id": project_id, "organization_id": user.organization_id}, {"$or": or_conditions}]}
            else:
                query["$or"] = or_conditions
        
    sort_opts = [("updated_at", -1)]
    
    # Determine primary text field for "name" sorting
    primary_field = None
    for f in project.field_schema:
        if f.data_type == "text":
            primary_field = f.key
            break
            
    if sort == "updated_asc":
        sort_opts = [("updated_at", 1)]
    elif sort == "important_first":
        sort_opts = [("important", -1), ("updated_at", -1)]
    elif sort == "name_asc" and primary_field:
        sort_opts = [(f"data.{primary_field}", 1), ("updated_at", -1)]
    elif sort == "name_desc" and primary_field:
        sort_opts = [(f"data.{primary_field}", -1), ("updated_at", -1)]

    cursor = db.v2_card_records.find(query).sort(sort_opts).skip(skip).limit(limit)
    records = await cursor.to_list(length=limit)
    total = await db.v2_card_records.count_documents(query)
    
    return {
        "limit": limit,
        "skip": skip,
        "total": total,
        "records": [V2Record(**r) for r in records]
    }


@cards_v2_router.get("/projects/{project_id}/records/{record_id}", response_model=V2Record)
async def get_record(
    project_id: str,
    record_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    doc = await db.v2_card_records.find_one({
        "id": record_id, 
        "project_id": project_id, 
        "organization_id": user.organization_id
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    return V2Record(**doc)


@cards_v2_router.put("/projects/{project_id}/records/{record_id}", response_model=V2Record)
async def update_record(
    project_id: str,
    record_id: str,
    record_update: V2Record,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    # 1. Ownership checks
    doc = await db.v2_card_records.find_one({
        "id": record_id,
        "project_id": project_id,
        "organization_id": user.organization_id
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
        
    proj_doc = await db.v2_card_projects.find_one({"id": project_id, "organization_id": user.organization_id})
    project = V2Project(**proj_doc)
    
    record = V2Record(**doc)
    
    # 2. Revalidate if it was READY or is being set to READY
    target_status = record_update.status
    downgraded = False
    
    if target_status == "ready":
        try:
            _validate_record_data(record_update.data, project.field_schema)
            record_update.validation_status = "valid"
        except HTTPException as e:
            if e.status_code == 422:
                # Downgrade to draft
                target_status = "draft"
                record_update.status = "draft"
                record_update.validation_status = "invalid"
                downgraded = True
            else:
                raise e
    else:
        temp_schema = [f.model_copy(update={"required": False}) for f in project.field_schema]
        _validate_record_data(record_update.data, temp_schema)
        record_update.validation_status = "pending"

    record_update.id = record.id
    record_update.organization_id = record.organization_id
    record_update.project_id = record.project_id
    record_update.created_at = record.created_at
    record_update.updated_at = datetime.utcnow()
    
    await db.v2_card_records.replace_one(
        {"id": record_id, "project_id": project_id, "organization_id": user.organization_id},
        record_update.model_dump()
    )
    
    # Can return meta if downgraded, but for now standard response
    return record_update


@cards_v2_router.delete("/projects/{project_id}/records/{record_id}")
async def delete_record(
    project_id: str,
    record_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    res = await db.v2_card_records.delete_one({
        "id": record_id,
        "project_id": project_id,
        "organization_id": user.organization_id
    })
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"success": True}


@cards_v2_router.patch("/projects/{project_id}/records/{record_id}/important")
async def toggle_record_important(
    project_id: str,
    record_id: str,
    payload: dict,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    important = bool(payload.get("important", False))
    res = await db.v2_card_records.update_one(
        {"id": record_id, "project_id": project_id, "organization_id": user.organization_id},
        {"$set": {"important": important, "updated_at": datetime.utcnow()}}
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"success": True, "important": important}


@cards_v2_router.patch("/projects/{project_id}/records/{record_id}/status")
async def update_record_status(
    project_id: str,
    record_id: str,
    payload: dict,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    status = payload.get("status")
    if status not in ["draft", "ready"]:
        raise HTTPException(status_code=422, detail="Invalid status")
        
    doc = await db.v2_card_records.find_one({
        "id": record_id,
        "project_id": project_id,
        "organization_id": user.organization_id
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
        
    if status == "ready":
        proj_doc = await db.v2_card_projects.find_one({"id": project_id, "organization_id": user.organization_id})
        project = V2Project(**proj_doc)
        _validate_record_data(doc["data"], project.field_schema)
        
    res = await db.v2_card_records.update_one(
        {"id": record_id, "project_id": project_id, "organization_id": user.organization_id},
        {"$set": {"status": status, "validation_status": "valid" if status == "ready" else "pending", "updated_at": datetime.utcnow()}}
    )
    return {"success": True, "status": status}


# ---------------------------------------------------------
# COLLECTION LINKS
# ---------------------------------------------------------
@cards_v2_router.post("/projects/{project_id}/collection-links")
async def create_collection_link(
    project_id: str,
    link_config: dict,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    # Verify project
    proj = await db.v2_card_projects.find_one({"id": project_id, "organization_id": user.organization_id})
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
        
    import secrets
    raw_token = secrets.token_urlsafe(32)
    token_hash = get_token_hash(raw_token)
    
    cl = V2CollectionLink(
        organization_id=user.organization_id,
        project_id=project_id,
        token_hash=token_hash,
        created_by=user.user_id,
        max_submissions=link_config.get("max_submissions")
    )
    
    expires_in_days = link_config.get("expires_in_days")
    if expires_in_days:
        cl.expires_at = datetime.utcnow() + timedelta(days=expires_in_days)
        
    await db.v2_collection_links.insert_one(cl.model_dump())
    
    # Return raw token ONLY here
    return {
        "id": cl.id,
        "token": raw_token,
        "expires_at": cl.expires_at,
        "enabled": True
    }


@cards_v2_router.get("/projects/{project_id}/collection-links")
async def list_collection_links(
    project_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    # Verify project
    proj = await db.v2_card_projects.find_one({"id": project_id, "organization_id": user.organization_id})
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
        
    cursor = db.v2_collection_links.find({"project_id": project_id, "organization_id": user.organization_id})
    links = await cursor.to_list(length=100)
    
    # Strip token_hash and return safe metadata
    safe_links = []
    for l in links:
        l.pop("token_hash", None)
        l.pop("_id", None)
        l.pop("pin_hash", None)
        # Determine status
        status = "active"
        if not l.get("enabled", True) or l.get("revoked_at"):
            status = "revoked"
        elif l.get("expires_at") and datetime.utcnow() > l.get("expires_at"):
            status = "expired"
        elif l.get("max_submissions") and l.get("submission_count", 0) >= l.get("max_submissions"):
            status = "limit_reached"
            
        l["status"] = status
        safe_links.append(l)
        
    return safe_links


@cards_v2_router.post("/projects/{project_id}/collection-links/{link_id}/revoke")
async def revoke_collection_link(
    project_id: str,
    link_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    res = await db.v2_collection_links.update_one(
        {"id": link_id, "project_id": project_id, "organization_id": user.organization_id},
        {"$set": {"enabled": False, "revoked_at": datetime.utcnow()}}
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=404, detail="Link not found or already revoked")
    return {"success": True}


@cards_v2_router.post("/projects/{project_id}/collection-links/{link_id}/regenerate")
async def regenerate_collection_link(
    project_id: str,
    link_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    # Authenticate and find existing
    link_doc = await db.v2_collection_links.find_one({
        "id": link_id, "project_id": project_id, "organization_id": user.organization_id
    })
    if not link_doc:
        raise HTTPException(status_code=404, detail="Link not found")
        
    import secrets
    new_raw_token = secrets.token_urlsafe(32)
    new_token_hash = get_token_hash(new_raw_token)
    
    res = await db.v2_collection_links.update_one(
        {"id": link_id, "project_id": project_id, "organization_id": user.organization_id},
        {"$set": {"token_hash": new_token_hash, "enabled": True, "revoked_at": None}}
    )
    
    if res.modified_count == 0:
        raise HTTPException(status_code=500, detail="Failed to regenerate token")
        
    return {
        "success": True,
        "token": new_raw_token
    }


# ---------------------------------------------------------
# PUBLIC SUBMISSION
# ---------------------------------------------------------
# Simple in-memory rate limiter for public endpoints
from collections import defaultdict
import time
RATE_LIMIT_CACHE = defaultdict(list)
def _check_rate_limit(client_ip: str, max_requests: int = 10, window_seconds: int = 60):
    now = time.time()
    # Filter old requests
    RATE_LIMIT_CACHE[client_ip] = [ts for ts in RATE_LIMIT_CACHE[client_ip] if ts > now - window_seconds]
    if len(RATE_LIMIT_CACHE[client_ip]) >= max_requests:
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
    RATE_LIMIT_CACHE[client_ip].append(now)

@cards_v2_router.get("/collection/{token}")
async def public_collection_schema(
    token: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db_instance)
):
    """Public unauthenticated endpoint to resolve collection schema."""
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip, max_requests=20, window_seconds=60)
    
    token_hash = get_token_hash(token)
    link_doc = await db.v2_collection_links.find_one({"token_hash": token_hash})
    if not link_doc:
        raise HTTPException(status_code=404, detail="Invalid token")
        
    cl = V2CollectionLink(**link_doc)
    
    # Check expiration/revocation
    if not cl.enabled or cl.revoked_at:
        raise HTTPException(status_code=403, detail="Collection link is inactive or revoked.")
        
    if cl.expires_at and datetime.utcnow() > cl.expires_at:
        raise HTTPException(status_code=403, detail="Collection link has expired.")
        
    if cl.max_submissions and cl.submission_count >= cl.max_submissions:
        raise HTTPException(status_code=403, detail="Submission limit reached.")
        
    # Get Project
    proj_doc = await db.v2_card_projects.find_one({"id": cl.project_id})
    if not proj_doc:
        raise HTTPException(status_code=500, detail="Configuration error: project missing.")
        
    proj = V2Project(**proj_doc)
    if proj.status not in ["active", "draft"]:
        raise HTTPException(status_code=403, detail="Project is not accepting submissions.")
        
    # Sanitize schema for public form
    safe_fields = []
    for f in proj.field_schema:
        safe_fields.append({
            "key": f.key,
            "label": f.label,
            "data_type": f.data_type,
            "required": f.required,
            "options": f.options
        })
        
    return {
        "project_name": proj.name,
        "fields": safe_fields
    }

@cards_v2_router.post("/collection/{token}")
async def public_collection_submission(
    token: str,
    data: dict,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db_instance)
):
    """Public unauthenticated endpoint to submit data."""
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip, max_requests=10, window_seconds=60)
    
    token_hash = get_token_hash(token)
    
    link_doc = await db.v2_collection_links.find_one({"token_hash": token_hash})
    if not link_doc:
        raise HTTPException(status_code=404, detail="Invalid token")
        
    cl = V2CollectionLink(**link_doc)
    
    # Check expiration/revocation
    if not cl.enabled or cl.revoked_at:
        raise HTTPException(status_code=403, detail="Collection link is inactive or revoked.")
        
    if cl.expires_at and datetime.utcnow() > cl.expires_at:
        raise HTTPException(status_code=403, detail="Collection link has expired.")

    # Atomic max submissions check and increment
    if cl.max_submissions:
        update_res = await db.v2_collection_links.update_one(
            {"id": cl.id, "submission_count": {"$lt": cl.max_submissions}},
            {"$inc": {"submission_count": 1}}
        )
        if update_res.modified_count == 0:
            raise HTTPException(status_code=403, detail="Maximum submission limit reached.")
    else:
        await db.v2_collection_links.update_one(
            {"id": cl.id},
            {"$inc": {"submission_count": 1}}
        )
        
    # Get Project
    proj_doc = await db.v2_card_projects.find_one({"id": cl.project_id})
    if not proj_doc:
        raise HTTPException(status_code=500, detail="Configuration error: project missing.")
        
    proj = V2Project(**proj_doc)
    
    if proj.status != "active" and proj.status != "draft":
        raise HTTPException(status_code=403, detail="Project is not accepting submissions.")
        
    # Validate
    _validate_record_data(data, proj.field_schema)
    
    # Save record
    rec = V2Record(
        organization_id=proj.organization_id,
        project_id=proj.id,
        data=data,
        source="collection_link",
        validation_status="valid"
    )
    
    await db.v2_card_records.insert_one(rec.model_dump())
    
    return {"success": True, "reference": rec.id[-8:]}

# ---------------------------------------------------------
# PRIVATE PHOTOS
# ---------------------------------------------------------
PRIVATE_V2_PHOTOS_DIR = os.path.join("backend", "app", "storage", "private_v2_photos")

@cards_v2_router.post("/projects/{project_id}/photos")
async def upload_private_photo(
    project_id: str,
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    # Verify project
    proj_doc = await db.v2_card_projects.find_one({"id": project_id, "organization_id": user.organization_id})
    if not proj_doc:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate file type
    allowed_mimes = ["image/jpeg", "image/png", "image/webp"]
    if file.content_type not in allowed_mimes:
        raise HTTPException(status_code=415, detail="Unsupported Media Type. Only JPEG, PNG, WebP allowed.")

    # Size check is inherently somewhat enforced by FastAPI (SpooledTemporaryFile defaults to 1MB memory then disk)
    # But let's check size manually if possible by reading
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)

    if size > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Max 5MB.")

    # Generate opaque ID and path
    photo_id = str(uuid.uuid4())
    ext = "jpg" if file.content_type == "image/jpeg" else ("png" if file.content_type == "image/png" else "webp")
    
    # storage/private_v2_photos/org_id/project_id/photo_id.ext
    org_dir = os.path.join(PRIVATE_V2_PHOTOS_DIR, user.organization_id, project_id)
    os.makedirs(org_dir, exist_ok=True)
    
    storage_path = os.path.join(org_dir, f"{photo_id}.{ext}")

    try:
        with open(storage_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to save file.")

    v2_photo = V2Photo(
        photo_id=photo_id,
        organization_id=user.organization_id,
        project_id=project_id,
        storage_path=storage_path,
        mime_type=file.content_type,
        original_filename=file.filename or "unknown",
        size=size
    )

    await db.v2_card_photos.insert_one(v2_photo.model_dump())

    return {"photo_id": photo_id, "filename": file.filename}


@cards_v2_router.get("/projects/{project_id}/photos/{photo_id}")
async def get_private_photo(
    project_id: str,
    photo_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    # Verify ownership in DB
    photo_doc = await db.v2_card_photos.find_one({
        "photo_id": photo_id,
        "project_id": project_id,
        "organization_id": user.organization_id
    })

    if not photo_doc:
        raise HTTPException(status_code=404, detail="Photo not found")

    storage_path = photo_doc["storage_path"]
    
    # Extra safety: ensure file exists
    if not os.path.exists(storage_path):
        raise HTTPException(status_code=404, detail="Photo file missing from storage")

    def iterfile():
        with open(storage_path, mode="rb") as f:
            yield from f

    return StreamingResponse(iterfile(), media_type=photo_doc["mime_type"])


# ---------------------------------------------------------
# BULK RECORDS
# ---------------------------------------------------------
class BulkRecordRequest(BaseModel):
    batch_id: str
    records: List[V2Record]

@cards_v2_router.post("/projects/{project_id}/records/bulk")
async def bulk_create_records(
    project_id: str,
    payload: BulkRecordRequest,
    db: AsyncIOMotorDatabase = Depends(get_db_instance),
    user: V2UserContext = Depends(get_current_user)
):
    # 1. Verify project ownership
    project_doc = await db.v2_card_projects.find_one({
        "id": project_id,
        "organization_id": user.organization_id
    })
    
    if not project_doc:
        raise HTTPException(status_code=404, detail="Project not found")
        
    project = V2Project(**project_doc)

    if not payload.records:
        return {"created": 0, "skipped": 0, "failed": 0, "errors": []}

    if len(payload.records) > 100:
        raise HTTPException(status_code=413, detail="Batch size limit is 100 records")

    created = 0
    skipped = 0
    failed = 0
    errors = []

    # Identify image/photo fields from schema
    photo_fields = [f.key for f in project.field_schema if f.data_type in ["image", "photo"]]
    
    # Pre-fetch all photos belonging to this project to quickly validate ownership
    # Usually a batch is <=100, so we can fetch all provided photo_ids
    photo_ids_in_batch = set()
    for rec in payload.records:
        for pf in photo_fields:
            if rec.data.get(pf):
                photo_ids_in_batch.add(rec.data[pf])

    valid_photo_docs = []
    if photo_ids_in_batch:
        cursor = db.v2_card_photos.find({
            "photo_id": {"$in": list(photo_ids_in_batch)},
            "project_id": project_id,
            "organization_id": user.organization_id
        })
        valid_photo_docs = await cursor.to_list(length=None)

    valid_photo_ids = {doc["photo_id"] for doc in valid_photo_docs}

    for idx, record in enumerate(payload.records):
        try:
            # 1. Verify photo ownership
            for pf in photo_fields:
                pid = record.data.get(pf)
                if pid and pid not in valid_photo_ids:
                    raise HTTPException(status_code=403, detail=f"Photo ID '{pid}' is invalid or unauthorized")

            # 2. Validate data
            if record.status == "ready":
                _validate_record_data(record.data, project.field_schema)
                record.validation_status = "valid"
            else:
                temp_schema = [f.model_copy(update={"required": False}) for f in project.field_schema]
                _validate_record_data(record.data, temp_schema)
                record.validation_status = "pending"

            record.organization_id = user.organization_id
            record.project_id = project_id
            
            # Simple Idempotency / Duplicate Check
            # By default, we skip if a record with the exact same data exists in this project
            # (or we can use primary fields). Since this is bulk, let's just check exact matching fields 
            # for primary string fields. Let's assume 'data' exact match for now to skip duplicates.
            
            # A more robust duplicate check: match all text fields
            dup_query = {"project_id": project_id, "organization_id": user.organization_id}
            for k, v in record.data.items():
                if isinstance(v, (str, int, float, bool)):
                    dup_query[f"data.{k}"] = v
            
            # if we have at least one field to check
            if len(dup_query) > 2:
                existing = await db.v2_card_records.find_one(dup_query)
                if existing:
                    skipped += 1
                    continue
            
            record_dict = record.model_dump()
            await db.v2_card_records.insert_one(record_dict)
            
            # Update photo status to associated
            for pf in photo_fields:
                pid = record.data.get(pf)
                if pid:
                    await db.v2_card_photos.update_one({"photo_id": pid}, {"$set": {"status": "associated"}})

            created += 1

        except HTTPException as e:
            failed += 1
            errors.append({"index": idx, "detail": str(e.detail)})
        except Exception as e:
            failed += 1
            errors.append({"index": idx, "detail": "Internal error"})

    return {
        "created": created,
        "skipped": skipped,
        "failed": failed,
        "errors": errors
    }
