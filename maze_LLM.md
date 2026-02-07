# Maze — LLM notes

Maze is a cooperative grid exploration game with shared reveal (fog-of-war / LOS).

## Where things live

Server:
- `apps/ws/src/games/maze.js` (WebSocket room host + routing)
- `apps/ws/src/games/maze_sim.js` (authoritative simulation)

Client:
- `maze/client/src/net.js` (WebSocket client)
- `maze/client/src/game/scenes/MenuScene.js` (create/join room)
- `maze/client/src/game/scenes/PlayScene.js` (render + UI + inputs)

Shared helpers:
- `apps/ws/src/games/maze_utils.js` (rand, clamp)

## Core loop (server authoritative)

- Host tick: every **150ms** the host calls `Sim.step(state, now)` and broadcasts `{type:"state"}`.
- Clients render the full state snapshot.

## Protocol (Maze)

Handshake:
- Client must send `{type:"hello", gameId:"maze", protocol:1}` immediately after socket open.

Lobby / room messages (common):
- `create_room`, `join_room {roomId}`, `get_rooms`

Gameplay/control messages:
- `input { dir: "UP"|"RIGHT"|"DOWN"|"LEFT" }`
- `pause`, `resume`
- `restart`
- `select_level { level:number }`
- `select_vision_mode { mode:"fog"|"glass" }`
- `select_avatar { avatar:string }`
- `select_color { color:"#RRGGBB" }`

Server → client:
- `room_joined { roomId, playerId, state }`
- `state { state }`

## State shape highlights

See `docs/STATE.md` for shared conventions.

Maze-specific fields (non-exhaustive):
- Grid: `w`, `h`, `walls[y][x]`, `start`, `goal`
- Fog: `visionMode`, `revealed` (array of cell indices)
- Collectibles + targets:
  - `apples`, `appleTarget`, `applesCollected`
  - `treasures`, `treasureTarget`, `treasuresCollected`
  - `batteries`, `batteryTarget`, `batteriesCollected`
  - `fishes`, `fishTarget`, `fishesCollected`
  - `ducks`, `duckTarget`, `ducksCollected`
  - `minotaurs` (level-dependent)
- Shared trails:
  - `paths` + `_pathOwners` (server-only helper)
- Per-player:
  - `players[pid].x/.y` and `trail`

### Wall bitmasks (must match client)
The wall bits are defined in both server and client and must stay aligned:
- Server: `maze_sim.js` constants `WALL_N/E/S/W`
- Client: `PlayScene.js` constants `WALL_N/E/S/W`

## Practical editing guidance

If you change wall semantics, update both:
- server LOS (`computeVisibleCellsLos` and `updateVisibility`) and movement checks
- client rendering of walls + fog

If you add a new collectible/objective:
- add it in `objectivesForLevel()` and `placeCollectibles()`
- add render + HUD updates in the client PlayScene

## Common pitfalls

- Breaking wall symmetry (must update both adjacent cells when toggling an edge).
- Adding new state fields but forgetting to reset them in `buildLevel()`/`restart()`.
- Changing constants (wall bits, grid index) on only one side.
