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
{project="musicone-staging"} |= "queue" or "skip_vote"
```

**API latency (by endpoint):**
```logql
{project="musicone-staging"} | json | method != "" | unwrap duration_ms
```

**Failed Supabase calls:**
```logql
{project="musicone-staging"} |= "supabase" |= "error"
```
