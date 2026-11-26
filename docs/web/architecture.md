# Web architecture

The default web deployment is database-free: config and usage live in a file
under the container's `/tmp`.

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
        ├─ ConfigStore ──► /tmp/llmadmin/conf.json
        ├─ UsageStore  ──► /tmp/llmadmin/.llm-admin/metrics.json
        └─ provider fetch ──► upstream LLM APIs
```

## Default storage: ephemeral file

- `CONFIG_STORE=file`, `CONFIG_PATH=/tmp/llmadmin/conf.json`.
- `USAGE_STORE=file`; the gateway writes `metrics.json` under `$HOME/.llm-admin/`
  (set `HOME=/tmp/llmadmin` in the template).
- No database and no persistent disk are required, so a Render free service can
  run the whole stack.
- The container filesystem is **not persistent**. Restart, redeploy, or a
  free-plan sleep/wake can wipe `/tmp`, losing config and usage.
- Only one instance is safe: the JSON file has no cross-instance locking.

Export the config from **Settings → Export** before restarting if you need a
backup, and import it after a cold start.

## Optional storage: PostgreSQL

The same code can use PostgreSQL when persistence is needed:

1. Set `CONFIG_STORE=postgres`, `USAGE_STORE=postgres`.
2. Set `DATABASE_URL` (Render Postgres, Neon, etc.).
3. Set `DATABASE_SSL=true` (or `auto` when the URL has `?sslmode=require`).

PostgreSQL mode creates `llmadmin_config`, `llmadmin_usage_daily` and
`llmadmin_meta` automatically. It supports optimistic concurrency:

- `GET /admin/config` returns an `ETag`.
- `PUT /admin/config` with a stale `If-Match` returns HTTP 409.
- Writes use `UPDATE ... WHERE version = $expected`.

`/admin/ready` checks the config store; `/admin/health` remains a liveness check
that does not touch storage.

## Usage flow

- The log middleware updates an in-process daily/provider map (used by the
  header's live counts).
- In file mode, the map is debounced to `metrics.json`.
- In PostgreSQL mode, deltas are buffered and flushed to
  `llmadmin_usage_daily` every `USAGE_FLUSH_MS` (default 10s) and on shutdown.
- A crash can lose at most one flush interval; this is operational reporting,
  not billing.

## Feature limitations

- File mode is single-instance only.
- Free web services sleep; the first request after sleep pays a cold start.
- The template is single-admin/single-tenant. Multi-user accounts and per-key
  quotas are out of scope.
- SSE and WebSocket streaming work on a single instance. With multiple
  instances, the live log stream is per-instance; PostgreSQL makes config and
  usage shared, but not the live log stream.

## Why not Workers/Vercel yet

The storage layer is deliberately driver-based, but the current web template
uses Node APIs for static files. A future serverless target needs KV/D1
adapters plus a static-assets binding; the `ConfigStore` interface and the
`env`/`memory` drivers are the starting point.
