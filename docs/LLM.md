# LLM entrypoint: /games

**Start here.** This file is the master index for all documentation in this repo. Read this first, then follow the links relevant to your task.

This repo contains two kinds of games:
1. **Game Room** — a multi-player board games platform (Go, Checkers, Morris, Hex, Fox & Geese, Pirates & Bulgars) with shared room infrastructure, side selection, computer players, and hints.
2. **Standalone co-op games** — arcade-style collaborative games designed for a 5-year-old audience (Snake, Maze, Wallmover, Comet, Archimedes, Fling, Alphabet, Typing).

All games are server-authoritative, use 4-digit room codes for up to 4 players, and run via Docker.

---

## Design principles

- **Kid-friendly UX**: big targets, forgiving controls, immediate feedback, low reading burden.
- **Room play**: a parent/host creates a room; others join with a 4-digit code.
- **Server authoritative**: the backend computes state; clients render it.
- **Spectator-friendly**: additional players can join and immediately understand what's happening.
- **Safety**: no chat required; collaboration is implicit via shared state.

The standalone co-op games additionally follow:
- **No PvP**: avoid mechanics where one player can "beat" another.
- **Shared progress**: state changes are visible to and shared by everyone.
- **Forgiving loops**: failure should be recoverable and non-punitive.

---

## Quick orientation

### What runs where
- **Gateway**: Caddy serves static clients and reverse-proxies WebSockets
- **Backend**: a single Node.js WebSocket server hosting all games (`games-backend`)
- **Clients**: Phaser 3 + Vite builds, hosted under `/games/<game>/`

### Docker workflow
- `docker compose up --build` runs the gateway + backend.
- Multi-stage `Dockerfile`: `games-backend` (server) → `<game>-client-build` stages (Vite) → `gateway` (Caddy + static assets).
- All testing is done through Docker. npm is not installed locally.
- **IMPORTANT**: Never run `npm`, `node`, or any JS tooling directly from the terminal. The host machine has no Node.js installed. All builds and installs happen inside Docker containers only.

### Where the code lives
- Server entry: `apps/ws/src/server.js`
- Server helpers: `apps/ws/src/shared.js`
- Per-game hosts/sims: `apps/ws/src/games/*`
- Per-game clients: `<game>/client/` (Vite + Phaser)
- Shared mobile controls: `packages/touch-controls/`

---

## Documentation index

### Architecture & protocol
- `docs/ARCHITECTURE.md` — system diagram, repo layout, data flow
- `docs/PROTOCOL.md` — WebSocket handshake, message types, authority rules
- `docs/STATE.md` — state schema conventions (shared + per-game)

### Game Room (board games platform)
- `docs/gameroom_LLM.md` — **primary reference**: protocol, side selection, computer player, hint system, per-game state shapes, renderer API, key gotchas
- `implementation.md` (repo root) — master implementation checklist with per-phase details and cross-cutting conventions

### Standalone co-op games
- `docs/snake_LLM.md` — co-op snake arena with topologies
- `docs/maze_LLM.md` — cooperative fog-of-war maze exploration
- `docs/wallmover_LLM.md` — collaborative level editor + maze play
- `docs/comet_LLM.md` — co-op space shooter with topology experiments
- `docs/archimedes_LLM.md` — physics "toy museum" (buoyancy, levers, pulleys…)
- `docs/fling_LLM.md` — cooperative projectile game across 7 planets
- `docs/alphabet_LLM.md` — alphabet learning game
- `docs/typing_LLM.md` — typing practice game

### Deployment
- `docs/DEPLOY_LIGHTSAIL.md` — AWS Lightsail deployment guide
- `docs/DEPLOY_RENDER.md` — Render deployment guide

### Legacy
- `snake/for_llm.txt` — Snake-specific notes (prefer `docs/snake_LLM.md`)

---

## Adding a new game

### Standalone co-op game
- Server: `apps/ws/src/games/<game>.js` (host) + `<game>_sim.js` (sim); register in `server.js`
- Client: `<game>/client/` (Vite + Phaser); add `<game>-client-build` stage in `Dockerfile`; copy to `gateway` under `/srv/games/<game>/`
- Docs: create `docs/<game>_LLM.md`

### Game Room board game
- Server: `apps/ws/src/games/<game>_sim.js` (rules engine) + `<game>_hint.js` (MCTS hint)
- Integration: add to `IMPLEMENTED` set in `gameroom.js`; add handlers for game-specific messages; add `computerMovePiece()` / `computerPlaceStone()` to sim; wire `maybeComputerMove()` and `request_hint`
- Client: `gameroom/client/src/game/renderers/<game>.js` (renderer module); register in `PlayScene.js` `RENDERERS` map; set `implemented: true` in `GameSelectScene.js`
- Docs: update `docs/gameroom_LLM.md` with state shape; check off items in `implementation.md`
- See `docs/gameroom_LLM.md` for the full renderer API and integration patterns.
