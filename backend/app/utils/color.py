import re
from typing import Tuple
from fastapi import HTTPException


def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """Convert HEX (#3498DB or 3498DB) to RGB tuple (52, 152, 219)"""
    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 3:
        hex_color = "".join([c * 2 for c in hex_color])
    return tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))


def validate_and_normalize_color(color_str: str) -> str:
    """Validate color format safely and normalize optionally missing hash symbol."""
    if not color_str:
        raise HTTPException(400, "bg_color cannot be empty")

    color_str = color_str.strip()

    # Check basic color names
    basic_colors = {"white", "black", "red", "green", "blue", "light grey", "grey", "gray"}
    if color_str.lower() in basic_colors:
        return color_str.lower()

    # Hex validation pattern (optional '#' followed by 3 or 6 hex digits)
    match = re.match(r"^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$", color_str)
    if not match:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid color format: '{color_str}'. Must be a valid hex color code (e.g., #3498DB or 3498DB) or basic color name.",
        )

    if not color_str.startswith("#"):
        color_str = f"#{color_str}"

    return color_str


def get_bg_rgb(color_str: str) -> Tuple[int, int, int]:
    """Convert string/hex to RGB tuple. Supports 'white', 'black', '#3498DB', basic colors."""
    color_str = (color_str or "white").strip().lower()
    if color_str == "white":
        return (255, 255, 255)
    elif color_str == "black":
        return (0, 0, 0)
    elif color_str in ("light grey", "grey", "gray"):
        return (220, 220, 220)
    elif color_str.startswith("#"):
        try:
            return hex_to_rgb(color_str)
        except Exception:
            return (255, 255, 255)
    else:
        basic = {
            "red": (255, 0, 0),
            "green": (0, 255, 0),
            "blue": (0, 0, 255),
            "light blue": (210, 230, 250),
        }
        return basic.get(color_str, (255, 255, 255))
