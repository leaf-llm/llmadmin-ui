# Web security checklist

The desktop build talks to a trusted process on `127.0.0.1`. A public web
deployment needs the following, and the template implements it by default.

## Tokens

- `ADMIN_TOKEN` protects `/admin/*` and `/log/stream`.
- `GATEWAY_API_KEY` protects `/v1/*`.
- Generate both with `openssl rand -hex 32` (or let Render generate them).
- Admin tokens are kept in `sessionStorage`, not `localStorage`. Closing the
  tab signs you out.
- Never put tokens in a URL or a query string. The WebSocket path accepts
  `Sec-WebSocket-Protocol: bearer.<key>` for browser clients that cannot set
  headers.

## Production behavior

- `NODE_ENV=production` + missing `ADMIN_TOKEN` → admin API returns 503 until
  configured (health stays up and reports `setupRequired: true`).
- `NODE_ENV=production` + missing `GATEWAY_API_KEY` → `/v1/*` returns 503 unless
  `GATEWAY_AUTH_DISABLED=true` is set deliberately.
- `ADMIN_AUTH_DISABLED` should only be used for local development.

## Network

- Admin CORS is same-origin plus an explicit `ADMIN_CORS_ORIGINS` allowlist.
  Never use `*` with credentials.
- Cross-origin writes are rejected even if a token leaks.
- Provider `baseUrl` values are checked against private/link-local/metadata
  ranges. Set `ALLOW_PRIVATE_PROVIDER_HOSTS=true` only when you intentionally
  route to a local Ollama or an internal gateway.
- Request body limits: 2 MB for admin writes, 25 MB for `/v1/*` (both
  configurable).

## Data at rest

- Provider keys are stored in the unified config document in PostgreSQL. Rely
  on the database provider's encryption at rest and network restrictions; do
  not expose the database publicly.
- Config export includes provider keys. Treat exported files as secrets.
  `GET /admin/config/export?redact=true` returns a shareable redacted copy.
- Back up the database or export config before rotating keys.

## Logging

- The gateway redacts `authorization`, `x-api-key`, `api-key` and `api_key`
  from request logs.
- The legacy `/public/` log viewer is disabled when `WEB_UI=true`; use the
  authenticated React admin instead.
- Set `LOG_PROMPTS=false` if prompt/response bodies must not be retained.

## Operational

- Rotate tokens after any suspected exposure; Render restarts the service when
  env vars change.
- Keep the Node base image and npm dependencies patched.
- Run one admin per deployment. The template is single-tenant by design; it
  does not implement user accounts, RBAC, or per-key quotas.
