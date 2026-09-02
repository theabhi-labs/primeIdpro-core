from typing import List, Optional
from pydantic import BaseModel, field_validator


class SaveProjectRequest(BaseModel):
    session_id: Optional[str] = None
    image_ids: List[str]
    country_code: str = "india"
    paper_size: str = "A4"
    project_name: Optional[str] = None

    @field_validator("image_ids")
    @classmethod
    def image_ids_not_empty(cls, v):
        if not v or len(v) == 0:
            raise ValueError("image_ids must contain at least one image id")
        return v

    @field_validator("country_code", "paper_size")
    @classmethod
    def not_blank(cls, v):
        if v is not None and not str(v).strip():
            raise ValueError("must not be blank")
        return v
