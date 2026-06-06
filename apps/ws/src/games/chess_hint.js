/**
 * chess_hint.js — Chess hint / computer engine (hybrid).
 *
 * Strength tiers:
 *   easy:   minimax alpha-beta depth 1, 400 ms
 *   medium: minimax alpha-beta depth 2, 1500 ms
 *   hard:   Stockfish UCI_Elo 1600, movetime 1500 ms
 *   hint:   Stockfish full strength, movetime 1000 ms
 *
 * Returns { move: { from, to, promotion? } | null }
 */

import { spawn } from 'child_process';
import { legalMovesFor, _applyMove } from './chess_sim.js';

// ─── FEN generation ───────────────────────────────────────────────────────────

const FEN_PIECE = { P: 'P', N: 'N', B: 'B', R: 'R', Q: 'Q', K: 'K' };

function _toFen(state) {
  const { board, turn, castlingRights, enPassantTarget, halfMoveClock, fullMoveNumber } = state;

  const rows = [];
  for (let row = 0; row < 8; row++) {
    let str = '';
    let empty = 0;
    for (let col = 0; col < 8; col++) {
      const p = board[row * 8 + col];
      if (!p) {
        empty++;
      } else {
        if (empty > 0) { str += empty; empty = 0; }
        const ch = FEN_PIECE[p.type] ?? p.type;
        str += p.color === 'white' ? ch.toUpperCase() : ch.toLowerCase();
      }
    }
    if (empty > 0) str += empty;
    rows.push(str);
  }
  const boardStr = rows.join('/');
  const turnStr  = turn === 'white' ? 'w' : 'b';

  const cr = castlingRights ?? { white: {}, black: {} };
  let castle = '';
  if (cr.white?.kSide) castle += 'K';
  if (cr.white?.qSide) castle += 'Q';
  if (cr.black?.kSide) castle += 'k';
  if (cr.black?.qSide) castle += 'q';
  if (!castle) castle = '-';

  let ep = '-';
  if (enPassantTarget !== null && enPassantTarget !== undefined) {
    const r = Math.floor(enPassantTarget / 8);
    const c = enPassantTarget % 8;
    ep = String.fromCharCode('a'.charCodeAt(0) + c) + (8 - r);
  }

  return `${boardStr} ${turnStr} ${castle} ${ep} ${halfMoveClock ?? 0} ${fullMoveNumber ?? 1}`;
}

// ─── UCI coordinate helpers ───────────────────────────────────────────────────

function _sqToIndex(sq) {
  const col  = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1]);
  return (8 - rank) * 8 + col;
}

function _uciToMove(uci) {
  const from  = _sqToIndex(uci.slice(0, 2));
  const to    = _sqToIndex(uci.slice(2, 4));
  const promo = uci.length === 5 ? uci[4].toUpperCase() : undefined;
  return { from, to, ...(promo ? { promotion: promo } : {}) };
}

// ─── Stockfish UCI communication ──────────────────────────────────────────────

function _runStockfish(fen, eloLimit, movetime) {
  return new Promise((resolve, reject) => {
    let sf;
    try {
      sf = spawn('stockfish', [], { stdio: ['pipe', 'pipe', 'ignore'] });
    } catch (e) {
      return reject(new Error(`Could not spawn stockfish: ${e.message}`));
    }

    const timer = setTimeout(() => {
      try { sf.kill(); } catch (_) {}
      reject(new Error('stockfish timed out'));
    }, movetime + 8000);

    let resolved = false;
    function done(val) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try { sf.kill(); } catch (_) {}
      resolve(val);
    }
    function fail(err) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try { sf.kill(); } catch (_) {}
      reject(err);
    }

    let lineBuffer = '';
    sf.stdout.on('data', (chunk) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('bestmove ')) {
          const uci = line.trim().split(/\s+/)[1];
          done(!uci || uci === '(none)' ? null : _uciToMove(uci));
          return;
        }
      }
    });

    sf.on('error', (err) => fail(err));
    sf.on('close', (code) => {
      if (!resolved) fail(new Error(`stockfish closed (code ${code}) before bestmove`));
    });

    const cmds = ['uci'];
    if (eloLimit !== null) {
      cmds.push('setoption name UCI_LimitStrength value true');
      cmds.push(`setoption name UCI_Elo value ${eloLimit}`);
    } else {
      cmds.push('setoption name UCI_LimitStrength value false');
    }
    cmds.push('isready');
    cmds.push(`position fen ${fen}`);
    cmds.push(`go movetime ${movetime}`);
    sf.stdin.write(cmds.join('\n') + '\n');
  });
}

// ─── Material evaluation ──────────────────────────────────────────────────────

const PIECE_VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

const PST = {
  P: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  N: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  B: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  R: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  Q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  K: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

function _pstValue(type, color, i) {
  const table = PST[type];
  if (!table) return 0;
  const row    = Math.floor(i / 8);
  const col    = i % 8;
  const pstRow = color === 'white' ? row : 7 - row;
  return table[pstRow * 8 + col];
}

function _evaluate(board, color) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const val = PIECE_VALUE[p.type] + _pstValue(p.type, p.color, i);
    score += p.color === color ? val : -val;
  }
  return score;
}

// ─── State cloning ────────────────────────────────────────────────────────────

function _cloneState(state) {
  return {
    board:           state.board.map((p) => p ? { ...p } : null),
    turn:            state.turn,
    castlingRights: {
      white: { ...state.castlingRights.white },
      black: { ...state.castlingRights.black },
    },
    enPassantTarget: state.enPassantTarget,
    halfMoveClock:   state.halfMoveClock,
    fullMoveNumber:  state.fullMoveNumber,
    inCheck:         state.inCheck,
    checkmate:       state.checkmate,
    stalemate:       state.stalemate,
    lastMove:        null,
    gameOver:        state.gameOver,
    winner:          state.winner,
    players: {
      1: { color: state.players[1]?.color ?? null },
      2: { color: state.players[2]?.color ?? null },
      3: { color: state.players[3]?.color ?? null },
      4: { color: state.players[4]?.color ?? null },
    },
    history:         [],
    redoSnapshot:    null,
    tick:            0,
  };
}

// ─── Minimax with alpha-beta pruning ──────────────────────────────────────────

const INF = 1e9;

function _minimax(state, depth, alpha, beta, maximizing, rootColor, deadline) {
  if (Date.now() > deadline) return _evaluate(state.board, rootColor);
  if (state.gameOver) {
    if (state.winner === rootColor) return INF - 1;
    if (state.winner === null)      return 0;       // stalemate = draw
    return -(INF - 1);
  }
  if (depth === 0) return _evaluate(state.board, rootColor);

  const color = state.turn;
  const moves = legalMovesFor(state, color);
  if (moves.length === 0) return _evaluate(state.board, rootColor);

  if (maximizing) {
    let best = -INF;
    for (const move of moves) {
      const saved = _cloneState(state);
      _applyMove(state, move.from, move.to, move.promotion ?? 'Q');
      const score = _minimax(state, depth - 1, alpha, beta, false, rootColor, deadline);
      Object.assign(state, saved);
      state.board          = saved.board;
      state.castlingRights = saved.castlingRights;
      best  = Math.max(best, score);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = INF;
    for (const move of moves) {
      const saved = _cloneState(state);
      _applyMove(state, move.from, move.to, move.promotion ?? 'Q');
      const score = _minimax(state, depth - 1, alpha, beta, true, rootColor, deadline);
      Object.assign(state, saved);
      state.board          = saved.board;
      state.castlingRights = saved.castlingRights;
      best = Math.min(best, score);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

// ─── Strength settings ────────────────────────────────────────────────────────

function _settings(level, isHint) {
  if (isHint)             return { useStockfish: true,  eloLimit: null, movetime: 1000 };
  if (level === 'hard')   return { useStockfish: true,  eloLimit: 1600, movetime: 1500 };
  if (level === 'medium') return { useStockfish: false, depth: 2, maxMs: 1500 };
  return                         { useStockfish: false, depth: 1, maxMs: 400  };  // easy
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function suggestMove(state) {
  const level  = state._computerLevel ?? 'medium';
  const isHint = state._isHint === true;
  const cfg    = _settings(level, isHint);

  if (cfg.useStockfish) {
    const fen = _toFen(state);
    try {
      const move = await _runStockfish(fen, cfg.eloLimit, cfg.movetime);
      return { move };
    } catch (err) {
      console.error('[chess_hint] stockfish error, falling back to minimax:', err.message);
      // Fall through to minimax below
    }
  }

  // Minimax (easy / medium / Stockfish fallback)
  const depth    = cfg.depth ?? 2;
  const maxMs    = cfg.maxMs ?? 1500;
  const deadline = Date.now() + maxMs;
  const color    = state.turn;
  const moves    = legalMovesFor(state, color);

  if (moves.length === 0) return { move: null };

  if (depth === 1) {
    const pick = moves[Math.floor(Math.random() * moves.length)];
    return { move: { from: pick.from, to: pick.to, promotion: pick.promotion ?? 'Q' } };
  }

  let bestMove  = moves[0];
  let bestScore = -INF;
  const workingState = _cloneState(state);

  for (const move of moves) {
    if (Date.now() > deadline) break;
    const saved = _cloneState(workingState);
    _applyMove(workingState, move.from, move.to, move.promotion ?? 'Q');
    const score = _minimax(workingState, depth - 1, -INF, INF, false, color, deadline);
    Object.assign(workingState, saved);
    workingState.board          = saved.board;
    workingState.castlingRights = saved.castlingRights;
    if (score > bestScore) { bestScore = score; bestMove = move; }
  }

  return { move: { from: bestMove.from, to: bestMove.to, promotion: bestMove.promotion ?? 'Q' } };
}
