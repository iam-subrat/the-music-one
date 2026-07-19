# MusicOne

Paste a music URL → get links for all 9 platforms (Spotify, Apple Music, YouTube Music, Amazon Music, Tidal, Deezer, SoundCloud, JioSaavn, Gaana). Real-time group listening rooms (Jam Sessions) with skip voting and DJ mode.

## Surfaces

| Surface | Tech | Entry point |
|---------|------|------------|
| **Web UI** | React 18 + Vite SPA | `ui/src/App.jsx` → `/jam/:code` |
| **TUI** | Terminal UI (same routes) | `ui/src/tui/` → toggled in Web UI |
| **Mobile** | Expo SDK 56 React Native | `mobile/` → iOS-first |
| **API** | FastAPI + Supabase Postgres | `api/app/main.py` |

---

## Getting started

### Prerequisites

- Node 18+, `npm`, `uv` (Python package manager)
- Supabase project credentials

### Setup

**1. Environment files**

```bash
# UI
cp ui/.env.local.example ui/.env.local

# API
cp api/.env.example api/.env

# Mobile (optional)
cp mobile/.env.example mobile/.env
```

Fill in Supabase `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

**2. API**

```bash
cd api
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Runs on `http://localhost:8000`. Docs at `/docs` (Swagger).

**3. Web UI**

```bash
cd ui
npm install
npm run dev
```

Runs on `http://localhost:5173`. API proxied via `vite.config.js`.

**4. Mobile (optional)**

```bash
cd mobile
npm install
expo start
expo run:ios  # iOS simulator
```

---

## Architecture

### Data flow

```
Supabase Auth (Google OAuth) → useAuth hook (user + profile)
  ↓
JamRoom components
  ├─ useSession(code)        → Realtime subscription
  ├─ useQueue(session.id)     → Realtime subscription
  ├─ useParticipants(id)      → Realtime subscription
  └─ useSkipVotes(itemId)     → Realtime subscription
  ↓
FastAPI backend (via RPC or HTTP)
  └─ play_next() / cast_skip_vote() / pass_dj_token()
```

- **Web UI + TUI:** Supabase Realtime for state sync
- **Mobile:** SSE (Server-Sent Events) via `react-native-sse`

### Key concepts

**Queue:** `queued → playing → played | skipped`. Position managed by DB (`GENERATED ALWAYS AS IDENTITY`). Never UPDATE from client.

**DJ role:** Only DJ can play songs. Host auto-promoted if DJ disconnects (`on_participant_leave` trigger).

**Skip voting:** Client calls `POST /api/items/{id}/votes`. Server atomically counts votes via `cast_skip_vote()`. Auto-advances when ≥ threshold.

**YouTube auto-play:** DJ only. `YouTubeAutoPlayer` embeds IFrame API, fires `onEnded` → heartbeat → `play_next()`.

---

## Codebase layout

### Web UI (`ui/`)

```
ui/src/
  ├─ pages/           Route handlers (Home, JamRoom, etc.)
  ├─ components/      Shared React components
  ├─ hooks/           Custom hooks (useSession, useQueue, etc.)
  ├─ lib/             Utilities (youtube.js, flags.js, etc.)
  ├─ tui/             Terminal UI (TerminalShell, TuiJamRoom, etc.)
  ├─ styles/          CSS modules
  └─ App.jsx          Router + layout

npm run dev           Dev server (Vite HMR)
npm run build        Production build → dist/
npm run preview      Serve dist/ locally
```

### TUI (`ui/src/tui/`)

Terminal-style interface running in same React app. Toggled via `TuiToggle` button; preference saved in localStorage.

| File | Purpose |
|------|---------|
| `TuiContext.jsx` | `useTui()` hook — manages `tuiMode` state |
| `TerminalShell.jsx` | Core terminal emulator — input, history, log rendering |
| `TuiHome.jsx` | Home screen in TUI mode |
| `TuiLogin.jsx` | Login screen in TUI mode |
| `TuiJamRoom.jsx` | Full jam room — same hooks as web UI |
| `TuiPlaylistPicker.jsx` | Playlist import in TUI mode |

**TUI commands:** `add <url>`, `add "<name>" [artist]`, `play/resume`, `pause`, `seek`, `next`, `skip`, `who`, `dj <me|@name>`, `repeat`, `invite`, `end`, `leave`, `help`.

### Mobile (`mobile/`)

```
mobile/src/
  ├─ lib/              Utils (api.ts, sse.ts, auth.ts)
  ├─ hooks/            Custom hooks (useSession, useQueue, etc.)
  ├─ components/       React Native components
  ├─ screens/          Navigation screens
  └─ navigation/       React Navigation setup

npm run dev           Expo dev server
expo run:ios          Build + run on iOS simulator
expo run:android      Build + run on Android emulator
```

**Auth:** Expo's `expo-auth-session` (Google OAuth) → JWT stored in `expo-secure-store`. Token refresh via `/api/auth/mobile/refresh`.

**Realtime:** SSE (not Supabase Realtime). Hooks re-fetch on SSE reconnect and `AppState → 'active'`.

### API (`api/`)

```
api/
  ├─ app/
  │  ├─ main.py               ASGI app + routers
  │  ├─ routes/               Endpoint handlers
  │  └─ models/               Pydantic/SQLAlchemy models
  ├─ migrations/
  │  └─ versions/             Alembic migration files
  ├─ alembic.ini              Alembic config
  └─ pyproject.toml           Dependencies (uv)

uv run uvicorn app.main:app --reload   Dev server
uv run alembic upgrade head             Run migrations
uv run alembic revision --autogenerate -m "msg"   Create migration
```

**Realtime:** Postgres with `pg_cron` and triggers. Supabase handles replication to clients.

**DB functions** (server-side only):
- `play_next(session_id)` — atomically advance queue
- `cast_skip_vote(queue_item_id, user_id, threshold)` — vote to skip
- `pass_dj_token(session_id, new_dj_user_id)` — transfer DJ role

---

## Tech stack

| Layer | Stack |
|-------|-------|
| **Auth** | Supabase (Google OAuth, PKCE flow), JWT (RS256) |
| **State** | Supabase Realtime (Web/TUI), SSE (Mobile) |
| **UI** | React 18 (Web), React Native (Mobile) |
| **Build** | Vite (Web), Expo (Mobile) |
| **API** | FastAPI + Uvicorn |
| **Database** | Supabase Postgres + Alembic migrations |
| **Observability** | Loki + Grafana |
| **Analytics** | PostHog (optional) |

**Feature flags:** Compile-time via Vite `define` block (`FLAG_*` env vars). Runtime overrides via Supabase `feature_flags` table — toggle without redeploy.

---

## Database

Migrations live in `api/migrations/versions/` (Alembic). Apply before development:

```bash
cd api
uv run alembic upgrade head
```

**Create migration after schema changes:**

```bash
uv run alembic revision --autogenerate -m "description"
uv run alembic upgrade head
```

**Key DB features:**
- `queue_items.position` uses `GENERATED ALWAYS AS IDENTITY` + `UNIQUE(session_id, position)` → no race conditions
- `on_participant_leave` trigger auto-promotes host as DJ
- `expire-stale-sessions` pg_cron job ends sessions after 24h
- Realtime enabled on: `sessions`, `session_participants`, `queue_items`, `skip_votes`

---

## Feature flags

Declared in `ui/vite.config.js`. Set at build time via `FLAG_*` env vars:

```bash
FLAG_JAM_SESSION=true npm run build
```

Runtime overrides via Supabase `feature_flags` table. Check `GET /api/flags/` endpoint.

See **[docs/feature-flags.md](docs/feature-flags.md)** (auto-generated).

---

## Deployment

| Env | Branch | DB | UI | Mobile |
|-----|--------|-----|----|----|
| Staging | `staging` | Supabase stg | Cloudflare Pages | EAS build (dev) |
| Prod | `main` | Supabase prod | GitHub Pages | EAS build (prod) |

**Process:** Push to branch → GitHub Actions runs migrations → builds + deploys.

### GitHub secrets

| Secret | Purpose |
|--------|---------|
| `DATABASE_URL` | Postgres async URL (migrations) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase credentials |
| `YOUTUBE_API_KEY` | YouTube Data API v3 |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Spotify API |
| `ODESLI_API_KEY` | Song lookup (optional) |
| `VITE_API_URL` | Public API base URL |
| `VITE_POSTHOG_KEY` | Analytics (optional) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Staging deploy |

### GitHub variables

| Variable | Purpose |
|----------|---------|
| `VITE_APP_ENV` | `staging` or `production` |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) |
| `FRONTEND_URL` | Frontend base URL |
| `ROOT_PATH` | API root path prefix |
| `COOKIE_DOMAIN` | Cookie scope |
| `COOKIE_SAMESITE` | Cookie SameSite policy |

---

## API reference

Interactive docs auto-generated by FastAPI: `{API_URL}/docs` (Swagger) or `{API_URL}/redoc`.

**Key endpoints:**
- `POST /api/sessions/` — create jam room
- `POST /api/sessions/{id}/items` — add song to queue
- `POST /api/items/{id}/votes` — vote to skip
- `POST /api/sessions/{id}/dj` — transfer DJ role
- `GET /api/search?q=...` — search via Odesli

Full routes in `api/app/routes/`.

---

## Observability

**Staging:** [Grafana staging](https://grafana.themusic.one/) (Loki logs)  
**Prod:** Same Grafana with prod datasource

Logs labeled by `project` (musicone-staging/musicone-prod), `level`, `method`.

Query examples:
```logql
{project="musicone-prod"}
{project="musicone-prod", level="error"}
```

See **[docs/observability-staging.md](docs/observability-staging.md)** and **[docs/observability-prod.md](docs/observability-prod.md)**.

---

## Common tasks

**Test a feature locally:**
```bash
cd ui && npm run dev &
cd api && uv run uvicorn app.main:app --reload &
# Visit http://localhost:5173
```

**Add a database field:**
1. Update SQLAlchemy model in `api/app/models/`
2. Run `uv run alembic revision --autogenerate -m "add_field"`
3. Review and run `uv run alembic upgrade head`

**Toggle a feature without deploy:**
1. Add flag to Supabase `feature_flags` table
2. Check flag in code via `FLAGS.YOUR_FLAG`

**Deploy a change:**
1. Commit to `staging` branch
2. Verify in staging environment
3. Create PR to `main`
4. Merge → auto-deploys to production

---

## Docs

- **[docs/feature-flags.md](docs/feature-flags.md)** — Feature flag reference (auto-generated)
- **[docs/spa-routing.md](docs/spa-routing.md)** — GitHub Pages SPA routing
- **[CLAUDE.md](CLAUDE.md)** — Claude Code project config
