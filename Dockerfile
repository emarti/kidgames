# Single Dockerfile for the /games stack.
# Use build targets to produce separate images. The gateway is the public
# entrypoint; each game can have its own backend target.
#
# Current targets:
# - target: snake-backend
# - target: maze-backend
# - target: gateway

########################
# Snake backend (one of potentially many game backends)
########################
FROM node:20-slim AS snake-backend

WORKDIR /app

COPY snake/server/package.json ./
RUN npm install

COPY snake/server/ ./

EXPOSE 8080
CMD ["npm", "start"]


########################
# Maze backend
########################
FROM node:20-slim AS maze-backend

WORKDIR /app

COPY maze/server/package.json ./
RUN npm install

COPY maze/server/ ./

EXPOSE 8080
CMD ["npm", "start"]


########################
# Snake client build
########################
FROM node:20-slim AS snake-client-build

WORKDIR /app

COPY snake/client/package.json ./
RUN npm install

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
RUN npm install

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
