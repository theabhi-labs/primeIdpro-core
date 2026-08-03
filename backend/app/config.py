# config.py
import os
from dotenv import load_dotenv

# Load environment variables from .env file (if exists)
load_dotenv()

class Settings:
    # R2 Configuration
    R2_ACCESS_KEY: str = os.getenv("R2_ACCESS_KEY", "0d3ed7d297d8b5fb2d8c44be9043128a")
    R2_SECRET_KEY: str = os.getenv("R2_SECRET_KEY", "4068b6de88b00686a7eaef7cf2dbc197be9df8a625d17e5260b4e1eaf2787500")
    R2_ENDPOINT: str = os.getenv("R2_ENDPOINT", "https://0b137ce98660c8e771a56ce4efa136bf.r2.cloudflarestorage.com")
    R2_BUCKET: str = os.getenv("R2_BUCKET", "primeidpro")
    
    # Backend Configuration
    API_V1_PREFIX: str = "/api/v1"
    UPLOAD_DIR: str = "/tmp/uploads"      # Temporary directory (Hugging Face /tmp)
    PROCESSED_DIR: str = "/tmp/processed"  # Temporary directory for processing
    
    # CORS
    ALLOWED_ORIGINS: list = [
        "http://localhost:5173",           # Vite dev server
        "https://*.netlify.app",           # Netlify frontend
        "https://*.hf.space",              # Hugging Face Spaces
    ]
    
    # Processing options
    MAX_IMAGE_SIZE_MB: int = 10
    PROCESSING_TIMEOUT_SEC: int = 60

settings = Settings()