import Phaser from 'phaser';

const WORLD_W = 800;
const WORLD_H = 600;
const TARGET_RADIUS = 22;
const PROJECTILE_RADIUS = 10;
// Planet display names
const PLANET_LABELS = {
  earth: 'Earth',
  mars: 'Mars',
  moon: 'Moon',
  enceladus: 'Enceladus',
};

function hexToInt(hex) {
  return parseInt(String(hex).replace('#', '0x'), 16);
}

// Rotate point (dx,dy) around origin by angle a, then offset by (cx,cy)
function rot(cx, cy, a, dx, dy) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

// ---------------------------------------------------------------------------
// Avatar display names
// ---------------------------------------------------------------------------
const AVATAR_LABELS = {
  hunter: 'Hunter',
  mrwhatwhat: 'Mr. What What',
  chaihou: 'Chaihou',
  taolabi: 'Taolabi',
  chichi: 'Chichi Gonju',
  starway: 'Starway',
  brillan: 'Brillan',
};

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export default class PlayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PlayScene' });
    this.state = null;
    this.aimAngle = 45;
    this.aimPower = 50;
    this.isDragging = false;
    this.myArrowTip = null; // cached {x, y} of current arrow tip in screen coords
    // Effects state
    this.fireworks = [];
    this.prevTargetHits = {}; // track previous hit states to detect new hits
    this.prevLevelComplete = false;
    this.celebrationStartedAt = 0; // timestamp when level complete celebration started
    this.rainbowColors = [
      0xFF0000, 0xFF7F00, 0xFFFF00, 0x00FF00,
      0x00FFFF, 0x0000FF, 0x8A2BE2, 0xFF00FF,
    ];
  }

  create() {
    this.graphics = this.add.graphics();
    this.fxGraphics = this.add.graphics().setDepth(70);

    // --- Setup / Pause container (matches maze/snake pattern) ---
    this.setupContainer = this.add.container(400, 300);
    this.setupContainer.setDepth(500);
    this.createSetupUI();
    this.setupContainer.setVisible(false);

    // --- HUD ---
    this.levelText = this.add.text(10, 10, '', {
      fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setDepth(50);

    this.aimText = this.add.text(10, 35, '', {
      fontSize: '16px', color: '#ffd24d',
      stroke: '#000000', strokeThickness: 2,
    }).setDepth(50);

    this.roomText = this.add.text(WORLD_W - 10, 10, '', {
      fontSize: '14px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(1, 0).setDepth(50);

    // Level complete banner
    this.completeBanner = this.add.text(
      WORLD_W / 2, WORLD_H / 2 - 60,
      '', { fontSize: '32px', color: '#4dff4d', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 4 }
    ).setOrigin(0.5).setDepth(80).setVisible(false);

    this.nextLevelBtn = this.add.text(
      WORLD_W / 2, WORLD_H / 2,
      'Next Level', {
        fontSize: '26px', color: '#1a1a2e',
        backgroundColor: '#4dff4d', padding: { x: 14, y: 8 },
      }
    ).setOrigin(0.5).setDepth(80).setInteractive({ useHandCursor: true }).setVisible(false);
    this.nextLevelBtn.on('pointerdown', () => this.game.net.send('next_level'));

    // Fire button (positioned below player each frame)
    this.fireBtn = this.add.text(
      100, WORLD_H - 30,
      'FIRE!', {
        fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
        backgroundColor: '#cc3333', padding: { x: 16, y: 8 },
      }
    ).setOrigin(0.5).setDepth(50).setInteractive({ useHandCursor: true });
    this.fireBtn.on('pointerdown', () => {
      this.game.net.send('input', { action: 'aim', angle: this.aimAngle, power: this.aimPower });
      this.game.net.send('input', { action: 'fire' });
    });
    this.fireBtn.on('pointerover', () => this.fireBtn.setBackgroundColor('#ee4444'));
    this.fireBtn.on('pointerout', () => this.fireBtn.setBackgroundColor('#cc3333'));

    // Pause button (top-left, large)
    this.pauseBtn = this.add.text(
      10, 62,
      'Pause', {
        fontSize: '26px', color: '#1a1a2e',
        backgroundColor: '#94a3b8', padding: { x: 16, y: 8 },
      }
    ).setOrigin(0, 0).setDepth(50).setInteractive({ useHandCursor: true });
    this.pauseBtn.on('pointerdown', () => {
      if (!this.state) return;
      if (!this.state.paused) this.game.net.send('pause');
      else this.game.net.send('resume');
    });
    this.pauseBtn.on('pointerover', () => this.pauseBtn.setBackgroundColor('#a3b8c5'));
    this.pauseBtn.on('pointerout', () => this.pauseBtn.setBackgroundColor('#94a3b8'));

    // --- Drag to aim ---
    this.input.on('pointerdown', (pointer) => {

      // Block aim when setup overlay is visible (global or individual pause)
      if (this.state) {
        if (this.state.paused) return;
        const net = this.game.net;
        const me = net.playerId ? this.state.players[net.playerId] : null;
        if (me && me.paused) return;

        // Exclude clicks below the player's ground level (fire button area)
        if (me) {
          const cam = this.cameras.main;
          const groundScreenY = (me.y / WORLD_H) * cam.height;
          if (pointer.y > groundScreenY) return;
        }
      }

      // Check if pointer is near the arrow tip — start drag (60px radius)
      if (this.myArrowTip) {
        const dx = pointer.x - this.myArrowTip.x;
        const dy = pointer.y - this.myArrowTip.y;
        if (dx * dx + dy * dy < 3600) { // within 60px
          this.isDragging = true;
          return;
        }
      }

      // Otherwise treat as click-to-aim (tap anywhere to set aim)
      this.handleAimClick(pointer.x, pointer.y);
    });

    this.input.on('pointermove', (pointer) => {
      if (!this.isDragging || !pointer.isDown) {
        this.isDragging = false;
        return;
      }
      this.handleAimClick(pointer.x, pointer.y);
    });

    this.input.on('pointerup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.game.net.send('input', { action: 'aim', angle: this.aimAngle, power: this.aimPower });
      }
    });

    // --- Keyboard: Space/P for pause/resume ---
    this.input.keyboard.on('keydown-SPACE', () => {
      const net = this.game.net;
      if (!this.state) return;
      if (this.state.paused && this.state.reasonPaused === 'start') {
        net.send('resume');
      } else if (this.state.paused) {
        net.send('resume');
      } else {
        net.send('pause');
      }
    });
    this.input.keyboard.on('keydown-P', () => {
      const net = this.game.net;
      if (!this.state) return;
      if (!this.state.paused) net.send('pause');
      else net.send('resume');
    });

    // --- Networking ---
    const net = this.game.net;
    this._onState = (e) => { this.state = e.detail; };
    net.addEventListener('state', this._onState);

    this.roomText.setText(`Room: ${net.roomId || '?'}`);

    if (net.latestState) {
      this.state = net.latestState;
      const me = this.state.players[net.playerId];
      if (me) { this.aimAngle = me.aimAngle; this.aimPower = me.aimPower; }
    }
  }

  // -----------------------------------------------------------------------
  // Aim (click or drag) — arrow tip matches cursor position
  // -----------------------------------------------------------------------
  handleAimClick(clickX, clickY) {
    const net = this.game.net;
    if (!this.state || !net.playerId) return;
    const me = this.state.players[net.playerId];
    if (!me) return;

    const cam = this.cameras.main;
    const s = Math.min(cam.width / WORLD_W, cam.height / WORLD_H);
    const sx = this.wx(me.x, cam);
    // Use arrow origin (above ground), not ground position
    const originSY = this.wy(me.y, cam) - 20 * s;

    const dx = clickX - sx;
    const dy = originSY - clickY; // positive = above origin
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    angleDeg = Math.max(5, Math.min(85, angleDeg));
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = Math.min(cam.width, cam.height) * 0.4;
    const power = Math.max(5, Math.min(100, (dist / maxDist) * 100));

    this.aimAngle = Math.round(angleDeg);
    this.aimPower = Math.round(power);

    // During drag, send aim continuously; on click, send once
    if (!this.isDragging) {
      net.send('input', { action: 'aim', angle: this.aimAngle, power: this.aimPower });
    }
  }

  wx(worldX, cam) { return (worldX / WORLD_W) * cam.width; }
  wy(worldY, cam) { return (worldY / WORLD_H) * cam.height; }

  // -----------------------------------------------------------------------
  // Terrain height helper (client-side, mirrors server)
  // -----------------------------------------------------------------------
  terrainGroundY(terrain, worldX) {
    if (!terrain) return WORLD_H;
    const idx = worldX / terrain.step;
    const i0 = Math.max(0, Math.min(Math.floor(idx), terrain.heights.length - 1));
    const i1 = Math.min(i0 + 1, terrain.heights.length - 1);
    const frac = idx - Math.floor(idx);
    const h = terrain.heights[i0] * (1 - frac) + terrain.heights[i1] * frac;
    return WORLD_H - h;
  }

  // -----------------------------------------------------------------------
  // Update (called every frame)
  // -----------------------------------------------------------------------
  update() {
    if (!this.state) return;
    const now = this.time.now;
    const cam = this.cameras.main;
    const scaleX = cam.width / WORLD_W;
    const scaleY = cam.height / WORLD_H;
    const g = this.graphics;
    g.clear();

    // Hide angle finder text if not dragging
    if (this._angleFinderText && !this.isDragging) {
      this._angleFinderText.setVisible(false);
    }

    // --- Detect new target hits → rainbow explosion ---
    // Reset tracking when targets change (new level)
    if (this.state.targets.length > 0 && !(this.state.targets[0].id in this.prevTargetHits)) {
      this.prevTargetHits = {};
    }
    for (const t of this.state.targets) {
      if (t.hit && !this.prevTargetHits[t.id]) {
        this.spawnRainbowExplosion(t.x * scaleX, t.y * scaleY);
      }
      this.prevTargetHits[t.id] = t.hit;
    }

    // --- Detect level complete → trumpet + celebration ---
    const lc = this.state.levelComplete;
    if (lc && !this.prevLevelComplete) {
      this.celebrationStartedAt = now;
      this.playTrumpetFanfare();
    }
    this.prevLevelComplete = lc;

    this.drawSky(g, cam);
    this.drawTerrain(g, cam, scaleX, scaleY);
    this.drawTargets(g, cam, scaleX, scaleY);
    this.drawPlayers(g, cam, scaleX, scaleY);
    this.drawProjectiles(g, cam, scaleX, scaleY);
    this.renderFireworks(now);

    // --- Position fire button below player ---
    const net = this.game.net;
    const me = net.playerId ? this.state.players[net.playerId] : null;
    if (me && me.connected) {
      const fbx = me.x * scaleX;
      const fby = me.y * scaleY + 38 * scaleY;
      this.fireBtn.setPosition(fbx, Math.min(fby, cam.height - 20));
    }

    // Setup/Pause overlay
    const isLobby = Boolean(this.state.paused && this.state.reasonPaused === 'start');
    const showOverlay = isLobby || (me && me.paused);

    if (showOverlay) {
      this.setupContainer.setPosition(cam.width / 2, cam.height / 2);
      this.setupContainer.setVisible(true);
      this.updateSetupUI(this.state, isLobby ? 'start' : 'pause');
    } else {
      this.setupContainer.setVisible(false);
    }

    // Level complete
    this.completeBanner.setVisible(lc);
    this.nextLevelBtn.setVisible(lc && this.state.level < this.state.maxLevel);
    if (lc) {
      this.completeBanner.setText(
        this.state.level >= this.state.maxLevel ? 'All levels complete!' : `Level ${this.state.level} complete!`
      );
    }

    // HUD
    const hit = this.state.targets.filter((t) => t.hit).length;
    const total = this.state.targets.length;
    const planetName = PLANET_LABELS[this.state.planet] || this.state.planet || '';
    this.levelText.setText(`${planetName}  Level ${this.state.level}/${this.state.maxLevel}  Targets: ${hit}/${total}`);
    this.aimText.setText(`Angle: ${this.aimAngle}\u00B0  Power: ${this.aimPower}`);
  }

  // -----------------------------------------------------------------------
  // Setup / Pause UI (setupContainer pattern from maze/snake)
  // -----------------------------------------------------------------------
  createSetupUI() {
    const UI_BTN_BG = '#777777';
    const UI_BTN_BG_HOVER = '#888888';
    const UI_BTN_BG_SELECTED = '#000000';
    const UI_BTN_TEXT = '#FFFFFF';

    // White panel background
    const bg = this.add.rectangle(0, 0, 700, 480, 0xffffff, 0.95);
    this.setupContainer.add(bg);

    // Title
    this.setupTitle = this.add.text(0, -210, 'GAME SETUP', {
      fontSize: '32px', color: '#000', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.setupContainer.add(this.setupTitle);

    // --- Level selector (7 levels across 4 planets) ---
    this.setupContainer.add(
      this.add.text(-300, -160, 'Level:', { fontSize: '18px', color: '#000' }).setOrigin(0, 0.5)
    );
    this.levelButtons = {};
    for (let lv = 1; lv <= 7; lv++) {
      this.levelButtons[lv] = this.addSetupButton(
        -200 + (lv - 1) * 60, -160, `${lv}`,
        () => this.game.net.send('select_level', { level: lv })
      );
    }

    // --- Character selector ---
    this.setupContainer.add(
      this.add.text(-300, -100, 'Character:', { fontSize: '18px', color: '#000' }).setOrigin(0, 0.5)
    );
    const avatarKeys = Object.keys(AVATAR_LABELS);
    this.avatarSetupButtons = {};
    const cols = 4;
    avatarKeys.forEach((av, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = -200 + col * 130;
      const by = -60 + row * 44;
      this.avatarSetupButtons[av] = this.addSetupButton(
        bx, by, AVATAR_LABELS[av],
        () => this.game.net.send('select_avatar', { avatar: av })
      );
    });

    // --- Show guides toggle ---
    const guidesY = 50;
    this.setupContainer.add(
      this.add.text(-300, guidesY, 'Show guides:', { fontSize: '18px', color: '#000' }).setOrigin(0, 0.5)
    );
    this.guidesButtons = {
      true: this.addSetupButton(-100, guidesY, 'True', () => {
        this.game.net.send('set_guides', { show: true });
      }),
      false: this.addSetupButton(0, guidesY, 'False', () => {
        this.game.net.send('set_guides', { show: false });
      }),
    };

    // --- Help text ---
    this.setupHelp = this.add.text(0, 130, '', {
      fontSize: '18px', color: '#000',
    }).setOrigin(0.5);
    this.setupContainer.add(this.setupHelp);

    // --- Start button (lobby) ---
    this.startButton = this.addSetupButton(-60, 180, 'Start', () => {
      this.game.net.send('resume');
    });

    // --- Continue button (pause) ---
    this.continueButton = this.addSetupButton(60, 180, 'Continue', () => {
      this.game.net.send('resume');
    });
  }

  addSetupButton(x, y, label, cb) {
    const UI_BTN_BG = '#777777';
    const UI_BTN_BG_HOVER = '#888888';
    const UI_BTN_TEXT = '#FFFFFF';

    const btn = this.add.text(x, y, label, {
      fontSize: '18px', backgroundColor: UI_BTN_BG, color: UI_BTN_TEXT,
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

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

  updateSetupUI(state, mode) {
    const UI_BTN_BG = '#777777';
    const UI_BTN_BG_SELECTED = '#000000';
    const net = this.game.net;
    const me = net.playerId ? state.players[net.playerId] : null;

    // Title
    this.setupTitle.setText(mode === 'start' ? 'GAME SETUP' : 'PAUSED');

    // Show/hide buttons based on mode
    this.startButton.setVisible(mode === 'start');
    this.continueButton.setVisible(mode !== 'start');

    // Level highlight
    for (const [lv, btn] of Object.entries(this.levelButtons)) {
      const selected = Number(lv) === state.level;
      btn._selected = selected;
      btn.setBackgroundColor(selected ? UI_BTN_BG_SELECTED : UI_BTN_BG);
    }

    // Avatar highlight
    const myAvatar = me?.avatar;
    for (const [av, btn] of Object.entries(this.avatarSetupButtons)) {
      const selected = av === myAvatar;
      btn._selected = selected;
      btn.setBackgroundColor(selected ? UI_BTN_BG_SELECTED : UI_BTN_BG);
    }

    // Guides toggle highlight (global state)
    const guidesOn = Boolean(state.showGuides);
    for (const [val, btn] of Object.entries(this.guidesButtons)) {
      const selected = (val === 'true') === guidesOn;
      btn._selected = selected;
      btn.setBackgroundColor(selected ? UI_BTN_BG_SELECTED : UI_BTN_BG);
    }

    // Help text
    if (mode === 'start') {
      this.setupHelp.setText('Press Space or click Start to begin');
    } else {
      this.setupHelp.setText('Press Space / P or click Continue');
    }
  }

  // -----------------------------------------------------------------------
  // Sky — planet-specific backgrounds
  // -----------------------------------------------------------------------
  drawSky(g, cam) {
    const planet = this.state.planet || 'earth';

    if (planet === 'earth') {
      this.drawSkyEarth(g, cam);
    } else if (planet === 'mars') {
      this.drawSkyMars(g, cam);
    } else if (planet === 'moon') {
      this.drawSkyMoon(g, cam);
    } else if (planet === 'enceladus') {
      this.drawSkyEnceladus(g, cam);
    }
  }

  drawSkyEarth(g, cam) {
    g.fillStyle(0x87ceeb, 1);
    g.fillRect(0, 0, cam.width, cam.height * 0.4);
    g.fillStyle(0xb0e0e6, 1);
    g.fillRect(0, cam.height * 0.4, cam.width, cam.height * 0.3);
    g.fillStyle(0xd4edda, 1);
    g.fillRect(0, cam.height * 0.7, cam.width, cam.height * 0.3);

    // Sun
    const sunX = cam.width * 0.85;
    const sunY = cam.height * 0.12;
    g.fillStyle(0xfff176, 1);
    g.fillCircle(sunX, sunY, 30);
    g.fillStyle(0xffee58, 0.3);
    g.fillCircle(sunX, sunY, 45);

    // Clouds
    g.fillStyle(0xffffff, 0.7);
    this.drawCloud(g, cam.width * 0.15, cam.height * 0.08, 1.0);
    this.drawCloud(g, cam.width * 0.45, cam.height * 0.15, 0.7);
    this.drawCloud(g, cam.width * 0.7, cam.height * 0.22, 0.85);
  }

  drawSkyMars(g, cam) {
    // Orange-red dusty sky
    g.fillStyle(0xc2703a, 1);
    g.fillRect(0, 0, cam.width, cam.height * 0.4);
    g.fillStyle(0xd4845a, 1);
    g.fillRect(0, cam.height * 0.4, cam.width, cam.height * 0.3);
    g.fillStyle(0xb85c3a, 1);
    g.fillRect(0, cam.height * 0.7, cam.width, cam.height * 0.3);

    // Small distant sun
    const sunX = cam.width * 0.85;
    const sunY = cam.height * 0.15;
    g.fillStyle(0xffe0b2, 1);
    g.fillCircle(sunX, sunY, 16);
    g.fillStyle(0xffe0b2, 0.2);
    g.fillCircle(sunX, sunY, 28);

    // Dust particles (faint dots)
    g.fillStyle(0xeebb88, 0.2);
    for (let i = 0; i < 20; i++) {
      const dx = ((i * 137 + 53) % cam.width);
      const dy = ((i * 89 + 17) % (cam.height * 0.5));
      g.fillCircle(dx, dy, 1.5 + (i % 3));
    }
  }

  drawSkyMoon(g, cam) {
    // Black starfield
    g.fillStyle(0x050510, 1);
    g.fillRect(0, 0, cam.width, cam.height);

    // Stars
    g.fillStyle(0xffffff, 0.8);
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 157 + 23) % cam.width);
      const sy = ((i * 83 + 47) % (cam.height * 0.65));
      const r = (i % 5 === 0) ? 2 : 1;
      g.fillCircle(sx, sy, r);
    }

    // Earth in the distance (upper-left)
    const ex = cam.width * 0.18;
    const ey = cam.height * 0.15;
    g.fillStyle(0x2244aa, 1);
    g.fillCircle(ex, ey, 22);
    g.fillStyle(0x44aa55, 0.6);
    // Land blobs
    g.fillCircle(ex - 5, ey - 4, 8);
    g.fillCircle(ex + 7, ey + 5, 6);
    // Atmosphere glow
    g.lineStyle(2, 0x88ccff, 0.4);
    g.strokeCircle(ex, ey, 25);
  }

  drawSkyEnceladus(g, cam) {
    // Very dark blue-black sky
    g.fillStyle(0x060618, 1);
    g.fillRect(0, 0, cam.width, cam.height);

    // Stars
    g.fillStyle(0xccccff, 0.7);
    for (let i = 0; i < 50; i++) {
      const sx = ((i * 173 + 11) % cam.width);
      const sy = ((i * 67 + 31) % (cam.height * 0.6));
      g.fillCircle(sx, sy, (i % 4 === 0) ? 1.5 : 0.8);
    }

    // Saturn (large, with rings) — upper-right
    const sx = cam.width * 0.78;
    const sy = cam.height * 0.14;
    const sr = 35;
    // Planet body (tan/gold)
    g.fillStyle(0xd4aa55, 1);
    g.fillCircle(sx, sy, sr);
    g.fillStyle(0xc89940, 0.7);
    g.fillCircle(sx - 5, sy + 2, sr * 0.9);
    // Rings
    g.lineStyle(3, 0xeedd99, 0.5);
    g.strokeEllipse(sx, sy, sr * 3.2, sr * 0.6);
    g.lineStyle(2, 0xccbb77, 0.35);
    g.strokeEllipse(sx, sy, sr * 3.8, sr * 0.72);

    // Geysers in background (icy plumes from bottom)
    this.drawGeysers(g, cam);
  }

  drawGeysers(g, cam) {
    // 3 geyser plumes rising from the bottom third
    const geyserPositions = [0.35, 0.55, 0.80];
    for (const frac of geyserPositions) {
      const gx = cam.width * frac;
      const baseY = cam.height * 0.85;
      // Plume: semi-transparent white/blue column of particles
      for (let i = 0; i < 15; i++) {
        const py = baseY - i * cam.height * 0.025;
        const spread = i * 1.5;
        const ox = ((i * 7 + Math.floor(frac * 100)) % 5) - 2;
        const alpha = 0.25 - i * 0.015;
        if (alpha <= 0) break;
        g.fillStyle(0xccddff, alpha);
        g.fillCircle(gx + ox * spread * 0.3, py, 3 + i * 0.4);
      }
    }
  }

  drawCloud(g, cx, cy, scale) {
    const s = scale * 20;
    g.fillCircle(cx, cy, s * 1.5);
    g.fillCircle(cx - s * 1.2, cy + s * 0.3, s * 1.1);
    g.fillCircle(cx + s * 1.4, cy + s * 0.2, s * 1.2);
    g.fillCircle(cx - s * 0.3, cy - s * 0.5, s * 1.0);
    g.fillCircle(cx + s * 0.5, cy - s * 0.3, s * 0.9);
  }

  // -----------------------------------------------------------------------
  // Terrain — planet-specific colors and decoration
  // -----------------------------------------------------------------------
  drawTerrain(g, cam, scaleX, scaleY) {
    const { terrain } = this.state;
    if (!terrain) return;
    const planet = this.state.planet || 'earth';

    // Color palettes per planet
    const palettes = {
      earth:     { fill: 0x4caf50, depth: 0x388e3c, detail: 0x2e7d32 },
      mars:      { fill: 0xb84c28, depth: 0x8b3a1f, detail: 0x993322 },
      moon:      { fill: 0x888888, depth: 0x666666, detail: 0x777777 },
      enceladus: { fill: 0xc8ddf0, depth: 0x99b8d8, detail: 0xaaccee },
    };
    const pal = palettes[planet] || palettes.earth;

    // Main terrain surface
    g.fillStyle(pal.fill, 1);
    g.beginPath();
    g.moveTo(0, cam.height);
    for (let i = 0; i < terrain.heights.length; i++) {
      const sx = (i * terrain.step) * scaleX;
      const sy = (WORLD_H - terrain.heights[i]) * scaleY;
      g.lineTo(sx, sy);
    }
    g.lineTo(cam.width, cam.height);
    g.closePath();
    g.fillPath();

    // Depth layer
    g.fillStyle(pal.depth, 1);
    g.beginPath();
    g.moveTo(0, cam.height);
    for (let i = 0; i < terrain.heights.length; i++) {
      const sx = (i * terrain.step) * scaleX;
      const sy = (WORLD_H - terrain.heights[i]) * scaleY + 8 * scaleY;
      g.lineTo(sx, sy);
    }
    g.lineTo(cam.width, cam.height);
    g.closePath();
    g.fillPath();

    // Surface details per planet
    if (planet === 'earth') {
      // Grass tufts
      g.lineStyle(1.5, pal.detail, 0.5);
      for (let i = 0; i < terrain.heights.length; i += 3) {
        const sx = (i * terrain.step) * scaleX;
        const sy = (WORLD_H - terrain.heights[i]) * scaleY;
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx - 3 * scaleX, sy - 6 * scaleY);
        g.strokePath();
        g.beginPath();
        g.moveTo(sx + 2 * scaleX, sy);
        g.lineTo(sx + 5 * scaleX, sy - 5 * scaleY);
        g.strokePath();
      }
    } else if (planet === 'mars') {
      // Rocky pebbles / stones
      g.fillStyle(0x994433, 0.4);
      for (let i = 2; i < terrain.heights.length; i += 5) {
        const sx = (i * terrain.step) * scaleX;
        const sy = (WORLD_H - terrain.heights[i]) * scaleY;
        g.fillCircle(sx, sy + 2 * scaleY, 2.5);
        g.fillCircle(sx + 6 * scaleX, sy + 3 * scaleY, 1.8);
      }
    } else if (planet === 'moon') {
      // Crater rim highlights — subtle lighter arcs
      g.lineStyle(1, 0xaaaaaa, 0.3);
      for (let i = 4; i < terrain.heights.length - 4; i++) {
        const hPrev = terrain.heights[i - 1];
        const hCur = terrain.heights[i];
        const hNext = terrain.heights[i + 1];
        // Mark concave → convex transition (crater rim)
        if (hCur > hPrev + 3 && hCur > hNext + 3) {
          const sx = (i * terrain.step) * scaleX;
          const sy = (WORLD_H - terrain.heights[i]) * scaleY;
          g.beginPath();
          g.arc(sx, sy - 2 * scaleY, 4 * scaleX, Math.PI, 0);
          g.strokePath();
        }
      }
    } else if (planet === 'enceladus') {
      // Icy shine highlights
      g.lineStyle(1, 0xffffff, 0.25);
      for (let i = 1; i < terrain.heights.length; i += 4) {
        const sx = (i * terrain.step) * scaleX;
        const sy = (WORLD_H - terrain.heights[i]) * scaleY;
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx + 4 * scaleX, sy - 2 * scaleY);
        g.strokePath();
      }
    }
  }

  // -----------------------------------------------------------------------
  // Targets: alien fish — pointing downward, pac-man mouth eating the ground
  // -----------------------------------------------------------------------
  drawTargets(g, cam, scaleX, scaleY) {
    const { targets } = this.state;
    if (!targets) return;

    for (const t of targets) {
      const tx = t.x * scaleX;
      const ty = t.y * scaleY;
      const r = TARGET_RADIUS * Math.min(scaleX, scaleY);

      if (t.hit) {
        // Small sparkle remnant (firework handles the big effect)
        g.fillStyle(0xffd24d, 0.3);
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * 2 * i) / 6;
          g.fillCircle(tx + Math.cos(a) * r * 0.3, ty + Math.sin(a) * r * 0.3, 2);
        }
        continue;
      }

      const finDir = (t.id.charCodeAt(1) % 2 === 0) ? 1 : -1;

      // Mouth opening: bottom quarter of the circle (90° arc centered at π/2)
      const mouthHalf = Math.PI / 4; // 45° each side of straight down
      const mouthStart = Math.PI / 2 - mouthHalf; // π/4
      const mouthEnd = Math.PI / 2 + mouthHalf;   // 3π/4

      // Body — pac-man shape (3/4 arc, mouth at bottom), blue-gray tint
      g.fillStyle(0x2a3a50, 1);
      g.beginPath();
      g.moveTo(tx, ty);
      g.arc(tx, ty, r, mouthEnd, mouthStart, false); // clockwise long way = body
      g.closePath();
      g.fillPath();

      // Body outline
      g.lineStyle(1.5, 0x3a4a60, 0.8);
      g.beginPath();
      g.arc(tx, ty, r, mouthEnd, mouthStart, false);
      g.strokePath();

      // Mouth interior — darker cavity
      g.fillStyle(0x1a1a30, 1);
      g.beginPath();
      g.moveTo(tx, ty);
      g.arc(tx, ty, r * 0.85, mouthStart, mouthEnd, false); // short arc = mouth
      g.closePath();
      g.fillPath();

      // Mouth lip edges (two lines from center to rim)
      g.lineStyle(2, 0x3a4a60, 0.6);
      g.beginPath();
      g.moveTo(tx, ty);
      g.lineTo(tx + Math.cos(mouthStart) * r, ty + Math.sin(mouthStart) * r);
      g.moveTo(tx, ty);
      g.lineTo(tx + Math.cos(mouthEnd) * r, ty + Math.sin(mouthEnd) * r);
      g.strokePath();

      // Eye — on the side, slightly above center
      const eyeX = tx + finDir * r * 0.3;
      const eyeY = ty - r * 0.2;
      const eyeR = r * 0.28;
      g.fillStyle(0xffffff, 1);
      g.fillCircle(eyeX, eyeY, eyeR);
      g.fillStyle(0x222244, 1);
      g.fillCircle(eyeX + finDir * eyeR * 0.1, eyeY + eyeR * 0.15, eyeR * 0.55);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(eyeX + finDir * eyeR * 0.25, eyeY - eyeR * 0.2, eyeR * 0.2);

      // Dorsal fin — to the side
      g.fillStyle(0x2a3a50, 1);
      g.fillTriangle(
        tx + finDir * r * 0.85, ty - r * 0.2,
        tx + finDir * r * 1.3, ty,
        tx + finDir * r * 0.85, ty + r * 0.2,
      );

      // Tail fin — at the top (two lobes)
      g.fillStyle(0x344a5e, 1);
      g.fillTriangle(
        tx - r * 0.3, ty - r * 0.85,
        tx - r * 0.55, ty - r * 1.4,
        tx + r * 0.0, ty - r * 0.85,
      );
      g.fillTriangle(
        tx + r * 0.0, ty - r * 0.85,
        tx + r * 0.55, ty - r * 1.4,
        tx + r * 0.3, ty - r * 0.85,
      );

      // Small pectoral fin on the opposite side
      g.fillTriangle(
        tx - finDir * r * 0.8, ty + r * 0.05,
        tx - finDir * r * 1.2, ty + r * 0.3,
        tx - finDir * r * 0.8, ty + r * 0.3,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Players: character avatars
  // -----------------------------------------------------------------------
  drawPlayers(g, cam, scaleX, scaleY) {
    const { players } = this.state;
    if (!players) return;
    const myId = this.game.net.playerId;
    const now = this.time.now;

    // Celebration jump offset — frequency scales with gravity (slower on low-g worlds)
    let jumpOffset = 0;
    if (this.state.levelComplete && this.celebrationStartedAt > 0) {
      const elapsed = (now - this.celebrationStartedAt) / 1000;
      const gravity = this.state.gravity || 400;
      const jumpFreq = Math.sqrt(gravity / 400) * 6; // Earth=6, Mars≈4.2, Moon=3, Enceladus≈2.1
      if (elapsed < 2.5) {
        const decay = Math.max(0, 1 - elapsed / 2.5);
        jumpOffset = Math.abs(Math.sin(elapsed * jumpFreq)) * 18 * scaleY * decay;
      }
    }

    for (const pid of [1, 2, 3, 4]) {
      const p = players[pid];
      if (!p || !p.connected) continue;

      const px = p.x * scaleX;
      const py = p.y * scaleY - jumpOffset;
      const color = hexToInt(p.color ?? '#ffffff');
      const isMe = pid === myId;
      const s = Math.min(scaleX, scaleY); // uniform scale

      // Draw the character avatar
      this.drawAvatar(g, px, py, s, p.avatar, color);

      // Aim line — length matches click distance so tip = cursor
      const aimAngle = isMe ? this.aimAngle : p.aimAngle;
      const aimPower = isMe ? this.aimPower : p.aimPower;
      const aimRad = (aimAngle * Math.PI) / 180;
      const maxDist = Math.min(cam.width, cam.height) * 0.4;
      const lineLen = (aimPower / 100) * maxDist;
      const originY = py - 20 * s;

      const endX = px + Math.cos(aimRad) * lineLen;
      const endY = originY - Math.sin(aimRad) * lineLen;

      // Cache arrow tip position for drag hit-testing
      if (isMe) {
        this.myArrowTip = { x: endX, y: endY };
      }

      // Trajectory preview (only when guides enabled — global setting)
      if (isMe && !this.state.paused && this.state.showGuides) {
        this.drawTrajectoryPreview(g, cam, scaleX, scaleY, p, aimAngle, aimPower);
      }

      // Aim line
      g.lineStyle(isMe ? 3 : 2, color, isMe ? 1.0 : 0.4);
      g.beginPath();
      g.moveTo(px, originY);
      g.lineTo(endX, endY);
      g.strokePath();

      // Arrowhead (bigger grab handle when it's me)
      const arrowSize = isMe ? 8 * s : 6 * s;
      const arrowAngle = Math.atan2(originY - endY, endX - px);
      g.fillStyle(color, isMe ? 1.0 : 0.4);
      g.beginPath();
      g.moveTo(endX, endY);
      g.lineTo(endX - Math.cos(arrowAngle - 0.4) * arrowSize, endY + Math.sin(arrowAngle - 0.4) * arrowSize);
      g.lineTo(endX - Math.cos(arrowAngle + 0.4) * arrowSize, endY + Math.sin(arrowAngle + 0.4) * arrowSize);
      g.closePath();
      g.fillPath();

      // Drag handle circle (visible hint that arrow tip is draggable)
      if (isMe && !this.state.paused) {
        g.lineStyle(2, 0xffffff, this.isDragging ? 0.9 : 0.35);
        g.strokeCircle(endX, endY, 18 * s);
      }

      // Angle finder arc (shown while dragging)
      if (isMe && this.isDragging) {
        this.drawAngleFinder(g, px, originY, aimAngle, s, color);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Avatar drawing (~28px tall at scale 1)
  // -----------------------------------------------------------------------
  drawAvatar(g, cx, groundY, s, avatar, color) {
    const draw = AVATAR_DRAW[avatar] ?? AVATAR_DRAW.brillan;
    draw(g, cx, groundY, s, color);
  }

  // -----------------------------------------------------------------------
  // Angle finder arc (shown while dragging)
  // -----------------------------------------------------------------------
  drawAngleFinder(g, originX, originY, angleDeg, s, color) {
    const arcRadius = 50 * s;
    const angleRad = (angleDeg * Math.PI) / 180;

    // Draw the reference line (horizontal)
    g.lineStyle(1, 0xffffff, 0.3);
    g.beginPath();
    g.moveTo(originX, originY);
    g.lineTo(originX + arcRadius * 1.2, originY);
    g.strokePath();

    // Draw the arc from 0° to current angle
    g.lineStyle(2.5, color, 0.7);
    g.beginPath();
    const steps = Math.max(8, Math.round(angleDeg / 2));
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * angleRad;
      const ax = originX + Math.cos(a) * arcRadius;
      const ay = originY - Math.sin(a) * arcRadius;
      if (i === 0) g.moveTo(ax, ay);
      else g.lineTo(ax, ay);
    }
    g.strokePath();

    // Tick marks at 15° intervals
    g.lineStyle(1, 0xffffff, 0.25);
    for (let deg = 15; deg < 90; deg += 15) {
      const a = (deg * Math.PI) / 180;
      const inner = arcRadius * 0.85;
      const outer = arcRadius * 1.0;
      g.beginPath();
      g.moveTo(originX + Math.cos(a) * inner, originY - Math.sin(a) * inner);
      g.lineTo(originX + Math.cos(a) * outer, originY - Math.sin(a) * outer);
      g.strokePath();
    }

    // Angle text near the arc midpoint
    const midA = angleRad / 2;
    const textR = arcRadius + 18 * s;
    const textX = originX + Math.cos(midA) * textR;
    const textY = originY - Math.sin(midA) * textR;

    // Use a temporary text object or draw via graphics
    if (!this._angleFinderText) {
      this._angleFinderText = this.add.text(0, 0, '', {
        fontSize: '14px', color: '#ffd24d', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(60);
    }
    this._angleFinderText.setPosition(textX, textY);
    this._angleFinderText.setText(`${angleDeg}\u00B0`);
    this._angleFinderText.setVisible(true);
  }

  // -----------------------------------------------------------------------
  // Rainbow explosion effect (spawned when a target is hit)
  // -----------------------------------------------------------------------
  spawnRainbowExplosion(sx, sy) {
    const now = this.time.now;
    const sparkCount = 20;
    this.fireworks.push({
      x: sx, y: sy,
      t0: now,
      duration: 900,
      sparks: Array.from({ length: sparkCount }).map((_, i) => ({
        angle: (Math.PI * 2 * i) / sparkCount,
        speed: 2.5 + (i % 4) * 0.8,
        color: this.rainbowColors[i % this.rainbowColors.length],
      })),
    });
  }

  renderFireworks(now) {
    this.fxGraphics.clear();
    const alive = [];
    for (const fw of this.fireworks) {
      const age = now - fw.t0;
      if (age < 0 || age >= fw.duration) continue;
      alive.push(fw);
      const t = age / fw.duration;
      const alpha = Math.max(0, 1 - t * 0.8);

      for (const sp of fw.sparks) {
        const ease = 1 - Math.pow(1 - t, 2);
        const dist = 4 + 80 * sp.speed * ease;
        const sx = fw.x + Math.cos(sp.angle) * dist;
        const sy = fw.y + Math.sin(sp.angle) * dist;
        const lw = Math.max(1.5, 3 * (1 - t));
        this.fxGraphics.lineStyle(lw, sp.color, 0.9 * alpha);
        this.fxGraphics.lineBetween(fw.x, fw.y, sx, sy);
      }
    }
    this.fireworks = alive;
  }

  // -----------------------------------------------------------------------
  // Trumpet fanfare (Web Audio — do-do-dooh)
  // -----------------------------------------------------------------------
  playTrumpetFanfare() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [
        { freq: 523, start: 0, dur: 0.15 },     // C5
        { freq: 659, start: 0.18, dur: 0.15 },   // E5
        { freq: 784, start: 0.36, dur: 0.45 },    // G5 (longer)
      ];
      for (const n of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = n.freq;
        gain.gain.setValueAtTime(0.18, ctx.currentTime + n.start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.start + n.dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + n.start);
        osc.stop(ctx.currentTime + n.start + n.dur + 0.05);
      }
    } catch (_) { /* Web Audio not available */ }
  }

  // -----------------------------------------------------------------------
  // Trajectory preview (accounts for air resistance)
  // -----------------------------------------------------------------------
  drawTrajectoryPreview(g, cam, scaleX, scaleY, player, aimAngle, aimPower) {
    const angleRad = (aimAngle * Math.PI) / 180;
    const ptv = this.state.powerToVelocity || 7.5;
    const speed = aimPower * ptv;
    const gravity = this.state.gravity || 400;
    const airRes = this.state.airResistance || 0;
    const terrain = this.state.terrain;

    let x = player.x;
    let y = player.y - 14;
    let vx = Math.cos(angleRad) * speed;
    let vy = -Math.sin(angleRad) * speed;

    g.fillStyle(0xffffff, 0.35);
    const dt = 0.05;
    for (let step = 0; step < 60; step++) {
      if (airRes > 0) {
        vx *= (1 - airRes * dt);
        vy *= (1 - airRes * dt);
      }
      vy += gravity * dt;
      x += vx * dt;
      y += vy * dt;

      if (x < -20 || x > WORLD_W + 20 || y > WORLD_H + 20 || y < -200) break;

      if (terrain && x >= 0 && x <= WORLD_W) {
        if (y >= this.terrainGroundY(terrain, x)) break;
      }

      if (step % 3 === 0) {
        g.fillCircle(x * scaleX, y * scaleY, 2.5);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Projectiles: tumbling rubber ducks
  // -----------------------------------------------------------------------
  drawProjectiles(g, cam, scaleX, scaleY) {
    const { projectiles, players } = this.state;
    if (!projectiles) return;

    for (const pr of projectiles) {
      if (!pr.active) continue;

      const px = pr.x * scaleX;
      const py = pr.y * scaleY;
      const s = Math.min(scaleX, scaleY);
      const r = PROJECTILE_RADIUS * s;
      const angle = pr.rotation ?? 0;

      const owner = players[pr.owner];
      const ownerColor = owner ? hexToInt(owner.color) : 0xffaa00;

      // Rubber duck body (yellow oval, rotated)
      const bodyW = r * 1.3;
      const bodyH = r * 1.0;

      // Body center
      g.fillStyle(0xfdd835, 1);
      // Approximate rotated ellipse with a circle + offset
      const bx = px;
      const by = py;

      // Draw body as circle (simplification for rotation)
      g.fillCircle(bx, by, bodyW);
      g.lineStyle(1.5, 0xf9a825, 0.9);
      g.strokeCircle(bx, by, bodyW);

      // Head (smaller circle offset in flight direction, rotated)
      const headOff = rot(bx, by, angle, bodyW * 0.7, -bodyH * 0.4);
      g.fillStyle(0xfdd835, 1);
      g.fillCircle(headOff.x, headOff.y, bodyW * 0.6);
      g.lineStyle(1, 0xf9a825, 0.8);
      g.strokeCircle(headOff.x, headOff.y, bodyW * 0.6);

      // Beak (orange, pointing in flight direction)
      const beakTip = rot(headOff.x, headOff.y, angle, bodyW * 0.7, 0);
      const beakL = rot(headOff.x, headOff.y, angle, bodyW * 0.2, -bodyW * 0.2);
      const beakR = rot(headOff.x, headOff.y, angle, bodyW * 0.2, bodyW * 0.2);
      g.fillStyle(0xff8f00, 1);
      g.fillTriangle(beakTip.x, beakTip.y, beakL.x, beakL.y, beakR.x, beakR.y);

      // Eye (small dot on head)
      const eyePos = rot(headOff.x, headOff.y, angle, bodyW * 0.15, -bodyW * 0.2);
      g.fillStyle(0x000000, 1);
      g.fillCircle(eyePos.x, eyePos.y, bodyW * 0.12);

      // Wing (small bump on side of body)
      const wingPos = rot(bx, by, angle, -bodyW * 0.2, bodyW * 0.5);
      g.fillStyle(0xfbc02d, 1);
      g.fillCircle(wingPos.x, wingPos.y, bodyW * 0.35);

      // Owner color ring
      g.lineStyle(2, ownerColor, 0.6);
      g.strokeCircle(bx, by, bodyW * 0.4);
    }
  }

  shutdown() {
    const net = this.game.net;
    if (this._onState) net.removeEventListener('state', this._onState);
  }
}

// ---------------------------------------------------------------------------
// Avatar drawing functions — each draws a ~28px tall character at (cx, groundY)
// groundY is the feet position; character is drawn above it.
// s = uniform pixel scale factor
// ---------------------------------------------------------------------------
const AVATAR_DRAW = {
  // Brillan: red robot boy with square head
  brillan(g, cx, gy, s) {
    const h = 28 * s;
    // Legs
    g.fillStyle(0xcc2222, 1);
    g.fillRect(cx - 5 * s, gy - 10 * s, 4 * s, 10 * s);
    g.fillRect(cx + 1 * s, gy - 10 * s, 4 * s, 10 * s);
    // Body (rectangle)
    g.fillStyle(0xff4444, 1);
    g.fillRect(cx - 7 * s, gy - 22 * s, 14 * s, 12 * s);
    // Chest plate
    g.fillStyle(0xffcc00, 0.7);
    g.fillRect(cx - 3 * s, gy - 19 * s, 6 * s, 4 * s);
    // Head (square!)
    g.fillStyle(0xff4444, 1);
    g.fillRect(cx - 6 * s, gy - h, 12 * s, 8 * s);
    g.lineStyle(1, 0x991111, 0.8);
    g.strokeRect(cx - 6 * s, gy - h, 12 * s, 8 * s);
    // Eyes (glowing)
    g.fillStyle(0x00ffff, 1);
    g.fillRect(cx - 4 * s, gy - 26 * s, 3 * s, 2 * s);
    g.fillRect(cx + 1 * s, gy - 26 * s, 3 * s, 2 * s);
    // Antenna
    g.lineStyle(2, 0xffcc00, 1);
    g.beginPath();
    g.moveTo(cx, gy - h);
    g.lineTo(cx, gy - h - 6 * s);
    g.strokePath();
    g.fillStyle(0x00ffff, 1);
    g.fillCircle(cx, gy - h - 6 * s, 2 * s);
  },

  // Hunter: human with hat
  hunter(g, cx, gy, s) {
    // Legs (brown)
    g.fillStyle(0x5d4037, 1);
    g.fillRect(cx - 4 * s, gy - 10 * s, 3 * s, 10 * s);
    g.fillRect(cx + 1 * s, gy - 10 * s, 3 * s, 10 * s);
    // Body (green jacket)
    g.fillStyle(0x558b2f, 1);
    g.fillRect(cx - 6 * s, gy - 20 * s, 12 * s, 10 * s);
    // Head (skin)
    g.fillStyle(0xffcc80, 1);
    g.fillCircle(cx, gy - 24 * s, 5 * s);
    // Hat (brown wide-brim)
    g.fillStyle(0x795548, 1);
    g.fillRect(cx - 8 * s, gy - 29 * s, 16 * s, 3 * s);
    g.fillRect(cx - 5 * s, gy - 32 * s, 10 * s, 4 * s);
    // Eyes
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 2 * s, gy - 25 * s, 1 * s);
    g.fillCircle(cx + 2 * s, gy - 25 * s, 1 * s);
  },

  // Mr. What What: Tom Baker with multicolor scarf
  mrwhatwhat(g, cx, gy, s) {
    // Legs
    g.fillStyle(0x4a4a4a, 1);
    g.fillRect(cx - 4 * s, gy - 10 * s, 3 * s, 10 * s);
    g.fillRect(cx + 1 * s, gy - 10 * s, 3 * s, 10 * s);
    // Body (brown coat)
    g.fillStyle(0x6d4c41, 1);
    g.fillRect(cx - 6 * s, gy - 22 * s, 12 * s, 12 * s);
    // Head
    g.fillStyle(0xffcc80, 1);
    g.fillCircle(cx, gy - 26 * s, 5 * s);
    // Curly hair (wavy brown puffs)
    g.fillStyle(0x5d4037, 1);
    g.fillCircle(cx - 4 * s, gy - 30 * s, 3 * s);
    g.fillCircle(cx, gy - 31 * s, 3 * s);
    g.fillCircle(cx + 4 * s, gy - 30 * s, 3 * s);
    // Eyes
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 2 * s, gy - 26 * s, 1 * s);
    g.fillCircle(cx + 2 * s, gy - 26 * s, 1 * s);
    // Long multicolor scarf hanging down the left side
    const scarfColors = [0xff0000, 0xff8800, 0xffff00, 0x00cc00, 0x0066ff, 0x8800ff, 0xff0088];
    const scarfX = cx + 7 * s;
    for (let i = 0; i < scarfColors.length; i++) {
      g.fillStyle(scarfColors[i], 0.9);
      g.fillRect(scarfX, gy - 20 * s + i * 4 * s, 3 * s, 4 * s);
    }
    // Scarf wraps around neck
    g.fillStyle(0xff0000, 0.8);
    g.fillRect(cx - 5 * s, gy - 22 * s, 10 * s, 2 * s);
  },

  // Chaihou: tiger
  chaihou(g, cx, gy, s) {
    // Legs
    g.fillStyle(0xff8c00, 1);
    g.fillRect(cx - 6 * s, gy - 8 * s, 4 * s, 8 * s);
    g.fillRect(cx + 2 * s, gy - 8 * s, 4 * s, 8 * s);
    // Body (orange oval)
    g.fillStyle(0xff8c00, 1);
    g.fillEllipse(cx, gy - 16 * s, 16 * s, 12 * s);
    // Black stripes on body
    g.lineStyle(2, 0x000000, 0.7);
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(cx + i * 3 * s, gy - 22 * s);
      g.lineTo(cx + i * 3 * s, gy - 10 * s);
      g.strokePath();
    }
    // Head
    g.fillStyle(0xff8c00, 1);
    g.fillCircle(cx, gy - 24 * s, 6 * s);
    // Ears
    g.fillCircle(cx - 5 * s, gy - 29 * s, 3 * s);
    g.fillCircle(cx + 5 * s, gy - 29 * s, 3 * s);
    g.fillStyle(0xffb74d, 1);
    g.fillCircle(cx - 5 * s, gy - 29 * s, 1.5 * s);
    g.fillCircle(cx + 5 * s, gy - 29 * s, 1.5 * s);
    // Eyes
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 2.5 * s, gy - 25 * s, 1.2 * s);
    g.fillCircle(cx + 2.5 * s, gy - 25 * s, 1.2 * s);
    // Nose (pink)
    g.fillStyle(0xff69b4, 1);
    g.fillCircle(cx, gy - 22 * s, 1.2 * s);
    // Tail
    g.lineStyle(3, 0xff8c00, 1);
    g.beginPath();
    g.moveTo(cx - 8 * s, gy - 14 * s);
    g.lineTo(cx - 14 * s, gy - 20 * s);
    g.lineTo(cx - 12 * s, gy - 24 * s);
    g.strokePath();
  },

  // Taolabi: woodpecker
  taolabi(g, cx, gy, s) {
    // Legs (thin)
    g.lineStyle(2, 0x795548, 1);
    g.beginPath();
    g.moveTo(cx - 2 * s, gy);
    g.lineTo(cx - 2 * s, gy - 6 * s);
    g.moveTo(cx + 2 * s, gy);
    g.lineTo(cx + 2 * s, gy - 6 * s);
    g.strokePath();
    // Body (green/brown oval)
    g.fillStyle(0x558b2f, 1);
    g.fillEllipse(cx, gy - 14 * s, 10 * s, 14 * s);
    // Wing
    g.fillStyle(0x33691e, 1);
    g.fillEllipse(cx + 3 * s, gy - 14 * s, 6 * s, 9 * s);
    // Head
    g.fillStyle(0x558b2f, 1);
    g.fillCircle(cx, gy - 23 * s, 5 * s);
    // Red crest
    g.fillStyle(0xff0000, 1);
    g.fillEllipse(cx, gy - 29 * s, 4 * s, 5 * s);
    // Eye
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx + 2 * s, gy - 23 * s, 2 * s);
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx + 2.5 * s, gy - 23 * s, 1 * s);
    // Beak (long, yellow)
    g.fillStyle(0xffc107, 1);
    g.fillTriangle(
      cx + 5 * s, gy - 22 * s,
      cx + 12 * s, gy - 23 * s,
      cx + 5 * s, gy - 24 * s,
    );
  },

  // Chichi Gonju: rabbit
  chichi(g, cx, gy, s) {
    // Legs
    g.fillStyle(0xe0e0e0, 1);
    g.fillRect(cx - 4 * s, gy - 8 * s, 3 * s, 8 * s);
    g.fillRect(cx + 1 * s, gy - 8 * s, 3 * s, 8 * s);
    // Body (white-ish)
    g.fillStyle(0xf5f5f5, 1);
    g.fillEllipse(cx, gy - 16 * s, 12 * s, 14 * s);
    // Head
    g.fillCircle(cx, gy - 24 * s, 6 * s);
    // Long ears
    g.fillStyle(0xf5f5f5, 1);
    g.fillEllipse(cx - 3 * s, gy - 36 * s, 4 * s, 10 * s);
    g.fillEllipse(cx + 3 * s, gy - 36 * s, 4 * s, 10 * s);
    // Inner ears (pink)
    g.fillStyle(0xff69b4, 0.6);
    g.fillEllipse(cx - 3 * s, gy - 36 * s, 2 * s, 7 * s);
    g.fillEllipse(cx + 3 * s, gy - 36 * s, 2 * s, 7 * s);
    // Eyes
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 2.5 * s, gy - 25 * s, 1.5 * s);
    g.fillCircle(cx + 2.5 * s, gy - 25 * s, 1.5 * s);
    // Nose (pink)
    g.fillStyle(0xff69b4, 1);
    g.fillCircle(cx, gy - 22.5 * s, 1.2 * s);
    // Whiskers
    g.lineStyle(1, 0xaaaaaa, 0.5);
    g.beginPath();
    g.moveTo(cx - 2 * s, gy - 22 * s); g.lineTo(cx - 8 * s, gy - 21 * s);
    g.moveTo(cx - 2 * s, gy - 21 * s); g.lineTo(cx - 8 * s, gy - 22 * s);
    g.moveTo(cx + 2 * s, gy - 22 * s); g.lineTo(cx + 8 * s, gy - 21 * s);
    g.moveTo(cx + 2 * s, gy - 21 * s); g.lineTo(cx + 8 * s, gy - 22 * s);
    g.strokePath();
    // Tail (small puff behind)
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(cx - 6 * s, gy - 12 * s, 3 * s);
  },

  // Starway: electric eel
  starway(g, cx, gy, s) {
    // Sinuous body (horizontal S-curve sitting on ground)
    g.lineStyle(8 * s, 0x0077cc, 1);
    g.beginPath();
    g.moveTo(cx - 12 * s, gy - 6 * s);
    g.lineTo(cx - 6 * s, gy - 14 * s);
    g.lineTo(cx, gy - 8 * s);
    g.lineTo(cx + 6 * s, gy - 16 * s);
    g.lineTo(cx + 10 * s, gy - 10 * s);
    g.strokePath();
    // Lighter belly stripe
    g.lineStyle(4 * s, 0x29b6f6, 0.7);
    g.beginPath();
    g.moveTo(cx - 12 * s, gy - 6 * s);
    g.lineTo(cx - 6 * s, gy - 14 * s);
    g.lineTo(cx, gy - 8 * s);
    g.lineTo(cx + 6 * s, gy - 16 * s);
    g.lineTo(cx + 10 * s, gy - 10 * s);
    g.strokePath();
    // Head
    g.fillStyle(0x0077cc, 1);
    g.fillCircle(cx + 10 * s, gy - 10 * s, 4 * s);
    // Eye
    g.fillStyle(0xffff00, 1);
    g.fillCircle(cx + 11 * s, gy - 11 * s, 1.5 * s);
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx + 11.5 * s, gy - 11 * s, 0.7 * s);
    // Electric sparks (yellow zigzag lines)
    g.lineStyle(1.5, 0xffff00, 0.8);
    g.beginPath();
    g.moveTo(cx - 8 * s, gy - 18 * s);
    g.lineTo(cx - 5 * s, gy - 16 * s);
    g.lineTo(cx - 7 * s, gy - 14 * s);
    g.strokePath();
    g.beginPath();
    g.moveTo(cx + 3 * s, gy - 20 * s);
    g.lineTo(cx + 6 * s, gy - 18 * s);
    g.lineTo(cx + 4 * s, gy - 16 * s);
    g.strokePath();
    g.beginPath();
    g.moveTo(cx + 8 * s, gy - 16 * s);
    g.lineTo(cx + 11 * s, gy - 14 * s);
    g.lineTo(cx + 9 * s, gy - 12 * s);
    g.strokePath();
  },
};
