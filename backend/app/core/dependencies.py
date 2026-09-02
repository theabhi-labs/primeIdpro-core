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