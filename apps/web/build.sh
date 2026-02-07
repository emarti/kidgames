#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$(cd "$(dirname "$0")" && pwd)/dist"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/games"

# Copy the static landing page (/games/) and screenshots.
rm -rf "$OUT_DIR/games"
mkdir -p "$OUT_DIR/games"
cp -a "$ROOT_DIR/infra/site/games/." "$OUT_DIR/games/"

# Build Snake client to /games/snake/
(
  cd "$ROOT_DIR/snake/client"
  npm install --no-audit --no-fund
  VITE_BASE=/games/snake/ npm run build
)
mkdir -p "$OUT_DIR/games/snake"
rm -rf "$OUT_DIR/games/snake"
mkdir -p "$OUT_DIR/games/snake"
cp -a "$ROOT_DIR/snake/client/dist/." "$OUT_DIR/games/snake/"

# Build Maze client to /games/maze/
(
  cd "$ROOT_DIR/maze/client"
  npm install --no-audit --no-fund
  VITE_BASE=/games/maze/ npm run build
)
mkdir -p "$OUT_DIR/games/maze"
rm -rf "$OUT_DIR/games/maze"
mkdir -p "$OUT_DIR/games/maze"
cp -a "$ROOT_DIR/maze/client/dist/." "$OUT_DIR/games/maze/"

# Build Archimedes client to /games/archimedes/
(
  cd "$ROOT_DIR/archimedes/client"
  npm install --no-audit --no-fund
  VITE_BASE=/games/archimedes/ npm run build
)
mkdir -p "$OUT_DIR/games/archimedes"
rm -rf "$OUT_DIR/games/archimedes"
mkdir -p "$OUT_DIR/games/archimedes"
cp -a "$ROOT_DIR/archimedes/client/dist/." "$OUT_DIR/games/archimedes/"

# Build Wallmover client to /games/wallmover/
(
  cd "$ROOT_DIR/wallmover/client"
  npm install --no-audit --no-fund
  VITE_BASE=/games/wallmover/ npm run build
)
mkdir -p "$OUT_DIR/games/wallmover"
rm -rf "$OUT_DIR/games/wallmover"
mkdir -p "$OUT_DIR/games/wallmover"
cp -a "$ROOT_DIR/wallmover/client/dist/." "$OUT_DIR/games/wallmover/"

echo "Built static site into: $OUT_DIR"
