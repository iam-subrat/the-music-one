import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.responses import JSONResponse

from app.middleware.rate_limit import RateLimitMiddleware, RateLimiter, get_client_ip


def create_test_app(default_limit=5, strict_limit=2, enabled=True):
    app = FastAPI()
    limiter = RateLimiter(
        default_limit=default_limit, strict_limit=strict_limit, window_seconds=60
    )
    app.add_middleware(RateLimitMiddleware, limiter=limiter, enabled=enabled)

    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    @app.get("/api/items")
    async def get_items():
        return {"items": []}

    @app.get("/api/song")
    async def song_lookup():
        return {"song": "test"}

    @app.get("/api/youtube")
    async def youtube_lookup():
        return {"youtube": "test"}

    @app.get("/api/playlists/preview")
    async def preview_playlist():
        return {"playlist": "test"}

    @app.post("/api/auth/google")
    async def auth_google():
        return {"auth": "google"}

    @app.get("/api/auth/me")
    async def auth_me():
        return {"user": "test"}

    @app.get("/api/sessions/{session_id}/stream")
    async def sse_stream(session_id: str):
        return {"stream": "connected"}

    return app


def test_standard_route_rate_limiting():
    app = create_test_app(default_limit=3, strict_limit=2)
    client = TestClient(app)

    # First 3 requests to standard route succeed
    for i in range(3):
        res = client.get("/api/items")
        assert res.status_code == 200
        assert "X-RateLimit-Limit" in res.headers
        assert res.headers["X-RateLimit-Limit"] == "3"
        assert res.headers["X-RateLimit-Remaining"] == str(3 - (i + 1))

    # 4th request exceeds rate limit -> 429
    res = client.get("/api/items")
    assert res.status_code == 429
    assert res.json()["error"] == "rate_limit_exceeded"
    assert "Retry-After" in res.headers
    assert res.headers["X-RateLimit-Remaining"] == "0"


def test_strict_routes_rate_limiting():
    app = create_test_app(default_limit=10, strict_limit=2)
    client = TestClient(app)

    # Test /api/song strict rate limiting
    res1 = client.get("/api/song")
    assert res1.status_code == 200
    assert res1.headers["X-RateLimit-Limit"] == "2"

    res2 = client.get("/api/song")
    assert res2.status_code == 200

    # 3rd request to /api/song fails
    res3 = client.get("/api/song")
    assert res3.status_code == 429
    assert res3.json()["error"] == "rate_limit_exceeded"

    # Test /api/youtube is also strict
    client2 = TestClient(app)
    res_yt1 = client2.get("/api/youtube", headers={"X-Forwarded-For": "3.3.3.3"})
    assert res_yt1.status_code == 200
    assert res_yt1.headers["X-RateLimit-Limit"] == "2"

    client2.get("/api/youtube", headers={"X-Forwarded-For": "3.3.3.3"})
    res_yt3 = client2.get("/api/youtube", headers={"X-Forwarded-For": "3.3.3.3"})
    assert res_yt3.status_code == 429

    # Standard route still has capacity
    res_std = client.get("/api/items")
    assert res_std.status_code == 200


def test_auth_routes_rate_limiting():
    app = create_test_app(default_limit=10, strict_limit=2)
    client = TestClient(app)

    # Sensitive auth route hits strict limit (2)
    client.post("/api/auth/google")
    client.post("/api/auth/google")
    res_auth = client.post("/api/auth/google")
    assert res_auth.status_code == 429

    # /api/auth/me uses default limit (10)
    res_me = client.get("/api/auth/me")
    assert res_me.status_code == 200
    assert res_me.headers["X-RateLimit-Limit"] == "10"


def test_exempt_routes():
    app = create_test_app(default_limit=2, strict_limit=1)
    client = TestClient(app)

    # Spamming healthcheck 10 times does not trigger 429
    for _ in range(10):
        res = client.get("/api/health")
        assert res.status_code == 200

    # Spamming SSE stream route (/api/sessions/<id>/stream) does not trigger 429
    for _ in range(10):
        res = client.get("/api/sessions/2411375f-64a3-4b7e-9aeb-acd1a9a7ac36/stream")
        assert res.status_code == 200


def test_options_cors_preflight_bypass():
    app = create_test_app(default_limit=1, strict_limit=1)
    client = TestClient(app)

    # OPTIONS requests are never throttled
    for _ in range(5):
        res = client.options("/api/song")
        assert res.status_code in {200, 405}


def test_root_path_normalization():
    limiter = RateLimiter(default_limit=10, strict_limit=2)
    # Direct vs proxied path
    limit1, bucket1 = limiter._get_limit_for_path("/api/song")
    limit2, bucket2 = limiter._get_limit_for_path("/musicone/api/song")
    limit3, bucket3 = limiter._get_limit_for_path("/musicone-staging/api/song")
    assert (limit1, bucket1) == (limit2, bucket2) == (limit3, bucket3) == (2, "strict")


def test_ip_isolation():
    app = create_test_app(default_limit=2, strict_limit=1)
    client = TestClient(app)

    # Client IP 1 hits limit
    client.get("/api/items", headers={"X-Forwarded-For": "1.1.1.1"})
    client.get("/api/items", headers={"X-Forwarded-For": "1.1.1.1"})
    res1 = client.get("/api/items", headers={"X-Forwarded-For": "1.1.1.1"})
    assert res1.status_code == 429

    # Client IP 2 should still be allowed
    res2 = client.get("/api/items", headers={"X-Forwarded-For": "2.2.2.2"})
    assert res2.status_code == 200


def test_disabled_rate_limiter():
    app = create_test_app(default_limit=1, strict_limit=1, enabled=False)
    client = TestClient(app)

    for _ in range(5):
        res = client.get("/api/items")
        assert res.status_code == 200
