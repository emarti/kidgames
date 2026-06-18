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

// ─── Endgame presets ──────────────────────────────────────────────────────────

/**
 * Each preset defines piece placements for white and black.
 * Positions are chosen so the pieces aren't adjacent and the
 * black king has room to move (not immediately in check).
 */
const ENDGAME_PRESETS = {
  standard: null, // uses full newGameState()
  kqq_vs_k: {
    label: 'K+2Q vs K',
    white: [
      { type: 'K', row: 6, col: 4 },
      { type: 'Q', row: 5, col: 3 },
      { type: 'Q', row: 5, col: 5 },
    ],
    black: [
      { type: 'K', row: 1, col: 4 },
    ],
  },
  krr_vs_k: {
    label: 'K+2R vs K',
    white: [
      { type: 'K', row: 6, col: 4 },
      { type: 'R', row: 7, col: 0 },
      { type: 'R', row: 7, col: 7 },
    ],
    black: [
      { type: 'K', row: 1, col: 4 },
    ],
  },
  krq_vs_k: {
    label: 'K+R+Q vs K',
    white: [
      { type: 'K', row: 6, col: 4 },
      { type: 'R', row: 7, col: 0 },
      { type: 'Q', row: 5, col: 3 },
    ],
    black: [
      { type: 'K', row: 1, col: 4 },
    ],
  },
  kq_vs_k: {
    label: 'K+Q vs K',
    white: [
      { type: 'K', row: 6, col: 4 },
      { type: 'Q', row: 5, col: 3 },
    ],
    black: [
      { type: 'K', row: 1, col: 4 },
    ],
  },
};

/** Build a board from a preset definition. */
function _buildPresetBoard(preset) {
  const board = Array(64).fill(null);
  for (const p of preset.white) board[idx(p.row, p.col)] = { type: p.type, color: 'white' };
  for (const p of preset.black) board[idx(p.row, p.col)] = { type: p.type, color: 'black' };
  return board;
}

export function newGameState(presetId) {
  const preset = presetId && ENDGAME_PRESETS[presetId];

  const board = preset
    ? _buildPresetBoard(preset)
    : (() => {
        const b = Array(64).fill(null);
        for (let col = 0; col < 8; col++) b[idx(0, col)] = { type: BACK_RANK[col], color: 'black' };
        for (let col = 0; col < 8; col++) b[idx(1, col)] = { type: 'P', color: 'black' };
        for (let col = 0; col < 8; col++) b[idx(6, col)] = { type: 'P', color: 'white' };
        for (let col = 0; col < 8; col++) b[idx(7, col)] = { type: BACK_RANK[col], color: 'white' };
        return b;
      })();

  const noCastle = !!preset;
  const state = {
    board,
    turn:           'white',
    castlingRights: {
      white: { kSide: !noCastle, qSide: !noCastle },
      black: { kSide: !noCastle, qSide: !noCastle },
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
    analysis: null,
    tick: 0,
  };
  state.analysis = computeExplainData(state);
  return state;
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

// Piece values for tactical importance ranking
const PIECE_VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 99 };
const PIECE_SYMBOL = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };

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

function _findKing(board, color) {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.type === 'K' && p.color === color) return i;
  }
  return -1;
}

function _attackSquares(board, i, color) {
  const piece = board[i];
  if (!piece || piece.color !== color) return [];
  const { row, col } = toRC(i);

  switch (piece.type) {
    case 'P': {
      const dir = color === 'white' ? -1 : 1;
      const out = [];
      for (const dc of [-1, 1]) {
        const r = row + dir;
        const c = col + dc;
        if (!_oob(r, c)) out.push(idx(r, c));
      }
      return out;
    }
    case 'N':
      return _knightMoves(board, i, color).map((m) => m.to);
    case 'B':
      return _slidingMoves(board, i, color, BISHOP_DIRS).map((m) => m.to);
    case 'R':
      return _slidingMoves(board, i, color, ROOK_DIRS).map((m) => m.to);
    case 'Q':
      return _slidingMoves(board, i, color, QUEEN_DIRS).map((m) => m.to);
    case 'K': {
      const out = [];
      for (const [dr, dc] of QUEEN_DIRS) {
        const r = row + dr;
        const c = col + dc;
        if (!_oob(r, c)) out.push(idx(r, c));
      }
      return out;
    }
    default:
      return [];
  }
}

function _attackersToSquare(board, square, attackerColor) {
  const attackers = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.color !== attackerColor) continue;
    if (_attackSquares(board, i, attackerColor).includes(square)) {
      attackers.push({ from: i, to: square, piece: p.type, color: attackerColor });
    }
  }
  return attackers;
}

function _kingNeighbors(square) {
  if (square === -1) return [];
  const { row, col } = toRC(square);
  const out = [];
  for (const [dr, dc] of QUEEN_DIRS) {
    const r = row + dr;
    const c = col + dc;
    if (!_oob(r, c)) out.push(idx(r, c));
  }
  return out;
}

function _dedupeMoves(moves) {
  const seen = new Set();
  const out = [];
  for (const move of moves) {
    const key = `${move.from}:${move.to}:${move.kind ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(move);
  }
  return out;
}

// ─── Tactical pattern detection ───────────────────────────────────────────────

/**
 * Detect forks: an opponent piece attacking 2+ of our pieces worth ≥ pawn.
 * Returns array of { type, label, attacker, targets, value, arrows, pulses, color }.
 */
function _detectForks(board, turn) {
  const opponent = _opp(turn);
  // Map each opponent piece to the set of our pieces it attacks
  const attackMap = new Map(); // oppIdx → [ourIdx, ...]
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.color !== opponent) continue;
    const squares = _attackSquares(board, i, opponent);
    const targets = [];
    for (const sq of squares) {
      const t = board[sq];
      if (t && t.color === turn && PIECE_VAL[t.type] >= 1) {
        targets.push(sq);
      }
    }
    if (targets.length >= 2) {
      attackMap.set(i, targets);
    }
  }

  const forks = [];
  for (const [attIdx, targets] of attackMap) {
    const attPiece = board[attIdx];
    // Sort targets by value descending, take top 2 for display
    const sorted = targets.slice().sort((a, b) => PIECE_VAL[board[b].type] - PIECE_VAL[board[a].type]);
    const topTargets = sorted.slice(0, 3);
    const totalValue = topTargets.reduce((s, t) => s + PIECE_VAL[board[t].type], 0);
    const symbols = topTargets.map((t) => PIECE_SYMBOL[board[t].type]).join('');
    forks.push({
      type: 'fork',
      label: `Fork! ${symbols}`,
      attacker: attIdx,
      targets: topTargets,
      value: totalValue + PIECE_VAL[attPiece.type], // higher-value attacker = more important fork
      arrows: topTargets.map((t) => ({ from: attIdx, to: t })),
      pulses: [attIdx, ...topTargets],
      color: 0xff8844, // orange
    });
  }
  // Sort by total target value descending
  forks.sort((a, b) => b.value - a.value);
  return forks;
}

/**
 * Detect pins: our piece that shields the king from a sliding attacker.
 * A piece is pinned if removing it would expose the king to a sliding attack
 * through that square.
 */
function _detectPins(board, turn) {
  const opponent = _opp(turn);
  const kingSquare = _findKing(board, turn);
  if (kingSquare === -1) return [];

  const kingRC = toRC(kingSquare);
  const pins = [];

  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (!piece || piece.color !== turn || piece.type === 'K') continue;

    const pieceRC = toRC(i);
    // Check if this piece is on a line with the king
    const dr = Math.sign(pieceRC.row - kingRC.row);
    const dc = Math.sign(pieceRC.col - kingRC.col);
    // Must be on a straight or diagonal line
    if (dr === 0 && dc === 0) continue;
    const rowDiff = Math.abs(pieceRC.row - kingRC.row);
    const colDiff = Math.abs(pieceRC.col - kingRC.col);
    if (rowDiff !== 0 && colDiff !== 0 && rowDiff !== colDiff) continue;

    // Check there's nothing between king and this piece
    let blocked = false;
    let cr = kingRC.row + dr, cc = kingRC.col + dc;
    while (cr !== pieceRC.row || cc !== pieceRC.col) {
      if (board[idx(cr, cc)]) { blocked = true; break; }
      cr += dr; cc += dc;
    }
    if (blocked) continue;

    // Look beyond this piece for a sliding attacker
    cr = pieceRC.row + dr;
    cc = pieceRC.col + dc;
    while (!_oob(cr, cc)) {
      const sq = idx(cr, cc);
      const occ = board[sq];
      if (occ) {
        if (occ.color === opponent) {
          const isDiag = dr !== 0 && dc !== 0;
          const isLine = dr === 0 || dc === 0;
          const canPin = occ.type === 'Q' ||
            (isDiag && occ.type === 'B') ||
            (isLine && occ.type === 'R');
          if (canPin) {
            pins.push({
              type: 'pin',
              label: 'Pinned',
              pinned: i,
              pinner: sq,
              value: PIECE_VAL[piece.type],
              arrows: [{ from: sq, to: i }],
              pulses: [i],
              color: 0x8866ff, // purple
            });
          }
        }
        break; // blocked by any piece
      }
      cr += dr; cc += dc;
    }
  }
  // Sort by pinned piece value descending (more valuable pinned piece = more important)
  pins.sort((a, b) => b.value - a.value);
  return pins;
}

/**
 * Detect hanging pieces: our pieces under attack but not defended by any own piece.
 */
function _detectHanging(board, turn) {
  const opponent = _opp(turn);
  const hanging = [];

  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (!piece || piece.color !== turn) continue;

    const attackers = _attackersToSquare(board, i, opponent);
    if (attackers.length === 0) continue;

    const defenders = _attackersToSquare(board, i, turn);
    if (defenders.length > 0) continue; // defended — not hanging

    hanging.push({
      type: 'hanging',
      label: `${PIECE_SYMBOL[piece.type]} Hanging!`,
      square: i,
      value: PIECE_VAL[piece.type],
      arrows: [{ from: attackers[0].from, to: i }],
      pulses: [i],
      color: 0xff4444, // red
    });
  }
  // Sort by piece value descending
  hanging.sort((a, b) => b.value - a.value);
  return hanging;
}

/**
 * Classify the last move: what did the opponent just do?
 * Returns a tactic object or null.
 */
function _classifyLastMove(state) {
  const { board, lastMove } = state;
  if (!lastMove) return null;

  const opponent = lastMove.color;       // color that just moved
  const turn     = _opp(opponent);       // us (who must respond)

  // Check: the most urgent thing
  if (state.inCheck) {
    return {
      type: 'last_move',
      label: 'Check!',
      arrows: [],
      pulses: [lastMove.to],
      color: 0xff4444,
    };
  }

  // Did it create a fork? (opponent piece at lastMove.to attacking 2+ of our pieces)
  const movedSquares = _attackSquares(board, lastMove.to, opponent);
  const forkedTargets = [];
  for (const sq of movedSquares) {
    const t = board[sq];
    if (t && t.color === turn && PIECE_VAL[t.type] >= 1) {
      forkedTargets.push(sq);
    }
  }
  if (forkedTargets.length >= 2) {
    const sorted = forkedTargets.sort((a, b) => PIECE_VAL[board[b].type] - PIECE_VAL[board[a].type]);
    const top = sorted.slice(0, 3);
    const syms = top.map((t) => PIECE_SYMBOL[board[t].type]).join('');
    return {
      type: 'last_move',
      label: `Fork! ${syms}`,
      arrows: top.map((t) => ({ from: lastMove.to, to: t })),
      pulses: [lastMove.to],
      color: 0xff8844,
    };
  }

  // Did it attack one of our pieces?
  const attacked = [];
  for (const sq of movedSquares) {
    const t = board[sq];
    if (t && t.color === turn && PIECE_VAL[t.type] >= 1) {
      attacked.push(sq);
    }
  }
  if (attacked.length > 0) {
    const best = attacked.sort((a, b) => PIECE_VAL[board[b].type] - PIECE_VAL[board[a].type])[0];
    const result = {
      type: 'last_move',
      label: `Attacks ${PIECE_SYMBOL[board[best].type]}`,
      arrows: [{ from: lastMove.to, to: best }],
      pulses: [lastMove.to],
      color: 0xff6666,
    };
    _addSupportArrow(board, lastMove, opponent, result);
    return result;
  }

  // Was it a capture?
  if (lastMove.captured) {
    const result = {
      type: 'last_move',
      label: 'Captured',
      arrows: [],
      pulses: [lastMove.to],
      color: 0xffcc55,
    };
    _addSupportArrow(board, lastMove, opponent, result);
    return result;
  }

  // Quiet move — still show support if the piece is defended
  const quiet = {
    type: 'last_move',
    label: '',
    arrows: [],
    pulses: [lastMove.to],
    color: 0x66aadd,
  };
  _addSupportArrow(board, lastMove, opponent, quiet);
  if (quiet.arrows.length > 0) {
    quiet.label = 'Supported';
    return quiet;
  }

  return null;
}

/**
 * If the piece that just moved is defended by a friendly piece, add a
 * support arrow (defender → moved piece) to the tactic.  Cap at 2 arrows.
 */
function _addSupportArrow(board, lastMove, moverColor, tactic) {
  const defenders = _attackersToSquare(board, lastMove.to, moverColor);
  if (defenders.length > 0 && tactic.arrows.length < 2) {
    tactic.arrows.push({ from: defenders[0].from, to: lastMove.to, support: true });
  }
}

/**
 * Build a prioritized tactics array from detected patterns.
 * Two groups: "why they moved" (1-2 arrows) + "current tension" (1-2 arrows).
 * Capped at 2 entries, total arrows capped at 4.
 */
function _buildTactics(board, turn, state) {
  const forks   = _detectForks(board, turn);
  const pins    = _detectPins(board, turn);
  const hanging = _detectHanging(board, turn);
  const lastMv  = _classifyLastMove(state);

  const tactics = [];
  let arrowCount = 0;

  // Group 1 — "Why they moved" (last-move annotation, 1-2 arrows)
  if (lastMv) {
    const entry = { ...lastMv };
    if (entry.arrows.length > 2) entry.arrows = entry.arrows.slice(0, 2);
    arrowCount += entry.arrows.length;
    tactics.push(entry);
  }

  // Group 2 — "Current tension": single best tactic (fork > hanging > pin)
  const tensionPool = [...forks, ...hanging, ...pins];
  for (const t of tensionPool) {
    if (tactics.length >= 2) break;
    const allowed = 4 - arrowCount;
    if (allowed <= 0) break;
    const entry = { ...t };
    if (entry.arrows.length > Math.min(allowed, 2)) {
      entry.arrows = entry.arrows.slice(0, Math.min(allowed, 2));
    }
    arrowCount += entry.arrows.length;
    tactics.push(entry);
    break; // only one tension tactic
  }

  return tactics;
}

function computeExplainData(state) {
  const { board, turn, gameOver } = state;
  const opponent = _opp(turn);
  const kingSquare = _findKing(board, turn);
  const attackers = kingSquare === -1 ? [] : _attackersToSquare(board, kingSquare, opponent);
  const legal = legalMovesFor(state, turn);
  const kingEscapes = kingSquare === -1
    ? []
    : legal.filter((move) => move.from === kingSquare).map((move) => ({ from: move.from, to: move.to, kind: 'king_escape' }));

  const checkResponses = attackers.length === 0 ? [] : legal
    .filter((move) => move.from !== kingSquare)
    .map((move) => ({
      from: move.from,
      to: move.to,
      kind: attackers.some((attacker) => attacker.from === move.to) ? 'capture' : 'block',
    }));

  const captureMoves = legal
    .filter((move) => board[move.to] && board[move.to].color === opponent)
    .map((move) => ({ from: move.from, to: move.to, kind: 'capture' }));

  const threatenedPieces = [];
  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (!piece || piece.color !== turn) continue;
    const pieceAttackers = _attackersToSquare(board, i, opponent);
    if (pieceAttackers.length === 0) continue;
    threatenedPieces.push({
      from: pieceAttackers[0].from,
      to: i,
      kind: 'threat',
      attackers: pieceAttackers.length,
    });
  }

  const stalematePressure = [];
  if (state.stalemate) {
    for (const square of _kingNeighbors(kingSquare)) {
      const occupant = board[square];
      if (occupant && occupant.color === turn) continue;
      const squareAttackers = _attackersToSquare(board, square, opponent);
      if (squareAttackers.length > 0) {
        stalematePressure.push({
          from: squareAttackers[0].from,
          to: square,
          kind: 'stalemate_guard',
          attackers: squareAttackers.length,
        });
      }
    }
  }

  // Build prioritized tactics (forks, pins, hanging, last-move annotation)
  const tactics = (!gameOver && !state.inCheck) ? _buildTactics(board, turn, state) : [];

  return {
    turn,
    gameOver,
    kingSquare,
    inCheck: state.inCheck,
    checkAttackers: attackers,
    kingEscapes: _dedupeMoves(kingEscapes),
    checkResponses: _dedupeMoves(checkResponses),
    captureMoves: _dedupeMoves(captureMoves),
    threatenedPieces: _dedupeMoves(threatenedPieces),
    stalematePressure: _dedupeMoves(stalematePressure),
    tactics,
    terminal: state.checkmate
      ? { status: 'checkmate', attackers: attackers.length, escapes: kingEscapes.length, responses: checkResponses.length }
      : state.stalemate
        ? { status: 'stalemate', attackers: 0, escapes: 0, responses: 0 }
        : null,
  };
}

// ─── Check detection ──────────────────────────────────────────────────────────

/**
 * Returns true if `color`'s king is attacked by any opponent piece on `board`.
 */
export function isInCheck(board, color) {
  const kingIdx = _findKing(board, color);
  if (kingIdx === -1) return false; // shouldn't happen in a valid game
  return _attackersToSquare(board, kingIdx, _opp(color)).length > 0;
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

  state.analysis = computeExplainData(state);
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
  state.analysis = computeExplainData(state);
  state.tick++;
  return { ok: true };
}

export function redoMove(state) {
  if (!state.redoSnapshot) return { ok: false, error: 'Nothing to redo' };
  const saved = state.redoSnapshot;
  _pushSnapshot(state);
  const snap = JSON.parse(saved);
  Object.assign(state, snap);
  state.analysis = computeExplainData(state);
  state.tick++;
  return { ok: true };
}

export function resetGame(state, presetId) {
  const players = state.players;
  const fresh = newGameState(presetId);
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
