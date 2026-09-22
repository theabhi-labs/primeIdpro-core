from datetime import datetime
from typing import Optional
from pydantic import EmailStr, Field
from beanie import Document, Indexed


class User(Document):
    """
    Beanie Document model for Prime ID Pro user accounts.
    """
    email: Indexed(EmailStr, unique=True)
    hashed_password: str
    full_name: Optional[str] = None
    email_verified: bool = False
    otp_code: Optional[str] = None
    otp_expiry: Optional[datetime] = None
    otp_attempts: int = 0
    reset_token: Optional[str] = None
    reset_token_expiry: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

    class Settings:
        name = "users"
