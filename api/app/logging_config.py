"""Structured JSON logging configuration for MusicOne API."""

import logging
import json
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """Formats log records as single-line JSON for log aggregation tools."""

    def format(self, record: logging.LogRecord) -> str:
        log_object: dict = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Include extra fields set by middleware
        for key in ("method", "path", "status_code", "duration_ms", "query_params",
                    "error_type", "error_message", "request_id"):
            if hasattr(record, key):
                log_object[key] = getattr(record, key)

        if record.exc_info:
            log_object["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(log_object, default=str)


def configure_logging(log_level: str = "INFO") -> None:
    """Configure root logger with JSON output to stdout.

    Called once at application startup. Subsequent calls are no-ops
    if handlers are already attached to the root logger.
    """
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    if root.handlers:
        # Already configured — update level only so we don't double-attach handlers
        root.setLevel(numeric_level)
        return

    root.setLevel(numeric_level)
    root.addHandler(handler)

    # Silence noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
