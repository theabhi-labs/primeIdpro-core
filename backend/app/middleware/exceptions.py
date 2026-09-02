import logging
from fastapi import Request, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("primeidpro.exceptions")


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    missing_fields = [
        ".".join(str(p) for p in err["loc"] if p != "body")
        for err in exc.errors()
    ]
    logger.warning(f"Validation failed on {request.url.path}: {missing_fields}")
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": f"Missing or invalid field(s): {', '.join(missing_fields) or 'unknown'}",
            "details": exc.errors(),
        },
    )


async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception on {request.method} {request.url.path}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": f"Internal server error: {str(exc)}",
        },
    )


def register_exception_handlers(app: FastAPI):
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
