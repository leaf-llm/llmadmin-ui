# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22

# ---------------------------------------------------------------------------
# Build stage
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# The UI composition root keeps the gateway in the src-gateway submodule.
# Render's checkout normally includes .git, so submodule update works. If the
# build context has no .git (some CI uploads strip it), fall back to a shallow
# clone of the pinned fork.
ARG GATEWAY_REPO=https://github.com/leaf-llm/llmadmin-core.git
ARG GATEWAY_REF=main
RUN if [ ! -f src-gateway/package.json ] && [ -d .git ]; then \
      git submodule update --init --recursive; \
    fi \
 && if [ ! -f src-gateway/package.json ]; then \
      rm -rf src-gateway; \
      git clone --depth 1 --branch "$GATEWAY_REF" "$GATEWAY_REPO" src-gateway; \
    fi

RUN npm ci --legacy-peer-deps \
 && npm --prefix src-gateway ci --legacy-peer-deps

# Build the UI into src-gateway/build/public/admin, then bundle the server.
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8700 \
    WEB_UI=true \
    ENABLE_LEGACY_LOGS=false

WORKDIR /app

COPY --from=build /app/src-gateway/build ./build
COPY --from=build /app/src-gateway/package.json ./package.json
COPY --from=build /app/src-gateway/package-lock.json ./package-lock.json
COPY --from=build /app/src-gateway/node_modules ./node_modules

# The process only needs to read its bundle; config lives in PostgreSQL.
USER node
EXPOSE 8700

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8700)+'/admin/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "build/start-server.js"]
