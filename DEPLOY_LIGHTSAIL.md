# Deploy to AWS Lightsail (no Docker on the server)

This repo can be deployed to a single Lightsail **Instance** (VM) without Docker:

- Caddy runs on the VM and serves static files under `/games/*`
- Caddy reverse-proxies WebSockets by path:
  - `/games/snake/ws` → unified games backend
  - `/games/maze/ws` → unified games backend
- One Node.js backend runs under `systemd`

## Endpoints

- `/games/` (landing page)
- `/games/snake/` (Snake client)
- `/games/snake/ws` (Snake WebSocket)
- `/games/maze/` (Maze client)
- `/games/maze/ws` (Maze WebSocket)

## 0) Create the Lightsail instance + networking

These steps apply whether you use the launch script or do a manual install.

1. In the AWS console, go to **Lightsail** → **Create instance**.
2. Pick a Linux blueprint (Ubuntu LTS recommended) and a plan size.
3. (Optional but recommended) In **Advanced details**, paste the contents of `infra/lightsail/lightsail_boot.sh` into **Launch script**.
4. Create the instance.
5. In Lightsail **Networking**:
  - Create/attach a **Static IP** so the public IP won’t change.
  - Add firewall rules:
    - **TCP 22 (SSH)**: restrict to your IP if possible.
    - **TCP 80 (HTTP)**: open to the world.
    - **TCP 443 (HTTPS)**: open to the world.
  - You do *not* need to expose backend ports publicly; Caddy talks to the backend on localhost.
6. DNS:
  - Create an **A record** for `www.brillanmarti.com` pointing to the instance Static IP.
7. Connect to the VM:
  - Use the Lightsail web SSH button, or
  - `ssh ubuntu@YOUR_DOMAIN` (or `ssh ubuntu@STATIC_IP`) from your machine.

## One-shot Lightsail launch script (recommended)

Lightsail supports a “Launch script” (cloud-init user data) that runs once on first boot.

Use: `infra/lightsail/lightsail_boot.sh`

Before launching, edit the variables at the top of the script:

- `SITE_ADDR`
  - For direct hosting with Caddy TLS: set `SITE_ADDR=www.brillanmarti.com`
- Optional: `PUBLIC_URL` (helpful log output, e.g. `https://www.brillanmarti.com/games/`)
- `REPO_URL` (your git URL)
- Optional: `REPO_BRANCH`, `APP_USER`, `GAMES_PORT`

The launch script cannot set up DNS for you.

Since the repo is public, `git clone` in the launch script should work as-is.

## Manual deployment (if you don’t use the launch script)

### 1) Install packages

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git rsync
```

Install Caddy:

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
sudo systemctl enable --now caddy
```

Install Node.js (example Node 20 via NodeSource):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version
```

### 2) Clone the repo

```bash
cd ~
git clone https://github.com/emarti/kidgames.git games
cd games
```

### 3) Build clients and install server dependencies

```bash
cd ~/games

# Prefer npm ci when package-lock.json exists; otherwise use npm install.
(cd apps/ws && (test -f package-lock.json && npm ci --omit=dev || npm install --omit=dev))

(cd snake/client && (test -f package-lock.json && npm ci || npm install) && VITE_BASE=/games/snake/ npm run build)
(cd maze/client && (test -f package-lock.json && npm ci || npm install) && VITE_BASE=/games/maze/ npm run build)
```

If `npm install` gets killed during client install/build, that’s usually an out-of-memory kill on small instances.
Either use a bigger plan or add swap (the launch script defaults to creating 4GB swap).

If `vite build` fails with `JavaScript heap out of memory`, increase Node’s heap for the build (the launch script supports this):

- Re-run with: `BUILD_MAX_OLD_SPACE_MB=1024 sudo -E bash infra/lightsail/lightsail_boot.sh`
- If still failing, try `1536` or pick a larger Lightsail plan.

### 4) Deploy static files

```bash
sudo mkdir -p /srv/games /srv/games/snake /srv/games/maze
sudo rsync -a --delete ~/games/infra/site/games/ /srv/games/
sudo rsync -a --delete ~/games/snake/client/dist/ /srv/games/snake/
sudo rsync -a --delete ~/games/maze/client/dist/ /srv/games/maze/
sudo chmod -R a+rX /srv
```

### 5) Configure Caddy

```bash
sudo cp ~/games/infra/caddy/Caddyfile /etc/caddy/Caddyfile
```

Configure env vars for the Caddy service:

```bash
sudo mkdir -p /etc/systemd/system/caddy.service.d
sudo tee /etc/systemd/system/caddy.service.d/override.conf >/dev/null <<'EOF'
[Service]
Environment=SITE_ADDR=www.brillanmarti.com
Environment=GAMES_BACKEND=127.0.0.1:8080
Environment=GAMES_ROOT=/srv
EOF

sudo systemctl daemon-reload
sudo systemctl restart caddy
```

### 6) Create systemd service for the unified backend

Unified games backend (default port 8080):

```bash
sudo tee /etc/systemd/system/games-backend.service >/dev/null <<'EOF'
[Unit]
Description=Games WebSocket Server (unified)
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/games/apps/ws
Environment=NODE_ENV=production
ExecStart=/usr/bin/env PORT=8080 /usr/bin/node src/server.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
```

Enable + start services:

```bash
sudo systemctl daemon-reload
sudo systemctl reset-failed games-backend || true
sudo systemctl enable --now games-backend
sudo systemctl restart games-backend
sudo systemctl status games-backend caddy --no-pager

# Quick sanity check: backend should be listening on 8080
sudo ss -ltnp | egrep ':8080\b'
```

## Smoke test (recommended)

Run these on the VM to confirm the backend and Caddy are wired correctly.

Backend health (should print `ok`):

```bash
curl -sS http://127.0.0.1:8080/
```

Caddy is serving `/games/` (expect `200` or a `308` redirect depending on the exact URL):

```bash
curl -I http://127.0.0.1/games/
curl -I http://127.0.0.1/games/snake/
curl -I http://127.0.0.1/games/maze/
```

End-to-end sanity (browser):

- Visit `/games/` → open Snake/Maze.
- Create a room and join it from a second browser.

If you see `Missing hello handshake` in WS logs, it usually means something is connecting to the backend without the initial hello message.

## Verify

```bash
# If accessing the origin VM directly (useful for debugging):
curl -I http://YOUR_LIGHTSAIL_STATIC_IP/games/

# User-facing check:
curl -I https://www.brillanmarti.com/games/
```

## Logs

```bash
sudo journalctl -u caddy -n 200 --no-pager
sudo journalctl -u games-backend -n 200 --no-pager
```

## Updating

```bash
cd ~/games
git pull

# Alternative (recommended): run the restart helper script, which installs deps,
# rebuilds clients, rsyncs to /srv, and restarts services.
sudo -E bash infra/lightsail/lightsail_restart.sh

# Manual steps (equivalent to the restart script):

# Prefer npm ci when package-lock.json exists; otherwise use npm install.
(cd apps/ws && (test -f package-lock.json && npm ci --omit=dev || npm install --omit=dev))

(cd snake/client && (test -f package-lock.json && npm ci || npm install) && VITE_BASE=/games/snake/ npm run build)
(cd maze/client && (test -f package-lock.json && npm ci || npm install) && VITE_BASE=/games/maze/ npm run build)

sudo rsync -a --delete ~/games/infra/site/games/ /srv/games/
sudo rsync -a --delete ~/games/snake/client/dist/ /srv/games/snake/
sudo rsync -a --delete ~/games/maze/client/dist/ /srv/games/maze/

sudo systemctl restart games-backend caddy
```

## Local development (Docker)

Docker remains supported for local development/debugging:

```bash
export SITE_ADDR=localhost:80
docker compose up --build
```

## Troubleshooting

- HTTPS not issuing: DNS not pointing at instance yet, or ports 80/443 not open.
- `502` from Caddy: check `sudo systemctl status games-backend`.
- Caddy can’t read files: confirm `/srv` permissions are readable by Caddy (`chmod -R a+rX /srv`).
- Backend flapping with `EADDRINUSE :::8080`: something already owns 8080. Ensure the unit sets the port, then reload+restart:
  - `sudo systemctl daemon-reload && sudo systemctl restart games-backend`
  - Find what owns 8080: `sudo ss -ltnp | grep ':8080'` (or `sudo lsof -iTCP:8080 -sTCP:LISTEN -n -P`)

## DNS notes

This deployment assumes the Lightsail VM directly serves `www.brillanmarti.com`.

- Point `www.brillanmarti.com` (A/AAAA) to the instance Static IP.
- Keep ports 80/443 open to the internet so Caddy can obtain/renew TLS.

## Appendix: if the repo is private

If you ever switch back to private, avoid putting secrets (PATs/SSH private keys) directly into Lightsail user-data.
Safer options:

- Copy the code to the VM: `rsync -az --delete ./ ubuntu@YOUR_DOMAIN:~/games/`
- Use a read-only deploy key and clone via SSH after first login
