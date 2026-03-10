/**
 * Archimedes — Module 3: Pulley Builder  (complete rewrite)
 *
 * Architecture:
 *  - WeakMap sceneData (never scene.sceneData = …)
 *  - Lazy ensureUI on first renderState
 *  - Persistent labels tgtFlag / segBadge / cwLabel live as named d.* fields,
 *    NOT inside d.objectTexts — so cleanupObjectTexts never destroys them
 *  - Physically correct rope geometry with tangent contacts around pulley wheels
 */

import {
  FONT_BODY,
  FONT_SMALL,
  CLAIM_HIGHLIGHT_COLOR,
  createCommonUI,
  updateDoorButton,
  destroyCommonUI,
  shouldHandlePointer,
  updateConfetti,
  drawConfetti,
  cleanupObjectTexts,
  drawObjectEmojiCached,
} from './renderer_utils.js';

// ── WeakMap state (per-scene instance) ────────────────────────────────────────

const sceneData = new WeakMap();

function getData(scene) {
  let d = sceneData.get(scene);
  if (!d) {
    d = {
      objectTexts: new Map(),
      uiCreated:   false,
      confettiSeenAt: null,
      // standard chrome (set by ensureUI)
      levelTitle: null, msgText: null, doorText: null, resetBtn: null, lvlBtn: null,
      // module-specific persistent Text objects (NOT in objectTexts)
      effortText: null,
      hintText:   null,
      tgtFlag:    null,  // 🏁 goal-line label
      segBadge:   null,  // "N ropes" badge
      cwLabel:    null,  // "Drop 🪨 here" label
    };
    sceneData.set(scene, d);
  }
  return d;
}

// ── Visual themes ─────────────────────────────────────────────────────────────

const THEMES = {
  1: { sky: 0x1b2838, floor: 0x37474f, beam: 0x8d6e63 },
  2: { sky: 0xe3f2fd, floor: 0xa1887f, beam: 0xbcaaa4 },
  3: { sky: 0xfff8e1, floor: 0x8d6e63, beam: 0x6d4c41 },
  4: { sky: 0xcfd8dc, floor: 0x78909c, beam: 0x546e7a },
  5: { sky: 0xc8e6c9, floor: 0x66bb6a, beam: 0x795548 },
  6: { sky: 0x3e2723, floor: 0x4e342e, beam: 0x5d4037 },
};

const LOAD_EMOJI = {
  fixed_pulley:          '🏮',
  movable_pulley:        '🏛️',
  compound_pulleys:      '🗿',
  counterweight:         '⛏️',
  elevator_elephant:     '🛗',
  differential_windlass: '🪨',
};

// ── Level config tables ───────────────────────────────────────────────────────

const LCFG = {
  1: { allowMovable: false, hasCW: false, isWindlass: false, rigs: false, preRigMA: 1 },
  2: { allowMovable: true,  hasCW: false, isWindlass: false, rigs: false, preRigMA: 1 },
  3: { allowMovable: false, hasCW: false, isWindlass: false, rigs: true,  preRigMA: 1 },
  4: { allowMovable: false, hasCW: true,  isWindlass: false, rigs: false, preRigMA: 2 },
  5: { allowMovable: true,  hasCW: true,  isWindlass: false, rigs: false, preRigMA: 1 },
  6: { allowMovable: false, hasCW: false, isWindlass: true,  rigs: false, preRigMA: 1 },
};

// Geometry for non-windlass levels (all in game / logical coords)
const TOPOLOGY = {
  1: { fixed: [{ x: 400, y: 60 }], anchorLeft: null, handleX: 540, loadX: 400, cwAnchorX: null, beamX1: 200, beamX2: 620 },
  2: { fixed: [{ x: 420, y: 60 }], anchorLeft: 300,  handleX: 550, loadX: 360, cwAnchorX: null, beamX1: 220, beamX2: 620 },
  3: { fixed: [{ x: 400, y: 60 }], anchorLeft: null, handleX: 580, loadX: 360, cwAnchorX: null, beamX1: 200, beamX2: 640 },
  4: { fixed: [{ x: 420, y: 60 }], anchorLeft: 290,  handleX: 550, loadX: 360, cwAnchorX: 210, beamX1: 160, beamX2: 620 },
  5: { fixed: [{ x: 440, y: 60 }, { x: 390, y: 60 }], anchorLeft: 300, handleX: 560, loadX: 360, cwAnchorX: 190, beamX1: 160, beamX2: 630 },
  6: null,
};

const WINDLASS = { cx: 400, cy: 140, bigR: 42, smallR: 20, crankLength: 58 };

const ANCHOR_Y = 60;   // ceiling pulley axle Y
const FLOOR_Y  = 445;  // floor Y
const PULLEY_R = 14;   // fixed pulley wheel radius
const MOV_R    = 12;   // movable pulley wheel radius

// Bucket hangs at a fixed visual Y (independent of load position)
const BUCKET_Y = 285;

function getLcfg(state) { return LCFG[state.level] || LCFG[1]; }
function getTopo(state) { return TOPOLOGY[state.level] || TOPOLOGY[1]; }

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function create(scene) {
  getData(scene);
}

export function destroy(scene) {
  const d = sceneData.get(scene);
  if (!d) return;
  for (const [, c] of d.objectTexts) {
    if (c.emoji) c.emoji.destroy();
    if (c.mass)  c.mass.destroy();
  }
  d.objectTexts.clear();
  destroyCommonUI(d, ['effortText', 'hintText', 'tgtFlag', 'segBadge', 'cwLabel']);
  sceneData.delete(scene);
}

// ── Lazy UI creation ──────────────────────────────────────────────────────────

function ensureUI(scene, d) {
  if (d.uiCreated) return;
  d.uiCreated = true;

  Object.assign(d, createCommonUI(scene));

  const W = scene.scale.width, H = scene.scale.height;

  d.effortText = scene.add.text(W / 2, H - 28, '', {
    fontSize: FONT_BODY, color: '#ecf0f1', backgroundColor: '#2c3e50',
    padding: { x: 10, y: 4 },
  }).setOrigin(0.5).setDepth(200);

  d.hintText = scene.add.text(W / 2, H * 0.65, '', {
    fontSize: '22px', color: '#fff', backgroundColor: 'rgba(39,174,96,0.88)',
    padding: { x: 14, y: 8 },
  }).setOrigin(0.5).setDepth(250).setVisible(false);

  d.tgtFlag = scene.add.text(0, 0, '🏁', { fontSize: '16px' })
    .setOrigin(0, 0.5).setDepth(180).setVisible(false);

  d.segBadge = scene.add.text(0, 0, '', {
    fontSize: '14px', fontStyle: 'bold', color: '#fff',
    backgroundColor: 'rgba(46,204,113,0.9)', padding: { x: 6, y: 3 },
  }).setOrigin(0.5).setDepth(190).setVisible(false);

  d.cwLabel = scene.add.text(0, 0, 'Drop 🪨 here', {
    fontSize: FONT_SMALL, color: '#90a4ae',
  }).setOrigin(0.5).setDepth(180).setVisible(false);
}

// ── Main render ───────────────────────────────────────────────────────────────

export function renderState(scene, state) {
  const d = getData(scene);
  ensureUI(scene, d);

  const g  = scene.graphics;
  const p  = state.pulley;
  if (!p) return;

  // Include synthetic IDs so cleanupObjectTexts never prunes the load/eleph labels
  cleanupObjectTexts(d.objectTexts, [
    ...state.objects,
    { id: '_load' },
    { id: '_eleph' },
  ]);

  // screen shake
  if (p.screenShake > 0) {
    scene.cameras.main.setScroll((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  } else {
    scene.cameras.main.setScroll(0, 0);
  }

  const lc = getLcfg(state);
  const tp = getTopo(state);
  const t  = THEMES[state.level] || THEMES[1];

  // 1. Background
  drawBackground(g, scene, t);

  // 2. Height track
  drawHeightTrack(g, scene, p);

  // 3. Windlass or normal pulley system
  if (lc.isWindlass) {
    drawWindlass(g, scene, p, state);
  } else {
    const geo = buildRopeGeometry(p, lc, tp);

    drawCeilingBeam(g, scene, tp.beamX1, tp.beamX2, t.beam);

    // rope behind pulley wheels
    drawRope(g, scene, d, geo, p);

    // fixed pulley wheels
    for (const fp of tp.fixed) {
      drawPulleyWheel(g, scene, fp.x, fp.y, PULLEY_R, p.ropeConsumed, false);
    }

    // movable pulley wheels at load level
    const mc = p.movableCount || 0;
    const totalMovable = mc + (lc.preRigMA >= 2 ? 1 : 0);
    for (let i = 0; i < totalMovable; i++) {
      drawPulleyWheel(g, scene, tp.loadX + i * 20, p.loadY - 24 - i * 8,
        MOV_R, -p.ropeConsumed, true);
    }

    // anchor brackets
    for (const fp of tp.fixed) drawAnchor(g, scene, fp.x, ANCHOR_Y);
    if (tp.anchorLeft != null) drawAnchor(g, scene, tp.anchorLeft, ANCHOR_Y);

    // rope handle
    drawHandle(g, scene, tp.handleX, p.handY, p, state);
  }

  // 4. Load platform + emoji
  const loadX = tp ? tp.loadX : 400;
  drawLoadPlatform(g, scene, loadX, p.loadY);
  const lx = scene.sx(loadX), ly = scene.sy(p.loadY);
  const lvlId = ['', 'fixed_pulley', 'movable_pulley', 'compound_pulleys',
    'counterweight', 'elevator_elephant', 'differential_windlass'][state.level] || '';
  drawObjectEmojiCached(scene, d.objectTexts,
    { id: '_load', emoji: LOAD_EMOJI[lvlId] || '📦', mass: p.loadMass }, lx, ly - 28, 26);
  if (state.level === 5 && p.eventFired) {
    drawObjectEmojiCached(scene, d.objectTexts,
      { id: '_eleph', emoji: '🐘', mass: '' }, lx + 28, ly - 26, 20);
  }

  // 5. Target line
  drawTargetLine(g, scene, d, loadX, p.targetY);

  // 6. CW bucket + balance gauge
  if (lc.hasCW && tp && tp.cwAnchorX != null) {
    drawCWBucket(g, scene, d, tp.cwAnchorX);
    drawBalanceGauge(g, scene, tp.cwAnchorX, p);
  }

  // 7. CW draggable objects
  drawCWObjects(g, scene, d, state, p);

  // 8. L3 rig cards
  if (lc.rigs) drawRigCards(g, scene, p);

  // 9. Movable pulley palette
  if (lc.allowMovable) drawPulleyPalette(g, scene, state, p);

  // 10. Hint + UI chrome
  updateHint(d, p);
  updateUI(scene, d, state, p);

  updateConfetti(scene, d, state);
  drawConfetti(scene, d, state);
}

// ── Background ────────────────────────────────────────────────────────────────

function drawBackground(g, scene, t) {
  const W = scene.scale.width, H = scene.scale.height;
  const fy = scene.sy(FLOOR_Y);
  g.fillStyle(t.sky, 1);
  g.fillRect(0, 0, W, fy);
  g.fillStyle(t.floor, 1);
  g.fillRect(0, fy, W, H - fy);
}

// ── Height track ──────────────────────────────────────────────────────────────

function drawHeightTrack(g, scene, p) {
  const mx    = scene.sx(80);
  const topY  = scene.sy(p.targetY);
  const botY  = scene.sy(p.loadStartY);
  const loadY = scene.sy(p.loadY);
  const range = botY - topY;

  g.lineStyle(2, 0xffffff, 0.18);
  g.beginPath(); g.moveTo(mx, topY); g.lineTo(mx, botY); g.strokePath();

  g.lineStyle(1, 0xffffff, 0.15);
  for (let i = 0; i <= 5; i++) {
    const y = topY + (range * i) / 5;
    g.beginPath(); g.moveTo(mx - 10, y); g.lineTo(mx + 10, y); g.strokePath();
  }

  g.lineStyle(2, 0x2ecc71, 0.75);
  g.beginPath(); g.moveTo(mx - 14, loadY); g.lineTo(mx + 14, loadY); g.strokePath();
  g.fillStyle(0x2ecc71, 0.85);
  g.fillTriangle(mx + 14, loadY, mx + 22, loadY - 5, mx + 22, loadY + 5);
}

// ── Ceiling beam ──────────────────────────────────────────────────────────────

function drawCeilingBeam(g, scene, x1, x2, color) {
  const bx1 = scene.sx(x1), bx2 = scene.sx(x2);
  const by  = scene.sy(ANCHOR_Y - 22);
  const bh  = scene.sy(ANCHOR_Y) - by;
  g.fillStyle(color, 1);
  g.fillRect(bx1, by, bx2 - bx1, bh);
  g.lineStyle(2, 0x3e2723, 0.5);
  g.strokeRect(bx1, by, bx2 - bx1, bh);
}

// ── Anchor bracket (small downward triangle) ──────────────────────────────────

function drawAnchor(g, scene, gx, gy) {
  const cx = scene.sx(gx), cy = scene.sy(gy);
  g.fillStyle(0x546e7a, 0.85);
  g.fillTriangle(cx - 7, cy, cx + 7, cy, cx, cy + 10);
}

// ── Pulley wheel ──────────────────────────────────────────────────────────────

function drawPulleyWheel(g, scene, gx, gy, r, spinOffset, isMovable) {
  const cx = scene.sx(gx), cy = scene.sy(gy);
  // Convert radius: use sx difference to get screen pixels
  const sr = scene.sx(gx + r) - scene.sx(gx);

  // Bracket / hook line
  g.lineStyle(3, 0x37474f, 1);
  if (!isMovable) {
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - sr - 4); g.strokePath();
  } else {
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy + sr + 4); g.strokePath();
  }

  // Rim
  g.fillStyle(0x78909c, 1);
  g.lineStyle(3, 0x455a64, 1);
  g.fillCircle(cx, cy, sr);
  g.strokeCircle(cx, cy, sr);

  // Inner groove
  g.lineStyle(1, 0x546e7a, 0.55);
  g.strokeCircle(cx, cy, sr * 0.55);

  // 4 spokes (rotate with rope)
  const a0 = (spinOffset || 0) / 30;
  g.lineStyle(2, 0x546e7a, 0.85);
  for (let i = 0; i < 4; i++) {
    const a = a0 + (i * Math.PI) / 2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * sr * 0.88, cy + Math.sin(a) * sr * 0.88);
    g.strokePath();
  }

  // Axle
  g.fillStyle(0x37474f, 1); g.fillCircle(cx, cy, 3);
}

// ── Rope geometry ─────────────────────────────────────────────────────────────

/**
 * Compute physically-correct rope waypoints.
 * Returns { waypoints: [{x,y}], supportingIdxs: Set<number> }
 * supportingIdxs: waypoint indices that mark the END of a green-highlighted segment.
 */
function buildRopeGeometry(p, lc, tp) {
  if (lc.rigs) {
    return buildRigGeometry(p, tp);
  }

  const mc = p.movableCount || 0;
  const totalMovable = mc + (lc.preRigMA >= 2 ? 1 : 0);
  const ma = totalMovable >= 2 ? 4 : totalMovable >= 1 ? 2 : 1;

  const handleTop = { x: tp.handleX, y: ANCHOR_Y };
  const handleBot = { x: tp.handleX, y: p.handY };
  const fp0       = tp.fixed[0];
  const waypoints = [];
  const supportingIdxs = new Set();

  if (ma === 1) {
    const loadTop = { x: tp.loadX, y: p.loadY };
    const [tIn, tOut] = ropeAroundWheel(loadTop, fp0, handleTop, PULLEY_R, false);
    waypoints.push(loadTop, tIn, tOut, handleTop, handleBot);
    supportingIdxs.add(1); // loadTop → tIn  (the vertical support)

  } else if (ma === 2) {
    const ancL = { x: tp.anchorLeft, y: ANCHOR_Y };
    const mp   = { x: tp.loadX, y: p.loadY - 24 };
    const [mpIn, mpOut] = ropeAroundWheel(ancL, mp, fp0, MOV_R, true);
    const [fpIn, fpOut] = ropeAroundWheel(mp,   fp0, handleTop, PULLEY_R, false);
    waypoints.push(ancL, mpIn, mpOut, fpIn, fpOut, handleTop, handleBot);
    supportingIdxs.add(1); // ancL → mpIn
    supportingIdxs.add(3); // mpOut → fpIn

  } else {
    // ma === 4
    const ancL = { x: tp.anchorLeft, y: ANCHOR_Y };
    const mp1  = { x: tp.loadX,      y: p.loadY - 24 };
    const mp2  = { x: tp.loadX + 20, y: p.loadY - 28 };
    const fp1  = tp.fixed[0];
    const fp2  = tp.fixed[1] || { x: fp1.x - 25, y: fp1.y };
    const [mp1In, mp1Out] = ropeAroundWheel(ancL, mp1, fp2, MOV_R, true);
    const [fp2In, fp2Out] = ropeAroundWheel(mp1,  fp2, mp2, PULLEY_R, false);
    const [mp2In, mp2Out] = ropeAroundWheel(fp2,  mp2, fp1, MOV_R, true);
    const [fp1In, fp1Out] = ropeAroundWheel(mp2,  fp1, handleTop, PULLEY_R, false);
    waypoints.push(ancL, mp1In, mp1Out, fp2In, fp2Out, mp2In, mp2Out, fp1In, fp1Out, handleTop, handleBot);
    supportingIdxs.add(1);
    supportingIdxs.add(3);
    supportingIdxs.add(5);
    supportingIdxs.add(7);
  }

  return { waypoints, supportingIdxs };
}

function buildRigGeometry(p, tp) {
  const rig        = p.selectedRig || 1;
  const handleTop  = { x: tp.handleX, y: ANCHOR_Y };
  const handleBot  = { x: tp.handleX, y: p.handY };
  const fp         = tp.fixed[0];
  const waypoints  = [];
  const supportingIdxs = new Set();

  if (rig === 1) {
    const loadTop = { x: tp.loadX, y: p.loadY };
    const [tIn, tOut] = ropeAroundWheel(loadTop, fp, handleTop, PULLEY_R, false);
    waypoints.push(loadTop, tIn, tOut, handleTop, handleBot);
    supportingIdxs.add(1);

  } else if (rig === 2) {
    const ancL = { x: tp.loadX - 32, y: ANCHOR_Y };
    const mp   = { x: tp.loadX, y: p.loadY - 22 };
    const [mpIn, mpOut] = ropeAroundWheel(ancL, mp, fp, MOV_R, true);
    const [fpIn, fpOut] = ropeAroundWheel(mp,   fp, handleTop, PULLEY_R, false);
    waypoints.push(ancL, mpIn, mpOut, fpIn, fpOut, handleTop, handleBot);
    supportingIdxs.add(1);
    supportingIdxs.add(3);

  } else {
    // rig === 4
    const ancL  = { x: tp.loadX - 44, y: ANCHOR_Y };
    const vfp   = { x: tp.loadX + 12, y: ANCHOR_Y }; // virtual second fixed pulley
    const mp1   = { x: tp.loadX - 10, y: p.loadY - 22 };
    const mp2   = { x: tp.loadX + 26, y: p.loadY - 22 };
    const [mp1In, mp1Out] = ropeAroundWheel(ancL, mp1, vfp, MOV_R, true);
    const [vfpIn, vfpOut] = ropeAroundWheel(mp1,  vfp, mp2, PULLEY_R, false);
    const [mp2In, mp2Out] = ropeAroundWheel(vfp,  mp2, fp,  MOV_R, true);
    const [fpIn, fpOut]   = ropeAroundWheel(mp2,  fp,  handleTop, PULLEY_R, false);
    waypoints.push(ancL, mp1In, mp1Out, vfpIn, vfpOut, mp2In, mp2Out, fpIn, fpOut, handleTop, handleBot);
    supportingIdxs.add(1);
    supportingIdxs.add(3);
    supportingIdxs.add(5);
    supportingIdxs.add(7);

    // also draw the virtual fixed pulley wheel
    // (drawn in drawRope, not here — caller handles this via geo)
  }

  return { waypoints, supportingIdxs, rigVirtualFP: rig === 4 ? { x: tp.loadX + 12, y: ANCHOR_Y } : null };
}

/**
 * Compute the two tangent contact points where the rope touches a pulley wheel.
 * before / center / after are {x,y} in game coords.
 * isMovable: true → rope wraps under the wheel; false → rope wraps over (ceiling).
 */
function ropeAroundWheel(before, center, after, r, isMovable) {
  const d1x = center.x - before.x, d1y = center.y - before.y;
  const l1  = Math.hypot(d1x, d1y) || 1;
  const p1x = -d1y / l1, p1y = d1x / l1;   // CCW perpendicular to incoming

  const d2x = after.x - center.x, d2y = after.y - center.y;
  const l2  = Math.hypot(d2x, d2y) || 1;
  const p2x = -d2y / l2, p2y = d2x / l2;   // CCW perpendicular to outgoing

  // +1: offset to right of motion (movable → rope contacts bottom of wheel)
  // -1: offset to left of motion (ceiling → rope contacts top of wheel)
  const s = isMovable ? 1 : -1;
  return [
    { x: center.x + p1x * r * s, y: center.y + p1y * r * s },
    { x: center.x + p2x * r * s, y: center.y + p2y * r * s },
  ];
}

// ── Rope drawing ──────────────────────────────────────────────────────────────

function drawRope(g, scene, d, geo, p) {
  const { waypoints, supportingIdxs, rigVirtualFP } = geo;
  if (waypoints.length < 2) return;

  // Draw L3 rig=4 virtual fixed pulley
  if (rigVirtualFP) {
    drawPulleyWheel(g, scene, rigVirtualFP.x, rigVirtualFP.y, PULLEY_R, p.ropeConsumed, false);
  }

  // Base rope (warm brown)
  g.lineStyle(4, 0xa67c52, 1);
  polyline(g, scene, waypoints);

  // Supporting segments (bright green)
  g.lineStyle(4, 0x2ecc71, 0.85);
  for (const idx of supportingIdxs) {
    if (idx > 0 && idx < waypoints.length) {
      const a = waypoints[idx - 1], b = waypoints[idx];
      g.beginPath();
      g.moveTo(scene.sx(a.x), scene.sy(a.y));
      g.lineTo(scene.sx(b.x), scene.sy(b.y));
      g.strokePath();
    }
  }

  // Moving dash stripes
  ropeStripes(g, scene, waypoints, p.ropeConsumed);

  // Struggle glow (red pass)
  if (p.struggling) {
    g.lineStyle(4, 0xe74c3c, 0.55);
    polyline(g, scene, waypoints);
  }

  // Update segBadge
  const count = supportingIdxs.size;
  if (d.segBadge) {
    if (count > 1) {
      const idxArr = [...supportingIdxs];
      const midIdx = idxArr[Math.floor(idxArr.length / 2)];
      const pt = waypoints[midIdx - 1] || waypoints[0];
      d.segBadge
        .setPosition(scene.sx(pt.x - 38), scene.sy(pt.y))
        .setText(`${count} ropes`)
        .setVisible(true);
    } else {
      d.segBadge.setVisible(false);
    }
  }
}

function polyline(g, scene, pts) {
  g.beginPath();
  g.moveTo(scene.sx(pts[0].x), scene.sy(pts[0].y));
  for (let i = 1; i < pts.length; i++) {
    g.lineTo(scene.sx(pts[i].x), scene.sy(pts[i].y));
  }
  g.strokePath();
}

function ropeStripes(g, scene, pts, ropeOffset) {
  g.lineStyle(3, 0x5d4037, 0.85);
  const off = ((ropeOffset || 0) % 20 + 20) % 20;
  let pathLen = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = scene.sx(pts[i].x),   ay = scene.sy(pts[i].y);
    const bx = scene.sx(pts[i+1].x), by = scene.sy(pts[i+1].y);
    const segLen = Math.hypot(bx - ax, by - ay);
    if (segLen < 1) { pathLen += segLen; continue; }
    const dx = (bx - ax) / segLen, dy = (by - ay) / segLen;
    let pos = (20 - (pathLen + off) % 20) % 20;
    while (pos < segLen) {
      const sx = ax + dx * pos, sy = ay + dy * pos;
      const ex = ax + dx * Math.min(pos + 8, segLen);
      const ey = ay + dy * Math.min(pos + 8, segLen);
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.strokePath();
      pos += 20;
    }
    pathLen += segLen;
  }
}

// ── Handle ────────────────────────────────────────────────────────────────────

function drawHandle(g, scene, handleX, handY, p, state) {
  const hx = scene.sx(handleX), hy = scene.sy(handY);
  const myId = scene.game.net?.playerId;
  const held = myId && state.players?.[myId]?.heldObjectId === 'ROPE_HAND';

  g.fillStyle(0xe67e22, 1);
  g.fillRoundedRect(hx - 22, hy - 10, 44, 20, 10);

  if (held) {
    g.lineStyle(3, CLAIM_HIGHLIGHT_COLOR, 1);
    g.strokeRoundedRect(hx - 25, hy - 13, 50, 26, 12);
  }

  if (p.struggling) {
    const w = scene.time ? Math.sin(scene.time.now / 80) * 3 : 0;
    g.lineStyle(2, 0x3498db, 0.9);
    g.strokeCircle(hx + 30, hy + w, 4);
    g.strokeCircle(hx - 30, hy - 4 + w, 4);
  }
}

// ── Load platform ─────────────────────────────────────────────────────────────

function drawLoadPlatform(g, scene, loadX, loadY) {
  const lx = scene.sx(loadX), ly = scene.sy(loadY);
  g.fillStyle(0x6d4c41, 1);
  g.fillRect(lx - 36, ly, 72, 8);
  g.lineStyle(1, 0x3e2723, 0.6);
  g.strokeRect(lx - 36, ly, 72, 8);
}

// ── Target line ───────────────────────────────────────────────────────────────

function drawTargetLine(g, scene, d, loadX, targetY) {
  const lx = scene.sx(loadX);
  const ty = scene.sy(targetY);

  g.lineStyle(2, 0x27ae60, 0.55);
  for (let x = lx - 60; x < lx + 100; x += 16) {
    g.beginPath();
    g.moveTo(x, ty);
    g.lineTo(Math.min(x + 10, lx + 100), ty);
    g.strokePath();
  }

  if (d.tgtFlag) {
    d.tgtFlag.setPosition(lx + 102, ty).setVisible(true);
  }
}

// ── CW bucket & balance gauge ─────────────────────────────────────────────────

function drawCWBucket(g, scene, d, cwAnchorX) {
  const cx = scene.sx(cwAnchorX);
  const top = scene.sy(ANCHOR_Y);
  const by  = scene.sy(BUCKET_Y);

  // Independent vertical rope
  g.lineStyle(3, 0xa67c52, 0.9);
  g.beginPath(); g.moveTo(cx, top); g.lineTo(cx, by); g.strokePath();

  // Bucket (top bar + trapezoid sides)
  g.fillStyle(0x546e7a, 1);
  g.fillRect(cx - 28, by, 56, 10);
  g.lineStyle(1, 0x37474f, 1);
  g.strokeRect(cx - 28, by, 56, 10);
  g.lineStyle(2, 0x607d8b, 0.85);
  g.beginPath();
  g.moveTo(cx - 28, by);
  g.lineTo(cx - 22, by + 30);
  g.lineTo(cx + 22, by + 30);
  g.lineTo(cx + 28, by);
  g.strokePath();

  if (d.cwLabel) {
    d.cwLabel.setPosition(cx, by + 44).setVisible(true);
  }
}

function drawBalanceGauge(g, scene, cwAnchorX, p) {
  const cx = scene.sx(cwAnchorX), cy = scene.sy(ANCHOR_Y - 40);
  const r  = 28;

  g.lineStyle(6, 0xe74c3c, 0.35);
  g.beginPath(); g.arc(cx, cy, r, Math.PI, Math.PI + Math.PI / 3, false); g.strokePath();
  g.lineStyle(6, 0x2ecc71, 0.35);
  g.beginPath(); g.arc(cx, cy, r, Math.PI + Math.PI / 3, 2 * Math.PI - Math.PI / 3, false); g.strokePath();
  g.lineStyle(6, 0xe67e22, 0.35);
  g.beginPath(); g.arc(cx, cy, r, 2 * Math.PI - Math.PI / 3, 2 * Math.PI, false); g.strokePath();

  const ratio = Math.min((p.cwMass || 0) / Math.max(1, (p.loadMass || 1) / (p.ma || 1)), 1.5);
  const na = Math.PI + ratio * (Math.PI / 1.5);
  g.lineStyle(2, 0x2c3e50, 1);
  g.beginPath(); g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(na) * (r - 6), cy + Math.sin(na) * (r - 6));
  g.strokePath();
  g.fillStyle(0x2c3e50, 1); g.fillCircle(cx, cy, 3);
}

// ── Rig cards (L3) ────────────────────────────────────────────────────────────

function drawRigCards(g, scene, p) {
  const options = [
    { ma: 1, gx: 200 },
    { ma: 2, gx: 400 },
    { ma: 4, gx: 600 },
  ];
  const cardY = scene.sy(ANCHOR_Y - 38);

  for (const o of options) {
    const sel  = (p.selectedRig || 1) === o.ma;
    const fail = sel && p.struggling;
    const cx = scene.sx(o.gx);

    g.fillStyle(sel ? (fail ? 0xe74c3c : 0x27ae60) : 0xecf0f1, 1);
    g.fillRoundedRect(cx - 38, cardY - 20, 76, 40, 8);
    g.lineStyle(2, 0x2c3e50, 0.8);
    g.strokeRoundedRect(cx - 38, cardY - 20, 76, 40, 8);

    g.lineStyle(2, sel ? 0xffffff : 0x607d8b, 0.75);
    const sp = 44 / (o.ma + 1);
    for (let s = 0; s < o.ma; s++) {
      const lx2 = cx - 18 + sp * (s + 1);
      g.beginPath(); g.moveTo(lx2, cardY - 12); g.lineTo(lx2, cardY + 12); g.strokePath();
    }
  }
}

// ── Movable pulley palette ────────────────────────────────────────────────────

function drawPulleyPalette(g, scene, state, p) {
  const remaining = (p.maxMovable || 0) - (p.movableCount || 0);
  if (remaining <= 0) return;

  const px = scene.sx(700), py = scene.sy(400);
  g.fillStyle(0x607d8b, 1);
  g.fillRoundedRect(px - 20, py - 16, 40, 32, 6);
  g.fillStyle(0x455a64, 1); g.fillCircle(px, py, 11);
  g.lineStyle(2, 0x37474f, 1); g.strokeCircle(px, py, 11);

  const myId = scene.game.net?.playerId;
  if (state.players?.[myId]?.heldObjectId === 'MOVABLE_PULLEY_DRAG') {
    g.lineStyle(3, CLAIM_HIGHLIGHT_COLOR, 1);
    g.strokeRoundedRect(px - 24, py - 20, 48, 40, 8);
  }
}

// ── CW draggable objects ──────────────────────────────────────────────────────

function drawCWObjects(g, scene, d, state, p) {
  const tp = getTopo(state);
  for (const obj of state.objects) {
    let ox = scene.sx(obj.x), oy = scene.sy(obj.y);

    if (obj.inSlot) {
      // snap to bucket visual position
      const bx = tp?.cwAnchorX ?? obj.homeX;
      ox = scene.sx(bx);
      oy = scene.sy(BUCKET_Y - 18);
    }

    drawObjectEmojiCached(scene, d.objectTexts, obj, ox, oy, 18);

    if (obj.claimedBy) {
      const myId = scene.game.net?.playerId;
      const clr  = obj.claimedBy === myId ? CLAIM_HIGHLIGHT_COLOR : 0xffffff;
      g.lineStyle(3, clr, 1);
      g.strokeCircle(ox, oy, 24);
    }
  }
}

// ── Windlass (L6) ─────────────────────────────────────────────────────────────

function drawWindlass(g, scene, p, state) {
  const w = WINDLASS;
  const t = THEMES[6];

  const cx = scene.sx(w.cx), cy = scene.sy(w.cy);
  const bigR   = scene.sx(w.cx + w.bigR)   - scene.sx(w.cx);
  const smallR = scene.sx(w.cx + w.smallR) - scene.sx(w.cx);
  const loadSY = scene.sy(p.loadY);

  // Beam
  const bx1 = scene.sx(250), bx2 = scene.sx(550);
  const bby = scene.sy(30), bbh = scene.sy(50) - scene.sy(30);
  g.fillStyle(t.beam, 1); g.fillRect(bx1, bby, bx2 - bx1, bbh);
  g.lineStyle(2, 0x3e2723, 0.5); g.strokeRect(bx1, bby, bx2 - bx1, bbh);

  // Support pillars
  const floorSY = scene.sy(FLOOR_Y);
  g.lineStyle(8, t.beam, 0.8);
  g.beginPath(); g.moveTo(cx - bigR - 8, cy); g.lineTo(cx - bigR - 8, floorSY); g.strokePath();
  g.beginPath(); g.moveTo(cx + bigR + 8, cy); g.lineTo(cx + bigR + 8, floorSY); g.strokePath();

  // Outer drum
  g.fillStyle(0x795548, 1); g.lineStyle(3, 0x3e2723, 1);
  g.fillCircle(cx, cy, bigR); g.strokeCircle(cx, cy, bigR);

  // Rope coils on outer drum
  const coils = Math.floor((p.ropeConsumed || 0) / 30);
  g.lineStyle(2, 0xa67c52, 0.65);
  for (let i = 0; i < Math.min(coils, 6); i++) {
    const rr = bigR - 4 - i * 3;
    if (rr > smallR + 3) g.strokeCircle(cx, cy, rr);
  }

  // Inner drum
  g.fillStyle(0xa1887f, 1); g.lineStyle(2, 0x5d4037, 1);
  g.fillCircle(cx, cy, smallR); g.strokeCircle(cx, cy, smallR);

  // Axle
  g.fillStyle(0x3e2723, 1); g.fillCircle(cx, cy, 4);

  // Crank arm + knob
  const ca = p.crankAngle || 0;
  const crankPx = scene.sx(w.cx + w.crankLength) - scene.sx(w.cx);
  const hx = cx + Math.cos(ca) * crankPx;
  const hy = cy + Math.sin(ca) * crankPx;
  g.lineStyle(6, 0x5d4037, 1);
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(hx, hy); g.strokePath();
  const knobR = scene.sx(w.cx + 9) - scene.sx(w.cx);
  g.fillStyle(0x3e2723, 1); g.fillCircle(hx, hy, knobR);

  const myId = scene.game.net?.playerId;
  if (state.players?.[myId]?.heldObjectId === 'CRANK') {
    g.lineStyle(3, CLAIM_HIGHLIGHT_COLOR, 1);
    g.strokeCircle(hx, hy, knobR + 5);
  }

  // Two independent vertical ropes from drum edges to load platform
  g.lineStyle(4, 0xa67c52, 1);
  g.beginPath(); g.moveTo(cx - bigR,  cy); g.lineTo(cx - bigR,  loadSY); g.strokePath();
  g.beginPath(); g.moveTo(cx + smallR, cy); g.lineTo(cx + smallR, loadSY); g.strokePath();

  // Animated stripes on the big-drum rope
  ropeStripes(g, scene, [
    { x: w.cx - w.bigR, y: w.cy },
    { x: w.cx - w.bigR, y: p.loadY },
  ], p.ropeConsumed);
}

// ── Hint ──────────────────────────────────────────────────────────────────────

function updateHint(d, p) {
  if (!d.hintText) return;
  if (p.hint) {
    d.hintText.setText(p.hint).setVisible(true);
  } else {
    d.hintText.setVisible(false);
  }
}

// ── UI chrome ─────────────────────────────────────────────────────────────────

function updateUI(scene, d, state, p) {
  if (!d.levelTitle) return;
  d.levelTitle.setText((state.moduleName || '') + (state.level ? `  •  Level ${state.level}` : ''));

  if (state.message) d.msgText.setText(state.message).setVisible(true);
  else               d.msgText.setVisible(false);

  updateDoorButton(d.doorText, state.doorOpen);

  if (p && d.effortText) {
    const net = Math.max(0, (p.loadMass || 0) - (p.cwMass || 0));
    const eff = net / (p.ma || 1);
    const ok  = eff <= 15;
    let txt = `Load ${p.loadMass}`;
    if (p.cwMass > 0) txt += ` − CW ${p.cwMass} = ${net}`;
    txt += `   MA ×${p.ma}   Effort ${eff.toFixed(1)}/15 ${ok ? '✅' : '❌'}`;
    d.effortText.setText(txt);
  }
}

// ── Input ─────────────────────────────────────────────────────────────────────

export function onPointerDown(scene, pointer, state) {
  if (!shouldHandlePointer(state)) return;
  const p = state.pulley;
  if (!p) return;
  const ux = scene.ux(pointer.x), uy = scene.uy(pointer.y);
  const lc = getLcfg(state);
  const tp = getTopo(state);

  // L6: windlass crank — always consume the event for this level
  if (lc.isWindlass) {
    const ca = p.crankAngle || 0;
    const kx = WINDLASS.cx + Math.cos(ca) * WINDLASS.crankLength;
    const ky = WINDLASS.cy + Math.sin(ca) * WINDLASS.crankLength;
    if (Math.hypot(ux - kx, uy - ky) < 22) {
      scene.game.net.sendInput('grab', { objectId: 'CRANK' });
    }
    return;
  }

  // L3: rig cards (band above beam)
  if (lc.rigs && uy > ANCHOR_Y - 60 && uy < ANCHOR_Y - 10) {
    if (ux > 162 && ux < 238) { scene.game.net.sendInput('grab', { objectId: 'RIG_1' }); return; }
    if (ux > 362 && ux < 438) { scene.game.net.sendInput('grab', { objectId: 'RIG_2' }); return; }
    if (ux > 562 && ux < 638) { scene.game.net.sendInput('grab', { objectId: 'RIG_4' }); return; }
  }

  // Rope handle
  if (tp && Math.hypot(ux - tp.handleX, uy - p.handY) < 40) {
    scene.game.net.sendInput('grab', { objectId: 'ROPE_HAND' });
    return;
  }

  // Movable pulley palette (top-right corner ~700,400)
  if (lc.allowMovable && (p.movableCount || 0) < (p.maxMovable || 0)) {
    if (ux > 678 && ux < 722 && uy > 382 && uy < 420) {
      scene.game.net.sendInput('grab', { objectId: 'MOVABLE_PULLEY_ICON' });
      return;
    }
  }

  // CW objects
  let best = null, bestDist = Infinity;
  for (const obj of state.objects) {
    if (obj.claimedBy) continue;
    const dist = Math.hypot(ux - obj.x, uy - obj.y);
    if (dist < 32 && dist < bestDist) { best = obj; bestDist = dist; }
  }
  if (best) scene.game.net.sendInput('grab', { objectId: best.id });
}

export function onPointerUp(scene) {
  scene.game.net.sendInput('release');
}
