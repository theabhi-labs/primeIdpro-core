from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime

class PrintDocument(BaseModel):
    id: str
    fileUrl: str
    fileType: Literal["pdf", "image"]
    jobType: Literal["id-card", "general-document"]
    docTypeLabel: Optional[str] = None
    extractedCode: Optional[str] = None
    extractedText: Optional[str] = None
    side: Optional[Literal["front", "back"]] = None
    groupId: Optional[str] = None
    status: Optional[str] = "matched"
    isDarkPage: bool = False
    pageCount: int = 1
    lowConfidenceCrop: bool = False
    rawFileUrl: Optional[str] = None
    cropQuad: Optional[List[List[float]]] = None

class PrintJob(BaseModel):
    id: str
    customerLabel: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    status: Literal["uploading", "pending-review", "printing", "printed", "failed", "waiting-flip"] = "pending-review"
    documents: List[PrintDocument] = []
    combineMode: Optional[Literal["side-by-side", "stacked", "two-page", "single-page"]] = "side-by-side"

class PrintSettings(BaseModel):
    autoInvertDarkPages: bool = True
    darkThresholdPercent: int = 65
    duplexSupported: bool = False
    defaultCombineMode: Literal["side-by-side", "stacked", "two-page", "single-page"] = "side-by-side"
    printMode: Literal["auto", "manual-approve"] = "manual-approve"
    sessionExpiryMinutes: int = 15
    printerName: Optional[str] = None


