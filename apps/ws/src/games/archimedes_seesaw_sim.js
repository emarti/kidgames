/**
 * Archimedes — Module 2: Seesaw Lab
 * Server-side simulation for the Seesaw/Lever module.
 *
 * Physics model: torque-driven beam on a pivot.
 *   - Objects on the beam exert torque = mass × armDistance
 *   - Beam swings with damping until balanced or clamped at ground
 *   - Levels can use asymmetric lever arms for mechanical-advantage puzzles
 *
 * Exports the module interface expected by archimedes_sim.js dispatcher:
 *   { initModule, stepModule, applyModuleInput, numLevels, LEVEL_LIST }
 */

import { clamp } from './maze_utils.js';
import {
  CLAIM_TIMEOUT,
  TICK_DT,
  CONFETTI_DURATION,
  createIdCounter,
  claimObject,
  releaseObject,
  expireStaleClaimsOnObjects,
  applyCursorMove,
  initModuleBase,
} from './archimedes_utils.js';

// ── Physics constants ────────────────────────────────────────────────────────

const PHYSICS_SCALE = 10;      // angular acceleration scale factor
const BEAM_MASS = 1;           // normalized beam inertia
const DAMPING = 0.6065;        // = exp(−0.5); critically damped unloaded beam
const RESTORE_FACTOR = 32;     // spring constant; overdamped when loaded (ζ > 1)
const MAX_ANGLE = Math.PI / 6;       // ±30°
const BALANCE_TORQUE_TOL = 0.3;      // mass*arm units
const BALANCE_VEL_TOL = 0.02;       // rad/s
const BALANCE_TICKS = 20;           // 1 second of sustained balance
const BEAM_HIT_DIST = 42;            // px tolerance for snapping to beam
const BASKET_HANGER_LEN = 36;        // world px from beam to basket
const BASKET_ITEM_Y = 24;            // world px from basket top to item center
const BASKET_DROP_DIST = 95;         // world px tolerance for basket drop

// ── Object types ─────────────────────────────────────────────────────────────

const OBJECT_TYPES = {
  feather:     { mass: 1,  size: 28, emoji: '🪶', color: '#E8D5B7', label: 'Feather (1)' },
  pebble:      { mass: 2,  size: 30, emoji: '🥔', color: '#C39A6B', label: 'Pebble (2)' },
  tomato:      { mass: 3,  size: 32, emoji: '🍅', color: '#E74C3C', label: 'Tomato (3)' },
  melon:       { mass: 4,  size: 36, emoji: '🍉', color: '#2ECC71', label: 'Melon (4)' },
  heavy_rock:  { mass: 6,  size: 40, emoji: '🪨', color: '#7F8C8D', label: 'Heavy Rock (6)' },
  earth:       { mass: 200, size: 112, emoji: '🌍', color: '#4B77BE', label: 'Earth (200)' },
  archimedes:  { mass: 12, size: 44, emoji: '👴', color: '#8E44AD', label: 'Archimedes (12)' },
};

// ── Sub-levels ───────────────────────────────────────────────────────────────

const LEVEL2_LEFT_SET = [
  { type: 'feather' },
  { type: 'pebble' },
  { type: 'tomato' },
];

const LEVELS = {
  1: {
    id: 'fixed_four',
    name: '⚖️ Fixed Four',
    desc: 'Right basket is fixed at 4. Build 4 on the left.',
    beamLength: 520,
    pivotX: 400,
    leftArm: 260,
    rightArm: 260,
    baskets: true,
    pivotDraggable: false,
    pivotMinX: 400,
    pivotMaxX: 400,
    leftBasketPos: -0.43,
    rightBasketPos: 0.43,
    leftPlacementOnly: true,
    leftPlacementMin: -0.48,
    leftPlacementMax: -0.08,
    doorTarget: 1,
    palette: [
      { type: 'feather' },
      { type: 'feather' },
      { type: 'pebble' },
      { type: 'pebble' },
      { type: 'tomato' },
      { type: 'melon', startOnBeam: 0.43, startBasket: 'right', fixed: true, fixedSide: 'right' },
    ],
  },
  2: {
    id: 'fixed_six',
    name: '⚖️ Heavy Basket',
    desc: 'Right basket is fixed at 6. You have too many weights — find the right combination!',
    beamLength: 520,
    pivotX: 400,
    leftArm: 260,
    rightArm: 260,
    baskets: true,
    pivotDraggable: false,
    pivotMinX: 400,
    pivotMaxX: 400,
    leftBasketPos: -0.43,
    rightBasketPos: 0.43,
    leftPlacementOnly: true,
    leftPlacementMin: -0.48,
    leftPlacementMax: -0.08,
    doorTarget: 1,
    palette: [
      ...LEVEL2_LEFT_SET,
      { type: 'melon' },
      { type: 'heavy_rock', startOnBeam: 0.43, startBasket: 'right', fixed: true, fixedSide: 'right' },
    ],
  },
  3: {
    id: 'half_arm_basket',
    name: '🪨 Short Right Arm',
    desc: 'Right arm is half-length. Can you balance with half the weight?',
    beamLength: 600,
    pivotX: 400,
    leftArm: 400,
    rightArm: 200,
    baskets: true,
    pivotDraggable: false,
    pivotMinX: 400,
    pivotMaxX: 400,
    leftBasketPos: -0.6,
    rightBasketPos: 0.3,
    leftPlacementOnly: true,
    leftPlacementMin: -0.65,
    leftPlacementMax: -0.08,
    doorTarget: 1,
    palette: [
      ...LEVEL2_LEFT_SET,
      { type: 'heavy_rock', startOnBeam: 0.3, startBasket: 'right', fixed: true, fixedSide: 'right' },
    ],
  },
  4: {
    id: 'single_slider',
    name: '🎯 Sliding Fulcrum',
    desc: 'The baskets stay on the lever. Drag the pivot to balance.',
    beamLength: 600,
    pivotX: 400,
    leftArm: 400,
    rightArm: 200,
    fixedBeamEndpoints: true,
    leftEndX: 120,
    rightEndX: 680,
    baskets: true,
    basketAtEnds: true,
    basketInset: 28,
    pivotDraggable: true,
    pivotMinX: 340,
    pivotMaxX: 500,
    showPivotHint: true,
    leftPlacementOnly: true,
    leftPlacementMin: -0.65,
    leftPlacementMax: -0.08,
    doorTarget: 1,
    palette: [
      { type: 'tomato', startOnBeam: -0.58, startBasket: 'left' },
      { type: 'heavy_rock', startOnBeam: 0.58, startBasket: 'right', fixed: true, fixedSide: 'right' },
    ],
  },
  5: {
    id: 'torque_arms',
    name: '📏 Torque Arms',
    desc: 'Left side is empty. Place weights in different baskets — does position matter?',
    beamLength: 600,
    pivotX: 400,
    leftArm: 400,
    rightArm: 200,
    baskets: true,
    multiLeftBaskets: true,
    leftBasketSlots: [
      { pos: -0.15 },
      { pos: -0.40 },
      { pos: -0.60 },
    ],
    rightBasketPos: 0.30,
    pivotDraggable: false,
    pivotMinX: 400,
    pivotMaxX: 400,
    doorTarget: 2,
    palette: [
      { type: 'feather' },
      { type: 'feather' },
      { type: 'pebble' },
      { type: 'tomato' },
      { type: 'melon', startOnBeam: 0.30, startBasket: 'right', fixed: true, fixedSide: 'right' },
    ],
  },
  6: {
    id: 'earth_and_archimedes',
    name: '🌍 Archimedes & Earth',
    desc: 'Slide the fulcrum toward Earth. The answer is at the limit.',
    beamLength: 560,
    leftArm: 280,
    rightArm: 280,
    fixedBeamEndpoints: true,
    leftEndX: 130,
    rightEndX: 690,
    pivotX: 380,
    pivotDraggable: true,
    pivotMinX: 360,
    pivotMaxX: 658, // solution limit near Earth; cannot move beyond it
    minArm: 18,
    baskets: false,
    showPivotHint: true,
    leftPlacementOnly: true,
    leftPlacementMin: -1,
    leftPlacementMax: -0.02,
    doorTarget: 1,
    palette: [
      { type: 'archimedes', pinWorldX: 130, fixed: true, fixedSide: 'left' },
      { type: 'earth', pinWorldX: 690, fixed: true, fixedSide: 'right' },
    ],
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

const nextId = createIdCounter('sw');

function createObject(type, x, y, spec = {}) {
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
    beamPosition: 0,
    inBasket: null,       // 'left'|'right'|null
    basketIndex: 0,
    basketCount: 1,
    fixed: !!spec.fixed,
    fixedSide: spec.fixedSide || null,
    pinWorldX: Number.isFinite(spec.pinWorldX) ? spec.pinWorldX : null,
    minBeamPos: Number.isFinite(spec.minBeamPos) ? spec.minBeamPos : null,
    maxBeamPos: Number.isFinite(spec.maxBeamPos) ? spec.maxBeamPos : null,
    homeX: x,
    homeY: y,
    claimedBy: null,
    claimTime: null,
  };
}

function recomputeBeamGeometry(beam) {
  if (!beam) return;
  const minArm = Math.max(1, Number.isFinite(beam.minArm) ? beam.minArm : 40);

  if (beam.fixedEndpoints) {
    beam.pivotX = clamp(beam.pivotX, beam.leftEndX + minArm, beam.rightEndX - minArm);
    beam.leftArm = Math.max(minArm, beam.pivotX - beam.leftEndX);
    beam.rightArm = Math.max(minArm, beam.rightEndX - beam.pivotX);
  } else {
    beam.leftEndX = beam.pivotX - beam.leftArm;
    beam.rightEndX = beam.pivotX + beam.rightArm;
  }

  beam.span = Math.max(beam.leftArm + beam.rightArm, 1);
  beam.leftLimit = -beam.leftArm / beam.span;
  beam.rightLimit = beam.rightArm / beam.span;
}

function updateDynamicBaskets(state) {
  const beam = state.beam;
  const baskets = state.baskets;
  if (!beam || !baskets || !baskets.enabled) return;
  if (!baskets.atEnds) return;

  const inset = Math.max(0, baskets.inset || 0);
  const leftX = beam.leftEndX + inset;
  const rightX = beam.rightEndX - inset;
  baskets.left.pos = clamp(
    xToBeamPos(beam, leftX),
    beam.leftLimit + 0.01,
    beam.rightLimit - 0.01
  );
  baskets.right.pos = clamp(
    xToBeamPos(beam, rightX),
    beam.leftLimit + 0.01,
    beam.rightLimit - 0.01
  );
}

function getBasketPos(state, basketId) {
  const baskets = state.baskets;
  if (!baskets || !baskets.enabled) return null;
  if (basketId === 'left') return baskets.left?.pos ?? null;
  if (basketId === 'right') return baskets.right?.pos ?? null;
  if (basketId?.startsWith('slot') && baskets.leftSlots) {
    const idx = parseInt(basketId.slice(4), 10);
    return Number.isFinite(idx) ? (baskets.leftSlots[idx]?.pos ?? null) : null;
  }
  return null;
}

function spawnPalette(state, cfg) {
  const objects = [];
  const specs = cfg.palette || [];
  const count = specs.length;

  for (let i = 0; i < count; i++) {
    const spec = specs[i];
    const px = Number.isFinite(spec.spawnX) ? spec.spawnX : (150 + (i / Math.max(count - 1, 1)) * 500);
    const py = Number.isFinite(spec.spawnY) ? spec.spawnY : 480;
    const obj = createObject(spec.type, px, py, spec);
    if (!obj) continue;

    if (spec.startOnBeam != null || Number.isFinite(spec.pinWorldX)) {
      obj.onBeam = true;
      obj.inBasket = spec.startBasket || null;
      if (obj.inBasket) {
        const basketPos = getBasketPos(state, obj.inBasket);
        obj.beamPosition = clamp(
          basketPos != null ? basketPos : (Number(spec.startOnBeam) || 0),
          state.beam.leftLimit,
          state.beam.rightLimit
        );
      } else if (Number.isFinite(spec.startOnBeam)) {
        obj.beamPosition = clamp(spec.startOnBeam, state.beam.leftLimit, state.beam.rightLimit);
      } else {
        obj.beamPosition = clamp(xToBeamPos(state.beam, obj.pinWorldX), state.beam.leftLimit, state.beam.rightLimit);
      }
      updateObjectFromBeam(obj, state.beam);
    }

    objects.push(obj);
  }

  reindexBasket(state, objects, 'left');
  reindexBasket(state, objects, 'right');

  return objects;
}

/** Get the Y position on the beam at a given X, accounting for angle. */
function beamYAtX(beam, x) {
  const dx = x - beam.pivotX;
  return beam.pivotY + Math.tan(beam.angle) * dx;
}

/** Convert beamPosition (leftLimit..rightLimit) to world X. */
function beamPosToX(beam, bp) {
  const t = bp * beam.span;
  return beam.pivotX + t * Math.cos(beam.angle);
}

/** Convert world X to beamPosition. */
function xToBeamPos(beam, x) {
  const c = Math.cos(beam.angle);
  const safeC = Math.abs(c) < 1e-4 ? (c < 0 ? -1e-4 : 1e-4) : c;
  return (x - beam.pivotX) / (beam.span * safeC);
}

function pointToBeamPos(beam, x, y) {
  const c = Math.cos(beam.angle);
  const s = Math.sin(beam.angle);
  const dx = x - beam.pivotX;
  const dy = y - beam.pivotY;
  const t = dx * c + dy * s;
  return t / beam.span;
}

function pointToBeamPerpDist(beam, x, y) {
  const c = Math.cos(beam.angle);
  const s = Math.sin(beam.angle);
  const dx = x - beam.pivotX;
  const dy = y - beam.pivotY;
  return Math.abs(-dx * s + dy * c);
}

function beamPosToWorld(beam, bp) {
  const c = Math.cos(beam.angle);
  const s = Math.sin(beam.angle);
  const t = bp * beam.span;
  return {
    x: beam.pivotX + t * c,
    y: beam.pivotY + t * s,
  };
}

/** Update an object's world position from its beamPosition. */
function updateObjectFromBeam(obj, beam) {
  let worldX;
  let worldY;
  let rawPos;
  if (Number.isFinite(obj.pinWorldX)) {
    const physArm = obj.pinWorldX - beam.pivotX;
    worldX = beam.pivotX + physArm * Math.cos(beam.angle);
    worldY = beam.pivotY + physArm * Math.sin(beam.angle);
    rawPos = physArm / beam.span;
  } else {
    const p = beamPosToWorld(beam, obj.beamPosition);
    worldX = p.x;
    worldY = p.y;
    rawPos = obj.beamPosition;
  }

  const clampedPos = clamp(rawPos, beam.leftLimit, beam.rightLimit);
  obj.beamPosition = clampedPos;

  if (obj.inBasket) {
    const count = Math.max(1, obj.basketCount || 1);
    const idx = clamp(obj.basketIndex || 0, 0, count - 1);
    const spread = count > 1 ? Math.min(36, 94 / (count - 1)) : 0;
    const sideOffset = (idx - (count - 1) / 2) * spread;
    obj.x = worldX + sideOffset;
    obj.y = worldY + BASKET_HANGER_LEN + BASKET_ITEM_Y;
    return;
  }

  obj.x = worldX;
  if (obj.type === 'archimedes') {
    obj.y = worldY - obj.size * 0.26;
  } else {
    obj.y = worldY - obj.size * 0.5;
  }
}

function getObjectBeamPos(obj, beam) {
  if (Number.isFinite(obj.pinWorldX)) {
    return clamp(xToBeamPos(beam, obj.pinWorldX), beam.leftLimit, beam.rightLimit);
  }
  return clamp(obj.beamPosition ?? 0, beam.leftLimit, beam.rightLimit);
}

function resetObjectToHome(obj) {
  obj.onBeam = false;
  obj.beamPosition = 0;
  obj.inBasket = null;
  obj.basketIndex = 0;
  obj.basketCount = 1;
  obj.x = obj.homeX;
  obj.y = obj.homeY;
}

function reindexBasket(state, objects, basketName) {
  const src = objects || state.objects;
  const items = src
    .filter(o => o.onBeam && o.inBasket === basketName)
    .sort((a, b) => {
      if (a.fixed !== b.fixed) return a.fixed ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

  items.forEach((obj, idx) => {
    const basketPos = getBasketPos(state, basketName);
    if (basketPos != null) {
      obj.beamPosition = basketPos;
    }
    obj.basketIndex = idx;
    obj.basketCount = items.length;
    updateObjectFromBeam(obj, state.beam);
  });
}

function getPlacementBounds(state, obj) {
  const beam = state.beam;
  const rules = state.seesawRules || {};

  let minBp = beam.leftLimit + 0.02;
  let maxBp = beam.rightLimit - 0.02;

  if (rules.leftPlacementOnly && !obj.fixed) {
    maxBp = Math.min(maxBp, Number.isFinite(rules.leftPlacementMax) ? rules.leftPlacementMax : -0.02);
    minBp = Math.max(minBp, Number.isFinite(rules.leftPlacementMin) ? rules.leftPlacementMin : beam.leftLimit + 0.02);
  }

  if (Number.isFinite(obj.minBeamPos)) minBp = Math.max(minBp, obj.minBeamPos);
  if (Number.isFinite(obj.maxBeamPos)) maxBp = Math.min(maxBp, obj.maxBeamPos);

  return { minBp, maxBp };
}

// ── Module interface ─────────────────────────────────────────────────────────

export function initModule(state, subLevel) {
  const lvl = clamp(subLevel || 1, 1, NUM_LEVELS);
  const cfg = LEVELS[lvl];
  if (!cfg) return;

  initModuleBase(state, { _level: lvl, ...cfg });

  // Beam
  const half = (cfg.beamLength || 520) * 0.5;
  const leftArm = Number.isFinite(cfg.leftArm) ? cfg.leftArm : half;
  const rightArm = Number.isFinite(cfg.rightArm) ? cfg.rightArm : half;

  state.beam = {
    pivotX: cfg.pivotX,
    pivotY: 270,
    leftArm,
    rightArm,
    leftEndX: Number.isFinite(cfg.leftEndX) ? cfg.leftEndX : (cfg.pivotX - leftArm),
    rightEndX: Number.isFinite(cfg.rightEndX) ? cfg.rightEndX : (cfg.pivotX + rightArm),
    fixedEndpoints: !!cfg.fixedBeamEndpoints,
    minArm: Number.isFinite(cfg.minArm) ? cfg.minArm : 40,
    angle: 0,
    angularVelocity: 0,
    pivotDraggable: cfg.pivotDraggable,
    pivotMinX: cfg.pivotMinX,
    pivotMaxX: cfg.pivotMaxX,
  };
  recomputeBeamGeometry(state.beam);

  // Baskets
  state.baskets = {
    enabled: cfg.baskets,
    allowRightPlacement: !!cfg.allowRightPlacement,
    atEnds: !!cfg.basketAtEnds,
    inset: Number.isFinite(cfg.basketInset) ? cfg.basketInset : 24,
    left: cfg.multiLeftBaskets ? null : { pos: Number.isFinite(cfg.leftBasketPos) ? cfg.leftBasketPos : state.beam.leftLimit * 0.9 },
    right: { pos: Number.isFinite(cfg.rightBasketPos) ? cfg.rightBasketPos : state.beam.rightLimit * 0.9 },
    leftSlots: cfg.multiLeftBaskets && Array.isArray(cfg.leftBasketSlots)
      ? cfg.leftBasketSlots.map(s => ({ pos: s.pos }))
      : null,
  };
  updateDynamicBaskets(state);

  state.seesawRules = {
    leftPlacementOnly: cfg.leftPlacementOnly !== false,
    leftPlacementMin: Number.isFinite(cfg.leftPlacementMin) ? cfg.leftPlacementMin : null,
    leftPlacementMax: Number.isFinite(cfg.leftPlacementMax) ? cfg.leftPlacementMax : null,
  };

  // Balance tracking
  state.balance = {
    balancedTicks: 0,
    balancedThreshold: BALANCE_TICKS,
    totalBalances: 0,
    wasUnbalanced: true,
  };

  state.worldScroll = 0;
  state.confetti = null;
  state.pivotDraggedBy = null;
  state.pivotHintTicks = cfg.showPivotHint ? 180 : 0;
  state.doorTarget = cfg.doorTarget;
  state.doorProgress = 0;
  state.groundY = 465;
  state.beamGroundY = state.baskets.enabled ? 400 : 465;

  // Spawn palette objects
  state.objects = spawnPalette(state, cfg);

  // Clear ferry-specific fields
  state.deliveredCount = 0;
  state.tripsCompleted = 0;
  state.cargoMass = 0;
  state.boat = null;
  state.archimedes = null;

  state.message = `${cfg.name}: ${cfg.desc}`;
}

/**
 * Seesaw simulation step. Called each tick by the dispatcher.
 */
export function stepModule(state, now) {
  const beam = state.beam;
  if (!beam) return;
  recomputeBeamGeometry(beam);
  updateDynamicBaskets(state);

  if (state.pivotHintTicks > 0) {
    state.pivotHintTicks--;
  }

  // 1. Expire stale claims
  expireStaleClaimsOnObjects(state.objects, state, now);

  // Gather objects on beam.
  // Held objects stay "committed" at their previous placement until release.
  const onBeam = state.objects.filter(o => o.onBeam);

  // 2. Compute net torque
  let netTorque = 0;
  for (const obj of onBeam) {
    const arm = getObjectBeamPos(obj, beam);
    netTorque += obj.mass * arm * PHYSICS_SCALE;
  }

  // Restoring spring toward horizontal (keeps beam from drifting when balanced)
  netTorque += -beam.angle * RESTORE_FACTOR;

  // 3. Moment of inertia
  let I = BEAM_MASS;
  for (const obj of onBeam) {
    const arm = getObjectBeamPos(obj, beam);
    I += obj.mass * arm * arm;
  }

  // 4-6. Angular acceleration, velocity, angle
  const angularAccel = netTorque / Math.max(I, 0.01);
  beam.angularVelocity += angularAccel * TICK_DT;
  beam.angularVelocity *= DAMPING;
  beam.angle += beam.angularVelocity * TICK_DT;

  // 7. Clamp angle; bounce if beam end hits ground
  if (Math.abs(beam.angle) > MAX_ANGLE) {
    beam.angle = clamp(beam.angle, -MAX_ANGLE, MAX_ANGLE);
    beam.angularVelocity *= -0.3; // bounce
  }

  // Check if beam ends hit groundY
  const leftEndY = beam.pivotY + Math.sin(beam.angle) * (-beam.leftArm);
  const rightEndY = beam.pivotY + Math.sin(beam.angle) * beam.rightArm;
  if (leftEndY > state.beamGroundY || rightEndY > state.beamGroundY) {
    beam.angularVelocity *= -0.3;

    if (leftEndY > state.beamGroundY) {
      const maxSinLeft = (state.beamGroundY - beam.pivotY) / Math.max(beam.leftArm, 1);
      beam.angle = Math.max(beam.angle, -Math.asin(clamp(maxSinLeft, -1, 1)));
    }
    if (rightEndY > state.beamGroundY) {
      const maxSinRight = (state.beamGroundY - beam.pivotY) / Math.max(beam.rightArm, 1);
      beam.angle = Math.min(beam.angle, Math.asin(clamp(maxSinRight, -1, 1)));
    }
  }

  // 8. Update all onBeam object positions
  for (const obj of state.objects) {
    if (obj.onBeam && !obj.claimedBy) {
      if (obj.inBasket) {
        const basketPos = getBasketPos(state, obj.inBasket);
        if (basketPos != null) obj.beamPosition = basketPos;
      }
      updateObjectFromBeam(obj, beam);
    }
  }

  // 9. Balance check — use pure mass torque (no spring restore term).
  let massTorque = 0;
  for (const obj of onBeam) {
    const arm = getObjectBeamPos(obj, beam);
    massTorque += obj.mass * arm;
  }

  const bal = state.balance;
  const isBalanced = Math.abs(massTorque) < BALANCE_TORQUE_TOL &&
                     Math.abs(beam.angularVelocity) < BALANCE_VEL_TOL &&
                     onBeam.some(o => !o.fixed);

  if (isBalanced) {
    bal.balancedTicks++;
    if (bal.balancedTicks >= bal.balancedThreshold && bal.wasUnbalanced) {
      // Celebration!
      bal.totalBalances++;
      bal.wasUnbalanced = false;

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

  // 10. Finale scroll cue
  if (state.level === 6 && isBalanced && bal.balancedTicks >= bal.balancedThreshold) {
    state.worldScroll = Math.min(200, state.worldScroll + 0.5);
  }
}

function computeDoorProgress(state) {
  // One success per puzzle by default.
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
      applyCursorMove(player, input, state.sceneWidth, state.sceneHeight);

      // Move held object preview.
      // Physics contribution remains from its previous committed beam position
      // until release.
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
        recomputeBeamGeometry(state.beam);
        updateDynamicBaskets(state);
        state.pivotHintTicks = 0;
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
      if (obj.fixed) {
        state.message = 'That side is fixed. Change the left side.';
        return true;
      }

      claimObject(obj, player, now);
      return true;
    }

    case 'release': {
      if (!player.heldObjectId) return true;
      const obj = state.objects.find(o => o.id === player.heldObjectId);
      if (!obj) { player.heldObjectId = null; return true; }
      const previousBasket = obj.inBasket;

      releaseObject(obj, player);

      // Hit-test: can we place on beam?
      const beam = state.beam;
      const bp = pointToBeamPos(beam, obj.x, obj.y);
      const withinBeamX = bp >= beam.leftLimit && bp <= beam.rightLimit;
      const nearBeamY = pointToBeamPerpDist(beam, obj.x, obj.y) < BEAM_HIT_DIST;
      let nearBasket = false;
      if (state.baskets.enabled) {
        const rightP = beamPosToWorld(beam, state.baskets.right.pos);
        const distToRight = Math.hypot(obj.x - rightP.x, obj.y - (rightP.y + BASKET_HANGER_LEN + BASKET_ITEM_Y));
        let minLeftDist = Infinity;
        if (state.baskets.leftSlots) {
          for (const slot of state.baskets.leftSlots) {
            const p = beamPosToWorld(beam, slot.pos);
            const d = Math.hypot(obj.x - p.x, obj.y - (p.y + BASKET_HANGER_LEN + BASKET_ITEM_Y));
            if (d < minLeftDist) minLeftDist = d;
          }
        } else if (state.baskets.left) {
          const leftP = beamPosToWorld(beam, state.baskets.left.pos);
          minLeftDist = Math.hypot(obj.x - leftP.x, obj.y - (leftP.y + BASKET_HANGER_LEN + BASKET_ITEM_Y));
        }
        nearBasket = Math.min(minLeftDist, distToRight) <= BASKET_DROP_DIST;
      }

      if (withinBeamX && (nearBeamY || nearBasket)) {
        // Check baskets first
        if (state.baskets.enabled) {
          let targetBasket = 'left';
          if (obj.fixedSide === 'right') {
            targetBasket = 'right';
          } else if (state.baskets.leftSlots) {
            // Route to nearest left slot
            let best = 'slot0';
            let bestDist = Infinity;
            for (let i = 0; i < state.baskets.leftSlots.length; i++) {
              const p = beamPosToWorld(beam, state.baskets.leftSlots[i].pos);
              const d = Math.hypot(obj.x - p.x, obj.y - (p.y + BASKET_HANGER_LEN + BASKET_ITEM_Y));
              if (d < bestDist) { bestDist = d; best = `slot${i}`; }
            }
            targetBasket = best;
          } else if (state.baskets.allowRightPlacement && bp > 0) {
            targetBasket = 'right';
          }
          const targetPos = getBasketPos(state, targetBasket);

          if (targetPos == null) {
            resetObjectToHome(obj);
            if (previousBasket) reindexBasket(state, null, previousBasket);
            return true;
          }

          obj.onBeam = true;
          obj.beamPosition = targetPos;
          obj.inBasket = targetBasket;
          obj.basketIndex = 0;
          obj.basketCount = 1;
          updateObjectFromBeam(obj, beam);
          if (previousBasket && previousBasket !== targetBasket) {
            reindexBasket(state, null, previousBasket);
          }
          reindexBasket(state, null, targetBasket);
          state.balance.wasUnbalanced = true;
          return true;
        }

        // Free placement on beam
        const { minBp, maxBp } = getPlacementBounds(state, obj);
        if (bp > maxBp + 0.01) {
          resetObjectToHome(obj);
          if (previousBasket) reindexBasket(state, null, previousBasket);
          state.message = 'Only the left side can be changed.';
          return true;
        }
        obj.onBeam = true;
        obj.beamPosition = clamp(bp, minBp, maxBp);
        obj.inBasket = null;
        obj.basketIndex = 0;
        obj.basketCount = 1;
        updateObjectFromBeam(obj, beam);
        if (previousBasket) reindexBasket(state, null, previousBasket);
        state.balance.wasUnbalanced = true;
        return true;
      }

      // Missed beam → return to palette area
      resetObjectToHome(obj);
      if (previousBasket) reindexBasket(state, null, previousBasket);
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
        state.pivotHintTicks = 0;
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
      initModule(state, state.level);
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
