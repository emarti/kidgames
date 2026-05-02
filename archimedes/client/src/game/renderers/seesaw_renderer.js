/**
 * Archimedes — Module 2: Seesaw Lab
 * Client-side renderer for PlayScene.
 *
 * Exports the renderer interface expected by PlayScene dispatcher:
 *   { create, renderState, onPointerDown, onPointerUp, destroy }
 */

import Phaser from 'phaser';
import {
  createCommonUI,
  updateDoorButton,
  cleanupObjectTexts,
  drawObjectEmojiCached,
  drawObjectWithDepth,
  destroyCommonUI,
  updateConfetti,
  drawConfetti,
  shouldHandlePointer,
  drawSkyGradient,
  drawGround,
  drawClouds as drawStaticClouds,
  drawHills,
  lerpColor,
  drawCompletionBanner,
  hideCompletionBanner,
  FONT_BODY,
  FONT_MASS,
} from './renderer_utils.js';

// ── Renderer state (per-scene instance) ──────────────────────────────────────

const sceneData = new WeakMap();

function getData(scene) {
  let d = sceneData.get(scene);
  if (!d) {
    d = {
      objectTexts: new Map(),
      uiCreated: false,
      confettiSeenAt: null,
      // UI elements
      levelTitle: null,
      progressText: null,
      loadText: null,
      msgText: null,
      doorText: null,
      resetBtn: null,
      lvlBtn: null,
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
function beamSpan(beam) {
  if (!beam) return 500;
  if (Number.isFinite(beam.span)) return beam.span;
  if (Number.isFinite(beam.leftArm) && Number.isFinite(beam.rightArm)) {
    return beam.leftArm + beam.rightArm;
  }
  if (Number.isFinite(beam.length)) return beam.length;
  return 500;
}
function beamLeftArm(beam) {
  if (Number.isFinite(beam?.leftArm)) return beam.leftArm;
  return beamSpan(beam) * 0.5;
}
function beamRightArm(beam) {
  if (Number.isFinite(beam?.rightArm)) return beam.rightArm;
  return beamSpan(beam) * 0.5;
}
function beamWorldPoint(beam, bp) {
  const span = beamSpan(beam);
  const t = bp * span;
  const c = Math.cos(beam.angle || 0);
  const s = Math.sin(beam.angle || 0);
  return {
    x: (beam.pivotX || 0) + t * c,
    y: (beam.pivotY || 0) + t * s,
  };
}

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
  cleanupObjectTexts(d.objectTexts, state.objects);

  const W = scene.scale.width;
  const H = scene.scale.height;
  const beam = state.beam;
  if (!beam) return;

  // ── 1. Sky gradient ────────────────────────────────────────────────────
  const groundScreenY = sy(scene, state.groundY);

  // Finale: parallax sky shift
  const scroll = state.worldScroll || 0;
  const skyTop = scroll > 0
    ? lerpColor(0x5ba3d9, 0x3a6fb5, Math.min(1, scroll / 200))
    : 0x5ba3d9;
  const skyBottom = scroll > 0
    ? lerpColor(0xb4daf7, 0x7ab8e8, Math.min(1, scroll / 200))
    : 0xb4daf7;
  drawSkyGradient(g, W, groundScreenY, skyTop, skyBottom);

  // Clouds
  const now = scene.time?.now || 0;
  drawStaticClouds(g, W, now, 0.45);

  // Hills behind the ground
  drawHills(g, W, groundScreenY);

  // Finale animated clouds
  if (state.level === 6 && scroll > 0) {
    drawFinaleClouds(scene, scroll);
  }

  // ── 2. Ground strip ────────────────────────────────────────────────────
  drawGround(g, W, H, groundScreenY);

  // ── 3. Palette area ────────────────────────────────────────────────────
  const paletteY = sy(scene, (state.groundY || 430) + 10);
  // Wooden shelf background
  g.fillStyle(0x3e2f1c, 0.55);
  g.fillRect(0, paletteY, W, H - paletteY);
  // Top shelf edge
  g.fillStyle(0x6b4e2a);
  g.fillRect(0, paletteY, W, 4);
  g.fillStyle(0x8b6b3d, 0.6);
  g.fillRect(0, paletteY + 4, W, 2);
  // "ITEMS" label
  g.fillStyle(0xffffff, 0.4);
  // (label rendered once via ensureUI)

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

  if (state.pivotHintTicks > 0 && beam.pivotDraggable) {
    drawPivotHint(scene, state);
  }

  // ── 5. Beam ────────────────────────────────────────────────────────────
  drawBeam(scene, state);

  // Balance glow on beam
  const bal = state.balance || {};
  if (bal.balancedTicks >= 20 && !bal.wasUnbalanced) {
    const pivXb = sx(scene, beam.pivotX);
    const pivYb = sy(scene, beam.pivotY);
    const leftArm = beamLeftArm(beam);
    const rightArm = beamRightArm(beam);
    const scaleXb = (sx(scene, 1) - sx(scene, 0)) || 1;
    const beamLen = (leftArm + rightArm) * scaleXb;
    const pulse = 0.4 + 0.3 * Math.sin((scene.time?.now || 0) / 200);
    g.save();
    g.translateCanvas(pivXb, pivYb);
    g.rotateCanvas(beam.angle);
    g.lineStyle(6, 0x27ae60, pulse);
    g.strokeRect(-leftArm * scaleXb, -10, beamLen, 20);
    g.restore();
  }

  // ── 6. Baskets ─────────────────────────────────────────────────────────
  if (state.baskets && state.baskets.enabled) {
    drawBaskets(scene, state);
  }

  // ── 7. Objects on beam ─────────────────────────────────────────────────
  for (const obj of state.objects) {
    if (obj.onBeam && !obj.claimedBy) {
      drawObject(scene, d, obj, beam);
    }
  }

  // ── 8. Archimedes character ────────────────────────────────────────────
  if (state.archimedes) {
    drawArchimedes(scene, d, state);
  }

  // ── 9. Confetti ────────────────────────────────────────────────────────
  updateConfetti(scene, d, state);
  drawConfetti(scene, d, state);

  // "BALANCED!" text burst
  if (state.confetti && d.confettiSeenAt != null) {
    const elapsed = (scene.time?.now || 0) - d.confettiSeenAt;
    if (elapsed < 1500) {
      const alpha = Math.max(0, 1 - elapsed / 1500);
      const rise = elapsed * 0.02;
      const cx = sx(scene, state.confetti.x);
      const cy = sy(scene, state.confetti.y) - 80 - rise;
      if (!d._balancedText) {
        d._balancedText = scene.add.text(cx, cy, '⚖️ BALANCED!', {
          fontSize: '28px', color: '#27ae60', fontStyle: 'bold',
          stroke: '#fff', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(300);
      }
      d._balancedText.setPosition(cx, cy).setAlpha(alpha).setVisible(true);
    }
  } else if (d._balancedText) {
    d._balancedText.setVisible(false);
  }

  // ── 11. Objects in palette / not on beam ────────────────────────────────
  for (const obj of state.objects) {
    if (!obj.onBeam && !obj.claimedBy) {
      drawObject(scene, d, obj, beam);
    }
  }

  // ── 12. Objects being dragged ──────────────────────────────────────────
  for (const obj of state.objects) {
    if (obj.claimedBy) {
      drawObject(scene, d, obj, beam);
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
  const leftArm = beamLeftArm(beam);
  const rightArm = beamRightArm(beam);
  const scaleX = sx(scene, 1) - sx(scene, 0) || 1;

  g.save();
  g.translateCanvas(pivX, pivY);
  g.rotateCanvas(beam.angle);

  // Wood-brown beam rectangle
  const beamH = 12;
  const beamW = (leftArm + rightArm) * scaleX;
  const leftPx = -leftArm * scaleX;
  g.fillStyle(0xa0522d);
  g.fillRect(leftPx, -beamH / 2, beamW, beamH);
  g.lineStyle(2, 0x5d4037);
  g.strokeRect(leftPx, -beamH / 2, beamW, beamH);

  // Tick marks every 50px
  g.lineStyle(1, 0x5d4037, 0.6);
  for (let t = -leftArm; t <= rightArm; t += 50) {
    const tx = t * scaleX;
    g.lineBetween(tx, -beamH / 2, tx, beamH / 2);
  }

  // Center mark (pivot point)
  g.lineStyle(2, 0xe74c3c, 0.8);
  g.lineBetween(0, -beamH / 2 - 3, 0, beamH / 2 + 3);

  g.restore();
}

function drawPivotHint(scene, state) {
  const g = scene.graphics;
  const beam = state.beam;
  if (!beam) return;

  const pivX = sx(scene, beam.pivotX);
  const pivY = sy(scene, beam.pivotY);
  const bob = Math.sin((scene.time?.now || Date.now()) / 180) * 6;
  const topY = pivY - 136 + bob;
  const shaftBottom = pivY - 46;

  g.lineStyle(6, 0xf1c40f, 0.95);
  g.lineBetween(pivX, topY, pivX, shaftBottom);

  g.fillStyle(0xf1c40f, 0.95);
  g.beginPath();
  g.moveTo(pivX, pivY - 28);
  g.lineTo(pivX - 22, shaftBottom);
  g.lineTo(pivX + 22, shaftBottom);
  g.closePath();
  g.fillPath();

  g.fillStyle(0xffffff, 0.95);
  g.fillCircle(pivX, topY - 18, 16);
  g.lineStyle(2, 0xf39c12, 0.95);
  g.strokeCircle(pivX, topY - 18, 16);
}

// ── Basket drawing ───────────────────────────────────────────────────────────

function drawBaskets(scene, state) {
  const g = scene.graphics;
  const beam = state.beam;
  const yScale = Math.abs(sy(scene, 1) - sy(scene, 0)) || 1;
  const hangerPx = Math.max(20, 36 * yScale);
  const basketHPx = Math.max(34, 44 * yScale);

  // Build basket position list — support multiple left slots or single left basket
  const positions = [];
  if (state.baskets.leftSlots) {
    state.baskets.leftSlots.forEach((slot, i) => {
      positions.push({ side: `slot${i}`, pos: slot.pos, slotIndex: i });
    });
  } else if (state.baskets.left) {
    positions.push({ side: 'left', pos: state.baskets.left.pos, label: 'L' });
  }
  positions.push({ side: 'right', pos: state.baskets.right.pos, label: 'R' });

  const basketCounts = {};
  for (const p of positions) basketCounts[p.side] = 0;
  for (const obj of state.objects || []) {
    if (obj.onBeam && obj.inBasket && basketCounts[obj.inBasket] !== undefined) {
      basketCounts[obj.inBasket]++;
    }
  }

  // Must match drawBeam's beamH / 2 (beam is 12px tall in screen space).
  const BEAM_HALF_H = 6;
  const angle = beam.angle || 0;
  const scaleX = (sx(scene, 1) - sx(scene, 0)) || 1;
  const pivX = sx(scene, beam.pivotX);
  const pivY = sy(scene, beam.pivotY);

  for (const basket of positions) {
    // Screen-space beam transform — matches drawBeam's rotateCanvas approach
    const beamT = basket.pos * beamSpan(beam) * scaleX;
    const axisX = pivX + beamT * Math.cos(angle);
    const axisY = pivY + beamT * Math.sin(angle);

    // Offset to the bottom surface of the beam: perpendicular "below" the
    // tilted beam is the direction (-sin θ, +cos θ) in screen coordinates.
    const hangerX = axisX - BEAM_HALF_H * Math.sin(angle);
    const hangerY = axisY + BEAM_HALF_H * Math.cos(angle);

    const basketTopY = hangerY + hangerPx;
    const bw = Math.max(66, 56 + (basketCounts[basket.side] || 0) * 18);
    const left = hangerX - bw / 2;
    const right = hangerX + bw / 2;
    const bottom = basketTopY + basketHPx;

    // Slot baskets: distinct tint (blue gradient by distance)
    const isSlot = basket.side.startsWith('slot');
    const slotColors = [0x3498db, 0x27ae60, 0xe67e22]; // near→far: blue, green, orange
    const basketStroke = isSlot ? slotColors[basket.slotIndex % slotColors.length] : 0x8b4513;
    const basketFill = isSlot ? slotColors[basket.slotIndex % slotColors.length] : 0xd2b48c;

    // Hanger from beam bottom surface.
    g.lineStyle(3, 0x5d4037, 0.9);
    g.lineBetween(hangerX, hangerY, hangerX, basketTopY);
    g.fillStyle(0x5d4037, 0.95);
    g.fillCircle(hangerX, hangerY, 3);

    // Upright U-shape basket.
    g.lineStyle(3, basketStroke);
    g.beginPath();
    g.moveTo(left, basketTopY);
    g.lineTo(left, bottom);
    g.lineTo(right, bottom);
    g.lineTo(right, basketTopY);
    g.strokePath();

    // Semi-transparent basket body.
    g.fillStyle(basketFill, isSlot ? 0.15 : 0.3);
    g.fillRect(left, basketTopY, bw, basketHPx);

    // Pip dots below basket: 1 pip = nearest, 3 pips = farthest from pivot
    if (isSlot) {
      const pips = basket.slotIndex + 1;
      const pipR = 5;
      const pipSpacing = 13;
      const totalW = (pips - 1) * pipSpacing;
      g.fillStyle(basketStroke, 0.9);
      for (let pi = 0; pi < pips; pi++) {
        g.fillCircle(hangerX - totalW / 2 + pi * pipSpacing, bottom + 14, pipR);
      }
    }
  }
}

// ── Archimedes character ─────────────────────────────────────────────────────

function drawArchimedes(scene, d, state) {
  const g = scene.graphics;
  const arch = state.archimedes;
  const beam = state.beam;
  const p = beamWorldPoint(beam, arch.beamPosition);
  const worldX = p.x;
  const worldY = p.y - arch.size * 0.5;

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
    const mass = scene.add.text(ax, ay + r + 12, `${arch.mass}`, {
      fontSize: FONT_MASS, color: '#fff', fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 5, y: 3 },
    }).setOrigin(0.5).setDepth(121);
    cached = { emoji, mass };
    d.objectTexts.set(key, cached);
  }
  cached.emoji.setPosition(ax, ay);
  cached.mass.setPosition(ax, ay + r + 10);
  cached.mass.setText(`${arch.mass}`);
}

// ── Object drawing ───────────────────────────────────────────────────────────

function drawObject(scene, d, obj, beam) {
  const g = scene.graphics;
  const isEarth = obj.type === 'earth';
  const isArchimedes = obj.type === 'archimedes';
  const r = obj.size * 0.4 * (scene.scale.width / 800);

  let x = sx(scene, obj.x);
  let y = sy(scene, obj.y);

  // For earth/archimedes on the beam, use the same beam-space transform as drawBeam
  // so they stay glued to the lever regardless of scaleX vs scaleY differences.
  if (beam && obj.onBeam && (isEarth || isArchimedes)) {
    const scaleX = (sx(scene, 1) - sx(scene, 0)) || 1;
    const pivX = sx(scene, beam.pivotX);
    const pivY = sy(scene, beam.pivotY);
    const angle = beam.angle || 0;
    const beamT = obj.beamPosition * beamSpan(beam) * scaleX;
    const bx = pivX + beamT * Math.cos(angle);
    const by = pivY + beamT * Math.sin(angle);
    // Sit on beam top surface: perpendicular offset above the beam
    const BEAM_HALF_H = 6;
    const seatOffset = BEAM_HALF_H + r * 0.5;
    x = bx - seatOffset * Math.sin(angle);
    y = by - seatOffset * Math.cos(angle);
  }

  // Fixed objects are visually locked.
  if (obj.fixed && !isEarth && !isArchimedes) {
    g.lineStyle(3, 0x2c3e50, 0.8);
    g.strokeCircle(x, y, r + 7);
  }

  // Claim highlight
  if (obj.claimedBy) {
    g.lineStyle(3, 0xf1c40f);
    g.strokeCircle(x, y, r + 5);
  }

  if (isArchimedes) {
    // Draw legs straddling the beam, oriented along beam direction
    const beamAngle = beam?.angle || 0;
    const legLen = r * 0.35;
    const legDy = r * 0.42;
    const legBaseX = x + legDy * Math.sin(beamAngle);
    const legBaseY = y + legDy * Math.cos(beamAngle);
    g.lineStyle(3, 0x5d4037, 0.95);
    g.lineBetween(
      legBaseX - legLen * Math.cos(beamAngle),
      legBaseY - legLen * Math.sin(beamAngle),
      legBaseX + legLen * Math.cos(beamAngle),
      legBaseY + legLen * Math.sin(beamAngle),
    );
  } else if (!isEarth) {
    const color = Phaser.Display.Color.HexStringToColor(obj.color).color;
    drawObjectWithDepth(scene, g, d.objectTexts, obj, x, y, r, color);
    return;
  }

  // Regular objects: shared emoji + mass caching
  if (!isEarth && !isArchimedes) {
    return;
  }

  // Earth and Archimedes: custom text rendering (left in-place per plan)
  let cached = d.objectTexts.get(obj.id);
  if (!cached) {
    const fontSize = isEarth
      ? Math.max(34, Math.floor(r * 2.2))
      : Math.max(30, Math.floor(r * 1.9));
    const emoji = scene.add.text(x, y, obj.emoji, {
      fontSize: `${fontSize}px`,
    }).setOrigin(0.5).setDepth(120);
    cached = { emoji, mass: null };
    d.objectTexts.set(obj.id, cached);
  }
  if (cached.emoji) {
    const ey = isArchimedes ? (y - r * 0.18) : y;
    cached.emoji.setPosition(x, ey);
  }
}

// ── Confetti ─────────────────────────────────────────────────────────────────

// ── Clouds (level 6 finale — animated parallax) ─────────────────────────────

function drawFinaleClouds(scene, scroll) {
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

// ── UI ───────────────────────────────────────────────────────────────────────

function ensureUI(scene, d) {
  if (d.uiCreated) return;
  d.uiCreated = true;

  // Common chrome: levelTitle, msgText, doorText, resetBtn, lvlBtn
  Object.assign(d, createCommonUI(scene));

  // Seesaw-specific extras
  d.progressText = scene.add.text(12, 50, '', {
    fontSize: FONT_BODY, color: '#555',
  }).setDepth(200);

  d.loadText = scene.add.text(12, 76, '', {
    fontSize: FONT_BODY, color: '#555',
  }).setDepth(200);

  // Palette label
  const H = scene.scale.height;
  d.paletteLabel = scene.add.text(scene.scale.width / 2, H - 16, 'DRAG WEIGHTS', {
    fontSize: '14px', color: '#c8b99a', fontStyle: 'bold',
    stroke: '#3e2f1c', strokeThickness: 2,
  }).setOrigin(0.5).setDepth(200).setAlpha(0.7);
}

function updateUI(scene, d, state) {
  d.levelTitle.setText(state.levelName || `Level ${state.level}`);

  const bal = state.balance || {};
  const progress = bal.totalBalances || 0;
  const target = state.doorTarget || 1;
  const doorProg = state.doorProgress || 0;

  d.progressText.setText(
    `Room: ${scene.game.net.roomId || '----'}  |  Balances: ${doorProg}/${target}`
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

  updateDoorButton(d.doorText, state.doorOpen);

  // Completion banner
  if (state.doorOpen) {
    drawCompletionBanner(scene, scene.graphics, state);
  } else {
    hideCompletionBanner(scene);
  }
}

// ── Input handlers ───────────────────────────────────────────────────────────

export function onPointerDown(scene, pointer, state) {
  if (!shouldHandlePointer(state)) return;

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
    if (cached.emoji) cached.emoji.destroy();
    if (cached.mass) cached.mass.destroy();
  }
  d.objectTexts.clear();

  destroyCommonUI(d, ['progressText', 'loadText', 'paletteLabel', '_balancedText']);

  sceneData.delete(scene);
}
