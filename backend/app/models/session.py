from beanie import Document, Indexed
from datetime import datetime, timedelta
from typing import Optional, List
from pydantic import Field

class Session(Document):
    session_id: Indexed(str, unique=True)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    
    # Usage tracking
    image_ids: List[str] = []
    sheet_ids: List[str] = []
    total_uploads: int = 0
    total_processed: int = 0
    upload_count_today: int = 0  # Add this field for rate limiting
    last_upload: Optional[datetime] = None  # Add this field
    
    # Expiry
    expires_at: datetime = Field(
        default_factory=lambda: datetime.utcnow() + timedelta(days=7)
    )
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_activity: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "sessions"
        indexes = [
            "session_id",
            "expires_at",
            "last_activity"
        ]
    
    async def update_activity(self):
        """Update last activity timestamp"""
        self.last_activity = datetime.utcnow()
        await self.save()
    
    async def increment_upload(self, image_id: str):
        """Increment upload count and add image ID"""
        self.image_ids.append(image_id)
        self.total_uploads += 1
        self.upload_count_today += 1
        self.last_upload = datetime.utcnow()
        self.last_activity = datetime.utcnow()
        await self.save()
        print(f"📊 Session {self.session_id}: Total uploads = {self.total_uploads}")