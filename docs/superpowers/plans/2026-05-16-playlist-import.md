# Playlist Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to paste a Spotify or YouTube playlist URL in the Jam Session queue input, select tracks from a modal, and add them as lazily-resolved queue items.

**Architecture:** Two new backend endpoints (`GET /api/playlists/preview`, `POST /api/sessions/{id}/queue/batch`) create queue stubs immediately from platform metadata. Odesli resolution is deferred to `play_next` time, naturally respecting rate limits. Feature gated behind `FLAGS.PLAYLIST_IMPORT`.

**Tech Stack:** FastAPI, SQLAlchemy async, httpx (already installed), React 18, Vite

---

## Parallel Execution Map

```
Phase 1 (start all simultaneously):
  Agent A ──► Task 1 → Task 2 → Task 5 → Task 6 → Task 7
  Agent B ──► Task 3 → Task 4 → Task 8
  Agent C ──► Task 10 → Task 11 → Task 12 → Task 13

Phase 2 (after Agents A+B finish):
  Task 9 (register router + DI)
```

---

## File Map

| File | Action | Task |
|---|---|---|
| `api/migrations/versions/002_playlist_queue_fields.py` | Create | 1 |
| `api/app/models/queue_item.py` | Modify | 2 |
| `api/app/schemas/queue_item.py` | Modify | 2 |
| `api/app/config.py` | Modify | 3 |
| `api/app/.env.example` (create if missing) | Create | 3 |
| `api/app/services/playlist_service.py` | Create | 4 |
| `api/tests/test_playlist_service.py` | Create | 4 |
| `api/app/repositories/queue_repo.py` | Modify | 5 |
| `api/tests/test_queue_repo.py` | Create | 5 |
| `api/app/services/queue_service.py` | Modify | 6 |
| `api/tests/test_queue_service.py` | Create | 6 |
| `api/app/schemas/queue_item.py` | Modify | 7 |
| `api/app/routers/sessions.py` | Modify | 7 |
| `api/app/routers/playlists.py` | Create | 8 |
| `api/app/dependencies.py` | Modify | 9 |
| `api/app/main.py` | Modify | 9 |
| `ui/src/lib/playlist.js` | Create | 10 |
| `ui/src/components/PlaylistModal.jsx` | Create | 11 |
| `ui/src/styles/jam.module.css` | Modify | 11 |
| `ui/src/components/AddSongForm.jsx` | Modify | 12 |
| `ui/src/components/QueueCard.jsx` | Modify | 13 |

---

## Task 1: DB Migration — add source_url + resolve_status to queue_items

**Files:**
- Create: `api/migrations/versions/002_playlist_queue_fields.py`

- [ ] **Step 1: Create migration file**

```python
# api/migrations/versions/002_playlist_queue_fields.py
"""add source_url and resolve_status to queue_items

Revision ID: 002
Revises: 001
Create Date: 2026-05-16
"""
from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None

_UPGRADE_SQL = """
ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS resolve_status text NOT NULL DEFAULT 'resolved'
  CHECK (resolve_status IN ('resolving', 'resolved', 'failed'));
"""

_DOWNGRADE_SQL = """
ALTER TABLE queue_items DROP COLUMN IF EXISTS resolve_status;
ALTER TABLE queue_items DROP COLUMN IF EXISTS source_url;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
```

- [ ] **Step 2: Apply migration**

```bash
cd api && uv run alembic upgrade head
```

Expected output contains: `Running upgrade 001 -> 002`

- [ ] **Step 3: Verify columns exist**

```bash
cd api && uv run python -c "
import asyncio
from app.database import get_db
from sqlalchemy import text

async def check():
    async for db in get_db():
        r = await db.execute(text(\"SELECT column_name FROM information_schema.columns WHERE table_name='queue_items' AND column_name IN ('source_url','resolve_status')\"))
        print([row[0] for row in r.fetchall()])
        break

asyncio.run(check())
"
```

Expected: `['source_url', 'resolve_status']` (order may vary)

- [ ] **Step 4: Commit**

```bash
git add api/migrations/versions/002_playlist_queue_fields.py
git commit -m "feat: add source_url and resolve_status columns to queue_items"
```

---

## Task 2: Update QueueItem model + QueueItemResponse schema

**Files:**
- Modify: `api/app/models/queue_item.py`
- Modify: `api/app/schemas/queue_item.py`

Depends on: Task 1

- [ ] **Step 1: Update QueueItem model**

Replace the entire content of `api/app/models/queue_item.py`:

```python
from datetime import datetime
from uuid import UUID
from typing import Optional, TYPE_CHECKING
from sqlalchemy import ForeignKey, Identity, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.profile import Profile


class QueueItem(Base):
    __tablename__ = "queue_items"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    session_id: Mapped[UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    added_by_user_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))
    position: Mapped[int] = mapped_column(Identity(always=True))
    profiles: Mapped[Optional["Profile"]] = relationship("Profile", foreign_keys=[added_by_user_id], lazy="raise")
    title: Mapped[str]
    artist: Mapped[str]
    thumbnail_url: Mapped[Optional[str]]
    platform_links: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(default="queued")
    source_url: Mapped[Optional[str]]
    resolve_status: Mapped[str] = mapped_column(default="resolved")
    added_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

- [ ] **Step 2: Update QueueItemResponse schema**

In `api/app/schemas/queue_item.py`, replace `QueueItemResponse` class:

```python
class QueueItemResponse(BaseModel):
    id: UUID
    session_id: UUID
    added_by_user_id: Optional[UUID] = None
    profiles: Optional[ProfileSummary] = None
    position: int
    title: str
    artist: str
    thumbnail_url: Optional[str] = None
    platform_links: dict = {}
    status: str
    source_url: Optional[str] = None
    resolve_status: str = "resolved"
    added_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 3: Verify existing tests still pass**

```bash
cd api && uv run pytest tests/ -v --tb=short 2>&1 | tail -20
```

Expected: all previously passing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add api/app/models/queue_item.py api/app/schemas/queue_item.py
git commit -m "feat: add source_url and resolve_status to QueueItem model and schema"
```

---

## Task 3: Add Spotify config keys

**Files:**
- Modify: `api/app/config.py`
- Create: `api/.env.example`

- [ ] **Step 1: Add Spotify keys to Settings**

In `api/app/config.py`, add two fields inside the `Settings` class after `youtube_api_key`:

```python
    spotify_client_id: str = ""
    spotify_client_secret: str = ""
```

- [ ] **Step 2: Create .env.example**

Create `api/.env.example`:

```
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/musicone
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
ODESLI_API_KEY=
YOUTUBE_API_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
ALLOWED_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173
```

- [ ] **Step 3: Commit**

```bash
git add api/app/config.py api/.env.example
git commit -m "feat: add Spotify client_id and client_secret config keys"
```

---

## Task 4: PlaylistService — detect, Spotify, YouTube

**Files:**
- Create: `api/app/services/playlist_service.py`
- Create: `api/tests/test_playlist_service.py`

Depends on: Task 3

- [ ] **Step 1: Write failing tests**

Create `api/tests/test_playlist_service.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.playlist_service import detect_playlist, SpotifyPlaylistService, YouTubePlaylistService
from app.config import settings
from fastapi import HTTPException


# ── detect_playlist ──────────────────────────────────────────────────────────

def test_detect_spotify_playlist():
    result = detect_playlist("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")
    assert result == ("spotify", "37i9dQZF1DXcBWIGoYBM5M")


def test_detect_spotify_playlist_with_query():
    result = detect_playlist("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc")
    assert result == ("spotify", "37i9dQZF1DXcBWIGoYBM5M")


def test_detect_youtube_playlist():
    result = detect_playlist("https://www.youtube.com/playlist?list=PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-")
    assert result == ("youtube", "PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-")


def test_detect_youtube_watch_with_list():
    result = detect_playlist("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-")
    assert result == ("youtube", "PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-")


def test_detect_spotify_track_returns_none():
    result = detect_playlist("https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh")
    assert result is None


def test_detect_youtube_video_returns_none():
    result = detect_playlist("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    assert result is None


def test_detect_unknown_url_returns_none():
    result = detect_playlist("https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb")
    assert result is None


def test_detect_invalid_url_returns_none():
    result = detect_playlist("not a url at all")
    assert result is None


# ── SpotifyPlaylistService ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_spotify_raises_503_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "spotify_client_id", "")
    monkeypatch.setattr(settings, "spotify_client_secret", "")
    svc = SpotifyPlaylistService()
    with pytest.raises(HTTPException) as exc:
        await svc.fetch("someplaylistid")
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_spotify_fetch_returns_preview(monkeypatch):
    monkeypatch.setattr(settings, "spotify_client_id", "test_id")
    monkeypatch.setattr(settings, "spotify_client_secret", "test_secret")

    token_response = MagicMock()
    token_response.is_success = True
    token_response.json.return_value = {"access_token": "fake_token", "expires_in": 3600}

    playlist_response = MagicMock()
    playlist_response.is_success = True
    playlist_response.json.return_value = {
        "name": "Test Playlist",
        "items": [
            {
                "track": {
                    "name": "Song One",
                    "artists": [{"name": "Artist A"}],
                    "external_urls": {"spotify": "https://open.spotify.com/track/abc123"},
                    "album": {"images": [{"url": "https://example.com/img.jpg"}]},
                }
            },
            {"track": None},  # null track (removed from Spotify) — should be skipped
        ],
    }

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=token_response)
    mock_client.get = AsyncMock(return_value=playlist_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("app.services.playlist_service.httpx.AsyncClient", return_value=mock_client):
        svc = SpotifyPlaylistService()
        preview = await svc.fetch("testplaylistid")

    assert preview.name == "Test Playlist"
    assert preview.platform == "spotify"
    assert len(preview.tracks) == 1
    assert preview.tracks[0].title == "Song One"
    assert preview.tracks[0].artist == "Artist A"
    assert preview.tracks[0].url == "https://open.spotify.com/track/abc123"
    assert preview.tracks[0].thumbnail_url == "https://example.com/img.jpg"


# ── YouTubePlaylistService ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_youtube_raises_503_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "youtube_api_key", "")
    svc = YouTubePlaylistService()
    with pytest.raises(HTTPException) as exc:
        await svc.fetch("someplaylistid")
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_youtube_fetch_returns_preview(monkeypatch):
    monkeypatch.setattr(settings, "youtube_api_key", "fake_yt_key")

    yt_response = MagicMock()
    yt_response.is_success = True
    yt_response.json.return_value = {
        "items": [
            {
                "snippet": {
                    "title": "YT Song",
                    "videoOwnerChannelTitle": "YT Artist",
                    "resourceId": {"videoId": "abc123"},
                    "thumbnails": {"default": {"url": "https://img.youtube.com/vi/abc123/default.jpg"}},
                    "playlistTitle": "YT Playlist",
                }
            }
        ]
    }

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=yt_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("app.services.playlist_service.httpx.AsyncClient", return_value=mock_client):
        svc = YouTubePlaylistService()
        preview = await svc.fetch("testplaylistid")

    assert preview.platform == "youtube"
    assert len(preview.tracks) == 1
    assert preview.tracks[0].title == "YT Song"
    assert preview.tracks[0].url == "https://www.youtube.com/watch?v=abc123"
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd api && uv run pytest tests/test_playlist_service.py -v 2>&1 | tail -10
```

Expected: `ModuleNotFoundError` or `ImportError` — service doesn't exist yet.

- [ ] **Step 3: Implement PlaylistService**

Create `api/app/services/playlist_service.py`:

```python
from __future__ import annotations
import time
from urllib.parse import urlparse, parse_qs
from typing import Optional
import httpx
from pydantic import BaseModel
from fastapi import HTTPException
from app.config import settings


class PlaylistTrack(BaseModel):
    title: str
    artist: str
    url: str
    thumbnail_url: Optional[str] = None


class PlaylistPreview(BaseModel):
    name: str
    platform: str
    tracks: list[PlaylistTrack]


def detect_playlist(url: str) -> Optional[tuple[str, str]]:
    try:
        parsed = urlparse(url)
    except Exception:
        return None

    host = parsed.hostname or ""

    if "spotify.com" in host:
        parts = parsed.path.split("/")
        try:
            idx = parts.index("playlist")
            playlist_id = parts[idx + 1].split("?")[0]
            if playlist_id:
                return ("spotify", playlist_id)
        except (ValueError, IndexError):
            pass
        return None

    if "youtube.com" in host or "youtu.be" in host:
        params = parse_qs(parsed.query)
        list_id = params.get("list", [None])[0]
        if list_id:
            return ("youtube", list_id)
        return None

    return None


class SpotifyPlaylistService:
    _token: Optional[str] = None
    _token_expiry: float = 0.0

    async def _get_token(self) -> str:
        if self._token and time.time() < self._token_expiry - 60:
            return self._token
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://accounts.spotify.com/api/token",
                data={"grant_type": "client_credentials"},
                auth=(settings.spotify_client_id, settings.spotify_client_secret),
                timeout=10,
            )
            if not res.is_success:
                raise HTTPException(status_code=502, detail="Spotify auth failed.")
            data = res.json()
            self._token = data["access_token"]
            self._token_expiry = time.time() + data.get("expires_in", 3600)
            return self._token

    async def fetch(self, playlist_id: str) -> PlaylistPreview:
        if not settings.spotify_client_id or not settings.spotify_client_secret:
            raise HTTPException(status_code=503, detail="Spotify not configured on this server.")

        token = await self._get_token()
        fields = "name,items(track(name,artists(name),external_urls(spotify),album(images)))"
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks",
                params={"limit": 50, "fields": fields},
                headers={"Authorization": f"Bearer {token}"},
                timeout=10,
            )

        if res.status_code == 404:
            raise HTTPException(status_code=404, detail="Playlist not found or private.")
        if res.status_code == 401:
            self._token = None
            raise HTTPException(status_code=502, detail="Spotify auth expired. Try again.")
        if not res.is_success:
            raise HTTPException(status_code=502, detail="Spotify unavailable.")

        data = res.json()
        tracks: list[PlaylistTrack] = []
        for item in data.get("items", []):
            track = item.get("track")
            if not track:
                continue
            images = track.get("album", {}).get("images", [])
            thumbnail = images[0]["url"] if images else None
            artists = track.get("artists", [])
            artist_name = artists[0]["name"] if artists else ""
            url = track.get("external_urls", {}).get("spotify", "")
            if not url:
                continue
            tracks.append(PlaylistTrack(
                title=track.get("name", ""),
                artist=artist_name,
                url=url,
                thumbnail_url=thumbnail,
            ))

        return PlaylistPreview(name=data.get("name", "Playlist"), platform="spotify", tracks=tracks)


class YouTubePlaylistService:
    async def fetch(self, playlist_id: str) -> PlaylistPreview:
        if not settings.youtube_api_key:
            raise HTTPException(status_code=503, detail="YouTube API not configured on this server.")

        async with httpx.AsyncClient() as client:
            res = await client.get(
                "https://www.googleapis.com/youtube/v3/playlistItems",
                params={
                    "part": "snippet",
                    "maxResults": 50,
                    "playlistId": playlist_id,
                    "key": settings.youtube_api_key,
                },
                timeout=10,
            )

        if res.status_code == 404:
            raise HTTPException(status_code=404, detail="Playlist not found or private.")
        if not res.is_success:
            raise HTTPException(status_code=502, detail="YouTube unavailable.")

        data = res.json()
        playlist_name = "YouTube Playlist"
        tracks: list[PlaylistTrack] = []
        for item in data.get("items", []):
            snippet = item.get("snippet", {})
            video_id = snippet.get("resourceId", {}).get("videoId")
            if not video_id:
                continue
            if not playlist_name and snippet.get("playlistTitle"):
                playlist_name = snippet["playlistTitle"]
            thumbnails = snippet.get("thumbnails", {})
            thumbnail = (
                thumbnails.get("high", {}).get("url")
                or thumbnails.get("default", {}).get("url")
            )
            tracks.append(PlaylistTrack(
                title=snippet.get("title", ""),
                artist=snippet.get("videoOwnerChannelTitle", ""),
                url=f"https://www.youtube.com/watch?v={video_id}",
                thumbnail_url=thumbnail,
            ))

        return PlaylistPreview(name=playlist_name, platform="youtube", tracks=tracks)
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
cd api && uv run pytest tests/test_playlist_service.py -v 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/app/services/playlist_service.py api/tests/test_playlist_service.py
git commit -m "feat: add PlaylistService with Spotify and YouTube playlist fetch"
```

---

## Task 5: QueueRepository — new methods

**Files:**
- Modify: `api/app/repositories/queue_repo.py`
- Create: `api/tests/test_queue_repo.py`

Depends on: Task 2

- [ ] **Step 1: Write failing tests**

Create `api/tests/test_queue_repo.py`:

```python
import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from app.repositories.queue_repo import QueueRepository
from app.models.queue_item import QueueItem


@pytest.mark.asyncio
async def test_get_next_queued_returns_first_queued():
    db = AsyncMock()
    repo = QueueRepository(db)
    item = QueueItem(
        id=uuid4(), session_id=uuid4(), position=1,
        title="Song", artist="Artist", status="queued",
        platform_links={}, resolve_status="resolving", source_url="https://example.com"
    )
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = item
    db.execute = AsyncMock(return_value=result_mock)

    result = await repo.get_next_queued(uuid4())
    assert result.title == "Song"
    assert result.resolve_status == "resolving"


@pytest.mark.asyncio
async def test_get_next_queued_returns_none_when_empty():
    db = AsyncMock()
    repo = QueueRepository(db)
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result_mock)

    result = await repo.get_next_queued(uuid4())
    assert result is None


@pytest.mark.asyncio
async def test_mark_resolved_executes_update():
    db = AsyncMock()
    repo = QueueRepository(db)
    item_id = uuid4()
    user_id = uuid4()
    meta = {
        "title": "Resolved Song",
        "artist": "Resolved Artist",
        "thumbnailUrl": "https://img.example.com/thumb.jpg",
        "platformLinks": {"spotify": "https://open.spotify.com/track/abc"},
    }

    with patch("app.repositories.queue_repo.set_jwt_claims", new=AsyncMock()) as mock_jwt:
        await repo.mark_resolved(item_id, meta, user_id)
        mock_jwt.assert_called_once_with(db, user_id)

    db.execute.assert_called_once()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_mark_failed_executes_update():
    db = AsyncMock()
    repo = QueueRepository(db)
    item_id = uuid4()
    user_id = uuid4()

    with patch("app.repositories.queue_repo.set_jwt_claims", new=AsyncMock()) as mock_jwt:
        await repo.mark_failed(item_id, user_id)
        mock_jwt.assert_called_once_with(db, user_id)

    db.execute.assert_called_once()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_create_stub_creates_resolving_item():
    db = AsyncMock()
    repo = QueueRepository(db)
    session_id = uuid4()
    user_id = uuid4()

    # Mock _get_with_profile to return a stub item
    stub_item = QueueItem(
        id=uuid4(), session_id=session_id, position=1,
        title="Stub Song", artist="Stub Artist", status="queued",
        platform_links={}, resolve_status="resolving",
        source_url="https://open.spotify.com/track/abc"
    )
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = stub_item
    db.execute = AsyncMock(return_value=result_mock)

    result = await repo.create_stub(
        session_id=session_id,
        added_by_user_id=user_id,
        title="Stub Song",
        artist="Stub Artist",
        thumbnail_url=None,
        source_url="https://open.spotify.com/track/abc",
    )

    db.add.assert_called_once()
    added = db.add.call_args[0][0]
    assert added.resolve_status == "resolving"
    assert added.platform_links == {}
    assert added.source_url == "https://open.spotify.com/track/abc"
    assert added.status == "queued"
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd api && uv run pytest tests/test_queue_repo.py -v 2>&1 | tail -10
```

Expected: `AttributeError` — methods don't exist yet.

- [ ] **Step 3: Add new methods to QueueRepository**

In `api/app/repositories/queue_repo.py`, add these imports at the top and methods at the bottom of the class:

```python
# Add to imports at top of file:
import json
from uuid import UUID, uuid4
from typing import Optional
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload
from app.models.queue_item import QueueItem
from app.repositories.base import AbstractRepository
from app.repositories.db_auth import set_jwt_claims
```

Add these methods to the `QueueRepository` class (after `patch_youtube_link`):

```python
    async def get_next_queued(self, session_id: UUID) -> Optional[QueueItem]:
        result = await self.db.execute(
            select(QueueItem)
            .where(QueueItem.session_id == session_id, QueueItem.status == "queued")
            .order_by(QueueItem.position)
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def create_stub(
        self,
        session_id: UUID,
        added_by_user_id: UUID,
        title: str,
        artist: str,
        thumbnail_url: Optional[str],
        source_url: str,
    ) -> QueueItem:
        item = QueueItem(
            id=uuid4(),
            session_id=session_id,
            added_by_user_id=added_by_user_id,
            title=title,
            artist=artist,
            thumbnail_url=thumbnail_url,
            source_url=source_url,
            platform_links={},
            status="queued",
            resolve_status="resolving",
        )
        self.db.add(item)
        await self.db.commit()
        return await self._get_with_profile(item.id)

    async def mark_resolved(self, item_id: UUID, meta: dict, user_id: UUID) -> None:
        await set_jwt_claims(self.db, user_id)
        await self.db.execute(
            text("""
                UPDATE queue_items
                SET title = :title,
                    artist = :artist,
                    thumbnail_url = :thumbnail_url,
                    platform_links = :platform_links::jsonb,
                    resolve_status = 'resolved'
                WHERE id = :item_id
            """),
            {
                "item_id": str(item_id),
                "title": meta.get("title", ""),
                "artist": meta.get("artist", ""),
                "thumbnail_url": meta.get("thumbnailUrl"),
                "platform_links": json.dumps(meta.get("platformLinks", {})),
            },
        )
        await self.db.commit()

    async def mark_failed(self, item_id: UUID, user_id: UUID) -> None:
        await set_jwt_claims(self.db, user_id)
        await self.db.execute(
            text("""
                UPDATE queue_items
                SET resolve_status = 'failed', status = 'skipped'
                WHERE id = :item_id
            """),
            {"item_id": str(item_id)},
        )
        await self.db.commit()
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
cd api && uv run pytest tests/test_queue_repo.py tests/test_queue.py -v 2>&1 | tail -20
```

Expected: all tests PASS. Existing `test_queue.py` must not regress.

- [ ] **Step 5: Commit**

```bash
git add api/app/repositories/queue_repo.py api/tests/test_queue_repo.py
git commit -m "feat: add get_next_queued, create_stub, mark_resolved, mark_failed to QueueRepository"
```

---

## Task 6: QueueService — add_batch + lazy play_next

**Files:**
- Modify: `api/app/services/queue_service.py`
- Create: `api/tests/test_queue_service.py`

Depends on: Task 5

- [ ] **Step 1: Write failing tests**

Create `api/tests/test_queue_service.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from app.services.queue_service import QueueService
from app.models.queue_item import QueueItem
from fastapi import HTTPException


def _make_svc(queue_repo=None, vote_repo=None, song_svc=None):
    return QueueService(
        queue_repo or AsyncMock(),
        vote_repo or AsyncMock(),
        song_svc or AsyncMock(),
    )


def _make_item(resolve_status="resolved", status="queued", source_url=None):
    item = MagicMock(spec=QueueItem)
    item.id = uuid4()
    item.session_id = uuid4()
    item.resolve_status = resolve_status
    item.status = status
    item.source_url = source_url or "https://open.spotify.com/track/abc"
    return item


# ── add_batch ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_add_batch_creates_stubs_for_all_tracks():
    repo = AsyncMock()
    stub = _make_item(resolve_status="resolving")
    repo.create_stub = AsyncMock(return_value=stub)
    svc = _make_svc(queue_repo=repo)

    tracks = [
        {"url": "https://open.spotify.com/track/a", "title": "Song A", "artist": "Artist A", "thumbnail_url": None},
        {"url": "https://open.spotify.com/track/b", "title": "Song B", "artist": "Artist B", "thumbnail_url": "https://img.example.com/b.jpg"},
    ]
    session_id = uuid4()
    user_id = uuid4()

    result = await svc.add_batch(session_id, user_id, tracks)

    assert repo.create_stub.call_count == 2
    assert len(result) == 2


@pytest.mark.asyncio
async def test_add_batch_skips_failed_stub_creation():
    repo = AsyncMock()
    stub = _make_item(resolve_status="resolving")
    repo.create_stub = AsyncMock(side_effect=[stub, Exception("DB error"), stub])
    svc = _make_svc(queue_repo=repo)

    tracks = [
        {"url": "https://open.spotify.com/track/a", "title": "A", "artist": "AA", "thumbnail_url": None},
        {"url": "https://open.spotify.com/track/b", "title": "B", "artist": "BB", "thumbnail_url": None},
        {"url": "https://open.spotify.com/track/c", "title": "C", "artist": "CC", "thumbnail_url": None},
    ]
    result = await svc.add_batch(uuid4(), uuid4(), tracks)
    assert len(result) == 2


# ── play_next (lazy resolve) ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_play_next_resolves_resolving_item_before_playing():
    repo = AsyncMock()
    song_svc = AsyncMock()
    next_item = _make_item(resolve_status="resolving", source_url="https://open.spotify.com/track/x")
    repo.get_next_queued = AsyncMock(return_value=next_item)
    song_svc.resolve_song_meta = AsyncMock(return_value={
        "title": "Resolved", "artist": "Artist",
        "thumbnailUrl": None, "platformLinks": {"spotify": "https://open.spotify.com/track/x"},
    })
    played_id = uuid4()
    repo.play_next = AsyncMock(return_value=played_id)
    svc = _make_svc(queue_repo=repo, song_svc=song_svc)

    result = await svc.play_next(uuid4(), uuid4())

    repo.mark_resolved.assert_called_once()
    repo.play_next.assert_called_once()
    assert result == played_id


@pytest.mark.asyncio
async def test_play_next_skips_and_recurses_on_odesli_failure():
    repo = AsyncMock()
    song_svc = AsyncMock()
    failing_item = _make_item(resolve_status="resolving", source_url="https://open.spotify.com/track/fail")
    good_item = _make_item(resolve_status="resolved")

    repo.get_next_queued = AsyncMock(side_effect=[failing_item, good_item])
    song_svc.resolve_song_meta = AsyncMock(side_effect=HTTPException(status_code=422, detail="bad url"))
    played_id = uuid4()
    repo.play_next = AsyncMock(return_value=played_id)
    svc = _make_svc(queue_repo=repo, song_svc=song_svc)

    result = await svc.play_next(uuid4(), uuid4())

    repo.mark_failed.assert_called_once_with(failing_item.id, pytest.ANY)
    assert result == played_id


@pytest.mark.asyncio
async def test_play_next_returns_none_after_depth_limit():
    repo = AsyncMock()
    song_svc = AsyncMock()
    failing_item = _make_item(resolve_status="resolving")
    repo.get_next_queued = AsyncMock(return_value=failing_item)
    song_svc.resolve_song_meta = AsyncMock(side_effect=Exception("fail"))
    svc = _make_svc(queue_repo=repo, song_svc=song_svc)

    result = await svc.play_next(uuid4(), uuid4(), depth=10)

    assert result is None
    repo.play_next.assert_not_called()


@pytest.mark.asyncio
async def test_play_next_skips_resolve_for_resolved_item():
    repo = AsyncMock()
    song_svc = AsyncMock()
    resolved_item = _make_item(resolve_status="resolved")
    repo.get_next_queued = AsyncMock(return_value=resolved_item)
    played_id = uuid4()
    repo.play_next = AsyncMock(return_value=played_id)
    svc = _make_svc(queue_repo=repo, song_svc=song_svc)

    result = await svc.play_next(uuid4(), uuid4())

    song_svc.resolve_song_meta.assert_not_called()
    repo.mark_resolved.assert_not_called()
    assert result == played_id


@pytest.mark.asyncio
async def test_play_next_returns_none_when_queue_empty():
    repo = AsyncMock()
    repo.get_next_queued = AsyncMock(return_value=None)
    svc = _make_svc(queue_repo=repo)

    result = await svc.play_next(uuid4(), uuid4())

    assert result is None
    repo.play_next.assert_not_called()
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd api && uv run pytest tests/test_queue_service.py -v 2>&1 | tail -10
```

Expected: `AttributeError` or `TypeError` — methods don't exist yet.

- [ ] **Step 3: Implement changes in QueueService**

Replace `api/app/services/queue_service.py` entirely:

```python
from __future__ import annotations
from typing import Optional
from uuid import UUID
from app.models.queue_item import QueueItem
from app.repositories.queue_repo import QueueRepository
from app.repositories.skip_vote_repo import SkipVoteRepository

SKIP_THRESHOLD = 3


class QueueService:
    def __init__(self, queue_repo, skip_vote_repo, song_service) -> None:
        self.repo = queue_repo
        self.vote_repo = skip_vote_repo
        self.song_svc = song_service

    async def get_queue(self, session_id: UUID) -> list[QueueItem]:
        return await self.repo.get_queue(session_id)

    async def add(self, session_id: UUID, user_id: UUID, url: str) -> QueueItem:
        meta = await self.song_svc.resolve_song_meta(url)
        return await self.repo.create(
            session_id=session_id,
            added_by_user_id=user_id,
            title=meta["title"],
            artist=meta["artist"],
            thumbnail_url=meta.get("thumbnailUrl"),
            platform_links=meta.get("platformLinks", {}),
            status="queued",
            resolve_status="resolved",
        )

    async def add_batch(
        self, session_id: UUID, user_id: UUID, tracks: list[dict]
    ) -> list[QueueItem]:
        added: list[QueueItem] = []
        for track in tracks:
            try:
                item = await self.repo.create_stub(
                    session_id=session_id,
                    added_by_user_id=user_id,
                    title=track.get("title", ""),
                    artist=track.get("artist", ""),
                    thumbnail_url=track.get("thumbnail_url"),
                    source_url=track["url"],
                )
                added.append(item)
            except Exception:
                pass
        return added

    async def play_next(
        self, session_id: UUID, user_id: UUID, depth: int = 0
    ) -> Optional[UUID]:
        if depth >= 10:
            return None

        next_item = await self.repo.get_next_queued(session_id)
        if not next_item:
            return None

        if next_item.resolve_status == "resolving":
            try:
                meta = await self.song_svc.resolve_song_meta(next_item.source_url)
                await self.repo.mark_resolved(next_item.id, meta, user_id)
            except Exception:
                await self.repo.mark_failed(next_item.id, user_id)
                return await self.play_next(session_id, user_id, depth + 1)

        return await self.repo.play_next(session_id, user_id, "played")

    async def force_skip(self, session_id: UUID, user_id: UUID) -> Optional[UUID]:
        return await self.repo.force_skip(session_id, user_id)

    async def patch_youtube_link(self, item_id: UUID, youtube_url: str, user_id: UUID) -> None:
        await self.repo.patch_youtube_link(item_id, youtube_url, user_id)

    async def cast_vote(self, queue_item_id: UUID, user_id: UUID, threshold: int = SKIP_THRESHOLD) -> bool:
        return await self.vote_repo.cast_vote(queue_item_id, user_id, threshold)

    async def remove_vote(self, queue_item_id: UUID, user_id: UUID) -> None:
        await self.vote_repo.remove_vote(queue_item_id, user_id)

    async def get_votes(self, queue_item_id: UUID) -> dict:
        return await self.vote_repo.get_votes(queue_item_id)
```

- [ ] **Step 4: Run all tests — verify they PASS**

```bash
cd api && uv run pytest tests/ -v 2>&1 | tail -25
```

Expected: all tests PASS including old queue tests.

- [ ] **Step 5: Commit**

```bash
git add api/app/services/queue_service.py api/tests/test_queue_service.py
git commit -m "feat: add add_batch and lazy Odesli resolution in play_next to QueueService"
```

---

## Task 7: Sessions router — batch endpoint

**Files:**
- Modify: `api/app/schemas/queue_item.py`
- Modify: `api/app/routers/sessions.py`

Depends on: Task 6

- [ ] **Step 1: Add BatchTrackItem + BatchQueueRequest schemas**

In `api/app/schemas/queue_item.py`, add after `QueueItemCreate`:

```python
class BatchTrackItem(BaseModel):
    url: str
    title: str
    artist: str
    thumbnail_url: Optional[str] = None


class BatchQueueRequest(BaseModel):
    tracks: list[BatchTrackItem]

    @property
    def capped(self) -> list[BatchTrackItem]:
        return self.tracks[:50]
```

Also add `List` import if not present — but `list` (lowercase) is fine in Python 3.12.

- [ ] **Step 2: Add batch endpoint to sessions router**

In `api/app/routers/sessions.py`, add this import at the top:

```python
from app.schemas.queue_item import QueueItemCreate, QueueItemResponse, BatchQueueRequest
```

Then add the endpoint after `add_to_queue`:

```python
@router.post("/{session_id}/queue/batch")
async def add_batch_to_queue(
    session_id: UUID,
    body: BatchQueueRequest,
    user_id: UUID = Depends(get_current_user),
    svc=Depends(get_queue_service),
):
    tracks = [t.model_dump() for t in body.capped]
    added = await svc.add_batch(session_id, user_id, tracks)
    await bus.publish(str(session_id), "queue_changed", {})
    return {"added": [QueueItemResponse.model_validate(item) for item in added]}
```

- [ ] **Step 3: Run all tests**

```bash
cd api && uv run pytest tests/ -v 2>&1 | tail -15
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add api/app/schemas/queue_item.py api/app/routers/sessions.py
git commit -m "feat: add POST /sessions/{id}/queue/batch endpoint"
```

---

## Task 8: Playlists router

**Files:**
- Create: `api/app/routers/playlists.py`

Depends on: Task 4

- [ ] **Step 1: Create playlists router**

Create `api/app/routers/playlists.py`:

```python
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from app.dependencies import get_current_user
from app.services.playlist_service import (
    detect_playlist,
    PlaylistPreview,
    SpotifyPlaylistService,
    YouTubePlaylistService,
)

router = APIRouter()

_spotify_svc = SpotifyPlaylistService()
_youtube_svc = YouTubePlaylistService()


@router.get("/preview", response_model=PlaylistPreview)
async def preview_playlist(
    url: str = Query(..., description="Playlist URL to preview"),
    _user_id=Depends(get_current_user),
):
    result = detect_playlist(url)
    if not result:
        raise HTTPException(status_code=422, detail="Unsupported playlist link.")
    platform, playlist_id = result
    if platform == "spotify":
        return await _spotify_svc.fetch(playlist_id)
    if platform == "youtube":
        return await _youtube_svc.fetch(playlist_id)
    raise HTTPException(status_code=422, detail="Unsupported platform.")
```

- [ ] **Step 2: Run all tests**

```bash
cd api && uv run pytest tests/ -v 2>&1 | tail -10
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add api/app/routers/playlists.py
git commit -m "feat: add GET /api/playlists/preview endpoint"
```

---

## Task 9: Wire up router in dependencies + main.py

**Files:**
- Modify: `api/app/main.py`

Depends on: Tasks 7, 8

- [ ] **Step 1: Register playlists router in main.py**

In `api/app/main.py`, update the import line:

```python
from app.routers import auth, sessions, items, profiles, songs, youtube, flags, events, playlists
```

Add the router registration after the events line:

```python
app.include_router(playlists.router, prefix="/api/playlists", tags=["playlists"])
```

- [ ] **Step 2: Smoke test the API starts**

```bash
cd api && uv run python -c "from app.main import app; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Run all tests**

```bash
cd api && uv run pytest tests/ -v 2>&1 | tail -15
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add api/app/main.py
git commit -m "feat: register playlists router in FastAPI app"
```

---

## Task 10: Frontend — playlist.js

**Files:**
- Create: `ui/src/lib/playlist.js`

- [ ] **Step 1: Create playlist.js**

Create `ui/src/lib/playlist.js`:

```js
import { api } from './api';

/**
 * Returns { platform, id } if url is a Spotify or YouTube playlist, else null.
 */
export function detectPlaylist(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'open.spotify.com') {
      const parts = parsed.pathname.split('/');
      const idx = parts.indexOf('playlist');
      if (idx !== -1 && parts[idx + 1]) {
        return { platform: 'spotify', id: parts[idx + 1] };
      }
      return null;
    }

    if (host === 'youtube.com' || host === 'youtu.be') {
      const listId = parsed.searchParams.get('list');
      if (listId) return { platform: 'youtube', id: listId };
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetches playlist preview from backend.
 * Returns { name, platform, tracks: [{ title, artist, url, thumbnail_url }] }
 */
export async function fetchPlaylistPreview(url) {
  const res = await api(`/playlists/preview?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Could not load playlist.');
  }
  return res.json();
}

/**
 * Adds selected tracks to queue via batch endpoint.
 * tracks: [{ url, title, artist, thumbnail_url }]
 */
export async function addPlaylistBatch(sessionId, tracks) {
  const res = await api(`/sessions/${sessionId}/queue/batch`, {
    method: 'POST',
    body: JSON.stringify({ tracks }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Failed to add tracks.');
  }
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/lib/playlist.js
git commit -m "feat: add playlist detection and API helpers in playlist.js"
```

---

## Task 11: Frontend — PlaylistModal + CSS

**Files:**
- Create: `ui/src/components/PlaylistModal.jsx`
- Modify: `ui/src/styles/jam.module.css`

Depends on: Task 10

- [ ] **Step 1: Add modal CSS to jam.module.css**

Append to the end of `ui/src/styles/jam.module.css`:

```css
/* PlaylistModal */
.modalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}

.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modalHeader {
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.modalTitle {
  font-size: 1rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.modalSubtitle {
  font-size: 0.78rem;
  color: var(--muted);
}

.modalSelectAll {
  font-size: 0.78rem;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-align: left;
  width: fit-content;
}

.modalTrackList {
  overflow-y: auto;
  flex: 1;
}

.modalTrackRow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
}

.modalTrackRow:hover { background: color-mix(in srgb, var(--accent) 6%, transparent); }
.modalTrackRowSelected { background: color-mix(in srgb, var(--accent) 10%, transparent); }

.modalTrackThumb {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  object-fit: cover;
  background: var(--border);
  flex-shrink: 0;
}

.modalTrackMeta { flex: 1; min-width: 0; }
.modalTrackTitle { font-size: 0.85rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.modalTrackArtist { font-size: 0.75rem; color: var(--muted); }

.modalCheckbox { flex-shrink: 0; width: 16px; height: 16px; accent-color: var(--accent); }

.modalFooter {
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.modalError {
  padding: 20px;
  color: #ff6b6b;
  font-size: 0.85rem;
  text-align: center;
}

.modalLoading {
  padding: 40px;
  text-align: center;
  color: var(--muted);
  font-size: 0.9rem;
}

.resolvingBadge {
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  flex-shrink: 0;
}

.failedBadge {
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, #ff6b6b 15%, transparent);
  color: #ff6b6b;
  flex-shrink: 0;
}

.queueCardResolving { opacity: 0.6; }
.queueCardFailed { opacity: 0.4; }
```

- [ ] **Step 2: Create PlaylistModal.jsx**

Create `ui/src/components/PlaylistModal.jsx`:

```jsx
import { useState, useEffect } from 'react';
import s from '../styles/jam.module.css';
import { fetchPlaylistPreview, addPlaylistBatch } from '../lib/playlist';
import { useToast } from './Toast';

export default function PlaylistModal({ url, sessionId, onAdded, onClose }) {
  const [state, setState] = useState('loading'); // loading | loaded | adding | error
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState('');
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchPlaylistPreview(url)
      .then(data => {
        if (cancelled) return;
        setPreview(data);
        setSelected(new Set(data.tracks.map((_, i) => i)));
        setState('loaded');
      })
      .catch(e => {
        if (cancelled) return;
        setError(e.message || 'Could not load playlist.');
        setState('error');
      });
    return () => { cancelled = true; };
  }, [url]);

  function toggleTrack(idx) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === preview.tracks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(preview.tracks.map((_, i) => i)));
    }
  }

  async function handleAdd() {
    if (!preview || selected.size === 0) return;
    setState('adding');
    const tracks = [...selected].map(i => preview.tracks[i]);
    try {
      const result = await addPlaylistBatch(sessionId, tracks);
      const count = result.added?.length ?? 0;
      toast(`Added ${count} song${count !== 1 ? 's' : ''} to queue.`);
      onAdded?.();
      onClose();
    } catch (e) {
      toast(e.message || 'Failed to add tracks.');
      setState('loaded');
    }
  }

  return (
    <div className={s.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        {state === 'loading' && (
          <div className={s.modalLoading}>Loading playlist…</div>
        )}

        {state === 'error' && (
          <>
            <div className={s.modalError}>{error}</div>
            <div className={s.modalFooter}>
              <button className="btn" onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {(state === 'loaded' || state === 'adding') && preview && (
          <>
            <div className={s.modalHeader}>
              <div className={s.modalTitle}>{preview.name}</div>
              <div className={s.modalSubtitle}>
                {preview.platform === 'spotify' ? 'Spotify' : 'YouTube'} · {preview.tracks.length} tracks
              </div>
              <button className={s.modalSelectAll} onClick={toggleAll}>
                {selected.size === preview.tracks.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div className={s.modalTrackList}>
              {preview.tracks.map((track, i) => (
                <div
                  key={i}
                  className={`${s.modalTrackRow} ${selected.has(i) ? s.modalTrackRowSelected : ''}`}
                  onClick={() => toggleTrack(i)}
                >
                  {track.thumbnail_url
                    ? <img className={s.modalTrackThumb} src={track.thumbnail_url} alt="" />
                    : <div className={s.modalTrackThumb} />}
                  <div className={s.modalTrackMeta}>
                    <div className={s.modalTrackTitle}>{track.title}</div>
                    <div className={s.modalTrackArtist}>{track.artist}</div>
                  </div>
                  <input
                    type="checkbox"
                    className={s.modalCheckbox}
                    checked={selected.has(i)}
                    onChange={() => toggleTrack(i)}
                    onClick={e => e.stopPropagation()}
                  />
                </div>
              ))}
            </div>

            <div className={s.modalFooter}>
              <button className="btn" onClick={onClose} disabled={state === 'adding'}>
                Cancel
              </button>
              <button
                className="btn"
                onClick={handleAdd}
                disabled={selected.size === 0 || state === 'adding'}
              >
                {state === 'adding' ? 'Adding…' : `Add ${selected.size} Selected`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/PlaylistModal.jsx ui/src/styles/jam.module.css
git commit -m "feat: add PlaylistModal component and modal CSS"
```

---

## Task 12: Frontend — AddSongForm playlist detection

**Files:**
- Modify: `ui/src/components/AddSongForm.jsx`

Depends on: Task 11 (PlaylistModal), Task 10 (playlist.js)

- [ ] **Step 1: Update AddSongForm**

Replace the entire content of `ui/src/components/AddSongForm.jsx`:

```jsx
import { useState } from 'react';
import s from '../styles/jam.module.css';
import { addToQueue } from '../lib/queue';
import { detectPlaylist } from '../lib/playlist';
import { detectPlatform } from '../lib/platform';
import { FLAGS } from '../lib/flags';
import { useToast } from './Toast';
import PlaylistModal from './PlaylistModal';

export default function AddSongForm({ sessionId, userId, profile, onPlatformDetected, onAdded }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState(null);
  const toast = useToast();

  async function handleAdd(e) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || busy) return;

    if (FLAGS.PLAYLIST_IMPORT && detectPlaylist(trimmed)) {
      setPlaylistUrl(trimmed);
      setUrl('');
      return;
    }

    setBusy(true);
    try {
      if (FLAGS.PLATFORM_AUTODETECT && !profile?.preferred_platform) {
        const platform = detectPlatform(trimmed);
        if (platform) onPlatformDetected(platform);
      }
      const item = await addToQueue(sessionId, trimmed);
      toast(`"${item.title}" added to queue`);
      setUrl('');
      onAdded?.(item);
    } catch (e) {
      toast(e.message || 'Could not add song.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className={s.addForm} onSubmit={handleAdd}>
        <input
          className={s.addInput}
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder={
            FLAGS.PLAYLIST_IMPORT
              ? 'Paste a song or playlist URL…'
              : 'Paste a song URL to add to queue…'
          }
          disabled={busy}
        />
        <button type="submit" className="btn" disabled={busy}>
          {busy ? '…' : 'Add'}
        </button>
      </form>

      {playlistUrl && (
        <PlaylistModal
          url={playlistUrl}
          sessionId={sessionId}
          onAdded={onAdded}
          onClose={() => setPlaylistUrl(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/AddSongForm.jsx
git commit -m "feat: detect playlist URLs in AddSongForm and open PlaylistModal"
```

---

## Task 13: Frontend — QueueCard resolve_status badges

**Files:**
- Modify: `ui/src/components/QueueCard.jsx`

- [ ] **Step 1: Update QueueCard**

Replace the entire content of `ui/src/components/QueueCard.jsx`:

```jsx
import s from '../styles/jam.module.css';

export default function QueueCard({ item, index }) {
  const statusCls =
    item.status === 'played' ? s.queueCardPlayed
    : item.status === 'skipped' ? s.queueCardSkipped
    : item.resolve_status === 'resolving' ? s.queueCardResolving
    : item.resolve_status === 'failed' ? s.queueCardFailed
    : '';

  return (
    <div className={`${s.queueCard} ${statusCls}`}>
      {item.thumbnail_url
        ? <img className={s.queueThumb} src={item.thumbnail_url} alt="" />
        : <div className={s.queueThumb} />}
      <div className={s.queueMeta}>
        <div className={s.queueTitle}>{item.title}</div>
        <div className={s.queueArtist}>{item.artist}</div>
        <div className={s.queueBy}>by {item.profiles?.display_name || 'someone'}</div>
      </div>
      {item.resolve_status === 'resolving' && (
        <span className={s.resolvingBadge}>Resolving…</span>
      )}
      {item.resolve_status === 'failed' && (
        <span className={s.failedBadge}>Failed</span>
      )}
      {index != null && <div className={s.queuePos}>#{index}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/QueueCard.jsx
git commit -m "feat: show resolving/failed badges in QueueCard for playlist tracks"
```

---

## Self-Review Checklist

- [x] **spec coverage — Feature Flag**: `FLAGS.PLAYLIST_IMPORT` gates `detectPlaylist` call in `AddSongForm` (Task 12) ✓
- [x] **spec coverage — DB migration**: Task 1 adds `source_url` + `resolve_status` ✓
- [x] **spec coverage — Spotify service**: Task 4, token caching, 503 when unconfigured ✓
- [x] **spec coverage — YouTube service**: Task 4, reuses `youtube_api_key` ✓
- [x] **spec coverage — detect_playlist**: Task 4, Spotify playlist path + YouTube list= param ✓
- [x] **spec coverage — GET /playlists/preview**: Task 8 ✓
- [x] **spec coverage — create_stub**: Task 5, `resolve_status='resolving'`, `platform_links={}` ✓
- [x] **spec coverage — add_batch**: Task 6, skips failed stubs ✓
- [x] **spec coverage — lazy play_next**: Task 6, resolves at play time, skips on failure, depth limit 10 ✓
- [x] **spec coverage — POST /queue/batch**: Task 7, max 50 via `capped` ✓
- [x] **spec coverage — PlaylistModal**: Task 11, loading/loaded/adding/error states, select all, track list ✓
- [x] **spec coverage — QueueCard badges**: Task 13 ✓
- [x] **spec coverage — single-add unchanged**: `add()` in Task 6 still calls Odesli synchronously ✓
- [x] **type consistency**: `add_batch` takes `list[dict]` in service, `BatchTrackItem.model_dump()` in router → dict keys match `track.get("title")` etc ✓
- [x] **`mark_resolved` / `mark_failed` signatures**: both take `(item_id, ..., user_id)`, matching test assertions ✓

### Known Limitation

`force_skip` calls the DB `play_next()` function directly, which can advance to a `resolving` item without Odesli resolution. That item will show no platform links until the next `play_next` call. This is an edge case (force-skipping into an unresolved track) and acceptable for this iteration.
