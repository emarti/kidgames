# Deploy to Lightsail (single VM + reverse proxy)

This repo is set up to serve multiple games under a single domain:

- `/games/` (landing page)
- `/games/snake/` (Snake client)
- `/games/snake/ws` (Snake WebSocket server)

## What is infra/caddy?

`infra/caddy/` contains the Caddy configuration that acts as the single front door for your VM:

- Serves static files for `/games/` (the landing page and built game clients)
- Reverse-proxies WebSocket upgrades for `/games/<game>/ws` to the right backend container

In this setup, Caddy is the "gateway" container. It terminates TLS (HTTPS) and routes requests by path so you can host many games under one hostname without exposing many ports.

## Directory map (deploy-relevant)

- `docker-compose.yml`: runs the gateway + game servers
- `Dockerfile`: single multi-target build (gateway image + snake backend image)
- `infra/caddy/Caddyfile`: gateway routing rules (static + WS proxy)
- `infra/site/games/`: static landing page content served at `/games/`
- `snake/client`: Vite client (built into the gateway image)
- `snake/server`: Snake WebSocket backend (runs as its own container)

## Prereqs

- A Lightsail VM with ports **80** and **443** open
- Docker + Docker Compose v2 installed on the VM
- DNS A record pointing your hostname (e.g. `edmarti.com`) to the VM public IP

## Run

From the repo root:

```bash
export DOMAIN=edmarti.com

docker compose up --build -d
```

### Local run (HTTP)

For local testing, you can avoid Caddy's automatic HTTPS (and the related local-CA log messages) by binding explicitly to HTTP:

```bash
export DOMAIN=localhost:80

docker compose up --build
```

Caddy will automatically provision TLS certs via Let’s Encrypt when `DOMAIN` is a real public hostname and ports 80/443 are reachable.

## Logs

```bash
docker compose logs -f --tail=200
```

## Troubleshooting notes

- Seeing Caddy logs about installing a local root certificate, OCSP stapling, HTTP/3 UDP buffer sizes, or `certutil` is not usually fatal; it's Caddy's automatic HTTPS behavior.
- On the VM, you generally want `DOMAIN=edmarti.com` (or whatever real hostname points at the VM) so Caddy can get a real Let's Encrypt cert.

## Add the next game

1. Build its client into `/srv/games/<game>/` inside the gateway image.
2. Run its server as a new compose service.
3. Add a new WebSocket proxy route: `/games/<game>/ws` -> `<game>-server:<port>`.
4. Add a link on `/games/`.
