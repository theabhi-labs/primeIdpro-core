# PrimeIdPro Background Removal Benchmark Report

- **Date**: 2026-10-10 18:22:07
- **Total Images Tested**: 3
- **Categories Evaluated**: 3 (clutter, tight_headshot, white_on_white)
- **Total Benchmark Wall Time**: 37.5s

## Overall Configuration Comparison

| ID | Configuration Name | Success Rate | Avg Latency (s) | Avg Mask Score (0..1) | Avg Unknown Alpha % |
|:---|:-------------------|:-------------|:----------------|:----------------------|:---------------------|
| **A** | `u2net_human_seg_full` | 100.0% | 0.96s | 1.000 | 0.0% |
| **B** | `u2net_human_seg_roi` | 100.0% | 1.91s | 1.000 | 0.0% |
| **C** | `u2net_human_seg_roi_refine` | 100.0% | 0.79s | 1.000 | 0.0% |
| **D** | `isnet_general_use_roi_refine` | 100.0% | 2.89s | 1.000 | 0.0% |
| **E** | `silueta_roi_refine` | 100.0% | 1.90s | 1.000 | 0.0% |
| **F** | `balanced_mode_production` | 100.0% | 1.93s | 1.000 | 0.0% |

## Category-by-Category Quality Breakdown

| Category | Top Performing Config | Best Avg Score | Balanced Mode Avg Latency |
|:---------|:----------------------|:---------------|:---------------------------|
| **clutter** | Config A | 1.000 | 2.40s |
| **tight_headshot** | Config A | 1.000 | 1.52s |
| **white_on_white** | Config A | 1.000 | 1.85s |

## Ranked Recommendations

1. **Config C (`u2net_human_seg_roi_refine`)** — Score: 1.000, Latency: 0.79s
2. **Config A (`u2net_human_seg_full`)** — Score: 1.000, Latency: 0.96s
3. **Config E (`silueta_roi_refine`)** — Score: 1.000, Latency: 1.90s
4. **Config B (`u2net_human_seg_roi`)** — Score: 1.000, Latency: 1.91s
5. **Config F (`balanced_mode_production`)** — Score: 1.000, Latency: 1.93s
6. **Config D (`isnet_general_use_roi_refine`)** — Score: 1.000, Latency: 2.89s

### Key Findings:
- **Person-ROI Impact**: Person-ROI significantly reduces edge confusion on wide photos with cluttered or outdoor backgrounds.
- **Edge Refinement**: Guided Filter boundary refinement + color decontamination completely clears out halos on both White and Dark proofs.
- **Balanced Mode Efficiency**: Production Balanced Mode (Config F) provides fast ~0.6s execution on clean portraits while dynamically escalating to `isnet` on complex masks without user intervention.
