# Playlist Support in Jam Session Queue

**Date:** 2026-05-16  
**Status:** Approved  
**Scope:** Spotify + YouTube playlists, max 50 tracks, select-tracks modal, lazy Odesli resolution at play-time

---

## Feature Flag

Gated behind `FLAGS.PLAYLIST_IMPORT` (default `false`).  
- `flags.js`: `PLAYLIST_IMPORT: JSON.parse(__FLAG_PLAYLIST_IMPORT__)`  
- `vite.config.js`: `__FLAG_PLAYLIST_IMPORT__` → env `FLAG_PLAYLIST_IMPORT`, default `'false'`  
- Toggle without redeploy via Supabase `feature_flags` table (`key: "PLAYLIST_IMPORT"`)  
- `AddSongForm` playlist detection branch only runs when `FLAGS.PLAYLIST_IMPORT` is true

---

## Overview

Users can paste a Spotify or YouTube playlist URL into the "Add to Queue" input in a Jam Session. A track-selection modal appears showing up to 50 tracks from the playlist. Selected tracks are added to the queue immediately using platform metadata (no Odesli call at add time). Odesli resolution happens lazily when each track is about to play, respecting rate limits naturally via song duration spacing.

---

## Architecture

```
User pastes playlist URL
  → AddSongForm detects playlist pattern (Spotify/YouTube)
  → GET /api/playlists/preview?url=...
      ↳ SpotifyPlaylistService or YouTubePlaylistService
      ↳ returns { name, platform, tracks[{title, artist, url, thumbnail_url}] }
  → PlaylistModal: track list + checkboxes → user selects → "Add X Selected"
  → POST /api/sessions/{id}/queue/batch { urls: [...] }
      ↳ creates queue items immediately from playlist metadata
      ↳ resolve_status = 'resolving', platform_links = {}
      ↳ publishes queue_changed SSE once
  → Tracks appear in queue UI with 'resolving' badge

At play time (play_next called):
  → if next item resolve_status = 'resolving'
      ↳ call Odesli for source_url
      ↳ success → update platform_links, resolve_status = 'resolved' → play
      ↳ failure → resolve_status = 'failed' → skip, try next item
```

Single-add flow is unchanged. `resolve_status = 'resolved'` always for single-add.

---

## Backend

### Database: `queue_items` table

Two new columns (new Alembic migration):

| Column | Type | Default | Notes |
|---|---|---|---|
| `source_url` | `text` | `null` | Original platform URL (Spotify track / YouTube video). Null for legacy items. |
| `resolve_status` | `enum('resolving','resolved','failed')` | `'resolved'` | Drives play_next behavior and UI badge. |

### New config keys (`api/app/config.py`)

```python
spotify_client_id: str = ""
spotify_client_secret: str = ""
```

Added to `.env.example` and `.env.prod`.

### New service: `api/app/services/playlist_service.py`

**`detect_playlist(url) → tuple[str, str] | None`**  
Returns `("spotify", playlist_id)` or `("youtube", playlist_id)` or `None`.

Spotify playlist URL patterns:
- `https://open.spotify.com/playlist/{id}`
- `https://open.spotify.com/playlist/{id}?...`

YouTube playlist URL patterns:
- `https://www.youtube.com/playlist?list={id}`
- `https://www.youtube.com/watch?v=...&list={id}` (extract `list` param)

**`PlaylistTrack`** (dataclass/Pydantic):
```python
class PlaylistTrack(BaseModel):
    title: str
    artist: str
    url: str           # Spotify track URL or YouTube video URL
    thumbnail_url: str | None
```

**`PlaylistPreview`**:
```python
class PlaylistPreview(BaseModel):
    name: str
    platform: str      # "spotify" | "youtube"
    tracks: list[PlaylistTrack]
```

**`SpotifyPlaylistService`**:
- Client credentials token flow: `POST https://accounts.spotify.com/api/token` with `grant_type=client_credentials`
- Token cached in-memory, refreshed when expired
- `GET https://api.spotify.com/v1/playlists/{id}/tracks?limit=50&fields=items(track(name,artists,external_urls,album(images)))`
- If `spotify_client_id` or `spotify_client_secret` not set → raises `HTTPException(503, "Spotify not configured")`
- Private/404 playlist → `HTTPException(404, "Playlist not found or private")`

**`YouTubePlaylistService`**:
- Reuses existing `settings.youtube_api_key`
- `GET https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId={id}&key={key}`
- If `youtube_api_key` not set → `HTTPException(503, "YouTube API not configured")`
- Private/404 playlist → `HTTPException(404, "Playlist not found or private")`

### New router: `api/app/routers/playlists.py`

```
GET /api/playlists/preview?url=...
```
- Calls `detect_playlist(url)` → 422 if unsupported
- Dispatches to `SpotifyPlaylistService` or `YouTubePlaylistService`
- Returns `PlaylistPreview`
- Requires authentication

Registered in `api/app/main.py` under `/api/playlists`.

### Modified: `api/app/routers/sessions.py`

New endpoint:
```
POST /api/sessions/{session_id}/queue/batch
Body: {
  "tracks": [
    { "url": "https://...", "title": "...", "artist": "...", "thumbnail_url": "..." },
    ...
  ]
}   # max 50 tracks
```
- Client already has metadata from preview call — no second platform API call needed
- Calls `queue_service.add_batch(session_id, user_id, tracks)`
- Publishes one `queue_changed` SSE after all items created
- Returns `{ "added": [QueueItemResponse, ...] }`

### Modified: `api/app/services/queue_service.py`

**`add_batch(session_id, user_id, tracks: list[dict]) → list[QueueItem]`**  
- `tracks` items: `{ url, title, artist, thumbnail_url }`
- Creates queue items directly from metadata (no Odesli)
- `resolve_status = 'resolving'`, `source_url = track.url`, `platform_links = {}`
- Uses `repo.create_stub(...)` — new repo method that skips Odesli fields

**`add(session_id, user_id, url) → QueueItem`** (unchanged)  
- Still calls Odesli synchronously
- Sets `resolve_status = 'resolved'`

**`play_next(session_id, user_id) → UUID | None`** (modified)  
- Fetches next `queued` item
- If `resolve_status == 'resolving'`:
  - Calls `song_svc.resolve_song_meta(item.source_url)`
  - Success → `repo.mark_resolved(item.id, meta)` → proceed to play
  - Failure → `repo.mark_failed(item.id)` → publish `queue_changed` → recurse to next item
- Max recursion depth: 10 (prevents infinite loop on all-failed batch)

### Modified: `api/app/repositories/queue_repo.py`

New methods:
- `create_stub(session_id, user_id, title, artist, thumbnail_url, source_url)` — creates item with `resolve_status='resolving'`, `platform_links={}`
- `mark_resolved(item_id, meta: dict)` — updates `platform_links`, `title`, `artist`, `thumbnail_url`, `resolve_status='resolved'`
- `mark_failed(item_id)` — sets `resolve_status='failed'`

### New Alembic migration

`api/migrations/versions/002_playlist_queue_fields.py`

```sql
ALTER TABLE queue_items ADD COLUMN source_url TEXT;
ALTER TABLE queue_items ADD COLUMN resolve_status TEXT NOT NULL DEFAULT 'resolved';
CREATE TYPE resolve_status_enum AS ENUM ('resolving', 'resolved', 'failed');
ALTER TABLE queue_items ALTER COLUMN resolve_status TYPE resolve_status_enum USING resolve_status::resolve_status_enum;
```

---

## Frontend

### New: `ui/src/lib/playlist.js`

```js
export function detectPlaylist(url)
// Returns { platform: 'spotify'|'youtube', id } or null
// Spotify: /playlist/{id} path
// YouTube: list= query param

export async function fetchPlaylistPreview(url)
// GET /api/playlists/preview?url=...
// Returns { name, platform, tracks[] }

export async function addPlaylistBatch(sessionId, tracks)
// POST /api/sessions/{id}/queue/batch
// tracks: [{ title, artist, url, thumbnail_url }]
// Returns { added: [] }
```

### New: `ui/src/components/PlaylistModal.jsx`

States:
1. **Loading** — spinner while `fetchPlaylistPreview` in flight
2. **Loaded** — playlist name + platform badge, track list with checkboxes, "Select All / Deselect All" toggle, "Add X Selected" button (disabled when 0 selected), Cancel
3. **Adding** — button shows "Adding…", disabled
4. **Error** — inline error message if preview fetch fails

Track list item shows: thumbnail (32×32), title, artist.

Max display: 50 tracks (backend caps at 50).

### Modified: `ui/src/components/AddSongForm.jsx`

```js
async function handleAdd(e) {
  e.preventDefault();
  const playlist = detectPlaylist(url.trim());
  if (playlist) {
    setShowPlaylistModal(true);  // opens modal, passes url
    return;
  }
  // existing single-add flow unchanged
}
```

Renders `<PlaylistModal>` when `showPlaylistModal` is true.

### Modified: `ui/src/components/QueueCard.jsx`

- `resolve_status === 'resolving'` → show "Resolving…" badge + muted style
- `resolve_status === 'failed'` → show "Failed" error badge + muted style, no platform links shown
- `resolve_status === 'resolved'` → existing rendering unchanged

### Modified: `ui/src/hooks/useQueue.js`

No change needed — SSE `queue_changed` already triggers queue refetch which picks up updated `resolve_status`.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Non-playlist URL pasted | `detectPlaylist` returns null → existing single-add flow |
| Unsupported platform playlist | Backend 422 → toast "Unsupported playlist link" |
| Spotify not configured | Backend 503 → toast "Spotify not set up on this server" |
| YouTube API not configured | Backend 503 → toast "YouTube API not set up on this server" |
| Private/missing playlist | Backend 404 → toast "Playlist not found or private" |
| Preview fetch fails (network) | Modal shows inline error, user can retry |
| 0 tracks selected | "Add Selected" button disabled |
| All selected tracks fail Odesli at play time | Each skipped with `failed` badge, queue exhausts normally |
| `play_next` recursion limit (10) hit | Returns `None`, session moves to idle |

---

## Out of Scope

- Apple Music playlists (paid developer account required)
- SoundCloud playlists (API registration closed)
- Reordering tracks before adding
- Saving playlist associations — tracks are independent queue items after add
- Pagination beyond 50 tracks
