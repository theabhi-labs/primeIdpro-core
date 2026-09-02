import os
from typing import List, Union
from pydantic_settings import BaseSettings

# Absolute paths based on app directory
APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(APP_DIR, "uploads")
PROCESSED_DIR = os.path.join(APP_DIR, "processed")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)


class Settings(BaseSettings):
    # App Settings
    app_name: str = "Passport Photo Editor API"
    app_version: str = "3.2.0"
    environment: str = "development"
    debug: bool = True

    # Server
    host: str = "0.0.0.0"
    port: int = 10000

    # Database
    mongodb_url: str = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
    mongodb_db_name: str = os.environ.get("MONGODB_DB_NAME", "primeidpro")

    # Storage Paths
    upload_dir: str = UPLOAD_DIR
    processed_dir: str = PROCESSED_DIR
    max_file_size: int = 25 * 1024 * 1024  # 25MB
    allowed_extensions: str = "jpg,jpeg,png,webp,avif,heic,heif,bmp,tiff,jfif"

    # Processing Defaults
    face_detection_model: str = "mediapipe"
    background_model: str = "rembg"
    passport_standard: str = "35x45"
    target_dpi: int = 300

    # Security & CORS
    secret_key: str = "primeidpro-secret-key"
    cors_origins: Union[str, List[str]] = "*"

    def get_allowed_extensions_list(self) -> List[str]:
        if isinstance(self.allowed_extensions, str):
            return [ext.strip().lower() for ext in self.allowed_extensions.split(",")]
        return self.allowed_extensions

    def get_cors_origins_list(self) -> List[str]:
        if self.cors_origins == "*":
            return ["*"]
        if isinstance(self.cors_origins, str):
            return [origin.strip() for origin in self.cors_origins.split(",")]
        return self.cors_origins

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()