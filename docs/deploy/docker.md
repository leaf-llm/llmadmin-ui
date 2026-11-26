# Docker / other PaaS

The root [`Dockerfile`](../../Dockerfile) builds one image that serves the
admin UI, the admin API, and the gateway API. It works on any platform that can
run a container, with or without PostgreSQL.

## Local Docker Compose

```bash
cp .env.example .env
# edit ADMIN_TOKEN / GATEWAY_API_KEY if you like
docker compose up --build
```

Open <http://localhost:8700/public/admin/> and sign in with `ADMIN_TOKEN`
(default `dev-admin-token` in `docker-compose.yml`).

The compose file uses file mode with no mounted volume:

```env
CONFIG_STORE=file
CONFIG_PATH=/tmp/llmadmin/conf.json
USAGE_STORE=file
HOME=/tmp/llmadmin
```

So config survives `docker compose restart` (same container filesystem) but is
lost on `docker compose down` / container recreation. This is intentional for
the free, no-database template.

## Build and run manually (file mode)

```bash
docker build -t llmadmin .
docker run --rm -p 8700:8700 \
  -e CONFIG_STORE=file \
  -e CONFIG_PATH=/tmp/llmadmin/conf.json \
  -e USAGE_STORE=file \
  -e HOME=/tmp/llmadmin \
  -e ADMIN_TOKEN="$(openssl rand -hex 32)" \
  -e GATEWAY_API_KEY="$(openssl rand -hex 32)" \
  llmadmin
```

To persist config, mount a volume at `/tmp/llmadmin` or switch to PostgreSQL.

## Optional: PostgreSQL

```bash
docker run --rm -p 8700:8700 \
  -e CONFIG_STORE=postgres \
  -e USAGE_STORE=postgres \
  -e DATABASE_URL='postgres://user:pass@host:5432/llmadmin' \
  -e DATABASE_SSL=true \
  -e DATABASE_POOL_MAX=3 \
  -e ADMIN_TOKEN="$(openssl rand -hex 32)" \
  -e GATEWAY_API_KEY="$(openssl rand -hex 32)" \
  llmadmin
```

Tables are created automatically. `/admin/ready` checks the database;
`/admin/health` remains a liveness check that does not touch storage.

## Submodules

The UI build writes into the `src-gateway` submodule. When building outside
Render, make sure the checkout includes submodules:

```bash
git clone --recurse-submodules https://github.com/leaf-llm/llmadmin-ui
```

The Docker build runs `git submodule update --init --recursive` when `.git` is
present, and falls back to a shallow clone of `GATEWAY_REPO`/`GATEWAY_REF`
otherwise.

## Health checks

- Liveness: `GET /admin/health` (no auth, does not touch the database).
- Readiness: `GET /admin/ready` (checks the config store; 503 if unavailable).

Point the platform health check at `/admin/health` so a transient storage
outage does not cause a restart loop.

## Platform notes

- **Fly.io / Railway / Koyeb**: file mode works out of the box; add a volume
  mounted at `/tmp/llmadmin` if you want persistence, or attach PostgreSQL and
  set `DATABASE_URL`.
- **Vercel/Netlify/Cloudflare Workers**: not supported by this image. Those
  runtimes need the upcoming storage/KV adapters and a different entry point.
