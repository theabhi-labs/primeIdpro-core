from pydantic_settings import BaseSettings
from typing import List, Union

class Settings(BaseSettings):
    # App Settings
    app_name: str = "PRIMEIDPRO"
    app_version: str = "1.0.0"
    environment: str = "development"
    debug: bool = True
    
    # Server
    host: str = "0.0.0.0"
    port: int = 10000
    
    # Database
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "primeidpro"
    
    # Storage
    upload_dir: str = "./uploads"
    max_file_size: int = 10485760
    allowed_extensions: str = "jpg,jpeg,png,webp"
    
    # Processing
    face_detection_model: str = "mediapipe"
    background_model: str = "rembg"
    enhancement_level: str = "medium"
    passport_standard: str = "35x45"
    
    # Security
    secret_key: str = "your-secret-key-here"
    cors_origins: Union[str, List[str]] = "*"  # Allow all origins
    
    # SEO
    site_name: str = "PRIMEIDPRO"
    site_url: str = "http://localhost:5173"
    site_description: str = "Free passport size photo generator with AI face detection"
    
    def get_allowed_extensions_list(self) -> List[str]:
        """Convert comma-separated string to list"""
        if isinstance(self.allowed_extensions, str):
            return [ext.strip() for ext in self.allowed_extensions.split(",")]
        return self.allowed_extensions
    
    def get_cors_origins_list(self) -> List[str]:
        """Convert CORS origins to list"""
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