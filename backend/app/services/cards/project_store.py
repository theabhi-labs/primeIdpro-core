import os
import json
import logging
from typing import List, Optional, Dict, Any
from app.core.config import UPLOAD_DIR
from app.models.card_studio import CardProject


logger = logging.getLogger("primeidpro.cards.store")

PROJECTS_DIR = os.path.join(UPLOAD_DIR, "card_projects")
os.makedirs(PROJECTS_DIR, exist_ok=True)



def save_project_to_disk(project: CardProject) -> bool:
    """Saves a CardProject as a JSON file locally on disk."""
    try:
        file_path = os.path.join(PROJECTS_DIR, f"{project.id}.json")
        data = project.model_dump(mode="json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)
        return True
    except Exception as e:
        logger.error(f"Failed to save project {project.id}: {e}")
        return False


def load_project_from_disk(project_id: str) -> Optional[CardProject]:
    """Loads a CardProject from disk by project_id."""
    file_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
    if not os.path.exists(file_path):
        return None

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return CardProject(**data)
    except Exception as e:
        logger.error(f"Failed to load project {project_id}: {e}")
        return None


def list_saved_projects() -> List[Dict[str, Any]]:
    """Returns metadata for all saved CardProjects."""
    projects = []
    if not os.path.exists(PROJECTS_DIR):
        return projects

    for fname in os.listdir(PROJECTS_DIR):
        if fname.endswith(".json"):
            fpath = os.path.join(PROJECTS_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                projects.append({
                    "id": data.get("id"),
                    "name": data.get("name"),
                    "client": data.get("client"),
                    "cardType": data.get("cardType"),
                    "templateId": data.get("templateId"),
                    "totalRecords": data.get("totalRecords", len(data.get("records", []))),
                    "photosMatched": data.get("photosMatched", 0),
                    "status": data.get("status", "DRAFT"),
                    "createdAt": data.get("createdAt"),
                    "updatedAt": data.get("updatedAt"),
                })
            except Exception as e:
                logger.warning(f"Could not read project file {fname}: {e}")

    # Sort newest first
    projects.sort(key=lambda p: str(p.get("updatedAt", "")), reverse=True)
    return projects


def delete_project_from_disk(project_id: str) -> bool:
    """Deletes a saved CardProject from disk."""
    file_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
            return True
        except Exception as e:
            logger.error(f"Failed to delete project {project_id}: {e}")
            return False
    return False
