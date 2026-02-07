# Snake — LLM notes

Snake is a cooperative multi-player snake arena. Each player controls a snake; the server sim advances on ticks and broadcasts the full state.

## Where things live

Server:
- `apps/ws/src/games/snake.js` (WebSocket room host + routing)
- `apps/ws/src/games/snake_sim.js` (authoritative simulation)
- `apps/ws/src/games/game_config.json` (tick-to-speed mapping)

Client:
- `snake/client/src/net.js` (WebSocket client; queues messages until `hello_ack`)
- `snake/client/src/game/scenes/MenuScene.js` (create/join room)
- `snake/client/src/game/scenes/PlayScene.js` (render + UI + inputs)
- `snake/client/src/game/skins.json` (skin display data)

## Core loop

- Host tick: every **75ms** the host calls `Sim.step(state)`.
- The sim has its own **ticks-per-move** based on `state.speed`.
- Host only broadcasts when `Sim.step` returns `didUpdate`.

## Protocol (Snake)

Handshake:
- Client sends `{type:"hello", gameId:"snake", protocol:1}`.
- Client waits for `{type:"hello_ack"}` before flushing `create_room` / `join_room`.

Lobby / room messages (common):
- `create_room`, `join_room {roomId}`, `get_rooms`

Gameplay/control messages:
- `input { dir: "UP"|"RIGHT"|"DOWN"|"LEFT" }`
- `pause`, `resume`
- `restart`
- `select_speed { speed: "very_slow"|"slow"|"medium"|"fast"|"very_fast" }`
- `select_walls_mode { mode: "walls"|"no_walls"|"klein"|"projective" }`
- `select_skin { skin: string }`
- `request_respawn`

Server → client:
- `room_joined { roomId, playerId, state }`
- `state { state }`

## State shape highlights

See `docs/STATE.md` for shared conventions.

Snake server state fields (non-exhaustive):
- `w`, `h`
- `tick`
- `paused`, `reasonPaused`
- `speed` and `wallsMode`
- `apple`, `redApple` (may be null)
- `players[pid]` with:
  - `state`: `WAITING|ALIVE|DEAD|COUNTDOWN`
  - `lives`
  - `dir`, `pendingDir`
  - `body`: array of `{x,y}` (head at index 0)
  - `grow`, `shrink`
  - `skin`

Topologies (`wallsMode`):
- `walls`: bounded arena
- `no_walls`: torus wrapping
- `klein`: Klein bottle-style wrap
- `projective`: projective plane-style wrap

## Practical editing guidance

- If you change move timing, keep the relationship between:
  - host tick interval (75ms)
  - `config.TICKS_PER_MOVE[speed]` in `game_config.json`
  consistent and readable.

- If you change topology math, update collision expectations and client UX copy.

## Common pitfalls

- Forgetting that `pause/resume` is **both** a system-level start pause and per-player pause.
- Adding a new skin: update `skins.json` and ensure `snake_sim.js` accepts it (it currently allows any skin string).
- Introducing a server-only helper field and accidentally sending non-JSON-safe values.
