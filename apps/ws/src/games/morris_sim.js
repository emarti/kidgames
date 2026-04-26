/**
 * morris_sim.js — Nine Men's Morris rules engine.
 *
 * Board: 24 points (indices 0–23), three concentric rings, clockwise from
 * top-left corner.  Outer ring: 0-7, middle ring: 8-15, inner ring: 16-23.
 *
 *   0 ——————— 1 ——————— 2
 *   |  8 ——— 9 ——— 10  |
 *   |  |  16—17—18  |  |
 *   7  15  23   19  11  3
 *   |  |  22—21—20  |  |
 *   |  14—— 13—— 12  |  |
 *   6 ——————— 5 ——————— 4
 */

// ─── Board topology ───────────────────────────────────────────────────────────

// Normalised (0..1) pixel positions for the renderer. x=right, y=down.
export const POINT_POSITIONS = [
  // outer ring (0-7) — corners + midpoints, clockwise from top-left
  { x: 0,       y: 0       }, // 0 TL
  { x: 0.5,     y: 0       }, // 1 TM
  { x: 1,       y: 0       }, // 2 TR
  { x: 1,       y: 0.5     }, // 3 RM
  { x: 1,       y: 1       }, // 4 BR
  { x: 0.5,     y: 1       }, // 5 BM
  { x: 0,       y: 1       }, // 6 BL
  { x: 0,       y: 0.5     }, // 7 LM
  // middle ring (8-15)
  { x: 1/6,     y: 1/6     }, // 8
  { x: 0.5,     y: 1/6     }, // 9
  { x: 5/6,     y: 1/6     }, // 10
  { x: 5/6,     y: 0.5     }, // 11
  { x: 5/6,     y: 5/6     }, // 12
  { x: 0.5,     y: 5/6     }, // 13
  { x: 1/6,     y: 5/6     }, // 14
  { x: 1/6,     y: 0.5     }, // 15
  // inner ring (16-23)
  { x: 2/6,     y: 2/6     }, // 16
  { x: 0.5,     y: 2/6     }, // 17
  { x: 4/6,     y: 2/6     }, // 18
  { x: 4/6,     y: 0.5     }, // 19
  { x: 4/6,     y: 4/6     }, // 20
  { x: 0.5,     y: 4/6     }, // 21
  { x: 2/6,     y: 4/6     }, // 22
  { x: 2/6,     y: 0.5     }, // 23
];

// Adjacency list (symmetric edges on the board graph).
export const ADJACENCY = [
  [1, 7],           // 0
  [0, 2, 9],        // 1
  [1, 3],           // 2
  [2, 4, 11],       // 3
  [3, 5],           // 4
  [4, 6, 13],       // 5
  [5, 7],           // 6
  [6, 0, 15],       // 7
  [9, 15],          // 8
  [8, 10, 1, 17],   // 9  — cross-connection to inner ring midpoint 17
  [9, 11],          // 10
  [10, 12, 3, 19],  // 11 — cross-connection to 19
  [11, 13],         // 12
  [12, 14, 5, 21],  // 13 — cross-connection to 21
  [13, 15],         // 14
  [14, 8, 7, 23],   // 15 — cross-connection to 23
  [17, 23],         // 16
  [16, 18, 9],      // 17
  [17, 19],         // 18
  [18, 20, 11],     // 19
  [19, 21],         // 20
  [20, 22, 13],     // 21
  [21, 23],         // 22
  [22, 16, 15],     // 23
];

// All 16 mills: every line of exactly 3 collinear points.
export const MILLS = [
  // outer ring horizontal / vertical
  [0, 1, 2], [2, 3, 4], [4, 5, 6], [6, 7, 0],
  // middle ring
  [8, 9, 10], [10, 11, 12], [12, 13, 14], [14, 15, 8],
  // inner ring
  [16, 17, 18], [18, 19, 20], [20, 21, 22], [22, 23, 16],
  // cross-column verticals (midpoint connections)
  [1, 9, 17], [3, 11, 19], [5, 13, 21], [7, 15, 23],
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _inMill(board, idx) {
  const color = board[idx];
  if (!color) return false;
  return MILLS.some(([a, b, c]) =>
    (a === idx || b === idx || c === idx) &&
    board[a] === color && board[b] === color && board[c] === color
  );
}

function _allInMills(board, color) {
  return board.every((c, i) => c !== color || _inMill(board, i));
}

function _pushSnapshot(state) {
  const snap = JSON.stringify({
    board: state.board,
    turn: state.turn,
    phase: state.phase,
    pendingRemove: state.pendingRemove,
    piecesInHand: state.piecesInHand,
    piecesOnBoard: state.piecesOnBoard,
    captured: state.captured,
    lastMove: state.lastMove,
    gameOver: state.gameOver,
    winner: state.winner,
    tick: state.tick,
  });
  state.history.push(snap);
  if (state.history.length > 300) state.history.shift();
  state.redoSnapshot = null;
}

function _opponent(color) {
  return color === 'black' ? 'white' : 'black';
}

// After placing or moving a piece, check for mill → removing phase, else advance turn.
function _afterPlace(state, color, pointIndex) {
  const formedMill = MILLS.some(([a, b, c]) =>
    (a === pointIndex || b === pointIndex || c === pointIndex) &&
    state.board[a] === color && state.board[b] === color && state.board[c] === color
  );

  if (formedMill) {
    state.phase = 'removing';
    state.pendingRemove = color;
    // Don't advance turn — same player must remove
    return;
  }

  // Advance turn; check if opponent is now stuck or too few pieces.
  const opp = _opponent(color);
  state.turn = opp;
  state.pendingRemove = null;
  // Determine phase for the opponent's turn.
  _updatePhase(state);
  _checkWin(state, opp);
}

// Re-derive placement phase for current turn player.
function _updatePhase(state) {
  if (state.gameOver) return;
  const color = state.turn;
  if (state.piecesInHand[color] > 0) {
    state.phase = 'placing';
  } else if (state.flyingAlways || state.piecesOnBoard[color] === 3) {
    state.phase = 'flying';
  } else {
    state.phase = 'moving';
  }
}

function _checkWin(state, colorWhoseTurnItIs) {
  if (state.gameOver) return;
  const opp = _opponent(colorWhoseTurnItIs);

  // Win: opponent (the player whose turn just ended) has fewer than 3 pieces after removal phase complete.
  // OR: current player has no legal moves in moving phase.
  const oppTotal = state.piecesOnBoard[colorWhoseTurnItIs] + state.piecesInHand[colorWhoseTurnItIs];
  if (oppTotal < 3 && state.piecesInHand[colorWhoseTurnItIs] === 0) {
    // colorWhoseTurnItIs cannot continue — opp wins
    state.gameOver = true;
    state.winner = opp;
    return;
  }

  // No moves available in moving phase.
  if (state.phase === 'moving') {
    const moves = legalMovesFor(state, colorWhoseTurnItIs);
    if (moves.length === 0) {
      state.gameOver = true;
      state.winner = opp;
    }
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function newGameState() {
  return {
    board: Array(24).fill(null),
    turn: 'black',
    phase: 'placing',
    pendingRemove: null,
    players: {
      1: { connected: false, color: null },
      2: { connected: false, color: null },
      3: { connected: false, color: null },
      4: { connected: false, color: null },
    },
    piecesInHand:  { black: 9, white: 9 },
    piecesOnBoard: { black: 0, white: 0 },
    captured:      { black: 0, white: 0 },
    lastMove: null,
    gameOver: false,
    winner: null,
    flyingAlways: false,
    history: [],
    redoSnapshot: null,
    tick: 0,
  };
}

export function setPlayerConnected(state, pid, connected) {
  if (state.players[pid]) state.players[pid].connected = connected;
}

export function selectColor(state, pid, color) {
  if (state.players[pid]) state.players[pid].color = color;
}

// Phase 1: place a piece from hand.
export function placePiece(state, pid, pointIndex) {
  if (state.gameOver)                              return { ok: false, error: 'Game is over' };
  if (state.phase !== 'placing')                   return { ok: false, error: 'Not placing phase' };
  const color = state.players[pid]?.color;
  if (!color)                                      return { ok: false, error: 'No color assigned' };
  if (color !== state.turn)                        return { ok: false, error: 'Not your turn' };
  if (state.board[pointIndex] !== null)            return { ok: false, error: 'Point occupied' };
  if (state.piecesInHand[color] <= 0)              return { ok: false, error: 'No pieces in hand' };

  _pushSnapshot(state);
  state.board[pointIndex] = color;
  state.piecesInHand[color]--;
  state.piecesOnBoard[color]++;
  state.lastMove = { type: 'place', pointIndex, color };
  state.tick++;

  _afterPlace(state, color, pointIndex);
  return { ok: true };
}

// Phase 2/3: move a piece.
export function movePiece(state, pid, from, to) {
  if (state.gameOver)                              return { ok: false, error: 'Game is over' };
  if (state.phase !== 'moving' && state.phase !== 'flying')
                                                   return { ok: false, error: 'Not moving phase' };
  const color = state.players[pid]?.color;
  if (!color)                                      return { ok: false, error: 'No color assigned' };
  if (color !== state.turn)                        return { ok: false, error: 'Not your turn' };
  if (state.board[from] !== color)                 return { ok: false, error: 'Not your piece' };
  if (state.board[to] !== null)                    return { ok: false, error: 'Target occupied' };

  // Phase 2: must be adjacent (unless flying or flyingAlways).
  if (state.phase === 'moving' && !state.flyingAlways && !ADJACENCY[from].includes(to)) {
    return { ok: false, error: 'Not adjacent' };
  }

  _pushSnapshot(state);
  state.board[from] = null;
  state.board[to]   = color;
  state.lastMove = { type: 'move', from, to, color };
  state.tick++;

  _afterPlace(state, color, to);
  return { ok: true };
}

// After forming a mill: remove an opponent piece.
export function removePiece(state, pid, pointIndex) {
  if (state.gameOver)                              return { ok: false, error: 'Game is over' };
  if (state.phase !== 'removing')                  return { ok: false, error: 'Not removing phase' };
  const color = state.players[pid]?.color;
  if (!color)                                      return { ok: false, error: 'No color assigned' };
  if (color !== state.pendingRemove)               return { ok: false, error: 'Not your turn to remove' };

  const opp = _opponent(color);
  if (state.board[pointIndex] !== opp)             return { ok: false, error: 'Must remove opponent piece' };

  // Cannot remove from a mill unless all opponent pieces are in mills.
  if (_inMill(state.board, pointIndex) && !_allInMills(state.board, opp)) {
    return { ok: false, error: 'Cannot remove piece in a mill' };
  }

  _pushSnapshot(state);
  state.board[pointIndex] = null;
  state.piecesOnBoard[opp]--;
  state.captured[opp]++;
  state.lastMove = { type: 'remove', pointIndex, color };
  state.tick++;

  // After removal, advance turn.
  state.turn = opp;
  state.pendingRemove = null;
  _updatePhase(state);
  _checkWin(state, opp);
  return { ok: true };
}

export function undoMove(state) {
  if (state.history.length === 0) return { ok: false, error: 'Nothing to undo' };
  state.redoSnapshot = JSON.stringify({
    board: state.board, turn: state.turn, phase: state.phase,
    pendingRemove: state.pendingRemove, piecesInHand: state.piecesInHand,
    piecesOnBoard: state.piecesOnBoard, captured: state.captured,
    lastMove: state.lastMove, gameOver: state.gameOver, winner: state.winner, tick: state.tick,
  });
  const snap = JSON.parse(state.history.pop());
  const flyingAlways = state.flyingAlways;
  Object.assign(state, snap);
  state.flyingAlways = flyingAlways;
  state.tick++;
  return { ok: true };
}

export function redoMove(state) {
  if (!state.redoSnapshot) return { ok: false, error: 'Nothing to redo' };
  _pushSnapshot(state);
  const snap = JSON.parse(state.redoSnapshot);
  state.redoSnapshot = null;
  const flyingAlways = state.flyingAlways;
  Object.assign(state, snap);
  state.flyingAlways = flyingAlways;
  state.tick++;
  return { ok: true };
}

export function refreshPhase(state) {
  _updatePhase(state);
}

export function resetGame(state) {
  const players = state.players;
  const fresh = newGameState();
  Object.assign(state, fresh);
  state.players = players;
  // Restore connections.
  for (const pid of [1, 2, 3, 4]) {
    if (players[pid]) state.players[pid] = { ...players[pid] };
  }
}

/**
 * Returns all legal moves for the given color in the current state.
 * Used by the hint engine.
 */
export function legalMovesFor(state, color) {
  const moves = [];

  if (state.gameOver) return moves;

  if (state.phase === 'removing' && state.pendingRemove === color) {
    const opp = _opponent(color);
    const allInMills = _allInMills(state.board, opp);
    for (let i = 0; i < 24; i++) {
      if (state.board[i] === opp) {
        if (!_inMill(state.board, i) || allInMills) {
          moves.push({ type: 'remove', pointIndex: i });
        }
      }
    }
    return moves;
  }

  if (state.turn !== color) return moves;

  if (state.phase === 'placing') {
    for (let i = 0; i < 24; i++) {
      if (state.board[i] === null) moves.push({ type: 'place', pointIndex: i });
    }
    return moves;
  }

  if (state.phase === 'flying') {
    for (let from = 0; from < 24; from++) {
      if (state.board[from] !== color) continue;
      for (let to = 0; to < 24; to++) {
        if (state.board[to] === null) moves.push({ type: 'move', from, to });
      }
    }
    return moves;
  }

  // moving phase
  for (let from = 0; from < 24; from++) {
    if (state.board[from] !== color) continue;
    for (const to of ADJACENCY[from]) {
      if (state.board[to] === null) moves.push({ type: 'move', from, to });
    }
  }
  return moves;
}
