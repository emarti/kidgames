import Phaser from 'phaser';
import * as FerryRenderer from '../renderers/ferry_renderer.js';

/**
 * PlayScene – Archimedes: Physics Toy Museum
 *
 * Top-level scene that dispatches rendering and input to the active
 * module's renderer. Owns generic chrome: start overlay, module-select
 * overlay, player cursors, and keyboard shortcuts.
 */
export default class PlayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PlayScene' });
  }

  // ── Module renderer registry ───────────────────────────────────────────────
  // Maps moduleType (from state) → renderer module.
  // Each renderer exports: { create, renderState, onPointerDown, onPointerUp, destroy }

  static RENDERERS = {
    ferry: FerryRenderer,
    // seesaw: SeesawRenderer,
    // pulley: PulleyRenderer,
    // …
  };

  static MODULE_CATALOG = [
    {
      type: 'ferry',
      name: '🚢 Buoyancy Ferry',
      levels: [
        { n: 1, label: 'Level 1: River Ferry', clr: '#27ae60' },
        { n: 2, label: 'Level 2: Heavy Load', clr: '#3498db' },
        { n: 3, label: 'Level 3: Boulder Run', clr: '#9b59b6' },
      ],
    },
    { type: 'gears', name: '⚙️ Gears', levels: [{ n: 1, label: 'Level 1', clr: '#34495e' }] },
    { type: 'sail', name: '⛵ Sailing', levels: [{ n: 1, label: 'Level 1', clr: '#16a085' }] },
    { type: 'pi', name: '🥧 Pi Jar', levels: [{ n: 1, label: 'Level 1', clr: '#8e44ad' }] },
    { type: 'seesaw', name: '⚖️ Seesaw', levels: [{ n: 1, label: 'Level 1', clr: '#d35400' }] },
    { type: 'pulley', name: '🔗 Pulley', levels: [{ n: 1, label: 'Level 1', clr: '#7f8c8d' }] },
  ];

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  create() {
    this.graphics = this.add.graphics();

    // Persistent caches
    this.cursorTexts = new Map();

    // Drag state (shared — renderers write to this)
    this.draggedObjectId = null;

    // Track active module for renderer switching
    this._activeModuleType = null;

    // Overlays
    this.createStartOverlay();
    this.createLevelSelectOverlay();

    // Input
    this.input.on('pointerdown', (p) => this.onPointerDown(p));
    this.input.on('pointermove', (p) => this.onPointerMove(p));
    this.input.on('pointerup',   (p) => this.onPointerUp(p));

    this.input.keyboard.on('keydown-SPACE', () => this.game.net.sendInput('go'));
    this.input.keyboard.on('keydown-R',     () => this.game.net.sendInput('reset'));
    this.input.keyboard.on('keydown-P',     () => this.game.net.sendInput('toggle_pause'));
    this.input.keyboard.on('keydown-L',     () => this.game.net.sendInput('toggle_level_select'));
    this.input.keyboard.on('keydown-ESC',   () => this.game.net.send('pause'));

    // Network
    this.game.net.addEventListener('state', (e) => this.renderState(e.detail));

    // First paint
    if (this.game.net.latestState) this.renderState(this.game.net.latestState);
  }

  // ── Coordinate helpers ─────────────────────────────────────────────────────

  sx(x) {
    const s = this.game.net.latestState;
    return s ? (x / s.sceneWidth) * this.scale.width : x;
  }
  sy(y) {
    const s = this.game.net.latestState;
    return s ? (y / s.sceneHeight) * this.scale.height : y;
  }
  ux(screenX) {
    const s = this.game.net.latestState;
    return s ? (screenX / this.scale.width) * s.sceneWidth : screenX;
  }
  uy(screenY) {
    const s = this.game.net.latestState;
    return s ? (screenY / this.scale.height) * s.sceneHeight : screenY;
  }

  // ── Input handlers ─────────────────────────────────────────────────────────

  onPointerDown(pointer) {
    const state = this.game.net.latestState;
    if (!state) return;
    const renderer = this.getRenderer(state);
    if (renderer?.onPointerDown) renderer.onPointerDown(this, pointer, state);
  }

  onPointerMove(pointer) {
    const state = this.game.net.latestState;
    if (!state) return;
    this.game.net.sendInput('cursor_move', { x: this.ux(pointer.x), y: this.uy(pointer.y) });
  }

  onPointerUp() {
    const state = this.game.net.latestState;
    const renderer = state ? this.getRenderer(state) : null;
    if (renderer?.onPointerUp) renderer.onPointerUp(this);
  }

  // ── Renderer dispatch ─────────────────────────────────────────────────────

  getRenderer(state) {
    return PlayScene.RENDERERS[state.moduleType] || null;
  }

  /** Switch renderers when the moduleType changes. */
  _switchRenderer(newType) {
    if (this._activeModuleType === newType) return;

    // Tear down old renderer
    if (this._activeModuleType) {
      const old = PlayScene.RENDERERS[this._activeModuleType];
      if (old?.destroy) old.destroy(this);
    }

    // Initialize new renderer
    this._activeModuleType = newType;
    const next = PlayScene.RENDERERS[newType];
    if (next?.create) next.create(this);
  }

  // ── Overlays ───────────────────────────────────────────────────────────────

  createStartOverlay() {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    this.startContainer = this.add.container(cx, cy).setDepth(500).setVisible(false);

    const bg = this.add.rectangle(0, 0, 400, 300, 0x000000, 0.85).setOrigin(0.5);
    this.startContainer.add(bg);

    this.overlayTitle = this.add.text(0, -110, 'ARCHIMEDES', {
      fontSize: '30px', color: '#fff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.startContainer.add(this.overlayTitle);

    this.overlayLevel = this.add.text(0, -75, '', {
      fontSize: '18px', color: '#3498db',
    }).setOrigin(0.5);
    this.startContainer.add(this.overlayLevel);

    this.overlayRoom = this.add.text(0, -45, '', {
      fontSize: '14px', color: '#aaa',
    }).setOrigin(0.5);
    this.startContainer.add(this.overlayRoom);

    const instructions = this.add.text(0, 10,
      'Drag items onto the boat\n' +
      'Press GO to sail across\n' +
      'Don\'t overload or it sinks!', {
      fontSize: '15px', color: '#ccc', align: 'center', lineSpacing: 4,
    }).setOrigin(0.5);
    this.startContainer.add(instructions);

    const btn = this.add.text(0, 95, 'START', {
      fontSize: '24px', color: '#fff', backgroundColor: '#27ae60',
      padding: { x: 30, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => this.game.net.send('resume'));
    btn.on('pointerover', () => btn.setBackgroundColor('#2ecc71'));
    btn.on('pointerout',  () => btn.setBackgroundColor('#27ae60'));
    this.startContainer.add(btn);
  }

  createLevelSelectOverlay() {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    this.levelContainer = this.add.container(cx, cy).setDepth(400).setVisible(false);

    const bg = this.add.rectangle(0, 0, 360, 380, 0x1a1a2e, 0.95).setOrigin(0.5);
    this.levelContainer.add(bg);

    this._levelSelectTitle = this.add.text(0, -165, 'SELECT MODULE + LEVEL', {
      fontSize: '20px', color: '#fff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.levelContainer.add(this._levelSelectTitle);

    this._levelSelectSubtitle = this.add.text(0, -140, '', {
      fontSize: '13px', color: '#c7c7d1',
    }).setOrigin(0.5);
    this.levelContainer.add(this._levelSelectSubtitle);

    this._levelSelectSectionModules = this.add.text(-160, -115, 'MODULES', {
      fontSize: '12px', color: '#c7c7d1', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.levelContainer.add(this._levelSelectSectionModules);

    this._levelSelectSectionLevels = this.add.text(-160, 30, 'LEVELS', {
      fontSize: '12px', color: '#c7c7d1', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.levelContainer.add(this._levelSelectSectionLevels);

    // Module buttons will be populated dynamically from state
    this._levelSelectButtons = [];
    this._levelSelectButtonMeta = [];

    const close = this.add.text(0, 130, 'CLOSE', {
      fontSize: '16px', color: '#fff', backgroundColor: '#e74c3c',
      padding: { x: 16, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.game.net.sendInput('toggle_level_select'));
    close.setPosition(0, 160);
    this.levelContainer.add(close);
  }

  /**
   * Rebuild module-select buttons when moduleList changes.
   * For now, shows sub-levels within the current module.
   * Future: show all modules + expand sub-levels.
   */
  _rebuildLevelSelectButtons(state) {
    // Remove old buttons
    for (const btn of this._levelSelectButtons) {
      btn.destroy();
    }
    this._levelSelectButtons = [];
    this._levelSelectButtonMeta = [];

    const selectedModule = String(state?.moduleType || 'ferry');
    const selectedLevel = Number(state?.level || 1);

    const modules = PlayScene.MODULE_CATALOG;

    // Modules grid (2 columns)
    const x0 = -85;
    const y0 = -85;
    const dx = 170;
    const dy = 40;
    for (let i = 0; i < modules.length; i++) {
      const m = modules[i];
      const col = i % 2;
      const row = Math.floor(i / 2);

      const enabled = Boolean(PlayScene.RENDERERS[m.type]);
      const isSelected = m.type === selectedModule;
      const bg = isSelected ? '#2c3e50' : '#34495e';
      const alpha = enabled ? 1 : 0.35;

      const btn = this.add.text(x0 + col * dx, y0 + row * dy, m.name, {
        fontSize: '14px', color: '#fff', backgroundColor: bg,
        padding: { x: 10, y: 7 },
      }).setOrigin(0.5).setAlpha(alpha);

      if (enabled) {
        btn.setInteractive({ useHandCursor: true });
        btn.on('pointerdown', () => this.game.net.sendInput('set_module', { moduleType: m.type, subLevel: 1 }));
      }

      this.levelContainer.add(btn);
      this._levelSelectButtons.push(btn);
      this._levelSelectButtonMeta.push({ kind: 'module', type: m.type, btn, enabled });
    }

    // Levels list for selected module
    const active = modules.find((m) => m.type === selectedModule) || modules[0];
    const enabledLevels = Boolean(PlayScene.RENDERERS[active.type]);
    const levels = Array.isArray(active.levels) ? active.levels : [];
    for (let i = 0; i < levels.length; i++) {
      const l = levels[i];
      const isSelected = Number(l.n) === selectedLevel;
      const alpha = enabledLevels ? 1 : 0.35;
      const bg = isSelected ? '#1abc9c' : (l.clr || '#2ecc71');

      const btn = this.add.text(0, 65 + i * 45, l.label, {
        fontSize: '16px', color: '#fff', backgroundColor: bg,
        padding: { x: 18, y: 8 },
      }).setOrigin(0.5).setAlpha(alpha);

      if (enabledLevels) {
        btn.setInteractive({ useHandCursor: true });
        btn.on('pointerdown', () => this.game.net.sendInput('set_level', { level: Number(l.n) || 1 }));
      }

      this.levelContainer.add(btn);
      this._levelSelectButtons.push(btn);
      this._levelSelectButtonMeta.push({ kind: 'level', moduleType: active.type, level: Number(l.n) || 1, btn, enabled: enabledLevels });
    }

    if (this._levelSelectSubtitle) {
      const activeName = active?.name || 'Unknown';
      const suffix = enabledLevels ? '' : ' (coming soon)';
      this._levelSelectSubtitle.setText(`${activeName}${suffix}`);
    }
  }

  _updateLevelSelectButtonStyles(state) {
    const selectedModule = String(state?.moduleType || 'ferry');
    const selectedLevel = Number(state?.level || 1);

    for (const m of this._levelSelectButtonMeta || []) {
      if (m.kind === 'module') {
        const isSelected = m.type === selectedModule;
        m.btn.setBackgroundColor(isSelected ? '#2c3e50' : '#34495e');
      } else if (m.kind === 'level') {
        const isSelected = m.moduleType === selectedModule && m.level === selectedLevel;
        if (isSelected) m.btn.setBackgroundColor('#1abc9c');
      }
    }
  }


  // ── Main render ────────────────────────────────────────────────────────────

  renderState(state) {
    if (!state) return;

    // Switch renderer if module changed
    this._switchRenderer(state.moduleType || 'ferry');

    this.graphics.clear();

    // Delegate module-specific rendering
    const renderer = this.getRenderer(state);
    if (renderer) renderer.renderState(this, state);

    // Generic: player cursors
    this.drawCursors(state);

    // Generic: overlays
    this.updateOverlays(state);
  }

  // ── Player cursors (generic) ────────────────────────────────────────────────

  drawCursors(state) {
    const myId = this.game.net?.playerId;
    for (const [pidStr, p] of Object.entries(state.players)) {
      const pid = Number(pidStr);
      if (!p.connected || pid === myId) continue;

      const x = this.sx(p.cursorX);
      const y = this.sy(p.cursorY);
      const c = Phaser.Display.Color.HexStringToColor(p.color).color;

      this.graphics.fillStyle(c, 0.7);
      this.graphics.beginPath();
      this.graphics.moveTo(x, y);
      this.graphics.lineTo(x + 5, y + 16);
      this.graphics.lineTo(x - 4, y + 18);
      this.graphics.closePath();
      this.graphics.fillPath();
    }
  }

  // ── Overlay updates (generic) ─────────────────────────────────────────────

  updateOverlays(state) {
    const myId = this.game.net?.playerId;
    const me = myId ? state.players?.[myId] : null;
    const isLobby = state.paused && state.reasonPaused === 'start';

    this.startContainer.setVisible(isLobby || (me?.paused && !state.gamePaused));
    if (isLobby) {
      this.overlayLevel.setText(state.moduleName || state.levelName || '');
      this.overlayRoom.setText(`Room: ${this.game.net.roomId || '????'}  |  Player ${myId || '?'}`);
    }

    // Rebuild level select buttons if module changed
    if (state.showLevelSelect && !this._levelSelectBuilt) {
      this._rebuildLevelSelectButtons(state);
      this._levelSelectBuilt = true;
    } else if (state.showLevelSelect) {
      this._updateLevelSelectButtonStyles(state);
    }
    if (!state.showLevelSelect) {
      this._levelSelectBuilt = false;
    }

    this.levelContainer.setVisible(!!state.showLevelSelect);
  }
}
