#!/usr/bin/env bash
# Run ON the VM as prmsc101 after code + DB are in ~/wqms-flask
set -euo pipefail

APP_DIR="${HOME}/wqms-flask"
cd "$APP_DIR"

echo "==> System packages (OCR + PDF for lab import)"
sudo apt-get update -qq
sudo apt-get install -y python3 python3-venv python3-pip \
  tesseract-ocr poppler-utils nginx

echo "==> Python venv"
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt gunicorn

mkdir -p instance uploads/sample_images static

if [[ ! -f instance/water_quality.db ]]; then
  echo "ERROR: instance/water_quality.db missing — upload DB before setup." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp deploy/.env.production.example .env
  echo "WARNING: edit ${APP_DIR}/.env and set SECRET_KEY"
fi

echo "==> Smoke test import"
python3 -c "from app import app; print('app ok')"

echo "==> systemd (requires sudo password)"
sudo cp deploy/wqms-prmsc101.service /etc/systemd/system/wqms-flask.service
sudo systemctl daemon-reload
sudo systemctl enable wqms-flask
sudo systemctl restart wqms-flask
sudo systemctl status wqms-flask --no-pager || true

echo "==> Local curl"
curl -fsS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:5000/login || true

echo "Done. Configure public access: see deploy/HOST.md (Nginx section)."
