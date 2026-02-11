import Phaser from 'phaser';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    const cx = this.cameras.main.centerX;

    this.add.text(cx, 80, 'FLING', {
      fontSize: '54px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, 140, 'Fling rubber ducks at alien ships eating the Earth!', {
      fontSize: '18px',
      color: '#ffd24d',
    }).setOrigin(0.5);

    this.statusText = this.add.text(cx, 520, 'Connecting...', {
      fontSize: '18px',
      color: '#cbd5e1',
    }).setOrigin(0.5);

    const panelX = 260;

    this.createBtn = this.createButton(panelX, 220, 'Create New Room', () => {
      this.game.net.send('create_room');
      this.statusText.setText('Creating room...');
    });

    this.add.text(panelX, 310, 'Join Code:', { fontSize: '24px', color: '#ffffff' }).setOrigin(0.5);

    this.codeInputText = this.add.text(panelX, 350, '____', {
      fontSize: '34px',
      color: '#1a1a2e',
      backgroundColor: '#e2e8f0',
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

    this.createButton(panelX, 420, 'Join', () => {
      if (this.inputCode.length === 4) this.joinRoom(this.inputCode);
    });

    const listX = 590;
    this.add.text(listX, 180, 'Active Rooms:', { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
    this.roomListContainer = this.add.container(listX, 220);

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
    if (this.game.net.connected) this.game.net.send('get_rooms');
  }

  setupNetworking() {
    const net = this.game.net;

    const onConnect = () => {
      this.statusText.setText('Connected!');
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

    rooms.forEach((r, idx) => {
      const y = idx * 40;
      const text = `${r.id} (${r.players}/4)`;
      const btn = this.add.text(0, y, text, {
        fontSize: '18px',
        color: '#1a1a2e',
        backgroundColor: '#e2e8f0',
        padding: { x: 6, y: 3 },
      })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      btn.on('pointerdown', () => {
        this.inputCode = r.id;
        this.updateCodeDisplay();
      });

      this.roomListContainer.add(btn);
    });
  }

  createButton(x, y, text, callback) {
    const txt = this.add.text(x, y, text, {
      fontSize: '24px',
      color: '#1a1a2e',
      backgroundColor: '#e2e8f0',
      padding: { x: 10, y: 6 },
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    txt.on('pointerdown', callback);
    txt.on('pointerover', () => txt.setBackgroundColor('#f1f5f9'));
    txt.on('pointerout', () => txt.setBackgroundColor('#e2e8f0'));
    return txt;
  }
}
