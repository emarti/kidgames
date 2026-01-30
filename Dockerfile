# Single Dockerfile for the /games stack.
#
# Targets:
# - games-backend: unified WebSocket backend for all games
# - gateway: Caddy serving /games/* and reverse-proxying /games/*/ws

########################
# Unified WebSocket backend (all games)
########################
FROM node:20-slim AS games-backend

WORKDIR /app

COPY apps/ws/package.json ./
RUN npm install --no-audit --no-fund

COPY apps/ws/ ./

EXPOSE 8080
CMD ["npm", "start"]


########################
# Snake client build
########################
FROM node:20-slim AS snake-client-build

WORKDIR /repo

# Shared local package dependency used by both clients
COPY packages/touch-controls/ ./packages/touch-controls/

# Install deps (cache-friendly)
COPY snake/client/package*.json ./snake/client/
RUN cd snake/client && npm install --no-audit --no-fund

# App source
COPY snake/client/ ./snake/client/

# Host snake under /games/snake/
ENV VITE_BASE=/games/snake/
RUN cd snake/client && npm run build


########################
# Maze client build
########################
FROM node:20-slim AS maze-client-build

WORKDIR /repo

# Shared local package dependency used by both clients
COPY packages/touch-controls/ ./packages/touch-controls/

# Install deps (cache-friendly)
COPY maze/client/package*.json ./maze/client/
RUN cd maze/client && npm install --no-audit --no-fund

# App source
COPY maze/client/ ./maze/client/

# Host maze under /games/maze/
ENV VITE_BASE=/games/maze/
RUN cd maze/client && npm run build


########################
# Comet client build
########################
FROM node:20-slim AS comet-client-build

WORKDIR /repo

# Shared local package dependency used by clients
COPY packages/touch-controls/ ./packages/touch-controls/

# Install deps (cache-friendly)
COPY comet/client/package*.json ./comet/client/
RUN cd comet/client && npm install --no-audit --no-fund

# App source
COPY comet/client/ ./comet/client/

# Host comet under /games/comet/
ENV VITE_BASE=/games/comet/
RUN cd comet/client && npm run build


########################
# Archimedes client build
########################
FROM node:20-slim AS archimedes-client-build

WORKDIR /repo

# Shared local package dependency used by clients
COPY packages/touch-controls/ ./packages/touch-controls/

# Install deps (cache-friendly)
COPY archimedes/client/package*.json ./archimedes/client/
RUN cd archimedes/client && npm install --no-audit --no-fund

# App source
COPY archimedes/client/ ./archimedes/client/

# Host archimedes under /games/archimedes/
ENV VITE_BASE=/games/archimedes/
RUN cd archimedes/client && npm run build


########################
# Gateway (Caddy) image
########################
FROM caddy:2-alpine AS gateway

WORKDIR /srv

# Landing page and other static assets
COPY infra/site/ /srv/

# Snake client build output lives at /games/snake/
RUN mkdir -p /srv/games/snake
COPY --from=snake-client-build /repo/snake/client/dist/ /srv/games/snake/

# Maze client build output lives at /games/maze/
RUN mkdir -p /srv/games/maze
COPY --from=maze-client-build /repo/maze/client/dist/ /srv/games/maze/

# Comet client build output lives at /games/comet/
RUN mkdir -p /srv/games/comet
COPY --from=comet-client-build /repo/comet/client/dist/ /srv/games/comet/

# Archimedes client build output lives at /games/archimedes/
RUN mkdir -p /srv/games/archimedes
COPY --from=archimedes-client-build /repo/archimedes/client/dist/ /srv/games/archimedes/

# Caddy config
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
