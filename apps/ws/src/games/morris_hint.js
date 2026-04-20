/**
 * morris_hint.js — MCTS hint engine for Nine Men's Morris.
 *
 * Uses UCT (C=1.4) with random rollouts capped at 80 ply.
 * Budget: up to 3000 iterations or 1500ms, whichever comes first.
 */

import {
  legalMovesFor,
  MILLS,
} from './morris_sim.js';

const C = 1.4;
const MAX_ITER = 3000;
const TIME_BUDGET_MS = 1500;
const ROLLOUT_DEPTH  = 80;

// ─── Lightweight state operations ────────────────────────────────────────────

function cloneState(state) {
  return {
    board: state.board.slice(),
    turn: state.turn,
    phase: state.phase,
    pendingRemove: state.pendingRemove,
    piecesInHand:  { ...state.piecesInHand },
    piecesOnBoard: { ...state.piecesOnBoard },
    captured:      { ...state.captured },
    gameOver: state.gameOver,
    winner: state.winner,
    players: {
      1: { color: state.players[1]?.color ?? null },
      2: { color: state.players[2]?.color ?? null },
      3: { color: state.players[3]?.color ?? null },
      4: { color: state.players[4]?.color ?? null },
    },
    history: [], // don't copy history — saves memory during rollouts
    tick: state.tick,
  };
}

function opponent(color) {
  return color === 'black' ? 'white' : 'black';
}

function inMill(board, idx) {
  const color = board[idx];
  if (!color) return false;
  return MILLS.some(([a, b, c]) =>
    (a === idx || b === idx || c === idx) &&
    board[a] === color && board[b] === color && board[c] === color
  );
}

function allInMills(board, color) {
  return board.every((c, i) => c !== color || inMill(board, i));
}

// Apply a move to a cloned state (no history push, no validation).
function applyMove(s, move) {
  if (move.type === 'place') {
    s.board[move.pointIndex] = s.turn;
    s.piecesInHand[s.turn]--;
    s.piecesOnBoard[s.turn]++;
    _afterPlace(s, s.turn, move.pointIndex);
  } else if (move.type === 'move') {
    const color = s.turn;
    s.board[move.from] = null;
    s.board[move.to]   = color;
    _afterPlace(s, color, move.to);
  } else if (move.type === 'remove') {
    const opp = opponent(s.pendingRemove);
    s.board[move.pointIndex] = null;
    s.piecesOnBoard[opp]--;
    s.captured[opp]++;
    // Advance turn after removal
    s.turn = opp;
    s.pendingRemove = null;
    _updatePhase(s);
    _checkWin(s, opp);
  }
}

function _afterPlace(s, color, pointIndex) {
  const formedMill = MILLS.some(([a, b, c]) =>
    (a === pointIndex || b === pointIndex || c === pointIndex) &&
    s.board[a] === color && s.board[b] === color && s.board[c] === color
  );
  if (formedMill) {
    s.phase = 'removing';
    s.pendingRemove = color;
    return;
  }
  const opp = opponent(color);
  s.turn = opp;
  s.pendingRemove = null;
  _updatePhase(s);
  _checkWin(s, opp);
}

function _updatePhase(s) {
  if (s.gameOver) return;
  const color = s.turn;
  if (s.piecesInHand[color] > 0)          s.phase = 'placing';
  else if (s.piecesOnBoard[color] === 3)  s.phase = 'flying';
  else                                     s.phase = 'moving';
}

function _checkWin(s, colorWhoseTurnItIs) {
  if (s.gameOver) return;
  const opp = opponent(colorWhoseTurnItIs);
  const total = s.piecesOnBoard[colorWhoseTurnItIs] + s.piecesInHand[colorWhoseTurnItIs];
  if (total < 3 && s.piecesInHand[colorWhoseTurnItIs] === 0) {
    s.gameOver = true;
    s.winner = opp;
    return;
  }
  if (s.phase === 'moving') {
    const moves = legalMovesFor(s, colorWhoseTurnItIs);
    if (moves.length === 0) {
      s.gameOver = true;
      s.winner = opp;
    }
  }
}

// ─── MCTS ────────────────────────────────────────────────────────────────────

function rollout(s, rootColor) {
  let depth = 0;
  while (!s.gameOver && depth < ROLLOUT_DEPTH) {
    const actingColor = s.phase === 'removing' ? s.pendingRemove : s.turn;
    const moves = legalMovesFor(s, actingColor);
    if (moves.length === 0) break;
    const move = moves[Math.floor(Math.random() * moves.length)];
    applyMove(s, move);
    depth++;
  }
  if (s.gameOver) {
    if (s.winner === rootColor) return 1;
    if (s.winner === null) return 0.5;
    return 0;
  }
  // Heuristic: piece count advantage for rootColor.
  const myPieces  = s.piecesOnBoard[rootColor]  + s.piecesInHand[rootColor];
  const oppPieces = s.piecesOnBoard[opponent(rootColor)] + s.piecesInHand[opponent(rootColor)];
  if (myPieces + oppPieces === 0) return 0.5;
  return myPieces / (myPieces + oppPieces);
}

/**
 * Suggests the best move for the current state.
 * @param {object} state — snapshot of morris sim state
 * @returns {{ move: object }} e.g. { move: { type: 'place', pointIndex: 5 } }
 */
export function suggestMove(state) {
  const actingColor = state.phase === 'removing' ? state.pendingRemove : state.turn;
  if (!actingColor) return { move: null };

  const rootMoves = legalMovesFor(state, actingColor);
  if (rootMoves.length === 0) return { move: null };
  if (rootMoves.length === 1) return { move: rootMoves[0] };

  // MCTS nodes: { move, wins, visits, children }
  const nodes = rootMoves.map((move) => ({ move, wins: 0, visits: 0 }));
  const start = Date.now();
  let iter = 0;

  while (iter < MAX_ITER && Date.now() - start < TIME_BUDGET_MS) {
    // Select: UCT
    let best = null;
    let bestScore = -Infinity;
    const totalVisits = nodes.reduce((s, n) => s + n.visits, 0);

    for (const node of nodes) {
      let score;
      if (node.visits === 0) {
        score = Infinity;
      } else {
        score = node.wins / node.visits + C * Math.sqrt(Math.log(totalVisits + 1) / node.visits);
      }
      if (score > bestScore) { bestScore = score; best = node; }
    }

    // Simulate
    const s = cloneState(state);
    applyMove(s, best.move);
    const result = rollout(s, actingColor);

    best.wins   += result;
    best.visits += 1;
    iter++;
  }

  // Pick the most-visited node.
  nodes.sort((a, b) => b.visits - a.visits);
  return { move: nodes[0].move };
}
