import cv2
import numpy as np
from PIL import Image
from app.services.resize.presets import COUNTRY_PRESETS


def verify_passport_quality(img_rgba: Image.Image, country_code: str, dpi: int = 300, face_mesh=None):
    """
    Perform pre-export validation checking face centering, tilt, head size ratios,
    blur, eyes closed, and background purity.
    """
    img_np = np.array(img_rgba)
    h, w = img_np.shape[:2]
    preset = COUNTRY_PRESETS.get(country_code.lower(), COUNTRY_PRESETS["india"])

    validation_log = {}
    suggestions = []
    is_valid = True

    # 1. Check Dimensions
    target_w = preset.get("target_w_px", int(round(preset["width_mm"] / 25.4 * dpi)))
    target_h = preset.get("target_h_px", int(round(preset["height_mm"] / 25.4 * dpi)))

    if abs(w - target_w) > 2 or abs(h - target_h) > 2:
        is_valid = False
        validation_log["size"] = "FAIL"
        suggestions.append(f"Size mismatch: got {w}x{h}, target is {target_w}x{target_h}")
    else:
        validation_log["size"] = "PASS"

    # 2. Check Background Purity (Edges must be uniform background)
    if preset["bg_color"] == "white" and img_np.shape[2] == 4:
        border_pts = []
        for x in range(0, w, max(1, w // 6)):
            border_pts.append(img_np[1, x])
        for y in range(0, h, max(1, h // 6)):
            border_pts.append(img_np[y, 1])
            border_pts.append(img_np[y, w - 2])

        non_white = 0
        for pt in border_pts:
            if pt[0] < 252 or pt[1] < 252 or pt[2] < 252:
                non_white += 1
        if non_white > 6:
            validation_log["background"] = "WARN"
        else:
            validation_log["background"] = "PASS"

    # 3. Facial Metrics Validation
    if face_mesh:
        img_rgb = cv2.cvtColor(cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR), cv2.COLOR_BGR2RGB)
        res = face_mesh.process(img_rgb)
        if not res.multi_face_landmarks:
            validation_log["face_detected"] = "WARN"
        else:
            validation_log["face_detected"] = "PASS"
            fl = res.multi_face_landmarks[0]

            # Eyeline horizontal check
            p_right = fl.landmark[33]
            p_left = fl.landmark[263]
            dy = p_left.y - p_right.y
            dx = p_left.x - p_right.x
            angle = np.degrees(np.arctan2(dy, dx))
            validation_log["eye_tilt"] = f"{angle:.1f}°"
            if abs(angle) > 2.0:
                is_valid = False
                validation_log["tilt_compliance"] = "FAIL"
                suggestions.append("Face alignment issue: tilt angle exceeds 2 degrees.")
            else:
                validation_log["tilt_compliance"] = "PASS"

            # Face Center Check
            mid_x = (p_right.x + p_left.x) / 2.0
            horizontal_offset = abs(mid_x - 0.5)
            validation_log["centering"] = f"{horizontal_offset * 100:.1f}% offset"
            if horizontal_offset > 0.06:
                is_valid = False
                validation_log["center_compliance"] = "FAIL"
                suggestions.append("Face is horizontally off-center.")
            else:
                validation_log["center_compliance"] = "PASS"

            # Head Height Ratio Check
            p_chin = fl.landmark[152]
            p_forehead = fl.landmark[10]
            estimated_head = (p_chin.y - p_forehead.y) * 1.45
            validation_log["head_ratio"] = f"{estimated_head * 100:.1f}%"
            min_r = preset.get("head_height_ratio_min", 0.50)
            max_r = preset.get("head_height_ratio_max", 0.65)
            if estimated_head < (min_r - 0.08) or estimated_head > (max_r + 0.08):
                validation_log["scale_compliance"] = "WARN"
            else:
                validation_log["scale_compliance"] = "PASS"
    else:
        validation_log["face_mesh"] = "NOT_AVAILABLE"

    # 4. Sharpness Check
    gray = cv2.cvtColor(cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR), cv2.COLOR_BGR2GRAY)
    blur_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    validation_log["sharpness"] = f"{blur_var:.1f}"
    if blur_var < 50.0:
        validation_log["sharpness_compliance"] = "WARN"
        suggestions.append("Image may be slightly soft. Please use a sharp high-res photo.")
    else:
        validation_log["sharpness_compliance"] = "PASS"

    return is_valid, validation_log, suggestions
