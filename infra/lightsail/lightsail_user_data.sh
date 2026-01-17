#!/usr/bin/env bash
set -euo pipefail

# This script is intended to run as root (Lightsail user-data runs as root).
# If you run it manually over SSH as a normal user, it will re-exec via sudo.
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "[lightsail] Not running as root; re-running via sudo"
  exec sudo -E bash "$0" "$@"
fi

# Lightsail Launch Script (User Data)
#
# Purpose:
# - Install Caddy + Node.js
# - Clone/update this repo
# - Build the Vite clients (served under /games/<game>/)
# - Install backend deps
# - Deploy static files to /srv
# - Configure Caddy reverse proxy
# - Create systemd services for both WebSocket backends
#
# How to use:
# - Paste this whole script into the Lightsail “Launch script” (user data) box.
# - Customize REPO_URL below.
#
# Notes:
# - If you deploy behind CloudFront (recommended for routing only /games on www),
#   set SITE_ADDR=':80' and set PUBLIC_URL='https://www.edmarti.com/games/'.

SITE_ADDR="${SITE_ADDR:-games.edmarti.com}"        # e.g. ':80' behind CloudFront, or 'example.com' for direct TLS
PUBLIC_URL="${PUBLIC_URL:-https://games.edmarti.com/games/}"         # e.g. 'https://www.edmarti.com/games/' (optional, just for log output)
REPO_URL="${REPO_URL:-https://github.com/emarti/kidgames.git}"            # e.g. "https://github.com/emarti/kidgames.git" or your git remote
REPO_BRANCH="${REPO_BRANCH:-main}"  # branch to deploy
APP_USER="${APP_USER:-ubuntu}"      # default Ubuntu user on Lightsail
APP_DIR="${APP_DIR:-/home/${APP_USER}/games}"

# Helps avoid OOM-kills during npm install/build on small instances.
SWAP_GB="${SWAP_GB:-4}"

# Node/V8 heap size for Vite builds (MB). On small instances Node may default to ~256MB.
# Increase if `vite build` fails with "JavaScript heap out of memory".
BUILD_MAX_OLD_SPACE_MB="${BUILD_MAX_OLD_SPACE_MB:-1024}"

SNAKE_PORT="${SNAKE_PORT:-8081}"
MAZE_PORT="${MAZE_PORT:-8082}"

log() { echo "[lightsail] $*"; }

ensure_swap() {
  if [[ "${SWAP_GB}" == "0" ]]; then
    log "SWAP_GB=0; skipping swap setup"
    return 0
  fi

  if swapon --show 2>/dev/null | awk 'NR>1 {found=1} END {exit !found}'; then
    log "Swap already enabled"
    return 0
  fi

  log "No swap detected; creating ${SWAP_GB}G swapfile at /swapfile"
  if command -v fallocate >/dev/null 2>&1; then
    fallocate -l "${SWAP_GB}G" /swapfile
  else
    dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB*1024)) status=progress
  fi
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -qE '^/swapfile\s' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  log "Swap enabled"
}

npm_install() {
  # Usage: npm_install <dir> <mode>
  # mode: server|client
  local dir="$1"
  local mode="$2"
  local omit_flag=""
  if [[ "$mode" == "server" ]]; then
    omit_flag="--omit=dev"
  fi

  # npm ci requires a lockfile. Fall back to npm install when missing.
  if [[ -f "$dir/package-lock.json" || -f "$dir/npm-shrinkwrap.json" ]]; then
    log "Installing npm deps via npm ci ($mode): $dir"
    su - "$APP_USER" -c "cd '$dir' && npm ci $omit_flag --no-audit --no-fund --progress=false"
  else
    log "No lockfile found; using npm install ($mode): $dir"
    su - "$APP_USER" -c "cd '$dir' && npm install $omit_flag --no-audit --no-fund --progress=false"
  fi
}

if [[ -z "$REPO_URL" ]]; then
  log "ERROR: REPO_URL is required. Set REPO_URL in the script (or env)."
  exit 2
fi

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  log "User '$APP_USER' does not exist; creating it"
  useradd -m -s /bin/bash "$APP_USER"
fi

log "Installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git rsync

log "Ensuring swap (prevents OOM during npm install/build)"
ensure_swap
free -h || true

log "Installing Caddy"
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy
systemctl enable --now caddy

log "Installing Node.js 20 (NodeSource)"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

log "Cloning/updating repo to $APP_DIR"
if [[ -d "$APP_DIR/.git" ]]; then
  su - "$APP_USER" -c "cd '$APP_DIR' && git fetch --all --prune"
  su - "$APP_USER" -c "cd '$APP_DIR' && git checkout '$REPO_BRANCH'"
  su - "$APP_USER" -c "cd '$APP_DIR' && git pull --ff-only"
else
  mkdir -p "$(dirname "$APP_DIR")"
  chown -R "$APP_USER":"$APP_USER" "$(dirname "$APP_DIR")"
  su - "$APP_USER" -c "git clone --branch '$REPO_BRANCH' '$REPO_URL' '$APP_DIR'"
fi

log "Installing backend deps"
npm_install "$APP_DIR/snake/server" server
npm_install "$APP_DIR/maze/server" server

log "Building clients (Vite base paths under /games/*)"
npm_install "$APP_DIR/snake/client" client
su - "$APP_USER" -c "cd '$APP_DIR/snake/client' && NODE_OPTIONS=--max-old-space-size=$BUILD_MAX_OLD_SPACE_MB VITE_BASE=/games/snake/ npm run build"

npm_install "$APP_DIR/maze/client" client
su - "$APP_USER" -c "cd '$APP_DIR/maze/client' && NODE_OPTIONS=--max-old-space-size=$BUILD_MAX_OLD_SPACE_MB VITE_BASE=/games/maze/ npm run build"

log "Deploying static files to /srv"
mkdir -p /srv/games /srv/games/snake /srv/games/maze
rsync -a --delete "$APP_DIR/infra/site/games/" /srv/games/
rsync -a --delete "$APP_DIR/snake/client/dist/" /srv/games/snake/
rsync -a --delete "$APP_DIR/maze/client/dist/" /srv/games/maze/
chmod -R a+rX /srv

log "Installing Caddyfile"
cp "$APP_DIR/infra/caddy/Caddyfile" /etc/caddy/Caddyfile

log "Configuring Caddy environment (SITE_ADDR + backend targets + root)"
mkdir -p /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/override.conf <<EOF
[Service]
Environment=SITE_ADDR=$SITE_ADDR
Environment=SNAKE_BACKEND=127.0.0.1:$SNAKE_PORT
Environment=MAZE_BACKEND=127.0.0.1:$MAZE_PORT
Environment=GAMES_ROOT=/srv
EOF

log "Stopping existing backend services (if any)"
systemctl stop snake-backend maze-backend 2>/dev/null || true

log "Creating systemd service: snake-backend"
cat > /etc/systemd/system/snake-backend.service <<EOF
[Unit]
Description=Snake WebSocket Server
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR/snake/server
Environment=NODE_ENV=production
ExecStart=/usr/bin/env PORT=$SNAKE_PORT /usr/bin/node server.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

log "Creating systemd service: maze-backend"
cat > /etc/systemd/system/maze-backend.service <<EOF
[Unit]
Description=Maze WebSocket Server
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR/maze/server
Environment=NODE_ENV=production
ExecStart=/usr/bin/env PORT=$MAZE_PORT /usr/bin/node server.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

log "Reloading systemd and starting services"
systemctl daemon-reload
systemctl reset-failed snake-backend maze-backend 2>/dev/null || true
systemctl enable --now snake-backend maze-backend
systemctl restart snake-backend maze-backend
systemctl restart caddy

log "Done. Useful commands:"
log "- Check Caddy logs:    journalctl -u caddy -n 200 --no-pager"
log "- Check Snake logs:    journalctl -u snake-backend -n 200 --no-pager"
log "- Check Maze logs:     journalctl -u maze-backend -n 200 --no-pager"
if [[ -n "$PUBLIC_URL" ]]; then
  log "- Visit: $PUBLIC_URL"
else
  log "- Visit: (set PUBLIC_URL to show the user-facing URL here)"
fi
log "NOTE: If using CloudFront, origin can be HTTP-only (SITE_ADDR=':80')."
