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

WORKDIR /app

COPY snake/client/package.json ./
RUN npm install --no-audit --no-fund

COPY snake/client/ ./

# Host snake under /games/snake/
ENV VITE_BASE=/games/snake/
RUN npm run build


########################
# Maze client build
########################
FROM node:20-slim AS maze-client-build

WORKDIR /app

COPY maze/client/package.json ./
RUN npm install --no-audit --no-fund

COPY maze/client/ ./

# Host maze under /games/maze/
ENV VITE_BASE=/games/maze/
RUN npm run build


########################
# Gateway (Caddy) image
########################
FROM caddy:2-alpine AS gateway

WORKDIR /srv

# Landing page and other static assets
COPY infra/site/ /srv/

# Snake client build output lives at /games/snake/
RUN mkdir -p /srv/games/snake
COPY --from=snake-client-build /app/dist/ /srv/games/snake/

# Maze client build output lives at /games/maze/
RUN mkdir -p /srv/games/maze
COPY --from=maze-client-build /app/dist/ /srv/games/maze/

# Caddy config
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
