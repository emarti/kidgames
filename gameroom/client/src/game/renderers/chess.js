/**
 * chess.js — Phaser 3 renderer for Chess.
 *
 * Board: 8×8, all squares playable (64 cells).
 * Row 0 = black's back rank; row 7 = white's back rank.
 * Pieces rendered as Unicode glyphs via Phaser Text objects (pooled).
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

// ─── Symbols ──────────────────────────────────────────────────────────────────

const SYMBOLS = {
  white: { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' },
  black: { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' },
};

// ─── Coordinate helpers (mirrors chess_sim.js) ────────────────────────────────

function _idx(row, col) { return row * 8 + col; }
function _toRC(i)       { return { row: Math.floor(i / 8), col: i % 8 }; }

// ─── Renderer state ───────────────────────────────────────────────────────────

let _scene    = null;
let _bx       = 0;
let _by       = 0;
let _bs       = 0;
let _onAction = null;

let _boardGfx  = null;
let _checkGfx  = null;
let _markerGfx = null;
let _hintGfx   = null;
let _hitZones  = [];

let _pieceTexts = [];  // Phaser Text objects pooled for piece glyphs

let _onPointerMove = null;
let _onPointerUp   = null;

let _selected     = null;
let _dragFrom     = null;   // set only once pointer exceeds drag threshold
let _pendingDrag  = null;   // piece idx clicked, waiting for threshold
let _isDragging   = false;  // true once threshold exceeded
let _dragStartX   = 0;
let _dragStartY   = 0;
const DRAG_THRESHOLD = 8;   // pixels before drag activates
let _dragGfx   = null;
let _dragText  = null;  // Text object for the dragged glyph

// Promotion dialog
let _promoContainer  = null;  // array of Phaser objects to destroy
let _promoFrom       = null;
let _promoTo         = null;

let _lastGameState = null;
let _lastCtx       = null;

// ─── Layout helpers ───────────────────────────────────────────────────────────

function _cellSize()    { return _bs / 8; }
function _hitHalfSize() { return Math.max(16, Math.round(_cellSize() * 0.49)); }
function _pieceFont()   { return Math.max(14, Math.round(_cellSize() * 0.7)); }

/** Pixel center of board cell index. */
function _px(i) {
  const { row, col } = _toRC(i);
  const cs = _cellSize();
  return { x: _bx + col * cs + cs / 2, y: _by + row * cs + cs / 2 };
}

// ─── Board drawing ────────────────────────────────────────────────────────────

const LIGHT_SQ    = 0xf0d9b5;
const DARK_SQ     = 0xb58863;
const BOARD_BORDER = 0x5a3a1a;

function _drawBoard(highlightCells) {
  const gfx = _boardGfx;
  gfx.clear();

  const cs = _cellSize();

  // Border
  gfx.fillStyle(BOARD_BORDER, 1);
  gfx.fillRect(_bx - 4, _by - 4, _bs + 8, _bs + 8);

  // Squares
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isDark = (row + col) % 2 === 1;
      gfx.fillStyle(isDark ? DARK_SQ : LIGHT_SQ, 1);
      gfx.fillRect(_bx + col * cs, _by + row * cs, cs, cs);
    }
  }

  // Highlighted destination squares (legal moves)
  if (highlightCells) {
    for (const i of highlightCells) {
      const { row, col } = _toRC(i);
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
  const { row: fr, col: fc } = _toRC(lastMove.from);
  const { row: tr, col: tc } = _toRC(lastMove.to);
  const alpha = 0.35;
  const col   = lastMove.color === 'white' ? 0x4488ff : 0xff8844;
  gfx.fillStyle(col, alpha);
  gfx.fillRect(_bx + fc * cs, _by + fr * cs, cs, cs);
  gfx.fillRect(_bx + tc * cs, _by + tr * cs, cs, cs);
}

// ─── Check highlight ──────────────────────────────────────────────────────────

function _drawCheckHighlight(board, inCheck, turn) {
  const gfx = _checkGfx;
  gfx.clear();
  if (!inCheck) return;
  // Find king of the side that is in check (it's `turn`'s king — after the move, opponent is in check)
  // Actually inCheck means it's `turn`'s turn and they're in check
  const cs = _cellSize();
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.type === 'K' && p.color === turn) {
      const { row, col } = _toRC(i);
      gfx.fillStyle(0xff2222, 0.45);
      gfx.fillRect(_bx + col * cs, _by + row * cs, cs, cs);
      gfx.lineStyle(3, 0xff4444, 0.9);
      gfx.strokeRect(_bx + col * cs + 1, _by + row * cs + 1, cs - 2, cs - 2);
      break;
    }
  }
}

// ─── Piece rendering (text pool) ─────────────────────────────────────────────

function _clearPieceTexts() {
  for (const t of _pieceTexts) if (t && t.active) t.setVisible(false);
}

function _drawPieces(board, selected, dragging) {
  _clearPieceTexts();
  let poolIdx = 0;
  const cs   = _cellSize();
  const fs   = _pieceFont();

  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (!piece) continue;
    if (i === dragging) continue; // drawn separately while dragging

    const { row, col } = _toRC(i);
    const px = _bx + col * cs + cs / 2;
    const py = _by + row * cs + cs / 2;
    const glyph = SYMBOLS[piece.color]?.[piece.type] ?? '?';
    const alpha = (i === selected) ? 0.45 : 1;

    // Reuse or create
    let txt;
    if (poolIdx < _pieceTexts.length) {
      txt = _pieceTexts[poolIdx];
      if (!txt.active) { txt = null; }
    }
    if (!txt) {
      txt = _scene.add.text(0, 0, '', {
        fontFamily: 'Arial, "Segoe UI Symbol", "Noto Chess", sans-serif',
        fontSize:   `${fs}px`,
        color:      '#ffffff',
        stroke:     '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5, 0.5).setDepth(12);
      if (poolIdx < _pieceTexts.length) {
        _pieceTexts[poolIdx] = txt;
      } else {
        _pieceTexts.push(txt);
      }
    }

    const isWhite = piece.color === 'white';
    txt.setStyle({
      fontFamily: 'Arial, "Segoe UI Symbol", "Noto Chess", sans-serif',
      fontSize:   `${fs}px`,
      color:      isWhite ? '#f8f8f8' : '#111111',
      stroke:     isWhite ? '#333333' : '#cccccc',
      strokeThickness: Math.max(1, Math.round(fs * 0.08)),
    });
    txt.setText(glyph);
    txt.setPosition(px, py);
    txt.setAlpha(alpha);
    txt.setVisible(true);
    txt.setDepth(12);
    poolIdx++;
  }

  // Selection ring
  if (selected !== null) {
    // Drawn via boardGfx highlight — no extra circle needed
  }
}

function _drawSelectionRing(selected) {
  // Draw a small ring around selected piece using boardGfx was tricky because
  // we'd need a separate graphics layer. Use a dedicated rings overlay.
  // Actually reuse markerGfx after clearing it each draw. But markerGfx has the last-move marker.
  // Instead, we add to boardGfx at the end of _drawBoard — pass selected index too.
  // Simpler: _boardGfx is already cleared before each draw call, so add ring there.
  if (selected === null) return;
  const cs  = _cellSize();
  const { row, col } = _toRC(selected);
  _boardGfx.lineStyle(3, 0x44ff88, 0.9);
  _boardGfx.strokeRect(_bx + col * cs + 2, _by + row * cs + 2, cs - 4, cs - 4);
}

// ─── Hit zones ────────────────────────────────────────────────────────────────

function _buildHitZones() {
  for (const z of _hitZones) if (z && z.destroy) z.destroy();
  _hitZones = [];
  const hs = _hitHalfSize();
  for (let i = 0; i < 64; i++) {
    const { x, y } = _px(i);
    const zone = _scene.add.rectangle(x, y, hs * 2, hs * 2, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(15);
    const cellIdx = i;
    zone.on('pointerdown', () => _onZoneDown(cellIdx));
    _hitZones.push(zone);
  }
}

// ─── Client-side legal destination computation ────────────────────────────────
// Mirrors chess_sim.js legalMovesFor but only for move highlighting.
// Server re-validates; this is just for UX feedback.

function _computeLegalDests(gameState, fromIdx) {
  // Use a minimal pseudo-legal computation to show destinations.
  // We delegate to the full legalMovesFor logic via a filtered scan on state.
  // Since we don't import chess_sim.js in the client bundle (it runs on the server),
  // we implement a lightweight pseudo-legal generator here.
  const { board, enPassantTarget, castlingRights, turn, gameOver } = gameState;
  if (gameOver) return [];

  const piece = board[fromIdx];
  if (!piece || piece.color !== turn) return [];

  const dests = [];

  switch (piece.type) {
    case 'P': {
      const { row, col } = _toRC(fromIdx);
      const dir   = piece.color === 'white' ? -1 : 1;
      const start = piece.color === 'white' ? 6 : 1;
      // Forward
      if (_inBounds(row + dir, col) && !board[_idx(row + dir, col)]) {
        dests.push(_idx(row + dir, col));
        if (row === start && !board[_idx(row + 2 * dir, col)]) {
          dests.push(_idx(row + 2 * dir, col));
        }
      }
      // Captures
      for (const dc of [-1, 1]) {
        if (!_inBounds(row + dir, col + dc)) continue;
        const destI = _idx(row + dir, col + dc);
        const t = board[destI];
        if ((t && t.color !== piece.color) || destI === enPassantTarget) {
          dests.push(destI);
        }
      }
      break;
    }
    case 'N': {
      const { row, col } = _toRC(fromIdx);
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        if (!_inBounds(row+dr, col+dc)) continue;
        const t = board[_idx(row+dr, col+dc)];
        if (!t || t.color !== piece.color) dests.push(_idx(row+dr, col+dc));
      }
      break;
    }
    case 'B': _sliding(board, fromIdx, piece.color, [[-1,-1],[-1,1],[1,-1],[1,1]], dests); break;
    case 'R': _sliding(board, fromIdx, piece.color, [[-1,0],[1,0],[0,-1],[0,1]], dests); break;
    case 'Q': _sliding(board, fromIdx, piece.color, [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]], dests); break;
    case 'K': {
      const { row, col } = _toRC(fromIdx);
      const cr = castlingRights?.[piece.color];
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        if (!_inBounds(row+dr, col+dc)) continue;
        const t = board[_idx(row+dr, col+dc)];
        if (!t || t.color !== piece.color) dests.push(_idx(row+dr, col+dc));
      }
      // Castling candidates (rough — server validates fully)
      const backRow = piece.color === 'white' ? 7 : 0;
      if (row === backRow && col === 4 && cr) {
        if (cr.kSide && !board[_idx(backRow,5)] && !board[_idx(backRow,6)]) dests.push(_idx(backRow,6));
        if (cr.qSide && !board[_idx(backRow,3)] && !board[_idx(backRow,2)] && !board[_idx(backRow,1)]) dests.push(_idx(backRow,2));
      }
      break;
    }
  }
  return dests;
}

function _inBounds(row, col) { return row >= 0 && row <= 7 && col >= 0 && col <= 7; }

function _sliding(board, fromIdx, color, dirs, out) {
  const { row, col } = _toRC(fromIdx);
  for (const [dr, dc] of dirs) {
    let r = row + dr, c = col + dc;
    while (_inBounds(r, c)) {
      const t = board[_idx(r, c)];
      if (!t) { out.push(_idx(r, c)); }
      else { if (t.color !== color) out.push(_idx(r, c)); break; }
      r += dr; c += dc;
    }
  }
}

// ─── Input handling ───────────────────────────────────────────────────────────

function _onZoneDown(i) {
  const g   = _lastGameState;
  const ctx = _lastCtx;
  if (!g || g.gameOver || !ctx) return;
  if (_promoContainer) return; // promotion dialog open

  const mySide      = ctx.mySide;
  const actingColor = g.turn;
  if (mySide !== 'both' && mySide !== actingColor) return;

  const piece = g.board[i];

  if (_selected === null) {
    if (piece && piece.color === actingColor) {
      if (_computeLegalDests(g, i).length > 0) {
        _selected = i;
        _beginPendingDrag(i);
        _redraw();
      }
    }
  } else {
    if (i === _selected) {
      _selected = null;
      _cancelDrag();
      _redraw();
    } else if (piece && piece.color === actingColor && _computeLegalDests(g, i).length > 0) {
      // Switch selection
      _selected = i;
      _cancelDrag();
      _beginPendingDrag(i);
      _redraw();
    } else {
      // Attempt move (click-click or end of drag onto a zone)
      _attemptMove(_selected, i);
    }
  }
}

function _beginPendingDrag(from) {
  _pendingDrag = from;
  _isDragging  = false;
  const ptr = _scene.input.activePointer;
  _dragStartX = ptr.x;
  _dragStartY = ptr.y;
}

function _attemptMove(from, to) {
  const g = _lastGameState;
  if (!g) return;
  const piece = g.board[from];
  if (!piece) return;

  // Check if this is a pawn promotion
  const { row: toRow } = _toRC(to);
  const isPromo = piece.type === 'P' &&
    ((piece.color === 'white' && toRow === 0) || (piece.color === 'black' && toRow === 7));

  _selected = null;
  _cancelDrag();

  if (isPromo) {
    _showPromoDialog(from, to);
  } else {
    if (_onAction) _onAction('move_piece', { from, to });
  }
}

function _redraw() {
  if (_lastGameState && _lastCtx) chessRenderer.draw(_lastGameState, _lastCtx);
}

// ─── Drag handling ────────────────────────────────────────────────────────────

function _startDrag(from) {
  _dragFrom = from;
  if (!_dragGfx) _dragGfx = _scene.add.graphics().setDepth(16);
  if (!_dragText) {
    _dragText = _scene.add.text(0, 0, '', {
      fontFamily: 'Arial, "Segoe UI Symbol", "Noto Chess", sans-serif',
      fontSize:   `${_pieceFont()}px`,
    }).setOrigin(0.5, 0.5).setDepth(17);
  }
}

function _updateDrag(px, py) {
  if (_dragFrom === null) return;
  const piece = _lastGameState?.board[_dragFrom];
  if (!piece || !_dragText) return;
  const isWhite = piece.color === 'white';
  const fs = _pieceFont();
  _dragText.setStyle({
    fontFamily:       'Arial, "Segoe UI Symbol", "Noto Chess", sans-serif',
    fontSize:         `${fs}px`,
    color:            isWhite ? '#f8f8f8' : '#111111',
    stroke:           isWhite ? '#333333' : '#cccccc',
    strokeThickness:  Math.max(1, Math.round(fs * 0.08)),
  });
  _dragText.setText(SYMBOLS[piece.color]?.[piece.type] ?? '?');
  _dragText.setPosition(px, py);
  _dragText.setVisible(true);
}

function _endDrag(toIdx) {
  const from = _dragFrom;
  _dragFrom = null;
  if (_dragText) _dragText.setVisible(false);
  if (from === null || toIdx === null || from === toIdx) {
    _selected = null;
    _redraw();
    return;
  }

  const g   = _lastGameState;
  const ctx = _lastCtx;
  if (!g || g.gameOver || !ctx) return;
  if (ctx.mySide !== 'both' && ctx.mySide !== g.turn) return;

  const piece = g.board[from];
  if (!piece || piece.color !== g.turn) { _selected = null; _redraw(); return; }

  _selected = null;
  _attemptMove(from, toIdx);
}

function _cancelDrag() {
  _dragFrom    = null;
  _pendingDrag = null;
  _isDragging  = false;
  if (_dragText) _dragText.setVisible(false);
}

function _nearestCell(px, py) {
  let best = null, bestD = Infinity;
  const hs = _hitHalfSize();
  for (let i = 0; i < 64; i++) {
    const p = _px(i);
    const d = Math.hypot(px - p.x, py - p.y);
    if (d < hs * 1.4 && d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ─── Promotion dialog ─────────────────────────────────────────────────────────

function _showPromoDialog(from, to) {
  _promoFrom = from;
  _promoTo   = to;
  _promoContainer = [];

  const g     = _lastGameState;
  const color = g?.board[from]?.color ?? 'white';
  const types = ['Q', 'R', 'N', 'B'];
  const cs    = _cellSize();

  // Background overlay
  const { x: bx, y: by } = _px(to);
  const overlayW = cs * 1.4;
  const overlayH = cs * 4.8;
  const overlayX = Math.min(Math.max(bx - overlayW / 2, _bx), _bx + _bs - overlayW);
  const overlayY = color === 'white' ? _by : _by + _bs - overlayH;

  const bg = _scene.add.rectangle(
    overlayX + overlayW / 2, overlayY + overlayH / 2,
    overlayW, overlayH, 0x222222, 0.92
  ).setDepth(20);
  _promoContainer.push(bg);

  for (let t = 0; t < 4; t++) {
    const type  = types[t];
    const glyph = SYMBOLS[color][type];
    const btnX  = overlayX + overlayW / 2;
    const btnY  = overlayY + cs * 0.6 + t * cs * 1.05;
    const isWhite = color === 'white';
    const fs = Math.max(14, Math.round(cs * 0.58));

    const btn = _scene.add.text(btnX, btnY, glyph, {
      fontFamily:      'Arial, "Segoe UI Symbol", "Noto Chess", sans-serif',
      fontSize:        `${fs}px`,
      color:           isWhite ? '#f8f8f8' : '#111111',
      stroke:          isWhite ? '#333333' : '#cccccc',
      strokeThickness: Math.max(1, Math.round(fs * 0.08)),
      backgroundColor: '#444444',
      padding:         { x: 6, y: 4 },
    })
      .setOrigin(0.5, 0.5)
      .setDepth(21)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerover',  () => btn.setStyle({ backgroundColor: '#666666' }));
    btn.on('pointerout',   () => btn.setStyle({ backgroundColor: '#444444' }));
    btn.on('pointerdown',  () => _selectPromotion(type));
    _promoContainer.push(btn);
  }
}

function _selectPromotion(type) {
  const from = _promoFrom;
  const to   = _promoTo;
  _closePromoDialog();
  if (_onAction) _onAction('move_piece', { from, to, promotion: type });
}

function _closePromoDialog() {
  for (const obj of (_promoContainer ?? [])) {
    if (obj && obj.destroy) obj.destroy();
  }
  _promoContainer = null;
  _promoFrom = null;
  _promoTo   = null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

const chessRenderer = {

  showPassButton: false,

  sideLabels: {
    black: '♛ Black',
    white: '♔ White',
    both:  '♔♛ Both',
  },

  init(scene, config) {
    _scene    = scene;
    _bx       = config.boardX;
    _by       = config.boardY;
    _bs       = config.boardSize;
    _onAction    = config.onAction ?? null;
    _selected    = null;
    _dragFrom    = null;
    _pendingDrag = null;
    _isDragging  = false;
    _dragStartX  = 0;
    _dragStartY  = 0;
    _promoContainer = null;
    _lastGameState = null;
    _lastCtx       = null;

    _checkGfx  = scene.add.graphics().setDepth(9);
    _boardGfx  = scene.add.graphics().setDepth(10);
    _markerGfx = scene.add.graphics().setDepth(11);
    _hintGfx   = scene.add.graphics().setDepth(13);
    _dragGfx   = scene.add.graphics().setDepth(16);

    _drawBoard(null);
    _buildHitZones();

    _onPointerMove = (pointer) => {
      // Promote a pending click into a real drag once threshold is exceeded
      if (_pendingDrag !== null && !_isDragging) {
        if (Math.hypot(pointer.x - _dragStartX, pointer.y - _dragStartY) > DRAG_THRESHOLD) {
          _isDragging = true;
          _startDrag(_pendingDrag);
        }
      }
      if (_isDragging) _updateDrag(pointer.x, pointer.y);
    };
    _onPointerUp = (pointer) => {
      if (_isDragging) {
        // Real drag — land on nearest cell
        const toIdx = _nearestCell(pointer.x, pointer.y);
        _endDrag(toIdx);
      }
      // If it was just a click (no drag), leave _selected intact so the
      // user can click a destination square to complete the move.
      _pendingDrag = null;
      _isDragging  = false;
    };
    scene.input.on('pointermove', _onPointerMove);
    scene.input.on('pointerup',   _onPointerUp);
  },

  draw(gameState, ctx) {
    if (!_scene) return;
    _lastGameState = gameState;
    _lastCtx       = ctx;

    const validDests = _selected !== null ? _computeLegalDests(gameState, _selected) : null;

    _drawBoard(validDests);
    _drawSelectionRing(_selected);
    _drawLastMoveMarker(gameState.lastMove);
    _drawCheckHighlight(gameState.board, gameState.inCheck, gameState.turn);
    _drawPieces(gameState.board, _selected, _dragFrom);
  },

  showHint(hintMsg) {
    if (!_hintGfx) return;
    _hintGfx.clear();
    const move = hintMsg?.move ?? null;
    if (!move || move.from === undefined || move.to === undefined) return;

    const pf = _px(move.from);
    const pt = _px(move.to);

    // Arrow from → to
    _hintGfx.lineStyle(3, 0x4488ff, 0.5);
    _hintGfx.beginPath();
    _hintGfx.moveTo(pf.x, pf.y);
    _hintGfx.lineTo(pt.x, pt.y);
    _hintGfx.strokePath();

    // Blue ring on destination
    const r = Math.max(8, Math.round(_cellSize() * 0.35));
    _hintGfx.lineStyle(3, 0x4488ff, 0.9);
    _hintGfx.strokeCircle(pt.x, pt.y, r + 5);
  },

  clearHint() {
    if (_hintGfx) _hintGfx.clear();
  },

  resetSelection() {
    _selected    = null;
    _pendingDrag = null;
    _isDragging  = false;
    _cancelDrag();
    _closePromoDialog();
  },

  formatTurnText(gameState) {
    if (gameState.checkmate) {
      const loser = gameState.turn;
      const winner = loser === 'white' ? 'black' : 'white';
      return winner === 'white' ? '♔ WHITE wins! (checkmate)' : '♛ BLACK wins! (checkmate)';
    }
    if (gameState.stalemate) return 'DRAW — Stalemate';
    if (gameState.gameOver)  return 'GAME OVER';
    const who = gameState.turn === 'white' ? '♔ WHITE' : '♛ BLACK';
    if (gameState.inCheck) return `${who} — Check!`;
    return `${who} to move`;
  },

  formatTurnColor(gameState) {
    if (gameState.gameOver)  return '#ffd700';
    if (gameState.inCheck)   return '#ff4444';
    return gameState.turn === 'white' ? '#ffffff' : '#aaaaaa';
  },

  formatCaptureText(/* gameState */) {
    return '';
  },

  getGameOverInfo(gameState) {
    if (!gameState.gameOver) return null;
    if (gameState.stalemate) {
      return {
        title:   'DRAW',
        winner:  'Stalemate — no legal moves',
        lines:   [],
        buttons: [
          { label: 'New Game', actions: ['restart'] },
          { label: 'Continue', actions: ['undo_move'] },
        ],
      };
    }
    const w = gameState.winner;
    return {
      title:   'CHECKMATE',
      winner:  w === 'white' ? '♔ WHITE wins!' : '♛ BLACK wins!',
      lines:   [],
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

    for (const t of _pieceTexts) if (t && t.destroy) t.destroy();
    _pieceTexts = [];

    _closePromoDialog();

    if (_boardGfx)  { _boardGfx.destroy();  _boardGfx  = null; }
    if (_checkGfx)  { _checkGfx.destroy();  _checkGfx  = null; }
    if (_markerGfx) { _markerGfx.destroy(); _markerGfx = null; }
    if (_hintGfx)   { _hintGfx.destroy();   _hintGfx   = null; }
    if (_dragGfx)   { _dragGfx.destroy();   _dragGfx   = null; }
    if (_dragText)  { _dragText.destroy();   _dragText  = null; }

    _scene         = null;
    _onAction      = null;
    _lastGameState = null;
    _lastCtx       = null;
    _selected      = null;
    _dragFrom      = null;
    _pendingDrag   = null;
    _isDragging    = false;
  },
};

export default chessRenderer;
