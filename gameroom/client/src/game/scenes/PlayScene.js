import Phaser from 'phaser';
import morrisRenderer from '../renderers/morris.js';

// ─── Board constants ──────────────────────────────────────────────────────────
const BOARD_SIZE     = 9;
const LINE_COLOR     = 0x3d2010;
const BOARD_COLOR    = 0xc8a96a;
const BG_COLOR       = 0x2d1a0e;
const STAR_POINTS    = [[2,2],[6,2],[4,4],[2,6],[6,6]]; // 9×9 star points

// Stone visuals
const BLACK_FILL     = 0x111111;
const BLACK_STROKE   = 0x444444;
const WHITE_FILL     = 0xf0f0f0;
const WHITE_STROKE   = 0x888888;
const GHOST_ALPHA    = 0.35;

// UI palette
const BTN_UNDO_BG    = '#d4a017';
const BTN_UNDO_HOV   = '#f0c030';
const BTN_PASS_BG    = '#555555';
const BTN_PASS_HOV   = '#777777';
const BTN_MENU_BG    = '#333333';
const BTN_MENU_HOV   = '#555555';
const BTN_RESTART_BG = '#2a5c2a';
const BTN_RESTART_HOV= '#3a8c3a';

const FONT = { fontFamily: 'monospace' };

export default class PlayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PlayScene' });
    this._listeners = [];
    this._prevState   = null;
    this._hoverCell   = null;
    this._stoneGfx    = null;
    this._ghostGfx    = null;
    this._markerGfx   = null;
    this._territoryGfx = null;
    this._hintGfx      = null;
    this._hintTween    = null;
    this._hintClearTimer = null;
    this._prevTick     = -1;
    this._scoreOverlay = null;
    this._gameOverlay  = null;
    // Morris-specific
    this._morrisActive   = false;
    this._morrisSelected = null; // selected point index
    this._morrisDragFrom = null;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  create() {
    this._addBg();
    this._layout();
    this._buildBoard();
    this._buildUI();
    this._setupInput();
    this._setupNet();

    this._buildSidePanel();

    // Render initial state if we already have one.
    const st = this.game.net.latestState;
    if (st) this._renderState(st);
  }

  // ─── Add scene bg ────────────────────────────────────────────────────────────

  _addBg() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(0, 0, W, H, BG_COLOR).setOrigin(0, 0);
  }

  // ─── Layout ─────────────────────────────────────────────────────────────────

  _layout() {
    const { width: W, height: H } = this.scale;

    // Reserve space: top bar (turn text), bottom bar (buttons), and some margin.
    const TOP_BAR    = Math.round(H * 0.12);
    const BOT_BAR    = Math.round(H * 0.14);
    const SIDE_PAD   = 20;

    // Right panel for side/solo controls.
    const RIGHT_PANEL_W = Math.min(96, Math.max(76, Math.round(W * 0.2)));
    const availW = W - SIDE_PAD * 2 - RIGHT_PANEL_W - 8;
    const availH = H - TOP_BAR - BOT_BAR - SIDE_PAD * 2;

    // Cell size: fit the grid so all 9×9 lines are visible with equal margins.
    const cellByW = Math.floor(availW / BOARD_SIZE);
    const cellByH = Math.floor(availH / BOARD_SIZE);
    this._cellSize = Math.min(cellByW, cellByH, 60);

    const boardPx = this._cellSize * (BOARD_SIZE - 1); // distance between first and last line

    // Center board in the left zone (excluding right panel).
    this._boardX       = SIDE_PAD + Math.round((availW - boardPx) / 2);
    this._boardY       = TOP_BAR + SIDE_PAD + Math.round((availH - boardPx) / 2);
    this._boardCenterX = this._boardX + Math.round(boardPx / 2);

    // Right side panel.
    this._sidePanelX    = W - SIDE_PAD - Math.round(RIGHT_PANEL_W / 2);
    this._sidePanelBtnW = RIGHT_PANEL_W - 8;

    this._topBarY  = Math.round(TOP_BAR / 2);
    this._botBarY  = H - Math.round(BOT_BAR / 2);

    this._W = W;
    this._H = H;
  }

  // ─── Board drawing ──────────────────────────────────────────────────────────

  _buildBoard() {
    const cs = this._cellSize;
    const bx = this._boardX;
    const by = this._boardY;
    const n  = BOARD_SIZE;
    const margin = Math.round(cs * 0.6);

    // Background rectangle.
    this._goBoardBg = this.add.rectangle(
      bx - margin, by - margin,
      (n - 1) * cs + margin * 2,
      (n - 1) * cs + margin * 2,
      BOARD_COLOR,
    ).setOrigin(0, 0);

    // Grid lines.
    const gfx = this.add.graphics();
    this._goGridGfx = gfx;
    gfx.lineStyle(1.5, LINE_COLOR, 1);
    for (let i = 0; i < n; i++) {
      gfx.beginPath();
      gfx.moveTo(bx + i * cs, by);
      gfx.lineTo(bx + i * cs, by + (n - 1) * cs);
      gfx.strokePath();
      gfx.beginPath();
      gfx.moveTo(bx, by + i * cs);
      gfx.lineTo(bx + (n - 1) * cs, by + i * cs);
      gfx.strokePath();
    }

    // Star points.
    for (const [sx, sy] of STAR_POINTS) {
      gfx.fillStyle(LINE_COLOR, 1);
      gfx.fillCircle(bx + sx * cs, by + sy * cs, Math.max(3, Math.round(cs * 0.12)));
    }

    // Territory squares (below stones, shown after game over).
    this._territoryGfx = this.add.graphics();
    // Layer for stones (re-drawn on every state update).
    this._stoneGfx  = this.add.graphics();
    // Layer for last-move marker.
    this._markerGfx = this.add.graphics();
    // Layer for hover ghost stone.
    this._ghostGfx  = this.add.graphics();
    // Hint ring (above everything).
    this._hintGfx   = this.add.graphics();

    // Invisible hit areas over each intersection for click/hover.
    this._hitZones = [];
    for (let y = 0; y < n; y++) {
      this._hitZones[y] = [];
      for (let x = 0; x < n; x++) {
        const px = bx + x * cs;
        const py = by + y * cs;
        const hitSize = Math.max(cs - 2, 16);
        const zone = this.add.rectangle(px, py, hitSize, hitSize, 0x000000, 0)
          .setInteractive({ useHandCursor: true });

        zone.on('pointerover', () => { this._hoverCell = { x, y }; this._drawGhost(); });
        zone.on('pointerout',  () => { this._hoverCell = null;      this._drawGhost(); });
        zone.on('pointerdown', () => this._onCellClick(x, y));

        this._hitZones[y][x] = zone;
      }
    }
  }

  // ─── UI bar ─────────────────────────────────────────────────────────────────

  _buildUI() {
    const cx = this._boardCenterX;

    // ── Top bar: turn text + captures ───────────────────────────────────────
    this._turnText = this.add.text(cx, this._topBarY, 'BLACK\'s turn ⚫', {
      ...FONT, fontSize: '24px', color: '#fff8e7', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20);

    this._captureText = this.add.text(cx, this._topBarY + 28, 'captured:  ⚫ 0   ⚪ 0', {
      ...FONT, fontSize: '15px', color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(20);

    // ── Bottom bar: Undo, Pass, Hint, Pause ────────────────────────────────────
    const by = this._botBarY;
    const sp = Math.min(118, this._W * 0.22);

    this._undoBtn = this._btn(cx - sp * 1.5, by, '↩ UNDO',  BTN_UNDO_BG,  BTN_UNDO_HOV,  () => this._onUndo());
    this._passBtn = this._btn(cx - sp * 0.5, by, 'PASS',     BTN_PASS_BG,  BTN_PASS_HOV,  () => this._onPass());
    this._hintBtn = this._btn(cx + sp * 0.5, by, '💡 HINT',  '#1a3a6a',    '#2a5a9a',     () => this._onHint());
    this._menuBtn = this._btn(cx + sp * 1.5, by, '⏸ PAUSE',  BTN_MENU_BG,  BTN_MENU_HOV,  () => this._openOverlay('pause'));
    this._undoBtn.setDepth(20);
    this._passBtn.setDepth(20);
    this._hintBtn.setDepth(20);
    this._menuBtn.setDepth(20);

    this._hintStatusTxt = this.add.text(cx + sp * 0.5, by - 32, '', {
      ...FONT, fontSize: '12px', color: '#aaaacc',
    }).setOrigin(0.5).setDepth(20);

    // Overlays (hidden until needed).
    this._scoreOverlay = null;
    this._gameOverlay  = null;
  }

  // ─── Side panel (always visible, right of board) ──────────────────────────

  _buildSidePanel() {
    const x   = this._sidePanelX;
    const bw  = this._sidePanelBtnW;
    const bh  = 32;
    const gap = 6;

    // Vertically center the controls in the board area.
    const boardTop = this._boardY;
    const boardBot = this._boardY + (BOARD_SIZE - 1) * this._cellSize;
    const totalH   = 16 + 3 * (bh + gap) + 14 + 16 + bh;
    let   y        = Math.round((boardTop + boardBot) / 2 - totalH / 2);

    // "YOUR SIDE" header.
    this.add.text(x, y, 'YOUR SIDE', { ...FONT, fontSize: '10px', color: '#666677' }).setOrigin(0.5).setDepth(20);
    y += 16;

    // Side buttons.
    const sideOptions = [
      { id: 'black', label: '⚫ Black', fill: 0x1a1a1a, stroke: 0x555566, fg: '#dddddd' },
      { id: 'white', label: '⚪ White', fill: 0xcacaca, stroke: 0x888888, fg: '#111111' },
      { id: 'both',  label: '⚫⚪Both',  fill: 0x1e1e3a, stroke: 0x6633aa, fg: '#ccaaff' },
    ];

    this._sidePanelBgs    = {};
    this._sidePanelTxts   = {};
    this._sidePanelFg     = {};
    this._sidePanelStroke = {};

    for (const opt of sideOptions) {
      const bg  = this.add.rectangle(x, y, bw, bh, opt.fill)
        .setStrokeStyle(1, opt.stroke)
        .setInteractive({ useHandCursor: true })
        .setDepth(20);
      const lbl = this.add.text(x, y, opt.label, {
        ...FONT, fontSize: '12px', color: opt.fg, fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(20);
      bg.on('pointerover',  () => { if (!this._sidePanelSelected(opt.id)) bg.setStrokeStyle(2, 0xffd700); });
      bg.on('pointerout',   () => { if (!this._sidePanelSelected(opt.id)) bg.setStrokeStyle(1, opt.stroke); });
      bg.on('pointerdown',  () => this.game.net.send('select_side', { side: opt.id }));
      lbl.on('pointerdown', () => this.game.net.send('select_side', { side: opt.id }));
      this._sidePanelBgs[opt.id]    = bg;
      this._sidePanelTxts[opt.id]   = lbl;
      this._sidePanelFg[opt.id]     = opt.fg;
      this._sidePanelStroke[opt.id] = opt.stroke;
      y += bh + gap;
    }
  }

  _sidePanelSelected(id) {
    const mySide = this.game.net.latestState?.players[this.game.net.playerId]?.side ?? null;
    return mySide === id;
  }

  _updateSidePanel(mySide) {
    if (!this._sidePanelBgs) return;
    for (const id of ['black', 'white', 'both']) {
      const bg  = this._sidePanelBgs[id];
      const lbl = this._sidePanelTxts[id];
      if (!bg) continue;
      const sel = mySide === id;
      bg.setStrokeStyle(sel ? 3 : 1, sel ? 0xffd700 : this._sidePanelStroke[id]);
      lbl.setColor(sel ? '#ffd700' : this._sidePanelFg[id]);
    }
  }

  _btn(x, y, label, bg, hover, cb) {
    const txt = this.add.text(x, y, label, {
      ...FONT, fontSize: '20px', color: '#ffffff',
      backgroundColor: bg, padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    txt.on('pointerover',  () => txt.setBackgroundColor(hover));
    txt.on('pointerout',   () => txt.setBackgroundColor(bg));
    txt.on('pointerdown',  cb);
    return txt;
  }

  // ─── Input ───────────────────────────────────────────────────────────────────

  _setupInput() {
    // Keyboard shortcuts
    this.input.keyboard.on('keydown-U', () => this._onUndo());
    this.input.keyboard.on('keydown-P', () => this._onPass());
    this.input.keyboard.on('keydown-ESC', () => this._openOverlay('pause'));
  }

  _onCellClick(x, y) {
    const net = this.game.net;
    const st  = net.latestState;
    if (st?.gameType !== 'go') return;  // Go only
    // st.game is the active game state; st is the room wrapper.
    const gameState = st?.game;
    if (!gameState || gameState.gameOver) return;

    const myPid      = net.playerId;
    const mySide      = st?.players[myPid]?.side ?? null;
    const canMove     = mySide === 'both' || mySide === gameState.turn;

    if (!canMove) return;

    net.send('place_stone', { x, y });
  }

  _onUndo() {
    this.game.net.send('undo_move');
  }

  _onPass() {
    this.game.net.send('pass_turn');
  }

  _onMenu() {
    this._hideOverlay();
    this.scene.start('MenuScene');
  }

  // ─── Networking ──────────────────────────────────────────────────────────────

  _setupNet() {
    const net = this.game.net;
    this._on(net, 'state', (e) => this._renderState(e.detail));
    this._on(net, 'hint',  (e) => {
      this._hintBtn?.setAlpha(1).setInteractive({ useHandCursor: true });
      if (this._hintStatusTxt) this._hintStatusTxt.setText('');
      const detail = e.detail;
      const gameType = net.latestState?.gameType;
      if (gameType === 'morris') {
        if (detail?.move != null) morrisRenderer.showHint(detail);
      } else {
        if (detail?.x != null) this._showHintMarker(detail.x, detail.y);
      }
    });
    this._on(net, 'disconnected', () => {
      if (this._turnText) this._turnText.setText('Disconnected…');
    });
    this._on(net, 'server_error', (e) => {
      if (this._hintStatusTxt) this._hintStatusTxt.setText(e.detail ?? 'Error');
      this.time.delayedCall(2000, () => { if (this._hintStatusTxt) this._hintStatusTxt.setText(''); });
    });
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  _renderState(state) {
    if (!state) return;
    this._prevState = state;

    const gameState = state.game;
    if (!gameState) return;

    const myPid  = this.game.net.playerId;
    const mySide = state.players[myPid]?.side ?? null;

    // ── Dispatch to game-specific renderer ───────────────────────────────────
    if (state.gameType === 'morris') {
      this._renderMorrisState(state, gameState, myPid, mySide);
      return;
    }

    // ── Go rendering (original) ───────────────────────────────────────────────
    if (this._morrisActive) {
      // Was Morris, switched back — shut down Morris renderer.
      morrisRenderer.shutdown();
      this._morrisActive   = false;
      this._morrisSelected = null;
      // Restore Go board layers.
      if (this._goBoardBg)  this._goBoardBg.setVisible(true);
      if (this._goGridGfx)  this._goGridGfx.setVisible(true);
      if (this._stoneGfx)   this._stoneGfx.setVisible(true);
      if (this._ghostGfx)   this._ghostGfx.setVisible(true);
      if (this._markerGfx)  this._markerGfx.setVisible(true);
      if (this._hintGfx)    this._hintGfx.setVisible(true);
      // Re-enable Go hit zones.
      for (let gy = 0; gy < BOARD_SIZE; gy++) {
        for (let gx = 0; gx < BOARD_SIZE; gx++) {
          this._hitZones[gy][gx].setInteractive({ useHandCursor: true });
        }
      }
    }

    if (!gameState.gameOver) {
      const turnLabel = gameState.turn === 'black' ? 'BLACK\'s turn ⚫' : 'WHITE\'s turn ⚪';
      this._turnText.setText(turnLabel);
      this._turnText.setColor(gameState.turn === 'black' ? '#dddddd' : '#ffffff');
    }
    this._captureText.setText(
      `captured:  ⚫ ${gameState.captures.black}   ⚪ ${gameState.captures.white}`
    );

    this._updateSidePanel(mySide);

    const isMyTurn = (mySide === 'both' || mySide === gameState.turn) && !gameState.gameOver;
    const hasHistory = (gameState.history?.length > 0) && !gameState.gameOver;
    this._passBtn.setAlpha(isMyTurn ? 1 : 0.4).setVisible(true);
    if (isMyTurn) this._passBtn.setInteractive({ useHandCursor: true });
    else this._passBtn.disableInteractive();
    this._undoBtn.setAlpha(hasHistory ? 1 : 0.4);
    if (hasHistory) this._undoBtn.setInteractive({ useHandCursor: true });
    else this._undoBtn.disableInteractive();

    if (gameState.tick !== this._prevTick) {
      this._prevTick = gameState.tick;
      this._clearHintMarker();
    }

    this._drawStones(gameState.board);
    this._drawLastMoveMarker(gameState.lastMove);
    this._drawGhost();

    if (gameState.gameOver) {
      this._showScoreOverlay(gameState.score);
    } else {
      this._hideScoreOverlay();
    }
  }

  // ─── Morris rendering ────────────────────────────────────────────────────────

  _renderMorrisState(state, gameState, myPid, mySide) {
    // Initialize Morris board on first call (or if board size changed).
    if (!this._morrisActive) {
      // Hide Go-specific layers.
      if (this._goBoardBg)  this._goBoardBg.setVisible(false);
      if (this._goGridGfx)  this._goGridGfx.setVisible(false);
      if (this._stoneGfx)   this._stoneGfx.setVisible(false);
      if (this._ghostGfx)   this._ghostGfx.setVisible(false);
      if (this._markerGfx)  this._markerGfx.setVisible(false);
      if (this._hintGfx)    this._hintGfx.setVisible(false);

      // Board occupies the same space as Go board.
      const cs = this._cellSize;
      const boardPx = cs * 8; // Go board is 9×9 (8 cells wide)
      morrisRenderer.init(this, {
        boardX:        this._boardX,
        boardY:        this._boardY,
        boardSize:     boardPx,
        onPointClick:  (idx, pointer) => this._onMorrisPointClick(idx),
        onPieceDragEnd: (from, to)   => this._onMorrisDragEnd(from, to),
      });
      this._morrisActive   = true;
      this._morrisSelected = null;
      // Re-show hint gfx (Morris renderer uses its own layer).
      if (this._hintGfx) this._hintGfx.setVisible(true);

      // Show PASS button only for Go — hide for Morris.
      this._passBtn.setVisible(false).disableInteractive();

      // Disable Go hit zones so their pointerover/pointerdown don't fire during Morris.
      for (let gy = 0; gy < BOARD_SIZE; gy++) {
        for (let gx = 0; gx < BOARD_SIZE; gx++) {
          this._hitZones[gy][gx].disableInteractive();
        }
      }
    }

    // Turn / status text.
    if (!gameState.gameOver) {
      let turnLabel;
      if (gameState.phase === 'removing') {
        const who = gameState.pendingRemove === 'black' ? '⚫ BLACK' : '⚪ WHITE';
        turnLabel = `${who} — remove an opponent piece`;
      } else {
        const who = gameState.turn === 'black' ? '⚫ BLACK' : '⚪ WHITE';
        const verb = gameState.phase === 'placing' ? 'placing' :
                     gameState.phase === 'flying'  ? 'flying (any empty)' : 'moving';
        turnLabel = `${who}'s turn — ${verb}`;
      }
      this._turnText.setText(turnLabel);
      this._turnText.setColor(gameState.turn === 'black' ? '#dddddd' : '#ffffff');
    }

    // Captures + in-hand counts.
    const ih = gameState.piecesInHand;
    const cap = gameState.captured;
    this._captureText.setText(
      `in hand: ⚫ ${ih.black}  ⚪ ${ih.white}    captured: ⚫ ${cap.black}  ⚪ ${cap.white}`
    );

    this._updateSidePanel(mySide);

    // Button state.
    const actingColor = gameState.phase === 'removing'
      ? gameState.pendingRemove
      : gameState.turn;
    const isMyTurn = (mySide === 'both' || mySide === actingColor) && !gameState.gameOver;
    const hasHistory = (gameState.history?.length > 0) && !gameState.gameOver;

    this._undoBtn.setAlpha(hasHistory ? 1 : 0.4);
    if (hasHistory) this._undoBtn.setInteractive({ useHandCursor: true });
    else this._undoBtn.disableInteractive();

    // Clear hint on new tick.
    if (gameState.tick !== this._prevTick) {
      this._prevTick = gameState.tick;
      morrisRenderer.clearHint();
      this._morrisSelected = null;
      if (this._hintStatusTxt) this._hintStatusTxt.setText('');
      this._hintBtn?.setAlpha(1).setInteractive({ useHandCursor: true });
    }

    morrisRenderer.setSelected(this._morrisSelected);
    morrisRenderer.draw(gameState);

    if (gameState.gameOver) {
      this._showMorrisGameOver(gameState);
    } else {
      this._hideScoreOverlay();
    }
  }

  _onMorrisPointClick(idx) {
    const net = this.game.net;
    const st  = net.latestState;
    const g   = st?.game;
    if (!g || g.gameOver) return;

    const myPid  = net.playerId;
    const mySide = st.players[myPid]?.side ?? null;

    // Removing phase: click opponent piece to remove.
    if (g.phase === 'removing') {
      const actingColor = g.pendingRemove;
      if (mySide !== 'both' && mySide !== actingColor) return;
      const opp = actingColor === 'black' ? 'white' : 'black';
      if (g.board[idx] === opp) {
        net.send('remove_piece', { pointIndex: idx });
      }
      return;
    }

    const actingColor = g.turn;
    if (mySide !== 'both' && mySide !== actingColor) return;

    // Placing phase.
    if (g.phase === 'placing') {
      if (g.board[idx] === null) {
        net.send('place_piece', { pointIndex: idx });
      }
      return;
    }

    // Moving / flying phase.
    if (this._morrisSelected === null) {
      // Select own piece.
      if (g.board[idx] === actingColor) {
        this._morrisSelected = idx;
        morrisRenderer.setSelected(idx);
        morrisRenderer.draw(g);
      }
    } else {
      if (idx === this._morrisSelected) {
        // Deselect.
        this._morrisSelected = null;
        morrisRenderer.setSelected(null);
        morrisRenderer.draw(g);
      } else if (g.board[idx] === null) {
        // Move to empty.
        net.send('move_piece', { from: this._morrisSelected, to: idx });
        this._morrisSelected = null;
      } else if (g.board[idx] === actingColor) {
        // Switch selection to another own piece.
        this._morrisSelected = idx;
        morrisRenderer.setSelected(idx);
        morrisRenderer.draw(g);
      }
    }
  }

  _onMorrisDragEnd(from, to) {
    const net = this.game.net;
    const st  = net.latestState;
    const g   = st?.game;
    if (!g || g.gameOver) return;
    if (g.phase !== 'moving' && g.phase !== 'flying') return;

    const myPid  = net.playerId;
    const mySide = st.players[myPid]?.side ?? null;
    const actingColor = g.turn;
    if (mySide !== 'both' && mySide !== actingColor) return;
    if (g.board[from] !== actingColor) return;
    if (g.board[to] !== null) return;

    this._morrisSelected = null;
    net.send('move_piece', { from, to });
  }

  _showMorrisGameOver(gameState) {
    if (this._scoreOverlay) return;

    const { width: W, height: H } = this.scale;
    const cx = W / 2;
    const cy = H / 2;

    this._scoreOverlay = this.add.container(0, 0);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.65).setOrigin(0, 0);
    this._scoreOverlay.add(dim);
    const panel = this.add.rectangle(cx, cy, Math.min(W * 0.82, 380), 240, 0x1a0f05)
      .setStrokeStyle(3, 0xffd700);
    this._scoreOverlay.add(panel);

    const title = this.add.text(cx, cy - 90, 'GAME OVER', {
      ...FONT, fontSize: '30px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5);
    this._scoreOverlay.add(title);

    const winnerStr = gameState.winner === 'black' ? '⚫ BLACK wins!' : '⚪ WHITE wins!';
    this._scoreOverlay.add(this.add.text(cx, cy - 50, winnerStr, {
      ...FONT, fontSize: '22px', color: '#fff8e7', fontStyle: 'bold',
    }).setOrigin(0.5));

    const cap = gameState.captured;
    this._scoreOverlay.add(this.add.text(cx, cy - 16, `Captured: ⚫ ${cap.black}  ⚪ ${cap.white}`, {
      ...FONT, fontSize: '15px', color: '#aaaaaa',
    }).setOrigin(0.5));

    const restartBtn = this._overlayBtn(cx, cy + 60, 'New Game', BTN_RESTART_BG, BTN_RESTART_HOV, () => {
      this.game.net.send('restart');
      this._hideScoreOverlay();
    });
    this._scoreOverlay.add(restartBtn);

    this._turnText.setText(winnerStr);
    this._turnText.setColor('#ffd700');
  }

  _drawStones(board) {
    const gfx = this._stoneGfx;
    gfx.clear();
    const cs = this._cellSize;
    const r  = Math.round(cs * 0.44);
    const bx = this._boardX;
    const by = this._boardY;

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const cell = board[y][x];
        if (!cell) continue;
        const px = bx + x * cs;
        const py = by + y * cs;

        if (cell === 'black') {
          gfx.fillStyle(BLACK_FILL, 1);
          gfx.fillCircle(px, py, r);
          gfx.lineStyle(1, BLACK_STROKE, 1);
          gfx.strokeCircle(px, py, r);
          // Subtle highlight (top-left shine).
          gfx.fillStyle(0x555555, 0.35);
          gfx.fillCircle(px - r * 0.25, py - r * 0.25, r * 0.35);
        } else {
          gfx.fillStyle(WHITE_FILL, 1);
          gfx.fillCircle(px, py, r);
          gfx.lineStyle(2, WHITE_STROKE, 1);
          gfx.strokeCircle(px, py, r);
          // Subtle shadow ring.
          gfx.lineStyle(1, 0x333333, 0.2);
          gfx.strokeCircle(px + 1, py + 1, r);
        }
      }
    }
  }

  _drawLastMoveMarker(lastMove) {
    const gfx = this._markerGfx;
    gfx.clear();
    if (!lastMove || lastMove === 'pass') return;

    const cs = this._cellSize;
    const px = this._boardX + lastMove.x * cs;
    const py = this._boardY + lastMove.y * cs;
    const r  = Math.round(cs * 0.15);

    gfx.fillStyle(0xff4444, 0.9);
    gfx.fillCircle(px, py, r);
  }

  _drawGhost() {
    const gfx = this._ghostGfx;
    gfx.clear();
    if (!this._hoverCell) return;

    const net = this.game.net;
    const st  = net.latestState;
    if (st?.gameType !== 'go') return;  // Go only — Morris has its own hover logic
    const gameState = st?.game;
    if (!gameState || gameState.gameOver) return;

    const myPid       = net.playerId;
    const mySide      = st?.players[myPid]?.side ?? null;

    // Only show ghost if it's this player's turn (or both).
    const canMove = mySide === 'both' || mySide === gameState.turn;
    if (!canMove) return;

    const { x, y } = this._hoverCell;
    if (gameState.board[y][x] !== null) return; // occupied

    const ghostColor = mySide === 'both' ? gameState.turn : mySide;
    const cs = this._cellSize;
    const px = this._boardX + x * cs;
    const py = this._boardY + y * cs;
    const r  = Math.round(cs * 0.44);

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

  // ─── Pause overlay ──────────────────────────────────────────────────────────

  _openOverlay(mode) {
    if (this._gameOverlay) return;
    const { width: W, height: H } = this.scale;
    const cx  = W / 2;
    const net = this.game.net;
    const st  = net.latestState;

    this._gameOverlay = this.add.container(0, 0);

    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.72).setOrigin(0, 0).setInteractive();
    this._gameOverlay.add(dim);

    const panelW = Math.min(W * 0.82, 320);
    const panelH = 230;
    const cy     = H / 2;
    const top    = cy - panelH / 2;
    const panel  = this.add.rectangle(cx, cy, panelW, panelH, 0x16213e)
      .setStrokeStyle(3, 0x9944aa);
    this._gameOverlay.add(panel);

    this._gameOverlay.add(this.add.text(cx, top + 32, 'PAUSED', {
      ...FONT, fontSize: '24px', color: '#cc88ff', fontStyle: 'bold',
    }).setOrigin(0.5));

    const gameType = st?.gameType ?? 'go';
    const LABELS = { go: 'Go', checkers: 'Checkers', chess: 'Chess',
      morris: "Nine Men's Morris", cchk: 'Chinese Checkers',
      foxgeese: 'Fox & Geese', hex: 'Hex', reversi: 'Reversi' };
    this._gameOverlay.add(this.add.text(cx, top + 68, LABELS[gameType] ?? gameType, {
      ...FONT, fontSize: '14px', color: '#777788',
    }).setOrigin(0.5));

    const btns = [
      { label: '▶  Resume',    bg: '#1a4a1a', hov: '#2a6a2a', cb: () => this._hideOverlay() },
      { label: '←  Game Select', bg: '#333355', hov: '#555577', cb: () => { this._hideOverlay(); this.scene.start('GameSelectScene'); } },
      { label: '⌂  Main Menu', bg: '#333333', hov: '#555555', cb: () => { this._hideOverlay(); this.scene.start('MenuScene'); } },
    ];
    const btnStartY = cy + 20;
    const btnGap    = 46;
    btns.forEach((b, i) => {
      const btn = this.add.text(cx, btnStartY + i * btnGap, b.label, {
        ...FONT, fontSize: '18px', color: '#ffffff',
        backgroundColor: b.bg, padding: { x: 24, y: 8 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on('pointerover',  () => btn.setBackgroundColor(b.hov));
      btn.on('pointerout',   () => btn.setBackgroundColor(b.bg));
      btn.on('pointerdown',  b.cb);
      this._gameOverlay.add(btn);
    });
  }

  _hideOverlay() {
    if (this._gameOverlay) {
      this._gameOverlay.destroy(true);
      this._gameOverlay = null;
    }
  }

  // ─── Hint ─────────────────────────────────────────────────────────────────────

  _onHint() {
    const st = this.game.net.latestState;
    if (!st?.game || st.game.gameOver) return;
    if (this._hintBtn) { this._hintBtn.setAlpha(0.4); this._hintBtn.disableInteractive(); }
    if (this._hintStatusTxt) this._hintStatusTxt.setText('thinking…');
    this.game.net.send('request_hint');
  }

  _showHintMarker(x, y) {
    this._clearHintMarker();
    const gfx = this._hintGfx;
    const cs  = this._cellSize;
    const px  = this._boardX + x * cs;
    const py  = this._boardY + y * cs;
    const r   = Math.round(cs * 0.22);

    gfx.clear();
    gfx.fillStyle(0x00cc44, 0.92);
    gfx.fillCircle(px, py, r);
    gfx.lineStyle(2, 0x00ff66, 0.6);
    gfx.strokeCircle(px, py, r);

    this._hintClearTimer = this.time.delayedCall(4000, () => this._clearHintMarker());
  }

  _clearHintMarker() {
    if (this._hintTween)       { this._hintTween.stop();        this._hintTween = null; }
    if (this._hintClearTimer)  { this._hintClearTimer.remove(); this._hintClearTimer = null; }
    if (this._hintGfx)          this._hintGfx.clear();
    if (this._hintBtn)          this._hintBtn.setAlpha(1).setInteractive({ useHandCursor: true });
    if (this._hintStatusTxt)    this._hintStatusTxt.setText('');
  }

  // ─── Territory overlay ────────────────────────────────────────────────────────

  _drawTerritoryOverlay(cells) {
    const gfx = this._territoryGfx;
    gfx.clear();
    const cs = this._cellSize;
    const bx = this._boardX;
    const by = this._boardY;
    const sq = Math.round(cs * 0.28);
    for (const { x, y } of (cells.black ?? [])) {
      gfx.fillStyle(0x111111, 0.85);
      gfx.fillRect(bx + x * cs - sq / 2, by + y * cs - sq / 2, sq, sq);
    }
    for (const { x, y } of (cells.white ?? [])) {
      gfx.fillStyle(0xeeeeee, 0.85);
      gfx.fillRect(bx + x * cs - sq / 2, by + y * cs - sq / 2, sq, sq);
    }
  }

  // ─── Score overlay ───────────────────────────────────────────────────────────

  _showScoreOverlay(score) {
    if (this._scoreOverlay) return; // already shown

    const { width: W, height: H } = this.scale;
    const cx = W / 2;
    const cy = H / 2;

    this._scoreOverlay = this.add.container(0, 0);

    // Dim background.
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.65).setOrigin(0, 0);
    this._scoreOverlay.add(dim);

    // Panel.
    const panel = this.add.rectangle(cx, cy, Math.min(W * 0.82, 440), 300, 0x1a0f05)
      .setStrokeStyle(3, 0xffd700);
    this._scoreOverlay.add(panel);

    // Title.
    const title = this.add.text(cx, cy - 110, 'GAME OVER', {
      ...FONT, fontSize: '30px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5);
    this._scoreOverlay.add(title);

    if (score) {
      const winner = score.winner === 'tie' ? 'It\'s a tie!' :
        score.winner === 'black' ? '⚫ BLACK wins!' : '⚪ WHITE wins!';

      const winTxt = this.add.text(cx, cy - 68, winner, {
        ...FONT, fontSize: '24px', color: '#fff8e7', fontStyle: 'bold',
      }).setOrigin(0.5);
      this._scoreOverlay.add(winTxt);

      const detailLines = [
        `⚫ Black: ${score.total.black}  (${score.stones.black} stones + ${score.territory.black} territory + ${score.captures.black} captured)`,
        `⚪ White: ${score.total.white}  (${score.stones.white} stones + ${score.territory.white} territory + ${score.captures.white} captured)`,
      ];
      detailLines.forEach((line, i) => {
        const t = this.add.text(cx, cy - 24 + i * 26, line, {
          ...FONT, fontSize: '14px', color: '#aaaaaa',
        }).setOrigin(0.5);
        this._scoreOverlay.add(t);
      });
    }

    // Buttons.
    const btnY = cy + 80;
    const continueBtn = this._overlayBtn(cx - 80, btnY, 'Continue', BTN_PASS_BG, BTN_PASS_HOV, () => {
      // Hide first to prevent the overlay flashing back if a stale state arrives
      // before the undos are processed. Game-over requires two passes, so undo twice.
      this._hideScoreOverlay();
      this.game.net.send('undo_move');
      this.time.delayedCall(80, () => this.game.net.send('undo_move'));
    });
    const restartBtn = this._overlayBtn(cx + 80, btnY, 'New Game', BTN_RESTART_BG, BTN_RESTART_HOV, () => {
      this.game.net.send('restart');
      this._hideScoreOverlay();
    });

    this._scoreOverlay.add(continueBtn);
    this._scoreOverlay.add(restartBtn);

    // Draw territory squares on the board.
    if (score?.territoryCells) this._drawTerritoryOverlay(score.territoryCells);

    // Update turn text.
    this._turnText.setText('Two passes — game over!');
    this._turnText.setColor('#ffd700');
  }

  _overlayBtn(x, y, label, bg, hover, cb) {
    const txt = this.add.text(x, y, label, {
      ...FONT, fontSize: '20px', color: '#ffffff',
      backgroundColor: bg, padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    txt.on('pointerover',  () => txt.setBackgroundColor(hover));
    txt.on('pointerout',   () => txt.setBackgroundColor(bg));
    txt.on('pointerdown',  cb);
    return txt;
  }

  _hideScoreOverlay() {
    if (this._scoreOverlay) {
      this._scoreOverlay.destroy(true);
      this._scoreOverlay = null;
    }
    if (this._territoryGfx) this._territoryGfx.clear();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  _on(emitter, event, cb) {
    emitter.addEventListener(event, cb);
    this._listeners.push({ emitter, event, cb });
  }

  shutdown() {
    for (const { emitter, event, cb } of this._listeners) {
      emitter.removeEventListener(event, cb);
    }
    this._listeners = [];
    if (this._morrisActive) {
      morrisRenderer.shutdown();
      this._morrisActive = false;
    }
  }
}
