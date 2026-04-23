/**
 * foxgeese_hint.js — MCTS hint engine for Fox and Geese.
 *
 * Uses UCT (C=1.4) with random rollouts capped at 60 ply.
 * Budget: up to 2000 iterations or 1500ms, whichever comes first.
 */

import { legalMovesFor, COORDS } from './foxgeese_sim.js';

const C              = 1.4;
const MAX_ITER       = 2000;
const TIME_BUDGET_MS = 1500;
const ROLLOUT_DEPTH  = 60;

// ─── Local topology helpers ───────────────────────────────────────────────────

// Build (col,row) → index lookup from the imported COORDS.
const _IDX = {};
for (let i = 0; i < COORDS.length; i++) {
  _IDX[`${COORDS[i].col},${COORDS[i].row}`] = i;
}
function _lookup(col, row) {
  const v = _IDX[`${col},${row}`];
  return v !== undefined ? v : -1;
}

// ─── Lightweight state operations ────────────────────────────────────────────

function cloneState(state) {
  return {
    board:         state.board.slice(),
    turn:          state.turn,
    pendingJump:   state.pendingJump,
    geeseCaptured: state.geeseCaptured,
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
    tick:     0,
  };
}

// Apply a move to a (cloned) state without snapshot or validation.
function applyMove(s, move) {
  const actingColor = s.pendingJump !== null ? 'black' : s.turn;
  const { from, to } = move;

  let captured = false;
  if (actingColor === 'black') {
    const { col: fc, row: fr } = COORDS[from];
    const { col: tc, row: tr } = COORDS[to];
    const dc = tc - fc;
    const dr = tr - fr;
    if (Math.abs(dc) === 2 || Math.abs(dr) === 2) {
      const midIdx = _lookup(fc + dc / 2, fr + dr / 2);
      if (midIdx >= 0 && s.board[midIdx] === 'white') {
        s.board[midIdx] = null;
        s.geeseCaptured++;
        captured = true;
      }
    }
  }

  s.board[from] = null;
  s.board[to]   = actingColor;

  if (actingColor === 'black') {
    _afterFoxMove(s, to, captured);
  } else {
    s.turn = 'black';
    _checkWin(s);
  }
}

function _afterFoxMove(s, landIdx, wasCap) {
  if (wasCap) {
    // Check for continuation captures from landing square.
    const { col: lc, row: lr } = COORDS[landIdx];
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const midIdx  = _lookup(lc + dc,     lr + dr);
      const landIdx2 = _lookup(lc + 2 * dc, lr + 2 * dr);
      if (
        midIdx >= 0 && landIdx2 >= 0 &&
        s.board[midIdx] === 'white' && s.board[landIdx2] === null
      ) {
        s.pendingJump = landIdx;
        return; // More captures available — turn stays 'black'
      }
    }
  }
  s.pendingJump = null;
  s.turn = 'white';
  _checkWin(s);
}

function _checkWin(s) {
  if (s.gameOver) return;
  if (s.geeseCaptured >= 10) {
    s.gameOver = true;
    s.winner   = 'black';
    return;
  }
  if (s.turn === 'black') {
    const moves = legalMovesFor(s, 'black');
    if (moves.length === 0) {
      s.gameOver = true;
      s.winner   = 'white';
    }
  }
}

// ─── Rollout ─────────────────────────────────────────────────────────────────

function rollout(s, rootColor) {
  let depth = 0;
  while (!s.gameOver && depth < ROLLOUT_DEPTH) {
    const actingColor = s.pendingJump !== null ? 'black' : s.turn;
    const moves = legalMovesFor(s, actingColor);
    if (moves.length === 0) break;
    applyMove(s, moves[Math.floor(Math.random() * moves.length)]);
    depth++;
  }

  if (s.gameOver) {
    if (s.winner === rootColor) return 1;
    if (s.winner === null)      return 0.5;
    return 0;
  }

  // Non-terminal heuristic.
  if (rootColor === 'black') {
    // Fox: reward capturing geese.
    return s.geeseCaptured / 13;
  } else {
    // Geese: reward limiting fox's mobility.
    const foxMoves = legalMovesFor(s, 'black').length;
    return foxMoves === 0 ? 1 : Math.max(0, (6 - Math.min(foxMoves, 6)) / 8);
  }
}

// ─── UCT search ──────────────────────────────────────────────────────────────

/**
 * Suggests the best move for the current player.
 * @param {object} state — snapshot of foxgeese sim state
 * @returns {{ move: { type: 'move', from: number, to: number } | null }}
 */
export function suggestMove(state) {
  const actingColor = state.pendingJump !== null ? 'black' : state.turn;
  if (!actingColor) return { move: null };

  const rootMoves = legalMovesFor(state, actingColor);
  if (rootMoves.length === 0) return { move: null };
  if (rootMoves.length === 1) return { move: rootMoves[0] };

  const nodes = rootMoves.map((move) => ({ move, wins: 0, visits: 0 }));
  const start  = Date.now();
  let iter     = 0;

  while (iter < MAX_ITER && Date.now() - start < TIME_BUDGET_MS) {
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
    applyMove(s, best.move);
    const result = rollout(s, actingColor);

    best.wins   += result;
    best.visits += 1;
    iter++;
  }

  nodes.sort((a, b) => b.visits - a.visits);
  return { move: nodes[0].move };
}
