# Feature Flags

> Auto-generated from `ui/vite.config.js`. Do not edit manually.
> Regenerate: `cd ui && npm run docs:flags`

Flags are compile-time injected by Vite (`FLAG_*` env vars). Runtime state (without redeploy) is managed via the Supabase `feature_flags` table and served at `GET /api/flags/`.

## Defaults

| Flag | Default |
|------|---------|
| `JAM_SESSION` | ✅ on |
| `VOTE_TO_SKIP` | ✅ on |
| `DJ_TOKEN` | ✅ on |
| `YOUTUBE_EMBED` | ✅ on |
| `AUTO_PLAY_QUEUE` | ✅ on |
| `PLATFORM_AUTODETECT` | ✅ on |
| `REACTIONS` | ❌ off |
| `CHAT` | ❌ off |
| `SESSION_HISTORY` | ❌ off |
| `USER_PROFILES` | ❌ off |
| `SHARED_PLAYLISTS` | ❌ off |
| `DISCOVERY_FEED` | ❌ off |
| `TASTE_MATCHING` | ❌ off |
| `SCHEDULED_JAMS` | ❌ off |
| `QUEUE_RULES` | ❌ off |
| `EMBED_WIDGET` | ❌ off |
| `PLAYLIST_IMPORT` | ❌ off |
| `SONG_SEARCH` | ❌ off |

## Enabled by default (6)

- `JAM_SESSION`
- `VOTE_TO_SKIP`
- `DJ_TOKEN`
- `YOUTUBE_EMBED`
- `AUTO_PLAY_QUEUE`
- `PLATFORM_AUTODETECT`

## Disabled by default (12)

- `REACTIONS`
- `CHAT`
- `SESSION_HISTORY`
- `USER_PROFILES`
- `SHARED_PLAYLISTS`
- `DISCOVERY_FEED`
- `TASTE_MATCHING`
- `SCHEDULED_JAMS`
- `QUEUE_RULES`
- `EMBED_WIDGET`
- `PLAYLIST_IMPORT`
- `SONG_SEARCH`

## Toggling without redeploy

1. Open Supabase dashboard → Table Editor → `feature_flags`
2. Set `enabled` on the relevant row
3. Changes take effect on next page load (flags fetched at `/api/flags/` on mount)

## Adding a new flag

1. Add `__FLAG_MYFEATURE__` to `ui/vite.config.js` `define` block
2. Add `MYFEATURE: JSON.parse(__FLAG_MYFEATURE__)` to `ui/src/lib/flags.js`
3. Run `cd ui && npm run docs:flags` to regenerate this file
4. Insert a row in the `feature_flags` table for runtime control
