# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-bookworm-slim AS runtime

ARG VERSION=dev
LABEL org.opencontainers.image.title="Waypoint" \
      org.opencontainers.image.description="A private learning log for a sustainable daily engineering habit" \
      org.opencontainers.image.source="https://github.com/0x414c49/Waypoint" \
      org.opencontainers.image.version="$VERSION"

ENV NODE_ENV=production \
    JOURNEY_HOST=0.0.0.0 \
    JOURNEY_PORT=4173 \
    JOURNEY_STORE_DIR=/app/data/store

WORKDIR /app

# tini provides PID 1 signal forwarding and zombie reaping. curl is not
# needed: the healthcheck uses Node's built-in fetch implementation.
RUN apt-get update \
    && apt-get install --no-install-recommends --yes ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY --from=build /app/dist ./dist
# The production seed is intentionally kept as a file-backed fixture.
COPY --from=build /app/planning/fixtures ./planning/fixtures

RUN mkdir -p /app/data \
    && chown node:node /app/data

VOLUME ["/app/data"]
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4173/healthz',{headers:{host:'localhost:4173'}}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/runtime/server/main.js"]
