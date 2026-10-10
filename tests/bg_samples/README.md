# PrimeIdPro Background Removal Benchmark Sample Dataset

This dataset directory contains real-world portrait test images across 9 difficult edge-case categories designed to stress-test and compare background removal models for passport & ID photo production.

---

## 📁 Category Specifications (3 Images Each = 27 Total)

| Category Folder | Description | What It Tests |
|:----------------|:------------|:--------------|
| `clutter/` | Cluttered indoor/outdoor backgrounds (hay, trees, bricks, crowds) | Model confusion with background textures; Person-ROI effectiveness. |
| `white_on_white/` | White shirt/top against a pure white or cream wall | Boundary discrimination when foreground and background colors match. |
| `dark_on_dark/` | Dark skin, black hair, or dark suit on a dark/black backdrop | Boundary discrimination in low-contrast shadows and shoulder edges. |
| `gray_hair/` | Fine, frizzy, curly, or flyaway gray/white hair | Fine detail preservation and matting without creating solid helmet edges. |
| `glasses/` | Subject wearing wire-frame glasses or translucent spectacles | Prevention of hollow cutouts in lenses and frame retention. |
| `lowlight/` | Grainy, noisy, or underexposed smartphone camera shots | Robustness against high-ISO sensor noise without mask fragmentation. |
| `highres_phone/` | Uncompressed 12MP–48MP mobile portrait photos | Memory sanity, processing latency, and scaling fidelity on high-res inputs. |
| `tight_headshot/` | Close-up headshots where face occupies >80% of the image frame | Handling when Person-ROI covers almost the entire image. |
| `sideways_exif/` | Photos with non-standard EXIF rotation tags (90°, 180°, 270°) | Normalization and automatic orientation correction before inference. |

---

## 🧪 Automated Benchmark Execution

Run the automated benchmark across all 6 configurations:
```powershell
python backend/tools/benchmark_bg.py --input tests/bg_samples --output tests/bg_results
```

This generates:
1. `tests/bg_results/benchmark_results.csv`: Execution times, peak memory, mask quality scores, and unknown pixel ratios.
2. `tests/bg_results/benchmark_report.md`: Markdown summary and ranked recommendation.
3. `tests/bg_results/collages/`: Visual 2-row multi-column comparison collages on both **White** and **Dark Gray** background proofs.

---

## 📝 Manual 1–5 Scoring Rubric

Open the generated collages in `tests/bg_results/collages/` and score each configuration using the template in `manual_scoring_template.csv`.

### 1. Hair Edges (`hair_score_1to5`)
- **5 (Excellent)**: Individual fine hair strands cleanly preserved; soft natural alpha transition.
- **4 (Good)**: Minor clumping of fine hair, but overall silhouette is natural.
- **3 (Acceptable)**: Noticeable blocky or helmet-like cut, but no large chunks missing.
- **2 (Poor)**: Large sections of hair chopped off or blurred into background clutter.
- **1 (Failed)**: Severe hair mutilation or large background patches attached to head.

### 2. Shoulders & Clothes (`shoulders_score_1to5`)
- **5 (Excellent)**: Crisp, sharp, continuous clothing boundaries with natural fabric texture.
- **4 (Good)**: Mostly clean with minor micro-stepping.
- **3 (Acceptable)**: Slight erosion of shoulder fabric (1–3 pixels lost).
- **2 (Poor)**: Wavy, jagged, or visibly eaten-away shoulder contours.
- **1 (Failed)**: Large sections of arms or shoulders completely missing.

### 3. Halo & Color Bleed (`halo_score_1to5`) *(Inspect on Dark Gray Proof)*
- **5 (Excellent)**: Zero background color spill; edges blend seamlessly onto both white and dark proofs.
- **4 (Good)**: Faint trace of background color under high magnification.
- **3 (Acceptable)**: Minor visible halo, but acceptable for passport print.
- **2 (Poor)**: Noticeable golden/green/white halo outline glowing around subject.
- **1 (Failed)**: Severe, glaring background glow surrounding the entire silhouette.

### 4. Holes & Subject Integrity (`holes_score_1to5`)
- **5 (Excellent)**: 100% solid body; zero holes or accidental transparency inside face or clothes.
- **4 (Good)**: Minor translucent spot on thin clothing buttons/collars.
- **3 (Acceptable)**: Small semi-transparent speckle in shirt interior.
- **2 (Poor)**: Visible holes cut out through chest, neck, or cheek.
- **1 (Failed)**: Swiss-cheese effect with multiple large background voids inside the body.
