# Game Room — LLM notes

Game Room is a multi-player board games platform. All games share the same room infrastructure, protocol, side-selection model, hint system, and UI conventions. Go is the only fully implemented game; all others follow the same pattern.

---

## Platform design principles

Every game in Game Room is built around five shared ideas learned from the Go implementation:

1. **Flexible sides** — any player can join as either color, or as "both" for solo exploration/teaching. The server auto-assigns a default side on join (first free color). Players can change their side any time via the in-game side panel.
2. **Hints** — every game provides a hint button. The server computes the suggestion (GNU Go for Go, JS MCTS for all others) and broadcasts it to the whole room so spectators and co-players can see it.
3. **Undo** — every game exposes `undo_move`. The sim keeps a history of snapshots (capped at 300). Only players (not spectators) can undo.
4. **Direct join** — joining a room that already has an active game skips GameSelectScene and lands directly on PlayScene. The server auto-assigns the joining player a side.
5. **Restart** — any player can start a new game (`restart` message). Only players, not spectators.

---

## Where things live

Server:
- `apps/ws/src/games/gameroom.js` — room host, message routing, side assignment, hint dispatch
- `apps/ws/src/games/go_sim.js` — Go rules engine (9×9, Ko, undo, territory scoring)
- `apps/ws/src/games/go_hint.js` — GNU Go GTP subprocess
- `apps/ws/src/games/gameroom_<game>_sim.js` — one per future game
- `apps/ws/src/games/gameroom_<game>_hint.js` — JS MCTS hint engine per future game

Client:
- `gameroom/client/src/net.js` — WebSocket client; queues messages until `hello_ack`
- `gameroom/client/src/game/scenes/MenuScene.js` — create/join room; click room to join directly
- `gameroom/client/src/game/scenes/GameSelectScene.js` — 8-tile game picker (shown only when creating a new room)
- `gameroom/client/src/game/scenes/PlayScene.js` — board renderer, right-side panel, hint marker, score overlay, pause menu
- `gameroom/client/src/game/renderers/<game>.js` — one rendering module per game (future)

---

## Scene flow

```
MenuScene
  ├── Create room → GameSelectScene → PlayScene
  └── Join room (game already active) → PlayScene directly
                  (no game yet)       → GameSelectScene
```

`SideScene` exists in the codebase but is not part of the active flow. Side selection happens inside PlayScene via the persistent right-side panel.

---

## Protocol

### Handshake
- Client sends `{ type: "hello", gameId: "gameroom", protocol: 1 }`.
- Client waits for `{ type: "hello_ack" }` before sending any other messages.

### Lobby
- `create_room` — caller becomes player 1; response is `room_joined`
- `join_room { roomId }` — 4-digit code; server auto-assigns a side
- `get_rooms` — request current room list; response is `room_list`

### Room setup
- `select_game { gameType }` — host picks the game; resets all player sides; auto-assigns host to the first side (e.g. black)

### Side selection (all games)
- `select_side { side: 'black'|'white'|'both'|null }` — player picks their side
  - `'both'` allows one player to move for whichever color's turn it is
  - `null` makes the player a spectator (can watch but not move)
  - Can be changed at any time mid-game

### Universal game actions
- `undo_move` — undo last move; players only (requires `ws.playerId`)
- `restart` — reset to new game, keep connections; players only

### Go-specific actions
- `place_stone { x, y }` — place at board coordinate
- `pass_turn` — pass the turn
- `request_hint` — ask GNU Go; hint broadcast to whole room

### Future game actions (pattern)
- `move_piece { from: {x,y}, to: {x,y} }` — move a piece (checkers, chess, morris, etc.)
- `place_piece { ... }` — phase-1 placement where distinct from move (morris)
- `remove_piece { ... }` — post-mill removal (morris)
- `place_stone { x, y }` — reused for reversi, hex (same semantics: place at intersection)
- `request_hint` — same message for all games; server routes to the right engine

### Server → client
- `room_joined { roomId, playerId, state }` — full room state including auto-assigned side
- `state { state }` — full room state after every mutation
- `room_list { rooms: [{ id, players, gameType }] }` — response to `get_rooms`
- `hint { x, y }` — suggested move (game-specific coordinates; `x: null` if no suggestion)
- `error { message }` — rejected action

---

## Room state shape

```json
{
  "tick": 42,
  "gameType": "go|checkers|chess|morris|cchk|foxgeese|hex|reversi|null",
  "players": {
    "1": { "connected": true,  "side": "black" },
    "2": { "connected": true,  "side": "white" },
    "3": { "connected": false, "side": null },
    "4": { "connected": false, "side": null }
  },
  "game": { /* active sim state */ }
}
```

---

## Side / color mechanics (applies to every game)

- `room.state.players[pid].side` — room-level: `'black'`, `'white'`, `'both'`, or `null`
- `game.players[pid].color` — sim-level: the actual color string for that game, or `null`
- `'both'` is a room-level concept only. The sim never sees it. `gameroom.js` temporarily overrides `game.players[pid].color = game.turn` before calling the sim action, then restores on failure.
- `select_side` must update both levels. Each sim exposes `selectColor(game, pid, color)` to sync its internal player record.
- On `select_game`: host auto-assigned to the first color (e.g. black).
- On `join_room` with active game: first free color auto-assigned; player lands straight on PlayScene.
- Side can be changed any time; the server resets the sim's player color accordingly.

---

## Hint system (all games)

### Go — GNU Go via GTP
- Binary: `/usr/games/gnugo` (Debian `apt-get install gnugo`; not on Node's PATH by default)
- Override with `GNUGO_PATH` env var.
- Flow: write SGF to temp file → spawn in GTP mode → `loadsgf <file>` + `genmove <color>` via stdin → parse `= <coord>` → delete temp file.
- Use GTP `loadsgf` command, **not** the `--loadsgf` CLI flag (unsupported in apt version).
- Fallback: nearest-to-center empty cell; empty board: tengen immediately.
- Timeout: 5 s.

### All other games — JS MCTS (`gameroom_<game>_hint.js`)
- Pure JavaScript, no dependencies.
- UCT selection with C=1.4; random playouts using the game's own `legalMovesFor()`.
- Time-budgeted (~1.5 s, max 3 000 iterations).
- Returns the highest-visit child's move.
- Hint is broadcast to the whole room (same as Go).

### Client-side hint UX (consistent across games)
- Hint button grays out and shows "thinking…" while waiting.
- On arrival: small solid green circle drawn at the suggested intersection/square.
- Clears on next move or when a new hint arrives.
- `server_error` clears the "thinking…" state and flashes an error for 2 s.

---

## Undo system (all games)

- Each sim maintains a `history` array of board snapshots pushed **before** each commit.
- `undoMove(state)` pops the last snapshot and restores it.
- Cap at 300 entries to prevent unbounded memory.
- `undo_move` handler in `gameroom.js` requires `ws.playerId` — spectators rejected.
- PlayScene's Undo button calls `disableInteractive()` (not just `setAlpha()`) when history is empty or game is over.

---

## Game-over / Continue (all games)

- Score overlay appears on `gameState.gameOver === true`.
- **Continue**: hide overlay first (prevents flash-back on stale state), then send `undo_move` enough times to clear the terminal condition. For Go (2 passes needed): send twice, 80 ms apart.
- **New Game**: send `restart`; overlay hides immediately.
- Territory or end-state visualization clears on Continue/restart.

---

## PlayScene renderer pattern (for future games)

`PlayScene` checks `state.gameType` and delegates to a renderer module:

```js
// gameroom/client/src/game/renderers/<game>.js
export default {
  init(scene, state) { /* create graphics objects */ },
  draw(scene, state, helpers) { /* update graphics every render call */ },
  shutdown(scene) { /* destroy graphics */ },
}
```

`helpers` provides: `boardX`, `boardY`, `cellSize`, `drawStone(gfx, x, y, color)`, etc.

The right-side panel (side selection), top bar (turn/captures), button row (Undo/Pass or Undo/Move/Hint), and pause menu are all managed by `PlayScene` itself, not the renderer.

---

## Go-specific notes

### GoSim state shape (`state.game`)
```json
{
  "board": "9×9 array — null | 'black' | 'white'",
  "turn": "black|white",
  "captures": { "black": 0, "white": 0 },
  "lastMove": { "x": 3, "y": 4 },
  "passCount": 0,
  "gameOver": false,
  "score": null,
  "history": [ { "boardStr": "...", "turn": "black", ... } ],
  "tick": 7,
  "players": { "1": { "connected": true, "color": "black" }, ... }
}
```

`score` (when `gameOver === true`):
```json
{
  "winner": "black|white|tie",
  "total":     { "black": 12, "white": 8 },
  "stones":    { "black": 5,  "white": 4 },
  "territory": { "black": 6,  "white": 3 },
  "captures":  { "black": 1,  "white": 1 },
  "territoryCells": {
    "black": [ { "x": 2, "y": 3 }, ... ],
    "white": [ { "x": 6, "y": 7 }, ... ],
    "neutral": []
  }
}
```

### Ko rule
History snapshots are pushed **before** the move is committed. `history[length-1]` is the board just before the opponent's last move — exactly what Ko forbids recreating:
```js
if (state.history.length >= 1) {
  const prev = state.history[state.history.length - 1];
  if (prev.boardStr === newBoardStr) → Ko violation
}
```

---

## Key gotchas (platform-wide)

- `undo_move` and `restart` require `ws.playerId`. So do all game actions. Spectators (`side: null`) are rejected.
- Faded buttons must call `disableInteractive()` — not just `setAlpha()` — or they remain clickable.
- `server_error` listener must be registered in `_setupNet()` so rejected moves don't fail silently.
- "Continue" hides the overlay **before** sending undo messages, not after, to prevent the overlay flashing back if a stale `gameOver: true` state arrives before the undo is processed.
- History snapshots are pre-commit. This matters for Ko (Go) and for undo correctness in all games.


---

## Where things live

Server:
- `apps/ws/src/games/gameroom.js` — WebSocket room host, message routing, room state
- `apps/ws/src/games/go_sim.js` — Go rules engine (9×9, Ko, undo, territory scoring)
- `apps/ws/src/games/go_hint.js` — GNU Go GTP subprocess for move hints

Client:
- `gameroom/client/src/net.js` — WebSocket client; queues messages until `hello_ack`
- `gameroom/client/src/game/scenes/MenuScene.js` — create/join room (white bg, matches snake/maze style; click room to join)
- `gameroom/client/src/game/scenes/GameSelectScene.js` — 8-tile game picker; only Go is implemented
- `gameroom/client/src/game/scenes/PlayScene.js` — Go board renderer, side panel, hint marker, score overlay

---

## Scene flow

```
MenuScene → (create room) → GameSelectScene → PlayScene
          → (join room with active game) → PlayScene directly
          → (join room without game) → GameSelectScene
```

`SideScene` exists in the codebase but is not used. Side selection is done inside PlayScene via the right-side panel.

---

## Protocol

Handshake:
- Client sends `{ type: "hello", gameId: "gameroom", protocol: 1 }`.
- Client waits for `{ type: "hello_ack" }` before flushing queued messages.

Lobby / room messages:
- `create_room` — creates a new room, caller becomes player 1
- `join_room { roomId }` — joins existing room (4-digit code); server auto-assigns a side
- `get_rooms` — requests current room list

Room management messages:
- `select_game { gameType }` — host picks the game; resets all player sides; auto-assigns creator to black

Side selection:
- `select_side { side: 'black'|'white'|'both'|null }` — player picks their side; `'both'` lets one player move for either color on their turn

Go gameplay messages:
- `place_stone { x, y }` — place a stone at board coordinate
- `pass_turn` — pass
- `undo_move` — undo last move (players only; spectators with no side are rejected)
- `restart` — reset board (players only)
- `request_hint` — ask GNU Go for a move suggestion; hint broadcast to all players in room

Server → client:
- `room_joined { roomId, playerId, state }` — sent on join; `state` includes room state with auto-assigned side
- `state { state }` — full room state broadcast after every mutation
- `room_list { rooms: [{ id, players, gameType }] }` — response to `get_rooms`
- `hint { x, y }` — suggested move coordinate (or `x: null` if no suggestion)
- `error { message }` — rejected action (illegal move, room full, etc.)

---

## Room state shape

```json
{
  "tick": 42,
  "gameType": "go",
  "players": {
    "1": { "connected": true,  "side": "black" },
    "2": { "connected": true,  "side": "white" },
    "3": { "connected": false, "side": null },
    "4": { "connected": false, "side": null }
  },
  "game": { /* GoSim state — see below */ }
}
```

### GoSim state shape (`state.game`)

```json
{
  "board": "9×9 array — null | 'black' | 'white'",
  "turn": "black|white",
  "captures": { "black": 0, "white": 0 },
  "lastMove": { "x": 3, "y": 4 },
  "passCount": 0,
  "gameOver": false,
  "score": null,
  "history": [ { "boardStr": "...", "turn": "black", ... } ],
  "tick": 7,
  "players": {
    "1": { "connected": true, "color": "black" },
    "2": { "connected": true, "color": "white" }
  }
}
```

`score` (when `gameOver === true`):
```json
{
  "winner": "black|white|tie",
  "total":     { "black": 12, "white": 8 },
  "stones":    { "black": 5,  "white": 4 },
  "territory": { "black": 6,  "white": 3 },
  "captures":  { "black": 1,  "white": 1 },
  "territoryCells": {
    "black": [ { "x": 2, "y": 3 }, ... ],
    "white": [ { "x": 6, "y": 7 }, ... ],
    "neutral": []
  }
}
```

---

## Side / color mechanics

- `room.state.players[pid].side` — room-level: `'black'`, `'white'`, `'both'`, or `null`
- `game.players[pid].color` — sim-level: `'black'`, `'white'`, or `null`
- `'both'` means the player can move for whichever color's turn it is. The server temporarily sets `game.players[pid].color = game.turn` for the duration of `place_stone`/`pass_turn`, then resets on failure.
- `select_side` updates both levels; `GoSim.selectColor(game, pid, color)` syncs the sim.
- On `select_game`: creator auto-assigned black.
- On `join_room`: first available side (black then white) auto-assigned; can be changed any time via `select_side`.

---

## GNU Go hints (`go_hint.js`)

- Binary: `/usr/games/gnugo` (Debian `apt-get install gnugo`; not on Node's default PATH)
- Override with `GNUGO_PATH` env var.
- Flow: write board as SGF to a temp file → spawn gnugo in GTP mode → send `loadsgf <tmpfile>` + `genmove <color>` via stdin → parse `= <coord>` response → delete temp file.
- `--loadsgf` as a CLI flag is **not** supported by the apt-packaged version; use the GTP command instead.
- Fallback: if gnugo fails or times out (5 s), returns the nearest-to-center empty intersection.
- Empty board: immediately returns tengen `{ x:4, y:4 }` without spawning gnugo.

---

## Ko rule

The snapshot in `go_sim.js` is pushed to `history` **before** the move is committed. So `history[length-1]` is the board state just before the opponent's last move — exactly what Ko forbids recreating. The check is:

```js
if (state.history.length >= 1) {
  const prev = state.history[state.history.length - 1];
  if (prev.boardStr === newBoardStr) → Ko violation
}
```

---

## Key gotchas

- `undo_move` and `restart` require `ws.playerId` (spectators rejected). `place_stone`, `pass_turn`, `select_side`, `request_hint` also require `ws.playerId`.
- `Pass / Undo` buttons in PlayScene call `disableInteractive()` when faded — not just `setAlpha()`.
- "Continue" on the game-over overlay sends `undo_move` **twice** (game ends on `passCount >= 2`). The overlay is hidden first to prevent it flashing back if a stale state arrives before the undos are processed.
- `_setupNet()` in PlayScene listens for `server_error` and flashes the hint status text for 2 s.
- `history` is capped at 300 entries in `_pushSnapshot()` to prevent unbounded memory growth.
