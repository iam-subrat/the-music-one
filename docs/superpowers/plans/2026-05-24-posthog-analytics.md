# PostHog Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument MusicOne with PostHog cloud analytics to track user lifecycle, Home conversion funnel, Jam Room engagement, and per-feature adoption — all visible in the PostHog internal dashboard.

**Architecture:** A thin `useAnalytics()` hook wraps `posthog-js` so all 8 instrumented files call one interface; swapping providers later means changing only `analytics.js`. PostHog is initialised once before React renders in `main.jsx`. User identity is established in `useAuth.js` and reset on sign-out.

**Tech Stack:** posthog-js 1.x, React 18, Vite (`import.meta.env`), no test runner.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `ui/src/lib/analytics.js` | PostHog init + `useAnalytics()` hook |
| Modify | `ui/.env.local.example` | Document `VITE_POSTHOG_KEY` |
| Modify | `ui/src/main.jsx` | Call `initAnalytics` before render |
| Modify | `ui/src/hooks/useAuth.js` | Identify user; fire lifecycle events |
| Modify | `ui/src/pages/Home.jsx` | Home conversion funnel events |
| Modify | `ui/src/pages/JamRoom.jsx` | Jam join/leave/end + time tracking |
| Modify | `ui/src/components/NowPlaying.jsx` | song_played, skip_vote_cast, feature_used |
| Modify | `ui/src/components/AddSongForm.jsx` | song_added |
| Modify | `ui/src/components/ParticipantList.jsx` | dj_token_passed |

---

## Events Reference

```
USER LIFECYCLE        user_signed_in, user_signed_out, preferred_platform_set
HOME FUNNEL           page_viewed, url_pasted, lookup_started, lookup_succeeded,
                      lookup_failed, platform_link_clicked
JAM ROOM              page_viewed, jam_session_created, jam_session_joined,
                      jam_tab_hidden, jam_tab_visible, jam_session_left,
                      jam_session_ended
ENGAGEMENT            song_added, song_played, skip_vote_cast, dj_token_passed
FEATURE ADOPTION      feature_used { feature: string }
```

Device type/OS/browser attached **automatically** by PostHog SDK to every event.

---

## Task 1: Install posthog-js and add env key

**Files:**
- Modify: `ui/package.json` (via npm install)
- Modify: `ui/.env.local.example`

- [ ] **Step 1: Install SDK**

```bash
cd ui && npm install posthog-js
```

Expected: `posthog-js` appears in `package.json` dependencies.

- [ ] **Step 2: Create a PostHog project**

1. Go to https://us.posthog.com (or https://eu.posthog.com for EU data residency)
2. Sign up / log in → create a new project named `MusicOne`
3. Copy the **Project API Key** (format: `phc_XXXX…`)
4. Add to `ui/.env.local`:
   ```
   VITE_POSTHOG_KEY=phc_your_key_here
   ```

- [ ] **Step 3: Document the env var**

In `ui/.env.local.example`, append:

```
# PostHog analytics (https://posthog.com — free cloud tier)
# VITE_POSTHOG_KEY=phc_your_key_here
```

- [ ] **Step 4: Commit**

```bash
git add ui/package.json ui/package-lock.json ui/.env.local.example
git commit -m "chore: install posthog-js, document VITE_POSTHOG_KEY env var"
```

---

## Task 2: Create analytics.js

**Files:**
- Create: `ui/src/lib/analytics.js`

- [ ] **Step 1: Write the file**

Create `ui/src/lib/analytics.js`:

```js
import posthog from 'posthog-js';

export function initAnalytics(apiKey) {
  if (!apiKey) return;
  posthog.init(apiKey, {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false,   // we fire page_viewed manually with custom props
    capture_pageleave: true,
    disable_session_recording: true,
  });
}

export function useAnalytics() {
  return {
    capture: (event, props = {}) => posthog.capture(event, props),
    identify: (userId, traits = {}) => posthog.identify(String(userId), traits),
    reset: () => posthog.reset(),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/lib/analytics.js
git commit -m "feat(analytics): add analytics.js wrapper around posthog-js"
```

---

## Task 3: Init PostHog in main.jsx

**Files:**
- Modify: `ui/src/main.jsx`

- [ ] **Step 1: Add initAnalytics call**

Replace the contents of `ui/src/main.jsx` with:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { loadFlags } from './lib/flags';
import { initAnalytics } from './lib/analytics';
import './styles/base.css';

initAnalytics(import.meta.env.VITE_POSTHOG_KEY);

loadFlags().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
});
```

- [ ] **Step 2: Verify in browser**

Run `npm run dev` in `ui/`. Open browser DevTools → Network tab → filter `posthog`. Load the app. You should see a request to `us.i.posthog.com` for the `$feature_flags_called` or `$pageview` bootstrap event confirming the SDK initialised.

- [ ] **Step 3: Commit**

```bash
git add ui/src/main.jsx
git commit -m "feat(analytics): init PostHog before React render in main.jsx"
```

---

## Task 4: Identify users in useAuth.js

**Files:**
- Modify: `ui/src/hooks/useAuth.js`

- [ ] **Step 1: Rewrite useAuth.js**

Replace the contents of `ui/src/hooks/useAuth.js` with:

```js
import { useState, useEffect, useRef } from 'react';
import { api, API_BASE } from '../lib/api';
import { useAnalytics } from '../lib/analytics';

export function useAuth() {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const { capture, identify, reset } = useAnalytics();
  const identifiedRef = useRef(false);

  useEffect(() => {
    api('/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setUser({ id: data.id });
          setProfile(data);
          if (!identifiedRef.current) {
            identify(data.id, {
              email:        data.email,
              display_name: data.display_name,
            });
            capture('user_signed_in', { auth_provider: 'google' });
            identifiedRef.current = true;
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function signInWithGoogle() {
    window.location.href = `${API_BASE}/api/auth/google`;
  }

  async function signOut() {
    await api('/auth/logout', { method: 'POST' });
    capture('user_signed_out');
    reset();
    identifiedRef.current = false;
    setUser(null);
    setProfile(null);
  }

  async function setPreferredPlatform(platform) {
    if (!user) return;
    const res = await api('/profiles/me', {
      method: 'PATCH',
      body: JSON.stringify({ preferred_platform: platform }),
    });
    if (res.ok) {
      setProfile(prev => ({ ...prev, preferred_platform: platform }));
      capture('preferred_platform_set', { platform });
    }
  }

  return { user, profile, loading, signInWithGoogle, signOut, setPreferredPlatform };
}
```

- [ ] **Step 2: Verify in browser**

Sign in with Google. Open PostHog → **Live Events** (https://us.posthog.com → your project → Activity → Live events). You should see `user_signed_in` appear with `auth_provider: google` and a person ID attached.

- [ ] **Step 3: Commit**

```bash
git add ui/src/hooks/useAuth.js
git commit -m "feat(analytics): identify user and fire lifecycle events in useAuth"
```

---

## Task 5: Instrument Home.jsx

**Files:**
- Modify: `ui/src/pages/Home.jsx`

- [ ] **Step 1: Add analytics calls**

In `ui/src/pages/Home.jsx`, apply these changes:

**Add import** (after existing imports):
```js
import { useAnalytics } from '../lib/analytics';
```

**Add hook call** inside the `Home` component (after existing hooks):
```js
const { capture } = useAnalytics();
```

**Add page_viewed on mount** (add after existing `useEffect` for query params):
```js
useEffect(() => {
  capture('page_viewed', { page: 'home' });
}, []);
```

**Replace `runSearch`** with:
```js
async function runSearch(url) {
  capture('lookup_started');
  setStatus('loading');
  setSong(null);
  try {
    const res = await api(`/song/?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`Song lookup failed (${res.status})`);
    const meta = await res.json();
    setSong(meta);
    setStatus('done');
    capture('lookup_succeeded', { platform_count: Object.keys(meta.platformLinks ?? {}).length });
    history.replaceState({}, '', `?url=${encodeURIComponent(url)}`);
  } catch (err) {
    setErrorMsg(err.message || 'Failed to fetch song info.');
    setStatus('error');
    capture('lookup_failed', { error: err.message });
  }
}
```

**Replace `handleSubmit`** with:
```js
function handleSubmit(e) {
  e.preventDefault();
  if (!inputUrl.trim()) return;
  const trimmed = inputUrl.trim();
  try {
    capture('url_pasted', { url_domain: new URL(trimmed).hostname });
  } catch { /* non-URL input — skip domain capture */ }
  runSearch(trimmed);
}
```

**Add onClick to each platform `<a>` tag** — replace the `<a>` opening tag inside the `platformGrid` map:
```jsx
<a
  key={key}
  href={href}
  target="_blank"
  rel="noopener noreferrer"
  className={`${s.platformCard} ${isDirect ? s.platformCardDirect : ''}`}
  style={{
    '--platform-color': p.color,
    animationDelay: `${i * 40}ms`,
  }}
  title={isDirect ? `Open on ${p.name}` : `Search on ${p.name}`}
  onClick={() => capture('platform_link_clicked', { platform: key, song_title: song?.title })}
>
```

- [ ] **Step 2: Verify in browser**

1. Load home page → PostHog Live Events should show `page_viewed { page: 'home' }`.
2. Paste a Spotify URL and submit → should show `url_pasted`, `lookup_started`, `lookup_succeeded`.
3. Click a platform card → should show `platform_link_clicked { platform: 'spotify', song_title: '...' }`.

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/Home.jsx
git commit -m "feat(analytics): instrument Home page conversion funnel"
```

---

## Task 6: Instrument JamRoom.jsx (join/leave/time tracking)

**Files:**
- Modify: `ui/src/pages/JamRoom.jsx`

- [ ] **Step 1: Add imports and refs**

Add to existing imports in `ui/src/pages/JamRoom.jsx`:
```js
import { useAnalytics } from '../lib/analytics';
```

Add these refs inside the `JamRoom` component, after existing `useRef` declarations:
```js
const { capture } = useAnalytics();
const joinedAtRef        = useRef(null);
const activeSecondsRef   = useRef(0);
const lastVisibleAtRef   = useRef(null);
const songsHeardRef      = useRef(0);
const peakParticipantsRef = useRef(0);
const didFireJoinRef     = useRef(false);
```

- [ ] **Step 2: Fire page_viewed on mount**

Add after the existing `useEffect` that redirects unauthenticated users:
```js
useEffect(() => {
  capture('page_viewed', { page: 'jam' });
}, []);
```

- [ ] **Step 3: Fire jam_session_joined / jam_session_created**

Replace the existing `joinSession` useEffect:
```js
useEffect(() => {
  if (!session?.id || !user?.id || didFireJoinRef.current) return;
  didFireJoinRef.current = true;
  joinedAtRef.current = Date.now();
  lastVisibleAtRef.current = document.visibilityState === 'visible' ? Date.now() : null;

  joinSession(session.id).then(() => {
    refreshParticipants();
    capture('jam_session_joined', {
      session_code:      code,
      participant_count: participants.length + 1,
    });
    if (session.host_user_id === user.id) {
      capture('jam_session_created', { session_code: code });
    }
  });
}, [session?.id, user?.id]);
```

- [ ] **Step 4: Track tab visibility (active time + events)**

Add after the heartbeat useEffect:
```js
useEffect(() => {
  if (!session?.id) return;

  function handleVisibility() {
    if (document.visibilityState === 'hidden') {
      if (lastVisibleAtRef.current !== null) {
        activeSecondsRef.current += (Date.now() - lastVisibleAtRef.current) / 1000;
        lastVisibleAtRef.current = null;
      }
      capture('jam_tab_hidden', { session_code: code });
    } else {
      lastVisibleAtRef.current = Date.now();
      capture('jam_tab_visible', { session_code: code });
    }
  }

  document.addEventListener('visibilitychange', handleVisibility);
  return () => document.removeEventListener('visibilitychange', handleVisibility);
}, [session?.id]);
```

- [ ] **Step 5: Track peak participants**

Add after the visibility useEffect:
```js
useEffect(() => {
  if (participants.length > peakParticipantsRef.current) {
    peakParticipantsRef.current = participants.length;
  }
}, [participants.length]);
```

- [ ] **Step 6: Fire jam_session_left on unmount**

Replace the existing pagehide/unmount useEffect (the one with `sessionIdRef`) with:
```js
useEffect(() => {
  const handlePageHide = () => {
    if (sessionIdRef.current) {
      navigator.sendBeacon(`${API_BASE}/api/sessions/${sessionIdRef.current}/leave`);
    }
  };
  window.addEventListener('pagehide', handlePageHide);

  return () => {
    window.removeEventListener('pagehide', handlePageHide);
    if (sessionIdRef.current && joinedAtRef.current) {
      const now = Date.now();
      const duration = Math.round((now - joinedAtRef.current) / 1000);
      const extraActive = lastVisibleAtRef.current !== null
        ? (now - lastVisibleAtRef.current) / 1000
        : 0;
      const active = Math.round(activeSecondsRef.current + extraActive);
      capture('jam_session_left', {
        session_code:      code,
        duration_seconds:  duration,
        active_seconds:    active,
        songs_heard:       songsHeardRef.current,
        peak_participants: peakParticipantsRef.current,
      });
      navigator.sendBeacon(`${API_BASE}/api/sessions/${sessionIdRef.current}/leave`);
    }
  };
}, []);
```

- [ ] **Step 7: Fire jam_session_ended on End Session click**

In the End Session button's `onClick`, replace:
```js
onClick={async () => {
  if (window.confirm("End this jam for everyone?")) {
    await endSession(session.id);
    navigate("/");
  }
}}
```
with:
```js
onClick={async () => {
  if (window.confirm("End this jam for everyone?")) {
    const played = queueItems.filter(i => ['played', 'playing', 'skipped'].includes(i.status));
    capture('jam_session_ended', {
      session_code:      code,
      total_songs:       played.length,
      peak_participants: peakParticipantsRef.current,
      duration_seconds:  joinedAtRef.current
        ? Math.round((Date.now() - joinedAtRef.current) / 1000)
        : 0,
    });
    await endSession(session.id);
    navigate("/");
  }
}}
```

- [ ] **Step 8: Verify in browser**

1. Create a jam session → PostHog Live Events shows `jam_session_joined` and `jam_session_created`.
2. Switch to another browser tab → shows `jam_tab_hidden`.
3. Switch back → shows `jam_tab_visible`.
4. Navigate away (SPA nav) → shows `jam_session_left` with `duration_seconds` and `active_seconds`.

- [ ] **Step 9: Commit**

```bash
git add ui/src/pages/JamRoom.jsx
git commit -m "feat(analytics): instrument JamRoom join/leave/time tracking events"
```

---

## Task 7: Instrument NowPlaying.jsx

**Files:**
- Modify: `ui/src/components/NowPlaying.jsx`

This file receives `nowPlaying` prop (the currently playing queue item). We fire `song_played` when it changes to a new song.

- [ ] **Step 1: Add import and hook**

Add import after existing imports:
```js
import { useAnalytics } from '../lib/analytics';
```

Add inside the `NowPlaying` component, after existing hooks:
```js
const { capture } = useAnalytics();
const prevNowPlayingIdRef = useRef(null);
const ytFeatureFiredRef   = useRef(false);
```

- [ ] **Step 2: Fire song_played when track changes**

Add useEffect after the existing `ytId` resolve useEffect:
```js
useEffect(() => {
  if (!nowPlaying || nowPlaying.id === prevNowPlayingIdRef.current) return;
  prevNowPlayingIdRef.current = nowPlaying.id;
  capture('song_played', {
    platform:    nowPlaying.platform_links ? Object.keys(nowPlaying.platform_links)[0] : 'unknown',
    source:      isDJ ? 'manual' : 'auto',
  });
}, [nowPlaying?.id]);
```

- [ ] **Step 3: Fire feature_used for youtube_embed**

Add to the existing `ytId` resolve useEffect, after `setYtId(directId); return;` and each `setYtId(id);` call — add a one-time fire. Alternatively, add a separate useEffect:

```js
useEffect(() => {
  if (!ytId || ytFeatureFiredRef.current) return;
  if (FLAGS.YOUTUBE_EMBED || FLAGS.AUTO_PLAY_QUEUE) {
    capture('feature_used', { feature: FLAGS.AUTO_PLAY_QUEUE ? 'auto_play_queue' : 'youtube_embed' });
    ytFeatureFiredRef.current = true;
  }
}, [ytId]);
```

- [ ] **Step 4: Fire skip_vote_cast in handleSkipVote**

Replace the `handleSkipVote` function:
```js
async function handleSkipVote() {
  try {
    if (hasVoted) {
      await removeSkipVote(nowPlaying.id, userId);
    } else {
      capture('skip_vote_cast', {
        votes_so_far: skipVotes + 1,
        threshold:    skipThreshold,
      });
      const skipped = await castSkipVote(nowPlaying.id, skipThreshold);
      if (skipped) onQueueChange?.();
    }
  } catch (e) {
    toast(e.message);
  }
}
```

- [ ] **Step 5: Verify in browser**

1. In a jam session, start playing a song (DJ clicks "Play Next") → PostHog Live Events shows `song_played`.
2. Cast a skip vote → shows `skip_vote_cast { votes_so_far: 1, threshold: N }`.
3. If YouTube embed is visible → shows `feature_used { feature: 'auto_play_queue' }`.

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/NowPlaying.jsx
git commit -m "feat(analytics): fire song_played, skip_vote_cast, feature_used in NowPlaying"
```

---

## Task 8: Instrument AddSongForm.jsx

**Files:**
- Modify: `ui/src/components/AddSongForm.jsx`

- [ ] **Step 1: Add import and hook**

Add import:
```js
import { useAnalytics } from '../lib/analytics';
```

Add inside `AddSongForm` component:
```js
const { capture } = useAnalytics();
```

- [ ] **Step 2: Fire song_added after successful add**

In `handleAdd`, replace:
```js
const item = await addToQueue(sessionId, trimmed);
toast(`"${item.title}" added to queue`);
setUrl('');
onAdded?.(item);
```
with:
```js
const item = await addToQueue(sessionId, trimmed);
const platform = detectPlatform(trimmed) ?? 'unknown';
const hasYoutube = !!(item.platform_links?.youtube || item.platform_links?.youtubemusic);
capture('song_added', { platform, has_youtube: hasYoutube });
toast(`"${item.title}" added to queue`);
setUrl('');
onAdded?.(item);
```

- [ ] **Step 3: Fire feature_used for playlist_import**

In `handleAdd`, in the `FLAGS.PLAYLIST_IMPORT && detectPlaylist(trimmed)` branch, add before `setPlaylistUrl`:
```js
capture('feature_used', { feature: 'playlist_import' });
```

- [ ] **Step 4: Verify in browser**

Add a song to a jam queue → PostHog Live Events shows `song_added { platform: 'spotify', has_youtube: true }`.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/AddSongForm.jsx
git commit -m "feat(analytics): fire song_added and feature_used in AddSongForm"
```

---

## Task 9: Instrument ParticipantList.jsx

**Files:**
- Modify: `ui/src/components/ParticipantList.jsx`

- [ ] **Step 1: Add import and hook**

Add import:
```js
import { useAnalytics } from '../lib/analytics';
```

Add inside `ParticipantList` component:
```js
const { capture } = useAnalytics();
```

- [ ] **Step 2: Fire dj_token_passed on Make DJ click**

Replace the Make DJ button's `onClick`:
```jsx
onClick={() =>
  passDjToken(session.id, p.id).then(() => {
    capture('dj_token_passed', { session_id: session.id });
    capture('feature_used', { feature: 'dj_token' });
    toast('DJ token passed!');
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/ParticipantList.jsx
git commit -m "feat(analytics): fire dj_token_passed and feature_used in ParticipantList"
```

---

## Task 10: Build PostHog dashboards

No code — PostHog UI configuration.

- [ ] **Step 1: Create Home Conversion Funnel**

In PostHog → **Insights** → New insight → **Funnel**:

Steps:
1. `page_viewed` where `page = home`
2. `url_pasted`
3. `lookup_succeeded`
4. `platform_link_clicked`

Save as "Home Conversion Funnel".

- [ ] **Step 2: Create Jam Adoption Funnel**

New Funnel:
1. `user_signed_in`
2. `jam_session_joined`
3. `song_added`
4. `song_played`

Save as "Jam Adoption Funnel".

- [ ] **Step 3: Create Growth Dashboard**

**Insights** → New dashboard → "Growth":

| Chart | Type | Event |
|-------|------|-------|
| Daily Active Users | Trend | `user_signed_in` unique users |
| New sign-ins / day | Trend | `user_signed_in` total |
| Sign-out rate | Trend | `user_signed_out` |

- [ ] **Step 4: Create Jam Health Dashboard**

New dashboard → "Jam Health":

| Chart | Type | Config |
|-------|------|--------|
| Avg session duration | Trend | `jam_session_left` avg of `duration_seconds` |
| Avg active time | Trend | `jam_session_left` avg of `active_seconds` |
| Songs per session | Trend | `jam_session_left` avg of `songs_heard` |
| Avg peak participants | Trend | `jam_session_left` avg of `peak_participants` |

- [ ] **Step 5: Create Feature Adoption Dashboard**

New dashboard → "Feature Adoption":

Add one Trend insight for `feature_used`, broken down by `feature` property. This gives a single chart showing adoption rate for every flag-gated feature.

- [ ] **Step 6: Create Device Dashboard**

New dashboard → "Devices":

- Pie chart: `page_viewed` broken down by `$device_type`
- Pie chart: `page_viewed` broken down by `$browser`
- Pie chart: `page_viewed` broken down by `$os`

---

## Self-Review Checklist

- [x] All events from design are covered across Tasks 4–9
- [x] `useAnalytics()` used in every instrumented file — no direct posthog imports outside `analytics.js`
- [x] `capture` signature consistent: `capture(event: string, props?: object)` 
- [x] `didFireJoinRef` prevents double-firing join on StrictMode double-mount
- [x] `identifiedRef` prevents double-firing `user_signed_in` on StrictMode double-mount
- [x] `prevNowPlayingIdRef` prevents re-firing `song_played` on re-render with same song
- [x] Tab visibility tracking handles: starts visible, starts hidden, multiple switches
- [x] `jam_session_left` fires on SPA unmount only (browser close gets pagehide → sendBeacon but no PostHog event — acceptable)
- [x] Feature flags `FLAGS.PLAYLIST_IMPORT`, `FLAGS.DJ_TOKEN`, `FLAGS.VOTE_TO_SKIP` gating respected — events only fire when flags are on
- [x] `VITE_POSTHOG_KEY` undefined → `initAnalytics` returns early → zero PostHog calls in dev without key
