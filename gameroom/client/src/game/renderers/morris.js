/**
 * morris.js — Phaser 3 renderer for Nine Men's Morris.
 *
 * Uniform renderer interface:
 *   morrisRenderer.init(scene, config)
 *   morrisRenderer.draw(gameState, ctx)
 *   morrisRenderer.showHint(hintMsg)
 *   morrisRenderer.clearHint()
 *   morrisRenderer.shutdown()
 *
 * config: { boardX, boardY, boardSize, onAction(type, payload) }
 * ctx:    { myPid, mySide, canMove }
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

let _scene     = null;
let _bx        = 0;
let _by        = 0;
let _bs        = 0;
let _onAction  = null;

let _boardGfx    = null;
let _lastMoveGfx = null;
let _pieceGfx    = null;
let _hintGfx     = null;
let _hitZones    = [];

// Scene-level listener refs for cleanup.
let _onPointerMove = null;
let _onPointerUp   = null;

let _selected  = null;
let _dragFrom  = null;
let _dragGfx   = null;
let _dragColor = null;

let _lastMillFlash = null;

// Cached from last draw() for input logic.
let _lastGameState = null;
let _lastCtx       = null;

// ─── Pixel helpers ────────────────────────────────────────────────────────────

function _px(idx) {
  const p = POINT_POS[idx];
  return { x: _bx + p.x * _bs, y: _by + p.y * _bs };
}

function _pieceRadius() {
  return Math.max(12, Math.round(_bs * 0.055));
}

function _hitRadius() {
  return Math.max(22, Math.round(_bs * 0.07));
}

// ─── Board drawing ────────────────────────────────────────────────────────────

function _drawBoard() {
  const gfx = _boardGfx;
  gfx.clear();

  const pad = Math.round(_bs * 0.04);
  gfx.fillStyle(0xc8a96a, 1);
  gfx.fillRect(_bx - pad, _by - pad, _bs + pad * 2, _bs + pad * 2);

  gfx.lineStyle(2.5, 0x3d2010, 1);

  const fracs = [0, 1/6, 2/6];
  for (const frac of fracs) {
    const x0 = _bx + frac * _bs;
    const y0 = _by + frac * _bs;
    const s  = (1 - 2 * frac) * _bs;
    gfx.strokeRect(x0, y0, s, s);
  }

  const midpoints = [
    [1, 9], [9, 17],
    [3, 11], [11, 19],
    [5, 13], [13, 21],
    [7, 15], [15, 23],
  ];
  for (const [a, b] of midpoints) {
    const pa = _px(a);
    const pb = _px(b);
    gfx.beginPath();
    gfx.moveTo(pa.x, pa.y);
    gfx.lineTo(pb.x, pb.y);
    gfx.strokePath();
  }

  for (let i = 0; i < 24; i++) {
    const p = _px(i);
    gfx.fillStyle(0x3d2010, 0.6);
    gfx.fillCircle(p.x, p.y, 3);
  }
}

// ─── Last-move marker ─────────────────────────────────────────────────────────

function _drawLastMoveMarker(lastMove) {
  const gfx = _lastMoveGfx;
  gfx.clear();
  if (!lastMove) return;

  const r = Math.max(10, Math.round(_bs * 0.04));

  if (lastMove.type === 'move') {
    const from = _px(lastMove.from);
    const to   = _px(lastMove.to);
    const col  = lastMove.color === 'black' ? 0x88aaff : 0xcccccc;
    // Line connecting from → to.
    gfx.lineStyle(2.5, col, 0.5);
    gfx.beginPath();
    gfx.moveTo(from.x, from.y);
    gfx.lineTo(to.x, to.y);
    gfx.strokePath();
    // Rings on both endpoints.
    gfx.lineStyle(3, col, 0.6);
    gfx.strokeCircle(from.x, from.y, r + 4);
    gfx.strokeCircle(to.x, to.y, r + 4);
  } else if (lastMove.type === 'place') {
    const p   = _px(lastMove.pointIndex);
    const col = lastMove.color === 'black' ? 0x88aaff : 0xcccccc;
    gfx.lineStyle(3, col, 0.6);
    gfx.strokeCircle(p.x, p.y, r + 4);
  } else if (lastMove.type === 'remove') {
    const p = _px(lastMove.pointIndex);
    // Red ring to show where a piece was taken.
    gfx.lineStyle(3, 0xff3333, 0.7);
    gfx.strokeCircle(p.x, p.y, r + 4);
  }
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function _drawPieces(board, selected, validDests, removable, millPoints) {
  const gfx = _pieceGfx;
  gfx.clear();
  const r = _pieceRadius();

  for (let i = 0; i < 24; i++) {
    const color = board[i];
    const p = _px(i);
    const isSelected = (i === selected);

    if (color) {
      _drawPiece(gfx, p.x, p.y, r, color, isSelected ? 0.35 : 1);
    }

    if (millPoints && millPoints.includes(i)) {
      gfx.lineStyle(3, 0xffd700, 0.9);
      gfx.strokeCircle(p.x, p.y, r + 4);
    }

    if (isSelected) {
      // Faint green selection ring — piece stays visible but dimmed.
      gfx.lineStyle(2.5, 0x44ff88, 0.75);
      gfx.strokeCircle(p.x, p.y, r + 5);
    }

    if (validDests && validDests.includes(i) && !color) {
      gfx.fillStyle(0x00cc44, 0.4);
      gfx.fillCircle(p.x, p.y, r);
      gfx.lineStyle(2.5, 0x00ff66, 0.8);
      gfx.strokeCircle(p.x, p.y, r);
    }

    if (removable && removable.includes(i)) {
      gfx.lineStyle(3, 0xff3333, 0.9);
      gfx.strokeCircle(p.x, p.y, r + 5);
    }
  }
}

function _drawPiece(gfx, px, py, r, color, alpha = 1) {
  if (color === 'black') {
    gfx.fillStyle(0x111111, alpha);
    gfx.fillCircle(px, py, r);
    gfx.lineStyle(1.5, 0x444444, alpha);
    gfx.strokeCircle(px, py, r);
    gfx.fillStyle(0x555555, 0.3 * alpha);
    gfx.fillCircle(px - r * 0.25, py - r * 0.25, r * 0.35);
  } else {
    gfx.fillStyle(0xf0f0f0, alpha);
    gfx.fillCircle(px, py, r);
    gfx.lineStyle(2, 0x888888, alpha);
    gfx.strokeCircle(px, py, r);
    gfx.lineStyle(1, 0x333333, 0.15 * alpha);
    gfx.strokeCircle(px + 1, py + 1, r);
  }
}

// ─── Hit zones ────────────────────────────────────────────────────────────────

function _buildHitZones() {
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
  const g   = _lastGameState;
  const ctx = _lastCtx;
  if (!g || g.gameOver || !ctx) return;

  const mySide = ctx.mySide;

  // Removing phase: click opponent piece to remove.
  if (g.phase === 'removing') {
    const actingColor = g.pendingRemove;
    if (mySide !== 'both' && mySide !== actingColor) return;
    const opp = actingColor === 'black' ? 'white' : 'black';
    if (g.board[idx] === opp) {
      if (_onAction) _onAction('remove_piece', { pointIndex: idx });
    }
    return;
  }

  const actingColor = g.turn;
  if (mySide !== 'both' && mySide !== actingColor) return;

  // Placing phase.
  if (g.phase === 'placing') {
    if (g.board[idx] === null) {
      if (_onAction) _onAction('place_piece', { pointIndex: idx });
    }
    return;
  }

  // Moving / flying phase.
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
  if (_lastGameState && _lastCtx) {
    morrisRenderer.draw(_lastGameState, _lastCtx);
  }
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
  _drawPiece(_dragGfx, px, py, _pieceRadius(), _dragColor);
}

function _endDrag(toIdx) {
  const from = _dragFrom;
  _dragFrom  = null;
  _dragColor = null;
  if (_dragGfx) { _dragGfx.clear(); }

  if (from === null || toIdx === null || from === toIdx) return;

  const g   = _lastGameState;
  const ctx = _lastCtx;
  if (!g || g.gameOver) return;
  if (g.phase !== 'moving' && g.phase !== 'flying') return;
  const mySide = ctx?.mySide;
  const actingColor = g.turn;
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

function _isInMill(board, idx) {
  const color = board[idx];
  if (!color) return false;
  return MILL_LIST.some(([a, b, c]) =>
    (a === idx || b === idx || c === idx) &&
    board[a] === color && board[b] === color && board[c] === color
  );
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
    _hintGfx.lineStyle(2, 0x00cc44, 0.5);
    _hintGfx.beginPath();
    _hintGfx.moveTo(pf.x, pf.y);
    _hintGfx.lineTo(pt.x, pt.y);
    _hintGfx.strokePath();
    _hintGfx.fillStyle(0x00cc44, 0.85);
    _hintGfx.fillCircle(pt.x, pt.y, r * 0.6);
    _hintGfx.lineStyle(2, 0x00ff66, 0.7);
    _hintGfx.strokeCircle(pt.x, pt.y, r * 0.6);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const morrisRenderer = {

  showPassButton: false,

  init(scene, config) {
    _scene    = scene;
    _bx       = config.boardX;
    _by       = config.boardY;
    _bs       = config.boardSize;
    _onAction = config.onAction ?? null;
    _selected = null;
    _dragFrom = null;
    _lastMillFlash = null;
    _lastGameState = null;
    _lastCtx = null;

    _boardGfx    = scene.add.graphics().setDepth(10);
    _lastMoveGfx = scene.add.graphics().setDepth(12);
    _pieceGfx    = scene.add.graphics().setDepth(11);
    _hintGfx     = scene.add.graphics().setDepth(13);
    _dragGfx     = scene.add.graphics().setDepth(14);

    _drawBoard();
    _buildHitZones();

    // Scene-level pointer events for drag support (stored for cleanup).
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
    scene.input.on('pointerup', _onPointerUp);
  },

  draw(gameState, ctx) {
    if (!_scene) return;
    _lastGameState = gameState;
    _lastCtx = ctx;

    const board = gameState.board;
    const phase = gameState.phase;

    _drawBoard();

    let validDests = null;
    if (_selected !== null && board[_selected] && phase === 'moving') {
      validDests = ADJ[_selected].filter((i) => board[i] === null);
    } else if (_selected !== null && board[_selected] && phase === 'flying') {
      validDests = board.map((c, i) => c === null ? i : -1).filter((i) => i >= 0);
    }

    let removable = null;
    if (phase === 'removing') {
      const opp = gameState.pendingRemove === 'black' ? 'white' : 'black';
      const allMilled = board.every((c, i) => c !== opp || _isInMill(board, i));
      removable = board
        .map((c, i) => (c === opp && (allMilled || !_isInMill(board, i))) ? i : -1)
        .filter((i) => i >= 0);
    }

    const millPoints = _lastMillFlash ? _lastMillFlash.points : _detectMills(board);

    _drawLastMoveMarker(gameState.lastMove);
    _drawPieces(board, _selected, validDests, removable, millPoints);
  },

  showHint(hintMsg) {
    _showHintInternal(hintMsg?.move ?? null);
  },

  clearHint() {
    if (_hintGfx) _hintGfx.clear();
  },

  formatTurnText(gameState) {
    if (gameState.gameOver) {
      return gameState.winner === 'black' ? '⚫ BLACK wins!' : '⚪ WHITE wins!';
    }
    if (gameState.phase === 'removing') {
      const who = gameState.pendingRemove === 'black' ? '⚫ BLACK' : '⚪ WHITE';
      return `${who} — remove an opponent piece`;
    }
    const who = gameState.turn === 'black' ? '⚫ BLACK' : '⚪ WHITE';
    const verb = gameState.phase === 'placing' ? 'placing' :
                 gameState.phase === 'flying'  ? (gameState.flyingAlways ? 'flying (always)' : 'flying (any empty)') : 'moving';
    return `${who}'s turn — ${verb}`;
  },

  formatTurnColor(gameState) {
    if (gameState.gameOver) return '#ffd700';
    return gameState.turn === 'black' ? '#dddddd' : '#ffffff';
  },

  formatCaptureText(gameState) {
    const ih = gameState.piecesInHand;
    const cap = gameState.captured;
    return `in hand: ⚫ ${ih.black}  ⚪ ${ih.white}    captured: ⚫ ${cap.black}  ⚪ ${cap.white}`;
  },

  getGameOverInfo(gameState) {
    if (!gameState.gameOver) return null;
    const winnerStr = gameState.winner === 'black' ? '⚫ BLACK wins!' : '⚪ WHITE wins!';
    const cap = gameState.captured;
    return {
      title: 'GAME OVER',
      winner: winnerStr,
      lines: [
        `Captured: ⚫ ${cap.black}  ⚪ ${cap.white}`,
      ],
      buttons: [
        { label: 'New Game', actions: ['restart'] },
        { label: 'Continue', actions: ['undo_move', 'undo_move'] },
      ],
    };
  },

  resetSelection() {
    _selected = null;
    _cancelDrag();
  },

  shutdown() {
    // Remove scene-level drag listeners to prevent stacking on re-init.
    if (_scene && _onPointerMove) _scene.input.off('pointermove', _onPointerMove);
    if (_scene && _onPointerUp)   _scene.input.off('pointerup', _onPointerUp);
    _onPointerMove = null;
    _onPointerUp   = null;
    for (const z of _hitZones) if (z && z.destroy) z.destroy();
    _hitZones = [];
    if (_boardGfx)     { _boardGfx.destroy();     _boardGfx     = null; }
    if (_lastMoveGfx)  { _lastMoveGfx.destroy();  _lastMoveGfx  = null; }
    if (_pieceGfx)     { _pieceGfx.destroy();      _pieceGfx     = null; }
    if (_hintGfx)      { _hintGfx.destroy();       _hintGfx      = null; }
    if (_dragGfx)      { _dragGfx.destroy();       _dragGfx      = null; }
    _scene = null;
    _onAction = null;
    _selected = null;
    _dragFrom = null;
    _lastMillFlash = null;
    _lastGameState = null;
    _lastCtx = null;
  },
};

export default morrisRenderer;
