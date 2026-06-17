# ARM64-compatible Dockerfile for Telegram Page Watcher Bot
# Build: docker build --platform linux/arm64 -t telegram-page-watcher .
# Run: docker run -d --env-file .env -v $(pwd)/data:/app/data telegram-page-watcher

FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Dependencies stage
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 botuser

# Create data directory for SQLite database
RUN mkdir -p /app/data /app/logs && \
    chown -R botuser:nodejs /app/data /app/logs

# Copy built application
COPY --from=builder --chown=botuser:nodejs /app/dist ./dist
COPY --from=builder --chown=botuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=botuser:nodejs /app/package.json ./
# Static web interface assets (served by the embedded Express server)
COPY --from=builder --chown=botuser:nodejs /app/public ./public

USER botuser

# Web interface port (override with WEB_PORT)
EXPOSE 3000

# Health check - verify the web interface responds
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider "http://localhost:${WEB_PORT:-3000}/api/status" || exit 1

CMD ["node", "dist/index.js"]
