from typing import Optional, Dict, Any
from pydantic import BaseModel


class SessionCreateResponse(BaseModel):
    success: bool
    session_id: str
    message: str


class SessionDeleteResponse(BaseModel):
    success: bool
    session_id: str
    message: str


class SessionStatsResponse(BaseModel):
    success: bool
    data: Dict[str, Any]