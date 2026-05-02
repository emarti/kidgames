/**
 * hex_sim.js — Game logic for Hex (variable size: 9×9 or 11×11).
 *
 * Two-player connection game on a rhombus grid of hexagonal cells.
 * Black connects top row (row 0) to bottom row (row N-1).
 * White connects left column (col 0) to right column (col N-1).
 * No captures, no draws possible. Black moves first.
 *
 * Board: flat array of N*N cells, index = row * N + col.
 * Adjacency: each hex has up to 6 neighbors:
 *   (r-1,c), (r-1,c+1), (r,c-1), (r,c+1), (r+1,c-1), (r+1,c)
 */

export const DEFAULT_SIZE = 11;
const HEX_DELTAS = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]];

// ─── Adjacency ────────────────────────────────────────────────────────────────

export function getNeighbors(index, size) {
  const r = Math.floor(index / size);
  const c = index % size;
  const adj = [];
  for (const [dr, dc] of HEX_DELTAS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
      adj.push(nr * size + nc);
    }
  }
  return adj;
}

// ─── Win detection (BFS flood-fill) ───────────────────────────────────────────

/**
 * Check if `color` has won. Returns the winning path (array of indices) or null.
 * Black wins: connected path from any cell in row 0 to any cell in row (size-1).
 * White wins: connected path from any cell in col 0 to any cell in col (size-1).
 */
export function checkWin(board, color, size) {
  const total = size * size;
  // Starting edge cells
  const startCells = [];
  for (let i = 0; i < total; i++) {
    if (board[i] !== color) continue;
    const r = Math.floor(i / size);
    const c = i % size;
    if (color === 'black' && r === 0) startCells.push(i);
    if (color === 'white' && c === 0) startCells.push(i);
  }
  if (startCells.length === 0) return null;

  // BFS
  const visited = new Uint8Array(total);
  const parent = new Int16Array(total).fill(-1);
  const queue = [];
  for (const s of startCells) {
    visited[s] = 1;
    queue.push(s);
  }

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const r = Math.floor(cur / size);
    const c = cur % size;
    // Check if we reached the opposite edge
    if (color === 'black' && r === size - 1) {
      return _tracePath(parent, cur, startCells);
    }
    if (color === 'white' && c === size - 1) {
      return _tracePath(parent, cur, startCells);
    }
    for (const nb of getNeighbors(cur, size)) {
      if (!visited[nb] && board[nb] === color) {
        visited[nb] = 1;
        parent[nb] = cur;
        queue.push(nb);
      }
    }
  }
  return null;
}

function _tracePath(parent, end, startCells) {
  const path = [];
  let cur = end;
  const startSet = new Set(startCells);
  while (cur !== -1) {
    path.push(cur);
    if (startSet.has(cur) && parent[cur] === -1) break;
    cur = parent[cur];
  }
  return path;
}

// ─── State ────────────────────────────────────────────────────────────────────

function newPlayerState() {
  return { connected: false, color: null };
}

export function newGameState(size) {
  const n = size === 9 ? 9 : DEFAULT_SIZE;
  return {
    tick: 0,
    boardSize: n,
    board: new Array(n * n).fill(null),
    turn: 'black',
    moveCount: 0,
    lastMove: null,
    gameOver: false,
    winner: null,
    winPath: null,
    history: [],
    redoSnapshot: null,
    players: {
      1: newPlayerState(),
      2: newPlayerState(),
      3: newPlayerState(),
      4: newPlayerState(),
    },
  };
}

// ─── Player management ────────────────────────────────────────────────────────

export function setPlayerConnected(state, pid, connected) {
  state.players[pid].connected = connected;
}

export function selectColor(state, pid, color) {
  if (color !== 'black' && color !== 'white' && color !== null) {
    return { ok: false, error: 'Invalid color.' };
  }
  state.players[pid].color = color;
  return { ok: true };
}

// ─── History (for undo) ──────────────────────────────────────────────────────

const MAX_HISTORY = 300;

function _pushSnapshot(state) {
  state.history.push({
    board: state.board.slice(),
    turn: state.turn,
    moveCount: state.moveCount,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    gameOver: state.gameOver,
    winner: state.winner,
    winPath: state.winPath ? state.winPath.slice() : null,
  });
  if (state.history.length > MAX_HISTORY) state.history.shift();
  state.redoSnapshot = null;
}

// ─── Game actions ────────────────────────────────────────────────────────────

export function placeStone(state, pid, row, col) {
  if (state.gameOver) return { ok: false, error: 'Game is over.' };

  const pColor = state.players[pid]?.color;
  if (pColor && pColor !== state.turn) {
    return { ok: false, error: 'Not your turn.' };
  }

  const size = state.boardSize;
  if (row < 0 || row >= size || col < 0 || col >= size) {
    return { ok: false, error: 'Out of bounds.' };
  }
  const i = row * size + col;
  if (state.board[i] !== null) {
    return { ok: false, error: 'Cell occupied.' };
  }

  _pushSnapshot(state);

  state.board[i] = state.turn;
  state.moveCount++;
  state.lastMove = { row, col };

  const path = checkWin(state.board, state.turn, size);
  if (path) {
    state.gameOver = true;
    state.winner = state.turn;
    state.winPath = path;
  } else {
    state.turn = state.turn === 'black' ? 'white' : 'black';
  }

  state.tick++;
  return { ok: true };
}

// ─── Undo ────────────────────────────────────────────────────────────────────

export function undoMove(state) {
  if (state.history.length === 0) {
    return { ok: false, error: 'Nothing to undo.' };
  }
  // Save current state as redo snapshot before restoring.
  state.redoSnapshot = {
    board: state.board.slice(),
    turn: state.turn,
    moveCount: state.moveCount,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    gameOver: state.gameOver,
    winner: state.winner,
    winPath: state.winPath ? state.winPath.slice() : null,
  };
  const snap = state.history.pop();
  state.board = snap.board;
  state.turn = snap.turn;
  state.moveCount = snap.moveCount;
  state.lastMove = snap.lastMove;
  state.gameOver = snap.gameOver;
  state.winner = snap.winner;
  state.winPath = snap.winPath;
  state.tick++;
  return { ok: true };
}

export function redoMove(state) {
  if (!state.redoSnapshot) return { ok: false, error: 'Nothing to redo.' };
  const snap = state.redoSnapshot;
  _pushSnapshot(state);
  state.board = snap.board;
  state.turn = snap.turn;
  state.moveCount = snap.moveCount;
  state.lastMove = snap.lastMove;
  state.gameOver = snap.gameOver;
  state.winner = snap.winner;
  state.winPath = snap.winPath;
  state.tick++;
  return { ok: true };
}

// ─── Reset ───────────────────────────────────────────────────────────────────

/**
 * Place a stone as the computer (no player-ID / color validation).
 * Places as `state.turn`, saves undo snapshot, checks win, alternates turn.
 */
export function computerPlaceStone(state, row, col) {
  if (state.gameOver) return { ok: false, error: 'Game is over.' };
  const size = state.boardSize;
  if (row < 0 || row >= size || col < 0 || col >= size) {
    return { ok: false, error: 'Out of bounds.' };
  }
  const i = row * size + col;
  if (state.board[i] !== null) {
    return { ok: false, error: 'Cell occupied.' };
  }

  _pushSnapshot(state);

  state.board[i] = state.turn;
  state.moveCount++;
  state.lastMove = { row, col };

  const path = checkWin(state.board, state.turn, size);
  if (path) {
    state.gameOver = true;
    state.winner = state.turn;
    state.winPath = path;
  } else {
    state.turn = state.turn === 'black' ? 'white' : 'black';
  }

  state.tick++;
  return { ok: true };
}

export function resetGame(state) {
  const size = state.boardSize;
  state.board = new Array(size * size).fill(null);
  state.turn = 'black';
  state.moveCount = 0;
  state.lastMove = null;
  state.gameOver = false;
  state.winner = null;
  state.winPath = null;
  state.history = [];
  state.redoSnapshot = null;
  state.tick++;
}

// ─── Board size toggle ───────────────────────────────────────────────────────

export function setBoardSize(state, size) {
  const n = size === 9 ? 9 : 11;
  state.boardSize = n;
  state.board = new Array(n * n).fill(null);
  state.turn = 'black';
  state.moveCount = 0;
  state.lastMove = null;
  state.gameOver = false;
  state.winner = null;
  state.winPath = null;
  state.history = [];
  state.tick++;
}

// ─── Legal moves (for hint engine) ──────────────────────────────────────────

export function legalMovesFor(state, color) {
  if (state.gameOver) return [];
  if (state.turn !== color) return [];
  const size = state.boardSize;
  const total = size * size;
  const moves = [];
  for (let i = 0; i < total; i++) {
    if (state.board[i] === null) {
      moves.push({ row: Math.floor(i / size), col: i % size });
    }
  }
  return moves;
}
