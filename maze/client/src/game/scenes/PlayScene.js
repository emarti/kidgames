import Phaser from 'phaser';
import { drawAvatarPixels, listAvatars } from '../avatars.js';
import { createTouchControls, getTouchControlsReserve, isTouchDevice } from '@games/touch-controls';
import * as sfx from '../audio/sfx.js';

const UI_BTN_BG = '#777777';
const UI_BTN_BG_HOVER = '#888888';
const UI_BTN_BG_SELECTED = '#000000';
const UI_BTN_TEXT = '#FFFFFF';

const EMOJI_APPLE = '🍎';
const EMOJI_TREASURE = '🧰';
const EMOJI_BATTERY = '🔋';
const EMOJI_MINOTAUR = '�';
// Note: 🦆 is typically a mallard emoji; we draw a rubber duck icon instead.

const WALL_N = 1;
const WALL_E = 2;
const WALL_S = 4;
const WALL_W = 8;

// Touch-controls default key height (used as a "one button" baseline).
const TOUCH_KEY_H = 54;
const TOUCH_GAP_MULT = 2;

export default class PlayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PlayScene' });
  }

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

  drawTreasureChest(graphics, cx, cy, size) {
    const s = size;
    const outline = 0x000000;
    const gold = 0xf2c94c;
    const goldDark = 0xd4a017;
    const goldLight = 0xfff3b0;
    const wood = 0xb7791f;
    const woodDark = 0x8b5e15;

    const w = s * 0.62;
    const h = s * 0.46;
    const x0 = cx - w / 2;
    const y0 = cy - h / 2;

    const lidH = Math.max(3, Math.floor(h * 0.42));
    const baseH = Math.max(3, Math.floor(h - lidH));

    graphics.lineStyle(Math.max(1, Math.floor(s * 0.06)), outline, 1);

    // Lid (gold)
    graphics.fillStyle(gold, 1);
    graphics.fillRect(x0, y0, w, lidH);
    graphics.strokeRect(x0, y0, w, lidH);

    // Lid highlight
    graphics.fillStyle(goldLight, 1);
    graphics.fillRect(x0 + 2, y0 + 2, Math.max(2, Math.floor(w * 0.55)), Math.max(1, Math.floor(lidH * 0.25)));

    // Base (wood)
    graphics.fillStyle(wood, 1);
    graphics.fillRect(x0, y0 + lidH, w, baseH);
    graphics.strokeRect(x0, y0 + lidH, w, baseH);

    // Bands
    graphics.fillStyle(goldDark, 1);
    const bandW = Math.max(2, Math.floor(w * 0.10));
    graphics.fillRect(x0 + w * 0.18, y0, bandW, h);
    graphics.fillRect(x0 + w * 0.72, y0, bandW, h);

    // Base shading
    graphics.fillStyle(woodDark, 1);
    graphics.fillRect(x0 + 1, y0 + lidH + Math.floor(baseH * 0.62), w - 2, Math.max(1, Math.floor(baseH * 0.18)));

    // Lock plate + keyhole
    const plateW = Math.max(3, Math.floor(w * 0.18));
    const plateH = Math.max(4, Math.floor(h * 0.24));
    const px = Math.floor(cx - plateW / 2);
    const py = Math.floor(y0 + lidH - plateH / 2);
    graphics.fillStyle(gold, 1);
    graphics.fillRect(px, py, plateW, plateH);
    graphics.lineStyle(Math.max(1, Math.floor(s * 0.03)), outline, 1);
    graphics.strokeRect(px, py, plateW, plateH);
    graphics.fillStyle(outline, 1);
    const khR = Math.max(1, Math.floor(plateW * 0.22));
    graphics.fillCircle(Math.floor(px + plateW / 2), Math.floor(py + plateH / 2 - khR * 0.3), khR);
    graphics.fillRect(Math.floor(px + plateW / 2 - 1), Math.floor(py + plateH / 2), 2, Math.max(2, Math.floor(plateH * 0.35)));

    // Treasure coins peeking out
    graphics.fillStyle(goldLight, 1);
    const coinR = Math.max(1, Math.floor(s * 0.05));
    graphics.fillCircle(cx + w * 0.18, y0 + lidH - coinR * 1.1, coinR);
    graphics.fillCircle(cx + w * 0.05, y0 + lidH - coinR * 0.8, coinR);
    graphics.fillCircle(cx - w * 0.08, y0 + lidH - coinR * 1.0, coinR);
  }

  updateHudSlotsRightToLeft(slots, maxSlots, target, collected) {
    const t = Math.max(0, Math.min(maxSlots, Number(target ?? 0)));
    const c = Math.max(0, Math.min(t, Number(collected ?? 0)));
    const start = maxSlots - t;
    const fillStart = maxSlots - c;

    for (let i = 0; i < maxSlots; i++) {
      const slot = slots[i];
      if (!slot) continue;
      const visible = i >= start;
      slot.setVisible(visible);
      if (!visible) continue;
      slot.setAlpha(i >= fillStart ? 1 : 0.22);
    }
  }

  drawRubberDuck(graphics, cx, cy, size) {
    const s = size;
    const bodyW = s * 0.52;
    const bodyH = s * 0.34;
    const headR = s * 0.14;

    graphics.lineStyle(Math.max(1, Math.floor(s * 0.06)), 0x000000, 1);

    // Body
    graphics.fillStyle(0xffd54a, 1);
    graphics.fillEllipse(cx, cy + s * 0.06, bodyW, bodyH);
    graphics.strokeEllipse(cx, cy + s * 0.06, bodyW, bodyH);

    // Head
    graphics.fillCircle(cx - s * 0.12, cy - s * 0.10, headR);
    graphics.strokeCircle(cx - s * 0.12, cy - s * 0.10, headR);

    // Beak
    graphics.fillStyle(0xff8a00, 1);
    const bx = cx - s * 0.22;
    const by = cy - s * 0.10;
    graphics.fillTriangle(
      bx, by,
      bx - s * 0.12, by + s * 0.06,
      bx, by + s * 0.12,
    );
    graphics.lineStyle(Math.max(1, Math.floor(s * 0.03)), 0x000000, 1);
    graphics.strokeTriangle(
      bx, by,
      bx - s * 0.12, by + s * 0.06,
      bx, by + s * 0.12,
    );

    // Eye
    graphics.fillStyle(0x000000, 1);
    graphics.fillCircle(cx - s * 0.16, cy - s * 0.14, Math.max(1, s * 0.03));

    // Small highlight
    graphics.fillStyle(0xffffff, 0.6);
    graphics.fillEllipse(cx + s * 0.08, cy + s * 0.00, s * 0.16, s * 0.10);
  }

  formatLevel2(level) {
    const n = Number(level);
    if (!Number.isFinite(n) || n <= 0) return '01';
    // UI is intentionally 2 digits; keep it readable even if the real level is larger.
    const clamped = Math.max(1, Math.min(99, Math.floor(n)));
    return String(clamped).padStart(2, '0');
  }

  setLevelInputText() {
    if (!this.levelInputText) return;
    const raw = String(this.levelInput || '');
    const padded = (raw + '__').slice(0, 2);
    this.levelInputText.setText(padded);
  }

  commitLevelInput() {
    const raw = String(this.levelInput || '').replace(/[^0-9]/g, '').slice(0, 2);
    if (raw.length === 0) return;
    const n = Math.max(1, Math.min(99, parseInt(raw, 10)));
    this.game.net.send('select_level', { level: n });
  }

  create() {
    this.graphics = this.add.graphics();

    // Lightweight goal fireworks (client-only FX)
    this.fxGraphics = this.add.graphics();
    this.fxGraphics.setDepth(90);
    this._fxParticles = [];
    this._lastMessageForFx = '';

    this.uiText = this.add.text(10, 10, '', { fontSize: '16px', color: '#000' });
    this.centerText = this.add
      .text(400, 300, '', { fontSize: '30px', color: '#000', backgroundColor: '#FFFFFFAA' })
      .setOrigin(0.5);
    this.centerText.setDepth(100);

    this.goalStar = this.add.text(0, 0, '★', { fontSize: '18px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5);
    this.goalStar.setDepth(50);

    this.setupContainer = this.add.container(400, 300);
    this.createSetupUI();
    this.setupContainer.setVisible(false);
    this.setupContainer.setDepth(500);

    // Audio unlock (iOS Safari): only attempt to unlock when sounds are enabled.
    const maybeUnlockAudio = () => {
      if (!sfx.getEnabled()) return;
      sfx.ensureUnlocked().then((unlocked) => {
        if (unlocked) {
          this.input.off('pointerdown', maybeUnlockAudio);
          this.input.keyboard?.off('keydown', maybeUnlockAudio);
        }
      });
    };
    this.input.on('pointerdown', maybeUnlockAudio);
    this.input.keyboard?.on('keydown', maybeUnlockAudio);
    this.events.once('shutdown', () => {
      this.input.off('pointerdown', maybeUnlockAudio);
      this.input.keyboard?.off('keydown', maybeUnlockAudio);
    });

    // Keep fixed UI centered on resize (important on phones/tablets)
    const positionFixedUI = () => {
      const W = this.scale?.width || 800;
      const H = this.scale?.height || 600;
      this.centerText.setPosition(W / 2, H / 2);
      this.setupContainer.setPosition(W / 2, H / 2);
    };
    positionFixedUI();
    this.scale.on('resize', positionFixedUI);
    this.events.once('shutdown', () => this.scale.off('resize', positionFixedUI));

    this.setupInput();

    // Level input (pause/setup UI): allow typing digits to jump levels.
    this.levelInput = '';
    this.levelInputActive = false;
    this.input.keyboard.on('keydown', (event) => {
      if (!this.levelInputActive) return;
      const state = this.game.net?.latestState;
      if (!state) return;

      const myId = this.game.net?.playerId;
      const me = myId ? state.players?.[myId] : null;
      const overlayVisible = Boolean((state.paused && state.reasonPaused === 'start') || me?.paused);
      if (!overlayVisible) return;

      if (event.keyCode === 8) {
        // Backspace
        if (this.levelInput.length > 0) this.levelInput = this.levelInput.slice(0, -1);
        this.setLevelInputText();
        return;
      }

      if (event.key === 'Enter') {
        this.commitLevelInput();
        this.levelInputActive = false;
        if (this.levelInputBox) this.levelInputBox.setFillStyle(0xdddddd, 1);
        return;
      }

      if (event.key.length === 1 && /[0-9]/.test(event.key)) {
        if (this.levelInput.length < 2) {
          this.levelInput += event.key;
          this.setLevelInputText();
        }
        if (this.levelInput.length >= 2) {
          this.commitLevelInput();
          this.levelInputActive = false;
          if (this.levelInputBox) this.levelInputBox.setFillStyle(0xdddddd, 1);
        }
      }
    });

    // Touch controls (D-pad + pause) for tablets/phones (shared with Snake)
    this.touchControlsEnabled = isTouchDevice();
    if (this.touchControlsEnabled) {
      // Start with a one-button-tall gap; may be increased once we know cellSize.
      this.touchControlsMargin = TOUCH_KEY_H * TOUCH_GAP_MULT;
      this.createTouchControls_();
    }

    this.onState = (e) => this.renderState(e.detail);
    this.game.net.addEventListener('state', this.onState);

    if (this.game.net.latestState) {
      this.renderState(this.game.net.latestState);
    }
  }

  setupInput() {
    window.focus();

    this.input.keyboard.on('keydown', (event) => {
      if (event.repeat) return;
      const net = this.game.net;
      const state = net.latestState;
      if (!state) return;

      // Pause toggle (Space / P)
      if (event.code === 'Space' || event.code === 'KeyP') {
        this.togglePause();
        return;
      }

      // Movement
      let dir = null;
      if (event.code === 'ArrowUp' || event.code === 'KeyW') dir = 'UP';
      else if (event.code === 'ArrowDown' || event.code === 'KeyS') dir = 'DOWN';
      else if (event.code === 'ArrowLeft' || event.code === 'KeyA') dir = 'LEFT';
      else if (event.code === 'ArrowRight' || event.code === 'KeyD') dir = 'RIGHT';

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
    if (isLobby) {
      net.send('resume');
      return;
    }

    if (me?.paused) net.send('resume');
    else net.send('pause');
  }

  createSetupUI() {
    const bg = this.add.rectangle(0, 0, 740, 480, 0xFFFFFF, 0.95);
    this.setupContainer.add(bg);

    this.setupTitle = this.add.text(0, -210, 'GAME SETUP', { fontSize: '32px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5);
    this.setupContainer.add(this.setupTitle);

    const visionY = -170;
    this.setupContainer.add(this.add.text(-300, visionY, 'Vision:', { fontSize: '18px', color: '#000' }).setOrigin(0, 0.5));
    this.visionButtons = {
      fog: this.addSetupButton(-120, visionY, 'Fog', () => this.game.net.send('select_vision_mode', { mode: 'fog' })),
      glass: this.addSetupButton(40, visionY, 'Glass Walls', () => this.game.net.send('select_vision_mode', { mode: 'glass' })),
    };

    this.restartButton = this.addSetupButton(180, visionY, 'Restart', () => this.game.net.send('restart'));

    // Sounds toggle (client-only preference)
    const soundsY = -125;
    this.setupContainer.add(this.add.text(-300, soundsY, 'Sounds:', { fontSize: '18px', color: '#000' }).setOrigin(0, 0.5));
    this.soundButtons = {
      off: this.addSetupButton(-120, soundsY, 'Off', () => sfx.setEnabled(false)),
      on: this.addSetupButton(40, soundsY, 'On', () => {
        sfx.setEnabled(true);
        // Unlock immediately on the same user gesture.
        void sfx.ensureUnlocked();
      }),
    };

    // Debug: 2-digit level selector (placed under Color)
    const levelY = 35;
    this.setupContainer.add(this.add.text(-300, levelY, 'Level:', { fontSize: '18px', color: '#000' }).setOrigin(0, 0.5));
    this.addSetupButton(-210, levelY, '-', () => {
      const level = Number(this.game.net?.latestState?.level ?? 1);
      const next = Math.max(1, Math.min(99, level - 1));
      this.game.net.send('select_level', { level: next });
      if (this.levelInputText && !this.levelInputActive) this.levelInputText.setText(this.formatLevel2(next));
    });
    this.addSetupButton(-30, levelY, '+', () => {
      const level = Number(this.game.net?.latestState?.level ?? 1);
      const next = Math.max(1, Math.min(99, level + 1));
      this.game.net.send('select_level', { level: next });
      if (this.levelInputText && !this.levelInputActive) this.levelInputText.setText(this.formatLevel2(next));
    });

    this.levelInputBox = this.add.rectangle(-120, levelY, 70, 34, 0xdddddd, 1).setOrigin(0.5);
    this.levelInputBox.setStrokeStyle(2, 0x222222, 1);
    this.levelInputBox.setInteractive({ useHandCursor: true });
    this.levelInputText = this.add.text(-120, levelY, '__', { fontSize: '22px', color: '#111', fontStyle: 'bold' }).setOrigin(0.5);
    this.setupContainer.add(this.levelInputBox);
    this.setupContainer.add(this.levelInputText);
    this.levelInputBox.on('pointerdown', () => {
      const state = this.game.net?.latestState;
      this.levelInput = this.formatLevel2(state?.level ?? 1);
      this.setLevelInputText();
      this.levelInputActive = true;
      this.levelInputBox.setFillStyle(0xffffff, 1);
    });

    // Character + color selection (like Snake, but simplified)
    const characterY = -65;
    this.setupContainer.add(this.add.text(-300, characterY, 'Character:', { fontSize: '18px', color: '#000' }).setOrigin(0, 0.5));
    this.avatarButtons = {};
    const avatars = listAvatars();
    const avatarX0 = -120;
    const avatarY = characterY;
    const avatarDX = 66;
    avatars.forEach((a, i) => {
      this.avatarButtons[a] = this.addAvatarButton(avatarX0 + i * avatarDX, avatarY, a, () => this.game.net.send('select_avatar', { avatar: a }));
    });

    const colorY = -10;
    this.setupContainer.add(this.add.text(-300, colorY, 'Color:', { fontSize: '18px', color: '#000' }).setOrigin(0, 0.5));
    this.colorButtons = {};
    this.availableColors = ['#2ecc71', '#3498db', '#e67e22', '#9b59b6', '#e74c3c', '#111111'];
    const colorX0 = -120;
    const colorDX = 70;
    this.availableColors.forEach((c, i) => {
      const btn = this.addSetupButton(colorX0 + i * colorDX, colorY, ' ', () => this.game.net.send('select_color', { color: c }));
      btn._colorValue = c;
      btn.setBackgroundColor(c);
      btn.setText('   ');
      this.colorButtons[c] = btn;
    });

    this.setupHelp = this.add.text(0, 130, '', { fontSize: '20px', color: '#000' }).setOrigin(0.5);
    this.setupContainer.add(this.setupHelp);

    this.startButton = this.addSetupButton(-90, 180, 'Start', () => this.game.net.send('resume'));
    this.continueButton = this.addSetupButton(90, 180, 'Continue', () => this.game.net.send('resume'));
  }

  addSetupButton(x, y, label, cb) {
    const btn = this.add
      .text(x, y, label, { fontSize: '18px', backgroundColor: UI_BTN_BG, color: UI_BTN_TEXT, padding: { x: 10, y: 5 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    btn._selected = false;

    btn.on('pointerover', () => {
      if (!btn._selected) btn.setBackgroundColor(UI_BTN_BG_HOVER);
    });
    btn.on('pointerout', () => {
      if (!btn._selected) btn.setBackgroundColor(UI_BTN_BG);
    });

    btn.on('pointerdown', cb);
    this.setupContainer.add(btn);
    return btn;
  }

  addAvatarButton(x, y, avatarName, cb) {
    const bg = this.add.rectangle(x, y, 52, 40, 0x777777, 1).setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true });

    const icon = this.add.graphics();
    icon.setPosition(x, y);
    icon.clear();
    drawAvatarPixels(icon, 0, 0, 34, avatarName, '#111111');

    bg._selected = false;
    bg._avatarName = avatarName;
    bg._icon = icon;

    bg.on('pointerover', () => {
      if (!bg._selected) bg.setFillStyle(0x888888, 1);
    });
    bg.on('pointerout', () => {
      if (!bg._selected) bg.setFillStyle(0x777777, 1);
    });
    bg.on('pointerdown', cb);

    this.setupContainer.add(bg);
    this.setupContainer.add(icon);

    return bg;
  }

  hasWall(mask, bit) {
    return (mask & bit) !== 0;
  }

  computeLayout(state) {
    const W = this.scale?.width || 800;
    const H = this.scale?.height || 600;
    // Slightly tighter margins so the playfield can be bigger.
    const margin = 8;

    const reserve = getTouchControlsReserve({ enabled: this.touchControlsEnabled, margin: this.touchControlsMargin ?? 20 });
    // Reserve less top space so the maze can be larger.
    // (Still keeps the top-left info text and objective HUD from overlapping the first row.)
    const hudTop = Math.max(22, Math.min(34, Math.floor(H * 0.06)));

    // Compute the biggest possible maze area for the screen, leaving a bottom
    // "unused" band (for safety + for the D-pad to sit above).
    const availableW = Math.max(160, W - (margin * 2));

    const minBottomGapPx = this.touchControlsEnabled ? (TOUCH_KEY_H * TOUCH_GAP_MULT) : 0;

    // Two-pass solve because the bottom gap depends on cellSize when we want
    // "one row" (cellSize) on desktop.
    let cellSize = 16;
    for (let i = 0; i < 2; i++) {
      const targetGapPx = this.touchControlsEnabled
        ? Math.max(minBottomGapPx, cellSize)
        : cellSize;

      const availableH = Math.max(160, H - (margin * 2) - hudTop - targetGapPx);
      cellSize = Math.max(12, Math.floor(Math.min(availableW / state.w, availableH / state.h)));
    }
    const gridPxW = state.w * cellSize;
    const gridPxH = state.h * cellSize;

    // "One row" means: the maze row height OR (on touch) about the button height.
    // With touch controls, we intentionally align the maze bottom to the D-pad bottom
    // baseline: (H - touchControlsMargin).
    const targetGapPx = this.touchControlsEnabled
      ? Math.max(minBottomGapPx, cellSize)
      : cellSize;

    // We subtract the margin because offsetY also includes `- margin`.
    const bottomInset = Math.max(0, targetGapPx - margin);

    let offsetX = Math.floor(margin + (availableW - gridPxW) / 2);
    let offsetY = Math.floor(H - margin - bottomInset - gridPxH);
    offsetY = Math.max(margin + hudTop, offsetY);

    // If the centered maze would overlap the reserved bottom-right corner,
    // shift either left or up by the minimal amount.
    if (this.touchControlsEnabled && reserve.w > 0 && reserve.h > 0) {
      const playX0 = offsetX;
      const playY0 = offsetY;
      const playX1 = playX0 + gridPxW;
      const playY1 = playY0 + gridPxH;

      const cornerX0 = W - reserve.w;
      const cornerY0 = H - reserve.h;

      const overlapsCorner = (playX1 > cornerX0) && (playY1 > cornerY0);
      if (overlapsCorner) {
        const shiftLeft = playX1 - cornerX0;
        const shiftUp = playY1 - cornerY0;
        if (shiftLeft < shiftUp) offsetX -= shiftLeft;
        else offsetY -= shiftUp;

        offsetX = Math.max(margin, Math.min(W - margin - gridPxW, offsetX));
        offsetY = Math.max(margin + hudTop, Math.min(H - margin - bottomInset - gridPxH, offsetY));
      }
    }

    return { cellSize, offsetX, offsetY };
  }

  cellRect(layout, x, y) {
    const x0 = layout.offsetX + x * layout.cellSize;
    const y0 = layout.offsetY + y * layout.cellSize;
    return { x0, y0, x1: x0 + layout.cellSize, y1: y0 + layout.cellSize };
  }

  cellCenter(layout, x, y) {
    const r = this.cellRect(layout, x, y);
    return { cx: Math.round((r.x0 + r.x1) / 2), cy: Math.round((r.y0 + r.y1) / 2) };
  }

  updateSetupUI(state) {
    const net = this.game.net;
    const myId = net.playerId;
    const me = myId ? state.players?.[myId] : null;

    const isLobby = Boolean(state.paused && state.reasonPaused === 'start');
    const isPaused = Boolean(!isLobby && me?.paused);
    const overlayVisible = isLobby || isPaused;

    this.setupTitle.setText(isLobby ? 'GAME SETUP' : 'PAUSED');

    this.startButton.setVisible(isLobby);
    this.continueButton.setVisible(!isLobby);

    for (const [key, btn] of Object.entries(this.visionButtons)) {
      const selected = state.visionMode === key;
      btn._selected = selected;
      btn.setBackgroundColor(selected ? UI_BTN_BG_SELECTED : UI_BTN_BG);
      btn.setColor(UI_BTN_TEXT);
    }

    if (this.soundButtons) {
      const enabled = sfx.getEnabled();
      const onSelected = Boolean(enabled);
      const offSelected = !onSelected;
      this.soundButtons.on._selected = onSelected;
      this.soundButtons.off._selected = offSelected;
      this.soundButtons.on.setBackgroundColor(onSelected ? UI_BTN_BG_SELECTED : UI_BTN_BG);
      this.soundButtons.off.setBackgroundColor(offSelected ? UI_BTN_BG_SELECTED : UI_BTN_BG);
      this.soundButtons.on.setColor(UI_BTN_TEXT);
      this.soundButtons.off.setColor(UI_BTN_TEXT);
    }

    // Keep the 2-digit level display synced to server state unless actively editing.
    if (this.levelInputText && !this.levelInputActive) {
      this.levelInputText.setText(this.formatLevel2(state.level));
    }
    if (!overlayVisible && this.levelInputActive) {
      this.levelInputActive = false;
      if (this.levelInputBox) this.levelInputBox.setFillStyle(0xdddddd, 1);
    }

    if (me) {
      // Avatar selection
      for (const [a, btn] of Object.entries(this.avatarButtons || {})) {
        const myAvatar = me.avatar === 'archer' ? 'kid' : me.avatar;
        const selected = myAvatar === a;
        btn._selected = selected;
        btn.setFillStyle(selected ? 0x000000 : 0x777777, 1);
        if (btn._icon) {
          btn._icon.clear();
          drawAvatarPixels(btn._icon, 0, 0, 34, a, me.color || '#111111');
        }
      }

      // Color selection
      for (const [c, btn] of Object.entries(this.colorButtons || {})) {
        const selected = (me.color || '').toLowerCase() === c.toLowerCase();
        btn._selected = selected;
        btn.setBackgroundColor(btn._colorValue);
        // Add an outline effect by toggling text/background contrast
        btn.setColor(selected ? '#ffffff' : '#ffffff');
        btn.setAlpha(selected ? 1 : 0.7);
      }
    }

    let help = '';
    if (isLobby) {
      help = 'Press Start (solo ok). Joiners can enter anytime.';
    } else if (isPaused) {
      help = 'Press Space to continue.';
    }

    // If player is paused, the title already indicates it.
    if (me && me.paused && !isLobby) help = '';

    this.setupHelp.setText(help);
  }

  renderState(state) {
    this.game.net.latestState = state;
    this.graphics.clear();

    // FX gets its own redraw loop; keep it around between state packets.

    const myId = this.game.net?.playerId;
    const me = myId ? state.players?.[myId] : null;
    const overlayVisible = Boolean((state.paused && state.reasonPaused === 'start') || me?.paused);
    this._overlayVisible = overlayVisible;

    let layout = this.computeLayout(state);
    if (this.ensureTouchControlsGap_(layout.cellSize)) {
      layout = this.computeLayout(state);
    }

    // Pickup SFX (client-only): detect counter deltas.
    const applesCollected = Number(state.applesCollected ?? 0);
    const treasuresCollected = Number(state.treasuresCollected ?? 0);
    const batteriesCollected = Number(state.batteriesCollected ?? 0);
    const funniesCollected = Number(state.funniesCollected ?? 0);
    if (!this._prevCollectCounts) {
      this._prevCollectCounts = { applesCollected, treasuresCollected, batteriesCollected, funniesCollected };
    } else {
      if (applesCollected > this._prevCollectCounts.applesCollected) sfx.playChomp();
      if (treasuresCollected > this._prevCollectCounts.treasuresCollected) sfx.playChink();
      if (batteriesCollected > this._prevCollectCounts.batteriesCollected) sfx.playZap();
      if (funniesCollected > this._prevCollectCounts.funniesCollected) sfx.playQuack();
      this._prevCollectCounts = { applesCollected, treasuresCollected, batteriesCollected, funniesCollected };
    }

    // Trigger a small fireworks burst once when the server announces a level-up.
    // We anchor to the goal tile(s) so it appears around the winner.
    const msg = String(state.message || '');
    if (this.isLevelUpMessage_(msg) && msg !== this._lastMessageForFx) {
      this.spawnGoalFireworks_(layout, state);
      sfx.playTrumpet();
    }
    // Minotaur hit sound effect.
    if (msg.includes('Minotaur') && msg !== this._lastMessageForFx) {
      sfx.playUhOh();
    }

    // Minotaur hit animation (once per server-scheduled reset).
    const minoResetAt = state._minoResetAt ?? null;
    if (minoResetAt != null && minoResetAt !== this._lastMinoResetAtForFx) {
      this.spawnMinotaurHitFx_(layout, state);
      this._lastMinoResetAtForFx = minoResetAt;
    }
    this._lastMessageForFx = msg;

    const revealedSet = new Set(state.revealed || []);
    const isRevealed = (x, y) => revealedSet.has(y * state.w + x);

    const players = [1, 2, 3, 4]
      .map((id) => state.players?.[id])
      .filter((p) => p && p.connected);

    let info = `Room: ${this.game.net.roomId || ''}\nLevel: ${state.level}\nMode: ${state.visionMode}`;
    info += `\nPlayers: ${players.length}/4`;
    this.uiText.setText(info);

    if (state.visionMode === 'glass') {
      this.graphics.fillStyle(0xffffff, 1);
      this.graphics.fillRect(0, 0, this.scale.width, this.scale.height);
      this.drawFullMaze(layout, state);
      this.drawGoal(layout, state, true);
      this.drawApples(layout, state, true);
      this.drawTreasures(layout, state, true);
      this.drawBatteries(layout, state, true);
      this.drawFunnies(layout, state, true);
      this.drawMinotaurs(layout, state, true);
    } else {
      // Fog
      this.graphics.fillStyle(0x000000, 1);
      this.graphics.fillRect(0, 0, this.scale.width, this.scale.height);
      this.drawFogReveal(layout, state, isRevealed);
      this.drawGoal(layout, state, isRevealed(state.goal.x, state.goal.y));
      this.drawApples(layout, state, false, isRevealed);
      this.drawTreasures(layout, state, false, isRevealed);
      this.drawBatteries(layout, state, false, isRevealed);
      this.drawFunnies(layout, state, false, isRevealed);
      this.drawMinotaurs(layout, state, false, isRevealed);
    }

    this.drawTrails(layout, state);
    this.drawPlayers(layout, state);
    this.drawObjectiveHud(state);

    if (overlayVisible) {
      this.setupContainer.setVisible(true);
      this.updateSetupUI(state);
      this.centerText.setText('');
    } else {
      this.setupContainer.setVisible(false);
      this.centerText.setText('');
    }

    if (state._minoResetAt != null) {
      const msLeft = Math.max(0, Number(state._minoResetAt) - Date.now());
      const secLeft = Math.max(1, Math.ceil(msLeft / 1000));
      this.centerText.setText(`⚠️ Uh-oh... resetting in ${secLeft}s`);
    } else if (state.message) {
      this.centerText.setText(state.message);
    }
  }

  update(time, delta) {
    if (!this.fxGraphics) return;
    this.stepAndRenderFx_(time, delta);
  }

  isLevelUpMessage_(msg) {
    return /\bLevel up\b/i.test(String(msg || ''));
  }

  spawnGoalFireworks_(layout, state) {
    if (!layout || !state?.goal) return;
    const goalX = state.goal.x;
    const goalY = state.goal.y;
    const winners = [1, 2, 3, 4]
      .map((pid) => state.players?.[pid])
      .filter((p) => p && p.connected && p.x === goalX && p.y === goalY);

    if (winners.length === 0) return;

    for (const p of winners) {
      const { cx, cy } = this.cellCenter(layout, p.x, p.y);
      this.spawnFireworksAt_(cx, cy, layout.cellSize);
    }
  }

  spawnFireworksAt_(cx, cy, cellSize) {
    // Roughly 3 seconds total, with a few staggered mini-bursts.
    const size = Math.max(16, Math.floor(cellSize * 1.25));

    // Spread bursts around the avatar so it feels like a bloom.
    const bloomR = Math.max(6, Math.floor(size * 0.22));

    const scheduleMs = [0, 220, 460, 740, 1020, 1320, 1620, 1950, 2300, 2650];
    for (const t of scheduleMs) {
      const intensity = t === 0 ? 1.0 : (t < 1000 ? 0.85 : 0.7);
      this.time.delayedCall(t, () => {
        // Slight upward bias so it reads "celebration" instead of "dust".
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * bloomR;
        const dx = Math.cos(a) * r;
        const dy = Math.sin(a) * r - r * 0.25;
        this.spawnBurst_(cx + dx, cy + dy, size, intensity);
      });
    }
  }

  spawnBurst_(cx, cy, size, intensity) {
    const now = this.time?.now ?? performance.now();
    const count = Math.max(10, Math.floor(18 * intensity));
    const baseSpeed = Math.max(26, size) * 0.0033; // px/ms
    const colors = [0xff3b30, 0xff9500, 0xffcc00, 0x34c759, 0x0a84ff, 0xbf5af2];

    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = baseSpeed * (0.6 + Math.random() * 0.9);
      // Keep the overall effect within ~3s even with late bursts.
      const life = 700 + Math.random() * 550;
      const r = Math.max(1.4, size * (0.05 + Math.random() * 0.035));

      this._fxParticles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        g: 0.00018 * (0.8 + Math.random() * 0.6),
        born: now,
        life,
        r,
        color: colors[i % colors.length],
      });
    }
  }

  spawnMinotaurHitFx_(layout, state) {
    const hit = state?._minoHit;
    const mino = (state?.minotaurs && state.minotaurs[0]) ? state.minotaurs[0] : null;
    const x = hit?.x ?? mino?.x;
    const y = hit?.y ?? mino?.y;
    if (x == null || y == null) return;

    const { cx, cy } = this.cellCenter(layout, x, y);
    const size = Math.max(18, Math.floor(layout.cellSize * 1.3));

    // A few red/orange bursts (less celebratory than goal fireworks).
    const scheduleMs = [0, 180, 380, 650, 900, 1250];
    for (const t of scheduleMs) {
      this.time.delayedCall(t, () => {
        this.spawnMinotaurBurst_(cx, cy, size, 0.95);
      });
    }

    // Tiny camera shake, but only if the camera exists.
    try {
      this.cameras?.main?.shake?.(220, 0.006);
    } catch {
      // ignore
    }
  }

  spawnMinotaurBurst_(cx, cy, size, intensity) {
    const now = this.time?.now ?? performance.now();
    const count = Math.max(10, Math.floor(14 * intensity));
    const baseSpeed = Math.max(26, size) * 0.0030; // px/ms
    const colors = [0xff3b30, 0xff9500, 0x5a3a1d, 0x8b5a2b];

    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = baseSpeed * (0.55 + Math.random() * 0.9);
      const life = 520 + Math.random() * 420;
      const r = Math.max(1.4, size * (0.05 + Math.random() * 0.03));

      this._fxParticles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        g: 0.00022 * (0.8 + Math.random() * 0.6),
        born: now,
        life,
        r,
        color: colors[i % colors.length],
      });
    }
  }

  stepAndRenderFx_(now, delta) {
    const dt = Math.max(0, Math.min(50, Number(delta) || 0));
    this.fxGraphics.clear();

    if (!this._fxParticles || this._fxParticles.length === 0) return;

    const next = [];
    for (const p of this._fxParticles) {
      const age = now - p.born;
      if (age >= p.life) continue;

      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const t = Math.min(1, Math.max(0, age / p.life));
      const alpha = (1 - t) * 0.9;
      const radius = Math.max(0.8, p.r * (1 - t * 0.35));

      this.fxGraphics.fillStyle(p.color, alpha);
      this.fxGraphics.fillCircle(p.x, p.y, radius);

      next.push(p);
    }

    this._fxParticles = next;
  }

  drawFullMaze(layout, state) {
    const wallW = 2.5;
    this.graphics.lineStyle(wallW, 0x000000, 1);

    for (let y = 0; y < state.h; y++) {
      for (let x = 0; x < state.w; x++) {
        const mask = state.walls[y][x];
        const { x0, y0, x1, y1 } = this.cellRect(layout, x, y);

        if (this.hasWall(mask, WALL_N)) this.graphics.lineBetween(x0, y0, x1, y0);
        if (this.hasWall(mask, WALL_W)) this.graphics.lineBetween(x0, y0, x0, y1);

        if (this.hasWall(mask, WALL_E) && x === state.w - 1) this.graphics.lineBetween(x1, y0, x1, y1);
        if (this.hasWall(mask, WALL_S) && y === state.h - 1) this.graphics.lineBetween(x0, y1, x1, y1);
      }
    }
  }

  drawFogReveal(layout, state, isRevealed) {
    const spillDepth = Math.floor(layout.cellSize * 0.35);
    const doorHalf = Math.floor(layout.cellSize * 0.48);
    const inward = Math.floor(spillDepth / 2);
    const wallW = 2.5;

    // 1) Paint revealed floor
    this.graphics.fillStyle(0xffffff, 1);
    for (const idx of state.revealed || []) {
      const x = idx % state.w;
      const y = Math.floor(idx / state.w);
      const { x0, y0, x1, y1 } = this.cellRect(layout, x, y);
      this.graphics.fillRect(x0, y0, x1 - x0, y1 - y0);
    }

    // 2) Door spill
    for (const idx of state.revealed || []) {
      const x = idx % state.w;
      const y = Math.floor(idx / state.w);
      const mask = state.walls[y][x];
      const { x0, y0, x1, y1 } = this.cellRect(layout, x, y);
      const { cx, cy } = this.cellCenter(layout, x, y);

      if (!this.hasWall(mask, WALL_N) && y > 0) {
        const top = y0 - spillDepth;
        const bottom = y0 + inward;
        this.graphics.fillEllipse(cx, (top + bottom) / 2, doorHalf * 2, bottom - top);
      }
      if (!this.hasWall(mask, WALL_S) && y < state.h - 1) {
        const top = y1 - inward;
        const bottom = y1 + spillDepth;
        this.graphics.fillEllipse(cx, (top + bottom) / 2, doorHalf * 2, bottom - top);
      }
      if (!this.hasWall(mask, WALL_W) && x > 0) {
        const left = x0 - spillDepth;
        const right = x0 + inward;
        this.graphics.fillEllipse((left + right) / 2, cy, right - left, doorHalf * 2);
      }
      if (!this.hasWall(mask, WALL_E) && x < state.w - 1) {
        const left = x1 - inward;
        const right = x1 + spillDepth;
        this.graphics.fillEllipse((left + right) / 2, cy, right - left, doorHalf * 2);
      }
    }

    // 3) Walls for revealed cells
    this.graphics.lineStyle(wallW, 0x000000, 1);
    for (const idx of state.revealed || []) {
      const x = idx % state.w;
      const y = Math.floor(idx / state.w);
      const mask = state.walls[y][x];
      const { x0, y0, x1, y1 } = this.cellRect(layout, x, y);

      if (this.hasWall(mask, WALL_N)) this.graphics.lineBetween(x0, y0, x1, y0);
      if (this.hasWall(mask, WALL_W)) this.graphics.lineBetween(x0, y0, x0, y1);

      if (this.hasWall(mask, WALL_E)) {
        if (x === state.w - 1 || !isRevealed(x + 1, y)) this.graphics.lineBetween(x1, y0, x1, y1);
      }

      if (this.hasWall(mask, WALL_S)) {
        if (y === state.h - 1 || !isRevealed(x, y + 1)) this.graphics.lineBetween(x0, y1, x1, y1);
      }
    }
  }

  drawGoal(layout, state, visible) {
    if (!visible) {
      this.goalStar.setVisible(false);
      return;
    }

    const pad = Math.max(3, Math.floor(layout.cellSize * 0.12));
    const { x0, y0, x1, y1 } = this.cellRect(layout, state.goal.x, state.goal.y);

    this.graphics.fillStyle(0xffd54d, 1);
    this.graphics.lineStyle(2, 0x000000, 1);
    this.graphics.fillRect(x0 + pad, y0 + pad, x1 - x0 - pad * 2, y1 - y0 - pad * 2);
    this.graphics.strokeRect(x0 + pad, y0 + pad, x1 - x0 - pad * 2, y1 - y0 - pad * 2);

    const { cx, cy } = this.cellCenter(layout, state.goal.x, state.goal.y);
    this.goalStar.setVisible(true);
    this.goalStar.setPosition(cx, cy);
    this.goalStar.setFontSize(Math.max(14, Math.floor(layout.cellSize * 0.6)));
  }

  drawApples(layout, state, glassMode, isRevealed) {
    const apples = state.apples || [];
    if (!this.appleEmojiSprites) this.appleEmojiSprites = [];

    const fontSize = Math.max(12, Math.floor(layout.cellSize * 0.72)); // 20% smaller than previous

    for (let i = 0; i < apples.length; i++) {
      const a = apples[i];
      const visible = glassMode || !isRevealed || isRevealed(a.x, a.y);
      let t = this.appleEmojiSprites[i];
      if (!t) {
        t = this.add.text(0, 0, EMOJI_APPLE, { fontSize: `${fontSize}px` }).setOrigin(0.5);
        t.setDepth(40);
        this.appleEmojiSprites[i] = t;
      }
      t.setFontSize(fontSize);
      const { cx, cy } = this.cellCenter(layout, a.x, a.y);
      t.setPosition(cx, cy);
      t.setVisible(visible && !this._overlayVisible);
      t.setAlpha(1);
    }

    for (let i = apples.length; i < this.appleEmojiSprites.length; i++) {
      this.appleEmojiSprites[i].setVisible(false);
    }
  }

  drawTreasures(layout, state, glassMode, isRevealed) {
    if (this._overlayVisible) return;

    for (const t of state.treasures || []) {
      if (!glassMode && isRevealed && !isRevealed(t.x, t.y)) continue;
      const { cx, cy } = this.cellCenter(layout, t.x, t.y);
      this.drawTreasureChest(this.graphics, cx, cy, layout.cellSize * 1.1);
    }
  }

  drawFunnies(layout, state, glassMode, isRevealed) {
    for (const f of state.funnies || []) {
      if (!glassMode && isRevealed && !isRevealed(f.x, f.y)) continue;

      const { cx, cy } = this.cellCenter(layout, f.x, f.y);
      if (this._overlayVisible) continue;
      this.drawRubberDuck(this.graphics, cx, cy, layout.cellSize * 1.3);
    }
  }

  drawBatteries(layout, state, glassMode, isRevealed) {
    if (this._overlayVisible) return;
    if (!this.batteryEmojiSprites) this.batteryEmojiSprites = [];

    const batteries = state.batteries || [];
    const fontSize = Math.round(layout.cellSize * 0.68);

    for (let i = 0; i < batteries.length; i++) {
      const b = batteries[i];
      const visible = glassMode || !isRevealed || isRevealed(b.x, b.y);
      let t = this.batteryEmojiSprites[i];
      if (!t) {
        t = this.add.text(0, 0, EMOJI_BATTERY, { fontSize: `${fontSize}px` }).setOrigin(0.5);
        t.setDepth(40);
        this.batteryEmojiSprites[i] = t;
      }
      t.setFontSize(fontSize);
      const { cx, cy } = this.cellCenter(layout, b.x, b.y);
      t.setPosition(cx, cy);
      t.setVisible(visible && !this._overlayVisible);
      t.setAlpha(1);
    }

    for (let i = batteries.length; i < this.batteryEmojiSprites.length; i++) {
      this.batteryEmojiSprites[i].setVisible(false);
    }
  }

  drawMinotaurIcon(g, cx, cy, size, alpha = 1) {
    // Simple cow/minotaur head icon (vector) so we don't rely on emoji glyph support.
    const r = Math.max(6, size * 0.33);
    const hornW = r * 0.55;
    const hornH = r * 0.35;
    const eyeR = Math.max(1.2, r * 0.12);
    const snoutW = r * 1.05;
    const snoutH = r * 0.65;

    // Horns
    g.fillStyle(0xd9d9d9, alpha);
    g.fillTriangle(cx - r * 0.95, cy - r * 0.55, cx - r * 0.95 - hornW, cy - r * 0.55 - hornH, cx - r * 0.65, cy - r * 0.55 - hornH);
    g.fillTriangle(cx + r * 0.95, cy - r * 0.55, cx + r * 0.95 + hornW, cy - r * 0.55 - hornH, cx + r * 0.65, cy - r * 0.55 - hornH);

    // Face
    g.fillStyle(0x8b5a2b, alpha);
    g.fillCircle(cx, cy, r);

    // Snout
    g.fillStyle(0xf2c7a5, alpha);
    g.fillRoundedRect(cx - snoutW / 2, cy + r * 0.05, snoutW, snoutH, Math.max(2, r * 0.18));

    // Nostrils
    g.fillStyle(0x5a3a1d, alpha);
    g.fillEllipse(cx - r * 0.22, cy + r * 0.35, Math.max(1.6, r * 0.18), Math.max(1.2, r * 0.14));
    g.fillEllipse(cx + r * 0.22, cy + r * 0.35, Math.max(1.6, r * 0.18), Math.max(1.2, r * 0.14));

    // Eyes
    g.fillStyle(0x000000, alpha);
    g.fillCircle(cx - r * 0.28, cy - r * 0.12, eyeR);
    g.fillCircle(cx + r * 0.28, cy - r * 0.12, eyeR);
  }

  drawMinotaurs(layout, state, glassMode, isRevealed) {
    if (this._overlayVisible) return;
    const minotaurs = state.minotaurs || [];
    for (const m of minotaurs) {
      // In fog mode, keep the minotaur hidden until its cell is revealed.
      if (!glassMode && isRevealed && !isRevealed(m.x, m.y)) continue;
      const alpha = 1;
      const { cx, cy } = this.cellCenter(layout, m.x, m.y);
      this.drawMinotaurIcon(this.graphics, cx, cy, layout.cellSize * 1.25, alpha);
    }
  }

  drawTrails(layout, state) {
    // Prefer server-claimed path segments so the first traversal "owns" the color.
    if (state.paths && state.paths.length > 0) {
      for (const seg of state.paths) {
        const color = parseInt(String(seg.color || '#000000').replace('#', '0x'), 16);
        this.graphics.lineStyle(2, color, 1);
        const ac = this.cellCenter(layout, seg.a.x, seg.a.y);
        const bc = this.cellCenter(layout, seg.b.x, seg.b.y);
        this.graphics.lineBetween(ac.cx, ac.cy, bc.cx, bc.cy);
      }
      return;
    }

    // Fallback: per-player trail.
    for (const pid of [1, 2, 3, 4]) {
      const p = state.players?.[pid];
      if (!p || !p.connected || !p.trail || p.trail.length < 2) continue;

      const color = parseInt(p.color.replace('#', '0x'), 16);
      this.graphics.lineStyle(2, color, 1);

      for (let i = 1; i < p.trail.length; i++) {
        const a = p.trail[i - 1];
        const b = p.trail[i];
        const ac = this.cellCenter(layout, a.x, a.y);
        const bc = this.cellCenter(layout, b.x, b.y);
        this.graphics.lineBetween(ac.cx, ac.cy, bc.cx, bc.cy);
      }
    }
  }

  drawPlayers(layout, state) {
    const connected = [1, 2, 3, 4]
      .map((pid) => state.players?.[pid])
      .filter((p) => p && p.connected);

    const byCell = new Map();
    for (const p of connected) {
      const key = `${p.x},${p.y}`;
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key).push(p);
    }

    for (const group of byCell.values()) {
      const { cx, cy } = this.cellCenter(layout, group[0].x, group[0].y);

      const base = layout.cellSize * 0.18;
      const offsets = (group.length <= 1)
        ? [{ dx: 0, dy: 0 }]
        : [
            { dx: -base, dy: 0 },
            { dx: base, dy: 0 },
            { dx: 0, dy: -base },
            { dx: 0, dy: base },
          ];

      group.forEach((p, i) => {
        const off = offsets[i] || { dx: 0, dy: 0 };

        // Pixel avatar centered on the tile
        drawAvatarPixels(this.graphics, cx + off.dx, cy + off.dy, layout.cellSize, p.avatar, p.color);
      });
    }
  }

  drawObjectiveHud(state) {
    const x = this.scale.width - 12;
    const y = 12;

    const applesCollected = Number(state.applesCollected ?? 0);
    const appleTarget = Number(state.appleTarget ?? 0);
    const treasuresCollected = Number(state.treasuresCollected ?? 0);
    const treasureTarget = Number(state.treasureTarget ?? 0);
    const batteriesCollected = Number(state.batteriesCollected ?? 0);
    const batteryTarget = Number(state.batteryTarget ?? 0);
    const funniesCollected = Number(state.funniesCollected ?? 0);
    const funnyTarget = Number(state.funnyTarget ?? 0);

    if (!this.objectiveHud) {
      this.objectiveHud = this.add.container(0, 0);
      this.objectiveHud.setDepth(60);

      // Larger to accommodate larger icons and batteries.
      this.objectiveBg = this.add.rectangle(0, 0, 190, 148, 0xffffff, 0.8).setOrigin(1, 0);
      this.objectiveBg.setStrokeStyle(1, 0x000000, 0.25);
      this.objectiveHud.add(this.objectiveBg);

      this.appleSlots = [];
      const slotCount = 4; // apples cap at 4 in current objective table
      const dx = 26;
      for (let i = 0; i < slotCount; i++) {
        const t = this.add.text(0, 0, EMOJI_APPLE, { fontSize: '28px', color: '#000' }).setOrigin(1, 0);
        t.setPosition(-8 - (slotCount - 1 - i) * dx, 6);
        this.appleSlots.push(t);
        this.objectiveHud.add(t);
      }

      // Treasure slots (up to 4)
      this.treasureSlots = [];
      const treasureSlotsMax = 4;
      const treasureSize = 35;
      const treasureHalf = Math.floor(treasureSize / 2);
      for (let i = 0; i < treasureSlotsMax; i++) {
        const g = this.add.graphics();
        // Position is the top-left corner of the graphics object.
        g.setPosition(-22 - (treasureSlotsMax - 1 - i) * dx - treasureHalf, 44);
        g.clear();
        this.drawTreasureChest(g, treasureHalf, treasureHalf, treasureSize);
        this.treasureSlots.push(g);
        this.objectiveHud.add(g);
      }

      // Battery slots (up to 3)
      this.batterySlots = [];
      const batterySlotsMax = 3;
      for (let i = 0; i < batterySlotsMax; i++) {
        const t = this.add.text(0, 0, EMOJI_BATTERY, { fontSize: '28px', color: '#000' }).setOrigin(1, 0);
        t.setPosition(-8 - (batterySlotsMax - 1 - i) * dx, 80);
        this.batterySlots.push(t);
        this.objectiveHud.add(t);
      }

      // Funny (rubber duck) slots (up to 3)
      this.funnySlots = [];
      const funnySlotsMax = 3;
      const duckSize = 42;
      const duckHalf = Math.floor(duckSize / 2);
      for (let i = 0; i < funnySlotsMax; i++) {
        const g = this.add.graphics();
        g.setPosition(-22 - (funnySlotsMax - 1 - i) * dx - duckHalf, 112);
        g.clear();
        this.drawRubberDuck(g, duckHalf, duckHalf, duckSize);
        this.funnySlots.push(g);
        this.objectiveHud.add(g);
      }
    }

    // Right-aligned fill (fills from right to left).
    this.updateHudSlotsRightToLeft(this.appleSlots, 4, appleTarget, applesCollected);
    this.updateHudSlotsRightToLeft(this.treasureSlots, 4, treasureTarget, treasuresCollected);
    this.updateHudSlotsRightToLeft(this.batterySlots, 3, batteryTarget, batteriesCollected);
    this.updateHudSlotsRightToLeft(this.funnySlots, 3, funnyTarget, funniesCollected);

    this.objectiveHud.setPosition(x, y);
    this.objectiveHud.setVisible(true);
  }

  shutdown() {
    this.game.net.removeEventListener('state', this.onState);
  }
}
