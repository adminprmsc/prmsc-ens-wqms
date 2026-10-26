#!/usr/bin/env bash
# Run ON the VM after push-from-local.sh (code sync; DB optional separate upload)
set -euo pipefail

APP_DIR="${HOME}/wqms-flask"
cd "$APP_DIR"

chmod o+x "${HOME}" 2>/dev/null || true
chmod -R o+rX "${APP_DIR}/static" "${APP_DIR}/uploads" 2>/dev/null || true

if [[ ! -d venv ]]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt gunicorn -q

export FLASK_ENV=production
python3 -c "from app import app; print('app ok')"

sudo systemctl restart wqms-flask
sleep 2
sudo systemctl is-active wqms-flask

for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null -w "Gunicorn /login HTTP %{http_code}\n" http://127.0.0.1:5000/login; then
    break
  fi
  sleep 2
done

echo "Update complete."
