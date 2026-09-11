# Telegram Page Watcher Bot — multi-arch image (linux/amd64, linux/arm64)
#
# Build:  docker build -t telegram-page-watcher .
#         docker build --platform linux/arm64 -t telegram-page-watcher .
# Run:    mkdir -p data logs
#         docker run -d --name page-watcher --restart unless-stopped \
#           --env-file .env -p 3000:3000 \
#           -v "$(pwd)/data:/app/data" -v "$(pwd)/logs:/app/logs" \
#           telegram-page-watcher
#
# The container starts as root, fixes ownership of the bind-mounted data/
# and logs/ directories (whatever uid they have on the host), then drops
# to the built-in `node` user before running the app. No manual `chown`
# on the host is required.

ARG NODE_VERSION=22
ARG PNPM_VERSION=10.34.3

# ---------- base: Node + pinned pnpm ----------
FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
WORKDIR /app

# ---------- deps: full install (devDependencies are needed for tsc) ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- prod-deps: runtime dependencies only ----------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ---------- builder: compile TypeScript ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
RUN pnpm build

# ---------- runner: minimal production image ----------
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# su-exec drops root -> node after the entrypoint fixes volume ownership
RUN apk add --no-cache su-exec

RUN mkdir -p /app/data /app/logs && chown -R node:node /app

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder   --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
# Static web UI; the server resolves it at runtime as dist/web/../../public
COPY --chown=node:node public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Container starts as root so the entrypoint can chown bind-mounted
# volumes; it execs into the unprivileged `node` user before CMD runs.

# Web interface port (override with WEB_PORT)
EXPOSE 3000

# Healthy when the web UI responds, or immediately when the web UI is disabled (WEB_ENABLED=false)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD test "$WEB_ENABLED" = "false" || wget -q --spider "http://127.0.0.1:${WEB_PORT:-3000}/api/status"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
