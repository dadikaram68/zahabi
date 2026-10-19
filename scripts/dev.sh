#!/usr/bin/env bash
# =============================================================================
# Zahabi Accounting — Docker helper script (alternative to the Makefile)
# Usage:  ./scripts/dev.sh [up|down|restart|logs|ps|build|migrate|shell|prod]
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="${COMPOSE:-docker compose}"
PROD_COMPOSE="${PROD_COMPOSE:-docker compose -f docker-compose.yml}"

cmd="${1:-up}"
case "$cmd" in
  up)       [ -f .env ] || { cp .env.example .env; echo "Created .env — edit the secrets!"; }
            $COMPOSE up -d --build ;;
  down)     $COMPOSE down ;;
  restart)  $COMPOSE restart ;;
  logs)     $COMPOSE logs -f --tail=200 ;;
  ps)       $COMPOSE ps ;;
  build)    $COMPOSE build ;;
  migrate)  $COMPOSE run --rm migrate ;;
  shell)    $COMPOSE exec backend sh ;;
  redis)    $COMPOSE --profile redis up -d redis ;;
  prod)     [ -f .env ] || { cp .env.example .env; echo "Created .env — edit the secrets!"; }
            $PROD_COMPOSE up -d --build ;;
  prod-down)$PROD_COMPOSE down ;;
  *) echo "Usage: $0 {up|down|restart|logs|ps|build|migrate|shell|redis|prod|prod-down}"; exit 1 ;;
esac
