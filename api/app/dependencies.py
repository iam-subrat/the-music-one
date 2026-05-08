from typing import Annotated
from uuid import UUID
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import get_db


_CSRF_EXEMPT_SUFFIXES = ("/leave",)


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
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return UUID(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def get_optional_user(request: Request) -> UUID | None:
    token = request.cookies.get("access_token")
    if not token:
        return None
    try:
        payload = jwt.decode(
            token, settings.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated"
        )
        return UUID(payload["sub"])
    except Exception:
        return None


# Repository DI — lazy imports to avoid circular dependency at module load time
def get_profile_repo(db: AsyncSession = Depends(get_db)):
    from app.repositories.profile_repo import ProfileRepository
    return ProfileRepository(db)

def get_session_repo(db: AsyncSession = Depends(get_db)):
    from app.repositories.session_repo import SessionRepository
    return SessionRepository(db)

def get_queue_repo(db: AsyncSession = Depends(get_db)):
    from app.repositories.queue_repo import QueueRepository
    return QueueRepository(db)

def get_skip_vote_repo(db: AsyncSession = Depends(get_db)):
    from app.repositories.skip_vote_repo import SkipVoteRepository
    return SkipVoteRepository(db)


# Service DI — lazy imports
def get_profile_service(db: AsyncSession = Depends(get_db)):
    from app.repositories.profile_repo import ProfileRepository
    from app.services.profile_service import ProfileService
    return ProfileService(ProfileRepository(db))

def get_session_service(db: AsyncSession = Depends(get_db)):
    from app.repositories.session_repo import SessionRepository
    from app.repositories.profile_repo import ProfileRepository
    from app.services.session_service import SessionService
    return SessionService(SessionRepository(db), ProfileRepository(db))

def get_queue_service(db: AsyncSession = Depends(get_db)):
    from app.repositories.queue_repo import QueueRepository
    from app.repositories.skip_vote_repo import SkipVoteRepository
    from app.services.queue_service import QueueService
    from app.services.song_service import SongService
    return QueueService(QueueRepository(db), SkipVoteRepository(db), SongService())

def get_song_service():
    from app.services.song_service import SongService
    return SongService()
