from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel, Field
from datetime import datetime


class CardField(BaseModel):
    id: str
    label: str
    type: str = "text"  # text, number, date, phone, email, image, qr, barcode, boolean
    required: bool = False
    source: Optional[str] = None  # excel column or project level
    formatting: Optional[str] = None  # uppercase, lowercase, titlecase, date format
    default_value: Optional[str] = None


class TemplateSize(BaseModel):
    width: float = 85.60
    height: float = 53.98
    unit: str = "mm"
    orientation: str = "horizontal"  # horizontal or vertical


class CardTemplateMeta(BaseModel):
    id: str
    name: str
    category: str = "school"  # school, college, coaching, employee, staff, membership, visitor, event, hospital, library, loyalty, custom
    version: str = "1.0.0"
    description: Optional[str] = None
    size: TemplateSize = Field(default_factory=TemplateSize)
    sides: List[str] = Field(default_factory=lambda: ["front", "back"])
    fields: List[CardField] = Field(default_factory=list)
    imageSlots: List[Dict[str, Any]] = Field(default_factory=list)
    qr: Optional[Dict[str, Any]] = None
    barcode: Optional[Dict[str, Any]] = None
    preview: Optional[str] = None
    templateHtml: Optional[str] = None


class OrganizationData(BaseModel):
    name: str = ""
    clientName: Optional[str] = ""
    address: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    website: Optional[str] = ""
    logo: Optional[str] = None  # URL or base64
    signature: Optional[str] = None  # Principal / Authorized signature URL
    session: Optional[str] = ""
    principalName: Optional[str] = ""
    code: Optional[str] = ""
    customFields: Dict[str, Any] = Field(default_factory=dict)


class PhotoProcessingProfile(BaseModel):
    removeBg: bool = True
    bgColor: str = "#FFFFFF"
    faceDetectCrop: bool = True
    enhance: bool = True
    targetDpi: int = 300
    aspectRatio: str = "35x45"
    scaleAdjust: float = 1.0


class PhotoMatchInfo(BaseModel):
    source: str = "none"  # folder, embedded, filename, manual, none
    originalFilename: Optional[str] = None
    originalPath: Optional[str] = None
    matched: bool = False
    matchConfidence: float = 0.0
    matchMethod: Optional[str] = None  # exact_filename, base_filename, roll_no, embedded, manual


class ProcessedPhotoInfo(BaseModel):
    processedUrl: Optional[str] = None
    transparentUrl: Optional[str] = None
    cacheKey: Optional[str] = None
    status: str = "pending"  # pending, processing, completed, failed, skipped
    error: Optional[str] = None


class ValidationResult(BaseModel):
    status: str = "valid"  # valid, warning, error
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class CardRecord(BaseModel):
    id: str
    index: int = 1
    fields: Dict[str, Any] = Field(default_factory=dict)
    sourceData: Dict[str, Any] = Field(default_factory=dict)
    photo: PhotoMatchInfo = Field(default_factory=PhotoMatchInfo)
    processedPhoto: ProcessedPhotoInfo = Field(default_factory=ProcessedPhotoInfo)
    validation: ValidationResult = Field(default_factory=ValidationResult)
    frontRenderedUrl: Optional[str] = None
    backRenderedUrl: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class MappingProfile(BaseModel):
    id: str
    name: str
    organizationId: Optional[str] = None
    mappings: Dict[str, str] = Field(default_factory=dict)  # Excel column -> card field ID
    createdAt: datetime = Field(default_factory=datetime.utcnow)


class CardProject(BaseModel):
    id: str
    name: str
    client: Optional[str] = ""
    cardType: str = "school"
    organization: OrganizationData = Field(default_factory=OrganizationData)
    templateId: str = "school-modern-blue"
    templateVersion: str = "1.0.0"
    photoProcessingProfile: PhotoProcessingProfile = Field(default_factory=PhotoProcessingProfile)
    dataSourceType: str = "excel"  # excel, csv, manual, paste
    dataSourceName: Optional[str] = None
    columnMappings: Dict[str, str] = Field(default_factory=dict)
    records: List[CardRecord] = Field(default_factory=list)
    status: str = "DRAFT"  # DRAFT, IMPORTING, DATA_READY, VALIDATION_REQUIRED, PROCESSING_PHOTOS, PHOTOS_READY, GENERATED, PRINTED
    totalRecords: int = 0
    photosMatched: int = 0
    photosProcessed: int = 0
    cardsGenerated: int = 0
    cardsPrinted: int = 0
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)


# API Request / Response schemas
class ImportFileResponse(BaseModel):
    success: bool
    fileName: str
    fileType: str
    sheets: List[str]
    detectedHeaders: List[str]
    totalRows: int
    sampleRows: List[Dict[str, Any]]
    suggestedMappings: Dict[str, str]
    embeddedImagesCount: int = 0
    tempFilePath: str


class MatchPhotosRequest(BaseModel):
    projectId: str
    photoFolderPath: Optional[str] = None
    matchStrategy: str = "auto"  # auto, exact_filename, roll_no, embedded, column_name
    identifierField: str = "rollNumber"
    uploadedPhotoFiles: Optional[List[Dict[str, str]]] = None  # list of {filename, tempPath, dataUrl}


class ProcessQueueRequest(BaseModel):
    projectId: str
    recordIds: Optional[List[str]] = None  # None = process all pending
    forceReprocess: bool = False


class RenderPreviewRequest(BaseModel):
    projectId: str
    recordId: Optional[str] = None
    side: str = "front"  # front, back, both


class GenerateBatchRequest(BaseModel):
    projectId: str
    outputFormat: str = "pvc"  # pvc, a4_pdf, a4_image, zip
    recordIds: Optional[List[str]] = None
    paperSize: str = "A4"
    rows: int = 5
    cols: int = 2
    marginTopMm: float = 10.0
    marginRightMm: float = 10.0
    marginBottomMm: float = 10.0
    marginLeftMm: float = 10.0
    spacingMm: float = 2.0
    cutMarks: bool = True
    duplex: bool = True


class PreflightSummary(BaseModel):
    totalRecords: int
    validRecords: int
    warningRecords: int
    errorRecords: int
    fatalErrors: List[str]
    warnings: List[str]
    canGenerate: bool
