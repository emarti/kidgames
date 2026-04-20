import Phaser from 'phaser';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
    this._listeners = [];
  }

  create() {
    const { width: W, height: H } = this.scale;
    const cx = this.cameras.main.centerX;

    // White background (overrides the dark game-wide backgroundColor for this scene)
    this.add.rectangle(0, 0, W, H, 0xffffff).setOrigin(0, 0);

    // Title
    this.add.text(cx, 80, 'GAME ROOM', {
      fontSize: '48px', color: '#000000', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.statusText = this.add.text(cx, 550, 'Connecting...', {
      fontSize: '20px', color: '#444',
    }).setOrigin(0.5);

    // --- Left Panel: Create ---
    const panelX = 250;

    this.createBtn = this._createButton(panelX, 200, 'Create New Room', () => {
      this.game.net.send('create_room');
      this.statusText.setText('Creating room...');
    });
    this.createBtn.disableInteractive();

    // --- Right Panel: Room List ---
    const listX = 550;
    this.add.text(listX, 160, 'Active Rooms:', {
      fontSize: '20px', color: '#000',
    }).setOrigin(0.5);

    this.roomListContainer = this.add.container(listX, 200);

    this.time.addEvent({ delay: 2000, callback: this._refreshRooms, callbackScope: this, loop: true });

    this._setupNet();
  }

  _refreshRooms() {
    if (this.game.net.connected) this.game.net.send('get_rooms');
  }

  _joinRoom(code) {
    this.game.net.send('join_room', { roomId: code });
    this.statusText.setText('Joining ' + code + '...');
  }

  _setupNet() {
    const net = this.game.net;

    const onConnect = () => {
      this.statusText.setText('Connected!');
      this.createBtn.setInteractive({ useHandCursor: true });
      this._refreshRooms();
    };

    if (net.connected) {
      onConnect();
    } else {
      this._on(net, 'connected', onConnect);
    }

    this._on(net, 'room_joined', (e) => {
      const state = e.detail?.state;
      if (state?.gameType && state?.game) {
        this.scene.start('PlayScene');
      } else {
        this.scene.start('GameSelectScene');
      }
    });

    this._on(net, 'room_list', (e) => {
      this._updateRoomList(e.detail);
    });

    this._on(net, 'server_error', (e) => {
      this.statusText.setText('Error: ' + e.detail);
    });
  }

  _updateRoomList(rooms) {
    this.roomListContainer.removeAll(true);

    rooms.forEach((r, idx) => {
      const y = idx * 40;
      const label = r.id + ' (' + r.players + '/4)' + (r.gameType ? '  ·  ' + r.gameType : '');
      const btn = this.add.text(0, y, label, {
        fontSize: '18px', color: '#000', backgroundColor: '#EEE',
        padding: { x: 5, y: 2 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      btn.on('pointerover',  () => btn.setBackgroundColor('#CCCCCC'));
      btn.on('pointerout',   () => btn.setBackgroundColor('#EEE'));
      btn.on('pointerdown',  () => this._joinRoom(r.id));

      this.roomListContainer.add(btn);
    });
  }

  _createButton(x, y, text, callback) {
    const btn = this.add.text(x, y, text, {
      fontSize: '24px', color: '#ffffff', backgroundColor: '#333333',
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerdown', callback);
    btn.on('pointerover', () => btn.setBackgroundColor('#555555'));
    btn.on('pointerout',  () => btn.setBackgroundColor('#333333'));
    return btn;
  }

  _on(emitter, event, cb) {
    emitter.addEventListener(event, cb);
    this._listeners.push({ emitter, event, cb });
  }

  shutdown() {
    for (const { emitter, event, cb } of this._listeners) {
      emitter.removeEventListener(event, cb);
    }
    this._listeners = [];
  }
}
