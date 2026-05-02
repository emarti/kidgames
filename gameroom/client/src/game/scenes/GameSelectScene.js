/**
 * GameSelectScene — pick which board game to play + configure room options.
 *
 * After a room is created/joined, players land here to select a game.
 * The room host (first player) picks the game; joiners see the choice
 * already made. A "Solo Explore" toggle lets any player move either side.
 *
 * Scene flow:
 *   MenuScene → GameSelectScene → PlayScene
 */

import NetScene from './NetScene.js';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:       0x1a1a2e,
  panel:    0x16213e,
  border:   0x0f3460,
  enabled:  0x0f3460,
  disabled: 0x2a2a3e,
  gold:     0xe94560,
  goldHex:  '#e94560',
  text:     '#e0e0e0',
  textDim:  '#666688',
  green:    '#2ecc71',
  greenBg:  0x1a4a2a,
};

const FONT = { fontFamily: 'monospace' };

// Game catalog — order is display order.
// icon: a short string drawn as "art" on the tile (emoji or ASCII art fallback)
const GAMES = [
  { id: 'go',       label: 'Go',               icon: '⊕',  desc: '9×9 board · capture stones',    implemented: true  },
  { id: 'checkers', label: 'Checkers',          icon: '◉',  desc: '8×8 board · jump and king',     implemented: true  },
  { id: 'chess',    label: 'Chess',             icon: '♞',  desc: '8×8 board · classic strategy',  implemented: false },
  { id: 'morris',   label: "Nine Men's Morris", icon: '⬡',  desc: 'mills and blocking',             implemented: true  },
  { id: 'cchk',     label: 'Chinese Checkers',  icon: '✦',  desc: 'star board · hop to the other side', implemented: false },
  { id: 'foxgeese', label: 'Fox & Geese',       icon: '🦊', desc: 'asymmetric · fox vs geese',     implemented: true  },
  { id: 'hex',      label: 'Hex',               icon: '⬡',  desc: '11×11 · connect your sides',    implemented: true  },
  { id: 'piratesbulgars', label: 'Pirates & Bulgars', icon: '🏴‍☠️', desc: 'asymmetric · swarm the fortress', implemented: true },
];

export default class GameSelectScene extends NetScene {
  constructor() {
    super({ key: 'GameSelectScene' });
    this._selectedGame = null;
    this._tiles = [];
  }

  create() {
    const { width: W, height: H } = this.scale;
    const cx = W / 2;
    const net = this.game.net;

    // Pull initial state (host may have pre-selected game).
    const st = net.latestState;
    if (st?.gameType) {
      this._selectedGame = st.gameType;
    }

    // ── Background ─────────────────────────────────────────────────────────────
    this.add.rectangle(0, 0, W, H, C.bg).setOrigin(0, 0);

    // ── Header ─────────────────────────────────────────────────────────────────
    this.add.text(cx, H * 0.05, 'GAME ROOM', {
      ...FONT, fontSize: '34px', color: C.goldHex, fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, H * 0.11, `Room ${net.roomId ?? ''}`, {
      ...FONT, fontSize: '18px', color: C.textDim,
    }).setOrigin(0.5);

    this.add.text(cx, H * 0.16, 'Choose a game:', {
      ...FONT, fontSize: '20px', color: C.text,
    }).setOrigin(0.5);

    // ── Game tiles ─────────────────────────────────────────────────────────────
    this._buildTiles(W, H);

    // ── Options ────────────────────────────────────────────────────────────────
    this._buildOptions(W, H);

    // ── Start button ───────────────────────────────────────────────────────────
    this._startBtn = this.add.text(cx, H * 0.91, 'Play  ▶', {
      ...FONT, fontSize: '26px', color: '#ffffff',
      backgroundColor: '#1a4a1a', padding: { x: 28, y: 10 },
    }).setOrigin(0.5);

    this._startBtn.setInteractive({ useHandCursor: true });
    this._startBtn.on('pointerover',  () => this._startBtn.setBackgroundColor('#2a6a2a'));
    this._startBtn.on('pointerout',   () => this._startBtn.setBackgroundColor('#1a4a1a'));
    this._startBtn.on('pointerdown',  () => this._onStart());

    // Back button.
    this.add.text(12, 10, '← Back', {
      ...FONT, fontSize: '16px', color: C.textDim,
    }).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('MenuScene'));

    // ── Networking ─────────────────────────────────────────────────────────────
    this._on(net, 'state', (e) => this._onState(e.detail));
    // If we get disconnected while on this screen, go back to menu.
    this._on(net, 'disconnected', () => this.scene.start('MenuScene'));
    this._on(net, 'server_error', (e) => this._setStatus(e.detail));

    // Refresh display with latest state.
    this._refreshTiles();
  }

  // ── Tile grid ────────────────────────────────────────────────────────────────

  _buildTiles(W, H) {
    const COLS = 4;
    const ROWS = 2;
    const TILE_W = Math.min(Math.floor(W * 0.21), 130);
    const TILE_H = Math.round(TILE_W * 0.85);
    const GAP = Math.round(W * 0.025);
    const GRID_W = COLS * TILE_W + (COLS - 1) * GAP;
    const GRID_H = ROWS * TILE_H + (ROWS - 1) * GAP;
    const startX = (W - GRID_W) / 2 + TILE_W / 2;
    const startY = H * 0.22 + TILE_H / 2;

    this._tiles = [];

    GAMES.forEach((game, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = startX + col * (TILE_W + GAP);
      const y = startY + row * (TILE_H + GAP);

      const tile = this._buildTile(x, y, TILE_W, TILE_H, game);
      this._tiles.push({ game, tile, x, y });
    });
  }

  _buildTile(x, y, w, h, game) {
    const bg = this.add.rectangle(x, y, w, h, C.disabled)
      .setStrokeStyle(2, 0x333355);

    const iconTxt = this.add.text(x, y - h * 0.18, game.icon, {
      ...FONT, fontSize: '22px', color: game.implemented ? C.text : C.textDim,
    }).setOrigin(0.5);

    const labelTxt = this.add.text(x, y + h * 0.10, game.label, {
      ...FONT, fontSize: '12px', color: game.implemented ? C.text : C.textDim,
      fontStyle: 'bold', align: 'center', wordWrap: { width: w - 8 },
    }).setOrigin(0.5);

    const descTxt = this.add.text(x, y + h * 0.36, game.desc, {
      ...FONT, fontSize: '9px', color: C.textDim,
      align: 'center', wordWrap: { width: w - 8 },
    }).setOrigin(0.5);

    const soonTxt = game.implemented ? null : this.add.text(x, y - h * 0.36, 'soon', {
      ...FONT, fontSize: '10px', color: '#555566',
      backgroundColor: '#222233', padding: { x: 4, y: 2 },
    }).setOrigin(0.5);

    if (game.implemented) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover',  () => this._onTileHover(game.id, bg));
      bg.on('pointerout',   () => this._refreshTiles());
      bg.on('pointerdown',  () => this._selectGame(game.id));
      iconTxt.setInteractive({ useHandCursor: true });
      iconTxt.on('pointerdown', () => this._selectGame(game.id));
      labelTxt.setInteractive({ useHandCursor: true });
      labelTxt.on('pointerdown', () => this._selectGame(game.id));
    }

    return { bg, iconTxt, labelTxt, descTxt, soonTxt };
  }

  _onTileHover(id, bg) {
    const isSelected = this._selectedGame === id;
    if (!isSelected) bg.setStrokeStyle(2, 0x4444aa);
  }

  _refreshTiles() {
    for (const { game, tile } of this._tiles) {
      const { bg, iconTxt, labelTxt } = tile;
      const isSelected  = this._selectedGame === game.id;
      const isEnabled   = game.implemented;

      if (isSelected) {
        bg.setFillStyle(C.enabled);
        bg.setStrokeStyle(3, 0xe94560);
        iconTxt.setColor(C.goldHex);
        labelTxt.setColor(C.goldHex);
      } else if (isEnabled) {
        bg.setFillStyle(C.disabled);
        bg.setStrokeStyle(2, 0x333388);
        iconTxt.setColor(C.text);
        labelTxt.setColor(C.text);
      } else {
        bg.setFillStyle(C.disabled);
        bg.setStrokeStyle(2, 0x222244);
      }
    }
  }

  _selectGame(id) {
    this._selectedGame = id;
    this._refreshTiles();
  }

  // ── Options ──────────────────────────────────────────────────────────────────

  _buildOptions(W, H) {
    const cx = W / 2;
    const optY = H * 0.70;

    // Status message area.
    this._statusTxt = this.add.text(cx, optY, '', {
      ...FONT, fontSize: '14px', color: '#cc4444',
    }).setOrigin(0.5);
  }

  _setStatus(msg) {
    if (this._statusTxt) this._statusTxt.setText(msg ?? '');
  }

  // ── Start ─────────────────────────────────────────────────────────────────────

  _onStart() {
    if (!this._selectedGame) {
      this._setStatus('Pick a game first!');
      return;
    }
    const net = this.game.net;
    const st  = net.latestState;

    // If the game type changed, send select_game first; server will broadcast
    // the updated state and we advance to PlayScene on the state update.
    if (st?.gameType !== this._selectedGame) {
      net.send('select_game', { gameType: this._selectedGame });
    } else {
      // Game type already set — go straight to PlayScene.
      this.scene.start('PlayScene');
    }
  }

  // ── Net callbacks ─────────────────────────────────────────────────────────────

  _onState(state) {
    // If a game was selected server-side, sync the tile highlight.
    if (state.gameType && state.gameType !== this._selectedGame) {
      this._selectedGame = state.gameType;
      this._refreshTiles();
    }

    // Advance after a successful select_game confirmation.
    if (state.gameType && state.game) {
      this.scene.start('PlayScene');
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
}
