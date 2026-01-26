#!/usr/bin/env bash
set -euo pipefail

# Debug helper for the local Docker gateway (Caddy) + unified backend.
# Run from anywhere: it auto-cds to the repo root.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "== docker compose ps =="
docker compose ps

echo
echo "== gateway logs (tail 200) =="
docker compose logs --tail=200 gateway || true

echo
echo "== games-backend logs (tail 200) =="
docker compose logs --tail=200 games-backend || true

echo
echo "== gateway: caddy version =="
docker compose exec -T gateway caddy version || true

echo
echo "== gateway: validate Caddyfile =="
docker compose exec -T gateway caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || true

echo
echo "== gateway: routes sanity (HTTP) =="
# Note: websocket endpoints will show 426 Upgrade Required; that's OK.
set +e
curl -sS -I http://localhost/games/ | head -n 5
curl -sS -I http://localhost/games/snake/ | head -n 5
curl -sS -I http://localhost/games/snake/ws | head -n 12
set -e

echo
echo "== gateway: dump active config (admin API, inside container) =="
# The admin API is only reachable inside the container.
docker compose exec -T gateway sh -lc 'wget -qO- http://127.0.0.1:2019/config/ 2>/dev/null | head -c 4000; echo' || true

echo
echo "Done. If create/join fails, compare gateway vs backend logs above."
