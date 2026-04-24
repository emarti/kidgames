/**
 * piratesbulgars.js — Phaser 3 renderer for Pirates and Bulgars.
 * Pirates = 'white' (dark/black pieces), Bulgars = 'black' (gold/cream pieces).
 *
 * Renderer interface:
 *   init(scene, config)   config: { boardX, boardY, boardSize, onAction }
 *   draw(gameState, ctx)  ctx: { myPid, mySide, canMove }
 *   showHint(hintMsg)
 *   clearHint()
 *   resetSelection()
 *   shutdown()
 *   formatTurnText(state)
 *   formatTurnColor(state)
 *   formatCaptureText(state)
 *   getGameOverInfo(state)
 *   showPassButton (bool)
 */

// ─── Topology (self-contained, matches piratesbulgars_sim.js exactly) ────────

const COORDS = [
  // Row 0
  { col: 2, row: 0 }, { col: 3, row: 0 }, { col: 4, row: 0 },   // 0-2
  // Row 1
  { col: 2, row: 1 }, { col: 3, row: 1 }, { col: 4, row: 1 },   // 3-5
  // Row 2
  { col: 0, row: 2 }, { col: 1, row: 2 }, { col: 2, row: 2 },   // 6-8
  { col: 3, row: 2 }, { col: 4, row: 2 }, { col: 5, row: 2 }, { col: 6, row: 2 }, // 9-12
  // Row 3
  { col: 0, row: 3 }, { col: 1, row: 3 }, { col: 2, row: 3 },   // 13-15
  { col: 3, row: 3 }, { col: 4, row: 3 }, { col: 5, row: 3 }, { col: 6, row: 3 }, // 16-19
  // Row 4
  { col: 0, row: 4 }, { col: 1, row: 4 }, { col: 2, row: 4 },   // 20-22
  { col: 3, row: 4 }, { col: 4, row: 4 }, { col: 5, row: 4 }, { col: 6, row: 4 }, // 23-26
  // Row 5
  { col: 2, row: 5 }, { col: 3, row: 5 }, { col: 4, row: 5 },   // 27-29
  // Row 6
  { col: 2, row: 6 }, { col: 3, row: 6 }, { col: 4, row: 6 },   // 30-32
];

const POINT_POS = COORDS.map(({ col, row }) => ({ x: col / 6, y: row / 6 }));

const _IDX_MAP = {};
for (let i = 0; i < COORDS.length; i++) {
  _IDX_MAP[`${COORDS[i].col},${COORDS[i].row}`] = i;
}

const ADJ = COORDS.map(({ col, row }) => {
  const nb = [];
  for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const key = `${col + dc},${row + dr}`;
    if (_IDX_MAP[key] !== undefined) nb.push(_IDX_MAP[key]);
  }
  return nb;
});

// Diagonal connections: each of the five 2×2-cell squares has diagonals
// connecting its center to its four corners.
const _DIAG_CENTERS = [[3, 1], [1, 3], [3, 3], [5, 3], [3, 5]];
for (const [cx, cy] of _DIAG_CENTERS) {
  const ci = _IDX_MAP[`${cx},${cy}`];
  for (const [dc, dr] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const ni = _IDX_MAP[`${cx + dc},${cy + dr}`];
    if (ni !== undefined) {
      if (!ADJ[ci].includes(ni)) ADJ[ci].push(ni);
      if (!ADJ[ni].includes(ci)) ADJ[ni].push(ci);
    }
  }
}

// Fortress indices (rows 4–6, cols 2–4).
const FORTRESS = new Set([22, 23, 24, 27, 28, 29, 30, 31, 32]);

// ─── Renderer state ───────────────────────────────────────────────────────────

let _scene    = null;
let _bx       = 0;
let _by       = 0;
let _bs       = 0;
let _onAction = null;

let _boardGfx  = null;
let _markerGfx = null;
let _pieceGfx  = null;
let _hintGfx   = null;
let _hitZones  = [];

let _onPointerMove = null;
let _onPointerUp   = null;

let _selected  = null;
let _dragFrom  = null;
let _dragGfx   = null;
let _dragColor = null;

let _lastGameState = null;
let _lastCtx       = null;

// ─── Pixel helpers ────────────────────────────────────────────────────────────

function _px(idx) {
  const p = POINT_POS[idx];
  return { x: _bx + p.x * _bs, y: _by + p.y * _bs };
}

function _bulgarRadius() { return Math.max(14, Math.round(_bs * 0.06)); }
function _pirateRadius() { return Math.max(11, Math.round(_bs * 0.05)); }
function _hitRadius()    { return Math.max(22, Math.round(_bs * 0.07)); }

// ─── Board drawing ────────────────────────────────────────────────────────────

function _drawBoard() {
  const gfx = _boardGfx;
  gfx.clear();

  // Tan background.
  const pad = Math.round(_bs * 0.03);
  gfx.fillStyle(0xc8a96a, 1);
  gfx.fillRect(_bx - pad, _by - pad, _bs + pad * 2, _bs + pad * 2);

  // Fortress highlight (subtle darker tan).
  for (const idx of FORTRESS) {
    const p = _px(idx);
    const r = Math.round(_bs * 0.045);
    gfx.fillStyle(0xa08040, 0.35);
    gfx.fillCircle(p.x, p.y, r);
  }

  // All edges.
  gfx.lineStyle(2.5, 0x3d2010, 1);
  for (let i = 0; i < 33; i++) {
    for (const j of ADJ[i]) {
      if (j > i) {
        const pa = _px(i);
        const pb = _px(j);
        gfx.beginPath();
        gfx.moveTo(pa.x, pa.y);
        gfx.lineTo(pb.x, pb.y);
        gfx.strokePath();
      }
    }
  }

  // Small intersection dots.
  for (let i = 0; i < 33; i++) {
    const p = _px(i);
    gfx.fillStyle(0x3d2010, 0.5);
    gfx.fillCircle(p.x, p.y, 2.5);
  }
}

// ─── Last-move marker ─────────────────────────────────────────────────────────

function _drawLastMoveMarker(lastMove) {
  const gfx = _markerGfx;
  gfx.clear();
  if (!lastMove) return;
  const from = _px(lastMove.from);
  const to   = _px(lastMove.to);
  const r    = Math.max(10, Math.round(_bs * 0.04));
  const col  = lastMove.color === 'black' ? 0xccaa44 : 0x444466;
  // Highlight rings on source and destination squares.
  gfx.lineStyle(3, col, 0.6);
  gfx.strokeCircle(from.x, from.y, r + 4);
  gfx.strokeCircle(to.x, to.y, r + 4);
  // Small filled dot on destination.
  gfx.fillStyle(col, 0.35);
  gfx.fillCircle(to.x, to.y, r);
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function _drawPieces(board, selected, validDests, pendingJump) {
  const gfx = _pieceGfx;
  gfx.clear();

  const br = _bulgarRadius();
  const pr = _pirateRadius();

  for (let i = 0; i < 33; i++) {
    const color = board[i];
    if (!color) continue;
    const p   = _px(i);
    const r   = color === 'black' ? br : pr;
    const dim = (i === selected || i === pendingJump) ? 0.35 : 1;

    _drawPiece(gfx, p.x, p.y, r, color, dim);

    // Selection ring (green).
    if (i === selected) {
      gfx.lineStyle(2.5, 0x44ff88, 0.75);
      gfx.strokeCircle(p.x, p.y, r + 5);
    }

    // Pending-jump ring (gold).
    if (i === pendingJump) {
      gfx.lineStyle(3, 0xffd700, 0.9);
      gfx.strokeCircle(p.x, p.y, r + 7);
    }
  }

  // Valid destination highlights.
  if (validDests) {
    const hr = _pirateRadius();
    for (const di of validDests) {
      if (board[di] !== null) continue;
      const p = _px(di);
      gfx.fillStyle(0x00cc44, 0.4);
      gfx.fillCircle(p.x, p.y, hr);
      gfx.lineStyle(2.5, 0x00ff66, 0.8);
      gfx.strokeCircle(p.x, p.y, hr);
    }
  }
}

function _drawPiece(gfx, px, py, r, color, alpha = 1) {
  if (color === 'black') {
    // Bulgars: gold/cream (fortress defenders).
    gfx.fillStyle(0xe8d090, alpha);
    gfx.fillCircle(px, py, r);
    gfx.lineStyle(2, 0x8b7030, alpha);
    gfx.strokeCircle(px, py, r);
    // Highlight glint.
    gfx.fillStyle(0xfff8e0, 0.4 * alpha);
    gfx.fillCircle(px - r * 0.25, py - r * 0.25, r * 0.35);
  } else {
    // Pirates: dark/black.
    gfx.fillStyle(0x222233, alpha);
    gfx.fillCircle(px, py, r);
    gfx.lineStyle(1.5, 0x000000, alpha);
    gfx.strokeCircle(px, py, r);
    // Highlight glint.
    gfx.fillStyle(0x555566, 0.4 * alpha);
    gfx.fillCircle(px - r * 0.2, py - r * 0.2, r * 0.3);
  }
}

// ─── Hit zones ────────────────────────────────────────────────────────────────

function _buildHitZones() {
  for (const z of _hitZones) if (z && z.destroy) z.destroy();
  _hitZones = [];
  const hr = _hitRadius();
  for (let i = 0; i < 33; i++) {
    const p    = _px(i);
    const zone = _scene.add.circle(p.x, p.y, hr, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(15);
    const idx = i;
    zone.on('pointerdown', (pointer) => _onZoneDown(pointer, idx));
    _hitZones.push(zone);
  }
}

// ─── Input handling ───────────────────────────────────────────────────────────

function _computeLegalDests(gameState, fromIdx, color) {
  const board       = gameState.board;
  const pendingJump = gameState.pendingJump;
  const dests       = [];

  if (color === 'black') {
    // Bulgar: captures (jump) + regular moves.
    const { col: bc, row: br } = COORDS[fromIdx];
    const caps = [];
    for (const midIdx of ADJ[fromIdx]) {
      if (board[midIdx] !== 'white') continue;
      const { col: mc, row: mr } = COORDS[midIdx];
      const dc = mc - bc;
      const dr = mr - br;
      const toKey = `${bc + 2 * dc},${br + 2 * dr}`;
      const toIdx = _IDX_MAP[toKey];
      if (toIdx !== undefined && board[toIdx] === null && ADJ[midIdx].includes(toIdx)) {
        caps.push(toIdx);
      }
    }
    // During pendingJump, only capture moves.
    if (pendingJump !== null) return caps;
    // If any captures exist, they are forced.
    if (caps.length > 0) return caps;
    // No captures: regular adjacent moves.
    for (const nb of ADJ[fromIdx]) {
      if (board[nb] === null) dests.push(nb);
    }
  } else {
    // Pirates: forward or sideways.
    const fromRow = COORDS[fromIdx].row;
    for (const nb of ADJ[fromIdx]) {
      if (board[nb] === null && COORDS[nb].row >= fromRow) dests.push(nb);
    }
  }
  return dests;
}

function _onZoneDown(pointer, idx) {
  const g   = _lastGameState;
  const ctx = _lastCtx;
  if (!g || g.gameOver || !ctx) return;

  const mySide      = ctx.mySide;
  const actingColor = g.pendingJump !== null ? 'black' : g.turn;
  if (mySide !== 'both' && mySide !== actingColor) return;

  // During pending multi-jump: only capture destination clicks are valid.
  if (g.pendingJump !== null) {
    const dests = _computeLegalDests(g, g.pendingJump, 'black');
    if (dests.includes(idx)) {
      if (_onAction) _onAction('move_piece', { from: g.pendingJump, to: idx });
    }
    return;
  }

  if (_selected === null) {
    if (g.board[idx] === actingColor) {
      _selected = idx;
      _startDrag(idx, actingColor);
      _redraw();
    }
  } else {
    if (idx === _selected) {
      _selected = null;
      _cancelDrag();
      _redraw();
    } else if (g.board[idx] === null) {
      if (_onAction) _onAction('move_piece', { from: _selected, to: idx });
      _selected = null;
      _cancelDrag();
    } else if (g.board[idx] === actingColor) {
      _selected = idx;
      _cancelDrag();
      _startDrag(idx, actingColor);
      _redraw();
    }
  }
}

function _redraw() {
  if (_lastGameState && _lastCtx) piratesbulgarsRenderer.draw(_lastGameState, _lastCtx);
}

// ─── Drag handling ────────────────────────────────────────────────────────────

function _startDrag(from, color) {
  _dragFrom  = from;
  _dragColor = color;
  if (!_dragGfx) _dragGfx = _scene.add.graphics().setDepth(14);
}

function _updateDrag(px, py) {
  if (_dragFrom === null || !_dragGfx) return;
  _dragGfx.clear();
  const r = _dragColor === 'black' ? _bulgarRadius() : _pirateRadius();
  _drawPiece(_dragGfx, px, py, r, _dragColor);
}

function _endDrag(toIdx) {
  const from = _dragFrom;
  _dragFrom  = null;
  _dragColor = null;
  if (_dragGfx) _dragGfx.clear();
  if (from === null || toIdx === null || from === toIdx) return;

  const g   = _lastGameState;
  const ctx = _lastCtx;
  if (!g || g.gameOver || !ctx) return;

  const mySide      = ctx.mySide;
  const actingColor = g.pendingJump !== null ? 'black' : g.turn;
  if (mySide !== 'both' && mySide !== actingColor) return;
  if (g.board[from] !== actingColor) return;
  if (g.board[toIdx] !== null) return;

  _selected = null;
  if (_onAction) _onAction('move_piece', { from, to: toIdx });
}

function _cancelDrag() {
  _dragFrom  = null;
  _dragColor = null;
  if (_dragGfx) _dragGfx.clear();
}

function _nearestPoint(px, py) {
  let best  = null;
  let bestD = Infinity;
  const hr  = _hitRadius();
  for (let i = 0; i < 33; i++) {
    const p = _px(i);
    const d = Math.hypot(px - p.x, py - p.y);
    if (d < hr && d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ─── Public API ───────────────────────────────────────────────────────────────

const piratesbulgarsRenderer = {

  showPassButton: false,

  init(scene, config) {
    _scene    = scene;
    _bx       = config.boardX;
    _by       = config.boardY;
    _bs       = config.boardSize;
    _onAction = config.onAction ?? null;
    _selected  = null;
    _dragFrom  = null;
    _dragColor = null;
    _lastGameState = null;
    _lastCtx       = null;

    _boardGfx  = scene.add.graphics().setDepth(10);
    _markerGfx = scene.add.graphics().setDepth(11);
    _pieceGfx  = scene.add.graphics().setDepth(12);
    _hintGfx   = scene.add.graphics().setDepth(13);
    _dragGfx   = scene.add.graphics().setDepth(14);

    _drawBoard();
    _buildHitZones();

    _onPointerMove = (pointer) => {
      if (_dragFrom !== null) _updateDrag(pointer.x, pointer.y);
    };
    _onPointerUp = (pointer) => {
      if (_dragFrom !== null) {
        const toIdx = _nearestPoint(pointer.x, pointer.y);
        _endDrag(toIdx);
      }
    };
    scene.input.on('pointermove', _onPointerMove);
    scene.input.on('pointerup',   _onPointerUp);
  },

  draw(gameState, ctx) {
    if (!_scene) return;
    _lastGameState = gameState;
    _lastCtx       = ctx;

    const board       = gameState.board;
    const pendingJump = gameState.pendingJump ?? null;

    _drawBoard();

    let validDests    = null;
    const actingColor = pendingJump !== null ? 'black' : gameState.turn;
    const sourceIdx   = pendingJump !== null ? pendingJump : _selected;
    if (sourceIdx !== null && board[sourceIdx] === actingColor) {
      validDests = _computeLegalDests(gameState, sourceIdx, actingColor);
    }

    _drawLastMoveMarker(gameState.lastMove);
    _drawPieces(board, _selected, validDests, pendingJump);
  },

  showHint(hintMsg) {
    if (!_hintGfx) return;
    _hintGfx.clear();
    const move = hintMsg?.move ?? null;
    if (!move) return;

    const r = _pirateRadius();

    if (move.from !== undefined && move.to !== undefined) {
      const pf = _px(move.from);
      const pt = _px(move.to);
      _hintGfx.lineStyle(2, 0x4488ff, 0.4);
      _hintGfx.beginPath();
      _hintGfx.moveTo(pf.x, pf.y);
      _hintGfx.lineTo(pt.x, pt.y);
      _hintGfx.strokePath();
    }

    if (move.to !== undefined) {
      const pt = _px(move.to);
      _hintGfx.lineStyle(3, 0x4488ff, 0.9);
      _hintGfx.strokeCircle(pt.x, pt.y, r + 5);
    }
  },

  clearHint() {
    if (_hintGfx) _hintGfx.clear();
  },

  resetSelection() {
    _selected = null;
    _cancelDrag();
  },

  formatTurnText(gameState) {
    if (gameState.gameOver) {
      return gameState.winner === 'white' ? '🏴‍☠️ PIRATES win!' : '⚔️ BULGARS win!';
    }
    if (gameState.pendingJump !== null) {
      return '⚔️ BULGARS — must continue jumping';
    }
    const who = gameState.turn === 'white' ? '🏴‍☠️ PIRATES' : '⚔️ BULGARS';
    return `${who} to move`;
  },

  formatTurnColor(gameState) {
    if (gameState.gameOver) return '#ffd700';
    return gameState.turn === 'white' ? '#aabbcc' : '#eedd88';
  },

  formatCaptureText(gameState) {
    const pirateCount = gameState.board.filter(c => c === 'white').length;
    return `Pirates captured: ${gameState.piratesCaptured}   remaining: ${pirateCount}`;
  },

  getGameOverInfo(gameState) {
    if (!gameState.gameOver) return null;
    const pirateWon = gameState.winner === 'white';
    const pirateCount = gameState.board.filter(c => c === 'white').length;
    return {
      title:  'GAME OVER',
      winner: pirateWon ? '🏴‍☠️ PIRATES win!' : '⚔️ BULGARS win!',
      lines:  [
        `Pirates captured: ${gameState.piratesCaptured}   remaining: ${pirateCount}`,
      ],
      buttons: [
        { label: 'New Game', actions: ['restart'] },
      ],
    };
  },

  shutdown() {
    if (_scene && _onPointerMove) _scene.input.off('pointermove', _onPointerMove);
    if (_scene && _onPointerUp)   _scene.input.off('pointerup',   _onPointerUp);
    _onPointerMove = null;
    _onPointerUp   = null;
    for (const z of _hitZones) if (z && z.destroy) z.destroy();
    _hitZones = [];
    if (_boardGfx)  { _boardGfx.destroy();  _boardGfx  = null; }
    if (_markerGfx) { _markerGfx.destroy(); _markerGfx = null; }
    if (_pieceGfx)  { _pieceGfx.destroy();  _pieceGfx  = null; }
    if (_hintGfx)   { _hintGfx.destroy();   _hintGfx   = null; }
    if (_dragGfx)   { _dragGfx.destroy();   _dragGfx   = null; }
    _scene         = null;
    _onAction      = null;
    _selected      = null;
    _dragFrom      = null;
    _dragColor     = null;
    _lastGameState = null;
    _lastCtx       = null;
  },
};

export default piratesbulgarsRenderer;
