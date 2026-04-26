/**
 * hex_hint.js — MCTS hint engine for Hex (variable size).
 *
 * Uses UCT (C=1.4) with random rollouts to terminal.
 * Budget: up to 3000 iterations or 1500ms, whichever comes first.
 * Terminal evaluation: flood-fill win check (no draws in Hex).
 */

import { getNeighbors, checkWin } from './hex_sim.js';

const C = 1.4;
const MAX_ITER = 3000;
const TIME_BUDGET_MS = 1500;

// ─── Lightweight state operations ────────────────────────────────────────────

function cloneState(state) {
  return {
    board: state.board.slice(),
    boardSize: state.boardSize,
    turn: state.turn,
    gameOver: state.gameOver,
    winner: state.winner,
  };
}

function opponent(color) {
  return color === 'black' ? 'white' : 'black';
}

// Returns list of empty cell indices.
function emptyCells(board) {
  const cells = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) cells.push(i);
  }
  return cells;
}

// Quick win check (returns boolean, no path tracing needed).
function hasWon(board, color, size) {
  const total = size * size;
  const visited = new Uint8Array(total);
  const queue = [];

  for (let i = 0; i < total; i++) {
    if (board[i] !== color) continue;
    const r = Math.floor(i / size);
    const c = i % size;
    if (color === 'black' && r === 0) { visited[i] = 1; queue.push(i); }
    if (color === 'white' && c === 0) { visited[i] = 1; queue.push(i); }
  }
  if (queue.length === 0) return false;

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const r = Math.floor(cur / size);
    const c = cur % size;
    if (color === 'black' && r === size - 1) return true;
    if (color === 'white' && c === size - 1) return true;
    for (const nb of getNeighbors(cur, size)) {
      if (!visited[nb] && board[nb] === color) {
        visited[nb] = 1;
        queue.push(nb);
      }
    }
  }
  return false;
}

// Apply move to a cloned state (no validation, no history).
function applyMove(s, cellIndex) {
  s.board[cellIndex] = s.turn;
  if (hasWon(s.board, s.turn, s.boardSize)) {
    s.gameOver = true;
    s.winner = s.turn;
  } else {
    s.turn = opponent(s.turn);
  }
}

// ─── MCTS ────────────────────────────────────────────────────────────────────

function rollout(s, rootColor) {
  const size = s.boardSize;
  // Collect empty cells, shuffle, and fill alternately (fast Hex rollout).
  const empty = emptyCells(s.board);
  // Fisher-Yates shuffle
  for (let i = empty.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [empty[i], empty[j]] = [empty[j], empty[i]];
  }
  // Fill the board: alternate turns among shuffled empty cells.
  let color = s.turn;
  for (const cell of empty) {
    s.board[cell] = color;
    color = opponent(color);
  }
  // With a full board, exactly one player has won (Hex property — no draws).
  if (hasWon(s.board, rootColor, size)) return 1;
  return 0;
}

/**
 * Suggests the best move for the current state.
 * @param {object} state — snapshot of hex sim state
 * @returns {{ move: { row, col } | null }}
 */
export function suggestMove(state) {
  if (state.gameOver) return { move: null };
  const size = state.boardSize;

  const empty = emptyCells(state.board);
  if (empty.length === 0) return { move: null };
  if (empty.length === 1) {
    const i = empty[0];
    return { move: { row: Math.floor(i / size), col: i % size } };
  }

  // MCTS nodes: one per empty cell.
  const nodes = empty.map((cellIdx) => ({ cellIdx, wins: 0, visits: 0 }));
  const rootColor = state.turn;
  const start = Date.now();
  let iter = 0;

  while (iter < MAX_ITER && Date.now() - start < TIME_BUDGET_MS) {
    // Select: UCT
    let best = null;
    let bestScore = -Infinity;
    const totalVisits = iter;

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
    applyMove(s, best.cellIdx);
    const result = rollout(s, rootColor);

    best.wins += result;
    best.visits += 1;
    iter++;
  }

  // Pick the most-visited node.
  nodes.sort((a, b) => b.visits - a.visits);
  const bestCell = nodes[0].cellIdx;
  return { move: { row: Math.floor(bestCell / size), col: bestCell % size } };
}
