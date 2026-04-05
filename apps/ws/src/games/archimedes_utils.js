/**
 * Archimedes — Server-side shared utilities.
 * Imported by all three module sims (ferry, seesaw, pulley).
 *
 * Provides: shared constants, ID counter factory, claim lifecycle helpers,
 * cursor-move normalization, and common initModule boilerplate.
 */

import { clamp } from './maze_utils.js';

// ── Shared constants ──────────────────────────────────────────────────────────

export const CLAIM_TIMEOUT    = 3000;  // ms — how long a claim lasts before auto-release
export const TICK_DT          = 0.05;  // s  — 50ms per simulation tick
export const CONFETTI_DURATION = 2000; // ms — confetti display window

// ── ID counter factory ────────────────────────────────────────────────────────

/**
 * Returns a nextId() function that yields "<prefix>_1", "<prefix>_2", …
 * Each module calls createIdCounter with its own prefix so IDs stay unique
 * across modules even after multiple resets.
 *
 * Usage:
 *   const nextId = createIdCounter('sw');  // → 'sw_1', 'sw_2', …
 */
export function createIdCounter(prefix) {
  let _counter = 0;
  return function nextId() { return prefix + '_' + (++_counter); };
}

// ── Claim lifecycle helpers ───────────────────────────────────────────────────

/**
 * Mark obj as claimed by player and record the claim time.
 * The player object must have an `id` property matching the playerId index.
 */
export function claimObject(obj, player, now) {
  obj.claimedBy        = player.id;
  obj.claimTime        = now;
  player.heldObjectId  = obj.id;
}

/**
 * Release the claim on obj and clear the player's held reference.
 * Player may be null (e.g. when the player has disconnected).
 */
export function releaseObject(obj, player) {
  obj.claimedBy = null;
  obj.claimTime = null;
  if (player) player.heldObjectId = null;
}

/**
 * Expire any claims older than CLAIM_TIMEOUT on the given objects array.
 * Safe to call with pu.pulleys, pu.counterweight.cwPalette, or state.objects.
 */
export function expireStaleClaimsOnObjects(objects, state, now) {
  for (const obj of objects) {
    if (obj.claimedBy && obj.claimTime && now - obj.claimTime > CLAIM_TIMEOUT) {
      const p = state.players[obj.claimedBy];
      if (p) p.heldObjectId = null;
      obj.claimedBy = null;
      obj.claimTime = null;
    }
  }
}

// ── Common cursor_move handler ────────────────────────────────────────────────

/**
 * Clamp the player's cursor position to scene bounds.
 * Call this at the start of every module's cursor_move handler, then apply
 * any module-specific follow-up (e.g. move held object, drag pivot).
 */
export function applyCursorMove(player, input, sceneWidth, sceneHeight) {
  player.cursorX = clamp(input.x || 0, 0, sceneWidth);
  player.cursorY = clamp(input.y || 0, 0, sceneHeight);
}

// ── Common initModule base ────────────────────────────────────────────────────

/**
 * Apply the state fields that every module's initModule() sets identically:
 *   state.level, state.levelId, state.levelName,
 *   state.doorOpen, state.showLevelSelect, state.message,
 *   and clear all player heldObjectIds.
 *
 * cfg must include { _level, id, name } (spread your LEVELS[lvl] entry and
 * add _level: lvl).  After calling this the module sets its own fields and
 * overwrites state.message with the real level description.
 */
export function initModuleBase(state, cfg) {
  state.level           = cfg._level;
  state.levelId         = cfg.id;
  state.levelName       = cfg.name;
  state.doorOpen        = false;
  state.showLevelSelect = false;
  state.message         = '';
  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    if (p) p.heldObjectId = null;
  }
}
