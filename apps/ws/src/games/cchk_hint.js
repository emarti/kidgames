/**
 * cchk_hint.js — MCTS hint engine for Chinese Checkers (up to 6 players).
 *
 * Uses UCT (C=1.4) with random rollouts capped at 60 ply.
 * Budget controlled by state._computerLevel (easy/medium/hard).
 *
 * Heuristic: average axial distance of each piece from its destination arm center.
 */

import { legalMovesFor, POSITIONS, goalArmCells, CCHK_COLORS, CCHK_GOAL_ARM_OF } from './cchk_sim.js';

const C = 1.4;

function _budget(level) {
  if (level === 'easy') return { maxIter: 200,  maxMs: 400  };
  if (level === 'hard') return { maxIter: 6000, maxMs: 4000 };
  return                       { maxIter: 2000, maxMs: 1500 };  // medium (default)
}

const ROLLOUT_DEPTH = 60;

// ─── Goal arm centers (axial centroid) ───────────────────────────────────────

function _armCenter(cells) {
  let sq = 0, sr = 0;
  for (const i of cells) {
    sq += POSITIONS[i].q;
    sr += POSITIONS[i].r;
  }
  return { q: sq / cells.length, r: sr / cells.length };
}

// Pre-compute goal arm centers for all 6 colors.
const _GOAL_CENTER = {};
for (const color of CCHK_COLORS) {
  const cells = goalArmCells(color);
  if (cells) _GOAL_CENTER[color] = _armCenter(cells);
}

/** Axial (hex) distance from position i to centroid. */
function _axialDist(i, center) {
  const { q, r } = POSITIONS[i];
  const dq = q - center.q;
  const dr = r - center.r;
  const ds = -(dq + dr);
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}

/**
 * Evaluation from `color`'s perspective.
 * Lower total distance of own pieces to goal = better.
 * Returns value in [0, 1]: 1 = win, 0 = max distance.
 */
function _evaluate(board, color) {
  const center = _GOAL_CENTER[color];
  let totalDist = 0;
  let count = 0;
  const maxDist = 16; // approx max distance on this board
  for (let i = 0; i < 121; i++) {
    if (board[i]?.color === color) {
      totalDist += _axialDist(i, center);
      count++;
    }
  }
  if (count === 0) return 0;
  return Math.max(0, 1 - totalDist / (count * maxDist));
}

// ─── Lightweight state clone ──────────────────────────────────────────────────

function cloneState(state) {
  return {
    board:    state.board.map((p) => p ? { color: p.color } : null),
    turn:     state.turn,
    activeColors: (state.activeColors ?? ['red', 'orange']).slice(),
    gameOver: state.gameOver,
    winner:   state.winner,
    winners:  (state.winners ?? []).slice(),
    players: {
      1: { color: state.players[1]?.color ?? null },
      2: { color: state.players[2]?.color ?? null },
      3: { color: state.players[3]?.color ?? null },
      4: { color: state.players[4]?.color ?? null },
    },
    lastMove:     null,
    history:      [],
    redoSnapshot: null,
    tick:         0,
  };
}

function _nextTurn(state) {
  const active = state.activeColors;
  const idx = active.indexOf(state.turn);
  for (let i = 1; i <= active.length; i++) {
    const next = active[(idx + i) % active.length];
    if (!(state.winners ?? []).includes(next)) return next;
  }
  return state.turn;
}

function applyMove(s, from, to) {
  const piece = s.board[from];
  s.board[from] = null;
  s.board[to] = piece;
  // Check win.
  const goalCells = goalArmCells(piece.color);
  if (goalCells && goalCells.every((i) => s.board[i]?.color === piece.color)) {
    if (!s.winners) s.winners = [];
    if (!s.winners.includes(piece.color)) s.winners.push(piece.color);
    const remaining = s.activeColors.filter(c => !s.winners.includes(c));
    if (remaining.length <= 1) {
      s.gameOver = true;
      s.winner   = s.winners[0];
    }
  }
  s.turn = _nextTurn(s);
}

// ─── UCT MCTS ─────────────────────────────────────────────────────────────────

class Node {
  constructor(state, move, parent) {
    this.state    = state;
    this.move     = move;    // { from, to } that led to this state
    this.parent   = parent;
    this.children = [];
    this.visits   = 0;
    this.wins     = 0;       // from root color's perspective
    this.untriedMoves = null; // lazily populated
  }

  isFullyExpanded() {
    return this.untriedMoves !== null && this.untriedMoves.length === 0;
  }

  uct(totalVisits, rootColor) {
    if (this.visits === 0) return Infinity;
    const exploit = this.wins / this.visits;
    const explore = C * Math.sqrt(Math.log(totalVisits) / this.visits);
    return exploit + explore;
  }
}

function _rollout(state, rootColor, depth) {
  const s = cloneState(state);
  for (let d = 0; d < depth; d++) {
    if (s.gameOver) break;
    const moves = legalMovesFor(s, s.turn);
    if (moves.length === 0) break;
    const m = moves[Math.floor(Math.random() * moves.length)];
    applyMove(s, m.from, m.to);
  }
  if (s.gameOver) {
    return s.winner === rootColor ? 1 : 0;
  }
  return _evaluate(s.board, rootColor);
}

function _select(node, rootColor) {
  let cur = node;
  while (cur.children.length > 0 && cur.isFullyExpanded()) {
    let best = null;
    let bestVal = -Infinity;
    for (const child of cur.children) {
      const val = child.uct(cur.visits, rootColor);
      if (val > bestVal) { bestVal = val; best = child; }
    }
    cur = best;
  }
  return cur;
}

function _expand(node) {
  if (node.untriedMoves === null) {
    const moves = legalMovesFor(node.state, node.state.turn);
    node.untriedMoves = moves.map((m) => ({ from: m.from, to: m.to }));
  }
  if (node.untriedMoves.length === 0) return node;
  const idx = Math.floor(Math.random() * node.untriedMoves.length);
  const move = node.untriedMoves.splice(idx, 1)[0];
  const childState = cloneState(node.state);
  applyMove(childState, move.from, move.to);
  const child = new Node(childState, move, node);
  node.children.push(child);
  return child;
}

function _backprop(node, result) {
  let cur = node;
  while (cur) {
    cur.visits++;
    cur.wins += result;
    result = 1 - result; // flip: alternating players
    cur = cur.parent;
  }
}

function mcts(state, maxIter, maxMs) {
  const rootColor = state.turn;
  const root = new Node(cloneState(state), null, null);
  const deadline = Date.now() + maxMs;

  for (let i = 0; i < maxIter; i++) {
    if (Date.now() > deadline) break;
    const selected = _select(root, rootColor);
    const expanded = _expand(selected);
    const result   = _rollout(expanded.state, rootColor, ROLLOUT_DEPTH);
    _backprop(expanded, result);
  }

  // Pick child with most visits.
  if (root.children.length === 0) return null;
  let best = root.children[0];
  for (const child of root.children) {
    if (child.visits > best.visits) best = child;
  }
  return best.move;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function suggestMove(state) {
  if (state.gameOver) return { move: null };
  const moves = legalMovesFor(state, state.turn);
  if (moves.length === 0) return { move: null };

  const level = state._computerLevel ?? 'medium';
  const { maxIter, maxMs } = _budget(level);

  const m = mcts(state, maxIter, maxMs);
  if (!m) {
    const pick = moves[Math.floor(Math.random() * moves.length)];
    return { move: { from: pick.from, to: pick.to, path: pick.path } };
  }
  return { move: { from: m.from, to: m.to, path: [m.to] } };
}
