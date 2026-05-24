"""Tests for structured logging middleware."""

import json
import logging
import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.middleware import LoggingMiddleware
from app.middleware.logging_middleware import _sanitise_query_params
from app.logging_config import JsonFormatter


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_app(status_code: int = 200, raise_exc: Exception | None = None) -> FastAPI:
    """Return a minimal FastAPI app with LoggingMiddleware attached."""
    test_app = FastAPI()
    test_app.add_middleware(LoggingMiddleware)

    @test_app.get("/test")
    async def endpoint():
        if raise_exc is not None:
            raise raise_exc
        return JSONResponse({"ok": True}, status_code=status_code)

    return test_app


# ---------------------------------------------------------------------------
# Unit tests — sanitise_query_params
# ---------------------------------------------------------------------------

class TestSanitiseQueryParams:
    def test_non_sensitive_keys_pass_through(self):
        params = {"q": "song title", "page": "1"}
        result = _sanitise_query_params(params)
        assert result == params

    def test_sensitive_keys_are_redacted(self):
        params = {"token": "abc123", "password": "secret", "q": "visible"}
        result = _sanitise_query_params(params)
        assert result["token"] == "[REDACTED]"
        assert result["password"] == "[REDACTED]"
        assert result["q"] == "visible"

    def test_case_insensitive_key_matching(self):
        params = {"Token": "abc", "ACCESS_TOKEN": "xyz"}
        result = _sanitise_query_params(params)
        assert result["Token"] == "[REDACTED]"
        assert result["ACCESS_TOKEN"] == "[REDACTED]"

    def test_empty_params(self):
        assert _sanitise_query_params({}) == {}

    def test_oauth_code_is_redacted(self):
        result = _sanitise_query_params({"code": "auth_code_123"})
        assert result["code"] == "[REDACTED]"


# ---------------------------------------------------------------------------
# Unit tests — JsonFormatter
# ---------------------------------------------------------------------------

class TestJsonFormatter:
    def _make_record(self, message: str, level: int = logging.INFO, **extra) -> logging.LogRecord:
        record = logging.LogRecord(
            name="test", level=level, pathname="", lineno=0,
            msg=message, args=(), exc_info=None,
        )
        for key, value in extra.items():
            setattr(record, key, value)
        return record

    def test_output_is_valid_json(self):
        formatter = JsonFormatter()
        record = self._make_record("hello")
        output = formatter.format(record)
        data = json.loads(output)
        assert data["message"] == "hello"
        assert data["level"] == "INFO"

    def test_extra_fields_included(self):
        formatter = JsonFormatter()
        record = self._make_record("req", method="GET", path="/api/test", status_code=200, duration_ms=12.5)
        data = json.loads(formatter.format(record))
        assert data["method"] == "GET"
        assert data["path"] == "/api/test"
        assert data["status_code"] == 200
        assert data["duration_ms"] == 12.5

    def test_timestamp_present(self):
        formatter = JsonFormatter()
        record = self._make_record("msg")
        data = json.loads(formatter.format(record))
        assert "timestamp" in data


# ---------------------------------------------------------------------------
# Integration tests — LoggingMiddleware via ASGI
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_middleware_logs_successful_request(caplog):
    test_app = _make_app(status_code=200)
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as c:
        with caplog.at_level(logging.INFO, logger="musicone.access"):
            response = await c.get("/test?q=hello")

    assert response.status_code == 200
    assert any("request completed" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_middleware_logs_status_code(caplog):
    test_app = _make_app(status_code=404)
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as c:
        with caplog.at_level(logging.WARNING, logger="musicone.access"):
            response = await c.get("/test")

    assert response.status_code == 404
    record = next(r for r in caplog.records if "request completed" in r.message)
    assert record.status_code == 404


@pytest.mark.asyncio
async def test_middleware_redacts_sensitive_query_params(caplog):
    test_app = _make_app(status_code=200)
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as c:
        with caplog.at_level(logging.INFO, logger="musicone.access"):
            await c.get("/test?token=supersecret&q=song")

    record = next(r for r in caplog.records if "request completed" in r.message)
    assert record.query_params.get("token") == "[REDACTED]"
    assert record.query_params.get("q") == "song"


@pytest.mark.asyncio
async def test_middleware_logs_duration_ms(caplog):
    test_app = _make_app(status_code=200)
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as c:
        with caplog.at_level(logging.INFO, logger="musicone.access"):
            await c.get("/test")

    record = next(r for r in caplog.records if "request completed" in r.message)
    assert hasattr(record, "duration_ms")
    assert record.duration_ms >= 0


@pytest.mark.asyncio
async def test_middleware_attaches_request_id(caplog):
    test_app = _make_app(status_code=200)
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as c:
        with caplog.at_level(logging.INFO, logger="musicone.access"):
            await c.get("/test")

    record = next(r for r in caplog.records if "request completed" in r.message)
    assert hasattr(record, "request_id")
    assert len(record.request_id) == 36  # UUID4 string length


@pytest.mark.asyncio
async def test_middleware_uses_error_log_level_for_5xx(caplog):
    test_app = _make_app(status_code=500)
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as c:
        with caplog.at_level(logging.ERROR, logger="musicone.access"):
            await c.get("/test")

    record = next(r for r in caplog.records if "request completed" in r.message)
    assert record.levelno == logging.ERROR


@pytest.mark.asyncio
async def test_middleware_uses_warning_log_level_for_4xx(caplog):
    test_app = _make_app(status_code=422)
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as c:
        with caplog.at_level(logging.WARNING, logger="musicone.access"):
            await c.get("/test")

    record = next(r for r in caplog.records if "request completed" in r.message)
    assert record.levelno == logging.WARNING
