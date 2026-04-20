/**
 * morris.js — Phaser 3 renderer for Nine Men's Morris.
 *
 * Usage (called from PlayScene):
 *   import morrisRenderer from './renderers/morris.js';
 *   morrisRenderer.init(scene, helpers);
 *   morrisRenderer.draw(gameState, myColor, mySide);
 *   morrisRenderer.showHint(hintMsg);
 *   morrisRenderer.clearHint();
 *   morrisRenderer.shutdown();
 *
 * helpers: { boardX, boardY, boardSize, onPointClick(idx), onPieceDragEnd(from, to) }
 */

// ─── Topology (self-contained — matches morris_sim.js exactly) ──────────────

const POINT_POS = [
  { x: 0,       y: 0       }, { x: 0.5,     y: 0       }, { x: 1,       y: 0       },
  { x: 1,       y: 0.5     }, { x: 1,       y: 1       }, { x: 0.5,     y: 1       },
  { x: 0,       y: 1       }, { x: 0,       y: 0.5     },
  { x: 1/6,     y: 1/6     }, { x: 0.5,     y: 1/6     }, { x: 5/6,     y: 1/6     },
  { x: 5/6,     y: 0.5     }, { x: 5/6,     y: 5/6     }, { x: 0.5,     y: 5/6     },
  { x: 1/6,     y: 5/6     }, { x: 1/6,     y: 0.5     },
  { x: 2/6,     y: 2/6     }, { x: 0.5,     y: 2/6     }, { x: 4/6,     y: 2/6     },
  { x: 4/6,     y: 0.5     }, { x: 4/6,     y: 4/6     }, { x: 0.5,     y: 4/6     },
  { x: 2/6,     y: 4/6     }, { x: 2/6,     y: 0.5     },
];

const ADJ = [
  [1,7],[0,2,9],[1,3],[2,4,11],[3,5],[4,6,13],[5,7],[6,0,15],
  [9,15],[8,10,1,17],[9,11],[10,12,3,19],[11,13],[12,14,5,21],[13,15],[14,8,7,23],
  [17,23],[16,18,9],[17,19],[18,20,11],[19,21],[20,22,13],[21,23],[22,16,15],
];

const MILL_LIST = [
  [0,1,2],[2,3,4],[4,5,6],[6,7,0],
  [8,9,10],[10,11,12],[12,13,14],[14,15,8],
  [16,17,18],[18,19,20],[20,21,22],[22,23,16],
  [1,9,17],[3,11,19],[5,13,21],[7,15,23],
];

// ─── Renderer state ───────────────────────────────────────────────────────────

let _scene       = null;
let _bx          = 0;   // board top-left pixel x
let _by          = 0;   // board top-left pixel y
let _bs          = 0;   // board pixel size (width = height)
let _onPointClick   = null;
let _onPieceDragEnd = null;

let _boardGfx    = null;
let _pieceGfx    = null;
let _overlayGfx  = null;
let _hintGfx     = null;
let _hitZones    = [];  // array of 24 Phaser GameObjects

let _selected    = null; // selected point index or null
let _dragFrom    = null;
let _dragGfx     = null; // floating piece during drag
let _dragColor   = null;

let _lastMillFlash = null; // { points, tween }

// ─── Pixel helpers ────────────────────────────────────────────────────────────

function _px(idx) {
  const p = POINT_POS[idx];
  return { x: _bx + p.x * _bs, y: _by + p.y * _bs };
}

function _pieceRadius() {
  return Math.max(12, Math.round(_bs * 0.055));
}

function _hitRadius() {
  return Math.max(22, Math.round(_bs * 0.07)); // ≥44px diameter for iPad
}

// ─── Board drawing ────────────────────────────────────────────────────────────

function _drawBoard() {
  const gfx = _boardGfx;
  gfx.clear();

  // Warm wood background
  const pad = Math.round(_bs * 0.04);
  gfx.fillStyle(0xc8a96a, 1);
  gfx.fillRect(_bx - pad, _by - pad, _bs + pad * 2, _bs + pad * 2);

  gfx.lineStyle(2.5, 0x3d2010, 1);

  // Three concentric squares: outer (0-7), middle (8-15), inner (16-23)
  const fracs = [0, 1/6, 2/6];
  const sizes = [1, 2/3, 1/3];
  for (const frac of fracs) {
    const x0 = _bx + frac * _bs;
    const y0 = _by + frac * _bs;
    const s  = (1 - 2 * frac) * _bs;
    gfx.strokeRect(x0, y0, s, s);
  }

  // Cross-connections at midpoints
  const midpoints = [
    [1, 9], [9, 17],   // top midpoints
    [3, 11], [11, 19], // right midpoints
    [5, 13], [13, 21], // bottom midpoints
    [7, 15], [15, 23], // left midpoints
  ];
  for (const [a, b] of midpoints) {
    const pa = _px(a);
    const pb = _px(b);
    gfx.beginPath();
    gfx.moveTo(pa.x, pa.y);
    gfx.lineTo(pb.x, pb.y);
    gfx.strokePath();
  }

  // Point dots (empty intersection markers)
  for (let i = 0; i < 24; i++) {
    const p = _px(i);
    gfx.fillStyle(0x3d2010, 0.6);
    gfx.fillCircle(p.x, p.y, 3);
  }
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function _drawPieces(board, selected, validDests, removable, millPoints, dragFrom) {
  const gfx = _pieceGfx;
  gfx.clear();
  const r = _pieceRadius();

  for (let i = 0; i < 24; i++) {
    if (i === dragFrom) continue; // being dragged — don't draw at source
    const color = board[i];
    const p = _px(i);

    if (color) {
      _drawPiece(gfx, p.x, p.y, r, color);
    }

    // Mill highlight (gold ring around all 3 pieces)
    if (millPoints && millPoints.includes(i)) {
      gfx.lineStyle(3, 0xffd700, 0.9);
      gfx.strokeCircle(p.x, p.y, r + 4);
    }

    // Selected piece: gold ring
    if (i === selected) {
      gfx.lineStyle(3, 0xffd700, 1);
      gfx.strokeCircle(p.x, p.y, r + 5);
    }

    // Valid destinations: green ring
    if (validDests && validDests.includes(i) && !color) {
      gfx.fillStyle(0x00cc44, 0.4);
      gfx.fillCircle(p.x, p.y, r);
      gfx.lineStyle(2.5, 0x00ff66, 0.8);
      gfx.strokeCircle(p.x, p.y, r);
    }

    // Removable opponent pieces: red ring
    if (removable && removable.includes(i)) {
      gfx.lineStyle(3, 0xff3333, 0.9);
      gfx.strokeCircle(p.x, p.y, r + 5);
    }
  }
}

function _drawPiece(gfx, px, py, r, color) {
  if (color === 'black') {
    gfx.fillStyle(0x111111, 1);
    gfx.fillCircle(px, py, r);
    gfx.lineStyle(1.5, 0x444444, 1);
    gfx.strokeCircle(px, py, r);
    gfx.fillStyle(0x555555, 0.3);
    gfx.fillCircle(px - r * 0.25, py - r * 0.25, r * 0.35);
  } else {
    gfx.fillStyle(0xf0f0f0, 1);
    gfx.fillCircle(px, py, r);
    gfx.lineStyle(2, 0x888888, 1);
    gfx.strokeCircle(px, py, r);
    gfx.lineStyle(1, 0x333333, 0.15);
    gfx.strokeCircle(px + 1, py + 1, r);
  }
}

// ─── Hit zones ────────────────────────────────────────────────name──────────

function _buildHitZones() {
  // Destroy old zones first.
  for (const z of _hitZones) if (z && z.destroy) z.destroy();
  _hitZones = [];

  const hr = _hitRadius();
  for (let i = 0; i < 24; i++) {
    const p = _px(i);
    const zone = _scene.add.circle(p.x, p.y, hr, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(15);
    const idx = i;
    zone.on('pointerdown', (pointer) => _onZoneDown(pointer, idx));
    _hitZones.push(zone);
  }
}

// ─── Input handling ───────────────────────────────────────────────────────────

function _onZoneDown(pointer, idx) {
  if (_onPointClick) _onPointClick(idx, pointer);
}

// ─── Drag handling ────────────────────────────────────────────────────────────

function _startDrag(from, color) {
  _dragFrom  = from;
  _dragColor = color;
  if (!_dragGfx) _dragGfx = _scene.add.graphics();
}

function _updateDrag(px, py) {
  if (_dragFrom === null || !_dragGfx) return;
  _dragGfx.clear();
  _drawPiece(_dragGfx, px, py, _pieceRadius(), _dragColor);
}

function _endDrag(toIdx) {
  const from = _dragFrom;
  _dragFrom  = null;
  _dragColor = null;
  if (_dragGfx) { _dragGfx.clear(); }
  if (from !== null && toIdx !== null && from !== toIdx && _onPieceDragEnd) {
    _onPieceDragEnd(from, toIdx);
  }
}

function _cancelDrag() {
  _dragFrom  = null;
  _dragColor = null;
  if (_dragGfx) _dragGfx.clear();
}

// ─── Nearest hit zone to pointer ─────────────────────────────────────────────

function _nearestPoint(px, py) {
  let best = null;
  let bestD = Infinity;
  const hr = _hitRadius();
  for (let i = 0; i < 24; i++) {
    const p = _px(i);
    const d = Math.hypot(px - p.x, py - p.y);
    if (d < hr && d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ─── Mill flash ───────────────────────────────────────────────────────────────

function _flashMills(newMillPoints) {
  if (!newMillPoints || newMillPoints.length === 0) return;
  if (_lastMillFlash) {
    if (_lastMillFlash.timer) _lastMillFlash.timer.remove();
  }
  _lastMillFlash = { points: newMillPoints };
  _lastMillFlash.timer = _scene.time.delayedCall(1200, () => {
    _lastMillFlash = null;
    // Redraw will clear the flash on next draw call.
  });
}

function _detectMills(board) {
  const millPoints = new Set();
  for (const [a, b, c] of MILL_LIST) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      millPoints.add(a); millPoints.add(b); millPoints.add(c);
    }
  }
  return [...millPoints];
}

// ─── Hint ─────────────────────────────────────────────────────────────────────

function _showHintInternal(move) {
  if (!_hintGfx) return;
  _hintGfx.clear();
  const r = _pieceRadius();

  if (!move) return;

  if (move.type === 'place' || move.type === 'remove') {
    const p = _px(move.pointIndex);
    _hintGfx.fillStyle(0x00cc44, 0.85);
    _hintGfx.fillCircle(p.x, p.y, r * 0.6);
    _hintGfx.lineStyle(2, 0x00ff66, 0.7);
    _hintGfx.strokeCircle(p.x, p.y, r * 0.6);
  } else if (move.type === 'move') {
    const pf = _px(move.from);
    const pt = _px(move.to);
    // Line from → to
    _hintGfx.lineStyle(2, 0x00cc44, 0.5);
    _hintGfx.beginPath();
    _hintGfx.moveTo(pf.x, pf.y);
    _hintGfx.lineTo(pt.x, pt.y);
    _hintGfx.strokePath();
    // Dot at destination
    _hintGfx.fillStyle(0x00cc44, 0.85);
    _hintGfx.fillCircle(pt.x, pt.y, r * 0.6);
    _hintGfx.lineStyle(2, 0x00ff66, 0.7);
    _hintGfx.strokeCircle(pt.x, pt.y, r * 0.6);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const morrisRenderer = {

  init(scene, helpers) {
    _scene        = scene;
    _bx           = helpers.boardX;
    _by           = helpers.boardY;
    _bs           = helpers.boardSize;
    _onPointClick   = helpers.onPointClick   ?? null;
    _onPieceDragEnd = helpers.onPieceDragEnd ?? null;
    _selected     = null;
    _dragFrom     = null;
    _lastMillFlash = null;

    _boardGfx   = scene.add.graphics().setDepth(10);
    _pieceGfx   = scene.add.graphics().setDepth(11);
    _overlayGfx = scene.add.graphics().setDepth(12);
    _hintGfx    = scene.add.graphics().setDepth(13);
    _dragGfx    = scene.add.graphics().setDepth(14);

    _drawBoard();
    _buildHitZones();

    // Scene-level pointer events for drag support.
    scene.input.on('pointermove', (pointer) => {
      if (_dragFrom !== null) _updateDrag(pointer.x, pointer.y);
    });
    scene.input.on('pointerup', (pointer) => {
      if (_dragFrom !== null) {
        const toIdx = _nearestPoint(pointer.x, pointer.y);
        _endDrag(toIdx);
      }
    });
  },

  /** Set which point is "selected" (by the input layer). */
  setSelected(idx) {
    _selected = idx;
  },

  /** Begin a drag from a given point. */
  beginDrag(from, color) {
    _startDrag(from, color);
  },

  /** Cancel an in-progress drag without firing the callback. */
  cancelDrag() {
    _cancelDrag();
  },

  draw(gameState) {
    if (!_scene) return;

    const board = gameState.board;
    const phase = gameState.phase;

    // Redraw board background on every call (ensures it survives display-list changes).
    _drawBoard();

    // Valid destinations for selected piece.
    let validDests = null;
    if (_selected !== null && board[_selected] && phase === 'moving') {
      validDests = ADJ[_selected].filter((i) => board[i] === null);
    } else if (_selected !== null && board[_selected] && phase === 'flying') {
      validDests = board.map((c, i) => c === null ? i : -1).filter((i) => i >= 0);
    }

    // Removable pieces during removing phase.
    let removable = null;
    if (phase === 'removing') {
      const opp = gameState.pendingRemove === 'black' ? 'white' : 'black';
      const allMilled = board.every((c, i) => c !== opp || _isInMill(board, i));
      removable = board
        .map((c, i) => (c === opp && (allMilled || !_isInMill(board, i))) ? i : -1)
        .filter((i) => i >= 0);
    }

    // Active mill flash.
    const millPoints = _lastMillFlash ? _lastMillFlash.points : _detectMills(board);

    _drawPieces(board, _selected, validDests, removable, millPoints, _dragFrom);
  },

  showHint(hintMsg) {
    _showHintInternal(hintMsg?.move ?? null);
  },

  clearHint() {
    if (_hintGfx) _hintGfx.clear();
  },

  flashNewMills(board) {
    _flashMills(_detectMills(board));
  },

  shutdown() {
    for (const z of _hitZones) if (z && z.destroy) z.destroy();
    _hitZones = [];
    if (_boardGfx)   { _boardGfx.destroy();   _boardGfx   = null; }
    if (_pieceGfx)   { _pieceGfx.destroy();   _pieceGfx   = null; }
    if (_overlayGfx) { _overlayGfx.destroy(); _overlayGfx = null; }
    if (_hintGfx)    { _hintGfx.destroy();    _hintGfx    = null; }
    if (_dragGfx)    { _dragGfx.destroy();    _dragGfx    = null; }
    _scene = null;
    _onPointClick = null;
    _onPieceDragEnd = null;
    _selected = null;
    _dragFrom = null;
    _lastMillFlash = null;
  },
};

function _isInMill(board, idx) {
  const color = board[idx];
  if (!color) return false;
  return MILL_LIST.some(([a, b, c]) =>
    (a === idx || b === idx || c === idx) &&
    board[a] === color && board[b] === color && board[c] === color
  );
}

export default morrisRenderer;
