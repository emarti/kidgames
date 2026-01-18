import Phaser from 'phaser';
import { drawAvatarPixels, listAvatars } from '../avatars.js';
import { createTouchControls, getTouchControlsReserve, isTouchDevice } from '@games/touch-controls';

const UI_BTN_BG = '#777777';
const UI_BTN_BG_HOVER = '#888888';
const UI_BTN_BG_SELECTED = '#000000';
const UI_BTN_TEXT = '#FFFFFF';

const WALL_N = 1;
const WALL_E = 2;
const WALL_S = 4;
const WALL_W = 8;

export default class PlayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PlayScene' });
  }

  create() {
    this.graphics = this.add.graphics();
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

    // Touch controls (D-pad + pause) for tablets/phones (shared with Snake)
    this.touchControlsEnabled = isTouchDevice();
    if (this.touchControlsEnabled) {
      this.touchControls = createTouchControls(this, {
        onDir: (dir) => this.game.net.send('input', { dir }),
        onPause: () => this.togglePause(),
      });
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

    if (state.paused) net.send('resume');
    else net.send('pause');
  }

  createSetupUI() {
    const bg = this.add.rectangle(0, 0, 740, 460, 0xFFFFFF, 0.95);
    this.setupContainer.add(bg);

    this.setupTitle = this.add.text(0, -200, 'GAME SETUP', { fontSize: '32px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5);
    this.setupContainer.add(this.setupTitle);

    this.setupContainer.add(this.add.text(-300, -140, 'Vision:', { fontSize: '18px', color: '#000' }).setOrigin(0, 0.5));
    this.visionButtons = {
      fog: this.addSetupButton(-120, -140, 'Fog', () => this.game.net.send('select_vision_mode', { mode: 'fog' })),
      glass: this.addSetupButton(40, -140, 'Glass Walls', () => this.game.net.send('select_vision_mode', { mode: 'glass' })),
    };

    this.restartButton = this.addSetupButton(180, -140, 'Restart', () => this.game.net.send('restart'));

    // Character + color selection (like Snake, but simplified)
    this.setupContainer.add(this.add.text(-300, -80, 'Character:', { fontSize: '18px', color: '#000' }).setOrigin(0, 0.5));
    this.avatarButtons = {};
    const avatars = listAvatars();
    const avatarX0 = -120;
    const avatarY = -80;
    const avatarDX = 66;
    avatars.forEach((a, i) => {
      this.avatarButtons[a] = this.addAvatarButton(avatarX0 + i * avatarDX, avatarY, a, () => this.game.net.send('select_avatar', { avatar: a }));
    });

    this.setupContainer.add(this.add.text(-300, -30, 'Color:', { fontSize: '18px', color: '#000' }).setOrigin(0, 0.5));
    this.colorButtons = {};
    this.availableColors = ['#2ecc71', '#3498db', '#e67e22', '#9b59b6', '#e74c3c', '#111111'];
    const colorX0 = -120;
    const colorY = -30;
    const colorDX = 70;
    this.availableColors.forEach((c, i) => {
      const btn = this.addSetupButton(colorX0 + i * colorDX, colorY, ' ', () => this.game.net.send('select_color', { color: c }));
      btn._colorValue = c;
      btn.setBackgroundColor(c);
      btn.setText('   ');
      this.colorButtons[c] = btn;
    });

    this.setupHelp = this.add.text(0, 120, '', { fontSize: '20px', color: '#000' }).setOrigin(0.5);
    this.setupContainer.add(this.setupHelp);

    this.startButton = this.addSetupButton(-90, 170, 'Start', () => this.game.net.send('resume'));
    this.continueButton = this.addSetupButton(90, 170, 'Continue', () => this.game.net.send('resume'));
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
    const margin = 20;

    const reserve = getTouchControlsReserve({ enabled: this.touchControlsEnabled });
    const hudTop = Math.max(36, Math.min(60, Math.floor(H * 0.12)));

    // Compute the biggest possible maze area for the screen, then only nudge it
    // away from the bottom-right touch control cluster if needed.
    const availableW = Math.max(160, W - (margin * 2));
    const availableH = Math.max(160, H - (margin * 2) - hudTop);

    const cellSize = Math.max(12, Math.floor(Math.min(availableW / state.w, availableH / state.h)));
    const gridPxW = state.w * cellSize;
    const gridPxH = state.h * cellSize;

    let offsetX = Math.floor(margin + (availableW - gridPxW) / 2);
    let offsetY = Math.floor(margin + hudTop + (availableH - gridPxH) / 2);

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
        offsetY = Math.max(margin + hudTop, Math.min(H - margin - gridPxH, offsetY));
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

    const isLobby = state.paused && state.reasonPaused === 'start';
    const isPaused = state.paused && state.reasonPaused === 'pause';

    this.setupTitle.setText(isLobby ? 'GAME SETUP' : 'PAUSED');

    this.startButton.setVisible(isLobby);
    this.continueButton.setVisible(!isLobby);

    for (const [key, btn] of Object.entries(this.visionButtons)) {
      const selected = state.visionMode === key;
      btn._selected = selected;
      btn.setBackgroundColor(selected ? UI_BTN_BG_SELECTED : UI_BTN_BG);
      btn.setColor(UI_BTN_TEXT);
    }

    if (me) {
      // Avatar selection
      for (const [a, btn] of Object.entries(this.avatarButtons || {})) {
        const selected = me.avatar === a;
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

    if (me && me.paused && !state.paused) {
      help = '';
    }

    this.setupHelp.setText(help);
  }

  renderState(state) {
    this.game.net.latestState = state;
    this.graphics.clear();

    const layout = this.computeLayout(state);

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
    } else {
      // Fog
      this.graphics.fillStyle(0x000000, 1);
      this.graphics.fillRect(0, 0, this.scale.width, this.scale.height);
      this.drawFogReveal(layout, state, isRevealed);
      this.drawGoal(layout, state, isRevealed(state.goal.x, state.goal.y));
      this.drawApples(layout, state, false, isRevealed);
    }

    this.drawTrails(layout, state);
    this.drawPlayers(layout, state);
    this.drawAppleHud(state);

    if (state.paused) {
      this.setupContainer.setVisible(true);
      this.updateSetupUI(state);
      this.centerText.setText('');
    } else {
      this.setupContainer.setVisible(false);
      this.centerText.setText('');
    }

    if (state.message) {
      this.centerText.setText(state.message);
    }
  }

  drawFullMaze(layout, state) {
    const wallW = 2;
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
    const wallW = 2;

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
    for (const a of state.apples || []) {
      if (!glassMode && isRevealed && !isRevealed(a.x, a.y)) continue;

      const { cx, cy } = this.cellCenter(layout, a.x, a.y);
      const r = layout.cellSize * 0.18;

      this.graphics.fillStyle(0xd64545, 1);
      this.graphics.lineStyle(1, 0x000000, 1);
      this.graphics.fillCircle(cx, cy, r);
      this.graphics.strokeCircle(cx, cy, r);

      this.graphics.fillStyle(0x3aa655, 1);
      this.graphics.fillCircle(cx + r * 0.7, cy - r * 0.7, r * 0.55);
      this.graphics.strokeCircle(cx + r * 0.7, cy - r * 0.7, r * 0.55);
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

  drawAppleHud(state) {
    const target = state.appleTarget ?? 0;
    const collected = state.applesCollected ?? 0;
    const max = 5;

    const size = 10;
    const gap = 10;
    const pad = 12;

    const active = Math.min(max, target);
    const totalW = active * (size * 2 + gap);
    const startX = this.scale.width - pad - totalW + size;
    const y = 20;

    for (let i = 0; i < active; i++) {
      const filled = i < collected;
      const x = startX + i * (size * 2 + gap);

      this.graphics.lineStyle(2, filled ? 0x2a2a2a : 0x7a7a7a, 1);
      this.graphics.fillStyle(filled ? 0xd64545 : 0x000000, filled ? 1 : 0);
      this.graphics.fillCircle(x, y, size);
      this.graphics.strokeCircle(x, y, size);

      this.graphics.fillStyle(filled ? 0x3aa655 : 0x000000, filled ? 1 : 0);
      this.graphics.fillCircle(x + size * 0.9, y - size * 0.9, size * 0.65);
      this.graphics.strokeCircle(x + size * 0.9, y - size * 0.9, size * 0.65);
    }
  }

  shutdown() {
    this.game.net.removeEventListener('state', this.onState);
  }
}
