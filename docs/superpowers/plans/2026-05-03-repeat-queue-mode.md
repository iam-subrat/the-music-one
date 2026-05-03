# Repeat Mode (Song + Queue) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing `repeat boolean` with a three-state `repeat_mode` enum ('none'|'song'|'queue'), cycling Off → Repeat Song → Repeat Queue → Off via a single DJ-only button.

**Architecture:** DB migration replaces `repeat boolean` with `repeat_mode text` and introduces a `set_repeat_mode` SECURITY DEFINER RPC. The `play_next` RPC is enhanced to atomically reset all `played` queue items back to `queued` when the queue exhausts and `repeat_mode = 'queue'`. The client cycles the mode on click and passes `repeat={repeatMode === 'song'}` to `YouTubeAutoPlayer` unchanged.

**Tech Stack:** React 18, Vite, Supabase (postgres + realtime), YouTube IFrame API

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/20260503000004_repeat_mode.sql` | CREATE — migrate column, new RPC, enhance play_next |
| `src/lib/session.js` | MODIFY — replace `setRepeat` with `setRepeatMode` |
| `src/components/NowPlaying.jsx` | MODIFY — `repeat` prop → `repeatMode`, cycling button, fix handleEnded |
| `src/pages/JamRoom.jsx` | MODIFY — pass `repeatMode` instead of `repeat` |

---

### Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260503000004_repeat_mode.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260503000004_repeat_mode.sql

-- Add repeat_mode column
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS repeat_mode text NOT NULL DEFAULT 'none'
  CHECK (repeat_mode IN ('none', 'song', 'queue'));

-- Migrate existing repeat boolean values (true → 'song', false → 'none')
UPDATE sessions SET repeat_mode = 'song' WHERE repeat = true;

-- Drop old boolean column
ALTER TABLE sessions DROP COLUMN IF EXISTS repeat;

-- Drop old repeat RPC
DROP FUNCTION IF EXISTS set_session_repeat(uuid, boolean);

-- New DJ-scoped RPC: only updates repeat_mode, enforces dj_user_id server-side
CREATE OR REPLACE FUNCTION set_repeat_mode(p_session_id uuid, p_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_mode NOT IN ('none', 'song', 'queue') THEN
    RAISE EXCEPTION 'Invalid repeat mode: %', p_mode;
  END IF;
  UPDATE sessions SET repeat_mode = p_mode
  WHERE id = p_session_id AND dj_user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION set_repeat_mode TO authenticated;

-- Enhance play_next: when queue exhausted + repeat_mode='queue', reset played→queued atomically
CREATE OR REPLACE FUNCTION public.play_next(p_session_id uuid, p_skip_status text DEFAULT 'played', p_check_auth boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_next_id uuid;
BEGIN
  IF p_check_auth AND NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id
      AND (host_user_id = auth.uid() OR dj_user_id = auth.uid())
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only the DJ or host can advance the queue';
  END IF;

  UPDATE queue_items SET status = p_skip_status
  WHERE session_id = p_session_id AND status = 'playing';

  -- FOR UPDATE SKIP LOCKED prevents two concurrent calls from both picking same item
  SELECT id INTO v_next_id
  FROM queue_items
  WHERE session_id = p_session_id AND status = 'queued'
  ORDER BY position ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_next_id IS NULL THEN
    -- Queue repeat: reset all played songs and restart from top
    IF EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id AND repeat_mode = 'queue') THEN
      UPDATE queue_items SET status = 'queued'
      WHERE session_id = p_session_id AND status = 'played';

      SELECT id INTO v_next_id
      FROM queue_items
      WHERE session_id = p_session_id AND status = 'queued'
      ORDER BY position ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;

      IF v_next_id IS NULL THEN
        RETURN NULL; -- Only skipped songs remain — truly empty
      END IF;

      UPDATE queue_items SET status = 'playing' WHERE id = v_next_id;
      RETURN v_next_id;
    END IF;

    RETURN NULL;
  END IF;

  UPDATE queue_items SET status = 'playing' WHERE id = v_next_id;
  RETURN v_next_id;
END;
$$;
```

- [ ] **Step 2: Apply the migration**

If using Supabase CLI:
```bash
supabase db push
```

If applying manually, paste the migration contents into the Supabase dashboard SQL editor and run.

- [ ] **Step 3: Verify**

In Supabase dashboard → Table Editor → `sessions`: confirm `repeat_mode` column exists (type text, default 'none'). Confirm `repeat` column is gone.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260503000004_repeat_mode.sql
git commit -m "feat(db): replace repeat boolean with repeat_mode enum, enhance play_next for queue repeat"
```

---

### Task 2: Update `src/lib/session.js`

**Files:**
- Modify: `src/lib/session.js`

- [ ] **Step 1: Replace `setRepeat` with `setRepeatMode`**

Find:
```js
export async function setRepeat(sessionId, value) {
  const { error } = await supabase.rpc('set_session_repeat', { p_session_id: sessionId, p_repeat: value });
  if (error) throw new Error(error.message);
}
```

Replace with:
```js
export async function setRepeatMode(sessionId, mode) {
  const { error } = await supabase.rpc('set_repeat_mode', { p_session_id: sessionId, p_mode: mode });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/session.js
git commit -m "feat: replace setRepeat with setRepeatMode in session lib"
```

---

### Task 3: Update `src/components/NowPlaying.jsx`

**Files:**
- Modify: `src/components/NowPlaying.jsx`

Four changes in this file.

- [ ] **Step 1: Update import**

Find:
```js
import { setRepeat } from '../lib/session';
```

Replace with:
```js
import { setRepeatMode } from '../lib/session';
```

- [ ] **Step 2: Update component signature**

Find:
```js
export default function NowPlaying({ nowPlaying, sessionId, isDJ, preferredPlatform, participantCount, userId, onQueueChange, repeat }) {
```

Replace with:
```js
export default function NowPlaying({ nowPlaying, sessionId, isDJ, preferredPlatform, participantCount, userId, onQueueChange, repeatMode }) {
```

- [ ] **Step 3: Update `handleEnded`**

Find:
```js
  async function handleEnded() {
    if (!isDJ) return;
    try {
      const next = await playNext(sessionId);
      onQueueChange?.();
      if (!next) {
        toast('Queue is empty!');
        if (repeat) setRepeat(sessionId, false).catch(() => {});
      }
    } catch (e) {
      toast(e.message);
    }
  }
```

Replace with:
```js
  async function handleEnded() {
    if (!isDJ) return;
    try {
      const next = await playNext(sessionId);
      onQueueChange?.();
      if (!next) toast('Queue is empty!');
    } catch (e) {
      toast(e.message);
    }
  }
```

- [ ] **Step 4: Update `YouTubeAutoPlayer` prop and repeat button**

Find:
```jsx
          <YouTubeAutoPlayer key={ytId} videoId={ytId} onEnded={handleEnded} repeat={repeat} />
```

Replace with:
```jsx
          <YouTubeAutoPlayer key={ytId} videoId={ytId} onEnded={handleEnded} repeat={repeatMode === 'song'} />
```

Find the repeat button block:
```jsx
        {isDJ && (
          <button
            className={`${s.repeatBtn} ${repeat ? s.repeatBtnActive : ''}`}
            onClick={() => setRepeat(sessionId, !repeat).catch(e => toast(e.message))}
          >
            🔁 Repeat{repeat ? ' ✓' : ''}
          </button>
        )}
```

Replace with:
```jsx
        {isDJ && (
          <button
            className={`${s.repeatBtn} ${repeatMode !== 'none' ? s.repeatBtnActive : ''}`}
            onClick={() => setRepeatMode(sessionId, { none: 'song', song: 'queue', queue: 'none' }[repeatMode]).catch(e => toast(e.message))}
          >
            {repeatMode === 'queue' ? '🔂 Queue ✓' : repeatMode === 'song' ? '🔁 Repeat ✓' : '🔁 Repeat'}
          </button>
        )}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/NowPlaying.jsx
git commit -m "feat: update NowPlaying to use repeatMode (none/song/queue) cycling button"
```

---

### Task 4: Update `src/pages/JamRoom.jsx`

**Files:**
- Modify: `src/pages/JamRoom.jsx`

- [ ] **Step 1: Update NowPlaying prop**

Find:
```jsx
            repeat={session.repeat ?? false}
```

Replace with:
```jsx
            repeatMode={session.repeat_mode ?? 'none'}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/JamRoom.jsx
git commit -m "feat: pass repeatMode from session to NowPlaying"
```

---

### Task 5: End-to-end verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify button cycles correctly**

Open a jam session as DJ. Confirm the repeat button cycles through 3 states on each click:
- Initial state: `🔁 Repeat` (no accent color)
- After 1st click: `🔁 Repeat ✓` (accent border + text)
- After 2nd click: `🔂 Queue ✓` (accent border + text)
- After 3rd click: `🔁 Repeat` (back to inactive)

Check Supabase Table Editor after each click — `repeat_mode` column shows `none` → `song` → `queue` → `none`.

- [ ] **Step 3: Verify cross-device sync**

With repeat_mode set to 'queue', open the session in a second browser tab. Confirm the button shows `🔂 Queue ✓` on load (realtime picks up DB value).

- [ ] **Step 4: Test Repeat Song mode (requires `FLAGS.AUTO_PLAY_QUEUE = true`)**

Set mode to `🔁 Repeat ✓`. Let a song play to the end. Confirm it restarts the same song instead of advancing the queue.

- [ ] **Step 5: Test Repeat Queue mode**

Add 2 songs to queue, set mode to `🔂 Queue ✓`. Let both songs play through. When the second song ends, confirm the queue resets — both songs appear as `queued` again in the Supabase Table Editor and the first song starts playing.

- [ ] **Step 6: Verify skipped songs stay skipped on queue repeat**

Add 3 songs. Skip one via vote or DJ skip. Let the remaining 2 play through with Repeat Queue on. Confirm only the 2 played songs are re-queued — the skipped song stays skipped.

- [ ] **Step 7: Test non-DJ participant**

Open the session as a non-DJ participant. Confirm the repeat button is not visible.
