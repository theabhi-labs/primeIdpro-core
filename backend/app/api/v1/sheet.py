from fastapi import APIRouter, Request, Depends  # pyrefly: ignore [missing-import]
from fastapi.responses import JSONResponse  # pyrefly: ignore [missing-import]
from app.models.sheet import SheetPDFRequest  # pyrefly: ignore [missing-import]
from app.models.project import SaveProjectRequest  # pyrefly: ignore [missing-import]
from app.services.sheet.pdf_exporter import generate_sheet_pdf_file  # pyrefly: ignore [missing-import]
from app.core.dependencies import get_db_instance  # pyrefly: ignore [missing-import]
from app.api.v1.project import save_project_logic  # pyrefly: ignore [missing-import]

router = APIRouter(prefix="/sheet", tags=["Sheet"])


@router.post("/generate-pdf")
async def generate_sheet_pdf(req: SheetPDFRequest):
    """
    Generate a print-ready PDF at strict 300 DPI with exact millimeter sizing,
    optional cutting guides, and optimized grid packing.
    """
    return generate_sheet_pdf_file(req)


@router.post("/generate-simple")
async def generate_simple_sheet(request: SaveProjectRequest, mongo_db=Depends(get_db_instance)):
    """
    Legacy/simple sheet generation endpoint which persists project and returns IDs.
    """
    return await save_project_logic(request, mongo_db)