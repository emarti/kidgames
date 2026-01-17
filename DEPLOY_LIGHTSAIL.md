# Deploy to AWS Lightsail (no Docker on the server)

This repo can be deployed to a single Lightsail **Instance** (VM) without Docker:

- Caddy runs on the VM and serves static files under `/games/*`
- Caddy reverse-proxies WebSockets by path:
  - `/games/snake/ws` → Snake backend
  - `/games/maze/ws` → Maze backend
- Two Node.js backends run under `systemd`

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
3. (Optional but recommended) In **Advanced details**, paste the contents of `infra/lightsail/lightsail_user_data.sh` into **Launch script**.
4. Create the instance.
5. In Lightsail **Networking**:
  - Create/attach a **Static IP** so the public IP won’t change.
  - Add firewall rules:
    - **TCP 22 (SSH)**: restrict to your IP if possible.
    - **TCP 80 (HTTP)**: open to the world.
    - **TCP 443 (HTTPS)**: open to the world.
  - You do *not* need to expose backend ports (Snake/Maze) publicly; Caddy talks to them on localhost.
6. DNS:
  - If you are deploying the VM directly on its own hostname (not using CloudFront), create an **A record** for that hostname pointing to the instance Static IP.
  - If you are using CloudFront Option B (recommended for `www.edmarti.com/games/*`), Route 53 will point `www.edmarti.com` to CloudFront; you do *not* point `www.edmarti.com` to the VM.
7. Connect to the VM:
  - Use the Lightsail web SSH button, or
  - `ssh ubuntu@YOUR_DOMAIN` (or `ssh ubuntu@STATIC_IP`) from your machine.

## One-shot Lightsail launch script (recommended)

Lightsail supports a “Launch script” (cloud-init user data) that runs once on first boot.

Use: `infra/lightsail/lightsail_user_data.sh`

Before launching, edit the variables at the top of the script:

- `SITE_ADDR`
  - For CloudFront Option B: set `SITE_ADDR=:80`
  - For direct hosting with Caddy TLS: set `SITE_ADDR=your-hostname` (e.g. `games.edmarti.com`)
- Optional: `PUBLIC_URL` (helpful log output, e.g. `https://www.edmarti.com/games/`)
- `REPO_URL` (your git URL)
- Optional: `REPO_BRANCH`, `APP_USER`, `SNAKE_PORT`, `MAZE_PORT`

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
(cd snake/server && (test -f package-lock.json && npm ci --omit=dev || npm install --omit=dev))
(cd maze/server && (test -f package-lock.json && npm ci --omit=dev || npm install --omit=dev))

(cd snake/client && (test -f package-lock.json && npm ci || npm install) && VITE_BASE=/games/snake/ npm run build)
(cd maze/client && (test -f package-lock.json && npm ci || npm install) && VITE_BASE=/games/maze/ npm run build)
```

If `npm install` gets killed during client install/build, that’s usually an out-of-memory kill on small instances.
Either use a bigger plan or add swap (the launch script defaults to creating 2GB swap).

If `vite build` fails with `JavaScript heap out of memory`, increase Node’s heap for the build (the launch script supports this):

- Re-run with: `BUILD_MAX_OLD_SPACE_MB=1024 sudo -E bash infra/lightsail/lightsail_user_data.sh`
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
Environment=SITE_ADDR=:80
Environment=SNAKE_BACKEND=127.0.0.1:8081
Environment=MAZE_BACKEND=127.0.0.1:8082
Environment=GAMES_ROOT=/srv
EOF

sudo systemctl daemon-reload
sudo systemctl restart caddy
```

### 6) Create systemd services for the backends

Snake backend (port 8081):

```bash
sudo tee /etc/systemd/system/snake-backend.service >/dev/null <<'EOF'
[Unit]
Description=Snake WebSocket Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/games/snake/server
Environment=NODE_ENV=production
ExecStart=/usr/bin/env PORT=8081 /usr/bin/node server.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
```

Maze backend (port 8082):

```bash
sudo tee /etc/systemd/system/maze-backend.service >/dev/null <<'EOF'
[Unit]
Description=Maze WebSocket Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/games/maze/server
Environment=NODE_ENV=production
ExecStart=/usr/bin/env PORT=8082 /usr/bin/node server.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
```

Enable + start services:

```bash
sudo systemctl daemon-reload
sudo systemctl reset-failed snake-backend maze-backend || true
sudo systemctl enable --now snake-backend maze-backend
sudo systemctl restart snake-backend maze-backend
sudo systemctl status snake-backend maze-backend caddy --no-pager

# Quick sanity check: both backends should be listening on 8081 and 8082
sudo ss -ltnp | egrep ':(8081|8082)\b'
```

## Verify

```bash
# If accessing the origin VM directly (useful for debugging):
curl -I http://YOUR_LIGHTSAIL_STATIC_IP/games/

# If using CloudFront Option B (the normal user-facing check):
curl -I https://www.edmarti.com/games/
```

## Logs

```bash
sudo journalctl -u caddy -n 200 --no-pager
sudo journalctl -u snake-backend -n 200 --no-pager
sudo journalctl -u maze-backend -n 200 --no-pager
```

## Updating

```bash
cd ~/games
git pull

(cd snake/server && npm ci)
(cd maze/server && npm ci)

(cd snake/client && npm ci && VITE_BASE=/games/snake/ npm run build)
(cd maze/client && npm ci && VITE_BASE=/games/maze/ npm run build)

sudo rsync -a --delete ~/games/infra/site/games/ /srv/games/
sudo rsync -a --delete ~/games/snake/client/dist/ /srv/games/snake/
sudo rsync -a --delete ~/games/maze/client/dist/ /srv/games/maze/

sudo systemctl restart snake-backend maze-backend caddy
```

## Local development (Docker)

Docker remains supported for local development/debugging:

```bash
export SITE_ADDR=localhost:80
docker compose up --build
```

## Troubleshooting

- HTTPS not issuing: DNS not pointing at instance yet, or ports 80/443 not open.
- `502` from Caddy: check `sudo systemctl status snake-backend maze-backend`.
- Caddy can’t read files: confirm `/srv` permissions are readable by Caddy (`chmod -R a+rX /srv`).
- Snake backend flapping with `EADDRINUSE :::8080`: the process is trying to bind port 8080 (default) and something already owns it. Ensure the unit sets the port (for example `ExecStart=/usr/bin/env PORT=8081 ...`), then reload+restart:
  - `sudo systemctl daemon-reload && sudo systemctl restart snake-backend`
  - Find what owns 8080: `sudo ss -ltnp | grep ':8080'` (or `sudo lsof -iTCP:8080 -sTCP:LISTEN -n -P`)

## Route 53 (DNS) notes (S3 on `www`, Lightsail only for `/games`)

Important: DNS records (including Route 53) can only route by **hostname**, not by **path**. That means you cannot have Route 53 send only `www.edmarti.com/games/*` to Lightsail while keeping `www.edmarti.com/` on S3 using DNS alone.

You have two workable options:

### Option A (simplest): use a dedicated subdomain for games

- Keep `www.edmarti.com` pointing to S3 (unchanged).
- Create a new record like `games.edmarti.com` pointing to the Lightsail **Static IP**.
- Update this project’s `SITE_ADDR` to `games.edmarti.com`.

Result: users visit `https://games.edmarti.com/games/` (or you can redirect/link to it from the main site).

### Option B (same hostname): put CloudFront in front and route by path

If you specifically want `https://www.edmarti.com/games/*` to go to Lightsail while other paths stay on S3:

- Create a CloudFront distribution with **two origins**:
  - Origin 1 (default): your existing S3 / CloudFront origin for `www.edmarti.com`
  - Origin 2: your Lightsail instance as a **custom origin** (use the Lightsail Static IP)
- Add a behavior that routes `/games*` to the Lightsail origin.
  - Use `/games*` (not just `/games/*`) so `/games` also matches.
  - Allowed methods: `GET, HEAD, OPTIONS`.
  - Cache policy: `CachingDisabled` (managed policy) to avoid caching WS upgrade responses.
  - Origin request policy: `AllViewer` (managed policy) so WS upgrade headers are forwarded.
  - Viewer protocol policy: `Redirect HTTP to HTTPS` (recommended).
  - Origin protocol policy: `HTTP only` (recommended; the VM does not need to terminate TLS).
- In Route 53, point `www.edmarti.com` to CloudFront (Alias A/AAAA).

Notes:

- This keeps a single hostname while allowing path-based routing.
- WebSockets should work through CloudFront as long as the `/games*` behavior forwards the required headers and is not cached.

Lightsail VM settings for Option B:

- You only need inbound **TCP 80** from the internet (CloudFront will connect to it).
- You can keep **TCP 443** closed on the VM if you want.

Launch script settings for Option B:

- Set `SITE_ADDR=:80`
- Set `PUBLIC_URL=https://www.edmarti.com/games/`

Once your hostname resolves to the component terminating TLS (CloudFront in Option B), `https://www.edmarti.com/games/` should work.

## Appendix: if the repo is private

If you ever switch back to private, avoid putting secrets (PATs/SSH private keys) directly into Lightsail user-data.
Safer options:

- Copy the code to the VM: `rsync -az --delete ./ ubuntu@YOUR_DOMAIN:~/games/`
- Use a read-only deploy key and clone via SSH after first login
