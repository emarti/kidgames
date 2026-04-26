import goRenderer from '../renderers/go.js';
import morrisRenderer from '../renderers/morris.js';
import foxgeeseRenderer from '../renderers/foxgeese.js';
import piratesbulgarsRenderer from '../renderers/piratesbulgars.js';
import hexRenderer from '../renderers/hex.js';
import NetScene from './NetScene.js';

// ─── Renderer registry ────────────────────────────────────────────────────────
const RENDERERS = {
  go:              goRenderer,
  morris:          morrisRenderer,
  foxgeese:        foxgeeseRenderer,
  piratesbulgars:  piratesbulgarsRenderer,
  hex:             hexRenderer,
};

// ─── UI palette ───────────────────────────────────────────────────────────────
const BG_COLOR       = 0x2d1a0e;
const BTN_UNDO_BG    = '#d4a017';
const BTN_UNDO_HOV   = '#f0c030';
const BTN_PASS_BG    = '#555555';
const BTN_PASS_HOV   = '#777777';
const BTN_MENU_BG    = '#333333';
const BTN_MENU_HOV   = '#555555';
const BTN_RESTART_BG = '#2a5c2a';
const BTN_RESTART_HOV= '#3a8c3a';

const FONT = { fontFamily: 'monospace' };

const BOARD_SIZE = 9; // used only for layout geometry

export default class PlayScene extends NetScene {
  constructor() {
    super({ key: 'PlayScene' });
    this._prevTick            = -1;
    this._prevGameOver        = false;
    this._scoreOverlay        = null;
    this._gameOverlay         = null;
    this._activeRenderer      = null;
    this._activeGameType      = null;
    this._celebrationTimer    = null;
    this._celebrationParticles = [];
    this._pendingGoInfo       = null;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  create() {
    // Reset renderer state — Phaser destroys all game objects on scene restart
    // but module-level renderer refs would still point at the destroyed objects.
    if (this._activeRenderer) {
      this._activeRenderer.shutdown();
    }
    this._activeRenderer      = null;
    this._activeGameType      = null;
    this._prevTick            = -1;
    this._prevGameOver        = false;
    this._scoreOverlay        = null;
    this._gameOverlay         = null;
    this._celebrationTimer    = null;
    this._celebrationParticles = [];
    this._pendingGoInfo       = null;

    // Register shutdown so Phaser calls it when the scene stops.
    this.events.once('shutdown', this.shutdown, this);

    this._addBg();
    this._layout();
    this._buildUI();
    this._setupInput();
    this._setupNet();
    this._buildSidePanel();

    const st = this.game.net.latestState;
    if (st) this._renderState(st);
  }

  // ─── Background ─────────────────────────────────────────────────────────────

  _addBg() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(0, 0, W, H, BG_COLOR).setOrigin(0, 0);
  }

  // ─── Layout ─────────────────────────────────────────────────────────────────

  _layout() {
    const { width: W, height: H } = this.scale;

    const TOP_BAR    = Math.round(H * 0.12);
    const BOT_BAR    = Math.round(H * 0.14);
    const SIDE_PAD   = 20;

    const RIGHT_PANEL_W = Math.min(96, Math.max(76, Math.round(W * 0.2)));
    const availW = W - SIDE_PAD * 2 - RIGHT_PANEL_W - 8;
    const availH = H - TOP_BAR - BOT_BAR - SIDE_PAD * 2;

    const cellByW = Math.floor(availW / BOARD_SIZE);
    const cellByH = Math.floor(availH / BOARD_SIZE);
    this._cellSize = Math.min(cellByW, cellByH, 60);

    const boardPx = this._cellSize * (BOARD_SIZE - 1);

    this._boardX       = SIDE_PAD + Math.round((availW - boardPx) / 2);
    this._boardY       = TOP_BAR + SIDE_PAD + Math.round((availH - boardPx) / 2);
    this._boardCenterX = this._boardX + Math.round(boardPx / 2);

    this._sidePanelX    = W - SIDE_PAD - Math.round(RIGHT_PANEL_W / 2);
    this._sidePanelBtnW = RIGHT_PANEL_W - 8;

    this._topBarY  = Math.round(TOP_BAR / 2);
    this._botBarY  = H - Math.round(BOT_BAR / 2);

    this._W = W;
    this._H = H;
  }

  // ─── UI bar ─────────────────────────────────────────────────────────────────

  _buildUI() {
    const cx = this._boardCenterX;

    this._turnText = this.add.text(cx, this._topBarY, '', {
      ...FONT, fontSize: '24px', color: '#fff8e7', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20);

    this._captureText = this.add.text(cx, this._topBarY + 28, '', {
      ...FONT, fontSize: '15px', color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(20);

    this._roomText = this.add.text(8, 8, '', {
      ...FONT, fontSize: '13px', color: '#666677',
    }).setOrigin(0, 0).setDepth(20);

    this._playersText = this.add.text(8, 24, '', {
      ...FONT, fontSize: '12px', color: '#556666',
    }).setOrigin(0, 0).setDepth(20);

    const by = this._botBarY;
    const sp = Math.min(118, this._W * 0.22);

    this._undoBtn = this._btn(cx - sp * 2, by, '↩ UNDO',  BTN_UNDO_BG,  BTN_UNDO_HOV,  () => this._onUndo());
    this._redoBtn = this._btn(cx - sp * 1, by, '↪ REDO',  BTN_PASS_BG,  BTN_PASS_HOV,  () => this._onRedo());
    this._passBtn = this._btn(cx,          by, 'PASS',     BTN_PASS_BG,  BTN_PASS_HOV,  () => this._onPass());
    this._hintBtn = this._btn(cx + sp * 1, by, '💡 HINT',  '#1a3a6a',    '#2a5a9a',     () => this._onHint());
    this._menuBtn = this._btn(cx + sp * 2, by, '⏸ PAUSE',  BTN_MENU_BG,  BTN_MENU_HOV,  () => this._openOverlay('pause'));
    this._undoBtn.setDepth(20);
    this._redoBtn.setDepth(20);
    this._redoBtn.setAlpha(0.4);
    this._redoBtn.disableInteractive();
    this._passBtn.setDepth(20);
    this._hintBtn.setDepth(20);
    this._menuBtn.setDepth(20);

    this._hintStatusTxt = this.add.text(cx + sp * 0.5, by - 32, '', {
      ...FONT, fontSize: '12px', color: '#aaaacc',
    }).setOrigin(0.5).setDepth(20);

    this._scoreOverlay = null;
    this._gameOverlay  = null;
  }

  // ─── Side panel ─────────────────────────────────────────────────────────────

  _buildSidePanel() {
    const x   = this._sidePanelX;
    const bw  = this._sidePanelBtnW;
    const bh  = 32;
    const gap = 6;

    const boardTop = this._boardY;
    const boardBot = this._boardY + (BOARD_SIZE - 1) * this._cellSize;
    const totalH   = 16 + 3 * (bh + gap) + 14 + 16 + bh;
    let   y        = Math.round((boardTop + boardBot) / 2 - totalH / 2);

    this.add.text(x, y, 'YOUR SIDE', { ...FONT, fontSize: '10px', color: '#666677' }).setOrigin(0.5).setDepth(20);
    y += 16;

    const sideOptions = [
      { id: 'black', label: '⚫ Black', fill: 0x1a1a1a, stroke: 0x555566, fg: '#dddddd' },
      { id: 'white', label: '⚪ White', fill: 0xcacaca, stroke: 0x888888, fg: '#111111' },
      { id: 'both',  label: '⚫⚪Both',  fill: 0x1e1e3a, stroke: 0x6633aa, fg: '#ccaaff' },
    ];

    this._sidePanelBgs    = {};
    this._sidePanelTxts   = {};
    this._sidePanelFg     = {};
    this._sidePanelStroke = {};
    this._sidePanelDefLabels = {};

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
      this._sidePanelDefLabels[opt.id] = opt.label;
      y += bh + gap;
    }
  }

  _sidePanelSelected(id) {
    const mySide = this.game.net.latestState?.players[this.game.net.playerId]?.side ?? null;
    return mySide === id;
  }

  _updateSidePanel(mySide) {
    if (!this._sidePanelBgs) return;
    const custom = this._activeRenderer?.sideLabels;
    for (const id of ['black', 'white', 'both']) {
      const bg  = this._sidePanelBgs[id];
      const lbl = this._sidePanelTxts[id];
      if (!bg) continue;
      const sel = mySide === id;
      bg.setStrokeStyle(sel ? 3 : 1, sel ? 0xffd700 : this._sidePanelStroke[id]);
      lbl.setColor(sel ? '#ffd700' : this._sidePanelFg[id]);
      if (custom && custom[id]) lbl.setText(custom[id]);
      else lbl.setText(this._sidePanelDefLabels[id]);
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
    this.input.keyboard.on('keydown-U', () => this._onUndo());
    this.input.keyboard.on('keydown-R', () => this._onRedo());
    this.input.keyboard.on('keydown-P', () => this._onPass());
    this.input.keyboard.on('keydown-ESC', () => this._openOverlay('pause'));
  }

  _onUndo() {
    this.game.net.send('undo_move');
  }

  _onRedo() {
    this.game.net.send('redo_move');
  }

  _onPass() {
    if (this._activeRenderer?.showPassButton) {
      if (this._activeGameType === 'piratesbulgars') {
        this.game.net.send('end_jump');
      } else {
        this.game.net.send('pass_turn');
      }
    }
  }

  // ─── Networking ──────────────────────────────────────────────────────────────

  _setupNet() {
    const net = this.game.net;
    this._on(net, 'state', (e) => this._renderState(e.detail));
    this._on(net, 'hint',  (e) => {
      this._hintBtn?.setAlpha(1).setInteractive({ useHandCursor: true });
      if (this._hintStatusTxt) this._hintStatusTxt.setText('');
      if (this._activeRenderer) this._activeRenderer.showHint(e.detail);
    });
    this._on(net, 'disconnected', () => {
      if (this._turnText) this._turnText.setText('Disconnected…');
    });
    this._on(net, 'server_error', (e) => {
      if (this._hintStatusTxt) this._hintStatusTxt.setText(e.detail ?? 'Error');
      this.time.delayedCall(2000, () => { if (this._hintStatusTxt) this._hintStatusTxt.setText(''); });
    });
  }

  // ─── Renderer lifecycle ──────────────────────────────────────────────────────

  _ensureRenderer(gameType) {
    if (this._activeGameType === gameType) return;

    const renderer = RENDERERS[gameType];
    if (!renderer) return; // unknown game type — keep current renderer

    // Shut down old renderer.
    if (this._activeRenderer) {
      this._activeRenderer.shutdown();
      this._activeRenderer = null;
      this._activeGameType = null;
    }
    this._hideScoreOverlay();

    const cs = this._cellSize;
    const boardPx = cs * (BOARD_SIZE - 1);

    renderer.init(this, {
      boardX:    this._boardX,
      boardY:    this._boardY,
      boardSize: boardPx,
      onAction:  (type, payload) => this.game.net.send(type, payload),
    });

    this._activeRenderer  = renderer;
    this._activeGameType  = gameType;
    this._prevTick        = -1;
    this._prevGameOver    = false;

    // Pass button visibility.
    this._passBtn.setVisible(renderer.showPassButton);
    if (!renderer.showPassButton) this._passBtn.disableInteractive();
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  _renderState(state) {
    if (!state) return;

    const gameState = state.game;
    if (!gameState) return;

    const myPid  = this.game.net.playerId;
    const mySide = state.players[myPid]?.side ?? null;
    const gameType = state.gameType;

    // Swap renderers if the game type changed.
    this._ensureRenderer(gameType);

    const renderer = this._activeRenderer;
    if (!renderer) return;

    // Compute shared context.
    const actingColor = (gameType === 'morris' && gameState.phase === 'removing')
      ? gameState.pendingRemove
      : gameState.turn;
    const canMove = (mySide === 'both' || mySide === actingColor) && !gameState.gameOver;
    const ctx = { myPid, mySide, canMove };

    // Clear hint on new tick.
    if (gameState.tick !== this._prevTick) {
      this._prevTick = gameState.tick;
      renderer.clearHint();
      if (renderer.resetSelection) renderer.resetSelection();
      if (this._hintStatusTxt) this._hintStatusTxt.setText('');
      this._hintBtn?.setAlpha(1).setInteractive({ useHandCursor: true });
    }

    // Update turn/capture text via renderer.
    this._turnText.setText(renderer.formatTurnText(gameState));
    this._turnText.setColor(renderer.formatTurnColor(gameState));
    this._captureText.setText(renderer.formatCaptureText(gameState));
    if (this._roomText) this._roomText.setText(`Room ${this.game.net.roomId ?? ''}`);

    // Player count.
    if (this._playersText && state.players) {
      const n = Object.values(state.players).filter(p => p.connected).length;
      this._playersText.setText(`${n} player${n !== 1 ? 's' : ''} connected`);
    }

    // Side panel.
    this._updateSidePanel(mySide);

    // Button states.
    const hasHistory = gameState.history?.length > 0;
    this._undoBtn.setAlpha(hasHistory ? 1 : 0.4);
    if (hasHistory) this._undoBtn.setInteractive({ useHandCursor: true });
    else this._undoBtn.disableInteractive();

    const hasRedo = !!gameState.redoSnapshot;
    this._redoBtn.setAlpha(hasRedo ? 1 : 0.4);
    if (hasRedo) this._redoBtn.setInteractive({ useHandCursor: true });
    else this._redoBtn.disableInteractive();

    if (renderer.showPassButton) {
      // For piratesbulgars, only show pass when there's a pending multi-jump.
      const showPass = gameType === 'piratesbulgars'
        ? gameState.pendingJump !== null && canMove
        : true;
      this._passBtn.setVisible(showPass);
      if (showPass) {
        this._passBtn.setAlpha(canMove ? 1 : 0.4);
        if (canMove) this._passBtn.setInteractive({ useHandCursor: true });
        else this._passBtn.disableInteractive();
      }
    }

    // Draw the game board.
    renderer.draw(gameState, ctx);

    // Game-over overlay — with 2s celebration delay on first trigger.
    const goInfo = renderer.getGameOverInfo(gameState);
    const justEnded = goInfo && !this._prevGameOver;
    this._prevGameOver = !!goInfo;

    if (goInfo) {
      if (justEnded) {
        // First frame of game over — launch celebration, delay overlay by 2s.
        this._pendingGoInfo = goInfo;
        this._startCelebration();
      } else if (!this._celebrationTimer && !this._scoreOverlay) {
        // Celebration already finished (or was skipped) — show overlay.
        this._showGameOverOverlay(goInfo);
      }
    } else {
      this._prevGameOver = false;
      this._stopCelebration();
      this._hideScoreOverlay();
    }
  }

  // ─── Victory celebration ────────────────────────────────────────────────────

  _startCelebration() {
    this._stopCelebration();
    const { width: W, height: H } = this.scale;
    const cx = W / 2;
    const cy = H / 2;

    const COLORS = [0xffd700, 0xff4466, 0x44ddff, 0x88ff44, 0xff8800, 0xcc44ff, 0xffffff];
    const COUNT = 60;

    for (let i = 0; i < COUNT; i++) {
      const angle  = Math.random() * Math.PI * 2;
      const speed  = 120 + Math.random() * 260;
      const size   = 5 + Math.random() * 10;
      const color  = COLORS[Math.floor(Math.random() * COLORS.length)];
      const isRect = Math.random() < 0.4;

      const obj = isRect
        ? this.add.rectangle(cx, cy, size, size * 1.6, color).setDepth(48)
        : this.add.circle(cx, cy, size / 2, color).setDepth(48);

      const destX = cx + Math.cos(angle) * speed * (1.2 + Math.random());
      const destY = cy + Math.sin(angle) * speed * (1.2 + Math.random());

      this.tweens.add({
        targets: obj,
        x: destX,
        y: destY,
        alpha: 0,
        scaleX: 0.3 + Math.random() * 0.7,
        scaleY: 0.3 + Math.random() * 0.7,
        duration: 1600 + Math.random() * 400,
        delay: Math.random() * 200,
        ease: 'Quad.easeOut',
      });

      this._celebrationParticles.push(obj);
    }

    // Central flash star.
    const flash = this.add.text(cx, cy - 30, '✦', {
      fontSize: '80px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(48).setAlpha(0);
    this.tweens.add({
      targets: flash,
      alpha: { from: 0, to: 1 },
      scaleX: { from: 0.1, to: 1.5 },
      scaleY: { from: 0.1, to: 1.5 },
      yoyo: true,
      duration: 500,
      ease: 'Back.easeOut',
    });
    this._celebrationParticles.push(flash);

    this._celebrationTimer = this.time.delayedCall(2000, () => {
      this._celebrationTimer = null;
      this._stopCelebration();
      if (this._pendingGoInfo) {
        this._showGameOverOverlay(this._pendingGoInfo);
        this._pendingGoInfo = null;
      }
    });
  }

  _stopCelebration() {
    if (this._celebrationTimer) {
      this._celebrationTimer.remove();
      this._celebrationTimer = null;
    }
    for (const p of this._celebrationParticles) p.destroy();
    this._celebrationParticles = [];
  }

  // ─── Generic game-over overlay ──────────────────────────────────────────────

  _showGameOverOverlay(info) {
    if (this._scoreOverlay) return;

    const { width: W, height: H } = this.scale;
    const cx = W / 2;
    const cy = H / 2;

    this._scoreOverlay = this.add.container(0, 0).setDepth(50);

    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.65).setOrigin(0, 0);
    this._scoreOverlay.add(dim);

    // Panel height scales with content.
    const lineCount = (info.lines?.length ?? 0);
    const btnCount  = (info.buttons?.length ?? 0);
    const panelH = 120 + lineCount * 26 + btnCount * 50;
    const panel = this.add.rectangle(cx, cy, Math.min(W * 0.82, 440), panelH, 0x1a0f05)
      .setStrokeStyle(3, 0xffd700);
    this._scoreOverlay.add(panel);

    let y = cy - panelH / 2 + 30;

    // Title.
    this._scoreOverlay.add(this.add.text(cx, y, info.title, {
      ...FONT, fontSize: '30px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5));
    y += 40;

    // Winner.
    this._scoreOverlay.add(this.add.text(cx, y, info.winner, {
      ...FONT, fontSize: '22px', color: '#fff8e7', fontStyle: 'bold',
    }).setOrigin(0.5));
    y += 34;

    // Detail lines.
    for (const line of (info.lines ?? [])) {
      this._scoreOverlay.add(this.add.text(cx, y, line, {
        ...FONT, fontSize: '14px', color: '#aaaaaa',
      }).setOrigin(0.5));
      y += 26;
    }
    y += 10;

    // Buttons.
    const btns = info.buttons ?? [];
    const totalBtnW = btns.length * 140 + (btns.length - 1) * 20;
    let bx = cx - totalBtnW / 2 + 70;
    for (const btn of btns) {
      const bg  = btn.actions[0] === 'restart' ? BTN_RESTART_BG : BTN_PASS_BG;
      const hov = btn.actions[0] === 'restart' ? BTN_RESTART_HOV : BTN_PASS_HOV;
      const actions = btn.actions;
      const btnObj = this._overlayBtn(bx, y, btn.label, bg, hov, () => {
        this._hideScoreOverlay();
        // Send actions with delay between multiples (e.g. Go "Continue" = 2 undos).
        actions.forEach((action, i) => {
          if (i === 0) {
            this.game.net.send(action);
          } else {
            this.time.delayedCall(i * 80, () => this.game.net.send(action));
          }
        });
      });
      this._scoreOverlay.add(btnObj);
      bx += 160;
    }
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
    this._stopCelebration();
    this._prevGameOver  = false;
    this._pendingGoInfo = null;
    if (this._scoreOverlay) {
      this._scoreOverlay.destroy(true);
      this._scoreOverlay = null;
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
    const isMorris = (st?.gameType === 'morris');
    const flyingOn = isMorris && (st?.game?.flyingAlways ?? false);
    const isHex = (st?.gameType === 'hex');
    const hexSize = isHex ? (st?.game?.boardSize ?? 11) : 11;
    const panelH = 230 + (isMorris ? 46 : 0) + (isHex ? 46 : 0);
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
      ...(isMorris ? [{
        label: flyingOn ? '🕊 Flying: ON' : '🕊 Flying: OFF',
        bg:  flyingOn ? '#1a3a4a' : '#3a2a10',
        hov: flyingOn ? '#2a5a6a' : '#5a4a30',
        cb: () => { this.game.net.send('toggle_flying'); this._hideOverlay(); },
      }] : []),
      ...(isHex ? [{
        label: hexSize === 11 ? '⬡ Board: 11×11' : '⬡ Board: 9×9',
        bg:  '#1a3a4a',
        hov: '#2a5a6a',
        cb: () => { this.game.net.send('toggle_hex_size'); this._hideOverlay(); },
      }] : []),
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

  // ─── Hint ───────────────────────────────────────────────────────────────────

  _onHint() {
    const st = this.game.net.latestState;
    if (!st?.game || st.game.gameOver) return;
    if (this._hintBtn) { this._hintBtn.setAlpha(0.4); this._hintBtn.disableInteractive(); }
    if (this._hintStatusTxt) this._hintStatusTxt.setText('thinking…');
    this.game.net.send('request_hint');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  shutdown() {
    super.shutdown();
    this._stopCelebration();
    if (this._activeRenderer) {
      this._activeRenderer.shutdown();
      this._activeRenderer = null;
      this._activeGameType = null;
    }
  }
}
