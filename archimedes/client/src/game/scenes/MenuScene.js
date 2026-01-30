import Phaser from 'phaser';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    const cx = this.cameras.main.centerX;

    this.add.text(cx, 60, '⚓ ARCHIMEDES', { fontSize: '42px', color: '#1a5276', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(cx, 110, 'Physics Toy Museum', { fontSize: '20px', color: '#2874a6' }).setOrigin(0.5);
    
    this.statusText = this.add.text(cx, 520, 'Connecting...', { fontSize: '18px', color: '#444' }).setOrigin(0.5);

    const panelX = 250;

    this.createBtn = this.createButton(panelX, 200, '🎮 Create New Room', () => {
      this.game.net.send('create_room');
      this.statusText.setText('Creating room...');
    });

    this.add.text(panelX, 290, 'Join Code:', { fontSize: '22px', color: '#1a5276' }).setOrigin(0.5);

    this.codeInputText = this.add.text(panelX, 330, '____', {
      fontSize: '32px',
      color: '#333',
      backgroundColor: '#DDD',
      padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setInteractive();

    this.inputCode = '';

    this.input.keyboard.on('keydown', (event) => {
      if (event.keyCode === 8 && this.inputCode.length > 0) {
        this.inputCode = this.inputCode.slice(0, -1);
      } else if (event.key.length === 1 && this.inputCode.length < 4 && /[0-9]/.test(event.key)) {
        this.inputCode += event.key;
      }
      this.updateCodeDisplay();
    });

    this.createButton(panelX, 400, '🚪 Join Room', () => {
      if (this.inputCode.length === 4) {
        this.joinRoom(this.inputCode);
      }
    });

    const listX = 550;
    this.add.text(listX, 170, 'Active Rooms:', { fontSize: '18px', color: '#1a5276' }).setOrigin(0.5);
    this.roomListContainer = this.add.container(listX, 210);

    this.time.addEvent({ delay: 2000, callback: this.refreshRooms, callbackScope: this, loop: true });

    this.setupNetworking();
  }

  updateCodeDisplay() {
    const padded = this.inputCode + '____'.substring(this.inputCode.length);
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
      this.statusText.setText('Connected! Create or join a room.');
      this.createBtn.setInteractive();
      this.refreshRooms();
    };

    if (net.connected) {
      onConnect();
    } else {
      this.createBtn.disableInteractive();
      net.addEventListener('connected', onConnect);
    }

    net.addEventListener('room_joined', () => {
      this.scene.start('PlayScene');
    });

    net.addEventListener('room_list', (e) => {
      this.updateRoomList(e.detail);
    });
  }

  updateRoomList(rooms) {
    this.roomListContainer.removeAll(true);

    if (rooms.length === 0) {
      const emptyText = this.add.text(0, 0, '(no active rooms)', { fontSize: '16px', color: '#666' }).setOrigin(0.5);
      this.roomListContainer.add(emptyText);
      return;
    }

    rooms.forEach((r, idx) => {
      const y = idx * 40;
      const text = `${r.id} (${r.players}/4 players)`;
      const btn = this.add
        .text(0, y, text, {
          fontSize: '16px',
          color: '#1a5276',
          backgroundColor: '#EEE',
          padding: { x: 8, y: 4 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      btn.on('pointerdown', () => {
        this.inputCode = r.id;
        this.updateCodeDisplay();
      });

      btn.on('pointerover', () => btn.setBackgroundColor('#DDD'));
      btn.on('pointerout', () => btn.setBackgroundColor('#EEE'));

      this.roomListContainer.add(btn);
    });
  }

  createButton(x, y, text, callback) {
    const txt = this.add
      .text(x, y, text, {
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: '#2874a6',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    txt.on('pointerdown', callback);
    txt.on('pointerover', () => txt.setBackgroundColor('#1a5276'));
    txt.on('pointerout', () => txt.setBackgroundColor('#2874a6'));
    return txt;
  }
}
