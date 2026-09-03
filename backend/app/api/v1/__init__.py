from fastapi import APIRouter

print("[api_v1] 1. importing upload", flush=True)
from app.api.v1.upload import router as upload_router

print("[api_v1] 2. importing process", flush=True)
from app.api.v1.process import router as process_router

print("[api_v1] 3. importing sheet", flush=True)
from app.api.v1.sheet import router as sheet_router

print("[api_v1] 4. importing project", flush=True)
from app.api.v1.project import router as project_router

print("[api_v1] 5. importing session", flush=True)
from app.api.v1.session import router as session_router

print("[api_v1] 6. importing card_studio", flush=True)
from app.api.v1.card_studio import card_router

print("[api_v1] 7. importing credits", flush=True)
from app.api.v1.credits import credit_router

print("[api_v1] 8. all routers imported!", flush=True)

api_v1_router = APIRouter()

api_v1_router.include_router(upload_router)
api_v1_router.include_router(process_router)
api_v1_router.include_router(sheet_router)
api_v1_router.include_router(project_router)
api_v1_router.include_router(session_router)
api_v1_router.include_router(card_router)
api_v1_router.include_router(credit_router)

__all__ = ["api_v1_router"]

