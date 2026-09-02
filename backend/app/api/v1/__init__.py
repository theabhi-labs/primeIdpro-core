from fastapi import APIRouter

from app.api.v1.upload import router as upload_router
from app.api.v1.process import router as process_router
from app.api.v1.sheet import router as sheet_router
from app.api.v1.project import router as project_router
from app.api.v1.session import router as session_router

api_v1_router = APIRouter()

api_v1_router.include_router(upload_router)
api_v1_router.include_router(process_router)
api_v1_router.include_router(sheet_router)
api_v1_router.include_router(project_router)
api_v1_router.include_router(session_router)

__all__ = ["api_v1_router"]
