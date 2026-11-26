# Deploy on Render

This repository doubles as a Render Blueprint: one Docker web service, no
database and no persistent disk. It is intentionally the free, zero-infra
template.

> **Data is ephemeral.** Config is written to `/tmp/llmadmin/conf.json` inside
> the container. Render restarts, redeploys, and free-plan sleep/wake cycles can
> recreate the container, so providers and routes configured in the admin UI may
> be lost. Export the config from **Settings → Export** if you need a backup, or
> switch to PostgreSQL/Neon (below) for persistence.

## One-click deploy

1. Fork `leaf-llm/llmadmin-ui`.
2. Open:
   `https://render.com/deploy?repo=https://github.com/<your-account>/llmadmin-ui`
3. Render reads `render.yaml` and creates the web service.
4. After the first deploy, open the **llmadmin** service → **Environment** and
   copy:
   - `ADMIN_TOKEN` — used to sign in to the admin UI.
   - `GATEWAY_API_KEY` — used by API clients.
5. Open `https://<service>.onrender.com/public/admin/`, paste `ADMIN_TOKEN`,
   then add a provider and a routing entry.

The root URL redirects to the admin UI, so `https://<service>.onrender.com/`
also works.

## Storage behavior

The Blueprint sets:

```env
CONFIG_STORE=file
CONFIG_PATH=/tmp/llmadmin/conf.json
USAGE_STORE=file
HOME=/tmp/llmadmin
```

- No database, no disk, no extra Render resources.
- `/tmp` is writable by the container user but is **not persistent**.
- Restarting/redeploying the service, or waking it from free-plan sleep, may
  reset config and usage statistics.
- Usage is best-effort; it is not billing-grade.

This is fine for a demo, a personal gateway you can reconfigure quickly, or a
temporary deployment. For anything long-lived, persist the config.

## Optional: switch to PostgreSQL/Neon

When you need the config to survive restarts, use PostgreSQL. The core already
supports it; only environment variables change.

1. Create a PostgreSQL database (Neon free tier is enough for a small setup).
2. In `render.yaml`, delete the `CONFIG_STORE`/`CONFIG_PATH`/`USAGE_STORE`/
   `HOME` file-mode entries and add:

   ```yaml
   - key: CONFIG_STORE
     value: postgres
   - key: USAGE_STORE
     value: postgres
   - key: DATABASE_URL
     sync: false
   - key: DATABASE_SSL
     value: auto
   - key: DATABASE_POOL_MAX
     value: "3"
   ```

3. In the Render Dashboard → Environment, set `DATABASE_URL` to the Neon
   **pooled** connection string.
4. Restart the service. The tables are created automatically on first boot.

`/admin/ready` verifies the database; `/admin/health` stays a liveness check and
does not touch storage. See [`docs/deploy/docker.md`](./docker.md) for the same
setup outside Render.

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

## Free-plan notes

- Free web services sleep after inactivity; the first request after a sleep is
  slow (cold start).
- File mode has no Render database/disk cost, but the data is ephemeral as
  described above.
- If you later add Render PostgreSQL, free database plans have usage/expiry
  limits that change over time; Neon's free tier is another option.

## Rotating tokens

Change `ADMIN_TOKEN` or `GATEWAY_API_KEY` in **Environment**; Render restarts
the service. The admin UI returns to the login screen on the next 401, and API
clients must switch to the new gateway key.

## Backups

In file mode there is no database backup. Use **Settings → Export** in the
admin UI before restarting/redeploying; the exported file contains provider
keys, so store it like a secret. Import it again after a cold start.

If you switch to PostgreSQL, use the provider's backups or `pg_dump` against the
external connection string.
