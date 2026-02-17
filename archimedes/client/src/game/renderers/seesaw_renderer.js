/**
 * Archimedes — Module 2: Seesaw Lab
 * Client-side renderer for PlayScene.
 *
 * Exports the renderer interface expected by PlayScene dispatcher:
 *   { create, renderState, onPointerDown, onPointerUp, destroy }
 */

import Phaser from 'phaser';

// ── Renderer state (per-scene instance) ──────────────────────────────────────

const sceneData = new WeakMap();

function getData(scene) {
  let d = sceneData.get(scene);
  if (!d) {
    d = {
      objectTexts: new Map(),
      uiCreated: false,
      shoreLabels: null,
      // UI elements
      levelTitle: null,
      progressText: null,
      loadText: null,
      msgText: null,
      doorText: null,
      resetBtn: null,
      lvlBtn: null,
      pivotGlow: null,
      // Drag tracking
      draggingPivot: false,
    };
    sceneData.set(scene, d);
  }
  return d;
}

// ── Coordinate helpers ───────────────────────────────────────────────────────

function sx(scene, x) { return scene.sx(x); }
function sy(scene, y) { return scene.sy(y); }

// ── Create ───────────────────────────────────────────────────────────────────

export function create(scene) {
  getData(scene);
}

// ── Render ───────────────────────────────────────────────────────────────────

export function renderState(scene, state) {
  const g = scene.graphics;
  const d = getData(scene);

  ensureUI(scene, d);

  // Clean up stale object text caches
  const currentIds = new Set(state.objects.map(o => o.id));
  for (const [id, cached] of d.objectTexts) {
    if (!currentIds.has(id)) {
      cached.emoji.destroy();
      cached.mass.destroy();
      d.objectTexts.delete(id);
    }
  }

  const W = scene.scale.width;
  const H = scene.scale.height;
  const beam = state.beam;
  if (!beam) return;

  // ── 1. Sky gradient ────────────────────────────────────────────────────
  const groundScreenY = sy(scene, state.groundY);

  // Level 5: parallax sky shift
  const scroll = state.worldScroll || 0;
  const skyBlue = scroll > 0
    ? lerpColor(0x87ceeb, 0x4a90d9, Math.min(1, scroll / 200))
    : 0x87ceeb;
  g.fillStyle(skyBlue);
  g.fillRect(0, 0, W, groundScreenY);

  // Level 5: clouds
  if (state.level === 5 && scroll > 0) {
    drawClouds(scene, scroll);
  }

  // ── 2. Ground strip ────────────────────────────────────────────────────
  g.fillStyle(0x8b6914);
  g.fillRect(0, groundScreenY, W, H - groundScreenY);
  g.fillStyle(0x228b22);
  g.fillRect(0, groundScreenY, W, 6);

  // ── 3. Palette area ────────────────────────────────────────────────────
  const paletteY = sy(scene, 440);
  g.fillStyle(0x2c3e50, 0.3);
  g.fillRect(0, paletteY, W, H - paletteY);
  g.lineStyle(1, 0x7f8c8d, 0.5);
  g.lineBetween(0, paletteY, W, paletteY);

  // ── 4. Pivot triangle ─────────────────────────────────────────────────
  const pivX = sx(scene, beam.pivotX);
  const pivY = sy(scene, beam.pivotY);
  const triSize = 20;

  const pivotColor = beam.pivotDraggable ? 0xf1c40f : 0x7f8c8d;
  g.fillStyle(pivotColor);
  g.beginPath();
  g.moveTo(pivX, pivY);
  g.lineTo(pivX - triSize, groundScreenY);
  g.lineTo(pivX + triSize, groundScreenY);
  g.closePath();
  g.fillPath();

  // Pulsing outline if draggable
  if (beam.pivotDraggable) {
    const pulse = 0.5 + 0.5 * Math.sin((scene.time?.now || Date.now()) / 300);
    g.lineStyle(3, 0xf39c12, pulse);
    g.beginPath();
    g.moveTo(pivX, pivY);
    g.lineTo(pivX - triSize, groundScreenY);
    g.lineTo(pivX + triSize, groundScreenY);
    g.closePath();
    g.strokePath();
  }

  // ── 5. Beam ────────────────────────────────────────────────────────────
  drawBeam(scene, state);

  // ── 6. Baskets ─────────────────────────────────────────────────────────
  if (state.baskets && state.baskets.enabled) {
    drawBaskets(scene, state);
  }

  // ── 7. Objects on beam ─────────────────────────────────────────────────
  for (const obj of state.objects) {
    if (obj.onBeam && !obj.claimedBy) {
      drawObject(scene, d, obj);
    }
  }

  // ── 8. Archimedes character ────────────────────────────────────────────
  if (state.archimedes) {
    drawArchimedes(scene, d, state);
  }

  // ── 9. Confetti ────────────────────────────────────────────────────────
  if (state.confetti) {
    drawConfetti(scene, state);
  }

  // ── 11. Objects in palette / not on beam ────────────────────────────────
  for (const obj of state.objects) {
    if (!obj.onBeam && !obj.claimedBy) {
      drawObject(scene, d, obj);
    }
  }

  // ── 12. Objects being dragged ──────────────────────────────────────────
  for (const obj of state.objects) {
    if (obj.claimedBy) {
      drawObject(scene, d, obj);
    }
  }

  // ── 14. UI updates ─────────────────────────────────────────────────────
  updateUI(scene, d, state);
}

// ── Beam drawing ─────────────────────────────────────────────────────────────

function drawBeam(scene, state) {
  const g = scene.graphics;
  const beam = state.beam;
  const pivX = sx(scene, beam.pivotX);
  const pivY = sy(scene, beam.pivotY);
  const halfLen = beam.length / 2;
  const scaleX = sx(scene, 1) - sx(scene, 0) || 1;

  g.save();
  g.translateCanvas(pivX, pivY);
  g.rotateCanvas(beam.angle);

  // Wood-brown beam rectangle
  const beamH = 12;
  const beamW = halfLen * 2 * scaleX;
  g.fillStyle(0xa0522d);
  g.fillRect(-beamW / 2, -beamH / 2, beamW, beamH);
  g.lineStyle(2, 0x5d4037);
  g.strokeRect(-beamW / 2, -beamH / 2, beamW, beamH);

  // Tick marks every 50px
  g.lineStyle(1, 0x5d4037, 0.6);
  for (let t = -halfLen; t <= halfLen; t += 50) {
    const tx = t * scaleX;
    g.lineBetween(tx, -beamH / 2, tx, beamH / 2);
  }

  // Center mark (pivot point)
  g.lineStyle(2, 0xe74c3c, 0.8);
  g.lineBetween(0, -beamH / 2 - 3, 0, beamH / 2 + 3);

  g.restore();
}

// ── Basket drawing ───────────────────────────────────────────────────────────

function drawBaskets(scene, state) {
  const g = scene.graphics;
  const beam = state.beam;

  const positions = [
    { pos: state.baskets.left.pos, label: 'L' },
    { pos: state.baskets.right.pos, label: 'R' },
  ];

  for (const basket of positions) {
    const worldX = beam.pivotX + basket.pos * beam.length;
    const dx = worldX - beam.pivotX;
    const worldY = beam.pivotY + Math.sin(beam.angle) * dx;

    const bx = sx(scene, worldX);
    const by = sy(scene, worldY);
    const bw = 40;
    const bh = 35;

    // Rotate basket with beam
    g.save();
    g.translateCanvas(bx, by);
    g.rotateCanvas(beam.angle);

    // U-shape basket
    g.lineStyle(3, 0x8b4513);
    g.beginPath();
    g.moveTo(-bw / 2, -5);
    g.lineTo(-bw / 2, bh);
    g.lineTo(bw / 2, bh);
    g.lineTo(bw / 2, -5);
    g.strokePath();

    // Semi-transparent fill
    g.fillStyle(0xd2b48c, 0.3);
    g.fillRect(-bw / 2, -5, bw, bh + 5);

    g.restore();
  }
}

// ── Archimedes character ─────────────────────────────────────────────────────

function drawArchimedes(scene, d, state) {
  const g = scene.graphics;
  const arch = state.archimedes;
  const beam = state.beam;

  const worldX = beam.pivotX + arch.beamPosition * beam.length;
  const dx = worldX - beam.pivotX;
  const worldY = beam.pivotY + Math.sin(beam.angle) * dx - arch.size * 0.5;

  const ax = sx(scene, worldX);
  const ay = sy(scene, worldY);
  const r = arch.size * 0.5 * (scene.scale.width / 800);

  // Circle body
  g.fillStyle(0x8e44ad, 0.85);
  g.fillCircle(ax, ay, r);
  g.lineStyle(3, 0x6c3483);
  g.strokeCircle(ax, ay, r);

  // Emoji + label text
  const key = 'archimedes_char';
  let cached = d.objectTexts.get(key);
  if (!cached) {
    const emoji = scene.add.text(ax, ay, '👴', {
      fontSize: `${Math.floor(r * 1.6)}px`,
    }).setOrigin(0.5).setDepth(120);
    const mass = scene.add.text(ax, ay + r + 10, `${arch.mass}`, {
      fontSize: '13px', color: '#fff', fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setDepth(121);
    cached = { emoji, mass };
    d.objectTexts.set(key, cached);
  }
  cached.emoji.setPosition(ax, ay);
  cached.mass.setPosition(ax, ay + r + 10);
  cached.mass.setText(`${arch.mass}`);
}

// ── Object drawing ───────────────────────────────────────────────────────────

function drawObject(scene, d, obj) {
  const g = scene.graphics;
  const x = sx(scene, obj.x);
  const y = sy(scene, obj.y);
  const r = obj.size * 0.4 * (scene.scale.width / 800);

  // Claim highlight
  if (obj.claimedBy) {
    g.lineStyle(3, 0xf1c40f);
    g.strokeCircle(x, y, r + 5);
  }

  const color = Phaser.Display.Color.HexStringToColor(obj.color).color;
  g.fillStyle(color, 0.85);
  g.fillCircle(x, y, r);
  g.lineStyle(2, 0x333333, 0.5);
  g.strokeCircle(x, y, r);

  let cached = d.objectTexts.get(obj.id);
  if (!cached) {
    const fontSize = Math.max(16, Math.floor(r * 1.5));
    const emoji = scene.add.text(x, y, obj.emoji, {
      fontSize: `${fontSize}px`,
    }).setOrigin(0.5).setDepth(120);
    const mass = scene.add.text(x, y + r + 8, `${obj.mass}`, {
      fontSize: '13px', color: '#fff', fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setDepth(121);
    cached = { emoji, mass };
    d.objectTexts.set(obj.id, cached);
  }
  cached.emoji.setPosition(x, y);
  cached.mass.setPosition(x, y + r + 10);
  cached.mass.setText(`${obj.mass}`);
}

// ── Confetti ─────────────────────────────────────────────────────────────────

function drawConfetti(scene, state) {
  const g = scene.graphics;
  const c = state.confetti;
  const now = scene.time?.now || Date.now();
  const elapsed = now - c.startTime;
  if (elapsed > 2000) return;

  const progress = elapsed / 2000;
  const cx = sx(scene, c.x);
  const cy = sy(scene, c.y);
  const colors = [0xe74c3c, 0xf1c40f, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe67e22];

  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2 + progress * 3;
    const dist = progress * 120 + (i % 3) * 20;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist - (1 - progress) * 40 + progress * 60;
    const alpha = Math.max(0, 1 - progress);
    const size = 4 + (i % 3) * 2;

    g.fillStyle(colors[i % colors.length], alpha);
    g.fillRect(px - size / 2, py - size / 2, size, size);
  }
}

// ── Clouds (level 5) ─────────────────────────────────────────────────────────

function drawClouds(scene, scroll) {
  const g = scene.graphics;
  const W = scene.scale.width;
  const now = scene.time?.now || Date.now();

  g.fillStyle(0xffffff, 0.4);
  for (let i = 0; i < 5; i++) {
    const baseX = (i * 180 + 50 - scroll * (0.3 + i * 0.05) + now * 0.005) % (W + 100) - 50;
    const baseY = 30 + i * 25;
    g.fillEllipse(baseX, baseY, 60 + i * 10, 20 + i * 3);
    g.fillEllipse(baseX + 30, baseY - 5, 40, 15);
  }
}

// ── Color lerp helper ────────────────────────────────────────────────────────

function lerpColor(c1, c2, t) {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  const r = Math.round(r1 + (r2 - r1) * t);
  const gr = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return (r << 16) | (gr << 8) | b;
}

// ── UI ───────────────────────────────────────────────────────────────────────

function ensureUI(scene, d) {
  if (d.uiCreated) return;
  d.uiCreated = true;

  const W = scene.scale.width;
  const H = scene.scale.height;

  d.levelTitle = scene.add.text(12, 10, '', {
    fontSize: '18px', color: '#1a5276', fontStyle: 'bold',
  }).setDepth(200);

  d.progressText = scene.add.text(12, 34, '', {
    fontSize: '13px', color: '#555',
  }).setDepth(200);

  d.loadText = scene.add.text(12, 52, '', {
    fontSize: '13px', color: '#555',
  }).setDepth(200);

  d.msgText = scene.add.text(W / 2, 14, '', {
    fontSize: '16px', color: '#2c3e50', backgroundColor: '#ecf0f1',
    padding: { x: 10, y: 4 },
  }).setOrigin(0.5, 0).setDepth(200).setVisible(false);

  d.doorText = scene.add.text(W - 16, 10, '🚪', {
    fontSize: '48px',
  }).setOrigin(1, 0).setDepth(200).setInteractive({ useHandCursor: true });
  d.doorText.on('pointerdown', () => scene.game.net.sendInput('door_click'));

  const btnY = H - 32;

  d.resetBtn = scene.add.text(W - 50, btnY, '🔄', {
    fontSize: '26px', color: '#fff', backgroundColor: '#e74c3c',
    padding: { x: 12, y: 8 },
  }).setOrigin(0.5).setDepth(200).setInteractive({ useHandCursor: true });
  d.resetBtn.on('pointerdown', () => scene.game.net.sendInput('reset'));

  d.lvlBtn = scene.add.text(16, btnY, '📋', {
    fontSize: '22px', color: '#fff', backgroundColor: '#9b59b6',
    padding: { x: 10, y: 6 },
  }).setOrigin(0, 0.5).setDepth(200).setInteractive({ useHandCursor: true });
  d.lvlBtn.on('pointerdown', () => scene.game.net.sendInput('toggle_level_select'));
}

function updateUI(scene, d, state) {
  d.levelTitle.setText(state.levelName || `Level ${state.level}`);

  const bal = state.balance || {};
  const progress = bal.totalBalances || 0;
  const target = state.doorTarget || 1;
  const doorProg = state.doorProgress || 0;

  d.progressText.setText(
    `Room: ${scene.game.net.roomId || '----'}  |  Balance: ${doorProg}/${target}`
  );

  // Show angle info
  const beam = state.beam;
  if (beam) {
    const angleDeg = Math.round((beam.angle || 0) * 180 / Math.PI * 10) / 10;
    const tiltDir = angleDeg > 0.5 ? '→' : angleDeg < -0.5 ? '←' : '⚖️';
    d.loadText.setText(`Tilt: ${angleDeg}° ${tiltDir}`);
    const absAngle = Math.abs(angleDeg);
    d.loadText.setColor(absAngle > 10 ? '#e74c3c' : absAngle > 3 ? '#f39c12' : '#27ae60');
  }

  if (state.message) {
    d.msgText.setText(state.message).setVisible(true);
  } else {
    d.msgText.setVisible(false);
  }

  d.doorText.setText(state.doorOpen ? '🚪✨' : '🚪');
  d.doorText.setColor(state.doorOpen ? '#27ae60' : '#888');
  d.doorText.setFontSize(state.doorOpen ? '56px' : '48px');
}

// ── Input handlers ───────────────────────────────────────────────────────────

export function onPointerDown(scene, pointer, state) {
  if (!state || state.gamePaused || state.showLevelSelect) return;
  if (state.paused) return;

  const gx = scene.ux(pointer.x);
  const gy = scene.uy(pointer.y);
  const d = getData(scene);
  const beam = state.beam;

  // 1. Check if pointer is near pivot and pivot is draggable
  if (beam && beam.pivotDraggable) {
    const dist = Math.hypot(gx - beam.pivotX, gy - beam.pivotY);
    if (dist < 50) {
      scene.game.net.sendInput('grab_pivot');
      d.draggingPivot = true;
      return;
    }
  }

  // 2. Find nearest unclaimed object
  let best = null;
  let bestDist = Infinity;
  for (const obj of state.objects) {
    if (obj.claimedBy) continue;
    const dist = Math.hypot(obj.x - gx, obj.y - gy);
    if (dist < obj.size * 1.1 && dist < bestDist) {
      best = obj;
      bestDist = dist;
    }
  }
  if (best) {
    scene.game.net.sendInput('grab', { objectId: best.id });
    scene.draggedObjectId = best.id;
  }
}

export function onPointerUp(scene) {
  const d = getData(scene);

  if (d.draggingPivot) {
    scene.game.net.sendInput('release_pivot');
    d.draggingPivot = false;
    return;
  }

  if (scene.draggedObjectId) {
    scene.game.net.sendInput('release');
    scene.draggedObjectId = null;
  }
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

export function destroy(scene) {
  const d = sceneData.get(scene);
  if (!d) return;

  for (const [, cached] of d.objectTexts) {
    cached.emoji.destroy();
    cached.mass.destroy();
  }
  d.objectTexts.clear();

  const uiKeys = ['levelTitle', 'progressText', 'loadText', 'msgText', 'doorText', 'resetBtn', 'lvlBtn'];
  for (const key of uiKeys) {
    if (d[key]) { d[key].destroy(); d[key] = null; }
  }

  sceneData.delete(scene);
}
