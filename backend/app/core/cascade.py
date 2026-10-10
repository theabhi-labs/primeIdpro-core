import os
import sys
import tempfile
import logging
from typing import Tuple, Optional, List
import numpy as np
import cv2

logger = logging.getLogger("primeidpro.cascade")


def _get_short_path_win32(long_path: str) -> str:
    """Returns the 8.3 ASCII-compatible short path on Windows to avoid Unicode C runtime fopen issues."""
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes

            _GetShortPathNameW = ctypes.windll.kernel32.GetShortPathNameW
            _GetShortPathNameW.argtypes = [wintypes.LPCWSTR, wintypes.LPWSTR, wintypes.DWORD]
            _GetShortPathNameW.restype = wintypes.DWORD

            buf_size = 500
            buf = ctypes.create_unicode_buffer(buf_size)
            res = _GetShortPathNameW(long_path, buf, buf_size)
            if res > 0 and buf.value:
                return buf.value
        except Exception:
            pass
    return long_path


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


def safe_load_cascade(path_or_filename: str) -> cv2.CascadeClassifier:
    """
    Safely load an OpenCV CascadeClassifier on Windows even when the filesystem path
    contains non-ASCII / Unicode characters (e.g. Hindi, Chinese, Russian, or accented usernames).
    """
    # 1. Resolve path if only filename was provided
    resolved_path = path_or_filename
    if not os.path.isabs(resolved_path) or not os.path.exists(resolved_path):
        try:
            resolved_path = get_cv2_data_path(path_or_filename)
        except Exception:
            pass

    if not os.path.exists(resolved_path):
        logger.warning(f"[Cascade] Cascade file not found on disk: {path_or_filename}")
        return cv2.CascadeClassifier()

    # 2. Try direct load
    cascade = cv2.CascadeClassifier(resolved_path)
    if not cascade.empty():
        return cascade

    # 3. Try Windows 8.3 Short Path (ASCII-safe)
    short_path = _get_short_path_win32(resolved_path)
    if short_path != resolved_path:
        cascade_short = cv2.CascadeClassifier(short_path)
        if not cascade_short.empty():
            logger.info(f"[Cascade] Loaded cascade via 8.3 short path: {short_path}")
            return cascade_short

    # 4. Copy XML bytes to a safe ASCII temp file
    try:
        with open(resolved_path, "rb") as f_in:
            xml_bytes = f_in.read()

        safe_temp_dir = tempfile.gettempdir()
        safe_temp_path = os.path.join(safe_temp_dir, f"primeid_cascade_{abs(hash(resolved_path))}.xml")

        with open(safe_temp_path, "wb") as f_out:
            f_out.write(xml_bytes)

        # In case safe_temp_path also has unicode username, get short path
        short_temp_path = _get_short_path_win32(safe_temp_path)
        cascade_temp = cv2.CascadeClassifier(short_temp_path)
        if not cascade_temp.empty():
            logger.info(f"[Cascade] Loaded cascade via safe ASCII temp path: {short_temp_path}")
            return cascade_temp
    except Exception as exc:
        logger.warning(f"[Cascade] Failed safe ASCII temp fallback for {path_or_filename}: {exc}")

    logger.error(f"[Cascade] Could not initialize CascadeClassifier for '{path_or_filename}'")
    return cv2.CascadeClassifier()


def load_cascade_classifiers() -> Tuple[cv2.CascadeClassifier, cv2.CascadeClassifier]:
    """Load primary and alternative frontal face cascades with Unicode path immunity."""
    primary_cascade = safe_load_cascade("haarcascade_frontalface_default.xml")
    alt_cascade = safe_load_cascade("haarcascade_frontalface_alt2.xml")
    return primary_cascade, alt_cascade


# --------------------------------------------------------------------------
# Unicode-Safe Image Read / Write Helpers
# --------------------------------------------------------------------------
def cv2_imread_unicode(path: str, flags: int = cv2.IMREAD_COLOR) -> Optional[np.ndarray]:
    """
    Reads an image from disk safely handling Windows paths containing non-ASCII / Unicode characters.
    """
    if not path or not os.path.exists(path):
        return None
    try:
        # np.fromfile uses wide-character Windows APIs, bypassing OpenCV ANSI fopen limitation
        data = np.fromfile(path, dtype=np.uint8)
        return cv2.imdecode(data, flags)
    except Exception:
        try:
            return cv2.imread(path, flags)
        except Exception:
            return None


def cv2_imwrite_unicode(path: str, img: np.ndarray, params: Optional[List[int]] = None) -> bool:
    """
    Writes an image to disk safely handling Windows paths containing non-ASCII / Unicode characters.
    """
    try:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        ext = os.path.splitext(path)[1] or ".png"
        ok, buf = cv2.imencode(ext, img, params or [])
        if ok:
            buf.tofile(path)
            return True
        return False
    except Exception:
        try:
            return bool(cv2.imwrite(path, img, params or []))
        except Exception:
            return False
