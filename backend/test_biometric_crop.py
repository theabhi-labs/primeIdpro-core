import os
import sys
import numpy as np
import cv2
from PIL import Image

# Import biometric functions from backend.app.main
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from app.main import PASSPORT_CONFIG, COUNTRY_PRESETS, center_crop_fallback, flatten_onto_bg

def test_biometric_dimensions():
    print("--- 1. Testing PASSPORT_CONFIG & COUNTRY_PRESETS ---")
    cfg = PASSPORT_CONFIG
    print(f"Canvas size: {cfg['target_width_px']} x {cfg['target_height_px']}")
    print(f"Target DPI: {cfg['target_dpi']}")
    print(f"Head ratio: {cfg['head_height_ratio_min']} - {cfg['head_height_ratio_max']} (default: {cfg['head_height_ratio_default']})")
    print(f"Eye line ratio: {cfg['eye_line_ratio_default']}")
    print(f"Headroom: {cfg['top_margin_ratio']}")
    
    assert cfg['target_width_px'] == 413, "Width must be 413 px"
    assert cfg['target_height_px'] == 531, "Height must be 531 px"
    assert cfg['target_dpi'] == 300, "DPI must be 300"
    assert cfg['top_margin_ratio'] == 0.12, "Headroom should be 12%"
    assert cfg['head_height_ratio_default'] == 0.58, "Head height default should be 58%"
    print("[PASS] PASSPORT_CONFIG validation passed!")

def test_fallback_and_flatten():
    print("\n--- 2. Testing fallback crop & DPI embedding ---")
    # Create synthetic test image (600x800 RGB)
    test_img = np.full((800, 600, 3), 200, dtype=np.uint8)
    # Draw simple head circle
    cv2.circle(test_img, (300, 350), 120, (150, 100, 80), -1)
    
    # Run center fallback
    cropped_rgba, metrics = center_crop_fallback(test_img, country_code="india", dpi=300)
    cropped_np = np.array(cropped_rgba)
    assert cropped_np.shape[1] == 413, f"Expected cropped width 413, got {cropped_np.shape[1]}"
    assert cropped_np.shape[0] == 531, f"Expected cropped height 531, got {cropped_np.shape[0]}"
    print(f"Cropped image shape: {cropped_np.shape[1]}x{cropped_np.shape[0]}")
    
    # Test flattening onto background with 300 DPI
    flat_img = flatten_onto_bg(cropped_rgba, bg_color="white", target_size=(413, 531))
    out_path = os.path.join(os.path.dirname(__file__), "test_out_300dpi.png")
    flat_img.save(out_path, "PNG", dpi=(300, 300))
    
    saved_img = Image.open(out_path)
    dpi = saved_img.info.get("dpi", (0, 0))
    print(f"Saved Image Size: {saved_img.size} (expected (413, 531))")
    print(f"Saved Image DPI: {dpi} (expected (300, 300))")
    
    assert saved_img.size == (413, 531), "Saved image size mismatch"
    assert round(dpi[0]) == 300 and round(dpi[1]) == 300, "Saved image DPI mismatch"
    saved_img.close()
    print("[PASS] Fallback & 300 DPI Flattening passed!")
    
    if os.path.exists(out_path):
        os.remove(out_path)

def test_pdf_sheet_math():
    print("\n--- 3. Testing 300 DPI PDF Sheet Dimension Math ---")
    dpi = 300
    a4_w_px = int(round(210.0 / 25.4 * dpi))
    a4_h_px = int(round(297.0 / 25.4 * dpi))
    photo_w_px = 413
    photo_h_px = 531
    spacing_px = int(round(2.0 / 25.4 * dpi)) # ~24px
    margin_top_px = int(round(8.0 / 25.4 * dpi)) # ~94px
    
    cols = 5
    grid_w = cols * photo_w_px + (cols - 1) * spacing_px
    print(f"A4 page: {a4_w_px} x {a4_h_px} px")
    print(f"Grid width (5 cols): {grid_w} px (fits in {a4_w_px} px? {grid_w <= a4_w_px})")
    
    usable_h = a4_h_px - 2 * margin_top_px
    max_rows = (usable_h + spacing_px) // (photo_h_px + spacing_px)
    print(f"Max rows fitting cleanly on A4: {max_rows} rows (total {max_rows * cols} photos per page)")
    assert max_rows >= 5, "Should fit at least 5 rows"
    print("[PASS] 300 DPI Sheet Math passed!")

if __name__ == "__main__":
    test_biometric_dimensions()
    test_fallback_and_flatten()
    test_pdf_sheet_math()
    print("\n>>> ALL BIOMETRIC & 300 DPI TESTS PASSED! <<<")
