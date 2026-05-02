/**
 * checkers.js — Phaser 3 renderer for Checkers.
 *
 * Board: 8×8, pieces on dark squares only (32 playable cells).
 * Black pieces move down; white pieces (shown red) move up.
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

// ─── Coordinate helpers (mirrors checkers_sim.js) ────────────────────────────

function cellToRC(idx) {
  const row = Math.floor(idx / 4);
  const colOffset = (row % 2 === 0) ? 1 : 0;
  const col = colOffset + (idx % 4) * 2;
  return { row, col };
}

function rcToCell(row, col) {
  if (row < 0 || row > 7 || col < 0 || col > 7) return -1;
  const colOffset = (row % 2 === 0) ? 1 : 0;
  if ((col - colOffset) % 2 !== 0) return -1;
  return row * 4 + (col - colOffset) / 2;
}

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
let _dragColor = null;
let _dragGfx   = null;

let _lastGameState = null;
let _lastCtx       = null;

// ─── Layout helpers ───────────────────────────────────────────────────────────

function _cellSize()   { return _bs / 8; }
function _pieceR()     { return Math.max(10, Math.round(_cellSize() * 0.38)); }
function _hitHalfSize(){ return Math.max(16, Math.round(_cellSize() * 0.48)); }

/** Pixel center of cell index. */
function _px(idx) {
  const { row, col } = cellToRC(idx);
  const cs = _cellSize();
  return {
    x: _bx + col * cs + cs / 2,
    y: _by + row * cs + cs / 2,
  };
}

/** Pixel center of grid square (row, col) — used for drawing the board. */
function _squarePx(row, col) {
  const cs = _cellSize();
  return { x: _bx + col * cs + cs / 2, y: _by + row * cs + cs / 2 };
}

// ─── Board drawing ────────────────────────────────────────────────────────────

const LIGHT_SQ = 0xf0d9b5;  // classic tan
const DARK_SQ  = 0xb58863;  // classic brown
const BOARD_BORDER = 0x5a3a1a;

function _drawBoard(highlightCells) {
  const gfx = _boardGfx;
  gfx.clear();

  const cs = _cellSize();

  // Border.
  gfx.fillStyle(BOARD_BORDER, 1);
  gfx.fillRect(_bx - 4, _by - 4, _bs + 8, _bs + 8);

  // Squares.
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isDark = (row + col) % 2 === 1;
      gfx.fillStyle(isDark ? DARK_SQ : LIGHT_SQ, 1);
      gfx.fillRect(_bx + col * cs, _by + row * cs, cs, cs);
    }
  }

  // Highlighted destination squares (legal moves).
  if (highlightCells) {
    for (const idx of highlightCells) {
      const { row, col } = cellToRC(idx);
      gfx.fillStyle(0x44ff88, 0.35);
      gfx.fillRect(_bx + col * cs, _by + row * cs, cs, cs);
      gfx.lineStyle(2, 0x00ff66, 0.7);
      gfx.strokeRect(_bx + col * cs + 1, _by + row * cs + 1, cs - 2, cs - 2);
    }
  }
}

// ─── Last-move marker ─────────────────────────────────────────────────────────

function _drawLastMoveMarker(lastMove) {
  const gfx = _markerGfx;
  gfx.clear();
  if (!lastMove) return;
  const cs = _cellSize();
  const { row: fr, col: fc } = cellToRC(lastMove.from);
  const { row: tr, col: tc } = cellToRC(lastMove.to);
  const alpha = 0.35;
  const col = lastMove.color === 'black' ? 0x4488ff : 0xff8844;
  gfx.fillStyle(col, alpha);
  gfx.fillRect(_bx + fc * cs, _by + fr * cs, cs, cs);
  gfx.fillRect(_bx + tc * cs, _by + tr * cs, cs, cs);
}

// ─── Piece drawing ────────────────────────────────────────────────────────────

function _drawPiece(gfx, px, py, piece, alpha = 1) {
  const r = _pieceR();
  if (piece.color === 'black') {
    // Dark piece: charcoal with slight glint.
    gfx.fillStyle(0x222222, alpha);
    gfx.fillCircle(px, py, r);
    gfx.lineStyle(2, 0x555555, alpha);
    gfx.strokeCircle(px, py, r);
    gfx.fillStyle(0x444444, 0.5 * alpha);
    gfx.fillCircle(px - r * 0.25, py - r * 0.25, r * 0.35);
  } else {
    // White/red piece: crimson.
    gfx.fillStyle(0xcc2222, alpha);
    gfx.fillCircle(px, py, r);
    gfx.lineStyle(2, 0xff6666, alpha);
    gfx.strokeCircle(px, py, r);
    gfx.fillStyle(0xff8888, 0.45 * alpha);
    gfx.fillCircle(px - r * 0.25, py - r * 0.25, r * 0.35);
  }

  // King marker: second smaller ring + inner dot.
  if (piece.king) {
    gfx.lineStyle(2, 0xffd700, 0.9 * alpha);
    gfx.strokeCircle(px, py, r - 4);
    gfx.fillStyle(0xffd700, 0.7 * alpha);
    gfx.fillCircle(px, py, 3);
  }
}

function _drawPieces(board, selected, validDests, pendingJump) {
  const gfx = _pieceGfx;
  gfx.clear();
  const r = _pieceR();

  for (let i = 0; i < 32; i++) {
    const piece = board[i];
    if (!piece) continue;
    const { x, y } = _px(i);
    const isSelected = (i === selected || i === pendingJump);

    _drawPiece(gfx, x, y, piece, isSelected ? 0.45 : 1);

    // Selection ring (green).
    if (i === selected) {
      gfx.lineStyle(3, 0x44ff88, 0.9);
      gfx.strokeCircle(x, y, r + 5);
    }

    // Pending-jump ring (gold).
    if (i === pendingJump && i !== selected) {
      gfx.lineStyle(3, 0xffd700, 0.9);
      gfx.strokeCircle(x, y, r + 7);
    }
  }
}

// ─── Hit zones ────────────────────────────────────────────────────────────────

function _buildHitZones() {
  for (const z of _hitZones) if (z && z.destroy) z.destroy();
  _hitZones = [];
  const hs = _hitHalfSize();
  for (let i = 0; i < 32; i++) {
    const { x, y } = _px(i);
    const zone = _scene.add.rectangle(x, y, hs * 2, hs * 2, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(15);
    const idx = i;
    zone.on('pointerdown', () => _onZoneDown(idx));
    _hitZones.push(zone);
  }
}

// ─── Input handling ───────────────────────────────────────────────────────────

function _computeLegalDests(gameState, fromIdx) {
  const legal = _legalMoves(gameState);
  return legal.filter((m) => m.from === fromIdx).map((m) => m.to);
}

/** Minimal legalMovesFor mirror for client-side highlight computation. */
function _legalMoves(gameState) {
  const board       = gameState.board;
  const pendingJump = gameState.pendingJump;
  const pendingMids = gameState.pendingMids ?? [];
  const color       = gameState.turn;

  if (gameState.gameOver) return [];

  if (pendingJump !== null) {
    return _captureDests(board, pendingJump, pendingMids).map((c) => ({ from: pendingJump, to: c.to }));
  }

  const ALL_DIRS = [[1, -1], [1, 1], [-1, -1], [-1, 1]];
  const captures = [];
  for (let i = 0; i < 32; i++) {
    const p = board[i];
    if (!p || p.color !== color) continue;
    for (const c of _captureDests(board, i, [])) captures.push({ from: i, to: c.to });
  }
  if (captures.length > 0) return captures;

  const moves = [];
  for (let i = 0; i < 32; i++) {
    const p = board[i];
    if (!p || p.color !== color) continue;
    const { row, col } = cellToRC(i);
    const dirs = p.king ? ALL_DIRS : (p.color === 'black' ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]]);
    for (const [dr, dc] of dirs) {
      const to = rcToCell(row + dr, col + dc);
      if (to >= 0 && board[to] === null) moves.push({ from: i, to });
    }
  }
  return moves;
}

function _captureDests(board, idx, excludeMids) {
  const ALL_DIRS = [[1, -1], [1, 1], [-1, -1], [-1, 1]];
  const piece = board[idx];
  if (!piece) return [];
  const { row, col } = cellToRC(idx);
  const opp = piece.color === 'black' ? 'white' : 'black';
  const dirs = piece.king ? ALL_DIRS : (piece.color === 'black' ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]]);
  const caps = [];
  for (const [dr, dc] of dirs) {
    const midIdx = rcToCell(row + dr, col + dc);
    if (midIdx < 0 || !board[midIdx] || board[midIdx].color !== opp) continue;
    if (excludeMids.includes(midIdx)) continue;
    const toIdx = rcToCell(row + 2 * dr, col + 2 * dc);
    if (toIdx >= 0 && board[toIdx] === null) caps.push({ to: toIdx, mid: midIdx });
  }
  return caps;
}

function _onZoneDown(idx) {
  const g   = _lastGameState;
  const ctx = _lastCtx;
  if (!g || g.gameOver || !ctx) return;

  const mySide      = ctx.mySide;
  const actingColor = g.turn;
  if (mySide !== 'both' && mySide !== actingColor) return;

  // During pending multi-jump: only the jumping piece's capture dests are valid.
  if (g.pendingJump !== null) {
    if (idx === g.pendingJump) {
      // Click on the piece itself during jump (ignore, or could deselect — but forced to jump, so noop).
      return;
    }
    const dests = _computeLegalDests(g, g.pendingJump);
    if (dests.includes(idx)) {
      if (_onAction) _onAction('move_piece', { from: g.pendingJump, to: idx });
    }
    return;
  }

  if (_selected === null) {
    const piece = g.board[idx];
    if (piece && piece.color === actingColor) {
      // Only select if this piece has legal moves.
      if (_computeLegalDests(g, idx).length > 0) {
        _selected = idx;
        _startDrag(idx, actingColor);
        _redraw();
      }
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
    } else {
      const piece = g.board[idx];
      if (piece && piece.color === actingColor && _computeLegalDests(g, idx).length > 0) {
        _selected = idx;
        _cancelDrag();
        _startDrag(idx, actingColor);
        _redraw();
      }
    }
  }
}

function _redraw() {
  if (_lastGameState && _lastCtx) checkersRenderer.draw(_lastGameState, _lastCtx);
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
  if (piece) _drawPiece(_dragGfx, px, py, piece);
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
  if (ctx.mySide !== 'both' && ctx.mySide !== g.turn) return;
  const piece = g.board[from];
  if (!piece || piece.color !== g.turn) return;
  if (g.board[toIdx] !== null) return;

  _selected = null;
  if (_onAction) _onAction('move_piece', { from, to: toIdx });
}

function _cancelDrag() {
  _dragFrom  = null;
  _dragColor = null;
  if (_dragGfx) _dragGfx.clear();
}

function _nearestCell(px, py) {
  let best  = null;
  let bestD = Infinity;
  const hs  = _hitHalfSize();
  for (let i = 0; i < 32; i++) {
    const p = _px(i);
    const d = Math.hypot(px - p.x, py - p.y);
    if (d < hs * 1.4 && d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ─── Public API ───────────────────────────────────────────────────────────────

const checkersRenderer = {

  showPassButton: false,

  sideLabels: {
    black: '⚫ Dark',
    white: '🔴 Red',
    both:  '⚫🔴 Both',
  },

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
    _dragGfx   = scene.add.graphics().setDepth(16);

    _drawBoard(null);
    _buildHitZones();

    _onPointerMove = (pointer) => {
      if (_dragFrom !== null) _updateDrag(pointer.x, pointer.y);
    };
    _onPointerUp = (pointer) => {
      if (_dragFrom !== null) {
        const toIdx = _nearestCell(pointer.x, pointer.y);
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

    // Compute valid destinations for the selected or pending-jump piece.
    let validDests = null;
    const sourceIdx = pendingJump !== null ? pendingJump : _selected;
    if (sourceIdx !== null) {
      validDests = _computeLegalDests(gameState, sourceIdx);
    }

    _drawBoard(validDests);
    _drawLastMoveMarker(gameState.lastMove);
    _drawPieces(board, _selected, validDests, pendingJump);
  },

  showHint(hintMsg) {
    if (!_hintGfx) return;
    _hintGfx.clear();
    const move = hintMsg?.move ?? null;
    if (!move || move.from === undefined || move.to === undefined) return;

    const pf = _px(move.from);
    const pt = _px(move.to);

    // Arrow from → to.
    _hintGfx.lineStyle(3, 0x4488ff, 0.5);
    _hintGfx.beginPath();
    _hintGfx.moveTo(pf.x, pf.y);
    _hintGfx.lineTo(pt.x, pt.y);
    _hintGfx.strokePath();

    // Blue ring on destination.
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
      return w === 'black' ? '⚫ DARK wins!' : '🔴 RED wins!';
    }
    if (gameState.pendingJump !== null) {
      const who = gameState.turn === 'black' ? '⚫ DARK' : '🔴 RED';
      return `${who} — continue jump!`;
    }
    const who = gameState.turn === 'black' ? '⚫ DARK' : '🔴 RED';
    return `${who} to move`;
  },

  formatTurnColor(gameState) {
    if (gameState.gameOver) return '#ffd700';
    return gameState.turn === 'black' ? '#aaaaaa' : '#ff6666';
  },

  formatCaptureText(gameState) {
    const bl = gameState.piecesLeft.black;
    const wh = gameState.piecesLeft.white;
    return `⚫ ${bl}   🔴 ${wh}`;
  },

  getGameOverInfo(gameState) {
    if (!gameState.gameOver) return null;
    const blackWon = gameState.winner === 'black';
    const bl = gameState.piecesLeft.black;
    const wh = gameState.piecesLeft.white;
    return {
      title:  'GAME OVER',
      winner: blackWon ? '⚫ DARK wins!' : '🔴 RED wins!',
      lines:  [`⚫ pieces left: ${bl}   🔴 pieces left: ${wh}`],
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
    for (const z of _hitZones) if (z && z.destroy) z.destroy();
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
    _hitZones      = [];
  },
};

export default checkersRenderer;
