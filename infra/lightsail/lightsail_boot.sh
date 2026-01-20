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
# - Create a systemd service for the unified WebSocket backend
#
# How to use:
# - Paste this whole script into the Lightsail “Launch script” (user data) box.
# - Customize REPO_URL below.
#
# Notes:
# - This setup assumes direct hosting (no CloudFront).
# - SITE_ADDR can be a single hostname (e.g. "www.example.com") or a comma-separated
#   list (e.g. "example.com, www.example.com") if you want both to work.

SITE_ADDR="${SITE_ADDR:-brillanmarti.com, www.brillanmarti.com}"        # host(s) Caddy should serve (direct TLS)
PUBLIC_URL="${PUBLIC_URL:-https://brillanmarti.com/games/}"         # optional, just for log output
REPO_URL="${REPO_URL:-https://github.com/emarti/kidgames.git}"            # e.g. "https://github.com/emarti/kidgames.git" or your git remote
REPO_BRANCH="${REPO_BRANCH:-main}"  # branch to deploy
APP_USER="${APP_USER:-ubuntu}"      # default Ubuntu user on Lightsail
APP_DIR="${APP_DIR:-/home/${APP_USER}/games}"

# Helps avoid OOM-kills during npm install/build on small instances.
SWAP_GB="${SWAP_GB:-4}"

# Node/V8 heap size for Vite builds (MB). On small instances Node may default to ~256MB.
# Increase if `vite build` fails with "JavaScript heap out of memory".
BUILD_MAX_OLD_SPACE_MB="${BUILD_MAX_OLD_SPACE_MB:-1024}"

GAMES_PORT="${GAMES_PORT:-8080}"

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

  # Prefer npm ci when a lockfile exists, but fall back to npm install if the
  # lockfile is out of sync (common after dependency changes).
  if [[ -f "$dir/package-lock.json" || -f "$dir/npm-shrinkwrap.json" ]]; then
    log "Installing npm deps via npm ci ($mode): $dir"
    if ! su - "$APP_USER" -c "cd '$dir' && npm ci $omit_flag --no-audit --no-fund --progress=false"; then
      log "npm ci failed (lockfile drift is common after dependency updates); falling back to npm install ($mode): $dir"
      su - "$APP_USER" -c "cd '$dir' && npm install $omit_flag --no-audit --no-fund --progress=false"
    fi
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
npm_install "$APP_DIR/apps/ws" server

log "Building clients (Vite base paths under /games/*)"
npm_install "$APP_DIR/snake/client" client
su - "$APP_USER" -c "cd '$APP_DIR/snake/client' && NODE_OPTIONS=--max-old-space-size=$BUILD_MAX_OLD_SPACE_MB VITE_BASE=/games/snake/ npm run build"

npm_install "$APP_DIR/maze/client" client
su - "$APP_USER" -c "cd '$APP_DIR/maze/client' && NODE_OPTIONS=--max-old-space-size=$BUILD_MAX_OLD_SPACE_MB VITE_BASE=/games/maze/ npm run build"

npm_install "$APP_DIR/comet/client" client
su - "$APP_USER" -c "cd '$APP_DIR/comet/client' && NODE_OPTIONS=--max-old-space-size=$BUILD_MAX_OLD_SPACE_MB VITE_BASE=/games/comet/ npm run build"

log "Deploying static files to /srv"
mkdir -p /srv/games /srv/games/snake /srv/games/maze /srv/games/comet
rsync -a --delete "$APP_DIR/infra/site/games/" /srv/games/
rsync -a --delete "$APP_DIR/snake/client/dist/" /srv/games/snake/
rsync -a --delete "$APP_DIR/maze/client/dist/" /srv/games/maze/
rsync -a --delete "$APP_DIR/comet/client/dist/" /srv/games/comet/
chmod -R a+rX /srv

log "Installing Caddyfile"
cp "$APP_DIR/infra/caddy/Caddyfile" /etc/caddy/Caddyfile

log "Configuring Caddy environment (SITE_ADDR + backend targets + root)"
mkdir -p /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/override.conf <<EOF
[Service]
Environment="SITE_ADDR=$SITE_ADDR"
Environment=GAMES_BACKEND=127.0.0.1:$GAMES_PORT
Environment=GAMES_ROOT=/srv
EOF

log "Stopping existing backend services (if any)"
systemctl stop games-backend snake-backend maze-backend 2>/dev/null || true

log "Creating systemd service: games-backend"
cat > /etc/systemd/system/games-backend.service <<EOF
[Unit]
Description=Games WebSocket Server (unified)
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR/apps/ws
Environment=NODE_ENV=production
ExecStart=/usr/bin/env PORT=$GAMES_PORT /usr/bin/node src/server.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

log "Reloading systemd and starting services"
systemctl daemon-reload
systemctl reset-failed games-backend 2>/dev/null || true
systemctl enable --now games-backend
systemctl restart games-backend
systemctl restart caddy

log "Done. Useful commands:"
log "- Check Caddy logs:    journalctl -u caddy -n 200 --no-pager"
log "- Check WS logs:       journalctl -u games-backend -n 200 --no-pager"
if [[ -n "$PUBLIC_URL" ]]; then
  log "- Visit: $PUBLIC_URL"
else
  log "- Visit: (set PUBLIC_URL to show the user-facing URL here)"
fi
log "NOTE: If using CloudFront, origin can be HTTP-only (SITE_ADDR=':80')."
