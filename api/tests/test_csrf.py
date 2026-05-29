"""CSRF hardening tests — TDD.

RED phase: write tests that expose the gaps BEFORE implementing fixes.

Bug 7: get_optional_user has no CSRF check — any future state-changing
       router using it would be CSRF-exposed.
Bug 5: Settings with cookie_samesite="none" should emit a logged warning
       to alert operators that CSRF protection is weakened.
"""
import logging
import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_request(method: str, path: str = "/api/test", headers: dict | None = None):
    """Build a minimal Starlette Request-like mock for unit testing."""
    from starlette.datastructures import Headers, URL
    from starlette.requests import Request

    scope = {
        "type": "http",
        "method": method.upper(),
        "path": path,
        "query_string": b"",
        "headers": [
            (k.lower().encode(), v.encode())
            for k, v in (headers or {}).items()
        ],
    }
    return Request(scope)


# ── Bug 7: get_optional_user must enforce CSRF on mutating methods ────────────

@pytest.mark.asyncio
async def test_get_optional_user_rejects_state_changing_method_without_xrw():
    """get_optional_user must raise 403 on POST without X-Requested-With header.

    Current bug: get_optional_user skips _require_xrw entirely, so any future
    router using it on a mutating endpoint is CSRF-exposed.
    Fix: add _require_xrw as a Depends on get_optional_user.
    """
    import app.dependencies as deps

    request = _make_request("POST", "/api/test")

    with pytest.raises(HTTPException) as exc_info:
        await deps.get_optional_user(request)

    assert exc_info.value.status_code == 403, (
        f"Expected 403, got {exc_info.value.status_code}. "
        "get_optional_user must enforce CSRF on mutating methods."
    )


@pytest.mark.asyncio
async def test_get_optional_user_allows_get_without_xrw():
    """GET requests must pass through get_optional_user without CSRF error.

    CSRF check is a no-op for safe methods — GET/HEAD/OPTIONS should never
    be blocked regardless of headers.
    """
    import app.dependencies as deps

    request = _make_request("GET", "/api/test")
    # No token in cookies → should return None, not raise
    result = await deps.get_optional_user(request)
    assert result is None, (
        "GET with no token should return None, not raise."
    )


@pytest.mark.asyncio
async def test_get_optional_user_allows_post_with_xrw_header():
    """POST with X-Requested-With: XMLHttpRequest must pass CSRF check.

    Legitimate same-origin fetch requests supply this header and should
    not be blocked.
    """
    import app.dependencies as deps

    request = _make_request(
        "POST",
        "/api/test",
        headers={"X-Requested-With": "XMLHttpRequest"},
    )
    # No token in cookies → should return None, not raise
    result = await deps.get_optional_user(request)
    assert result is None, (
        "POST with X-Requested-With header and no token should return None."
    )


# ── Bug 5: Settings must warn when cookie_samesite="none" ────────────────────

def test_config_warns_when_cookie_samesite_is_none(caplog):
    """Settings must emit a warning when cookie_samesite_value is "none".

    When COOKIE_SAMESITE=none the browser sends cookies on cross-site requests,
    effectively disabling SameSite-based CSRF protection.  An operator warning
    is the minimum guard to prevent silent mis-configuration.
    """
    import importlib
    import app.config as config_module

    logger_name = "musicone.config"

    with caplog.at_level(logging.WARNING, logger=logger_name):
        settings_instance = config_module.Settings(
            database_url="postgresql://user:pass@localhost/db",
            supabase_url="https://example.supabase.co",
            supabase_anon_key="anon-key",
            cookie_samesite="none",
        )

    assert settings_instance.cookie_samesite_value == "none"

    warning_messages = [
        r.message for r in caplog.records
        if r.name == logger_name and r.levelno == logging.WARNING
    ]
    assert warning_messages, (
        "Expected a WARNING log from 'musicone.config' when "
        "cookie_samesite='none', but none was emitted. "
        "Operators must be alerted that CSRF protection is weakened."
    )
    assert any("none" in m.lower() or "csrf" in m.lower() for m in warning_messages), (
        "Warning message should mention 'none' or 'csrf' to be actionable."
    )


def test_config_does_not_warn_for_lax_samesite(caplog):
    """Settings must NOT warn when cookie_samesite='lax' (the safe default)."""
    import app.config as config_module

    logger_name = "musicone.config"

    with caplog.at_level(logging.WARNING, logger=logger_name):
        config_module.Settings(
            database_url="postgresql://user:pass@localhost/db",
            supabase_url="https://example.supabase.co",
            supabase_anon_key="anon-key",
            cookie_samesite="lax",
        )

    warning_messages = [
        r.message for r in caplog.records
        if r.name == logger_name and r.levelno == logging.WARNING
    ]
    assert not warning_messages, (
        f"Unexpected WARNING for samesite='lax': {warning_messages}"
    )
