import Phaser from 'phaser';
import SKINS from '../skins.json';

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

        // Lobby UIContainer
        this.lobbyContainer = this.add.container(400, 300);
        this.createLobbyUI();
        this.lobbyContainer.setVisible(false);

        // Skin Menu Container
        this.skinMenuContainer = this.add.container(400, 300);
        this.createSkinMenu();
        this.skinMenuContainer.setVisible(false);

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

    createSkinMenu() {
        const bg = this.add.rectangle(0, 0, 600, 400, 0xFFFFFF, 0.95);
        this.skinMenuContainer.add(bg);

        const title = this.add.text(0, -180, 'SELECT YOUR SNAKE', { fontSize: '28px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5);
        this.skinMenuContainer.add(title);

        let y = -120;
        const skinKeys = Object.keys(SKINS);

        this.skinMenuButtons = {};

        skinKeys.forEach((key) => {
            // Draw skin sample
            const g = this.add.graphics();
            this.skinMenuContainer.add(g);
            this.drawSkinSample(g, -250, y - 10, key);

            // Clickable button
            const btn = this.add.text(0, y, SKINS[key].name, {
                fontSize: '20px', backgroundColor: UI_BTN_BG, color: UI_BTN_TEXT, padding: { x: 15, y: 8 }
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });

            btn._selected = false;
            btn.on('pointerover', () => {
                if (!btn._selected) btn.setBackgroundColor(UI_BTN_BG_HOVER);
            });
            btn.on('pointerout', () => {
                if (!btn._selected) btn.setBackgroundColor(UI_BTN_BG);
            });

            btn.on('pointerdown', () => {
                this.game.net.send('select_skin', { skin: key });
            });

            this.skinMenuContainer.add(btn);
            this.skinMenuButtons[key] = btn;
            y += 50;
        });

        // Continue button (resume from individual pause)
        const continueBtn = this.add.text(0, 170, 'Continue', {
            fontSize: '22px', backgroundColor: UI_BTN_BG, color: UI_BTN_TEXT, padding: { x: 18, y: 10 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        continueBtn._selected = false;
        continueBtn.on('pointerover', () => continueBtn.setBackgroundColor(UI_BTN_BG_HOVER));
        continueBtn.on('pointerout', () => continueBtn.setBackgroundColor(UI_BTN_BG));
        continueBtn.on('pointerdown', () => {
            this.game.net.send('resume');
        });

        this.skinMenuContainer.add(continueBtn);
    }

    updateSkinMenuUI(state) {
        const net = this.game.net;
        if (!state || !net || !net.playerId) return;
        const myP = state.players?.[net.playerId];
        const selectedSkin = myP?.skin || null;

        if (!this.skinMenuButtons) return;
        for (const [skinKey, btn] of Object.entries(this.skinMenuButtons)) {
            const selected = (selectedSkin && skinKey === selectedSkin);
            btn._selected = selected;
            btn.setBackgroundColor(selected ? UI_BTN_BG_SELECTED : UI_BTN_BG);
            btn.setColor(UI_BTN_TEXT);
        }
    }

    renderState(state) {
        this.graphics.clear();

        // 1. Draw Grid Background
        this.graphics.fillStyle(0xDDDDDD);
        this.graphics.fillRect(OFFSET_X, OFFSET_Y, GRID_W * CELL_SIZE, GRID_H * CELL_SIZE);

        // 2. Draw Apple
        if (state.apple) {
            this.graphics.fillStyle(0xFF0000);
            this.graphics.fillRect(
                OFFSET_X + state.apple.x * CELL_SIZE + 2,
                OFFSET_Y + state.apple.y * CELL_SIZE + 2,
                CELL_SIZE - 4,
                CELL_SIZE - 4
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

        // 4. UI Text
        let info = `Room: ${this.game.net.roomId}\n`;
        const connectedPlayers = [1, 2, 3, 4].map(pid => state.players[pid]).filter(p => p.connected);

        connectedPlayers.forEach(p => {
            info += `P${p.id}: ${p.name || 'Player'} ${p.paused ? '(PAUSED)' : ''}\n`;
        });

        if (connectedPlayers.length < 4) {
            info += `${4 - connectedPlayers.length} slots free\n`;
        }

        if (state.speed) info += `Speed: ${state.speed}`;
        this.uiText.setText(info);

        // 5. Overlays
        // Lobby
        if (state.paused && state.reasonPaused === 'start') {
            this.lobbyContainer.setVisible(true);
            this.updateLobbyUI(state);
            this.centerText.setText("");
            return;
        } else {
            this.lobbyContainer.setVisible(false);
        }

        let centerMsg = "";

        // Show skin menu if player is paused (individual pause)
        if (myP && myP.paused && !state.paused) {
            this.skinMenuContainer.setVisible(true);
            this.updateSkinMenuUI(state);
            centerMsg = ""; // No center text when menu is showing
        } else {
            this.skinMenuContainer.setVisible(false);

            // System Level Pause (Lobby, Disconnect)
            if (state.paused) {
                if (state.reasonPaused === 'player_disconnect') {
                    centerMsg = "Player Disconnected";
                } else {
                    centerMsg = "PAUSED";
                }
            }
        }

        // Status Text Updates for Other Player Pause
        const othersPaused = [1, 2, 3, 4].filter(pid => pid !== myId && state.players[pid].connected && state.players[pid].paused);
        if (othersPaused.length > 0) {
            const names = othersPaused.map(pid => state.players[pid].name || `P${pid}`).join(", ");
            info += `\nPAUSED: ${names}`;
            this.uiText.setText(info);
        }

        // Override for my status (Dead takes precedence)
        if (myP && myP.state === "DEAD") {
            centerMsg = "CRASHED!\nClick to Restart";
            this.skinMenuContainer.setVisible(false); // Hide menu when dead
        } else if (myP && myP.state === "COUNTDOWN") {
            centerMsg = `Get Ready...\n${myP.countdown}`;
            this.skinMenuContainer.setVisible(false); // Hide menu during countdown
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

        p.body.forEach((seg, i) => {
            const x = OFFSET_X + seg.x * CELL_SIZE;
            const y = OFFSET_Y + seg.y * CELL_SIZE;

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
            this.graphics.fillRect(x, y, CELL_SIZE, CELL_SIZE);

            // Outline for visibility
            this.graphics.lineStyle(strokeWidth, strokeColor, strokeAlpha);
            this.graphics.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
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

    createLobbyUI() {
        const bg = this.add.rectangle(0, 0, 750, 500, 0xFFFFFF, 0.95);
        this.lobbyContainer.add(bg);

        const title = this.add.text(0, -220, 'GAME SETUP', { fontSize: '32px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5);
        this.lobbyContainer.add(title);

        // Speed Section
        this.lobbySpeedButtons = {
            slow: this.addLobbyButton(-150, -180, 'Slow', () => this.game.net.send('select_speed', { speed: 'slow' })),
            medium: this.addLobbyButton(0, -180, 'Medium', () => this.game.net.send('select_speed', { speed: 'medium' })),
            fast: this.addLobbyButton(150, -180, 'Fast', () => this.game.net.send('select_speed', { speed: 'fast' }))
        };

        // Skin Section
        // List skins in rows: [Sample Blocks] [Name Button]
        let y = -120;
        const skinKeys = Object.keys(SKINS);

        this.lobbySkinButtons = {};

        skinKeys.forEach((key, idx) => {
            // Left side: Pattern sample
            // Draw this later in update or static? Static graphics object added to container
            const g = this.add.graphics();
            this.lobbyContainer.add(g);
            this.drawSkinSample(g, -300, y - 10, key);

            // Checkbox/Button
            this.lobbySkinButtons[key] = this.addLobbyButton(-50, y, SKINS[key].name, () => this.game.net.send('select_skin', { skin: key }));

            y += 40;
        });

        this.startHelp = this.add.text(0, 160, 'Select a speed and a skin', { fontSize: '20px', color: '#000' }).setOrigin(0.5);
        this.lobbyContainer.add(this.startHelp);

        this.startButton = this.addLobbyButton(0, 210, 'Start', () => {
            const net = this.game.net;
            if (!net.latestState) return;
            if (this.isLobbyReady(net.latestState)) {
                net.send('resume');
            }
        });
    }

    addLobbyButton(x, y, label, cb) {
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
        this.lobbyContainer.add(btn);
        return btn;
    }

    updateLobbyUI(state) {
        // Selection highlighting
        if (this.lobbySpeedButtons) {
            for (const [speedKey, btn] of Object.entries(this.lobbySpeedButtons)) {
                const selected = (state.speed === speedKey);
                btn._selected = selected;
                btn.setBackgroundColor(selected ? UI_BTN_BG_SELECTED : UI_BTN_BG);
                btn.setColor(UI_BTN_TEXT);
            }
        }

        const net = this.game.net;
        const myP = net && net.playerId ? state.players?.[net.playerId] : null;
        const mySkin = myP?.skin || null;
        if (this.lobbySkinButtons) {
            for (const [skinKey, btn] of Object.entries(this.lobbySkinButtons)) {
                const selected = (mySkin && skinKey === mySkin);
                btn._selected = selected;
                btn.setBackgroundColor(selected ? UI_BTN_BG_SELECTED : UI_BTN_BG);
                btn.setColor(UI_BTN_TEXT);
            }
        }

        // Enable/disable Start button based on required selections.
        const ready = this.isLobbyReady(state);
        if (this.startButton) {
            this.startButton.setAlpha(ready ? 1 : 0.5);
            if (ready) this.startButton.setInteractive({ useHandCursor: true });
            else this.startButton.disableInteractive();
        }
        if (this.startHelp) {
            this.startHelp.setText(ready ? 'Ready' : 'Select a speed and a skin');
        }
    }

    shutdown() {
        this.game.net.removeEventListener('state', this.onState);
    }
}
