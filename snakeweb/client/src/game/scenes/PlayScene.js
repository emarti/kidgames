import Phaser from 'phaser';

const CELL_SIZE = 25;
const GRID_W = 30;
const GRID_H = 22;
const OFFSET_X = (800 - GRID_W * CELL_SIZE) / 2;
const OFFSET_Y = (600 - GRID_H * CELL_SIZE) / 2;

const SKINS = {
    coral: { name: 'Coral Snake', head: 0xFFFFFF, pattern: ['#000000', '#000000', '#000000', '#FFFF00', '#FF0000', '#FF0000', '#FF0000', '#FFFF00'] },
    viper: { name: 'Green Viper', head: 0x90EE90, pattern: ['#006400'] }, // Solid dark green
    corn: { name: 'Corn Snake', head: 0xFFA500, pattern: ['#FFA500', '#8B4513', '#FFFDD0'] }, // Orange, SaddleBrown, Cream
    brillan: { name: 'Brillan Snake', head: 0x808080, pattern: ['#FFFFFF', '#FFFFFF', '#0000FF', '#0000FF'] },
    usa: { name: 'USA Snake', head: 0xFF7F7F, pattern: ['#FF0000', '#FF0000', '#FFFFFF', '#FFFFFF', '#0000FF', '#0000FF'] },
    // False coral fallback/extra? The prompt listed 6.
    false_coral: { name: 'False Coral', head: 0xFFFFFF, pattern: ['#FF0000', '#FF0000', '#FF0000', '#000000', '#FFFF00', '#000000'] }
};

export default class PlayScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PlayScene' });
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

        // Net listener
        this.onState = (e) => this.renderState(e.detail);
        this.game.net.addEventListener('state', this.onState);

        // Initial render if we already have state
        if (this.game.net.latestState) {
            this.renderState(this.game.net.latestState);
        }

        // Handle input loop
        this.inputTimer = this.time.addEvent({ delay: 50, callback: this.checkInput, callbackScope: this, loop: true });
    }

    setupInput() {
        this.cursors = this.input.keyboard.createCursorKeys();
        this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);

        // Explicit Spacebar handler
        this.input.keyboard.on('keydown-SPACE', () => {
            const net = this.game.net;
            if (!net.latestState) return;
            const myP = net.latestState.players[net.playerId];

            if (myP && myP.state === "DEAD") {
                net.send('request_respawn');
            } else if (net.latestState.paused) {
                net.send('resume');
            } else {
                net.send('pause');
            }
        });

        // P handling
        this.input.keyboard.on('keydown-P', () => {
            this.game.net.send('pause');
        });

        // Global Click
        this.input.on('pointerdown', () => {
            const net = this.game.net;
            if (!net.latestState) return;
            const myP = net.latestState.players[net.playerId];

            if (myP && myP.state === "DEAD") {
                net.send('request_respawn');
            } else if (net.latestState.paused) {
                net.send('resume');
            }
        });
    }

    checkInput() {
        const net = this.game.net;
        if (!net.latestState) return;

        // Pause toggle


        // Direction
        let dir = null;
        const cursors = this.cursors;
        const keys = this.input.keyboard.keys;

        if (cursors.left.isDown || keys[65].isDown) dir = 'LEFT';
        else if (cursors.right.isDown || keys[68].isDown) dir = 'RIGHT';
        else if (cursors.up.isDown || keys[87].isDown) dir = 'UP';
        else if (cursors.down.isDown || keys[83].isDown) dir = 'DOWN';

        if (dir) {
            net.send('input', { dir });
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
        [1, 2].forEach(pid => {
            const p = state.players[pid];
            // Only draw ALIVE snakes
            if (p.state !== "ALIVE") return;

            this.drawSnake(p);

            // Draw Lives (Visual)
            const isMe = (p.id === this.game.net.playerId);
            // If Me -> Top Right (isRight=true). If Other -> Top Left (isRight=false).
            // Logic: 
            // My ID = 1. P1(=1) is Me (Right). P2(=2) is Other (Left).
            // My ID = 2. P2(=2) is Me (Right). P1(=1) is Other (Left).
            // Wait, "Top Right (for me)".
            // So if `p.id === myId`, draw Right. Else Left.
            this.drawLives(p.lives, isMe);
        });

        // 4. UI Text
        const p1 = state.players[1];
        const p2 = state.players[2];
        let info = `Room: ${this.game.net.roomId}\n`;
        // info += `P1 Lives: ${p1.lives} ${p1.name} ${p1.connected ? '' : '(DISC)'}\n`; // Removed lives text
        info += `P1: ${p1.name} ${p1.connected ? '' : '(DISC)'}\n`;

        if (p2.connected) {
            info += `P2: ${p2.name}\n`;
        } else {
            info += `P2: Waiting...\n`;
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

        // Dead/Countdown Overlay for self or generic
        const myId = this.game.net.playerId;
        const myP = state.players[myId];

        let centerMsg = "";

        if (state.paused) {
            centerMsg = "PAUSED";
            if (state.reasonPaused === 'player_disconnect') centerMsg = "Player Disconnected";
        }

        // Override for my status
        if (myP && myP.state === "DEAD") {
            centerMsg = "CRASHED!\nPress SPACE to Restart";
        } else if (myP && myP.state === "COUNTDOWN") {
            centerMsg = `Get Ready...\n${myP.countdown}`;
        }

        this.centerText.setText(centerMsg);
    }

    drawSnake(p) {
        const skinDef = SKINS[p.skin] || SKINS['viper']; // Default if null

        p.body.forEach((seg, i) => {
            const x = OFFSET_X + seg.x * CELL_SIZE;
            const y = OFFSET_Y + seg.y * CELL_SIZE;

            let color = 0x00FF00;
            if (i === 0) {
                // Head
                color = skinDef.head;
            } else {
                // Body Pattern
                const patIndex = (i - 1) % skinDef.pattern.length;
                color = parseInt(skinDef.pattern[patIndex].replace('#', '0x'), 16);
            }

            this.graphics.fillStyle(color);
            this.graphics.fillRect(x, y, CELL_SIZE, CELL_SIZE);

            // Outline for visibility
            this.graphics.lineStyle(1, 0x000000, 0.2);
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
        this.addLobbyButton(-150, -180, 'Slow', () => this.game.net.send('select_speed', { speed: 'slow' }));
        this.addLobbyButton(0, -180, 'Medium', () => this.game.net.send('select_speed', { speed: 'medium' }));
        this.addLobbyButton(150, -180, 'Fast', () => this.game.net.send('select_speed', { speed: 'fast' }));

        // Skin Section
        // List skins in rows: [Sample Blocks] [Name Button]
        let y = -120;
        const skinKeys = Object.keys(SKINS);

        skinKeys.forEach((key, idx) => {
            // Left side: Pattern sample
            // Draw this later in update or static? Static graphics object added to container
            const g = this.add.graphics();
            this.lobbyContainer.add(g);
            this.drawSkinSample(g, -300, y - 10, key);

            // Checkbox/Button
            this.addLobbyButton(-50, y, SKINS[key].name, () => this.game.net.send('select_skin', { skin: key }));

            y += 40;
        });

        const startHelp = this.add.text(0, 200, 'Press SPACE to Start', { fontSize: '24px', color: '#000' }).setOrigin(0.5);
        this.lobbyContainer.add(startHelp);
    }

    addLobbyButton(x, y, label, cb) {
        const btn = this.add.text(x, y, label, {
            fontSize: '18px', backgroundColor: '#333', color: '#FFF', padding: { x: 10, y: 5 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        btn.on('pointerdown', cb);
        this.lobbyContainer.add(btn);
        return btn;
    }

    updateLobbyUI(state) {
        // Highlight selected options
        // This requires keeping references to buttons or redrawing. 
        // For MVP, just redrawing the "Status" text is easier, but highlighting is better.
        // Let's just add status text to the lobby container describing current choices.

        // Actually, simple Hack: clear old status text and re-add?
        // Or just one text object.
        if (!this.lobbyStatusText) {
            this.lobbyStatusText = this.add.text(0, 100, '', { fontSize: '16px', color: '#333', align: 'center' }).setOrigin(0.5);
            this.lobbyContainer.add(this.lobbyStatusText);
        }

        let msg = `Speed: ${state.speed || 'Not Selected'}\n`;
        msg += `P1 Skin: ${state.players[1].skin || 'None'}\n`;
        msg += `P2 Skin: ${state.players[2].skin || 'None'}`;
        this.lobbyStatusText.setText(msg);
    }

    shutdown() {
        this.game.net.removeEventListener('state', this.onState);
    }
}
