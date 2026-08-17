# Water Quality (WQMS) — production operations
#
# First time and every later rollout, on the VM:
#   cd ~/wqms && make deploy
#
# That one target: installs Docker/git/swap if needed, creates .env,
# pulls code, builds images (one at a time — 2G RAM), migrates, starts,
# and health-checks.

COMPOSE_FILE := docker-compose.prod.yml
ENV_FILE := .env
BACKUP_DIR := backups
REPO_URL ?= https://github.com/adminprmsc/prmsc-ens-wqms.git
COMPOSE_PARALLEL_LIMIT ?= 1
export COMPOSE_PARALLEL_LIMIT

.DEFAULT_GOAL := help
.PHONY: help provision env-file deploy up down restart build migrate seed \
	logs logs-api logs-web logs-db ps health db-shell db-backup prune

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

provision: ## Install Docker, git, make, 4G swap, and firewall (idempotent)
	@set -e; \
	if ! command -v apt-get >/dev/null 2>&1; then \
	  echo "provision: skipping apt (not Debian/Ubuntu)"; \
	  exit 0; \
	fi; \
	echo "==> Ensuring packages..."; \
	sudo apt-get update -y; \
	sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git make ufw gnupg; \
	if ! command -v docker >/dev/null 2>&1; then \
	  echo "==> Installing Docker..."; \
	  curl -fsSL https://get.docker.com | sudo sh; \
	fi; \
	sudo usermod -aG docker "$$USER" || true; \
	if ! sudo swapon --show | grep -q '/swapfile'; then \
	  echo "==> Creating 4G swap..."; \
	  sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none; \
	  sudo chmod 600 /swapfile; \
	  sudo mkswap /swapfile; \
	  sudo swapon /swapfile; \
	  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null; \
	fi; \
	sudo ufw allow OpenSSH; \
	sudo ufw allow 80/tcp; \
	sudo ufw allow 443/tcp; \
	sudo ufw --force enable >/dev/null; \
	echo "==> Provision done."

env-file: ## Create .env from the example and fill CHANGE_ME secrets
	@set -e; \
	if [ ! -f $(ENV_FILE) ]; then \
	  test -f .env.prod.example || { echo "ERROR: .env.prod.example missing"; exit 1; }; \
	  cp .env.prod.example $(ENV_FILE); \
	  echo "==> Created $(ENV_FILE) from example"; \
	fi; \
	grep -q '^JWT_SECRET=' $(ENV_FILE) || echo 'JWT_SECRET=CHANGE_ME_jwt_secret' >> $(ENV_FILE); \
	grep -q '^JWT_EXPIRES_IN=' $(ENV_FILE) || echo 'JWT_EXPIRES_IN=8h' >> $(ENV_FILE); \
	grep -q '^SYSTEM_ADMIN_EMAIL=' $(ENV_FILE) || echo 'SYSTEM_ADMIN_EMAIL=system.admin@prmsc.gov.pk' >> $(ENV_FILE); \
	grep -q '^SYSTEM_ADMIN_PASSWORD=' $(ENV_FILE) || echo 'SYSTEM_ADMIN_PASSWORD=CHANGE_ME_admin_password' >> $(ENV_FILE); \
	grep -q '^UPLOAD_ROOT=' $(ENV_FILE) || echo 'UPLOAD_ROOT=/app/uploads' >> $(ENV_FILE); \
	if grep -q 'CHANGE_ME' $(ENV_FILE); then \
	  pw=$$(openssl rand -hex 16); \
	  jwt=$$(openssl rand -hex 32); \
	  admin=$$(openssl rand -hex 10); \
	  sed -i.bak \
	    -e "s/CHANGE_ME_strong_password/$$pw/g" \
	    -e "s/CHANGE_ME_jwt_secret/$$jwt/g" \
	    -e "s/CHANGE_ME_admin_password/$$admin/g" \
	    $(ENV_FILE); \
	  rm -f $(ENV_FILE).bak; \
	  chmod 600 $(ENV_FILE); \
	  echo "==> Generated production secrets in $(ENV_FILE)"; \
	  echo "    admin: $$(grep '^SYSTEM_ADMIN_EMAIL=' $(ENV_FILE) | cut -d= -f2)"; \
	  echo "    password: $$admin"; \
	fi

check-env:
	@test -f $(ENV_FILE) || { echo "ERROR: $(ENV_FILE) not found. Run: make deploy"; exit 1; }

deploy: provision ## Clone/pull, write .env, build, migrate, start, health-check
	@set -e; \
	if [ ! -d .git ]; then \
	  echo "==> Cloning $(REPO_URL)..."; \
	  cp -f Makefile /tmp/wqms-Makefile.keep 2>/dev/null || true; \
	  cp -f docker-compose.prod.yml /tmp/wqms-compose.keep 2>/dev/null || true; \
	  rm -rf /tmp/wqms-src; \
	  git clone "$(REPO_URL)" /tmp/wqms-src; \
	  cp -a /tmp/wqms-src/. .; \
	  rm -rf /tmp/wqms-src; \
	  [ -f /tmp/wqms-Makefile.keep ] && cp /tmp/wqms-Makefile.keep Makefile || true; \
	  [ -f /tmp/wqms-compose.keep ] && cp /tmp/wqms-compose.keep docker-compose.prod.yml || true; \
	else \
	  echo "==> Pulling latest..."; \
	  git pull --ff-only || true; \
	fi
	@$(MAKE) --no-print-directory env-file
	@set -e; \
	if docker info >/dev/null 2>&1; then C="docker compose -f $(COMPOSE_FILE)"; \
	else C="sudo docker compose -f $(COMPOSE_FILE)"; fi; \
	export COMPOSE_PARALLEL_LIMIT=$(COMPOSE_PARALLEL_LIMIT); \
	echo "==> Building images (one at a time)..."; \
	$$C pull postgres; \
	$$C build --progress=plain; \
	echo "==> Starting stack..."; \
	$$C up -d; \
	echo "==> Waiting for health..."; \
	sleep 8; \
	$(MAKE) --no-print-directory health; \
	$$C ps; \
	echo; \
	echo "Deploy complete. App: http://$$(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || echo 101.50.84.115)/"; \
	echo "Next time:  cd ~/wqms && make deploy"

up: env-file ## Build and start the full stack (detached)
	@if docker info >/dev/null 2>&1; then C="docker compose -f $(COMPOSE_FILE)"; \
	else C="sudo docker compose -f $(COMPOSE_FILE)"; fi; \
	$$C up -d --build

down: ## Stop and remove containers (named volumes/data preserved)
	@if docker info >/dev/null 2>&1; then C="docker compose -f $(COMPOSE_FILE)"; \
	else C="sudo docker compose -f $(COMPOSE_FILE)"; fi; \
	$$C down

restart: ## Restart all services
	@if docker info >/dev/null 2>&1; then C="docker compose -f $(COMPOSE_FILE)"; \
	else C="sudo docker compose -f $(COMPOSE_FILE)"; fi; \
	$$C restart

build: env-file ## Build images one at a time (2G-safe)
	@if docker info >/dev/null 2>&1; then C="docker compose -f $(COMPOSE_FILE)"; \
	else C="sudo docker compose -f $(COMPOSE_FILE)"; fi; \
	$$C build --progress=plain

migrate: env-file ## Apply pending DB migrations (no API restart)
	@if docker info >/dev/null 2>&1; then C="docker compose -f $(COMPOSE_FILE)"; \
	else C="sudo docker compose -f $(COMPOSE_FILE)"; fi; \
	$$C run --rm migrate

seed: env-file ## Run the idempotent seed manually
	@if docker info >/dev/null 2>&1; then C="docker compose -f $(COMPOSE_FILE)"; \
	else C="sudo docker compose -f $(COMPOSE_FILE)"; fi; \
	$$C run --rm -e RUN_SEED=true migrate

logs: ## Tail logs from all services
	@if docker info >/dev/null 2>&1; then C="docker compose -f $(COMPOSE_FILE)"; \
	else C="sudo docker compose -f $(COMPOSE_FILE)"; fi; \
	$$C logs -f --tail=200

logs-api: ## Tail API logs only
	@if docker info >/dev/null 2>&1; then C="docker compose -f $(COMPOSE_FILE)"; \
	else C="sudo docker compose -f $(COMPOSE_FILE)"; fi; \
	$$C logs -f --tail=200 api

logs-web: ## Tail Nginx / frontend logs only
	@if docker info >/dev/null 2>&1; then C="docker compose -f $(COMPOSE_FILE)"; \
	else C="sudo docker compose -f $(COMPOSE_FILE)"; fi; \
	$$C logs -f --tail=200 web

logs-db: ## Tail Postgres logs only
	@if docker info >/dev/null 2>&1; then C="docker compose -f $(COMPOSE_FILE)"; \
	else C="sudo docker compose -f $(COMPOSE_FILE)"; fi; \
	$$C logs -f --tail=200 postgres

ps: ## Show running services
	@if docker info >/dev/null 2>&1; then C="docker compose -f $(COMPOSE_FILE)"; \
	else C="sudo docker compose -f $(COMPOSE_FILE)"; fi; \
	$$C ps

health: ## Hit the edge + API health endpoints
	@curl -fsS http://localhost:$${WEB_HTTP_PORT:-80}/healthz && echo " <- edge ok"
	@curl -fsS http://localhost:$${WEB_HTTP_PORT:-80}/api/health && echo " <- api ok"

db-shell: env-file ## Open a psql shell inside the postgres container
	@if docker info >/dev/null 2>&1; then C="docker compose -f $(COMPOSE_FILE)"; \
	else C="sudo docker compose -f $(COMPOSE_FILE)"; fi; \
	$$C exec postgres sh -c 'psql -U $$POSTGRES_USER -d $$POSTGRES_DB'

db-backup: env-file ## Dump Postgres into ./backups/ (run on the VM)
	@mkdir -p $(BACKUP_DIR)
	@stamp=$$(date +%Y%m%d-%H%M%S); \
	out="$(BACKUP_DIR)/wqms-$$stamp.sql.gz"; \
	echo "==> Dumping database to $$out"; \
	if docker info >/dev/null 2>&1; then C="docker compose -f $(COMPOSE_FILE)"; \
	else C="sudo docker compose -f $(COMPOSE_FILE)"; fi; \
	$$C exec -T postgres true >/dev/null \
	  || { echo "ERROR: postgres container is not running (make ps)"; exit 1; }; \
	$$C exec -T -i postgres \
	  sh -c 'pg_dump -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" --no-owner --no-acl' \
	  < /dev/null \
	  | gzip -c > "$$out"; \
	bytes=$$(wc -c < "$$out" | tr -d ' '); \
	if [ "$$bytes" -lt 100 ]; then \
	  rm -f "$$out"; \
	  echo "ERROR: dump was empty ($$bytes bytes)"; \
	  exit 1; \
	fi; \
	echo "==> Backup written: $$out ($$bytes bytes)"; \
	echo "CREATED:$$out"

prune: ## Remove dangling images to reclaim disk
	@if docker info >/dev/null 2>&1; then docker image prune -f; else sudo docker image prune -f; fi
