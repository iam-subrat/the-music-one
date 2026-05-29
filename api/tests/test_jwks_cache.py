import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import app.dependencies as deps


def _make_jwks_response(kid: str) -> MagicMock:
    """Build a fake httpx response whose .json() returns a JWKS with one key."""
    response = MagicMock()
    response.json.return_value = {"keys": [{"kid": kid, "kty": "EC"}]}
    return response


def _reset_cache() -> None:
    """Reset module-level cache state between tests."""
    deps._JWKS_CACHE = None
    deps._JWKS_FETCHED_AT = 0.0


@pytest.mark.asyncio
async def test_jwks_cache_refetches_after_ttl_expires():
    """
    First call fetches JWKS (1 HTTP call).
    Second call within TTL uses cache (still 1 HTTP call).
    Third call after TTL expires refetches (2 HTTP calls total).
    """
    _reset_cache()

    fake_key = MagicMock()
    fake_response = _make_jwks_response("kid-a")

    mock_get = AsyncMock(return_value=fake_response)

    with patch("httpx.AsyncClient") as mock_client_cls, \
         patch("app.dependencies.jwk") as mock_jwk, \
         patch("app.dependencies.time") as mock_time:

        mock_client_cls.return_value.__aenter__ = AsyncMock(
            return_value=MagicMock(get=mock_get)
        )
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_jwk.construct.return_value = fake_key

        # Simulate current time = 1000.0
        mock_time.time.return_value = 1000.0

        # First call — fetches
        result1 = await deps._public_key("kid-a")
        assert result1 is fake_key
        assert mock_get.call_count == 1

        # Second call within TTL — no refetch
        mock_time.time.return_value = 1000.0 + deps._JWKS_TTL - 1
        result2 = await deps._public_key("kid-a")
        assert result2 is fake_key
        assert mock_get.call_count == 1  # still 1

        # Third call past TTL — refetches
        mock_time.time.return_value = 1000.0 + deps._JWKS_TTL + 1
        result3 = await deps._public_key("kid-a")
        assert result3 is fake_key
        assert mock_get.call_count == 2  # now 2


@pytest.mark.asyncio
async def test_jwks_cache_refetches_on_unknown_kid():
    """
    First call with 'old-kid' succeeds (1 fetch).
    Second call with 'new-kid' misses cache, refetches, finds key (2 fetches total).
    """
    _reset_cache()

    fake_old_key = MagicMock()
    fake_new_key = MagicMock()

    old_response = _make_jwks_response("old-kid")
    new_response = _make_jwks_response("new-kid")

    # First get() returns old JWKS; subsequent get() returns new JWKS
    mock_get = AsyncMock(side_effect=[old_response, new_response])

    with patch("httpx.AsyncClient") as mock_client_cls, \
         patch("app.dependencies.jwk") as mock_jwk, \
         patch("app.dependencies.time") as mock_time:

        mock_client_cls.return_value.__aenter__ = AsyncMock(
            return_value=MagicMock(get=mock_get)
        )
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        # Return different key objects based on what was constructed
        def construct_side_effect(key_data):
            return fake_old_key if key_data.get("kid") == "old-kid" else fake_new_key

        mock_jwk.construct.side_effect = construct_side_effect
        mock_time.time.return_value = 1000.0

        # First call with old-kid — fetches once
        result1 = await deps._public_key("old-kid")
        assert result1 is fake_old_key
        assert mock_get.call_count == 1

        # Still within TTL, so cache is not expired — but new-kid not present
        # Expected: cache miss triggers a refresh (2nd fetch)
        result2 = await deps._public_key("new-kid")
        assert result2 is fake_new_key
        assert mock_get.call_count == 2


@pytest.mark.asyncio
async def test_jwks_cache_raises_after_refetch_if_kid_still_missing():
    """
    JWKS never contains the requested kid.
    Expects: initial fetch + one retry fetch → ValueError raised.
    """
    _reset_cache()

    always_wrong_response = _make_jwks_response("other-kid")
    mock_get = AsyncMock(return_value=always_wrong_response)

    with patch("httpx.AsyncClient") as mock_client_cls, \
         patch("app.dependencies.jwk"), \
         patch("app.dependencies.time") as mock_time:

        mock_client_cls.return_value.__aenter__ = AsyncMock(
            return_value=MagicMock(get=mock_get)
        )
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_time.time.return_value = 1000.0

        with pytest.raises(ValueError, match="missing-kid"):
            await deps._public_key("missing-kid")

        # initial fetch + one retry = 2 HTTP calls
        assert mock_get.call_count == 2
