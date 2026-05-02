/**
 * checkers_hint.js — MCTS hint engine for Checkers.
 *
 * Uses UCT (C=1.4) with random rollouts capped at 80 ply.
 * Budget controlled by state._computerLevel (easy/medium/hard).
 */

import { legalMovesFor, cellToRC } from './checkers_sim.js';

const C = 1.4;
function _budget(level) {
  if (level === 'easy') return { maxIter: 200,  maxMs: 400  };
  if (level === 'hard') return { maxIter: 6000, maxMs: 4000 };
  return                       { maxIter: 2000, maxMs: 1500 };  // medium (default)
}
const ROLLOUT_DEPTH = 80;

// ─── Lightweight state operations ────────────────────────────────────────────

function cloneBoard(board) {
  return board.map((c) => c ? { color: c.color, king: c.king } : null);
}

function cloneState(state) {
  return {
    board:       cloneBoard(state.board),
    turn:        state.turn,
    pendingJump: state.pendingJump,
    pendingMids: state.pendingMids.slice(),
    piecesLeft:  { black: state.piecesLeft.black, white: state.piecesLeft.white },
    players: {
      1: { color: state.players[1]?.color ?? null },
      2: { color: state.players[2]?.color ?? null },
      3: { color: state.players[3]?.color ?? null },
      4: { color: state.players[4]?.color ?? null },
    },
    gameOver: state.gameOver,
    winner:   state.winner,
    lastMove: null,
    history:  [],
    redoSnapshot: null,
    tick:     0,
  };
}

// Apply a move to a cloned state without snapshot or full validation.
function applyMove(s, from, to) {
  const piece = s.board[from];
  if (!piece) return;

  const { row: fr, col: fc } = cellToRC(from);
  const { row: tr, col: tc } = cellToRC(to);
  const dr = tr - fr;
  const dc = tc - fc;

  // Detect capture: it's a jump when distance is 2.
  let capMid = null;
  if (Math.abs(dr) === 2) {
    const midIdx = _rcToCell(fr + dr / 2, fc + dc / 2);
    if (midIdx >= 0 && s.board[midIdx] && s.board[midIdx].color !== piece.color) {
      capMid = midIdx;
      s.board[midIdx] = null;
      s.piecesLeft[piece.color === 'black' ? 'white' : 'black']--;
    }
  }

  s.board[from] = null;

  const promoted = !piece.king &&
    ((piece.color === 'black' && tr === 7) || (piece.color === 'white' && tr === 0));
  s.board[to] = { color: piece.color, king: piece.king || promoted };

  if (capMid !== null && !promoted) {
    const newMids = [...s.pendingMids, capMid];
    const more = _captureMoves(s.board, to, newMids, piece.color);
    if (more.length > 0) {
      s.pendingJump = to;
      s.pendingMids = newMids;
      return;
    }
  }

  s.pendingJump = null;
  s.pendingMids = [];
  s.turn = piece.color === 'black' ? 'white' : 'black';
  _checkWin(s);
}

// ─── Inline board helpers (no import needed for these) ───────────────────────

function _rcToCell(row, col) {
  if (row < 0 || row > 7 || col < 0 || col > 7) return -1;
  const colOffset = (row % 2 === 0) ? 1 : 0;
  if ((col - colOffset) % 2 !== 0) return -1;
  return row * 4 + (col - colOffset) / 2;
}

const _ALL_DIRS = [[1, -1], [1, 1], [-1, -1], [-1, 1]];

function _captureMoves(board, idx, excludeMids, color) {
  const piece = board[idx];
  if (!piece) return [];
  const { row, col } = cellToRC(idx);
  const dirs = piece.king ? _ALL_DIRS
    : (piece.color === 'black' ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]]);
  const opp = piece.color === 'black' ? 'white' : 'black';
  const caps = [];
  for (const [dr, dc] of dirs) {
    const midIdx = _rcToCell(row + dr, col + dc);
    if (midIdx < 0 || !board[midIdx] || board[midIdx].color !== opp) continue;
    if (excludeMids.includes(midIdx)) continue;
    const toIdx = _rcToCell(row + 2 * dr, col + 2 * dc);
    if (toIdx >= 0 && board[toIdx] === null) caps.push({ to: toIdx, mid: midIdx });
  }
  return caps;
}

function _checkWin(s) {
  if (s.gameOver) return;
  const opp = s.turn === 'black' ? 'white' : 'black';
  if (s.piecesLeft[opp] === 0 || legalMovesFor(s, opp).length === 0) {
    s.gameOver = true;
    s.winner   = s.turn;
  }
}

// ─── Rollout ─────────────────────────────────────────────────────────────────

function rollout(s, rootColor) {
  let depth = 0;
  while (!s.gameOver && depth < ROLLOUT_DEPTH) {
    const color = s.turn;
    const moves = legalMovesFor(s, color);
    if (moves.length === 0) break;
    const m = moves[Math.floor(Math.random() * moves.length)];
    applyMove(s, m.from, m.to);
    depth++;
  }

  if (s.gameOver) {
    if (s.winner === rootColor) return 1;
    if (s.winner === null)      return 0.5;
    return 0;
  }

  // Non-terminal heuristic: piece count + king bonus.
  const myPieces  = s.board.filter((c) => c?.color === rootColor);
  const oppPieces = s.board.filter((c) => c && c.color !== rootColor && c.color !== null);
  const myScore  = myPieces.reduce((sum, p) => sum + (p.king ? 1.5 : 1), 0);
  const oppScore = oppPieces.reduce((sum, p) => sum + (p.king ? 1.5 : 1), 0);
  const total = myScore + oppScore;
  return total === 0 ? 0.5 : myScore / total;
}

// ─── UCT search ──────────────────────────────────────────────────────────────

/**
 * Suggests the best move for the current player.
 * @param {object} state — snapshot of checkers sim state
 * @returns {{ move: { from: number, to: number } | null }}
 */
export function suggestMove(state) {
  const actingColor = state.turn;
  if (!actingColor) return { move: null };

  const rootMoves = legalMovesFor(state, actingColor);
  if (rootMoves.length === 0) return { move: null };
  if (rootMoves.length === 1) return { move: rootMoves[0] };

  const nodes = rootMoves.map((move) => ({ move, wins: 0, visits: 0 }));
  const { maxIter, maxMs } = _budget(state._computerLevel);
  const start = Date.now();
  let iter    = 0;

  while (iter < maxIter && Date.now() - start < maxMs) {
    // UCT selection.
    let best      = null;
    let bestScore = -Infinity;
    const totalVisits = nodes.reduce((acc, n) => acc + n.visits, 0);

    for (const node of nodes) {
      let score;
      if (node.visits === 0) {
        score = Infinity;
      } else {
        score =
          node.wins / node.visits +
          C * Math.sqrt(Math.log(totalVisits + 1) / node.visits);
      }
      if (score > bestScore) { bestScore = score; best = node; }
    }

    // Simulate.
    const s = cloneState(state);
    applyMove(s, best.move.from, best.move.to);
    const result = rollout(s, actingColor);

    best.wins   += result;
    best.visits += 1;
    iter++;
  }

  nodes.sort((a, b) => b.visits - a.visits);
  return { move: nodes[0].move };
}
