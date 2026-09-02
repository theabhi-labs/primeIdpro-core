from typing import List, Optional
from pydantic import BaseModel


class SheetPDFPhotoItem(BaseModel):
    url: str
    copies: int = 1
    bgColor: Optional[str] = "#FFFFFF"


class SheetPDFRequest(BaseModel):
    photos: List[SheetPDFPhotoItem]
    paper_size: str = "A4"          # A4, Letter, 4x6
    orientation: str = "Portrait"   # Portrait, Landscape
    rows: int = 0                   # 0 = auto
    cols: int = 5
    photo_size: str = "35x45"       # 35x45, 2x2
    margin_top_mm: float = 8.0
    margin_right_mm: float = 8.0
    margin_bottom_mm: float = 8.0
    margin_left_mm: float = 8.0
    spacing_mm: float = 2.0
    cut_marks: bool = True
    border: bool = True