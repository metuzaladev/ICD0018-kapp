# syntax=docker/dockerfile:1
#
# Käpp API production image (M8, docs/15-pakendamine-ja-levitamine.md).
# Build from the repository root (the API depends on the packages/shared workspace):
#   docker build -f apps/api/Dockerfile -t kapp-api .
# Run migrations once per release, then start the server:
#   docker run --rm --env-file api.env kapp-api node dist/migrate.js
#   docker run -p 3000:3000 --env-file api.env kapp-api
#
# Why node:24-bookworm-slim and not alpine/distroless: sharp ships prebuilt glibc binaries
# (musl/alpine needs a different build), and slim keeps a shell for `docker exec` debugging while
# staying ~80 MB. Distroless would save a few MB more but has no shell to inspect a broken release.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
# Only the manifests: the dependency layers stay cached until a package.json or the lockfile changes.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# ---- build: all API dependencies (incl. esbuild) + source → dist/ ----
FROM base AS build
RUN --mount=type=cache,target=/root/.npm npm ci --workspace @kapp/api --include-workspace-root=false
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace @kapp/api

# ---- prod-deps: runtime dependencies only, installed for the image's platform (sharp) ----
FROM base AS prod-deps
COPY apps/api/scripts/prune-runtime-deps.mjs /tmp/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace @kapp/api --include-workspace-root=false --omit=dev \
 && node /tmp/prune-runtime-deps.mjs

# ---- runtime ----
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
# npm/corepack are not needed to run `node dist/index.js`; fewer tools = less to patch and exploit.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
COPY --from=prod-deps /app /app
COPY --from=build /app/apps/api/dist /app/apps/api/dist
# SQL migrations for `node dist/migrate.js` (applied by a separate release step, not on boot).
COPY apps/api/drizzle /app/apps/api/drizzle
WORKDIR /app/apps/api

# Files stay owned by root and read-only for the process: the API never writes to disk
# (photos go to object storage), so a compromised process cannot modify its own code.
USER node
EXPOSE 3000

# Liveness: /health answers 200 while the process serves HTTP; `database` in the body reports the
# database separately, so a database outage does not make the platform restart healthy containers.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# Exec form: node is PID 1 and receives SIGTERM directly; index.ts shuts down gracefully
# (lib/graceful-shutdown.ts, deadline SHUTDOWN_TIMEOUT_MS, default 9 s < Docker's 10 s).
CMD ["node", "--enable-source-maps", "dist/index.js"]
