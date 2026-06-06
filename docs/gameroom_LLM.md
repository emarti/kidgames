# Game Room — LLM notes

Game Room is a multi-player board games platform. Six games are fully implemented: **Go**, **Nine Men's Morris**, **Fox & Geese**, **Pirates & Bulgars**, **Hex**, and **Checkers**. All share the same room infrastructure, protocol, side-selection model, hint system, computer player, and UI conventions.

See also: `implementation.md` (master checklist with per-phase details and cross-cutting conventions).

---

## Platform design principles

1. **Flexible sides** — any player can join as either color, or as "both" for solo exploration/teaching. The server auto-assigns a default side on join (first free color). Players can change their side any time via the in-game side panel.
2. **Computer player** — any room can enable a computer opponent (`set_computer`) playing as either color at easy/medium/hard difficulty. All human players cooperate against the computer.
3. **Hints** — every game provides a hint button. The server computes the suggestion (GNU Go for Go, JS MCTS for all others) and broadcasts it to the whole room so spectators and co-players can see it.
4. **Undo** — every game exposes `undo_move`. The sim keeps a history of snapshots (capped at 300). Only players (not spectators) can undo.
5. **Direct join** — joining a room that already has an active game skips GameSelectScene and lands directly on PlayScene. The server auto-assigns the joining player a side.
6. **Restart** — any player can start a new game (`restart` message). Only players, not spectators.

---

## Where things live

### Server

- `apps/ws/src/games/gameroom.js` — room host, message routing, side assignment, hint dispatch, computer player logic
- `apps/ws/src/games/mcts_worker.js` — `worker_threads` wrapper; dynamically imports a hint module and calls `suggestMove(state)`
- `apps/ws/src/games/room_utils.js` — shared helpers: `safeBroadcast`, `send`, `countConnectedPlayers`, etc.

Per-game sim + hint modules (naming: `<game>_sim.js`, `<game>_hint.js`):

| Game | Sim | Hint | Notes |
|------|-----|------|-------|
| Go | `go_sim.js` | `go_hint.js` | GNU Go GTP subprocess (not MCTS) |
| Morris | `morris_sim.js` | `morris_hint.js` | UCT MCTS via worker |
| Fox & Geese | `foxgeese_sim.js` | `foxgeese_hint.js` | UCT MCTS via worker |
| Pirates & Bulgars | `piratesbulgars_sim.js` | `piratesbulgars_hint.js` | UCT MCTS via worker |
| Hex | `hex_sim.js` | `hex_hint.js` | UCT MCTS via worker |
| Checkers | `checkers_sim.js` | `checkers_hint.js` | UCT MCTS via worker |

### Client

- `gameroom/client/src/net.js` — WebSocket client; queues messages until `hello_ack`
- `gameroom/client/src/game/scenes/MenuScene.js` — create/join room; click room to join directly
- `gameroom/client/src/game/scenes/GameSelectScene.js` — game picker grid (tiles marked `implemented: true/false`)
- `gameroom/client/src/game/scenes/PlayScene.js` — board area, side panel, computer/level panels, hint marker, score overlay, pause menu
- `gameroom/client/src/game/renderers/go.js` — Go renderer (inside PlayScene directly, not yet extracted)
- `gameroom/client/src/game/renderers/morris.js`
- `gameroom/client/src/game/renderers/foxgeese.js`
- `gameroom/client/src/game/renderers/piratesbulgars.js`
- `gameroom/client/src/game/renderers/hex.js`
- `gameroom/client/src/game/renderers/checkers.js`

---

## Scene flow

```
MenuScene
  ├── Create room → GameSelectScene → PlayScene
  └── Join room (game already active) → PlayScene directly
                  (no game yet)       → GameSelectScene
```

Side selection happens inside PlayScene via the persistent right-side panel.

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
- `select_game { gameType }` — host picks the game; resets all player sides; auto-assigns host to the first side

### Side selection (all games)
- `select_side { side: 'black'|'white'|'both'|null }` — player picks their side; can be changed any time

### Universal game actions
- `undo_move` — undo last move; players only
- `redo_move` — redo (checkers, hex; where supported)
- `restart` — reset to new game, keep connections; players only
- `request_hint` — ask for move suggestion; hint broadcast to all players

### Computer player
- `set_computer { color }` — `null` (off), `'black'`, or `'white'`; requires `ws.playerId`
- `set_computer_level { level }` — `'easy'|'medium'|'hard'`; requires `ws.playerId`
- Computer settings persist across `restart` (stored in room state, not game state).

### Game-specific actions

| Message | Games | Fields |
|---------|-------|--------|
| `place_stone` | Go, Hex | `{ x, y }` or `{ row, col }` |
| `place_piece` | Morris | `{ pointIndex }` |
| `move_piece` | Morris, Fox&Geese, Pirates&Bulgars, Checkers | `{ from, to }` |
| `remove_piece` | Morris | `{ pointIndex }` |
| `pass_turn` | Go | (none) |
| `end_jump` | Fox&Geese, Pirates&Bulgars | (none — safety fallback) |
| `toggle_flying` | Morris | (none — toggles `flyingAlways` flag) |

### Server → client
- `room_joined { roomId, playerId, state }` — full room state including auto-assigned side
- `state { state }` — full room state after every mutation
- `room_list { rooms: [{ id, players, gameType }] }` — response to `get_rooms`
- `hint { move }` — suggested move (game-specific shape; `move: null` if no suggestion)
- `error { message }` — rejected action

---

## Room state shape

```json
{
  "tick": 42,
  "gameType": "go|checkers|morris|foxgeese|piratesbulgars|hex|...",
  "players": {
    "1": { "connected": true,  "side": "black" },
    "2": { "connected": true,  "side": "white" },
    "3": { "connected": false, "side": null },
    "4": { "connected": false, "side": null }
  },
  "computer": { "color": null, "level": "medium" },
  "game": { /* active sim state — see per-game shapes below */ }
}
```

---

## Side / color mechanics

- `room.state.players[pid].side` — room-level: `'black'`, `'white'`, `'both'`, or `null`
- `game.players[pid].color` — sim-level: the actual color string for that game, or `null`
- `'both'` is a room-level concept only. `gameroom.js` temporarily overrides `game.players[pid].color = game.turn` before calling the sim action, then restores on failure (`withBothSide()` helper).
- `select_side` updates both levels. Each sim exposes `selectColor(game, pid, color)`.
- On `select_game`: host auto-assigned to the first color (e.g. black).
- On `join_room` with active game: first free color auto-assigned.
- Renderers can export `sideLabels: { black, white, both }` to customize button text in both the side panel and computer panel (e.g. "🏴‍☠️ Pirates" instead of "Black").

---

## Computer player system

- Room state: `computer: { color: null|'black'|'white', level: 'easy'|'medium'|'hard' }`.
- `maybeComputerMove(room)` — called after every state-changing action. After a 500ms delay, runs the game's hint engine, then applies the move if the generation counter (`room._computerMoveGen`) still matches.
- **Generation counter**: incremented before every MCTS call; stale moves discarded if the gen doesn't match when MCTS resolves (handles undo/toggle/restart race conditions).
- `_actingColor(gameType, game)` — determines whose turn it is, handling:
  - Morris `pendingRemove` (acting color is `pendingRemove`)
  - FoxGeese `pendingJump` (always `'black'`)
  - PiratesBulgars `pendingJump` (always `'white'`)
  - Checkers `pendingJump` (always `game.turn`)
  - Otherwise: `game.turn`
- Multi-step turns: after applying a step (e.g. multi-jump capture), `maybeComputerMove(room)` is called recursively to continue the sequence.
- Supported for all 6 implemented games.

---

## Hint system

### Go — GNU Go via GTP
- Binary: `/usr/games/gnugo` (Debian `apt-get install gnugo`); override with `GNUGO_PATH` env var.
- `suggestMove(gameState, level)` — level maps to GTP level: easy=1, medium=5, hard=10.
- Flow: write SGF to temp file → spawn GTP mode → `loadsgf` + `genmove` → parse response → cleanup.
- **Not** run in a worker thread (async subprocess already non-blocking).
- Fallback: nearest-to-center empty cell; empty board: tengen immediately.

### All other games — JS MCTS via `mcts_worker.js`
- Each hint file exports `suggestMove(state)` (synchronous).
- `mcts_worker.js` runs in a `worker_threads` Worker to avoid blocking the main event loop.
- UCT selection with C=1.4; random playouts using the game's own `legalMovesFor()`.
- Time/iteration budgets controlled by `_budget(level)` in each hint file:
  - **easy**: ~200 iterations / 400ms
  - **medium**: ~2000–3000 iterations / 1500ms
  - **hard**: ~6000–8000 iterations / 4000ms
- The level is passed via `state._computerLevel` (injected by `gameroom.js` before calling the worker).
- Returns `{ move: { from, to } | { pointIndex } | { row, col } | null }`.

---

## Per-game state shapes

### Go (`go_sim.js`)
```json
{
  "board": "9×9 array — null | 'black' | 'white'",
  "turn": "black|white",
  "captures": { "black": 0, "white": 0 },
  "lastMove": { "x": 3, "y": 4 },
  "passCount": 0,
  "gameOver": false,
  "score": null,
  "history": [],
  "tick": 0,
  "players": { "1": { "connected": true, "color": "black" } }
}
```
Ko rule: `history[length-1]` is the board just before the opponent's last move — recreating it is a Ko violation.

### Morris (`morris_sim.js`)
```json
{
  "board": "Array(24) — null | 'black' | 'white'",
  "turn": "black|white",
  "phase": { "black": 1, "white": 1 },
  "piecesInHand": { "black": 9, "white": 9 },
  "piecesOnBoard": { "black": 0, "white": 0 },
  "pendingRemove": null,
  "flyingAlways": false,
  "lastMove": null,
  "gameOver": false,
  "winner": null,
  "history": [],
  "tick": 0,
  "players": { "1..4": { "connected": true, "color": null } }
}
```

### Fox & Geese (`foxgeese_sim.js`)
```json
{
  "board": "Array(33) — null | 'black' | 'white'",
  "turn": "black|white",
  "pendingJump": null,
  "geeseCaptured": 0,
  "lastMove": null,
  "gameOver": false,
  "winner": null,
  "history": [],
  "tick": 0,
  "players": { "1..4": { "connected": true, "color": null } }
}
```
Fox = `'black'` (index 16 at start). 13 Geese = `'white'` (indices 0–12). Fox wins when `geeseCaptured >= 10`; Geese win when fox has no legal moves.

### Pirates & Bulgars (`piratesbulgars_sim.js`)
Same topology and rules as Fox & Geese but with roles reversed:
- Pirates = `'white'` (the fox role — can capture)
- Bulgars = `'black'` (the geese role — cannot capture)

### Hex (`hex_sim.js`)
```json
{
  "board": "11×11 2D array — null | 'black' | 'white'",
  "turn": "black|white",
  "lastMove": { "row": 5, "col": 3 },
  "gameOver": false,
  "winner": null,
  "winningPath": [],
  "history": [],
  "tick": 0,
  "players": { "1..4": { "connected": true, "color": null } }
}
```
Black connects top↔bottom edges; White connects left↔right edges. Win by flood-fill from one edge to the other.

### Checkers (`checkers_sim.js`)
```json
{
  "board": "Array(32) of null | { color: 'black'|'white', king: bool }",
  "turn": "black|white",
  "pendingJump": null,
  "pendingMids": [],
  "piecesLeft": { "black": 12, "white": 12 },
  "lastMove": { "from": 0, "to": 9, "mid": 4, "color": "black", "captured": true },
  "gameOver": false,
  "winner": null,
  "history": [],
  "redoSnapshot": null,
  "tick": 0,
  "players": { "1..4": { "connected": true, "color": null } }
}
```
32-element flat array for dark squares. `cellToRC(idx)` / `rcToCell(row, col)` convert coordinates. Black pieces rows 0–2, White pieces rows 5–7. `pendingJump` + `pendingMids` track multi-jump chains. King promotion during multi-jump ends the turn.

---

## Renderer API

Each renderer is a module in `gameroom/client/src/game/renderers/<game>.js`:

```js
export default {
  showPassButton: false,
  sideLabels: { black: '...', white: '...', both: '...' },  // optional
  init(scene, config),        // config: { boardX, boardY, boardSize, onAction }
  draw(gameState, ctx),       // ctx: { myPid, mySide, canMove }
  showHint(hintMsg),
  clearHint(),
  resetSelection(),
  shutdown(),
  formatTurnText(state),
  formatTurnColor(state),
  formatCaptureText(state),
  getGameOverInfo(state),
};
```

`PlayScene` owns the side panel, computer/level panels, button row, score overlay, and pause menu. The renderer draws the board and handles piece interaction. `onAction(type, data)` is the callback for game actions (e.g. `onAction('move_piece', { from, to })`).

When a renderer exports `sideLabels`, both the side panel and computer panel buttons display the custom names (e.g. "🦊 Fox" instead of "Black").

---

## Key gotchas

- **All game actions** require `ws.playerId`. Spectators (`side: null`) can watch but not act.
- **Buttons**: faded buttons must call `disableInteractive()`, not just `setAlpha()`.
- **Game-over Continue**: hide overlay first, then send `undo_move` enough times to clear the terminal condition. For Go (2-pass end): two `undo_move` messages, 80ms apart.
- **History snapshots** are pre-commit. This matters for Ko (Go) and undo correctness in all games.
- **`history` cap**: 300 entries in `_pushSnapshot()` to prevent unbounded memory.
- **Multi-jump chaining**: `pendingJump` stays set until the chain ends; the computer player calls `maybeComputerMove()` recursively to continue.
- **Worker threads**: all MCTS runs in `mcts_worker.js` via `worker_threads`. Go uses a subprocess instead (already async).
- **`_budget(level)`**: every MCTS hint file reads `state._computerLevel` to select iteration/time budgets. The field is injected by `gameroom.js` before dispatching to the worker.
- **`server_error`**: PlayScene listens for `server_error` events and flashes hint status text for 2s.
- **`sideLabels`**: if the renderer doesn't export `sideLabels`, side/computer panels fall back to default "Black"/"White".