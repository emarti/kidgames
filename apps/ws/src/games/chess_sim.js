/**
 * chess_sim.js — Standard Chess rules engine for Game Room.
 *
 * Board: flat Array(64), indexed row*8+col.
 *   Row 0 = black's back rank (a8–h8 in standard notation).
 *   Row 7 = white's back rank (a1–h1).
 *   White moves first; white pieces move "up" (toward lower row numbers).
 *
 * Piece object: { type: 'P'|'N'|'B'|'R'|'Q'|'K', color: 'white'|'black' }
 *
 * move_piece message fields: { from: int, to: int, promotion?: 'Q'|'N'|'R'|'B' }
 * Default promotion: 'Q'.
 */

// ─── Coordinate helpers ───────────────────────────────────────────────────────

export function idx(row, col) { return row * 8 + col; }
export function toRC(i)       { return { row: Math.floor(i / 8), col: i % 8 }; }

function _oob(row, col) { return row < 0 || row > 7 || col < 0 || col > 7; }
function _opp(color)    { return color === 'white' ? 'black' : 'white'; }

// ─── Starting position ────────────────────────────────────────────────────────

const BACK_RANK = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

export function newGameState() {
  const board = Array(64).fill(null);
  // Black back rank: row 0
  for (let col = 0; col < 8; col++) board[idx(0, col)] = { type: BACK_RANK[col], color: 'black' };
  // Black pawns: row 1
  for (let col = 0; col < 8; col++) board[idx(1, col)] = { type: 'P', color: 'black' };
  // White pawns: row 6
  for (let col = 0; col < 8; col++) board[idx(6, col)] = { type: 'P', color: 'white' };
  // White back rank: row 7
  for (let col = 0; col < 8; col++) board[idx(7, col)] = { type: BACK_RANK[col], color: 'white' };

  return {
    board,
    turn:           'white',
    castlingRights: {
      white: { kSide: true, qSide: true },
      black: { kSide: true, qSide: true },
    },
    enPassantTarget: null,   // index of the square a pawn can capture to en passant, or null
    halfMoveClock:   0,
    fullMoveNumber:  1,
    inCheck:         false,
    checkmate:       false,
    stalemate:       false,
    lastMove:        null,
    history:         [],
    redoSnapshot:    null,
    gameOver:        false,
    winner:          null,
    players: {
      1: { connected: false, color: null },
      2: { connected: false, color: null },
      3: { connected: false, color: null },
      4: { connected: false, color: null },
    },
    tick: 0,
  };
}

// ─── Pseudo-legal move generators ─────────────────────────────────────────────
// These return moves without checking if they leave own king in check.
// Each returns array of { from, to, promotion?, enPassant?, castling? }.

function _pawnMoves(board, i, color, epTarget) {
  const { row, col } = toRC(i);
  const dir    = color === 'white' ? -1 : 1;   // white moves up (lower row), black moves down
  const start  = color === 'white' ? 6 : 1;
  const promo  = color === 'white' ? 0 : 7;
  const moves  = [];

  // Single step forward
  const fwd = idx(row + dir, col);
  if (!_oob(row + dir, col) && board[fwd] === null) {
    if (row + dir === promo) {
      for (const p of ['Q', 'N', 'R', 'B']) moves.push({ from: i, to: fwd, promotion: p });
    } else {
      moves.push({ from: i, to: fwd });
      // Double step from starting row
      const fwd2 = idx(row + 2 * dir, col);
      if (row === start && board[fwd2] === null) {
        moves.push({ from: i, to: fwd2 });
      }
    }
  }

  // Diagonal captures
  for (const dc of [-1, 1]) {
    if (_oob(row + dir, col + dc)) continue;
    const dest = idx(row + dir, col + dc);
    const target = board[dest];
    if (target && target.color !== color) {
      if (row + dir === promo) {
        for (const p of ['Q', 'N', 'R', 'B']) moves.push({ from: i, to: dest, promotion: p });
      } else {
        moves.push({ from: i, to: dest });
      }
    }
    // En passant
    if (epTarget !== null && dest === epTarget) {
      moves.push({ from: i, to: dest, enPassant: true });
    }
  }

  return moves;
}

function _knightMoves(board, i, color) {
  const { row, col } = toRC(i);
  const moves = [];
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    if (_oob(row + dr, col + dc)) continue;
    const dest = idx(row + dr, col + dc);
    const t = board[dest];
    if (!t || t.color !== color) moves.push({ from: i, to: dest });
  }
  return moves;
}

function _slidingMoves(board, i, color, dirs) {
  const { row, col } = toRC(i);
  const moves = [];
  for (const [dr, dc] of dirs) {
    let r = row + dr, c = col + dc;
    while (!_oob(r, c)) {
      const dest = idx(r, c);
      const t = board[dest];
      if (!t) {
        moves.push({ from: i, to: dest });
      } else {
        if (t.color !== color) moves.push({ from: i, to: dest });
        break;
      }
      r += dr; c += dc;
    }
  }
  return moves;
}

const BISHOP_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ROOK_DIRS   = [[-1,0],[1,0],[0,-1],[0,1]];
const QUEEN_DIRS  = [...BISHOP_DIRS, ...ROOK_DIRS];

function _kingMoves(board, i, color, castlingRights) {
  const { row, col } = toRC(i);
  const moves = [];
  for (const [dr, dc] of QUEEN_DIRS) {
    if (_oob(row + dr, col + dc)) continue;
    const dest = idx(row + dr, col + dc);
    const t = board[dest];
    if (!t || t.color !== color) moves.push({ from: i, to: dest });
  }

  // Castling candidates (legality checked in legalMovesFor)
  const backRow = color === 'white' ? 7 : 0;
  if (row === backRow && col === 4) {
    const cr = castlingRights[color];
    // King-side: squares 5 and 6 must be empty
    if (cr.kSide && board[idx(backRow, 5)] === null && board[idx(backRow, 6)] === null) {
      moves.push({ from: i, to: idx(backRow, 6), castling: 'k' });
    }
    // Queen-side: squares 1, 2, 3 must be empty
    if (cr.qSide &&
        board[idx(backRow, 3)] === null &&
        board[idx(backRow, 2)] === null &&
        board[idx(backRow, 1)] === null) {
      moves.push({ from: i, to: idx(backRow, 2), castling: 'q' });
    }
  }

  return moves;
}

function _pseudoLegal(board, i, color, epTarget, castlingRights) {
  const piece = board[i];
  if (!piece || piece.color !== color) return [];
  switch (piece.type) {
    case 'P': return _pawnMoves(board, i, color, epTarget);
    case 'N': return _knightMoves(board, i, color);
    case 'B': return _slidingMoves(board, i, color, BISHOP_DIRS);
    case 'R': return _slidingMoves(board, i, color, ROOK_DIRS);
    case 'Q': return _slidingMoves(board, i, color, QUEEN_DIRS);
    case 'K': return _kingMoves(board, i, color, castlingRights);
    default:  return [];
  }
}

// ─── Check detection ──────────────────────────────────────────────────────────

/**
 * Returns true if `color`'s king is attacked by any opponent piece on `board`.
 */
export function isInCheck(board, color) {
  // Find king
  let kingIdx = -1;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.type === 'K' && p.color === color) { kingIdx = i; break; }
  }
  if (kingIdx === -1) return false; // shouldn't happen in a valid game

  const opp = _opp(color);
  // Check if any opponent piece can reach the king square
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.color !== opp) continue;
    // Use pseudo-legal (no ep/castling needed for attack detection)
    const attacks = _pseudoLegal(board, i, opp, null, { white: { kSide: false, qSide: false }, black: { kSide: false, qSide: false } });
    if (attacks.some((m) => m.to === kingIdx)) return true;
  }
  return false;
}

// ─── Apply a move to a board clone (used for check filtering) ─────────────────

function _applyMoveToBoard(board, move) {
  const b = board.slice(); // shallow clone
  const piece = b[move.from];
  b[move.from] = null;
  b[move.to] = move.promotion ? { type: move.promotion, color: piece.color } : { ...piece };

  if (move.enPassant) {
    // Captured pawn is on same row as moving pawn, same col as destination
    const { row: toRow } = toRC(move.to);
    const { col: toCol } = toRC(move.to);
    const { row: fromRow } = toRC(move.from);
    // The captured pawn is on fromRow (same row as before moving), toCol
    b[idx(fromRow, toCol)] = null;
  }

  if (move.castling) {
    const { row } = toRC(move.to);
    if (move.castling === 'k') {
      // Move rook from col 7 to col 5
      b[idx(row, 5)] = b[idx(row, 7)];
      b[idx(row, 7)] = null;
    } else {
      // Move rook from col 0 to col 3
      b[idx(row, 3)] = b[idx(row, 0)];
      b[idx(row, 0)] = null;
    }
  }
  return b;
}

// ─── Legal move generation ────────────────────────────────────────────────────

/**
 * Returns all legal moves for `color` given `state`.
 * Format: [{ from, to, promotion? }]  (internal castling/enPassant flags stripped)
 */
export function legalMovesFor(state, color) {
  if (state.gameOver) return [];
  const { board, enPassantTarget, castlingRights } = state;
  const legal = [];

  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.color !== color) continue;
    const pseudo = _pseudoLegal(board, i, color, enPassantTarget, castlingRights);
    for (const move of pseudo) {
      // Castling: king must not be in check now, must not pass through attacked square
      if (move.castling) {
        if (isInCheck(board, color)) continue; // can't castle out of check
        const { row } = toRC(move.from);
        const passingCol = move.castling === 'k' ? 5 : 3;
        const passingBoard = board.slice();
        passingBoard[move.from] = null;
        passingBoard[idx(row, passingCol)] = { type: 'K', color };
        if (isInCheck(passingBoard, color)) continue; // can't castle through check
      }
      // Apply move to board and check if own king is in check
      const newBoard = _applyMoveToBoard(board, move);
      if (!isInCheck(newBoard, color)) {
        const out = { from: move.from, to: move.to };
        if (move.promotion) out.promotion = move.promotion;
        legal.push(out);
      }
    }
  }
  return legal;
}

// ─── Apply move (full state mutation) ────────────────────────────────────────

/**
 * Mutates `state` to apply the move. Does NOT push to history (caller must do that).
 */
export function _applyMove(state, from, to, promotion) {
  const piece = state.board[from];
  const color = piece.color;
  const opp   = _opp(color);
  const { row: fromRow, col: fromCol } = toRC(from);
  const { row: toRow,   col: toCol   } = toRC(to);

  // Determine move metadata
  const isCapture    = state.board[to] !== null;
  const isPawnMove   = piece.type === 'P';
  const isDoublePush = isPawnMove && Math.abs(toRow - fromRow) === 2;
  const isCastle     = piece.type === 'K' && Math.abs(toCol - fromCol) === 2;
  const isEP         = isPawnMove && toCol !== fromCol && state.board[to] === null;
  const isPromo      = isPawnMove && (toRow === 0 || toRow === 7);

  // Execute on board
  state.board[from] = null;
  state.board[to]   = isPromo ? { type: promotion, color } : { type: piece.type, color };

  // En passant: remove captured pawn
  if (isEP) {
    state.board[idx(fromRow, toCol)] = null;
  }

  // Castling: move rook
  if (isCastle) {
    const backRow = color === 'white' ? 7 : 0;
    if (toCol === 6) {
      // King-side
      state.board[idx(backRow, 5)] = state.board[idx(backRow, 7)];
      state.board[idx(backRow, 7)] = null;
    } else {
      // Queen-side
      state.board[idx(backRow, 3)] = state.board[idx(backRow, 0)];
      state.board[idx(backRow, 0)] = null;
    }
  }

  // Update castling rights
  if (piece.type === 'K') {
    state.castlingRights[color].kSide = false;
    state.castlingRights[color].qSide = false;
  }
  if (piece.type === 'R') {
    const backRow = color === 'white' ? 7 : 0;
    if (fromRow === backRow && fromCol === 7) state.castlingRights[color].kSide = false;
    if (fromRow === backRow && fromCol === 0) state.castlingRights[color].qSide = false;
  }
  // If a rook is captured, remove opponent castling rights
  if (isCapture) {
    const oppBack = opp === 'white' ? 7 : 0;
    if (toRow === oppBack && toCol === 7) state.castlingRights[opp].kSide = false;
    if (toRow === oppBack && toCol === 0) state.castlingRights[opp].qSide = false;
  }

  // En passant target for next move
  state.enPassantTarget = isDoublePush ? idx(fromRow + (toRow - fromRow) / 2, fromCol) : null;

  // Half-move clock (reset on pawn move or capture)
  state.halfMoveClock = (isPawnMove || isCapture || isEP) ? 0 : state.halfMoveClock + 1;

  // Full move number
  if (color === 'black') state.fullMoveNumber++;

  // Last move record
  state.lastMove = { from, to, color, piece: piece.type, captured: isCapture || isEP, promotion: isPromo ? promotion : null };

  // Switch turn
  state.turn = opp;

  // Check / checkmate / stalemate detection
  const oppLegal = legalMovesFor(state, opp);
  state.inCheck   = isInCheck(state.board, opp);
  state.checkmate = state.inCheck && oppLegal.length === 0;
  state.stalemate = !state.inCheck && oppLegal.length === 0;

  if (state.checkmate) {
    state.gameOver = true;
    state.winner   = color;
  } else if (state.stalemate) {
    state.gameOver = true;
    state.winner   = null; // draw
  }

  state.tick++;
}

// ─── Snapshot helpers ─────────────────────────────────────────────────────────

function _pushSnapshot(state) {
  const snap = JSON.stringify({
    board:           state.board,
    turn:            state.turn,
    castlingRights:  state.castlingRights,
    enPassantTarget: state.enPassantTarget,
    halfMoveClock:   state.halfMoveClock,
    fullMoveNumber:  state.fullMoveNumber,
    inCheck:         state.inCheck,
    checkmate:       state.checkmate,
    stalemate:       state.stalemate,
    lastMove:        state.lastMove,
    gameOver:        state.gameOver,
    winner:          state.winner,
    tick:            state.tick,
  });
  state.history.push(snap);
  if (state.history.length > 300) state.history.shift();
  state.redoSnapshot = null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function movePiece(state, pid, from, to, promotion = 'Q') {
  if (state.gameOver) return { ok: false, error: 'Game is over' };

  const color = state.players[pid]?.color;
  if (!color) return { ok: false, error: 'No color assigned' };
  if (color !== state.turn) return { ok: false, error: 'Not your turn' };

  const legal = legalMovesFor(state, color);
  const move  = legal.find((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === promotion));
  if (!move) return { ok: false, error: 'Illegal move' };

  _pushSnapshot(state);
  _applyMove(state, from, to, promotion);
  return { ok: true };
}

/**
 * Move a piece as the computer (no player-ID validation).
 * Acts as `state.turn`.
 */
export function computerMovePiece(state, from, to, promotion = 'Q') {
  if (state.gameOver) return { ok: false, error: 'Game is over' };
  const color = state.turn;
  const legal = legalMovesFor(state, color);
  const move  = legal.find((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === promotion));
  if (!move) return { ok: false, error: 'Illegal move' };
  _pushSnapshot(state);
  _applyMove(state, from, to, promotion);
  return { ok: true };
}

export function undoMove(state) {
  if (state.history.length === 0) return { ok: false, error: 'Nothing to undo' };
  state.redoSnapshot = JSON.stringify({
    board:           state.board,
    turn:            state.turn,
    castlingRights:  state.castlingRights,
    enPassantTarget: state.enPassantTarget,
    halfMoveClock:   state.halfMoveClock,
    fullMoveNumber:  state.fullMoveNumber,
    inCheck:         state.inCheck,
    checkmate:       state.checkmate,
    stalemate:       state.stalemate,
    lastMove:        state.lastMove,
    gameOver:        state.gameOver,
    winner:          state.winner,
    tick:            state.tick,
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

export function setPlayerConnected(state, pid, connected) {
  if (state.players[pid]) state.players[pid].connected = connected;
}

export function selectColor(state, pid, color) {
  if (state.players[pid]) state.players[pid].color = color;
}
