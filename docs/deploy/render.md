# Deploy on Render

This repository doubles as a Render Blueprint: one Docker web service plus one
PostgreSQL database, both defined in [`render.yaml`](../../render.yaml).

## One-click deploy

1. Fork `leaf-llm/llmadmin-ui`.
2. Open:
   `https://render.com/deploy?repo=https://github.com/<your-account>/llmadmin-ui`
3. Render reads `render.yaml`, creates the database and asks you to confirm.
4. After the first deploy, open the **llmadmin** service → **Environment** and
   copy:
   - `ADMIN_TOKEN` — used to sign in to the admin UI.
   - `GATEWAY_API_KEY` — used by API clients.
5. Open `https://<service>.onrender.com/public/admin/`, paste `ADMIN_TOKEN`,
   then add a provider and a routing entry.

The root URL redirects to the admin UI, so `https://<service>.onrender.com/`
also works.

## Calling the gateway

```bash
curl https://<service>.onrender.com/v1/chat/completions \
  -H "Authorization: Bearer $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Anthropic-compatible clients use the same key:

```bash
curl https://<service>.onrender.com/v1/messages \
  -H "x-api-key: $GATEWAY_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-5-sonnet-latest","max_tokens":256,"messages":[{"role":"user","content":"Hello"}]}'
```

`x-api-key` is accepted for OpenAI-shaped requests too, which is convenient for
clients that only know one header style.

## Configuration and persistence

- `CONFIG_STORE=postgres`, `USAGE_STORE=postgres`.
- Config is stored as one JSONB document in `llmadmin_config`; usage is daily
  aggregates in `llmadmin_usage_daily`. Both tables are created automatically.
- Restarting or redeploying the web service does **not** lose configuration.
- No persistent disk is required.

## Free-plan notes

- Free web services sleep after inactivity; the first request after a sleep is
  slow (cold start).
- Free PostgreSQL plans have usage/expiry limits that change over time. Check
  Render's current pricing before relying on it for production.
- For production, upgrade the web service and database plans in the Render
  dashboard or in `render.yaml`.

## Rotating tokens

Change `ADMIN_TOKEN` or `GATEWAY_API_KEY` in **Environment**; Render restarts
the service. The admin UI will return to the login screen on the next 401, and
clients must switch to the new gateway key.

## Database backup

Use Render's database backups (paid plans) or run `pg_dump` against the external
connection string. The config document can also be exported from
**Settings → Export** in the admin UI; that file contains provider keys, so
store it like a secret.
