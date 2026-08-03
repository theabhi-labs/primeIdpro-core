from beanie import Document, Indexed
from datetime import datetime
from typing import Optional
from pydantic import Field

class ProcessingStatus:
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class Image(Document):
    session_id: Indexed(str)
    original_url: str
    original_filename: str
    file_size: int
    mime_type: Optional[str] = "image/jpeg"  # Make optional with default
    
    # Processed versions
    processed_url: Optional[str] = None
    face_detected_url: Optional[str] = None
    bg_removed_url: Optional[str] = None
    enhanced_url: Optional[str] = None
    passport_url: Optional[str] = None
    
    # Face detection data
    face_detected: bool = False
    face_coordinates: Optional[dict] = None
    face_confidence: Optional[float] = None
    
    # Processing status
    processing_status: str = ProcessingStatus.PENDING
    processing_error: Optional[str] = None
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "images"
        indexes = [
            "session_id",
            "created_at",
            "processing_status"
        ]

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "abc-123",
                "original_url": "/uploads/sessions/abc-123/original/photo.jpg",
                "original_filename": "photo.jpg",
                "file_size": 2048000,
                "mime_type": "image/jpeg"
            }
        }