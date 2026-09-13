import uuid
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime


def get_uuid() -> str:
    return str(uuid.uuid4())


class V2UserContext(BaseModel):
    user_id: str
    organization_id: str
    role: Optional[str] = "user"


class V2Element(BaseModel):
    id: str = Field(default_factory=get_uuid)
    type: str  # text, image, shape, line, qr, barcode
    x: float
    y: float
    width: float
    height: float
    z_index: int = 0
    rotation: float = 0.0
    visible: bool = True
    locked: bool = False
    static_text: Optional[str] = None
    bind: Optional[str] = None
    style: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class V2FieldDefinition(BaseModel):
    key: str
    label: str
    data_type: str = "text"  # text, number, date, boolean, image, email, phone, url
    required: bool = False
    category: str = "custom"  # organization, person, student, academic, employee, custom
    options: Optional[List[str]] = None
    default_value: Optional[Any] = None


class V2Template(BaseModel):
    id: str = Field(default_factory=get_uuid)
    organization_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    schema_version: int = 1
    width: float = 85.60
    height: float = 53.98
    unit: str = "mm"
    dpi: int = 300
    elements: List[V2Element] = Field(default_factory=list)
    field_schema: List[V2FieldDefinition] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    active: bool = True


class V2Project(BaseModel):
    id: str = Field(default_factory=get_uuid)
    organization_id: Optional[str] = None
    name: str
    template_id: str
    snapshot_schema: Dict[str, Any] = Field(default_factory=dict)
    field_schema: List[V2FieldDefinition] = Field(default_factory=list)
    status: str = "draft"  # draft, active, archived
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    updated_by: Optional[str] = None


class V2Record(BaseModel):
    id: str = Field(default_factory=get_uuid)
    organization_id: Optional[str] = None
    project_id: Optional[str] = None
    data: Dict[str, Any] = Field(default_factory=dict)
    status: str = "draft"  # draft, ready, printed, archived
    important: bool = False
    validation_status: str = "pending"
    source: str = "manual"  # manual, excel, csv, collection_link
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class V2CollectionLink(BaseModel):
    id: str = Field(default_factory=get_uuid)
    organization_id: Optional[str] = None
    project_id: Optional[str] = None
    token_hash: str
    enabled: bool = True
    expires_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    max_submissions: Optional[int] = None
    submission_count: int = 0
    rate_limit: Optional[int] = None
    pin_enabled: bool = False
    pin_hash: Optional[str] = None

class V2Photo(BaseModel):
    photo_id: str = Field(default_factory=get_uuid)
    organization_id: str
    project_id: str
    storage_path: str
    mime_type: str
    original_filename: str
    size: int
    created_at: datetime = Field(default_factory=datetime.utcnow)
    status: str = "uploaded"  # uploaded, associated, orphaned


class V2A4LayoutConfig(BaseModel):
    paper: str = "A4"
    orientation: str = "portrait"
    margin_top_mm: float = 5.0
    margin_right_mm: float = 5.0
    margin_bottom_mm: float = 5.0
    margin_left_mm: float = 5.0
    gap_x_mm: float = 2.0
    gap_y_mm: float = 2.0


class V2GenerationJob(BaseModel):
    job_id: str = Field(default_factory=get_uuid)
    organization_id: str
    project_id: str
    record_ids: List[str]
    template_snapshot: Dict[str, Any] = Field(default_factory=dict)
    layout: V2A4LayoutConfig
    status: str = "QUEUED"  # QUEUED, PROCESSING, COMPLETED, PARTIAL, FAILED
    total: int = 0
    completed: int = 0
    failed: int = 0
    error_summary: List[Dict[str, Any]] = Field(default_factory=list)  # e.g., [{"record_id": "...", "reason": "Missing photo"}]
    pdf_path: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    heartbeat_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_by: Optional[str] = None


class V2GenerationRequest(BaseModel):
    record_ids: List[str]
    layout: V2A4LayoutConfig
