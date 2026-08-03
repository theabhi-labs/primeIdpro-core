from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

class SEOHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Add SEO headers
        response.headers["X-Robots-Tag"] = "index, follow"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # Cache control for static assets
        if request.url.path.startswith("/static") or request.url.path.startswith("/uploads"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        
        return response