/**
 * go.js — Phaser 3 renderer for Go (9×9).
 *
 * Uniform renderer interface:
 *   goRenderer.init(scene, config)
 *   goRenderer.draw(gameState, ctx)
 *   goRenderer.showHint(hintMsg)
 *   goRenderer.clearHint()
 *   goRenderer.shutdown()
 *
 * config: { boardX, boardY, boardSize, onAction(type, payload) }
 * ctx:    { myPid, mySide, canMove }
 */

// ─── Board constants ──────────────────────────────────────────────────────────
const BOARD_N      = 9;
const LINE_COLOR   = 0x3d2010;
const BOARD_COLOR  = 0xc8a96a;
const STAR_POINTS  = [[2,2],[6,2],[4,4],[2,6],[6,6]];

const BLACK_FILL   = 0x111111;
const BLACK_STROKE = 0x444444;
const WHITE_FILL   = 0xf0f0f0;
const WHITE_STROKE = 0x888888;
const GHOST_ALPHA  = 0.35;

// ─── Renderer state ───────────────────────────────────────────────────────────
let _scene     = null;
let _bx        = 0;    // board top-left x (first intersection)
let _by        = 0;    // board top-left y
let _bs        = 0;    // total pixel span (first to last intersection)
let _cellSize  = 0;
let _onAction  = null;

let _boardBg   = null; // Phaser Rectangle
let _gridGfx   = null; // grid lines + star points
let _territoryGfx = null;
let _stoneGfx  = null;
let _markerGfx = null;
let _ghostGfx  = null;
let _hintGfx   = null;

let _hitZones  = [];   // 9×9 array of invisible rects
let _hoverCell = null; // {x,y} or null

let _hintClearTimer = null;

// Cached context from last draw() — used by input/ghost logic.
let _lastGameState = null;
let _lastCtx       = null;

// ─── Pixel helpers ────────────────────────────────────────────────────────────
function _stoneRadius() { return Math.round(_cellSize * 0.44); }

// ─── Board drawing ────────────────────────────────────────────────────────────
function _buildBoard() {
  const cs = _cellSize;
  const margin = Math.round(cs * 0.6);

  _boardBg = _scene.add.rectangle(
    _bx - margin, _by - margin,
    (BOARD_N - 1) * cs + margin * 2,
    (BOARD_N - 1) * cs + margin * 2,
    BOARD_COLOR,
  ).setOrigin(0, 0).setDepth(10);

  const gfx = _scene.add.graphics().setDepth(10);
  _gridGfx = gfx;
  gfx.lineStyle(1.5, LINE_COLOR, 1);
  for (let i = 0; i < BOARD_N; i++) {
    gfx.beginPath();
    gfx.moveTo(_bx + i * cs, _by);
    gfx.lineTo(_bx + i * cs, _by + (BOARD_N - 1) * cs);
    gfx.strokePath();
    gfx.beginPath();
    gfx.moveTo(_bx, _by + i * cs);
    gfx.lineTo(_bx + (BOARD_N - 1) * cs, _by + i * cs);
    gfx.strokePath();
  }
  for (const [sx, sy] of STAR_POINTS) {
    gfx.fillStyle(LINE_COLOR, 1);
    gfx.fillCircle(_bx + sx * cs, _by + sy * cs, Math.max(3, Math.round(cs * 0.12)));
  }

  _territoryGfx = _scene.add.graphics().setDepth(11);
  _stoneGfx     = _scene.add.graphics().setDepth(11);
  _markerGfx    = _scene.add.graphics().setDepth(12);
  _ghostGfx     = _scene.add.graphics().setDepth(12);
  _hintGfx      = _scene.add.graphics().setDepth(13);

  // Hit zones
  _hitZones = [];
  for (let y = 0; y < BOARD_N; y++) {
    _hitZones[y] = [];
    for (let x = 0; x < BOARD_N; x++) {
      const px = _bx + x * cs;
      const py = _by + y * cs;
      const hitSize = Math.max(cs - 2, 16);
      const zone = _scene.add.rectangle(px, py, hitSize, hitSize, 0x000000, 0)
        .setInteractive({ useHandCursor: true })
        .setDepth(15);
      const cx = x, cy = y;
      zone.on('pointerover', () => { _hoverCell = { x: cx, y: cy }; _drawGhost(); });
      zone.on('pointerout',  () => { _hoverCell = null; _drawGhost(); });
      zone.on('pointerdown', () => _onCellClick(cx, cy));
      _hitZones[y][x] = zone;
    }
  }
}

// ─── Input ────────────────────────────────────────────────────────────────────
function _onCellClick(x, y) {
  const g = _lastGameState;
  if (!g || g.gameOver) return;
  if (!_lastCtx?.canMove) return;
  if (_onAction) _onAction('place_stone', { x, y });
}

// ─── Stone drawing ────────────────────────────────────────────────────────────
function _drawStones(board) {
  const gfx = _stoneGfx;
  gfx.clear();
  const cs = _cellSize;
  const r  = _stoneRadius();

  for (let y = 0; y < BOARD_N; y++) {
    for (let x = 0; x < BOARD_N; x++) {
      const cell = board[y][x];
      if (!cell) continue;
      const px = _bx + x * cs;
      const py = _by + y * cs;

      if (cell === 'black') {
        gfx.fillStyle(BLACK_FILL, 1);
        gfx.fillCircle(px, py, r);
        gfx.lineStyle(1, BLACK_STROKE, 1);
        gfx.strokeCircle(px, py, r);
        gfx.fillStyle(0x555555, 0.35);
        gfx.fillCircle(px - r * 0.25, py - r * 0.25, r * 0.35);
      } else {
        gfx.fillStyle(WHITE_FILL, 1);
        gfx.fillCircle(px, py, r);
        gfx.lineStyle(2, WHITE_STROKE, 1);
        gfx.strokeCircle(px, py, r);
        gfx.lineStyle(1, 0x333333, 0.2);
        gfx.strokeCircle(px + 1, py + 1, r);
      }
    }
  }
}

function _drawLastMoveMarker(lastMove) {
  const gfx = _markerGfx;
  gfx.clear();
  if (!lastMove || lastMove === 'pass') return;
  const cs = _cellSize;
  const px = _bx + lastMove.x * cs;
  const py = _by + lastMove.y * cs;
  const r  = Math.round(cs * 0.15);
  gfx.fillStyle(0xff4444, 0.9);
  gfx.fillCircle(px, py, r);
}

function _drawGhost() {
  const gfx = _ghostGfx;
  gfx.clear();
  if (!_hoverCell) return;
  const g   = _lastGameState;
  const ctx = _lastCtx;
  if (!g || g.gameOver) return;
  if (!ctx?.canMove) return;

  const { x, y } = _hoverCell;
  if (g.board[y][x] !== null) return;

  const ghostColor = ctx.mySide === 'both' ? g.turn : ctx.mySide;
  const cs = _cellSize;
  const px = _bx + x * cs;
  const py = _by + y * cs;
  const r  = _stoneRadius();

  if (ghostColor === 'black') {
    gfx.fillStyle(BLACK_FILL, GHOST_ALPHA);
    gfx.fillCircle(px, py, r);
  } else {
    gfx.fillStyle(WHITE_FILL, GHOST_ALPHA);
    gfx.fillCircle(px, py, r);
    gfx.lineStyle(2, WHITE_STROKE, GHOST_ALPHA);
    gfx.strokeCircle(px, py, r);
  }
}

function _drawTerritoryOverlay(cells) {
  const gfx = _territoryGfx;
  gfx.clear();
  const cs = _cellSize;
  const sq = Math.round(cs * 0.28);
  for (const { x, y } of (cells.black ?? [])) {
    gfx.fillStyle(0x111111, 0.85);
    gfx.fillRect(_bx + x * cs - sq / 2, _by + y * cs - sq / 2, sq, sq);
  }
  for (const { x, y } of (cells.white ?? [])) {
    gfx.fillStyle(0xeeeeee, 0.85);
    gfx.fillRect(_bx + x * cs - sq / 2, _by + y * cs - sq / 2, sq, sq);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const goRenderer = {

  showPassButton: true,

  init(scene, config) {
    _scene    = scene;
    _bx       = config.boardX;
    _by       = config.boardY;
    _bs       = config.boardSize;
    _cellSize = Math.round(_bs / (BOARD_N - 1));
    _onAction = config.onAction ?? null;
    _hoverCell = null;
    _lastGameState = null;
    _lastCtx = null;

    _buildBoard();
  },

  draw(gameState, ctx) {
    if (!_scene) return;
    _lastGameState = gameState;
    _lastCtx = ctx;

    _drawStones(gameState.board);
    _drawLastMoveMarker(gameState.lastMove);
    _drawGhost();

    // Territory overlay at game-over
    if (gameState.gameOver && gameState.score?.territoryCells) {
      _drawTerritoryOverlay(gameState.score.territoryCells);
    } else if (_territoryGfx) {
      _territoryGfx.clear();
    }
  },

  showHint(hintMsg) {
    _clearHintInternal();
    if (!hintMsg || hintMsg.x == null) return;
    const gfx = _hintGfx;
    const cs  = _cellSize;
    const px  = _bx + hintMsg.x * cs;
    const py  = _by + hintMsg.y * cs;
    const r   = Math.round(cs * 0.22);

    gfx.clear();
    gfx.fillStyle(0x00cc44, 0.92);
    gfx.fillCircle(px, py, r);
    gfx.lineStyle(2, 0x00ff66, 0.6);
    gfx.strokeCircle(px, py, r);

    _hintClearTimer = _scene.time.delayedCall(4000, () => _clearHintInternal());
  },

  clearHint() {
    _clearHintInternal();
  },

  formatTurnText(gameState) {
    if (gameState.gameOver) return 'Two passes — game over!';
    return gameState.turn === 'black' ? 'BLACK\'s turn ⚫' : 'WHITE\'s turn ⚪';
  },

  formatTurnColor(gameState) {
    if (gameState.gameOver) return '#ffd700';
    return gameState.turn === 'black' ? '#dddddd' : '#ffffff';
  },

  formatCaptureText(gameState) {
    return `captured:  ⚫ ${gameState.captures.black}   ⚪ ${gameState.captures.white}`;
  },

  getGameOverInfo(gameState) {
    if (!gameState.gameOver) return null;
    const score = gameState.score;
    const winner = !score ? 'Game Over' :
      score.winner === 'tie' ? 'It\'s a tie!' :
      score.winner === 'black' ? '⚫ BLACK wins!' : '⚪ WHITE wins!';

    const lines = [];
    if (score) {
      lines.push(`⚫ Black: ${score.total.black}  (${score.stones.black} stones + ${score.territory.black} territory + ${score.captures.black} captured)`);
      lines.push(`⚪ White: ${score.total.white}  (${score.stones.white} stones + ${score.territory.white} territory + ${score.captures.white} captured)`);
    }

    return {
      title: 'GAME OVER',
      winner,
      lines,
      buttons: [
        { label: 'Continue', actions: ['undo_move', 'undo_move'] },
        { label: 'New Game', actions: ['restart'] },
      ],
    };
  },

  shutdown() {
    _clearHintInternal();
    for (let y = 0; y < _hitZones.length; y++) {
      for (let x = 0; x < (_hitZones[y]?.length ?? 0); x++) {
        if (_hitZones[y][x]?.destroy) _hitZones[y][x].destroy();
      }
    }
    _hitZones = [];
    if (_boardBg)      { _boardBg.destroy();      _boardBg = null; }
    if (_gridGfx)      { _gridGfx.destroy();      _gridGfx = null; }
    if (_territoryGfx) { _territoryGfx.destroy();  _territoryGfx = null; }
    if (_stoneGfx)     { _stoneGfx.destroy();      _stoneGfx = null; }
    if (_markerGfx)    { _markerGfx.destroy();      _markerGfx = null; }
    if (_ghostGfx)     { _ghostGfx.destroy();      _ghostGfx = null; }
    if (_hintGfx)      { _hintGfx.destroy();       _hintGfx = null; }
    _scene = null;
    _onAction = null;
    _hoverCell = null;
    _lastGameState = null;
    _lastCtx = null;
  },
};

function _clearHintInternal() {
  if (_hintClearTimer) { _hintClearTimer.remove();  _hintClearTimer = null; }
  if (_hintGfx)         _hintGfx.clear();
}

export default goRenderer;
