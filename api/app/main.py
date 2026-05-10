from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.services.event_bus import bus
from app.routers import auth, sessions, items, profiles, songs, youtube, flags, events


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    bus.shutdown()


app = FastAPI(title="MusicOne API", root_path=settings.root_path, lifespan=lifespan)

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


@app.get("/api/health")
async def health():
    return {"status": "ok"}
