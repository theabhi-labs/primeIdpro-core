"""
Standalone CLI tool to benchmark and compare Person-ROI vs Full-Image background removal,
Model Quality Modes (fast / balanced / hq), Mask Quality Scoring, and Edge Refinement.

Usage:
    python tools/test_bg.py <path_to_image> [--mode fast|balanced|hq] [--refine on|off]
"""
import os
import sys
import time
import argparse
from PIL import Image

# Reconfigure stdout for safe Windows console output
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Ensure backend root is in sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import app.services.background.remover as remover
from app.services.background.remover import remove_background_with_reason, check_bg_engine


def flatten_on_color(transparent_png_path: str, output_path: str, bg_color=(255, 255, 255)):
    """Composites transparent RGBA PNG onto a solid background color."""
    with Image.open(transparent_png_path) as img:
        rgba = img.convert("RGBA")
        canvas = Image.new("RGBA", rgba.size, (*bg_color, 255))
        canvas.paste(rgba, (0, 0), mask=rgba.split()[-1])
        rgb = canvas.convert("RGB")
        rgb.save(output_path, "PNG")


def test_image_benchmark(image_path: str, mode: str = "balanced", enable_refine: bool = True):
    if not os.path.exists(image_path):
        print(f"Error: Image path not found: {image_path}")
        sys.exit(1)

    abs_path = os.path.abspath(image_path)
    base_name = os.path.splitext(os.path.basename(abs_path))[0]
    out_dir = os.path.dirname(abs_path)

    remover.ENABLE_EDGE_REFINE = enable_refine
    os.environ["PRIMEID_BG_MODE"] = mode

    temp_roi_nobg = os.path.join(out_dir, f"{base_name}_temp_roi_{mode}.png")
    temp_full_nobg = os.path.join(out_dir, f"{base_name}_temp_full_{mode}.png")

    out_roi_white = os.path.join(out_dir, f"{base_name}_roi_{mode}_white.png")
    out_roi_dark = os.path.join(out_dir, f"{base_name}_roi_{mode}_dark.png")

    out_full_white = os.path.join(out_dir, f"{base_name}_full_{mode}_white.png")
    out_full_dark = os.path.join(out_dir, f"{base_name}_full_{mode}_dark.png")

    DARK_BG = (43, 43, 43)  # Dark slate gray to expose light halos and green/gold color spill
    WHITE_BG = (255, 255, 255)

    print("\n" + "=" * 75)
    print(f"[BENCHMARK] Testing Image: {os.path.basename(abs_path)}")
    print(f"  * Quality Mode:               {mode.upper()}")
    print(f"  * Edge Refine / Decontaminate: {'ENABLED' if enable_refine else 'DISABLED'}")
    print("=" * 75)

    with Image.open(abs_path) as raw_img:
        print(f"Input dimensions: {raw_img.size[0]}x{raw_img.size[1]} | Mode: {raw_img.mode}")

    # 1. Test with Person-ROI ENABLED
    print(f"\n[1/2] Running with Person-ROI (Two-Pass, Mode={mode})...")
    remover.ENABLE_PERSON_ROI = True
    t0 = time.perf_counter()
    ok_roi, reason_roi = remove_background_with_reason(abs_path, temp_roi_nobg, allow_cloud=False, quality_mode=mode)
    t_roi = time.perf_counter() - t0

    if ok_roi and os.path.exists(temp_roi_nobg):
        flatten_on_color(temp_roi_nobg, out_roi_white, WHITE_BG)
        flatten_on_color(temp_roi_nobg, out_roi_dark, DARK_BG)
        print(f"  Status: [OK] SUCCESS ({t_roi:.2f}s)")
        print(f"  Saved (White Background): {out_roi_white}")
        print(f"  Saved (Dark Background):  {out_roi_dark}")
    else:
        print(f"  Status: [FAIL] FAILED ({t_roi:.2f}s) - {reason_roi}")

    # 2. Test with Full-Image (ROI DISABLED)
    print(f"\n[2/2] Running with Full-Image (Single-Pass, Mode={mode})...")
    remover.ENABLE_PERSON_ROI = False
    t0 = time.perf_counter()
    ok_full, reason_full = remove_background_with_reason(abs_path, temp_full_nobg, allow_cloud=False, quality_mode=mode)
    t_full = time.perf_counter() - t0

    if ok_full and os.path.exists(temp_full_nobg):
        flatten_on_color(temp_full_nobg, out_full_white, WHITE_BG)
        flatten_on_color(temp_full_nobg, out_full_dark, DARK_BG)
        print(f"  Status: [OK] SUCCESS ({t_full:.2f}s)")
        print(f"  Saved (White Background): {out_full_white}")
        print(f"  Saved (Dark Background):  {out_full_dark}")
    else:
        print(f"  Status: [FAIL] FAILED ({t_full:.2f}s) - {reason_full}")

    # Clean temporary transparent files
    for temp_p in (temp_roi_nobg, temp_full_nobg):
        if os.path.exists(temp_p):
            try:
                os.remove(temp_p)
            except Exception:
                pass

    print("\n" + "=" * 75)
    print("BENCHMARK COMPARISON SUMMARY:")
    print(f"  * Person-ROI ({mode}): {'[OK]' if ok_roi else '[FAIL]'} in {t_roi:.2f}s")
    print(f"      -> White Proof: {out_roi_white}")
    print(f"      -> Dark Proof:  {out_roi_dark}")
    print(f"  * Full-Image ({mode}): {'[OK]' if ok_full else '[FAIL]'} in {t_full:.2f}s")
    print(f"      -> White Proof: {out_full_white}")
    print(f"      -> Dark Proof:  {out_full_dark}")
    print("=" * 75 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Benchmark PrimeIdPro Background Removal Engine")
    parser.add_argument("image", help="Path to input image")
    parser.add_argument("--mode", choices=["fast", "balanced", "hq"], default="balanced", help="Quality mode")
    parser.add_argument("--refine", choices=["on", "off"], default="on", help="Edge refinement on/off")
    parser.add_argument("--diag", action="store_true", help="Print engine diagnostics and exit")

    args = parser.parse_args()

    if args.diag:
        import pprint
        pprint.pprint(check_bg_engine())
        sys.exit(0)

    test_image_benchmark(args.image, mode=args.mode, enable_refine=(args.refine == "on"))
