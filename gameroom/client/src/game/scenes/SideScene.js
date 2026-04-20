/**
 * SideScene — generic side/color picker.
 *
 * Reads the active game type from the server state and shows the appropriate
 * sides (e.g. Black/White for Go, Red/Black for Checkers, Fox/Geese, …).
 * Players sharing a side play as a team. "Watch" skips side selection.
 * When Solo Explore is on, a "Both Sides" option is shown.
 */

import Phaser from 'phaser';

const C = {
  bg:      0x1a1a2e,
  text:    '#e0e0e0',
  textDim: '#666688',
  accent:  '#e94560',
};
const FONT = { fontFamily: 'monospace' };

// Per-game side definitions — client display only.
const GAME_SIDES = {
  go:       [{ id: 'black', label: '⚫ Black', bg: 0x111111, fg: '#ffffff' },
             { id: 'white', label: '⚪ White', bg: 0xdddddd, fg: '#111111' }],
  checkers: [{ id: 'red',   label: '🔴 Red',   bg: 0x8b1a1a, fg: '#ffffff' },
             { id: 'black', label: '⚫ Black', bg: 0x111111, fg: '#ffffff' }],
  chess:    [{ id: 'white', label: '♔ White', bg: 0xdddddd, fg: '#111111' },
             { id: 'black', label: '♚ Black', bg: 0x111111, fg: '#ffffff' }],
  morris:   [{ id: 'white', label: '⚪ White', bg: 0xdddddd, fg: '#111111' },
             { id: 'black', label: '⚫ Black', bg: 0x111111, fg: '#ffffff' }],
  cchk:     [{ id: 'green',  label: '🟢 Green',  bg: 0x1a5a1a, fg: '#ffffff' },
             { id: 'blue',   label: '🔵 Blue',   bg: 0x1a1a7a, fg: '#ffffff' },
             { id: 'red',    label: '🔴 Red',    bg: 0x7a1a1a, fg: '#ffffff' },
             { id: 'yellow', label: '🟡 Yellow', bg: 0x6a6a00, fg: '#ffffff' },
             { id: 'purple', label: '🟣 Purple', bg: 0x4a1a6a, fg: '#ffffff' },
             { id: 'orange', label: '🟠 Orange', bg: 0x7a3a00, fg: '#ffffff' }],
  foxgeese: [{ id: 'fox',   label: '🦊 Fox',   bg: 0x8b4513, fg: '#ffffff' },
             { id: 'geese', label: '🪿 Geese',  bg: 0x336699, fg: '#ffffff' }],
  hex:      [{ id: 'red',  label: '🔴 Red (top ↔ bottom)',  bg: 0x8b1a1a, fg: '#ffffff' },
             { id: 'blue', label: '🔵 Blue (left ↔ right)', bg: 0x1a1a8b, fg: '#ffffff' }],
  reversi:  [{ id: 'black', label: '⚫ Black', bg: 0x111111, fg: '#ffffff' },
             { id: 'white', label: '⚪ White', bg: 0xdddddd, fg: '#111111' }],
};
const BOTH_SIDE = { id: 'both', label: '⇄ Both Sides', bg: 0x1a3a1a, fg: '#2ecc71' };

export default class SideScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SideScene' });
    this._listeners = [];
  }

  create() {
    const { width: W, height: H } = this.scale;
    const cx = W / 2;
    const net = this.game.net;
    const st  = net.latestState;
    const gameType    = st?.gameType ?? 'go';
    const soloExplore = st?.soloExplore ?? false;

    // Already has a side? Jump straight through.
    if (net.playerId && st?.players[net.playerId]?.side) {
      this.scene.start('PlayScene');
      return;
    }

    this.add.rectangle(0, 0, W, H, C.bg).setOrigin(0, 0);

    this.add.text(cx, H * 0.07, `Room ${net.roomId ?? ''}`, {
      ...FONT, fontSize: '18px', color: C.textDim,
    }).setOrigin(0.5);

    this.add.text(cx, H * 0.14, 'Choose your side', {
      ...FONT, fontSize: '30px', color: C.text, fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, H * 0.21, 'Players sharing a side play as a team!', {
      ...FONT, fontSize: '15px', color: C.textDim,
    }).setOrigin(0.5);

    // Build side buttons.
    const sides = GAME_SIDES[gameType] ?? GAME_SIDES.go;
    const options = soloExplore ? [...sides, BOTH_SIDE] : sides;
    const btnH = Math.min(62, Math.floor(H * 0.46 / options.length));
    const btnW = Math.min(300, W * 0.70);
    const startY = H * 0.31;
    const gap = btnH + 10;

    options.forEach((side, i) => {
      const y = startY + i * gap;
      this._sideBtn(cx, y, btnW, btnH, side, () => this._pick(side.id, net));
    });

    // Watch button.
    this.add.text(cx, H * 0.84, '👁  Just watch', {
      ...FONT, fontSize: '17px', color: '#666688',
      backgroundColor: '#111122', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('PlayScene'));

    this._statusTxt = this.add.text(cx, H * 0.92, '', {
      ...FONT, fontSize: '14px', color: '#cc4444',
    }).setOrigin(0.5);

    // Back to game select.
    this.add.text(12, 10, '← Back', {
      ...FONT, fontSize: '16px', color: C.textDim,
    }).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('GameSelectScene'));

    // Advance once server confirms our side.
    this._on(net, 'state', (e) => {
      const pid = net.playerId;
      if (pid && e.detail.players[pid]?.side) {
        this.scene.start('PlayScene');
      }
    });
    this._on(net, 'server_error', (e) => {
      if (this._statusTxt) this._statusTxt.setText(e.detail ?? '');
    });
  }

  _sideBtn(x, y, w, h, side, cb) {
    const bg = this.add.rectangle(x, y, w, h, side.bg)
      .setStrokeStyle(2, 0x555555)
      .setInteractive({ useHandCursor: true });
    const lbl = this.add.text(x, y, side.label, {
      ...FONT, fontSize: '20px', color: side.fg, fontStyle: 'bold',
    }).setOrigin(0.5);
    bg.on('pointerover',  () => bg.setStrokeStyle(3, 0xe94560));
    bg.on('pointerout',   () => bg.setStrokeStyle(2, 0x555555));
    bg.on('pointerdown',  cb);
    lbl.on('pointerdown', cb);
  }

  _pick(sideId, net) {
    if (sideId === 'both') {
      net.send('select_side', { side: null });
      this.scene.start('PlayScene');
      return;
    }
    net.send('select_side', { side: sideId });
    if (this._statusTxt) this._statusTxt.setText('Joining…');
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
