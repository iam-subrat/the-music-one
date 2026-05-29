"""Tests for OAuth state parameter (login-CSRF protection)."""
from __future__ import annotations

import pytest
from app.services.auth_service import AuthService


# ---------------------------------------------------------------------------
# Unit test: AuthService.build_oauth_url must embed state
# ---------------------------------------------------------------------------

def test_build_oauth_url_includes_state_param():
    svc = AuthService(supabase_url="https://x.supabase.co", anon_key="key")
    url = svc.build_oauth_url(
        challenge="test_challenge",
        redirect_uri="https://example.com/callback",
        state="abc123",
    )
    assert "state=abc123" in url


# ---------------------------------------------------------------------------
# Integration tests: /auth/callback state-cookie validation
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_auth_callback_rejects_missing_state_cookie(client):
    """Callback with no state_token cookie must return 400 with 'Invalid state' detail.

    The state check must fire before exchange_code — so the error detail must be
    'Invalid state', not 'Token exchange failed'.
    """
    response = await client.get(
        "/api/auth/callback",
        params={"code": "some_code", "state": "some_state"},
        cookies={"pkce_verifier": "some_verifier"},
        follow_redirects=False,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid state"


@pytest.mark.anyio
async def test_auth_callback_rejects_mismatched_state(client):
    """Callback where state query param != state_token cookie must return 400.

    The state check must fire before exchange_code — so the error detail must be
    'Invalid state', not 'Token exchange failed'.
    """
    response = await client.get(
        "/api/auth/callback",
        params={"code": "some_code", "state": "wrong"},
        cookies={"pkce_verifier": "some_verifier", "state_token": "correct"},
        follow_redirects=False,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid state"
