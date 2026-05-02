/**
 * Archimedes — Module 1: Buoyancy Ferry
 * Client-side renderer for PlayScene.
 *
 * Exports the renderer interface expected by PlayScene dispatcher:
 *   { create, renderState, onPointerDown, onPointerMove, onPointerUp, destroy }
 *
 * All functions receive the PlayScene instance as `scene` so they can access
 * scene.graphics, scene.scale, scene.game.net, coordinate helpers, etc.
 */

import Phaser from 'phaser';
import {
  createCommonUI,
  updateDoorButton,
  cleanupObjectTexts,
  drawObjectEmojiCached,
  drawObjectWithDepth,
  destroyCommonUI,
  shouldHandlePointer,
  drawSkyGradient,
  drawClouds,
  drawCompletionBanner,
  hideCompletionBanner,
  FONT_BODY,
  FONT_SMALL,
  FONT_BTN_LG,
  PAD_BTN_LG,
} from './renderer_utils.js';

// ── Constants (match server) ────────────────────────────────────────────────

const HULL_WIDTH = 200;
const HULL_HEIGHT = 60;
const EMPTY_FREEBOARD = 40;

// ── Renderer state (per-scene instance) ─────────────────────────────────────
// We store ferry-specific caches and UI elements here, keyed by scene instance.

const sceneData = new WeakMap();

function getData(scene) {
  let d = sceneData.get(scene);
  if (!d) {
    d = {
      objectTexts: new Map(),  // id → { emoji, mass }
      shoreLabels: null,
      uiCreated: false,
      // UI elements
      levelTitle: null,
      progressText: null,
      loadText: null,
      msgText: null,
      doorText: null,
      goBtn: null,
      resetBtn: null,
      lvlBtn: null,
    };
    sceneData.set(scene, d);
  }
  return d;
}

// ── Coordinate helpers (delegate to scene) ──────────────────────────────────
// These are thin wrappers; the scene must provide sx/sy/ux/uy.

function sx(scene, x) { return scene.sx(x); }
function sy(scene, y) { return scene.sy(y); }

// ── Create (one-time setup) ─────────────────────────────────────────────────

export function create(scene) {
  // Nothing extra needed for ferry — UI is lazy-created on first render.
  getData(scene); // ensure data bucket exists
}

// ── Render ──────────────────────────────────────────────────────────────────

export function renderState(scene, state) {
  const g = scene.graphics;
  const d = getData(scene);

  ensureUI(scene, d);

  // Clean up stale object text caches (e.g. after level change)
  cleanupObjectTexts(d.objectTexts, state.objects);

  const W = scene.scale.width;
  const H = scene.scale.height;
  const waterScreenY = sy(scene, state.waterY);

  // ── 1. Sky ─────────────────────────────────────────────────────────────
  drawSkyGradient(g, W, waterScreenY);
  const now = scene.time?.now || 0;
  drawClouds(g, W, now, 0.4);

  // ── 2. Shores ──────────────────────────────────────────────────────────
  const leftX = sx(scene, state.leftShoreX);
  const rightX = sx(scene, state.rightShoreX);

  // Left grass
  g.fillStyle(0x228b22);
  g.fillRect(0, waterScreenY - 6, leftX, H - waterScreenY + 6);
  g.fillStyle(0x32cd32);
  g.fillRect(0, waterScreenY - 6, leftX - 4, 6);
  g.fillStyle(0x8b4513);
  g.fillRect(leftX - 5, waterScreenY - 6, 5, H - waterScreenY + 6);

  // Right grass
  g.fillStyle(0x228b22);
  g.fillRect(rightX, waterScreenY - 6, W - rightX, H - waterScreenY + 6);
  g.fillStyle(0x32cd32);
  g.fillRect(rightX + 4, waterScreenY - 6, W - rightX - 4, 6);
  g.fillStyle(0x8b4513);
  g.fillRect(rightX, waterScreenY - 6, 5, H - waterScreenY + 6);

  // Shore labels (once)
  if (!d.shoreLabels) {
    d.shoreLabels = true;
    scene.add.text(leftX / 2, waterScreenY + 20, 'START', {
      fontSize: FONT_SMALL, color: '#fff', fontStyle: 'bold',
      stroke: '#2d5016', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(150);
    scene.add.text(rightX + (W - rightX) / 2, waterScreenY + 20, 'GOAL', {
      fontSize: FONT_SMALL, color: '#fff', fontStyle: 'bold',
      stroke: '#2d5016', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(150);
  }

  // ── 3. Boat hull ───────────────────────────────────────────────────────
  drawBoat(scene, state, waterScreenY);

  // ── 4. Objects on boat ─────────────────────────────────────────────────
  for (const obj of state.objects) {
    if (obj.onBoat || obj.claimedBy) drawObject(scene, d, state, obj);
  }

  // ── 5. Water body (overlay — covers submerged hull) ────────────────────
  g.fillStyle(0x2980b9, 0.65);
  g.fillRect(leftX, waterScreenY, rightX - leftX, H - waterScreenY);

  g.fillStyle(0x5dade2, 0.3);
  g.fillRect(leftX, waterScreenY, rightX - leftX, 14);

  g.lineStyle(3, 0x1a5276);
  g.lineBetween(leftX, waterScreenY, rightX, waterScreenY);

  g.lineStyle(1, 0x1a5276, 0.2);
  for (let i = 1; i <= 3; i++) {
    const wy = waterScreenY + 25 * i;
    if (wy < H) g.lineBetween(leftX + 5, wy, rightX - 5, wy);
  }

  // ── 6. Objects on shore ────────────────────────────────────────────────
  for (const obj of state.objects) {
    if (obj.onShore) drawObject(scene, d, state, obj);
  }

  // ── 7. Weight gauge bar ────────────────────────────────────────────────
  drawWeightGauge(scene, g, state);

  // ── 8. UI updates ─────────────────────────────────────────────────────
  updateUI(scene, d, state);
}

// ── Boat drawing ────────────────────────────────────────────────────────────

function drawBoat(scene, state, waterScreenY) {
  const g = scene.graphics;
  const boat = state.boat;
  const bx = sx(scene, boat.x);
  const deckY = sy(scene, boat.deckY);
  const keelY = deckY + sy(scene, HULL_HEIGHT) - sy(scene, 0);
  const hw = (sx(scene, HULL_WIDTH) - sx(scene, 0)) / 2;

  let rotation = boat.tilt || 0;
  if (boat.capsized) rotation += (boat.capsizeRotation || 0);
  const rad = (rotation * Math.PI) / 180;

  // Capsize splash
  if (boat.capsized && boat.capsizeRotation < 90) {
    const alpha = Math.max(0, 1 - (boat.capsizeRotation || 0) / 90);
    g.fillStyle(0x5dade2, alpha * 0.7);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dist = 40 + (1 - alpha) * 80;
      g.fillCircle(
        bx + Math.cos(a) * dist,
        waterScreenY + Math.abs(Math.sin(a)) * 15,
        8 + Math.random() * 12,
      );
    }
  }

  g.save();
  g.translateCanvas(bx, deckY);
  g.rotateCanvas(rad);

  const hullH = keelY - deckY;
  const hullColor = boat.capsized ? 0xc0392b : 0x8b4513;

  // Hull (trapezoid)
  g.fillStyle(hullColor);
  g.beginPath();
  g.moveTo(-hw, 0);
  g.lineTo(-hw * 0.8, hullH);
  g.lineTo(hw * 0.8, hullH);
  g.lineTo(hw, 0);
  g.closePath();
  g.fillPath();

  g.lineStyle(2, 0x5d4037);
  g.strokePath();

  // Deck surface
  g.fillStyle(0xa0522d);
  g.fillRect(-hw + 2, -4, hw * 2 - 4, 8);

  g.lineStyle(1, 0x8b4513, 0.4);
  for (let px = -hw + 20; px < hw; px += 25) {
    g.lineBetween(px, -4, px, 4);
  }

  g.restore();

  // Mainsail
  if (boat.hasSail && !boat.capsized) {
    const mastH = 110 * (scene.scale.height / 500);
    const mastX = bx;
    const sailRaise = 10 * (scene.scale.height / 500);
    const mastBaseY = deckY - 4 - sailRaise;
    const mastTopY = mastBaseY - mastH;

    g.lineStyle(4, 0x5d4037);
    g.lineBetween(mastX, mastBaseY, mastX, mastTopY);

    const windDir = boat.windDir || 0;
    const sailSide = windDir !== 0 ? windDir : 1;
    const boomLen = hw * 0.7;
    const boomEndX = mastX + sailSide * boomLen;

    const bellyX = mastX + sailSide * boomLen * 0.65;
    const bellyY = mastBaseY - mastH * 0.5;
    g.fillStyle(0xffffff, 0.92);
    g.beginPath();
    g.moveTo(mastX, mastTopY);
    g.lineTo(bellyX, bellyY);
    g.lineTo(boomEndX, mastBaseY);
    g.lineTo(mastX, mastBaseY);
    g.closePath();
    g.fillPath();
    g.lineStyle(1, 0xbbbbbb);
    g.strokePath();

    // Boom on top (otherwise the sail fill can obscure it).
    g.lineStyle(3, 0x5d4037);
    g.lineBetween(mastX, mastBaseY, boomEndX, mastBaseY);

    g.lineStyle(1, 0x999999, 0.6);
    g.lineBetween(mastX, mastTopY, boomEndX, mastBaseY);
  }

  // Wind particles
  if (boat.sailing && !boat.capsized && boat.windDir) {
    const windDir = boat.windDir;
    const now = scene.time?.now || Date.now();
    g.fillStyle(0xcccccc, 0.4);
    for (let i = 0; i < 6; i++) {
      const phase = ((now / 350) + i * 1.1) % 6;
      const px = bx - windDir * 140 + windDir * phase * 55;
      const py = deckY - 60 + Math.sin(phase * 2) * 25;
      const sz = 3 + Math.sin(phase) * 2;
      g.fillCircle(px, py, sz);
    }
  }

  // Overload warning
  if (state.cargoMass > 15 && !boat.capsized && !boat.sailing) {
    const warningLevel = Math.min(1, (state.cargoMass - 15) / 5);
    const warningColor = warningLevel > 0.6 ? 0xe74c3c : 0xf39c12;
    g.lineStyle(3, warningColor, 0.8);
    g.strokeCircle(bx, deckY - 20, 14);
    g.fillStyle(warningColor);
    g.fillRect(bx - 2, deckY - 28, 4, 10);
    g.fillCircle(bx, deckY - 14, 3);
  }
}

// ── Object drawing ──────────────────────────────────────────────────────────

function drawObject(scene, d, state, obj) {
  const g = scene.graphics;
  const x = sx(scene, obj.x);
  const y = sy(scene, obj.y);
  const r = obj.size * 0.4 * (scene.scale.width / 800);

  if (obj.claimedBy) {
    g.lineStyle(3, 0xf1c40f);
    g.strokeCircle(x, y, r + 5);
  }

  if (obj.delivered) {
    g.lineStyle(2, 0x27ae60);
    g.strokeCircle(x, y, r + 3);
  }

  const color = Phaser.Display.Color.HexStringToColor(obj.color).color;
  drawObjectWithDepth(scene, g, d.objectTexts, obj, x, y, r, color);
}

// ── Weight gauge ────────────────────────────────────────────────────────────

function drawWeightGauge(scene, g, state) {
  const W = scene.scale.width;
  const maxSafe = 18;
  const cargo = state.cargoMass || 0;
  const pct = Math.min(1, Math.abs(cargo) / maxSafe);

  // Position: top-right area below the door
  const barX = W - 140;
  const barY = 78;
  const barW = 120;
  const barH = 14;

  // Background
  g.fillStyle(0x2c3e50, 0.6);
  g.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
  g.fillStyle(0x34495e, 0.8);
  g.fillRect(barX, barY, barW, barH);

  // Fill color: green → orange → red
  const fillColor = pct > 0.9 ? 0xe74c3c : pct > 0.6 ? 0xf39c12 : 0x27ae60;
  g.fillStyle(fillColor, 0.9);
  g.fillRect(barX, barY, barW * pct, barH);

  // Danger line at 100%
  g.lineStyle(2, 0xe74c3c, 0.6);
  g.lineBetween(barX + barW, barY - 1, barX + barW, barY + barH + 1);

  // Border
  g.lineStyle(1, 0xbdc3c7, 0.5);
  g.strokeRect(barX, barY, barW, barH);
}

// ── UI ──────────────────────────────────────────────────────────────────────

function ensureUI(scene, d) {
  if (d.uiCreated) return;
  d.uiCreated = true;

  const W = scene.scale.width;
  const H = scene.scale.height;
  const btnY = H - 44;

  // Common chrome: levelTitle, msgText, doorText, resetBtn, lvlBtn
  Object.assign(d, createCommonUI(scene));

  // Ferry-specific extras
  d.progressText = scene.add.text(12, 50, '', {
    fontSize: FONT_BODY, color: '#555',
  }).setDepth(200);

  d.loadText = scene.add.text(12, 76, '', {
    fontSize: FONT_BODY, color: '#555',
  }).setDepth(200);

  d.goBtn = scene.add.text(W - 160, btnY, 'GO', {
    fontSize: FONT_BTN_LG, color: '#fff', backgroundColor: '#27ae60',
    padding: PAD_BTN_LG, fontStyle: 'bold',
  }).setOrigin(0.5).setDepth(200).setInteractive({ useHandCursor: true });
  d.goBtn.on('pointerdown', () => scene.game.net.sendInput('go'));
  d.goBtn.on('pointerover', () => d.goBtn.setBackgroundColor('#2ecc71'));
  d.goBtn.on('pointerout',  () => d.goBtn.setBackgroundColor('#27ae60'));
}

function updateUI(scene, d, state) {
  d.levelTitle.setText(state.levelName || `Level ${state.level}`);
  d.progressText.setText(
    `Room: ${scene.game.net.roomId || '----'}  |  ${state.deliveredCount}/${state.totalToDeliver} delivered  |  Trips: ${state.tripsCompleted}`
  );

  const maxSafe = 18;
  const pct = Math.min(100, Math.round((state.cargoMass / maxSafe) * 100));
  const loadColor = pct > 90 ? '#e74c3c' : pct > 60 ? '#f39c12' : '#27ae60';
  d.loadText.setText(`Load: ${state.cargoMass}/${maxSafe}`);
  d.loadText.setColor(loadColor);

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

  const canGo = !state.boat.sailing && !state.boat.capsized && !state.gamePaused;
  d.goBtn.setAlpha(canGo ? 1 : 0.4);
}

// ── Input handlers ──────────────────────────────────────────────────────────

export function onPointerDown(scene, pointer, state) {
  if (!shouldHandlePointer(state)) return;

  const gx = scene.ux(pointer.x);
  const gy = scene.uy(pointer.y);

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
  if (scene.draggedObjectId) {
    scene.game.net.sendInput('release');
    scene.draggedObjectId = null;
  }
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

export function destroy(scene) {
  const d = sceneData.get(scene);
  if (!d) return;

  for (const [, cached] of d.objectTexts) {
    if (cached.emoji) cached.emoji.destroy();
    if (cached.mass)  cached.mass.destroy();
  }
  d.objectTexts.clear();

  destroyCommonUI(d, ['progressText', 'loadText', 'goBtn']);

  sceneData.delete(scene);
}
