import math
import logging
import cv2
import numpy as np
from PIL import Image
from app.services.resize.presets import COUNTRY_PRESETS
from app.services.face_detection.fallbacks import align_crop_cascade_fallback, center_crop_fallback

logger = logging.getLogger("primeidpro.face_detection")


def calculate_passport_crop(
    image_width: int,
    image_height: int,
    rotated_landmarks: list,
    target_aspect_ratio: float,
    eye_line_ratio: float = 0.38,
    head_height_ratio: float = 0.58,
    top_margin_ratio: float = 0.12,
    bottom_margin_ratio: float = 0.30
):
    """
    Calculate normalized crop coordinates with visible headroom margin and natural zoom out.
    Biometric Rules:
      - Head Height (crown of hair to chin) ≈ 58% (balanced biometric standard)
      - Top Headroom Margin ≈ 12% (guaranteed clean background above hair)
      - Bottom Shoulder/Chest Room ≈ 30% (natural shoulders visibility)
      - Face Horizontally Centered (50% midpoint)
    """
    p_chin = rotated_landmarks[152]
    p_forehead = rotated_landmarks[10]
    p_left_cheek = rotated_landmarks[454]
    p_right_cheek = rotated_landmarks[234]

    face_cx = (p_left_cheek[0] + p_right_cheek[0]) / 2.0

    # Facial height from forehead top to chin bottom
    face_height = abs(p_chin[1] - p_forehead[1])

    # Accurate anatomical crown estimation including full hair volume
    crown_y = p_forehead[1] - 0.45 * face_height
    chin_y = p_chin[1]
    head_height = max(chin_y - crown_y, 10.0)

    # Target crop height based on head taking head_height_ratio of the total frame
    crop_height = head_height / max(head_height_ratio, 0.40)
    crop_width = crop_height * target_aspect_ratio

    # Position crop with guaranteed headroom above the hair crown
    x1 = face_cx - crop_width / 2.0
    x2 = x1 + crop_width
    y1 = crown_y - crop_height * top_margin_ratio
    y2 = y1 + crop_height

    logger.info(
        f"[BIOMETRIC CROP] head_h={head_height:.1f}, face_h={face_height:.1f}, "
        f"crown_y={crown_y:.1f}, chin_y={chin_y:.1f}, "
        f"crop_box=({x1:.1f}, {y1:.1f}, {x2:.1f}, {y2:.1f})"
    )
    return x1, y1, x2, y2


def align_and_crop_face(
    rgba_img: Image.Image,
    country_code: str,
    dpi: int = 300,
    scale_adjust: float = 1.0,
    center_shift: tuple = (0.0, 0.0),
    face_mesh=None,
    face_cascade=None,
    alt_cascade=None
):
    """
    Precision cropping and alignment using MediaPipe FaceMesh landmarks.
    Automatically aligns eye centers horizontally, normalizes head size,
    and applies balanced biometric framing:
      - 35x45mm = exactly 413x531 px @ 300 DPI
      - Top margin ~12% guaranteed clean headroom above hair crown
      - Head height ~58% (crown of hair to chin) for comfortable natural zoom out
      - Bottom shoulder space ~30% for natural shoulders and clothing
      - Symmetric horizontal centering (50%)
    """
    img_np = np.array(rgba_img)
    h, w = img_np.shape[:2]

    preset = COUNTRY_PRESETS.get(country_code.lower(), COUNTRY_PRESETS["india"])
    width_mm = preset["width_mm"]
    height_mm = preset["height_mm"]
    W = preset.get("target_w_px", int(round(width_mm / 25.4 * dpi)))
    H = preset.get("target_h_px", int(round(height_mm / 25.4 * dpi)))

    if face_mesh is None:
        logger.warning("FaceMesh not provided, falling back to Haar Cascade")
        return align_crop_cascade_fallback(img_np, country_code, dpi, face_cascade, alt_cascade)

    img_rgb = cv2.cvtColor(img_np, cv2.COLOR_RGBA2RGB) if img_np.shape[2] == 4 else cv2.cvtColor(img_np, cv2.COLOR_RGB2RGB)
    results = face_mesh.process(img_rgb)

    if not results.multi_face_landmarks:
        logger.warning("No face landmarks detected, falling back to Haar Cascade")
        return align_crop_cascade_fallback(img_np, country_code, dpi, face_cascade, alt_cascade)

    # Multi-face selection logic (largest face closest to center)
    if len(results.multi_face_landmarks) > 1:
        best_face = None
        best_score = -1
        for face in results.multi_face_landmarks:
            xs = [lm.x for lm in face.landmark]
            ys = [lm.y for lm in face.landmark]
            area = (max(xs) - min(xs)) * (max(ys) - min(ys))
            cx = (min(xs) + max(xs)) / 2.0
            cy = (min(ys) + max(ys)) / 2.0
            dist = math.sqrt((cx - 0.5) ** 2 + (cy - 0.5) ** 2)
            score = area / (dist + 0.1)
            if score > best_score:
                best_score = score
                best_face = face
        face_landmarks = best_face
    else:
        face_landmarks = results.multi_face_landmarks[0]

    num_landmarks = len(face_landmarks.landmark)

    # 1. Get eye pupil centers
    if num_landmarks >= 478:
        p_right_x = face_landmarks.landmark[468].x * w
        p_right_y = face_landmarks.landmark[468].y * h
        p_left_x = face_landmarks.landmark[473].x * w
        p_left_y = face_landmarks.landmark[473].y * h
    else:
        p_right_x = (face_landmarks.landmark[33].x + face_landmarks.landmark[133].x) / 2.0 * w
        p_right_y = (face_landmarks.landmark[33].y + face_landmarks.landmark[133].y) / 2.0 * h
        p_left_x = (face_landmarks.landmark[263].x + face_landmarks.landmark[362].x) / 2.0 * w
        p_left_y = (face_landmarks.landmark[263].y + face_landmarks.landmark[362].y) / 2.0 * h

    right_eye = np.array([p_right_x, p_right_y], dtype=np.float32)
    left_eye = np.array([p_left_x, p_left_y], dtype=np.float32)

    # 2. Alignment Angle
    dy = left_eye[1] - right_eye[1]
    dx = left_eye[0] - right_eye[0]
    angle_rad = np.arctan2(dy, dx)
    angle_deg = np.degrees(angle_rad)
    eye_mid = (right_eye + left_eye) / 2.0

    # 3. Rotate landmarks to horizontal eye plane
    cos_val = np.cos(-angle_rad)
    sin_val = np.sin(-angle_rad)

    def rotate_pt(pt):
        rx = eye_mid[0] + (pt[0] - eye_mid[0]) * cos_val - (pt[1] - eye_mid[1]) * sin_val
        ry = eye_mid[1] + (pt[0] - eye_mid[0]) * sin_val + (pt[1] - eye_mid[1]) * cos_val
        return np.array([rx, ry], dtype=np.float32)

    p_chin = rotate_pt(np.array([face_landmarks.landmark[152].x * w, face_landmarks.landmark[152].y * h]))
    p_forehead = rotate_pt(np.array([face_landmarks.landmark[10].x * w, face_landmarks.landmark[10].y * h]))
    p_left_cheek = rotate_pt(np.array([face_landmarks.landmark[454].x * w, face_landmarks.landmark[454].y * h]))
    p_right_cheek = rotate_pt(np.array([face_landmarks.landmark[234].x * w, face_landmarks.landmark[234].y * h]))

    # Facial height (forehead top to chin bottom)
    face_height = abs(p_chin[1] - p_forehead[1])
    face_width = abs(p_right_cheek[0] - p_left_cheek[0])

    # Accurate crown estimation including full hair volume
    crown_y = p_forehead[1] - 0.45 * face_height

    # Check alpha channel for true hair top boundary if available
    if len(img_np.shape) == 3 and img_np.shape[2] == 4:
        try:
            alpha = img_np[:, :, 3]
            x_min = int(max(0, eye_mid[0] - face_width * 0.5))
            x_max = int(min(w, eye_mid[0] + face_width * 0.5))
            if x_max > x_min:
                cols_alpha = alpha[:, x_min:x_max]
                ys_above = np.where(cols_alpha > 50)[0]
                if len(ys_above) > 0:
                    real_hair_top = np.min(ys_above)
                    min_allowed = p_forehead[1] - 0.65 * face_height
                    max_allowed = p_forehead[1] - 0.25 * face_height
                    if min_allowed <= real_hair_top <= max_allowed:
                        crown_y = float(real_hair_top)
        except Exception:
            pass

    chin_y = p_chin[1]
    head_height = max(chin_y - crown_y, 10.0)
    face_cx = (p_left_cheek[0] + p_right_cheek[0]) / 2.0

    # 4. Target Proportions & Scaling (Natural zoom out with 12% headroom)
    target_head_ratio = preset.get("head_height_ratio", 0.58)
    target_top_headroom = preset.get("top_headroom_ratio", 0.12)

    target_head_px = H * target_head_ratio
    scale = (target_head_px / head_height) * scale_adjust

    # Destination mapping:
    dst_x = W / 2.0 + center_shift[0] * W
    dst_crown_y = H * target_top_headroom + center_shift[1] * H

    # 5. Affine Transformation Matrix
    M = cv2.getRotationMatrix2D((float(eye_mid[0]), float(eye_mid[1])), float(angle_deg), float(scale))
    M[0, 2] += (dst_x - (eye_mid[0] + (face_cx - eye_mid[0]) * scale))
    M[1, 2] += (dst_crown_y - (eye_mid[1] + (crown_y - eye_mid[1]) * scale))

    warped_np = cv2.warpAffine(
        img_np, M, (W, H),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0)
    )
    if len(warped_np.shape) == 3 and warped_np.shape[2] == 4:
        warped_rgba = Image.fromarray(warped_np, mode="RGBA")
    else:
        warped_rgba = Image.fromarray(warped_np, mode="RGB").convert("RGBA")

    metrics = {
        "head_height_ratio": target_head_ratio,
        "top_headroom_ratio": target_top_headroom,
        "target_size_px": (W, H),
        "angle_deg": angle_deg,
        "head_height": head_height,
        "scale": scale,
        "crown_y_mapped": dst_crown_y,
    }
    return warped_rgba, metrics