#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# First-time provision of Water Quality (WQMS) on a 2G Nayatel VM.
# Run on the VM as the sudo user (prmsc101), after `.env` is in $HOME or
# already present in the app directory.
#
# Usage:  bash ~/bootstrap-new-vm.sh
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="${HOME}/wqms"
REPO_URL="https://github.com/adminprmsc/prmsc-ens-wqms.git"
COMPOSE="docker compose -f docker-compose.prod.yml"

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[[ "$(id -u)" -ne 0 ]] || die "Run as prmsc101, not root."
command -v sudo >/dev/null || die "sudo is required."

log "Installing system packages..."
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git make ufw gnupg

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine + Compose v2..."
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"

log "Ensuring 4G swap (this VM has 2G RAM)..."
if ! sudo swapon --show | grep -q '/swapfile'; then
  sudo swapoff /swapfile 2>/dev/null || true
  sudo rm -f /swapfile
  sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
free -h

log "Firewall: SSH + HTTP/HTTPS only..."
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status

if [[ -f "$APP_DIR/docker-compose.prod.yml" ]]; then
  log "App directory already present — skipping clone."
elif [[ ! -d "$APP_DIR/.git" ]]; then
  log "Cloning application repo..."
  git clone "$REPO_URL" "$APP_DIR"
else
  log "Repo already present — pulling latest..."
  git -C "$APP_DIR" pull --ff-only || true
fi

if [[ -f "${HOME}/.env" ]]; then
  cp "${HOME}/.env" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  log "Installed .env"
elif [[ -f "$APP_DIR/.env" ]]; then
  log ".env already in $APP_DIR"
else
  die "Missing ~/.env — copy it from your Mac first (scp .env prmsc101@<VM>:~/.env)."
fi

log "Building images one at a time (2G RAM)..."
cd "$APP_DIR"
export COMPOSE_PARALLEL_LIMIT=1
sg docker -c "$COMPOSE pull postgres"
sg docker -c "$COMPOSE build migrate"
sg docker -c "$COMPOSE build api"
sg docker -c "$COMPOSE build web"

log "Starting the stack (migrate gate runs first)..."
sg docker -c "$COMPOSE up -d"

log "Health check..."
sleep 8
curl -fsS http://localhost/healthz && echo " <- edge ok"
curl -fsS http://localhost/api/health && echo " <- api ok"
sg docker -c "$COMPOSE ps"

log "Done. App should be at http://$(curl -fsS ifconfig.me 2>/dev/null || echo '<VM_IP>')/"
