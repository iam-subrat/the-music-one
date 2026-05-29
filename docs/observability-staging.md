# Observability — Staging Environment

## Grafana

**URL:** https://grafana.themusic.one/  
(Ask maintainer for credentials)

---

## Loki Queries

**Staging project label:** `musicone-staging`

```logql
# All staging logs
{project="musicone-staging"}

# Errors only
{project="musicone-staging", level="error"}

# Search for exceptions
{project="musicone-staging"} |= "exception"
```

---

## Loki Labels

| Label | Value |
|-------|-------|
| `project` | `musicone-staging` |
| `container` | `/musicone-api-staging` |
| `service_name` | `/musicone-api-staging` |
| `level` | `error`, `warning`, `info`, `debug` |
| `method` | HTTP method (GET, POST, etc.) |

---

## Structured metadata

Promtail promotes `level` and `method` as indexed Loki labels. These fields are stored as structured metadata (queryable but not indexed):

| Field | Example | Notes |
|-------|---------|-------|
| `path` | `/api/sessions/abc/join` | Request path |
| `status_code` | `200`, `422` | HTTP response code |
| `duration_ms` | `45` | Request duration |
| `request_id` | UUID | Trace individual requests |

Filter by metadata:
```logql
{project="musicone-staging"} | json | status_code >= 500
{project="musicone-staging"} | json | path =~ "/sessions.*" | duration_ms > 500
```

---

## Grafana Proxy

Query Loki via Grafana datasource proxy (UID: `P8E80F9AEF21F6940`):

```bash
curl -H "Authorization: Bearer <token>" \
  'https://grafana.themusic.one/api/datasources/proxy/uid/P8E80F9AEF21F6940/loki/api/v1/query_range' \
  -d 'query={project="musicone-staging"}&limit=100'
```

---

## Common queries

**Recent errors (last 1h):**
```logql
{project="musicone-staging", level="error"} | json
```

**Queue/skip vote issues:**
```logql
{project="musicone-staging"} |~ "queue|skip_vote"
```

**API latency (ms) by endpoint:**
```logql
{project="musicone-staging"} | json | method != "" | unwrap duration_ms [1m]
```

**Failed Supabase calls:**
```logql
{project="musicone-staging"} |= "supabase" |= "error"
```

**SSE stream errors:**
```logql
{project="musicone-staging"} |= "/events/" |= "error"
```

**Playlist import failures:**
```logql
{project="musicone-staging"} |= "playlists" |= "error"
```
