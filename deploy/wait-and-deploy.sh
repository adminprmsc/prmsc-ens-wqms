#!/usr/bin/env bash
# Wait for SSH key auth, then clone/rsync and bring the WQMS stack up.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="prmsc101@101.50.84.115"
KEY="${HOME}/.ssh/id_ed25519"
SSH_OPTS=(-i "$KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new)
RSYNC_SSH="ssh -i ${KEY} -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new"

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

log "Waiting for SSH key login to ${HOST}..."
ok=0
for i in $(seq 1 60); do
  if ssh "${SSH_OPTS[@]}" "$HOST" 'echo ssh-ok' >/dev/null 2>&1; then
    log "SSH is ready."
    ok=1
    break
  fi
  sleep 5
done
[[ "$ok" -eq 1 ]] || { echo "ERROR: SSH key login still failing after 5 minutes." >&2; exit 1; }

log "Cloning repo if needed..."
ssh "${SSH_OPTS[@]}" "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
if [[ ! -d "$HOME/wqms/.git" ]]; then
  mkdir -p "$HOME/wqms"
  rm -rf /tmp/wqms-src
  git clone https://github.com/adminprmsc/prmsc-ens-wqms.git /tmp/wqms-src
  cp -a /tmp/wqms-src/. "$HOME/wqms/"
  rm -rf /tmp/wqms-src
else
  git -C "$HOME/wqms" pull --ff-only || true
fi
REMOTE

log "Syncing local tree (Makefile, compose, deploy scripts)..."
rsync -az \
  --exclude node_modules \
  --exclude dist \
  --exclude coverage \
  --exclude .DS_Store \
  --exclude '*.log' \
  --exclude .env \
  -e "$RSYNC_SSH" \
  "$ROOT_DIR/" "$HOST:~/wqms/"

if [[ -f "$ROOT_DIR/.env" ]]; then
  log "Copying production .env..."
  scp "${SSH_OPTS[@]}" "$ROOT_DIR/.env" "$HOST:~/wqms/.env"
  ssh "${SSH_OPTS[@]}" "$HOST" 'chmod 600 ~/wqms/.env'
fi

log "Building and starting the stack (this takes a while on 2G RAM)..."
ssh "${SSH_OPTS[@]}" "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
cd "$HOME/wqms"
export COMPOSE_PARALLEL_LIMIT=1
COMPOSE="docker compose -f docker-compose.prod.yml"
run() { sg docker -c "$*"; }

run "$COMPOSE pull postgres"
run "$COMPOSE build --progress=plain migrate"
run "$COMPOSE build --progress=plain api"
run "$COMPOSE build --progress=plain web"
run "$COMPOSE up -d"

sleep 8
curl -fsS http://localhost/healthz && echo " <- edge ok"
curl -fsS http://localhost/api/health && echo " <- api ok"
run "$COMPOSE ps"
echo
echo "Make targets:"
make help
REMOTE

log "Deploy finished. App: http://101.50.84.115/"
