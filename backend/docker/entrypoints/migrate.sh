#!/bin/sh
# One-shot migration job.
# Runs on every deploy: applies all pending Prisma migrations (including the
# very first one on a fresh database), then optionally runs the idempotent seed.
set -e

cd /app

echo "==> Applying database migrations (prisma migrate deploy)..."
npx prisma migrate deploy

if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "==> Seeding baseline data (idempotent)..."
  npm run db:seed
else
  echo "==> RUN_SEED=${RUN_SEED}; skipping seed step."
fi

echo "==> Migration job finished successfully."
