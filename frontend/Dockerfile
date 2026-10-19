# =============================================================================
# FRONTEND IMAGE — multi-stage build (build stage -> nginx production stage)
#
# IMPORTANT: the build context is the REPO ROOT (single pnpm workspace shared
# with the backend), so build it like:
#   docker build -f frontend/Dockerfile .
# (docker-compose.yml already does this for you)
# =============================================================================
ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginx:1.27-alpine

# ---- Stage 1: base (pnpm via corepack, version pinned in package.json) ------
FROM ${NODE_IMAGE} AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ---- Stage 2: deps (cached dependency install) ------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store && \
    pnpm install --frozen-lockfile

# ---- Stage 3: build (compile the SPA to /app/dist/public) -------------------
FROM deps AS build
COPY . .
# Vite inlines these at build time (see vite.config.ts -> envDir = repo root)
ARG VITE_APP_ID=""
ARG VITE_APP_TITLE="الذهبي للمحاسبة"
ARG VITE_ANALYTICS_ENDPOINT=""
ARG VITE_ANALYTICS_WEBSITE_ID=""
ENV VITE_APP_ID=${VITE_APP_ID} \
    VITE_APP_TITLE=${VITE_APP_TITLE} \
    VITE_ANALYTICS_ENDPOINT=${VITE_ANALYTICS_ENDPOINT} \
    VITE_ANALYTICS_WEBSITE_ID=${VITE_ANALYTICS_WEBSITE_ID} \
    NODE_ENV=production
RUN pnpm exec vite build

# ---- Stage 4: production (nginx serving static SPA + API reverse proxy) -----
FROM ${NGINX_IMAGE} AS production
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/public /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/healthz || exit 1
