import uuid
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
    scalable: bool = False


class OrganizationData(BaseModel):
    name: str = "Delhi Public School"
    subtitle: Optional[str] = "Inter College"
    clientName: Optional[str] = ""
    address: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    website: Optional[str] = ""
    session: Optional[str] = "2026-2027"
    logo: Optional[str] = None  # URL or base64
    showLogo: bool = True
    signature: Optional[str] = None  # Principal / Authorized signature URL
    showSignature: bool = True
    signatureLabel: Optional[str] = "Principal"
    estdText: Optional[str] = "ESTD. 2010"
    showBarcode: bool = True
    showQr: bool = True
    principalName: Optional[str] = ""
    code: Optional[str] = ""

    # Dynamic Back Side Configuration
    backTitle: Optional[str] = ""
    backSubtitle: Optional[str] = ""
    backAddress: Optional[str] = ""
    backPhone: Optional[str] = ""
    showWatermark: bool = True
    watermarkText: Optional[str] = "ESTD. 2010"
    showTerms: bool = True
    backTermsTitle: Optional[str] = "TERMS & CONDITIONS"
    terms: List[str] = Field(default_factory=lambda: [
        "This card is non-transferable.",
        "Loss of this card must be reported to the office immediately.",
        "This card must be presented whenever required by authorities.",
        "Cardholder is responsible for safe custody of this card."
    ])
    backFooterText: Optional[str] = "Emergency Contact : {phone}"
    showBackFooter: bool = True
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


class CardBatch(BaseModel):
    id: str = Field(default_factory=lambda: f"batch_{uuid.uuid4().hex[:6]}")
    batchNumber: int = 1
    name: str = "Batch 1"
    status: str = "COLLECTING"  # COLLECTING, LOCKED_FOR_PRINT, PRINTED
    totalRecords: int = 0
    records: List[CardRecord] = Field(default_factory=list)
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    lockedAt: Optional[datetime] = None


class CardProject(BaseModel):
    id: str
    name: str
    client: Optional[str] = ""
    cardType: str = "school"
    cardSize: TemplateSize = Field(default_factory=TemplateSize)
    organization: OrganizationData = Field(default_factory=OrganizationData)
    templateId: str = "school-modern-blue"
    templateVersion: str = "1.0.0"
    themeColor: Optional[str] = "#2563eb"
    customTemplateConfig: Optional[Dict[str, Any]] = None
    photoProcessingProfile: PhotoProcessingProfile = Field(default_factory=PhotoProcessingProfile)
    dataSourceType: str = "excel"  # excel, csv, manual, weblink
    dataSourceName: Optional[str] = None
    columnMappings: Dict[str, str] = Field(default_factory=dict)
    fieldsConfig: List[Dict[str, Any]] = Field(default_factory=list)
    requiredFields: List[str] = Field(default_factory=lambda: ["name", "rollNumber", "className", "fatherName", "motherName", "address", "dob", "bloodGroup", "phone"])
    publicShareToken: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    currentBatchId: str = "batch_1"
    batches: List[CardBatch] = Field(default_factory=list)
    records: List[CardRecord] = Field(default_factory=list)
    status: str = "DRAFT"  # DRAFT, IMPORTING, DATA_READY, COLLECTING, LOCKED_FOR_PRINT, PHOTOS_READY, GENERATED, PRINTED
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
    allRows: Optional[List[Dict[str, Any]]] = None
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
