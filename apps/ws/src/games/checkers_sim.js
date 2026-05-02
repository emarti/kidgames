/**
 * checkers_sim.js — Standard American (English) Checkers rules engine.
 *
 * Board: 8×8, pieces on dark squares only (32 playable cells).
 * Cells are numbered 0–31 left-to-right, top-to-bottom across dark squares.
 *
 *   Row 0 (top):   cells  0– 3  (cols 1,3,5,7)
 *   Row 1:         cells  4– 7  (cols 0,2,4,6)
 *   Row 2:         cells  8–11  (cols 1,3,5,7)
 *   ...
 *   Row 7:         cells 28–31  (cols 0,2,4,6)
 *
 * Colors: 'black' moves down (toward row 7), 'white' moves up (toward row 0).
 * Black moves first.
 * Win: opponent has no pieces OR no legal moves.
 */

// ─── Coordinate helpers ───────────────────────────────────────────────────────

// Returns { row, col } for a cell index (0–31).
export function cellToRC(idx) {
  const row = Math.floor(idx / 4);
  // In even rows, dark squares are on odd columns; in odd rows on even columns.
  const colOffset = (row % 2 === 0) ? 1 : 0;
  const col = colOffset + (idx % 4) * 2;
  return { row, col };
}

// Returns cell index for (row, col), or -1 if out of bounds or not a dark square.
export function rcToCell(row, col) {
  if (row < 0 || row > 7 || col < 0 || col > 7) return -1;
  const colOffset = (row % 2 === 0) ? 1 : 0;
  if ((col - colOffset) % 2 !== 0) return -1;
  return row * 4 + (col - colOffset) / 2;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _opponent(color) { return color === 'black' ? 'white' : 'black'; }

function _forwardDirs(color) {
  // Regular pieces move diagonally forward.
  return color === 'black' ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]];
}

const ALL_DIRS = [[1, -1], [1, 1], [-1, -1], [-1, 1]];

/** Returns all simple (non-capture) diagonal destinations from idx for a given piece. */
function _simpleMoves(board, idx) {
  const piece = board[idx];
  if (!piece) return [];
  const { row, col } = cellToRC(idx);
  const dirs = piece.king ? ALL_DIRS : _forwardDirs(piece.color);
  const dests = [];
  for (const [dr, dc] of dirs) {
    const to = rcToCell(row + dr, col + dc);
    if (to >= 0 && board[to] === null) dests.push(to);
  }
  return dests;
}

/** Returns all capture (jump) destinations from idx, optionally excluding used midpoints. */
function _captureMoves(board, idx, excludeMids = []) {
  const piece = board[idx];
  if (!piece) return [];
  const { row, col } = cellToRC(idx);
  const dirs = piece.king ? ALL_DIRS : _forwardDirs(piece.color);
  const opp = _opponent(piece.color);
  const caps = [];
  for (const [dr, dc] of dirs) {
    const midIdx = rcToCell(row + dr, col + dc);
    if (midIdx < 0) continue;
    if (board[midIdx] === null || board[midIdx].color !== opp) continue;
    if (excludeMids.includes(midIdx)) continue;
    const toIdx = rcToCell(row + 2 * dr, col + 2 * dc);
    if (toIdx >= 0 && board[toIdx] === null) caps.push({ to: toIdx, mid: midIdx });
  }
  return caps;
}

function _pushSnapshot(state) {
  const snap = JSON.stringify({
    board:        state.board,
    turn:         state.turn,
    pendingJump:  state.pendingJump,
    pendingMids:  state.pendingMids,
    piecesLeft:   state.piecesLeft,
    lastMove:     state.lastMove,
    gameOver:     state.gameOver,
    winner:       state.winner,
    tick:         state.tick,
  });
  state.history.push(snap);
  if (state.history.length > 300) state.history.shift();
  state.redoSnapshot = null;
}

function _checkWin(state) {
  if (state.gameOver) return;
  const opp = _opponent(state.turn);
  // Current player wins if opponent has no pieces or no legal moves.
  if (state.piecesLeft[opp] === 0) {
    state.gameOver = true;
    state.winner   = state.turn;
    return;
  }
  if (legalMovesFor(state, opp).length === 0) {
    state.gameOver = true;
    state.winner   = state.turn;
  }
}

/**
 * Execute a capture move (shared between movePiece and computerMovePiece).
 * Updates board, removes captured piece, promotes if back rank reached,
 * handles multi-jump continuation via state.pendingJump / state.pendingMids.
 */
function _executeMove(state, from, to) {
  const piece = state.board[from];
  const caps = _captureMoves(state.board, from, state.pendingMids);
  const cap = caps.find((c) => c.to === to);
  const isCapture = !!cap;

  state.board[from] = null;

  let justKinged = false;
  const { row: toRow } = cellToRC(to);
  const promoted = !piece.king && ((piece.color === 'black' && toRow === 7) || (piece.color === 'white' && toRow === 0));
  if (promoted) justKinged = true;

  state.board[to] = { color: piece.color, king: piece.king || promoted };

  if (isCapture) {
    state.board[cap.mid] = null;
    state.piecesLeft[_opponent(piece.color)]--;
    state.lastMove = { from, to, mid: cap.mid, color: piece.color, captured: true };
  } else {
    state.lastMove = { from, to, mid: null, color: piece.color, captured: false };
  }

  state.tick++;

  if (isCapture && !justKinged) {
    // Check for further captures from landing square.
    const newMids = [...state.pendingMids, cap.mid];
    const more = _captureMoves(state.board, to, newMids);
    if (more.length > 0) {
      state.pendingJump = to;
      state.pendingMids = newMids;
      return; // Turn stays with same player.
    }
  }

  // End of turn.
  state.pendingJump = null;
  state.pendingMids = [];
  state.turn = _opponent(piece.color);
  _checkWin(state);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export function newGameState() {
  const board = Array(32).fill(null);
  // Black pieces: rows 0–2 (cells 0–11).
  for (let i = 0; i < 12; i++) board[i] = { color: 'black', king: false };
  // White pieces: rows 5–7 (cells 20–31).
  for (let i = 20; i < 32; i++) board[i] = { color: 'white', king: false };
  return {
    board,
    turn:         'black',
    pendingJump:  null,   // cell index mid-multi-jump, or null
    pendingMids:  [],     // captured cells in this multi-jump sequence (cannot re-capture)
    piecesLeft:   { black: 12, white: 12 },
    players: {
      1: { connected: false, color: null },
      2: { connected: false, color: null },
      3: { connected: false, color: null },
      4: { connected: false, color: null },
    },
    lastMove:     null,
    gameOver:     false,
    winner:       null,
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

/**
 * Returns all legal moves for `color`.
 * Format: [{ from, to }, ...]
 * Captures are mandatory; multi-jump uses pendingJump.
 */
export function legalMovesFor(state, color) {
  if (state.gameOver) return [];

  // Mid-jump: only captures from the active piece.
  if (state.pendingJump !== null) {
    const caps = _captureMoves(state.board, state.pendingJump, state.pendingMids);
    return caps.map((c) => ({ from: state.pendingJump, to: c.to }));
  }

  // Collect all captures across all pieces.
  const captures = [];
  for (let i = 0; i < 32; i++) {
    const p = state.board[i];
    if (!p || p.color !== color) continue;
    for (const { to } of _captureMoves(state.board, i, [])) {
      captures.push({ from: i, to });
    }
  }
  if (captures.length > 0) return captures;

  // No captures: simple moves.
  const moves = [];
  for (let i = 0; i < 32; i++) {
    const p = state.board[i];
    if (!p || p.color !== color) continue;
    for (const to of _simpleMoves(state.board, i)) {
      moves.push({ from: i, to });
    }
  }
  return moves;
}

export function movePiece(state, pid, from, to) {
  if (state.gameOver) return { ok: false, error: 'Game is over' };

  const color = state.players[pid]?.color;
  if (!color) return { ok: false, error: 'No color assigned' };

  if (state.pendingJump !== null) {
    if (color !== state.turn)       return { ok: false, error: 'Not your turn' };
    if (from !== state.pendingJump) return { ok: false, error: 'Must continue jump from current position' };
  } else {
    if (color !== state.turn)       return { ok: false, error: 'Not your turn' };
  }

  const legal = legalMovesFor(state, color);
  if (!legal.some((m) => m.from === from && m.to === to)) {
    return { ok: false, error: 'Illegal move' };
  }

  _pushSnapshot(state);
  _executeMove(state, from, to);
  return { ok: true };
}

/**
 * Move a piece as the computer (no player-ID validation).
 * Acts as `state.turn`.
 */
export function computerMovePiece(state, from, to) {
  if (state.gameOver) return { ok: false, error: 'Game is over' };
  const color = state.turn;
  const legal = legalMovesFor(state, color);
  if (!legal.some((m) => m.from === from && m.to === to)) {
    return { ok: false, error: 'Illegal move' };
  }
  _pushSnapshot(state);
  _executeMove(state, from, to);
  return { ok: true };
}

export function undoMove(state) {
  if (state.history.length === 0) return { ok: false, error: 'Nothing to undo' };
  state.redoSnapshot = JSON.stringify({
    board:       state.board,
    turn:        state.turn,
    pendingJump: state.pendingJump,
    pendingMids: state.pendingMids,
    piecesLeft:  state.piecesLeft,
    lastMove:    state.lastMove,
    gameOver:    state.gameOver,
    winner:      state.winner,
    tick:        state.tick,
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

export function resetGame(state) {
  const players = state.players;
  const fresh = newGameState();
  Object.assign(state, fresh);
  state.players = players;
  for (const pid of [1, 2, 3, 4]) {
    if (players[pid]) state.players[pid] = { ...players[pid] };
  }
}
