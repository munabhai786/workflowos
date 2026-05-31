from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


@dataclass
class SafeError:
    error_code: str
    message: str
    status_code: int = 500


USER_SAFE_ERRORS = {
    "DOCUMENT_ANALYSIS_FAILED": SafeError(
        "DOCUMENT_ANALYSIS_FAILED",
        "Unable to analyze document.",
        422,
    ),
    "DOCUMENT_EXTRACTION_FAILED": SafeError(
        "DOCUMENT_EXTRACTION_FAILED",
        "I couldn't extract readable content from this document.",
        422,
    ),
    "AI_SERVICE_UNAVAILABLE": SafeError(
        "AI_SERVICE_UNAVAILABLE",
        "I couldn't analyze this right now. Please try again.",
        503,
    ),
    "AI_SERVICE_TIMEOUT": SafeError(
        "AI_SERVICE_TIMEOUT",
        "The AI service took too long to respond. Please try again.",
        504,
    ),
    "AI_SERVICE_RATE_LIMITED": SafeError(
        "AI_SERVICE_RATE_LIMITED",
        "The AI service is temporarily busy. Please try again shortly.",
        429,
    ),
    "AI_CONFIGURATION_ERROR": SafeError(
        "AI_CONFIGURATION_ERROR",
        "AI analysis is temporarily unavailable.",
        503,
    ),
    "VALIDATION_ERROR": SafeError("VALIDATION_ERROR", "Invalid request.", 422),
    "UNSUPPORTED_FILE_TYPE": SafeError("UNSUPPORTED_FILE_TYPE", "Unsupported file type.", 415),
    "FILE_TOO_LARGE": SafeError("FILE_TOO_LARGE", "The uploaded file is too large.", 413),
    "INTERNAL_SERVER_ERROR": SafeError(
        "INTERNAL_SERVER_ERROR",
        "Something went wrong. Please try again.",
        500,
    ),
}


class AppError(Exception):
    def __init__(
        self,
        error_code: str,
        *,
        message: str | None = None,
        status_code: int | None = None,
        internal_message: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        safe = USER_SAFE_ERRORS.get(error_code, USER_SAFE_ERRORS["INTERNAL_SERVER_ERROR"])
        self.error_code = safe.error_code
        self.message = message or safe.message
        self.status_code = status_code or safe.status_code
        self.internal_message = internal_message or self.message
        self.details = details or {}
        super().__init__(self.internal_message)


def error_payload(error_code: str, message: str, request_id: str | None = None) -> dict[str, Any]:
    return {
        "success": False,
        "error_code": error_code,
        "message": message,
        "request_id": request_id,
    }


def app_error_response(exc: AppError, request_id: str | None = None) -> JSONResponse:
    logger.error(
        "Application error code=%s status=%s request_id=%s details=%s internal=%s",
        exc.error_code,
        exc.status_code,
        request_id,
        exc.details,
        exc.internal_message,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(exc.error_code, exc.message, request_id),
    )


def http_exception_response(exc: HTTPException, request_id: str | None = None) -> JSONResponse:
    detail = exc.detail
    if isinstance(detail, dict):
        code = detail.get("error_code") or "INTERNAL_SERVER_ERROR"
        message = detail.get("message") or USER_SAFE_ERRORS.get(code, USER_SAFE_ERRORS["INTERNAL_SERVER_ERROR"]).message
    elif exc.status_code == 413:
        code, message = "FILE_TOO_LARGE", USER_SAFE_ERRORS["FILE_TOO_LARGE"].message
    elif exc.status_code == 415:
        code, message = "UNSUPPORTED_FILE_TYPE", USER_SAFE_ERRORS["UNSUPPORTED_FILE_TYPE"].message
    elif 400 <= exc.status_code < 500:
        code, message = "VALIDATION_ERROR", str(detail or "Invalid request.")
    else:
        code, message = "INTERNAL_SERVER_ERROR", USER_SAFE_ERRORS["INTERNAL_SERVER_ERROR"].message

    logger.warning(
        "HTTP error code=%s status=%s request_id=%s internal_detail=%s",
        code,
        exc.status_code,
        request_id,
        detail,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(code, message, request_id),
    )


async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    return response
