"""
Global In-Memory State Storage
Stores uploaded raw images and processing status for async pipeline jobs.
"""
from typing import Dict, Any

# In-memory storage for active session images and job statuses
uploaded_images: Dict[str, Dict[str, Any]] = {}
processing_status: Dict[str, Dict[str, Any]] = {}
