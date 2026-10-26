#!/usr/bin/env bash
# Run from your Mac — syncs WQMS + instance/water_quality.db (SQLite) to the VM.
# Uses password SSH (you will be prompted).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="prmsc101@101.50.84.115"
SSH_BASE=(ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no)
RSYNC_SSH="ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no"
REMOTE_DIR="wqms-flask"

DB="${ROOT}/instance/water_quality.db"
if [[ ! -f "$DB" ]]; then
  echo "Missing ${DB}" >&2
  exit 1
fi

echo "==> Rsync application (excludes venv, git, local secrets)"
rsync -avz --progress \
  -e "$RSYNC_SSH" \
  --exclude venv \
  --exclude .git \
  --exclude __pycache__ \
  --exclude .env \
  --exclude '*.pyc' \
  --exclude instance/water_quality.db \
  "${ROOT}/" "${HOST}:${REMOTE_DIR}/"

echo "==> Upload SQLite database"
"${SSH_BASE[@]}" "$HOST" "mkdir -p ${REMOTE_DIR}/instance"
scp -o PreferredAuthentications=password -o PubkeyAuthentication=no \
  "$DB" "${HOST}:${REMOTE_DIR}/instance/water_quality.db"

echo "==> Remote DB sanity check"
"${SSH_BASE[@]}" "$HOST" "sqlite3 ${REMOTE_DIR}/instance/water_quality.db 'SELECT count(*) AS reports FROM test_report_metadata;'"

echo ""
echo "Upload complete. SSH to the VM and run:"
echo "  cd ~/${REMOTE_DIR} && bash deploy/server-setup.sh"
