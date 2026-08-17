#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Zero-touch production deploy for Water Quality (WQMS).
#
# Pulls the latest code, rebuilds images, runs DB migrations (the `migrate`
# service is a hard gate the API waits on), then restarts the stack with the
# new images. Safe to run repeatedly and from CI or a git post-receive hook.
#
# Usage:   ./deploy/deploy.sh [git-ref]
#   git-ref  optional branch/tag/commit to deploy (default: current branch)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Resolve repo root (this script lives in <root>/deploy).
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE="docker compose -f docker-compose.prod.yml"
GIT_REF="${1:-}"

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# 1. Preconditions ────────────────────────────────────────────────────────────
[ -f .env ] || die ".env not found. Run: cp .env.prod.example .env && edit it."
command -v docker >/dev/null 2>&1 || die "docker is not installed."
docker compose version >/dev/null 2>&1 || die "docker compose v2 is required."

# 2. Sync code ─────────────────────────────────────────────────────────────────
log "Fetching latest code..."
git fetch --all --prune
if [ -n "$GIT_REF" ]; then
  log "Checking out ${GIT_REF}..."
  git checkout "$GIT_REF"
  git pull --ff-only origin "$GIT_REF" || true
else
  log "Fast-forwarding current branch..."
  git pull --ff-only
fi

# 3. Build images ──────────────────────────────────────────────────────────────
log "Building images..."
$COMPOSE build

# 4. Run migrations (one-shot, must succeed before API starts) ─────────────────
log "Applying database migrations..."
$COMPOSE run --rm migrate

# 5. Roll out ──────────────────────────────────────────────────────────────────
log "Starting / updating services..."
$COMPOSE up -d

# 6. Verify ─────────────────────────────────────────────────────────────────────
log "Waiting for services to become healthy..."
sleep 5
$COMPOSE ps

PORT="$(grep -E '^WEB_HTTP_PORT=' .env | cut -d= -f2 || true)"
PORT="${PORT:-80}"
if curl -fsS "http://localhost:${PORT}/healthz" >/dev/null; then
  log "Edge is healthy on port ${PORT}."
else
  die "Edge health check failed — inspect: $COMPOSE logs web"
fi

log "Deploy finished successfully."
