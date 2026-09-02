"""
Legacy config compatibility alias.
Canonical settings are defined in app.core.config.
"""
from app.core.config import settings, Settings, UPLOAD_DIR, PROCESSED_DIR

__all__ = ["settings", "Settings", "UPLOAD_DIR", "PROCESSED_DIR"]