# Docker / other PaaS

The root [`Dockerfile`](../../Dockerfile) builds one image that serves the
admin UI, the admin API, and the gateway API. It works on any platform that can
run a container and provide PostgreSQL, including Fly.io, Railway, Koyeb, and a
plain VM.

## Local Docker Compose

```bash
cp .env.example .env
# edit ADMIN_TOKEN / GATEWAY_API_KEY if you like
docker compose up --build
```

Open <http://localhost:8700/public/admin/> and sign in with `ADMIN_TOKEN`
(default `dev-admin-token` in `docker-compose.yml`).

The compose file starts PostgreSQL 16 and passes
`CONFIG_STORE=postgres`, so configuration survives `docker compose restart`.

## Build and run manually

```bash
docker build -t llmadmin .
docker run --rm -p 8700:8700 \
  -e CONFIG_STORE=postgres \
  -e USAGE_STORE=postgres \
  -e DATABASE_URL='postgres://user:pass@host:5432/llmadmin' \
  -e DATABASE_SSL=true \
  -e ADMIN_TOKEN="$(openssl rand -hex 32)" \
  -e GATEWAY_API_KEY="$(openssl rand -hex 32)" \
  llmadmin
```

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

Point the platform health check at `/admin/health` so a transient database
outage does not cause a restart loop.

## Platform notes

- **Fly.io**: attach a Postgres app (or Neon) and set `DATABASE_URL`; expose
  port 8700 with `[http_service] internal_port = 8700`.
- **Railway**: add a PostgreSQL plugin; reference `DATABASE_URL` from it.
- **Vercel/Netlify/Cloudflare Workers**: not supported by this image. Those
  runtimes need the upcoming storage/KV adapters and a different entry point.
