# Web architecture

```
Browser
  │  https://app.example.com/public/admin/
  ▼
Render / Docker web service (Node 22)
  │
  ├─ /public/admin/*   Vite-built React SPA (static files)
  ├─ /admin/*          admin API (ADMIN_TOKEN)
  └─ /v1/*             gateway API (GATEWAY_API_KEY)
        │
        ├─ ConfigStore ──► PostgreSQL: llmadmin_config
        ├─ UsageStore  ──► PostgreSQL: llmadmin_usage_daily
        └─ provider fetch ──► upstream LLM APIs
```

## Configuration flow

1. On boot the server selects a driver from `CONFIG_STORE`
   (`postgres` / `file` / `memory` / `env`; `auto` prefers Postgres when
   `DATABASE_URL` exists).
2. PostgreSQL mode creates `llmadmin_config` if needed and loads the single
   JSONB document into an in-process cache.
3. Requests use the cached document (TTL `CONFIG_CACHE_TTL_MS`, default 5s).
4. Admin writes validate with Zod, update with an optimistic version check
   (`UPDATE ... WHERE version = $expected`), then invalidate the local cache.
5. A concurrent write from another instance is detected within the TTL; a
   conditional write with a stale `If-Match` gets HTTP 409.

The document shape is unchanged from `conf.json`: `settings`, `gateway`, and
`server`. This keeps desktop and web deployments interoperable: export from the
desktop app and import in the web UI (or vice versa).

## Usage flow

- The log middleware updates an in-process daily/provider map (used by the
  header's live counts).
- Deltas are buffered and flushed to `llmadmin_usage_daily` every
  `USAGE_FLUSH_MS` (default 10s) and on graceful shutdown.
- `/admin/metrics` flushes first, then aggregates from PostgreSQL. A crash can
  lose at most one flush interval; this is operational reporting, not billing.

## Feature limitations on Render

- SSE and WebSocket streaming work on a single Render instance. With multiple
  instances, the live log stream is per-instance; config and usage remain
  shared through PostgreSQL.
- Free services sleep; the first request after sleep pays a cold start.
- The template is single-admin/single-tenant. Multi-user accounts and per-key
  quotas are out of scope.

## Why not Workers/Vercel yet

The storage layer is deliberately driver-based, but the current web template
uses Node APIs for static files and PostgreSQL. A future serverless target needs
KV/D1 adapters plus a static-assets binding; the `ConfigStore` interface and
the `env`/`memory` drivers are the starting point.
