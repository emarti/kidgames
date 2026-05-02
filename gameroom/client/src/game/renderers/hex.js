/**
 * hex.js — Phaser 3 renderer for Hex (9×9 or 11×11).
 *
 * Uniform renderer interface:
 *   hexRenderer.init(scene, config)
 *   hexRenderer.draw(gameState, ctx)
 *   hexRenderer.showHint(hintMsg)
 *   hexRenderer.clearHint()
 *   hexRenderer.shutdown()
 *
 * config: { boardX, boardY, boardSize, onAction(type, payload) }
 * ctx:    { myPid, mySide, canMove }
 *
 * The board is an N×N rhombus of pointy-top hexagons. Each row is offset
 * to the RIGHT, so the board leans right.
 * Black connects top ↔ bottom edges, White connects left ↔ right edges.
 */

// ─── Colors ───────────────────────────────────────────────────────────────────
const EMPTY_FILL   = 0x3e4e28;
const GRID_COLOR   = 0x8aaa60;

const BLACK_FILL   = 0x111111;
const BLACK_STROKE = 0x444444;
const WHITE_FILL   = 0xf0f0f0;
const WHITE_STROKE = 0x888888;
const GHOST_ALPHA  = 0.35;

// Edge band colors
const BLACK_EDGE   = 0x333333;
const WHITE_EDGE   = 0xcccccc;
const CORNER_EDGE  = 0x777777;

const WIN_GLOW     = 0xffd700;

// ─── Renderer state ───────────────────────────────────────────────────────────
let _scene    = null;
let _bx       = 0;   // board config origin x
let _by       = 0;   // board config origin y
let _bs       = 0;   // total pixel span from config
let _onAction = null;

let _curSize  = 0;   // current board N (9 or 11)
let _ox       = 0;   // computed origin x (after centering)
let _oy       = 0;   // computed origin y
let _hexSize  = 0;   // hex radius (center to vertex)
let _hexW     = 0;   // horizontal distance between hex centers
let _hexH     = 0;   // vertical distance between hex centers
let _offX     = 0;   // per-row horizontal offset (half of _hexW)

let _boardGfx   = null;
let _stoneGfx   = null;
let _markerGfx  = null;
let _ghostGfx   = null;
let _hintGfx    = null;
let _winGfx     = null;

let _hitZones   = [];
let _hoverCell  = null;

let _hintClearTimer = null;

let _lastGameState = null;
let _lastCtx       = null;

// ─── Hex geometry helpers ────────────────────────────────────────────────────

function _hexCenter(row, col) {
  // Each row shifts RIGHT by _offX → board leans right.
  const x = _ox + col * _hexW + row * _offX;
  const y = _oy + row * _hexH;
  return { x, y };
}

function _hexVertices(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 180 * (60 * i - 30);
    pts.push({
      x: cx + size * Math.cos(angle),
      y: cy + size * Math.sin(angle),
    });
  }
  return pts;
}

function _drawHex(gfx, cx, cy, size, fillColor, fillAlpha, strokeColor, strokeAlpha, lineWidth) {
  const pts = _hexVertices(cx, cy, size);
  gfx.fillStyle(fillColor, fillAlpha);
  gfx.beginPath();
  gfx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 6; i++) gfx.lineTo(pts[i].x, pts[i].y);
  gfx.closePath();
  gfx.fillPath();
  if (strokeColor !== undefined) {
    gfx.lineStyle(lineWidth ?? 1, strokeColor, strokeAlpha ?? 1);
    gfx.beginPath();
    gfx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 6; i++) gfx.lineTo(pts[i].x, pts[i].y);
    gfx.closePath();
    gfx.strokePath();
  }
}

function _edgeColor(row, col, N) {
  const isTop    = row === 0;
  const isBottom = row === N - 1;
  const isLeft   = col === 0;
  const isRight  = col === N - 1;
  const blackEdge = isTop || isBottom;
  const whiteEdge = isLeft || isRight;
  if (blackEdge && whiteEdge) return CORNER_EDGE;
  if (blackEdge) return BLACK_EDGE;
  if (whiteEdge) return WHITE_EDGE;
  return null;
}

// ─── Layout computation ─────────────────────────────────────────────────────

function _computeLayout(N) {
  _curSize = N;

  // For pointy-top: hexW = sqrt(3) * hexSize, hexH = 1.5 * hexSize
  // offX = hexW / 2 (shift right each row)
  // totalW = (N-1)*hexW + (N-1)*offX + 2*hexSize
  // totalH = (N-1)*hexH + 2*hexSize
  const sqrt3 = Math.sqrt(3);
  const wFactor = (N - 1) * sqrt3 * 1.5 + 2;
  const hFactor = 1.5 * (N - 1) + 2;

  // Size the board to 81% of screen height (clamped by width) — leaves room for side panel.
  const screenW = _scene.scale.width;
  const screenH = _scene.scale.height;
  const hsByH = (screenH * 0.81) / hFactor;
  const hsByW = (screenW * 0.855) / wFactor;
  _hexSize = Math.min(hsByW, hsByH);

  _hexW = sqrt3 * _hexSize;
  _hexH = 1.5 * _hexSize;
  _offX = _hexW / 2;

  const actualW = (N - 1) * _hexW + (N - 1) * _offX + 2 * _hexSize;
  const actualH = (N - 1) * _hexH + 2 * _hexSize;

  _ox = Math.round((screenW - actualW) / 2) + _hexSize;
  _oy = Math.round((screenH - actualH) / 2) + _hexSize;
}

// ─── Board building ──────────────────────────────────────────────────────────

function _destroyBoard() {
  for (const z of _hitZones) z.destroy();
  _hitZones = [];
  if (_boardGfx)  { _boardGfx.destroy();  _boardGfx  = null; }
  if (_stoneGfx)  { _stoneGfx.destroy();  _stoneGfx  = null; }
  if (_markerGfx) { _markerGfx.destroy(); _markerGfx = null; }
  if (_ghostGfx)  { _ghostGfx.destroy();  _ghostGfx  = null; }
  if (_hintGfx)   { _hintGfx.destroy();   _hintGfx   = null; }
  if (_winGfx)    { _winGfx.destroy();    _winGfx    = null; }
}

function _buildBoard(N) {
  _destroyBoard();
  _computeLayout(N);

  _boardGfx  = _scene.add.graphics().setDepth(10);
  _stoneGfx  = _scene.add.graphics().setDepth(11);
  _markerGfx = _scene.add.graphics().setDepth(12);
  _ghostGfx  = _scene.add.graphics().setDepth(12);
  _hintGfx   = _scene.add.graphics().setDepth(13);
  _winGfx    = _scene.add.graphics().setDepth(14);

  // Draw hex cells with visible grid
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const { x, y } = _hexCenter(r, c);
      const ec = _edgeColor(r, c, N);
      const fill = ec ?? EMPTY_FILL;
      _drawHex(_boardGfx, x, y, _hexSize * 0.96, fill, 1, GRID_COLOR, 0.9, 1.5);
    }
  }

  // Hit zones
  _hitZones = [];
  const hitRadius = Math.max(_hexSize * 0.7, 10);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const { x, y } = _hexCenter(r, c);
      const zone = _scene.add.circle(x, y, hitRadius, 0x000000, 0)
        .setInteractive({ useHandCursor: true })
        .setDepth(15);
      const cr = r, cc = c;
      zone.on('pointerover', () => { _hoverCell = { row: cr, col: cc }; _drawGhost(); });
      zone.on('pointerout',  () => { _hoverCell = null; _drawGhost(); });
      zone.on('pointerdown', () => _onCellClick(cr, cc));
      _hitZones.push(zone);
    }
  }
}

// ─── Input ────────────────────────────────────────────────────────────────────

function _onCellClick(row, col) {
  const g = _lastGameState;
  if (!g || g.gameOver) return;
  if (!_lastCtx?.canMove) return;
  if (_onAction) _onAction('place_stone', { row, col });
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

function _drawStones(board, N) {
  const gfx = _stoneGfx;
  gfx.clear();
  const r = Math.max(8, Math.round(_hexSize * 0.72));

  for (let i = 0; i < board.length; i++) {
    const cell = board[i];
    if (!cell) continue;
    const row = Math.floor(i / N);
    const col = i % N;
    const { x, y } = _hexCenter(row, col);

    if (cell === 'black') {
      gfx.fillStyle(BLACK_FILL, 1);
      gfx.fillCircle(x, y, r);
      gfx.lineStyle(1, BLACK_STROKE, 1);
      gfx.strokeCircle(x, y, r);
      gfx.fillStyle(0x555555, 0.35);
      gfx.fillCircle(x - r * 0.25, y - r * 0.25, r * 0.35);
    } else {
      gfx.fillStyle(WHITE_FILL, 1);
      gfx.fillCircle(x, y, r);
      gfx.lineStyle(2, WHITE_STROKE, 1);
      gfx.strokeCircle(x, y, r);
      gfx.lineStyle(1, 0x333333, 0.2);
      gfx.strokeCircle(x + 1, y + 1, r);
    }
  }
}

function _drawLastMoveMarker(lastMove) {
  const gfx = _markerGfx;
  gfx.clear();
  if (!lastMove) return;
  const { x, y } = _hexCenter(lastMove.row, lastMove.col);
  const r = Math.round(_hexSize * 0.15);
  gfx.fillStyle(0xff4444, 0.9);
  gfx.fillCircle(x, y, r);
}

function _drawGhost() {
  const gfx = _ghostGfx;
  gfx.clear();
  if (!_hoverCell) return;
  const g = _lastGameState;
  const ctx = _lastCtx;
  if (!g || g.gameOver) return;
  if (!ctx?.canMove) return;

  const N = g.boardSize;
  const { row, col } = _hoverCell;
  const i = row * N + col;
  if (g.board[i] !== null) return;

  const ghostColor = ctx.mySide === 'both' ? g.turn : ctx.mySide;
  const { x, y } = _hexCenter(row, col);
  const r = Math.max(8, Math.round(_hexSize * 0.72));

  if (ghostColor === 'black') {
    gfx.fillStyle(BLACK_FILL, GHOST_ALPHA);
    gfx.fillCircle(x, y, r);
  } else {
    gfx.fillStyle(WHITE_FILL, GHOST_ALPHA);
    gfx.fillCircle(x, y, r);
    gfx.lineStyle(2, WHITE_STROKE, GHOST_ALPHA);
    gfx.strokeCircle(x, y, r);
  }
}

function _drawWinPath(winPath, N) {
  const gfx = _winGfx;
  gfx.clear();
  if (!winPath || winPath.length === 0) return;
  const r = Math.max(6, Math.round(_hexSize * 0.48));
  for (const idx of winPath) {
    const row = Math.floor(idx / N);
    const col = idx % N;
    const { x, y } = _hexCenter(row, col);
    gfx.lineStyle(3, WIN_GLOW, 0.8);
    gfx.strokeCircle(x, y, r);
  }
}

// ─── Hint ─────────────────────────────────────────────────────────────────────

function _clearHintInternal() {
  if (_hintGfx) _hintGfx.clear();
  if (_hintClearTimer) {
    _hintClearTimer.remove();
    _hintClearTimer = null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const hexRenderer = {

  showPassButton: false,

  init(scene, config) {
    _scene    = scene;
    _bx       = config.boardX;
    _by       = config.boardY;
    _bs       = config.boardSize;
    _onAction = config.onAction ?? null;
    _hoverCell = null;
    _lastGameState = null;
    _lastCtx = null;
    _curSize = 0;  // force build on first draw
  },

  draw(gameState, ctx) {
    if (!_scene) return;
    _lastGameState = gameState;
    _lastCtx = ctx;

    const N = gameState.boardSize ?? 11;
    if (N !== _curSize) {
      _buildBoard(N);
    }

    _drawStones(gameState.board, N);
    _drawLastMoveMarker(gameState.lastMove);
    _drawGhost();

    if (gameState.winPath) {
      _drawWinPath(gameState.winPath, N);
    } else if (_winGfx) {
      _winGfx.clear();
    }
  },

  showHint(hintMsg) {
    _clearHintInternal();
    if (!hintMsg || hintMsg.move == null) return;
    const move = hintMsg.move;
    if (move.row == null) return;
    const gfx = _hintGfx;
    const { x, y } = _hexCenter(move.row, move.col);
    const r = Math.round(_hexSize * 0.3);

    gfx.clear();
    gfx.fillStyle(0x00cc44, 0.92);
    gfx.fillCircle(x, y, r);
    gfx.lineStyle(2, 0x00ff66, 0.6);
    gfx.strokeCircle(x, y, r);

    _hintClearTimer = _scene.time.delayedCall(4000, () => _clearHintInternal());
  },

  clearHint() {
    _clearHintInternal();
  },

  formatTurnText(gameState) {
    if (gameState.gameOver) {
      return gameState.winner === 'black' ? '⬡ BLACK wins!' : '⬡ WHITE wins!';
    }
    return gameState.turn === 'black' ? '⬡ BLACK\'s turn ⚫' : '⬡ WHITE\'s turn ⚪';
  },

  formatTurnColor(gameState) {
    if (gameState.gameOver) return '#ffd700';
    return gameState.turn === 'black' ? '#dddddd' : '#ffffff';
  },

  formatCaptureText(gameState) {
    const b = gameState.board;
    let bc = 0, wc = 0;
    for (let i = 0; i < b.length; i++) {
      if (b[i] === 'black') bc++;
      else if (b[i] === 'white') wc++;
    }
    return `stones:  ⚫ ${bc}   ⚪ ${wc}`;
  },

  getGameOverInfo(gameState) {
    if (!gameState.gameOver) return null;
    const winner = gameState.winner === 'black' ? '⚫ BLACK wins!' : '⚪ WHITE wins!';
    const bc = gameState.board.filter(c => c === 'black').length;
    const wc = gameState.board.filter(c => c === 'white').length;
    return {
      title: 'GAME OVER',
      winner,
      lines: [
        `Black connected top ↔ bottom`,
        `⚫ ${bc} stones   ⚪ ${wc} stones   (${bc + wc} total moves)`,
      ].filter(() => gameState.winner === 'black').concat(
        gameState.winner === 'white' ? [
          `White connected left ↔ right`,
          `⚫ ${bc} stones   ⚪ ${wc} stones   (${bc + wc} total moves)`,
        ] : []
      ),
      buttons: [
        { label: 'New Game', actions: ['restart'] },
        { label: 'Continue', actions: ['undo_move', 'undo_move'] },
      ],
    };
  },

  resetSelection() {
    _hoverCell = null;
  },

  shutdown() {
    _destroyBoard();
    _clearHintInternal();
    _scene = null;
    _onAction = null;
    _lastGameState = null;
    _lastCtx = null;
    _hoverCell = null;
  },
};

export default hexRenderer;
