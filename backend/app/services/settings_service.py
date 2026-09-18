import json
import os
from app.models.print_studio_models import PrintSettings
from app.core.config import UPLOAD_DIR # Assuming config has something we can use, or just use current dir

# Store settings in the root or a config folder. 
# We'll put it in the same directory as UPLOAD_DIR parent for now, or just the backend root.
SETTINGS_FILE = os.path.join(os.path.dirname(os.path.dirname(UPLOAD_DIR)), "settings.json")

def load_settings() -> PrintSettings:
    """Load settings from JSON file, or return defaults if not found."""
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                data = json.load(f)
                return PrintSettings(**data)
        except Exception as e:
            print(f"Error loading settings: {e}. Returning defaults.")
    return PrintSettings()

def save_settings(settings: PrintSettings) -> bool:
    """Save settings to JSON file."""
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(settings.model_dump(), f, indent=4)
        return True
    except Exception as e:
        print(f"Error saving settings: {e}")
        return False

# Global instance
global_settings = load_settings()
