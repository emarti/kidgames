/**
 * piratesbulgars_hint.js — MCTS hint engine for Pirates and Bulgars.
 *
 * Uses UCT (C=1.4) with random rollouts capped at 60 ply.
 * Budget: up to 2000 iterations or 1500ms, whichever comes first.
 */

import { legalMovesFor, COORDS, FORTRESS, ADJACENCY } from './piratesbulgars_sim.js';

const C              = 1.4;
const MAX_ITER       = 2000;
const TIME_BUDGET_MS = 1500;
const ROLLOUT_DEPTH  = 60;

// ─── Local topology helpers ───────────────────────────────────────────────────

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
    board:           state.board.slice(),
    turn:            state.turn,
    pendingJump:     state.pendingJump,
    piratesCaptured: state.piratesCaptured,
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

function applyMove(s, move) {
  const actingColor = s.pendingJump !== null ? 'black' : s.turn;
  const { from, to } = move;

  let captured = false;
  if (actingColor === 'black') {
    const { col: bc, row: br } = COORDS[from];
    const { col: tc, row: tr } = COORDS[to];
    const dc = tc - bc;
    const dr = tr - br;
    if (Math.abs(dc) === 2 || Math.abs(dr) === 2) {
      const midIdx = _lookup(bc + dc / 2, br + dr / 2);
      if (midIdx >= 0 && s.board[midIdx] === 'white') {
        s.board[midIdx] = null;
        s.piratesCaptured++;
        captured = true;
      }
    }
  }

  s.board[from] = null;
  s.board[to]   = actingColor;

  if (actingColor === 'black') {
    _afterBulgarMove(s, to, captured);
  } else {
    s.turn = 'black';
    _checkWin(s);
  }
}

function _bulgarCaptures(board, bulgarIdx) {
  const caps = [];
  const { col: bc, row: br } = COORDS[bulgarIdx];
  for (const midIdx of ADJACENCY[bulgarIdx]) {
    if (board[midIdx] !== 'white') continue;
    const { col: mc, row: mr } = COORDS[midIdx];
    const dc = mc - bc;
    const dr = mr - br;
    const toIdx = _lookup(bc + 2 * dc, br + 2 * dr);
    if (toIdx >= 0 && board[toIdx] === null && ADJACENCY[midIdx].includes(toIdx)) {
      caps.push(toIdx);
    }
  }
  return caps;
}

function _afterBulgarMove(s, landIdx, wasCap) {
  if (wasCap) {
    const more = _bulgarCaptures(s.board, landIdx);
    if (more.length > 0) {
      // In rollouts, randomly decide whether to continue jumping.
      if (Math.random() < 0.7) {
        s.pendingJump = landIdx;
        return;
      }
    }
  }
  s.pendingJump = null;
  s.turn = 'white';
  _checkWin(s);
}

function _checkWin(s) {
  if (s.gameOver) return;
  const pirateCount = s.board.filter(c => c === 'white').length;
  if (pirateCount < 9) {
    s.gameOver = true;
    s.winner   = 'black';
    return;
  }
  let fortressFilled = true;
  for (const idx of FORTRESS) {
    if (s.board[idx] !== 'white') { fortressFilled = false; break; }
  }
  if (fortressFilled) {
    s.gameOver = true;
    s.winner   = 'white';
    return;
  }
  if (s.turn === 'black' && s.pendingJump === null) {
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
  if (rootColor === 'white') {
    // Pirates: reward filling fortress points.
    let filled = 0;
    for (const idx of FORTRESS) {
      if (s.board[idx] === 'white') filled++;
    }
    return filled / 9;
  } else {
    // Bulgars: reward capturing pirates.
    return Math.min(s.piratesCaptured / 16, 1);
  }
}

// ─── UCT search ──────────────────────────────────────────────────────────────

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
