# Repeat Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a DJ-controlled repeat toggle that replays the current song on end instead of advancing the queue, persisted in the DB so it survives refresh and cross-device rejoins.

**Architecture:** `repeat boolean` column added to `sessions` table. DJ updates it via a `setRepeat()` lib call. `useSession` already subscribes to `sessions` realtime UPDATEs so the value propagates to all clients automatically. `YouTubeAutoPlayer` receives `repeat` as a prop and restarts the player on `ENDED` instead of calling `onEnded`.

**Tech Stack:** React 18, Vite, Supabase (postgres + realtime), YouTube IFrame API

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/20260503000002_add_repeat_to_sessions.sql` | CREATE — add `repeat` column + update RLS |
| `src/lib/session.js` | MODIFY — add `setRepeat()` |
| `src/components/YouTubeAutoPlayer.jsx` | MODIFY — accept `repeat` prop, restart on ENDED |
| `src/components/NowPlaying.jsx` | MODIFY — accept `repeat` prop, render toggle button |
| `src/pages/JamRoom.jsx` | MODIFY — pass `repeat` prop to `NowPlaying` |
| `src/styles/jam.module.css` | MODIFY — add `.repeatBtn` + `.repeatBtnActive` |

---

### Task 1: DB Migration — add `repeat` column and fix RLS

**Files:**
- Create: `supabase/migrations/20260503000002_add_repeat_to_sessions.sql`

The existing RLS UPDATE policy for `sessions` only allows `host_user_id`. The DJ may be a different user, so we must expand it to also allow `dj_user_id`.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260503000002_add_repeat_to_sessions.sql

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS repeat boolean DEFAULT false NOT NULL;

-- Expand UPDATE policy so DJ (who may differ from host) can toggle repeat
DROP POLICY IF EXISTS "Sessions updatable by host" ON sessions;
CREATE POLICY "Sessions updatable by host or dj" ON sessions
  FOR UPDATE USING (
    auth.uid() = host_user_id OR auth.uid() = dj_user_id
  );
```

- [ ] **Step 2: Apply the migration**

If using Supabase CLI:
```bash
supabase db push
```

If applying manually via Supabase dashboard SQL editor, paste the contents of the migration file and run it.

- [ ] **Step 3: Verify**

In Supabase dashboard → Table Editor → `sessions` table: confirm `repeat` column exists with type `bool`, default `false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260503000002_add_repeat_to_sessions.sql
git commit -m "feat(db): add repeat column to sessions, expand update RLS to dj"
```

---

### Task 2: Add `setRepeat` to `src/lib/session.js`

**Files:**
- Modify: `src/lib/session.js`

- [ ] **Step 1: Add the function**

Open `src/lib/session.js`. After the `endSession` function, add:

```js
export async function setRepeat(sessionId, value) {
  const { error } = await supabase.from('sessions').update({ repeat: value }).eq('id', sessionId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Verify manually**

Start dev server (`npm run dev`). Open a jam session as the DJ in the browser console and run:

```js
import('/src/lib/session.js').then(m => m.setRepeat('<your-session-id>', true))
```

Check Supabase Table Editor that `repeat = true` on that session row.

- [ ] **Step 3: Commit**

```bash
git add src/lib/session.js
git commit -m "feat: add setRepeat to session lib"
```

---

### Task 3: Update `YouTubeAutoPlayer` to support `repeat` prop

**Files:**
- Modify: `src/components/YouTubeAutoPlayer.jsx`

The player is keyed on `videoId` and remounts on song change. The `repeat` prop must be captured in a ref to avoid a stale closure inside the `useEffect` — the effect only runs on `videoId` change, so a plain variable would freeze the value at mount time.

- [ ] **Step 1: Add `repeatRef` and update `onStateChange`**

Replace the full file content with:

```jsx
import { useEffect, useRef } from 'react';
import s from '../styles/jam.module.css';

let apiLoaded = false;
let apiReady = false;
const readyCallbacks = [];

function loadApi() {
  if (apiLoaded) return;
  apiLoaded = true;
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = function () {
    prev?.();
    apiReady = true;
    readyCallbacks.forEach(cb => cb());
    readyCallbacks.length = 0;
  };
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

export default function YouTubeAutoPlayer({ videoId, onEnded, repeat }) {
  const wrapperRef = useRef(null);
  const playerRef = useRef(null);
  const repeatRef = useRef(repeat);

  // Keep repeatRef current without remounting the player
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);

  useEffect(() => {
    loadApi();

    function initPlayer() {
      if (!wrapperRef.current) return;
      const playerDiv = document.createElement('div');
      wrapperRef.current.appendChild(playerDiv);
      playerRef.current = new window.YT.Player(playerDiv, {
        videoId,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
        events: {
          onStateChange: (e) => {
            if (e.data === window.YT.PlayerState.ENDED) {
              if (repeatRef.current) {
                playerRef.current.seekTo(0);
                playerRef.current.playVideo();
              } else {
                onEnded?.();
              }
            }
          },
        },
      });
    }

    let queued = false;
    if (apiReady) {
      initPlayer();
    } else {
      readyCallbacks.push(initPlayer);
      queued = true;
    }

    return () => {
      if (queued) {
        const idx = readyCallbacks.indexOf(initPlayer);
        if (idx !== -1) readyCallbacks.splice(idx, 1);
      }
      playerRef.current?.destroy();
      playerRef.current = null;
      if (wrapperRef.current) wrapperRef.current.innerHTML = '';
    };
  }, [videoId]);

  return <div ref={wrapperRef} className={s.ytEmbed} />;
}
```

- [ ] **Step 2: Verify manually**

Open a jam session with `FLAGS.AUTO_PLAY_QUEUE` enabled. Let a song play to the end with repeat off — confirm it advances. Then enable repeat (we'll wire the button in Task 4) — skip this verification step for now; full end-to-end verified after Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/components/YouTubeAutoPlayer.jsx
git commit -m "feat: add repeat prop to YouTubeAutoPlayer, restart on ENDED when active"
```

---

### Task 4: Add repeat button styles to `jam.module.css`

**Files:**
- Modify: `src/styles/jam.module.css`

- [ ] **Step 1: Add `.repeatBtn` and `.repeatBtnActive`**

In `src/styles/jam.module.css`, find the line:

```css
.djControls { display: flex; gap: 10px; }
```

Add the two new classes immediately after it:

```css
.repeatBtn { padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--muted); font-size: 0.82rem; cursor: pointer; transition: border-color 0.2s, color 0.2s; }
.repeatBtnActive { border-color: var(--accent); color: var(--accent); }
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/jam.module.css
git commit -m "feat: add repeatBtn styles to jam.module.css"
```

---

### Task 5: Update `NowPlaying` — accept `repeat` prop and render toggle

**Files:**
- Modify: `src/components/NowPlaying.jsx`

- [ ] **Step 1: Import `setRepeat`**

Find the existing import line:

```js
import { castSkipVote, removeSkipVote, playNext, patchYouTubeLink } from '../lib/queue';
```

Add `setRepeat` import on a separate line below it:

```js
import { setRepeat } from '../lib/session';
```

- [ ] **Step 2: Add `repeat` to the component signature**

Change:

```js
export default function NowPlaying({ nowPlaying, sessionId, isDJ, preferredPlatform, participantCount, userId, onQueueChange }) {
```

To:

```js
export default function NowPlaying({ nowPlaying, sessionId, isDJ, preferredPlatform, participantCount, userId, onQueueChange, repeat }) {
```

- [ ] **Step 3: Pass `repeat` to `YouTubeAutoPlayer`**

Find:

```jsx
<YouTubeAutoPlayer key={ytId} videoId={ytId} onEnded={handleEnded} />
```

Change to:

```jsx
<YouTubeAutoPlayer key={ytId} videoId={ytId} onEnded={handleEnded} repeat={repeat} />
```

- [ ] **Step 4: Add repeat toggle button in `djControls`**

Find the `djControls` block:

```jsx
<div className={s.djControls}>
  {isDJ && (
    <button className="btn" onClick={() => playNext(sessionId).then(n => { onQueueChange?.(); if (!n) toast('Queue is empty!'); })}>
      Next ▶
    </button>
  )}
  {FLAGS.VOTE_TO_SKIP && (
    <button
      className={`${s.skipBtn} ${hasVoted ? s.skipBtnVoted : ''}`}
      onClick={handleSkipVote}
    >
      👎 Skip ({skipVotes}/{skipThreshold}){hasVoted ? ' ✓' : ''}
    </button>
  )}
</div>
```

Replace with:

```jsx
<div className={s.djControls}>
  {isDJ && (
    <button className="btn" onClick={() => playNext(sessionId).then(n => { onQueueChange?.(); if (!n) toast('Queue is empty!'); })}>
      Next ▶
    </button>
  )}
  {isDJ && (
    <button
      className={`${s.repeatBtn} ${repeat ? s.repeatBtnActive : ''}`}
      onClick={() => setRepeat(sessionId, !repeat).catch(e => toast(e.message))}
    >
      🔁 Repeat{repeat ? ' ✓' : ''}
    </button>
  )}
  {FLAGS.VOTE_TO_SKIP && (
    <button
      className={`${s.skipBtn} ${hasVoted ? s.skipBtnVoted : ''}`}
      onClick={handleSkipVote}
    >
      👎 Skip ({skipVotes}/{skipThreshold}){hasVoted ? ' ✓' : ''}
    </button>
  )}
</div>
```

- [ ] **Step 5: Commit**

```bash
git add src/components/NowPlaying.jsx
git commit -m "feat: add repeat toggle button to NowPlaying DJ controls"
```

---

### Task 6: Wire `repeat` prop in `JamRoom`

**Files:**
- Modify: `src/pages/JamRoom.jsx`

- [ ] **Step 1: Pass `repeat` to `NowPlaying`**

Find the `NowPlaying` usage:

```jsx
<NowPlaying
  nowPlaying={nowPlaying}
  sessionId={session.id}
  isDJ={isDJ}
  preferredPlatform={profile?.preferred_platform}
  participantCount={participants.length}
  userId={user?.id}
  onQueueChange={refreshQueue}
/>
```

Replace with:

```jsx
<NowPlaying
  nowPlaying={nowPlaying}
  sessionId={session.id}
  isDJ={isDJ}
  preferredPlatform={profile?.preferred_platform}
  participantCount={participants.length}
  userId={user?.id}
  onQueueChange={refreshQueue}
  repeat={session.repeat ?? false}
/>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/JamRoom.jsx
git commit -m "feat: pass repeat from session to NowPlaying"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open a jam session as DJ**

Navigate to a jam session where you are the DJ. Confirm the "🔁 Repeat" button appears in the DJ controls next to "Next ▶".

- [ ] **Step 3: Toggle repeat on**

Click "🔁 Repeat". Confirm:
- Button border and text change to accent color
- "🔁 Repeat ✓" label appears
- Supabase Table Editor shows `repeat = true` on the session row

- [ ] **Step 4: Toggle repeat off**

Click again. Confirm button returns to muted style and DB shows `repeat = false`.

- [ ] **Step 5: Test cross-device persistence**

With repeat enabled, open the same session in a second browser tab (or different device) as the same DJ user. Confirm the button shows active state on load.

- [ ] **Step 6: Test playback loop (requires `FLAGS.AUTO_PLAY_QUEUE = true`)**

With repeat on, let a song play to the end. Confirm it restarts from the beginning instead of advancing the queue.

With repeat off, let a song play to the end. Confirm it advances to the next song normally.

- [ ] **Step 7: Test non-DJ participant**

Open the session as a non-DJ participant. Confirm the repeat button is not visible.
