# WebSocket protocol

This backend is a unified WebSocket server for all games.

## Handshake

Immediately after connecting, the client must send a `hello` selecting the game:

```json
{ "type": "hello", "gameId": "wallmover", "protocol": 1 }
```

Server responds:

```json
{ "type": "hello_ack", "gameId": "wallmover" }
```

If the client sends non-hello messages before selecting a game, the server rejects the connection.

## Room codes

- Room IDs are normalized to a **4-digit numeric string**.
- Clients typically:
  - `create_room` to get a fresh room
  - `join_room` with `{ roomId: "1234" }`

## Message categories

### Meta / lobby
Client → server:
- `create_room`
- `join_room` `{ roomId }`
- `get_rooms`

Server → client:
- `room_joined` `{ roomId, playerId, state }`
- `room_list` `[ { id, players, ... } ]` (host-dependent)
- `error` `{ message }`

### State stream
Server → client:
- `state` `{ state }`

Notes:
- The server broadcasts the full authoritative state periodically.
- Clients should treat it as the source of truth.

### Inputs (gameplay)
Client → server:
- `input` `{ dir }` where `dir ∈ {UP, RIGHT, DOWN, LEFT}`

### Pause / resume (cooperative)
Client → server:
- `pause`
- `resume`

### Common controls (depending on game)
Client → server:
- `restart`
- `select_level` `{ level }`
- `select_avatar` `{ avatar }`
- `select_color` `{ color }`
- `select_vision_mode` `{ mode }`

Notes:
- Some clients will send messages immediately on socket open. Snake explicitly waits for `hello_ack` before flushing any queued messages.
- Most games accept `pause` / `resume` to control the initial lobby overlay.

## Maze-specific messages

Client → server:
- `select_vision_mode` `{ mode: "fog" | "glass" }`
- `select_avatar` `{ avatar: string }`
- `select_color` `{ color: "#RRGGBB" }`
- `select_level` `{ level: number }`
- `restart`
- `pause`
- `resume`
- `input` `{ dir: "UP" | "RIGHT" | "DOWN" | "LEFT" }`

Server → client:
- `state` `{ state }` (full authoritative state)

## Snake-specific messages

Client → server:
- `input` `{ dir: "UP" | "RIGHT" | "DOWN" | "LEFT" }`
- `pause` / `resume`
- `restart`
- `select_speed` `{ speed: "very_slow"|"slow"|"medium"|"fast"|"very_fast" }`
- `select_walls_mode` `{ mode: "walls"|"no_walls"|"klein"|"projective" }`
- `select_skin` `{ skin: string }`
- `request_respawn`

Server → client:
- `state` `{ state }`

## Comet-specific messages

Client → server:
- `pause` / `resume`
- `restart`
- `select_topology` `{ mode: "regular"|"klein"|"projective" }`
- `select_difficulty` `{ difficulty: "easy"|"medium"|"hard" }`
- `select_color` `{ color: "#RRGGBB" }`
- `select_shape` `{ shape: "triangle"|"rocket"|"ufo"|"tie"|"enterprise" }`
- `input` `{ turn: number, thrust: boolean, brake: boolean, shoot: boolean }`

Server → client:
- `state` `{ state }`

## Archimedes-specific messages

Archimedes uses a single `input` message with an `action` field.

Client → server:
- `pause` / `resume`
- `input` with one of:
  - `{ action: "cursor_move", x: number, y: number }`
  - `{ action: "grab", objectId: string }`
  - `{ action: "release" }`
  - `{ action: "go" }`
  - `{ action: "reset" }`
  - `{ action: "toggle_pause" }`
  - `{ action: "toggle_level_select" }`
  - `{ action: "set_level", level: number }`
  - `{ action: "door_click" }`

Server → client:
- `state` `{ state }`

## Wallmover-specific messages (editor + test)

Client → server:
- `set_mode` `{ mode: "freeform" | "puzzle" }`
- `edit_set_wall` `{ x, y, dir, on }`
- `edit_place` `{ kind, x, y }` (disabled in Puzzle mode)
- `start_play` (enter test/play mode)
- `stop_test` (return to editor)
- `autoplay_start`
- `autoplay_stop`
- `next_level`

Authority rules:
- The server rejects edits when `testing` or `playing`.
- Puzzle mode restricts which wall edges are editable via a mask.

## State conventions (important fields)

All games:
- `players`: map of IDs 1–4 with `connected` and per-game fields.
- `tick`: monotonically increasing tick counter.

Wallmover/Maze-like:
- `w`, `h`: grid size
- `start`, `goal`
- `walls`: 2D grid of wall bitmasks
- `revealed`: set/array of revealed cell indices for fog-of-war

Wallmover puzzle add-ons:
- `softMask`: which edges are editable
- `softWalls`: current wall bits on editable edges
- `routeComplete`: whether start→goal is currently reachable under the effective walls

## Fling-specific messages

Fling is a cooperative projectile game: players fling rubber ducks at alien fish across planetary landscapes (Earth, Cave, Mars, Moon, Enceladus, Io, Comet).

Client → server:
- `pause` / `resume`
- `restart`
- `select_level` `{ level: number }` (1–16)
- `next_level`
- `select_avatar` `{ avatar: string }` — one of: `hunter`, `mrwhatwhat`, `chaihou`, `taolabi`, `chichi`, `starway`, `brillan`, `daddy`, `mama`, `gugu`
- `set_guides` `{ show: boolean }` — toggle trajectory preview dots (global for all players)
- `input` with one of:
  - `{ action: "aim", angle: number, power: number }` — angle in degrees (5–85), power 5–100
  - `{ action: "fire" }` — launch a projectile at the current aim

Server → client:
- `state` `{ state }`

## Backwards compatibility

Different clients may exist across deployments. Prefer:
- adding fields (safe)
- keeping old fields readable where feasible
- avoiding breaking message types
