#!/bin/sh
set -e

cd /app

# The named node_modules volume can lag behind package.json after new deps.
# Reconcile on every container start.
echo "Installing/updating dependencies..."
npm install --no-audit --no-fund --prefer-offline

echo "Generating Prisma client..."
npx prisma generate

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Seeding baseline data (idempotent)..."
npm run db:seed

echo "Starting NestJS in watch mode..."
exec npm run start:dev
