import Phaser from 'phaser';
import SKINS from '../skins.json';
import { createTouchControls, getTouchControlsReserve, isTouchDevice } from '@games/touch-controls';

const CELL_SIZE = 25;
const GRID_W = 30;
const GRID_H = 22;
const OFFSET_X = (800 - GRID_W * CELL_SIZE) / 2;
const OFFSET_Y = (600 - GRID_H * CELL_SIZE) / 2;

const UI_BTN_BG = '#777777';
const UI_BTN_BG_HOVER = '#888888';
const UI_BTN_BG_SELECTED = '#000000';
const UI_BTN_TEXT = '#FFFFFF';

export default class PlayScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PlayScene' });
    }

    isLobbyReady(state) {
        const net = this.game.net;
        if (!state || !net || !net.playerId) return false;
        const me = state.players?.[net.playerId];
        // Require a chosen skin; speed always has a default.
        return Boolean(state.speed) && Boolean(me && me.skin);
    }

    create() {
        this.graphics = this.add.graphics();
        this.uiText = this.add.text(10, 10, '', { fontSize: '16px', color: '#000' });
        this.centerText = this.add.text(400, 300, '', { fontSize: '32px', color: '#000', backgroundColor: '#FFFFFFAA' }).setOrigin(0.5);
        this.centerText.setDepth(100);

        // Input
        this.setupInput();

        // Setup/Pause Container (used for initial lobby and individual pause)
        this.setupContainer = this.add.container(400, 300);
        this.createSetupUI();
        this.setupContainer.setVisible(false);

        // Touch controls (D-pad + pause) for tablets/phones
        this.touchControlsEnabled = isTouchDevice();
        if (this.touchControlsEnabled) {
            this.touchControls = createTouchControls(this, {
                onDir: (dir) => this.game.net.send('input', { dir }),
                onPause: () => {
                    const net = this.game.net;
                    if (!net.latestState) return;
                    if (net.latestState.paused && net.latestState.reasonPaused === 'start') return;
                    net.send('pause');
                },
            });
        }

        // Net listener
        this.onState = (e) => this.renderState(e.detail);
        this.game.net.addEventListener('state', this.onState);

        // Initial render if we already have state
        if (this.game.net.latestState) {
            this.renderState(this.game.net.latestState);
        }
    }

    setupInput() {
        // Force focus to ensure global keyboard events work
        window.focus();

        this.cursors = this.input.keyboard.createCursorKeys();

        // Use addKey for direct key reference (Standard Phaser)
        this.wasd = {
            up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
        };

        // One-shot actions (Space/P) are best as listeners
        this.input.keyboard.on('keydown-SPACE', () => {
            const net = this.game.net;
            if (!net.latestState) return;
            const myP = net.latestState.players[net.playerId];

            if (myP && myP.state === "DEAD") {
                net.send('request_respawn');
            } else if (net.latestState.paused && net.latestState.reasonPaused === 'start') {
                // Lobby: only allow starting once required selections are made.
                if (this.isLobbyReady(net.latestState)) {
                    net.send('resume');
                }
            } else if (net.latestState.paused) {
                // Other system pause -> Resume
                net.send('resume');
            } else {
                // Individual toggle
                net.send('pause');
            }
        });

        this.input.keyboard.on('keydown-P', () => {
            this.game.net.send('pause');
        });

        // Global Click (Backup Action)
        // IMPORTANT: ignore clicks on UI elements (buttons/menus), and don't allow
        // lobby clicks to accidentally start the game.
        this.input.on('pointerdown', (pointer, currentlyOver) => {
            if (currentlyOver && currentlyOver.length > 0) return;
            const net = this.game.net;
            if (!net.latestState) return;
            const myP = net.latestState.players[net.playerId];

            if (myP && myP.state === "DEAD") {
                net.send('request_respawn');
            } else if (net.latestState.paused && net.latestState.reasonPaused === 'start') {
                // Lobby start is handled by the Start button.
                return;
            } else if (net.latestState.paused) {
                net.send('resume');
            } else if (myP && myP.paused) {
                net.send('resume');
            }
        });
    }

    update(time, delta) {
        // Standard Game Loop
        const net = this.game.net;
        if (!net.latestState) return;

        // Poll for held keys
        let dir = null;
        const cursors = this.cursors;
        const keys = this.wasd;

        // Check Input (WASD or Arrows)
        if (cursors.left.isDown || keys.left.isDown) dir = 'LEFT';
        else if (cursors.right.isDown || keys.right.isDown) dir = 'RIGHT';
        else if (cursors.up.isDown || keys.up.isDown) dir = 'UP';
        else if (cursors.down.isDown || keys.down.isDown) dir = 'DOWN';

        if (dir) {
            net.send('input', { dir });
        }
    }

    renderState(state) {
        this.graphics.clear();

        const layout = this.computeLayout();
        const gridPxW = GRID_W * layout.cellSize;
        const gridPxH = GRID_H * layout.cellSize;

        // 1. Draw Grid Background
        this.graphics.fillStyle(0xDDDDDD);
        this.graphics.fillRect(layout.offsetX, layout.offsetY, gridPxW, gridPxH);

        // Walls border indicator (only when walls are enabled)
        if ((state.wallsMode || 'walls') === 'walls') {
            // Draw the stroke OUTSIDE the playable grid so the snake can hug the
            // true edge without visually intersecting the wall.
            const wallW = Math.max(4, Math.floor(layout.cellSize / 2));
            const inset = wallW / 2;
            this.graphics.lineStyle(wallW, 0x777777, 1);
            this.graphics.strokeRect(
                layout.offsetX - inset,
                layout.offsetY - inset,
                gridPxW + wallW,
                gridPxH + wallW
            );
        }

        // 2. Draw Apple
        if (state.apple) {
            this.graphics.fillStyle(0xFF0000);
            this.graphics.fillRect(
                layout.offsetX + state.apple.x * layout.cellSize + 2,
                layout.offsetY + state.apple.y * layout.cellSize + 2,
                layout.cellSize - 4,
                layout.cellSize - 4
            );
        }

        // 3. Draw Snakes
        const myId = this.game.net.playerId;
        const myP = state.players[myId];

        // Draw local lives (Only for self)
        if (myP) {
            this.drawLives(myP.lives, true);
        }

        [1, 2, 3, 4].forEach(pid => {
            const p = state.players[pid];
            if (!p.connected || p.state !== "ALIVE") return;

            const isMe = (p.id === myId);
            this.drawSnake(p, isMe);
        });

        // 4. UI Text (room only)
        this.uiText.setText(`Room: ${this.game.net.roomId}`);

        // 5. Overlays
        // Lobby
        if (state.paused && state.reasonPaused === 'start') {
            this.setupContainer.setVisible(true);
            this.updateSetupUI(state, 'start');
            this.centerText.setText("");
            return;
        } else {
            this.setupContainer.setVisible(false);
        }

        let centerMsg = "";

        // Show setup UI if player is paused (individual pause)
        if (myP && myP.paused && !state.paused) {
            this.setupContainer.setVisible(true);
            this.updateSetupUI(state, 'pause');
            centerMsg = "";
        }

        // Override for my status (Dead takes precedence)
        if (myP && myP.state === "DEAD") {
            centerMsg = "CRASHED!\nClick to Restart";
            this.setupContainer.setVisible(false); // Hide menu when dead
        } else if (myP && myP.state === "COUNTDOWN") {
            centerMsg = `Get Ready...\n${myP.countdown}`;
            this.setupContainer.setVisible(false); // Hide menu during countdown
        }

        this.centerText.setText(centerMsg);
    }

    drawSnake(p, isMe) {
        const skinKey = p.skin || 'viper';
        const skinDef = SKINS[skinKey];

        // Visual distinction for opponents
        const alpha = isMe ? 1.0 : 0.6;
        const strokeColor = isMe ? 0x000000 : 0x888888;
        const strokeAlpha = isMe ? 0.2 : 0.6;
        const strokeWidth = isMe ? 1 : 2;

        const layout = this.computeLayout();
        p.body.forEach((seg, i) => {
            const x = layout.offsetX + seg.x * layout.cellSize;
            const y = layout.offsetY + seg.y * layout.cellSize;

            let color = 0x00FF00;
            if (i === 0) {
                // Head
                color = parseInt(skinDef.head.replace('0x', ''), 16);
            } else {
                // Body Pattern
                const patIndex = (i - 1) % skinDef.pattern.length;
                color = parseInt(skinDef.pattern[patIndex].replace('#', ''), 16);
            }

            this.graphics.fillStyle(color, alpha);
            this.graphics.fillRect(x, y, layout.cellSize, layout.cellSize);

            // Outline for visibility
            this.graphics.lineStyle(strokeWidth, strokeColor, strokeAlpha);
            this.graphics.strokeRect(x, y, layout.cellSize, layout.cellSize);
        });
    }

    drawLives(count, isRight) {
        const y = 20;
        const startX = isRight ? 780 : 20;
        const step = isRight ? -30 : 30;
        const radius = 10;

        this.graphics.fillStyle(0xFF0000);
        this.graphics.lineStyle(2, 0xFFFFFF);

        for (let i = 0; i < count; i++) {
            const x = startX + (i * step);
            this.graphics.fillCircle(x, y, radius);
            this.graphics.strokeCircle(x, y, radius);
        }
    }

    drawSkinSample(g, x, y, skinKey) {
        const skin = SKINS[skinKey];
        const size = 20;
        // Draw head
        g.fillStyle(skin.head);
        g.fillRect(x, y, size, size);
        g.lineStyle(1, 0x000000);
        g.strokeRect(x, y, size, size);

        // Draw 7 body segments
        for (let i = 0; i < 7; i++) {
            const patIndex = i % skin.pattern.length;
            const color = parseInt(skin.pattern[patIndex].replace('#', '0x'), 16);
            g.fillStyle(color);
            g.fillRect(x + (i + 1) * size, y, size, size);
            g.strokeRect(x + (i + 1) * size, y, size, size);
        }
    }

    createSetupUI() {
        const bg = this.add.rectangle(0, 0, 750, 520, 0xFFFFFF, 0.95);
        this.setupContainer.add(bg);

        this.setupTitle = this.add.text(0, -235, 'GAME SETUP', { fontSize: '32px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5);
        this.setupContainer.add(this.setupTitle);

        // Speed
        this.setupContainer.add(this.add.text(-300, -190, 'Speed:', { fontSize: '18px', color: '#000' }).setOrigin(0, 0.5));
        this.speedButtons = {
            slow: this.addSetupButton(-150, -190, 'Slow', () => this.game.net.send('select_speed', { speed: 'slow' })),
            medium: this.addSetupButton(0, -190, 'Medium', () => this.game.net.send('select_speed', { speed: 'medium' })),
            fast: this.addSetupButton(150, -190, 'Fast', () => this.game.net.send('select_speed', { speed: 'fast' }))
        };

        // Walls mode
        this.setupContainer.add(this.add.text(-300, -140, 'Walls:', { fontSize: '18px', color: '#000' }).setOrigin(0, 0.5));
        this.wallsButtons = {
            walls: this.addSetupButton(-80, -140, 'Walls', () => this.game.net.send('select_walls_mode', { mode: 'walls' })),
            no_walls: this.addSetupButton(120, -140, 'No Walls', () => this.game.net.send('select_walls_mode', { mode: 'no_walls' }))
        };

        // Skins
        this.setupContainer.add(this.add.text(-300, -90, 'Snake:', { fontSize: '18px', color: '#000' }).setOrigin(0, 0.5));
        let y = -50;
        const skinKeys = Object.keys(SKINS);
        this.skinButtons = {};
        skinKeys.forEach((key) => {
            const g = this.add.graphics();
            this.setupContainer.add(g);
            this.drawSkinSample(g, -300, y - 10, key);
            this.skinButtons[key] = this.addSetupButton(-50, y, SKINS[key].name, () => this.game.net.send('select_skin', { skin: key }));
            y += 40;
        });

        this.setupHelp = this.add.text(0, 175, '', { fontSize: '20px', color: '#000' }).setOrigin(0.5);
        this.setupContainer.add(this.setupHelp);

        this.startButton = this.addSetupButton(-90, 220, 'Start', () => {
            const net = this.game.net;
            if (!net.latestState) return;
            if (this.isLobbyReady(net.latestState)) net.send('resume');
        });

        this.continueButton = this.addSetupButton(90, 220, 'Continue', () => {
            this.game.net.send('resume');
        });
    }

    addSetupButton(x, y, label, cb) {
        const btn = this.add.text(x, y, label, {
            fontSize: '18px', backgroundColor: UI_BTN_BG, color: UI_BTN_TEXT, padding: { x: 10, y: 5 }
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
        // mode: 'start' | 'pause'
        const net = this.game.net;
        const myP = net && net.playerId ? state.players?.[net.playerId] : null;
        const mySkin = myP?.skin || null;

        if (this.setupTitle) this.setupTitle.setText(mode === 'start' ? 'GAME SETUP' : 'PAUSED');
        if (this.startButton) this.startButton.setVisible(mode === 'start');
        if (this.continueButton) this.continueButton.setVisible(mode !== 'start');

        // Speed selection highlight
        if (this.speedButtons) {
            for (const [speedKey, btn] of Object.entries(this.speedButtons)) {
                const selected = (state.speed === speedKey);
                btn._selected = selected;
                btn.setBackgroundColor(selected ? UI_BTN_BG_SELECTED : UI_BTN_BG);
                btn.setColor(UI_BTN_TEXT);
            }
        }

        // Walls selection highlight
        if (this.wallsButtons) {
            for (const [key, btn] of Object.entries(this.wallsButtons)) {
                const selected = (state.wallsMode === key);
                btn._selected = selected;
                btn.setBackgroundColor(selected ? UI_BTN_BG_SELECTED : UI_BTN_BG);
                btn.setColor(UI_BTN_TEXT);
            }
        }

        // Skin selection highlight
        if (this.skinButtons) {
            for (const [skinKey, btn] of Object.entries(this.skinButtons)) {
                const selected = (mySkin && skinKey === mySkin);
                btn._selected = selected;
                btn.setBackgroundColor(selected ? UI_BTN_BG_SELECTED : UI_BTN_BG);
                btn.setColor(UI_BTN_TEXT);
            }
        }

        const ready = this.isLobbyReady(state);
        if (this.startButton && mode === 'start') {
            this.startButton.setAlpha(ready ? 1 : 0.5);
            if (ready) this.startButton.setInteractive({ useHandCursor: true });
            else this.startButton.disableInteractive();
        }

        if (this.setupHelp) {
            if (mode === 'start') this.setupHelp.setText(ready ? 'Ready' : 'Select your snake');
            else this.setupHelp.setText('');
        }
    }

    computeLayout() {
        const W = this.scale?.width || 800;
        const H = this.scale?.height || 600;

        // Compute the biggest possible playfield for the full screen, then only
        // nudge it away from the bottom-right touch control cluster if needed.
        const reserve = getTouchControlsReserve({ enabled: this.touchControlsEnabled });
        const availableW = Math.max(200, W);
        const availableH = Math.max(200, H);

        // Reserve a small margin so the (outside) wall stroke isn't clipped.
        // Keep it consistent regardless of whether walls are enabled.
        const wallInsetForCell = (cellSize) => Math.max(4, Math.floor(cellSize / 2)) / 2;

        let cellSize = Math.max(12, Math.floor(Math.min(availableW / GRID_W, availableH / GRID_H)));
        for (let i = 0; i < 2; i++) {
            const inset = wallInsetForCell(cellSize);
            const innerW = Math.max(1, availableW - (inset * 2));
            const innerH = Math.max(1, availableH - (inset * 2));
            cellSize = Math.max(12, Math.floor(Math.min(innerW / GRID_W, innerH / GRID_H)));
        }

        const gridPxW = GRID_W * cellSize;
        const gridPxH = GRID_H * cellSize;
        const inset = wallInsetForCell(cellSize);

        const playAreaW = gridPxW + (inset * 2);
        const playAreaH = gridPxH + (inset * 2);

        let offsetX = Math.floor((availableW - playAreaW) / 2) + inset;
        let offsetY = Math.floor((availableH - playAreaH) / 2) + inset;

        // If the centered play area would overlap the reserved bottom-right corner,
        // shift either left or up by the minimal amount.
        if (this.touchControlsEnabled && reserve.w > 0 && reserve.h > 0) {
            const playX0 = offsetX - inset;
            const playY0 = offsetY - inset;
            const playX1 = playX0 + playAreaW;
            const playY1 = playY0 + playAreaH;

            const cornerX0 = W - reserve.w;
            const cornerY0 = H - reserve.h;

            const overlapsCorner = (playX1 > cornerX0) && (playY1 > cornerY0);
            if (overlapsCorner) {
                const shiftLeft = playX1 - cornerX0;
                const shiftUp = playY1 - cornerY0;
                if (shiftLeft < shiftUp) {
                    offsetX -= shiftLeft;
                } else {
                    offsetY -= shiftUp;
                }

                // Clamp so we don't shift off-screen.
                offsetX = Math.max(inset, Math.min(W - inset - gridPxW, offsetX));
                offsetY = Math.max(inset, Math.min(H - inset - gridPxH, offsetY));
            }
        }

        return { cellSize, offsetX, offsetY };
    }

    shutdown() {
        this.game.net.removeEventListener('state', this.onState);
    }
}
