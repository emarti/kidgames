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

Note: Snake explicitly waits for `hello_ack` before flushing any queued messages. Other clients may send messages immediately on socket open.

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

The server broadcasts the full authoritative state each tick. Clients treat it as the source of truth.

### Common client → server messages (game-dependent)
- `input` `{ dir }` — direction input for grid games (`UP|RIGHT|DOWN|LEFT`)
- `input` `{ action, ... }` — action-based input for physics games (see per-game docs)
- `pause` / `resume`
- `restart`
- `select_level` `{ level }`
- `select_avatar` `{ avatar }`
- `select_color` `{ color }`
- `set_computer` `{ color }` — toggle computer opponent: `null` (off), `'black'`, or `'white'` (gameroom)
- `set_computer_level` `{ level }` — set computer difficulty: `'easy'|'medium'|'hard'` (gameroom)
- `select_color` `{ color }`
- `next_level`

## Authority rules

- Server decides movement, collisions, visibility, win/lose.
- Clients handle *presentation only*: animation, local audio, UI state.
- Editing (Wallmover/Maze-like) is gated server-side; edits are rejected during play/test.
- Most games accept `pause` / `resume` to control the initial lobby overlay.

## State conventions (important fields)

All games:
- `players`: map of IDs 1–4 with `connected` and per-game fields.
- `tick`: monotonically increasing tick counter.
- `paused`, `reasonPaused`: lobby/pause overlay state.

For full state shapes, see `docs/STATE.md`.

## Per-game protocol details

Each game's full message set (including game-specific input actions and state fields) is documented in its LLM file:

- `docs/snake_LLM.md`
- `docs/maze_LLM.md`
- `docs/wallmover_LLM.md`
- `docs/comet_LLM.md`
- `docs/archimedes_LLM.md`
- `docs/fling_LLM.md`

## Backwards compatibility

Different clients may exist across deployments. Prefer:
- adding fields (safe)
- keeping old fields readable where feasible
- avoiding breaking message types
