# LLM entrypoint: /games (collaborative arcade games)

This repo contains small, arcade-style **collaborative** games designed for a 5-year-old audience.
The core premise is **co-op, not competition**: players share goals, share progress, and play together.

- Up to 4 players per room, cooperative (not competitive)
- Server-authoritative simulation; clients render state
- Simple "join code" rooms (4 digits)

If you are an LLM helping with changes, start here, then follow the docs links below.

## Collaborative design principles

These apply to every game in the repo:

- **No PvP**: avoid mechanics where one player can "beat" another.
- **Shared progress**: state changes are visible to and shared by everyone.
- **Forgiving loops**: failure should be recoverable and non-punitive.
- **Spectator-friendly**: additional players can join and immediately understand what's happening.
- **Kid-friendly UX**: big targets, forgiving controls, immediate feedback, low reading burden.
- **Room play**: a parent/host creates a room; others join with a 4-digit code.
- **Safety**: no chat required; collaboration is implicit via shared state.

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

## Key concepts used across games

- **Server authoritative**: the backend computes state; clients should not "decide" outcomes.
- **Rooms**: each game manages 4-player rooms (IDs 1–4) keyed by a 4-digit code.
- **Tick + broadcast**: each room advances on a fixed tick and broadcasts state.
- **Edit vs play/test (Wallmover/Maze-like)**: editing is allowed only when not testing/playing.

## Canonical docs (recommended reading)

- `docs/ARCHITECTURE.md` — system diagram, repo layout, and data flow
- `docs/PROTOCOL.md` — WebSocket handshake + message types + authority rules
- `docs/STATE.md` — state schema conventions (shared + per-game highlights)

## Per-game LLM docs

These are deliberately **specific** and point to the actual modules and message/state shapes:

- `docs/snake_LLM.md` — co-op snake arena with topologies
- `docs/maze_LLM.md` — cooperative fog-of-war maze exploration
- `docs/wallmover_LLM.md` — collaborative level editor + maze play
- `docs/comet_LLM.md` — co-op space shooter with topology experiments
- `docs/archimedes_LLM.md` — physics "toy museum" (buoyancy, levers, pulleys…)
- `docs/fling_LLM.md` — cooperative projectile game across 7 planets

## Adding a new co-op game (checklist)

- Server:
  - Add `apps/ws/src/games/<game>.js` (host: rooms + messages)
  - Add `apps/ws/src/games/<game>_sim.js` (authoritative sim)
  - Register host in `apps/ws/src/server.js`
- Client:
  - Create `<game>/client/` (Vite + Phaser)
  - Add a `<game>-client-build` stage in `Dockerfile`
  - Copy build output into the `gateway` stage under `/srv/games/<game>/`
- Protocol:
  - Document message types in `docs/PROTOCOL.md`
  - Create `docs/<game>_LLM.md` with game-specific protocol, state, and pitfalls
- Product:
  - Ensure the game has a clear co-op hook (shared goals, shared progress)
  - No PvP mechanics; forgiving failure states

## Legacy / existing LLM notes
- `snake/for_llm.txt` exists and contains Snake-specific details. Prefer the canonical docs above.
