#!/usr/bin/env bash
# Run from your Mac — syncs WQMS + instance/water_quality.db (SQLite) to the VM.
# Uses password SSH (you will be prompted).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="prmsc101@101.50.84.115"
REMOTE_DIR="wqms-flask"

# One SSH login for rsync + scp + checks (single password prompt)
CTRL_DIR="${TMPDIR:-/tmp}/wqms-ssh-$$"
mkdir -p "$CTRL_DIR"
chmod 700 "$CTRL_DIR"
SOCKET="${CTRL_DIR}/cm"
cleanup() {
  ssh -S "$SOCKET" -O exit "$HOST" 2>/dev/null || true
  rm -rf "$CTRL_DIR"
}
trap cleanup EXIT

SSH_COMMON=(
  -o PreferredAuthentications=password
  -o PubkeyAuthentication=no
  -o ControlMaster=auto
  -o "ControlPath=${SOCKET}"
  -o ControlPersist=300
)
SSH_BASE=(ssh "${SSH_COMMON[@]}")
RSYNC_SSH="ssh ${SSH_COMMON[*]}"
SCP_BASE=(scp "${SSH_COMMON[@]}")

DB="${ROOT}/instance/water_quality.db"
if [[ ! -f "$DB" ]]; then
  echo "Missing ${DB}" >&2
  exit 1
fi

echo "==> SSH (one password for this whole script)"
"${SSH_BASE[@]}" "$HOST" "true"

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
"${SCP_BASE[@]}" "$DB" "${HOST}:${REMOTE_DIR}/instance/water_quality.db"

echo "==> Remote DB sanity check"
"${SSH_BASE[@]}" "$HOST" "python3 - <<'PY'
import sqlite3
p = '${REMOTE_DIR}/instance/water_quality.db'
con = sqlite3.connect(p)
n = con.execute('SELECT count(*) FROM test_report_metadata').fetchone()[0]
print('reports', n)
PY"

echo ""
echo "Upload complete. SSH to the VM and run:"
echo "  cd ~/${REMOTE_DIR} && bash deploy/server-setup.sh"
