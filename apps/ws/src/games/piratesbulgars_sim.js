/**
 * piratesbulgars_sim.js — Pirates and Bulgars rules engine.
 * Pirates = 'white' (24 pieces), Bulgars = 'black' (2 pieces).
 *
 * Board: 33-point orthogonal cross grid (same as Fox and Geese).
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
 *    |   |   |
 *  6-7-8-9-10-11-12
 *  |  |  |  |  |  |  |
 * 13-14-15-16-17-18-19
 *  |  |  |  |  |  |  |
 * 20-21-22-23-24-25-26
 *          |   |   |
 *         27--28--29      ← Fortress: indices 22-24, 27-29, 30-32
 *          |   |   |
 *         30--31--32
 *
 * Fortress: 9-point bottom arm (rows 4–6, cols 2–4).
 *   Indices: 22, 23, 24, 27, 28, 29, 30, 31, 32
 *
 * Initial setup:
 *   24 Pirates on all non-fortress points (indices 0–21, 25, 26).
 *   2 Bulgars at indices 28 (row 5, col 3) and 31 (row 6, col 3).
 *
 * Pirates move first. Pirates move only toward fortress (row ≥ current row).
 * Bulgars move any direction. Bulgars capture by jumping (optional, multi-jump allowed).
 *
 * Pirates win: fill all 9 fortress points OR both Bulgars have no legal moves.
 * Bulgars win: pirates reduced below 9 (can't fill fortress).
 */

// ─── Board topology ──────────────────────────────────────────────────────────

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

export const POINT_POSITIONS = COORDS.map(({ col, row }) => ({ x: col / 6, y: row / 6 }));

const _IDX = {};
for (let i = 0; i < COORDS.length; i++) {
  _IDX[`${COORDS[i].col},${COORDS[i].row}`] = i;
}

function _lookup(col, row) {
  const v = _IDX[`${col},${row}`];
  return v !== undefined ? v : -1;
}

export const ADJACENCY = COORDS.map(({ col, row }) => {
  const nb = [];
  for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const j = _lookup(col + dc, row + dr);
    if (j >= 0) nb.push(j);
  }
  return nb;
});

// Diagonal connections: each of the five 2×2-cell squares has diagonals
// connecting its center to its four corners.
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

// Fortress: 9-point bottom arm (rows 4–6, cols 2–4).
export const FORTRESS = new Set([22, 23, 24, 27, 28, 29, 30, 31, 32]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns all valid bulgar capture jumps from `bulgarIdx` on `board`. */
function _bulgarCaptures(board, bulgarIdx) {
  const caps = [];
  const { col: bc, row: br } = COORDS[bulgarIdx];
  for (const midIdx of ADJACENCY[bulgarIdx]) {
    if (board[midIdx] !== 'white') continue;
    const { col: mc, row: mr } = COORDS[midIdx];
    const dc = mc - bc;
    const dr = mr - br;
    const toIdx = _lookup(bc + 2 * dc, br + 2 * dr);
    if (toIdx >= 0 && board[toIdx] === null && ADJACENCY[midIdx].includes(toIdx)) {
      caps.push({ from: bulgarIdx, mid: midIdx, to: toIdx });
    }
  }
  return caps;
}

function _pushSnapshot(state) {
  const snap = JSON.stringify({
    board:           state.board,
    turn:            state.turn,
    pendingJump:     state.pendingJump,
    piratesCaptured: state.piratesCaptured,
    players:         state.players,
    lastMove:        state.lastMove,
    gameOver:        state.gameOver,
    winner:          state.winner,
    tick:            state.tick,
  });
  state.history.push(snap);
  if (state.history.length > 300) state.history.shift();
}

/** Called after a bulgar move. Handles multi-jump and turn advance. */
function _afterBulgarMove(state, landIdx, wasCap) {
  if (wasCap) {
    const more = _bulgarCaptures(state.board, landIdx);
    if (more.length > 0) {
      state.pendingJump = landIdx;
      // Turn stays 'black'; player may continue jumping or end turn.
      return;
    }
  }
  state.pendingJump = null;
  state.turn = 'white';
  _checkWin(state);
}

function _checkWin(state) {
  if (state.gameOver) return;

  // Bulgars win if pirates reduced below 9 (can't fill 9 fortress points).
  const pirateCount = state.board.filter(c => c === 'white').length;
  if (pirateCount < 9) {
    state.gameOver = true;
    state.winner   = 'black';
    return;
  }

  // Pirates win if all 9 fortress points are occupied by pirates.
  let fortressFilled = true;
  for (const idx of FORTRESS) {
    if (state.board[idx] !== 'white') { fortressFilled = false; break; }
  }
  if (fortressFilled) {
    state.gameOver = true;
    state.winner   = 'white';
    return;
  }

  // Pirates also win if both Bulgars have no legal moves on Bulgars' turn.
  if (state.turn === 'black' && state.pendingJump === null) {
    const bulgarMoves = legalMovesFor(state, 'black');
    if (bulgarMoves.length === 0) {
      state.gameOver = true;
      state.winner   = 'white';
    }
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export function newGameState() {
  const board = Array(33).fill(null);
  // Place pirates on all non-fortress points.
  for (let i = 0; i < 33; i++) {
    if (!FORTRESS.has(i)) board[i] = 'white';
  }
  // Place 2 bulgars in the fortress center column.
  board[28] = 'black'; // row 5, col 3
  board[31] = 'black'; // row 6, col 3
  return {
    board,
    turn:            'white',       // Pirates move first
    pendingJump:     null,          // index bulgar is currently jumping from, or null
    piratesCaptured: 0,
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
 *
 * Pirate moves: { type: 'move', from, to }
 * Bulgar moves: { type: 'move', from, to }
 */
export function legalMovesFor(state, color) {
  const moves = [];
  if (state.gameOver) return moves;

  if (color === 'black') {
    // Bulgars: move any direction or capture by jumping. Captures are optional.
    if (state.pendingJump !== null) {
      // Mid multi-jump: only capture moves from the pending position.
      const caps = _bulgarCaptures(state.board, state.pendingJump);
      for (const { from, to } of caps) moves.push({ type: 'move', from, to });
      return moves;
    }
    for (let i = 0; i < 33; i++) {
      if (state.board[i] !== 'black') continue;
      // Captures.
      const caps = _bulgarCaptures(state.board, i);
      for (const { from, to } of caps) moves.push({ type: 'move', from, to });
      // Regular adjacent moves.
      for (const nb of ADJACENCY[i]) {
        if (state.board[nb] === null) moves.push({ type: 'move', from: i, to: nb });
      }
    }
    return moves;
  }

  if (color === 'white') {
    // Pirates: forward (row increases) or sideways (row stays same), not backward.
    if (state.pendingJump !== null) return moves; // bulgar is mid-jump; not pirates' turn
    for (let i = 0; i < 33; i++) {
      if (state.board[i] !== 'white') continue;
      const fromRow = COORDS[i].row;
      for (const nb of ADJACENCY[i]) {
        if (state.board[nb] === null && COORDS[nb].row >= fromRow) {
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

  // During pendingJump, only bulgar (black) may act.
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

  // Detect capture: bulgar moves 2 squares in a straight orthogonal line.
  let captured = false;
  if (color === 'black') {
    const { col: bc, row: br } = COORDS[from];
    const { col: tc, row: tr } = COORDS[to];
    const dc = tc - bc;
    const dr = tr - br;
    if (Math.abs(dc) === 2 || Math.abs(dr) === 2) {
      const midIdx = _lookup(bc + dc / 2, br + dr / 2);
      if (midIdx >= 0 && state.board[midIdx] === 'white') {
        state.board[midIdx] = null;
        state.piratesCaptured++;
        captured = true;
      }
    }
  }

  state.board[from] = null;
  state.board[to]   = color;
  state.lastMove = { type: 'move', from, to, color, captured };
  state.tick++;

  if (color === 'black') {
    _afterBulgarMove(state, to, captured);
  } else {
    // Pirates: no captures, just advance turn.
    state.turn = 'black';
    _checkWin(state);
  }

  return { ok: true };
}

/** End multi-jump voluntarily (bulgars only, since captures are optional). */
export function endJump(state, pid) {
  if (state.gameOver) return { ok: false, error: 'Game is over' };
  if (state.pendingJump === null) return { ok: false, error: 'No pending jump' };
  const color = state.players[pid]?.color;
  if (color !== 'black') return { ok: false, error: 'Not your turn' };

  _pushSnapshot(state);
  state.pendingJump = null;
  state.turn = 'white';
  state.tick++;
  _checkWin(state);
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
  const fresh = newGameState();
  Object.assign(state, fresh);
  state.players = players;
  for (const p of [1, 2, 3, 4]) {
    if (state.players[p]) state.players[p].connected = players[p]?.connected ?? false;
  }
}
