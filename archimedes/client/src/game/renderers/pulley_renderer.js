/**
 * Archimedes — Module 3: Pulley Builder
 * Client-side renderer for PlayScene.
 *
 * Exports the renderer interface expected by PlayScene dispatcher:
 *   { create, renderState, onPointerDown, onPointerUp, destroy }
 */

import {
  createCommonUI,
  updateDoorButton,
  cleanupObjectTexts,
  drawObjectEmojiCached,
  destroyCommonUI,
  updateConfetti,
  drawConfetti,
  shouldHandlePointer,
  FONT_BODY,
  FONT_SMALL,
  UI_DEPTH,
} from './renderer_utils.js';

// ── Rope endpoint resolver (mirrors archimedes_pulley_physics.js) ─────────────

const MOVABLE_PULLEY_OFFSET = 30; // mirrors archimedes_pulley_physics.js

function resolveRopeEndpoint(endpointId, rig, load) {
  if (endpointId === 'anchor') return { x: rig.anchorX, y: rig.anchorY };
  if (endpointId === 'load')   return { x: load.x, y: load.y - (load.radius || 20) };
  if (endpointId === 'cw' && rig.counterweight) return { x: rig.counterweight.x, y: rig.counterweight.y };
  if (endpointId === 'windlass' && rig.windlass) return { x: rig.windlass.centerX, y: rig.windlass.centerY };
  const ep = rig.effortPoints?.find(e => e.id === endpointId);
  if (ep) return { x: ep.x, y: ep.y };
  const fp = rig.fixedPulleys?.find(p => p.id === endpointId);
  if (fp) return { x: fp.x, y: fp.y };
  const mp = rig.movablePulleys?.find(p => p.id === endpointId);
  if (mp) return { x: mp.x, y: mp.y };
  // Building-mechanic slot pulleys: 'mp_slot1', 'fp_slot1', etc.
  if (endpointId.startsWith('mp_')) {
    const slotId = endpointId.slice(3);
    const slot = rig.pulleySlots?.find(s => s.id === slotId);
    if (slot) return { x: slot.fixedX + (slot.movableXOffset || 0), y: load.y - MOVABLE_PULLEY_OFFSET };
  }
  if (endpointId.startsWith('fp_')) {
    const slotId = endpointId.slice(3);
    const slot = rig.pulleySlots?.find(s => s.id === slotId);
    if (slot) return { x: slot.fixedX, y: slot.fixedY };
  }
  return { x: 0, y: 0 };
}

// ── Dynamic MA helper (mirrors server computeRigMA) ──────────────────────────

function computeClientRigMA(rig) {
  if (rig.windlass) {
    const w = rig.windlass;
    const dr = w.drumA.radius - w.drumB.radius;
    if (Math.abs(dr) < 0.001) return 1;
    return Math.round((2 * w.handleRadius) / dr);
  }
  if (rig.pulleySlots) {
    const placed = rig.pulleySlots.filter(s => s.occupiedBy).length;
    return 1 + placed * 2;
  }
  return rig.MA || 1;
}

// ── Renderer state (per-scene) ────────────────────────────────────────────────

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
      msgText: null,
      doorText: null,
      resetBtn: null,
      lvlBtn: null,
      effortText: null,
      maText: null,
      // Drag tracking
      draggingEffortId: null,
      draggingCrank: false,
      draggingPaletteId: null,
    };
    sceneData.set(scene, d);
  }
  return d;
}

// ── Coordinate helpers ────────────────────────────────────────────────────────

function sx(scene, x) { return scene.sx(x); }
function sy(scene, y) { return scene.sy(y); }

// ── Create ────────────────────────────────────────────────────────────────────

export function create(scene) {
  getData(scene);
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderState(scene, state) {
  const g = scene.graphics;
  const d = getData(scene);
  const pu = state.pu;

  ensureUI(scene, d);

  if (!pu) {
    updateUI(scene, d, state);
    return;
  }

  const { rig, load } = pu;
  const W = scene.scale.width;
  const H = scene.scale.height;
  const now = scene.time?.now || 0;

  // Clean up stale texts
  const liveObjects = [load];
  if (rig.counterweight) {
    liveObjects.push(rig.counterweight);
    if (rig.counterweight.palette) liveObjects.push(...rig.counterweight.palette);
  }
  cleanupObjectTexts(d.objectTexts, liveObjects);

  // ── 1. Background ──────────────────────────────────────────────────────
  g.fillStyle(0x87ceeb);
  g.fillRect(0, 0, W, H * 0.75);
  g.fillStyle(0x8b6914);
  g.fillRect(0, H * 0.75, W, H * 0.25);
  g.fillStyle(0x228b22);
  g.fillRect(0, H * 0.75, W, 5);

  // ── 2. Ceiling / anchor ────────────────────────────────────────────────
  const anchorSx = sx(scene, rig.anchorX);
  const anchorSy = sy(scene, rig.anchorY);
  g.fillStyle(0x5d4037);
  g.fillRect(anchorSx - 6, 0, 12, anchorSy + 6);
  g.fillStyle(0x795548);
  g.fillCircle(anchorSx, anchorSy, 8);

  // ── 3. Ropes ───────────────────────────────────────────────────────────
  drawRopes(scene, g, rig, load);

  // ── 4. Fixed pulleys ───────────────────────────────────────────────────
  for (const fp of rig.fixedPulleys) {
    drawPulleyWheel(scene, g, fp.x, fp.y, fp.radius, false);
  }

  // ── 5. Movable pulleys (pre-placed) ───────────────────────────────────
  for (const mp of rig.movablePulleys) {
    drawPulleyWheel(scene, g, mp.x, mp.y, mp.radius, true);
  }

  // ── 5b. Building-mechanic: slots and palette ───────────────────────────
  if (rig.pulleySlots) {
    drawPulleySlots(scene, g, rig, load, now);
  }
  if (rig.pulleyPalette) {
    drawPulleyPalette(scene, g, rig, now);
  }

  // ── 6. Effort points ───────────────────────────────────────────────────
  for (const ep of rig.effortPoints) {
    drawEffortPoint(scene, g, ep, now);
  }

  // ── 7. Windlass ────────────────────────────────────────────────────────
  if (rig.windlass) {
    drawWindlass(scene, g, rig.windlass, now);
  }

  // ── 8. Counterweight ───────────────────────────────────────────────────
  if (rig.counterweight) {
    drawCounterweight(scene, g, d, rig.counterweight);
    drawCWPalette(scene, g, d, rig.counterweight);
  }

  // ── 9. Load ────────────────────────────────────────────────────────────
  drawLoad(scene, g, d, load);

  // ── 10. Supporting segment highlights ─────────────────────────────────
  drawSupportingHighlights(scene, g, rig, load, now);

  // ── 11. Confetti ───────────────────────────────────────────────────────
  updateConfetti(scene, d, state);
  drawConfetti(scene, d, state);

  // ── 12. UI ─────────────────────────────────────────────────────────────
  updateUI(scene, d, state);
}

// ── Rope drawing ──────────────────────────────────────────────────────────────

function drawRopes(scene, g, rig, load) {
  for (const seg of rig.ropeSegments) {
    const a = resolveRopeEndpoint(seg.from, rig, load);
    const b = resolveRopeEndpoint(seg.to,   rig, load);

    if (!a || !b) continue;
    g.lineStyle(3, 0xd4a017, 0.9);
    g.lineBetween(
      sx(scene, a.x), sy(scene, a.y),
      sx(scene, b.x), sy(scene, b.y)
    );
  }
}

// ── Supporting segment highlights ────────────────────────────────────────────

function drawSupportingHighlights(scene, g, rig, load, now) {
  const supporting = rig.ropeSegments.filter(s => s.supporting);
  if (supporting.length < 2) return; // only highlight in levels 3+

  const pulse = 0.5 + 0.5 * Math.sin(now / 300);
  for (const seg of supporting) {
    const a = resolveRopeEndpoint(seg.from, rig, load);
    const b = resolveRopeEndpoint(seg.to,   rig, load);
    if (!a || !b) continue;
    g.lineStyle(6, 0xe8c547, pulse * 0.7);
    g.lineBetween(
      sx(scene, a.x), sy(scene, a.y),
      sx(scene, b.x), sy(scene, b.y)
    );
  }

  // MA badge on the first movable pulley
  if (rig.movablePulleys.length > 0) {
    const mp = rig.movablePulleys[0];
    const bx = sx(scene, mp.x + mp.radius + 12);
    const by = sy(scene, mp.y);
    // Using scene.add.text is stateful — use objectTexts cache for badge
  }
}

// ── Pulley wheel drawing ──────────────────────────────────────────────────────

function drawPulleyWheel(scene, g, wx, wy, radius, movable) {
  const px = sx(scene, wx);
  const py = sy(scene, wy);
  const r  = radius * (scene.scale.width / 800);

  // Bracket line to ceiling (fixed pulley) or short bracket (movable)
  if (!movable) {
    g.lineStyle(4, 0x5d4037);
    g.lineBetween(px, py - r, px, py - r - 18);
    g.fillStyle(0x5d4037);
    g.fillRect(px - 14, py - r - 22, 28, 6);
  }

  // Wheel body
  g.fillStyle(0xa0522d, 0.9);
  g.fillCircle(px, py, r);
  g.lineStyle(3, 0x5d4037);
  g.strokeCircle(px, py, r);

  // Grooves
  g.lineStyle(1, 0x5d4037, 0.5);
  g.strokeCircle(px, py, r * 0.65);

  // Axle dot
  g.fillStyle(0x5d4037);
  g.fillCircle(px, py, 4);
}

// ── Effort point drawing ──────────────────────────────────────────────────────

function drawEffortPoint(scene, g, ep, now) {
  const px = sx(scene, ep.x);
  const py = sy(scene, ep.y);
  const claimed = !!ep.claimedBy;

  const pulse = 0.5 + 0.5 * Math.sin(now / 250);
  const color = claimed ? 0xf1c40f : 0x95a5a6;
  const ringColor = claimed ? 0xf39c12 : 0x7f8c8d;

  g.fillStyle(color, 0.9);
  g.fillCircle(px, py, 20);
  g.lineStyle(3, ringColor, claimed ? 1 : 0.6 + 0.4 * pulse);
  g.strokeCircle(px, py, 20);

  // Horizontal grip lines
  g.lineStyle(3, 0x5d4037, 0.8);
  for (let i = -1; i <= 1; i++) {
    g.lineBetween(px - 10, py + i * 5, px + 10, py + i * 5);
  }

  // Pulsing down-arrow when unclaimed
  if (!claimed) {
    const arrowY = py + 28 + Math.sin(now / 200) * 4;
    g.fillStyle(0x27ae60, 0.9);
    g.beginPath();
    g.moveTo(px, arrowY + 12);
    g.lineTo(px - 10, arrowY);
    g.lineTo(px + 10, arrowY);
    g.closePath();
    g.fillPath();
  }
}

// ── Windlass drawing ──────────────────────────────────────────────────────────

function drawWindlass(scene, g, w, now) {
  const cx = sx(scene, w.centerX);
  const cy = sy(scene, w.centerY);
  const scaleR = scene.scale.width / 800;
  const rA = w.drumA.radius * scaleR;
  const rB = w.drumB.radius * scaleR;
  const rH = w.handleRadius * scaleR;
  const claimed = !!w.claimedBy;

  // Drum A (outer, lighter)
  g.fillStyle(0xa0522d, 0.85);
  g.fillCircle(cx, cy, rA);
  g.lineStyle(3, 0x5d4037);
  g.strokeCircle(cx, cy, rA);

  // Drum B (inner, darker)
  g.fillStyle(0x6d3a1e, 0.9);
  g.fillCircle(cx, cy, rB);
  g.lineStyle(2, 0x4a2510);
  g.strokeCircle(cx, cy, rB);

  // Axle
  g.fillStyle(0x333);
  g.fillCircle(cx, cy, 5);

  // Crank arm
  const armX = cx + Math.cos(w.angle) * rH;
  const armY = cy + Math.sin(w.angle) * rH;
  g.lineStyle(5, 0x795548);
  g.lineBetween(cx, cy, armX, armY);

  // Handle knob
  const pulse = 0.5 + 0.5 * Math.sin(now / 250);
  g.fillStyle(claimed ? 0xf1c40f : 0xe67e22, 0.9);
  g.fillCircle(armX, armY, 14);
  g.lineStyle(3, claimed ? 0xf39c12 : 0xd35400, claimed ? 1 : 0.6 + 0.4 * pulse);
  g.strokeCircle(armX, armY, 14);
}

// ── Load drawing ──────────────────────────────────────────────────────────────

function drawLoad(scene, g, d, load) {
  const lx = sx(scene, load.x);
  const ly = sy(scene, load.y);
  const r  = load.radius * (scene.scale.width / 800);

  // Progress bar above load
  const barW = r * 2.5;
  const barX = lx - barW / 2;
  const barY = ly - r - 18;
  const progress = clamp01((load.homeY - load.y) / Math.max(1, load.homeY - load.targetY));

  g.fillStyle(0x34495e, 0.6);
  g.fillRect(barX, barY, barW, 8);
  g.fillStyle(0x27ae60);
  g.fillRect(barX, barY, barW * progress, 8);
  g.lineStyle(1, 0x2c3e50, 0.5);
  g.strokeRect(barX, barY, barW, 8);

  // Load circle
  g.fillStyle(0x7f8c8d, 0.85);
  g.fillCircle(lx, ly, r);
  g.lineStyle(3, load.atTop ? 0x27ae60 : 0x5d6d7e);
  g.strokeCircle(lx, ly, r);

  // Emoji + mass
  drawObjectEmojiCached(scene, d.objectTexts, load, lx, ly, r);
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// ── Counterweight drawing ─────────────────────────────────────────────────────

function drawCounterweight(scene, g, d, cw) {
  if (cw.mass === 0) {
    // Draw empty slot indicator
    const cx = sx(scene, cw.homeX);
    const cy = sy(scene, cw.homeY);
    g.lineStyle(2, 0x95a5a6, 0.5);
    g.strokeRect(cx - 22, cy - 22, 44, 44);
    return;
  }

  const cx = sx(scene, cw.x);
  const cy = sy(scene, cw.y);
  const r  = 22 * (scene.scale.width / 800);

  g.fillStyle(0x5d6d7e, 0.85);
  g.fillCircle(cx, cy, r);
  g.lineStyle(2, 0x2c3e50, 0.8);
  g.strokeCircle(cx, cy, r);

  drawObjectEmojiCached(scene, d.objectTexts, cw, cx, cy, r);
}

function drawCWPalette(scene, g, d, cw) {
  if (!cw.palette || cw.palette.length === 0) return;

  const W = scene.scale.width;
  const H = scene.scale.height;
  // Label
  const labelY = H - 68;

  for (const item of cw.palette) {
    const ix = sx(scene, item.x);
    const iy = sy(scene, item.y);
    const r  = 20 * (scene.scale.width / 800);
    const claimed = !!item.claimedBy;

    g.fillStyle(0x5d6d7e, claimed ? 1 : 0.75);
    g.fillCircle(ix, iy, r);
    if (claimed) {
      g.lineStyle(3, 0xf1c40f);
      g.strokeCircle(ix, iy, r + 4);
    }

    drawObjectEmojiCached(scene, d.objectTexts, item, ix, iy, r);
  }
}

// ── Pulley slot drawing (building mechanic) ───────────────────────────────────

function drawPulleySlots(scene, g, rig, load, now) {
  for (const slot of rig.pulleySlots) {
    if (slot.occupiedBy) {
      // Draw fixed pulley at slot's fixed position
      drawPulleyWheel(scene, g, slot.fixedX, slot.fixedY, 18, false);
      // Draw movable pulley following the load
      const mx = slot.fixedX + (slot.movableXOffset || 0);
      const my = load.y - MOVABLE_PULLEY_OFFSET;
      drawPulleyWheel(scene, g, mx, my, 18, true);
    } else {
      // Draw empty slot indicator: dashed ring at fixed pulley position
      const fx = sx(scene, slot.fixedX);
      const fy = sy(scene, slot.fixedY);
      const r  = 18 * (scene.scale.width / 800);
      const pulse = 0.4 + 0.3 * Math.sin(now / 500);
      // Dashed circle approximation via arc segments
      const nDashes = 10;
      for (let i = 0; i < nDashes; i++) {
        const a0 = (i / nDashes) * Math.PI * 2;
        const a1 = ((i + 0.55) / nDashes) * Math.PI * 2;
        g.lineStyle(2, 0xaaaaaa, pulse);
        g.beginPath();
        g.arc(fx, fy, r, a0, a1, false);
        g.strokePath();
      }
      // Drop-hint arrow pointing at empty slot
      g.lineStyle(2, 0x27ae60, 0.6 + 0.4 * Math.sin(now / 300));
      g.lineBetween(fx, fy + r + 6, fx, fy + r + 20);
      g.fillStyle(0x27ae60, 0.6);
      g.beginPath();
      g.moveTo(fx, fy + r + 24);
      g.lineTo(fx - 6, fy + r + 16);
      g.lineTo(fx + 6, fy + r + 16);
      g.closePath();
      g.fillPath();
    }
  }
}

// ── Pulley palette drawing (building mechanic) ────────────────────────────────

function drawPulleyPalette(scene, g, rig, now) {
  const W = scene.scale.width;
  const scaleR = W / 800;

  for (const item of rig.pulleyPalette) {
    if (item.inSlot) continue; // drawn as part of slot

    const px = sx(scene, item.x);
    const py = sy(scene, item.y);
    const claimed = !!item.claimedBy;
    const pulse = 0.5 + 0.5 * Math.sin(now / 250);

    // Draw as a mini pulley-pair icon: fixed (top) + rope + movable (bottom)
    const r1 = 11 * scaleR;  // fixed
    const r2 = 11 * scaleR;  // movable
    const gap = 18 * scaleR;

    // Small bracket for fixed pulley
    g.lineStyle(2, 0x5d4037);
    g.lineBetween(px, py - gap - r1, px, py - gap - r1 - 10);
    g.fillStyle(0x5d4037);
    g.fillRect(px - 8, py - gap - r1 - 13, 16, 4);

    // Rope between the two mini pulleys
    g.lineStyle(2, 0xd4a017, 0.9);
    g.lineBetween(px, py - gap, px, py + gap);

    // Fixed pulley (top)
    g.fillStyle(claimed ? 0xf1c40f : 0xa0522d, 0.9);
    g.fillCircle(px, py - gap, r1);
    g.lineStyle(2, 0x5d4037);
    g.strokeCircle(px, py - gap, r1);
    g.fillStyle(0x5d4037);
    g.fillCircle(px, py - gap, 3);

    // Movable pulley (bottom)
    g.fillStyle(claimed ? 0xf1c40f : 0xa0522d, 0.9);
    g.fillCircle(px, py + gap, r2);
    g.lineStyle(2, 0x5d4037);
    g.strokeCircle(px, py + gap, r2);
    g.fillStyle(0x5d4037);
    g.fillCircle(px, py + gap, 3);

    // Glow ring when claimed
    if (claimed) {
      g.lineStyle(3, 0xf39c12, 0.8 + 0.2 * pulse);
      g.strokeCircle(px, py, gap + r2 + 4);
    } else {
      // Subtle pulse to draw attention
      g.lineStyle(1, 0xf39c12, 0.3 + 0.3 * pulse);
      g.strokeCircle(px, py, gap + r2 + 4);
    }
  }
}

// ── UI ────────────────────────────────────────────────────────────────────────

function ensureUI(scene, d) {
  if (d.uiCreated) return;
  d.uiCreated = true;

  Object.assign(d, createCommonUI(scene));

  d.effortText = scene.add.text(12, 50, '', {
    fontSize: FONT_BODY, color: '#555',
  }).setDepth(UI_DEPTH);

  d.maText = scene.add.text(12, 76, '', {
    fontSize: FONT_SMALL, color: '#27ae60', fontStyle: 'bold',
  }).setDepth(UI_DEPTH);
}

function updateUI(scene, d, state) {
  const pu = state.pu;

  d.levelTitle.setText(state.levelName || `Level ${state.level}`);

  if (pu) {
    const { rig, load } = pu;
    const ma = computeClientRigMA(rig);
    const rise = Math.round(load.homeY - load.y);
    const total = Math.max(1, load.homeY - load.targetY);
    d.effortText.setText(`Hoist: ${rise}/${total} | Load: ${load.mass}kg`);
    d.maText.setText(`MA ×${ma}`);
  } else {
    d.effortText.setText('');
    d.maText.setText('');
  }

  if (state.message) {
    d.msgText.setText(state.message).setVisible(true);
  } else {
    d.msgText.setVisible(false);
  }

  updateDoorButton(d.doorText, state.doorOpen);
}

// ── Input ─────────────────────────────────────────────────────────────────────

export function onPointerDown(scene, pointer, state) {
  if (!shouldHandlePointer(state)) return;

  const pu = state.pu;
  if (!pu) return;

  const gx = scene.ux(pointer.x);
  const gy = scene.uy(pointer.y);
  const d  = getData(scene);
  const { rig } = pu;

  // Windlass handle hit test
  if (rig.windlass && !rig.windlass.claimedBy) {
    const w  = rig.windlass;
    const hx = w.centerX + Math.cos(w.angle) * w.handleRadius;
    const hy = w.centerY + Math.sin(w.angle) * w.handleRadius;
    if (Math.hypot(gx - hx, gy - hy) < 32) {
      scene.game.net.sendInput('grab', { objectId: 'windlass' });
      d.draggingCrank = true;
      return;
    }
  }

  // Effort point hit test (24px radius in world space)
  for (const ep of rig.effortPoints) {
    if (ep.claimedBy) continue;
    if (Math.hypot(gx - ep.x, gy - ep.y) < 32) {
      scene.game.net.sendInput('grab', { objectId: ep.id });
      d.draggingEffortId = ep.id;
      return;
    }
  }

  // Counterweight palette items
  if (rig.counterweight && !rig.counterweight.fixed) {
    for (const item of rig.counterweight.palette || []) {
      if (item.claimedBy) continue;
      if (Math.hypot(gx - item.x, gy - item.y) < 30) {
        scene.game.net.sendInput('grab', { objectId: item.id });
        return;
      }
    }
  }

  // Pulley palette items (building mechanic) — grab from palette or from slot
  if (rig.pulleyPalette) {
    for (const item of rig.pulleyPalette) {
      if (item.claimedBy) continue;
      if (Math.hypot(gx - item.x, gy - item.y) < 36) {
        scene.game.net.sendInput('grab', { objectId: item.id });
        d.draggingPaletteId = item.id;
        return;
      }
    }
  }
}

export function onPointerUp(scene) {
  const d = getData(scene);

  if (d.draggingCrank) {
    scene.game.net.sendInput('release');
    d.draggingCrank = false;
    return;
  }

  if (d.draggingEffortId) {
    scene.game.net.sendInput('release');
    d.draggingEffortId = null;
    return;
  }

  if (d.draggingPaletteId) {
    scene.game.net.sendInput('release');
    d.draggingPaletteId = null;
    return;
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

export function destroy(scene) {
  const d = sceneData.get(scene);
  if (!d) return;

  for (const [, cached] of d.objectTexts) {
    if (cached.emoji) cached.emoji.destroy();
    if (cached.mass)  cached.mass.destroy();
  }
  d.objectTexts.clear();

  destroyCommonUI(d, ['effortText', 'maText']);
  sceneData.delete(scene);
}
