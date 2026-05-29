"""Tests for three critical security fixes.

RED before each fix, GREEN after.
"""
import base64
import json
import pytest
from unittest.mock import MagicMock, patch


# ── helpers ──────────────────────────────────────────────────────────────────

def _b64url(data: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()


def _forge_token(alg: str, kid: str = "test-kid") -> str:
    header = _b64url({"alg": alg, "kid": kid, "typ": "JWT"})
    payload = _b64url({"sub": "attacker-uid", "aud": "authenticated", "exp": 9999999999})
    return f"{header}.{payload}.fakesig"


# ── Fix 1: JWT algorithm confusion ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_decode_always_uses_rs256_not_header_alg(monkeypatch):
    """jwt.decode must be called with pinned ['RS256'], never the header's alg value.

    Current bug: algorithms=[header["alg"]] lets an attacker supply alg=HS256
    and sign with the public EC key (which is public), bypassing auth.
    Fix: hardcode algorithms=["ES256"] (Supabase uses ECDSA P-256 for this project).
    """
    import app.dependencies as deps

    async def fake_public_key(_kid):
        return MagicMock()

    monkeypatch.setattr(deps, "_public_key", fake_public_key)

    captured: list[list] = []

    def spy_decode(token, key, algorithms, audience):
        captured.append(algorithms)
        raise Exception("stop here")

    hs256_token = _forge_token("HS256")

    with patch.object(deps.jwt, "decode", side_effect=spy_decode):
        try:
            await deps._decode(hs256_token)
        except Exception:
            pass

    assert len(captured) == 1, "jwt.decode was not called"
    assert captured[0] == ["ES256"], (
        f"Expected algorithms=['ES256'], got {captured[0]}. "
        "Server must not trust the unverified header's alg field."
    )


# ── Fix 2: Client-controlled skip threshold ──────────────────────────────────

def test_cast_vote_request_does_not_expose_threshold_to_client():
    """CastVoteRequest must not have a client-settable threshold field.

    Current bug: {"threshold": 1} in body → instant skip of any track.
    Fix: remove threshold from schema; router uses server-side SKIP_THRESHOLD.
    """
    from app.schemas.queue_item import CastVoteRequest

    req = CastVoteRequest.model_validate({"threshold": 1})
    assert not hasattr(req, "threshold"), (
        "threshold must not be a client-settable field — "
        "it lets any user force-skip by sending threshold=1"
    )


# ── Fix 3: Unauthenticated proxy endpoints ───────────────────────────────────

@pytest.mark.asyncio
async def test_youtube_lookup_requires_auth(client):
    """/api/youtube/ must reject unauthenticated requests.

    Current bug: no auth dependency — attacker drains server's YouTube API quota.
    Fix: add get_current_user dependency.
    """
    response = await client.get("/api/youtube/", params={"q": "test song"})
    assert response.status_code in {401, 403}, (
        f"Expected 401/403, got {response.status_code}. "
        "/api/youtube/ is an open proxy burning server API quota."
    )


@pytest.mark.asyncio
async def test_song_lookup_requires_auth(client):
    """/api/song/ must reject unauthenticated requests.

    Current bug: no auth — open Odesli proxy, quota drain.
    Fix: add get_current_user dependency.
    """
    response = await client.get(
        "/api/song/", params={"url": "https://open.spotify.com/track/abc"}
    )
    assert response.status_code in {401, 403}, (
        f"Expected 401/403, got {response.status_code}. "
        "/api/song/ is an open proxy burning server API quota."
    )
