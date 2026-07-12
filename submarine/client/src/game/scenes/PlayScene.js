import Phaser from 'phaser';
import { createTouchControls, isTouchDevice } from '@games/touch-controls';

const TEAM_COLORS = {
  red: 0xff4d4d,
  white: 0xf8fafc,
  blue: 0x4d94ff,
  yellow: 0xffd24d,
};

const FIREWORK_COLORS = [
  0xff0000,
  0xff7f00,
  0xffff00,
  0x00ff00,
  0x00ffff,
  0x0000ff,
  0x8a2be2,
  0xff00ff,
];

export default class PlayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PlayScene' });
    this.state = null;
    this._listeners = [];
    this.roleButtons = {};
    this.teamButtons = {};
    this.visibilityButtons = {};
    this.touchInput = { throttle: 0, turn: 0, dive: 0, fire: false, altFire: false, sonar: false };
    this.lastSentInput = '';
    this.lastInputSentAt = 0;
    this.view = { cameraX: 0, scale: 1, yScale: 1 };
    this.touchControlsEnabled = false;
    this.seenHitEffects = new Set();
    this.renderTime = 0;
  }

  create() {
    this.state = this.game.net.latestState;
    this.gfx = this.add.graphics();
    this.hudText = this.add.text(14, 12, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      color: '#e0f2fe',
    }).setDepth(20);
    this.statusText = this.add.text(14, 38, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      color: '#fde68a',
    }).setDepth(20);

    this.createSetupUI();
    this.createRightButtons();
    this.createInput();
    this.createTouchControls_();
    this.setupNetworking();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  setupNetworking() {
    const net = this.game.net;
    const onState = (event) => {
      this.state = event.detail;
      this.updateButtons();
    };
    const onError = (event) => this.statusText.setText(String(event.detail || 'Network error'));
    const onDisconnected = () => this.statusText.setText('Disconnected');
    this.listen(net, 'state', onState);
    this.listen(net, 'net_error', onError);
    this.listen(net, 'disconnected', onDisconnected);
  }

  createRightButtons() {
    const { width, height } = this.scale;
    this.rightButtons = [
      this.createButton(width - 86, 26, 'Pause', () => this.togglePause()),
      this.createHoldButton(width - 86, 72, 'Fire', { fire: true }),
      this.createHoldButton(width - 86, 118, 'Sonar', { sonar: true }),
      this.createHoldButton(width - 86, 164, 'Missile', { altFire: true }),
    ];
  }

  createButton(x, y, label, callback) {
    const txt = this.add.text(x, y, label, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      color: '#061826',
      backgroundColor: '#bae6fd',
      padding: { x: 10, y: 6 },
    }).setOrigin(0.5).setDepth(30).setInteractive({ useHandCursor: true });
    txt.on('pointerdown', callback);
    txt.on('pointerover', () => txt.setBackgroundColor('#e0f2fe'));
    txt.on('pointerout', () => this.updateButtons());
    return txt;
  }

  createSetupUI() {
    const { width, height } = this.scale;
    this.setupContainer = this.add.container(width / 2, height / 2).setDepth(100);
    const bg = this.add.rectangle(0, 0, 700, 430, 0xffffff, 0.95);
    this.setupContainer.add(bg);

    this.setupTitle = this.add.text(0, -184, 'GAME SETUP', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#061826',
    }).setOrigin(0.5);
    this.setupContainer.add(this.setupTitle);

    this.setupContainer.add(this.add.text(-300, -124, 'Vessel:', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '19px',
      color: '#061826',
    }).setOrigin(0, 0.5));
    this.roleButtons.submarine = this.setupButton(-132, -124, 'Submarine', () => this.game.net.send('select_role', { role: 'submarine' }));
    this.roleButtons.destroyer = this.setupButton(36, -124, 'Destroyer', () => this.game.net.send('select_role', { role: 'destroyer' }));

    this.setupContainer.add(this.add.text(-300, -58, 'Color:', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '19px',
      color: '#061826',
    }).setOrigin(0, 0.5));
    const teams = ['red', 'white', 'blue', 'yellow'];
    teams.forEach((team, idx) => {
      this.teamButtons[team] = this.setupButton(-132 + idx * 112, -58, team.toUpperCase(), () => this.game.net.send('select_team', { team }));
    });

    this.setupContainer.add(this.add.text(-300, 10, 'Fog:', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '19px',
      color: '#061826',
    }).setOrigin(0, 0.5));
    this.visibilityButtons.clear = this.setupButton(-132, 10, 'Off', () => this.game.net.send('select_visibility', { mode: 'clear' }));
    this.visibilityButtons.low = this.setupButton(-22, 10, 'On', () => this.game.net.send('select_visibility', { mode: 'low' }));

    this.setupHelp = this.add.text(0, 82, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '18px',
      color: '#0f172a',
    }).setOrigin(0.5);
    this.setupContainer.add(this.setupHelp);

    this.startButton = this.setupButton(0, 144, 'Start', () => this.game.net.send('resume'));
    this.restartSetupButton = this.setupButton(150, 144, 'Restart', () => this.game.net.send('restart'));
    this.setupContainer.setVisible(false);

    this.scale.on('resize', this.positionFixedUI, this);
  }

  setupButton(x, y, label, callback) {
    const txt = this.add.text(x, y, label, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#64748b',
      padding: { x: 12, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    txt.on('pointerdown', callback);
    txt.on('pointerover', () => txt.setBackgroundColor('#475569'));
    txt.on('pointerout', () => this.updateSetupUI());
    this.setupContainer.add(txt);
    return txt;
  }

  positionFixedUI() {
    if (this.setupContainer) this.setupContainer.setPosition(this.scale.width / 2, this.scale.height / 2);
    if (!this.rightButtons) return;
    const x = this.scale.width - 86;
    this.rightButtons[0]?.setPosition(x, 26);
    this.rightButtons[1]?.setPosition(x, 72);
    this.rightButtons[2]?.setPosition(x, 118);
    this.rightButtons[3]?.setPosition(x, 164);
  }

  createHoldButton(x, y, label, values) {
    const txt = this.add.text(x, y, label, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      color: '#e0f2fe',
      backgroundColor: '#0f3b57',
      padding: { x: 10, y: 8 },
    }).setOrigin(0.5).setDepth(32).setInteractive({ useHandCursor: true });

    const setHeld = (held) => {
      for (const [key, value] of Object.entries(values)) {
        this.touchInput[key] = held ? value : false;
      }
      txt.setBackgroundColor(held ? '#facc15' : '#0f3b57');
      txt.setColor(held ? '#061826' : '#e0f2fe');
    };

    txt.on('pointerdown', () => setHeld(true));
    txt.on('pointerup', () => setHeld(false));
    txt.on('pointerout', () => setHeld(false));
    txt.on('pointerupoutside', () => setHeld(false));
    return txt;
  }

  createTouchControls_() {
    this.touchControlsEnabled = isTouchDevice();
    if (!this.touchControlsEnabled) return;
    if (this.touchControls?.destroy) this.touchControls.destroy();
    this.touchControls = createTouchControls(this, {
      onDirDown: (dir) => this.setTouchDir(dir, true),
      onDirUp: (dir) => this.setTouchDir(dir, false),
      onPause: () => this.togglePause(),
      alpha: 0.6,
      margin: 22,
    });
  }

  setTouchDir(dir, held) {
    const value = held ? 1 : 0;
    if (dir === 'UP') this.touchInput.dive = held ? -1 : 0;
    if (dir === 'DOWN') this.touchInput.dive = value;
    if (dir === 'LEFT') this.touchInput.throttle = held ? -1 : 0;
    if (dir === 'RIGHT') this.touchInput.throttle = value;
  }

  createInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      q: Phaser.Input.Keyboard.KeyCodes.Q,
      e: Phaser.Input.Keyboard.KeyCodes.E,
      x: Phaser.Input.Keyboard.KeyCodes.X,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      p: Phaser.Input.Keyboard.KeyCodes.P,
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
      four: Phaser.Input.Keyboard.KeyCodes.FOUR,
      five: Phaser.Input.Keyboard.KeyCodes.FIVE,
      six: Phaser.Input.Keyboard.KeyCodes.SIX,
      f: Phaser.Input.Keyboard.KeyCodes.F,
    });
  }

  update() {
    this.handleKeyboardCommands();
    this.sendMovementInput();
    this.draw();
    this.updateHud();
    this.updateSetupUI();
    this.playNewHitSounds();
  }

  draw() {
    const state = this.state;
    const g = this.gfx;
    const { width, height } = this.scale;
    this.renderTime = this.time.now;
    g.clear();

    const waterline = Math.round(height * 0.2);
    this.drawOceanBackdrop(g, width, height, waterline);

    if (!state) return;

    const world = state.world ?? { w: 1200, h: 800, waterlineY: 160, vehicleLength: 200 };
    const me = state.players?.[this.game.net.playerId];
    const cameraX = world.w / 2;
    const scale = width / world.w;
    const yScale = height / world.h;
    this.view = { cameraX, scale, yScale };

    this.drawOceanFloor(g, world, cameraX, scale, yScale, width, height);

    for (const bubble of state.bubbles ?? []) {
      const sx = (bubble.x - cameraX) * scale + width / 2;
      const sy = bubble.y * yScale;
      if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) continue;
      const age = Date.now() - bubble.bornAt;
      const life = Math.max(1, bubble.lifeMs ?? 1000);
      const alpha = Math.max(0, 1 - age / life) * 0.55;
      g.lineStyle(1, 0xe0f2fe, alpha);
      g.strokeCircle(sx, sy, Math.max(2, (bubble.radius ?? 4) * scale));
    }

    this.drawVehicleTrails(g, state, world, cameraX, scale, yScale, width, height);
    this.drawWeapons(g, state, cameraX, scale, yScale, width, height);
    this.drawSonarPulses(g, state, cameraX, scale, yScale, width, height);

    for (const player of Object.values(state.players ?? {})) {
      if (!player.connected) continue;
      const sx = (player.x - cameraX) * scale + width / 2;
      const sy = player.y * yScale;
      if (sx < -80 || sx > width + 80) continue;
      const contact = this.contactFor(player, state, me);
      if (contact.strength < 0.2) continue;
      if (contact.strength < 0.75) {
        const offset = contactOffset(player, contact.strength, this.renderTime);
        this.drawPassiveContact(g, sx + offset.x, sy + offset.y, player, contact, world);
      } else {
        this.drawVessel(g, sx, sy, player, player.id === this.game.net.playerId, me, world, yScale);
      }
    }

    this.drawHitEffects(g, state, cameraX, scale, yScale, width, height);

    this.drawWorldEdges(g, world, cameraX, scale, width, height);
    this.drawWorldFrame(g, width, height);
  }

  drawWorldEdges(g, world, cameraX, scale, width, height) {
    const leftX = (0 - cameraX) * scale + width / 2;
    const rightX = (world.w - cameraX) * scale + width / 2;
    g.lineStyle(4, 0xffffff, 0.35);
    if (leftX >= -8 && leftX <= width + 8) g.lineBetween(leftX, 0, leftX, height);
    if (rightX >= -8 && rightX <= width + 8) g.lineBetween(rightX, 0, rightX, height);
  }

  drawOceanBackdrop(g, width, height, waterline) {
    g.fillGradientStyle(0xffffff, 0xffffff, 0xe0f2fe, 0xe0f2fe, 1);
    g.fillRect(0, 0, width, waterline);

    g.fillGradientStyle(0x38bdf8, 0x0284c7, 0x075985, 0x061826, 1);
    g.fillRect(0, waterline, width, height - waterline);

    g.lineStyle(3, 0xffffff, 0.92);
    g.beginPath();
    const amplitude = 4;
    const wavelength = 120;
    for (let x = 0; x <= width + 8; x += 8) {
      const y = waterline + Math.sin((x / wavelength) * Math.PI * 2) * amplitude;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokePath();

    g.lineStyle(1, 0xbae6fd, 0.55);
    g.beginPath();
    for (let x = 0; x <= width + 8; x += 8) {
      const y = waterline + 8 + Math.sin((x / wavelength) * Math.PI * 2 + 1.1) * 2;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokePath();
  }

  drawOceanFloor(g, world, cameraX, scale, yScale, width, height) {
    const floor = world?.floor;
    if (!floor?.enabled) return;
    const ridges = Array.isArray(floor.ridges) && floor.ridges.length >= 2
      ? floor.ridges
      : [
        { x: 0, y: floor.baselineY ?? world.h - 80 },
        { x: world.w ?? 1200, y: floor.baselineY ?? world.h - 80 },
      ];

    g.fillStyle(0x082f49, 0.9);
    g.beginPath();
    g.moveTo(worldToScreenX(ridges[0].x, cameraX, scale, width), height + 6);
    for (const point of ridges) {
      g.lineTo(worldToScreenX(point.x, cameraX, scale, width), point.y * yScale);
    }
    g.lineTo(worldToScreenX(ridges[ridges.length - 1].x, cameraX, scale, width), height + 6);
    g.closePath();
    g.fillPath();

    g.lineStyle(3, 0x164e63, 0.85);
    g.beginPath();
    ridges.forEach((point, idx) => {
      const sx = worldToScreenX(point.x, cameraX, scale, width);
      const sy = point.y * yScale;
      if (idx === 0) g.moveTo(sx, sy);
      else g.lineTo(sx, sy);
    });
    g.strokePath();

    this.drawFloorDetails(g, floor, cameraX, scale, yScale, width);
  }

  drawFloorDetails(g, floor, cameraX, scale, yScale, width) {
    for (const volcano of floor.volcanoes ?? []) {
      const x = worldToScreenX(volcano.x, cameraX, scale, width);
      const y = volcano.y * yScale;
      const w = Math.max(22, (volcano.w ?? 90) * scale);
      const h = Math.max(22, (volcano.h ?? 60) * yScale);
      g.fillStyle(0x0f172a, 0.65);
      g.fillTriangle(x - w / 2, y + h, x, y, x + w / 2, y + h);
      g.fillStyle(0x334155, 0.5);
      g.fillEllipse(x, y + 5, w * 0.34, Math.max(5, h * 0.14));
    }

    for (const vent of floor.vents ?? []) {
      const x = worldToScreenX(vent.x, cameraX, scale, width);
      const y = vent.y * yScale;
      const h = Math.max(14, (vent.h ?? 30) * yScale);
      g.fillStyle(0x1e293b, 0.78);
      g.fillRoundedRect(x - 7, y - h, 14, h, 5);
      g.fillStyle(0x94a3b8, 0.22);
      g.fillCircle(x - 5, y - h - 10, 3);
      g.fillCircle(x + 6, y - h - 21, 2.5);
    }

    const baselineY = floor.baselineY ?? 724;
    for (let i = 0; i < 14; i += 1) {
      const worldX = 42 + i * 86;
      const x = worldToScreenX(worldX, cameraX, scale, width);
      const y = (baselineY + ((i % 5) - 2) * 7) * yScale;
      g.fillStyle(i % 3 === 0 ? 0x475569 : 0x334155, 0.42);
      g.fillEllipse(x, y, Math.max(5, (14 + (i % 4) * 5) * scale), Math.max(3, (5 + (i % 3) * 3) * yScale));
    }
  }

  drawWorldFrame(g, width, height) {
    g.lineStyle(3, 0xffffff, 0.22);
    g.strokeRect(1.5, 1.5, width - 3, height - 3);
  }

  drawVehicleTrails(g, state, world, cameraX, scale, yScale, width, height) {
    for (const player of Object.values(state.players ?? {})) {
      if (!player.connected) continue;
      const sx = (player.x - cameraX) * scale + width / 2;
      const sy = player.y * yScale;
      if (sx < -120 || sx > width + 120 || sy < -40 || sy > height + 80) continue;
      const contact = this.contactFor(player, state, state.players?.[this.game.net.playerId]);
      if (state.visibilityMode === 'low' && contact.strength < 0.75) continue;

      const speed = Math.hypot(player.vx ?? 0, player.vy ?? 0);
      if (speed < 8) continue;

      const dir = Math.cos(player.heading ?? 0) >= 0 ? 1 : -1;
      const surfaced = isSurfaceVessel(player, world);
      const speedAlpha = clamp(speed / 150, 0.12, 0.85) * clamp(contact.strength + 0.15, 0.25, 1);
      const wave = Math.sin(this.renderTime / 180 + player.id * 1.7) * 3;

      if (surfaced) {
        g.lineStyle(2, 0xe0f2fe, speedAlpha * 0.7);
        g.beginPath();
        g.moveTo(sx - dir * 34, sy + 10);
        g.lineTo(sx - dir * 58, sy + 13 + wave);
        g.lineTo(sx - dir * 86, sy + 9 - wave);
        g.strokePath();
        g.lineStyle(1, 0xbae6fd, speedAlpha * 0.45);
        g.beginPath();
        g.moveTo(sx - dir * 18, sy + 15);
        g.lineTo(sx - dir * 48, sy + 22 - wave);
        g.lineTo(sx - dir * 76, sy + 19 + wave);
        g.strokePath();
      } else {
        g.lineStyle(2, 0x93c5fd, speedAlpha * 0.36);
        g.beginPath();
        g.moveTo(sx - dir * 38, sy + 1);
        g.lineTo(sx - dir * 68, sy + 4 + wave);
        g.lineTo(sx - dir * 98, sy - 2 - wave);
        g.strokePath();
        g.fillStyle(0xe0f2fe, speedAlpha * 0.28);
        for (let i = 0; i < 3; i += 1) {
          g.fillCircle(sx - dir * (54 + i * 18), sy - 8 + ((i % 2) * 9) + wave, Math.max(1.5, 2.5 * scale));
        }
      }
    }
  }

  drawPassiveContact(g, x, y, player, contact, world) {
    const color = TEAM_COLORS[player.team] ?? 0xffffff;
    const pulse = 0.5 + Math.sin(this.renderTime / 260 + player.id) * 0.5;
    if (contact.strength < 0.45) {
      const radius = 24 + pulse * 9;
      g.lineStyle(2, 0xbae6fd, 0.18 + contact.strength * 0.55);
      g.strokeCircle(x, y, radius);
      g.fillStyle(0xbae6fd, 0.16 + contact.strength * 0.22);
      g.fillCircle(x, y, 4 + pulse * 2);
      return;
    }

    const surfaced = isSurfaceVessel(player, world);
    g.fillStyle(color, 0.24 + contact.strength * 0.28);
    if (player.role === 'destroyer' || player.role === 'boat') {
      g.fillRoundedRect(x - 72, y - 12, 144, 23, 7);
    } else {
      g.fillEllipse(x, y, 138, surfaced ? 28 : 34);
    }
    g.lineStyle(2, 0xbae6fd, 0.25 + contact.strength * 0.4);
    g.strokeCircle(x, y, 28 + pulse * 5);
  }

  drawWeapons(g, state, cameraX, scale, yScale, width, height) {
    for (const torpedo of state.torpedoes ?? []) {
      const sx = (torpedo.x - cameraX) * scale + width / 2;
      const sy = torpedo.y * yScale;
      if (sx < -80 || sx > width + 80 || sy < -40 || sy > height + 40) continue;
      const dir = Math.cos(torpedo.heading ?? 0) >= 0 ? 1 : -1;
      g.lineStyle(4, 0xfef3c7, 0.8);
      g.lineBetween(sx - dir * 34, sy, sx - dir * 9, sy);
      g.fillStyle(0xfacc15, 0.95);
      g.fillEllipse(sx, sy, 34, 10);
      g.fillTriangle(sx + dir * 18, sy, sx + dir * 4, sy - 8, sx + dir * 4, sy + 8);
      g.lineStyle(1, 0x0f172a, 0.55);
      g.strokeEllipse(sx, sy, 34, 10);
    }

    for (const charge of state.depthCharges ?? []) {
      const sx = (charge.x - cameraX) * scale + width / 2;
      const sy = charge.y * yScale;
      if (sx < -80 || sx > width + 80 || sy < -40 || sy > height + 80) continue;
      g.lineStyle(2, 0xfde68a, 0.34);
      g.strokeCircle(sx, sy, Math.max(16, (charge.radius ?? 50) * scale));
      g.fillStyle(0x1e293b, 0.95);
      g.fillCircle(sx, sy, 9);
      g.fillStyle(0xf8fafc, 0.8);
      g.fillCircle(sx - 3, sy - 3, 2.5);
      g.lineStyle(2, 0x93c5fd, 0.45);
      g.lineBetween(sx, sy - 20, sx, sy - 8);
      g.strokeCircle(sx - 8, sy - 28, 3);
      g.strokeCircle(sx + 7, sy - 36, 2);
    }

    for (const missile of state.missiles ?? []) {
      const sx = (missile.x - cameraX) * scale + width / 2;
      const sy = missile.y * yScale;
      const radius = Math.max(18, (missile.radius ?? 20) * scale);
      if (sx < -120 || sx > width + 120 || sy < -120 || sy > height + 120) continue;

      if (missile.phase === 'blast') {
        const age = Date.now() - (missile.explodedAt ?? missile.bornAt);
        const t = clamp(age / 850, 0, 1);
        const alpha = Math.max(0, 1 - t);
        g.lineStyle(4, 0xf97316, 0.72 * alpha);
        g.strokeCircle(sx, sy, radius);
        g.lineStyle(2, 0xfef3c7, 0.85 * alpha);
        g.strokeCircle(sx, sy, radius * (0.55 + t * 0.3));
        g.fillStyle(0xfacc15, 0.25 * alpha);
        g.fillCircle(sx, sy, radius * 0.42);
        continue;
      }

      g.lineStyle(4, 0xfed7aa, 0.78);
      g.lineBetween(sx, sy + 36, sx, sy + 9);
      g.fillStyle(0xf97316, 0.95);
      g.fillRoundedRect(sx - 5, sy - 16, 10, 30, 5);
      g.fillStyle(0xfef3c7, 0.95);
      g.fillTriangle(sx, sy - 24, sx - 7, sy - 10, sx + 7, sy - 10);
      g.lineStyle(2, 0xe0f2fe, 0.55);
      g.strokeCircle(sx - 10, sy + 28, 3);
      g.strokeCircle(sx + 8, sy + 42, 2.5);
    }
  }

  drawSonarPulses(g, state, cameraX, scale, yScale, width, height) {
    const now = Date.now();
    for (const pulse of state.pulses ?? []) {
      const sx = (pulse.x - cameraX) * scale + width / 2;
      const sy = pulse.y * yScale;
      const age = now - pulse.bornAt;
      const life = Math.max(1, pulse.lifeMs ?? 1600);
      if (age < 0 || age > life) continue;
      const t = clamp(age / life, 0, 1);
      const alpha = Math.max(0, 1 - t) * 0.65;
      const radius = Math.max(12, (pulse.maxRadius ?? 420) * scale * (1 - Math.pow(1 - t, 2)));
      if (sx + radius < -20 || sx - radius > width + 20 || sy + radius < -20 || sy - radius > height + 20) continue;

      g.lineStyle(4, 0xbae6fd, alpha);
      g.strokeCircle(sx, sy, radius);
      g.lineStyle(2, 0xffffff, alpha * 0.7);
      g.strokeCircle(sx, sy, radius * 0.72);
      g.fillStyle(0xe0f2fe, alpha * 0.45);
      g.fillCircle(sx, sy, Math.max(3, 6 * (1 - t)));
    }
  }

  drawHitEffects(g, state, cameraX, scale, yScale, width, height) {
    const now = Date.now();
    for (const effect of state.hitEffects ?? []) {
      const sx = (effect.x - cameraX) * scale + width / 2;
      const sy = effect.y * yScale;
      if (sx < -120 || sx > width + 120 || sy < -120 || sy > height + 120) continue;
      const age = now - effect.bornAt;
      const life = Math.max(1, effect.lifeMs ?? 1200);
      const t = clamp(age / life, 0, 1);
      const alpha = Math.max(0, 1 - t * 0.7);
      const ease = 1 - Math.pow(1 - t, 2);
      const base = String(effect.id ?? `${effect.x}-${effect.y}`);
      const burstScale = Math.max(0.62, Math.min(scale, yScale) * 1.8);

      for (let i = 0; i < 24; i += 1) {
        const sparkSeed = seededSpark(base, i);
        const angle = (Math.PI * 2 * i) / 24 + (sparkSeed.jitter - 0.5) * 0.22;
        const speed = (46 + (i % 4) * 14 + sparkSeed.speed * 24) * burstScale;
        const dist = 10 + speed * ease;
        const x2 = sx + Math.cos(angle) * dist;
        const y2 = sy + Math.sin(angle) * dist + 16 * t * t;
        const tailDist = Math.max(6, dist - 20 * burstScale);
        const x1 = sx + Math.cos(angle) * tailDist;
        const y1 = sy + Math.sin(angle) * tailDist + 16 * t * t;
        const lineWidth = Math.max(2, 4 * burstScale * (1 - t * 0.35));
        g.lineStyle(lineWidth, FIREWORK_COLORS[i % FIREWORK_COLORS.length], 0.95 * alpha);
        g.lineBetween(x1, y1, x2, y2);
      }

      g.fillStyle(0xffffff, 0.85 * alpha);
      g.fillCircle(sx, sy, Math.max(3, 7 * burstScale * (1 - t * 0.45)));
    }
  }

  drawVessel(g, x, y, player, isLocal, localPlayer, world, yScale) {
    const color = TEAM_COLORS[player.team] ?? 0xffffff;
    const resetting = player.resettingUntil && Date.now() < player.resettingUntil;
    const alpha = resetting ? 0.42 : vesselAlpha(player, localPlayer, isLocal);
    const dir = Math.cos(player.heading ?? 0) >= 0 ? 1 : -1;
    const surfaced = isSurfaceVessel(player, world);

    if (resetting) {
      g.lineStyle(3, 0xfacc15, 0.85);
      g.strokeCircle(x, y, 44);
    }

    if (player.role === 'destroyer' || player.role === 'boat') {
      const bow = x + dir * 72;
      const stern = x - dir * 70;
      g.lineStyle(2, 0x082f49, 0.78);
      g.beginPath();
      g.moveTo(stern, y - 8);
      g.lineTo(bow - dir * 16, y - 11);
      g.lineTo(bow, y - 3);
      g.lineTo(bow - dir * 12, y + 11);
      g.lineTo(stern + dir * 10, y + 12);
      g.lineTo(stern - dir * 2, y + 2);
      g.closePath();
      g.strokePath();
      g.fillStyle(color, alpha);
      g.beginPath();
      g.moveTo(stern, y - 8);
      g.lineTo(bow - dir * 16, y - 11);
      g.lineTo(bow, y - 3);
      g.lineTo(bow - dir * 12, y + 11);
      g.lineTo(stern + dir * 10, y + 12);
      g.lineTo(stern - dir * 2, y + 2);
      g.closePath();
      g.fillPath();
      g.fillStyle(0x64748b, alpha * 0.95);
      g.fillRoundedRect(x - 22, y - 29, 42, 18, 4);
      g.fillStyle(0x94a3b8, alpha * 0.95);
      g.fillRoundedRect(x - 5, y - 42, 22, 14, 3);
      g.fillStyle(0x0f172a, alpha * 0.82);
      g.fillRect(x + dir * 36 - 11, y - 18, 22, 6);
      g.fillCircle(x + dir * 49, y - 15, 5);
      g.fillStyle(0xe0f2fe, alpha * 0.9);
      g.fillRect(x + dir * 2 - 8, y - 24, 16, 5);
      g.lineStyle(2, 0x061826, 0.65);
      g.lineBetween(x - 58, y + 8, x + 58, y + 8);
      g.lineStyle(2, 0x0f172a, 0.7);
      g.lineBetween(x + dir * 4, y - 42, x + dir * 4, y - 58);
      g.lineBetween(x + dir * 4, y - 55, x + dir * 22, y - 55);
      if (isLocal) drawLocalOutline(g, x, y, player, dir);
      return;
    }

    g.lineStyle(surfaced ? 2 : 3, surfaced ? 0xf8fafc : 0x0f172a, surfaced ? 0.75 : 0.58);
    g.strokeEllipse(x, y, 132, surfaced ? 26 : 31);
    g.fillStyle(color, alpha);
    g.fillEllipse(x, y, 126, surfaced ? 24 : 30);
    g.fillRoundedRect(x - 11, y - (surfaced ? 23 : 25), 26, 18, 5);
    if (surfaced) {
      const waterlineY = (world?.waterlineY ?? 160) * (yScale ?? 1);
      g.lineStyle(2, 0xe0f2fe, 0.8);
      g.lineBetween(x + 2, y - 25, x + 2, waterlineY - 7);
      g.lineBetween(x + 2, waterlineY - 7, x + 16 * dir, waterlineY - 7);
    } else {
      g.fillStyle(0x082f49, 0.22);
      g.fillEllipse(x, y + 3, 108, 18);
    }
    drawSubPropeller(g, x - 70 * dir, y, dir, alpha);
    if (isLocal) drawLocalOutline(g, x, y, player, dir);
  }

  contactFor(player, state, localPlayer) {
    if (!player) return { strength: 0, level: 'hidden' };
    if (state?.visibilityMode !== 'low') return { strength: 1, level: 'exact' };
    if (localPlayer && (player.id === localPlayer.id || player.team === localPlayer.team)) {
      return { strength: 1, level: 'exact' };
    }
    const team = localPlayer?.team;
    const contact = team ? state?.visibility?.teams?.[team]?.contacts?.[player.id] : null;
    if (!contact) return { strength: 0, level: 'hidden' };
    return {
      strength: clamp(Number(contact.strength) || 0, 0, 1),
      level: contact.level || 'hidden',
    };
  }

  updateHud() {
    const state = this.state;
    const player = state?.players?.[this.game.net.playerId];
    const room = this.game.net.roomId ? `Room ${this.game.net.roomId}` : 'No room';
    const id = this.game.net.playerId ? `P${this.game.net.playerId}` : 'P?';
    const tick = state ? `Tick ${state.tick}` : 'Waiting';
    this.hudText.setText(`${room}  ${id}  ${tick}`);
    if (!state) return;
    const role = player?.role === 'destroyer' ? 'destroyer' : 'submarine';
    const team = player?.team ?? 'red';
    const fog = state.visibilityMode === 'low' ? 'FOG ON' : 'FOG OFF';
    const cooldownMs = Math.max(0, (player?.fireReadyAt ?? 0) - Date.now());
    const fireStatus = cooldownMs > 0 ? `FIRE ${Math.ceil(cooldownMs / 1000)}s` : 'FIRE READY';
    const sonarMs = Math.max(0, (player?.sonarReadyAt ?? 0) - Date.now());
    const sonarStatus = sonarMs > 0 ? `SONAR ${Math.ceil(sonarMs / 1000)}s` : 'SONAR READY';
    const missileMs = Math.max(0, (player?.missileReadyAt ?? 0) - Date.now());
    const missileStatus = role === 'submarine'
      ? (missileMs > 0 ? `  MISSILE ${Math.ceil(missileMs / 1000)}s` : '  MISSILE READY')
      : '';
    const resetMs = Math.max(0, (player?.resettingUntil ?? 0) - Date.now());
    const resetStatus = resetMs > 0 ? `  RESET ${Math.ceil(resetMs / 1000)}s` : '';
    this.statusText.setText(`${role.toUpperCase()}  ${team.toUpperCase()}  ${fog}  ${state.paused ? 'PAUSED' : 'RUNNING'}  ${fireStatus}  ${sonarStatus}${missileStatus}${resetStatus}`);
  }

  updateButtons() {
    this.updateSetupUI();
    this.updateFireButton();
    this.updateSonarButton();
    this.updateMissileButton();
  }

  updateSetupUI() {
    if (!this.setupContainer) return;
    const state = this.state ?? this.game.net.latestState;
    const player = state?.players?.[this.game.net.playerId];
    const isLobby = Boolean(state?.paused && state.reasonPaused === 'start');
    const isPaused = Boolean(state?.paused || player?.paused);
    this.setupContainer.setVisible(Boolean(isPaused));
    if (!isPaused) return;

    this.setupTitle.setText(isLobby ? 'GAME SETUP' : 'PAUSED');
    this.setupHelp.setText(isLobby ? 'Choose a vessel, color, and fog setting.' : 'Adjust setup or resume.');
    this.startButton.setText(isLobby ? 'Start' : 'Resume');

    const selectedRole = player?.role === 'destroyer' || player?.role === 'boat' ? 'destroyer' : 'submarine';
    for (const [role, btn] of Object.entries(this.roleButtons)) {
      setButtonSelected(btn, role === selectedRole);
    }

    const selectedTeam = player?.team ?? 'red';
    for (const [team, btn] of Object.entries(this.teamButtons)) {
      setButtonSelected(btn, team === selectedTeam);
    }

    const selectedVisibility = state?.visibilityMode === 'low' ? 'low' : 'clear';
    for (const [mode, btn] of Object.entries(this.visibilityButtons)) {
      setButtonSelected(btn, mode === selectedVisibility);
    }
  }

  togglePause() {
    const state = this.state ?? this.game.net.latestState;
    const player = state?.players?.[this.game.net.playerId];
    const isLobby = Boolean(state?.paused && state.reasonPaused === 'start');
    if (isLobby || player?.paused) {
      this.game.net.send('resume');
    } else {
      this.game.net.send('pause');
    }
  }

  handleKeyboardCommands() {
    const just = (name) => this.keys?.[name] && Phaser.Input.Keyboard.JustDown(this.keys[name]);
    const state = this.state ?? this.game.net.latestState;
    const player = state?.players?.[this.game.net.playerId];
    const setupOpen = Boolean(state?.paused || player?.paused);

    if (just('esc') || just('p')) {
      this.togglePause();
      return;
    }

    if (!setupOpen) return;

    if (just('enter')) this.game.net.send('resume');
    if (just('one')) this.game.net.send('select_role', { role: 'submarine' });
    if (just('two')) this.game.net.send('select_role', { role: 'destroyer' });
    if (just('three')) this.game.net.send('select_team', { team: 'red' });
    if (just('four')) this.game.net.send('select_team', { team: 'white' });
    if (just('five')) this.game.net.send('select_team', { team: 'blue' });
    if (just('six')) this.game.net.send('select_team', { team: 'yellow' });
    if (just('f')) {
      const mode = state?.visibilityMode === 'low' ? 'clear' : 'low';
      this.game.net.send('select_visibility', { mode });
    }
  }

  sendMovementInput() {
    const now = this.time.now;
    const keyboard = this.keyboardInput();
    const input = {
      throttle: clamp(keyboard.throttle + this.touchInput.throttle, -1, 1),
      turn: 0,
      dive: clamp(keyboard.dive + this.touchInput.dive, -1, 1),
      fire: Boolean(keyboard.fire || this.touchInput.fire),
      altFire: Boolean(keyboard.altFire || this.touchInput.altFire),
      sonar: Boolean(keyboard.sonar || this.touchInput.sonar),
    };
    const encoded = JSON.stringify(input);
    if (encoded === this.lastSentInput && now - this.lastInputSentAt < 250) return;
    if (now - this.lastInputSentAt < 70) return;
    this.lastSentInput = encoded;
    this.lastInputSentAt = now;
    this.game.net.send('input', input);
  }

  keyboardInput() {
    const key = (name) => this.keys?.[name]?.isDown;
    const throttle = (this.cursors?.right?.isDown || key('d') ? 1 : 0) + (this.cursors?.left?.isDown || key('a') ? -1 : 0);
    const dive = (this.cursors?.down?.isDown || key('s') ? 1 : 0) + (this.cursors?.up?.isDown || key('w') ? -1 : 0);
    const fire = key('space');
    const altFire = key('x');
    const sonar = key('q') || key('e');
    return {
      throttle: clamp(throttle, -1, 1),
      turn: 0,
      dive: clamp(dive, -1, 1),
      fire,
      altFire,
      sonar,
    };
  }

  updateFireButton() {
    const fireButton = this.rightButtons?.[1];
    if (!fireButton) return;
    const player = this.state?.players?.[this.game.net.playerId];
    const cooldownMs = Math.max(0, (player?.fireReadyAt ?? 0) - Date.now());
    const resetting = (player?.resettingUntil ?? 0) > Date.now();
    if (resetting) {
      fireButton.setText('Reset');
      fireButton.setBackgroundColor('#475569');
      fireButton.setColor('#cbd5e1');
    } else if (cooldownMs > 0) {
      fireButton.setText(`Fire ${Math.ceil(cooldownMs / 1000)}`);
      fireButton.setBackgroundColor(this.touchInput.fire ? '#facc15' : '#334155');
      fireButton.setColor(this.touchInput.fire ? '#061826' : '#cbd5e1');
    } else {
      fireButton.setText('Fire');
      fireButton.setBackgroundColor(this.touchInput.fire ? '#facc15' : '#0f3b57');
      fireButton.setColor(this.touchInput.fire ? '#061826' : '#e0f2fe');
    }
  }

  updateSonarButton() {
    const sonarButton = this.rightButtons?.[2];
    if (!sonarButton) return;
    const player = this.state?.players?.[this.game.net.playerId];
    const cooldownMs = Math.max(0, (player?.sonarReadyAt ?? 0) - Date.now());
    const resetting = (player?.resettingUntil ?? 0) > Date.now();
    if (resetting) {
      sonarButton.setText('Reset');
      sonarButton.setBackgroundColor('#475569');
      sonarButton.setColor('#cbd5e1');
    } else if (cooldownMs > 0) {
      sonarButton.setText(`Sonar ${Math.ceil(cooldownMs / 1000)}`);
      sonarButton.setBackgroundColor(this.touchInput.sonar ? '#67e8f9' : '#334155');
      sonarButton.setColor(this.touchInput.sonar ? '#061826' : '#cbd5e1');
    } else {
      sonarButton.setText('Sonar');
      sonarButton.setBackgroundColor(this.touchInput.sonar ? '#67e8f9' : '#0f3b57');
      sonarButton.setColor(this.touchInput.sonar ? '#061826' : '#e0f2fe');
    }
  }

  updateMissileButton() {
    const missileButton = this.rightButtons?.[3];
    if (!missileButton) return;
    const player = this.state?.players?.[this.game.net.playerId];
    const isSubmarine = player?.role !== 'destroyer' && player?.role !== 'boat';
    const cooldownMs = Math.max(0, (player?.missileReadyAt ?? 0) - Date.now());
    const resetting = (player?.resettingUntil ?? 0) > Date.now();
    if (!isSubmarine) {
      missileButton.setText('Missile');
      missileButton.setBackgroundColor('#475569');
      missileButton.setColor('#94a3b8');
    } else if (resetting) {
      missileButton.setText('Reset');
      missileButton.setBackgroundColor('#475569');
      missileButton.setColor('#cbd5e1');
    } else if (cooldownMs > 0) {
      missileButton.setText(`Missile ${Math.ceil(cooldownMs / 1000)}`);
      missileButton.setBackgroundColor(this.touchInput.altFire ? '#f97316' : '#334155');
      missileButton.setColor(this.touchInput.altFire ? '#061826' : '#cbd5e1');
    } else {
      missileButton.setText('Missile');
      missileButton.setBackgroundColor(this.touchInput.altFire ? '#f97316' : '#0f3b57');
      missileButton.setColor(this.touchInput.altFire ? '#061826' : '#e0f2fe');
    }
  }

  playNewHitSounds() {
    const effects = this.state?.hitEffects ?? [];
    for (const effect of effects) {
      if (!effect.id || this.seenHitEffects.has(effect.id)) continue;
      this.seenHitEffects.add(effect.id);
      this.playHitSound();
    }
    if (this.seenHitEffects.size > 80) {
      this.seenHitEffects = new Set([...this.seenHitEffects].slice(-40));
    }
  }

  playHitSound() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!this.audioContext) this.audioContext = new AudioContextClass();
      const now = this.audioContext.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        const start = now + idx * 0.045;
        osc.frequency.value = freq;
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.05, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.start(start);
        osc.stop(start + 0.2);
      });
    } catch {
      // Generated audio may be blocked until the player interacts with the page.
    }
  }

  listen(target, type, handler) {
    target.addEventListener(type, handler);
    this._listeners.push({ target, type, handler });
  }

  shutdown() {
    for (const { target, type, handler } of this._listeners) {
      target.removeEventListener(type, handler);
    }
    this._listeners = [];
    this.scale.off('resize', this.positionFixedUI, this);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isSurfaceVessel(player, world) {
  if (player.role === 'destroyer' || player.role === 'boat') return true;
  return player.y <= (world?.waterlineY ?? 160) + 174;
}

function vesselAlpha(player, localPlayer, isLocal) {
  if (isLocal) return 1;
  if (localPlayer && player.team === localPlayer.team) {
    return 0.82 + (Number(player.id ?? 0) % 3) * 0.05;
  }
  return 0.7;
}

function contactOffset(player, strength, time) {
  const uncertainty = strength < 0.45 ? 42 : 18;
  const phase = Number(player.id ?? 0) * 1.91;
  return {
    x: Math.sin(time / 430 + phase) * uncertainty,
    y: Math.cos(time / 510 + phase * 0.7) * uncertainty * 0.45,
  };
}

function worldToScreenX(worldX, cameraX, scale, width) {
  return (worldX - cameraX) * scale + width / 2;
}

function seededSpark(seed, index) {
  let hash = 2166136261;
  const text = `${seed}:${index}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const jitter = ((hash >>> 0) % 1000) / 1000;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  const speed = ((hash >>> 0) % 1000) / 1000;
  return { jitter, speed };
}

function drawLocalOutline(g, x, y, player, dir) {
  if (player.role === 'destroyer' || player.role === 'boat') {
    g.lineStyle(3, 0xffffff, 0.95);
    g.strokeRoundedRect(x - 69, y - 32, 140, 44, 10);
  }
}

function drawSubPropeller(g, x, y, dir, alpha) {
  g.lineStyle(2, 0x082f49, 0.55 * alpha);
  g.lineBetween(x + dir * 3, y, x - dir * 12, y);
  g.fillStyle(0xcbd5e1, 0.9 * alpha);
  g.fillCircle(x - dir * 14, y, 3.5);
  g.lineStyle(2, 0xe0f2fe, 0.8 * alpha);
  g.lineBetween(x - dir * 17, y - 9, x - dir * 17, y + 9);
  g.lineBetween(x - dir * 24, y - 5, x - dir * 10, y + 5);
  g.lineBetween(x - dir * 10, y - 5, x - dir * 24, y + 5);
}

function setButtonSelected(button, selected) {
  if (!button) return;
  button.setBackgroundColor(selected ? '#facc15' : '#64748b');
  button.setColor(selected ? '#061826' : '#ffffff');
}
