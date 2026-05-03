# Repeat Queue Feature Design

**Date:** 2026-05-03
**Status:** Approved

## Summary

DJ-controlled repeat toggle for the now-playing queue. When enabled, the current song restarts on end instead of advancing the queue. State persisted in the `sessions` DB row so it survives DJ page refresh and cross-device rejoins.

## Architecture

### DB Change

```sql
ALTER TABLE sessions ADD COLUMN repeat boolean DEFAULT false NOT NULL;
```

Single migration. No RPC needed — plain UPDATE.

### Data Flow

```
DJ clicks toggle
  → setRepeat(sessionId, !repeat)   [lib/session.js]
  → UPDATE sessions SET repeat=...  [Supabase]
  → realtime UPDATE event fires
  → useSession merges payload.new   [hooks/useSession.js — existing subscription]
  → JamRoom re-renders with new session.repeat
  → NowPlaying receives updated repeat prop
  → YouTubeAutoPlayer ref captures new value
  → next ENDED event: seekTo(0) + playVideo() or onEnded()
```

### Components

**`lib/session.js`**
- Add `setRepeat(sessionId, value)`: `UPDATE sessions SET repeat = value WHERE id = sessionId`

**`JamRoom.jsx`**
- Pass `repeat={session.repeat ?? false}` to `NowPlaying`

**`NowPlaying.jsx`**
- Remove local repeat state
- Accept `repeat` prop
- Add toggle button inside `.djControls`, visible only when `isDJ`
- Button calls `setRepeat(sessionId, !repeat)` on click
- Style: matches existing `skipBtn` — `.repeatBtn` + `.repeatBtnActive` for active state

**`YouTubeAutoPlayer.jsx`**
- Accept `repeat` prop
- Capture in `repeatRef` inside effect to avoid stale closure
- In `onStateChange`: `ENDED + repeatRef.current` → `seekTo(0); playVideo()`, else `onEnded?.()`

**`jam.module.css`**
- Add `.repeatBtnActive`: accent-colored border + text, mirrors `.skipBtnVoted`

### No Changes To

- DB migrations beyond the single `repeat` column
- `queue.js`, `useQueue`, feature flags, `supabase.js`
- Any non-DJ participant view

## Constraints

- Toggle visible only when `isDJ` — no flag gate needed
- Repeat resets to `false` only when DJ explicitly toggles off (persisted in DB, not reset on song change)
- Works only when `FLAGS.AUTO_PLAY_QUEUE` is active — toggle is always visible to DJ but only has effect when YouTube auto-player is running
