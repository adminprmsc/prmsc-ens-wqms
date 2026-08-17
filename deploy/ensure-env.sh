#!/usr/bin/env bash
# Fill missing .env secrets. Never rotate POSTGRES_PASSWORD once the
# database volume exists (that password is baked into Postgres).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/.env"
EXAMPLE="${ROOT}/.env.prod.example"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE" "$ENV_FILE"
  echo "==> Created .env from example"
fi
chmod 600 "$ENV_FILE"

fill_if_blank() {
  local key="$1"
  local value="$2"
  if ! grep -q "^${key}=" "$ENV_FILE"; then
    echo "${key}=${value}" >> "$ENV_FILE"
    echo "==> Set ${key}"
    return
  fi
  local current
  current="$(grep "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2-)"
  case "$current" in
    ""|CHANGE_ME_jwt_secret|CHANGE_ME_admin_password)
      sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
      echo "==> Set ${key}"
      ;;
  esac
}

if docker volume inspect wqms_postgres_data >/dev/null 2>&1; then
  echo "==> Postgres data volume exists — leaving POSTGRES_PASSWORD unchanged"
else
  current="$(grep '^POSTGRES_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  case "$current" in
    ""|CHANGE_ME_strong_password)
      sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" "$ENV_FILE"
      echo "==> Set POSTGRES_PASSWORD"
      ;;
  esac
fi

fill_if_blank JWT_SECRET "$(openssl rand -hex 32)"
fill_if_blank SYSTEM_ADMIN_PASSWORD "$(openssl rand -hex 10)"
grep -q '^SYSTEM_ADMIN_EMAIL=' "$ENV_FILE" || echo 'SYSTEM_ADMIN_EMAIL=system.admin@prmsc.gov.pk' >> "$ENV_FILE"
grep -q '^JWT_EXPIRES_IN=' "$ENV_FILE" || echo 'JWT_EXPIRES_IN=8h' >> "$ENV_FILE"
grep -q '^UPLOAD_ROOT=' "$ENV_FILE" || echo 'UPLOAD_ROOT=/app/uploads' >> "$ENV_FILE"
