# Production domain — WQMS

| | |
|---|---|
| **Production URL** | https://wqms.essprmsc.com |
| **VM IP** | `101.50.84.115` |
| **Platform ops** | [essprmsc-platform](https://github.com/YOUR_ORG/essprmsc-platform) |

DNS, TLS, and rollout checklists live in the **platform repo**, not here.

## Start here

→ **[Master checklist](https://github.com/YOUR_ORG/essprmsc-platform/blob/main/runbooks/MASTER-CHECKLIST.md)**

WQMS-specific HTTPS steps:

→ **[04-https-wqms.md](https://github.com/YOUR_ORG/essprmsc-platform/blob/main/runbooks/04-https-wqms.md)**

## App-specific config (production)

Host Nginx terminates TLS; Docker edge binds to localhost:

```env
# .env
WEB_HTTP_PORT=127.0.0.1:8080
```

Install site config from this repo:

```bash
sudo cp deploy/host-nginx/wqms.essprmsc.com.conf /etc/nginx/sites-available/
```

No `CORS_ORIGINS` change needed — API is same-origin at `/api`.

Replace `YOUR_ORG` with your GitHub organization after pushing `essprmsc-platform`.
