from beanie import Document, Indexed
from datetime import datetime
from typing import Optional, List
from pydantic import Field

class SheetConfig:
    rows: int = 4
    columns: int = 6
    spacing: int = 5
    margin: int = 10
    photo_width: int = 35
    photo_height: int = 45
    background_color: str = "#FFFFFF"
    unit: str = "mm"  # mm or px

class Sheet(Document):
    session_id: Indexed(str)
    name: str = "My Passport Sheet"
    image_ids: List[str] = []
    
    # Configuration
    config: dict = Field(default_factory=lambda: {
        "rows": 4,
        "columns": 6,
        "spacing": 5,
        "margin": 10,
        "photo_width": 35,
        "photo_height": 45,
        "background_color": "#FFFFFF",
        "unit": "mm"
    })
    
    # Output files
    sheet_url: Optional[str] = None
    pdf_url: Optional[str] = None
    preview_url: Optional[str] = None
    
    # Status
    is_public: bool = False
    share_id: Optional[str] = None
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "sheets"
        indexes = [
            "session_id",
            "share_id",
            "created_at"
        ]
        