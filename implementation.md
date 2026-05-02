# Game Room — Implementation Checklist

> Master plan for the `/games/gameroom/` multi-game board games platform.
> Each session should plan first (read this file + relevant docs), then implement.
> Check off items as they are completed.

---

## Architecture overview

```
Browser (Phaser client)
  BootScene → MenuScene → GameSelectScene → PlayScene
                                             ↳ per-game renderer module
  |  WebSocket: /games/gameroom/ws
  v
Node WS backend
  apps/ws/src/games/gameroom.js   (room host, message routing)
  apps/ws/src/games/go_sim.js     (Go rules engine)
  apps/ws/src/games/go_hint.js    (GNU Go GTP subprocess)
  apps/ws/src/games/morris_sim.js (Nine Men's Morris rules engine)
  apps/ws/src/games/morris_hint.js (UCT MCTS hint engine for Morris)  apps/ws/src/games/foxgeese_sim.js  (Fox & Geese rules engine)
  apps/ws/src/games/foxgeese_hint.js (UCT MCTS hint engine for Fox & Geese)```

Room state shape (top-level, broadcast to all clients):
```json
{
  "tick": 0,
  "gameType": "go|checkers|chess|morris|cchk|foxgeese|hex|reversi|null",
  "players": { "1": { "connected": true, "side": "black|white|both|null" }, ... },
  "game": { /* active game sim state */ }
}
```

Messages (client → server):
- `select_game { gameType }` — host selects the game (resets all sides)
- `select_side { side }` — player picks their side (`'black'|'white'|'both'|null`)
- `undo_move` — undo last move (players only, not spectators)
- `restart` — reset game state, keep player connections (players only)
- Game-specific: `place_stone`, `move_piece`, `pass_turn`, `request_hint` (see each game section)

---

## Phase 0 — Rename & Infrastructure  ✅ DONE

- [x] Rename `go/` → `gameroom/`
- [x] Update `package.json` name → `gameroom-client`
- [x] Update `net.js`: `gameId: 'gameroom'`, WS path `/games/gameroom/ws`
- [x] Create `apps/ws/src/games/gameroom.js` (multi-game host)
- [x] Register `createGameRoomHost` in `server.js`
- [x] Update `Dockerfile`: `go-client-build` → `gameroom-client-build`
- [x] Update `Caddyfile`: add `gameroom` routes + WS proxy

---

## Phase 1 — Multi-game Menu & Shared Infrastructure  ✅ DONE

- [x] `GameSelectScene` — 8-tile game grid, Play button
- [x] `PlayScene` — reads `state.game` for Go data; pause overlay with vertical button stack (Resume / Game Select / Main Menu)
- [x] `MenuScene` — "GAME ROOM" title, white background, matches snake/maze layout; click room to join (no code input)
- [x] `go_sim.js` — keep as-is; referenced by `gameroom.js` for Go
- [x] `SideScene` — removed from scene flow (bypassed entirely for Go; side selection is in-game right panel)

---

## Phase 2 — Go (v2 UX + hints)  ✅ DONE

### Scene flow & side selection
- [x] `GameSelectScene.js`: routes directly to `PlayScene` (skips `SideScene`)
- [x] `MenuScene.js`: `room_joined` goes straight to `PlayScene` when room already has active game
- [x] `gameroom.js`: support `side: 'both'` — stored in room state; `GoSim.selectColor` receives `null` for 'both'
- [x] `gameroom.js`: `place_stone` / `pass_turn` override player color to `game.turn` when `side === 'both'`
- [x] `gameroom.js`: auto-assign side on `select_game` (creator → black) and `join_room` (first free side)
- [x] `PlayScene.js`: persistent right-side panel with ⚫ BLACK / ⚪ WHITE / ⚫⚪ BOTH buttons; selected side gold-highlighted
- [x] `PlayScene.js`: `_onCellClick` + `_drawGhost` allow `side === 'both'`
- [x] `PlayScene.js`: Pass / Undo buttons `disableInteractive()` when faded (not just alpha); `server_error` listener flashes status text

### Territory visualization
- [x] `go_sim.js` `estimateScore()`: returns `territoryCells: { black:[{x,y}], white:[{x,y}], neutral:[{x,y}] }`
- [x] `PlayScene.js`: small colored squares on territory cells at game-over; clears on Continue / restart

### GNU Go hints
- [x] `Dockerfile`: `apt-get install -y gnugo` in `games-backend` stage
- [x] `go_hint.js`: spawns `/usr/games/gnugo --mode gtp --level 5`; sends `loadsgf <tmpfile>` + `genmove <color>` via GTP stdin; fallback to nearest-center empty cell
- [x] `gameroom.js`: `request_hint` broadcasts hint to whole room via `safeBroadcast`
- [x] `net.js`: dispatches `hint` as `CustomEvent`
- [x] `PlayScene.js`: UNDO / PASS / 💡 HINT / ⏸ PAUSE button bar; hint button grays while thinking; small solid green circle marker; clears on next stone

### Bug fixes applied
- [x] Ko rule: `history[length-2]` → `history[length-1]`, guard `>= 2` → `>= 1`
- [x] `undo_move` / `restart`: added `!ws.playerId` guard (spectators cannot trigger)
- [x] Continue button: hides overlay first, then sends `undo_move` twice (80ms apart) to clear both passes
- [x] gnugo path: use `/usr/games/gnugo` (Debian `apt` does not add `/usr/games` to Node PATH)
- [x] gnugo `--loadsgf` flag unsupported in apt version → switched to GTP `loadsgf` command via stdin

### Verified
- [x] Build passes clean
- [x] Create room → GameSelectScene → Go tile → PlayScene; creator auto-assigned black
- [x] Second player joins → auto-assigned white, lands directly on PlayScene
- [x] `side: 'both'` allows solo play of both colors
- [x] Two passes → score overlay + territory squares; Continue resumes play
- [x] HINT → thinking text → green dot; clears on next stone
- [x] Ko rule enforced correctly
- [x] Spectators cannot undo or restart

---

## Phase 3 — Checkers

**Session plan:** Read this section + `docs/PROTOCOL.md`. Design sim state, then implement.

### Server sim: `apps/ws/src/games/gameroom_checkers_sim.js`

State shape:
```json
{
  "boardSize": 8,
  "board": "8×8 array — null | { color: 'red'|'black', king: bool }",
  "turn": "red|black",
  "selected": null,
  "legalMoves": [],
  "captures": { "red": 0, "black": 0 },
  "history": [],
  "gameOver": false,
  "winner": null,
  "players": { "1..4": { "connected": bool, "color": null } }
}
```

Rules to implement:
- [ ] Standard 8×8 checkerboard (dark squares only: pieces on dark squares)
- [ ] Initial setup: 12 red pieces (rows 0–2) and 12 black pieces (rows 5–7)
- [ ] Simple diagonal moves: forward only, 1 step
- [ ] Mandatory jump (capture): must capture if any capture is available
- [ ] Multi-jump: if after a capture another capture is available with the same piece, must continue
- [ ] King promotion: reach opponent's back rank → becomes king (moves in all 4 diagonals)
- [ ] King captures: can jump in all 4 diagonal directions
- [ ] Win: opponent has no pieces left OR opponent has no legal moves
- [ ] `legalMovesFor(state, color)` — helper used to validate moves and detect win
- [ ] Undo: store pre-move snapshot including `selected` and `legalMoves`

New message (client → server):
- `move_piece { from: {x,y}, to: {x,y} }` — handles both regular moves and multi-jump continuation

### Client renderer: `gameroom/client/src/game/renderers/checkers.js`

- [ ] Draw 8×8 board (alternating light/dark squares; pieces only on dark)
- [ ] Piece: filled circle (red or black), with a crown glyph for kings
- [ ] Highlight selected piece and valid destination squares
- [ ] Highlight mandatory captures in a distinct color (e.g. orange ring)
- [ ] After a capture, if more captures are available, keep piece selected
- [ ] Animate: brief scale-in on piece placement; captured piece fades out

### Hints
- [ ] `apps/ws/src/games/gameroom_checkers_hint.js` — JS MCTS: `suggestMove(state, timeBudgetMs=1500)` → `{ from:{x,y}, to:{x,y} } | null`. Uses `legalMovesFor()` from sim; random playout until no pieces remain or move limit.
- [ ] Route `request_hint` for `gameType === 'checkers'` in `gameroom.js`

### Integration
- [ ] Add `'checkers'` to `IMPLEMENTED` set in `gameroom.js`
- [ ] `move_piece` handler in `gameroom.js`: require `ws.playerId`; support `side: 'both'` override
- [ ] `undo_move` handler already routes to active sim — ensure checkers sim exposes `undoMove()`
- [ ] `request_hint` handler routes to `gameroom_checkers_hint.js` when `gameType === 'checkers'`
- [ ] `select_side` handler: checkers sim exposes `selectColor(game, pid, color)`
- [ ] Update `PlayScene` to delegate to checkers renderer when `state.gameType === 'checkers'`
- [ ] `join_room` auto-side: first free color (red/black) assigned; direct to PlayScene if game active
- [ ] Write `docs/gameroom_checkers_LLM.md`

---

## Phase 4 — Chess

**Session plan:** Largest implementation. Plan carefully before coding.

### Server sim: `apps/ws/src/games/gameroom_chess_sim.js`

State shape:
```json
{
  "board": "8×8 array — null | { type: 'P'|'N'|'B'|'R'|'Q'|'K', color: 'white'|'black' }",
  "turn": "white|black",
  "castlingRights": { "white": { "kSide": bool, "qSide": bool }, "black": { ... } },
  "enPassantTarget": null,
  "halfMoveClock": 0,
  "fullMoveNumber": 1,
  "inCheck": false,
  "checkmate": false,
  "stalemate": false,
  "history": [],
  "lastMove": null,
  "gameOver": false,
  "winner": null
}
```

Rules to implement:
- [ ] All piece movement rules: P (+ en passant + promotion), N, B, R, Q, K
- [ ] Castling (king-side and queen-side, with all prerequisite checks)
- [ ] En passant
- [ ] Pawn promotion (offer: Q, N, R, B — default to Q for kids)
- [ ] Legal move generation: a move is illegal if it leaves own king in check
- [ ] Check detection after every move
- [ ] Checkmate detection (no legal moves + in check)
- [ ] Stalemate detection (no legal moves + not in check)
- [ ] Fifty-move rule (optional for kids version — flag `fiftyMoveRule: false` by default)

New message (client → server):
- `move_piece { from: {x,y}, to: {x,y}, promotion?: 'Q'|'N'|'R'|'B' }`

### Client renderer: `gameroom/client/src/game/renderers/chess.js`

- [ ] 8×8 board with alternating cream/brown squares (classic chess look)
- [ ] Piece glyphs: Unicode chess symbols (♔♕♖♗♘♙ / ♚♛♜♝♞♟)
- [ ] Highlight selected piece, legal destinations
- [ ] Highlight king square in red when in check
- [ ] Promotion dialog: small overlay with 4 piece choices
- [ ] "Check!" banner shown prominently

### Hints
- [ ] Chess hints deferred — JS MCTS is too weak without an evaluation function. Future option: Stockfish WASM (separate decision, adds ~8 MB to client bundle).

### Integration
- [ ] Add `'chess'` to `IMPLEMENTED` in `gameroom.js`
- [ ] `move_piece` handler: require `ws.playerId`; support `side: 'both'` override
- [ ] `undo_move` routes to chess sim `undoMove()`; chess sim exposes `selectColor(game, pid, color)`
- [ ] `request_hint` routes to chess hint engine (deferred — Stockfish WASM or basic MCTS)
- [ ] `join_room` auto-side: white/black; direct to PlayScene if game active
- [ ] Write `docs/gameroom_chess_LLM.md`

---

## Phase 5 — Nine Men's Morris  ✅ DONE

### Server sim: `apps/ws/src/games/morris_sim.js`

Board representation:
```
24 named points; store as array index 0–23.
Adjacency list (symmetric edges). Mill groups = all valid lines of 3.
State: board[24] = null | 'white' | 'black'
```

Game phases:
- Phase 1 (Placing): each player places 9 pieces from hand
- Phase 2 (Moving): move a piece to an adjacent empty point
- Phase 3 (Flying): when a player has exactly 3 pieces, they may move to any empty point

- [x] Phase tracking per player: `piecesInHand`, `piecesOnBoard`
- [x] Mill detection: after every placement/move, check if any mill was formed
- [x] If mill formed → player must remove one opponent piece (`removing` phase); not from opponent's mill unless all are milled
- [x] Win: opponent has < 3 pieces (and hand empty) OR opponent has no legal moves in moving phase
- [x] Phase 2 → 3 (flying) transition: automatic when player has exactly 3 pieces on board
- [x] `flyingAlways` flag — host-toggleable rule variant (always allow flying)
- [x] Undo: stack of JSON snapshots (capped at 300); `undoMove()` exported
- [x] `legalMovesFor(state, color)` helper exported (used by hint engine)
- [x] `selectColor`, `setPlayerConnected`, `resetGame`, `refreshPhase` exported

New messages (client → server):
- `place_piece { pointIndex }` — phase 1
- `move_piece { from, to }` — phase 2/3
- `remove_piece { pointIndex }` — after forming a mill
- `toggle_flying` — toggles `flyingAlways` flag (calls `refreshPhase`)

### Client renderer: `gameroom/client/src/game/renderers/morris.js`

- [x] Draw the classic three-square board (nested squares with connecting lines, tan background)
- [x] 24 intersection points with hit areas (pointer-up, drag-and-drop support)
- [x] Drag-and-drop piece movement: ghost piece follows pointer, snaps on release
- [x] Highlight selected piece and valid destinations (green rings)
- [x] Highlight newly formed mills (yellow flash for 1.2s)
- [x] "Remove opponent piece" mode: red ring on removable pieces
- [x] `formatTurnText`, `formatTurnColor`, `formatCaptureText`, `getGameOverInfo` implemented
- [x] `showHint` / `clearHint`: blue ring on hinted point index (place/move/remove)
- [x] `resetSelection()` clears drag state on new tick

### Hints
- [x] `apps/ws/src/games/morris_hint.js` — UCT MCTS (C=1.4), up to 3000 iterations / 1500 ms; random rollouts capped at 80 ply
- [x] `request_hint` for `gameType === 'morris'` routes to `morrisHintSuggest` in `gameroom.js`; result broadcast as `{ type: 'hint', move }` where `move` is `{ type, pointIndex? from? to? }`

### Integration
- [x] `'morris'` added to `IMPLEMENTED` set in `gameroom.js`
- [x] `place_piece`, `move_piece`, `remove_piece` handlers with `ws.playerId` guard and `side: 'both'` override via `withBothSide()`
- [x] `toggle_flying` handler: flips `game.flyingAlways`, calls `MorrisSim.refreshPhase()`
- [x] `undo_move` routes to `MorrisSim.undoMove()`; `restart` routes to `MorrisSim.resetGame()`
- [x] `select_side` syncs to `MorrisSim.selectColor()` (`'both'` → `null` for sim)
- [x] `join_room` auto-assigns black/white; `setPlayerConnected` called on join/leave
- [x] `select_game` re-syncs connections and auto-assigns black to first connected player
- [x] `PlayScene`: `morrisRenderer` registered in renderer map; `actingColor` uses `pendingRemove` during removing phase
- [x] `PlayScene` pause overlay: 🕊 Flying ON/OFF toggle button (morris-only, sized +46px)
- [x] `docs/gameroom_morris_LLM.md` — not yet written

---

## Phase 6 — Chinese Checkers

**Session plan:** Hex coordinate math is the hard part.

### Server sim: `apps/ws/src/games/gameroom_cchk_sim.js`

Board: star-shaped hex grid. Use axial coordinates (q, r).
- 121 positions (standard 6-player Chinese Checkers)
- 2-player mode: use opposite corners; 6 pieces each (simplest for kids)
- OR: 10 pieces each (full standard; harder)

Rules:
- [ ] Adjacency in 6 hex directions
- [ ] Simple step: move to adjacent empty hex
- [ ] Hop: jump over an adjacent piece (own or opponent) to the empty hex beyond
- [ ] Chain hop: after a hop, may hop again (unlimited chain); or stop
- [ ] Win: first to fill the opposite starting corner
- [ ] Handle 2-player (recommended) and optionally 3/6 player

New messages:
- `move_piece { from: {q,r}, to: {q,r} }` — includes multi-hop path; server validates each hop

### Client renderer: `gameroom/client/src/game/renderers/cchk.js`

- [ ] Hex grid rendering (flat-top or pointy-top hexagons)
- [ ] 6 colored home corners (each player's start/destination)
- [ ] Show valid destinations on hover/select
- [ ] Chain hop preview: as player hops, show the growing path

### Hints
- [ ] `apps/ws/src/games/gameroom_cchk_hint.js` — JS MCTS: enumerate all single-step and chain-hop moves; evaluate by average Manhattan distance from pieces to destination corner.
- [ ] Route `request_hint` for `gameType === 'cchk'` in `gameroom.js`

### Integration
- [ ] Add `'cchk'` to `IMPLEMENTED` in `gameroom.js`
- [ ] `move_piece` handler: require `ws.playerId`; support `side: 'both'`
- [ ] `undo_move` routes to cchk sim; `selectColor(game, pid, color)` exposed
- [ ] `request_hint` routes to `gameroom_cchk_hint.js`
- [ ] `join_room` auto-side; direct to PlayScene if game active
- [ ] Write `docs/gameroom_cchk_LLM.md`

---

## Phase 7 — Fox and Geese (Pirates & Bulgars)  ✅ DONE

Theme: Fox = **Pirate** (`'black'` internally), Geese = **Bulgars** (`'white'` internally).
Side panel stays black/white; renderer displays Pirate/Bulgars text.

### Server sim: `apps/ws/src/games/foxgeese_sim.js`

Board: 33-point orthogonal cross grid (7×7 minus four corner 2×2 blocks).
- Fox starts at index 16 (center, col 3 row 3)
- 13 Geese start on rows 0–2 (indices 0–12)
- `COORDS[i]`, `POINT_POSITIONS[i]`, `ADJACENCY[i]` exported

- [x] Fox ('black') moves orthogonally to adjacent empty square, or captures by jumping over a Bulgar to the empty square beyond
- [x] Forced capture: if any capture is available fox must take it (`legalMovesFor` returns only captures when captures exist)
- [x] Multi-jump: after a capture, if more captures are available from the landing square, `pendingJump` is set; fox must continue. Turn stays `'black'`.
- [x] Bulgars ('white') move forward (row++) or sideways (row unchanged) to adjacent empty squares; no captures
- [x] Fox wins: `geeseCaptured >= 10` (≤3 Bulgars remain)
- [x] Geese win: fox has no legal moves on its turn
- [x] Undo: stack of JSON snapshots (cap 300); `undoMove()` exported
- [x] `resetGame(state)` preserves player connections
- [x] `selectColor`, `setPlayerConnected`, `legalMovesFor` exported

State shape:
```json
{
  "board": [null|"black"|"white" ...],   // 33 elements
  "turn": "black|white",
  "pendingJump": null,                    // index fox is continuing from, or null
  "geeseCaptured": 0,
  "players": { "1..4": { "connected": bool, "color": null } },
  "lastMove": { "type": "move", "from", "to", "color", "captured": bool },
  "gameOver": false,
  "winner": null,
  "history": [],
  "tick": 0
}
```

New message (client → server):
- `move_piece { from, to }` — used for both Pirate and Bulgar moves

### Client renderer: `gameroom/client/src/game/renderers/foxgeese.js`

- [x] Draw cross-shaped board: tan background, orthogonal lines between all adjacent pairs, small intersection dots
- [x] Fox (black): amber/orange circle with highlight glint
- [x] Bulgars (white): white circles with highlight glint
- [x] Click-to-select + drag-and-drop (mirrors Morris renderer pattern)
- [x] `pendingJump` auto-shows gold ring on jumping fox; only capture destinations shown
- [x] Green rings on valid destinations (captures or empty adjacents)
- [x] Hint: blue ring + arrow on `move.to`
- [x] `formatTurnText` → "🏴‍☠️ PIRATE to move" / "⚔️ BULGARS to move" / "continue jump!" / game-over text
- [x] `formatCaptureText` → "Bulgars captured: N  remaining: M"
- [x] `getGameOverInfo` → overlay with winner + New Game button
- [x] `showPassButton = false`

### Hints
- [x] `apps/ws/src/games/foxgeese_hint.js` — UCT MCTS (C=1.4), 2000 iter / 1500ms, 60-ply rollouts
  - Fox heuristic: proportion of Bulgars captured
  - Geese heuristic: fox mobility (fewer moves = better for geese)
- [x] `request_hint` for `gameType === 'foxgeese'` routes to `foxgeeseHintSuggest` in `gameroom.js`

### Integration
- [x] `'foxgeese'` added to `IMPLEMENTED` set in `gameroom.js`
- [x] `move_piece` case dispatches to `FoxGeeseSim.movePiece`; `actingColor = game.turn` (pendingJump keeps turn='black'); `withBothSide` used
- [x] `undo_move` routes to `FoxGeeseSim.undoMove()`; `restart` routes to `FoxGeeseSim.resetGame()`
- [x] `select_side` uses shared `_sideSims` map (refactored from per-game branches)
- [x] `join_room` and `select_game` use shared `_joinSims` / `_selectSims` maps; auto-assign black/white
- [x] `setPlayerConnected` called on join/leave for foxgeese
- [x] `foxgeeseRenderer` registered in `PlayScene` `RENDERERS` map
- [x] Architecture note: `select_game`, `join_room`, `select_side` handlers consolidated into sim-maps to ease future game additions
- [x] `docs/gameroom_foxgeese_LLM.md` — not yet written

---

## Phase 8 — Hex

**Session plan:** Win detection is a flood-fill from one edge to the other.

### Server sim: `apps/ws/src/games/hex_sim.js`

Board: 11×11 rhombus grid (hex cells). Use offset or axial coordinates.
- Black connects top to bottom; White connects left to right
- No draws possible

Rules:
- [x] Place a stone on any empty hex — no captures, no removal
- [x] Win detection: flood-fill from Black's top row to bottom row, or White's left column to right column
- [ ] Pie rule (swap rule): after Black's first move, White may choose to swap sides (strongly recommended for fairness)
  - `swap_sides` message — swaps colors, converts the first stone to the new color
- [x] Undo: revert last stone (and undo any swap if applicable)

New messages:
- `place_stone { row, col }` — place at hex cell coordinate
- `swap_sides` — available only on White's very first turn

### Client renderer: `gameroom/client/src/game/renderers/hex.js`

- [x] Draw 11×11 rhombus grid of hexagons (pointy-top, board leans right)
- [x] Color the two goal edges: Black on top/bottom bands, White on left/right bands
- [x] Stone: filled hex in player color
- [x] Winning chain: highlight the connected path after win

### Hints
- [x] `apps/ws/src/games/hex_hint.js` — JS MCTS (UCT, C=1.4, 3000 iters / 1500ms): place stone on any empty hex; evaluate terminal via flood-fill connectivity (same win check as game sim).
- [x] Route `request_hint` for `gameType === 'hex'` in `gameroom.js`

### Computer player (collaborative vs. computer)

Room state extended with `computer: { color: null, level: 'medium' }`.

- [x] `set_computer { color }` — toggle computer on/off (`null`, `'black'`, or `'white'`); requires `ws.playerId`
- [x] `set_computer_level { level }` — set difficulty (`'easy'`|`'medium'`|`'hard'`); requires `ws.playerId`
- [x] `computerPlaceStone(state, row, col)` in `hex_sim.js` — places as `state.turn`, no player validation
- [x] `maybeComputerMove(room)` in `gameroom.js` — after 500ms delay, runs MCTS via worker, applies move if generation counter still matches (stale moves discarded)
- [x] Called after: `place_stone`, `undo_move`, `redo_move`, `restart`, `set_computer`, `select_game`, `toggle_hex_size`
- [x] Computer settings persist across `restart` (room-level, not game-level)
- [x] PlayScene side panel: COMPUTER section (⏹ Off / ⚫ Black / ⚪ White) + LEVEL section (🟢 Easy / 🟡 Medium / 🔴 Hard)
- [ ] Difficulty levels not yet wired — all three use the same MCTS engine (3000 iters / 1500ms)

### Integration
- [x] Add `'hex'` to `IMPLEMENTED` in `gameroom.js`
- [x] `place_stone` handler (reuse message type): require `ws.playerId`; support `side: 'both'`
- [ ] `swap_sides` handler: require `ws.playerId`; available only on second player's very first turn
- [x] `undo_move` routes to hex sim; `selectColor(game, pid, color)` exposed
- [x] `request_hint` routes to `hex_hint.js`
- [x] `join_room` auto-side; direct to PlayScene if game active
- [ ] Write `docs/gameroom_hex_LLM.md`

---

## Phase 9 — Reversi (Othello)

**Session plan:** Flip animation is the key visual; legal move hints are essential for kids.

### Server sim: `apps/ws/src/games/gameroom_reversi_sim.js`

State shape:
```json
{
  "board": "8×8 — null | 'black' | 'white'",
  "turn": "black|white",
  "legalMoves": [{ "x": 3, "y": 2 }, ...],
  "counts": { "black": 2, "white": 2 },
  "history": [],
  "gameOver": false,
  "winner": null
}
```

Rules:
- [ ] Start: 2 black + 2 white discs in center (d4=white, e4=black, d5=black, e5=white)
- [ ] Place disc: must flip at least one opponent disc (in any of 8 directions)
- [ ] Flip all discs sandwiched between placed disc and another own disc in each direction
- [ ] `legalMoves(state, color)` — precomputed and stored in state after every move
- [ ] If current player has no legal moves → auto-pass; if both have no moves → game over
- [ ] Win: most discs when game ends; tie possible
- [ ] Undo: restore full prior board state

New message:
- `place_stone { x, y }` — reuse Go's message type (same semantics: place at intersection)

### Client renderer: `gameroom/client/src/game/renderers/reversi.js`

- [ ] 8×8 board with bright green felt-style background (classic Othello look)
- [ ] Discs: black and white filled circles
- [ ] Legal move hints: ghost discs or dots on all valid squares (vital for kids)
- [ ] Flip animation: tween disc scaleX from 1 → 0 → 1, swap color at 0 (like flipping a coin)
- [ ] Score display: disc counts for each color
- [ ] "No moves — passing!" notification when a player must pass

### Hints
- [ ] `apps/ws/src/games/gameroom_reversi_hint.js` — JS MCTS: enumerate legal placements from precomputed `legalMoves`; evaluate terminal by disc count. Reversi has small branching factor — MCTS gets strong quickly.
- [ ] Route `request_hint` for `gameType === 'reversi'` in `gameroom.js`

### Integration
- [ ] Add `'reversi'` to `IMPLEMENTED` in `gameroom.js`
- [ ] `place_stone` handler (reuse message type): require `ws.playerId`; support `side: 'both'`; auto-pass when player has no legal moves
- [ ] `undo_move` routes to reversi sim; `selectColor(game, pid, color)` exposed
- [ ] `request_hint` routes to `gameroom_reversi_hint.js`
- [ ] `join_room` auto-side; direct to PlayScene if game active
- [ ] Write `docs/gameroom_reversi_LLM.md`

---

## Phase 10 — Polish & Landing Page

- [ ] Add Game Room card to `infra/site/games/index.html` (alongside snake, maze, etc.)
- [x] Write `docs/gameroom_LLM.md` (platform doc: protocol, side selection, hints, undo, renderer pattern)
- [ ] Review all "Coming soon" tiles in `GameSelectScene` as games are completed
- [ ] Mobile/touch testing for all games (board hit zones, button sizes)
- [ ] Game rules summary text for pause overlay (one friendly paragraph per game)

---

## Cross-cutting concerns

These conventions apply to **every game** in Game Room. They were established during Go and must be carried forward consistently.

### Side selection
- Room-level: `state.players[pid].side` = `'black'|'white'|'both'|null`
- Sim-level: each sim has `players[pid].color` = the game's actual color string
- `'both'` is room-only. `gameroom.js` temporarily overrides `game.players[pid].color = game.turn` before calling the sim, then restores on failure. The sim never sees `'both'`.
- `select_side` updates both levels. Each sim must expose `selectColor(game, pid, color)`.
- On `select_game`: host auto-assigned to the first color.
- On `join_room` with active game: first free color auto-assigned; player lands on PlayScene directly.
- Side can be changed at any time mid-game.

### Hints
- All games provide a `request_hint` message. The server computes the suggestion and broadcasts it to the whole room.
- Go: GNU Go via GTP subprocess (`/usr/games/gnugo`; use GTP `loadsgf` command, not `--loadsgf` flag).
- All other games: JS MCTS in `gameroom_<game>_hint.js` — UCT, C=1.4, ~1.5 s budget, uses the sim's `legalMovesFor()`.
- Client UX: hint button grays + "thinking…" while pending; green dot on suggested cell; clears on next move.

### Undo
- Every sim maintains a `history` array of snapshots pushed **before** each commit (pre-commit snapshots).
- `undoMove()` pops the last snapshot and restores it. Cap at 300 entries.
- `undo_move` handler requires `ws.playerId` — spectators rejected.
- Undo button: `disableInteractive()` when history is empty or game is over (not just `setAlpha()`).

### Game-over / Continue
- Score overlay on `gameState.gameOver === true`.
- **Continue**: hide overlay first, then send `undo_move` as many times as needed to clear the terminal condition. For Go (2-pass end): two `undo_move` messages, 80 ms apart.
- **New Game** (`restart`): players only; server resets sim, keeps connections and sides.

### Joining a room
- `join_room` with an active game → `room_joined` state has `gameType` and `game` → client goes straight to `PlayScene`.
- `join_room` with no game started → client goes to `GameSelectScene`.

### Security guards on game actions
- `place_stone`, `move_piece`, `pass_turn`, `undo_move`, `restart`, `select_side`, `request_hint` all require `ws.playerId`. Spectators can watch but not act.

### Renderer pattern
Each game's client rendering is a module in `gameroom/client/src/game/renderers/<game>.js` with `init(scene, state)`, `draw(scene, state, helpers)`, `shutdown(scene)`. `PlayScene` owns the side panel, button row, hint marker, score overlay, and pause menu — the renderer only draws the board.

### State broadcast
Every server-side mutation ends with `safeBroadcast(room, { type: 'state', state: room.state })`. No partial updates.

---
