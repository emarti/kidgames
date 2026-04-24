import Phaser from 'phaser';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    // Background gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a1a2e, 0x1a1a2e, 0x2d1b4e, 0x2d1b4e, 1);
    bg.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);

    this.add.text(cx, cy - 180, '🔤 ALPHABET', {
      fontSize: '52px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, cy - 120, 'Learn to read one letter at a time!', {
      fontSize: '18px',
      color: '#ffd24d',
    }).setOrigin(0.5);

    this.statusText = this.add.text(cx, cy + 200, 'Connecting...', {
      fontSize: '18px',
      color: '#cbd5e1',
    }).setOrigin(0.5);

    this.createBtn = this.createButton(cx, cy - 50, '🌟 Create New Room', () => {
      this.game.net.send('create_room');
      this.statusText.setText('Creating room...');
    });

    this.add.text(cx, cy + 20, 'Join Code:', { fontSize: '22px', color: '#ffffff' }).setOrigin(0.5);

    this.codeInputText = this.add.text(cx, cy + 60, '____', {
      fontSize: '36px',
      color: '#1a1a2e',
      backgroundColor: '#e2e8f0',
      padding: { x: 14, y: 8 },
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

    this.createButton(cx, cy + 120, '🚪 Join', () => {
      if (this.inputCode.length === 4) this.joinRoom(this.inputCode);
    });

    // Room list
    const listX = Math.min(cx + 250, this.cameras.main.width - 100);
    this.add.text(listX, cy - 100, 'Active Rooms:', { fontSize: '18px', color: '#94a3b8' }).setOrigin(0.5);
    this.roomListContainer = this.add.container(listX, cy - 70);

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
      const y = idx * 44;
      const btn = this.add.text(0, y, `${r.id}  (${r.players}/4)`, {
        fontSize: '18px',
        color: '#1a1a2e',
        backgroundColor: '#e2e8f0',
        padding: { x: 8, y: 4 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

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
      backgroundColor: '#ffd24d',
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    txt.on('pointerdown', callback);
    txt.on('pointerover', () => txt.setBackgroundColor('#ffe066'));
    txt.on('pointerout',  () => txt.setBackgroundColor('#ffd24d'));
    return txt;
  }
}
