/**
 * cchk.js — Phaser 3 renderer for Chinese Checkers (up to 6 players).
 *
 * Board: 121-position star-shaped hexagonal grid (axial coordinates).
 * Supports 2–6 active colors.  Colors use the 6-arm color scheme.
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
 *   showPassButton (bool, false)
 */

// ─── Board geometry (mirrors cchk_sim.js — self-contained, no server import) ──

const HEX_DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];

// Arms derived by repeated 60° rotation (q,r)→(-r, q+r) of the right arm.
// Right arm rows are along constant (q+r); all 6 arms have 4+3+2+1=10 cells.
// Apex positions: top(0,-8), topRight(8,-8), right(8,0),
//                bottom(0,8), bottomLeft(-8,8), left(-8,0).
const _ARM_QR = {
  top:        [[0,-5],[-1,-5],[-2,-5],[-3,-5],[0,-6],[-1,-6],[-2,-6],[0,-7],[-1,-7],[0,-8]],
  topRight:   [[5,-5],[5,-6],[5,-7],[5,-8],[6,-6],[6,-7],[6,-8],[7,-7],[7,-8],[8,-8]],
  right:      [[5,0],[6,-1],[7,-2],[8,-3],[6,0],[7,-1],[8,-2],[7,0],[8,-1],[8,0]],
  bottom:     [[0,5],[1,5],[2,5],[3,5],[0,6],[1,6],[2,6],[0,7],[1,7],[0,8]],
  bottomLeft: [[-5,5],[-5,6],[-5,7],[-5,8],[-6,6],[-6,7],[-6,8],[-7,7],[-7,8],[-8,8]],
  left:       [[-5,0],[-6,1],[-7,2],[-8,3],[-6,0],[-7,1],[-8,2],[-7,0],[-8,1],[-8,0]],
};

// Build flat POSITIONS array and QR→index lookup (same logic as cchk_sim.js).
const POSITIONS = [];
const _QR_TO_IDX = {};

// Central hexagon.
for (let q = -4; q <= 4; q++) {
  for (let r = -4; r <= 4; r++) {
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 4) {
      _QR_TO_IDX[`${q},${r}`] = POSITIONS.length;
      POSITIONS.push({ q, r });
    }
  }
}
// Arm cells.
for (const cells of Object.values(_ARM_QR)) {
  for (const [q, r] of cells) {
    const key = `${q},${r}`;
    if (!(key in _QR_TO_IDX)) {
      _QR_TO_IDX[key] = POSITIONS.length;
      POSITIONS.push({ q, r });
    }
  }
}

function posToIdx(q, r) { return _QR_TO_IDX[`${q},${r}`] ?? -1; }

// Precomputed adjacency.
const ADJACENCY = POSITIONS.map(({ q, r }) => {
  const nb = [];
  for (const [dq, dr] of HEX_DIRS) {
    const ni = _QR_TO_IDX[`${q+dq},${r+dr}`];
    if (ni !== undefined) nb.push(ni);
  }
  return nb;
});

// Arm index sets.
const _ARM_IDX = {};
for (const [name, qrList] of Object.entries(_ARM_QR)) {
  _ARM_IDX[name] = qrList.map(([q, r]) => _QR_TO_IDX[`${q},${r}`]).filter((i) => i !== undefined);
}

// The star spans q from -8 to +8, r from -8 to +8.
// We use flat-top hexagon layout:
//   x = HEX_SIZE * (3/2 * q)
//   y = HEX_SIZE * (sqrt(3)/2 * q + sqrt(3) * r)
// (This is the flat-top formula: x depends on q, y on both.)
// The bounding box of the star in these coords:
//   q range: -8 to 8  → x range: -12 to +12 × HEX_SIZE
//   r range: -8 to 8  → y range roughly ±16 × HEX_SIZE (approx)
//
// We scale HEX_SIZE so the star fits in boardSize with padding.
// Star bounding box: the extreme cells are at q=±8, r=±8 (arm tips).
// Max pixel extents with flat-top:
//   x_max = 1.5 * 8 * HEX_SIZE = 12 * HEX_SIZE
//   y_max = sqrt(3) * (0.5 * 8 + 8) * HEX_SIZE = sqrt(3) * 12 * HEX_SIZE ≈ 20.8 * HEX_SIZE
// So height is the limiting dimension. We set 2 * 20.8 * HEX_SIZE ≈ boardSize.
// HEX_SIZE ≈ boardSize / (2 * 20.8) ≈ boardSize / 41.6

const SQRT3 = Math.sqrt(3);

// ─── Renderer state ───────────────────────────────────────────────────────────

let _scene       = null;
let _bx          = 0;   // board center X
let _by          = 0;   // board center Y
let _bs          = 0;   // board size
let _onAction    = null;

let _boardGfx    = null;
let _markerGfx   = null;
let _pieceGfx    = null;
let _hintGfx     = null;
let _hitZones    = [];

let _onPointerMove = null;
let _onPointerUp   = null;

// Click-click + drag state
let _selected    = null;  // selected piece index
let _dragFrom    = null;
let _dragColor   = null;
let _dragGfx     = null;
let _pendingDrag = null;
let _isDragging  = false;
let _dragStartX  = 0;
let _dragStartY  = 0;
const DRAG_THRESHOLD = 8;

let _lastGameState = null;
let _lastCtx       = null;

// ─── Layout helpers ───────────────────────────────────────────────────────────

function _hexSize() {
  // With corrected arms, the star's full height is 2×8×sqrt(3)×hs = 16×sqrt(3)×hs
  // (top tip at (0,−8), bottom tip at (0,8)).  Width is 24×hs < height, so
  // height is the limiting dimension.  Set 16×sqrt(3)×hs = boardSize to fill.
  return _bs / (SQRT3 * 16);
}

function _pieceR() {
  return Math.max(6, Math.round(_hexSize() * 0.42));
}

function _hitR() {
  return Math.max(10, Math.round(_hexSize() * 0.52));
}

/** Pixel center of position index i (flat-top hex layout, centered in board). */
function _px(i) {
  const { q, r } = POSITIONS[i];
  const hs = _hexSize();
  return {
    x: _bx + hs * 1.5 * q,
    y: _by + hs * SQRT3 * (r + q * 0.5),
  };
}

// ─── Board drawing ────────────────────────────────────────────────────────────

// ─── Color palette (exported for PlayScene panel) ─────────────────────────────

export const CCHK_PALETTE = {
  red:    { fill: 0xee2222, stroke: 0xff8888, fg: '#ff6666', label: '🔴 Red' },
  orange: { fill: 0xdd6600, stroke: 0xff9944, fg: '#ff9944', label: '🟠 Orange' },
  blue:   { fill: 0x2255cc, stroke: 0x6699ff, fg: '#6699ff', label: '🔵 Blue' },
  green:  { fill: 0x228822, stroke: 0x66cc66, fg: '#66cc66', label: '🟢 Green' },
  yellow: { fill: 0xccaa00, stroke: 0xffdd44, fg: '#ffdd44', label: '🟡 Yellow' },
  purple: { fill: 0x882299, stroke: 0xcc66dd, fg: '#cc66dd', label: '🟣 Purple' },
};

// Arm color tints — match each arm to its starting color
const ARM_TINTS = {
  top:        0xffd5d5,  // red home
  bottom:     0xffe8cc,  // orange home
  topRight:   0xd5e5ff,  // blue home
  bottomLeft: 0xd5f0d5,  // green home
  right:      0xfffad5,  // yellow home
  left:       0xf0d5f5,  // purple home
};
const EMPTY_CELL   = 0xd4c89e;  // tan
const CELL_STROKE  = 0x9b8b6e;

function _drawBoard(highlightIdxs) {
  const gfx = _boardGfx;
  gfx.clear();

  const hs   = _hexSize();
  const cr   = hs * 0.48;  // cell radius (flat-top: distance center to corner = hs; inradius = hs*sqrt(3)/2)

  // Build arm index sets for fast lookup.
  const armOfIdx = new Map();
  for (const [arm, qrList] of Object.entries(_ARM_QR)) {
    for (const [q, r] of qrList) {
      const idx = posToIdx(q, r);
      if (idx >= 0) armOfIdx.set(idx, arm);
    }
  }

  const highlightSet = highlightIdxs ? new Set(highlightIdxs) : null;

  for (let i = 0; i < 121; i++) {
    const { x, y } = _px(i);
    const arm = armOfIdx.get(i);
    const tint = arm ? ARM_TINTS[arm] : EMPTY_CELL;

    // Highlighted destination.
    if (highlightSet?.has(i)) {
      gfx.fillStyle(0x44ff88, 0.35);
    } else {
      gfx.fillStyle(tint, 1);
    }

    // Draw flat-top hexagon (6 vertices).
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const angle = (k * 60) * Math.PI / 180;  // flat-top: first vertex at 0°
      pts.push({ x: x + cr * Math.cos(angle), y: y + cr * Math.sin(angle) });
    }
    gfx.beginPath();
    gfx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < 6; k++) gfx.lineTo(pts[k].x, pts[k].y);
    gfx.closePath();
    gfx.fillPath();

    // Stroke.
    gfx.lineStyle(1, highlightSet?.has(i) ? 0x00ff66 : CELL_STROKE, 0.6);
    gfx.beginPath();
    gfx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < 6; k++) gfx.lineTo(pts[k].x, pts[k].y);
    gfx.closePath();
    gfx.strokePath();
  }
}

// ─── Last-move marker ─────────────────────────────────────────────────────────

function _drawLastMoveMarker(lastMove) {
  _markerGfx.clear();
  if (!lastMove) return;
  const pf = _px(lastMove.from);
  const pt = _px(lastMove.to);
  const pal = CCHK_PALETTE[lastMove.color];
  const col = pal ? pal.fill : 0x888888;
  const r   = _hexSize() * 0.35;
  _markerGfx.fillStyle(col, 0.3);
  _markerGfx.fillCircle(pf.x, pf.y, r);
  _markerGfx.fillCircle(pt.x, pt.y, r);
}

// ─── Piece drawing ────────────────────────────────────────────────────────────

function _drawPiece(gfx, px, py, color, alpha = 1) {
  const r   = _pieceR();
  const pal = CCHK_PALETTE[color];
  const fill   = pal ? pal.fill   : 0x888888;
  const stroke = pal ? pal.stroke : 0xaaaaaa;
  gfx.fillStyle(fill, alpha);
  gfx.fillCircle(px, py, r);
  gfx.lineStyle(2, stroke, alpha);
  gfx.strokeCircle(px, py, r);
  // Specular highlight.
  gfx.fillStyle(0xffffff, 0.35 * alpha);
  gfx.fillCircle(px - r * 0.25, py - r * 0.25, r * 0.32);
}

function _drawPieces(board, selected) {
  const gfx = _pieceGfx;
  gfx.clear();
  const r = _pieceR();
  for (let i = 0; i < 121; i++) {
    const piece = board[i];
    if (!piece) continue;
    const { x, y } = _px(i);
    const isSelected = (i === selected);
    _drawPiece(gfx, x, y, piece.color, isSelected ? 0.4 : 1);
    if (isSelected) {
      gfx.lineStyle(3, 0x44ff88, 0.9);
      gfx.strokeCircle(x, y, r + 5);
    }
  }
}

// ─── Hit zones ────────────────────────────────────────────────────────────────

function _buildHitZones() {
  for (const z of _hitZones) if (z?.destroy) z.destroy();
  _hitZones = [];
  const hr = _hitR();
  for (let i = 0; i < 121; i++) {
    const { x, y } = _px(i);
    const zone = _scene.add.circle(x, y, hr, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(15);
    const idx = i;
    zone.on('pointerdown', (pointer) => _onZoneDown(idx, pointer));
    _hitZones.push(zone);
  }
}

function _updateHitZonePositions() {
  const hr = _hitR();
  for (let i = 0; i < _hitZones.length; i++) {
    const { x, y } = _px(i);
    const z = _hitZones[i];
    if (z) { z.x = x; z.y = y; z.setRadius(hr); }
  }
}

// ─── Legal move mirror (client-side, for highlights) ─────────────────────────

function _legalDestsFor(gameState, fromIdx) {
  if (gameState.gameOver) return [];
  const board = gameState.board;
  const piece = board[fromIdx];
  if (!piece) return [];
  const color = piece.color;

  const dests = new Set();

  // Single steps.
  for (const ni of ADJACENCY[fromIdx]) {
    if (board[ni] === null) dests.add(ni);
  }

  // Hops (BFS — mirrors _hopReachable in cchk_sim.js).
  const HEX_DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
  const visited = new Set([fromIdx]);
  const stack = [fromIdx];
  while (stack.length > 0) {
    const cur = stack.pop();
    const { q, r } = POSITIONS[cur];
    for (const [dq, dr] of HEX_DIRS) {
      const midIdx = posToIdx(q + dq, r + dr);
      if (midIdx < 0 || board[midIdx] === null) continue;
      const landIdx = posToIdx(q + 2 * dq, r + 2 * dr);
      if (landIdx < 0 || board[landIdx] !== null) continue;
      if (visited.has(landIdx)) continue;
      visited.add(landIdx);
      dests.add(landIdx);
      stack.push(landIdx);
    }
  }

  return [...dests];
}

// ─── Input handling ───────────────────────────────────────────────────────────

function _onZoneDown(idx, pointer) {
  const g   = _lastGameState;
  const ctx = _lastCtx;
  if (!g || g.gameOver || !ctx) return;

  const mySide = ctx.mySide;
  const actingColor = g.turn;
  if (mySide !== 'all' && mySide !== actingColor) return;

  // Begin potential drag.
  _pendingDrag = null;
  _isDragging  = false;

  if (_selected === null) {
    const piece = g.board[idx];
    if (piece && piece.color === actingColor) {
      if (_legalDestsFor(g, idx).length > 0) {
        _selected    = idx;
        _pendingDrag = idx;
        _dragStartX  = pointer.x;
        _dragStartY  = pointer.y;
        _redraw();
      }
    }
  } else {
    if (idx === _selected) {
      // Deselect.
      _selected = null;
      _cancelDrag();
      _redraw();
    } else if (g.board[idx] === null) {
      // Move to empty cell.
      const dests = _legalDestsFor(g, _selected);
      if (dests.includes(idx)) {
        if (_onAction) _onAction('move_piece', { from: _selected, path: [idx] });
        _selected = null;
        _cancelDrag();
      }
    } else {
      // Click on another own piece — switch selection.
      const piece = g.board[idx];
      if (piece?.color === actingColor && _legalDestsFor(g, idx).length > 0) {
        _selected    = idx;
        _pendingDrag = idx;
        _dragStartX  = pointer.x;
        _dragStartY  = pointer.y;
        _cancelDrag();
        _redraw();
      }
    }
  }
}

function _redraw() {
  if (_lastGameState && _lastCtx) cchkRenderer.draw(_lastGameState, _lastCtx);
}

// ─── Drag handling ────────────────────────────────────────────────────────────

function _startDrag(from, color) {
  _dragFrom  = from;
  _dragColor = color;
  if (!_dragGfx) _dragGfx = _scene.add.graphics().setDepth(16);
}

function _updateDrag(px, py) {
  if (_dragFrom === null || !_dragGfx) return;
  _dragGfx.clear();
  const piece = _lastGameState?.board[_dragFrom];
  if (piece) _drawPiece(_dragGfx, px, py, piece.color);
}

function _endDrag(toIdx) {
  const from = _dragFrom;
  _dragFrom  = null;
  _dragColor = null;
  if (_dragGfx) _dragGfx.clear();
  if (from === null || toIdx === null || from === toIdx) { _selected = null; _redraw(); return; }

  const g   = _lastGameState;
  const ctx = _lastCtx;
  if (!g || g.gameOver || !ctx) { _selected = null; _redraw(); return; }
  if (ctx.mySide !== 'all' && ctx.mySide !== g.turn) { _selected = null; _redraw(); return; }
  if (g.board[from]?.color !== g.turn) { _selected = null; _redraw(); return; }
  if (g.board[toIdx] !== null) { _selected = null; _redraw(); return; }

  const dests = _legalDestsFor(g, from);
  if (dests.includes(toIdx)) {
    _selected = null;
    if (_onAction) _onAction('move_piece', { from, path: [toIdx] });
  } else {
    _selected = null;
    _redraw();
  }
}

function _cancelDrag() {
  _pendingDrag = null;
  _isDragging  = false;
  _dragFrom    = null;
  _dragColor   = null;
  if (_dragGfx) _dragGfx.clear();
}

function _nearestCell(px, py) {
  let best  = null;
  let bestD = Infinity;
  const hr  = _hitR() * 1.2;
  for (let i = 0; i < 121; i++) {
    const p = _px(i);
    const d = Math.hypot(px - p.x, py - p.y);
    if (d < hr && d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ─── Public API ───────────────────────────────────────────────────────────────

const cchkRenderer = {

  showPassButton: false,

  init(scene, config) {
    _scene    = scene;
    // Center of the board area.
    _bx       = config.boardX + config.boardSize / 2;
    _by       = config.boardY + config.boardSize / 2;
    _bs       = config.boardSize;
    _onAction = config.onAction ?? null;

    _selected    = null;
    _dragFrom    = null;
    _dragColor   = null;
    _pendingDrag = null;
    _isDragging  = false;
    _lastGameState = null;
    _lastCtx       = null;

    _boardGfx  = scene.add.graphics().setDepth(10);
    _markerGfx = scene.add.graphics().setDepth(11);
    _pieceGfx  = scene.add.graphics().setDepth(12);
    _hintGfx   = scene.add.graphics().setDepth(13);
    _dragGfx   = scene.add.graphics().setDepth(16);

    _drawBoard(null);
    _buildHitZones();

    _onPointerMove = (pointer) => {
      if (_pendingDrag !== null && !_isDragging) {
        const dx = pointer.x - _dragStartX;
        const dy = pointer.y - _dragStartY;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          _isDragging = true;
          _startDrag(_pendingDrag, _lastGameState?.board[_pendingDrag]?.color);
          _pendingDrag = null;
        }
      }
      if (_isDragging && _dragFrom !== null) {
        _updateDrag(pointer.x, pointer.y);
      }
    };

    _onPointerUp = (pointer) => {
      if (_isDragging && _dragFrom !== null) {
        const toIdx = _nearestCell(pointer.x, pointer.y);
        _isDragging = false;
        _endDrag(toIdx);
      } else {
        _pendingDrag = null;
      }
    };

    scene.input.on('pointermove', _onPointerMove);
    scene.input.on('pointerup',   _onPointerUp);
  },

  draw(gameState, ctx) {
    if (!_scene) return;
    _lastGameState = gameState;
    _lastCtx       = ctx;

    const board = gameState.board;

    let validDests = null;
    if (_selected !== null) {
      validDests = _legalDestsFor(gameState, _selected);
    }

    _drawBoard(validDests);
    _drawLastMoveMarker(gameState.lastMove);
    _drawPieces(board, _selected);
  },

  showHint(hintMsg) {
    if (!_hintGfx) return;
    _hintGfx.clear();
    const move = hintMsg?.move ?? null;
    if (!move || move.from === undefined || move.to === undefined) return;

    const pf = _px(move.from);
    const pt = _px(move.to);

    _hintGfx.lineStyle(3, 0x4488ff, 0.5);
    _hintGfx.beginPath();
    _hintGfx.moveTo(pf.x, pf.y);
    _hintGfx.lineTo(pt.x, pt.y);
    _hintGfx.strokePath();

    _hintGfx.lineStyle(3, 0x4488ff, 0.9);
    _hintGfx.strokeCircle(pt.x, pt.y, _pieceR() + 5);
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
      const w = gameState.winner;
      const lbl = CCHK_PALETTE[w]?.label ?? w ?? '?';
      return `${lbl} wins!`;
    }
    const t = gameState.turn;
    const lbl = CCHK_PALETTE[t]?.label ?? t ?? '?';
    return `${lbl} to move`;
  },

  formatTurnColor(gameState) {
    if (gameState.gameOver) return '#ffd700';
    const t = gameState.turn;
    return CCHK_PALETTE[t]?.fg ?? '#ffffff';
  },

  formatCaptureText(_gameState) {
    return '';
  },

  getGameOverInfo(gameState) {
    if (!gameState.gameOver) return null;
    const w = gameState.winner;
    const lbl = CCHK_PALETTE[w]?.label ?? w ?? '?';
    return {
      title:  'GAME OVER',
      winner: `${lbl} wins!`,
      lines:  [],
      buttons: [
        { label: 'New Game', actions: ['restart'] },
        { label: 'Continue', actions: ['undo_move'] },
      ],
    };
  },

  shutdown() {
    if (_scene && _onPointerMove) _scene.input.off('pointermove', _onPointerMove);
    if (_scene && _onPointerUp)   _scene.input.off('pointerup',   _onPointerUp);
    _onPointerMove = null;
    _onPointerUp   = null;
    for (const z of _hitZones) if (z?.destroy) z.destroy();
    _hitZones = [];
    if (_boardGfx)  { _boardGfx.destroy();  _boardGfx  = null; }
    if (_markerGfx) { _markerGfx.destroy(); _markerGfx = null; }
    if (_pieceGfx)  { _pieceGfx.destroy();  _pieceGfx  = null; }
    if (_hintGfx)   { _hintGfx.destroy();   _hintGfx   = null; }
    if (_dragGfx)   { _dragGfx.destroy();   _dragGfx   = null; }
    _scene         = null;
    _onAction      = null;
    _lastGameState = null;
    _lastCtx       = null;
    _selected      = null;
    _dragFrom      = null;
    _dragColor     = null;
    _pendingDrag   = null;
    _isDragging    = false;
    _hitZones      = [];
  },
};

export default cchkRenderer;
