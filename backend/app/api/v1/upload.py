from fastapi import APIRouter, UploadFile, File, Request, HTTPException
from fastapi.responses import JSONResponse
import os
import uuid
from datetime import datetime
from typing import List

from app.core.config import settings
from app.models.image import Image, ProcessingStatus
from app.models.session import Session

# Create router
router = APIRouter()

@router.post("/single")
async def upload_single(
    request: Request,
    file: UploadFile = File(...)
):
    """Upload a single image and save to database"""
    
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")
    
    # Validate file extension
    extension = file.filename.split(".")[-1].lower()
    allowed_extensions = settings.get_allowed_extensions_list()
    
    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {', '.join(allowed_extensions)}"
        )
    
    # Get or create session ID from cookie
    session_id = request.cookies.get("session_id")
    if not session_id:
        session_id = str(uuid.uuid4())
    
    # Create or update session in database
    session = await Session.find_one(Session.session_id == session_id)
    if not session:
        session = Session(
            session_id=session_id,
            ip_address=request.client.host,
            user_agent=request.headers.get("user-agent")
        )
        await session.insert()
        print(f"✅ Created new session: {session_id}")
    else:
        print(f"✅ Using existing session: {session_id}")
    
    # Create session directory
    session_dir = os.path.join(settings.upload_dir, "sessions", session_id, "original")
    os.makedirs(session_dir, exist_ok=True)
    
    # Save file
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"{timestamp}_{file.filename.replace(' ', '_')}"
    file_path = os.path.join(session_dir, safe_filename)
    
    try:
        content = await file.read()
        with open(file_path, "wb") as buffer:
            buffer.write(content)
        
        # Get mime_type
        mime_type = file.content_type
        if not mime_type:
            mime_map = {
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'webp': 'image/webp'
            }
            mime_type = mime_map.get(extension, 'image/jpeg')
        
        # Create image record in database
        image = Image(
            session_id=session_id,
            original_url=f"/uploads/sessions/{session_id}/original/{safe_filename}",
            original_filename=file.filename,
            file_size=len(content),
            mime_type=mime_type,
            processing_status=ProcessingStatus.PENDING
        )
        await image.insert()
        print(f"✅ Image saved to database: {image.id}")
        
        # Update session
        await session.increment_upload(str(image.id))
        
        return JSONResponse({
            "success": True,
            "session_id": session_id,
            "image_id": str(image.id),
            "filename": safe_filename,
            "url": image.original_url,
            "message": "Image uploaded and saved to database"
        })
        
    except Exception as e:
        print(f"❌ Upload error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.post("/batch")
async def upload_batch(
    request: Request,
    files: List[UploadFile] = File(...)
):
    """Upload multiple images at once"""
    
    results = []
    session_id = request.cookies.get("session_id")
    if not session_id:
        session_id = str(uuid.uuid4())
    
    # Get or create session
    session = await Session.find_one(Session.session_id == session_id)
    if not session:
        session = Session(
            session_id=session_id,
            ip_address=request.client.host,
            user_agent=request.headers.get("user-agent")
        )
        await session.insert()
        print(f"✅ Created new session: {session_id}")
    
    for file in files:
        try:
            # Validate extension
            extension = file.filename.split(".")[-1].lower()
            if extension not in settings.get_allowed_extensions_list():
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "error": "File type not allowed"
                })
                continue
            
            # Save file
            session_dir = os.path.join(settings.upload_dir, "sessions", session_id, "original")
            os.makedirs(session_dir, exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_filename = f"{timestamp}_{file.filename.replace(' ', '_')}"
            file_path = os.path.join(session_dir, safe_filename)
            
            content = await file.read()
            with open(file_path, "wb") as buffer:
                buffer.write(content)
            
            # Get mime_type
            mime_type = file.content_type
            if not mime_type:
                mime_map = {
                    'jpg': 'image/jpeg',
                    'jpeg': 'image/jpeg',
                    'png': 'image/png',
                    'webp': 'image/webp'
                }
                mime_type = mime_map.get(extension, 'image/jpeg')
            
            # Save to database
            image = Image(
                session_id=session_id,
                original_url=f"/uploads/sessions/{session_id}/original/{safe_filename}",
                original_filename=file.filename,
                file_size=len(content),
                mime_type=mime_type
            )
            await image.insert()
            
            await session.increment_upload(str(image.id))
            
            results.append({
                "filename": file.filename,
                "success": True,
                "image_id": str(image.id),
                "url": image.original_url
            })
            
        except Exception as e:
            results.append({
                "filename": file.filename,
                "success": False,
                "error": str(e)
            })
    
    return JSONResponse({
        "success": True,
        "session_id": session_id,
        "total": len(files),
        "uploaded": len([r for r in results if r["success"]]),
        "results": results
    })