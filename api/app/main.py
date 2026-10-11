import asyncio
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError
from app.repositories.db_auth import playback_request_version
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.logging_config import configure_logging
from app.middleware import LoggingMiddleware, RateLimitMiddleware, RateLimiter
from app.services.event_bus import bus
from app.services.session_cleanup import run_session_cleanup
from app.routers import (
    auth,
    sessions,
    items,
    profiles,
    songs,
    youtube,
    flags,
    events,
    playlists,
    mobile_auth,
)

configure_logging(settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup = asyncio.create_task(run_session_cleanup(), name='session-expiry-cleanup')
    try:
        yield
    finally:
        cleanup.cancel()
        with suppress(asyncio.CancelledError):
            await cleanup
        bus.shutdown()


app = FastAPI(title="MusicOne API", root_path=settings.root_path, lifespan=lifespan)


@app.middleware('http')
async def playback_version_context(request, call_next):
    version = request.headers.get('X-Playback-Mode-Version', '')
    if version and (not version.isdigit() or len(version) > 9):
        return JSONResponse(status_code=422, content={'detail': 'Invalid playback mode version'})
    token = playback_request_version.set(version)
    try:
        return await call_next(request)
    finally:
        playback_request_version.reset(token)


@app.exception_handler(PermissionError)
async def permission_error(_request, error):
    return JSONResponse(status_code=403, content={'detail': str(error)})


@app.exception_handler(DBAPIError)
async def playback_database_error(_request, error):
    message = str(error.orig)
    if 'Playback conflict:' in message:
        return JSONResponse(status_code=409, content={'detail': 'Room playback changed or is unavailable. Refresh the room and try again.'})
    if 'Only the host can change the room mode' in message:
        return JSONResponse(status_code=403, content={'detail': 'Only the host can change the room mode'})
    raise error

rate_limiter = RateLimiter(
    default_limit=settings.rate_limit_default_per_minute,
    strict_limit=settings.rate_limit_strict_per_minute,
)

# LoggingMiddleware must be added before CORSMiddleware so it captures
# the actual response status (including CORS preflight 200s).
app.add_middleware(LoggingMiddleware)
app.add_middleware(
    RateLimitMiddleware,
    limiter=rate_limiter,
    enabled=settings.rate_limit_enabled,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# routes
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(items.router, prefix="/api/items", tags=["items"])
app.include_router(profiles.router, prefix="/api/profiles", tags=["profiles"])
app.include_router(songs.router, prefix="/api/song", tags=["songs"])
app.include_router(youtube.router, prefix="/api/youtube", tags=["youtube"])
app.include_router(flags.router, prefix="/api/flags", tags=["flags"])
app.include_router(events.router, prefix="/api/sessions", tags=["events"])
app.include_router(playlists.router, prefix="/api/playlists", tags=["playlists"])
app.include_router(mobile_auth.router, prefix="/api/auth/mobile", tags=["mobile-auth"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
