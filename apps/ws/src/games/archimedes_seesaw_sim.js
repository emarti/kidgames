/**
 * Archimedes — Module 2: Seesaw Lab
 * Server-side simulation for the Seesaw/Lever module.
 *
 * Physics model: torque-driven beam on a pivot.
 *   - Objects placed on the beam exert torque = mass × beamPosition × length × g
 *   - Beam swings with damping until balanced or clamped at ground
 *
 * Exports the module interface expected by archimedes_sim.js dispatcher:
 *   { initModule, stepModule, applyModuleInput, numLevels, LEVEL_LIST }
 */

import { clamp } from './maze_utils.js';

// ── Physics constants ────────────────────────────────────────────────────────

const GRAVITY = 9.8;
const DAMPING = 0.85;                // ~1/e in 300ms (6 ticks at 50ms)
const MAX_ANGLE = Math.PI / 6;       // ±30°
const TICK_DT = 0.05;                // 50ms per tick
const BALANCE_ANGLE_TOL = 0.03;      // rad
const BALANCE_VEL_TOL = 0.005;       // rad/s
const BALANCE_TICKS = 40;
const BEAM_MASS = 10;                // virtual beam mass for inertia
const CLAIM_TIMEOUT = 3000;          // ms
const BEAM_HIT_DIST = 40;            // px tolerance for snapping to beam
const CONFETTI_DURATION = 2000;       // ms

// ── Object types ─────────────────────────────────────────────────────────────

const OBJECT_TYPES = {
  feather: { mass: 1,  size: 28, emoji: '🪶', color: '#E8D5B7', label: 'Feather' },
  apple:   { mass: 3,  size: 32, emoji: '🍎', color: '#E74C3C', label: 'Apple' },
  brick:   { mass: 5,  size: 36, emoji: '🧱', color: '#D35400', label: 'Brick' },
  rock:    { mass: 10, size: 40, emoji: '🪨', color: '#7F8C8D', label: 'Rock' },
  anvil:   { mass: 15, size: 44, emoji: '⚒️', color: '#2C3E50', label: 'Anvil' },
};

// ── Sub-levels ───────────────────────────────────────────────────────────────

const LEVELS = {
  1: {
    id: 'first_balance',
    name: '⚖️ First Balance',
    desc: 'Balance the beam!',
    beamLength: 500,
    pivotX: 400,
    baskets: true,
    pivotDraggable: false,
    pivotMinX: 400,
    pivotMaxX: 400,
    doorTarget: 1,
    palette: [
      { type: 'feather' }, { type: 'feather' },
      { type: 'apple' }, { type: 'apple', startOnBeam: 0.45, startBasket: 'right' },
    ],
  },
  2: {
    id: 'heavy_mix',
    name: '⚖️ Heavy Mix',
    desc: 'Mix different weights!',
    beamLength: 500,
    pivotX: 400,
    baskets: true,
    pivotDraggable: false,
    pivotMinX: 400,
    pivotMaxX: 400,
    doorTarget: 1,
    palette: [
      { type: 'feather' }, { type: 'apple' },
      { type: 'brick' }, { type: 'rock', startOnBeam: 0.45, startBasket: 'right' },
    ],
  },
  3: {
    id: 'free_place',
    name: '📏 Free Place',
    desc: 'Distance matters! Balance 2 times.',
    beamLength: 500,
    pivotX: 400,
    baskets: false,
    pivotDraggable: false,
    pivotMinX: 400,
    pivotMaxX: 400,
    doorTarget: 2,
    palette: [
      { type: 'feather' }, { type: 'feather' },
      { type: 'apple' }, { type: 'brick' },
      { type: 'rock', startOnBeam: 0.3 },
    ],
  },
  4: {
    id: 'moving_pivot',
    name: '🔀 Moving Pivot',
    desc: 'Move the pivot! Balance at 3 positions.',
    beamLength: 500,
    pivotX: 400,
    baskets: false,
    pivotDraggable: true,
    pivotMinX: 200,
    pivotMaxX: 600,
    doorTarget: 3,
    palette: [
      { type: 'apple' }, { type: 'brick' },
      { type: 'rock' }, { type: 'anvil', startOnBeam: 0.35 },
    ],
  },
  5: {
    id: 'archimedes_lever',
    name: '🌍 Archimedes\' Lever',
    desc: 'Give me a lever long enough…',
    beamLength: 700,
    pivotX: 500,
    baskets: false,
    pivotDraggable: true,
    pivotMinX: 150,
    pivotMaxX: 700,
    doorTarget: 1,
    palette: [
      { type: 'brick', startOnBeam: -0.35 }, { type: 'brick' },
      { type: 'rock' }, { type: 'rock' },
      { type: 'anvil' }, { type: 'anvil' },
    ],
    archimedes: true,
  },
};

const NUM_LEVELS = Object.keys(LEVELS).length;

/** Sub-level list exported for the module-select UI. */
export const LEVEL_LIST = Object.entries(LEVELS).map(([num, cfg]) => ({
  number: Number(num),
  id: cfg.id,
  name: cfg.name,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

let _idCounter = 0;
function nextId() { return 'sw_' + (++_idCounter); }

function createObject(type, x, y) {
  const def = OBJECT_TYPES[type];
  if (!def) return null;
  return {
    id: nextId(),
    type,
    x, y,
    mass: def.mass,
    size: def.size,
    emoji: def.emoji,
    color: def.color,
    label: def.label,
    onBeam: false,
    beamPosition: null,   // normalized -0.5..0.5 from pivot
    inBasket: null,       // 'left'|'right'|null
    claimedBy: null,
    claimTime: null,
  };
}

function spawnPalette(cfg) {
  const objects = [];
  const count = cfg.palette.length;
  for (let i = 0; i < count; i++) {
    const px = 150 + (i / Math.max(count - 1, 1)) * 500;
    const py = 460;
    const obj = createObject(cfg.palette[i].type, px, py);
    if (obj) objects.push(obj);
  }
  return objects;
}

/** Get the Y position on the beam at a given X, accounting for angle. */
function beamYAtX(beam, x) {
  const dx = x - beam.pivotX;
  return beam.pivotY + Math.sin(beam.angle) * dx;
}

/** Get the X extent of the beam ends. */
function beamExtents(beam) {
  const halfLen = beam.length / 2;
  return {
    leftX: beam.pivotX - halfLen * Math.cos(beam.angle),
    rightX: beam.pivotX + halfLen * Math.cos(beam.angle),
  };
}

/** Convert beamPosition (-0.5..0.5) to world X. */
function beamPosToX(beam, bp) {
  return beam.pivotX + bp * beam.length;
}

/** Convert world X to beamPosition. */
function xToBeamPos(beam, x) {
  return (x - beam.pivotX) / beam.length;
}

/** Update an object's world position from its beamPosition. */
function updateObjectFromBeam(obj, beam) {
  const worldX = beamPosToX(beam, obj.beamPosition);
  const dx = worldX - beam.pivotX;
  obj.x = worldX;
  obj.y = beam.pivotY + Math.sin(beam.angle) * dx - obj.size * 0.5;
}

// ── Module interface ─────────────────────────────────────────────────────────

export function initModule(state, subLevel) {
  const lvl = clamp(subLevel || 1, 1, NUM_LEVELS);
  const cfg = LEVELS[lvl];
  if (!cfg) return;

  state.level = lvl;
  state.levelId = cfg.id;
  state.levelName = cfg.name;
  state.doorOpen = false;
  state.showLevelSelect = false;
  state.message = '';

  // Beam
  state.beam = {
    pivotX: cfg.pivotX,
    pivotY: 320,
    length: cfg.beamLength,
    angle: 0,
    angularVelocity: 0,
    pivotDraggable: cfg.pivotDraggable,
    pivotMinX: cfg.pivotMinX,
    pivotMaxX: cfg.pivotMaxX,
  };

  // Baskets
  state.baskets = {
    enabled: cfg.baskets,
    left: { pos: -0.45 },
    right: { pos: 0.45 },
  };

  // Balance tracking
  state.balance = {
    balancedTicks: 0,
    balancedThreshold: BALANCE_TICKS,
    totalBalances: 0,
    balancedPivotPositions: [],
    wasUnbalanced: true,
  };

  // Archimedes character (level 5)
  state.archimedes = null;
  if (cfg.archimedes) {
    state.archimedes = {
      mass: 50,
      beamPosition: 0.48,
      size: 52,
      emoji: '👴',
      color: '#8E44AD',
      label: 'Archimedes',
    };
  }

  state.worldScroll = 0;
  state.confetti = null;
  state.pivotDraggedBy = null;
  state.doorTarget = cfg.doorTarget;
  state.doorProgress = 0;
  state.groundY = 430;

  // Spawn palette objects
  state.objects = spawnPalette(cfg);

  // Place starting objects on beam
  for (let i = 0; i < cfg.palette.length; i++) {
    const spec = cfg.palette[i];
    if (spec.startOnBeam != null && state.objects[i]) {
      const obj = state.objects[i];
      obj.onBeam = true;
      obj.beamPosition = spec.startOnBeam;
      obj.inBasket = spec.startBasket || null;
      updateObjectFromBeam(obj, state.beam);
    }
  }

  // Clear ferry-specific fields
  state.deliveredCount = 0;
  state.tripsCompleted = 0;
  state.cargoMass = 0;
  state.boat = null;

  // Release all player holds
  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    if (p) p.heldObjectId = null;
  }

  state.message = `${cfg.name}: ${cfg.desc}`;
}

/**
 * Seesaw simulation step. Called each tick by the dispatcher.
 */
export function stepModule(state, now) {
  const beam = state.beam;
  if (!beam) return;

  // 1. Expire stale claims
  for (const obj of state.objects) {
    if (obj.claimedBy && obj.claimTime && now - obj.claimTime > CLAIM_TIMEOUT) {
      const p = state.players[obj.claimedBy];
      if (p) p.heldObjectId = null;
      obj.claimedBy = null;
      obj.claimTime = null;
    }
  }

  // Gather objects on beam (not being held)
  const onBeam = state.objects.filter(o => o.onBeam && !o.claimedBy);

  // 2. Compute net torque
  let netTorque = 0;
  for (const obj of onBeam) {
    // torque = mass * beamPosition * length * gravity (beamPosition is -0.5..0.5)
    netTorque += obj.mass * obj.beamPosition * beam.length * GRAVITY;
  }

  // Include Archimedes character torque (level 5)
  if (state.archimedes) {
    netTorque += state.archimedes.mass * state.archimedes.beamPosition * beam.length * GRAVITY;
  }

  // 3. Moment of inertia: I = beam_mass*(L/2)^2/3 + Σ(mass * d^2)
  const halfLen = beam.length / 2;
  let I = BEAM_MASS * (halfLen * halfLen) / 3;
  for (const obj of onBeam) {
    const d = obj.beamPosition * beam.length;
    I += obj.mass * d * d;
  }
  if (state.archimedes) {
    const d = state.archimedes.beamPosition * beam.length;
    I += state.archimedes.mass * d * d;
  }

  // 4-6. Angular acceleration, velocity, angle
  const angularAccel = netTorque / Math.max(I, 1);
  beam.angularVelocity += angularAccel * TICK_DT;
  beam.angularVelocity *= DAMPING;
  beam.angle += beam.angularVelocity * TICK_DT;

  // 7. Clamp angle; bounce if beam end hits ground
  if (Math.abs(beam.angle) > MAX_ANGLE) {
    beam.angle = clamp(beam.angle, -MAX_ANGLE, MAX_ANGLE);
    beam.angularVelocity *= -0.3; // bounce
  }

  // Check if beam end hits groundY
  const leftEndY = beam.pivotY + Math.sin(beam.angle) * (-halfLen);
  const rightEndY = beam.pivotY + Math.sin(beam.angle) * halfLen;
  if (leftEndY > state.groundY || rightEndY > state.groundY) {
    beam.angularVelocity *= -0.3;
    // Push angle back so end is at groundY
    const maxSin = (state.groundY - beam.pivotY) / halfLen;
    if (leftEndY > state.groundY) {
      beam.angle = Math.max(beam.angle, -Math.asin(clamp(maxSin, -1, 1)));
    }
    if (rightEndY > state.groundY) {
      beam.angle = Math.min(beam.angle, Math.asin(clamp(maxSin, -1, 1)));
    }
  }

  // 8. Update all onBeam object positions
  for (const obj of state.objects) {
    if (obj.onBeam && !obj.claimedBy) {
      updateObjectFromBeam(obj, beam);
    }
  }

  // 9. Balance check
  const bal = state.balance;
  const isBalanced = Math.abs(beam.angle) < BALANCE_ANGLE_TOL &&
                     Math.abs(beam.angularVelocity) < BALANCE_VEL_TOL &&
                     onBeam.length > 0;

  if (isBalanced) {
    bal.balancedTicks++;
    if (bal.balancedTicks >= bal.balancedThreshold && bal.wasUnbalanced) {
      // Celebration!
      bal.totalBalances++;
      bal.wasUnbalanced = false;

      // Track pivot position for level 4
      const pivotPos = Math.round(beam.pivotX);
      const isDifferentPosition = bal.balancedPivotPositions.every(
        p => Math.abs(p - pivotPos) > 30
      );
      if (isDifferentPosition) {
        bal.balancedPivotPositions.push(pivotPos);
      }

      state.doorProgress = computeDoorProgress(state);

      // Confetti
      state.confetti = { startTime: now, x: beam.pivotX, y: beam.pivotY - 50 };

      // Check door condition
      if (state.doorProgress >= state.doorTarget && !state.doorOpen) {
        state.doorOpen = true;
        state.message = 'Balanced! Door opened!';
      } else {
        const remaining = state.doorTarget - state.doorProgress;
        state.message = remaining > 0
          ? `Balanced! ${remaining} more to go.`
          : 'Balanced!';
      }
    }
  } else {
    bal.balancedTicks = 0;
    if (!isBalanced && onBeam.length > 0) {
      bal.wasUnbalanced = true;
    }
  }

  // Clear confetti after duration
  if (state.confetti && now - state.confetti.startTime > CONFETTI_DURATION) {
    state.confetti = null;
  }

  // 10. Level 5: world scroll when balanced
  if (state.level === 5 && isBalanced && bal.balancedTicks >= bal.balancedThreshold) {
    state.worldScroll = Math.min(200, state.worldScroll + 0.5);
  }
}

function computeDoorProgress(state) {
  if (state.level === 4) {
    // Level 4: count distinct pivot positions
    return state.balance.balancedPivotPositions.length;
  }
  // Other levels: total balances
  return state.balance.totalBalances;
}

/**
 * Handle seesaw-specific input.
 */
export function applyModuleInput(state, playerId, input, now) {
  const player = state.players[playerId];
  if (!player || !player.connected) return false;

  switch (input.action) {
    case 'cursor_move': {
      player.cursorX = clamp(input.x || 0, 0, state.sceneWidth);
      player.cursorY = clamp(input.y || 0, 0, state.sceneHeight);

      // Move held object
      if (player.heldObjectId) {
        const obj = state.objects.find(o => o.id === player.heldObjectId);
        if (obj) {
          obj.x = player.cursorX;
          obj.y = player.cursorY;
        }
      }

      // Move pivot if dragging
      if (state.pivotDraggedBy === playerId && state.beam.pivotDraggable) {
        state.beam.pivotX = clamp(
          player.cursorX,
          state.beam.pivotMinX,
          state.beam.pivotMaxX
        );
        // Recalculate positions of objects on beam
        for (const obj of state.objects) {
          if (obj.onBeam && !obj.claimedBy) {
            updateObjectFromBeam(obj, state.beam);
          }
        }
      }
      return true;
    }

    case 'grab': {
      const obj = state.objects.find(o => o.id === input.objectId);
      if (!obj || obj.claimedBy) return true;

      obj.claimedBy = playerId;
      obj.claimTime = now;
      player.heldObjectId = obj.id;

      // Remove from beam
      if (obj.onBeam) {
        obj.onBeam = false;
        obj.beamPosition = null;
        obj.inBasket = null;
      }
      return true;
    }

    case 'release': {
      if (!player.heldObjectId) return true;
      const obj = state.objects.find(o => o.id === player.heldObjectId);
      if (!obj) { player.heldObjectId = null; return true; }

      obj.claimedBy = null;
      obj.claimTime = null;
      player.heldObjectId = null;

      // Hit-test: can we place on beam?
      const beam = state.beam;
      const bp = xToBeamPos(beam, obj.x);
      const beamSurfaceY = beamYAtX(beam, obj.x);
      const withinBeamX = Math.abs(bp) <= 0.5;
      const nearBeamY = Math.abs(obj.y - beamSurfaceY) < BEAM_HIT_DIST;

      if (withinBeamX && nearBeamY) {
        // Check baskets first
        if (state.baskets.enabled) {
          if (bp < -0.35) {
            obj.onBeam = true;
            obj.beamPosition = state.baskets.left.pos;
            obj.inBasket = 'left';
            updateObjectFromBeam(obj, beam);
            // Reset balance tracking for new arrangement
            state.balance.wasUnbalanced = true;
            return true;
          } else if (bp > 0.35) {
            obj.onBeam = true;
            obj.beamPosition = state.baskets.right.pos;
            obj.inBasket = 'right';
            updateObjectFromBeam(obj, beam);
            state.balance.wasUnbalanced = true;
            return true;
          }
          // If baskets enabled but dropped in middle, snap to nearest basket
          const nearestBasket = bp < 0 ? 'left' : 'right';
          obj.onBeam = true;
          obj.beamPosition = nearestBasket === 'left'
            ? state.baskets.left.pos : state.baskets.right.pos;
          obj.inBasket = nearestBasket;
          updateObjectFromBeam(obj, beam);
          state.balance.wasUnbalanced = true;
          return true;
        }

        // Free placement on beam
        obj.onBeam = true;
        obj.beamPosition = clamp(bp, -0.48, 0.48);
        obj.inBasket = null;
        updateObjectFromBeam(obj, beam);
        state.balance.wasUnbalanced = true;
        return true;
      }

      // Missed beam → return to palette area
      obj.onBeam = false;
      obj.beamPosition = null;
      obj.inBasket = null;
      obj.y = 460;
      obj.x = clamp(obj.x, 80, 720);
      return true;
    }

    case 'grab_pivot': {
      if (!state.beam.pivotDraggable) return true;
      if (state.pivotDraggedBy) return true; // someone already dragging

      // Check if pointer is near pivot
      const dist = Math.hypot(
        player.cursorX - state.beam.pivotX,
        player.cursorY - state.beam.pivotY
      );
      if (dist < 50) {
        state.pivotDraggedBy = playerId;
      }
      return true;
    }

    case 'release_pivot': {
      if (state.pivotDraggedBy === playerId) {
        state.pivotDraggedBy = null;
      }
      return true;
    }

    case 'reset': {
      // Clear beam, re-spawn palette, reset angle
      const cfg = LEVELS[state.level];
      if (!cfg) return true;

      state.beam.angle = 0;
      state.beam.angularVelocity = 0;
      state.beam.pivotX = cfg.pivotX;
      state.objects = spawnPalette(cfg);

      // Place starting objects on beam
      for (let i = 0; i < cfg.palette.length; i++) {
        const spec = cfg.palette[i];
        if (spec.startOnBeam != null && state.objects[i]) {
          const obj = state.objects[i];
          obj.onBeam = true;
          obj.beamPosition = spec.startOnBeam;
          obj.inBasket = spec.startBasket || null;
          updateObjectFromBeam(obj, state.beam);
        }
      }

      state.balance.balancedTicks = 0;
      state.balance.wasUnbalanced = true;
      state.confetti = null;
      state.pivotDraggedBy = null;
      state.message = '';

      for (const pid of [1, 2, 3, 4]) {
        const p = state.players[pid];
        if (p) p.heldObjectId = null;
      }
      return true;
    }

    case 'full_reset': {
      initModule(state, state.level);
      return true;
    }

    default:
      return false;
  }
}

/** How many sub-levels this module has. */
export const numLevels = NUM_LEVELS;
