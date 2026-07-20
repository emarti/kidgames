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

// Switch to 'classic' to restore the earlier symmetric ellipse submarine.
const SUBMARINE_SILHOUETTE_STYLE = 'la_class';

export default class PlayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PlayScene' });
    this.state = null;
    this._listeners = [];
    this.roleButtons = {};
    this.teamButtons = {};
    this.visibilityButtons = {};
    this.reloadButtons = {};
    this.botRows = [];
    this.touchInput = { throttle: 0, turn: 0, dive: 0, fire: false, torpedo: false, altFire: false, sonar: false };
    this.touchDirs = { up: false, down: false, left: false, right: false };
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
      this.createHoldButton(width - 86, 72, 'Torpedo', { fire: true, torpedo: true }),
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
    const bg = this.add.rectangle(0, 0, 820, 640, 0xffffff, 0.95);
    this.setupContainer.add(bg);

    this.setupTitle = this.add.text(0, -284, 'GAME SETUP', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#061826',
    }).setOrigin(0.5);
    this.setupContainer.add(this.setupTitle);

    this.setupContainer.add(this.add.text(-360, -224, 'Vessel:', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '19px',
      color: '#061826',
    }).setOrigin(0, 0.5));
    this.roleButtons.submarine = this.setupButton(-192, -224, 'Submarine', () => this.game.net.send('select_role', { role: 'submarine' }));
    this.roleButtons.destroyer = this.setupButton(-24, -224, 'Destroyer', () => this.game.net.send('select_role', { role: 'destroyer' }));

    this.setupContainer.add(this.add.text(-360, -164, 'Color:', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '19px',
      color: '#061826',
    }).setOrigin(0, 0.5));
    const teams = ['red', 'white', 'blue', 'yellow'];
    teams.forEach((team, idx) => {
      this.teamButtons[team] = this.setupButton(-192 + idx * 112, -164, team.toUpperCase(), () => this.game.net.send('select_team', { team }));
    });

    this.setupContainer.add(this.add.text(-360, -104, 'Fog:', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '19px',
      color: '#061826',
    }).setOrigin(0, 0.5));
    this.visibilityButtons.clear = this.setupButton(-192, -104, 'Off', () => this.game.net.send('select_visibility', { mode: 'clear' }));
    this.visibilityButtons.low = this.setupButton(-82, -104, 'On', () => this.game.net.send('select_visibility', { mode: 'low' }));

    this.setupContainer.add(this.add.text(-360, -44, 'Reload:', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '19px',
      color: '#061826',
    }).setOrigin(0, 0.5));
    this.reloadButtons[2000] = this.setupButton(-192, -44, '2 s', () => this.game.net.send('set_reload', { ms: 2000 }));
    this.reloadButtons[5000] = this.setupButton(-82, -44, '5 s', () => this.game.net.send('set_reload', { ms: 5000 }));
    this.reloadButtons[10000] = this.setupButton(28, -44, '10 s', () => this.game.net.send('set_reload', { ms: 10000 }));

    this.setupContainer.add(this.add.text(-360, 16, 'Computer:', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '19px',
      color: '#061826',
    }).setOrigin(0, 0.5));
    this.botRows = [1, 2, 3, 4, 5, 6].map((pid, idx) => {
      const y = 54 + idx * 36;
      const label = this.add.text(-244, y, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#061826',
      }).setOrigin(0, 0.5);
      this.setupContainer.add(label);
      return {
        pid,
        label,
        primary: this.smallSetupButton(-88, y, '', () => this.handleBotPrimary(pid)),
        secondary: this.smallSetupButton(44, y, '', () => this.handleBotSecondary(pid)),
        remove: this.smallSetupButton(174, y, 'Remove', () => this.game.net.send('remove_bot', { playerId: pid })),
      };
    });

    this.setupHelp = this.add.text(0, 258, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '18px',
      color: '#0f172a',
    }).setOrigin(0.5);
    this.setupContainer.add(this.setupHelp);

    this.startButton = this.setupButton(0, 292, 'Start', () => this.game.net.send('resume'));
    this.restartSetupButton = this.setupButton(150, 292, 'Restart', () => this.game.net.send('restart'));
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

  smallSetupButton(x, y, label, callback) {
    const txt = this.add.text(x, y, label, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#64748b',
      padding: { x: 9, y: 6 },
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
    const key = String(dir).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(this.touchDirs, key)) {
      this.touchDirs[key] = Boolean(held);
    }
    this.touchInput.throttle = (this.touchDirs.right ? 1 : 0) + (this.touchDirs.left ? -1 : 0);
    this.touchInput.dive = (this.touchDirs.down ? 1 : 0) + (this.touchDirs.up ? -1 : 0);
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

    const world = state.world ?? { w: 1800, h: 1200, waterlineY: 240, vehicleLength: 200 };
    const me = state.players?.[this.game.net.playerId];
    const cameraX = world.w / 2;
    const scale = width / world.w;
    const yScale = height / world.h;
    const wrapX = Boolean(state.settings?.wrapX);
    this.view = { cameraX, scale, yScale };

    this.drawOceanFloor(g, world, cameraX, scale, yScale, width, height);
    this.drawScenery(g, state, world, cameraX, scale, yScale, width, height);

    for (const bubble of state.bubbles ?? []) {
      if (!this.shouldDrawBubble(bubble, state, me)) continue;
      const sy = bubble.y * yScale;
      if (sy < -20 || sy > height + 20) continue;
      const age = Date.now() - bubble.bornAt;
      const life = Math.max(1, bubble.lifeMs ?? 1000);
      const alpha = Math.max(0, 1 - age / life) * 0.55;
      for (const sx of screenXCopies(bubble.x, world, cameraX, scale, width, 20, false)) {
        g.lineStyle(1, 0xe0f2fe, alpha);
        g.strokeCircle(sx, sy, Math.max(2, (bubble.radius ?? 4) * scale));
      }
    }

    this.drawVehicleTrails(g, state, world, cameraX, scale, yScale, width, height);
    this.drawWeapons(g, state, world, cameraX, scale, yScale, width, height);
    this.drawSonarPulses(g, state, world, cameraX, scale, yScale, width, height);

    for (const player of Object.values(state.players ?? {})) {
      if (!player.connected) continue;
      const sy = player.y * yScale;
      if (sy < -80 || sy > height + 80) continue;
      const contact = this.contactFor(player, state, me);
      if (contact.strength < 0.2) continue;
      for (const sx of screenXCopies(player.x, world, cameraX, scale, width, 90, wrapX)) {
        if (contact.strength < 0.75) {
          const offset = contactOffset(player, contact.strength, this.renderTime);
          this.drawPassiveContact(g, sx + offset.x, sy + offset.y, player, contact, world);
        } else {
          this.drawVessel(g, sx, sy, player, player.id === this.game.net.playerId, me, world, yScale);
        }
      }
    }

    this.drawHitEffects(g, state, world, cameraX, scale, yScale, width, height);

    if (!wrapX) this.drawWorldEdges(g, world, cameraX, scale, width, height);
    this.drawWorldFrame(g, width, height);
  }

  shouldDrawBubble(bubble, state, me) {
    if (state?.visibilityMode !== 'low') return true;
    if (!me) return false;
    const owner = state.players?.[bubble.owner];
    return Boolean(owner && owner.team === me.team);
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

  drawScenery(g, state, world, cameraX, scale, yScale, width, height) {
    const scenery = world?.scenery;
    if (!scenery) return;
    const t = this.renderTime / 1000;
    const s = Math.max(0.55, Math.min(1, 1200 / (world?.w ?? 1200)));

    for (const school of scenery.fishSchools ?? []) {
      const dir = school.dir >= 0 ? 1 : -1;
      const baseX = wrapCoordinateClient((school.x ?? 0) + dir * (school.speed ?? 0) * t, world.w);
      const baseY = school.y ?? world.waterlineY + 200;
      const count = school.count ?? 8;
      const spread = school.spread ?? 80;
      for (let i = 0; i < count; i += 1) {
        const localX = ((i % 5) - 2) * (spread / 5);
        const localY = (Math.floor(i / 5) - 1) * 14 + Math.sin(t * 1.5 + i) * 3;
        const fishX = wrapCoordinateClient(baseX + localX, world.w);
        const fishY = baseY + localY;
        for (const sx of screenXCopies(fishX, world, cameraX, scale, width, 20, false)) {
          this.drawFish(g, sx, fishY * yScale, dir, 10 * s, hexColor(school.color, 0xb7f7ff), 0.42);
        }
      }
    }

    for (const fish of scenery.fish ?? []) {
      const dir = fish.dir >= 0 ? 1 : -1;
      const x = wrapCoordinateClient((fish.x ?? 0) + dir * (fish.speed ?? 0) * t, world.w);
      const y = (fish.y ?? world.waterlineY + 300) + Math.sin(t * 0.9 + String(fish.id).length) * 6;
      for (const sx of screenXCopies(x, world, cameraX, scale, width, 40, false)) {
        this.drawFish(g, sx, y * yScale, dir, 24 * (fish.size ?? 1) * s, 0x93c5fd, 0.46);
      }
    }

    for (const mammal of scenery.mammals ?? []) {
      const dir = mammal.dir >= 0 ? 1 : -1;
      const x = wrapCoordinateClient((mammal.x ?? 0) + dir * (mammal.speed ?? 0) * t, world.w);
      const y = (mammal.y ?? world.waterlineY + 420) + Math.sin(t * 0.45 + String(mammal.id).length) * 10;
      for (const sx of screenXCopies(x, world, cameraX, scale, width, 90, false)) {
        if (mammal.kind === 'spermWhale') {
          this.drawWhale(g, sx, y * yScale, dir, (mammal.size ?? 1) * s);
        } else {
          this.drawDolphin(g, sx, y * yScale, dir, (mammal.size ?? 1) * s);
        }
      }
    }

    for (const crab of scenery.crabs ?? []) {
      const x = (crab.x ?? world.w * 0.5) + Math.sin(t * 0.7) * 8 * (crab.dir ?? 1);
      const y = crab.y ?? world.h - 90;
      for (const sx of screenXCopies(x, world, cameraX, scale, width, 30, false)) {
        this.drawCrab(g, sx, y * yScale, (crab.size ?? 1) * s);
      }
    }
  }

  drawFish(g, x, y, dir, size, color, alpha) {
    g.fillStyle(color, alpha);
    g.fillEllipse(x, y, size * 1.5, size * 0.68);
    g.fillTriangle(x - dir * size * 0.75, y, x - dir * size * 1.16, y - size * 0.38, x - dir * size * 1.16, y + size * 0.38);
    g.fillStyle(0xffffff, alpha * 0.75);
    g.fillCircle(x + dir * size * 0.42, y - size * 0.08, Math.max(1, size * 0.08));
  }

  drawDolphin(g, x, y, dir, scale) {
    g.fillStyle(0x94a3b8, 0.34);
    g.fillEllipse(x, y, 72 * scale, 20 * scale);
    g.fillTriangle(x - dir * 34 * scale, y, x - dir * 52 * scale, y - 12 * scale, x - dir * 48 * scale, y + 10 * scale);
    g.fillTriangle(x, y - 7 * scale, x - dir * 12 * scale, y - 25 * scale, x + dir * 10 * scale, y - 8 * scale);
    g.fillStyle(0xcbd5e1, 0.28);
    g.fillEllipse(x + dir * 31 * scale, y - 2 * scale, 18 * scale, 7 * scale);
  }

  drawWhale(g, x, y, dir, scale) {
    g.fillStyle(0x334155, 0.34);
    g.fillEllipse(x, y, 126 * scale, 34 * scale);
    g.fillRoundedRect(x + dir * 20 * scale, y - 12 * scale, 42 * scale, 23 * scale, 9 * scale);
    g.fillTriangle(x - dir * 63 * scale, y, x - dir * 88 * scale, y - 18 * scale, x - dir * 86 * scale, y + 17 * scale);
    g.fillStyle(0xe2e8f0, 0.18);
    g.fillEllipse(x + dir * 28 * scale, y + 9 * scale, 58 * scale, 10 * scale);
  }

  drawCrab(g, x, y, scale) {
    g.fillStyle(0xf97316, 0.42);
    g.fillEllipse(x, y, 24 * scale, 14 * scale);
    g.fillCircle(x - 18 * scale, y - 5 * scale, 5 * scale);
    g.fillCircle(x + 18 * scale, y - 5 * scale, 5 * scale);
    g.lineStyle(2, 0xf97316, 0.35);
    for (let i = -1; i <= 1; i += 1) {
      g.lineBetween(x - 5 * scale, y + i * 3 * scale, x - 22 * scale, y + (i * 7 + 6) * scale);
      g.lineBetween(x + 5 * scale, y + i * 3 * scale, x + 22 * scale, y + (i * 7 + 6) * scale);
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

  drawWeapons(g, state, world, cameraX, scale, yScale, width, height) {
    const wrapX = Boolean(state.settings?.wrapX);
    for (const torpedo of state.torpedoes ?? []) {
      const sy = torpedo.y * yScale;
      if (sy < -40 || sy > height + 40) continue;
      const dir = Math.cos(torpedo.heading ?? 0) >= 0 ? 1 : -1;
      for (const sx of screenXCopies(torpedo.x, world, cameraX, scale, width, 80, wrapX)) {
        g.lineStyle(4, 0xfef3c7, 0.8);
        g.lineBetween(sx - dir * 34, sy, sx - dir * 9, sy);
        g.fillStyle(0xfacc15, 0.95);
        g.fillEllipse(sx, sy, 34, 10);
        g.fillTriangle(sx + dir * 18, sy, sx + dir * 4, sy - 8, sx + dir * 4, sy + 8);
        g.lineStyle(1, 0x0f172a, 0.55);
        g.strokeEllipse(sx, sy, 34, 10);
      }
    }

    for (const charge of state.depthCharges ?? []) {
      const sy = charge.y * yScale;
      if (sy < -40 || sy > height + 80) continue;
      for (const sx of screenXCopies(charge.x, world, cameraX, scale, width, 80, false)) {
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
    }

    for (const missile of state.missiles ?? []) {
      const sy = missile.y * yScale;
      const radius = Math.max(18, (missile.radius ?? 20) * scale);
      if (sy < -120 || sy > height + 120) continue;
      for (const sx of screenXCopies(missile.x, world, cameraX, scale, width, 120, false)) {

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
  }

  drawSonarPulses(g, state, world, cameraX, scale, yScale, width, height) {
    const now = Date.now();
    const localPlayer = state.players?.[this.game.net.playerId];
    for (const pulse of state.pulses ?? []) {
      if (!sonarPulseVisibleToLocal(pulse, localPlayer, world, state)) continue;
      const sy = pulse.y * yScale;
      const age = now - pulse.bornAt;
      const life = Math.max(1, pulse.lifeMs ?? 1600);
      if (age < 0 || age > life) continue;
      const t = clamp(age / life, 0, 1);
      const alpha = Math.max(0, 1 - t) * 0.65;
      const radius = Math.max(12, (pulse.maxRadius ?? 420) * scale * (1 - Math.pow(1 - t, 2)));
      if (sy + radius < -20 || sy - radius > height + 20) continue;
      for (const sx of screenXCopies(pulse.x, world, cameraX, scale, width, radius + 20, false)) {

        g.lineStyle(4, 0xbae6fd, alpha);
        g.strokeCircle(sx, sy, radius);
        g.lineStyle(2, 0xffffff, alpha * 0.7);
        g.strokeCircle(sx, sy, radius * 0.72);
        g.fillStyle(0xe0f2fe, alpha * 0.45);
        g.fillCircle(sx, sy, Math.max(3, 6 * (1 - t)));
      }
    }
  }

  drawHitEffects(g, state, world, cameraX, scale, yScale, width, height) {
    const now = Date.now();
    for (const effect of state.hitEffects ?? []) {
      const sy = effect.y * yScale;
      if (sy < -120 || sy > height + 120) continue;
      const age = now - effect.bornAt;
      const life = Math.max(1, effect.lifeMs ?? 1200);
      const t = clamp(age / life, 0, 1);
      const alpha = Math.max(0, 1 - t * 0.7);
      const ease = 1 - Math.pow(1 - t, 2);
      const base = String(effect.id ?? `${effect.x}-${effect.y}`);
      const burstScale = Math.max(0.62, Math.min(scale, yScale) * 1.8);
      for (const sx of screenXCopies(effect.x, world, cameraX, scale, width, 120, false)) {

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
  }

  drawVessel(g, x, y, player, isLocal, localPlayer, world, yScale) {
    const color = TEAM_COLORS[player.team] ?? 0xffffff;
    const resetting = player.resettingUntil && Date.now() < player.resettingUntil;
    const alpha = resetting ? 0.42 : vesselAlpha(player, localPlayer, isLocal);
    const dir = Math.cos(player.heading ?? 0) >= 0 ? 1 : -1;
    const surfaced = isSurfaceVessel(player, world);
    const s = Math.max(0.64, Math.min(1, 1200 / (world?.w ?? 1200)));

    if (player.role === 'destroyer' || player.role === 'boat') {
      const bow = x + dir * 72 * s;
      const stern = x - dir * 70 * s;
      g.lineStyle(2, 0x082f49, 0.78);
      g.beginPath();
      g.moveTo(stern, y - 8 * s);
      g.lineTo(bow - dir * 16 * s, y - 11 * s);
      g.lineTo(bow, y - 3 * s);
      g.lineTo(bow - dir * 12 * s, y + 11 * s);
      g.lineTo(stern + dir * 10 * s, y + 12 * s);
      g.lineTo(stern - dir * 2 * s, y + 2 * s);
      g.closePath();
      g.strokePath();
      g.fillStyle(color, alpha);
      g.beginPath();
      g.moveTo(stern, y - 8 * s);
      g.lineTo(bow - dir * 16 * s, y - 11 * s);
      g.lineTo(bow, y - 3 * s);
      g.lineTo(bow - dir * 12 * s, y + 11 * s);
      g.lineTo(stern + dir * 10 * s, y + 12 * s);
      g.lineTo(stern - dir * 2 * s, y + 2 * s);
      g.closePath();
      g.fillPath();
      g.fillStyle(0x64748b, alpha * 0.95);
      g.fillRoundedRect(x - 22 * s, y - 29 * s, 42 * s, 18 * s, 4 * s);
      g.fillStyle(0x94a3b8, alpha * 0.95);
      g.fillRoundedRect(x - 5 * s, y - 42 * s, 22 * s, 14 * s, 3 * s);
      g.fillStyle(0x0f172a, alpha * 0.82);
      g.fillRect(x + dir * 36 * s - 11 * s, y - 18 * s, 22 * s, 6 * s);
      g.fillCircle(x + dir * 49 * s, y - 15 * s, 5 * s);
      g.fillStyle(0xe0f2fe, alpha * 0.9);
      g.fillRect(x + dir * 2 * s - 8 * s, y - 24 * s, 16 * s, 5 * s);
      g.lineStyle(2, 0x061826, 0.65);
      g.lineBetween(x - 58 * s, y + 8 * s, x + 58 * s, y + 8 * s);
      g.lineStyle(2, 0x0f172a, 0.7);
      g.lineBetween(x + dir * 4 * s, y - 42 * s, x + dir * 4 * s, y - 58 * s);
      g.lineBetween(x + dir * 4 * s, y - 55 * s, x + dir * 22 * s, y - 55 * s);
      if (isLocal) drawLocalOutline(g, x, y, player, dir, s);
      return;
    }

    if (SUBMARINE_SILHOUETTE_STYLE === 'classic') {
      this.drawClassicSubmarine(g, x, y, color, alpha, dir, surfaced, world, yScale, s);
    } else {
      this.drawLaClassSubmarine(g, x, y, color, alpha, dir, surfaced, world, yScale, s);
    }
    if (isLocal) drawLocalOutline(g, x, y, player, dir, s);
  }

  drawClassicSubmarine(g, x, y, color, alpha, dir, surfaced, world, yScale, s) {
    g.lineStyle(surfaced ? 2 : 3, surfaced ? 0xf8fafc : 0x0f172a, surfaced ? 0.75 : 0.58);
    g.strokeEllipse(x, y, 132 * s, (surfaced ? 26 : 31) * s);
    g.fillStyle(color, alpha);
    g.fillEllipse(x, y, 126 * s, (surfaced ? 24 : 30) * s);
    g.fillRoundedRect(x - 11 * s, y - (surfaced ? 23 : 25) * s, 26 * s, 18 * s, 5 * s);
    if (surfaced) {
      const waterlineY = (world?.waterlineY ?? 160) * (yScale ?? 1);
      g.lineStyle(2, 0xe0f2fe, 0.8);
      g.lineBetween(x + 2 * s, y - 25 * s, x + 2 * s, waterlineY - 7 * s);
      g.lineBetween(x + 2 * s, waterlineY - 7 * s, x + 16 * dir * s, waterlineY - 7 * s);
    } else {
      g.fillStyle(0x082f49, 0.22);
      g.fillEllipse(x, y + 3 * s, 108 * s, 18 * s);
    }
    drawSubPropeller(g, x - 70 * dir * s, y, dir, alpha, s);
  }

  drawLaClassSubmarine(g, x, y, color, alpha, dir, surfaced, world, yScale, s) {
    const bowTipX = x + dir * 84 * s;
    const bowNoseX = x + dir * 78 * s;
    const bowShoulderX = x + dir * 61 * s;
    const foreBodyX = x + dir * 36 * s;
    const aftBodyX = x - dir * 36 * s;
    const sternShoulderX = x - dir * 58 * s;
    const sternNeckX = x - dir * 73 * s;
    const sternX = x - dir * 84 * s;
    const topY = y - (surfaced ? 11 : 14) * s;
    const bottomY = y + (surfaced ? 11 : 14) * s;
    const sternTopY = y - 4 * s;
    const sternBottomY = y + 4 * s;

    const traceHull = () => {
      g.moveTo(sternX, sternTopY);
      g.lineTo(sternNeckX, y - 6 * s);
      g.lineTo(sternShoulderX, y - 9 * s);
      g.lineTo(aftBodyX, topY);
      g.lineTo(foreBodyX, topY);
      g.lineTo(bowShoulderX, y - (surfaced ? 10 : 12) * s);
      g.lineTo(bowNoseX, y - 5 * s);
      g.lineTo(bowTipX, y);
      g.lineTo(bowNoseX, y + 5 * s);
      g.lineTo(bowShoulderX, y + (surfaced ? 10 : 12) * s);
      g.lineTo(foreBodyX, bottomY);
      g.lineTo(aftBodyX, bottomY);
      g.lineTo(sternShoulderX, y + 9 * s);
      g.lineTo(sternNeckX, y + 6 * s);
      g.lineTo(sternX, sternBottomY);
      g.closePath();
    };

    g.lineStyle(surfaced ? 2 : 3, surfaced ? 0xf8fafc : 0x0f172a, surfaced ? 0.75 : 0.58);
    g.beginPath();
    traceHull();
    g.strokePath();

    g.fillStyle(color, alpha);
    g.beginPath();
    traceHull();
    g.fillPath();

    const sailX = x + dir * 24 * s;
    g.fillStyle(color, alpha * 0.92);
    g.fillRoundedRect(sailX - 13 * s, y - (surfaced ? 31 : 34) * s, 30 * s, 21 * s, 5 * s);
    g.fillStyle(0x0f172a, alpha * 0.28);
    g.fillRect(sailX - 9 * s, y - (surfaced ? 20 : 23) * s, 23 * s, 4 * s);

    g.fillStyle(0x082f49, alpha * 0.34);
    g.fillTriangle(sternShoulderX, y - 7 * s, sternShoulderX - dir * 15 * s, y - 18 * s, sternShoulderX - dir * 7 * s, y - 5 * s);
    g.fillTriangle(sternShoulderX, y + 7 * s, sternShoulderX - dir * 15 * s, y + 18 * s, sternShoulderX - dir * 7 * s, y + 5 * s);
    g.fillTriangle(sternX + dir * 4 * s, y, sternX - dir * 9 * s, y - 4 * s, sternX - dir * 9 * s, y + 4 * s);

    if (surfaced) {
      const waterlineY = (world?.waterlineY ?? 160) * (yScale ?? 1);
      g.lineStyle(2, 0xe0f2fe, 0.8);
      g.lineBetween(sailX + 2 * dir * s, y - 34 * s, sailX + 2 * dir * s, waterlineY - 7 * s);
      g.lineBetween(sailX + 2 * dir * s, waterlineY - 7 * s, sailX + 15 * dir * s, waterlineY - 7 * s);
    } else {
      g.fillStyle(0x082f49, 0.22);
      g.fillEllipse(x - dir * 8 * s, y + 4 * s, 108 * s, 17 * s);
    }

    drawSubPropeller(g, x - 91 * dir * s, y, dir, alpha * 0.72, s * 0.5);
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
    const reload = `RELOAD ${Math.ceil((state.settings?.reloadMs ?? 10000) / 1000)}S`;
    const cooldownMs = Math.max(0, (player?.fireReadyAt ?? 0) - Date.now());
    const primaryLabel = role === 'submarine' ? 'TORPEDO' : 'CHARGE';
    const fireStatus = cooldownMs > 0 ? `${primaryLabel} ${Math.ceil(cooldownMs / 1000)}s` : `${primaryLabel} READY`;
    const sonarMs = Math.max(0, (player?.sonarReadyAt ?? 0) - Date.now());
    const sonarStatus = sonarMs > 0 ? `SONAR ${Math.ceil(sonarMs / 1000)}s` : 'SONAR READY';
    const missileMs = Math.max(0, (player?.missileReadyAt ?? 0) - Date.now());
    const missileStatus = role === 'submarine'
      ? (missileMs > 0 ? `  MISSILE ${Math.ceil(missileMs / 1000)}s` : '  MISSILE READY')
      : '';
    const resetMs = Math.max(0, (player?.resettingUntil ?? 0) - Date.now());
    const resetStatus = resetMs > 0 ? `  RESET ${Math.ceil(resetMs / 1000)}s` : '';
    const runState = player?.paused ? 'PAUSED' : (state.paused ? 'WAITING' : 'RUNNING');
    this.statusText.setText(`${role.toUpperCase()}  ${team.toUpperCase()}  ${fog}  ${reload}  ${runState}  ${fireStatus}  ${sonarStatus}${missileStatus}${resetStatus}`);
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
    const isPaused = Boolean(isLobby || player?.paused);
    this.setupContainer.setVisible(Boolean(isPaused));
    if (!isPaused) return;

    this.setupTitle.setText(isLobby ? 'GAME SETUP' : 'PAUSED');
    this.setupHelp.setText(isLobby ? 'Choose a vessel, color, fog, and reload time.' : 'Adjust setup or resume.');
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

    const reloadMs = [2000, 5000, 10000].includes(Number(state?.settings?.reloadMs))
      ? Number(state.settings.reloadMs)
      : 10000;
    for (const [ms, btn] of Object.entries(this.reloadButtons)) {
      setButtonSelected(btn, Number(ms) === reloadMs);
    }

    this.updateBotRows(state);
  }

  updateBotRows(state) {
    for (const row of this.botRows ?? []) {
      const player = state?.players?.[row.pid];
      if (!player?.connected) {
        row.label.setText(`P${row.pid}: Empty`);
        setSetupButton(row.primary, 'Sub Bot', true);
        setSetupButton(row.secondary, 'Destroyer Bot', true);
        setSetupButton(row.remove, 'Remove', false);
        continue;
      }

      const role = player.role === 'destroyer' || player.role === 'boat' ? 'Destroyer' : 'Submarine';
      const team = String(player.team ?? 'red').toUpperCase();
      if (player.bot) {
        row.label.setText(`P${row.pid}: Bot ${role} ${team}`);
        setSetupButton(row.primary, `Role: ${role}`, true);
        setSetupButton(row.secondary, `Team: ${team}`, true);
        setSetupButton(row.remove, 'Remove', true);
      } else {
        row.label.setText(`P${row.pid}: Human ${role} ${team}`);
        setSetupButton(row.primary, 'Human', false);
        setSetupButton(row.secondary, '', false);
        setSetupButton(row.remove, '', false);
      }
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

  handleBotPrimary(pid) {
    const player = this.state?.players?.[pid];
    if (!player?.connected) {
      this.game.net.send('add_bot', { playerId: pid, role: 'submarine' });
      return;
    }
    if (!player.bot) return;
    const role = player.role === 'destroyer' || player.role === 'boat' ? 'submarine' : 'destroyer';
    this.game.net.send('configure_bot', { playerId: pid, role });
  }

  handleBotSecondary(pid) {
    const player = this.state?.players?.[pid];
    if (!player?.connected) {
      this.game.net.send('add_bot', { playerId: pid, role: 'destroyer' });
      return;
    }
    if (!player.bot) return;
    const teams = ['red', 'white', 'blue', 'yellow'];
    const idx = teams.indexOf(player.team);
    const team = teams[(idx + 1 + teams.length) % teams.length];
    this.game.net.send('configure_bot', { playerId: pid, team });
  }

  handleKeyboardCommands() {
    const just = (name) => this.keys?.[name] && Phaser.Input.Keyboard.JustDown(this.keys[name]);
    const state = this.state ?? this.game.net.latestState;
    const player = state?.players?.[this.game.net.playerId];
    const setupOpen = Boolean((state?.paused && state.reasonPaused === 'start') || player?.paused);

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
      torpedo: Boolean(keyboard.fire || this.touchInput.fire || this.touchInput.torpedo),
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
    const isSubmarine = player?.role !== 'destroyer' && player?.role !== 'boat';
    const label = isSubmarine ? 'Torpedo' : 'Charge';
    const cooldownMs = Math.max(0, (player?.fireReadyAt ?? 0) - Date.now());
    const resetting = (player?.resettingUntil ?? 0) > Date.now();
    if (resetting) {
      fireButton.setText('Reset');
      fireButton.setBackgroundColor('#475569');
      fireButton.setColor('#cbd5e1');
    } else if (cooldownMs > 0) {
      fireButton.setText(`${label} ${Math.ceil(cooldownMs / 1000)}`);
      fireButton.setBackgroundColor(this.touchInput.fire ? '#facc15' : '#334155');
      fireButton.setColor(this.touchInput.fire ? '#061826' : '#cbd5e1');
    } else {
      fireButton.setText(label);
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
    return 0.8;
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

function sonarPulseVisibleToLocal(pulse, localPlayer, world, state) {
  if (!pulse || !localPlayer?.connected) return false;
  if (pulse.team === localPlayer.team) return true;
  const radius = pulse.maxRadius ?? 420;
  return worldDistance(pulse, localPlayer, world) <= radius;
}

function worldDistance(a, b, world) {
  const dx = wrappedDeltaClient((a?.x ?? 0) - (b?.x ?? 0), world?.w ?? 1800, false);
  return Math.hypot(dx, (a?.y ?? 0) - (b?.y ?? 0));
}

function wrappedDeltaClient(dx, size, wrapX) {
  if (!wrapX) return dx;
  if (dx > size / 2) return dx - size;
  if (dx < -size / 2) return dx + size;
  return dx;
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

function drawLocalOutline(g, x, y, player, dir, scale = 1) {
  if (player.role === 'destroyer' || player.role === 'boat') {
    g.lineStyle(3, 0xffffff, 0.95);
    g.strokeRoundedRect(x - 69 * scale, y - 32 * scale, 140 * scale, 44 * scale, 10 * scale);
  }
}

function drawSubPropeller(g, x, y, dir, alpha, scale = 1) {
  g.lineStyle(2, 0x082f49, 0.55 * alpha);
  g.lineBetween(x + dir * 3 * scale, y, x - dir * 12 * scale, y);
  g.fillStyle(0xcbd5e1, 0.9 * alpha);
  g.fillCircle(x - dir * 14 * scale, y, 3.5 * scale);
  g.lineStyle(2, 0xe0f2fe, 0.8 * alpha);
  g.lineBetween(x - dir * 17 * scale, y - 9 * scale, x - dir * 17 * scale, y + 9 * scale);
  g.lineBetween(x - dir * 24 * scale, y - 5 * scale, x - dir * 10 * scale, y + 5 * scale);
  g.lineBetween(x - dir * 10 * scale, y - 5 * scale, x - dir * 24 * scale, y + 5 * scale);
}

function setButtonSelected(button, selected) {
  if (!button) return;
  button.setBackgroundColor(selected ? '#facc15' : '#64748b');
  button.setColor(selected ? '#061826' : '#ffffff');
}

function setSetupButton(button, label, enabled) {
  if (!button) return;
  button.setText(label);
  button.setVisible(Boolean(enabled));
  button.disableInteractive();
  if (enabled) {
    button.setInteractive({ useHandCursor: true });
    button.setBackgroundColor('#64748b');
    button.setColor('#ffffff');
  }
}

function screenXCopies(worldX, world, cameraX, scale, width, pad, wrapX) {
  const sx = worldToScreenX(worldX, cameraX, scale, width);
  const copies = [];
  if (sx >= -pad && sx <= width + pad) copies.push(sx);
  if (!wrapX) return copies;
  const left = worldToScreenX((worldX ?? 0) - (world?.w ?? 0), cameraX, scale, width);
  const right = worldToScreenX((worldX ?? 0) + (world?.w ?? 0), cameraX, scale, width);
  if (left >= -pad && left <= width + pad) copies.push(left);
  if (right >= -pad && right <= width + pad) copies.push(right);
  return copies;
}

function wrapCoordinateClient(value, size) {
  let n = Number(value) || 0;
  n %= size;
  if (n < 0) n += size;
  return n;
}

function hexColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const n = Number.parseInt(value.replace('#', ''), 16);
  return Number.isFinite(n) ? n : fallback;
}
