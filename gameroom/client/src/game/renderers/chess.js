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
  K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟',
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
let _explainGfx = null;
let _hitZones  = [];

let _pieceTexts = [];  // Phaser Text objects pooled for piece glyphs
let _coordTexts = [];  // Phaser Text objects for file/rank labels

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
let _flipped       = false;
let _explainActive = false;

let _explainTexts  = [];  // Phaser Text objects pooled for explain labels

// ─── Layout helpers ───────────────────────────────────────────────────────────

function _cellSize()    { return _bs / 8; }
function _hitHalfSize() { return Math.max(16, Math.round(_cellSize() * 0.49)); }
function _pieceFont()   { return Math.max(20, Math.round(_cellSize() * 0.945)); }

function _displayRC(row, col) {
  if (!_flipped) return { row, col };
  return { row: 7 - row, col: 7 - col };
}

function _squareRect(i) {
  const { row, col } = _toRC(i);
  const view = _displayRC(row, col);
  const cs = _cellSize();
  return {
    x: _bx + view.col * cs,
    y: _by + view.row * cs,
    size: cs,
  };
}

/** Pixel center of board cell index. */
function _px(i) {
  const rect = _squareRect(i);
  return { x: rect.x + rect.size / 2, y: rect.y + rect.size / 2 };
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
      const rect = _squareRect(i);
      gfx.fillStyle(0x44ff88, 0.35);
      gfx.fillRect(rect.x, rect.y, rect.size, rect.size);
      gfx.lineStyle(2, 0x00ff66, 0.7);
      gfx.strokeRect(rect.x + 1, rect.y + 1, rect.size - 2, rect.size - 2);
    }
  }
}

function _drawCoordinates() {
  const cs = _cellSize();
  const fs = Math.max(10, Math.round(cs * 0.22));
  const files = _flipped ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = _flipped ? ['1', '2', '3', '4', '5', '6', '7', '8'] : ['8', '7', '6', '5', '4', '3', '2', '1'];

  for (let i = 0; i < 16; i++) {
    let txt = _coordTexts[i];
    if (!txt || !txt.active) {
      txt = _scene.add.text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: `${fs}px`,
        color: '#f7dfb7',
        stroke: '#2d1a0e',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(13);
      _coordTexts[i] = txt;
    }

    txt.setStyle({
      fontFamily: 'monospace',
      fontSize: `${fs}px`,
      color: '#f7dfb7',
      stroke: '#2d1a0e',
      strokeThickness: 2,
    });

    if (i < 8) {
      txt.setText(files[i]);
      txt.setPosition(_bx + (i + 0.5) * cs, _by + _bs + Math.max(9, cs * 0.18));
    } else {
      const row = i - 8;
      txt.setText(ranks[row]);
      txt.setPosition(_bx - Math.max(9, cs * 0.18), _by + (row + 0.5) * cs);
    }
    txt.setVisible(true);
  }
}

// ─── Last-move marker ─────────────────────────────────────────────────────────

function _drawLastMoveMarker(lastMove) {
  const gfx = _markerGfx;
  gfx.clear();
  if (!lastMove) return;
  const alpha = 0.35;
  const tint  = lastMove.color === 'white' ? 0x4488ff : 0xff8844;
  const fromRect = _squareRect(lastMove.from);
  const toRect = _squareRect(lastMove.to);
  gfx.fillStyle(tint, alpha);
  gfx.fillRect(fromRect.x, fromRect.y, fromRect.size, fromRect.size);
  gfx.fillRect(toRect.x, toRect.y, toRect.size, toRect.size);
}

// ─── Check highlight ──────────────────────────────────────────────────────────

function _drawCheckHighlight(board, inCheck, turn) {
  const gfx = _checkGfx;
  gfx.clear();
  if (!inCheck) return;
  // Find king of the side that is in check (it's `turn`'s king — after the move, opponent is in check)
  // Actually inCheck means it's `turn`'s turn and they're in check
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.type === 'K' && p.color === turn) {
      const rect = _squareRect(i);
      gfx.fillStyle(0xff2222, 0.45);
      gfx.fillRect(rect.x, rect.y, rect.size, rect.size);
      gfx.lineStyle(3, 0xff4444, 0.9);
      gfx.strokeRect(rect.x + 1, rect.y + 1, rect.size - 2, rect.size - 2);
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
  const fs   = _pieceFont();

  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (!piece) continue;
    if (i === dragging) continue; // drawn separately while dragging

    const pos = _px(i);
    const glyph = SYMBOLS[piece.type] ?? '?';
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
      stroke:     isWhite ? '#2c2c2c' : '#dddddd',
      strokeThickness: Math.max(1, Math.round(fs * 0.06)),
    });
    txt.setText(glyph);
    txt.setPosition(pos.x, pos.y);
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
  const rect = _squareRect(selected);
  _boardGfx.lineStyle(3, 0x44ff88, 0.9);
  _boardGfx.strokeRect(rect.x + 2, rect.y + 2, rect.size - 4, rect.size - 4);
}

function _drawArrow(gfx, from, to, color, alpha = 0.85, width = 3) {
  const start = _px(from);
  const end = _px(to);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;

  const ux = dx / len;
  const uy = dy / len;
  const head = Math.max(10, Math.round(_cellSize() * 0.22));
  const bodyEndX = end.x - ux * head;
  const bodyEndY = end.y - uy * head;
  const perpX = -uy;
  const perpY = ux;

  gfx.lineStyle(width, color, alpha);
  gfx.beginPath();
  gfx.moveTo(start.x, start.y);
  gfx.lineTo(bodyEndX, bodyEndY);
  gfx.strokePath();

  gfx.fillStyle(color, alpha);
  gfx.beginPath();
  gfx.moveTo(end.x, end.y);
  gfx.lineTo(bodyEndX + perpX * head * 0.45, bodyEndY + perpY * head * 0.45);
  gfx.lineTo(bodyEndX - perpX * head * 0.45, bodyEndY - perpY * head * 0.45);
  gfx.closePath();
  gfx.fillPath();
}

function _drawSquarePulse(gfx, square, color, alpha = 0.28, inset = 5) {
  const rect = _squareRect(square);
  gfx.fillStyle(color, alpha);
  gfx.fillRect(rect.x + inset, rect.y + inset, rect.size - inset * 2, rect.size - inset * 2);
}

function _drawExplainOverlay(gameState) {
  if (!_explainGfx) return;
  _explainGfx.clear();
  _clearExplainTexts();

  const analysis = gameState.analysis;
  if (!analysis) return;

  const showTerminal = !!gameState.gameOver;
  const showCheckExplain = _explainActive && !!gameState.inCheck;
  const showGeneralExplain = _explainActive && !gameState.inCheck && !gameState.gameOver;

  if (showTerminal) {
    if (gameState.checkmate) {
      for (const arrow of analysis.checkAttackers ?? []) {
        _drawArrow(_explainGfx, arrow.from, arrow.to, 0xff4444, 0.92, 4);
      }
      _drawSquarePulse(_explainGfx, analysis.kingSquare, 0xff4444, 0.22, 8);
      _placeExplainLabel(analysis.kingSquare, 'Checkmate!', 0xff4444);
    }
    if (gameState.stalemate) {
      for (const arrow of analysis.stalematePressure ?? []) {
        _drawArrow(_explainGfx, arrow.from, arrow.to, 0xffbb44, 0.8, 3);
      }
      if (analysis.kingSquare !== null && analysis.kingSquare !== undefined) {
        _drawSquarePulse(_explainGfx, analysis.kingSquare, 0xffbb44, 0.18, 8);
        _placeExplainLabel(analysis.kingSquare, 'Stalemate', 0xffbb44);
      }
    }
    return;
  }

  if (showCheckExplain) {
    for (const arrow of analysis.checkAttackers ?? []) {
      _drawArrow(_explainGfx, arrow.from, arrow.to, 0xff4444, 0.92, 4);
    }
    _placeExplainLabel(analysis.kingSquare, 'Check!', 0xff4444);
    for (const move of analysis.kingEscapes ?? []) {
      _drawArrow(_explainGfx, move.from, move.to, 0x55dd88, 0.82, 3);
      _drawSquarePulse(_explainGfx, move.to, 0x55dd88, 0.18, 10);
    }
    for (const move of analysis.checkResponses ?? []) {
      const color = move.kind === 'capture' ? 0xffcc55 : 0x66bbff;
      _drawArrow(_explainGfx, move.from, move.to, color, 0.78, 2);
    }
    return;
  }

  if (!showGeneralExplain) return;

  // ── Tactics-based explain (forks, pins, hanging, last-move) ──
  const tactics = analysis.tactics ?? [];
  if (tactics.length > 0) {
    for (const tactic of tactics) {
      const tColor = tactic.color ?? 0xffcc55;
      // Draw arrows
      for (const arrow of tactic.arrows ?? []) {
        const aColor = arrow.support ? 0x55aadd : tColor;
        const aAlpha = arrow.support ? 0.7 : 0.85;
        _drawArrow(_explainGfx, arrow.from, arrow.to, aColor, aAlpha, 3);
      }
      // Draw pulses on highlighted squares
      for (const sq of tactic.pulses ?? []) {
        _drawSquarePulse(_explainGfx, sq, tColor, 0.2, 8);
      }
      // Place label near the first pulse square (or first arrow target)
      const labelSquare = (tactic.pulses ?? [])[0] ?? (tactic.arrows ?? [])[0]?.to;
      if (labelSquare !== undefined && tactic.label) {
        _placeExplainLabel(labelSquare, tactic.label, tColor);
      }
    }
  }

}

// ─── Explain label helpers ────────────────────────────────────────────────────

function _clearExplainTexts() {
  for (const t of _explainTexts) if (t && t.active) t.setVisible(false);
}

function _placeExplainLabel(square, text, tint) {
  const pos = _px(square);
  const cs = _cellSize();
  // Offset label above the square; if near the top edge, place below instead
  const above = pos.y - cs * 0.6 > _by;
  const lx = pos.x;
  const ly = above ? pos.y - cs * 0.55 : pos.y + cs * 0.55;
  const fs = Math.max(10, Math.round(cs * 0.22));

  // Convert tint hex to CSS color string
  const r = (tint >> 16) & 0xff;
  const g = (tint >> 8)  & 0xff;
  const b = tint          & 0xff;
  const cssColor = `rgb(${r},${g},${b})`;

  let txt;
  // Reuse from pool
  const poolIdx = _explainTexts.findIndex((t) => t && t.active && !t.visible);
  if (poolIdx >= 0) {
    txt = _explainTexts[poolIdx];
  } else {
    txt = _scene.add.text(0, 0, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize:   `${fs}px`,
      fontStyle:  'bold',
      color:      '#ffffff',
      stroke:     '#000000',
      strokeThickness: 3,
      padding:    { x: 3, y: 1 },
    }).setOrigin(0.5, 0.5).setDepth(15);
    _explainTexts.push(txt);
  }

  txt.setStyle({
    fontFamily: 'Arial, sans-serif',
    fontSize:   `${fs}px`,
    fontStyle:  'bold',
    color:      cssColor,
    stroke:     '#000000',
    strokeThickness: 3,
    padding:    { x: 3, y: 1 },
  });
  txt.setText(text);
  txt.setPosition(lx, ly);
  txt.setVisible(true);
  txt.setDepth(15);
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
  // Generate pseudo-legal destinations, then filter out moves that leave
  // the moving side's king in check. The server still re-validates.
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
  return dests.filter((toIdx) => _isLegalPreviewMove(gameState, fromIdx, toIdx));
}

function _inBounds(row, col) { return row >= 0 && row <= 7 && col >= 0 && col <= 7; }
function _opp(color) { return color === 'white' ? 'black' : 'white'; }

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

function _isLegalPreviewMove(gameState, from, to) {
  const piece = gameState.board[from];
  if (!piece) return false;

  const move = _previewMoveMeta(gameState, from, to, piece);
  if (move.castling) {
    if (_isInCheck(gameState.board, piece.color)) return false;

    const { row } = _toRC(from);
    const passingCol = move.castling === 'k' ? 5 : 3;
    const passingBoard = gameState.board.slice();
    passingBoard[from] = null;
    passingBoard[_idx(row, passingCol)] = { type: 'K', color: piece.color };
    if (_isInCheck(passingBoard, piece.color)) return false;
  }

  return !_isInCheck(_applyPreviewMove(gameState.board, move), piece.color);
}

function _previewMoveMeta(gameState, from, to, piece) {
  const { row: fromRow, col: fromCol } = _toRC(from);
  const { row: toRow,   col: toCol   } = _toRC(to);
  const isEnPassant = piece.type === 'P' &&
    to === gameState.enPassantTarget &&
    toCol !== fromCol &&
    gameState.board[to] === null;
  const isCastling = piece.type === 'K' && Math.abs(toCol - fromCol) === 2;
  return {
    from,
    to,
    enPassant: isEnPassant,
    castling:  isCastling ? (toCol > fromCol ? 'k' : 'q') : null,
    fromRow,
    toRow,
    toCol,
  };
}

function _applyPreviewMove(board, move) {
  const b = board.slice();
  const piece = b[move.from];
  b[move.from] = null;
  b[move.to] = piece ? { ...piece } : null;

  if (move.enPassant) {
    b[_idx(move.fromRow, move.toCol)] = null;
  }

  if (move.castling) {
    const row = move.toRow;
    if (move.castling === 'k') {
      b[_idx(row, 5)] = b[_idx(row, 7)];
      b[_idx(row, 7)] = null;
    } else {
      b[_idx(row, 3)] = b[_idx(row, 0)];
      b[_idx(row, 0)] = null;
    }
  }

  return b;
}

function _isInCheck(board, color) {
  const kingIdx = _findKing(board, color);
  if (kingIdx === -1) return false;
  return _isSquareAttacked(board, kingIdx, _opp(color));
}

function _findKing(board, color) {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p?.type === 'K' && p.color === color) return i;
  }
  return -1;
}

function _isSquareAttacked(board, targetIdx, attackerColor) {
  const { row: targetRow, col: targetCol } = _toRC(targetIdx);

  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (!piece || piece.color !== attackerColor) continue;

    const { row, col } = _toRC(i);
    if (piece.type === 'P') {
      const dir = attackerColor === 'white' ? -1 : 1;
      if (row + dir === targetRow && Math.abs(col - targetCol) === 1) return true;
    } else if (piece.type === 'N') {
      const dr = Math.abs(row - targetRow);
      const dc = Math.abs(col - targetCol);
      if ((dr === 2 && dc === 1) || (dr === 1 && dc === 2)) return true;
    } else if (piece.type === 'K') {
      if (Math.max(Math.abs(row - targetRow), Math.abs(col - targetCol)) === 1) return true;
    } else if (_slidingAttacks(board, i, targetIdx, piece)) {
      return true;
    }
  }

  return false;
}

function _slidingAttacks(board, fromIdx, targetIdx, piece) {
  const dirs = piece.type === 'B'
    ? [[-1,-1],[-1,1],[1,-1],[1,1]]
    : piece.type === 'R'
      ? [[-1,0],[1,0],[0,-1],[0,1]]
      : piece.type === 'Q'
        ? [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]
        : null;
  if (!dirs) return false;

  const { row, col } = _toRC(fromIdx);
  for (const [dr, dc] of dirs) {
    let r = row + dr;
    let c = col + dc;
    while (_inBounds(r, c)) {
      const idx = _idx(r, c);
      if (idx === targetIdx) return true;
      if (board[idx]) break;
      r += dr;
      c += dc;
    }
  }
  return false;
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
    stroke:           isWhite ? '#2c2c2c' : '#dddddd',
    strokeThickness:  Math.max(1, Math.round(fs * 0.06)),
  });
  _dragText.setText(SYMBOLS[piece.type] ?? '?');
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
    const glyph = SYMBOLS[type];
    const btnX  = overlayX + overlayW / 2;
    const btnY  = overlayY + cs * 0.6 + t * cs * 1.05;
    const isWhite = color === 'white';
    const fs = Math.max(14, Math.round(cs * 0.58));

    const btn = _scene.add.text(btnX, btnY, glyph, {
      fontFamily:      'Arial, "Segoe UI Symbol", "Noto Chess", sans-serif',
      fontSize:        `${fs}px`,
      color:           isWhite ? '#f8f8f8' : '#111111',
      stroke:          isWhite ? '#2c2c2c' : '#dddddd',
      strokeThickness: Math.max(1, Math.round(fs * 0.06)),
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
    _flipped       = false;
    _explainActive = false;

    _checkGfx  = scene.add.graphics().setDepth(9);
    _boardGfx  = scene.add.graphics().setDepth(10);
    _markerGfx = scene.add.graphics().setDepth(11);
    _hintGfx   = scene.add.graphics().setDepth(13);
    _explainGfx = scene.add.graphics().setDepth(14);
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
    _drawCoordinates();
    _drawSelectionRing(_selected);
    _drawLastMoveMarker(gameState.lastMove);
    _drawCheckHighlight(gameState.board, gameState.inCheck, gameState.turn);
    _drawPieces(gameState.board, _selected, _dragFrom);
    _drawExplainOverlay(gameState);
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

  clearExplain() {
    _explainActive = false;
    if (_explainGfx) _explainGfx.clear();
    _clearExplainTexts();
    if (_lastGameState && _lastCtx) _redraw();
  },

  toggleExplain() {
    _explainActive = !_explainActive;
    if (_lastGameState && _lastCtx) _redraw();
    return _explainActive;
  },

  isExplainActive() {
    return _explainActive;
  },

  resetSelection() {
    _selected    = null;
    _pendingDrag = null;
    _isDragging  = false;
    _cancelDrag();
    _closePromoDialog();
  },

  setFlipped(flipped) {
    _flipped = !!flipped;
    if (_lastGameState && _lastCtx) _redraw();
  },

  toggleFlipped() {
    _flipped = !_flipped;
    if (_lastGameState && _lastCtx) _redraw();
    return _flipped;
  },

  isFlipped() {
    return _flipped;
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
    return null;
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

    for (const t of _coordTexts) if (t && t.destroy) t.destroy();
    _coordTexts = [];

    for (const t of _explainTexts) if (t && t.destroy) t.destroy();
    _explainTexts = [];

    _closePromoDialog();

    if (_boardGfx)  { _boardGfx.destroy();  _boardGfx  = null; }
    if (_checkGfx)  { _checkGfx.destroy();  _checkGfx  = null; }
    if (_markerGfx) { _markerGfx.destroy(); _markerGfx = null; }
    if (_hintGfx)   { _hintGfx.destroy();   _hintGfx   = null; }
    if (_explainGfx){ _explainGfx.destroy(); _explainGfx = null; }
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
    _flipped       = false;
    _explainActive = false;
  },
};

export default chessRenderer;
