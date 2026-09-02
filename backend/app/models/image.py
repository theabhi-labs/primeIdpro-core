from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from datetime import datetime


class ProcessingStatusEnum:
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ImageUploadData(BaseModel):
    image_id: str
    filename: str
    bg_color: str
    message: str


class ImageUploadResponse(BaseModel):
    success: bool
    data: ImageUploadData


class BatchUploadResponse(BaseModel):
    success: bool
    data: Dict[str, Any]


class RecolorRequest(BaseModel):
    bg_color: str


class QualityCheckResult(BaseModel):
    valid: bool
    log: Dict[str, Any]
    suggestions: List[str]


class ImageStatusData(BaseModel):
    status: str
    progress: int
    processed_url: Optional[str] = None
    transparent_url: Optional[str] = None
    bg_color: Optional[str] = None
    error: Optional[str] = None
    quality_check: Optional[QualityCheckResult] = None