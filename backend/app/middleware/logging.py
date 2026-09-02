import logging
from datetime import datetime
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("primeidpro.http")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = datetime.now()
        try:
            response = await call_next(request)
        except Exception as exc:
            logger.exception(f"Unhandled error in {request.method} {request.url.path}: {exc}")
            raise
        elapsed = (datetime.now() - start).total_seconds()
        logger.info(f"{request.method} {request.url.path} -> {response.status_code} ({elapsed:.3f}s)")
        return response