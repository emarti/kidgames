/**
 * PlayScene.js — Main gameplay scene for the Alphabet reading game.
 *
 * Layout (top → bottom):
 *   HUD bar (room, level info, pause button) — 44px
 *   Game area:
 *     Emoji (large, centered)
 *     Word display with underscore for the missing letter
 *     Recent words (completed / revealed history)
 *   Progress bar (right edge, vertical)
 *   Keyboard (alphabetical A-Z, 2 rows)
 *
 * Feedback:
 *   Correct  → word text flashes green briefly
 *   Wrong    → word flashes red, child gets another try
 *   Revealed → answer shown green, word advances after 1.5 s
 */

import Phaser from 'phaser';

const AVATARS = ['🐱', '🐶', '🐰', '🦊', '🐸', '🐼'];
const PLAYER_COLORS = { 1: '#f6c90e', 2: '#6bcb77', 3: '#4d96ff', 4: '#ff6b6b' };
const PLAYER_COLORS_INT = { 1: 0xf6c90e, 2: 0x6bcb77, 3: 0x4d96ff, 4: 0xff6b6b };

// QWERTY layout — 3 rows
const KB_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M'],
];

// Level descriptions for the setup overlay
const LEVEL_DESCS = [
  'A to Z in order — first letter missing',
  'A to Z scrambled — first letter missing',
  'Easy words — first letter missing',
  'Easy words — last letter missing',
  'Easy CVC words — middle vowel missing',
  'Easy words — any letter missing',
  'Challenge words — any letter missing',
];

export default class PlayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PlayScene' });
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  create() {
    this._prevState = null;
    this._revealTimer = null;
    // When a correct answer is given we freeze display on the completed word
    // for a short moment so the child sees positive feedback before it changes.
    this._correctFreeze = null; // { word, emoji, missingIndex } | null
    this._correctFreezeUntil = 0;
    // Web Audio context for the triumph sound (created lazily on first use)
    this._audioCtx = null;

    // Background
    this.bgGraphics = this.add.graphics();
    this._drawBackground();

    // Progress bar (right edge)
    this.progressBg = this.add.graphics();
    this.progressFill = this.add.graphics();

    // Emoji display
    this.emojiText = this.add.text(0, 0, '', {
      fontSize: '96px',
    }).setOrigin(0.5);

    // Word display — one text object per letter, pooled
    this._letterPool = [];
    for (let i = 0; i < 20; i++) {
      const t = this.add.text(0, -1000, '', {
        fontFamily: 'monospace',
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#ffffff',
      }).setOrigin(0.5);
      this._letterPool.push(t);
    }

    // "Word: ___" label above the word
    this.wordLabel = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#888899',
    }).setOrigin(0.5);

    // Recent words (small, fading history below)
    this._recentTexts = [];
    for (let i = 0; i < 6; i++) {
      const t = this.add.text(0, -1000, '', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#555566',
      }).setOrigin(0.5);
      this._recentTexts.push(t);
    }

    // HUD
    this.hudGraphics = this.add.graphics();
    this.hudRoomText = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#94a3b8',
    }).setOrigin(0, 0.5);
    this.hudLevelText = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffd24d', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);

    // Hamburger menu button — top right (matches typing game style)
    this.hudMenuBtn = this.add.text(0, 0, '☰', {
      fontSize: '22px',
      color: '#ffffff',
      backgroundColor: '#374151',
      padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.game.net.send('pause'))
      .on('pointerover', () => this.hudMenuBtn.setBackgroundColor('#4b5563'))
      .on('pointerout',  () => this.hudMenuBtn.setBackgroundColor('#374151'));

    // Player avatar dots (HUD, shown inline left of menu button)
    this._playerDots = [];
    for (let i = 0; i < 4; i++) {
      const dot = this.add.text(0, 0, AVATARS[i], {
        fontSize: '20px',
      }).setOrigin(0.5, 0).setVisible(false);
      this._playerDots.push(dot);
    }

    // Keyboard
    this._keyButtons = {};
    this._buildKeyboard();

    // Overlays
    this._setupOverlay = this._createSetupOverlay();
    this._celebOverlay = this._createCelebrationOverlay();
    this._confettiPieces = [];

    // Physical keyboard
    this.input.keyboard.on('keydown', (event) => {
      if (event.key.length === 1 && /[a-zA-Z]/.test(event.key)) {
        this._handleLetterInput(event.key);
      }
    });

    // Network
    const net = this.game.net;
    this._stateListener = (e) => this._onState(e.detail);
    net.addEventListener('state', this._stateListener);
    net.addEventListener('disconnected', () => this.scene.start('MenuScene'));

    if (net.latestState) this._onState(net.latestState);
  }

  // ─── Layout ────────────────────────────────────────────────────────────────

  _getLayout() {
    const W = this.scale.width;
    const H = this.scale.height;
    const HUD_H = 44;
    const KB_H = Math.min(Math.round(H * 0.42), 280);
    const GAME_H = H - HUD_H - KB_H;
    const EMOJI_Y = HUD_H + GAME_H * 0.20;
    const WORD_Y = HUD_H + GAME_H * 0.48;
    const RECENT_Y = HUD_H + GAME_H * 0.68;
    const KB_Y = H - KB_H;
    const PROG_W = 10;
    const PROG_X = W - PROG_W - 4;
    return { W, H, HUD_H, KB_H, GAME_H, EMOJI_Y, WORD_Y, RECENT_Y, KB_Y, PROG_W, PROG_X };
  }

  // ─── Background ────────────────────────────────────────────────────────────

  _drawBackground() {
    const { W, H } = this._getLayout();
    this.bgGraphics.clear();
    this.bgGraphics.fillGradientStyle(0x1a1a2e, 0x1a1a2e, 0x162040, 0x162040, 1);
    this.bgGraphics.fillRect(0, 0, W, H);
    // Subtle star-like dots
    const rng = this._seededRng(42);
    this.bgGraphics.fillStyle(0xffffff, 0.12);
    for (let i = 0; i < 60; i++) {
      const x = rng() * W;
      const y = rng() * H * 0.7;
      const r = rng() < 0.5 ? 1 : 1.5;
      this.bgGraphics.fillCircle(x, y, r);
    }
  }

  _seededRng(seed) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return ((s >>> 0) / 4294967296);
    };
  }

  // ─── Keyboard ──────────────────────────────────────────────────────────────

  _buildKeyboard() {
    // Destroy old keys
    for (const { bg, txt } of Object.values(this._keyButtons)) {
      bg.destroy();
      txt.destroy();
    }
    this._keyButtons = {};
    if (this._kbGraphics) this._kbGraphics.destroy();

    const { W, H, KB_Y, KB_H } = this._getLayout();

    // Keyboard background panel (matches typing game style)
    this._kbGraphics = this.add.graphics();
    this._kbGraphics.fillStyle(0x2d3748, 1);
    this._kbGraphics.fillRect(0, KB_Y, W, KB_H);
    this._kbGraphics.lineStyle(1, 0x4a5568, 1);
    this._kbGraphics.beginPath();
    this._kbGraphics.moveTo(0, KB_Y);
    this._kbGraphics.lineTo(W, KB_Y);
    this._kbGraphics.strokePath();

    const PAD = 8;
    const GAP = 4;
    const maxCols = 10;
    const keyW = Math.floor((W - PAD * 2 - GAP * (maxCols - 1)) / maxCols);
    const keyH = Math.floor((KB_H - PAD * 2 - GAP * 2) / 3);
    const fontSize = Math.max(14, Math.floor(keyH * 0.48));

    KB_ROWS.forEach((row, rowIdx) => {
      const rowTotalW = row.length * keyW + (row.length - 1) * GAP;
      const rowStartX = (W - rowTotalW) / 2;

      row.forEach((letter, colIdx) => {
        const kx = rowStartX + colIdx * (keyW + GAP);
        const ky = KB_Y + PAD + rowIdx * (keyH + GAP);

        const bg = this.add.rectangle(kx + keyW / 2, ky + keyH / 2, keyW, keyH, 0x4a5568, 1)
          .setInteractive({ useHandCursor: true });

        bg.on('pointerover', () => bg.setFillStyle(0x718096));
        bg.on('pointerout',  () => bg.setFillStyle(0x4a5568));
        bg.on('pointerdown', () => {
          bg.setFillStyle(0xa0aec0);
          this._handleLetterInput(letter);
          this.time.delayedCall(120, () => bg.setFillStyle(0x4a5568));
        });

        const txt = this.add.text(kx + keyW / 2, ky + keyH / 2, letter.toUpperCase(), {
          fontSize: `${fontSize}px`,
          color: '#ffffff',
          fontStyle: 'bold',
        }).setOrigin(0.5);

        this._keyButtons[letter.toUpperCase()] = { bg, txt };
      });
    });
  }

  _flashKey(letter, colorInt) {
    const k = this._keyButtons[letter.toUpperCase()];
    if (!k) return;
    k.bg.setFillStyle(colorInt);
    this.time.delayedCall(300, () => k.bg.setFillStyle(0x2a2a50));
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  _handleLetterInput(key) {
    // Block input during the correct-answer freeze
    if (performance.now() < this._correctFreezeUntil) return;
    this.game.net.send('input', { key: key.toLowerCase() });
  }

  // ─── Audio ─────────────────────────────────────────────────────────────────

  _ensureAudio() {
    if (!this._audioCtx) {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this._audioCtx;
  }

  _playTriumph() {
    // 12 randomised sound variations — pick one at random each time
    const variant = Math.floor(Math.random() * 12);
    try {
      const ctx = this._ensureAudio();
      const playNote = (freq, t, dur, type = 'sine', vol = 0.25) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      };
      const T = ctx.currentTime;
      // Each entry: array of [freq, offset, dur, type?, vol?]
      const variants = [
        // 0 — rising arpeggio C5-E5-G5 (original)
        [[523.25,0,.22],[659.25,.13,.22],[783.99,.26,.22]],
        // 1 — higher key D5-F#5-A5
        [[587.33,0,.22],[739.99,.13,.22],[880,.26,.22]],
        // 2 — quick trio G4-C5-E5
        [[392,0,.15],[523.25,.10,.15],[659.25,.20,.15]],
        // 3 — pentatonic skip C5-G5-C6
        [[523.25,0,.20],[783.99,.14,.20],[1046.5,.28,.20]],
        // 4 — two-note ping E5-A5
        [[659.25,0,.25],[880,.18,.25]],
        // 5 — falling fanfare G5-E5-C5 (reverse)
        [[783.99,0,.18],[659.25,.12,.18],[523.25,.24,.18]],
        // 6 — square-wave beep trio
        [[523.25,0,.12,'square',.15],[659.25,.14,.12,'square',.15],[783.99,.28,.12,'square',.15]],
        // 7 — triangle soft chime
        [[523.25,0,.30,'triangle',.2],[783.99,.15,.30,'triangle',.2],[1046.5,.30,.25,'triangle',.15]],
        // 8 — bouncy four-note
        [[440,0,.10],[523.25,.10,.10],[587.33,.20,.10],[659.25,.30,.18]],
        // 9 — wide leap C4-C6
        [[261.63,0,.15],[1046.5,.14,.22]],
        // 10 — sawtooth blip
        [[440,0,.08,'sawtooth',.1],[659.25,.10,.08,'sawtooth',.1],[880,.20,.10,'sawtooth',.1]],
        // 11 — staccato scale C5-D5-E5-G5
        [[523.25,0,.09],[587.33,.10,.09],[659.25,.20,.09],[783.99,.30,.14]],
      ];
      for (const [freq, off, dur, type, vol] of variants[variant]) {
        playNote(freq, T + off, dur, type ?? 'sine', vol ?? 0.25);
      }
    } catch {
      // AudioContext may be blocked; silently ignore
    }
  }

  // ─── Visual celebration burst ──────────────────────────────────────────────

  _playVisualCelebration() {
    // 12 visual effects — picked independently at random from the audio variant
    const variant = Math.floor(Math.random() * 12);
    const { W, H, HUD_H } = this._getLayout();
    const cx = W / 2;
    const gameAreaH = H - HUD_H;

    // Helpers
    const rnd = (a, b) => a + Math.random() * (b - a);
    const COLORS = [0xffd24d, 0x44cc77, 0x4d96ff, 0xff6b6b, 0xffffff, 0xcc44ff, 0xff9900, 0x00e5ff];
    const rColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

    const floatUp = (x, y, text, dur = 900) => {
      const t = this.add.text(x, y, text, { fontSize: '40px' }).setOrigin(0.5).setDepth(90);
      this.tweens.add({ targets: t, y: y - 80, alpha: 0, duration: dur,
        onComplete: () => t.destroy() });
    };

    const burstCircle = (x, y, color, r, dur = 600) => {
      const g = this.add.graphics().setDepth(89);
      g.fillStyle(color, 0.8);
      g.fillCircle(x, y, r);
      this.tweens.add({ targets: g, scaleX: 3, scaleY: 3, alpha: 0, duration: dur,
        onComplete: () => g.destroy() });
    };

    const shootStar = (x, y, color) => {
      const g = this.add.graphics().setDepth(89);
      g.fillStyle(color, 1);
      g.fillRect(-18, -4, 36, 8);
      const tx = (Math.random() > 0.5 ? 1 : -1) * rnd(80, 160);
      const ty = rnd(-60, 0);
      this.tweens.add({ targets: g, x: x + tx, y: y + ty, alpha: 0, duration: 700,
        onComplete: () => g.destroy() });
      g.setPosition(x, y);
    };

    switch (variant) {
      case 0: // star burst from center
        for (let i = 0; i < 8; i++) burstCircle(cx + rnd(-60,60), HUD_H + rnd(40,120), rColor(), rnd(8,20));
        break;
      case 1: // floating star emojis
        for (let i = 0; i < 5; i++)
          this.time.delayedCall(i * 80, () => floatUp(rnd(cx-100,cx+100), HUD_H + rnd(60,160), '⭐'));
        break;
      case 2: // rainbow ring of circles
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          burstCircle(cx + Math.cos(a)*60, HUD_H + 100 + Math.sin(a)*60, rColor(), 10, 800);
        }
        break;
      case 3: // shoot stars horizontally
        for (let i = 0; i < 6; i++)
          this.time.delayedCall(i * 60, () => shootStar(cx + rnd(-80,80), HUD_H + rnd(40,160), rColor()));
        break;
      case 4: // single big pulse
        burstCircle(cx, HUD_H + 100, rColor(), 50, 700);
        burstCircle(cx, HUD_H + 100, rColor(), 30, 500);
        break;
      case 5: // floating heart emojis
        for (let i = 0; i < 4; i++)
          this.time.delayedCall(i * 100, () => floatUp(rnd(cx-80,cx+80), HUD_H + rnd(80,180), '❤️'));
        break;
      case 6: // sparkle emojis
        for (let i = 0; i < 5; i++)
          this.time.delayedCall(i * 70, () => floatUp(rnd(cx-100,cx+100), HUD_H + rnd(40,180), '✨'));
        break;
      case 7: // cascade of tiny confetti rectangles
        for (let i = 0; i < 16; i++) {
          const g = this.add.rectangle(rnd(0,W), HUD_H + rnd(0,80), 8, 14, rColor()).setDepth(89);
          g.setRotation(rnd(0, Math.PI));
          this.tweens.add({ targets: g, y: g.y + rnd(80,200), alpha: 0, duration: rnd(500,900),
            onComplete: () => g.destroy() });
        }
        break;
      case 8: // floating balloon emojis
        for (let i = 0; i < 4; i++)
          this.time.delayedCall(i * 120, () => floatUp(rnd(cx-100,cx+100), HUD_H + 180, '🎈', 1000));
        break;
      case 9: // expanding concentric rings
        [0, 150, 300].forEach((delay, i) => {
          this.time.delayedCall(delay, () => burstCircle(cx, HUD_H + 100, COLORS[i*2], 20 + i*15, 700));
        });
        break;
      case 10: // party popper emojis
        for (let i = 0; i < 4; i++)
          this.time.delayedCall(i * 90, () => floatUp(rnd(cx-90,cx+90), HUD_H + rnd(60,160), '🎉'));
        break;
      case 11: // star + circle combo
        burstCircle(cx, HUD_H + 80, 0xffd24d, 40, 600);
        for (let i = 0; i < 4; i++)
          this.time.delayedCall(i * 80, () => floatUp(rnd(cx-80,cx+80), HUD_H + rnd(60,140), '🌟'));
        break;
    }
  }

  // ─── HUD ───────────────────────────────────────────────────────────────────

  _updateHUD(state) {
    const { W, HUD_H } = this._getLayout();
    const net = this.game.net;

    this.hudGraphics.clear();
    this.hudGraphics.fillStyle(0x000000, 0.45);
    this.hudGraphics.fillRect(0, 0, W, HUD_H);

    // Room label — left
    this.hudRoomText.setPosition(8, HUD_H / 2);
    this.hudRoomText.setText(`Room: ${net.roomId ?? '----'}`);

    // Level label — centre
    this.hudLevelText.setPosition(W / 2, HUD_H / 2);
    this.hudLevelText.setText(`${state.levelEmoji ?? ''} Level ${(state.levelIndex ?? 0) + 1}: ${state.levelName ?? ''}`);

    // Hamburger — far right, hidden while an overlay is open
    this.hudMenuBtn.setPosition(W - 6, 6);
    this.hudMenuBtn.setVisible(!state.paused && !state.celebrating);

    // Player avatars — inline left of hamburger
    let dotX = W - 52;
    [1, 2, 3, 4].forEach((pid, i) => {
      const p = state.players?.[pid];
      const dot = this._playerDots[i];
      if (p && p.connected) {
        dot.setText(p.avatar ?? AVATARS[i]);
        dot.setPosition(dotX, 6);
        dot.setVisible(true);
        dotX -= 30;
      } else {
        dot.setVisible(false);
      }
    });
  }

  // ─── Word display ──────────────────────────────────────────────────────────

  _updateWordDisplay(state, flashColor) {
    const { W, WORD_Y, EMOJI_Y, RECENT_Y, HUD_H, GAME_H } = this._getLayout();
    const cx = W / 2;

    // Emoji
    this.emojiText.setText(state.currentEmoji ?? '');
    this.emojiText.setPosition(cx, EMOJI_Y);
    this.emojiText.setFontSize(Math.min(96, Math.floor(GAME_H * 0.22)));

    // Word letters
    const word = state.currentWord ?? '';
    const missing = state.missingIndex ?? 0;

    // Compute max font size that fits
    const maxFontSize = Math.min(72, Math.floor((W * 0.85) / Math.max(word.length, 1) / 0.65));
    const fontSize = Math.max(28, maxFontSize);
    const charW = fontSize * 0.65;
    const startX = cx - ((word.length - 1) / 2) * charW;

    // Hide all pool letters
    for (const t of this._letterPool) t.setPosition(-1000, -1000).setText('');

    for (let i = 0; i < word.length; i++) {
      const t = this._letterPool[i];
      if (!t) continue;
      t.setFontSize(fontSize);
      t.setPosition(startX + i * charW, WORD_Y);

      if (i === missing) {
        // Show underscore
        t.setText('_');
        t.setColor(flashColor ?? '#ffdd44');
      } else {
        t.setText(word[i]);
        t.setColor(flashColor ?? '#e0e0f0');
      }
    }

    // Recent words
    const recent = state.recentWords ?? [];
    for (let i = 0; i < this._recentTexts.length; i++) {
      const rt = this._recentTexts[i];
      const entry = recent[i];
      if (entry) {
        const alpha = 1 - i * 0.15;
        rt.setAlpha(Math.max(0.1, alpha));
        const display = entry.word
          .split('')
          .map((c, idx) => idx === entry.missingIndex
            ? (entry.revealed ? `[${c.toUpperCase()}]` : c)
            : c)
          .join('');
        rt.setText(`${entry.emoji ?? ''} ${display}`);
        rt.setPosition(cx, RECENT_Y + i * 28);
        rt.setColor(entry.revealed ? '#ff8888' : '#44aa66');
      } else {
        rt.setPosition(-1000, -1000);
      }
    }
  }

  // Shows the just-completed word with ALL letters visible and highlighted green
  // Used during the 900ms triumph freeze so the child sees the full correct word.
  _updateWordDisplayForFreeze({ word, emoji, missingIndex }) {
    const { W, WORD_Y, EMOJI_Y, GAME_H } = this._getLayout();
    const cx = W / 2;

    this.emojiText.setText(emoji ?? '');
    this.emojiText.setPosition(cx, EMOJI_Y);
    this.emojiText.setFontSize(Math.min(96, Math.floor(GAME_H * 0.22)));

    const maxFontSize = Math.min(72, Math.floor((W * 0.85) / Math.max(word.length, 1) / 0.65));
    const fontSize = Math.max(28, maxFontSize);
    const charW = fontSize * 0.65;
    const startX = cx - ((word.length - 1) / 2) * charW;

    for (const t of this._letterPool) t.setPosition(-1000, -1000).setText('');
    for (let i = 0; i < word.length; i++) {
      const t = this._letterPool[i];
      if (!t) continue;
      t.setFontSize(fontSize);
      t.setPosition(startX + i * charW, WORD_Y);
      t.setText(word[i]);
      // The formerly-missing letter glows brighter to celebrate the correct pick
      t.setColor(i === missingIndex ? '#44ff88' : '#aaffcc');
    }

    // Hide recent-words list during freeze for a cleaner celebratory frame
    for (const rt of this._recentTexts) rt.setPosition(-1000, -1000);
  }

  // ─── Progress bar ──────────────────────────────────────────────────────────

  _updateProgress(state) {
    const { H, HUD_H, PROG_W, PROG_X } = this._getLayout();
    const barH = H - HUD_H - 8;
    const barY = HUD_H + 4;
    const total = state.wordsPerLevel ?? 15;
    const done = state.wordsCompleted ?? 0;
    const pct = Math.min(1, done / total);

    this.progressBg.clear();
    this.progressBg.fillStyle(0x2a2a40, 1);
    this.progressBg.fillRect(PROG_X, barY, PROG_W, barH);

    this.progressFill.clear();
    this.progressFill.fillStyle(0x44bb66, 1);
    const fillH = Math.floor(barH * pct);
    this.progressFill.fillRect(PROG_X, barY + barH - fillH, PROG_W, fillH);
  }

  // ─── Setup overlay ─────────────────────────────────────────────────────────

  _createSetupOverlay() {
    const container = this.add.container(0, 0);
    container.setVisible(false);

    // Semi-transparent backdrop
    const backdrop = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.78).setOrigin(0);
    container.add(backdrop);
    container._backdrop = backdrop;

    // Panel
    const panel = this.add.rectangle(0, 0, 10, 10, 0x1a1a3e, 0.97)
      .setStrokeStyle(2, 0x4444aa)
      .setOrigin(0.5);
    container.add(panel);
    container._panel = panel;

    // Title
    const title = this.add.text(0, 0, '🔤 ALPHABET', {
      fontFamily: 'monospace', fontSize: '32px', color: '#ffd24d', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add(title);
    container._title = title;

    // Level label
    const levelLabel = this.add.text(0, 0, 'Choose Level:', {
      fontFamily: 'monospace', fontSize: '18px', color: '#94a3b8',
    }).setOrigin(0.5);
    container.add(levelLabel);
    container._levelLabel = levelLabel;

    // Level buttons
    const levelBtns = [];
    for (let i = 0; i < 7; i++) {
      const btn = this.add.text(0, 0, '', {
        fontFamily: 'monospace', fontSize: '14px', color: '#1a1a2e',
        backgroundColor: '#e2e8f0', padding: { x: 8, y: 5 },
        wordWrap: { width: 260 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => this.game.net.send('select_level', { index: i }));
      btn.on('pointerover', () => btn.setBackgroundColor('#c8d8f0'));
      btn.on('pointerout',  () => { /* redrawn on state */ });
      container.add(btn);
      levelBtns.push(btn);
    }
    container._levelBtns = levelBtns;

    // Avatar label + buttons
    const avatarLabel = this.add.text(0, 0, 'Your Avatar:', {
      fontFamily: 'monospace', fontSize: '15px', color: '#94a3b8',
    }).setOrigin(0.5);
    container.add(avatarLabel);
    container._avatarLabel = avatarLabel;

    const avatarBtns = AVATARS.map((av) => {
      const btn = this.add.text(0, 0, av, {
        fontSize: '28px', padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => this.game.net.send('select_avatar', { avatar: av }));
      container.add(btn);
      return { btn, av };
    });
    container._avatarBtns = avatarBtns;

    // Start / Restart buttons
    const startBtn = this.add.text(0, 0, '▶  Play', {
      fontFamily: 'monospace', fontSize: '26px', color: '#1a1a2e',
      backgroundColor: '#44cc77', padding: { x: 24, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    startBtn.on('pointerdown', () => this.game.net.send('resume'));
    startBtn.on('pointerover', () => startBtn.setBackgroundColor('#55ee88'));
    startBtn.on('pointerout',  () => startBtn.setBackgroundColor('#44cc77'));
    container.add(startBtn);
    container._startBtn = startBtn;

    const restartBtn = this.add.text(0, 0, '↺  Restart Level', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff',
      backgroundColor: '#333355', padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    restartBtn.on('pointerdown', () => this.game.net.send('restart'));
    restartBtn.on('pointerover', () => restartBtn.setBackgroundColor('#444477'));
    restartBtn.on('pointerout',  () => restartBtn.setBackgroundColor('#333355'));
    container.add(restartBtn);
    container._restartBtn = restartBtn;

    return container;
  }

  _layoutSetupOverlay(state) {
    const { W, H } = this._getLayout();
    const cx = W / 2;
    const ov = this._setupOverlay;

    ov._backdrop.setSize(W, H);

    const panelW = Math.min(W - 40, 380);
    const panelH = Math.min(H - 40, 560);
    ov._panel.setPosition(cx, H / 2).setSize(panelW, panelH);

    let y = H / 2 - panelH / 2 + 34;
    ov._title.setPosition(cx, y); y += 44;
    ov._levelLabel.setPosition(cx, y); y += 26;

    const currentLevel = state?.levelIndex ?? 0;
    (ov._levelBtns ?? []).forEach((btn, i) => {
      btn.setPosition(cx, y);
      btn.setText(`Level ${i + 1}: ${LEVEL_DESCS[i]}`);
      btn.setBackgroundColor(i === currentLevel ? '#4488ff' : '#e2e8f0');
      btn.setColor(i === currentLevel ? '#ffffff' : '#1a1a2e');
      y += 34;
    });

    y += 6;
    ov._avatarLabel.setPosition(cx, y); y += 26;

    const myAvatar = state?.players?.[this.game.net.playerId]?.avatar;
    const avSpacing = 36;
    const avTotalW = AVATARS.length * avSpacing;
    (ov._avatarBtns ?? []).forEach(({ btn, av }, i) => {
      const ax = cx - avTotalW / 2 + i * avSpacing + avSpacing / 2;
      btn.setPosition(ax, y);
      btn.setAlpha(av === myAvatar ? 1 : 0.4);
    });
    y += 42;

    ov._startBtn.setPosition(cx, y);
    ov._startBtn.setText(state?.reasonPaused === 'start' ? '▶  Play' : '▶  Resume');
    y += 52;
    ov._restartBtn.setPosition(cx, y);
  }

  // ─── Celebration overlay ───────────────────────────────────────────────────

  _createCelebrationOverlay() {
    const container = this.add.container(0, 0);
    container.setVisible(false);

    const backdrop = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.7).setOrigin(0);
    container.add(backdrop);
    container._backdrop = backdrop;

    const bigEmoji = this.add.text(0, 0, '🎉', { fontSize: '80px' }).setOrigin(0.5);
    container.add(bigEmoji);
    container._bigEmoji = bigEmoji;

    const title = this.add.text(0, 0, 'Amazing!', {
      fontFamily: 'monospace', fontSize: '42px', color: '#ffd24d', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add(title);
    container._title = title;

    const sub = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '20px', color: '#e0e0f0',
    }).setOrigin(0.5);
    container.add(sub);
    container._sub = sub;

    const nextBtn = this.add.text(0, 0, 'Next Level →', {
      fontFamily: 'monospace', fontSize: '26px', color: '#1a1a2e',
      backgroundColor: '#ffd24d', padding: { x: 24, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    nextBtn.on('pointerdown', () => this.game.net.send('next_level'));
    nextBtn.on('pointerover', () => nextBtn.setBackgroundColor('#ffe066'));
    nextBtn.on('pointerout',  () => nextBtn.setBackgroundColor('#ffd24d'));
    container.add(nextBtn);
    container._nextBtn = nextBtn;

    return container;
  }

  _layoutCelebrationOverlay(state) {
    const { W, H } = this._getLayout();
    const cx = W / 2;
    const cy = H / 2;
    const ov = this._celebOverlay;

    ov._backdrop.setSize(W, H);
    ov._bigEmoji.setPosition(cx, cy - 120);
    ov._title.setPosition(cx, cy - 40);
    ov._sub.setPosition(cx, cy + 20);
    ov._sub.setText(`You finished Level ${(state?.levelIndex ?? 0) + 1}!\n${state?.wordsCompleted ?? 0} words done 🌟`);
    ov._nextBtn.setPosition(cx, cy + 90);
  }

  // ─── Confetti ──────────────────────────────────────────────────────────────

  _spawnConfetti() {
    const { W } = this._getLayout();
    const colors = [0xffd24d, 0x44cc77, 0x4d96ff, 0xff6b6b, 0xffffff, 0xcc44ff];
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * W;
      const g = this.add.rectangle(x, -10, 8, 14, colors[Math.floor(Math.random() * colors.length)]);
      g.setRotation(Math.random() * Math.PI * 2);
      const vy = 120 + Math.random() * 200;
      const vx = (Math.random() - 0.5) * 100;
      const vr = (Math.random() - 0.5) * 5;
      this._confettiPieces.push({ g, vx, vy, vr });
    }
    // Auto-clean after 4 seconds
    this.time.delayedCall(4000, () => {
      for (const p of this._confettiPieces) p.g.destroy();
      this._confettiPieces = [];
    });
  }

  _updateConfetti(delta) {
    const dt = delta / 1000;
    const { H } = this._getLayout();
    for (const p of this._confettiPieces) {
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.g.setRotation(p.g.rotation + p.vr * dt);
      if (p.g.y > H + 20) p.g.y = -10;
    }
  }

  // ─── State change handler ──────────────────────────────────────────────────

  _onState(state) {
    const prev = this._prevState;

    // Correct answer — play sound and freeze display on the completed word
    if (prev && !state.celebrating && prev.wordsCompleted !== state.wordsCompleted) {
      const pid = state.lastTypedBy ?? 1;
      const colorInt = PLAYER_COLORS_INT[pid] ?? 0x44ff88;
      // Freeze: keep showing the *previous* word (fully revealed, all green) for 900ms
      this._correctFreeze = {
        word: prev.currentWord,
        emoji: prev.currentEmoji,
        missingIndex: prev.missingIndex,
      };
      this._correctFreezeUntil = performance.now() + 900;
      this.time.delayedCall(900, () => { this._correctFreeze = null; });
      this._flashKey((prev.currentWord?.[prev.missingIndex] ?? '').toUpperCase(), colorInt);
      this._playTriumph();
      this._playVisualCelebration();
    }

    // Wrong answer — flash word red
    if (prev && state.wrongAttempts > (prev.wrongAttempts ?? 0)) {
      this._flashWord('#ff4444');
    }

    // Celebration started
    if (!prev?.celebrating && state.celebrating) {
      this._spawnConfetti();
    }

    this._prevState = state;
  }

  _flashWord(color) {
    if (!this._flashTween) {
      this._flashTween = null;
    }
    // Tween: flash all letter texts to color then back
    for (const t of this._letterPool) {
      if (!t.text) continue;
      t.setColor(color);
    }
    this.time.delayedCall(350, () => {
      for (const t of this._letterPool) {
        if (!t.text) continue;
        t.setColor('#e0e0f0');
      }
    });
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  update(_time, delta) {
    const net = this.game.net;
    const state = net.latestState;
    if (!state) return;

    const showSetup = Boolean(state.paused);
    const showCelebration = Boolean(state.celebrating);

    // Resize-sensitive redraws
    this._drawBackground();
    this._updateHUD(state);
    this._updateProgress(state);

    if (!showSetup && !showCelebration) {
      if (this._correctFreeze) {
        // Show the just-completed word fully revealed in green
        this._updateWordDisplayForFreeze(this._correctFreeze);
      } else {
        this._updateWordDisplay(state, null);
      }
    }

    // Setup overlay
    this._setupOverlay.setVisible(showSetup);
    if (showSetup) this._layoutSetupOverlay(state);

    // Celebration overlay
    this._celebOverlay.setVisible(showCelebration);
    if (showCelebration) this._layoutCelebrationOverlay(state);

    // Confetti
    this._updateConfetti(delta);
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  shutdown() {
    const net = this.game.net;
    if (this._stateListener) net.removeEventListener('state', this._stateListener);
  }
}
