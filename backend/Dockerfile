# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
# wget: Compose healthchecks; libc6-compat: native modules on Alpine
RUN apk add --no-cache libc6-compat wget

# ── Dependencies (cached layer) ──────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY .npmrc ./
# `npm install` (not `npm ci`): lockfile is macOS-generated and `npm ci` fails
# on Linux over platform-gated optional deps. install honors locked versions.
# Cache + retries: Docker Desktop often times out talking to registry.npmjs.org.
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-audit --no-fund

# ── Development (hot-reload) ───────────────────────────────────────────────
FROM deps AS development
COPY . .
RUN npx prisma generate
COPY docker/entrypoints/development.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# ── Migrations (one-shot init job, runs on every deploy) ─────────────────────
FROM deps AS migrate
COPY . .
RUN npx prisma generate
COPY docker/entrypoints/migrate.sh /usr/local/bin/migrate.sh
RUN chmod +x /usr/local/bin/migrate.sh
ENTRYPOINT ["/usr/local/bin/migrate.sh"]

# ── Production build ─────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN npx prisma generate
RUN npm run build

FROM deps AS prod-deps
RUN npm prune --omit=dev

FROM base AS production
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY docker/entrypoints/production.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
