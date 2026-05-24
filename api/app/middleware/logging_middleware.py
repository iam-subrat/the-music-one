"""Structured request/response logging middleware.

Logs every incoming request with method, path, sanitised query params,
status code, and wall-clock latency. 4xx/5xx responses additionally
include the exception type and message. Sensitive fields are redacted
before logging to prevent credential leakage.
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("musicone.access")

# Query-param keys whose values should never appear in logs
_SENSITIVE_PARAMS: frozenset[str] = frozenset({
    "token",
    "access_token",
    "refresh_token",
    "id_token",
    "password",
    "secret",
    "api_key",
    "apikey",
    "auth",
    "authorization",
    "code",          # OAuth authorisation code
    "code_verifier", # PKCE verifier
})

_REDACTED = "[REDACTED]"


def _sanitise_query_params(params: dict[str, str]) -> dict[str, str]:
    """Return a copy of *params* with sensitive values replaced."""
    return {
        k: (_REDACTED if k.lower() in _SENSITIVE_PARAMS else v)
        for k, v in params.items()
    }


class LoggingMiddleware(BaseHTTPMiddleware):
    """ASGI middleware that emits one structured log line per request."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = str(uuid.uuid4())
        start = time.perf_counter()

        sanitised_params = _sanitise_query_params(dict(request.query_params))

        response: Response | None = None
        exc_type: str | None = None
        exc_msg: str | None = None

        try:
            response = await call_next(request)
        except Exception as exc:  # noqa: BLE001
            exc_type = type(exc).__name__
            exc_msg = str(exc)
            # Re-raise so FastAPI's exception handlers still fire
            raise
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            status_code = response.status_code if response is not None else 500

            extra: dict = {
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "query_params": sanitised_params,
                "status_code": status_code,
                "duration_ms": duration_ms,
            }

            if exc_type is not None:
                extra["error_type"] = exc_type
                extra["error_message"] = exc_msg

            if status_code >= 500:
                logger.error("request completed", extra=extra)
            elif status_code >= 400:
                logger.warning("request completed", extra=extra)
            else:
                logger.info("request completed", extra=extra)

        return response
