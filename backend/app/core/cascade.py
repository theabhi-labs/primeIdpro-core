import os
import sys
import logging
import cv2

logger = logging.getLogger("primeidpro.cascade")


def get_cv2_data_path(filename: str) -> str:
    """
    Locate OpenCV cascade data file in both development and PyInstaller frozen EXE environments.
    """
    if getattr(sys, "frozen", False):
        base = os.path.dirname(sys.executable)
        candidates = [
            os.path.join(base, "_internal", "cv2", "data", filename),
            os.path.join(base, "cv2", "data", filename),
            getattr(sys, "_MEIPASS", "") and os.path.join(sys._MEIPASS, "cv2", "data", filename),
            getattr(sys, "_MEIPASS", "") and os.path.join(sys._MEIPASS, filename),
        ]
        for path in candidates:
            if path and os.path.exists(path):
                logger.info(f"Found frozen cascade at: {path}")
                return path

    dev_path = os.path.join(cv2.data.haarcascades, filename)
    if os.path.exists(dev_path):
        return dev_path

    raise FileNotFoundError(f"OpenCV cascade file '{filename}' could not be located.")


def load_cascade_classifiers():
    """Load primary and alternative frontal face cascades."""
    try:
        primary_path = get_cv2_data_path("haarcascade_frontalface_default.xml")
        primary_cascade = cv2.CascadeClassifier(primary_path)
    except Exception as e:
        logger.warning(f"Could not load primary cascade: {e}")
        primary_cascade = cv2.CascadeClassifier()

    try:
        alt_path = get_cv2_data_path("haarcascade_frontalface_alt2.xml")
        alt_cascade = cv2.CascadeClassifier(alt_path)
    except Exception as e:
        logger.warning(f"Could not load secondary cascade: {e}")
        alt_cascade = cv2.CascadeClassifier()

    return primary_cascade, alt_cascade
