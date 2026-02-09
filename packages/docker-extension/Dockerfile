# Backend
FROM node:22-alpine AS backend-builder
WORKDIR /backend
COPY ./backend/package.json .
COPY ./backend/package-lock.json .
RUN npm install
COPY ./backend/. .

RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm set cache /usr/src/app/.npm && \
    npm run build

# UI
FROM --platform=$BUILDPLATFORM node:22-alpine AS client-builder
WORKDIR /ui
COPY ./ui/package.json .
COPY ./ui/package-lock.json .
RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm set cache /usr/src/app/.npm && \
    npm ci
COPY ./ui . 
RUN npm run build


# Final stage
FROM node:22-alpine

LABEL org.opencontainers.image.title="Outray" \
    org.opencontainers.image.description="Expose your containers to the internet" \
    org.opencontainers.image.vendor="Outray" \
    com.docker.desktop.extension.api.version="0.4.2" \
    com.docker.extension.screenshots="" \
    com.docker.desktop.extension.icon="logo.svg" \
    com.docker.extension.detailed-description="" \
    com.docker.extension.publisher-url="https://outray.dev" \
    com.docker.extension.additional-urls="https://github.com/outray-tunnel" \
    com.docker.extension.categories="Networking" \
    com.docker.extension.changelog=""

COPY --from=backend-builder /backend/dist /backend/dist
COPY --from=backend-builder /backend/node_modules /backend/node_modules
COPY ./docker-compose.yaml .
COPY ./metadata.json .
COPY ./logo.svg .
COPY --from=client-builder /ui/build ui

CMD ["node", "/backend/dist/main.js", "-socket", "/run/guest-services/backend.sock"]


