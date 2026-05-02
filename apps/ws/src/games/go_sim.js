const BOARD_SIZE = 9;

export function newGameState() {
  const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  return {
    tick: 0,
    boardSize: BOARD_SIZE,
    board,
    turn: 'black',
    captures: { black: 0, white: 0 },
    // Each history entry: { board, boardStr, turn, captures, lastMove, passCount }
    history: [],
    redoSnapshot: null,
    lastMove: null,   // null | { x, y } | 'pass'
    passCount: 0,
    gameOver: false,
    score: null,      // set when gameOver; result of estimateScore()
    players: {
      1: newPlayerState(),
      2: newPlayerState(),
      3: newPlayerState(),
      4: newPlayerState(),
    },
  };
}

function newPlayerState() {
  return { connected: false, color: null };
}

// ─── Player management ────────────────────────────────────────────────────────

export function setPlayerConnected(state, pid, connected) {
  state.players[pid].connected = connected;
  // Intentionally keep color on disconnect so they can reclaim it on rejoin.
}

export function selectColor(state, pid, color) {
  if (color !== 'black' && color !== 'white' && color !== null) {
    return { ok: false, error: 'Invalid color. Choose black, white, or null (spectate).' };
  }
  state.players[pid].color = color;
  return { ok: true };
}

// ─── Board helpers ────────────────────────────────────────────────────────────

function neighbors(x, y, size) {
  const result = [];
  if (x > 0)        result.push([x - 1, y]);
  if (x < size - 1) result.push([x + 1, y]);
  if (y > 0)        result.push([x, y - 1]);
  if (y < size - 1) result.push([x, y + 1]);
  return result;
}

function copyBoard(board) {
  return board.map(row => [...row]);
}

function boardToString(board) {
  return board.map(row => row.map(c => c === 'black' ? 'B' : c === 'white' ? 'W' : '.').join('')).join('|');
}

// BFS to find the group containing (x,y) and count its liberties.
function getGroup(board, x, y, size) {
  const color = board[y][x];
  if (!color) return { stones: [], liberties: new Set() };

  const stones = [];
  const liberties = new Set();
  const visited = new Set();
  const queue = [{ x, y }];

  while (queue.length > 0) {
    const { x: cx, y: cy } = queue.shift();
    const k = `${cx},${cy}`;
    if (visited.has(k)) continue;
    visited.add(k);

    if (board[cy][cx] === color) {
      stones.push({ x: cx, y: cy });
      for (const [nx, ny] of neighbors(cx, cy, size)) {
        const nk = `${nx},${ny}`;
        if (!visited.has(nk)) {
          if (board[ny][nx] === null) {
            liberties.add(nk);
          } else if (board[ny][nx] === color) {
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }
  }

  return { stones, liberties };
}

// ─── Game actions ─────────────────────────────────────────────────────────────

export function placeStone(state, pid, x, y) {
  const player = state.players[pid];
  const color = player?.color;

  if (!color) return { ok: false, error: 'No color selected' };
  if (color !== state.turn) return { ok: false, error: 'Not your turn' };
  if (state.gameOver) return { ok: false, error: 'Game is over — press Restart to play again' };

  const size = state.boardSize;
  if (x < 0 || x >= size || y < 0 || y >= size) return { ok: false, error: 'Out of bounds' };
  if (state.board[y][x] !== null) return { ok: false, error: 'Intersection occupied' };

  const newBoard = copyBoard(state.board);
  newBoard[y][x] = color;

  const opponent = color === 'black' ? 'white' : 'black';
  let captured = 0;
  const capturedCells = [];

  // Capture opponent groups with no liberties.
  for (const [nx, ny] of neighbors(x, y, size)) {
    if (newBoard[ny][nx] === opponent) {
      const group = getGroup(newBoard, nx, ny, size);
      if (group.liberties.size === 0) {
        for (const stone of group.stones) {
          newBoard[stone.y][stone.x] = null;
          capturedCells.push({ x: stone.x, y: stone.y });
          captured++;
        }
      }
    }
  }

  // Suicide check: own group must have at least one liberty after any captures.
  const ownGroup = getGroup(newBoard, x, y, size);
  if (ownGroup.liberties.size === 0 && captured === 0) {
    return { ok: false, error: 'Suicide move not allowed' };
  }

  // Ko check: the snapshot pushed to history is the state BEFORE each move,
  // so history[last] is the board just before the opponent's last stone — exactly
  // what Ko forbids recreating.
  const newBoardStr = boardToString(newBoard);
  if (state.history.length >= 1) {
    const prev = state.history[state.history.length - 1];
    if (prev.boardStr === newBoardStr) {
      return { ok: false, error: 'Ko: cannot repeat a previous board position' };
    }
  }

  // Commit — push snapshot BEFORE applying changes.
  _pushSnapshot(state);

  state.board = newBoard;
  state.captures[color] += captured;
  state.lastMove = { x, y };
  state.passCount = 0;
  state.turn = opponent;
  state.tick++;

  return { ok: true, captured, capturedCells };
}

export function passTurn(state, pid) {
  const player = state.players[pid];
  const color = player?.color;

  if (!color) return { ok: false, error: 'No color selected' };
  if (color !== state.turn) return { ok: false, error: 'Not your turn' };
  if (state.gameOver) return { ok: false, error: 'Game is over — press Restart to play again' };

  _pushSnapshot(state);

  const opponent = state.turn === 'black' ? 'white' : 'black';
  state.lastMove = 'pass';
  state.passCount++;
  state.turn = opponent;
  state.tick++;

  // Two consecutive passes end the game softly.
  if (state.passCount >= 2) {
    state.gameOver = true;
    state.score = estimateScore(state);
  }

  return { ok: true };
}

/**
 * Place a stone as the computer (no player-ID validation).
 * Places as `state.turn`, enforces Go rules (captures, suicide, Ko), alternates turn.
 */
export function computerPlaceStone(state, x, y) {
  const color = state.turn;
  if (state.gameOver) return { ok: false, error: 'Game is over.' };
  const size = state.boardSize;
  if (x < 0 || x >= size || y < 0 || y >= size) return { ok: false, error: 'Out of bounds' };
  if (state.board[y][x] !== null) return { ok: false, error: 'Intersection occupied' };

  const newBoard = copyBoard(state.board);
  newBoard[y][x] = color;

  const opponent = color === 'black' ? 'white' : 'black';
  let captured = 0;
  const capturedCells = [];
  for (const [nx, ny] of neighbors(x, y, size)) {
    if (newBoard[ny][nx] === opponent) {
      const group = getGroup(newBoard, nx, ny, size);
      if (group.liberties.size === 0) {
        for (const stone of group.stones) {
          newBoard[stone.y][stone.x] = null;
          capturedCells.push({ x: stone.x, y: stone.y });
          captured++;
        }
      }
    }
  }
  const ownGroup = getGroup(newBoard, x, y, size);
  if (ownGroup.liberties.size === 0 && captured === 0) return { ok: false, error: 'Suicide move not allowed' };
  const newBoardStr = boardToString(newBoard);
  if (state.history.length >= 1) {
    const prev = state.history[state.history.length - 1];
    if (prev.boardStr === newBoardStr) return { ok: false, error: 'Ko: cannot repeat a previous board position' };
  }

  _pushSnapshot(state);
  state.board = newBoard;
  state.captures[color] += captured;
  state.lastMove = { x, y };
  state.passCount = 0;
  state.turn = opponent;
  state.tick++;
  return { ok: true, captured, capturedCells };
}

/**
 * Pass a turn as the computer (no player-ID validation).
 */
export function computerPassTurn(state) {
  if (state.gameOver) return { ok: false, error: 'Game is over.' };
  _pushSnapshot(state);
  const opponent = state.turn === 'black' ? 'white' : 'black';
  state.lastMove = 'pass';
  state.passCount++;
  state.turn = opponent;
  state.tick++;
  if (state.passCount >= 2) {
    state.gameOver = true;
    state.score = estimateScore(state);
  }
  return { ok: true };
}

export function undoMove(state) {
  if (state.history.length === 0) return { ok: false, error: 'Nothing to undo' };

  state.redoSnapshot = {
    board: copyBoard(state.board),
    boardStr: boardToString(state.board),
    turn: state.turn,
    captures: { ...state.captures },
    lastMove: state.lastMove,
    passCount: state.passCount,
    gameOver: state.gameOver,
    score: state.score,
  };

  const snapshot = state.history.pop();
  state.board = snapshot.board;
  state.turn = snapshot.turn;
  state.captures = { ...snapshot.captures };
  state.lastMove = snapshot.lastMove;
  state.passCount = snapshot.passCount;
  state.gameOver = false;
  state.score = null;
  state.tick++;

  return { ok: true };
}

export function redoMove(state) {
  if (!state.redoSnapshot) return { ok: false, error: 'Nothing to redo' };
  const snap = state.redoSnapshot;
  _pushSnapshot(state);
  state.board = snap.board;
  state.turn = snap.turn;
  state.captures = { ...snap.captures };
  state.lastMove = snap.lastMove;
  state.passCount = snap.passCount;
  state.gameOver = snap.gameOver ?? false;
  state.score = snap.score ?? null;
  state.tick++;
  return { ok: true };
}

export function resetGame(state) {
  const size = state.boardSize;
  state.board = Array.from({ length: size }, () => Array(size).fill(null));
  state.turn = 'black';
  state.captures = { black: 0, white: 0 };
  state.history = [];
  state.redoSnapshot = null;
  state.lastMove = null;
  state.passCount = 0;
  state.gameOver = false;
  state.score = null;
  state.tick++;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export function estimateScore(state) {
  const size = state.boardSize;
  const board = state.board;
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  const territory = { black: 0, white: 0, neutral: 0 };
  const stones = { black: 0, white: 0 };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] === 'black') stones.black++;
      else if (board[y][x] === 'white') stones.white++;
    }
  }

  const territoryCells = { black: [], white: [], neutral: [] };

  // Flood-fill empty regions to determine territory.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== null || visited[y][x]) continue;

      const region = [];
      let touchesBlack = false;
      let touchesWhite = false;
      const queue = [{ x, y }];

      while (queue.length > 0) {
        const { x: cx, y: cy } = queue.shift();
        if (visited[cy][cx]) continue;
        visited[cy][cx] = true;
        region.push({ x: cx, y: cy });

        for (const [nx, ny] of neighbors(cx, cy, size)) {
          if (board[ny][nx] === null && !visited[ny][nx]) {
            queue.push({ x: nx, y: ny });
          } else if (board[ny][nx] === 'black') {
            touchesBlack = true;
          } else if (board[ny][nx] === 'white') {
            touchesWhite = true;
          }
        }
      }

      if (touchesBlack && !touchesWhite) {
        territory.black += region.length;
        territoryCells.black.push(...region);
      } else if (touchesWhite && !touchesBlack) {
        territory.white += region.length;
        territoryCells.white.push(...region);
      } else {
        territory.neutral += region.length;
        territoryCells.neutral.push(...region);
      }
    }
  }

  // Area scoring: stones + territory + captures of opponent stones
  const blackTotal = stones.black + territory.black + state.captures.black;
  const whiteTotal = stones.white + territory.white + state.captures.white;

  return {
    stones,
    territory,
    territoryCells,
    captures: { ...state.captures },
    total: { black: blackTotal, white: whiteTotal },
    winner: blackTotal > whiteTotal ? 'black' : blackTotal < whiteTotal ? 'white' : 'tie',
  };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _pushSnapshot(state) {
  state.history.push({
    board: copyBoard(state.board),
    boardStr: boardToString(state.board),
    turn: state.turn,
    captures: { ...state.captures },
    lastMove: state.lastMove,
    passCount: state.passCount,
  });
  // Keep history bounded — 300 moves is plenty for any game of Go.
  if (state.history.length > 300) state.history.shift();
  state.redoSnapshot = null;
}
