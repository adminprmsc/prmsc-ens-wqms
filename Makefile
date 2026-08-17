# Water Quality (WQMS) — production operations
# Thin, documented wrappers around the production Compose stack.
#
#   make help          list available targets
#   make deploy        pull latest code, rebuild, migrate, restart
#   make up            build + start the stack
#   make down          stop the stack (data preserved)
#   make logs          tail logs from every service
#   make migrate       run pending DB migrations only
#   make ps            show service status

COMPOSE := docker compose -f docker-compose.prod.yml
ENV_FILE := .env

.DEFAULT_GOAL := help
.PHONY: help check-env up down restart deploy build migrate seed logs logs-api ps health db-shell prune

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

check-env: ## Fail fast if .env is missing
	@test -f $(ENV_FILE) || { echo "ERROR: $(ENV_FILE) not found. Run: cp .env.prod.example .env"; exit 1; }

up: check-env ## Build and start the full stack (detached)
	$(COMPOSE) up -d --build

down: ## Stop and remove containers (named volumes/data preserved)
	$(COMPOSE) down

restart: ## Restart all services
	$(COMPOSE) restart

build: check-env ## Build images without starting
	$(COMPOSE) build

# Standard deploy: refresh code, rebuild images, run migrations (via the
# migrate service gate), then bring everything up. Safe to re-run.
deploy: check-env ## Pull latest git + rebuild + migrate + restart
	git pull --ff-only
	$(COMPOSE) build
	$(COMPOSE) up -d
	@echo "Deploy complete. Run 'make health' to verify."

migrate: check-env ## Apply pending DB migrations (no API restart)
	$(COMPOSE) run --rm migrate

seed: check-env ## Run the idempotent seed manually
	$(COMPOSE) run --rm -e RUN_SEED=true migrate

logs: ## Tail logs from all services
	$(COMPOSE) logs -f

logs-api: ## Tail API logs only
	$(COMPOSE) logs -f api

ps: ## Show running services
	$(COMPOSE) ps

health: ## Hit the edge + API health endpoints
	@curl -fsS http://localhost:$${WEB_HTTP_PORT:-80}/healthz && echo " <- edge ok"
	@curl -fsS http://localhost:$${WEB_HTTP_PORT:-80}/api/health && echo " <- api ok"

db-shell: check-env ## Open a psql shell inside the postgres container
	$(COMPOSE) exec postgres sh -c 'psql -U $$POSTGRES_USER -d $$POSTGRES_DB'

prune: ## Remove dangling images to reclaim disk
	docker image prune -f
