#!/bin/sh
set -e

echo "Starting application..."
if [ -f dist/main.js ]; then
  exec node dist/main.js
fi
if [ -f dist/src/main.js ]; then
  exec node dist/src/main.js
fi

echo "ERROR: compiled entrypoint not found (looked for dist/main.js and dist/src/main.js)" >&2
ls -la dist dist/src 2>/dev/null || true
exit 1
