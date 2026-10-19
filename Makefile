# =============================================================================
# Zahabi Accounting — one-command Docker operations
#   make up      dev stack with hot reload   -> http://localhost:3000
#   make prod    production stack (nginx)    -> http://localhost:8080
# =============================================================================
COMPOSE        ?= docker compose
PROD_COMPOSE   ?= docker compose -f docker-compose.yml
APP_PORT       ?= 3000
HTTP_PORT      ?= 8080

.PHONY: help env up down restart logs ps build rebuild prod-up prod-down \
        migrate db-push shell-backend shell-db redis test clean

help:               ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

env:                ## Create .env from .env.example if missing
	@test -f .env || (cp .env.example .env && echo "Created .env — EDIT THE SECRETS BEFORE GOING LIVE!")

up: env             ## Start development stack (hot reload on :3000)
	$(COMPOSE) up -d --build

down:               ## Stop the development stack (keeps DB volume)
	$(COMPOSE) down

restart:            ## Restart the development stack
	$(COMPOSE) restart

logs:               ## Tail all dev logs
	$(COMPOSE) logs -f --tail=200

ps:                 ## Show container status
	$(COMPOSE) ps

build:              ## Build dev images without starting
	$(COMPOSE) build

rebuild:            ## Rebuild images from scratch (no cache)
	$(COMPOSE) build --no-cache

prod-up: env        ## Start PRODUCTION stack (nginx on :8080, backend internal)
	$(PROD_COMPOSE) up -d --build

prod-down:          ## Stop the production stack (keeps DB volume)
	$(PROD_COMPOSE) down

migrate:            ## Run drizzle SQL migrations against the DB container
	$(COMPOSE) run --rm migrate

db-push:            ## Generate + apply schema from drizzle/schema.ts (dev helper)
	$(COMPOSE) run --rm backend pnpm db:push

shell-backend:      ## Open a shell inside the backend container
	$(COMPOSE) exec backend sh

shell-db:           ## Open a mysql shell as the app user
	$(COMPOSE) exec db sh -c 'mysql -u"$$MYSQL_USER" -p"$$MYSQL_PASSWORD" "$$MYSQL_DATABASE"'

redis:              ## Start ONLY the optional Redis service
	$(COMPOSE) --profile redis up -d redis

test:               ## Run the test suite inside the backend container
	$(COMPOSE) run --rm backend pnpm test

clean:              ## Stop stack and DELETE the database volume (DESTRUCTIVE!)
	@echo "!! This deletes the db_data volume and ALL financial data. Ctrl-C to abort."
	@sleep 5
	$(COMPOSE) down -v
