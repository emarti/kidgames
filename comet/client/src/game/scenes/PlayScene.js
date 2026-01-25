import Phaser from 'phaser';
import { createTouchControls, getTouchControlsReserve, isTouchDevice } from '@games/touch-controls';

const WORLD_W = 800;
const WORLD_H = 600;

function hexToInt(hex) {
  return parseInt(String(hex).replace('#', '0x'), 16);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function jaggedPoints({ seed, cx, cy, r, points = 14, jitter = 0.22, rotation = 0 }) {
  const rand = mulberry32(seed);
  const out = [];
  for (let i = 0; i < points; i++) {
    const a = rotation + (Math.PI * 2 * i) / points;
    const k = 1 + (rand() * 2 - 1) * jitter;
    out.push({ x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k });
  }
  return out;
}

function drawPoly(g, pts) {
  if (!pts || pts.length < 3) return;
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
}

function rot(cx, cy, a, dx, dy) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

function drawRoundedRect(g, x, y, w, h, r) {
  // Phaser Graphics doesn't implement CanvasRenderingContext2D.arcTo.
  // Prefer the built-in rounded-rect helpers when available.
  if (typeof g.strokeRoundedRect === 'function') {
    g.strokeRoundedRect(x, y, w, h, r);
    return;
  }

  // Fallback: plain rect.
  if (typeof g.strokeRect === 'function') {
    g.strokeRect(x, y, w, h);
  }
}

function drawShipShape(g, { x, y, a, size, color, shape }) {
  const col = hexToInt(color ?? '#ffffff');
  const outline = 0x000000;
  const oAlpha = 0.28;
  const lw = 2;

  const s = Number(size);
  const shp = String(shape ?? 'triangle').toLowerCase();

  const fill = () => {
    g.fillStyle(col, 1);
    g.fillPath();
    g.lineStyle(lw, outline, oAlpha);
    g.strokePath();
  };

  if (shp === 'triangle') {
    const tip = rot(x, y, a, s * 1.25, 0);
    const left = rot(x, y, a, -s * 0.65, s * 0.85);
    const right = rot(x, y, a, -s * 0.65, -s * 0.85);
    g.beginPath();
    g.moveTo(tip.x, tip.y);
    g.lineTo(left.x, left.y);
    g.lineTo(right.x, right.y);
    g.closePath();
    fill();
    return;
  }

  if (shp === 'rocket') {
    // Simple rocket: pointy nose + body + small fins.
    const nose = rot(x, y, a, s * 1.25, 0);
    const shoulderL = rot(x, y, a, s * 0.35, s * 0.55);
    const shoulderR = rot(x, y, a, s * 0.35, -s * 0.55);
    const tailL = rot(x, y, a, -s * 1.05, s * 0.45);
    const tailR = rot(x, y, a, -s * 1.05, -s * 0.45);

    g.beginPath();
    g.moveTo(nose.x, nose.y);
    g.lineTo(shoulderL.x, shoulderL.y);
    g.lineTo(tailL.x, tailL.y);
    g.lineTo(tailR.x, tailR.y);
    g.lineTo(shoulderR.x, shoulderR.y);
    g.closePath();
    fill();

    // Window/cockpit
    const wnd = rot(x, y, a, s * 0.25, 0);
    g.fillStyle(0xe0f2fe, 0.55);
    g.fillCircle(wnd.x, wnd.y, Math.max(1, s * 0.18));

    // Fins
    g.fillStyle(col, 1);
    g.lineStyle(lw, outline, oAlpha);
    const finL1 = rot(x, y, a, -s * 0.55, s * 0.45);
    const finL2 = rot(x, y, a, -s * 1.05, s * 0.85);
    const finL3 = rot(x, y, a, -s * 1.05, s * 0.35);
    g.beginPath();
    g.moveTo(finL1.x, finL1.y);
    g.lineTo(finL2.x, finL2.y);
    g.lineTo(finL3.x, finL3.y);
    g.closePath();
    g.fillPath();
    g.strokePath();

    const finR1 = rot(x, y, a, -s * 0.55, -s * 0.45);
    const finR2 = rot(x, y, a, -s * 1.05, -s * 0.85);
    const finR3 = rot(x, y, a, -s * 1.05, -s * 0.35);
    g.beginPath();
    g.moveTo(finR1.x, finR1.y);
    g.lineTo(finR2.x, finR2.y);
    g.lineTo(finR3.x, finR3.y);
    g.closePath();
    g.fillPath();
    g.strokePath();

    return;
  }

  if (shp === 'ufo') {
    // UFO: saucer + hemisphere dome (simple, "creative galaxy" vibe).
    const saucerR = s * 1.05;
    const domeR = s * 0.55;

    // Saucer (flattened ellipse)
    g.fillStyle(col, 1);
    g.lineStyle(lw, outline, oAlpha);
    const pts = [];
    for (let i = 0; i < 18; i++) {
      const ang = (Math.PI * 2 * i) / 18;
      pts.push(rot(x, y, a, Math.cos(ang) * saucerR, Math.sin(ang) * saucerR * 0.55));
    }
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.fillPath();
    g.strokePath();

    // Bottom rim shadow
    g.lineStyle(Math.max(1, s * 0.12), 0x0b1020, 0.20);
    const rimA = rot(x, y, a, -saucerR * 0.95, 0);
    const rimB = rot(x, y, a, saucerR * 0.95, 0);
    g.beginPath();
    g.moveTo(rimA.x, rimA.y);
    g.lineTo(rimB.x, rimB.y);
    g.strokePath();

    // Dome (hemisphere)
    const dome = rot(x, y, a, s * 0.10, 0);
    g.fillStyle(0xe0f2fe, 0.55);
    g.lineStyle(Math.max(1, s * 0.10), 0x0b1020, 0.20);
    g.fillCircle(dome.x, dome.y, domeR);
    g.strokeCircle(dome.x, dome.y, domeR);

    // Little lights on the rim
    const lightN = 6;
    for (let i = 0; i < lightN; i++) {
      const t = (Math.PI * 2 * i) / lightN;
      const lp = rot(x, y, a, Math.cos(t) * (saucerR * 0.70), Math.sin(t) * (saucerR * 0.70) * 0.55);
      g.fillStyle(0xfde047, 0.75);
      g.fillCircle(lp.x, lp.y, Math.max(1, s * 0.10));
    }
    return;
  }

  if (shp === 'tie') {
    // TIE fighter: central sphere + two hex-ish wings.
    const off = s * 1.05;
    const wingR = s * 0.95;
    const drawWing = (sign) => {
      const cWing = rot(x, y, a, 0, sign * off);
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI * 2 * i) / 6;
        const dx = Math.cos(ang) * wingR;
        const dy = Math.sin(ang) * wingR * 1.12;
        pts.push(rot(cWing.x, cWing.y, a, dx, dy));
      }
      g.fillStyle(0x111827, 0.92);
      g.lineStyle(lw, 0x9ca3af, 0.65);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      g.fillPath();
      g.strokePath();

      // Wing inner panel
      g.lineStyle(Math.max(1, s * 0.10), 0x6b7280, 0.45);
      const pA = rot(cWing.x, cWing.y, a, -wingR * 0.35, 0);
      const pB = rot(cWing.x, cWing.y, a, wingR * 0.35, 0);
      g.beginPath();
      g.moveTo(pA.x, pA.y);
      g.lineTo(pB.x, pB.y);
      g.strokePath();
    };

    drawWing(1);
    drawWing(-1);

    // Connectors
    g.lineStyle(Math.max(1, s * 0.12), 0x9ca3af, 0.6);
    const connL = rot(x, y, a, 0, off * 0.55);
    const connR = rot(x, y, a, 0, -off * 0.55);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(connL.x, connL.y);
    g.moveTo(x, y);
    g.lineTo(connR.x, connR.y);
    g.strokePath();

    // Cockpit sphere
    g.fillStyle(0x0b1020, 0.98);
    g.lineStyle(lw, 0xe2e8f0, 0.55);
    g.fillCircle(x, y, s * 0.50);
    g.strokeCircle(x, y, s * 0.50);
    g.fillStyle(0x94a3b8, 0.30);
    g.fillCircle(x, y, s * 0.22);
    return;
  }

  if (shp === 'sts') {
    // OV-105 Endeavour (STS) top view: blunt round nose, gentle delta wings,
    // front cockpit windows, payload bay doors, and 3 aft engine bells.
    // This implementation follows a fresh silhouette spec (nose at xSpec=0, tail at 2.7).

    const xSpecToLocal = (xS) => (1.35 - xS) * s;
    const ySpecToLocal = (yS) => yS * s;
    const pLocal = (xS, yS) => ({ x: xSpecToLocal(xS), y: ySpecToLocal(yS) });
    const pWorld = (p) => rot(x, y, a, p.x, p.y);
    const ptS = (xS, yS) => pWorld(pLocal(xS, yS));

    const quadSample = (p0, c, p1, steps) => {
      const out = [];
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const it = 1 - t;
        const xq = it * it * p0.x + 2 * it * t * c.x + t * t * p1.x;
        const yq = it * it * p0.y + 2 * it * t * c.y + t * t * p1.y;
        out.push({ x: xq, y: yq });
      }
      return out;
    };

    // Spec (in units of s)
    const r = 0.18; // nose radius

    // Top edge (LOCAL): start at top nose tangent, then follow fuselage+wing to tail center.
    const topLocal = [];
    topLocal.push(pLocal(r, +r));

    // Upper fuselage: (r,r) -> (0.95,0.16)
    topLocal.push(
      ...quadSample(pLocal(r, +r), pLocal(0.45, 0.20), pLocal(0.95, 0.16), 8),
    );

    // Upper fuselage bulge: (0.95,0.16) -> (1.25,0.22)
    topLocal.push(
      ...quadSample(pLocal(0.95, 0.16), pLocal(1.10, 0.23), pLocal(1.25, 0.22), 6),
    );

    // Wing leading curve to max span: (1.25,0.22) -> (1.45,0.85)
    topLocal.push(
      ...quadSample(pLocal(1.25, 0.22), pLocal(1.05, 0.70), pLocal(1.45, 0.85), 10),
    );

    // Wing trailing edge back: (1.45,0.85) -> (2.05,0.20)
    topLocal.push(
      ...quadSample(pLocal(1.45, 0.85), pLocal(1.85, 0.55), pLocal(2.05, 0.20), 10),
    );

    // Aft taper: (2.05,0.20) -> (2.60,0.10)
    topLocal.push(
      ...quadSample(pLocal(2.05, 0.20), pLocal(2.35, 0.18), pLocal(2.60, 0.10), 7),
    );

    // Tail cap to center: (2.60,0.10) -> (2.70,0)
    topLocal.push(
      ...quadSample(pLocal(2.60, 0.10), pLocal(2.70, 0.10), pLocal(2.70, 0.0), 4),
    );

    const topEdge = topLocal.map(pWorld);

    // Bottom edge: mirror the fully-sampled top edge across centerline (y -> -y).
    const botLocal = topLocal.map((p) => ({ x: p.x, y: -p.y })).reverse();
    const botEdge = botLocal.map(pWorld);

    // Nose arc to close (front half of a circle): bottom tangent -> top tangent.
    const noseArc = [];
    const arcSteps = 12;
    for (let i = 0; i <= arcSteps; i++) {
      const t = (-Math.PI / 2) + (Math.PI * i) / arcSteps; // -90..+90
      const xSpec = r + Math.cos(t) * r;
      const ySpec = Math.sin(t) * r;
      noseArc.push(ptS(xSpec, ySpec));
    }

    // Fill outline
    g.fillStyle(col, 1);
    g.lineStyle(lw, outline, oAlpha);
    g.beginPath();
    g.moveTo(topEdge[0].x, topEdge[0].y);
    for (let i = 1; i < topEdge.length; i++) g.lineTo(topEdge[i].x, topEdge[i].y);
    for (let i = 0; i < botEdge.length; i++) g.lineTo(botEdge[i].x, botEdge[i].y);
    for (let i = 0; i < noseArc.length; i++) g.lineTo(noseArc[i].x, noseArc[i].y);
    g.closePath();
    g.fillPath();
    g.strokePath();

    // Cockpit windows (dark trapezoids near the nose; top side)
    g.fillStyle(0x0b1020, 0.88);
    const wA = ptS(0.28, 0.04);
    const wB = ptS(0.55, 0.04);
    const wC = ptS(0.52, 0.14);
    const wD = ptS(0.30, 0.14);
    g.beginPath();
    g.moveTo(wA.x, wA.y);
    g.lineTo(wB.x, wB.y);
    g.lineTo(wC.x, wC.y);
    g.lineTo(wD.x, wD.y);
    g.closePath();
    g.fillPath();

    const w2A = ptS(0.42, 0.055);
    const w2B = ptS(0.53, 0.055);
    const w2C = ptS(0.50, 0.12);
    const w2D = ptS(0.40, 0.12);
    g.beginPath();
    g.moveTo(w2A.x, w2A.y);
    g.lineTo(w2B.x, w2B.y);
    g.lineTo(w2C.x, w2C.y);
    g.lineTo(w2D.x, w2D.y);
    g.closePath();
    g.fillPath();

    // Payload bay doors (centerline stripe)
    const bayA = ptS(0.75, 0.0);
    const bayB = ptS(2.05, 0.0);
    g.lineStyle(Math.max(1, s * 0.18), 0xf8fafc, 0.45);
    g.beginPath();
    g.moveTo(bayA.x, bayA.y);
    g.lineTo(bayB.x, bayB.y);
    g.strokePath();
    g.lineStyle(Math.max(1, s * 0.06), 0x0b1020, 0.22);
    g.beginPath();
    g.moveTo(bayA.x, bayA.y);
    g.lineTo(bayB.x, bayB.y);
    g.strokePath();

    // 3 aft engine bells (strong recognizer)
    g.fillStyle(0x0b1020, 0.65);
    const er = Math.max(1, s * 0.075);
    const eX = 2.55;
    const e1 = ptS(eX, 0.08);
    const e2 = ptS(eX, 0.00);
    const e3 = ptS(eX, -0.08);
    g.fillCircle(e1.x, e1.y, er);
    g.fillCircle(e2.x, e2.y, er);
    g.fillCircle(e3.x, e3.y, er);
    return;
  }

  if (shp === 'enterprise') {
    // Original-series-ish Enterprise: saucer + secondary hull + two nacelles.
    const saucerR = s * 0.95;
    const saucer = { x, y };
    g.fillStyle(0xf8fafc, 0.92);
    g.lineStyle(lw, 0x0b1020, 0.22);
    // Approx ellipse by scaling circle points
    const pts = [];
    for (let i = 0; i < 18; i++) {
      const ang = (Math.PI * 2 * i) / 18;
      pts.push(rot(saucer.x, saucer.y, a, Math.cos(ang) * saucerR, Math.sin(ang) * saucerR * 0.75));
    }
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.fillPath();
    g.strokePath();

    // Secondary hull (behind saucer)
    const sec = rot(x, y, a, -s * 1.05, 0);
    g.fillStyle(0xe2e8f0, 0.88);
    g.lineStyle(lw, 0x0b1020, 0.20);
    const secPts = [];
    for (let i = 0; i < 16; i++) {
      const ang = (Math.PI * 2 * i) / 16;
      secPts.push(rot(sec.x, sec.y, a, Math.cos(ang) * (s * 0.55), Math.sin(ang) * (s * 0.55) * 0.55));
    }
    g.beginPath();
    g.moveTo(secPts[0].x, secPts[0].y);
    for (let i = 1; i < secPts.length; i++) g.lineTo(secPts[i].x, secPts[i].y);
    g.closePath();
    g.fillPath();
    g.strokePath();

    // Neck
    g.lineStyle(Math.max(2, s * 0.10), 0x94a3b8, 0.7);
    const neckA = rot(x, y, a, -s * 0.35, 0);
    const neckB = rot(x, y, a, -s * 0.78, 0);
    g.beginPath();
    g.moveTo(neckA.x, neckA.y);
    g.lineTo(neckB.x, neckB.y);
    g.strokePath();

    // Nacelles (make them chunkier / wider)
    const nacOff = s * 1.05;
    const nacLen = s * 1.30;
    const nacRad = s * 0.26;
    const nacBaseL = rot(x, y, a, -s * 0.55, nacOff);
    const nacBaseR = rot(x, y, a, -s * 0.55, -nacOff);

    const drawNacelle = (base) => {
      const tip = rot(base.x, base.y, a, -nacLen, 0);
      // Body as a wide capsule (thick line + end caps)
      g.lineStyle(Math.max(2, nacRad * 1.35), 0x94a3b8, 0.85);
      g.beginPath();
      g.moveTo(base.x, base.y);
      g.lineTo(tip.x, tip.y);
      g.strokePath();

      g.fillStyle(0x94a3b8, 0.92);
      g.lineStyle(Math.max(1, s * 0.10), 0x0b1020, 0.18);
      g.fillCircle(base.x, base.y, nacRad);
      g.fillCircle(tip.x, tip.y, nacRad);
      g.strokeCircle(base.x, base.y, nacRad);
      g.strokeCircle(tip.x, tip.y, nacRad);

      // Subtle inlay stripe
      g.lineStyle(Math.max(1, nacRad * 0.50), 0xe2e8f0, 0.35);
      const inA = rot(base.x, base.y, a, -nacLen * 0.15, 0);
      const inB = rot(base.x, base.y, a, -nacLen * 0.85, 0);
      g.beginPath();
      g.moveTo(inA.x, inA.y);
      g.lineTo(inB.x, inB.y);
      g.strokePath();

      // Red bussard cap
      g.fillStyle(0xef4444, 0.82);
      g.fillCircle(base.x, base.y, nacRad * 0.60);
    };

    drawNacelle(nacBaseL);
    drawNacelle(nacBaseR);

    // Pylons: attach to the secondary hull/neck (not the saucer)
    g.lineStyle(Math.max(2, s * 0.10), 0x94a3b8, 0.62);
    const pylonFrom = rot(sec.x, sec.y, a, s * 0.15, 0); // forward part of secondary hull
    g.beginPath();
    g.moveTo(pylonFrom.x, pylonFrom.y);
    g.lineTo(nacBaseL.x, nacBaseL.y);
    g.moveTo(pylonFrom.x, pylonFrom.y);
    g.lineTo(nacBaseR.x, nacBaseR.y);
    g.strokePath();

    return;
  }

  // fallback
  drawShipShape(g, { x, y, a, size: s, color, shape: 'triangle' });
}

export default class PlayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PlayScene' });

    this._lastSent = null;
    this._touchHeld = { up: false, down: false, left: false, right: false, shoot: false };
  }

  spawnCrashFireworks(worldX, worldY, dimScreen) {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;
    const start = Number.isFinite(this.time?.now) ? this.time.now : performance.now();
    this.fireworks.push({
      x: worldX,
      y: worldY,
      t0: start,
      dim: Boolean(dimScreen),
      duration: 1200,
      sparks: Array.from({ length: 28 }).map((_, i) => ({
        a: (Math.PI * 2 * i) / 28,
        s: 2.6 + (i % 5) * 0.85,
        c: this.rainbowColors[i % this.rainbowColors.length],
        x0: null,
        y0: null,
      })),
    });
  }

  renderFireworks(now) {
    if (!this.fxG) return;
    const state = this.game?.net?.latestState;
    if (!state) {
      this.fxG.clear();
      if (this.dimRect) this.dimRect.setVisible(false);
      return;
    }

    if (!this.fireworks || this.fireworks.length === 0) {
      this.fxG.clear();
      if (this.dimRect) this.dimRect.setVisible(false);
      return;
    }

    this.fxG.clear();

    const layout = this.computeLayout(state);
    const active = [];
    for (const fw of this.fireworks) {
      if (!fw || !Number.isFinite(fw.t0) || !Number.isFinite(fw.duration) || fw.duration <= 0) continue;
      const age = now - fw.t0;
      if (!Number.isFinite(age) || age < 0 || age >= fw.duration) continue;
      active.push(fw);
    }

    const shouldDim = active.some((fw) => fw && fw.dim);
    if (this.dimRect) {
      this.dimRect.setVisible(shouldDim);
      if (shouldDim) {
        this.dimRect.setPosition(0, 0);
        this.dimRect.setSize(this.scale.width, this.scale.height);
      }
    }

    for (const fw of active) {
      const age = now - fw.t0;
      const t = age / fw.duration;
      const alpha = Math.max(0, 1 - (t * 0.7));

      const p = this.worldToScreen(layout, fw.x, fw.y);

      for (const sp of fw.sparks) {
        const ease = 1 - Math.pow(1 - t, 2);
        const dist = (10 * layout.scale) + (92 * layout.scale) * sp.s * ease;
        const sx = p.x + Math.cos(sp.a) * dist;
        const sy = p.y + Math.sin(sp.a) * dist;

        if (sp.x0 == null || sp.y0 == null) {
          sp.x0 = p.x;
          sp.y0 = p.y;
        }

        const lw = Math.max(2, Math.floor(4 * layout.scale));
        this.fxG.lineStyle(lw, sp.c, 0.95 * alpha);
        this.fxG.lineBetween(sp.x0, sp.y0, sx, sy);
      }
    }

    this.fireworks = active;
    if (this.fireworks.length === 0 && this.dimRect) this.dimRect.setVisible(false);
  }

  create() {
    this.worldG = this.add.graphics();
    this.arrowG = this.add.graphics();
    this.uiG = this.add.graphics();

    // Rainbow crash FX (Hard mode)
    this.fxG = this.add.graphics();
    this.fxG.setDepth(580);

    this.dimRect = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.35);
    this.dimRect.setOrigin(0, 0);
    this.dimRect.setDepth(570);
    this.dimRect.setVisible(false);
    this.scale.on('resize', () => {
      if (!this.dimRect) return;
      this.dimRect.setPosition(0, 0);
      this.dimRect.setSize(this.scale.width, this.scale.height);
    });

    this.prevPlayerStates = {};
    this.fireworks = [];
    this.rainbowColors = [
      0xFF0000,
      0xFF7F00,
      0xFFFF00,
      0x00FF00,
      0x00FFFF,
      0x0000FF,
      0x8A2BE2,
      0xFF00FF,
    ];

    this.hudText = this.add.text(12, 10, '', { fontSize: '14px', color: '#e2e8f0' });
    this.hudText.setDepth(500);

    this.overlay = this.add.container(0, 0);
    this.overlay.setDepth(600);

    this.makeOverlayUI();

    this.setupInput();

    this.touchEnabled = isTouchDevice();
    if (this.touchEnabled) {
      this.touchControls = createTouchControls(this, {
        onDirDown: (dir) => this.onTouchDir(dir, true),
        onDirUp: (dir) => this.onTouchDir(dir, false),
        onPause: () => this.game.net.send('pause'),
        actions: [{
          id: 'shoot',
          label: 'Fire',
          theme: {
            face: '#ef4444',
            faceHover: '#f87171',
            faceDown: '#dc2626',
            stroke: '#7f1d1d',
            text: '#ffffff',
          },
        }],
        onActionDown: (id) => {
          if (id === 'shoot') this._touchHeld.shoot = true;
        },
        onActionUp: (id) => {
          if (id === 'shoot') this._touchHeld.shoot = false;
        },
      });
    }

    this.onState = (e) => this.renderState(e.detail);
    this.game.net.addEventListener('state', this.onState);

    if (this.game.net.latestState) this.renderState(this.game.net.latestState);
  }

  shutdown() {
    if (this.onState) this.game.net.removeEventListener('state', this.onState);
  }

  onTouchDir(dir, isDown) {
    if (dir === 'UP') this._touchHeld.up = isDown;
    if (dir === 'DOWN') this._touchHeld.down = isDown;
    if (dir === 'LEFT') this._touchHeld.left = isDown;
    if (dir === 'RIGHT') this._touchHeld.right = isDown;
  }

  setupInput() {
    window.focus();

    this.cursors = this.input.keyboard.createCursorKeys();

    this.wasd = {
      up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyEnter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

    this.input.keyboard.on('keydown-P', () => this.game.net.send('pause'));
    this.input.keyboard.on('keydown-ENTER', () => this.game.net.send('resume'));

    this.scale.on('resize', () => this.layoutOverlay());
  }

  reserve() {
    // For Comet we prefer maximum playfield size on phones/tablets.
    // Touch controls intentionally overlap the world (bottom-right).
    return { w: 0, h: 0 };
  }

  computeLayout(state) {
    const w = Number(state?.w ?? WORLD_W);
    const h = Number(state?.h ?? WORLD_H);

    const reserve = this.reserve();
    const usableW = Math.max(200, this.scale.width);
    const usableH = Math.max(200, this.scale.height);

    const scale = Math.min(usableW / w, usableH / h);

    const drawW = w * scale;
    const drawH = h * scale;

    const offsetX = Math.floor((usableW - drawW) / 2);
    const offsetY = Math.floor((usableH - drawH) / 2);

    return { w, h, scale, drawW, drawH, offsetX, offsetY, reserve };
  }

  worldToScreen(layout, x, y) {
    return {
      x: layout.offsetX + x * layout.scale,
      y: layout.offsetY + y * layout.scale,
    };
  }

  makeOverlayUI() {
    this._overlayW = 700;
    this._overlayH = 520;
    const panel = this.add.rectangle(0, 0, this._overlayW, this._overlayH, 0x0b1220, 0.88).setOrigin(0.5);
    panel.setStrokeStyle(2, 0x334155, 1);

    const title = this.add.text(0, -222, 'COMET', { fontSize: '36px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    this.overlayInfo = this.add.text(0, -184, '', { fontSize: '14px', color: '#cbd5e1', align: 'center' }).setOrigin(0.5);

    this.difficultyLabel = this.add.text(-320, -136, 'Difficulty:', { fontSize: '16px', color: '#e2e8f0' }).setOrigin(0, 0.5);
    this.btnDiffEasy = this.makeButton(-180, -136, 'Easy', () => this.game.net.send('select_difficulty', { difficulty: 'easy' }), { w: 110, h: 38 });
    this.btnDiffMed = this.makeButton(-40, -136, 'Medium', () => this.game.net.send('select_difficulty', { difficulty: 'medium' }), { w: 110, h: 38 });
    this.btnDiffHard = this.makeButton(100, -136, 'Hard', () => this.game.net.send('select_difficulty', { difficulty: 'hard' }), { w: 110, h: 38 });

    this.topologyLabel = this.add.text(-320, -92, 'Topology:', { fontSize: '16px', color: '#e2e8f0' }).setOrigin(0, 0.5);

    this.btnTopoRegular = this.makeButton(-180, -92, 'Regular', () => this.game.net.send('select_topology', { mode: 'regular' }), { w: 110, h: 38 });
    this.btnTopoKlein = this.makeButton(-40, -92, 'Klein', () => this.game.net.send('select_topology', { mode: 'klein' }), { w: 110, h: 38 });
    this.btnTopoProj = this.makeButton(100, -92, 'Projective', () => this.game.net.send('select_topology', { mode: 'projective' }), { w: 110, h: 38 });

    this.colorLabel = this.add.text(-320, -48, 'Color:', { fontSize: '16px', color: '#e2e8f0' }).setOrigin(0, 0.5);

    const colors = [
      '#ff4d4d', // red
      '#4da6ff', // blue
      '#a78bfa', // purple
      '#ffd24d', // yellow
      '#4dff4d', // green
      '#ff7a18', // orange
    ];
    const colsPerRow = 6;
    const startY = -48;
    const stepX = 56;
    const startX = -((Math.min(colors.length, colsPerRow) - 1) * stepX) / 2;

    this.colorBtns = colors.map((c, i) => {
      const col = i % colsPerRow;
      const row = Math.floor(i / colsPerRow);
      const x = startX + col * stepX;
      const y = startY + row * 0;
      const btn = this.add.rectangle(x, y, 40, 26, hexToInt(c), 1).setOrigin(0.5);
      btn.setStrokeStyle(2, 0xe2e8f0, 0.7);
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => this.game.net.send('select_color', { color: c }));
      return { c, btn };
    });

    this.shapeLabel = this.add.text(-320, 20, 'Ship:', { fontSize: '16px', color: '#e2e8f0' }).setOrigin(0, 0.5);
    this.shapeButtons = [
      { id: 'triangle' },
      { id: 'rocket' },
      { id: 'ufo' },
      { id: 'tie' },
      { id: 'enterprise' },
    ].map((s, i) => {
      // Single row to avoid overlap and reduce vertical height.
      const x = -192 + i * 96;
      const y = 70;
      const btn = this.makeIconButton(x, y, () => this.game.net.send('select_shape', { shape: s.id }), {
        w: 86,
        h: 52,
        shape: s.id,
      });
      return { id: s.id, btn };
    });

    this.startBtn = this.makeButton(0, 165, 'Start / Resume', () => this.game.net.send('resume'), { w: 240, h: 42 });

    this.overlayHelp = this.add.text(0, 224, 'WASD/Arrows: turn + thrust + brake\nSpace: fire', {
      fontSize: '14px',
      color: '#cbd5e1',
      align: 'center',
    }).setOrigin(0.5);

    this.overlay.add([
      panel,
      title,
      this.overlayInfo,
      this.difficultyLabel,
      this.btnDiffEasy,
      this.btnDiffMed,
      this.btnDiffHard,
      this.topologyLabel,
      this.btnTopoRegular,
      this.btnTopoKlein,
      this.btnTopoProj,
      this.colorLabel,
      ...this.colorBtns.map((b) => b.btn),
      this.shapeLabel,
      ...this.shapeButtons.map((s) => s.btn),
      this.startBtn,
      this.overlayHelp,
    ]);

    this.layoutOverlay();
  }

  layoutOverlay() {
    this.overlay.setPosition(this.scale.width / 2, this.scale.height / 2);

    // Prevent overflow on small screens.
    const w = this._overlayW ?? 560;
    const h = this._overlayH ?? 420;
    const margin = 24;
    const sx = (this.scale.width - margin * 2) / w;
    const sy = (this.scale.height - margin * 2) / h;
    // Allow overlay to be a bit bigger on large screens.
    const s = Math.max(0.5, Math.min(1.15, sx, sy));
    this.overlay.setScale(s);
  }

  makeButton(x, y, label, onClick, { w = 120, h = 40 } = {}) {
    const c = this.add.container(x, y);

    const bg = this.add.rectangle(0, 0, w, h, 0xe2e8f0, 1).setOrigin(0.5);
    bg.setStrokeStyle(2, 0x334155, 1);
    bg.setInteractive({ useHandCursor: true });

    const text = this.add.text(0, 0, label, { fontSize: '15px', color: '#0b0f1a', fontStyle: 'bold' }).setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0xf1f5f9, 1));
    bg.on('pointerout', () => bg.setFillStyle(0xe2e8f0, 1));
    bg.on('pointerdown', () => {
      bg.setFillStyle(0xcbd5e1, 1);
      if (onClick) onClick();
    });

    c.add([bg, text]);
    c._bg = bg;
    c._text = text;
    return c;
  }

  makeIconButton(x, y, onClick, { w = 110, h = 60, shape = 'triangle' } = {}) {
    const c = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, w, h, 0xe2e8f0, 1).setOrigin(0.5);
    bg.setStrokeStyle(2, 0x334155, 1);
    bg.setInteractive({ useHandCursor: true });

    const icon = this.add.graphics();
    const pad = 10;
    const cx = 0;
    const cy = 0;
    const s = Math.min(w, h) * 0.30 * 0.8;
    const a = -Math.PI / 2;

    // Draw into the icon graphics in local container coords.
    const redraw = (selected) => {
      icon.clear();
      // Small ship icon always uses neutral color; selection highlighting is in bg.
      drawShipShape(icon, {
        x: cx,
        y: cy,
        a,
        size: s,
        color: '#0b0f1a',
        shape,
      });
      // Small inner border
      icon.lineStyle(1, 0x334155, 0.25);
      drawRoundedRect(icon, -w / 2 + pad, -h / 2 + pad, w - pad * 2, h - pad * 2, 10);
    };

    bg.on('pointerover', () => bg.setFillStyle(0xf1f5f9, 1));
    bg.on('pointerout', () => bg.setFillStyle(0xe2e8f0, 1));
    bg.on('pointerdown', () => {
      bg.setFillStyle(0xcbd5e1, 1);
      if (onClick) onClick();
    });

    c.add([bg, icon]);
    c._bg = bg;
    c._icon = icon;
    c._redraw = redraw;
    redraw(false);
    return c;
  }

  update(time, delta) {
    const net = this.game.net;
    const state = net.latestState;
    if (!state) return;

    this.renderFireworks(time);

    const me = state.players?.[net.playerId];

    // Gather keyboard input
    const left = Boolean(this.cursors.left.isDown || this.wasd.left.isDown || this._touchHeld.left);
    const right = Boolean(this.cursors.right.isDown || this.wasd.right.isDown || this._touchHeld.right);
    const up = Boolean(this.cursors.up.isDown || this.wasd.up.isDown || this._touchHeld.up);
    const down = Boolean(this.cursors.down.isDown || this.wasd.down.isDown || this._touchHeld.down);

    const turn = left && !right ? -1 : right && !left ? 1 : 0;
    const thrust = up;
    const brake = down;

    const shoot = Boolean(this.keySpace.isDown || this._touchHeld.shoot);

    const input = { turn, thrust, brake, shoot };

    // Only send if it changed (but ensure we send at least once after join)
    const key = JSON.stringify(input);
    if (this._lastSent !== key) {
      this._lastSent = key;
      net.send('input', input);
    }

    // Overlay visibility
    const shouldShowOverlay = Boolean(state.paused || me?.paused);
    this.overlay.setVisible(shouldShowOverlay);

    // Overlay label
    const topo = state.topology ?? 'regular';
    const diff = String(state.difficulty ?? 'easy').toLowerCase();
    this.overlayInfo.setText(`Room ${net.roomId ?? '----'}  •  You: P${net.playerId ?? '?'}  •  ${diff.toUpperCase()}  •  Topology: ${topo}`);

    // Button highlighting
    this.setTopoSelected(this.btnTopoRegular, topo === 'regular');
    this.setTopoSelected(this.btnTopoKlein, topo === 'klein');
    this.setTopoSelected(this.btnTopoProj, topo === 'projective');

    this.setTopoSelected(this.btnDiffEasy, diff === 'easy');
    this.setTopoSelected(this.btnDiffMed, diff === 'medium');
    this.setTopoSelected(this.btnDiffHard, diff === 'hard');

    if (this.overlayHelp) {
      const collide = diff === 'hard' ? 'Comets collide with ships (Hard)' : 'Comets do not collide with ships';
      this.overlayHelp.setText(`WASD/Arrows: turn + thrust + brake\nSpace: fire\n${collide}`);
    }

    const myColor = String(me?.color ?? '').toLowerCase();
    for (const b of this.colorBtns) {
      const selected = myColor && myColor === String(b.c).toLowerCase();
      b.btn.setStrokeStyle(selected ? 3 : 2, selected ? 0xffffff : 0xe2e8f0, selected ? 1 : 0.7);
    }

    const myShape = String(me?.shape ?? 'triangle').toLowerCase();
    for (const s of this.shapeButtons ?? []) {
      this.setIconSelected(s.btn, myShape === s.id);
    }

    // HUD
    this.hudText.setText(`Room ${net.roomId ?? '----'}   P${net.playerId ?? '?'}   ${diff}   ${topo}`);
  }

  setTopoSelected(btn, selected) {
    if (!btn?._bg) return;
    btn._bg.setFillStyle(selected ? 0x93c5fd : 0xe2e8f0, 1);
  }

  setIconSelected(btn, selected) {
    if (!btn?._bg) return;
    btn._bg.setFillStyle(selected ? 0x93c5fd : 0xe2e8f0, 1);
    btn._bg.setStrokeStyle(selected ? 3 : 2, selected ? 0xffffff : 0x334155, 1);
    if (typeof btn._redraw === 'function') btn._redraw(selected);
  }

  renderState(state) {
    const net = this.game.net;
    const layout = this.computeLayout(state);

    // Detect hard-mode ship crash transitions (ALIVE -> WAITING)
    const diff = String(state.difficulty ?? 'easy').toLowerCase();
    if (diff === 'hard') {
      for (const pid of [1, 2, 3, 4]) {
        const pl = state.players?.[pid];
        const prev = this.prevPlayerStates?.[pid];
        const cur = pl?.state;
        if (prev === 'ALIVE' && cur && cur !== 'ALIVE') {
          const dim = Number(net.playerId) === pid;
          this.spawnCrashFireworks(pl?.x, pl?.y, dim);
        }
        if (cur) this.prevPlayerStates[pid] = cur;
      }
    } else {
      // Keep tracking so a later switch to hard doesn't miss state.
      for (const pid of [1, 2, 3, 4]) {
        const cur = state.players?.[pid]?.state;
        if (cur) this.prevPlayerStates[pid] = cur;
      }
    }

    // Clear
    this.worldG.clear();
    this.arrowG.clear();

    // World background + border
    this.worldG.fillStyle(0x050814, 1);
    this.worldG.fillRect(layout.offsetX, layout.offsetY, layout.drawW, layout.drawH);
    this.worldG.lineStyle(2, 0x334155, 1);
    this.worldG.strokeRect(layout.offsetX, layout.offsetY, layout.drawW, layout.drawH);

    this.drawTopologyArrows(layout, state.topology);

    // Comets (jagged icy shell + jagged core)
    for (const c of state.comets ?? []) {
      const p = this.worldToScreen(layout, c.x, c.y);
      const cometR = c.size >= 2 ? 38 : c.size === 1 ? 28 : 16;
      const baseR = cometR * layout.scale;

      const shellPts = jaggedPoints({
        seed: (c.seed ?? 1) ^ (c.size << 8),
        cx: p.x,
        cy: p.y,
        r: baseR,
        points: c.size >= 2 ? 18 : c.size === 1 ? 16 : 12,
        jitter: c.size >= 2 ? 0.30 : c.size === 1 ? 0.28 : 0.22,
        rotation: ((c.seed ?? 1) % 360) * (Math.PI / 180),
      });

      const corePts = jaggedPoints({
        seed: (c.seed ?? 1) ^ 0x9e3779b9,
        cx: p.x,
        cy: p.y,
        r: baseR * 0.58,
        points: c.size >= 2 ? 13 : c.size === 1 ? 11 : 9,
        jitter: 0.35,
        rotation: (((c.seed ?? 1) + 97) % 360) * (Math.PI / 180),
      });

      // Outer icy shell
      this.worldG.lineStyle(Math.max(2, 2 * layout.scale), 0xbfe7ff, 0.95);
      this.worldG.fillStyle(0x2b4c7a, 0.55);
      drawPoly(this.worldG, shellPts);
      this.worldG.fillPath();
      this.worldG.strokePath();

      // Inner jagged core
      this.worldG.lineStyle(Math.max(1, 2 * layout.scale), 0xe2e8f0, 0.55);
      this.worldG.fillStyle(0x0b1020, 0.70);
      drawPoly(this.worldG, corePts);
      this.worldG.fillPath();
      this.worldG.strokePath();
    }

    // Bullets
    this.worldG.fillStyle(0xffffff, 1);
    for (const b of state.bullets ?? []) {
      const p = this.worldToScreen(layout, b.x, b.y);
      this.worldG.fillCircle(p.x, p.y, Math.max(2, 3 * layout.scale));
    }

    // Ships (+ thruster flames)
    for (const pid of [1, 2, 3, 4]) {
      const pl = state.players?.[pid];
      if (!pl || pl.state !== 'ALIVE' || !pl.connected) continue;

      const p = this.worldToScreen(layout, pl.x, pl.y);
      const size = 14 * layout.scale;

      const a = Number(pl.angle ?? 0);
      const dirX = Math.cos(a);
      const dirY = Math.sin(a);

      // Flames
      const input = pl.input ?? {};
      const paused = Boolean(state.paused || pl.paused);
      if (!paused) {
        if (input.thrust) {
          // Rear flame (accelerating)
          const back = { x: p.x - dirX * size * 1.05, y: p.y - dirY * size * 1.05 };
          const spread = size * 0.55;
          const backL = { x: back.x + Math.cos(a + Math.PI / 2) * spread * 0.45, y: back.y + Math.sin(a + Math.PI / 2) * spread * 0.45 };
          const backR = { x: back.x + Math.cos(a - Math.PI / 2) * spread * 0.45, y: back.y + Math.sin(a - Math.PI / 2) * spread * 0.45 };
          const flameTip = { x: back.x - dirX * size * 0.9, y: back.y - dirY * size * 0.9 };

          this.worldG.fillStyle(0xffb000, 0.9);
          this.worldG.lineStyle(Math.max(1, 2 * layout.scale), 0xfff3bf, 0.65);
          this.worldG.beginPath();
          this.worldG.moveTo(backL.x, backL.y);
          this.worldG.lineTo(backR.x, backR.y);
          this.worldG.lineTo(flameTip.x, flameTip.y);
          this.worldG.closePath();
          this.worldG.fillPath();
          this.worldG.strokePath();
        }

        if (input.brake) {
          // Front braking jets: two small flames near left/right sides of the nose, angled slightly outward.
          const nose = { x: p.x + dirX * size * 1.05, y: p.y + dirY * size * 1.05 };
          const perpX = Math.cos(a + Math.PI / 2);
          const perpY = Math.sin(a + Math.PI / 2);
          const jetOffset = size * 0.55;
          const jetBaseL = { x: nose.x + perpX * jetOffset, y: nose.y + perpY * jetOffset };
          const jetBaseR = { x: nose.x - perpX * jetOffset, y: nose.y - perpY * jetOffset };

          const jetLen = size * 0.75;
          const ang = 0.22; // slight angle outward
          const jetDirL = { x: Math.cos(a + Math.PI + ang), y: Math.sin(a + Math.PI + ang) };
          const jetDirR = { x: Math.cos(a + Math.PI - ang), y: Math.sin(a + Math.PI - ang) };

          const drawJet = (base, d) => {
            const spread = size * 0.18;
            const leftWing = { x: base.x + perpX * spread, y: base.y + perpY * spread };
            const rightWing = { x: base.x - perpX * spread, y: base.y - perpY * spread };
            const tip2 = { x: base.x + d.x * jetLen, y: base.y + d.y * jetLen };

            this.worldG.fillStyle(0x60a5fa, 0.75);
            this.worldG.lineStyle(Math.max(1, 2 * layout.scale), 0xe0f2fe, 0.55);
            this.worldG.beginPath();
            this.worldG.moveTo(leftWing.x, leftWing.y);
            this.worldG.lineTo(rightWing.x, rightWing.y);
            this.worldG.lineTo(tip2.x, tip2.y);
            this.worldG.closePath();
            this.worldG.fillPath();
            this.worldG.strokePath();
          };

          drawJet(jetBaseL, jetDirL);
          drawJet(jetBaseR, jetDirR);
        }
      }

      drawShipShape(this.worldG, {
        x: p.x,
        y: p.y,
        a,
        size,
        color: pl.color,
        shape: pl.shape,
      });

      // tiny center dot
      this.worldG.fillStyle(0xffffff, 0.35);
      this.worldG.fillCircle(p.x, p.y, Math.max(1, 2 * layout.scale));
    }
  }

  drawTopologyArrows(layout, mode) {
    const topo = String(mode ?? 'regular');

    const x0 = layout.offsetX;
    const y0 = layout.offsetY;
    const x1 = layout.offsetX + layout.drawW;
    const y1 = layout.offsetY + layout.drawH;

    const stroke = 0x60a5fa;

    // Top/bottom: single arrows. Bottom reverses for klein/projective.
    const bottomFlip = topo === 'klein' || topo === 'projective';

    // Left/right: double arrows. Right reverses for projective.
    const rightFlip = topo === 'projective';

    const pad = Math.max(10, 16 * layout.scale);

    const midTop = { x: (x0 + x1) / 2, y: y0 + pad };
    const midBot = { x: (x0 + x1) / 2, y: y1 - pad };
    const midLeft = { x: x0 + pad, y: (y0 + y1) / 2 };
    const midRight = { x: x1 - pad, y: (y0 + y1) / 2 };

    this.arrowG.lineStyle(Math.max(2, 3 * layout.scale), stroke, 0.9);

    // Horizontal arrows (→)
    this.drawArrow(midTop.x - 42 * layout.scale, midTop.y, midTop.x + 42 * layout.scale, midTop.y);
    if (bottomFlip) {
      this.drawArrow(midBot.x + 42 * layout.scale, midBot.y, midBot.x - 42 * layout.scale, midBot.y);
    } else {
      this.drawArrow(midBot.x - 42 * layout.scale, midBot.y, midBot.x + 42 * layout.scale, midBot.y);
    }

    // Vertical double arrows (⇑/⇓ using two parallel arrows)
    const dy = 42 * layout.scale;
    const dx = 7 * layout.scale;

    const drawDoubleVertical = (x, y, up) => {
      const yA = y + (up ? dy : -dy);
      const yB = y + (up ? -dy : dy);
      // Two parallel arrows
      this.drawArrow(x - dx, yA, x - dx, yB);
      this.drawArrow(x + dx, yA, x + dx, yB);
    };

    drawDoubleVertical(midLeft.x, midLeft.y, true);
    drawDoubleVertical(midRight.x, midRight.y, !rightFlip);
  }

  drawArrow(x1, y1, x2, y2) {
    this.arrowG.beginPath();
    this.arrowG.moveTo(x1, y1);
    this.arrowG.lineTo(x2, y2);
    this.arrowG.strokePath();

    // Arrowhead
    const a = Math.atan2(y2 - y1, x2 - x1);
    const h = 10;

    const leftA = a + Math.PI * 0.8;
    const rightA = a - Math.PI * 0.8;
    const lx = x2 + Math.cos(leftA) * h;
    const ly = y2 + Math.sin(leftA) * h;
    const rx = x2 + Math.cos(rightA) * h;
    const ry = y2 + Math.sin(rightA) * h;

    this.arrowG.beginPath();
    this.arrowG.moveTo(x2, y2);
    this.arrowG.lineTo(lx, ly);
    this.arrowG.moveTo(x2, y2);
    this.arrowG.lineTo(rx, ry);
    this.arrowG.strokePath();
  }
}
