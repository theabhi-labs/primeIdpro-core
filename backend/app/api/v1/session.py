import uuid
from datetime import datetime
from fastapi import APIRouter

router = APIRouter(prefix="/session", tags=["Session"])


@router.post("/create")
async def create_session():
    """Create a new user/editor session ID."""
    session_id = f"sess_{uuid.uuid4().hex[:16]}"
    return {
        "success": True,
        "session_id": session_id,
        "message": "Session created successfully"
    }


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """Clear session data."""
    return {
        "success": True,
        "session_id": session_id,
        "message": "Session cleared"
    }


@router.get("/{session_id}/stats")
async def session_stats(session_id: str):
    """Get session statistics."""
    return {
        "success": True,
        "data": {
            "session_id": session_id,
            "created_at": datetime.utcnow().isoformat()
        }
    }
