"""Rate limiting middleware using an in-memory sliding window algorithm.

Protects API endpoints against Denial of Service (DoS) and brute force attacks.
Applies strict limits to expensive routes (external API proxies, auth), standard limits
to general routes, and exempts healthcheck and long-lived SSE connections.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict, deque
from typing import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("musicone.rate_limit")


def get_client_ip(request: Request) -> str:
    """Extract real client IP address from headers or connection."""
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


class RateLimiter:
    """In-memory sliding window rate limiter."""

    def __init__(
        self,
        default_limit: int = 100,
        strict_limit: int = 15,
        window_seconds: int = 60,
        cleanup_interval: int = 300,
    ) -> None:
        self.default_limit = default_limit
        self.strict_limit = strict_limit
        self.window_seconds = window_seconds
        self.cleanup_interval = cleanup_interval

        self._history: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()
        self._last_cleanup = time.time()

        # High-cost endpoints: external metadata/search APIs & sensitive auth routes
        self.strict_prefixes = (
            "/api/song",  # External Odesli / streaming link resolution
            "/api/youtube",  # External YouTube search API
            "/api/playlists/preview",  # External Spotify / YouTube playlist fetching
            "/api/auth",  # Authentication & OAuth token exchanges
        )

        # Exempted endpoints: health checks
        self.exempt_prefixes = ("/api/health",)

    def _normalize_path(self, path: str) -> str:
        """Strip deployment root prefixes and trailing slashes for consistent matching."""
        for prefix in ("/musicone-staging", "/musicone"):
            if path.startswith(prefix):
                path = path[len(prefix) :]
        return path.rstrip("/") or "/"

    def _get_limit_for_path(self, raw_path: str) -> tuple[int, str] | None:
        """Returns (limit, bucket_type) or None if path is exempt."""
        path = self._normalize_path(raw_path)

        # Exempt health check
        if any(path == p or path.startswith(p + "/") for p in self.exempt_prefixes):
            return None

        # Exempt SSE streaming endpoints (e.g. /api/sessions/{session_id}/stream)
        if path.endswith("/stream") or "/events" in path:
            return None

        # Light read-only auth check and logout use default limit
        if path in {"/api/auth/me", "/api/auth/logout"}:
            return self.default_limit, "default"

        # Strict rate limits on expensive / sensitive endpoints
        if any(path == p or path.startswith(p + "/") for p in self.strict_prefixes):
            return self.strict_limit, "strict"

        return self.default_limit, "default"

    async def is_rate_limited(
        self, ip: str, path: str
    ) -> tuple[bool, int, int, int, int]:
        """Check if request from IP for path is rate limited.

        Returns: (is_limited, limit, remaining, reset_seconds, retry_after)
        """
        limit_info = self._get_limit_for_path(path)
        if limit_info is None:
            return False, 0, 0, 0, 0

        limit, bucket = limit_info
        key = f"{ip}:{bucket}"
        now = time.time()
        window_start = now - self.window_seconds

        async with self._lock:
            if now - self._last_cleanup > self.cleanup_interval:
                self._cleanup_stale_keys(now)

            history = self._history[key]
            while history and history[0] <= window_start:
                history.popleft()

            current_count = len(history)

            if current_count >= limit:
                oldest = history[0] if history else now
                reset_seconds = max(1, int(oldest + self.window_seconds - now))
                retry_after = reset_seconds
                return True, limit, 0, reset_seconds, retry_after

            history.append(now)
            remaining = limit - len(history)
            reset_seconds = self.window_seconds
            return False, limit, remaining, reset_seconds, 0

    def _cleanup_stale_keys(self, now: float) -> None:
        """Clean up keys with no active requests in the current window."""
        window_start = now - self.window_seconds
        stale_keys = []
        for k, timestamps in self._history.items():
            while timestamps and timestamps[0] <= window_start:
                timestamps.popleft()
            if not timestamps:
                stale_keys.append(k)

        for k in stale_keys:
            del self._history[k]

        self._last_cleanup = now


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware enforcing sliding-window rate limits per IP."""

    def __init__(
        self,
        app,
        limiter: RateLimiter | None = None,
        enabled: bool = True,
    ) -> None:
        super().__init__(app)
        self.limiter = limiter or RateLimiter()
        self.enabled = enabled

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        # Pass through when disabled or for CORS preflight OPTIONS requests
        if not self.enabled or request.method == "OPTIONS":
            return await call_next(request)

        ip = get_client_ip(request)
        path = request.url.path

        (
            is_limited,
            limit,
            remaining,
            reset_seconds,
            retry_after,
        ) = await self.limiter.is_rate_limited(ip, path)

        if is_limited:
            logger.warning(
                "rate limit exceeded",
                extra={
                    "client_ip": ip,
                    "path": path,
                    "limit": limit,
                    "retry_after": retry_after,
                },
            )
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests. Please try again later.",
                    "error": "rate_limit_exceeded",
                    "retry_after": retry_after,
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(reset_seconds),
                },
            )

        response = await call_next(request)

        if limit > 0:
            response.headers["X-RateLimit-Limit"] = str(limit)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            response.headers["X-RateLimit-Reset"] = str(reset_seconds)

        return response
