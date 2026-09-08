import os
import io
import time
import base64
import logging
from typing import Optional
from PIL import Image
import requests

from app.core.config import settings

logger = logging.getLogger("primeidpro.cloud_remover")


def _prepare_optimized_image_payload(input_path: str, max_dimension: int = 1600) -> str:
    """
    Smart Pre-compression:
    If source image is excessively large (e.g. 24MP / 10MB JPEG),
    downsamples smoothly to max 1600px to optimize network bandwidth and cut API latency down to ~300ms.
    Returns base64 data URI string.
    """
    img = Image.open(input_path).convert("RGB")
    w, h = img.size
    
    if max(w, h) > max_dimension:
        scale = max_dimension / max(w, h)
        new_size = (int(w * scale), int(h * scale))
        img = img.resize(new_size, Image.Resampling.LANCZOS)
    
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    b64_str = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64_str}"


def remove_background_replicate(input_path: str, output_path: str, api_token: str) -> bool:
    """
    Remove background via Replicate API running BRIA RMBG-2.0:
    Model: briaai/rmbg-2.0
    Cost: ~$0.0007 / image (fractions of a cent)
    """
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
        "Prefer": "wait"
    }

    payload_uri = _prepare_optimized_image_payload(input_path)
    
    request_body = {
        "input": {
            "image": payload_uri
        }
    }

    t0 = time.time()
    try:
        response = requests.post(
            "https://api.replicate.com/v1/models/bria/remove-background/predictions",
            headers=headers,
            json=request_body,
            timeout=35.0
        )

        if response.status_code not in (200, 201):
            logger.warning(f"Replicate RMBG-2.0 HTTP error {response.status_code}: {response.text}")
            return False

        pred = response.json()
        output_url = pred.get("output")
        
        # If asynchronous polling is needed
        if not output_url and pred.get("status") in ("starting", "processing"):
            poll_url = pred.get("urls", {}).get("get")
            if not poll_url:
                return False
            
            for _ in range(30):
                time.sleep(0.5)
                poll_resp = requests.get(poll_url, headers=headers, timeout=10.0)
                if poll_resp.status_code == 200:
                    poll_data = poll_resp.json()
                    if poll_data.get("status") == "succeeded":
                        output_url = poll_data.get("output")
                        break
                    elif poll_data.get("status") == "failed":
                        logger.error(f"Replicate prediction failed: {poll_data.get('error')}")
                        return False

        if not output_url:
            logger.error("No output URL received from RMBG-2.0")
            return False

        # Download resulting transparent PNG
        img_resp = requests.get(output_url, timeout=20.0)
        if img_resp.status_code == 200:
            pil_res = Image.open(io.BytesIO(img_resp.content)).convert("RGBA")
            pil_res.save(output_path, "PNG")
            t1 = time.time()
            logger.info(f"✅ RMBG-2.0 Cloud AI succeeded in {t1 - t0:.2f}s -> {output_path}")
            return True
        else:
            logger.error(f"Failed to download RMBG-2.0 image from {output_url}")
            return False
    except Exception as e:
        logger.warning(f"Replicate RMBG-2.0 request failed: {e}")
        return False


def remove_background_custom_endpoint(input_path: str, output_path: str, endpoint_url: str, auth_token: Optional[str] = None) -> bool:
    """
    Remove background via Custom Serverless / FastAPI Endpoint (e.g. RunPod / Modal).
    """
    headers = {}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    payload_uri = _prepare_optimized_image_payload(input_path)
    
    t0 = time.time()
    try:
        response = requests.post(
            endpoint_url,
            headers=headers,
            json={"image": payload_uri},
            timeout=35.0
        )

        if response.status_code == 200:
            content_type = response.headers.get("content-type", "")
            if "image" in content_type:
                pil_res = Image.open(io.BytesIO(response.content)).convert("RGBA")
            else:
                data = response.json()
                if "image" in data and data["image"].startswith("data:image"):
                    b64_data = data["image"].split(",", 1)[1]
                    pil_res = Image.open(io.BytesIO(base64.b64decode(b64_data))).convert("RGBA")
                elif "url" in data:
                    img_resp = requests.get(data["url"], timeout=20.0)
                    pil_res = Image.open(io.BytesIO(img_resp.content)).convert("RGBA")
                else:
                    return False

            pil_res.save(output_path, "PNG")
            t1 = time.time()
            logger.info(f"✅ Custom RMBG-2.0 Serverless succeeded in {t1 - t0:.2f}s -> {output_path}")
            return True
        return False
    except Exception as e:
        logger.warning(f"Custom RMBG-2.0 endpoint failed: {e}")
        return False


def remove_background_rmbg2_sync(input_path: str, output_path: str) -> bool:
    """
    Unified entry point for RMBG-2.0 Cloud AI:
    Checks configured provider (Replicate / Bria / Custom Serverless) and runs removal.
    Returns True if succeeded, False if cloud is disabled/unconfigured/failed.
    """
    if not getattr(settings, "rmbg_enabled", True):
        return False

    replicate_token = getattr(settings, "replicate_api_token", "") or os.environ.get("REPLICATE_API_TOKEN", "")
    custom_endpoint = getattr(settings, "custom_rmbg_endpoint", "") or os.environ.get("RMBG_CUSTOM_ENDPOINT", "")

    # 1. Check Custom Endpoint (e.g. RunPod / Modal)
    if custom_endpoint:
        ok = remove_background_custom_endpoint(input_path, output_path, custom_endpoint, auth_token=replicate_token)
        if ok:
            return True

    # 2. Check Replicate RMBG-2.0
    if replicate_token:
        ok = remove_background_replicate(input_path, output_path, replicate_token)
        if ok:
            return True

    return False
