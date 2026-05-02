# themusic.one — Jam Session MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend themusic.one from a single-shot URL converter into a real-time cross-platform group listening coordination app ("jam sessions"), where users on different music platforms can queue songs together and each plays them on their own platform.

**Architecture:** React + Vite SPA on GitHub Pages. Supabase for auth, Postgres, and realtime. Custom hooks encapsulate Supabase subscriptions so components stay declarative. All audio delegated to the user's own platform — no streaming cost.

**Tech Stack:** React 18, Vite 5, React Router v6, Supabase JS v2, Supabase Auth (Google OAuth), Supabase Realtime, Supabase Postgres, Odesli API (existing proxy), YouTube iframe API, GitHub Pages, GitHub Actions.

---

## Production Readiness Audit — Gaps Fixed

Pre-implementation review identified the following issues. All are addressed in this spec.

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | BLOCKER | GitHub Pages returns 404 on direct `/jam/:code` URL access (no SPA fallback) | `public/404.html` redirect trick |
| 2 | BLOCKER | `CNAME` not in `public/` → Vite build drops it → custom domain breaks after first deploy | Move `CNAME` → `public/CNAME` |
| 3 | BLOCKER | Queue position race condition: two simultaneous adds → duplicate positions | Replace `position integer` with `GENERATED ALWAYS AS IDENTITY` + `UNIQUE` constraint |
| 4 | BLOCKER | DJ leaves/disconnects → `dj_user_id = NULL` → queue stalls forever | DB trigger auto-promotes host when DJ removed |
| 5 | BLOCKER | Skip votes RLS: any authenticated user can vote on any session's songs | Add session membership check to RLS policy |
| 6 | IMPORTANT | `.gitignore` missing → `node_modules/`, `.env.local` will be committed | Task 1 creates `.gitignore` |
| 7 | IMPORTANT | `npm ci` in CI requires `package-lock.json` committed | Task 1 commits `package-lock.json` |
| 8 | IMPORTANT | `supabase/schema.sql` file never created in any task | Task 0.5 creates it |
| 9 | IMPORTANT | Local dev breaks: `__SUPABASE_URL__` undefined without `.env.local` | `.env.local.example` + Vite env var handling |
| 10 | IMPORTANT | `last_activity_at` column never updated → session expiry unusable | DB trigger updates it on any queue insert |
| 11 | IMPORTANT | Session 24h auto-expiry not implemented | `expires_at` column + Supabase pg_cron job |
| 12 | IMPORTANT | Guest/anonymous user support mentioned in design but not implemented | Explicitly dropped from MVP: Google login required |
| 13 | MINOR | `max_participants` enforced in schema but not in code | Column kept, enforcement deferred to Phase 4 |
| 14 | MINOR | `public/favicon.svg` referenced in `index.html` but doesn't exist | `public/` setup task covers this |

---

## Why React + Vite

The jam room has 4+ independent real-time state streams updating simultaneously (queue items, now-playing, participants, skip votes, session status). Vanilla JS string-template re-renders nuke the entire DOM on each event — losing input focus, causing flicker, leaking event listeners. React's VDOM diffs these independently per component.

Phase 2 (chat + reactions) adds 3 more concurrent streams. Vanilla breaks down there.

**Trade-off accepted:** adds `npm install && vite build` to CI. Hosting stays $0 on GitHub Pages.

| Layer | Choice | Why |
|-------|--------|-----|
| UI | React 18 | Component isolation, concurrent rendering |
| Build | Vite 5 | Fast HMR, optimised prod bundle, no config overhead |
| Routing | React Router v6 | Clean `/jam/:code`, `/login`, `/` routes |
| State | useState + useEffect | No Redux needed at MVP scale |
| Styling | CSS Modules + existing CSS vars | Scoped styles, no runtime cost |
| Backend | Supabase (Auth + Postgres + Realtime) | Auth, DB, WebSocket in one free-tier SDK |

---

## Phased Roadmap

| Phase | Scope | Estimate |
|-------|-------|----------|
| **Phase 1 — MVP (this plan)** | Core jam sessions | 3–4 weeks |
| Phase 2 — Social | Reactions, chat, session history, profiles | 2 weeks |
| Phase 3 — Discovery | Shared playlists, feed, taste matching | 2–3 weeks |
| Phase 4 — Advanced DJ | Scheduled jams, queue rules, embed widget | 1–2 weeks |

---

## Feature Flags

Every feature is gated behind a central flags object. Toggle without redeploy via Supabase dashboard.

### `src/lib/flags.js`

```js
// Static defaults injected by GitHub Actions at build time.
// Runtime overrides fetched from Supabase `feature_flags` table on app init.
export const FLAGS = {
  // Phase 1
  JAM_SESSION:         __FLAG_JAM_SESSION__,
  VOTE_TO_SKIP:        __FLAG_VOTE_TO_SKIP__,
  DJ_TOKEN:            __FLAG_DJ_TOKEN__,
  YOUTUBE_EMBED:       __FLAG_YOUTUBE_EMBED__,
  PLATFORM_AUTODETECT: __FLAG_PLATFORM_AUTODETECT__,
  // Phase 2
  REACTIONS:           __FLAG_REACTIONS__,
  CHAT:                __FLAG_CHAT__,
  SESSION_HISTORY:     __FLAG_SESSION_HISTORY__,
  USER_PROFILES:       __FLAG_USER_PROFILES__,
  // Phase 3
  SHARED_PLAYLISTS:    __FLAG_SHARED_PLAYLISTS__,
  DISCOVERY_FEED:      __FLAG_DISCOVERY_FEED__,
  TASTE_MATCHING:      __FLAG_TASTE_MATCHING__,
  // Phase 4
  SCHEDULED_JAMS:      __FLAG_SCHEDULED_JAMS__,
  QUEUE_RULES:         __FLAG_QUEUE_RULES__,
  EMBED_WIDGET:        __FLAG_EMBED_WIDGET__,
};

export async function loadRemoteFlags(supabase) {
  try {
    const { data } = await supabase.from('feature_flags').select('key, enabled');
    if (data) data.forEach(r => { if (r.key in FLAGS) FLAGS[r.key] = r.enabled; });
  } catch { /* remote unavailable — static defaults remain */ }
}
```

Vite replaces the `__FLAG_*__` literals at build time via `define` in `vite.config.js`. To disable a live feature without redeploy: set `enabled = false` in Supabase dashboard → takes effect on next page load.

---

## Data Model

Run in Supabase SQL editor. Full file at `supabase/schema.sql`.

```sql
-- User profiles (extends auth.users)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  preferred_platform text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles readable" ON profiles FOR SELECT USING (true);
CREATE POLICY "Own profile editable"     ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Profile auto-created"     ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Jam sessions
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code text UNIQUE NOT NULL,
  host_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  dj_user_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','ended')),
  max_participants integer DEFAULT 20,
  created_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  last_activity_at timestamptz DEFAULT now()
);
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sessions readable"           ON sessions FOR SELECT USING (true);
CREATE POLICY "Sessions creatable by authed" ON sessions FOR INSERT WITH CHECK (auth.uid() = host_user_id);
CREATE POLICY "Sessions updatable by host"  ON sessions FOR UPDATE USING (auth.uid() = host_user_id OR auth.uid() = dj_user_id);

-- Participants
CREATE TABLE session_participants (
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at  timestamptz DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants readable"           ON session_participants FOR SELECT USING (true);
CREATE POLICY "Participants insertable by self" ON session_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Participants deletable by self"  ON session_participants FOR DELETE USING (auth.uid() = user_id);

-- Queue items
-- position uses GENERATED ALWAYS AS IDENTITY + UNIQUE per session → prevents race condition
-- (two simultaneous inserts cannot produce duplicate positions)
CREATE TABLE queue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid REFERENCES sessions(id) ON DELETE CASCADE,
  added_by_user_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  position          bigint GENERATED ALWAYS AS IDENTITY,
  title             text NOT NULL,
  artist            text NOT NULL,
  thumbnail_url     text,
  platform_links    jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','playing','played','skipped')),
  added_at timestamptz DEFAULT now(),
  UNIQUE (session_id, position)
);
ALTER TABLE queue_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Queue readable"                ON queue_items FOR SELECT USING (true);
CREATE POLICY "Queue insertable by participant" ON queue_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM session_participants WHERE session_id = queue_items.session_id AND user_id = auth.uid())
);
CREATE POLICY "Queue updatable by dj or host" ON queue_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM sessions WHERE id = queue_items.session_id AND (host_user_id = auth.uid() OR dj_user_id = auth.uid()))
);

-- Trigger: update session last_activity_at on every queue insert
CREATE OR REPLACE FUNCTION touch_session_activity() RETURNS trigger AS $$
BEGIN
  UPDATE sessions SET last_activity_at = now() WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_queue_item_added
  AFTER INSERT ON queue_items
  FOR EACH ROW EXECUTE PROCEDURE touch_session_activity();

-- Skip votes
CREATE TABLE skip_votes (
  queue_item_id uuid REFERENCES queue_items(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES profiles(id) ON DELETE CASCADE,
  voted_at      timestamptz DEFAULT now(),
  PRIMARY KEY (queue_item_id, user_id)
);
ALTER TABLE skip_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Votes readable" ON skip_votes FOR SELECT USING (true);
-- Fixed: verify voter is a participant in the session (not just any auth'd user)
CREATE POLICY "Votes insertable by session participant" ON skip_votes FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM queue_items qi
    JOIN session_participants sp ON sp.session_id = qi.session_id
    WHERE qi.id = skip_votes.queue_item_id AND sp.user_id = auth.uid()
  )
);

-- Feature flags
CREATE TABLE feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Flags readable by all" ON feature_flags FOR SELECT USING (true);

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('JAM_SESSION',          true,  'Core jam session feature'),
  ('VOTE_TO_SKIP',         true,  'Skip voting by participants'),
  ('DJ_TOKEN',             true,  'DJ token pass between participants'),
  ('YOUTUBE_EMBED',        true,  'Embedded YouTube player fallback'),
  ('PLATFORM_AUTODETECT',  true,  'Auto-detect preferred platform from first URL'),
  ('REACTIONS',            false, 'Phase 2: queue reactions'),
  ('CHAT',                 false, 'Phase 2: session chat'),
  ('SESSION_HISTORY',      false, 'Phase 2: session history view'),
  ('USER_PROFILES',        false, 'Phase 2: public user profiles'),
  ('SHARED_PLAYLISTS',     false, 'Phase 3: shared persistent playlists'),
  ('DISCOVERY_FEED',       false, 'Phase 3: public song feed'),
  ('TASTE_MATCHING',       false, 'Phase 3: platform taste matching'),
  ('SCHEDULED_JAMS',       false, 'Phase 4: scheduled future sessions'),
  ('QUEUE_RULES',          false, 'Phase 4: queue rule enforcement'),
  ('EMBED_WIDGET',         false, 'Phase 4: embeddable read-only widget');

-- Session expiry: sessions auto-expire after 24h of inactivity
ALTER TABLE sessions ADD COLUMN expires_at timestamptz DEFAULT now() + interval '24 hours';

-- Trigger: when DJ leaves participants table, auto-promote host as DJ
-- Prevents queue stalling if DJ disconnects
CREATE OR REPLACE FUNCTION handle_dj_leave() RETURNS trigger AS $$
BEGIN
  UPDATE sessions
  SET dj_user_id = host_user_id
  WHERE id = OLD.session_id
    AND dj_user_id = OLD.user_id
    AND host_user_id IS NOT NULL
    AND status != 'ended';
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_participant_leave
  AFTER DELETE ON session_participants
  FOR EACH ROW EXECUTE PROCEDURE handle_dj_leave();

-- Cron job: mark expired sessions as ended (requires pg_cron extension)
-- Enable in Supabase: Dashboard → Database → Extensions → pg_cron
SELECT cron.schedule(
  'expire-stale-sessions',
  '0 * * * *',  -- every hour
  $$
    UPDATE sessions
    SET status = 'ended', ended_at = now()
    WHERE status != 'ended'
      AND expires_at < now();
  $$
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();
```

---

## File Structure

```
music-search-links/
├── index.html                        Vite entry (minimal shell)
├── vite.config.js                    Vite config with define (flag injection) + GH Pages base
├── package.json
├── package-lock.json                 MUST be committed — required by npm ci in CI
├── .gitignore                        node_modules/, dist/, .env.local
├── .env.local.example                Template for local dev env vars (committed, no secrets)
├── public/
│   ├── CNAME                         themusic.one — Vite copies public/ → dist/ automatically
│   ├── 404.html                      SPA fallback: redirects all GitHub Pages 404s to index.html
│   └── favicon.svg                   App icon
├── src/
│   ├── main.jsx                      React root, BrowserRouter, loadRemoteFlags on init
│   ├── App.jsx                       Route definitions
│   ├── lib/
│   │   ├── supabase.js               Supabase client singleton
│   │   ├── flags.js                  Feature flags (static defaults + loadRemoteFlags)
│   │   ├── odesli.js                 Odesli API wrapper
│   │   └── platform.js               URL→platform detection, preferredLink, extractYouTubeId
│   ├── hooks/
│   │   ├── useAuth.js                auth state: user, profile, loading
│   │   ├── useSession.js             session row + realtime session updates
│   │   ├── useQueue.js               queue items + realtime queue updates
│   │   ├── useParticipants.js        participant list + realtime join/leave
│   │   └── useSkipVotes.js           skip vote count for current item
│   ├── pages/
│   │   ├── Home.jsx                  Existing converter UI + Start a Jam CTA
│   │   ├── Login.jsx                 Google OAuth login
│   │   ├── JamRoom.jsx               Jam session page (composes all components)
│   │   └── NotFound.jsx
│   ├── components/
│   │   ├── AuthBar.jsx               Top-right auth state display
│   │   ├── NowPlaying.jsx            Now-playing card + preferred link + YT embed
│   │   ├── QueueList.jsx             Scrollable queue + add-song form
│   │   ├── QueueCard.jsx             Single queue item card
│   │   ├── AddSongForm.jsx           URL input → Odesli → addToQueue
│   │   ├── ParticipantList.jsx       Sidebar participant list + DJ badge
│   │   ├── InviteBadge.jsx           Invite code display + copy button
│   │   └── Toast.jsx                 Toast notification (context + hook)
│   └── styles/
│       ├── base.css                  CSS vars + shared styles (from existing index.html)
│       └── jam.module.css            Jam room scoped styles
├── supabase/
│   └── schema.sql
└── .github/
    └── workflows/
        └── deploy.yml                npm ci + vite build + inject flags via vite define
```

---

## Tasks

### Task 0: Supabase Project Setup (manual prerequisite)

> Complete before any code. No code written here.

**Guest/anonymous users: NOT supported in MVP.** Joining a jam session requires Google login. This is intentional — participants need persistent identity for DJ token, skip votes, and "added by" attribution. Anonymous support is a Phase 2 consideration.

- [ ] Create free Supabase project at supabase.com
- [ ] In SQL editor: run `supabase/schema.sql` (full schema — created in Task 0.5)
- [ ] Auth → Providers: enable Google (add Google Cloud OAuth Client ID + Secret from Google Cloud Console → APIs & Services → Credentials)
- [ ] Auth → URL Configuration: add `https://themusic.one` and `http://localhost:5173` to redirect URLs
- [ ] Database → Extensions: enable **pg_cron** (required for session auto-expiry cron job)
- [ ] Note down: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (from Project Settings → API)
- [ ] GitHub repo → Settings → Variables → Actions: add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PROXY_URL` (existing)

---

### Task 0.5: Create `supabase/schema.sql` + `public/` Setup

**Files:**
- Create: `supabase/schema.sql`
- Create: `public/CNAME`
- Create: `public/404.html`
- Create: `public/favicon.svg`
- Move: root `CNAME` → `public/CNAME` (delete root CNAME after)

- [ ] **Step 1: Create `supabase/` directory and `supabase/schema.sql`**

Copy the full SQL from the Data Model section above into this file verbatim.

```bash
mkdir supabase
```

Then write `supabase/schema.sql` with all CREATE TABLE, RLS policies, triggers, and cron job from the Data Model section.

- [ ] **Step 2: Move CNAME to `public/`**

```bash
mkdir public
cp CNAME public/CNAME
rm CNAME
```

Verify `public/CNAME` contains `themusic.one`.

- [ ] **Step 3: Create `public/404.html`** — GitHub Pages SPA fallback

Without this, any direct URL to `/jam/XXXXXX` returns a real 404 from GitHub Pages before React loads.

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>MusicOne</title>
    <script>
      // GitHub Pages SPA redirect trick.
      // Encodes the path as a query param, then index.html decodes it on load.
      var l = window.location;
      l.replace(
        l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
        l.pathname.split('/').slice(0, 1).join('/') +
        '/?p=' + encodeURIComponent(l.pathname + l.search) +
        (l.hash ? '&h=' + encodeURIComponent(l.hash.slice(1)) : '')
      );
    </script>
  </head>
  <body></body>
</html>
```

- [ ] **Step 4: Add redirect decoder to `index.html`** (before the `<script type="module">` tag)

```html
    <script>
      // Decode GitHub Pages 404 redirect (pairs with public/404.html)
      (function() {
        var p = new URLSearchParams(window.location.search).get('p');
        if (p) {
          window.history.replaceState(null, null, decodeURIComponent(p));
        }
      })();
    </script>
```

- [ ] **Step 5: Create `public/favicon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#7c6af7"/>
  <text x="16" y="22" text-anchor="middle" font-size="18" fill="white">♪</text>
</svg>
```

- [ ] **Step 6: Commit**

```bash
git add supabase/schema.sql public/
git rm CNAME
git commit -m "feat: add DB schema, public assets, and SPA routing fallback"
```

---

### Task 1: Vite + React Project Init

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "music-search-links",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
dist/
.env.local
.DS_Store
*.log
# Never ignore package-lock.json — required by npm ci in CI
```

- [ ] **Step 3: Create `.env.local.example`** (committed to repo — no secrets, just template)

```bash
# Copy to .env.local and fill in your Supabase project credentials.
# Get these from: Supabase Dashboard → Project → Settings → API
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
PROXY_URL=https://your-odesli-proxy-url.com
```

- [ ] **Step 4: Run `npm install`**

```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` generated, no errors.

- [ ] **Step 5: Create `vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  define: {
    // Feature flag defaults — overridden by CI environment variables
    __FLAG_JAM_SESSION__:         JSON.stringify(process.env.FLAG_JAM_SESSION         ?? 'true'),
    __FLAG_VOTE_TO_SKIP__:        JSON.stringify(process.env.FLAG_VOTE_TO_SKIP        ?? 'true'),
    __FLAG_DJ_TOKEN__:            JSON.stringify(process.env.FLAG_DJ_TOKEN            ?? 'true'),
    __FLAG_YOUTUBE_EMBED__:       JSON.stringify(process.env.FLAG_YOUTUBE_EMBED       ?? 'true'),
    __FLAG_PLATFORM_AUTODETECT__: JSON.stringify(process.env.FLAG_PLATFORM_AUTODETECT ?? 'true'),
    __FLAG_REACTIONS__:           JSON.stringify(process.env.FLAG_REACTIONS           ?? 'false'),
    __FLAG_CHAT__:                JSON.stringify(process.env.FLAG_CHAT                ?? 'false'),
    __FLAG_SESSION_HISTORY__:     JSON.stringify(process.env.FLAG_SESSION_HISTORY     ?? 'false'),
    __FLAG_USER_PROFILES__:       JSON.stringify(process.env.FLAG_USER_PROFILES       ?? 'false'),
    __FLAG_SHARED_PLAYLISTS__:    JSON.stringify(process.env.FLAG_SHARED_PLAYLISTS    ?? 'false'),
    __FLAG_DISCOVERY_FEED__:      JSON.stringify(process.env.FLAG_DISCOVERY_FEED      ?? 'false'),
    __FLAG_TASTE_MATCHING__:      JSON.stringify(process.env.FLAG_TASTE_MATCHING      ?? 'false'),
    __FLAG_SCHEDULED_JAMS__:      JSON.stringify(process.env.FLAG_SCHEDULED_JAMS      ?? 'false'),
    __FLAG_QUEUE_RULES__:         JSON.stringify(process.env.FLAG_QUEUE_RULES         ?? 'false'),
    __FLAG_EMBED_WIDGET__:        JSON.stringify(process.env.FLAG_EMBED_WIDGET        ?? 'false'),
    __SUPABASE_URL__:             JSON.stringify(process.env.SUPABASE_URL             ?? ''),
    __SUPABASE_ANON_KEY__:        JSON.stringify(process.env.SUPABASE_ANON_KEY        ?? ''),
    __PROXY_URL__:                JSON.stringify(process.env.PROXY_URL                ?? ''),
  },
});
```

- [ ] **Step 6: Create `index.html`** (Vite entry shell)

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MusicOne — Find on any platform</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { supabase } from './lib/supabase';
import { loadRemoteFlags } from './lib/flags';
import './styles/base.css';

loadRemoteFlags(supabase).then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
});
```

- [ ] **Step 8: Create `src/App.jsx`**

```jsx
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import JamRoom from './pages/JamRoom';
import NotFound from './pages/NotFound';
import { FLAGS } from './lib/flags';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      {FLAGS.JAM_SESSION && <Route path="/jam/:code" element={<JamRoom />} />}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
```

- [ ] **Step 9: Update `.github/workflows/deploy.yml`**

Read existing file first with `cat .github/workflows/deploy.yml`, then replace the deploy job steps with:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Build
        env:
          SUPABASE_URL: ${{ vars.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ vars.SUPABASE_ANON_KEY }}
          PROXY_URL: ${{ vars.PROXY_URL }}
          FLAG_JAM_SESSION: 'true'
          FLAG_VOTE_TO_SKIP: 'true'
          FLAG_DJ_TOKEN: 'true'
          FLAG_YOUTUBE_EMBED: 'true'
          FLAG_PLATFORM_AUTODETECT: 'true'
          FLAG_REACTIONS: 'false'
          FLAG_CHAT: 'false'
          FLAG_SESSION_HISTORY: 'false'
          FLAG_USER_PROFILES: 'false'
          FLAG_SHARED_PLAYLISTS: 'false'
          FLAG_DISCOVERY_FEED: 'false'
          FLAG_TASTE_MATCHING: 'false'
          FLAG_SCHEDULED_JAMS: 'false'
          FLAG_QUEUE_RULES: 'false'
          FLAG_EMBED_WIDGET: 'false'
        run: npm run build

      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 10: Verify dev server starts**

Before running, create `.env.local` from the example:
```bash
cp .env.local.example .env.local
# Edit .env.local with your actual Supabase credentials
```

Then:
```bash
npm run dev
```

Expected: Vite dev server at `http://localhost:5173`. Browser shows blank page (no routes rendered yet — that's fine). No console errors about undefined globals.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json vite.config.js index.html src/main.jsx src/App.jsx .github/workflows/deploy.yml .gitignore .env.local.example
git commit -m "feat: scaffold React + Vite project with feature flags and CI"
```

---

### Task 2: Lib Modules (Supabase, Flags, Platform, Odesli)

**Files:**
- Create: `src/lib/supabase.js`, `src/lib/flags.js`, `src/lib/platform.js`, `src/lib/odesli.js`

- [ ] **Step 1: Create `src/lib/supabase.js`**

```js
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__);
```

- [ ] **Step 2: Create `src/lib/flags.js`**

```js
export const FLAGS = {
  JAM_SESSION:         JSON.parse(__FLAG_JAM_SESSION__),
  VOTE_TO_SKIP:        JSON.parse(__FLAG_VOTE_TO_SKIP__),
  DJ_TOKEN:            JSON.parse(__FLAG_DJ_TOKEN__),
  YOUTUBE_EMBED:       JSON.parse(__FLAG_YOUTUBE_EMBED__),
  PLATFORM_AUTODETECT: JSON.parse(__FLAG_PLATFORM_AUTODETECT__),
  REACTIONS:           JSON.parse(__FLAG_REACTIONS__),
  CHAT:                JSON.parse(__FLAG_CHAT__),
  SESSION_HISTORY:     JSON.parse(__FLAG_SESSION_HISTORY__),
  USER_PROFILES:       JSON.parse(__FLAG_USER_PROFILES__),
  SHARED_PLAYLISTS:    JSON.parse(__FLAG_SHARED_PLAYLISTS__),
  DISCOVERY_FEED:      JSON.parse(__FLAG_DISCOVERY_FEED__),
  TASTE_MATCHING:      JSON.parse(__FLAG_TASTE_MATCHING__),
  SCHEDULED_JAMS:      JSON.parse(__FLAG_SCHEDULED_JAMS__),
  QUEUE_RULES:         JSON.parse(__FLAG_QUEUE_RULES__),
  EMBED_WIDGET:        JSON.parse(__FLAG_EMBED_WIDGET__),
};

export async function loadRemoteFlags(supabase) {
  try {
    const { data } = await supabase.from('feature_flags').select('key, enabled');
    if (data) data.forEach(r => { if (r.key in FLAGS) FLAGS[r.key] = r.enabled; });
  } catch { /* remote unavailable — static defaults remain */ }
}
```

- [ ] **Step 3: Create `src/lib/platform.js`**

```js
export const PLATFORM_MAP = {
  'open.spotify.com': 'spotify',
  'spotify.com': 'spotify',
  'music.apple.com': 'applemusic',
  'music.youtube.com': 'youtubemusic',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'tidal.com': 'tidal',
  'deezer.com': 'deezer',
  'soundcloud.com': 'soundcloud',
  'jiosaavn.com': 'jiosaavn',
  'gaana.com': 'gaana',
  'music.amazon.com': 'amazonmusic',
  'music.amazon.in': 'amazonmusic',
};

export const PLATFORM_META = {
  spotify:      { name: 'Spotify',       color: '#1DB954', slug: 'spotify' },
  applemusic:   { name: 'Apple Music',   color: '#FC3C44', slug: 'applemusic' },
  youtubemusic: { name: 'YouTube Music', color: '#FF0000', slug: 'youtubemusic' },
  youtube:      { name: 'YouTube',       color: '#FF0000', slug: 'youtube' },
  tidal:        { name: 'Tidal',         color: '#00FFFF', slug: 'tidal' },
  deezer:       { name: 'Deezer',        color: '#FEAA2D', slug: 'deezer' },
  soundcloud:   { name: 'SoundCloud',    color: '#FF5500', slug: 'soundcloud' },
  jiosaavn:     { name: 'JioSaavn',      color: '#2BC5B4', slug: null, iconUrl: 'https://www.google.com/s2/favicons?domain=jiosaavn.com&sz=64' },
  gaana:        { name: 'Gaana',         color: '#E72C30', slug: null, iconUrl: 'https://www.google.com/s2/favicons?domain=gaana.com&sz=64' },
  amazonmusic:  { name: 'Amazon Music',  color: '#00A8E1', slug: null, iconUrl: 'https://www.google.com/s2/favicons?domain=music.amazon.com&sz=64' },
};

/** Returns platform key from URL string, or null. */
export function detectPlatform(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return PLATFORM_MAP[hostname] ?? null;
  } catch { return null; }
}

/**
 * Returns { platform, url } for user's preferred platform,
 * falling back to YouTube then first available.
 */
export function preferredLink(platformLinks, preferredPlatform) {
  if (preferredPlatform && platformLinks[preferredPlatform])
    return { platform: preferredPlatform, url: platformLinks[preferredPlatform] };
  if (platformLinks.youtube)
    return { platform: 'youtube', url: platformLinks.youtube };
  if (platformLinks.youtubemusic)
    return { platform: 'youtubemusic', url: platformLinks.youtubemusic };
  const first = Object.entries(platformLinks).find(([, v]) => v);
  return first ? { platform: first[0], url: first[1] } : null;
}

/** Extracts YouTube video ID from a YouTube URL, or null. */
export function extractYouTubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    return u.searchParams.get('v');
  } catch { return null; }
}
```

- [ ] **Step 4: Create `src/lib/odesli.js`**

```js
const PROXY_URL = __PROXY_URL__;

/**
 * Fetches song metadata from Odesli via proxy.
 * Returns { title, artist, thumbnailUrl, platformLinks } or throws.
 * platformLinks: flat object { spotify: 'https://...', applemusic: 'https://...', ... }
 */
export async function fetchSongMeta(streamUrl) {
  const res = await fetch(`${PROXY_URL}?url=${encodeURIComponent(streamUrl)}`);
  if (!res.ok) throw new Error(`Odesli API error ${res.status}`);

  const data = await res.json();
  const key = Object.keys(data.entitiesByUniqueId)[0];
  const entity = data.entitiesByUniqueId[key];
  if (!entity) throw new Error('Could not identify song from this URL.');

  const platformLinks = {};
  for (const [platform, info] of Object.entries(data.linksByPlatform ?? {})) {
    if (info.url) platformLinks[platform] = info.url;
  }

  return {
    title: entity.title,
    artist: entity.artistName,
    thumbnailUrl: entity.thumbnailUrl ?? null,
    platformLinks,
  };
}
```

- [ ] **Step 5: Verify dev server still starts with no errors**

```bash
npm run dev
```

Expected: no TypeScript/import errors in terminal.

- [ ] **Step 6: Commit**

```bash
git add src/lib/
git commit -m "feat: add supabase client, feature flags, platform detection, and odesli modules"
```

---

### Task 3: Auth Hook + Toast Context

**Files:**
- Create: `src/hooks/useAuth.js`, `src/components/Toast.jsx`

- [ ] **Step 1: Create `src/hooks/useAuth.js`**

```js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Returns { user, profile, loading, signInWithGoogle, signOut, setPreferredPlatform }.
 * user: Supabase auth user or null.
 * profile: profiles table row or null.
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user ?? null);
      if (user) fetchProfile(user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) fetchProfile(u.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(data ?? null);
    setLoading(false);
  }

  async function signInWithGoogle(redirectTo = window.location.href) {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }

  async function setPreferredPlatform(platform) {
    if (!user) return;
    await supabase.from('profiles').update({ preferred_platform: platform }).eq('id', user.id);
    setProfile(prev => ({ ...prev, preferred_platform: platform }));
  }

  return { user, profile, loading, signInWithGoogle, signOut, setPreferredPlatform };
}
```

- [ ] **Step 2: Create `src/components/Toast.jsx`**

```jsx
import { useState, useCallback, createContext, useContext } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState('');
  const [visible, setVisible] = useState(false);
  let timer = null;

  const show = useCallback((message) => {
    setMsg(message);
    setVisible(true);
    clearTimeout(timer);
    timer = setTimeout(() => setVisible(false), 2200);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div style={{
        position: 'fixed', bottom: 24, left: '50%',
        transform: `translateX(-50%) translateY(${visible ? 0 : 80}px)`,
        background: '#2a2a3a', border: '1px solid var(--border)',
        color: 'var(--text)', padding: '10px 20px', borderRadius: 99,
        fontSize: '0.85rem', transition: 'transform 0.3s ease',
        pointerEvents: 'none', zIndex: 999,
      }}>
        {msg}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
```

- [ ] **Step 3: Wrap App with ToastProvider** in `src/main.jsx`

```jsx
import { ToastProvider } from './components/Toast';

// wrap <App /> with <ToastProvider>
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAuth.js src/components/Toast.jsx src/main.jsx
git commit -m "feat: add useAuth hook and Toast context"
```

---

### Task 4: Shared Styles

**Files:**
- Create: `src/styles/base.css`

- [ ] **Step 1: Create `src/styles/base.css`** (migrate from existing `index.html` `<style>` block)

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0f0f13;
  --surface: #1a1a24;
  --border: #2a2a3a;
  --accent: #7c6af7;
  --accent-hover: #9585ff;
  --text: #e8e8f0;
  --muted: #8888a0;
  --radius: 14px;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  min-height: 100vh;
}

a { color: inherit; }

.btn {
  padding: 12px 20px;
  border-radius: var(--radius);
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.btn:hover { background: var(--accent-hover); }

.btn-ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
}
.btn-ghost:hover { border-color: var(--accent); color: var(--accent); background: transparent; }

.btn-danger {
  background: transparent;
  border: 1px solid #ff6b6b;
  color: #ff6b6b;
}
.btn-danger:hover { background: #ff6b6b22; }

.spinner {
  width: 36px; height: 36px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.page {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 16px 80px;
  min-height: 100vh;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/base.css
git commit -m "feat: add shared base CSS"
```

---

### Task 5: Login Page + AuthBar Component

**Files:**
- Create: `src/pages/Login.jsx`, `src/components/AuthBar.jsx`

- [ ] **Step 1: Create `src/pages/Login.jsx`**

```jsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const { user, loading, signInWithGoogle } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next') || '/';

  useEffect(() => {
    if (!loading && user) navigate(next, { replace: true });
  }, [user, loading]);

  const handleGoogle = () => {
    signInWithGoogle(window.location.origin + next);
  };

  return (
    <div className="page">
      <header style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, background: 'linear-gradient(135deg, #fff 30%, var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          MusicOne
        </h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: '0.9rem' }}>Sign in to create or join a jam session</p>
      </header>

      <div className="card" style={{ padding: '40px 32px', maxWidth: 380, width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Welcome</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          Sign in with Google to start jamming. Your preferred platform is saved automatically on first song add.
        </p>
        <button
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'center', gap: 10 }}
          onClick={handleGoogle}
        >
          <GoogleIcon />
          Continue with Google
        </button>
        <a href="/" style={{ color: 'var(--muted)', fontSize: '0.85rem', textDecoration: 'none' }}>← Back to home</a>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
```

- [ ] **Step 2: Create `src/components/AuthBar.jsx`**

```jsx
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function AuthBar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <div style={{ position: 'fixed', top: 16, right: 16 }}>
        <button className="btn btn-ghost" style={{ fontSize: '0.85rem', padding: '8px 14px' }}
          onClick={() => navigate('/login')}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
      {profile?.avatar_url && (
        <img src={profile.avatar_url} alt={profile.display_name}
          style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
      )}
      <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{profile?.display_name}</span>
      <button className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '6px 12px' }}
        onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Login.jsx src/components/AuthBar.jsx
git commit -m "feat: add login page and auth bar component"
```

---

### Task 6: Home Page (migrate existing converter + Jam CTA)

**Files:**
- Create: `src/pages/Home.jsx`
- Modify: `src/App.jsx` (import Home)

- [ ] **Step 1: Create `src/pages/Home.jsx`**

Migrate the existing `index.html` JS/HTML logic into React. The PLATFORMS array, fetchSongMeta via odesli.js, and result rendering become component state.

```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthBar from '../components/AuthBar';
import { useAuth } from '../hooks/useAuth';
import { fetchSongMeta } from '../lib/odesli';
import { FLAGS } from '../lib/flags';
import { useToast } from '../components/Toast';

const PLATFORMS = [
  { name: 'Spotify',       slug: 'spotify',       color: '#1DB954', url: q => `https://open.spotify.com/search/${q}` },
  { name: 'Apple Music',   slug: 'applemusic',    color: '#FC3C44', url: q => `https://music.apple.com/search?term=${q}` },
  { name: 'YouTube Music', slug: 'youtubemusic',  color: '#FF0000', url: q => `https://music.youtube.com/search?q=${q}` },
  { name: 'Amazon Music',  slug: null, iconUrl: 'https://www.google.com/s2/favicons?domain=music.amazon.com&sz=64', color: '#00A8E1', url: q => `https://music.amazon.in/search/${q}` },
  { name: 'Tidal',         slug: 'tidal',         color: '#00FFFF', url: q => `https://tidal.com/search?q=${q}` },
  { name: 'Deezer',        slug: 'deezer',        color: '#FEAA2D', url: q => `https://www.deezer.com/search/${q}` },
  { name: 'SoundCloud',    slug: 'soundcloud',    color: '#FF5500', url: q => `https://soundcloud.com/search?q=${q}` },
  { name: 'JioSaavn',      slug: null, iconUrl: 'https://www.google.com/s2/favicons?domain=jiosaavn.com&sz=64', color: '#2BC5B4', url: q => `https://www.jiosaavn.com/search/${q}` },
  { name: 'Gaana',         slug: null, iconUrl: 'https://www.google.com/s2/favicons?domain=gaana.com&sz=64',    color: '#E72C30', url: q => `https://gaana.com/search/${q}` },
];

export default function Home() {
  const [inputUrl, setInputUrl] = useState('');
  const [song, setSong] = useState(null);       // { title, artist }
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  // Pre-fill from ?url= query param
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const u = p.get('url');
    if (u) { setInputUrl(u); runSearch(u); }
  }, []);

  async function runSearch(url) {
    setStatus('loading');
    setSong(null);
    try {
      const meta = await fetchSongMeta(url);
      setSong(meta);
      setStatus('done');
      history.replaceState({}, '', `?url=${encodeURIComponent(url)}`);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to fetch song info.');
      setStatus('error');
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    runSearch(inputUrl.trim());
  }

  function handleReset() {
    setSong(null);
    setStatus('idle');
    setInputUrl('');
    history.replaceState({}, '', '/');
  }

  function copyPageLink() {
    navigator.clipboard.writeText(location.href).then(() => toast('Link copied!'));
  }

  const q = song ? encodeURIComponent(`${song.title} ${song.artist}`) : '';

  return (
    <div className="page">
      <AuthBar />

      <header style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '-0.5px', background: 'linear-gradient(135deg, #fff 30%, var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          MusicOne
        </h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: '0.9rem' }}>Paste any streaming link — search it on every platform</p>
      </header>

      {status !== 'done' && (
        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Streaming URL (Spotify, YouTube Music, Apple Music…)</label>
          <input
            type="url"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            placeholder="https://open.spotify.com/track/..."
            style={{ width: '100%', padding: '14px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.95rem', outline: 'none' }}
          />
          <button type="submit" className="btn">Find on all platforms</button>
        </form>
      )}

      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: 'var(--muted)', marginTop: 32 }}>
          <div className="spinner" />
          <span>Fetching song info…</span>
        </div>
      )}

      {status === 'error' && (
        <div style={{ textAlign: 'center', maxWidth: 420, marginTop: 32 }}>
          <div style={{ fontSize: '2rem', marginBottom: 10 }}>⚠️</div>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>{errorMsg}</p>
          <p style={{ marginTop: 12 }}><a onClick={handleReset} style={{ color: 'var(--accent)', cursor: 'pointer' }}>← Try another link</a></p>
        </div>
      )}

      {status === 'done' && song && (
        <>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 6 }}>Found song</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{song.title}</div>
            <div style={{ fontSize: '1rem', color: 'var(--muted)', marginTop: 4 }}>{song.artist}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
              <button onClick={copyPageLink} className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '8px 16px' }}>📋 Copy page link</button>
              <button onClick={handleReset} className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '8px 16px' }}>← New search</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, width: '100%', maxWidth: 800 }}>
            {PLATFORMS.map(p => (
              <a key={p.name} href={p.url(q)} target="_blank" rel="noopener noreferrer"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text)', transition: 'border-color 0.2s, transform 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = ''; }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: p.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img
                    src={p.slug ? `https://cdn.simpleicons.org/${p.slug}/${p.color.replace('#','')}` : p.iconUrl}
                    width={28} height={28} alt={p.name}
                    onError={e => { e.target.replaceWith(Object.assign(document.createElement('span'), { textContent: p.name.slice(0,2), style: `font-size:0.8rem;font-weight:700;color:${p.color}` })); }}
                  />
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, textAlign: 'center' }}>{p.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Search ↗</div>
              </a>
            ))}
          </div>
        </>
      )}

      {FLAGS.JAM_SESSION && user && (
        <div style={{ marginTop: 40, paddingTop: 32, borderTop: '1px solid var(--border)', width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Want to listen together?</p>
          <button className="btn" style={{ width: '100%' }} onClick={() => navigate('/jam/new')}>
            Start a Jam Session
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add `/jam/new` route to `src/App.jsx`** that creates a session and redirects to `/jam/:code`

```jsx
import { Navigate } from 'react-router-dom';
// Add alongside other routes:
{FLAGS.JAM_SESSION && <Route path="/jam/new" element={<JamNew />} />}
```

Add `JamNew` as a simple component in `App.jsx`:

```jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { createSession } from './lib/session';

function JamNew() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login?next=/jam/new'); return; }
    createSession(user.id).then(session => navigate(`/jam/${session.invite_code}`, { replace: true }));
  }, [user, loading]);

  return <div className="page"><div className="spinner" /></div>;
}
```

- [ ] **Step 3: Verify home page renders in browser**

```bash
npm run dev
```

Visit `http://localhost:5173`. Existing URL converter UI should appear. Sign in → "Start a Jam Session" CTA appears at bottom.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Home.jsx src/App.jsx
git commit -m "feat: migrate home page to React and add jam session CTA"
```

---

### Task 7: Session + Queue Lib Modules

**Files:**
- Create: `src/lib/session.js`, `src/lib/queue.js`

- [ ] **Step 1: Create `src/lib/session.js`**

```js
import { supabase } from './supabase';

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function createSession(userId) {
  let invite_code;
  for (let i = 0; i < 5; i++) {
    invite_code = genCode();
    const { data } = await supabase.from('sessions').select('id').eq('invite_code', invite_code).maybeSingle();
    if (!data) break;
  }
  const { data, error } = await supabase
    .from('sessions')
    .insert({ invite_code, host_user_id: userId, dj_user_id: userId, status: 'active' })
    .select().single();
  if (error) throw new Error(error.message);
  await joinSession(data.id, userId);
  return data;
}

export async function getSessionByCode(code) {
  const { data } = await supabase.from('sessions').select('*').eq('invite_code', code.toUpperCase()).single();
  return data ?? null;
}

export async function joinSession(sessionId, userId) {
  await supabase.from('session_participants').upsert({ session_id: sessionId, user_id: userId });
}

export async function leaveSession(sessionId, userId) {
  await supabase.from('session_participants').delete().eq('session_id', sessionId).eq('user_id', userId);
}

export async function endSession(sessionId) {
  const { error } = await supabase.from('sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', sessionId);
  if (error) throw new Error(error.message);
}

export async function passDjToken(sessionId, newDjUserId) {
  const { error } = await supabase.from('sessions').update({ dj_user_id: newDjUserId }).eq('id', sessionId);
  if (error) throw new Error(error.message);
}

export async function getParticipants(sessionId) {
  const { data } = await supabase
    .from('session_participants')
    .select('user_id, joined_at, profiles(id, display_name, avatar_url, preferred_platform)')
    .eq('session_id', sessionId);
  return (data ?? []).map(p => ({ ...p.profiles, joined_at: p.joined_at }));
}
```

- [ ] **Step 2: Create `src/lib/queue.js`**

```js
import { supabase } from './supabase';

export async function addToQueue(sessionId, userId, meta) {
  // position is GENERATED ALWAYS AS IDENTITY in DB — no JS-side calculation needed,
  // eliminates race condition from simultaneous inserts.
  const { data, error } = await supabase.from('queue_items').insert({
    session_id: sessionId,
    added_by_user_id: userId,
    title: meta.title,
    artist: meta.artist,
    thumbnail_url: meta.thumbnailUrl ?? null,
    platform_links: meta.platformLinks,
    status: 'queued',
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getQueue(sessionId) {
  const { data } = await supabase
    .from('queue_items')
    .select('*, profiles(display_name, avatar_url)')
    .eq('session_id', sessionId)
    .order('position', { ascending: true });
  return data ?? [];
}

export async function playNext(sessionId) {
  await supabase.from('queue_items').update({ status: 'played' }).eq('session_id', sessionId).eq('status', 'playing');
  const { data: next } = await supabase
    .from('queue_items').select('*').eq('session_id', sessionId).eq('status', 'queued')
    .order('position', { ascending: true }).limit(1);
  if (!next?.length) return null;
  const { data, error } = await supabase.from('queue_items').update({ status: 'playing' }).eq('id', next[0].id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function forceSkip(sessionId) {
  await supabase.from('queue_items').update({ status: 'skipped' }).eq('session_id', sessionId).eq('status', 'playing');
  return playNext(sessionId);
}

export async function castSkipVote(queueItemId, userId) {
  await supabase.from('skip_votes').upsert({ queue_item_id: queueItemId, user_id: userId });
  const { count } = await supabase.from('skip_votes').select('*', { count: 'exact', head: true }).eq('queue_item_id', queueItemId);
  return count ?? 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/session.js src/lib/queue.js
git commit -m "feat: add session and queue lib modules"
```

---

### Task 8: Realtime Hooks

**Files:**
- Create: `src/hooks/useSession.js`, `src/hooks/useQueue.js`, `src/hooks/useParticipants.js`, `src/hooks/useSkipVotes.js`

- [ ] **Step 1: Create `src/hooks/useSession.js`**

```js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getSessionByCode } from '../lib/session';

export function useSession(code) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    getSessionByCode(code).then(s => { setSession(s); setLoading(false); });

    const channel = supabase.channel(`session:${code}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `invite_code=eq.${code}` },
        payload => setSession(prev => ({ ...prev, ...payload.new })))
      .subscribe();

    return () => channel.unsubscribe();
  }, [code]);

  return { session, loading, setSession };
}
```

- [ ] **Step 2: Create `src/hooks/useQueue.js`**

```js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getQueue } from '../lib/queue';

export function useQueue(sessionId) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!sessionId) return;
    getQueue(sessionId).then(setItems);

    const channel = supabase.channel(`queue:${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_items', filter: `session_id=eq.${sessionId}` },
        () => getQueue(sessionId).then(setItems))
      .subscribe();

    return () => channel.unsubscribe();
  }, [sessionId]);

  return items;
}
```

- [ ] **Step 3: Create `src/hooks/useParticipants.js`**

```js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getParticipants } from '../lib/session';

export function useParticipants(sessionId) {
  const [participants, setParticipants] = useState([]);

  useEffect(() => {
    if (!sessionId) return;
    getParticipants(sessionId).then(setParticipants);

    const channel = supabase.channel(`participants:${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_participants', filter: `session_id=eq.${sessionId}` },
        () => getParticipants(sessionId).then(setParticipants))
      .subscribe();

    return () => channel.unsubscribe();
  }, [sessionId]);

  return participants;
}
```

- [ ] **Step 4: Create `src/hooks/useSkipVotes.js`**

```js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useSkipVotes(queueItemId) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!queueItemId) { setCount(0); return; }

    supabase.from('skip_votes').select('*', { count: 'exact', head: true }).eq('queue_item_id', queueItemId)
      .then(({ count: c }) => setCount(c ?? 0));

    const channel = supabase.channel(`skipvotes:${queueItemId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'skip_votes', filter: `queue_item_id=eq.${queueItemId}` },
        () => supabase.from('skip_votes').select('*', { count: 'exact', head: true }).eq('queue_item_id', queueItemId)
          .then(({ count: c }) => setCount(c ?? 0)))
      .subscribe();

    return () => channel.unsubscribe();
  }, [queueItemId]);

  return count;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/
git commit -m "feat: add realtime hooks for session, queue, participants, and skip votes"
```

---

### Task 9: Jam Room Components

**Files:**
- Create: `src/components/NowPlaying.jsx`, `src/components/QueueCard.jsx`, `src/components/QueueList.jsx`, `src/components/AddSongForm.jsx`, `src/components/ParticipantList.jsx`, `src/components/InviteBadge.jsx`
- Create: `src/styles/jam.module.css`

- [ ] **Step 1: Create `src/styles/jam.module.css`**

```css
.layout {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 20px;
  width: 100%;
  max-width: 1000px;
  padding: 80px 16px 80px;
}

@media (max-width: 700px) {
  .layout { grid-template-columns: 1fr; }
  .sidebar { order: -1; }
}

.jamHeader {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

/* NowPlaying */
.nowPlaying {
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.nowPlayingIdle { border-color: var(--border); }

.nowPlayingLabel {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--accent);
  display: flex;
  align-items: center;
  gap: 6px;
}
.pulse {
  width: 8px; height: 8px;
  background: var(--accent);
  border-radius: 50%;
  animation: pulse 1.4s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.7); }
}

.nowPlayingMeta { display: flex; align-items: center; gap: 16px; }
.thumb { width: 64px; height: 64px; border-radius: 8px; object-fit: cover; background: var(--border); flex-shrink: 0; }
.nowPlayingTitle { font-size: 1.1rem; font-weight: 700; }
.nowPlayingArtist { font-size: 0.9rem; color: var(--muted); margin-top: 2px; }
.nowPlayingAdded { font-size: 0.78rem; color: var(--muted); margin-top: 4px; }

.preferredBtn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-radius: var(--radius);
  background: var(--accent);
  color: #fff;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9rem;
  transition: background 0.2s;
  width: fit-content;
}
.preferredBtn:hover { background: var(--accent-hover); }

.otherLinks { display: flex; flex-wrap: wrap; gap: 8px; }
.otherLink { font-size: 0.78rem; color: var(--muted); text-decoration: none; padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px; }
.otherLink:hover { border-color: var(--accent); color: var(--accent); }

.djControls { display: flex; gap: 10px; }
.skipBtn { padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--muted); font-size: 0.82rem; cursor: pointer; transition: border-color 0.2s, color 0.2s; }
.skipBtn:hover, .skipBtnVoted { border-color: #ff6b6b; color: #ff6b6b; }

.ytEmbed { width: 100%; aspect-ratio: 16/9; border-radius: 10px; border: none; }

/* Queue */
.queueSection { display: flex; flex-direction: column; gap: 12px; }
.queueList { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; max-height: 420px; }

.queueCard { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; gap: 12px; }
.queueCardPlayed { opacity: 0.45; }
.queueCardSkipped { opacity: 0.35; }
.queueThumb { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; background: var(--border); flex-shrink: 0; }
.queueMeta { flex: 1; min-width: 0; }
.queueTitle { font-size: 0.88rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.queueArtist { font-size: 0.78rem; color: var(--muted); }
.queueBy { font-size: 0.72rem; color: var(--muted); margin-top: 2px; }
.queuePos { font-size: 0.75rem; color: var(--muted); flex-shrink: 0; }

.addForm { display: flex; gap: 8px; }
.addInput { flex: 1; padding: 11px 14px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 0.9rem; outline: none; transition: border-color 0.2s; }
.addInput:focus { border-color: var(--accent); }

/* Sidebar */
.sidebar { display: flex; flex-direction: column; gap: 16px; }
.sidebarSection { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
.sidebarTitle { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin-bottom: 12px; }
.participant { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 0.85rem; }
.pAvatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; background: var(--border); flex-shrink: 0; }
.pName { flex: 1; }
.pDj { font-size: 0.7rem; color: var(--accent); }

/* Invite badge */
.inviteBadge { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px; display: flex; align-items: center; gap: 10px; font-size: 0.85rem; }
.inviteCode { font-family: monospace; font-size: 1.1rem; font-weight: 700; letter-spacing: 3px; color: var(--accent); }

/* Ended */
.endedBanner { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 40px; text-align: center; color: var(--muted); grid-column: 1 / -1; }
```

- [ ] **Step 2: Create `src/components/InviteBadge.jsx`**

```jsx
import s from '../styles/jam.module.css';
import { useToast } from './Toast';

export default function InviteBadge({ code }) {
  const toast = useToast();
  const url = `${window.location.origin}/jam/${code}`;

  return (
    <div className={s.inviteBadge}>
      Invite: <span className={s.inviteCode}>{code}</span>
      <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '5px 10px' }}
        onClick={() => navigator.clipboard.writeText(url).then(() => toast('Invite link copied!'))}>
        Copy
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/QueueCard.jsx`**

```jsx
import s from '../styles/jam.module.css';

export default function QueueCard({ item }) {
  const cls = item.status === 'played' ? s.queueCardPlayed : item.status === 'skipped' ? s.queueCardSkipped : '';
  return (
    <div className={`${s.queueCard} ${cls}`}>
      {item.thumbnail_url
        ? <img className={s.queueThumb} src={item.thumbnail_url} alt="" />
        : <div className={s.queueThumb} />}
      <div className={s.queueMeta}>
        <div className={s.queueTitle}>{item.title}</div>
        <div className={s.queueArtist}>{item.artist}</div>
        <div className={s.queueBy}>by {item.profiles?.display_name || 'someone'}</div>
      </div>
      <div className={s.queuePos}>#{item.position}</div>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/components/AddSongForm.jsx`**

```jsx
import { useState } from 'react';
import s from '../styles/jam.module.css';
import { fetchSongMeta } from '../lib/odesli';
import { addToQueue } from '../lib/queue';
import { detectPlatform } from '../lib/platform';
import { FLAGS } from '../lib/flags';
import { useToast } from './Toast';

export default function AddSongForm({ sessionId, userId, profile, onPlatformDetected }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function handleAdd(e) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    try {
      if (FLAGS.PLATFORM_AUTODETECT && !profile?.preferred_platform) {
        const platform = detectPlatform(url.trim());
        if (platform) onPlatformDetected(platform);
      }
      const meta = await fetchSongMeta(url.trim());
      await addToQueue(sessionId, userId, meta);
      toast(`"${meta.title}" added to queue`);
      setUrl('');
    } catch {
      toast('Could not add song. Check the URL.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={s.addForm} onSubmit={handleAdd}>
      <input
        className={s.addInput}
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="Paste a song URL to add to queue…"
        disabled={busy}
      />
      <button type="submit" className="btn" disabled={busy}>
        {busy ? '…' : 'Add'}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Create `src/components/NowPlaying.jsx`**

```jsx
import s from '../styles/jam.module.css';
import { preferredLink, extractYouTubeId, PLATFORM_META } from '../lib/platform';
import { FLAGS } from '../lib/flags';
import { useSkipVotes } from '../hooks/useSkipVotes';
import { castSkipVote, forceSkip, playNext } from '../lib/queue';
import { useToast } from './Toast';

export default function NowPlaying({ nowPlaying, sessionId, isDJ, preferredPlatform, participantCount, userId }) {
  const toast = useToast();
  const skipVotes = useSkipVotes(nowPlaying?.id);
  const skipThreshold = Math.floor(participantCount / 2) + 1;

  if (!nowPlaying) {
    return (
      <div className={`${s.nowPlaying} ${s.nowPlayingIdle}`}>
        <div className={s.nowPlayingLabel}>Now Playing</div>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          {isDJ ? 'Click "Play Next" to start the queue.' : 'Waiting for the DJ to start…'}
        </p>
        {isDJ && (
          <button className="btn" onClick={() => playNext(sessionId).then(n => !n && toast('Queue is empty!'))}>
            Play Next ▶
          </button>
        )}
      </div>
    );
  }

  const pref = preferredLink(nowPlaying.platform_links, preferredPlatform);
  const ytId = FLAGS.YOUTUBE_EMBED ? extractYouTubeId(nowPlaying.platform_links?.youtube || nowPlaying.platform_links?.youtubemusic) : null;
  const otherLinks = Object.entries(nowPlaying.platform_links)
    .filter(([k, v]) => v && k !== pref?.platform);

  async function handleSkipVote() {
    const count = await castSkipVote(nowPlaying.id, userId);
    if (count >= skipThreshold) await forceSkip(sessionId);
  }

  return (
    <div className={s.nowPlaying}>
      <div className={s.nowPlayingLabel}><div className={s.pulse} /> Now Playing</div>

      <div className={s.nowPlayingMeta}>
        {nowPlaying.thumbnail_url
          ? <img className={s.thumb} src={nowPlaying.thumbnail_url} alt="" />
          : <div className={s.thumb} />}
        <div>
          <div className={s.nowPlayingTitle}>{nowPlaying.title}</div>
          <div className={s.nowPlayingArtist}>{nowPlaying.artist}</div>
          <div className={s.nowPlayingAdded}>Added by {nowPlaying.profiles?.display_name || 'someone'}</div>
        </div>
      </div>

      {pref && (
        <a className={s.preferredBtn} href={pref.url} target="_blank" rel="noopener">
          Open on {PLATFORM_META[pref.platform]?.name || pref.platform} ↗
        </a>
      )}

      {otherLinks.length > 0 && (
        <div className={s.otherLinks}>
          {otherLinks.map(([k, v]) => (
            <a key={k} className={s.otherLink} href={v} target="_blank" rel="noopener">
              {PLATFORM_META[k]?.name || k}
            </a>
          ))}
        </div>
      )}

      {ytId && (
        <iframe
          className={s.ytEmbed}
          src={`https://www.youtube-nocookie.com/embed/${ytId}`}
          allowFullScreen
          title="YouTube preview"
        />
      )}

      <div className={s.djControls}>
        {isDJ ? (
          <>
            <button className="btn" onClick={() => playNext(sessionId).then(n => !n && toast('Queue is empty!'))}>
              Next ▶
            </button>
            {FLAGS.VOTE_TO_SKIP && (
              <button className="btn btn-danger" onClick={() => forceSkip(sessionId)}>
                Force Skip
              </button>
            )}
          </>
        ) : FLAGS.VOTE_TO_SKIP ? (
          <button className={s.skipBtn} onClick={handleSkipVote}>
            👎 Skip ({skipVotes}/{skipThreshold})
          </button>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/components/QueueList.jsx`**

```jsx
import s from '../styles/jam.module.css';
import QueueCard from './QueueCard';
import AddSongForm from './AddSongForm';

export default function QueueList({ items, sessionId, userId, profile, onPlatformDetected }) {
  const nonPlaying = items.filter(i => i.status !== 'playing');
  return (
    <div className={s.queueSection}>
      <AddSongForm
        sessionId={sessionId}
        userId={userId}
        profile={profile}
        onPlatformDetected={onPlatformDetected}
      />
      <div className={s.queueList}>
        {nonPlaying.length === 0
          ? <p style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '8px 0' }}>Queue is empty. Add a song above!</p>
          : nonPlaying.map(item => <QueueCard key={item.id} item={item} />)
        }
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create `src/components/ParticipantList.jsx`**

```jsx
import s from '../styles/jam.module.css';
import { FLAGS } from '../lib/flags';
import { passDjToken } from '../lib/session';
import { useToast } from './Toast';

export default function ParticipantList({ participants, session, currentUserId }) {
  const toast = useToast();
  const isHost = session.host_user_id === currentUserId;

  return (
    <div className={s.sidebarSection}>
      <div className={s.sidebarTitle}>In this jam ({participants.length})</div>
      {participants.map(p => (
        <div key={p.id} className={s.participant}>
          {p.avatar_url
            ? <img className={s.pAvatar} src={p.avatar_url} alt="" />
            : <div className={s.pAvatar} />}
          <span className={s.pName}>{p.display_name || 'Guest'}</span>
          {p.id === session.dj_user_id && <span className={s.pDj}>👑</span>}
          {FLAGS.DJ_TOKEN && isHost && p.id !== currentUserId && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              onClick={() => passDjToken(session.id, p.id).then(() => toast('DJ token passed!'))}
            >
              DJ
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add src/components/ src/styles/jam.module.css
git commit -m "feat: add jam room components (NowPlaying, QueueList, Participants, InviteBadge)"
```

---

### Task 10: Jam Room Page

**Files:**
- Create: `src/pages/JamRoom.jsx`
- Create: `src/pages/NotFound.jsx`

- [ ] **Step 1: Create `src/pages/JamRoom.jsx`**

```jsx
import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthBar from '../components/AuthBar';
import NowPlaying from '../components/NowPlaying';
import QueueList from '../components/QueueList';
import ParticipantList from '../components/ParticipantList';
import InviteBadge from '../components/InviteBadge';
import { useAuth } from '../hooks/useAuth';
import { useSession } from '../hooks/useSession';
import { useQueue } from '../hooks/useQueue';
import { useParticipants } from '../hooks/useParticipants';
import { joinSession, leaveSession, endSession } from '../lib/session';
import { FLAGS } from '../lib/flags';
import s from '../styles/jam.module.css';

export default function JamRoom() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, setPreferredPlatform } = useAuth();
  const { session, loading: sessionLoading } = useSession(code);
  const queueItems = useQueue(session?.id);
  const participants = useParticipants(session?.id);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) navigate(`/login?next=/jam/${code}`);
  }, [authLoading, user]);

  // Join session once loaded
  useEffect(() => {
    if (session?.id && user?.id) joinSession(session.id, user.id);
  }, [session?.id, user?.id]);

  // Leave on unmount
  useEffect(() => {
    return () => {
      if (session?.id && user?.id) leaveSession(session.id, user.id);
    };
  }, [session?.id, user?.id]);

  if (authLoading || sessionLoading) {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="page" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)' }}>Session not found.</p>
        <a href="/" className="btn" style={{ marginTop: 20 }}>Go home</a>
      </div>
    );
  }

  if (session.status === 'ended') {
    const played = queueItems.filter(i => ['played', 'playing', 'skipped'].includes(i.status));
    return (
      <div className="page">
        <AuthBar />
        <div className={s.layout}>
          <div className={s.endedBanner}>
            <p style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>Session ended</p>
            <p>{played.length} song{played.length !== 1 ? 's' : ''} played</p>
            <a href="/" className="btn" style={{ marginTop: 20 }}>Back to Home</a>
          </div>
          {played.length > 0 && (
            <div style={{ gridColumn: '1/-1' }}>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 12 }}>Songs played:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {played.map(item => <QueueCard key={item.id} item={item} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const nowPlaying = queueItems.find(i => i.status === 'playing') ?? null;
  const isDJ = session.dj_user_id === user?.id;
  const isHost = session.host_user_id === user?.id;

  return (
    <div className="page" style={{ padding: 0 }}>
      <AuthBar />
      <div className={s.layout}>
        <div className={s.jamHeader}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Jam Session</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 2 }}>
              {queueItems.filter(i => i.status === 'queued').length} song(s) in queue
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <InviteBadge code={session.invite_code} />
            {isHost && (
              <button
                className="btn btn-danger"
                style={{ fontSize: '0.82rem', padding: '8px 14px' }}
                onClick={() => { if (window.confirm('End this jam for everyone?')) endSession(session.id); }}
              >
                End Session
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <NowPlaying
            nowPlaying={nowPlaying}
            sessionId={session.id}
            isDJ={isDJ}
            preferredPlatform={profile?.preferred_platform}
            participantCount={participants.length}
            userId={user?.id}
          />
          <QueueList
            items={queueItems}
            sessionId={session.id}
            userId={user?.id}
            profile={profile}
            onPlatformDetected={setPreferredPlatform}
          />
        </div>

        <div className={s.sidebar}>
          <ParticipantList
            participants={participants}
            session={session}
            currentUserId={user?.id}
          />
        </div>
      </div>
    </div>
  );
}
```

> Note: `QueueCard` used in ended view — import it at top of `JamRoom.jsx`: `import QueueCard from '../components/QueueCard';`

- [ ] **Step 2: Create `src/pages/NotFound.jsx`**

```jsx
export default function NotFound() {
  return (
    <div className="page" style={{ justifyContent: 'center', textAlign: 'center' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>404</h2>
      <p style={{ color: 'var(--muted)', marginTop: 8 }}>Page not found.</p>
      <a href="/" className="btn" style={{ marginTop: 20 }}>Go home</a>
    </div>
  );
}
```

- [ ] **Step 3: Update `src/App.jsx`** to import all pages

```jsx
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Home from './pages/Home';
import Login from './pages/Login';
import JamRoom from './pages/JamRoom';
import NotFound from './pages/NotFound';
import { FLAGS } from './lib/flags';
import { useAuth } from './hooks/useAuth';
import { createSession } from './lib/session';

function JamNew() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login?next=/jam/new'); return; }
    createSession(user.id).then(s => navigate(`/jam/${s.invite_code}`, { replace: true }));
  }, [user, loading]);
  return <div className="page" style={{ justifyContent: 'center' }}><div className="spinner" /></div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      {FLAGS.JAM_SESSION && <Route path="/jam/new" element={<JamNew />} />}
      {FLAGS.JAM_SESSION && <Route path="/jam/:code" element={<JamRoom />} />}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
```

- [ ] **Step 4: Verify jam room works end-to-end in dev**

```bash
npm run dev
```

1. Sign in via Google
2. Click "Start a Jam Session" → redirected to `/jam/NEW` → session created → `/jam/XXXXXX`
3. Open invite URL in second tab (different account) → joins, appears in participant list
4. Paste a song URL → Odesli resolves → song appears on both tabs
5. DJ clicks "Play Next" → now playing renders with preferred platform link
6. Non-DJ votes skip → count updates live

- [ ] **Step 5: Commit**

```bash
git add src/pages/JamRoom.jsx src/pages/NotFound.jsx src/App.jsx
git commit -m "feat: add jam room page and wire all components"
```

---

### Task 11: Build + Deploy Verification

**Files:**
- Modify: `vite.config.js` (ensure `base` is correct for GitHub Pages custom domain)

- [ ] **Step 1: Confirm base path**

For a custom domain (`themusic.one`), Vite base should be `/` (already set in Task 1).

- [ ] **Step 2: Test production build locally**

```bash
npm run build
npm run preview
```

Visit `http://localhost:4173`. All routes should work. No console errors.

- [ ] **Step 3: Push to trigger CI deploy**

```bash
git push origin main
```

Check GitHub Actions → workflow should: `npm ci` → `vite build` (with env vars injected) → deploy to Pages.

- [ ] **Step 4: Verify on themusic.one**

- Auth flow: Google login → profile row in Supabase → auth bar shows name
- `/jam/new` → session created → invite code shown
- Paste song URL → Odesli resolves → queue updates on second client in <1s
- Preferred platform auto-detected on first add

- [ ] **Step 5: Commit (if vite.config.js changed)**

```bash
git add vite.config.js
git commit -m "ci: verify build and deploy pipeline"
```

---

### Task 12: End-to-End Verification Checklist

> No code written. Run all checks on deployed `themusic.one`.

**Routing & Infrastructure**
- [ ] Direct URL access: navigate directly to `https://themusic.one/jam/XXXXXX` (no prior visit) → React loads correctly (not GitHub Pages 404)
- [ ] Custom domain: `themusic.one` resolves correctly after deploy → `dist/CNAME` exists in GitHub Pages deployment
- [ ] Build size: `npm run build` → check `dist/` bundle < 500KB (no surprise bloat)
- [ ] Local dev: `cp .env.local.example .env.local` + fill creds + `npm run dev` → no undefined globals in console

**Auth**
- [ ] Google login → Supabase Auth user created → `profiles` row auto-created with display_name and avatar_url
- [ ] Login required: visit `/jam/XXXXXX` without auth → redirected to `/login?next=/jam/XXXXXX` → after login returns to jam

**Core Jam Flow**
- [ ] Home page: existing URL converter works (Spotify URL → 9 platform links)
- [ ] Jam flag: `FLAGS.JAM_SESSION = true` → "Start a Jam" CTA visible when logged in
- [ ] Create session: generates 6-char invite code → URL is `/jam/XXXXXX`
- [ ] Join session: second browser tab at invite URL → both clients show each other in participant list in <1s
- [ ] Add song (race): two users add songs simultaneously → both appear in queue at different positions (no duplicates)
- [ ] Platform autodetect: first song add → `preferred_platform` set on profile in Supabase
- [ ] Now playing: DJ clicks "Play Next" → now playing renders on both clients → each sees their platform link
- [ ] YouTube embed: `FLAGS.YOUTUBE_EMBED = true` → YT iframe renders for songs with YouTube link
- [ ] Vote to skip: `FLAGS.VOTE_TO_SKIP = true` → non-DJ vote → count visible → threshold met → queue advances
- [ ] DJ token: `FLAGS.DJ_TOKEN = true` → host passes token → new DJ gets Play Next controls → old DJ loses them
- [ ] DJ leaves: DJ closes tab → participant row deleted → DB trigger auto-promotes host as DJ → queue not stalled
- [ ] End session: host ends → both clients see ended banner + played history
- [ ] Session expiry: set `expires_at` to past in Supabase → pg_cron marks `status = 'ended'` on next hour tick

**Feature Flags**
- [ ] Set `JAM_SESSION = false` in Supabase `feature_flags` → page reload → CTA hidden + `/jam/*` routes return 404
- [ ] Reset to `true` → feature re-enables without redeploy

---

## Phase 2–4 Summary (Future)

Enable via Supabase `feature_flags` table + add components per phase. No architecture changes needed.

### Phase 2 — Social (REACTIONS, CHAT, SESSION_HISTORY, USER_PROFILES flags)
- Queue reactions (🔥 ❤️ 😴) — `queue_reactions` table, realtime broadcast, add to `QueueCard`
- Session chat — ephemeral Supabase broadcast channel, chat panel component in sidebar
- Session history — `/jam/:code/history` route, read-only QueueList
- User profiles — `/u/:username` route, profile page component

### Phase 3 — Discovery (SHARED_PLAYLISTS, DISCOVERY_FEED, TASTE_MATCHING flags)
- Shared playlists — `playlists` + `playlist_items` tables, async (no realtime needed)
- Public song feed — query `queue_items` across public sessions, discovery page
- Taste matching — artist overlap query, suggest sessions/users

### Phase 4 — Advanced DJ (SCHEDULED_JAMS, QUEUE_RULES, EMBED_WIDGET flags)
- Scheduled jams — `scheduled_at` column, countdown component
- Queue rules — `max_songs_per_user`, `no_duplicate_artists` enforced in `addToQueue`
- Embed widget — `/widget/:code` route, iframe-safe read-only view
