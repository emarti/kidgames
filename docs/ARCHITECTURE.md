# Architecture

This repo is a small “/games” stack:
- A single backend hosts multiple games over WebSockets.
- Each game has a Phaser client built by Vite.
- A Caddy gateway serves `/games/*` and reverse-proxies `/games/*/ws` to the backend.

## High-level diagram

```
Browser (Phaser client)
  |  WebSocket: /games/<game>/ws
  v
Caddy gateway (container)
  |  proxy to :8080
  v
Node WS backend (container)
  |  per-game host + simulation
  v
Authoritative state -> broadcast to clients
```

## Runtime components

### Gateway
- Built by the `gateway` target in `Dockerfile`.
- Serves static client bundles under `/games/<game>/`.
- Proxies WebSocket traffic from `/games/<game>/ws` to the backend.

### Backend (unified WS server)
- Built by the `games-backend` target in `Dockerfile`.
- Entry point: `apps/ws/src/server.js`.
- Uses a single WebSocketServer; each client begins with a `hello` selecting a `gameId`.

### Clients
- Each game has a Vite/Phaser client in `<game>/client/`.
- Built into the gateway image as static assets at `/srv/games/<game>/`.
- Shared touch controls live in `packages/touch-controls/`.

## Source layout (important folders)

- `apps/ws/src/server.js`: WebSocket server, handshake, host selection, heartbeat.
- `apps/ws/src/shared.js`: JSON parsing + safe send + join-code normalization.
- `apps/ws/src/games/*.js`: per-game “host” modules (rooms + message routing).
- `apps/ws/src/games/*_sim.js`: per-game authoritative simulation/state.
- `infra/caddy/Caddyfile`: gateway routing.
- `docker-compose.yml`: local stack (gateway + games-backend).

## Connection lifecycle

1. Client opens WebSocket.
2. Client sends `{"type":"hello","gameId":"<game>","protocol":1}`.
3. Backend attaches a per-game host and replies `hello_ack`.
4. Client can create/join rooms and start sending input/edit commands.

## Room model

- Rooms are identified by a **4-digit numeric code**.
- Each room supports up to **4 players**, assigned IDs 1–4.
- On disconnect/reconnect, the server marks a player disconnected/connected and keeps the room state alive (subject to room expiry rules per host).

## State + tick model

- The server owns the game state.
- Each game host runs a fixed tick loop (per room or per host) calling its sim step function.
- State is broadcast to all connected clients.
- Clients:
  - render state
  - play client-side SFX/FX
  - send user intent (inputs/edits) as messages

Tick intervals (current defaults, see each host module):
- Maze: 150ms
- Wallmover: 150ms
- Snake: 75ms (the sim has its own ticks-per-move for speed)
- Comet: 50ms
- Archimedes: 50ms

## Authority rules (cross-cutting)

- Server decides movement, collisions, visibility, win/lose.
- Clients may do *presentation only*: animation, local audio, UI.
- Editing (Wallmover/Maze-like) is gated server-side; edits are rejected during play/test.

## Wall representation (Maze/Wallmover)

- Maze walls are stored as per-cell bitmasks for N/E/S/W edges.
- Editing must keep wall symmetry by updating both adjacent cells for a toggled edge.
- Puzzle mode (Wallmover) introduces editable “soft walls” that override locked (“heavy”) walls on marked edges.

For the concrete state shapes and invariants, see `docs/STATE.md`.

## Deployment notes

- Local/dev uses `docker compose up --build`.
- Deployment docs exist in `DEPLOY_RENDER.md` and `DEPLOY_LIGHTSAIL.md`.
