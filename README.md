# MusicOne

Paste any music streaming URL → get search links for every platform. Includes real-time group listening rooms (Jam Sessions).

**Supported platforms:** Spotify · Apple Music · YouTube Music · Amazon Music · Tidal · Deezer · SoundCloud · JioSaavn · Gaana

---

## Monorepo layout

```
ui/    React 18 + Vite SPA (GitHub Pages / Cloudflare Pages)
api/   FastAPI backend + Alembic migrations (Supabase Postgres)
```

---

## Local development

### API

```bash
cd api
cp .env.example .env        # fill in Supabase credentials
uv sync
uv run alembic upgrade head # run migrations
uv run uvicorn app.main:app --reload
# → http://localhost:8000
```

### UI

```bash
cd ui
cp .env.local.example .env.local   # fill in Supabase credentials
npm install
npm run dev
# → http://localhost:5173
# /api requests proxied to localhost:8000 via vite.config.js
```

---

## Database migrations

Migrations live in `api/migrations/versions/`. Managed by [Alembic](https://alembic.sqlalchemy.org/).

```bash
cd api

# Apply all pending migrations
uv run alembic upgrade head

# Create a new migration (after changing models)
uv run alembic revision --autogenerate -m "describe the change"

# Check current revision
uv run alembic current
```

---

## Environments

| Environment | Branch    | DB              | UI host              |
|-------------|-----------|-----------------|----------------------|
| UAT         | `uat`     | Supabase (UAT)  | Cloudflare Pages     |
| Staging     | `staging` | Supabase (stg)  | Cloudflare Pages     |
| Production  | `main`    | Supabase (prod) | GitHub Pages         |

Each environment has its own GitHub Actions environment with secrets. Migrations run automatically before each deploy.

### GitHub environment secrets required

| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:<pw>@db.<ref>.supabase.co:5432/postgres` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_JWT_SECRET` | JWT secret (Settings → API → JWT) |
| `VITE_SUPABASE_URL` | Same as SUPABASE_URL (Vite build) |
| `VITE_SUPABASE_ANON_KEY` | Same as SUPABASE_ANON_KEY (Vite build) |
| `VITE_API_URL` | Public API base URL |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key (console.cloud.google.com) |
| `ODESLI_API_KEY` | Odesli song lookup key _(optional — raises rate limit)_ |
| `CLOUDFLARE_API_TOKEN` | For Pages deploys (UAT + staging) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account (UAT + staging) |

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_PROJECT_NAME` | Cloudflare Pages project name |
| `CNAME_DOMAIN` | Custom domain for GitHub Pages (prod only) |

---

## CI/CD

Push to a branch → GitHub Actions runs `migrate` job then `deploy` job:

1. `migrate` — installs uv, runs `alembic upgrade head` against the environment's Supabase DB
2. `deploy` — builds the Vite app, deploys to Cloudflare Pages (UAT/staging) or GitHub Pages (prod)

Migration 001 is fully idempotent — safe to run against existing databases.
