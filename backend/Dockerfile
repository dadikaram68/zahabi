# =============================================================================
# BACKEND IMAGE — Express + tRPC + Drizzle (MySQL)
#
# IMPORTANT: the build context is the REPO ROOT (single pnpm workspace shared
# with the frontend), so build it like:
#   docker build -f backend/Dockerfile .
# (docker-compose.yml already does this for you)
#
# Targets:
#   production (default) -> optimized runtime: node dist/index.js (non-root)
#   dev                  -> tsx watch + embedded Vite (hot reload; used by
#                           docker-compose.override.yml)
#   migrate              -> one-shot "drizzle-kit migrate" job
# =============================================================================
ARG NODE_IMAGE=node:22-alpine

# ---- Stage 1: base (pnpm via corepack, version pinned in package.json) ------
FROM ${NODE_IMAGE} AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ---- Stage 2: deps (full install: runtime + build + migration tooling) -----
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store && \
    pnpm install --frozen-lockfile

# ---- Stage 3: build (esbuild bundle of the API server) ----------------------
# Mirrors the server half of package.json "build":
#   esbuild server/_core/index.ts --platform=node --packages=external
#     --bundle --format=esm --outdir=dist
FROM deps AS build
COPY . .
ENV NODE_ENV=production
RUN pnpm exec esbuild server/_core/index.ts \
      --platform=node --packages=external --bundle \
      --format=esm --outdir=dist

# ---- Stage 4: prod-deps (runtime dependencies only) -------------------------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store && \
    pnpm install --frozen-lockfile --prod

# ---- Stage 5: production (default target) -----------------------------------
FROM ${NODE_IMAGE} AS production
ENV NODE_ENV=production \
    PORT=5000
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
# serveStatic() expects ./dist/public when NODE_ENV=production. The SPA is
# served by the separate nginx frontend service, so an empty directory only
# silences the startup warning; API routes are registered before static.
RUN mkdir -p /app/dist/public /app/storage && chown -R node:node /app
USER node
EXPOSE 5000
# auth.me is a public tRPC query -> safe liveness/readiness probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD wget -q --spider http://127.0.0.1:5000/api/trpc/auth.me || exit 1
CMD ["node", "dist/index.js"]

# ---- Stage 6: dev (hot-reload API + embedded Vite middleware) ----------------
# Source code is bind-mounted by docker-compose.override.yml; node_modules is
# masked with a volume so the Linux container deps never mix with the host's.
FROM deps AS dev
ENV NODE_ENV=development \
    PORT=3000
EXPOSE 3000
CMD ["pnpm", "dev"]

# ---- Stage 7: migrate (one-shot schema migration job) -----------------------
# drizzle-kit reads drizzle.config.ts + the SQL journal in drizzle/.
FROM deps AS migrate
COPY drizzle.config.ts ./drizzle.config.ts
COPY drizzle ./drizzle
CMD ["pnpm", "exec", "drizzle-kit", "migrate"]
