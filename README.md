# MusicOne

React 18 SPA: paste a music streaming URL → get search links for all platforms. Includes real-time group listening rooms (Jam Sessions).

**Platforms:** Spotify · Apple Music · YouTube Music · Amazon Music · Tidal · Deezer · SoundCloud · JioSaavn · Gaana

---

## Quick start

```bash
# UI
cd ui
npm install && npm run dev   # http://localhost:5173

# API
cd api
uv sync && uv run uvicorn app.main:app --reload  # http://localhost:8000
```

**UI Commands:**
```bash
npm run dev      # Dev server (Vite HMR)
npm run build    # Production build → dist/
npm run preview  # Serve dist/ locally
```

---

## Table of contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Local setup](#local-setup)
4. [Queue & Jam mechanics](#queue--jam-mechanics)
5. [Database](#database)
6. [Deployment](#deployment)
7. [Docs](#docs)

---

## Features

**Home** (`/`) — URL lookup via Odesli API → multi-platform links.

**Jam Sessions** (`/jam/:code`) — Real-time group listening. Queue management (skip voting), DJ role, YouTube auto-play.

---

## Tech stack

```
ui/      React 18 + Vite SPA (GitHub Pages / Cloudflare Pages)
api/     FastAPI + Alembic migrations (Supabase Postgres)
```

**Auth:** Supabase (Google OAuth).

**Realtime:** Supabase Realtime subscriptions on `sessions`, `queue_items`, `skip_votes`, `session_participants`.

**Feature flags:** Defined in `src/lib/flags.js`. Compile-time injected via Vite. Runtime overrides via Supabase `feature_flags` table (no redeploy).

---

## Local setup

### Prerequisites

Copy `.env.local.example` → `.env.local` (UI) and `.env.example` → `.env` (API). Fill in Supabase credentials.

### API

```bash
cd api
uv sync
uv run alembic upgrade head       # Run migrations
uv run uvicorn app.main:app --reload
# http://localhost:8000
```

### UI

```bash
cd ui
npm install
npm run dev
# http://localhost:5173
# /api proxied to localhost:8000 (vite.config.js)
```

---

## Queue & Jam mechanics

**Queue lifecycle:** `queued → playing → played | skipped`

**Key DB functions** (call via `supabase.rpc()`):
- `play_next(session_id)` — Atomically advance queue (server-side only)
- `cast_skip_vote(queue_item_id, user_id, threshold)` — Vote to skip; auto-advances if ≥threshold
- `pass_dj_token(session_id, new_dj_user_id)` — Transfer DJ role

**Auto-play:** DJ only. `YouTubeAutoPlayer` embeds YouTube IFrame API; fires `onEnded` to auto-advance. Skip threshold = ≥50% of participants.

---

## Database

Migrations in `api/migrations/versions/` (Alembic).

```bash
cd api

# Apply pending migrations
uv run alembic upgrade head

# Create migration after model changes
uv run alembic revision --autogenerate -m "description"

# Check current state
uv run alembic current
```

**Key points:**
- `queue_items.position` uses `GENERATED ALWAYS AS IDENTITY` + `UNIQUE(session_id, position)` → no race conditions
- `on_participant_leave` trigger auto-promotes host as DJ when DJ disconnects
- `expire-stale-sessions` pg_cron job marks sessions `ended` after 24h
- Migration 001 is idempotent — safe to run against existing databases

---

## Deployment

| Env | Branch | DB | UI |
|-----|--------|----|----|
| Staging | `staging` | Supabase stg | Cloudflare Pages |
| Production | `main` | Supabase prod | GitHub Pages |

Push to branch → GitHub Actions: `migrate` job (Alembic) → `deploy` job (build + Pages/Cloudflare).

### GitHub environment configuration

**Secrets** (Settings → Environments → [environment] → Secrets):

| Name | Env | Purpose |
|------|-----|---------|
| `DATABASE_URL` | Both | Postgres async URL for migrations |
| `SUPABASE_URL` | Both | Supabase project URL |
| `SUPABASE_ANON_KEY` | Both | Supabase anon key |
| `VITE_API_URL` | Both | Public API base URL (Vite build) |
| `VITE_POSTHOG_KEY` | Both | PostHog analytics key _(optional)_ |
| `YOUTUBE_API_KEY` | Both | YouTube Data API v3 ([setup](https://console.cloud.google.com)) |
| `ODESLI_API_KEY` | Both | Song lookup _(optional — rate limit)_ |
| `SPOTIFY_CLIENT_ID` | Both | Spotify API credentials |
| `SPOTIFY_CLIENT_SECRET` | Both | Spotify API credentials |
| `CLOUDFLARE_API_TOKEN` | Staging | Cloudflare Pages deploy token |
| `CLOUDFLARE_ACCOUNT_ID` | Staging | Cloudflare account ID |
| `CNAME_DOMAIN` | Production | Custom domain for GitHub Pages |

**Variables** (Settings → Environments → [environment] → Variables):

| Name | Env | Purpose |
|------|-----|---------|
| `VITE_APP_ENV` | Both | App environment (`staging` or `production`) |
| `ALLOWED_ORIGINS` | Both | CORS allowed origins (comma-separated) |
| `FRONTEND_URL` | Both | Frontend base URL |
| `ROOT_PATH` | Both | API root path prefix |
| `COOKIE_DOMAIN` | Both | Cookie domain scope |
| `COOKIE_SAMESITE` | Both | Cookie SameSite policy |
| `CLOUDFLARE_PROJECT_NAME` | Staging | Cloudflare Pages project name |
| `CNAME_DOMAIN` | Production | Custom domain (GitHub Pages) |

---

## Docs

- **[CLAUDE.md](CLAUDE.md)** — Architecture, hooks, queue lifecycle, DB functions, flags, YouTube setup
- **[docs/observability-staging.md](docs/observability-staging.md)** — Grafana + Loki for staging environment
- **[docs/observability-prod.md](docs/observability-prod.md)** — Grafana + Loki for production environment
- **[docs/spa-routing.md](docs/spa-routing.md)** — GitHub Pages SPA routing via 404.html
