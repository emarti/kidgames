import Phaser from 'phaser';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
    this.inputCode = '';
    this._listeners = [];
  }

  create() {
    this.inputCode = '';
    this.drawBackground();

    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    this.add.text(cx, Math.max(54, cy - 190), 'SUBMARINE', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '46px',
      fontStyle: 'bold',
      color: '#f8fafc',
    }).setOrigin(0.5);

    this.statusText = this.add.text(cx, cy + 205, 'Connecting...', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '17px',
      color: '#cbd5e1',
    }).setOrigin(0.5);

    this.createBtn = this.createButton(cx, cy - 58, 'Create Room', () => {
      this.game.net.send('create_room');
      this.statusText.setText('Creating room...');
    });

    this.add.text(cx, cy + 16, 'Join Code', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '20px',
      color: '#dbeafe',
    }).setOrigin(0.5);

    this.codeInputText = this.add.text(cx, cy + 58, '____', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '34px',
      color: '#061826',
      backgroundColor: '#e0f2fe',
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5);

    this.createButton(cx, cy + 122, 'Join', () => {
      if (this.inputCode.length === 4) this.joinRoom(this.inputCode);
    });

    const listX = Math.min(width - 96, cx + 260);
    this.add.text(listX, cy - 106, 'Rooms', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '18px',
      color: '#93c5fd',
    }).setOrigin(0.5);
    this.roomListContainer = this.add.container(listX, cy - 70);

    this.input.keyboard.on('keydown', this.onKeyDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    this.time.addEvent({ delay: 2000, callback: this.refreshRooms, callbackScope: this, loop: true });
    this.setupNetworking();
  }

  drawBackground() {
    const { width, height } = this.scale;
    const waterline = Math.round(height * 0.2);
    const g = this.add.graphics();
    g.fillGradientStyle(0x7dd3fc, 0x38bdf8, 0x082f49, 0x061826, 1);
    g.fillRect(0, 0, width, height);
    g.fillStyle(0xe0f2fe, 0.85);
    g.fillRect(0, waterline - 3, width, 6);

    for (let i = 0; i < 9; i += 1) {
      const x = (i * 137) % width;
      const y = waterline + 60 + ((i * 53) % Math.max(80, height - waterline - 80));
      g.lineStyle(2, 0x93c5fd, 0.18);
      g.strokeCircle(x, y, 8 + (i % 3) * 5);
    }
  }

  onKeyDown(event) {
    if (event.keyCode === 8 && this.inputCode.length > 0) {
      this.inputCode = this.inputCode.slice(0, -1);
    } else if (event.key.length === 1 && this.inputCode.length < 4 && /[0-9]/.test(event.key)) {
      this.inputCode += event.key;
    }
    this.updateCodeDisplay();
  }

  updateCodeDisplay() {
    this.codeInputText.setText(this.inputCode + '____'.slice(this.inputCode.length));
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
      this.statusText.setText(net.ready ? 'Connected' : 'Connected...');
      this.createBtn.setInteractive();
      this.refreshRooms();
    };
    const onJoined = () => this.scene.start('PlayScene');
    const onRoomList = (event) => this.updateRoomList(event.detail);
    const onError = (event) => this.statusText.setText(String(event.detail || 'Network error'));
    const onDisconnected = () => this.statusText.setText('Disconnected');

    if (net.connected) {
      onConnect();
    } else {
      this.createBtn.disableInteractive();
    }

    this.listen(net, 'connected', onConnect);
    this.listen(net, 'room_joined', onJoined);
    this.listen(net, 'room_list', onRoomList);
    this.listen(net, 'net_error', onError);
    this.listen(net, 'disconnected', onDisconnected);
  }

  updateRoomList(rooms = []) {
    this.roomListContainer.removeAll(true);
    rooms.slice(0, 6).forEach((room, idx) => {
      const btn = this.add.text(0, idx * 38, `${room.id} (${room.players}/6)`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '17px',
        color: '#061826',
        backgroundColor: '#bae6fd',
        padding: { x: 8, y: 4 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        this.inputCode = room.id;
        this.updateCodeDisplay();
      });
      this.roomListContainer.add(btn);
    });
  }

  createButton(x, y, label, callback) {
    const txt = this.add.text(x, y, label, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '24px',
      color: '#061826',
      backgroundColor: '#facc15',
      padding: { x: 16, y: 9 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    txt.on('pointerdown', callback);
    txt.on('pointerover', () => txt.setBackgroundColor('#fde047'));
    txt.on('pointerout', () => txt.setBackgroundColor('#facc15'));
    return txt;
  }

  listen(target, type, handler) {
    target.addEventListener(type, handler);
    this._listeners.push({ target, type, handler });
  }

  shutdown() {
    for (const { target, type, handler } of this._listeners) {
      target.removeEventListener(type, handler);
    }
    this._listeners = [];
    this.input.keyboard.off('keydown', this.onKeyDown, this);
  }
}
