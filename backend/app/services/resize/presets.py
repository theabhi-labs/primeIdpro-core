import logging

logger = logging.getLogger(__name__)
"""Passport Size Presets for Different Countries"""

PASSPORT_PRESETS = {
    "india": {
        "name": "India",
        "standard": "35x45",
        "width_mm": 35,
        "height_mm": 45,
        "width_px": 413,
        "height_px": 531,
        "bg_color": "#FFFFFF",
        "head_height": "65-75%",
        "eye_level": "30-35%",
        "description": "Indian Passport (35mm x 45mm @ 300 DPI)"
    },
    "usa": {
        "name": "USA",
        "standard": "2x2",
        "width_inch": 2,
        "height_inch": 2,
        "width_mm": 50.8,
        "height_mm": 50.8,
        "width_px": 600,
        "height_px": 600,
        "bg_color": "#FFFFFF",
        "head_height": "50-69%",
        "eye_level": "30-40%",
        "description": "US Passport/Visa (2x2 inch @ 300 DPI)"
    },
    "uk": {
        "name": "United Kingdom",
        "standard": "35x45",
        "width_mm": 35,
        "height_mm": 45,
        "width_px": 413,
        "height_px": 531,
        "bg_color": "#FFFFFF",
        "head_height": "65-75%",
        "eye_level": "30-35%",
        "description": "UK Passport (35mm x 45mm @ 300 DPI)"
    },
    "canada": {
        "name": "Canada",
        "standard": "50x70",
        "width_mm": 50,
        "height_mm": 70,
        "width_px": 591,
        "height_px": 827,
        "bg_color": "#FFFFFF",
        "head_height": "44-52%",
        "eye_level": "34-42%",
        "description": "Canadian Passport (50mm x 70mm @ 300 DPI)"
    },
    "australia": {
        "name": "Australia",
        "standard": "35x45",
        "width_mm": 35,
        "height_mm": 45,
        "width_px": 413,
        "height_px": 531,
        "bg_color": "#FFFFFF",
        "head_height": "65-75%",
        "eye_level": "30-35%",
        "description": "Australian Passport (35mm x 45mm @ 300 DPI)"
    },
    "europe": {
        "name": "European Union",
        "standard": "35x45",
        "width_mm": 35,
        "height_mm": 45,
        "width_px": 413,
        "height_px": 531,
        "bg_color": "#FFFFFF",
        "head_height": "65-75%",
        "eye_level": "30-35%",
        "description": "EU Passport (35mm x 45mm @ 300 DPI)"
    },
    "schengen": {
        "name": "Schengen Visa",
        "standard": "35x45",
        "width_mm": 35,
        "height_mm": 45,
        "bg_color": "#FFFFFF",
        "head_height": "70-80%",
        "eye_level": "60-70%",
        "description": "Schengen Visa (35mm x 45mm)"
    },
    "china": {
        "name": "China",
        "standard": "33x48",
        "width_mm": 33,
        "height_mm": 48,
        "bg_color": "#FFFFFF",
        "head_height": "70-80%",
        "eye_level": "60-70%",
        "description": "Chinese Passport (33mm x 48mm)"
    },
    "japan": {
        "name": "Japan",
        "standard": "35x45",
        "width_mm": 35,
        "height_mm": 45,
        "bg_color": "#FFFFFF",
        "head_height": "70-80%",
        "eye_level": "60-70%",
        "description": "Japanese Passport (35mm x 45mm)"
    },
    "uae": {
        "name": "UAE",
        "standard": "35x45",
        "width_mm": 35,
        "height_mm": 45,
        "bg_color": "#FFFFFF",
        "head_height": "70-80%",
        "eye_level": "60-70%",
        "description": "UAE Passport (35mm x 45mm)"
    },
    "saudi": {
        "name": "Saudi Arabia",
        "standard": "35x45",
        "width_mm": 35,
        "height_mm": 45,
        "bg_color": "#FFFFFF",
        "head_height": "70-80%",
        "eye_level": "60-70%",
        "description": "Saudi Passport (35mm x 45mm)"
    },
    "brazil": {
        "name": "Brazil",
        "standard": "35x45",
        "width_mm": 35,
        "height_mm": 45,
        "bg_color": "#FFFFFF",
        "head_height": "70-80%",
        "eye_level": "60-70%",
        "description": "Brazilian Passport (35mm x 45mm)"
    },
    "russia": {
        "name": "Russia",
        "standard": "35x45",
        "width_mm": 35,
        "height_mm": 45,
        "bg_color": "#FFFFFF",
        "head_height": "70-80%",
        "eye_level": "60-70%",
        "description": "Russian Passport (35mm x 45mm)"
    },
    "south_africa": {
        "name": "South Africa",
        "standard": "35x45",
        "width_mm": 35,
        "height_mm": 45,
        "bg_color": "#FFFFFF",
        "head_height": "70-80%",
        "eye_level": "60-70%",
        "description": "South African Passport (35mm x 45mm)"
    },
    "new_zealand": {
        "name": "New Zealand",
        "standard": "35x45",
        "width_mm": 35,
        "height_mm": 45,
        "bg_color": "#FFFFFF",
        "head_height": "70-80%",
        "eye_level": "60-70%",
        "description": "New Zealand Passport (35mm x 45mm)"
    }
}

# Sheet presets for different paper sizes
SHEET_PRESETS = {
    "a4": {
        "name": "A4",
        "width_mm": 210,
        "height_mm": 297,
        "standard_layout": {
            "india": {"rows": 4, "cols": 6},
            "usa": {"rows": 4, "cols": 5},
            "canada": {"rows": 3, "cols": 4}
        }
    },
    "letter": {
        "name": "US Letter",
        "width_mm": 216,
        "height_mm": 279,
        "standard_layout": {
            "india": {"rows": 4, "cols": 5},
            "usa": {"rows": 4, "cols": 4},
            "canada": {"rows": 3, "cols": 3}
        }
    },
    "4x6": {
        "name": "4x6 inch",
        "width_inch": 4,
        "height_inch": 6,
        "standard_layout": {
            "india": {"rows": 2, "cols": 3},
            "usa": {"rows": 2, "cols": 2},
            "canada": {"rows": 1, "cols": 2}
        }
    }
}

def get_preset_by_country(country_code):
    """Get preset by country code"""
    return PASSPORT_PRESETS.get(country_code.lower(), PASSPORT_PRESETS["india"])

def get_all_countries():
    """Get list of all available countries"""
    return [
        {"code": code, "name": preset["name"], "size": preset["standard"]}
        for code, preset in PASSPORT_PRESETS.items()
    ]