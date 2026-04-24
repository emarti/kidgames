/**
 * foxgeese_sim.js — Fox and Geese rules engine.
 * Theme: Fox and Geese.  Fox = 'black', Geese = 'white'.
 *
 * Board: 33-point Alquerque-style cross grid (7×7 minus four corner 2×2 blocks)
 * with diagonal connections at five specific centres.
 *
 *   Row layout (col range):
 *     Rows 0–1: cols 2–4  (indices  0–5)
 *     Rows 2–4: cols 0–6  (indices  6–26)
 *     Rows 5–6: cols 2–4  (indices 27–32)
 *
 *        2   3   4
 *    0 - 1 - 2
 *    |   |   |
 *    3 - 4 - 5
 *    | \ | / |
 *  6-7-8-9-10-11-12
 *  |  |  | \|/ |  |  |
 * 13-14-15-16-17-18-19   ← Fox starts at 16 (col 3, row 3)
 *  |  |  | /|\ |  |  |
 * 20-21-22-23-24-25-26
 *          | / | \ |
 *         27--28--29
 *          |   |   |
 *         30--31--32
 *
 * 15 geese: rows 0–2 (indices 0–12) + endpoints of row 3 (indices 13, 19).
 * Fox starts at index 16.
 *
 * Geese move first.
 * Geese may move one step in any direction along board lines (orthogonal or diagonal).
 * Fox must capture if any capture is available (forced capture, checkers-style).
 * Multi-jump: fox may (and must) keep jumping if further captures are available.
 * Fox wins when ≤4 geese remain.
 */

// ─── Board topology ──────────────────────────────────────────────────────────

// (col, row) coordinate for each of the 33 points.
export const COORDS = [
  // Row 0
  { col: 2, row: 0 }, { col: 3, row: 0 }, { col: 4, row: 0 },   // 0-2
  // Row 1
  { col: 2, row: 1 }, { col: 3, row: 1 }, { col: 4, row: 1 },   // 3-5
  // Row 2
  { col: 0, row: 2 }, { col: 1, row: 2 }, { col: 2, row: 2 },   // 6-8
  { col: 3, row: 2 }, { col: 4, row: 2 }, { col: 5, row: 2 }, { col: 6, row: 2 }, // 9-12
  // Row 3
  { col: 0, row: 3 }, { col: 1, row: 3 }, { col: 2, row: 3 },   // 13-15
  { col: 3, row: 3 }, { col: 4, row: 3 }, { col: 5, row: 3 }, { col: 6, row: 3 }, // 16-19
  // Row 4
  { col: 0, row: 4 }, { col: 1, row: 4 }, { col: 2, row: 4 },   // 20-22
  { col: 3, row: 4 }, { col: 4, row: 4 }, { col: 5, row: 4 }, { col: 6, row: 4 }, // 23-26
  // Row 5
  { col: 2, row: 5 }, { col: 3, row: 5 }, { col: 4, row: 5 },   // 27-29
  // Row 6
  { col: 2, row: 6 }, { col: 3, row: 6 }, { col: 4, row: 6 },   // 30-32
];

// Normalised (0..1) pixel positions for the renderer. x = col/6, y = row/6.
export const POINT_POSITIONS = COORDS.map(({ col, row }) => ({ x: col / 6, y: row / 6 }));

// (col, row) → index lookup.
const _IDX = {};
for (let i = 0; i < COORDS.length; i++) {
  _IDX[`${COORDS[i].col},${COORDS[i].row}`] = i;
}

function _lookup(col, row) {
  const v = _IDX[`${col},${row}`];
  return v !== undefined ? v : -1;
}

// Orthogonal adjacency list (4-connected), then augmented with diagonals.
export const ADJACENCY = COORDS.map(({ col, row }) => {
  const nb = [];
  for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const j = _lookup(col + dc, row + dr);
    if (j >= 0) nb.push(j);
  }
  return nb;
});

// Diagonal connections: each of the five 2×2-cell sub-squares of the cross has
// diagonals connecting its centre to its four corners (Alquerque-style).
const _DIAG_CENTERS = [[3, 1], [1, 3], [3, 3], [5, 3], [3, 5]];
for (const [cx, cy] of _DIAG_CENTERS) {
  const ci = _lookup(cx, cy);
  for (const [dc, dr] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const ni = _lookup(cx + dc, cy + dr);
    if (ni >= 0) {
      if (!ADJACENCY[ci].includes(ni)) ADJACENCY[ci].push(ni);
      if (!ADJACENCY[ni].includes(ci)) ADJACENCY[ni].push(ci);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns all valid fox capture moves from `foxIdx` on `board`. */
function _foxCaptures(board, foxIdx) {
  const caps = [];
  const { col: fc, row: fr } = COORDS[foxIdx];
  for (const midIdx of ADJACENCY[foxIdx]) {
    if (board[midIdx] !== 'white') continue;
    const { col: mc, row: mr } = COORDS[midIdx];
    const dc = mc - fc;
    const dr = mr - fr;
    const toIdx = _lookup(fc + 2 * dc, fr + 2 * dr);
    if (toIdx >= 0 && board[toIdx] === null && ADJACENCY[midIdx].includes(toIdx)) {
      caps.push({ from: foxIdx, mid: midIdx, to: toIdx });
    }
  }
  return caps;
}

function _foxIndex(board) {
  return board.indexOf('black');
}

function _pushSnapshot(state) {
  const snap = JSON.stringify({
    board:         state.board,
    turn:          state.turn,
    pendingJump:   state.pendingJump,
    geeseCaptured: state.geeseCaptured,
    players:       state.players,
    lastMove:      state.lastMove,
    gameOver:      state.gameOver,
    winner:        state.winner,
    tick:          state.tick,
  });
  state.history.push(snap);
  if (state.history.length > 300) state.history.shift();
}

/** Called after a fox move.  Handles multi-jump and turn advance. */
function _afterFoxMove(state, landIdx, wasCap) {
  if (wasCap) {
    const more = _foxCaptures(state.board, landIdx);
    if (more.length > 0) {
      state.pendingJump = landIdx;
      // Turn stays 'black'; do not check win yet.
      return;
    }
  }
  state.pendingJump = null;
  state.turn = 'white';
  _checkWin(state);
}

function _checkWin(state) {
  if (state.gameOver) return;

  // Fox wins if ≤4 geese remain (i.e. ≥11 captured of the original 15).
  if (state.geeseCaptured >= 11) {
    state.gameOver = true;
    state.winner   = 'black';
    return;
  }

  // Check win/stall after each full turn cycle.
  // Geese win if fox has no legal moves on fox's turn.
  if (state.turn === 'black') {
    const moves = legalMovesFor(state, 'black');
    if (moves.length === 0) {
      state.gameOver = true;
      state.winner   = 'white';
    }
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export function newGameState() {
  const board = Array(33).fill(null);
  board[16] = 'black';              // Fox at center
  // 15 geese: rows 0–2 (indices 0–12) + endpoints of row 3 (indices 13, 19)
  for (let i = 0; i <= 12; i++) board[i] = 'white';
  board[13] = 'white';
  board[19] = 'white';
  return {
    board,
    turn:          'white',         // Geese move first
    pendingJump:   null,            // index fox is currently jumping from, or null
    geeseCaptured: 0,
    players: {
      1: { connected: false, color: null },
      2: { connected: false, color: null },
      3: { connected: false, color: null },
      4: { connected: false, color: null },
    },
    lastMove:  null,
    gameOver:  false,
    winner:    null,
    history:   [],
    tick:      0,
  };
}

export function setPlayerConnected(state, pid, connected) {
  if (state.players[pid]) state.players[pid].connected = connected;
}

export function selectColor(state, pid, color) {
  if (state.players[pid]) state.players[pid].color = color;
}

/**
 * Returns all legal moves for `color` in the current state.
 * Used by the hint engine and win-detection.
 *
 * Fox moves: { type: 'move', from, to }
 * Geese moves: { type: 'move', from, to }
 */
export function legalMovesFor(state, color) {
  const moves = [];
  if (state.gameOver) return moves;

  if (color === 'black') {
    // Fox.
    const foxIdx = state.pendingJump !== null
      ? state.pendingJump
      : _foxIndex(state.board);
    if (foxIdx < 0) return moves;

    const caps = _foxCaptures(state.board, foxIdx);
    if (caps.length > 0 || state.pendingJump !== null) {
      // Forced capture (or continuation of multi-jump).
      for (const { from, to } of caps) moves.push({ type: 'move', from, to });
      return moves;
    }
    // No captures available: regular adjacent move.
    for (const nb of ADJACENCY[foxIdx]) {
      if (state.board[nb] === null) moves.push({ type: 'move', from: foxIdx, to: nb });
    }
    return moves;
  }

  if (color === 'white') {
    // Geese: move one step in any direction along board lines.
    if (state.pendingJump !== null) return moves; // fox is mid-jump; not geese's turn
    for (let i = 0; i < 33; i++) {
      if (state.board[i] !== 'white') continue;
      for (const nb of ADJACENCY[i]) {
        if (state.board[nb] === null) {
          moves.push({ type: 'move', from: i, to: nb });
        }
      }
    }
    return moves;
  }

  return moves;
}

export function movePiece(state, pid, from, to) {
  if (state.gameOver) return { ok: false, error: 'Game is over' };

  const color = state.players[pid]?.color;
  if (!color) return { ok: false, error: 'No color assigned' };

  // During pendingJump, only fox (black) may act, and must continue from pendingJump.
  if (state.pendingJump !== null) {
    if (color !== 'black')                 return { ok: false, error: 'Not your turn' };
    if (from !== state.pendingJump)        return { ok: false, error: 'Must continue jump from current position' };
  } else {
    if (color !== state.turn)              return { ok: false, error: 'Not your turn' };
  }

  // Validate legality.
  const legal   = legalMovesFor(state, color);
  const isLegal = legal.some((m) => m.from === from && m.to === to);
  if (!isLegal) return { ok: false, error: 'Illegal move' };

  _pushSnapshot(state);

  // Detect capture: fox jumps over an adjacent goose to land 2 squares away.
  let captured = false;
  if (color === 'black') {
    const { col: fc, row: fr } = COORDS[from];
    const { col: tc, row: tr } = COORDS[to];
    const dc = tc - fc;
    const dr = tr - fr;
    if (Math.abs(dc) === 2 || Math.abs(dr) === 2) {
      const midIdx = _lookup(fc + dc / 2, fr + dr / 2);
      if (midIdx >= 0 && state.board[midIdx] === 'white') {
        state.board[midIdx] = null;
        state.geeseCaptured++;
        captured = true;
      }
    }
  }

  state.board[from] = null;
  state.board[to]   = color;
  state.lastMove = { type: 'move', from, to, color, captured };
  state.tick++;

  if (color === 'black') {
    _afterFoxMove(state, to, captured);
  } else {
    // Geese: no captures, just advance turn.
    state.turn = 'black';
    _checkWin(state);
  }

  return { ok: true };
}

export function undoMove(state) {
  if (state.history.length === 0) return { ok: false, error: 'Nothing to undo' };
  const snap = JSON.parse(state.history.pop());
  Object.assign(state, snap);
  state.tick++;
  return { ok: true };
}

export function resetGame(state) {
  const players = state.players;
  const fresh   = newGameState();
  Object.assign(state, fresh);
  state.players = players;
  for (const pid of [1, 2, 3, 4]) {
    if (players[pid]) state.players[pid] = { ...players[pid] };
  }
}
