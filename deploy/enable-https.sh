#!/usr/bin/env bash
# Run ON the VM after Nginx serves the Flask site on :80 for wqms.essprmsc.com
set -euo pipefail

DOMAIN="${1:-wqms.essprmsc.com}"
EMAIL="${CERTBOT_EMAIL:-}"

echo "==> Install Certbot (Let's Encrypt)"
sudo apt-get update -qq
sudo apt-get install -y certbot python3-certbot-nginx

echo "==> Obtain certificate and configure Nginx HTTPS redirect"
CERTBOT_ARGS=(
  --nginx
  -d "$DOMAIN"
  --non-interactive
  --agree-tos
  --redirect
)
if [[ -n "$EMAIL" ]]; then
  CERTBOT_ARGS+=(--email "$EMAIL")
else
  CERTBOT_ARGS+=(--register-unsafely-without-email)
fi

sudo certbot "${CERTBOT_ARGS[@]}"

echo "==> Verify"
curl -fsSI "https://${DOMAIN}/login" | head -5
sudo certbot renew --dry-run

echo "HTTPS enabled for https://${DOMAIN}"
