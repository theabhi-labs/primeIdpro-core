"""
Pytest Regression & Robustness Test Suite for PrimeIdPro Background Removal Pipeline.

Covers:
  1. EXIF orientation (tags 6 & 8) upright normalization
  2. Diverse color modes (CMYK, Grayscale, Palette, 16-bit, RGBA, Truncated JPEG)
  3. Extreme resolution (7000x5000) downscaling constraint (<= 2500px)
  4. Corrupted file error safety (returns readable reason, never raises)
  5. Tight headshot robustness (near-solid candidate path)
  6. ROI face detection miss fallback (full-image seamless path)
  7. Output dimensions and RGBA mode fidelity
  8. Boundary refinement invariant (sure foreground/background pixel preservation)
  9. ONNX runtime session eviction and self-healing on failure
  10. Batch asynchronous pipeline queue completion safety
"""
import os
import sys
import tempfile
import shutil
import pytest
import asyncio
import numpy as np
from PIL import Image, ImageOps

# Ensure backend root is in sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.services.background.remover import (
    load_image_normalized,
    remove_background_with_reason,
    _calculate_person_roi,
    _run_single_rembg_model,
    _cached_rembg_sessions,
    MAX_SIDE,
)
from app.services.enhancement.matting_utils import refine_alpha
from app.services.background.validator import mask_quality_score
from app.core.state import uploaded_images, processing_status
from app.services.pipeline import process_image_async


@pytest.fixture
def temp_workspace():
    """Provides a dedicated temporary directory for test artifacts and auto-cleans."""
    tmp = tempfile.mkdtemp(prefix="primeid_test_")
    yield tmp
    try:
        shutil.rmtree(tmp)
    except Exception:
        pass


# --------------------------------------------------------------------------
# Test 1: EXIF orientation 6 and 8 images come out upright
# --------------------------------------------------------------------------
def test_exif_orientation_upright(temp_workspace):
    # Base image: 120 width x 240 height (portrait)
    base = Image.new("RGB", (120, 240), color=(180, 90, 45))

    # EXIF orientation 6: rotated 90 degrees CW (stored as landscape, display as portrait)
    exif6 = base.getexif()
    exif6[0x0112] = 6  # Orientation tag
    p6 = os.path.join(temp_workspace, "exif_6.jpg")
    base.save(p6, "JPEG", exif=exif6)

    # EXIF orientation 8: rotated 270 degrees CW
    exif8 = base.getexif()
    exif8[0x0112] = 8
    p8 = os.path.join(temp_workspace, "exif_8.jpg")
    base.save(p8, "JPEG", exif=exif8)

    norm6 = load_image_normalized(p6)
    norm8 = load_image_normalized(p8)

    assert norm6.mode == "RGB"
    assert norm8.mode == "RGB"
    # Orientation 6/8 transposes (120, 240) -> (240, 120)
    assert norm6.size == (240, 120)
    assert norm8.size == (240, 120)


# --------------------------------------------------------------------------
# Test 2: CMYK, Grayscale, Palette, 16-bit, RGBA, and Truncated JPEG
# --------------------------------------------------------------------------
def test_diverse_color_modes_normalized(temp_workspace):
    # 1. CMYK
    cmyk_p = os.path.join(temp_workspace, "sample_cmyk.jpg")
    Image.new("CMYK", (64, 64), (10, 20, 30, 40)).save(cmyk_p, "JPEG")

    # 2. Grayscale (L)
    l_p = os.path.join(temp_workspace, "sample_l.png")
    Image.new("L", (64, 64), 128).save(l_p, "PNG")

    # 3. Palette (P)
    p_p = os.path.join(temp_workspace, "sample_p.png")
    Image.new("P", (64, 64)).save(p_p, "PNG")

    # 4. 16-bit Grayscale (I;16)
    i16_p = os.path.join(temp_workspace, "sample_i16.png")
    Image.fromarray(np.full((64, 64), 32000, dtype=np.uint16), mode="I;16").save(i16_p, "PNG")

    # 5. RGBA with transparency
    rgba_p = os.path.join(temp_workspace, "sample_rgba.png")
    Image.new("RGBA", (64, 64), (100, 150, 200, 128)).save(rgba_p, "PNG")

    # 6. Truncated JPEG (partially downloaded scanlines)
    trunc_p = os.path.join(temp_workspace, "sample_trunc.jpg")
    full_jpg = os.path.join(temp_workspace, "sample_full.jpg")
    Image.new("RGB", (128, 128), (200, 100, 50)).save(full_jpg, "JPEG")
    with open(full_jpg, "rb") as f_in:
        raw_bytes = f_in.read()
    with open(trunc_p, "wb") as f_out:
        f_out.write(raw_bytes[: int(len(raw_bytes) * 0.8)])

    # Validate all formats load cleanly into standard 8-bit RGB
    for path in [cmyk_p, l_p, p_p, i16_p, rgba_p, trunc_p]:
        img = load_image_normalized(path)
        assert isinstance(img, Image.Image)
        assert img.mode == "RGB"
        assert img.size[0] > 0 and img.size[1] > 0


# --------------------------------------------------------------------------
# Test 3: Large resolution downscaling (7000x5000 -> <= 2500px)
# --------------------------------------------------------------------------
def test_large_resolution_downscaling(temp_workspace):
    big_path = os.path.join(temp_workspace, "giant_photo.jpg")
    Image.new("RGB", (7000, 5000), (120, 130, 140)).save(big_path, "JPEG", quality=75)

    norm = load_image_normalized(big_path)
    w, h = norm.size

    assert max(w, h) <= MAX_SIDE
    assert w == 2500
    assert h == int(5000 * (2500 / 7000))  # 1785
    assert abs((w / float(h)) - (7000 / 5000.0)) < 0.01


# --------------------------------------------------------------------------
# Test 4: Corrupted file returns (False, readable_reason), never raises
# --------------------------------------------------------------------------
def test_corrupt_file_error_handling(temp_workspace):
    corrupt_path = os.path.join(temp_workspace, "corrupt_data.png")
    out_path = os.path.join(temp_workspace, "output_corrupt.png")

    with open(corrupt_path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\nCORRUPTED_PAYLOAD_NOT_A_VALID_IMAGE")

    ok, reason = remove_background_with_reason(corrupt_path, out_path, allow_cloud=False)

    assert ok is False
    assert isinstance(reason, str)
    assert len(reason) > 0
    assert "Image could not be read" in reason or "cannot identify" in reason or "UnidentifiedImageError" in reason


# --------------------------------------------------------------------------
# Test 5: Tight headshot where subject fills frame succeeds
# --------------------------------------------------------------------------
def test_tight_headshot_success(temp_workspace):
    tight_path = os.path.join(temp_workspace, "tight_headshot.png")
    out_path = os.path.join(temp_workspace, "tight_out.png")

    # Create synthetic portrait silhouette
    img = Image.new("RGB", (400, 500), (220, 220, 220))
    arr = np.array(img)
    import cv2
    cv2.ellipse(arr, (200, 250), (180, 230), 0, 0, 360, (50, 40, 30), -1)
    Image.fromarray(arr).save(tight_path)

    ok, reason = remove_background_with_reason(tight_path, out_path, allow_cloud=False)
    assert ok is True
    assert os.path.exists(out_path)


# --------------------------------------------------------------------------
# Test 6: ROI falls back seamlessly when no face is detected
# --------------------------------------------------------------------------
def test_roi_miss_fallback(temp_workspace):
    # Texture without human faces
    no_face_path = os.path.join(temp_workspace, "no_face.png")
    out_path = os.path.join(temp_workspace, "no_face_out.png")

    arr = np.zeros((300, 300, 3), dtype=np.uint8)
    import cv2
    cv2.circle(arr, (150, 150), 90, (100, 180, 220), -1)
    img = Image.fromarray(arr)
    img.save(no_face_path)

    # Calculate ROI directly -> must return None
    roi_box = _calculate_person_roi(img)
    assert roi_box is None

    # Pipeline execution should fall back to full-image cleanly
    ok, reason = remove_background_with_reason(no_face_path, out_path, allow_cloud=False)
    assert ok is True
    assert os.path.exists(out_path)


# --------------------------------------------------------------------------
# Test 7: Output size matches normalized input and mode is RGBA
# --------------------------------------------------------------------------
def test_output_geometry_and_mode(temp_workspace):
    in_path = os.path.join(temp_workspace, "test_input.png")
    out_path = os.path.join(temp_workspace, "test_output.png")

    arr = np.full((320, 480, 3), 230, dtype=np.uint8)
    import cv2
    cv2.ellipse(arr, (240, 160), (100, 120), 0, 0, 360, (60, 50, 40), -1)
    Image.fromarray(arr).save(in_path)

    norm_img = load_image_normalized(in_path)
    ok, reason = remove_background_with_reason(in_path, out_path, allow_cloud=False)

    assert ok is True
    assert os.path.exists(out_path)

    with Image.open(out_path) as out_img:
        assert out_img.mode == "RGBA"
        assert out_img.size == norm_img.size


# --------------------------------------------------------------------------
# Test 8: refine_alpha preserves sure foreground and sure background
# --------------------------------------------------------------------------
def test_refine_alpha_boundary_preservation():
    # 100x100 canvas: inner (30..70) is 255, outer is 0
    alpha = np.zeros((100, 100), dtype=np.uint8)
    alpha[30:70, 30:70] = 255
    rgb = np.full((100, 100, 3), 128, dtype=np.uint8)

    refined = refine_alpha(rgb, alpha)

    assert refined.shape == (100, 100)
    assert refined.dtype == np.uint8

    # Sure background region (0..10, 0..10) must remain strictly 0
    assert np.all(refined[0:10, 0:10] == 0)

    # Sure foreground region (45..55, 45..55) must remain strictly 255
    assert np.all(refined[45:55, 45:55] == 255)


# --------------------------------------------------------------------------
# Test 9: Session cache eviction and self-healing on failure
# --------------------------------------------------------------------------
def test_session_eviction_and_recovery():
    # Use synthetic sample image with solid foreground circle
    arr = np.full((128, 128, 3), 220, dtype=np.uint8)
    import cv2
    cv2.ellipse(arr, (64, 64), (40, 50), 0, 0, 360, (30, 20, 10), -1)
    sample_img = Image.fromarray(arr)

    # 1. Warm session
    _run_single_rembg_model(sample_img, "u2net_human_seg")
    assert "u2net_human_seg" in _cached_rembg_sessions

    # 2. Corrupt cached session
    _cached_rembg_sessions["u2net_human_seg"] = "CORRUPT_SESSION_OBJECT"

    # 3. Model execution encounters exception and evicts session
    ok, res, score, reasons, err = _run_single_rembg_model(sample_img, "u2net_human_seg")
    assert "u2net_human_seg" not in _cached_rembg_sessions

    # 4. Next call automatically recreates fresh session
    ok2, res2, score2, reasons2, err2 = _run_single_rembg_model(sample_img, "u2net_human_seg")
    assert ok2 is True
    assert "u2net_human_seg" in _cached_rembg_sessions


# --------------------------------------------------------------------------
# Test 10: Sequential batch queue completes with zero stuck jobs
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_batch_pipeline_queue_completion(temp_workspace):
    img_ids = []

    for i in range(10):
        img_id = f"test_seq_batch_{i}"
        img_ids.append(img_id)
        img_path = os.path.join(temp_workspace, f"{img_id}.png")

        # Generate test synthetic portraits
        arr = np.full((160, 200, 3), 210, dtype=np.uint8)
        import cv2
        cv2.ellipse(arr, (80, 100), (50, 70), 0, 0, 360, (20 + i * 15, 60, 80), -1)
        Image.fromarray(arr).save(img_path)

        uploaded_images[img_id] = {
            "id": img_id,
            "original_path": img_path,
            "filename": f"{img_id}.png",
        }
        processing_status[img_id] = {"status": "pending", "progress": 0}

    # Run sequentially through asynchronous orchestrator
    for img_id in img_ids:
        await process_image_async(img_id, country_code="india", bg_color="white")
        st = processing_status[img_id]

        # Status must resolve to completed or failed, never hanging in processing/pending
        assert st["status"] in ("completed", "failed")
        assert st.get("progress") in (100, 0)
