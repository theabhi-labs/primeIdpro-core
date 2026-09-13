import uuid
from fastapi import Request, HTTPException
from app.core.database import db


async def get_session_id(request: Request) -> str:
    """Get session ID from header, cookie, or generate a new one"""
    session_id = request.headers.get("X-Session-ID") or request.cookies.get("session_id")
    if not session_id:
        session_id = f"sess_{uuid.uuid4().hex[:16]}"
    return session_id


def get_db_instance(request: Request):
    """Retrieve active Mongo database connection or raise 503 if unreachable"""
    mongo_db = getattr(request.app.state, "mongo_db", None)
    if mongo_db is None:
        mongo_db = db.get_database()
    if mongo_db is None:
        raise HTTPException(
            status_code=503,
            detail="Database is temporarily unavailable. Please retry in a few seconds.",
        )
    return mongo_db


async def get_current_user(request: Request):
    """
    V2 Development Auth Stub. 
    In production, this would decode a real JWT. 
    For Phase 1 isolated testing, it extracts a simple Bearer token.
    Format: 'Bearer test-user_id:test-org_id'
    """
    from app.models.card_studio_v2 import V2UserContext
    
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    
    token = auth_header.split(" ")[1]
    
    from app.core.config import settings
    if settings.environment != "development":
        # Production auth logic would go here
        raise HTTPException(status_code=401, detail="Production authentication not yet implemented or invalid token.")
    
    # DEV STUB: accept token format "user_id:org_id"
    if ":" not in token:
        # Fallback dummy logic if just a plain token is passed in dev
        if token == "test-token":
            return V2UserContext(user_id="test-user", organization_id="test-org")
        raise HTTPException(status_code=401, detail="Invalid token format for V2 dev stub")
    
    try:
        user_id, org_id = token.split(":", 1)
        return V2UserContext(user_id=user_id, organization_id=org_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Failed to parse token")