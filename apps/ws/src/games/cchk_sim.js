/**
 * cchk_sim.js — Chinese Checkers rules engine (up to 6 players).
 *
 * Board: 121-position star-shaped hexagonal grid using axial (q, r) coordinates.
 * Colors: red, orange, blue, green, yellow, purple (each in one of 6 arm positions).
 * Any subset of colors can be active.  Default 2-player: ['red', 'orange'].
 *
 * Move format:
 *   { from: index, path: [index, ...] }
 *   path is the sequence of positions AFTER from.
 *   Single step: path.length === 1 and destination is an adjacent empty cell.
 *   Hop/chain: each consecutive pair (current→next) must be a valid hop over
 *   exactly one adjacent piece to the empty cell beyond.
 */

// ─── Geometry ─────────────────────────────────────────────────────────────────

const HEX_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

// Arm cell definitions in axial (q, r) — verified 10 cells each, no overlaps.
// Generated from rotation symmetry of the top arm.
// Arms derived by repeated 60° rotation (q,r)→(-r, q+r) of the right arm.
// Right arm rows are along constant (q+r); all 6 arms have 4+3+2+1=10 cells.
// Apex positions: top(0,-8), topRight(8,-8), right(8,0),
//                bottom(0,8), bottomLeft(-8,8), left(-8,0).
const _ARM_QR = {
  top:        [[0,-5],[-1,-5],[-2,-5],[-3,-5],[0,-6],[-1,-6],[-2,-6],[0,-7],[-1,-7],[0,-8]],
  topRight:   [[5,-5],[5,-6],[5,-7],[5,-8],[6,-6],[6,-7],[6,-8],[7,-7],[7,-8],[8,-8]],
  right:      [[5,0],[6,-1],[7,-2],[8,-3],[6,0],[7,-1],[8,-2],[7,0],[8,-1],[8,0]],
  bottom:     [[0,5],[1,5],[2,5],[3,5],[0,6],[1,6],[2,6],[0,7],[1,7],[0,8]],
  bottomLeft: [[-5,5],[-5,6],[-5,7],[-5,8],[-6,6],[-6,7],[-6,8],[-7,7],[-7,8],[-8,8]],
  left:       [[-5,0],[-6,1],[-7,2],[-8,3],[-6,0],[-7,1],[-8,2],[-7,0],[-8,1],[-8,0]],
};

// Build flat position list and q,r → index lookup.
const POSITIONS = [];  // [{ q, r }, ...]
const _QR_TO_IDX = {}; // "q,r" → index

// 1. Central hexagon: max(|q|, |r|, |q+r|) ≤ 4  (61 cells)
for (let q = -4; q <= 4; q++) {
  for (let r = -4; r <= 4; r++) {
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 4) {
      _QR_TO_IDX[`${q},${r}`] = POSITIONS.length;
      POSITIONS.push({ q, r });
    }
  }
}

// 2. Arm cells (10 each × 6 arms = 60 cells)
for (const cells of Object.values(_ARM_QR)) {
  for (const [q, r] of cells) {
    const key = `${q},${r}`;
    if (!(key in _QR_TO_IDX)) {
      _QR_TO_IDX[key] = POSITIONS.length;
      POSITIONS.push({ q, r });
    }
  }
}

// ─── Color → arm mappings ──────────────────────────────────────────────────────

// The 6 standard Chinese Checkers colors, in turn order.
export const CCHK_COLORS = ['red', 'orange', 'blue', 'green', 'yellow', 'purple'];

// Which arm each color starts in.
export const CCHK_ARM_OF = {
  red:    'top',
  orange: 'bottom',
  blue:   'topRight',
  green:  'bottomLeft',
  yellow: 'right',
  purple: 'left',
};

// Which arm each color must fill to win (opposite arm).
export const CCHK_GOAL_ARM_OF = {
  red:    'bottom',
  orange: 'top',
  blue:   'bottomLeft',
  green:  'topRight',
  yellow: 'left',
  purple: 'right',
};

// Export for renderer
export { POSITIONS };
export function posToIdx(q, r) { return _QR_TO_IDX[`${q},${r}`] ?? -1; }

// ─── Adjacency ────────────────────────────────────────────────────────────────

// Precomputed neighbour indices for all 121 positions.
export const ADJACENCY = POSITIONS.map(({ q, r }) => {
  const neighbours = [];
  for (const [dq, dr] of HEX_DIRS) {
    const ni = _QR_TO_IDX[`${q + dq},${r + dr}`];
    if (ni !== undefined) neighbours.push(ni);
  }
  return neighbours;
});

// ─── Arm membership ───────────────────────────────────────────────────────────

// Convert arm QR lists to index sets.
const _ARM_CELLS = {};
for (const [name, qrList] of Object.entries(_ARM_QR)) {
  _ARM_CELLS[name] = qrList.map(([q, r]) => _QR_TO_IDX[`${q},${r}`]).filter((i) => i !== undefined);
}
export const ARM_CELLS = _ARM_CELLS;

export function goalArmCells(color) {
  return _ARM_CELLS[CCHK_GOAL_ARM_OF[color]];
}
export function startArmCells(color) {
  return _ARM_CELLS[CCHK_ARM_OF[color]];
}

// ─── Legal move generation ────────────────────────────────────────────────────

/**
 * BFS to find all positions reachable from `from` via chain-hops.
 * Does NOT include `from` itself.
 */
function _hopReachable(board, from) {
  const { q: fq, r: fr } = POSITIONS[from];
  const visited = new Set([from]);
  const stack = [from];
  const reachable = new Set();

  while (stack.length > 0) {
    const cur = stack.pop();
    const { q, r } = POSITIONS[cur];
    for (const [dq, dr] of HEX_DIRS) {
      const midKey = `${q + dq},${r + dr}`;
      const midIdx = _QR_TO_IDX[midKey];
      if (midIdx === undefined || board[midIdx] === null) continue;
      const landKey = `${q + 2 * dq},${r + 2 * dr}`;
      const landIdx = _QR_TO_IDX[landKey];
      if (landIdx === undefined || board[landIdx] !== null) continue;
      if (visited.has(landIdx)) continue;
      visited.add(landIdx);
      reachable.add(landIdx);
      stack.push(landIdx);
    }
  }
  return reachable;
}

/**
 * Returns all legal moves for `color`.
 * Each move: { from, to, path: [to] } — path is simplified (just the endpoint).
 * The client sends the full hop path; this function is used for MCTS and win check.
 */
export function legalMovesFor(state, color) {
  if (state.gameOver) return [];
  const board = state.board;
  const moves = [];

  for (let from = 0; from < 121; from++) {
    if (board[from]?.color !== color) continue;

    // Single steps.
    for (const ni of ADJACENCY[from]) {
      if (board[ni] === null) {
        moves.push({ from, to: ni, path: [ni] });
      }
    }

    // Hop destinations (BFS).
    for (const to of _hopReachable(board, from)) {
      moves.push({ from, to, path: [to] });
    }
  }

  return moves;
}

// ─── Path validation ──────────────────────────────────────────────────────────

/**
 * Validate a path on the given board.
 * path: array of position indices, starting AFTER `from`.
 * Returns true if every step is a valid single-step or hop (chain hops only if len>1).
 */
function _validatePath(board, from, path) {
  if (!path || path.length === 0) return false;

  const to = path[path.length - 1];
  if (to < 0 || to >= 121 || board[to] !== null) return false;

  if (path.length === 1) {
    const { q: fq, r: fr } = POSITIONS[from];
    const { q: tq, r: tr } = POSITIONS[to];
    const dq = tq - fq;
    const dr = tr - fr;
    // Single step: a direct neighbour direction?
    const isStep = HEX_DIRS.some(([ddq, ddr]) => ddq === dq && ddr === dr);
    if (isStep && board[to] === null) return true;
    // Single hop?
    const isHopDir = HEX_DIRS.some(([ddq, ddr]) => ddq * 2 === dq && ddr * 2 === dr);
    if (isHopDir) {
      const midIdx = _QR_TO_IDX[`${fq + dq / 2},${fr + dr / 2}`];
      if (midIdx !== undefined && board[midIdx] !== null && board[to] === null) return true;
    }
    return false;
  }

  // Chain: every step must be a hop.
  const visited = new Set([from]);
  let cur = from;
  for (const next of path) {
    if (next < 0 || next >= 121) return false;
    if (board[next] !== null) return false;
    if (visited.has(next)) return false;

    const { q: cq, r: cr } = POSITIONS[cur];
    const { q: nq, r: nr } = POSITIONS[next];
    const dq = nq - cq;
    const dr = nr - cr;

    const isHopDir = HEX_DIRS.some(([ddq, ddr]) => ddq * 2 === dq && ddr * 2 === dr);
    if (!isHopDir) return false;
    const midIdx = _QR_TO_IDX[`${cq + dq / 2},${cr + dr / 2}`];
    if (midIdx === undefined || board[midIdx] === null) return false;

    visited.add(next);
    cur = next;
  }
  return true;
}

// ─── State mutation ───────────────────────────────────────────────────────────

function _checkWin(state, movedColor) {
  const goalCells = _ARM_CELLS[CCHK_GOAL_ARM_OF[movedColor]];
  if (goalCells && goalCells.every((i) => state.board[i]?.color === movedColor)) {
    if (!state.winners) state.winners = [];
    if (!state.winners.includes(movedColor)) state.winners.push(movedColor);
    // Game is over when only one active color hasn't won yet (they're last place).
    const remaining = (state.activeColors ?? CCHK_COLORS).filter(c => !state.winners.includes(c));
    if (remaining.length <= 1) {
      state.gameOver = true;
      state.winner   = state.winners[0];
    }
  }
}

/** Advance turn to next active, non-won color. */
function _nextTurn(state) {
  const active = state.activeColors ?? CCHK_COLORS;
  const idx = active.indexOf(state.turn);
  for (let i = 1; i <= active.length; i++) {
    const next = active[(idx + i) % active.length];
    if (!state.winners?.includes(next)) return next;
  }
  return state.turn; // fallback (shouldn't happen)
}

function _applyMove(state, from, path) {
  const piece = state.board[from];
  state.board[from] = null;
  const to = path[path.length - 1];
  state.board[to] = piece;
  state.lastMove = { from, to, path: path.slice(), color: piece.color };
  state.turn = _nextTurn(state);
  state.tick++;
  _checkWin(state, piece.color);
}

function _pushSnapshot(state) {
  state.history.push(JSON.stringify({
    board:        state.board,
    turn:         state.turn,
    lastMove:     state.lastMove,
    gameOver:     state.gameOver,
    winner:       state.winner,
    winners:      state.winners,
    tick:         state.tick,
  }));
  if (state.history.length > 300) state.history.shift();
  state.redoSnapshot = null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {string[]} [activeColors] — subset of CCHK_COLORS to include.
 *   Defaults to ['red', 'orange'] (classic 2-player).
 */
export function newGameState(activeColors) {
  const colors = activeColors ?? ['red', 'orange'];
  const board = Array(121).fill(null);
  for (const color of colors) {
    const arm = CCHK_ARM_OF[color];
    if (arm) for (const i of _ARM_CELLS[arm]) board[i] = { color };
  }
  return {
    board,
    turn:         colors[0],
    activeColors: colors.slice(),
    lastMove:     null,
    gameOver:     false,
    winner:       null,
    winners:      [],
    players: {
      1: { connected: false, color: null },
      2: { connected: false, color: null },
      3: { connected: false, color: null },
      4: { connected: false, color: null },
    },
    history:      [],
    redoSnapshot: null,
    tick:         0,
  };
}

export function setPlayerConnected(state, pid, connected) {
  if (state.players[pid]) state.players[pid].connected = connected;
}

export function selectColor(state, pid, color) {
  if (state.players[pid]) state.players[pid].color = color;
}

export function movePiece(state, pid, from, path) {
  if (state.gameOver) return { ok: false, error: 'Game is over' };
  const color = state.players[pid]?.color;
  if (!color) return { ok: false, error: 'No color assigned' };
  if (color !== state.turn) return { ok: false, error: 'Not your turn' };
  if (from < 0 || from >= 121) return { ok: false, error: 'Invalid from' };
  if (!Array.isArray(path) || path.length === 0) return { ok: false, error: 'Invalid path' };
  if (state.board[from]?.color !== color) return { ok: false, error: 'Not your piece' };
  if (!_validatePath(state.board, from, path)) return { ok: false, error: 'Illegal move' };
  _pushSnapshot(state);
  _applyMove(state, from, path);
  return { ok: true };
}

export function computerMovePiece(state, from, path) {
  if (state.gameOver) return { ok: false, error: 'Game is over' };
  if (from < 0 || from >= 121) return { ok: false, error: 'Invalid from' };
  if (!Array.isArray(path) || path.length === 0) return { ok: false, error: 'Invalid path' };
  if (!_validatePath(state.board, from, path)) return { ok: false, error: 'Illegal move' };
  _pushSnapshot(state);
  _applyMove(state, from, path);
  return { ok: true };
}

export function undoMove(state) {
  if (state.history.length === 0) return { ok: false, error: 'Nothing to undo' };
  state.redoSnapshot = JSON.stringify({
    board:        state.board,
    turn:         state.turn,
    lastMove:     state.lastMove,
    gameOver:     state.gameOver,
    winner:       state.winner,
    winners:      state.winners,
    tick:         state.tick,
  });
  const snap = JSON.parse(state.history.pop());
  Object.assign(state, snap);
  state.tick++;
  return { ok: true };
}

export function redoMove(state) {
  if (!state.redoSnapshot) return { ok: false, error: 'Nothing to redo' };
  const saved = state.redoSnapshot;
  _pushSnapshot(state);
  const snap = JSON.parse(saved);
  Object.assign(state, snap);
  state.tick++;
  return { ok: true };
}

/**
 * @param {string[]} [activeColors] — if provided, overrides the current activeColors.
 */
export function resetGame(state, activeColors) {
  const players = state.players;
  const fresh = newGameState(activeColors ?? state.activeColors);
  Object.assign(state, fresh);
  state.players = players;
  for (const pid of [1, 2, 3, 4]) {
    if (players[pid]) state.players[pid] = { ...players[pid] };
  }
}
