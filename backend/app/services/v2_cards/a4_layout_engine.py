import math
from typing import Dict, Any, List

def calculate_layout(
    page_width_mm: float,
    page_height_mm: float,
    margin_top_mm: float,
    margin_right_mm: float,
    margin_bottom_mm: float,
    margin_left_mm: float,
    card_width_mm: float,
    card_height_mm: float,
    gap_x_mm: float,
    gap_y_mm: float
) -> Dict[str, Any]:
    """
    Given page dimensions, margins, card size, and gaps in mm,
    calculates the maximum number of rows and columns that fit,
    and returns a configuration dictionary.
    """
    if any(v < 0 for v in [margin_top_mm, margin_right_mm, margin_bottom_mm, margin_left_mm, gap_x_mm, gap_y_mm]):
        raise ValueError("Margins and gaps cannot be negative.")
        
    if card_width_mm <= 0 or card_height_mm <= 0 or page_width_mm <= 0 or page_height_mm <= 0:
        raise ValueError("Dimensions must be greater than zero.")

    usable_width = page_width_mm - margin_left_mm - margin_right_mm
    usable_height = page_height_mm - margin_top_mm - margin_bottom_mm

    if usable_width < card_width_mm or usable_height < card_height_mm:
        raise ValueError("Card does not fit on page with given margins.")

    # Calculate columns and rows
    columns = math.floor((usable_width + gap_x_mm) / (card_width_mm + gap_x_mm))
    rows = math.floor((usable_height + gap_y_mm) / (card_height_mm + gap_y_mm))

    cards_per_page = columns * rows

    return {
        "page_width_mm": page_width_mm,
        "page_height_mm": page_height_mm,
        "usable_width_mm": usable_width,
        "usable_height_mm": usable_height,
        "columns": columns,
        "rows": rows,
        "cards_per_page": cards_per_page,
        "card_width_mm": card_width_mm,
        "card_height_mm": card_height_mm,
        "gap_x_mm": gap_x_mm,
        "gap_y_mm": gap_y_mm,
        "margin_top_mm": margin_top_mm,
        "margin_right_mm": margin_right_mm,
        "margin_bottom_mm": margin_bottom_mm,
        "margin_left_mm": margin_left_mm
    }
