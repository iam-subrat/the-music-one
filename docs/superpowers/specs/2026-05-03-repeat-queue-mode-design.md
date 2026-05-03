# Repeat Mode (Song + Queue) Design

**Date:** 2026-05-03
**Status:** Approved

## Summary

Extend the existing repeat toggle into a three-state cycle: Off → Repeat Song → Repeat Queue → Off. Repeat Song loops the current track. Repeat Queue re-queues all played songs when the queue is exhausted, restarting from the first song. State persisted in DB as `repeat_mode` text enum on `sessions`.

## Architecture

### DB Changes

Replace `repeat boolean` with `repeat_mode text`:

```sql
ALTER TABLE sessions
  ADD COLUMN repeat_mode text NOT NULL DEFAULT 'none'
  CHECK (repeat_mode IN ('none', 'song', 'queue'));

UPDATE sessions SET repeat_mode = CASE WHEN repeat THEN 'song' ELSE 'none' END;

ALTER TABLE sessions DROP COLUMN repeat;

DROP FUNCTION IF EXISTS set_session_repeat(uuid, boolean);

CREATE OR REPLACE FUNCTION set_repeat_mode(p_session_id uuid, p_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_mode NOT IN ('none', 'song', 'queue') THEN
    RAISE EXCEPTION 'Invalid repeat mode';
  END IF;
  UPDATE sessions SET repeat_mode = p_mode
  WHERE id = p_session_id AND dj_user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION set_repeat_mode TO authenticated;
```

`play_next` RPC enhanced: when `v_next_id IS NULL` AND session `repeat_mode = 'queue'`, atomically reset all `played` items → `queued`, then re-select. If still NULL (only skipped songs remain), return NULL.

```sql
IF v_next_id IS NULL THEN
  IF EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id AND repeat_mode = 'queue') THEN
    UPDATE queue_items SET status = 'queued'
    WHERE session_id = p_session_id AND status = 'played';

    SELECT id INTO v_next_id
    FROM queue_items
    WHERE session_id = p_session_id AND status = 'queued'
    ORDER BY position ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

    IF v_next_id IS NULL THEN RETURN NULL; END IF;

    UPDATE queue_items SET status = 'playing' WHERE id = v_next_id;
    RETURN v_next_id;
  END IF;
  RETURN NULL;
END IF;
```

### Data Flow

```
DJ clicks button (cycles none → song → queue → none)
  → setRepeatMode(sessionId, nextMode)   [lib/session.js]
  → rpc('set_repeat_mode', ...)          [Supabase]
  → realtime UPDATE fires
  → useSession merges payload.new
  → JamRoom passes repeatMode to NowPlaying
  → NowPlaying updates button label + passes repeat={repeatMode==='song'} to YouTubeAutoPlayer
```

When queue exhausts with repeat_mode='queue':
```
song ENDED → handleEnded → playNext (RPC)
  → play_next detects no queued items + repeat_mode='queue'
  → atomically resets played→queued, picks first item
  → returns new item id (not null)
  → queue continues from top
```

### Components

**`lib/session.js`**
- Remove `setRepeat`
- Add `setRepeatMode(sessionId, mode)` → `supabase.rpc('set_repeat_mode', { p_session_id: sessionId, p_mode: mode })`

**`NowPlaying.jsx`**
- Prop: `repeat` → `repeatMode` ('none'|'song'|'queue')
- Click handler cycles: `{ none: 'song', song: 'queue', queue: 'none' }[repeatMode]`
- Button label: none → `🔁 Repeat`, song → `🔁 Repeat ✓`, queue → `🔂 Queue ✓`
- Active CSS: `repeatMode !== 'none'` → `.repeatBtnActive`
- YouTubeAutoPlayer: `repeat={repeatMode === 'song'}` (unchanged)
- `handleEnded`: remove `setRepeat(false)` call — server handles queue reset atomically; NULL only means truly empty (all skipped, nothing to cycle)

**`JamRoom.jsx`**
- `repeat={session.repeat ?? false}` → `repeatMode={session.repeat_mode ?? 'none'}`

### No Changes To

- `YouTubeAutoPlayer` — already accepts `repeat` boolean, unchanged
- `jam.module.css` — `.repeatBtn`/`.repeatBtnActive` work for all 3 states
- `useSession` — realtime subscription merges `repeat_mode` automatically

## Constraints

- DJ-only toggle — no flag gate needed
- Skipped songs are NOT re-queued when repeat queue cycles (only `played` songs)
- Server enforces DJ identity in `set_repeat_mode` RPC — non-DJ calls silently no-op
- `play_next` reset is atomic — no race condition between reset and next pick
