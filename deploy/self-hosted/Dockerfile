# syntax=docker/dockerfile:1.7

# One immutable artifact contains every service and the committed migrations.
# Build credentials are secret mounts, never Docker ARGs or runtime variables.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY . .
RUN --mount=type=secret,id=hugeicons_license_key,required=true \
    HUGEICONS_LICENSE_KEY="$(cat /run/secrets/hugeicons_license_key)" npm ci

# These are public, build-time browser origins; changing them requires rebuilding.
ARG APP_PUBLIC_URL
ARG STATUS_PUBLIC_URL
ARG SHARE_PUBLIC_URL
ARG EDGE_PUBLIC_URL
ARG INGEST_PUBLIC_URL
ENV NODE_ENV=production \
    OUTRAY_DEPLOYMENT_MODE=self-hosted \
    PUBLIC_OUTRAY_DEPLOYMENT_MODE=self-hosted \
    OUTRAY_ENABLED=false \
    PUBLIC_SITE_URL=${APP_PUBLIC_URL} \
    PUBLIC_DASHBOARD_URL=${APP_PUBLIC_URL} \
    VITE_OUTRAY_STATUS_URL=${STATUS_PUBLIC_URL} \
    OUTRAY_STATUS_URL=${STATUS_PUBLIC_URL} \
    SHARE_PUBLIC_ORIGIN=${SHARE_PUBLIC_URL} \
    VITE_SHARE_PUBLIC_ORIGIN=${SHARE_PUBLIC_URL} \
    VITE_TUNNEL_URL=${EDGE_PUBLIC_URL} \
    VITE_OUTRAY_INGEST_URL=${INGEST_PUBLIC_URL} \
    VITE_PUBLIC_POSTHOG_KEY= \
    PUBLIC_POSTHOG_KEY=
# Harmless loopback placeholders let SSR bundlers import configuration without
# granting the build access to a runtime database, Redis or OAuth credentials.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:1/build?sslmode=disable \
    REDIS_URL=redis://127.0.0.1:1 \
    npm run build -- \
    --filter=outray-web --filter=outray-tunnel --filter=outray-internal-check \
    --filter=outray-ingest --filter=outray-cron --filter=outray-status \
    --filter=outray-secrets-share --filter=outray-uptime-probe \
    --concurrency=1 --env-mode=loose

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0
# Keep workspace links, nested dependencies and migration tooling together.
# No .env file or private registry configuration enters the runtime image.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/apps ./apps
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/shared ./shared
COPY --from=builder --chown=node:node /app/scripts/self-hosted-share-role.mjs ./scripts/self-hosted-share-role.mjs
USER node
CMD ["node", "apps/web/.output/server/index.mjs"]
