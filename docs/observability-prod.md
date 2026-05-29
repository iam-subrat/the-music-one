# Observability — Production Environment

## Grafana

**URL:** https://grafana.themusic.one/  
(Ask maintainer for credentials)

---

## Loki Queries

**Production project label:** `musicone-prod`

```logql
# All production logs
{project="musicone-prod"}

# Errors only
{project="musicone-prod", level="error"}

# Search for exceptions
{project="musicone-prod"} |= "exception"
```

---

## Loki Labels

| Label | Value |
|-------|-------|
| `project` | `musicone-prod` |
| `container` | `/musicone-api-prod` |
| `service_name` | `/musicone-api-prod` |
| `level` | `error`, `warning`, `info`, `debug` |
| `method` | HTTP method (GET, POST, etc.) |

---

## Grafana Proxy

Query Loki via Grafana datasource proxy (UID: `P8E80F9AEF21F6940`):

```bash
curl -H "Authorization: Bearer <token>" \
  'https://grafana.themusic.one/api/datasources/proxy/uid/P8E80F9AEF21F6940/loki/api/v1/query_range' \
  -d 'query={project="musicone-prod"}&limit=100'
```

---

## Common queries

**Recent critical errors (last 1h):**
```logql
{project="musicone-prod", level="error"} | json
```

**Queue/skip vote issues:**
```logql
{project="musicone-prod"} |= "queue" or "skip_vote"
```

**API latency (by endpoint):**
```logql
{project="musicone-prod"} | json | method != "" | unwrap duration_ms
```

**Failed Supabase calls:**
```logql
{project="musicone-prod"} |= "supabase" |= "error"
```

**Auth failures:**
```logql
{project="musicone-prod"} |= "auth" |= "error" or "unauthorized"
```

---

## Alerts

Production logs are monitored for critical errors. On-call is paged for:
- Error rate > 10% over 5 minutes
- Supabase connection failures
- Database migration failures
- Auth system errors

Check Grafana Alert Rules for current thresholds.
