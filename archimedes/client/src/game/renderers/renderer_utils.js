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
