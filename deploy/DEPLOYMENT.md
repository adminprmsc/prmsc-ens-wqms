# Water Quality (WQMS) — Production Deployment SOP

Standard Operating Procedure for deploying and operating the **Water Quality
Management System (WQMS)** on a single VM, fully containerized with Docker.

---

## 1. Architecture

All four components run as containers on one VM, orchestrated by
`docker-compose.prod.yml`. The browser only ever talks to **one origin**
(the Nginx edge), so there is **no CORS** in production.

```
                       VM (single instance)

   Internet  ──:80/443──▶  ┌─────────────────────────────────┐
                           │  web  (Nginx edge)              │
                           │   • serves React SPA (static)   │
                           │   • proxies /api/* ─────────────┼──▶  api (NestJS :3000)
                           └─────────────────────────────────┘            │
                                                                          │
                              migrate (one-shot) ──────────────▶  postgres (:5432)
                                  prisma migrate deploy          (private volume)
                                  + idempotent seed
```

| Service    | Image base            | Exposed?            | Purpose                                            |
| ---------- | --------------------- | ------------------- | -------------------------------------------------- |
| `postgres` | `postgres:16-alpine`  | No (internal only)  | Database. Data persisted in `wqms_postgres_data`.  |
| `migrate`  | backend `migrate`     | No (one-shot job)   | Runs all pending migrations + seed, then exits.    |
| `api`      | backend `production`  | No (`expose: 3000`) | NestJS API, reachable only through the edge.       |
| `web`      | frontend `production` | **Yes** (`:80`)     | Nginx serving the SPA + reverse-proxying `/api`.   |

**Startup order is enforced:** `postgres` (healthy) → `migrate` (completes
successfully) → `api` (healthy) → `web`. The API never boots against an
un-migrated schema.

### Files

```
.
├── docker-compose.prod.yml        # production orchestration
├── .env.prod.example              # copy to .env and fill secrets
├── Makefile                       # operator shortcuts (make help)
├── deploy/
│   ├── deploy.sh                  # one-command deploy (CI / cron / hook)
│   └── DEPLOYMENT.md              # this document
├── backend/
│   ├── Dockerfile                 # multi-stage: deps/dev/migrate/builder/production
│   └── docker/
│       ├── entrypoints/
│       │   ├── migrate.sh         # migrate deploy (+ gated seed)
│       │   └── production.sh      # node dist/main.js
│       └── postgres/init/         # one-time DB grants
└── frontend/webapp/
    ├── Dockerfile                 # Vite build → Nginx
    └── docker/nginx/default.conf  # SPA + /api reverse proxy
```

---

## 2. VM Provisioning (one-time)

Tested on Ubuntu 22.04 LTS. Run as a sudo-capable user.

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl git make ufw

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"          # log out / back in to take effect
docker compose version

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

> The database port (5432) is intentionally **never** opened. Postgres is only
> reachable on the internal Docker network.

---

## 3. First Deploy

```bash
git clone <REPO_URL> wqms && cd wqms

cp .env.prod.example .env
#   - set a strong POSTGRES_PASSWORD
#   - set WEB_HTTP_PORT (default 80)

make up
# or: ./deploy/deploy.sh

make health
```

---

## 4. Ongoing Deploy

```bash
make deploy
# or: ./deploy/deploy.sh
```

---

## 5. Ops Cheatsheet

Run these from the app directory on the VM (`~/wqms`). `make help` lists every target.

| Task                 | Command                                      |
| -------------------- | -------------------------------------------- |
| First start          | `make up`                                    |
| Ongoing deploy       | `make deploy`                                |
| Status               | `make ps`                                    |
| Health check         | `make health`                                |
| Logs                 | `make logs` / `make logs-api` / `make logs-web` |
| Migrate only         | `make migrate`                               |
| Re-seed              | `make seed`                                  |
| DB shell             | `make db-shell`                              |
| DB backup            | `make db-backup`                             |
| Stop (keep data)     | `make down`                                  |
| Reclaim disk         | `make prune`                                 |

### SSH tunnel to Postgres (admin)

```bash
ssh -L 5432:localhost:5432 user@vm
# Then temporarily publish postgres on 127.0.0.1:5432 in compose, or
# exec into the container: make db-shell
```
