"""OAuth PKCE flow tests.

Note: Login-CSRF via custom `state` param is not implemented because Supabase uses
`state` internally for its own OAuth session tracking — injecting a custom value
breaks the flow. PKCE already prevents the attack: an attacker's auth code cannot
be exchanged with a victim's pkce_verifier cookie.
"""
from __future__ import annotations

import pytest
from app.services.auth_service import AuthService


def test_build_oauth_url_contains_pkce_challenge():
    svc = AuthService(supabase_url="https://x.supabase.co", anon_key="key")
    url = svc.build_oauth_url(
        challenge="test_challenge",
        redirect_uri="https://example.com/callback",
    )
    assert "code_challenge=test_challenge" in url
    assert "code_challenge_method=S256" in url


def test_build_oauth_url_does_not_inject_state():
    """Must not pass custom state to Supabase — it owns that param."""
    svc = AuthService(supabase_url="https://x.supabase.co", anon_key="key")
    url = svc.build_oauth_url(
        challenge="test_challenge",
        redirect_uri="https://example.com/callback",
    )
    assert "state=" not in url


@pytest.mark.anyio
async def test_auth_callback_rejects_missing_pkce_verifier(client):
    """Callback with no pkce_verifier cookie must return 400."""
    response = await client.get(
        "/api/auth/callback",
        params={"code": "some_code"},
        follow_redirects=False,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing PKCE verifier"
