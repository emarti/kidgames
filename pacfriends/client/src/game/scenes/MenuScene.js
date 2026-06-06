import Phaser from 'phaser';

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        const cx = W / 2;

        // Background
        this.add.rectangle(cx, H / 2, W, H, 0x000011);

        // Title
        this.add.text(cx, 60, '👾 PACFRIENDS', {
            fontSize: '44px',
            color: '#FFFF00',
            fontStyle: 'bold',
            fontFamily: 'monospace',
        }).setOrigin(0.5);

        this.add.text(cx, 110, 'Collaborative Pac-Man for up to 4 players', {
            fontSize: '18px',
            color: '#AAAAAA',
            fontFamily: 'monospace',
        }).setOrigin(0.5);

        this.statusText = this.add.text(cx, H - 40, 'Connecting...', {
            fontSize: '18px',
            color: '#888888',
            fontFamily: 'monospace',
        }).setOrigin(0.5);

        // --- Left panel: Create / Join ---
        const panelX = Math.max(200, W * 0.28);

        this.createBtn = this._makeButton(panelX, 200, 'Create New Room', () => {
            this.game.net.send('create_room');
            this.statusText.setText('Creating room...');
        });

        this.add.text(panelX, 280, 'Join Room Code:', {
            fontSize: '22px', color: '#FFFF00', fontFamily: 'monospace',
        }).setOrigin(0.5);

        this.inputCode = '';
        this.codeText = this.add.text(panelX, 320, '____', {
            fontSize: '36px',
            color: '#FFFFFF',
            backgroundColor: '#222244',
            fontFamily: 'monospace',
            padding: { x: 14, y: 6 },
        }).setOrigin(0.5);

        this._makeButton(panelX, 390, 'Join', () => {
            if (this.inputCode.length === 4) this._joinRoom(this.inputCode);
        });

        // Keyboard input
        this.input.keyboard.on('keydown', (e) => {
            if (e.keyCode === 8 && this.inputCode.length > 0) {
                this.inputCode = this.inputCode.slice(0, -1);
            } else if (e.key.length === 1 && this.inputCode.length < 4 && /[0-9]/.test(e.key)) {
                this.inputCode += e.key;
            }
            this._updateCodeDisplay();
        });

        // --- Right panel: Room list ---
        const listX = Math.min(W - 200, W * 0.72);
        this.add.text(listX, 180, 'Active Rooms', {
            fontSize: '22px', color: '#FFFF00', fontFamily: 'monospace',
        }).setOrigin(0.5);
        this.roomListContainer = this.add.container(listX, 220);

        this.time.addEvent({
            delay: 2000,
            callback: this._refreshRooms,
            callbackScope: this,
            loop: true,
        });

        this._setupNetworking();
    }

    _updateCodeDisplay() {
        const padded = this.inputCode + '____'.slice(this.inputCode.length);
        this.codeText.setText(padded);
    }

    _joinRoom(code) {
        this.game.net.send('join_room', { roomId: code });
        this.statusText.setText(`Joining ${code}...`);
    }

    _refreshRooms() {
        if (this.game.net.connected) this.game.net.send('get_rooms');
    }

    _setupNetworking() {
        const net = this.game.net;

        const onConnected = () => {
            this.statusText.setText('Connected — create or join a room');
            this.createBtn.setInteractive();
            this._refreshRooms();
        };

        if (net.connected) {
            onConnected();
        } else {
            this.createBtn.disableInteractive();
            net.addEventListener('connected', onConnected);
        }

        net.addEventListener('room_joined', () => {
            this.scene.start('PlayScene');
        });

        net.addEventListener('room_list', (e) => {
            this._updateRoomList(e.detail);
        });

        net.addEventListener('net_error', (e) => {
            this.statusText.setText(`Error: ${e.detail}`);
        });
    }

    _updateRoomList(rooms) {
        this.roomListContainer.removeAll(true);
        if (!rooms || rooms.length === 0) {
            this.roomListContainer.add(
                this.add.text(0, 0, 'No active rooms', {
                    fontSize: '18px', color: '#666688', fontFamily: 'monospace',
                }).setOrigin(0.5)
            );
            return;
        }
        rooms.forEach((r, i) => {
            const y = i * 44;
            const txt = this.add.text(0, y, `Room ${r.id}  (${r.players}/4 players)`, {
                fontSize: '20px',
                color: '#FFFFFF',
                backgroundColor: '#222244',
                fontFamily: 'monospace',
                padding: { x: 10, y: 4 },
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            txt.on('pointerdown', () => {
                this.inputCode = r.id;
                this._updateCodeDisplay();
            });
            txt.on('pointerover', () => txt.setBackgroundColor('#333366'));
            txt.on('pointerout', () => txt.setBackgroundColor('#222244'));
            this.roomListContainer.add(txt);
        });
    }

    _makeButton(x, y, label, cb) {
        const txt = this.add.text(x, y, label, {
            fontSize: '24px',
            color: '#000000',
            backgroundColor: '#FFFF00',
            fontFamily: 'monospace',
            padding: { x: 14, y: 7 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        txt.on('pointerdown', cb);
        txt.on('pointerover', () => txt.setStyle({ backgroundColor: '#FFEE00' }));
        txt.on('pointerout', () => txt.setStyle({ backgroundColor: '#FFFF00' }));
        return txt;
    }
}
