#!/usr/bin/env bash
set -euo pipefail

# Restart/update script to run on a Lightsail VM after `git pull`.
# - Re-installs deps (lockfile-aware)
# - Builds clients
# - Rsyncs static assets to /srv
# - Restarts services

# If you run it manually over SSH as a normal user, it will re-exec via sudo.
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "[lightsail] Not running as root; re-running via sudo"
  exec sudo -E bash "$0" "$@"
fi

APP_USER="${APP_USER:-ubuntu}"
APP_DIR="${APP_DIR:-/home/${APP_USER}/games}"
GAMES_PORT="${GAMES_PORT:-8080}"

# Node/V8 heap size for Vite builds (MB).
BUILD_MAX_OLD_SPACE_MB="${BUILD_MAX_OLD_SPACE_MB:-1024}"

log() { echo "[lightsail] $*"; }

die() {
  echo "[lightsail] ERROR: $*" >&2
  exit 1
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || die "Missing required command: $cmd"
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

main() {
  require_cmd su
  require_cmd rsync
  require_cmd systemctl
  require_cmd npm

  [[ -d "$APP_DIR/.git" ]] || die "Repo not found at $APP_DIR (expected a git checkout)"

  log "Using APP_DIR=$APP_DIR (user: $APP_USER)"

  log "Installing backend deps"
  npm_install "$APP_DIR/apps/ws" server

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

  log "Restarting services"
  systemctl daemon-reload || true
  systemctl restart games-backend caddy

  log "Done. Check logs with: journalctl -u games-backend -n 200 --no-pager && journalctl -u caddy -n 200 --no-pager"
}

main "$@"
