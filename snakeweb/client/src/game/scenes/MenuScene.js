import Phaser from 'phaser';

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create() {
        const cx = this.cameras.main.centerX;

        // Title
        this.add.text(cx, 80, 'SNAKE GAME', { fontSize: '48px', color: '#000000', fontStyle: 'bold' }).setOrigin(0.5);
        this.statusText = this.add.text(cx, 550, 'Connecting...', { fontSize: '20px', color: '#444' }).setOrigin(0.5);

        // --- Left Panel: Create / Join ---
        const panelX = 250;

        // Create Room
        this.createBtn = this.createButton(panelX, 200, 'Create New Room', () => {
            this.game.net.send('create_room');
            this.statusText.setText('Creating room...');
        });

        // Join Input
        this.add.text(panelX, 300, 'Join Code:', { fontSize: '24px', color: '#000' }).setOrigin(0.5);

        this.codeInputText = this.add.text(panelX, 340, '____', {
            fontSize: '32px', color: '#333', backgroundColor: '#DDD', padding: { x: 10, y: 5 }
        }).setOrigin(0.5).setInteractive();

        this.inputCode = "";

        // Handle Typing
        this.input.keyboard.on('keydown', (event) => {
            if (event.keyCode === 8 && this.inputCode.length > 0) {
                this.inputCode = this.inputCode.slice(0, -1);
            } else if (event.key.length === 1 && this.inputCode.length < 4 && /[a-zA-Z0-9]/.test(event.key)) {
                this.inputCode += event.key.toUpperCase();
            }
            this.updateCodeDisplay();
        });

        const joinBtn = this.createButton(panelX, 400, 'Join', () => {
            if (this.inputCode.length === 4) {
                this.joinRoom(this.inputCode);
            }
        });

        // --- Right Panel: Room List ---
        const listX = 550;
        this.add.text(listX, 160, 'Active Rooms:', { fontSize: '20px', color: '#000' }).setOrigin(0.5);
        this.roomListContainer = this.add.container(listX, 200);

        // Refresh mechanism
        this.time.addEvent({ delay: 2000, callback: this.refreshRooms, callbackScope: this, loop: true });

        // Networking Events
        this.setupNetworking();
    }

    updateCodeDisplay() {
        // Pad with underscores
        const padded = this.inputCode + "____".substring(this.inputCode.length);
        this.codeInputText.setText(padded);
    }

    joinRoom(code) {
        this.game.net.send('join_room', { roomId: code });
        this.statusText.setText(`Joining ${code}...`);
    }

    refreshRooms() {
        if (this.game.net.connected) {
            this.game.net.send('get_rooms');
        }
    }

    setupNetworking() {
        const net = this.game.net;

        const onConnect = () => {
            this.statusText.setText('Connected!');
            this.createBtn.setInteractive();
            // Initial fetch
            this.refreshRooms();
        };

        if (net.connected) {
            onConnect();
        } else {
            this.createBtn.disableInteractive(); // Disable until connected
            net.addEventListener('connected', onConnect);
        }

        net.addEventListener('room_joined', (e) => {
            console.log("Joined room", e.detail);
            this.scene.start('PlayScene');
        });

        // Listen for room list updates (custom event? Net logic updates?)
        // Wait, net.js dispatches 'state' and 'room_joined'. I need to handle 'room_list'.
        // I need to update net.js to dispatch 'room_list' or listen to socket here? 
        // net.js handles parsing. Let's check net.js.
        // It listens to 'onmessage'. I should add a handler there or just expose the socket event? 
        // Better: update net.js to dispatch 'room_list'.
        // Since I cannot update two files in one step, I assume net.js needs update or I can hack it by listening to 'room_list' if net.js supports generic event dispatching for unknown types?
        // net.js `handleMessage` checks specific types.
        // I'll assume I update net.js NEXT.
        // For now, I'll add the listener here expecting the event.

        net.addEventListener('room_list', (e) => {
            this.updateRoomList(e.detail);
        });
    }

    updateRoomList(rooms) {
        this.roomListContainer.removeAll(true);

        rooms.forEach((r, idx) => {
            const y = idx * 40;
            const text = `${r.id} (${r.players}/2)`;
            const btn = this.add.text(0, y, text, { fontSize: '18px', color: '#000', backgroundColor: '#EEE', padding: { x: 5, y: 2 } })
                .setOrigin(0.5)
                .setInteractive({ useHandCursor: true });

            btn.on('pointerdown', () => {
                this.inputCode = r.id;
                this.updateCodeDisplay();
                // Optionally auto-join?
                // this.joinRoom(r.id);
            });

            this.roomListContainer.add(btn);
        });
    }

    createButton(x, y, text, callback) {
        const txt = this.add.text(x, y, text, {
            fontSize: '24px',
            color: '#ffffff',
            backgroundColor: '#333333',
            padding: { x: 10, y: 5 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        txt.on('pointerdown', callback);
        txt.on('pointerover', () => txt.setBackgroundColor('#555555'));
        txt.on('pointerout', () => txt.setBackgroundColor('#333333'));
        return txt;
    }
}
