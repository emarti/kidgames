/**
 * Archimedes — Module 3: Pulley Builder
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
      // UI elements
      levelTitle: null,
      progressText: null,
      effortText: null,
      msgText: null,
      doorText: null,
      resetBtn: null,
      lvlBtn: null,
      // Drag tracking
      draggingPull: false,
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
  const pu = state.pulley;
  if (!pu) return;

  ensureUI(scene, d);

  // Clean up stale cached texts
  const validIds = new Set();
  for (const p of pu.pulleys) validIds.add(p.id);
  validIds.add('load');
  validIds.add('effort_meter');
  if (pu.counterweight) {
    for (const c of pu.counterweight.cwPalette) validIds.add(c.id);
    validIds.add('cw_label');
  }
  if (pu.elevator) validIds.add('elevator_people');
  for (const [id, cached] of d.objectTexts) {
    if (!validIds.has(id)) {
      if (cached.emoji) cached.emoji.destroy();
      if (cached.mass) cached.mass.destroy();
      if (cached.label) cached.label.destroy();
      d.objectTexts.delete(id);
    }
  }

  const W = scene.scale.width;
  const H = scene.scale.height;

  // ── 1. Sky ──────────────────────────────────────────────────────────────
  const floorScreenY = sy(scene, pu.floorY);
  g.fillStyle(0x87ceeb);
  g.fillRect(0, 0, W, floorScreenY);

  // ── 2. Ground ───────────────────────────────────────────────────────────
  g.fillStyle(0x8b6914);
  g.fillRect(0, floorScreenY, W, H - floorScreenY);
  g.fillStyle(0x228b22);
  g.fillRect(0, floorScreenY, W, 6);

  // ── 3. Ceiling bar ──────────────────────────────────────────────────────
  drawCeiling(scene, pu);

  // ── 4. Target line ──────────────────────────────────────────────────────
  drawTargetLine(scene, pu);

  // ── 5. Height marker ────────────────────────────────────────────────────
  drawHeightMarker(scene, pu);

  // ── 6. Counterweight (behind rope) ──────────────────────────────────────
  if (pu.counterweight) {
    drawCounterweight(scene, d, pu);
  }

  // ── 7. Rope ─────────────────────────────────────────────────────────────
  drawRope(scene, pu);

  // ── 8. Pulleys ──────────────────────────────────────────────────────────
  for (const p of pu.pulleys) {
    drawPulley(scene, d, p, pu);
  }

  // ── 9. Load / Elevator ──────────────────────────────────────────────────
  drawLoad(scene, d, pu);

  // ── 10. People on elevator ──────────────────────────────────────────────
  if (pu.elevator && pu.elevator.people.length > 0) {
    drawElevatorPeople(scene, d, pu);
  }

  // ── 11. Effort meter ────────────────────────────────────────────────────
  drawEffortMeter(scene, d, pu);

  // ── 12. Palette area ────────────────────────────────────────────────────
  const paletteY = sy(scene, pu.floorY + 15);
  g.fillStyle(0x2c3e50, 0.3);
  g.fillRect(0, paletteY, W, H - paletteY);
  g.lineStyle(1, 0x7f8c8d, 0.5);
  g.lineBetween(0, paletteY, W, paletteY);

  // Palette pulleys (unplaced)
  for (const p of pu.pulleys) {
    if (!p.placed && !p.claimedBy) {
      drawPulley(scene, d, p, pu);
    }
  }

  // CW palette
  if (pu.counterweight) {
    for (const cw of pu.counterweight.cwPalette) {
      if (!cw.placed && !cw.claimedBy) {
        drawCWItem(scene, d, cw);
      }
    }
  }

  // ── 13. Dragged items ───────────────────────────────────────────────────
  for (const p of pu.pulleys) {
    if (p.claimedBy) drawPulley(scene, d, p, pu);
  }
  if (pu.counterweight) {
    for (const cw of pu.counterweight.cwPalette) {
      if (cw.claimedBy) drawCWItem(scene, d, cw);
    }
  }

  // ── 14. Pull indicator ──────────────────────────────────────────────────
  if (pu.pull.active) {
    drawPullIndicator(scene, pu);
  }

  // ── 15. Confetti ────────────────────────────────────────────────────────
  if (state.confetti) {
    drawConfetti(scene, state);
  }

  // ── 16. UI ──────────────────────────────────────────────────────────────
  updateUI(scene, d, state);
}

// ── Ceiling ──────────────────────────────────────────────────────────────────

function drawCeiling(scene, pu) {
  const g = scene.graphics;
  const y = sy(scene, pu.ceilingY);
  const W = scene.scale.width;

  // Steel bar
  g.fillStyle(0x555555);
  g.fillRect(sx(scene, 100), y - 6, sx(scene, 600), 12);
  g.lineStyle(2, 0x333333);
  g.strokeRect(sx(scene, 100), y - 6, sx(scene, 600), 12);

  // Anchor brackets (glow if unoccupied)
  for (const anchor of pu.anchors) {
    const ax = sx(scene, anchor.x);
    const occupied = pu.pulleys.some(p => p.placed && p.anchorId === anchor.id);

    if (!occupied) {
      // Glowing bracket
      const pulse = 0.4 + 0.3 * Math.sin((scene.time?.now || Date.now()) / 400);
      g.fillStyle(0xf1c40f, pulse);
      g.fillCircle(ax, y + 6, 10);
    }

    g.fillStyle(occupied ? 0x777777 : 0xaaaaaa);
    g.fillRect(ax - 5, y + 3, 10, 10);
    g.lineStyle(1, 0x333333);
    g.strokeRect(ax - 5, y + 3, 10, 10);
  }
}

// ── Target line ──────────────────────────────────────────────────────────────

function drawTargetLine(scene, pu) {
  const g = scene.graphics;
  const ty = sy(scene, pu.targetY);
  const now = scene.time?.now || Date.now();

  // Dashed green line
  g.lineStyle(2, 0x2ecc71, 0.7);
  const dashLen = 10;
  const gapLen = 8;
  const leftX = sx(scene, 200);
  const rightX = sx(scene, 600);
  let x = leftX;
  while (x < rightX) {
    const endX = Math.min(x + dashLen, rightX);
    g.lineBetween(x, ty, endX, ty);
    x += dashLen + gapLen;
  }

  // Star pulsing near target
  const close = pu.liftProgress > 0.7;
  if (close) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 200);
    g.fillStyle(0xf1c40f, pulse);
    g.fillStar(sx(scene, 610), ty, 8, 4, 5);
  }

  // Star icon
  const starSize = close ? 10 : 7;
  g.fillStyle(0xf1c40f);
  g.fillStar(sx(scene, 610), ty, starSize, starSize / 2, 5);
}

// ── Height marker ────────────────────────────────────────────────────────────

function drawHeightMarker(scene, pu) {
  const g = scene.graphics;
  const x = sx(scene, 160);
  const topY = sy(scene, pu.targetY);
  const botY = sy(scene, pu.floorY - pu.load.height / 2);
  const totalH = botY - topY;

  // Vertical bar background
  g.fillStyle(0xdddddd, 0.3);
  g.fillRect(x - 4, topY, 8, totalH);

  // Color bands: green top, yellow middle, red bottom
  const greenH = totalH * 0.3;
  const yellowH = totalH * 0.4;
  const redH = totalH * 0.3;
  g.fillStyle(0x2ecc71, 0.4);
  g.fillRect(x - 4, topY, 8, greenH);
  g.fillStyle(0xf1c40f, 0.4);
  g.fillRect(x - 4, topY + greenH, 8, yellowH);
  g.fillStyle(0xe74c3c, 0.4);
  g.fillRect(x - 4, topY + greenH + yellowH, 8, redH);

  // Arrow tracking load
  const loadScreenY = sy(scene, pu.load.y);
  const arrowY = clamp(loadScreenY, topY, botY);
  g.fillStyle(0xe74c3c);
  g.beginPath();
  g.moveTo(x + 8, arrowY);
  g.lineTo(x + 18, arrowY - 5);
  g.lineTo(x + 18, arrowY + 5);
  g.closePath();
  g.fillPath();
}

// ── Rope drawing ─────────────────────────────────────────────────────────────

function drawRope(scene, pu) {
  const g = scene.graphics;
  const wps = pu.rope.waypoints;
  if (wps.length < 2) return;

  const stripeOffset = pu.rope.stripeOffset || 0;

  // Draw rope as striped red/white line
  for (let i = 0; i < wps.length - 1; i++) {
    const x1 = sx(scene, wps[i].x);
    const y1 = sy(scene, wps[i].y);
    const x2 = sx(scene, wps[i + 1].x);
    const y2 = sy(scene, wps[i + 1].y);

    const segLen = Math.hypot(x2 - x1, y2 - y1);
    const stripeLen = 8;
    const numStripes = Math.ceil(segLen / stripeLen);

    for (let s = 0; s < numStripes; s++) {
      const t1 = s / numStripes;
      const t2 = Math.min((s + 1) / numStripes, 1);
      const sx1 = x1 + (x2 - x1) * t1;
      const sy1 = y1 + (y2 - y1) * t1;
      const sx2 = x1 + (x2 - x1) * t2;
      const sy2 = y1 + (y2 - y1) * t2;

      const stripeIdx = Math.floor((s + stripeOffset / stripeLen) % 2);
      const color = stripeIdx === 0 ? 0xe74c3c : 0xffffff;
      g.lineStyle(3, color, 0.9);
      g.lineBetween(sx1, sy1, sx2, sy2);
    }
  }

  // Draw rope outline
  g.lineStyle(1, 0x333333, 0.3);
  for (let i = 0; i < wps.length - 1; i++) {
    g.lineBetween(
      sx(scene, wps[i].x), sy(scene, wps[i].y),
      sx(scene, wps[i + 1].x), sy(scene, wps[i + 1].y)
    );
  }
}

// ── Pulley drawing ───────────────────────────────────────────────────────────

function drawPulley(scene, d, pulley, pu) {
  const g = scene.graphics;
  const px = sx(scene, pulley.x);
  const py = sy(scene, pulley.y);
  const r = pulley.radius * (scene.scale.width / 800);

  // Color: gray for fixed, gold for movable
  const baseColor = pulley.type === 'fixed' ? 0x888888 : 0xdaa520;
  const rimColor = pulley.type === 'fixed' ? 0x555555 : 0xb8860b;

  // Claim highlight
  if (pulley.claimedBy) {
    g.lineStyle(3, 0xf1c40f);
    g.strokeCircle(px, py, r + 5);
  }

  // Outer rim
  g.fillStyle(baseColor);
  g.fillCircle(px, py, r);
  g.lineStyle(2, rimColor);
  g.strokeCircle(px, py, r);

  // Center axle
  g.fillStyle(0x333333);
  g.fillCircle(px, py, 3);

  // Rotation indicator (groove)
  const ropeOffset = (pu.rope.stripeOffset || 0) * 0.1;
  const angle = ropeOffset;
  const grooveX = px + Math.cos(angle) * (r * 0.6);
  const grooveY = py + Math.sin(angle) * (r * 0.6);
  g.fillStyle(rimColor, 0.5);
  g.fillCircle(grooveX, grooveY, 2);

  // Label below if in palette
  if (!pulley.placed) {
    const label = pulley.type === 'fixed' ? 'Fixed' : 'Movable';
    let cached = d.objectTexts.get(pulley.id);
    if (!cached) {
      const text = scene.add.text(px, py + r + 10, label, {
        fontSize: '11px', color: '#fff', fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setDepth(121);
      cached = { mass: text };
      d.objectTexts.set(pulley.id, cached);
    }
    cached.mass.setPosition(px, py + r + 10);
    cached.mass.setText(label);
    cached.mass.setVisible(true);
  } else {
    const cached = d.objectTexts.get(pulley.id);
    if (cached?.mass) cached.mass.setVisible(false);
  }
}

// ── Load / Elevator drawing ──────────────────────────────────────────────────

function drawLoad(scene, d, pu) {
  const g = scene.graphics;
  const load = pu.load;
  const lx = sx(scene, load.x);
  const ly = sy(scene, load.y);
  const hw = load.width / 2 * (scene.scale.width / 800);
  const hh = load.height / 2 * (scene.scale.height / 500);

  // Shadow that shrinks as load rises
  const maxY = pu.floorY - load.height / 2;
  const shadowProgress = 1 - pu.liftProgress;
  const shadowW = hw * 2 * shadowProgress;
  const shadowH = 6 * shadowProgress;
  const shadowY = sy(scene, pu.floorY) - 2;
  g.fillStyle(0x000000, 0.15 * shadowProgress);
  g.fillEllipse(lx, shadowY, shadowW, shadowH);

  // Load box
  const isElevator = pu.elevator != null;
  const boxColor = isElevator ? 0x34495e : 0x8b4513;
  g.fillStyle(boxColor, 0.9);
  g.fillRect(lx - hw, ly - hh, hw * 2, hh * 2);
  g.lineStyle(2, isElevator ? 0x2c3e50 : 0x5d4037);
  g.strokeRect(lx - hw, ly - hh, hw * 2, hh * 2);

  // Elevator rails
  if (isElevator) {
    g.lineStyle(2, 0x7f8c8d, 0.5);
    g.lineBetween(lx - hw - 5, sy(scene, pu.ceilingY + 20), lx - hw - 5, sy(scene, pu.floorY));
    g.lineBetween(lx + hw + 5, sy(scene, pu.ceilingY + 20), lx + hw + 5, sy(scene, pu.floorY));
  }

  // Rope attachment point on top
  g.fillStyle(0x333333);
  g.fillCircle(lx, ly - hh, 4);

  // Emoji
  let cached = d.objectTexts.get('load');
  if (!cached) {
    const fontSize = Math.max(18, Math.floor(hh * 1.2));
    const emoji = scene.add.text(lx, ly - 4, load.emoji, {
      fontSize: `${fontSize}px`,
    }).setOrigin(0.5).setDepth(120);
    const mass = scene.add.text(lx, ly + hh + 8, `${load.weight}kg`, {
      fontSize: '12px', color: '#fff', fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setDepth(121);
    cached = { emoji, mass };
    d.objectTexts.set('load', cached);
  }
  const totalWeight = load.weight + (pu.elevator ? pu.elevator.totalMass : 0);
  cached.emoji.setPosition(lx, ly - 4);
  cached.mass.setPosition(lx, ly + hh + 8);
  cached.mass.setText(`${totalWeight}kg`);
}

// ── Elevator people ──────────────────────────────────────────────────────────

function drawElevatorPeople(scene, d, pu) {
  const people = pu.elevator.people;
  if (!people || people.length === 0) return;

  const load = pu.load;
  const lx = sx(scene, load.x);
  const ly = sy(scene, load.y);
  const hw = load.width / 2 * (scene.scale.width / 800);
  const hh = load.height / 2 * (scene.scale.height / 500);

  // Draw people standing on the platform
  const spacing = (hw * 2) / (people.length + 1);
  const key = 'elevator_people';
  let cached = d.objectTexts.get(key);
  if (!cached) {
    const text = scene.add.text(lx, ly - hh - 14, '', {
      fontSize: '20px',
    }).setOrigin(0.5).setDepth(125);
    cached = { emoji: text };
    d.objectTexts.set(key, cached);
  }

  const emojiStr = people.map(p => p.emoji).join('');
  cached.emoji.setPosition(lx, ly - hh - 14);
  cached.emoji.setText(emojiStr);
}

// ── Effort meter ─────────────────────────────────────────────────────────────

function drawEffortMeter(scene, d, pu) {
  const g = scene.graphics;
  const x = sx(scene, 700);
  const y = sy(scene, 200);
  const barW = 20;
  const barH = 120;

  // Background bar
  g.fillStyle(0x333333, 0.3);
  g.fillRect(x - barW / 2, y, barW, barH);
  g.lineStyle(1, 0x555555);
  g.strokeRect(x - barW / 2, y, barW, barH);

  // Fill based on effort ratio
  const ratio = Math.min(1, pu.effortRequired / pu.pull.maxEffort);
  const fillH = barH * ratio;
  const fillColor = ratio <= 0.5 ? 0x2ecc71 : ratio <= 0.8 ? 0xf1c40f : 0xe74c3c;
  g.fillStyle(fillColor, 0.8);
  g.fillRect(x - barW / 2, y + barH - fillH, barW, fillH);

  // Current effort line (when pulling)
  if (pu.pull.active) {
    const effortRatio = Math.min(1, pu.pull.effort / pu.pull.maxEffort);
    const effortY = y + barH - barH * effortRatio;
    g.lineStyle(2, 0x3498db);
    g.lineBetween(x - barW / 2 - 3, effortY, x + barW / 2 + 3, effortY);
  }

  // Emoji
  let cached = d.objectTexts.get('effort_meter');
  if (!cached) {
    const emoji = scene.add.text(x, y - 18, '😊', {
      fontSize: '22px',
    }).setOrigin(0.5).setDepth(120);
    const label = scene.add.text(x, y + barH + 12, 'Effort', {
      fontSize: '11px', color: '#555',
    }).setOrigin(0.5).setDepth(120);
    cached = { emoji, label };
    d.objectTexts.set('effort_meter', cached);
  }
  cached.emoji.setPosition(x, y - 18);
  cached.emoji.setText(pu.effortMeter.emoji);

  // MA display
  if (cached.label) {
    cached.label.setPosition(x, y + barH + 12);
    cached.label.setText(`MA: ${pu.ma}`);
  }
}

// ── Counterweight ────────────────────────────────────────────────────────────

function drawCounterweight(scene, d, pu) {
  const g = scene.graphics;
  const cw = pu.counterweight;
  if (!cw) return;

  // Counterweight zone on right side
  const zoneX = sx(scene, 620);
  const zoneW = sx(scene, 100);
  const zoneTopY = sy(scene, pu.ceilingY + 20);
  const zoneBotY = sy(scene, pu.floorY);

  // Vertical rail
  g.lineStyle(2, 0x7f8c8d, 0.4);
  g.lineBetween(zoneX + zoneW / 2, zoneTopY, zoneX + zoneW / 2, zoneBotY);

  // Counterweight block
  if (cw.weight > 0) {
    const cwY = sy(scene, cw.y);
    const cwW = 40;
    const cwH = 30 + cw.items.length * 8;

    g.fillStyle(0x555555, 0.85);
    g.fillRect(zoneX + zoneW / 2 - cwW / 2, cwY, cwW, cwH);
    g.lineStyle(2, 0x333333);
    g.strokeRect(zoneX + zoneW / 2 - cwW / 2, cwY, cwW, cwH);

    // Rope connecting to ceiling
    g.lineStyle(2, 0xe74c3c, 0.5);
    g.lineBetween(zoneX + zoneW / 2, zoneTopY, zoneX + zoneW / 2, cwY);

    let cached = d.objectTexts.get('cw_label');
    if (!cached) {
      const text = scene.add.text(zoneX + zoneW / 2, cwY + cwH + 10, '', {
        fontSize: '12px', color: '#fff', fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setDepth(121);
      cached = { mass: text };
      d.objectTexts.set('cw_label', cached);
    }
    cached.mass.setPosition(zoneX + zoneW / 2, cwY + cwH + 10);
    cached.mass.setText(`${cw.weight}kg`);
    cached.mass.setVisible(true);
  } else {
    // Empty zone indicator
    const pulse = 0.3 + 0.2 * Math.sin((scene.time?.now || Date.now()) / 500);
    g.fillStyle(0xf1c40f, pulse);
    g.fillRect(zoneX + zoneW / 2 - 20, sy(scene, pu.floorY - 50), 40, 30);

    const cached = d.objectTexts.get('cw_label');
    if (cached?.mass) cached.mass.setVisible(false);
  }
}

// ── CW palette item ─────────────────────────────────────────────────────────

function drawCWItem(scene, d, cw) {
  const g = scene.graphics;
  const cx = sx(scene, cw.x);
  const cy = sy(scene, cw.y);
  const r = 14 * (scene.scale.width / 800);

  if (cw.claimedBy) {
    g.lineStyle(3, 0xf1c40f);
    g.strokeCircle(cx, cy, r + 4);
  }

  g.fillStyle(0x555555, 0.85);
  g.fillCircle(cx, cy, r);
  g.lineStyle(2, 0x333333);
  g.strokeCircle(cx, cy, r);

  let cached = d.objectTexts.get(cw.id);
  if (!cached) {
    const emoji = scene.add.text(cx, cy, cw.emoji, {
      fontSize: '14px',
    }).setOrigin(0.5).setDepth(120);
    const mass = scene.add.text(cx, cy + r + 8, cw.label, {
      fontSize: '10px', color: '#fff', fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5).setDepth(121);
    cached = { emoji, mass };
    d.objectTexts.set(cw.id, cached);
  }
  cached.emoji.setPosition(cx, cy);
  cached.mass.setPosition(cx, cy + r + 8);
}

// ── Pull indicator ───────────────────────────────────────────────────────────

function drawPullIndicator(scene, pu) {
  const g = scene.graphics;
  const pull = pu.pull;

  // Draw a hand/arrow at the pull position
  const px = sx(scene, pu.rope.freeEndX);
  const startY = sy(scene, pull.dragStartY);
  const curY = sy(scene, pull.currentY);

  // Arrow showing pull direction
  g.lineStyle(3, 0x3498db, 0.7);
  g.lineBetween(px, startY, px, curY);

  // Arrowhead
  if (curY > startY) {
    g.fillStyle(0x3498db, 0.7);
    g.beginPath();
    g.moveTo(px, curY);
    g.lineTo(px - 6, curY - 10);
    g.lineTo(px + 6, curY - 10);
    g.closePath();
    g.fillPath();
  }

  // Effort text
  const effortPct = Math.round((pull.effort / pull.maxEffort) * 100);
  // Small transient text — skip caching
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

  d.effortText = scene.add.text(12, 52, '', {
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
  const pu = state.pulley;
  if (!pu) return;

  d.levelTitle.setText(state.levelName || `Level ${state.level}`);

  const doorProg = state.doorProgress || 0;
  const target = state.doorTarget || 1;
  d.progressText.setText(
    `Room: ${scene.game.net.roomId || '----'}  |  Lifts: ${doorProg}/${target}`
  );

  // Effort info
  const effortReq = Math.round(pu.effortRequired * 10) / 10;
  const canLift = effortReq <= pu.pull.maxEffort;
  d.effortText.setText(`Effort: ${effortReq}/${pu.pull.maxEffort}  MA: ${pu.ma}  ${pu.effortMeter.emoji}`);
  d.effortText.setColor(canLift ? '#27ae60' : '#e74c3c');

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
  const pu = state.pulley;
  if (!pu) return;

  // 1. Check if near rope free end → start pull
  const ropeDist = Math.hypot(gx - pu.rope.freeEndX, gy - pu.rope.freeEndY);
  if (ropeDist < 50) {
    scene.game.net.sendInput('pull_start');
    d.draggingPull = true;
    return;
  }

  // 2. Check CW palette items
  if (pu.counterweight) {
    for (const cw of pu.counterweight.cwPalette) {
      if (cw.claimedBy || cw.placed) continue;
      const dist = Math.hypot(cw.x - gx, cw.y - gy);
      if (dist < 25) {
        scene.game.net.sendInput('grab', { objectId: cw.id });
        scene.draggedObjectId = cw.id;
        return;
      }
    }
  }

  // 3. Find nearest unclaimed pulley
  let best = null;
  let bestDist = Infinity;
  for (const p of pu.pulleys) {
    if (p.claimedBy) continue;
    const dist = Math.hypot(p.x - gx, p.y - gy);
    if (dist < p.radius * 2 && dist < bestDist) {
      best = p;
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

  if (d.draggingPull) {
    scene.game.net.sendInput('pull_stop');
    d.draggingPull = false;
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
    if (cached.label) cached.label.destroy();
  }
  d.objectTexts.clear();

  const uiKeys = ['levelTitle', 'progressText', 'effortText', 'msgText', 'doorText', 'resetBtn', 'lvlBtn'];
  for (const key of uiKeys) {
    if (d[key]) { d[key].destroy(); d[key] = null; }
  }

  sceneData.delete(scene);
}
