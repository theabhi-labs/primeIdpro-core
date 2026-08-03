from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional
import os
import uuid
import logging

from app.models.sheet import Sheet
from app.models.image import Image
from app.services.sheet.generator import SheetGenerator
from app.services.sheet.pdf_exporter import PDFExporter
from app.services.resize.presets import PASSPORT_PRESETS, SHEET_PRESETS
from app.core.config import settings

# Configure logger
logger = logging.getLogger(__name__)

# Create router
router = APIRouter()

# Initialize services
sheet_generator = SheetGenerator()
pdf_exporter = PDFExporter()

# Models
class SheetConfigModel(BaseModel):
    rows: int = 4
    columns: int = 6
    spacing: int = 5
    margin: int = 10
    photo_width: int = 35
    photo_height: int = 45
    background_color: str = "#FFFFFF"
    paper_size: str = "A4"
    border: bool = False
    cut_marks: bool = False
    country_code: Optional[str] = None

class SimpleSheetRequest(BaseModel):
    session_id: str
    image_ids: List[str]
    country_code: str = "india"
    paper_size: str = "A4"

# ==================== GENERATE SHEET ====================

@router.post("/generate")
async def generate_sheet(
    session_id: str,
    image_ids: List[str],
    config: SheetConfigModel
):
    """Generate a sheet from processed images"""
    
    logger.info(f"Generating sheet for session: {session_id}, images: {len(image_ids)}")
    
    # Get all processed images
    image_paths = []
    for image_id in image_ids:
        image = await Image.get(image_id)
        if image and image.passport_url:
            image_path = os.path.join(".", image.passport_url.lstrip("/"))
            if os.path.exists(image_path):
                image_paths.append(image_path)
                logger.info(f"✅ Found image: {image_path}")
            else:
                logger.warning(f"⚠️ Image not found: {image_path}")
    
    if not image_paths:
        raise HTTPException(status_code=400, detail="No processed images found")
    
    # Generate sheet
    sheet_id = str(uuid.uuid4())
    sheet_url = sheet_generator.generate_sheet(
        image_paths,
        config.dict(),
        session_id,
        sheet_id
    )
    
    if not sheet_url:
        raise HTTPException(status_code=500, detail="Sheet generation failed")
    
    # Save to database
    sheet = Sheet(
        session_id=session_id,
        name=f"Sheet_{sheet_id[:8]}",
        image_ids=image_ids,
        config=config.dict(),
        sheet_url=sheet_url,
        share_id=sheet_id[:8]
    )
    await sheet.insert()
    
    logger.info(f"✅ Sheet generated: {sheet_url}")
    
    return JSONResponse({
        "success": True,
        "sheet_id": str(sheet.id),
        "sheet_url": sheet_url,
        "share_id": sheet.share_id,
        "message": "Sheet generated successfully"
    })

# ==================== GENERATE SHEET WITH PRESET ====================

@router.post("/generate-with-preset")
async def generate_sheet_with_preset(
    session_id: str,
    image_ids: List[str],
    country_code: str = "india",
    paper_size: str = "A4"
):
    """Generate sheet using country preset"""
    
    logger.info(f"Generating sheet with preset: {country_code}, paper: {paper_size}")
    
    # Get passport preset
    passport_preset = PASSPORT_PRESETS.get(country_code.lower(), PASSPORT_PRESETS["india"])
    
    # Get sheet preset
    sheet_preset = SHEET_PRESETS.get(paper_size.lower(), SHEET_PRESETS["a4"])
    
    # Get layout for this country
    layout = sheet_preset["standard_layout"].get(
        country_code.lower(), 
        sheet_preset["standard_layout"]["india"]
    )
    
    # Get all processed images
    image_paths = []
    for image_id in image_ids:
        image = await Image.get(image_id)
        if image and image.passport_url:
            image_path = os.path.join(".", image.passport_url.lstrip("/"))
            if os.path.exists(image_path):
                image_paths.append(image_path)
                logger.info(f"✅ Found image: {image_path}")
    
    if not image_paths:
        raise HTTPException(status_code=400, detail="No processed images found")
    
    # Create config
    config = {
        "rows": layout["rows"],
        "columns": layout["cols"],
        "spacing": 5,
        "margin": 10,
        "photo_width": passport_preset["width_mm"],
        "photo_height": passport_preset["height_mm"],
        "background_color": passport_preset["bg_color"],
        "paper_size": paper_size,
        "border": True,
        "cut_marks": False,
        "country": passport_preset["name"]
    }
    
    # Generate sheet
    sheet_id = str(uuid.uuid4())
    sheet_url = sheet_generator.generate_sheet(
        image_paths,
        config,
        session_id,
        sheet_id
    )
    
    if not sheet_url:
        raise HTTPException(status_code=500, detail="Sheet generation failed")
    
    # Save to database
    sheet = Sheet(
        session_id=session_id,
        name=f"{passport_preset['name']}_Sheet_{sheet_id[:8]}",
        image_ids=image_ids,
        config=config,
        sheet_url=sheet_url,
        share_id=sheet_id[:8]
    )
    await sheet.insert()
    
    logger.info(f"✅ Sheet generated with {passport_preset['name']} preset")
    
    return JSONResponse({
        "success": True,
        "sheet_id": str(sheet.id),
        "sheet_url": sheet_url,
        "share_id": sheet.share_id,
        "preset": passport_preset,
        "layout": layout,
        "message": f"Sheet generated for {passport_preset['name']}"
    })

# ==================== GENERATE SIMPLE SHEET (3x3 Grid) ====================

@router.post("/generate-simple")
async def generate_simple_sheet(request: SimpleSheetRequest):
    """Generate a simple sheet with default 3x3 grid (9 photos)"""
    
    session_id = request.session_id
    image_ids = request.image_ids
    country_code = request.country_code
    paper_size = request.paper_size
    
    logger.info(f"Generating simple 3x3 sheet for session: {session_id}, images: {len(image_ids)}")
    
    passport_preset = PASSPORT_PRESETS.get(country_code.lower(), PASSPORT_PRESETS["india"])
    
    config = {
        "rows": 3,
        "columns": 3,
        "spacing": 5,
        "margin": 10,
        "photo_width": passport_preset["width_mm"],
        "photo_height": passport_preset["height_mm"],
        "background_color": passport_preset["bg_color"],
        "paper_size": paper_size,
        "border": True,
        "cut_marks": False,
        "country": passport_preset["name"]
    }
    
    image_paths = []
    for image_id in image_ids:
        image = await Image.get(image_id)
        if image and image.passport_url:
            image_path = os.path.join(".", image.passport_url.lstrip("/"))
            if os.path.exists(image_path):
                image_paths.append(image_path)
                logger.info(f"✅ Found image: {image_path}")
            else:
                logger.warning(f"⚠️ Image not found: {image_path}")
    
    if not image_paths:
        raise HTTPException(status_code=400, detail="No processed images found")
    
    original_count = len(image_paths)
    if len(image_paths) == 1:
        image_paths = image_paths * 9
        logger.info(f"✅ Repeated single image 9 times for 3x3 grid")
    elif len(image_paths) < 9:
        while len(image_paths) < 9:
            image_paths.append(image_paths[-1])
        logger.info(f"✅ Filled grid to 9 photos (had {original_count})")
    
    if len(image_paths) > 9:
        image_paths = image_paths[:9]
    
    logger.info(f"📸 Generating sheet with {len(image_paths)} photos in 3x3 grid")
    
    sheet_id = str(uuid.uuid4())
    sheet_url = sheet_generator.generate_sheet(
        image_paths,
        config,
        session_id,
        sheet_id
    )
    
    if not sheet_url:
        raise HTTPException(status_code=500, detail="Sheet generation failed")
    
    sheet = Sheet(
        session_id=session_id,
        name=f"{passport_preset['name']}_Sheet_3x3",
        image_ids=image_ids,
        config=config,
        sheet_url=sheet_url,
        share_id=sheet_id[:8]
    )
    await sheet.insert()
    
    logger.info(f"✅ Sheet generated: {sheet_url}")
    
    return JSONResponse({
        "success": True,
        "sheet_id": str(sheet.id),
        "sheet_url": sheet_url,
        "share_id": sheet.share_id,
        "preset": passport_preset,
        "grid": "3x3",
        "photos": len(image_paths),
        "message": f"Sheet generated with {len(image_paths)} photos in 3x3 grid"
    })

# ==================== EXPORT TO PDF ====================

@router.post("/{sheet_id}/export-pdf")
async def export_to_pdf(
    sheet_id: str,
    paper_size: str = "A4"
):
    """Export sheet to PDF"""
    
    logger.info(f"Exporting sheet {sheet_id} to PDF")
    
    sheet = await Sheet.get(sheet_id)
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    
    sheet_path = os.path.join(".", sheet.sheet_url.lstrip("/"))
    if not os.path.exists(sheet_path):
        raise HTTPException(status_code=404, detail="Sheet file not found")
    
    pdf_filename = sheet.sheet_url.replace(".jpg", ".pdf").split("/")[-1]
    pdf_dir = os.path.dirname(sheet_path)
    pdf_path = os.path.join(pdf_dir, pdf_filename)
    
    success = pdf_exporter.export_sheet_to_pdf(sheet_path, pdf_path, paper_size)
    
    if success:
        pdf_url = sheet.sheet_url.replace(".jpg", ".pdf")
        sheet.pdf_url = pdf_url
        await sheet.save()
        
        logger.info(f"✅ PDF exported: {pdf_url}")
        
        return JSONResponse({
            "success": True,
            "pdf_url": pdf_url,
            "message": "PDF exported successfully"
        })
    else:
        logger.error(f"❌ PDF export failed for sheet {sheet_id}")
        raise HTTPException(status_code=500, detail="PDF export failed")

# ==================== PRINT SHEET (NOW RETURNS PDF FOR PREVIEW) ====================

@router.get("/{sheet_id}/print")
async def print_sheet(sheet_id: str, format: str = "pdf"):
    """
    Get sheet for printing.
    - Default format='pdf' returns a PDF with inline preview.
    - Use format='html' to get the old HTML page (for backward compatibility).
    """
    
    sheet = await Sheet.get(sheet_id)
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    
    # If HTML format is requested, return the old print page
    if format.lower() == "html":
        base_url = settings.site_url
        logger.info(f"BASE URL = {base_url}")
        logger.info(f"SHEET URL = {sheet.sheet_url}")
        image_url = f"{base_url.rstrip('/')}/{sheet.sheet_url.lstrip('/')}"
        
        html = f"""
<!DOCTYPE html>
<html>
<head>
    <title>PRIMEIDPRO - Passport Photo Sheet</title>
    <style>
        @media print {{
            body {{ margin: 0; padding: 0; }}
            img {{ width: 100%; height: 100%; object-fit: contain; }}
            .no-print {{ display: none !important; }}
        }}
        body {{
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 20px;
            background: #f0f0f0;
        }}
        img {{
            max-width: 100%;
            max-height: 80vh;
            border: 1px solid #ccc;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}
        .btn {{
            background: #4CAF50;
            color: white;
            padding: 12px 24px;
            border: none;
            cursor: pointer;
            margin: 10px;
            border-radius: 5px;
            font-size: 16px;
        }}
        .btn:hover {{ background: #45a049; }}
        .btn-container {{ margin: 20px 0; }}
    </style>
</head>
<body>
    <div class="btn-container no-print">
        <h2>📸 Passport Photo Sheet</h2>
        <button class="btn" onclick="window.print()">🖨️ Print</button>
        <button class="btn" onclick="window.close()">❌ Close</button>
    </div>
    <img src="{image_url}" alt="Passport Sheet">
</body>
</html>
        """
        return HTMLResponse(content=html)
    
    # Default: return PDF with inline preview
    sheet_path = os.path.join(".", sheet.sheet_url.lstrip("/"))
    if not os.path.exists(sheet_path):
        raise HTTPException(status_code=404, detail="Sheet file not found")
    
    # Reuse existing PDF if already generated, else generate it
    pdf_filename = sheet.sheet_url.replace(".jpg", ".pdf").split("/")[-1]
    pdf_dir = os.path.dirname(sheet_path)
    pdf_path = os.path.join(pdf_dir, pdf_filename)
    
    # If PDF doesn't exist, generate it (using default A4)
    if not os.path.exists(pdf_path):
        success = pdf_exporter.export_sheet_to_pdf(sheet_path, pdf_path, "A4")
        if not success:
            raise HTTPException(status_code=500, detail="PDF generation failed")
        # Update the sheet record with pdf_url
        pdf_url = sheet.sheet_url.replace(".jpg", ".pdf")
        sheet.pdf_url = pdf_url
        await sheet.save()
    
    # Return the PDF with inline disposition to show preview in browser
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=pdf_filename,
        headers={"Content-Disposition": f"inline; filename={pdf_filename}"}
    )

# ==================== GET SHEET ====================

@router.get("/{sheet_id}")
async def get_sheet(sheet_id: str):
    """Get sheet details"""
    
    sheet = await Sheet.get(sheet_id)
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    
    return {
        "id": str(sheet.id),
        "name": sheet.name,
        "sheet_url": sheet.sheet_url,
        "pdf_url": sheet.pdf_url,
        "config": sheet.config,
        "created_at": sheet.created_at,
        "view_count": sheet.view_count
    }

# ==================== SHARE SHEET ====================

@router.get("/share/{share_id}")
async def get_shared_sheet(share_id: str):
    """Get publicly shared sheet"""
    
    sheet = await Sheet.find_one(Sheet.share_id == share_id)
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    
    sheet.view_count += 1
    await sheet.save()
    
    return {
        "id": str(sheet.id),
        "name": sheet.name,
        "sheet_url": sheet.sheet_url,
        "pdf_url": sheet.pdf_url,
        "config": sheet.config,
        "created_at": sheet.created_at,
        "view_count": sheet.view_count
    }

# ==================== GET ALL SHEETS FOR SESSION ====================

@router.get("/session/{session_id}")
async def get_session_sheets(session_id: str):
    """Get all sheets for a session"""
    
    sheets = await Sheet.find(Sheet.session_id == session_id).to_list()
    
    return {
        "session_id": session_id,
        "total": len(sheets),
        "sheets": [
            {
                "id": str(sheet.id),
                "name": sheet.name,
                "sheet_url": sheet.sheet_url,
                "created_at": sheet.created_at,
                "share_id": sheet.share_id
            }
            for sheet in sheets
        ]
    }