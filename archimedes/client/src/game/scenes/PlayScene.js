import Phaser from 'phaser';

/**
 * PlayScene - Main game scene for Archimedes: River Ferry
 * 
 * Touch-first drag-and-drop physics playground where players load objects
 * onto a ferry boat to transport them across a river.
 */
export default class PlayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PlayScene' });
  }

  create() {
    this.graphics = this.add.graphics();
    
    // UI containers
    this.setupContainer = this.add.container(0, 0);
    this.setupContainer.setDepth(500);
    this.setupContainer.setVisible(false);

    // Level select container
    this.levelSelectContainer = this.add.container(0, 0);
    this.levelSelectContainer.setDepth(400);
    this.levelSelectContainer.setVisible(false);

    // Pause overlay container
    this.pauseContainer = this.add.container(0, 0);
    this.pauseContainer.setDepth(450);
    this.pauseContainer.setVisible(false);

    // Emoji text objects for objects (easier than sprites)
    this.objectEmojis = new Map();

    // Dragging state
    this.draggedObjectId = null;

    // Setup input
    this.setupInput();

    // Setup networking
    this.setupNetworking();

    // Create overlays
    this.createSetupOverlay();
    this.createPauseOverlay();
    this.createLevelSelectOverlay();

    // UI elements
    this.createUI();

    // Initial render
    this.renderState(this.game.net.latestState);
  }

  setupInput() {
    // Pointer events for touch and mouse
    this.input.on('pointerdown', (pointer) => this.onPointerDown(pointer));
    this.input.on('pointermove', (pointer) => this.onPointerMove(pointer));
    this.input.on('pointerup', (pointer) => this.onPointerUp(pointer));

    // Keyboard shortcuts
    this.input.keyboard.on('keydown-SPACE', () => {
      this.game.net.sendInput('go');
    });
    this.input.keyboard.on('keydown-R', () => {
      this.game.net.sendInput('reset');
    });
    this.input.keyboard.on('keydown-P', () => {
      this.game.net.sendInput('toggle_pause');
    });
    this.input.keyboard.on('keydown-L', () => {
      this.game.net.sendInput('toggle_level_select');
    });
    this.input.keyboard.on('keydown-ESC', () => {
      this.game.net.send('pause');
    });
  }

  setupNetworking() {
    this.game.net.addEventListener('state', (e) => {
      this.renderState(e.detail);
    });
  }

  createSetupOverlay() {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    // Semi-transparent background
    const bg = this.add.rectangle(0, 0, 420, 340, 0x000000, 0.85);
    bg.setOrigin(0.5);
    this.setupContainer.add(bg);

    // Title
    this.overlayTitle = this.add.text(0, -130, 'ARCHIMEDES', {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.setupContainer.add(this.overlayTitle);

    // Subtitle
    this.overlaySubtitle = this.add.text(0, -95, '🚢 River Ferry', {
      fontSize: '20px',
      color: '#3498db',
    }).setOrigin(0.5);
    this.setupContainer.add(this.overlaySubtitle);

    // Room info
    this.roomInfoText = this.add.text(0, -55, '', {
      fontSize: '16px',
      color: '#aaaaaa',
    }).setOrigin(0.5);
    this.setupContainer.add(this.roomInfoText);

    // Instructions
    const instructions = this.add.text(0, 10, 
      '🎯 Drag objects onto the boat\n' +
      '⚖️ Watch the balance change\n' +
      '▶️ Press GO to sail across\n' +
      '🔄 Boat auto-unloads at shore\n' +
      '⚠️ Don\'t overload or tip!', {
      fontSize: '15px',
      color: '#cccccc',
      align: 'center',
      lineSpacing: 4,
    }).setOrigin(0.5);
    this.setupContainer.add(instructions);

    // Start button
    const startBtn = this.add.text(0, 120, '▶️ START PLAYING', {
      fontSize: '22px',
      color: '#ffffff',
      backgroundColor: '#27ae60',
      padding: { x: 20, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    startBtn.on('pointerdown', () => {
      this.game.net.send('resume');
    });
    startBtn.on('pointerover', () => startBtn.setBackgroundColor('#2ecc71'));
    startBtn.on('pointerout', () => startBtn.setBackgroundColor('#27ae60'));
    this.setupContainer.add(startBtn);

    this.setupContainer.setPosition(cx, cy);
  }

  createPauseOverlay() {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    // Semi-transparent background
    const bg = this.add.rectangle(0, 0, 300, 180, 0x000000, 0.85);
    bg.setOrigin(0.5);
    this.pauseContainer.add(bg);

    // Paused text
    const pauseText = this.add.text(0, -40, '⏸️ PAUSED', {
      fontSize: '32px',
      color: '#f1c40f',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.pauseContainer.add(pauseText);

    // Instructions
    const hint = this.add.text(0, 20, 'Press P to resume\nPress L for levels', {
      fontSize: '16px',
      color: '#cccccc',
      align: 'center',
    }).setOrigin(0.5);
    this.pauseContainer.add(hint);

    // Resume button
    const resumeBtn = this.add.text(0, 65, '▶️ RESUME', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#27ae60',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    resumeBtn.on('pointerdown', () => {
      this.game.net.sendInput('toggle_pause');
    });
    this.pauseContainer.add(resumeBtn);

    this.pauseContainer.setPosition(cx, cy);
  }

  createLevelSelectOverlay() {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    // Semi-transparent background
    const bg = this.add.rectangle(0, 0, 350, 280, 0x1a1a2e, 0.95);
    bg.setOrigin(0.5);
    this.levelSelectContainer.add(bg);

    // Title
    const title = this.add.text(0, -110, '📋 SELECT LEVEL', {
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.levelSelectContainer.add(title);

    // Level buttons (will be positioned dynamically)
    this.levelButtons = [];
    const levels = [
      { num: 1, name: '🚢 River Ferry (4 kids)', color: '#27ae60' },
      { num: 2, name: '⚖️ Heavy Load (6 kids)', color: '#3498db' },
      { num: 3, name: '🎈 Balloon Lift', color: '#9b59b6' },
    ];

    for (let i = 0; i < levels.length; i++) {
      const lvl = levels[i];
      const y = -50 + i * 50;
      
      const btn = this.add.text(0, y, `${lvl.num}. ${lvl.name}`, {
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: lvl.color,
        padding: { x: 20, y: 10 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      btn.on('pointerdown', () => {
        this.game.net.sendInput('set_level', { level: lvl.num });
      });
      btn.on('pointerover', () => btn.setAlpha(0.8));
      btn.on('pointerout', () => btn.setAlpha(1));
      
      this.levelSelectContainer.add(btn);
      this.levelButtons.push(btn);
    }

    // Close button
    const closeBtn = this.add.text(0, 105, '✖️ CLOSE (L)', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#e74c3c',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    closeBtn.on('pointerdown', () => {
      this.game.net.sendInput('toggle_level_select');
    });
    this.levelSelectContainer.add(closeBtn);

    this.levelSelectContainer.setPosition(cx, cy);
  }

  createUI() {
    // Level title (top-left)
    this.levelTitle = this.add.text(16, 16, '', {
      fontSize: '20px',
      color: '#1a5276',
      fontStyle: 'bold',
    });

    // Room code and progress (top-left, below title)
    this.roomCodeText = this.add.text(16, 44, '', {
      fontSize: '14px',
      color: '#666666',
    });

    // Door (top-right) - initially closed
    this.doorBtn = this.add.text(this.scale.width - 16, 16, '🚪', {
      fontSize: '36px',
      color: '#888888',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });

    this.doorBtn.on('pointerdown', () => {
      this.game.net.sendInput('door_click');
    });

    // Message area (top center)
    this.messageText = this.add.text(this.scale.width / 2, 20, '', {
      fontSize: '16px',
      color: '#2c3e50',
      backgroundColor: '#ecf0f1',
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 0).setVisible(false);

    // Bottom toolbar buttons
    this.createToolbarButtons();

    // Physics info display (when hints enabled)
    this.physicsInfo = this.add.text(16, 72, '', {
      fontSize: '12px',
      color: '#666666',
    });
  }

  createToolbarButtons() {
    const btnY = this.scale.height - 35;
    
    // Pause button (leftmost)
    this.pauseBtn = this.add.text(20, btnY, '⏸️', {
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#f39c12',
      padding: { x: 12, y: 8 },
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });

    this.pauseBtn.on('pointerdown', () => {
      this.game.net.sendInput('toggle_pause');
    });

    // Level select button
    this.levelBtn = this.add.text(70, btnY, '📋', {
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#9b59b6',
      padding: { x: 12, y: 8 },
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });

    this.levelBtn.on('pointerdown', () => {
      this.game.net.sendInput('toggle_level_select');
    });

    // Hints toggle
    this.hintsBtn = this.add.text(120, btnY, '💡', {
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#3498db',
      padding: { x: 10, y: 8 },
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });

    this.hintsBtn.on('pointerdown', () => {
      this.game.net.sendInput('toggle_hints');
    });

    // GO button (right side) - BIG for kids!
    this.goBtn = this.add.text(this.scale.width - 160, btnY, '▶️ GO', {
      fontSize: '28px',
      color: '#ffffff',
      backgroundColor: '#27ae60',
      padding: { x: 20, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.goBtn.on('pointerdown', () => {
      this.game.net.sendInput('go');
    });
    this.goBtn.on('pointerover', () => this.goBtn.setBackgroundColor('#2ecc71'));
    this.goBtn.on('pointerout', () => this.goBtn.setBackgroundColor('#27ae60'));

    // RESET button - also big
    this.resetBtn = this.add.text(this.scale.width - 55, btnY, '🔄', {
      fontSize: '28px',
      color: '#ffffff',
      backgroundColor: '#e74c3c',
      padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.resetBtn.on('pointerdown', () => {
      this.game.net.sendInput('reset');
    });
    this.resetBtn.on('pointerover', () => this.resetBtn.setBackgroundColor('#c0392b'));
    this.resetBtn.on('pointerout', () => this.resetBtn.setBackgroundColor('#e74c3c'));
  }

  // ----- Input Handlers -----

  onPointerDown(pointer) {
    const state = this.game.net.latestState;
    if (!state || state.gamePaused || state.showLevelSelect) return;

    const x = pointer.x;
    const y = pointer.y;

    // Scale pointer to game coordinates
    const gameX = this.unscaleX(x);
    const gameY = this.unscaleY(y);

    // Check if clicking on an existing object
    for (const obj of state.objects) {
      const dist = Math.hypot(obj.x - gameX, obj.y - gameY);
      if (dist < obj.size && !obj.claimedBy) {
        this.game.net.sendInput('grab', { objectId: obj.id });
        this.draggedObjectId = obj.id;
        return;
      }
    }
  }

  onPointerMove(pointer) {
    const state = this.game.net.latestState;
    if (!state) return;

    // Scale pointer to game coordinates
    const gameX = this.unscaleX(pointer.x);
    const gameY = this.unscaleY(pointer.y);

    // Always send cursor position for multiplayer cursor display
    this.game.net.sendInput('cursor_move', { x: gameX, y: gameY });
  }

  onPointerUp(pointer) {
    if (this.draggedObjectId) {
      this.game.net.sendInput('release');
      this.draggedObjectId = null;
    }
  }

  // ----- Rendering -----

  renderState(state) {
    if (!state) return;

    this.graphics.clear();

    // Update overlays visibility
    const myId = this.game.net?.playerId;
    const me = myId ? state.players?.[myId] : null;
    const isLobby = state.paused && state.reasonPaused === 'start';
    const isPaused = me?.paused;

    // Setup/lobby overlay
    this.setupContainer.setVisible(isLobby || isPaused);
    if (isLobby) {
      this.overlayTitle.setText('ARCHIMEDES');
      this.overlaySubtitle.setText(state.levelName || '🚢 River Ferry');
      this.roomInfoText.setText(`Room: ${this.game.net.roomId || '????'}\nPlayer ${myId || '?'}`);
    } else if (isPaused) {
      this.overlayTitle.setText('PAUSED');
      this.overlaySubtitle.setText('Press START to continue');
      this.roomInfoText.setText('');
    }

    // Game pause overlay (P key)
    this.pauseContainer.setVisible(state.gamePaused && !isLobby && !isPaused);

    // Level select overlay
    this.levelSelectContainer.setVisible(state.showLevelSelect);

    // Update room code display
    this.roomCodeText.setText(
      `Room: ${this.game.net.roomId || '----'} | Progress: ${state.deliveredCount}/${state.totalToDeliver} | Trips: ${state.tripsCompleted}`
    );

    // Update level title
    this.levelTitle.setText(state.levelName || 'Level ' + state.level);

    // Draw scene
    this.drawRiverBanks(state);
    this.drawWater(state);
    this.drawBoat(state);
    this.drawObjects(state);
    this.drawPlayerCursors(state);
    this.drawPhysicsOverlay(state);

    // Update UI
    this.updateUI(state);
  }

  drawRiverBanks(state) {
    const w = this.scale.width;
    const h = this.scale.height - 60; // Leave toolbar space
    const waterY = this.scaleY(state.waterY); // Water level at middle
    const leftX = this.scaleX(state.leftShoreX);
    const rightX = this.scaleX(state.rightShoreX);

    // Sky - entire top half (above water level)
    this.graphics.fillStyle(0x87ceeb);
    this.graphics.fillRect(0, 0, w, waterY);
    
    // Lighter sky near horizon
    this.graphics.fillStyle(0xb0e0f6, 0.5);
    this.graphics.fillRect(0, waterY - 40, w, 40);

    // Left grass - bottom left area (below water level, to the left)
    this.graphics.fillStyle(0x228b22);
    this.graphics.fillRect(0, waterY, leftX, h - waterY);
    
    // Left grass top surface (the ground people stand on)
    this.graphics.fillStyle(0x32cd32);
    this.graphics.fillRect(0, waterY - 8, leftX - 5, 8);
    
    // Left brown shore edge - thin vertical line at water's edge
    this.graphics.fillStyle(0x8b4513);
    this.graphics.fillRect(leftX - 8, waterY - 8, 8, h - waterY + 8);
    
    // Shore dirt texture
    this.graphics.lineStyle(1, 0x6b3510);
    for (let y = waterY; y < h; y += 15) {
      this.graphics.lineBetween(leftX - 7, y, leftX - 1, y + 5);
    }

    // Right grass - bottom right area
    this.graphics.fillStyle(0x228b22);
    this.graphics.fillRect(rightX, waterY, w - rightX, h - waterY);
    
    // Right grass top surface
    this.graphics.fillStyle(0x32cd32);
    this.graphics.fillRect(rightX + 5, waterY - 8, w - rightX - 5, 8);
    
    // Right brown shore edge - thin vertical line
    this.graphics.fillStyle(0x8b4513);
    this.graphics.fillRect(rightX, waterY - 8, 8, h - waterY + 8);
    
    // Shore dirt texture
    this.graphics.lineStyle(1, 0x6b3510);
    for (let y = waterY; y < h; y += 15) {
      this.graphics.lineBetween(rightX + 1, y, rightX + 7, y + 5);
    }

    // Shore labels on the grass
    if (!this._shoreLabels) {
      this._leftLabel = this.add.text(leftX / 2, waterY + 30, 'START', {
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#2d5016',
        strokeThickness: 3,
      }).setOrigin(0.5);
      this._rightLabel = this.add.text(rightX + (w - rightX) / 2, waterY + 30, 'GOAL', {
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#2d5016',
        strokeThickness: 3,
      }).setOrigin(0.5);
      this._shoreLabels = true;
    }
  }

  drawWater(state) {
    const waterY = this.scaleY(state.waterY); // Water surface at middle
    const leftX = this.scaleX(state.leftShoreX);
    const rightX = this.scaleX(state.rightShoreX);
    const h = this.scale.height - 60;

    // Water fills from shore to shore, from waterline down
    this.graphics.fillStyle(0x3498db);
    this.graphics.fillRect(leftX, waterY, rightX - leftX, h - waterY);

    // Lighter water at surface
    this.graphics.fillStyle(0x5dade2, 0.4);
    this.graphics.fillRect(leftX, waterY, rightX - leftX, 20);

    // Water surface line (the waterline)
    this.graphics.lineStyle(3, 0x2980b9);
    this.graphics.lineBetween(leftX, waterY, rightX, waterY);

    // Subtle depth waves
    this.graphics.lineStyle(1, 0x2471a3, 0.3);
    for (let i = 1; i <= 4; i++) {
      const waveY = waterY + 25 * i;
      if (waveY < h) {
        this.graphics.lineBetween(leftX + 5, waveY, rightX - 5, waveY);
      }
    }

    // Darker water at bottom
    this.graphics.fillStyle(0x1a5276, 0.4);
    this.graphics.fillRect(leftX, h - 40, rightX - leftX, 40);
  }

  drawBoat(state) {
    const boat = state.boat;
    const bx = this.scaleX(boat.x);
    const waterY = this.scaleY(state.waterY); // The fixed water level
    // Boat sits at waterline, sinks down as cargo increases
    const sinkAmount = (boat.sinkOffset || 0) * 0.8;
    const by = waterY + sinkAmount;
    const hw = 135; // half width
    const hh = 30;  // half height

    // Calculate rotation - normal tilt + capsize flip (180 degrees)
    let totalRotation = boat.tilt;
    if (boat.capsized) {
      totalRotation += boat.capsizeRotation || 0;
    }
    const tiltRad = (totalRotation * Math.PI) / 180;

    // Draw splash effects during capsize
    if (boat.capsized && boat.capsizeSplash > 0) {
      const splashAlpha = boat.capsizeSplash;
      this.graphics.fillStyle(0x5dade2, splashAlpha * 0.9);
      // Big splash circles radiating outward
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        const dist = 50 + (1 - splashAlpha) * 100;
        const sx = bx + Math.cos(angle) * dist;
        const sy = waterY + Math.abs(Math.sin(angle * 2)) * 20;
        const size = 12 + Math.random() * 18;
        this.graphics.fillCircle(sx, sy, size * splashAlpha);
      }
      // Water droplets flying up
      this.graphics.fillStyle(0x3498db, splashAlpha);
      for (let i = 0; i < 15; i++) {
        const dropX = bx + (Math.random() - 0.5) * 180;
        const dropY = waterY - (1 - splashAlpha) * 120 - Math.random() * 60;
        this.graphics.fillCircle(dropX, dropY, 4 + Math.random() * 6);
      }
    }

    this.graphics.save();
    this.graphics.translateCanvas(bx, by);
    this.graphics.rotateCanvas(tiltRad);

    // During capsize, make boat red and wobbly
    const hullColor = boat.capsized ? 0xc0392b : 0x8b4513;
    
    // Boat hull shadow
    this.graphics.fillStyle(0x000000, 0.2);
    this.graphics.beginPath();
    this.graphics.moveTo(-hw + 5, -hh * 0.3 + 4);
    this.graphics.lineTo(-hw * 0.9 + 5, hh + 4);
    this.graphics.lineTo(hw * 0.9 + 5, hh + 4);
    this.graphics.lineTo(hw + 5, -hh * 0.3 + 4);
    this.graphics.closePath();
    this.graphics.fillPath();

    // Boat hull
    this.graphics.fillStyle(hullColor);
    this.graphics.beginPath();
    this.graphics.moveTo(-hw, -hh * 0.3);
    this.graphics.lineTo(-hw * 0.9, hh);
    this.graphics.lineTo(hw * 0.9, hh);
    this.graphics.lineTo(hw, -hh * 0.3);
    this.graphics.closePath();
    this.graphics.fillPath();

    // Boat outline
    this.graphics.lineStyle(3, 0x5d4037);
    this.graphics.strokePath();

    // Deck (flat top where items sit)
    this.graphics.fillStyle(0xa0522d);
    this.graphics.fillRect(-hw * 0.95, -hh * 0.5, hw * 1.9, hh * 0.35);

    // Deck planks
    this.graphics.lineStyle(1, 0x8b4513, 0.4);
    for (let i = -hw * 0.85; i < hw * 0.85; i += 30) {
      this.graphics.lineBetween(i, -hh * 0.5, i, -hh * 0.15);
    }

    this.graphics.restore();

    // Draw the waterline ON the boat showing how deep it sits
    // This line should always be at waterY, cutting across the boat
    if (!boat.capsized) {
      this.graphics.lineStyle(3, 0x1a5276, 0.9);
      const cosT = Math.cos(tiltRad);
      const sinT = Math.sin(tiltRad);
      // Calculate where waterline intersects tilted boat
      const waterLineRelY = waterY - by; // Water relative to boat center
      const leftEdge = bx - hw * 0.85 * cosT;
      const rightEdge = bx + hw * 0.85 * cosT;
      this.graphics.lineBetween(leftEdge, waterY, rightEdge, waterY);
    }

    // Overload warning circle
    if (state.cargoMass > 45 && !boat.capsized) {
      this.graphics.lineStyle(4, 0xe74c3c, 0.9);
      this.graphics.strokeCircle(bx, by - 50, 20);
      // Exclamation mark
      this.graphics.fillStyle(0xe74c3c);
      this.graphics.fillRect(bx - 3, by - 60, 6, 15);
      this.graphics.fillCircle(bx, by - 40, 4);
    }

    // COM indicator (if hints enabled and cargo loaded)
    if (state.showHints && state.cargoMass > 0 && !boat.capsized) {
      const comScreenX = bx + state.comX * Math.cos(tiltRad);
      const comScreenY = by + state.comX * Math.sin(tiltRad);
      this.graphics.fillStyle(0xe74c3c);
      this.graphics.fillCircle(comScreenX, comScreenY - 20, 6);
    }

    // Sailing direction arrow
    if (boat.sailing && !boat.capsized) {
      this.graphics.lineStyle(4, 0x27ae60);
      const dir = boat.targetX > boat.x ? 1 : -1;
      this.graphics.lineBetween(bx + dir * 80, by - 55, bx + dir * 120, by - 55);
      this.graphics.lineBetween(bx + dir * 105, by - 70, bx + dir * 120, by - 55);
      this.graphics.lineBetween(bx + dir * 105, by - 40, bx + dir * 120, by - 55);
    }
  }

  drawObjects(state) {
    // Clean up old emoji texts
    const currentIds = new Set(state.objects.map(o => o.id));
    for (const [id, txt] of this.objectEmojis) {
      if (!currentIds.has(id)) {
        txt.destroy();
        this.objectEmojis.delete(id);
      }
    }

    for (const obj of state.objects) {
      const x = this.scaleX(obj.x);
      const y = this.scaleY(obj.y);
      const size = obj.size * 0.8;

      // Draw highlight ring if being dragged
      if (obj.claimedBy) {
        this.graphics.lineStyle(3, 0xf1c40f);
        this.graphics.strokeCircle(x, y, size + 6);
      }

      // Draw delivered indicator
      if (obj.delivered) {
        this.graphics.lineStyle(2, 0x27ae60);
        this.graphics.strokeCircle(x, y, size + 4);
      }

      // Background circle
      this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(obj.color).color, 0.8);
      this.graphics.fillCircle(x, y, size);
      this.graphics.lineStyle(2, 0x333333, 0.5);
      this.graphics.strokeCircle(x, y, size);

      // Emoji text
      let emojiTxt = this.objectEmojis.get(obj.id);
      if (!emojiTxt) {
        emojiTxt = this.add.text(x, y, obj.emoji, {
          fontSize: `${Math.floor(size * 1.2)}px`,
        }).setOrigin(0.5).setDepth(100);
        this.objectEmojis.set(obj.id, emojiTxt);
      }
      emojiTxt.setPosition(x, y);
      emojiTxt.setFontSize(Math.floor(size * 1.2));

      // Mass label (if hints enabled) - BIG numbers, no 'kg'
      if (state.showHints) {
        this.graphics.fillStyle(0x000000, 0.8);
        this.graphics.fillRoundedRect(x - 16, y + size + 2, 32, 20, 6);
      }
    }

    // Mass labels as text (create/update) - BIGGER
    if (!this._massLabels) {
      this._massLabels = new Map();
    }
    
    for (const obj of state.objects) {
      const x = this.scaleX(obj.x);
      const y = this.scaleY(obj.y);
      const size = obj.size * 0.8;
      
      let label = this._massLabels.get(obj.id);
      if (!label) {
        label = this.add.text(x, y + size + 12, '', {
          fontSize: '16px',
          color: '#ffffff',
          fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(101);
        this._massLabels.set(obj.id, label);
      }
      
      if (state.showHints) {
        label.setPosition(x, y + size + 12);
        // Just the number, no 'kg' - negative shows as -3
        label.setText(`${obj.mass}`);
        label.setVisible(true);
      } else {
        label.setVisible(false);
      }
    }

    // Clean up old mass labels
    for (const [id, label] of this._massLabels) {
      if (!currentIds.has(id)) {
        label.destroy();
        this._massLabels.delete(id);
      }
    }
  }

  drawPlayerCursors(state) {
    const myId = this.game.net?.playerId;

    for (const [pidStr, player] of Object.entries(state.players)) {
      const pid = Number(pidStr);
      if (!player.connected || pid === myId) continue;

      const x = this.scaleX(player.cursorX);
      const y = this.scaleY(player.cursorY);

      // Other player cursor (hand icon)
      this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(player.color).color, 0.8);
      
      // Simple pointer shape
      this.graphics.beginPath();
      this.graphics.moveTo(x, y);
      this.graphics.lineTo(x + 6, y + 18);
      this.graphics.lineTo(x + 2, y + 14);
      this.graphics.lineTo(x - 4, y + 20);
      this.graphics.closePath();
      this.graphics.fillPath();

      // Player number
      this.graphics.fillStyle(0xffffff);
      this.graphics.fillCircle(x + 12, y + 12, 8);
      // Would add text for player number
    }
  }

  drawPhysicsOverlay(state) {
    if (!state.showHints) {
      this.physicsInfo.setVisible(false);
      return;
    }

    this.physicsInfo.setVisible(true);
    const cargoMassDisplay = state.cargoMass < 0 ? 
      `${state.cargoMass.toFixed(0)} (lift!)` : 
      state.cargoMass.toFixed(0);
    
    const tiltPercent = Math.round(Math.abs(state.boat.tilt) / (state.boat.criticalTilt || 20) * 100);
    const overloadWarning = state.cargoMass > 55 ? ' ⚠️ OVERLOAD!' : '';
    const tiltWarning = tiltPercent > 70 ? ' ⚠️ TILTING!' : '';
    
    this.physicsInfo.setText(
      `Load: ${cargoMassDisplay} / 55 max | Tilt: ${tiltPercent}%${overloadWarning}${tiltWarning}`
    );
    this.physicsInfo.setFontSize('14px');
  }

  updateUI(state) {
    // Update message
    if (state.message) {
      this.messageText.setText(state.message);
      this.messageText.setVisible(true);
    } else {
      this.messageText.setVisible(false);
    }

    // Update door appearance
    if (state.doorOpen) {
      this.doorBtn.setText('🚪✨');
      this.doorBtn.setColor('#27ae60');
    } else {
      this.doorBtn.setText('🚪');
      this.doorBtn.setColor('#888888');
    }

    // Update button states
    this.hintsBtn.setBackgroundColor(state.showHints ? '#3498db' : '#95a5a6');
    this.pauseBtn.setBackgroundColor(state.gamePaused ? '#e74c3c' : '#f39c12');
    
    // Disable GO button while sailing or paused
    if (state.boat.sailing || state.gamePaused || state.boat.capsized) {
      this.goBtn.setAlpha(0.5);
    } else {
      this.goBtn.setAlpha(1);
    }
  }

  // ----- Coordinate Scaling -----

  scaleX(x) {
    const state = this.game.net.latestState;
    if (!state) return x;
    return (x / state.sceneWidth) * this.scale.width;
  }

  scaleY(y) {
    const state = this.game.net.latestState;
    if (!state) return y;
    return (y / state.sceneHeight) * (this.scale.height - 60); // Leave room for toolbar
  }

  unscaleX(screenX) {
    const state = this.game.net.latestState;
    if (!state) return screenX;
    return (screenX / this.scale.width) * state.sceneWidth;
  }

  unscaleY(screenY) {
    const state = this.game.net.latestState;
    if (!state) return screenY;
    return (screenY / (this.scale.height - 60)) * state.sceneHeight;
  }

  update(time, delta) {
    // Continuous rendering handled by state updates
  }
}
