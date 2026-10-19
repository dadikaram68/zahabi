# Docker Deployment Guide — Zahabi Accounting (الذهبي للمحاسبة)

Production-ready Docker/Compose environment for the single-workspace
accounting app: **React + Vite** SPA (`client/`), **Express + tRPC** API
(`server/`), **Drizzle ORM over MySQL** (`drizzle/`).

## Architecture

```
                        HOST
   http://localhost:8080 (prod) / :3000 (dev)
                          |
        +-----------------+------------------+
        |  frontend  (nginx, prod only)      |  serves SPA, proxies /api/*
        +-----------------+------------------+
                          |  internal network  zahabi-net (bridge)
        +-----------------+------------------+
        |  backend  (node, non-root, :5000)  |  Express + tRPC + Drizzle
        |  waits for: db OK + migrate DONE   |
        +-------+------------------+---------+
                |                  |
     +----------+--------+   +-----+---------+
     |  db (mysql:8.4)   |   | redis (opt)  |  profile: redis
     |  volume: db_data  |   | AOF enabled  |
     +-------------------+   +---------------+
```

| Service   | Image            | Port (host)                       | Persistence             |
|-----------|------------------|-----------------------------------|-------------------------|
| frontend  | nginx:1.27-alpine| `HTTP_PORT` (def 8080)            | static build, immutable |
| backend   | node:22-alpine   | internal only (dev: `APP_PORT` 3000) | —                    |
| migrate   | node:22-alpine   | one-shot job                      | applies `drizzle/*.sql` |
| db        | mysql:8.4        | internal (dev: 127.0.0.1:`DB_PORT`) | volume `zahabi_db_data` |
| redis     | redis:7-alpine   | internal                          | volume `zahabi_redis_data` (AOF) |

Services talk via Docker DNS names (`db`, `backend`, `redis`) on the isolated
bridge network `zahabi-net`; nothing but nginx is published in production.

## Quick start

### Development (hot reload)

```bash
cp .env.example .env        # then edit the secrets!
docker compose up -d --build
# UI + API on http://localhost:3000
```

The dev backend target runs `tsx watch` and **embeds Vite middleware**, so the
whole UI hot-reloads from one container. Source is bind-mounted; the Linux
`node_modules` lives in a named volume so it never mixes with your Windows
`node_modules`. After changing `package.json`, rebuild:

```bash
docker compose build backend && docker compose up -d
```

### Production

```bash
docker compose -f docker-compose.yml up -d --build
# UI on http://localhost:${HTTP_PORT:-8080}, API at /api/* behind nginx
```

Boot order is enforced: `db` healthcheck -> `migrate` completes -> `backend`
healthy -> `frontend` starts. All services use `restart: unless-stopped`.

### Makefile / script shortcuts

`make up`, `make down`, `make logs`, `make ps`, `make migrate`, `make prod-up`,
`make shell-db`, `make test`, `make clean` (⚠ destructive) — or
`./scripts/dev.sh up|down|logs|migrate|prod|...`. On Windows without `make`,
use the raw `docker compose` commands or Git Bash for the script.

## Environment variables (`.env`)

`.env.example` documents every variable. The compose files **fail fast** if
`DB_PASSWORD`, `DB_ROOT_PASSWORD` or `JWT_SECRET` are missing, and the app
itself rejects a `JWT_SECRET` shorter than 32 characters.

- `DATABASE_URL` is built automatically from `DB_USER/DB_PASSWORD/DB_NAME` and
  points at the `db` service internally — you never set it by hand in Docker.
- Keep DB passwords URL-safe (letters/digits) since they are embedded in the
  connection string.
- `VITE_*` values are **baked into the SPA at build time** (frontend image
  build args); changing them requires rebuilding the frontend image.

## Data persistence & backups

- MySQL data lives in the named volume `zahabi_db_data` — it survives
  `down`, `up` and image upgrades. Only `docker compose down -v` / `make clean`
  deletes it.
- Backup example:

```bash
docker compose exec db sh -c 'mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  > backup-$(date +%F).sql
```

- Redis uses AOF (`appendonly yes`) in `zahabi_redis_data`; treat it as a
  disposable cache — the app does not write authoritative data there.
- The API also exposes `POST /api/scheduled/inventory-backup` (app-level
  backup to configured storage).

## Networking & security notes

- Isolated bridge network `zahabi-net`; inter-service traffic uses service
  names (`http://backend:5000`, `db:3306`, `redis:6379`).
- In production only nginx is published; MySQL/Redis/Node are unreachable
  from the host. Dev publishes MySQL on `127.0.0.1` only.
- Backend container runs as the unprivileged `node` user; images contain no
  `.env` and no dev junk (see `.dockerignore`).
- ⚠ `.project-config.json` in this repo contains a **live TiDB Cloud
  connection string and git token**. Rotate those credentials and keep the
  file out of Git (it is also excluded from Docker builds via `.dockerignore`).
- For internet-facing deployments put TLS in front (e.g. a `caddy`/`certbot`
  reverse proxy) — the provided nginx listens on plain HTTP.

## Optional Redis

```bash
docker compose --profile redis up -d     # or: make redis
```

`REDIS_URL=redis://redis:6379/0` is already passed to the backend. The current
codebase has no Redis client; wire it in (e.g. `ioredis`) when you want shared
sessions / rate limiting / caching.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `migrate` fails on a pre-existing DB | The DB predates the drizzle journal; run `docker compose run --rm backend pnpm db:push` once, or start from an empty volume. |
| Backend restarts with `JWT_SECRET ... required` | Set a >=32-char `JWT_SECRET` in `.env`. |
| Changed `package.json`, weird runtime errors | `docker compose build --no-cache backend` (pnpm layers are cached). |
| Port 3000/8080 already in use | Change `APP_PORT` / `HTTP_PORT` in `.env`. |
| nginx complains about config / CRLF | Files are authored with LF; if edited in Notepad, re-save as LF (`git add --renormalize .`). |
