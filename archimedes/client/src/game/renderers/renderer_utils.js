/**
 * Archimedes — Client-side shared renderer utilities.
 * Imported by all three module renderers (ferry, seesaw, pulley).
 *
 * Provides: shared constants, common UI creation/destruction, door button
 * update, object text cache cleanup, emoji+mass label caching, confetti
 * management, and the pointer-guard helper.
 */

// ── Shared constants ──────────────────────────────────────────────────────────

export const CLAIM_HIGHLIGHT_COLOR = 0xf1c40f;  // yellow ring on grabbed objects
export const FIXED_HIGHLIGHT_COLOR = 0x2c3e50;  // dark ring on fixed objects
export const UI_DEPTH = 200;                     // Phaser depth for all UI elements

// ── Sky / scenery drawing ─────────────────────────────────────────────────────

/**
 * Draw a gradient sky from skyTop to skyBottom over the given height.
 * Uses horizontal strips for a smooth vertical gradient.
 */
export function drawSkyGradient(g, W, groundScreenY, skyTop = 0x5ba3d9, skyBottom = 0xb4daf7) {
  const steps = 16;
  const stripH = Math.ceil(groundScreenY / steps);
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const color = lerpColor(skyTop, skyBottom, t);
    g.fillStyle(color);
    g.fillRect(0, i * stripH, W, stripH + 1);
  }
}

/**
 * Draw a simple ground strip with a grass line on top.
 */
export function drawGround(g, W, H, groundScreenY) {
  g.fillStyle(0x6b4e1f);
  g.fillRect(0, groundScreenY, W, H - groundScreenY);
  g.fillStyle(0x3a8c3f);
  g.fillRect(0, groundScreenY, W, 5);
  // Subtle dirt texture line
  g.fillStyle(0x8b6914, 0.3);
  g.fillRect(0, groundScreenY + 5, W, 2);
}

/**
 * Draw decorative static clouds. Deterministic positions based on seed offsets.
 */
export function drawClouds(g, W, time, alpha = 0.5) {
  const clouds = [
    { x: 80, y: 28, w: 70, h: 22 },
    { x: 250, y: 18, w: 55, h: 18 },
    { x: 460, y: 34, w: 80, h: 24 },
    { x: 620, y: 14, w: 60, h: 20 },
    { x: 180, y: 48, w: 50, h: 16 },
  ];
  g.fillStyle(0xffffff, alpha);
  const scaleX = W / 800;
  for (const c of clouds) {
    const cx = c.x * scaleX;
    const drift = Math.sin(time / 8000 + c.x) * 12;
    g.fillEllipse(cx + drift, c.y, c.w * scaleX, c.h);
    g.fillEllipse(cx + drift + c.w * 0.3 * scaleX, c.y - 4, c.w * 0.5 * scaleX, c.h * 0.7);
  }
}

/**
 * Draw distant hill silhouettes along the horizon.
 */
export function drawHills(g, W, groundScreenY, color = 0x2d7a3a, alpha = 0.35) {
  g.fillStyle(color, alpha);
  const scaleX = W / 800;
  const hills = [
    { cx: 100, r: 90, h: 55 },
    { cx: 300, r: 120, h: 70 },
    { cx: 550, r: 100, h: 50 },
    { cx: 720, r: 80, h: 45 },
  ];
  for (const hill of hills) {
    const cx = hill.cx * scaleX;
    const r = hill.r * scaleX;
    g.fillEllipse(cx, groundScreenY - hill.h * 0.3, r * 2, hill.h);
  }
}

/** Linear interpolation between two 0xRRGGBB colors. */
export function lerpColor(c1, c2, t) {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  const r = Math.round(r1 + (r2 - r1) * t);
  const gr = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return (r << 16) | (gr << 8) | b;
}

// ── Typography / sizing constants ─────────────────────────────────────────────
// Single source of truth for font sizes and button padding across all renderers.

export const FONT_TITLE     = '26px';   // level title
export const FONT_MSG       = '22px';   // in-game message bar
export const FONT_BODY      = '20px';   // status lines (progress/load/effort)
export const FONT_LABEL     = '18px';   // palette labels, weight labels
export const FONT_SMALL     = '18px';   // secondary labels (shore labels, etc.)
export const FONT_MASS      = '18px';   // mass number drawn on objects
export const FONT_BTN_LG    = '36px';   // large action buttons (GO, START)
export const FONT_BTN_MD    = '30px';   // medium buttons (Reset, Level select)
export const PAD_BTN_LG     = { x: 28, y: 14 };
export const PAD_BTN_MD     = { x: 18, y: 12 };
export const DOOR_FONT_IDLE = '56px';   // door emoji normal
export const DOOR_FONT_OPEN = '64px';   // door emoji when open

// ── Common UI creation ────────────────────────────────────────────────────────

/**
 * Create the five chrome elements that appear in every renderer's ensureUI():
 *   levelTitle  — level name, top-left
 *   msgText     — centre message bar (hidden by default)
 *   doorText    — 🚪 emoji button, top-right (sends 'door_click')
 *   resetBtn    — 🔄 button, bottom-right (sends 'reset')
 *   lvlBtn      — 📋 button, bottom-left (sends 'toggle_level_select')
 *
 * Returns { levelTitle, msgText, doorText, resetBtn, lvlBtn }.
 * Each renderer stores these in its sceneData and adds its own extras.
 */
export function createCommonUI(scene) {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const btnY = H - 44;

  const levelTitle = scene.add.text(12, 10, '', {
    fontSize: FONT_TITLE, color: '#1a5276', fontStyle: 'bold',
  }).setDepth(UI_DEPTH);

  const msgText = scene.add.text(W / 2, 14, '', {
    fontSize: FONT_MSG, color: '#2c3e50', backgroundColor: '#ecf0f1',
    padding: { x: 12, y: 6 },
  }).setOrigin(0.5, 0).setDepth(UI_DEPTH).setVisible(false);

  const doorText = scene.add.text(W - 16, 10, '🚪', {
    fontSize: DOOR_FONT_IDLE,
  }).setOrigin(1, 0).setDepth(UI_DEPTH).setInteractive({ useHandCursor: true });
  doorText.on('pointerdown', () => scene.game.net.sendInput('door_click'));

  const resetBtn = scene.add.text(W - 60, btnY, '🔄', {
    fontSize: FONT_BTN_MD, color: '#fff', backgroundColor: '#e74c3c',
    padding: PAD_BTN_MD,
  }).setOrigin(0.5).setDepth(UI_DEPTH).setInteractive({ useHandCursor: true });
  resetBtn.on('pointerdown', () => scene.game.net.sendInput('reset'));

  const lvlBtn = scene.add.text(16, btnY, '📋', {
    fontSize: FONT_BTN_MD, color: '#fff', backgroundColor: '#9b59b6',
    padding: PAD_BTN_MD,
  }).setOrigin(0, 0.5).setDepth(UI_DEPTH).setInteractive({ useHandCursor: true });
  lvlBtn.on('pointerdown', () => scene.game.net.sendInput('toggle_level_select'));

  return { levelTitle, msgText, doorText, resetBtn, lvlBtn };
}

// ── Completion banner ─────────────────────────────────────────────────────────

/**
 * Draw a "LEVEL COMPLETE" banner when doorOpen is true.
 * Rendered via Phaser Graphics (no persistent text objects needed).
 * Call from renderState after all module-specific drawing.
 */
export function drawCompletionBanner(scene, g, state) {
  if (!state.doorOpen) return;

  const W = scene.scale.width;
  const cx = W / 2;
  const bannerY = 56;

  // Banner background
  g.fillStyle(0x1a5a1a, 0.85);
  g.fillRoundedRect(cx - 150, bannerY, 300, 46, 10);
  g.lineStyle(2, 0x2ecc71, 0.9);
  g.strokeRoundedRect(cx - 150, bannerY, 300, 46, 10);

  // Inner glow
  g.fillStyle(0x27ae60, 0.15);
  g.fillRoundedRect(cx - 146, bannerY + 2, 292, 42, 8);

  // We need text — use a cached approach on scene
  if (!scene._completionText) {
    scene._completionText = scene.add.text(cx, bannerY + 23, '✨ LEVEL COMPLETE ✨', {
      fontSize: '22px', color: '#fff', fontStyle: 'bold',
      stroke: '#1a5a1a', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(UI_DEPTH + 10);
  }
  scene._completionText.setVisible(true);
  scene._completionText.setPosition(cx, bannerY + 23);

  // "Click 🚪 to continue" subtitle
  if (!scene._completionSub) {
    scene._completionSub = scene.add.text(cx, bannerY + 50, 'Tap 🚪 to continue', {
      fontSize: '14px', color: '#bbb',
    }).setOrigin(0.5).setDepth(UI_DEPTH + 10);
  }
  scene._completionSub.setVisible(true);
  scene._completionSub.setPosition(cx, bannerY + 50);
}

/**
 * Hide the completion banner (call when doorOpen becomes false / level resets).
 */
export function hideCompletionBanner(scene) {
  if (scene._completionText) scene._completionText.setVisible(false);
  if (scene._completionSub) scene._completionSub.setVisible(false);
}

// ── Door button state ─────────────────────────────────────────────────────────

/**
 * Update the door text/colour/size to reflect whether the door is open.
 * Called from every renderer's updateUI().
 */
export function updateDoorButton(doorText, doorOpen) {
  doorText.setText(doorOpen ? '🚪✨' : '🚪');
  doorText.setColor(doorOpen ? '#27ae60' : '#888');
  doorText.setFontSize(doorOpen ? DOOR_FONT_OPEN : DOOR_FONT_IDLE);
}

// ── Object text cache cleanup ─────────────────────────────────────────────────

/**
 * Destroy cached emoji/mass Phaser Text objects for any ids no longer present
 * in currentObjects.  currentObjects is the live state.objects array.
 *
 * Guards null emoji/mass so it's safe for renderers whose cache entries may
 * have mass: null (e.g. seesaw's earth/archimedes types).
 */
export function cleanupObjectTexts(objectTexts, currentObjects) {
  const currentIds = new Set(currentObjects.map(o => o.id));
  for (const [id, cached] of objectTexts) {
    if (!currentIds.has(id)) {
      if (cached.emoji) cached.emoji.destroy();
      if (cached.mass)  cached.mass.destroy();
      objectTexts.delete(id);
    }
  }
}

// ── Emoji + mass label caching ────────────────────────────────────────────────

/**
 * Draw a circular game object with shadow, highlight, and depth.
 * Call this INSTEAD of manually drawing the circle + calling drawObjectEmojiCached.
 */
export function drawObjectWithDepth(scene, g, objectTexts, obj, x, y, radius, colorHex) {
  const Phaser = scene.sys.game.constructor;
  // Drop shadow
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(x + 2, y + 3, radius * 2, radius * 1.7);

  // Main body
  const color = typeof colorHex === 'number' ? colorHex
    : Phaser?.Display?.Color?.HexStringToColor?.(colorHex)?.color ?? 0x999999;
  g.fillStyle(color, 0.88);
  g.fillCircle(x, y, radius);

  // Rim
  g.lineStyle(2, 0x333333, 0.4);
  g.strokeCircle(x, y, radius);

  // Specular highlight (small bright circle at upper-left)
  g.fillStyle(0xffffff, 0.25);
  g.fillCircle(x - radius * 0.3, y - radius * 0.3, radius * 0.35);

  // Emoji + mass
  drawObjectEmojiCached(scene, objectTexts, obj, x, y, radius);
}

/**
 * Create-or-update the cached Phaser Text objects (emoji + mass label) for a
 * standard circular game object.  Used by ferry and seesaw regular-type objects.
 *
 * Assumes obj.emoji and obj.mass are set.  Does NOT draw the circle itself —
 * the caller draws that before calling this.
 */
export function drawObjectEmojiCached(scene, objectTexts, obj, x, y, radius) {
  let cached = objectTexts.get(obj.id);
  if (!cached) {
    const fontSize = Math.max(20, Math.floor(radius * 1.8));
    const emoji = scene.add.text(x, y, obj.emoji, {
      fontSize: `${fontSize}px`,
    }).setOrigin(0.5).setDepth(120);
    const mass = scene.add.text(x, y + radius + 8, `${obj.mass}`, {
      fontSize: FONT_MASS, color: '#fff', fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 5, y: 3 },
    }).setOrigin(0.5).setDepth(121);
    cached = { emoji, mass };
    objectTexts.set(obj.id, cached);
  }
  cached.emoji.setPosition(x, y);
  cached.mass.setPosition(x, y + radius + 12);
  cached.mass.setText(`${obj.mass}`);
}

// ── Common UI destruction ─────────────────────────────────────────────────────

/**
 * Destroy the five standard UI keys plus any extras the renderer added.
 * extraUIKeys defaults to [] — pass renderer-specific keys like
 * ['progressText', 'loadText', 'goBtn'].
 */
export function destroyCommonUI(d, extraUIKeys = []) {
  const keys = ['levelTitle', 'msgText', 'doorText', 'resetBtn', 'lvlBtn', ...extraUIKeys];
  for (const key of keys) {
    if (d[key]) { d[key].destroy(); d[key] = null; }
  }
}

// ── Confetti management ───────────────────────────────────────────────────────

/**
 * Track when confetti first appeared using the local Phaser clock.
 * Must be called every frame before drawConfetti().
 *
 * Background: state.confetti.startTime is a server Unix timestamp which lives
 * on a completely different timeline from scene.time.now (which starts at 0).
 * We record the local time when we first see confetti and use that for elapsed.
 */
export function updateConfetti(scene, d, state) {
  if (state.confetti && !d.confettiSeenAt) {
    d.confettiSeenAt = scene.time.now;
  }
  if (!state.confetti) {
    d.confettiSeenAt = null;
  }
}

/**
 * Draw the confetti burst.  No-ops when confetti is absent or already expired.
 * Call updateConfetti() first each frame.
 */
export function drawConfetti(scene, d, state) {
  if (!state.confetti || d.confettiSeenAt == null) return;

  const g = scene.graphics;
  const c = state.confetti;
  const elapsed = scene.time.now - d.confettiSeenAt;
  if (elapsed > 2000) return;

  const progress = elapsed / 2000;
  const cx = scene.sx(c.x);
  const cy = scene.sy(c.y);
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

// ── Pointer guard ─────────────────────────────────────────────────────────────

/**
 * Returns false when the renderer should ignore a pointer-down event.
 * Each renderer's onPointerDown() starts with:
 *   if (!shouldHandlePointer(state)) return;
 */
export function shouldHandlePointer(state) {
  return state && !state.gamePaused && !state.showLevelSelect && !state.paused;
}
