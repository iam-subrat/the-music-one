from uuid import UUID
import httpx
from fastapi import Depends, HTTPException, Request, status
from jose import jwk, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import get_db

_JWKS_CACHE: dict | None = None


async def _refresh_jwks() -> None:
    global _JWKS_CACHE
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
        )
        _JWKS_CACHE = res.json()


async def _public_key(kid: str):
    if _JWKS_CACHE is None:
        await _refresh_jwks()
    for key in (_JWKS_CACHE or {}).get("keys", []):
        if key.get("kid") == kid:
            return jwk.construct(key)
    # kid not found — rotated key; refresh once and retry
    await _refresh_jwks()
    for key in (_JWKS_CACHE or {}).get("keys", []):
        if key.get("kid") == kid:
            return jwk.construct(key)
    raise ValueError(f"kid {kid!r} not in JWKS")


async def _decode(token: str):
    header = jwt.get_unverified_header(token)
    key = await _public_key(header["kid"])
    return jwt.decode(token, key, algorithms=["ES256"], audience="authenticated")


_CSRF_EXEMPT_SUFFIXES = ("/leave", "/mobile/exchange", "/mobile/refresh")


def _require_xrw(request: Request) -> None:
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    # sendBeacon cannot set custom headers — exempt leave endpoint (cookie auth still enforced)
    if any(request.url.path.endswith(s) for s in _CSRF_EXEMPT_SUFFIXES):
        return
    if request.headers.get("X-Requested-With") != "XMLHttpRequest":
        raise HTTPException(status_code=403, detail="CSRF check failed")


async def get_current_user(
    request: Request,
    _csrf: None = Depends(_require_xrw),
) -> UUID:
    token = (
        request.cookies.get("access_token")
        or request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        or None
    )
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    try:
        payload = await _decode(token)
        return UUID(payload["sub"])
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from exc


async def get_optional_user(request: Request) -> UUID | None:
    _require_xrw(request)
    token = (
        request.cookies.get("access_token")
        or request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        or None
    )
    if not token:
        return None
    try:
        payload = await _decode(token)
        return UUID(payload["sub"])
    except Exception:
        return None


def get_store(db: AsyncSession = Depends(get_db)):
    from app.store import Store

    return Store(db)


def get_profile_service(store=Depends(get_store)):
    from app.services.profile_service import ProfileService

    return ProfileService(store)


def get_session_service(store=Depends(get_store)):
    from app.services.session_service import SessionService

    return SessionService(store)


def get_queue_service(store=Depends(get_store)):
    from app.services.queue_service import QueueService
    from app.services.song_service import SongService

    return QueueService(store, SongService())


def get_song_service():
    from app.services.song_service import SongService

    return SongService()
