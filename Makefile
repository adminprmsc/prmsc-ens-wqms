# Water Quality (WQMS) — production operations
# Thin, documented wrappers around the production Compose stack.
#
# First time:  make up
# Later:       make deploy
# Help:        make help
#
# This VM has 2G RAM — builds run with COMPOSE_PARALLEL_LIMIT=1.

COMPOSE := docker compose -f docker-compose.prod.yml
ENV_FILE := .env
BACKUP_DIR := backups
COMPOSE_PARALLEL_LIMIT ?= 1
export COMPOSE_PARALLEL_LIMIT

.DEFAULT_GOAL := help
.PHONY: help check-env up down restart deploy build migrate seed \
	logs logs-api logs-web logs-db ps health db-shell db-backup prune

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

check-env: ## Fail fast if .env is missing
	@test -f $(ENV_FILE) || { echo "ERROR: $(ENV_FILE) not found. Run: cp .env.prod.example .env"; exit 1; }

up: check-env ## Build and start the full stack (detached)
	$(COMPOSE) up -d --build

down: ## Stop and remove containers (named volumes/data preserved)
	$(COMPOSE) down

restart: ## Restart all services
	$(COMPOSE) restart

build: check-env ## Build images one at a time (2G-safe)
	$(COMPOSE) build --progress=plain

# Standard deploy: refresh code, rebuild images, run migrations (via the
# migrate service gate), then bring everything up. Safe to re-run.
deploy: check-env ## Pull latest git + rebuild + migrate + restart
	git pull --ff-only
	$(COMPOSE) build --progress=plain
	$(COMPOSE) up -d
	@$(MAKE) --no-print-directory health
	@echo "Deploy complete."

migrate: check-env ## Apply pending DB migrations (no API restart)
	$(COMPOSE) run --rm migrate

seed: check-env ## Run the idempotent seed manually
	$(COMPOSE) run --rm -e RUN_SEED=true migrate

logs: ## Tail logs from all services
	$(COMPOSE) logs -f --tail=200

logs-api: ## Tail API logs only
	$(COMPOSE) logs -f --tail=200 api

logs-web: ## Tail Nginx / frontend logs only
	$(COMPOSE) logs -f --tail=200 web

logs-db: ## Tail Postgres logs only
	$(COMPOSE) logs -f --tail=200 postgres

ps: ## Show running services
	$(COMPOSE) ps

health: ## Hit the edge + API health endpoints
	@curl -fsS http://localhost:$${WEB_HTTP_PORT:-80}/healthz && echo " <- edge ok"
	@curl -fsS http://localhost:$${WEB_HTTP_PORT:-80}/api/health && echo " <- api ok"

db-shell: check-env ## Open a psql shell inside the postgres container
	$(COMPOSE) exec postgres sh -c 'psql -U $$POSTGRES_USER -d $$POSTGRES_DB'

db-backup: check-env ## Dump Postgres into ./backups/ (run on the VM)
	@mkdir -p $(BACKUP_DIR)
	@stamp=$$(date +%Y%m%d-%H%M%S); \
	out="$(BACKUP_DIR)/wqms-$$stamp.sql.gz"; \
	echo "==> Dumping database to $$out"; \
	$(COMPOSE) exec -T postgres true >/dev/null \
	  || { echo "ERROR: postgres container is not running (make ps)"; exit 1; }; \
	$(COMPOSE) exec -T -i postgres \
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
	docker image prune -f
