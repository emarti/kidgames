# Deploy to AWS Lightsail (no Docker on the server)

This repo can be deployed to a single Lightsail **Instance** (VM) without Docker:

- Caddy runs on the VM and serves static files under `/games/*`
- Caddy reverse-proxies WebSockets by path:
  - `/games/snake/ws` → unified games backend
  - `/games/maze/ws` → unified games backend
  - `/games/comet/ws` → unified games backend
  - `/games/archimedes/ws` → unified games backend
  - `/games/wallmover/ws` → unified games backend
- One Node.js backend runs under `systemd`

## Endpoints

- `/games/` (landing page)
- `/games/snake/` (Snake client)
- `/games/snake/ws` (Snake WebSocket)
- `/games/maze/` (Maze client)
- `/games/maze/ws` (Maze WebSocket)
- `/games/comet/` (Comet client)
- `/games/comet/ws` (Comet WebSocket)
- `/games/archimedes/` (Archimedes client)
- `/games/archimedes/ws` (Archimedes WebSocket)
- `/games/wallmover/` (Wallmover client)
- `/games/wallmover/ws` (Wallmover WebSocket)

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
  - Create an **A record** for `brillanmarti.com` pointing to the instance Static IP.
  - (Recommended) Also create an **A record** for `www.brillanmarti.com` pointing to the same Static IP so Caddy can redirect `www` → apex.
7. Connect to the VM:
  - Use the Lightsail web SSH button, or
  - `ssh ubuntu@YOUR_DOMAIN` (or `ssh ubuntu@STATIC_IP`) from your machine.

## One-shot Lightsail launch script (recommended)

Lightsail supports a “Launch script” (cloud-init user data) that runs once on first boot.

Use: `infra/lightsail/lightsail_boot.sh`

Before launching, edit the variables at the top of the script:

- `SITE_ADDR`
  - For direct hosting with Caddy TLS: set `SITE_ADDR=brillanmarti.com`
  - If you want both apex + www to work, use a comma-separated list:
    - `SITE_ADDR="brillanmarti.com, www.brillanmarti.com"`
- Optional: `PUBLIC_URL` (helpful log output, e.g. `https://brillanmarti.com/games/`)
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
(cd comet/client && (test -f package-lock.json && npm ci || npm install) && VITE_BASE=/games/comet/ npm run build)
(cd archimedes/client && (test -f package-lock.json && npm ci || npm install) && VITE_BASE=/games/archimedes/ npm run build)
(cd wallmover/client && (test -f package-lock.json && npm ci || npm install) && VITE_BASE=/games/wallmover/ npm run build)
```

If `npm install` gets killed during client install/build, that’s usually an out-of-memory kill on small instances.
Either use a bigger plan or add swap (the launch script defaults to creating 4GB swap).

If `vite build` fails with `JavaScript heap out of memory`, increase Node’s heap for the build (the launch script supports this):

- Re-run with: `BUILD_MAX_OLD_SPACE_MB=1024 sudo -E bash infra/lightsail/lightsail_boot.sh`
- If still failing, try `1536` or pick a larger Lightsail plan.

### 4) Deploy static files

```bash
sudo mkdir -p /srv/games /srv/games/snake /srv/games/maze /srv/games/comet /srv/games/archimedes /srv/games/wallmover
sudo rsync -a --delete ~/games/infra/site/games/ /srv/games/
sudo rsync -a --delete ~/games/snake/client/dist/ /srv/games/snake/
sudo rsync -a --delete ~/games/maze/client/dist/ /srv/games/maze/
sudo rsync -a --delete ~/games/comet/client/dist/ /srv/games/comet/
sudo rsync -a --delete ~/games/archimedes/client/dist/ /srv/games/archimedes/
sudo rsync -a --delete ~/games/wallmover/client/dist/ /srv/games/wallmover/
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
Environment="SITE_ADDR=brillanmarti.com, www.brillanmarti.com"
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
curl -I http://127.0.0.1/games/comet/
curl -I http://127.0.0.1/games/archimedes/
curl -I http://127.0.0.1/games/wallmover/

WebSocket routing sanity (expects `101 Switching Protocols`). Use `--resolve` so TLS SNI matches the real hostname (don’t use `https://127.0.0.1/...` directly):

```bash
curl -vk --http1.1 --resolve brillanmarti.com:443:127.0.0.1 \
  -H 'Connection: Upgrade' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==' \
  https://brillanmarti.com/games/wallmover/ws
```
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
curl -I https://brillanmarti.com/games/
```

## Logs

The backend writes join/location events (country/region/city, **no IP addresses**) to daily files:

- Default (with the unit file below): `/home/ubuntu/games/logs/events-YYYY-MM-DD.log`
  - This comes from `apps/ws/src/logging/events_log.js` defaulting to `../../logs` relative to the backend `WorkingDirectory`.

You can override the directory (recommended) by setting `GAMES_LOG_DIR` in the backend systemd unit, e.g.:

```bash
sudo mkdir -p /var/log/games
sudo chown ubuntu:ubuntu /var/log/games
sudo chmod 755 /var/log/games

sudo systemctl edit games-backend
```

Then add:

```ini
[Service]
Environment=GAMES_LOG_DIR=/var/log/games
```

Apply + restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart games-backend
```

Tail the current day’s event log:

```bash
tail -f /home/ubuntu/games/logs/events-$(date -u +%F).log
# or if using GAMES_LOG_DIR=/var/log/games:
tail -f /var/log/games/events-$(date -u +%F).log
```

```bash
sudo journalctl -u caddy -n 200 --no-pager
sudo journalctl -u games-backend -n 200 --no-pager
```

## Local debugging note

For most issues, browser devtools (console + Network → WS) tends to be the
quickest way to see what’s actually failing.

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
(cd comet/client && (test -f package-lock.json && npm ci || npm install) && VITE_BASE=/games/comet/ npm run build)
(cd archimedes/client && (test -f package-lock.json && npm ci || npm install) && VITE_BASE=/games/archimedes/ npm run build)
(cd wallmover/client && (test -f package-lock.json && npm ci || npm install) && VITE_BASE=/games/wallmover/ npm run build)

sudo rsync -a --delete ~/games/infra/site/games/ /srv/games/
sudo rsync -a --delete ~/games/snake/client/dist/ /srv/games/snake/
sudo rsync -a --delete ~/games/maze/client/dist/ /srv/games/maze/
sudo rsync -a --delete ~/games/comet/client/dist/ /srv/games/comet/
sudo rsync -a --delete ~/games/archimedes/client/dist/ /srv/games/archimedes/
sudo rsync -a --delete ~/games/wallmover/client/dist/ /srv/games/wallmover/

sudo systemctl restart games-backend caddy
```

## Local development (Docker)

Docker remains supported for local development/debugging:

```bash
export SITE_ADDR=localhost
docker compose up --build
```

## Troubleshooting

- SSL error in browser / Caddy can't get a trusted certificate
  - If you visit by IP (e.g. `https://YOUR_LIGHTSAIL_STATIC_IP/games/`), you can get a certificate/name mismatch. Use the domain in `SITE_ADDR`.
  - If Caddy logs mention `NXDOMAIN`, your public DNS records don’t exist yet. Check from the VM:
    - `dig +short A brillanmarti.com @1.1.1.1`
    - `dig +short A www.brillanmarti.com @1.1.1.1`
    - `dig +short AAAA brillanmarti.com @1.1.1.1`
    If those are empty, create/fix the corresponding `A` record(s) pointing at the instance Static IP (only add `AAAA` if you actually have IPv6).
  - Confirm Lightsail firewall allows inbound `80/tcp` and `443/tcp`.
  - If you see `acme-staging` in Caddy logs, you're using Let’s Encrypt staging (certs are not trusted by browsers).
    - Remove any staging config, or set `ACME_CA` to production:
      - `Environment=ACME_CA=https://acme-v02.api.letsencrypt.org/directory`

- HTTPS not issuing: DNS not pointing at instance yet, or ports 80/443 not open.
- `502` from Caddy: check `sudo systemctl status games-backend`.
- Caddy can’t read files: confirm `/srv` permissions are readable by Caddy (`chmod -R a+rX /srv`).
- Backend flapping with `EADDRINUSE :::8080`: something already owns 8080. Ensure the unit sets the port, then reload+restart:
  - `sudo systemctl daemon-reload && sudo systemctl restart games-backend`
  - Find what owns 8080: `sudo ss -ltnp | grep ':8080'` (or `sudo lsof -iTCP:8080 -sTCP:LISTEN -n -P`)

## DNS notes

This deployment assumes the Lightsail VM directly serves `brillanmarti.com`.

- Point `brillanmarti.com` (A/AAAA) to the instance Static IP.
- (Recommended) Also point `www.brillanmarti.com` (A/AAAA) to the same Static IP so Caddy can redirect `www` → apex.
- Keep ports 80/443 open to the internet so Caddy can obtain/renew TLS.

## Appendix: if the repo is private

If you ever switch back to private, avoid putting secrets (PATs/SSH private keys) directly into Lightsail user-data.
Safer options:

- Copy the code to the VM: `rsync -az --delete ./ ubuntu@YOUR_DOMAIN:~/games/`
- Use a read-only deploy key and clone via SSH after first login
