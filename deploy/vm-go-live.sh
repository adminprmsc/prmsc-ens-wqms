#!/usr/bin/env bash
# Run ON the VM (prmsc101@101.50.84.115) after code + SQLite are in ~/wqms-flask.
# Stops Docker web/API on port 80; keeps wqms-postgres running (data/volume untouched).
set -euo pipefail

APP_DIR="${HOME}/wqms-flask"

echo "==> Stop Docker web stack only (keep Postgres)"
for c in wqms-web wqms-api; do
  if docker ps -a --format '{{.Names}}' | grep -qx "$c"; then
    docker stop "$c" || true
    echo "Stopped $c"
  fi
done

if docker ps --format '{{.Names}}' | grep -qx wqms-postgres; then
  echo "wqms-postgres still running (OK — DB preserved)."
elif docker ps -a --format '{{.Names}}' | grep -qx wqms-postgres; then
  echo "Starting wqms-postgres (was stopped; volume unchanged)..."
  docker start wqms-postgres || true
else
  echo "Note: wqms-postgres container not found (Flask app uses SQLite anyway)."
fi

echo "==> Do NOT run: docker compose down -v  (that would delete Postgres volumes)."

if [[ ! -d "$APP_DIR" ]]; then
  echo "Missing ${APP_DIR}. On the VM:" >&2
  echo "  git clone -b dev https://github.com/adminprmsc/prmsc-ens-wqms.git ${APP_DIR}" >&2
  echo "Then upload instance/water_quality.db from your Mac (deploy/push-from-local.sh)." >&2
  exit 1
fi

cd "$APP_DIR"

if [[ ! -f instance/water_quality.db ]]; then
  echo "ERROR: ${APP_DIR}/instance/water_quality.db missing." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp deploy/.env.production.example .env
  if command -v openssl >/dev/null; then
    KEY="$(openssl rand -hex 32)"
    sed -i "s/change-me-to-long-random-string/${KEY}/" .env
  fi
  chmod 600 .env
  echo "Created .env — add ANTHROPIC_API_KEY if you use AI narratives."
fi

grep -q '^FLASK_ENV=' .env 2>/dev/null || echo 'FLASK_ENV=production' >> .env

echo "==> Install / refresh Python app (Gunicorn on 127.0.0.1:5000)"
bash deploy/server-setup.sh

echo "==> Host Nginx on :80 (freed after wqms-web stopped)"
sudo cp deploy/wqms.essprmsc.com.flask.conf /etc/nginx/sites-available/wqms.essprmsc.com
sudo ln -sf /etc/nginx/sites-available/wqms.essprmsc.com /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

echo "==> Checks"
curl -fsS -o /dev/null -w "Gunicorn /login → HTTP %{http_code}\n" http://127.0.0.1:5000/login
curl -fsS -o /dev/null -w "Nginx /login → HTTP %{http_code}\n" http://127.0.0.1/login || true
sqlite3 instance/water_quality.db "SELECT count(*) AS test_report_metadata_rows FROM test_report_metadata;"

echo ""
echo "Live URL: http://wqms.essprmsc.com/login"
echo "If HTTPS breaks, run: sudo certbot --nginx -d wqms.essprmsc.com"
