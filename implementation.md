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
  apps/ws/src/games/gameroom.js            (room host, message routing)
  apps/ws/src/games/mcts_worker.js         (worker_threads wrapper for MCTS)
  apps/ws/src/games/go_sim.js              (Go rules engine)
  apps/ws/src/games/go_hint.js             (GNU Go GTP subprocess)
  apps/ws/src/games/morris_sim.js          (Nine Men's Morris rules engine)
  apps/ws/src/games/morris_hint.js         (UCT MCTS hint engine for Morris)
  apps/ws/src/games/foxgeese_sim.js        (Fox & Geese rules engine)
  apps/ws/src/games/foxgeese_hint.js       (UCT MCTS hint engine for Fox & Geese)
  apps/ws/src/games/piratesbulgars_sim.js  (Pirates & Bulgars variant rules engine)
  apps/ws/src/games/piratesbulgars_hint.js (UCT MCTS hint engine for Pirates & Bulgars)
  apps/ws/src/games/hex_sim.js             (Hex rules engine)
  apps/ws/src/games/hex_hint.js            (UCT MCTS hint engine for Hex)
  apps/ws/src/games/checkers_sim.js        (American Checkers rules engine)
  apps/ws/src/games/checkers_hint.js       (UCT MCTS hint engine for Checkers)
```

Room state shape (top-level, broadcast to all clients):
```json
{
  "tick": 0,
  "gameType": "go|checkers|chess|morris|cchk|foxgeese|hex|piratesbulgars|reversi|null",
  "players": { "1": { "connected": true, "side": "black|white|both|null" }, ... },
  "computer": { "color": null, "level": "medium" },
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

## Phase 3 — Checkers  ✅ DONE

### Server sim: `apps/ws/src/games/checkers_sim.js`

Board: 32-element flat array representing the 32 dark squares of an 8×8 board.
- `cellToRC(idx)` / `rcToCell(row, col)` convert between cell index and grid coordinates.
- Black pieces: rows 0–2 (cells 0–11), White pieces: rows 5–7 (cells 20–31). Black moves first.

State shape:
```json
{
  "board": "Array(32) of null | { color: 'black'|'white', king: bool }",
  "turn": "black|white",
  "pendingJump": null,
  "pendingMids": [],
  "piecesLeft": { "black": 12, "white": 12 },
  "players": { "1..4": { "connected": bool, "color": null } },
  "lastMove": { "from": 0, "to": 9, "mid": 4, "color": "black", "captured": true },
  "gameOver": false,
  "winner": null,
  "history": [],
  "redoSnapshot": null,
  "tick": 0
}
```

Rules implemented:
- [x] Standard 8×8 checkerboard (dark squares only via 32-cell flat array)
- [x] Initial setup: 12 black pieces (rows 0–2) and 12 white pieces (rows 5–7)
- [x] Simple diagonal moves: forward only, 1 step
- [x] Mandatory jump (capture): must capture if any capture is available
- [x] Multi-jump: `pendingJump` holds cell index during a multi-jump chain; `pendingMids` tracks captured cells to prevent re-capture
- [x] King promotion: reach opponent's back rank → becomes king (moves in all 4 diagonals); promotion during multi-jump ends the turn
- [x] King captures: can jump in all 4 diagonal directions
- [x] Win: opponent has no pieces left OR opponent has no legal moves
- [x] `legalMovesFor(state, color)` — exported; validates moves and detects win
- [x] Undo/Redo: `undoMove()`, `redoMove()`, `resetGame()` exported; snapshot history capped at 300
- [x] `computerMovePiece(state, from, to)` — plays as `state.turn`, no player validation

New message (client → server):
- `move_piece { from, to }` — cell indices; handles both regular moves and multi-jump continuation

### Client renderer: `gameroom/client/src/game/renderers/checkers.js`

- [x] Draw 8×8 board (tan `0xf0d9b5` / brown `0xb58863`; pieces only on dark squares)
- [x] Piece: filled circle (charcoal for black, crimson for white); kings shown with gold ring + center dot
- [x] Click-click + drag interaction; 32 hit zones on dark squares
- [x] Highlight selected piece (green ring) and valid destination squares (green overlay)
- [x] `pendingJump` piece shown with gold ring; only capture destinations highlighted
- [x] Hint: blue arrow from → to + blue ring on destination
- [x] `sideLabels: { black: '⚫ Dark', white: '🔴 Red', both: '⚫🔴 Both' }`

### Hints
- [x] `apps/ws/src/games/checkers_hint.js` — UCT MCTS (C=1.4), 80-ply rollouts; difficulty budgets: easy=200iter/400ms, medium=2000iter/1500ms, hard=6000iter/4000ms
- [x] Heuristic: weighted piece count (kings = 1.5)
- [x] Route `request_hint` for `gameType === 'checkers'` in `gameroom.js`

### Integration
- [x] `'checkers'` added to `IMPLEMENTED` set in `gameroom.js`
- [x] `move_piece` handler with `ws.playerId` guard and `side: 'both'` override via `withBothSide()`
- [x] `undo_move` / `redo_move` route to `CheckersSim.undoMove()` / `CheckersSim.redoMove()`
- [x] `restart` routes to `CheckersSim.resetGame()`
- [x] `request_hint` routes to `checkers_hint.js` via `mctsInWorker()`
- [x] `select_side` uses shared `_sideSims` map with `CheckersSim`
- [x] `checkersRenderer` registered in `PlayScene` `RENDERERS` map
- [x] `GameSelectScene`: checkers tile `implemented: true`
- [x] `maybeComputerMove`: checkers supported; dispatches via MCTS worker → `CheckersSim.computerMovePiece()`
- [x] `_actingColor()`: handles checkers pendingJump (returns `game.turn`)

---

## Phase 4 — Chess

**Key decisions:**
- Board: flat `Array(64)` indexed `row*8+col` (consistent with checkers). `from`/`to` in `move_piece` are integers. Optional `promotion` field ('Q'|'N'|'R'|'B', default 'Q').
- File name: `chess_sim.js` (not `gameroom_chess_sim.js`) — consistent with all other sims.
- White orientation: row 0 = black's back rank, row 7 = white's back rank (white plays "up").
- Piece rendering: Phaser `Text` objects with Unicode glyphs (♔♕♖♗♘♙ / ♚♛♜♝♞♟), pooled per draw call.
- Hints/computer: minimax with alpha-beta (depth 1/2/3 by level), material evaluation. Runs in existing `mcts_worker.js` thread.
- No fifty-move draw triggered (clock tracked but draw not forced — kids version).
- `sideLabels: { black:'♛ Black', white:'♔ White', both:'♔♛ Both' }`.

### Server sim: `apps/ws/src/games/chess_sim.js`

State shape:
```json
{
  "board": "Array(64) — null | { type: 'P'|'N'|'B'|'R'|'Q'|'K', color: 'white'|'black' }",
  "turn": "white|black",
  "castlingRights": { "white": { "kSide": true, "qSide": true }, "black": { "kSide": true, "qSide": true } },
  "enPassantTarget": null,
  "halfMoveClock": 0,
  "fullMoveNumber": 1,
  "inCheck": false,
  "checkmate": false,
  "stalemate": false,
  "lastMove": null,
  "history": [],
  "redoSnapshot": null,
  "gameOver": false,
  "winner": null,
  "players": { "1..4": { "connected": bool, "color": null } },
  "tick": 0
}
```

Rules to implement:
- [x] Coordinate helpers: `idx(row,col)=row*8+col`, `toRC(idx)→{row,col}`
- [x] `newGameState()` — standard starting position (white row 7, black row 0)
- [x] `_pawnMoves(board, idx, color, enPassantTarget)` — forward 1/2, diagonal captures, en passant
- [x] `_knightMoves(board, idx, color)` — 8 L-shapes
- [x] `_slidingMoves(board, idx, color, dirs)` — shared for B/R/Q
- [x] `_kingMoves(board, idx, color)` — 1-square + castling candidates
- [x] `isInCheck(board, color)` — does any opponent piece attack the color's king?
- [x] `legalMovesFor(state, color)` — pseudo-legal → simulate → filter leaving own king in check; validate castling (king not in check, path clear, no passing through attacked square). Returns `[{from, to, promotion?}]`
- [x] `_applyMove(state, from, to, promotion)` — move piece; handle en passant capture; handle castling (rook also moves); handle promotion; update castlingRights on rook/king move; update enPassantTarget; update halfMoveClock/fullMoveNumber; set inCheck/checkmate/stalemate; set gameOver/winner
- [x] `movePiece(state, pid, from, to, promotion='Q')` — validate color===turn, check legality, _pushSnapshot, _applyMove. Returns {ok, error}
- [x] `computerMovePiece(state, from, to, promotion='Q')` — same without pid check
- [x] `_pushSnapshot(state)` — JSON.stringify(board, turn, castlingRights, enPassantTarget, halfMoveClock, fullMoveNumber, inCheck, checkmate, stalemate, lastMove, gameOver, winner, tick); cap at 300
- [x] `undoMove(state)` — save redoSnapshot, pop+restore. Returns {ok, error}
- [x] `redoMove(state)` — push current to history, restore redoSnapshot. Returns {ok, error}
- [x] `resetGame(state)` — fresh state, preserve players
- [x] `setPlayerConnected(state, pid, connected)` / `selectColor(state, pid, color)`

New message (client → server):
- `move_piece { from, to, promotion? }` — integer indices; promotion only needed when pawn reaches back rank

### Client renderer: `gameroom/client/src/game/renderers/chess.js`

- [x] Coordinate helpers mirroring sim: `_idx(row,col)`, `_toRC(idx)`, `_px(idx)→{x,y}`
- [x] Graphics layers: `_boardGfx` (depth 10), `_markerGfx` (depth 11), `_checkGfx` (depth 9), `_hintGfx` (depth 13), `_dragGfx` (depth 16); promotion overlay depth 20
- [x] `_drawBoard(highlightCells)` — 8×8 all squares, `LIGHT_SQ=0xf0d9b5` / `DARK_SQ=0xb58863`, border, green tint on legal destinations
- [x] `_drawCheckHighlight(state)` — red tint on king square when `state.inCheck`
- [x] `_drawLastMoveMarker(lastMove)` — tint from/to squares with color-coded alpha
- [x] Piece text pool: `_pieceTexts=[]` Phaser Text objects, recycled each `draw()`. Symbols: `{white:{K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'}, black:{K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟'}}`. White pieces: white fill + dark shadow. Black pieces: near-black fill + light shadow. Font: `'Arial, "Segoe UI Symbol", "Noto Chess", sans-serif'`
- [x] 64 hit zones (all squares), depth 15; `_onZoneDown(idx)` handles click-click + drag
- [x] `_computeLegalDests(gameState, fromIdx)` — client-side pseudo-legal move mirror for highlighting; server re-validates anyway
- [x] Pawn-to-back-rank triggers `_showPromoDialog(from, to)` before sending `move_piece`; dialog: 4 Phaser Text buttons (Q/N/R/B), depth 20, closed after selection
- [x] Drag: pointermove/pointerup pattern identical to checkers
- [x] `showHint(hintMsg)` — arrow from `_px(move.from)` to `_px(move.to)` + ring on dest; same as checkers
- [x] `clearHint()`, `resetSelection()`, `shutdown()` — same pattern as checkers
- [x] `formatTurnText(state)` — "Check!" suffix; stalemate → "DRAW"; checkmate → winner
- [x] `formatTurnColor(state)` — white→`'#ffffff'`, black→`'#aaaaaa'`, check→`'#ff4444'`, game over→`'#ffd700'`
- [x] `formatCaptureText(state)` — empty string
- [x] `getGameOverInfo(state)` — checkmate→winner text, stalemate→"DRAW"; buttons: New Game + Continue
- [x] `showPassButton: false`
- [x] `sideLabels: { black:'♛ Black', white:'♔ White', both:'♔♛ Both' }`

### Hints / computer: `apps/ws/src/games/chess_hint.js`

- [x] Material values: P=100, N=320, B=330, R=500, Q=900, K=20000
- [x] `_evaluate(board, color)` — sum material + piece-square table bonus for color minus opponent
- [x] `_minimax(state, depth, alpha, beta, maximizing, rootColor)` — alpha-beta; depth 0 → return `_evaluate`; uses `legalMovesFor` + cloned state + `_applyMove`
- [x] `suggestMove(state)` (exported) — reads `state._computerLevel`; easy=depth 1 (random legal move), medium=depth 2, hard=depth 3 with 4s hard timeout returning best-found-so-far. Returns `{ move: {from, to, promotion?} | null }`

### Integration

- [x] `import * as ChessSim from './chess_sim.js'` in `gameroom.js`
- [x] Add `'chess'` to `IMPLEMENTED` set in `gameroom.js`
- [x] `newGameSimState`: add chess branch → `ChessSim.newGameState()`
- [x] `onClose`: add `else if (gameType === 'chess') ChessSim.setPlayerConnected(...)`
- [x] `_sideSims`: add `chess: ChessSim`
- [x] `move_piece` case: add chess branch with `promotion` field → `withBothSide(...)` → `ChessSim.movePiece(game, pid, from, to, promotion)`
- [x] `undo_move` case: add `else if (gameType === 'chess') result = ChessSim.undoMove(game)`
- [x] `redo_move` case: add chess branch → `ChessSim.redoMove(game)`
- [x] `restart` case: add `else if (gameType === 'chess') ChessSim.resetGame(game)`
- [x] `request_hint` case: add chess branch → `mctsInWorker('./chess_hint.js', snap)` → broadcast
- [x] `maybeComputerMove`: add `'chess'` to allowed list; chess branch → `mctsInWorker('./chess_hint.js', snap)` → `ChessSim.computerMovePiece(g2, move.from, move.to, move.promotion ?? 'Q')`
- [x] `PlayScene.js`: `import chessRenderer from '../renderers/chess.js'`; add `chess: chessRenderer` to `RENDERERS`
- [x] `GameSelectScene.js`: chess tile `implemented: true`
- [x] `join_room` auto-side: white/black; direct to PlayScene if game active (no change needed — generic path handles it)

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
- [x] `sideLabels: { black: '🦊 Fox', white: '🪿 Geese', both: '🦊🪿 Both' }`

### Hints
- [x] `apps/ws/src/games/foxgeese_hint.js` — UCT MCTS (C=1.4), 60-ply rollouts; difficulty budgets: easy=200iter/400ms, medium=2000iter/1500ms, hard=6000iter/4000ms
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
- [x] Difficulty levels wired via `_budget(level)` in each hint file: easy=200iter/400ms, medium=2000–3000iter/1500ms, hard=6000–8000iter/4000ms

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
- Go: GNU Go via GTP subprocess (`/usr/games/gnugo`; use GTP `loadsgf` command, not `--loadsgf` flag). Difficulty via GTP level: easy=1, medium=5, hard=10.
- All other games: JS MCTS in `<game>_hint.js` — UCT, C=1.4, time-budgeted via `_budget(level)`. Runs in a `worker_threads` Worker via `mcts_worker.js` to avoid blocking the main event loop.
- Client UX: hint button grays + "thinking…" while pending; marker on suggested cell; clears on next move.

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

### Computer player (collaborative vs. computer)
- Room state: `computer: { color: null|'black'|'white', level: 'easy'|'medium'|'hard' }` — persists across `restart`.
- `set_computer { color }` / `set_computer_level { level }` — require `ws.playerId`.
- `maybeComputerMove(room)` — called after any state-changing action. After 500ms delay, runs the game's hint engine (MCTS worker or GNU Go), then applies the move if the generation counter (`room._computerMoveGen`) still matches.
- Generation counter prevents stale moves after undo/toggle/restart.
- `_actingColor(gameType, game)` — determines whose turn it is, handling Morris `pendingRemove`, FoxGeese/PiratesBulgars/Checkers `pendingJump`.
- Multi-step turns (multi-jump, post-mill removal): after applying a step, `maybeComputerMove(room)` is called recursively to continue the sequence.
- Each sim exposes `computerMovePiece()` / `computerPlaceStone()` / `computerRemovePiece()` — these act as `state.turn` without player ID validation.
- Supported for all 6 implemented games: Go, Morris, Fox & Geese, Pirates & Bulgars, Hex, Checkers.

### Renderer pattern
Each game's client rendering is a module in `gameroom/client/src/game/renderers/<game>.js`:

```js
export default {
  showPassButton: false,          // whether PlayScene shows a Pass button
  sideLabels: { black, white, both },  // optional custom labels for side + computer panels
  init(scene, config),            // config: { boardX, boardY, boardSize, onAction }
  draw(gameState, ctx),           // ctx: { myPid, mySide, canMove }
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

`PlayScene` owns the side panel, button row, score overlay, pause menu, and computer/level panels. The renderer only draws the board and pieces. When a renderer exports `sideLabels`, both the side panel and computer panel buttons use them (e.g. "🏴‍☠️ Pirates" instead of "Black").

### State broadcast
Every server-side mutation ends with `safeBroadcast(room, { type: 'state', state: room.state })`. No partial updates.

---
