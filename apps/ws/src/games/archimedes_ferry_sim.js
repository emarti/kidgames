/**
 * Archimedes — Module 1: Buoyancy Ferry
 * Server-side simulation for the River Ferry module.
 *
 * Boat physics model (simple & visual):
 *   - The boat floats at waterY. Adding cargo increases sinkOffset.
 *   - deckY = waterY - EMPTY_FREEBOARD + sinkOffset
 *   - Capsize when sinkOffset > MAX_SAFE_SINK (deck goes underwater)
 *     or when |tilt| exceeds threshold.
 *
 * Exports the module interface expected by archimedes_sim.js dispatcher:
 *   { MODULES, initModule, stepModule, applyModuleInput }
 */

import { clamp } from './maze_utils.js';

// ── Boat constants ──────────────────────────────────────────────────────────

export const HULL_WIDTH = 200;
export const HULL_HEIGHT = 60;
export const EMPTY_FREEBOARD = 40;
export const EMPTY_DRAFT = 20;

const SINK_PX_PER_MASS = 2.0;
const MAX_SAFE_SINK = 36;
const MAX_TILT = 35;
const TILT_SENSITIVITY = 0.6;
const DECK_SNAP_OFFSET = 8;
const SAIL_SPEED = 3.5;

// ── Object types ────────────────────────────────────────────────────────────

const OBJECT_TYPES = {
  kid:            { mass: 10, size: 40, emoji: '🧒', color: '#FFAB91', label: 'Kid' },
  duck:           { mass: 3,  size: 32, emoji: '🦆', color: '#FFD700', label: 'Duck' },
  balloon:        { mass: -5, size: 44, emoji: '🎈', color: '#E1BEE7', label: 'Balloon' },
  helium_balloon: { mass: -2, size: 38, emoji: '🎈', color: '#B3E5FC', label: 'Helium' },
  stone:          { mass: 15, size: 36, emoji: '🪨', color: '#90A4AE', label: 'Boulder' },
};

// ── Sub-levels ──────────────────────────────────────────────────────────────

const LEVELS = {
  1: {
    id: 'river_ferry',
    name: '🚢 River Ferry',
    desc: 'Get everyone across!',
    objects: [
      { type: 'kid',  x: 50,  y: 260 },
      { type: 'kid',  x: 110, y: 265 },
      { type: 'duck', x: 80,  y: 275 },
      { type: 'duck', x: 130, y: 270 },
    ],
  },
  2: {
    id: 'heavy_load',
    name: '⚖️ Heavy Load',
    desc: 'Use the helium balloon to help!',
    objects: [
      { type: 'kid',            x: 40,  y: 260 },
      { type: 'kid',            x: 100, y: 265 },
      { type: 'duck',           x: 70,  y: 275 },
      { type: 'helium_balloon', x: 130, y: 240 },
    ],
  },
  3: {
    id: 'boulder_run',
    name: '🪨 Boulder Run',
    desc: 'That boulder is heavy! Plan wisely.',
    objects: [
      { type: 'kid',            x: 40,  y: 260 },
      { type: 'kid',            x: 100, y: 265 },
      { type: 'duck',           x: 70,  y: 275 },
      { type: 'stone',          x: 130, y: 268 },
      { type: 'helium_balloon', x: 50,  y: 238 },
      { type: 'helium_balloon', x: 110, y: 235 },
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

// ── Helpers ─────────────────────────────────────────────────────────────────

let _idCounter = 0;
function nextId() { return 'obj_' + (++_idCounter); }

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
    onBoat: false,
    onShore: 'left',
    delivered: false,
    claimedBy: null,
    claimTime: null,
  };
}

function objectsOnBoat(state) {
  return state.objects.filter(o => o.onBoat);
}

// ── Boat physics ────────────────────────────────────────────────────────────

function computeBoatPhysics(state) {
  const onBoat = objectsOnBoat(state);

  let cargoMass = 0;
  let massWeightedX = 0;
  for (const obj of onBoat) {
    cargoMass += obj.mass;
    massWeightedX += obj.mass * (obj.x - state.boat.x);
  }

  const effectiveCargo = Math.max(0, cargoMass);
  const sinkOffset = effectiveCargo * SINK_PX_PER_MASS;
  const deckY = state.waterY - EMPTY_FREEBOARD + sinkOffset;

  const totalMass = 50 + effectiveCargo;
  const comOffsetX = totalMass > 0 ? massWeightedX / totalMass : 0;
  const tilt = clamp(comOffsetX * TILT_SENSITIVITY, -MAX_TILT, MAX_TILT);

  const overloaded = sinkOffset > MAX_SAFE_SINK;
  const tooTilted = Math.abs(tilt) >= 30;

  state.boat.sinkOffset = sinkOffset;
  state.boat.deckY = deckY;
  state.boat.tilt = tilt;
  state.cargoMass = cargoMass;

  return { shouldCapsize: overloaded || tooTilted, overloaded };
}

function arrangeObjectsOnDeck(state) {
  const onBoat = objectsOnBoat(state);
  if (onBoat.length === 0) return;

  const deckY = state.boat.deckY ?? (state.waterY - EMPTY_FREEBOARD);
  const slotWidth = (HULL_WIDTH * 0.7) / Math.max(onBoat.length, 1);
  const startX = state.boat.x - HULL_WIDTH * 0.35;

  for (let i = 0; i < onBoat.length; i++) {
    const obj = onBoat[i];
    if (!obj.claimedBy) {
      obj.x = startX + slotWidth * (i + 0.5);
      obj.y = deckY + DECK_SNAP_OFFSET;
    }
  }
}

// ── Actions ─────────────────────────────────────────────────────────────────

function unloadToShore(state, shore) {
  const area = shore === 'left' ? state.leftShoreArea : state.rightShoreArea;
  let count = 0;

  for (const obj of objectsOnBoat(state)) {
    obj.onBoat = false;
    obj.onShore = shore;
    obj.x = area.x + 20 + Math.random() * (area.w - 40);
    obj.y = area.y + 10 + Math.random() * (area.h - 20);
    if (shore === 'right' && !obj.delivered) {
      obj.delivered = true;
      state.deliveredCount++;
      count++;
    }
  }
  return count;
}

function resetTrip(state) {
  state.boat.x = 230;
  state.boat.targetX = 230;
  state.boat.sailing = false;
  state.boat.capsized = false;
  state.boat.capsizeTimer = 0;
  state.boat.capsizeRotation = 0;
  state.boat.atDock = 'left';
  state.boat.tilt = 0;
  state.boat.sinkOffset = 0;
  state.boat.deckY = state.waterY - EMPTY_FREEBOARD;
  state.boat.windDir = 0;

  const area = state.leftShoreArea;
  for (const obj of state.objects) {
    if (obj.onBoat) {
      obj.onBoat = false;
      obj.onShore = 'left';
      obj.x = area.x + 20 + Math.random() * (area.w - 40);
      obj.y = area.y + 10 + Math.random() * (area.h - 20);
    }
    obj.claimedBy = null;
    obj.claimTime = null;
  }

  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    if (p) p.heldObjectId = null;
  }

  state.message = '';
}

function startSailing(state) {
  if (state.boat.sailing || state.boat.capsized) return;

  const goingRight = state.boat.atDock === 'left';
  if (goingRight && objectsOnBoat(state).length === 0) {
    state.message = 'Load something onto the boat first!';
    return;
  }

  if (goingRight) {
    state.boat.targetX = state.rightShoreX - 70;
    state.boat.windDir = 1;
  } else {
    state.boat.targetX = state.leftShoreX + 70;
    state.boat.windDir = -1;
  }

  state.boat.sailing = true;
  state.boat.atDock = null;
  state.message = goingRight ? '⛵ Sailing…' : '⛵ Returning…';
}

function checkWin(state) {
  if (state.deliveredCount >= state.totalToDeliver && !state.doorOpen) {
    state.doorOpen = true;
    state.message = `All ${state.totalToDeliver} delivered! Door opened!`;
  }
}

// ── Module interface ────────────────────────────────────────────────────────

/**
 * Initialize the ferry module state for a given sub-level.
 * Called by the dispatcher's initModule().
 */
export function initModule(state, subLevel) {
  const lvl = clamp(subLevel || 1, 1, NUM_LEVELS);
  const cfg = LEVELS[lvl];
  if (!cfg) return;

  state.level = lvl;
  state.levelId = cfg.id;
  state.levelName = cfg.name;
  state.objects = [];
  state.deliveredCount = 0;
  state.tripsCompleted = 0;
  state.doorOpen = false;
  state.showLevelSelect = false;
  state.cargoMass = 0;

  // Layout (ferry-specific)
  state.waterY = 300;
  state.leftShoreX = 160;
  state.rightShoreX = 640;
  state.leftShoreArea  = { x: 0,   y: 230, w: 160, h: 70 };
  state.rightShoreArea = { x: 640, y: 230, w: 160, h: 70 };

  // Boat
  state.boat = {
    x: 230,
    deckY: 260,
    sinkOffset: 0,
    tilt: 0,
    targetX: 230,
    sailing: false,
    atDock: 'left',
    capsized: false,
    capsizeTimer: 0,
    capsizeRotation: 0,
    sailSpeed: SAIL_SPEED,
    windDir: 0,
    hasSail: true,
  };

  // Spawn objects
  state.totalToDeliver = cfg.objects.length;
  for (const def of cfg.objects) {
    const obj = createObject(def.type, def.x, def.y);
    if (obj) state.objects.push(obj);
  }

  // Release all player holds
  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    if (p) p.heldObjectId = null;
  }

  state.message = `${cfg.name}: ${cfg.desc}`;
}

/**
 * Ferry simulation step. Called each tick by the dispatcher.
 */
export function stepModule(state, now) {
  // Expire stale claims (3s)
  for (const obj of state.objects) {
    if (obj.claimedBy && obj.claimTime && now - obj.claimTime > 3000) {
      const p = state.players[obj.claimedBy];
      if (p) p.heldObjectId = null;
      obj.claimedBy = null;
      obj.claimTime = null;
    }
  }

  // Physics
  const physics = computeBoatPhysics(state);
  arrangeObjectsOnDeck(state);

  // Capsize — only triggers while sailing
  if (physics.shouldCapsize && !state.boat.capsized && state.boat.sailing) {
    state.boat.capsized = true;
    state.boat.capsizeTimer = now;
    state.boat.capsizeRotation = 0;
    state.message = 'SPLASH! Capsized!';
  }

  // Capsize animation
  if (state.boat.capsized) {
    const elapsed = now - state.boat.capsizeTimer;
    if (elapsed < 1000) {
      state.boat.capsizeRotation = (elapsed / 1000) * 180;
    } else {
      state.boat.capsizeRotation = 180;
      state.boat.sinkOffset = Math.min(120, MAX_SAFE_SINK + (elapsed - 1000) / 15);
      state.boat.deckY = state.waterY - EMPTY_FREEBOARD + state.boat.sinkOffset;
    }
    if (elapsed > 3000) {
      resetTrip(state);
    }
  }

  // Sailing movement
  if (state.boat.sailing && !state.boat.capsized) {
    const dx = state.boat.targetX - state.boat.x;
    const move = Math.min(Math.abs(dx), state.boat.sailSpeed);

    if (Math.abs(dx) < 2) {
      // Arrived
      state.boat.x = state.boat.targetX;
      state.boat.sailing = false;
      state.boat.windDir = 0;
      const arrivedAt = state.boat.x > state.sceneWidth / 2 ? 'right' : 'left';
      state.boat.atDock = arrivedAt;
      state.tripsCompleted++;

      const n = unloadToShore(state, arrivedAt);
      if (arrivedAt === 'right' && n > 0) {
        state.message = `Delivered ${n}! (${state.deliveredCount}/${state.totalToDeliver})`;
      } else {
        state.message = `Arrived at ${arrivedAt} shore.`;
      }
      checkWin(state);
    } else {
      const dir = Math.sign(dx);
      state.boat.x += dir * move;
      for (const obj of objectsOnBoat(state)) {
        if (!obj.claimedBy) obj.x += dir * move;
      }
    }
  }
}

/**
 * Handle ferry-specific input. Called by the dispatcher.
 * Returns true if the action was handled, false otherwise.
 */
export function applyModuleInput(state, playerId, input, now) {
  const player = state.players[playerId];
  if (!player || !player.connected) return false;

  switch (input.action) {
    case 'cursor_move': {
      player.cursorX = clamp(input.x || 0, 0, state.sceneWidth);
      player.cursorY = clamp(input.y || 0, 0, state.sceneHeight);

      if (player.heldObjectId) {
        const obj = state.objects.find(o => o.id === player.heldObjectId);
        if (obj) {
          obj.x = player.cursorX;
          obj.y = player.cursorY;
        }
      }
      return true;
    }

    case 'grab': {
      const obj = state.objects.find(o => o.id === input.objectId);
      if (!obj || obj.claimedBy || state.boat.sailing || state.boat.capsized) return true;

      const canGrab =
        obj.onBoat ||
        (obj.onShore === 'left'  && state.boat.atDock === 'left') ||
        (obj.onShore === 'right' && state.boat.atDock === 'right');

      if (canGrab) {
        obj.claimedBy = playerId;
        obj.claimTime = now;
        player.heldObjectId = obj.id;
        obj.onShore = null;
        obj.onBoat = false;
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

      const deckY = state.boat.deckY ?? (state.waterY - EMPTY_FREEBOARD);
      const boatLeft  = state.boat.x - HULL_WIDTH / 2 - 30;
      const boatRight = state.boat.x + HULL_WIDTH / 2 + 30;
      const boatTop   = deckY - 40;
      const boatBottom = state.waterY + 30;

      const overBoat =
        obj.x >= boatLeft && obj.x <= boatRight &&
        obj.y >= boatTop  && obj.y <= boatBottom &&
        state.boat.atDock && !state.boat.sailing;

      if (overBoat) {
        obj.onBoat = true;
        obj.onShore = null;
      } else {
        obj.onBoat = false;
        if (state.boat.atDock === 'left' || obj.x < state.sceneWidth / 2) {
          obj.onShore = 'left';
          const a = state.leftShoreArea;
          obj.x = clamp(obj.x, a.x + 10, a.x + a.w - 10);
          obj.y = clamp(obj.y, a.y + 5, a.y + a.h - 5);
        } else {
          obj.onShore = 'right';
          const a = state.rightShoreArea;
          obj.x = clamp(obj.x, a.x + 10, a.x + a.w - 10);
          obj.y = clamp(obj.y, a.y + 5, a.y + a.h - 5);
        }
      }
      return true;
    }

    case 'go': {
      if (!state.boat.sailing && !state.boat.capsized && !state.gamePaused) {
        startSailing(state);
      }
      return true;
    }

    case 'reset': {
      resetTrip(state);
      return true;
    }

    case 'full_reset': {
      initModule(state, state.level);
      return true;
    }

    default:
      return false; // not handled — let dispatcher try generic actions
  }
}

/** How many sub-levels this module has. */
export const numLevels = NUM_LEVELS;
