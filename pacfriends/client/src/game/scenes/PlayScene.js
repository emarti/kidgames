import Phaser from 'phaser';
import { drawMaze, drawPlayers, drawGhosts, drawFruit, drawPopups } from '../renderer.js';
import { Sounds } from '../sounds.js';
import { createTouchControls, getTouchControlsReserve, isTouchDevice } from '@games/touch-controls';

// Server constants mirrored on client (10 logical cols × 12 rows → 22×26 tile grid)
const GRID_W = 22;
const GRID_H = 26;
const TILE_PX = 16; // server virtual units

const PLAYER_COLORS = ['#FFFF00', '#FFB8FF', '#00BFFF', '#00FF00', '#FF8C00', '#FF4444'];
const COLOR_NAMES   = ['Yellow', 'Pink', 'Blue', 'Green', 'Orange', 'Red'];
const DECORATIONS   = ['plain', 'bow', 'beanie', 'bowtie'];
const DEC_LABELS    = ['Plain', 'Bow', 'Beanie', 'Bowtie'];
const DIFFICULTIES  = ['easy', 'medium', 'hard'];
const DIFF_LABELS   = ['Easy', 'Medium', 'Hard'];
const SPEEDS        = ['slow', 'medium', 'fast'];
const SPEED_LABELS  = ['Slow', 'Medium', 'Fast'];

const UI_BTN_BG          = '#777777';
const UI_BTN_BG_HOVER    = '#888888';
const UI_BTN_BG_SELECTED = '#000000';
const UI_BTN_TEXT        = '#FFFFFF';

// Touch control sizing constants (match maze/snake)
const TOUCH_KEY_H   = 54;
const TOUCH_GAP_MULT = 2;

export default class PlayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PlayScene' });
  }

  // ----------------------------------------------------------------
  // Touch controls helpers (same pattern as maze/snake)
  // ----------------------------------------------------------------

  createTouchControls_() {
    if (!this.touchControlsEnabled) return;
    if (this.touchControls?.destroy) this.touchControls.destroy();
    this.touchControls = createTouchControls(this, {
      onDir: (dir) => this.game.net.send('input', { dir }),
      onPause: () => this.togglePause(),
      alpha: 0.6,
      margin: this.touchControlsMargin,
    });
  }

  ensureTouchControlsGap_(cellSize) {
    if (!this.touchControlsEnabled) return false;
    const cs = Math.max(0, Math.floor(Number(cellSize) || 0));
    const targetGap = Math.max(cs, TOUCH_KEY_H * TOUCH_GAP_MULT);
    const nextMargin = Math.max(20, targetGap);
    const cur = Math.max(0, Math.floor(Number(this.touchControlsMargin) || 0));
    if (Math.abs(nextMargin - cur) < 2) return false;
    this.touchControlsMargin = nextMargin;
    this.createTouchControls_();
    return true;
  }

  // ----------------------------------------------------------------
  // Phaser lifecycle
  // ----------------------------------------------------------------

  create() {
    this.graphics = this.add.graphics();

    const W = this.scale.width;
    const H = this.scale.height;

    // Persistent HUD text objects (never recreated; positions updated on resize)
    this.scoreText = this.add.text(10, 8, '',
      { fontSize: '18px', color: '#FFFF00', fontFamily: 'monospace' })
      .setDepth(5).setOrigin(0, 0);

    this.levelDiffText = this.add.text(W / 2, 8, '',
      { fontSize: '18px', color: '#FFFFFF', fontFamily: 'monospace' })
      .setDepth(5).setOrigin(0.5, 0);

    this.dotsText = this.add.text(W - 10, 8, '',
      { fontSize: '18px', color: '#AAAAAA', fontFamily: 'monospace' })
      .setDepth(5).setOrigin(1, 0);

    this.livesGraphics = this.add.graphics().setDepth(5);
    this.fruitText = this.add.text(W - 10, H - 30, '',
      { fontSize: '18px', fontFamily: 'monospace' })
      .setDepth(5).setOrigin(1, 0);

    this.centerText = this.add.text(W / 2, H / 2, '',
      { fontSize: '32px', color: '#FFFF00', fontStyle: 'bold', fontFamily: 'monospace',
        backgroundColor: '#000000AA', padding: { x: 20, y: 10 } })
      .setOrigin(0.5).setDepth(100);

    // Persistent setup overlay container
    this.setupContainer = this.add.container(W / 2, H / 2);
    this.createSetupUI();
    this.setupContainer.setVisible(false);
    this.setupContainer.setDepth(500);

    // Reposition fixed-position UI on resize
    const positionFixedUI = () => {
      const W2 = this.scale?.width || 800;
      const H2 = this.scale?.height || 600;
      this.setupContainer.setPosition(W2 / 2, H2 / 2);
      this.centerText.setPosition(W2 / 2, H2 / 2);
      this.levelDiffText.setPosition(W2 / 2, 8);
      this.dotsText.setPosition(W2 - 10, 8);
      this.fruitText.setPosition(W2 - 10, H2 - 30);
    };
    positionFixedUI();
    this.scale.on('resize', positionFixedUI);
    this.events.once('shutdown', () => this.scale.off('resize', positionFixedUI));

    // Sounds
    this._sounds = new Sounds();
    this._prevDotsRemaining = null;
    this._prevScore = 0;
    this._prevEndReason = null;
    this._prevMaxPowerTimer = 0;
    this._celebrationTimer = null;
    this._celebrationParticles = [];

    // Touch controls
    this.touchControlsEnabled = isTouchDevice();
    if (this.touchControlsEnabled) {
      this.touchControlsMargin = TOUCH_KEY_H * TOUCH_GAP_MULT;
      this.createTouchControls_();
    }

    this.setupInput();

    // Networking — store handlers so we can clean them up on shutdown
    this.onState = (e) => this.renderState(e.detail);
    this.onDisconnected = () => this.scene.start('MenuScene');
    this.game.net.addEventListener('state', this.onState);
    this.game.net.addEventListener('disconnected', this.onDisconnected);
    this.events.once('shutdown', () => {
      this.game.net.removeEventListener('state', this.onState);
      this.game.net.removeEventListener('disconnected', this.onDisconnected);
      this._stopCelebration();
    });

    if (this.game.net.latestState) this.renderState(this.game.net.latestState);
  }

  // ----------------------------------------------------------------
  // Input
  // ----------------------------------------------------------------

  setupInput() {
    window.focus();
    this.input.keyboard.on('keydown', (e) => {
      if (e.repeat) return;
      const net = this.game.net;
      if (!net.latestState) return;

      if (e.code === 'Space' || e.code === 'KeyP' || e.code === 'Escape') {
        this.togglePause();
        return;
      }

      // Next level shortcut at level-complete screen
      if (e.code === 'KeyN') {
        const s = net.latestState;
        if (s?.reasonPaused === 'levelcomplete') { net.send('next_level'); return; }
      }

      let dir = null;
      if (e.code === 'ArrowUp'    || e.code === 'KeyW') dir = 'UP';
      else if (e.code === 'ArrowDown'  || e.code === 'KeyS') dir = 'DOWN';
      else if (e.code === 'ArrowLeft'  || e.code === 'KeyA') dir = 'LEFT';
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') dir = 'RIGHT';
      if (dir) net.send('input', { dir });
    });
  }

  togglePause() {
    const net = this.game.net;
    const state = net.latestState;
    if (!state) return;
    const myId = net.playerId;
    const me = myId ? state.players?.[myId] : null;
    const isLobby = Boolean(state.paused && state.reasonPaused === 'start');
    if (isLobby) { net.send('resume'); return; }
    if (me?.paused) net.send('resume');
    else net.send('pause');
  }

  // ----------------------------------------------------------------
  // Setup overlay — created ONCE, updated in-place
  // ----------------------------------------------------------------

  createSetupUI() {
    // White panel
    const bg = this.add.rectangle(0, 0, 720, 570, 0x000022, 0.96);
    bg.setStrokeStyle(2, 0x4444AA, 1);
    this.setupContainer.add(bg);

    // Room code
    this.setupRoomText = this.add.text(0, -238,
      'Room ????',
      { fontSize: '16px', color: '#888888', fontFamily: 'monospace' })
      .setOrigin(0.5);
    this.setupContainer.add(this.setupRoomText);

    // Title
    this.setupTitle = this.add.text(0, -210,
      'PACFRIENDS',
      { fontSize: '34px', color: '#FFFF00', fontStyle: 'bold', fontFamily: 'monospace' })
      .setOrigin(0.5);
    this.setupContainer.add(this.setupTitle);

    // ----- Color picker row -----
    this.setupContainer.add(
      this.add.text(-330, -162, 'Color:', { fontSize: '16px', color: '#AAAAFF', fontFamily: 'monospace' })
        .setOrigin(0, 0.5)
    );
    this.colorButtons = {};
    const colorDX = 80;
    const colorX0 = -200;
    PLAYER_COLORS.forEach((color, i) => {
      const bx = colorX0 + i * colorDX;
      const btn = this.add.rectangle(bx, -162, 60, 28, parseInt(color.replace('#', ''), 16), 1)
        .setStrokeStyle(2, 0x333333, 1)
        .setInteractive({ useHandCursor: true });
      btn._selected = false;
      btn._colorValue = color;
      btn.on('pointerdown', () => this.game.net.send('select_color', { color }));
      btn.on('pointerover', () => { if (!btn._selected) btn.setStrokeStyle(3, 0xFFFFFF, 1); });
      btn.on('pointerout',  () => { if (!btn._selected) btn.setStrokeStyle(2, 0x333333, 1); });
      this.setupContainer.add(btn);
      this.colorButtons[color] = btn;

      const lbl = this.add.text(bx, -143, COLOR_NAMES[i],
        { fontSize: '10px', color: '#888888', fontFamily: 'monospace' })
        .setOrigin(0.5, 0);
      this.setupContainer.add(lbl);
    });

    // ----- Decoration row -----
    this.setupContainer.add(
      this.add.text(-330, -105, 'Decoration:', { fontSize: '16px', color: '#AAAAFF', fontFamily: 'monospace' })
        .setOrigin(0, 0.5)
    );
    this.decButtons = {};
    const decDX = 110;
    const decX0 = -165;
    DECORATIONS.forEach((dec, i) => {
      const btn = this.addSetupButton(decX0 + i * decDX, -105, DEC_LABELS[i],
        () => this.game.net.send('select_decoration', { decoration: dec }));
      this.decButtons[dec] = btn;
    });

    // ----- Difficulty row -----
    this.setupContainer.add(
      this.add.text(-330, -55, 'Difficulty:', { fontSize: '16px', color: '#AAAAFF', fontFamily: 'monospace' })
        .setOrigin(0, 0.5)
    );
    this.diffButtons = {};
    const diffDX = 130;
    const diffX0 = -130;
    DIFFICULTIES.forEach((diff, i) => {
      const btn = this.addSetupButton(diffX0 + i * diffDX, -55, DIFF_LABELS[i],
        () => this.game.net.send('select_difficulty', { difficulty: diff }));
      this.diffButtons[diff] = btn;
    });

    // ----- Level row — arrow selector -----
    this.setupContainer.add(
      this.add.text(-330, -5, 'Level:', { fontSize: '16px', color: '#AAAAFF', fontFamily: 'monospace' })
        .setOrigin(0, 0.5)
    );
    this.addSetupButton(-160, -5, '◀', () => {
      const lv = Number(this.game.net?.latestState?.level ?? 1);
      this.game.net.send('select_level', { level: Math.max(1, lv - 1) });
    });
    this.addSetupButton(160, -5, '▶', () => {
      const lv = Number(this.game.net?.latestState?.level ?? 1);
      this.game.net.send('select_level', { level: Math.min(99, lv + 1) });
    });
    this.levelNumText = this.add.text(0, -5, '1',
      { fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold', fontFamily: 'monospace' })
      .setOrigin(0.5);
    this.setupContainer.add(this.levelNumText);

    // ----- Speed row -----
    this.setupContainer.add(
      this.add.text(-330, 45, 'Speed:', { fontSize: '16px', color: '#AAAAFF', fontFamily: 'monospace' })
        .setOrigin(0, 0.5)
    );
    this.speedButtons = {};
    SPEEDS.forEach((sp, i) => {
      const btn = this.addSetupButton(-130 + i * 130, 45, SPEED_LABELS[i],
        () => this.game.net.send('select_speed', { speed: sp }));
      this.speedButtons[sp] = btn;
    });

    // ----- Sounds row -----
    this.setupContainer.add(
      this.add.text(-330, 95, 'Sounds:', { fontSize: '16px', color: '#AAAAFF', fontFamily: 'monospace' })
        .setOrigin(0, 0.5)
    );
    this.soundButtons = {
      on:  this.addSetupButton(-60, 95, 'On',  () => this._sounds.setEnabled(true)),
      off: this.addSetupButton(60,  95, 'Off', () => this._sounds.setEnabled(false)),
    };

    // ----- Connected players display -----
    this.setupPlayersText = this.add.text(0, 145,
      '',
      { fontSize: '14px', color: '#CCCCCC', fontFamily: 'monospace', align: 'center' })
      .setOrigin(0.5);
    this.setupContainer.add(this.setupPlayersText);

    // ----- Help text -----
    this.setupHelp = this.add.text(0, 180,
      'Press Space or click Start to begin',
      { fontSize: '13px', color: '#666688', fontFamily: 'monospace' })
      .setOrigin(0.5);
    this.setupContainer.add(this.setupHelp);

    // ----- Action buttons -----
    this.startButton     = this.addSetupButton(-80, 220, 'Start',      () => this.game.net.send('resume'));
    this.continueButton  = this.addSetupButton( 80, 220, 'Continue',   () => this.game.net.send('resume'));
    this.nextLevelButton = this.addSetupButton(-80, 255, 'Next Level', () => this.game.net.send('next_level'));
    this.restartButton   = this.addSetupButton( 80, 255, 'Restart',    () => this.game.net.send('restart'));
  }

  addSetupButton(x, y, label, cb) {
    const btn = this.add.text(x, y, label, {
      fontSize: '16px',
      backgroundColor: UI_BTN_BG,
      color: UI_BTN_TEXT,
      padding: { x: 10, y: 5 },
      fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn._selected = false;
    btn.on('pointerover', () => { if (!btn._selected) btn.setBackgroundColor(UI_BTN_BG_HOVER); });
    btn.on('pointerout',  () => { if (!btn._selected) btn.setBackgroundColor(UI_BTN_BG); });
    btn.on('pointerdown', cb);
    this.setupContainer.add(btn);
    return btn;
  }

  updateSetupUI(state) {
    const net = this.game.net;
    const myId = net.playerId;
    const me = myId ? state.players?.[myId] : null;
    const isLobby = Boolean(state.paused && state.reasonPaused === 'start');
    const isPaused = Boolean(!isLobby && me?.paused);

    // Room code + title
    this.setupRoomText.setText(`Room ${net.roomId ?? '????'}`);
    this.setupTitle.setText(isLobby ? 'PACFRIENDS' : 'PAUSED');

    // Color buttons — mark selected
    for (const [color, btn] of Object.entries(this.colorButtons)) {
      const sel = Boolean(me && me.color === color);
      btn._selected = sel;
      btn.setStrokeStyle(sel ? 4 : 2, sel ? 0xFFFFFF : 0x333333, 1);
    }

    // Decoration buttons
    for (const [dec, btn] of Object.entries(this.decButtons)) {
      const sel = Boolean(me && me.decoration === dec);
      btn._selected = sel;
      btn.setBackgroundColor(sel ? UI_BTN_BG_SELECTED : UI_BTN_BG);
    }

    // Difficulty buttons
    for (const [diff, btn] of Object.entries(this.diffButtons)) {
      const sel = state.difficulty === diff;
      btn._selected = sel;
      btn.setBackgroundColor(sel ? UI_BTN_BG_SELECTED : UI_BTN_BG);
    }

    // Speed buttons
    for (const [sp, btn] of Object.entries(this.speedButtons)) {
      const sel = (state.speed ?? 'medium') === sp;
      btn._selected = sel;
      btn.setBackgroundColor(sel ? UI_BTN_BG_SELECTED : UI_BTN_BG);
    }

    // Level number display
    this.levelNumText.setText(String(state.level));

    // Sound buttons (sounds enabled state)
    const soundsOn = this._sounds?.enabled !== false;
    this.soundButtons.on._selected  = soundsOn;
    this.soundButtons.off._selected = !soundsOn;
    this.soundButtons.on.setBackgroundColor(soundsOn  ? UI_BTN_BG_SELECTED : UI_BTN_BG);
    this.soundButtons.off.setBackgroundColor(!soundsOn ? UI_BTN_BG_SELECTED : UI_BTN_BG);

    // Connected players summary
    const connectedPids = [1, 2, 3, 4].filter(id => state.players[id]?.connected);
    const playerSummary = connectedPids.map(id => {
      const p = state.players[id];
      const tag = id === myId ? `P${id}(you)` : `P${id}`;
      return tag;
    }).join('   ');
    this.setupPlayersText.setText(connectedPids.length ? `Players: ${playerSummary}` : 'Waiting for players...');

    // Show/hide action buttons based on game state
    const isEndLevel  = Boolean(state.paused && state.reasonPaused === 'levelcomplete');
    const isVictory2  = Boolean(state.paused && state.reasonPaused === 'victory');
    const isEndScreen = isEndLevel || isVictory2;
    this.startButton.setVisible(isLobby && !isEndScreen);
    this.continueButton.setVisible(isPaused && !isEndScreen);
    this.nextLevelButton.setVisible(isEndLevel);
    this.restartButton.setVisible(!isLobby || isEndScreen);

    // Help text
    if (isLobby) {
      this.setupHelp.setText('Choose settings, then press Start (solo ok)');
    } else if (isPaused) {
      this.setupHelp.setText('Press Space to continue');
    } else {
      this.setupHelp.setText('');
    }
  }

  // ----------------------------------------------------------------
  // Layout
  // ----------------------------------------------------------------

  computeLayout() {
    const W = this.scale?.width  || 800;
    const H = this.scale?.height || 600;
    const HUD_TOP = 46;
    const HUD_BOT = 46;
    const margin  = 4;

    const reserve = getTouchControlsReserve({
      enabled: this.touchControlsEnabled,
      margin: this.touchControlsMargin ?? 20,
    });

    const minBottomGap = this.touchControlsEnabled ? (TOUCH_KEY_H * TOUCH_GAP_MULT) : 0;

    let cellSize = 12;
    for (let i = 0; i < 2; i++) {
      const targetGap = this.touchControlsEnabled ? Math.max(minBottomGap, cellSize) : 0;
      const availW = Math.max(160, W - margin * 2);
      const availH = Math.max(160, H - margin * 2 - HUD_TOP - HUD_BOT - targetGap);
      cellSize = Math.max(8, Math.floor(Math.min(availW / GRID_W, availH / GRID_H)));
    }

    const mazeW = cellSize * GRID_W;
    const mazeH = cellSize * GRID_H;
    const targetGap = this.touchControlsEnabled ? Math.max(minBottomGap, cellSize) : 0;
    const bottomInset = Math.max(0, targetGap);

    let offsetX = Math.floor((W - mazeW) / 2);
    let offsetY = Math.floor(H - margin - HUD_BOT - bottomInset - mazeH);
    offsetY = Math.max(margin + HUD_TOP, offsetY);

    // Avoid overlap with touch controls corner
    if (this.touchControlsEnabled && reserve.w > 0 && reserve.h > 0) {
      const x1 = offsetX + mazeW;
      const y1 = offsetY + mazeH;
      const cx0 = W - reserve.w;
      const cy0 = H - reserve.h;
      if (x1 > cx0 && y1 > cy0) {
        const shiftLeft = x1 - cx0;
        const shiftUp   = y1 - cy0;
        if (shiftLeft < shiftUp) offsetX -= shiftLeft;
        else offsetY -= shiftUp;
        offsetX = Math.max(margin, Math.min(W - margin - mazeW, offsetX));
        offsetY = Math.max(margin + HUD_TOP, Math.min(H - margin - HUD_BOT - bottomInset - mazeH, offsetY));
      }
    }

    return { cellSize, offsetX, offsetY, mazeW, mazeH, sw: W, sh: H };
  }

  // ----------------------------------------------------------------
  // Main render (called on every state update from server)
  // ----------------------------------------------------------------

  renderState(state) {
    if (!state) return;
    this.graphics.clear();

    const myId = this.game.net.playerId;
    const me   = myId ? state.players?.[myId] : null;

    const isLobby    = Boolean(state.paused && state.reasonPaused === 'start');
    const isPaused   = Boolean(!isLobby && me?.paused);
    const isEndLevel = Boolean(state.paused && state.reasonPaused === 'levelcomplete');
    const isVictory  = Boolean(state.paused && state.reasonPaused === 'victory');
    const overlayVisible = isLobby || isPaused || isEndLevel || isVictory;
    const endReason = isEndLevel ? 'levelcomplete' : isVictory ? 'victory' : null;
    if (!this._prevEndReason && endReason) {
      this._startCelebration();
    }
    this._prevEndReason = endReason;

    let layout = this.computeLayout();
    if (this.ensureTouchControlsGap_(layout.cellSize)) {
      layout = this.computeLayout();
    }

    // HUD background bars
    this.graphics.fillStyle(0x000011, 1);
    this.graphics.fillRect(0, 0, layout.sw, 46);
    this.graphics.fillRect(0, layout.sh - 46, layout.sw, 46);

    // Draw game world
    drawMaze(this.graphics, state, layout);
    drawGhosts(this.graphics, state, layout);
    drawPlayers(this.graphics, state, layout);
    drawFruit(this.graphics, state, layout);
    drawPopups(this.graphics, state, layout);

    // Update HUD text
    this.scoreText.setText(`SCORE  ${String(state.score).padStart(6, '0')}`);
    const diff = state.difficulty ? state.difficulty.toUpperCase() : '';
    const spd  = state.speed      ? state.speed.toUpperCase()      : '';
    const topo = (state.topology && state.topology !== 'none') ? `  ${state.topology.toUpperCase()}` : '';
    this.levelDiffText.setText(`LEVEL ${state.level}   ${diff}   ${spd}${topo}`);
    this.dotsText.setText(`DOTS  ${state.dotsRemaining}`);

    // Lives + fruit in bottom bar
    this.livesGraphics.clear();
    let bx = 16;
    for (const pid of [1, 2, 3, 4]) {
      const p = state.players?.[pid];
      if (!p || !p.connected) continue;
      const color = parseInt((p.color || '#FFFF00').replace('#', ''), 16);
      for (let i = 0; i < p.lives; i++) {
        this.livesGraphics.fillStyle(color, 1);
        this.livesGraphics.slice(bx + i * 18, layout.sh - 23, 7, 0.4, Math.PI * 2 - 0.4, false);
        this.livesGraphics.fillPath();
      }
      bx += p.lives * 18 + 36;
    }
    const fruitEmoji = (state.fruitEaten || []).slice(-5).map(t =>
      ({ cherry: '🍒', strawberry: '🍓', orange: '🍊' }[t] ?? '🍒')).join('');
    this.fruitText.setText(fruitEmoji);

    // Center message for level complete / victory
    if (isEndLevel) {
      this.centerText.setText('⭐  LEVEL COMPLETE  ⭐\n\nScore: ' + state.score);
      this.centerText.setVisible(true);
    } else if (isVictory) {
      this.centerText.setText('🎉  YOU WIN!  🎉\n\nAll 99 levels cleared!\nFinal Score: ' + state.score);
      this.centerText.setVisible(true);
    } else {
      this.centerText.setVisible(false);
    }

    // Setup overlay
    if (overlayVisible) {
      this.setupContainer.setVisible(true);
      this.updateSetupUI(state);
    } else {
      this.setupContainer.setVisible(false);
    }

    // Sounds
    this._handleSounds(state);
  }

  // ----------------------------------------------------------------
  // Sound triggers
  // ----------------------------------------------------------------

  _startCelebration() {
    this._stopCelebration();
    this._sounds.playLevelComplete();

    const { width: W, height: H } = this.scale;
    const cx = W / 2;
    const cy = H / 2;
    const colors = [0xffd700, 0xff4466, 0x44ddff, 0x88ff44, 0xff8800, 0xcc44ff, 0xffffff];
    const count = 60;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 260;
      const size = 5 + Math.random() * 10;
      const color = colors[Math.floor(Math.random() * colors.length)];
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

    const flash = this.add.text(cx, cy - 30, '✦', {
      fontSize: '80px',
      color: '#ffd700',
      fontStyle: 'bold',
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

  _handleSounds(state) {
    const prev = this._prevDotsRemaining;
    if (prev !== null && state.dotsRemaining < prev) {
      this._sounds.playChomp();
    }
    this._prevDotsRemaining = state.dotsRemaining;

    const maxPowerTimer = Math.max(...[1, 2, 3, 4].map(id => state.players?.[id]?.powerTimer ?? 0));
    if (maxPowerTimer > this._prevMaxPowerTimer) {
      this._sounds.playPowerPellet();
    }
    this._prevMaxPowerTimer = maxPowerTimer;

    if (state.score > this._prevScore) {
      if (state.score - this._prevScore >= 200) {
        this._sounds.playGhostEat();
      }
    }
    this._prevScore = state.score;
  }
}
