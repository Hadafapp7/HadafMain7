# syntax=docker/dockerfile:1.7
#
# Hadaf API server (artifacts/api-server) — container image for AWS ECS (Fargate / EC2).
#
# Build from the REPOSITORY ROOT (this is a pnpm monorepo):
#   docker build -t hadaf-api .
#   docker run --rm -p 5000:5000 --env-file artifacts/api-server/.env hadaf-api
#
# ---------------------------------------------------------------------------
# Stage 1 — install + build
# ---------------------------------------------------------------------------
FROM node:22-slim AS build

ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    CI=true

RUN npm install -g pnpm@11.14.0

WORKDIR /app

# Copy the whole workspace (see .dockerignore for what is excluded). The mobile app is part of the
# pnpm workspace, so its manifest must be present for `--frozen-lockfile` to resolve the lockfile.
COPY . .

# Install ONLY what the API server needs (plus workspace libs it depends on).
RUN pnpm install --frozen-lockfile --filter "@workspace/api-server..."

# Bundle the server with esbuild -> artifacts/api-server/dist/index.mjs
RUN pnpm --filter @workspace/api-server run build

# ---------------------------------------------------------------------------
# Stage 2 — runtime
# ---------------------------------------------------------------------------
FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    PORT=5000

WORKDIR /app

# `@aws-sdk/*` (and a few other packages) are marked "external" in build.mjs, so they are resolved
# from node_modules at runtime. Copying the installed workspace keeps pnpm's symlinks intact.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/lib ./lib
COPY --from=build --chown=node:node /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
COPY --from=build --chown=node:node /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build --chown=node:node /app/artifacts/api-server/package.json ./artifacts/api-server/package.json

WORKDIR /app/artifacts/api-server

# Run as the unprivileged "node" user that ships with the official image.
USER node

EXPOSE 5000

# ECS can also use this; the ALB target group should hit GET /api/healthz.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# PID 1 handling: ECS sends SIGTERM on deploys; node handles it directly (no shell wrapper).
CMD ["node", "--enable-source-maps", "dist/index.mjs"]

