# LLM entrypoint: /games (collaborative arcade games)

This repo contains small, arcade-style *collaborative* games designed for a 5‑year‑old audience.
- Up to 4 players per room
- Cooperative (not competitive)
- Server-authoritative simulation; clients render state
- Simple “join code” rooms (4 digits)

If you are an LLM helping with changes, start here, then follow the docs links below.

## Quick orientation

### What runs where
- **Gateway**: Caddy serves static clients and reverse-proxies WebSockets
- **Backend**: a single Node.js WebSocket server hosting all games ("games-backend")
- **Clients**: Phaser 3 + Vite builds, hosted under `/games/<game>/`

### Docker workflow (preferred)
- `docker compose up --build` runs the gateway + backend.
- The Docker build uses multi-stage targets in `Dockerfile`:
  - `games-backend` (server)
  - `<game>-client-build` stages (Vite builds)
  - `gateway` (Caddy + built static assets)


### Testing
- All testing is performed through docker. npm is not installed locally.

### Where the code lives
- Server entry: `apps/ws/src/server.js`
- Server helpers: `apps/ws/src/shared.js`
- Per-game hosts/sims: `apps/ws/src/games/*`
  - Example: `apps/ws/src/games/wallmover.js` (room host, message routing)
  - Example: `apps/ws/src/games/wallmover_sim.js` (authoritative sim/state)
- Per-game clients: `<game>/client/` (Vite + Phaser)
- Shared mobile controls: `packages/touch-controls/`

## Product goals (high-level)
- **Co-op first**: players share goals and progress; avoid PvP mechanics.
- **Kid-friendly UX**: big targets, forgiving controls, immediate feedback, low reading burden.
- **Room play**: a parent/host can create a room; others join with a 4-digit code.
- **Safety**: no chat is required for gameplay; collaboration is implicit via shared state.

## Key concepts used across games
- **Server authoritative**: the backend computes state; clients should not “decide” outcomes.
- **Rooms**: each game manages 4-player rooms (IDs 1–4) keyed by a 4-digit code.
- **Tick + broadcast**: each room advances on a fixed tick and broadcasts state.
- **Edit vs play/test (Wallmover/Maze-like)**: editing is allowed only when not testing/playing.

## Canonical docs (recommended reading)
- `docs/ARCHITECTURE.md` — system diagram, repo layout, and data flow
- `docs/PROTOCOL.md` — WebSocket handshake + message types + authority rules
- `docs/GAMES.md` — per-game purpose and collaboration mechanics
- `docs/STATE.md` — state schema conventions (shared + per-game highlights)

## Per-game LLM docs

These are deliberately **specific** and point to the actual modules and message/state shapes:
- `maze_LLM.md`
- `snake_LLM.md`
- `wallmover_LLM.md`
- `comet_LLM.md`
- `archimedes_LLM.md`
- `fling_LLM.md`

## Legacy / existing LLM notes
- `snake/for_llm.txt` exists and contains Snake-specific details. Prefer the canonical docs above for cross-repo architecture.
