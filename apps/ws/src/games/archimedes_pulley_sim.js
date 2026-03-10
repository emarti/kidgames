/**
 * Archimedes — Module 3: Pulley Builder  (complete rewrite)
 *
 * Rope model
 * ----------
 * The rope has a single state variable: `ropeConsumed` — total rope pulled
 * through the system.  Load position is derived:
 *
 *     liftAmount = ropeConsumed / MA
 *     loadY      = loadStartY − liftAmount
 *
 * Pulling: the player grabs a handle and drags it downward.  Each pixel the
 * handle descends adds one pixel to ropeConsumed (if the config allows it).
 * Releasing the handle triggers a ratchet — the handle springs back to the
 * ceiling while ropeConsumed stays, so the load stays at its current height.
 * For L1 (MA = 1) the full lift fits in one pull; higher MA levels need
 * 2–4 pulls, teaching the force-distance trade-off.
 *
 * "Too heavy": if  (loadMass − cwMass) / MA  >  MAX_EFFORT  the handle won't
 * move — the player sees a struggle animation and a hint to add equipment.
 *
 * CW overload: if cwMass > loadMass + 3 the load rises automatically
 * (uncontrolled) and auto-resets after 2 s.
 *
 * Windlass (L6): Instead of a linear pull the player turns a crank.
 * Clockwise rotation feeds rope through the system.
 *
 * Exports  { initModule, stepModule, applyModuleInput, numLevels, LEVEL_LIST }
 */

import { clamp } from './maze_utils.js';
import {
  createIdCounter,
  claimObject,
  releaseObject,
  expireStaleClaimsOnObjects,
  applyCursorMove,
  initModuleBase,
} from './archimedes_utils.js';

// ── constants ────────────────────────────────────────────────────────────────

const MAX_EFFORT       = 15;   // max force a player can exert
const ANCHOR_Y         = 60;   // Y of the ceiling pulley axle
const FLOOR_Y          = 445;  // Y of the floor (hand / load bottom limit)
const CW_OVERLOAD_RISE = 3;    // px/tick the load rises when CW too heavy
const CW_RESET_TICKS   = 40;   // ticks before auto-reset after overload (~2 s)
const CRANK_SCALE      = 25;   // rope-px per radian of crank rotation

// ── load catalogue ───────────────────────────────────────────────────────────

const LOADS = {
  lantern:      { mass: 8,   emoji: '🏮', label: 'Lantern' },
  column:       { mass: 20,  emoji: '🏛️', label: 'Column' },
  statue:       { mass: 45,  emoji: '🗿', label: 'Statue' },
  quarry_block: { mass: 30,  emoji: '⛏️', label: 'Block' },
  elevator:     { mass: 15,  emoji: '🛗', label: 'Elevator' },  // 8 platform + 7 cargo
  temple_stone: { mass: 200, emoji: '🪨', label: 'Stone' },
};

// ── CW catalogue ─────────────────────────────────────────────────────────────

const CW_DEFS = {
  cw_5:  { mass: 5,  emoji: '🪨', label: '5 kg',  color: '#CFD8DC' },
  cw_15: { mass: 15, emoji: '🪨', label: '15 kg', color: '#90A4AE' },
  cw_25: { mass: 25, emoji: '🪨', label: '25 kg', color: '#607D8B' },
  cw_40: { mass: 40, emoji: '🪨', label: '40 kg', color: '#455A64' },
};

// ── level definitions ────────────────────────────────────────────────────────

const LEVELS = {
  1: {
    id: 'fixed_pulley',
    name: '🏮 Hoist the Lantern',
    desc: 'Grab the orange handle and pull DOWN to lift the lantern UP!',
    loadType: 'lantern',
    loadStartY: 400,
    targetY: 100,
    baseMA: 1,
    allowMovable: false,
    maxMovable: 0,
    hasCounterweight: false,
    cwPalette: [],
    allowRigs: false,
    isWindlass: false,
    scriptedEvent: null,
  },
  2: {
    id: 'movable_pulley',
    name: '🏛️ Raise the Column',
    desc: 'Too heavy! Drag the ⚙️ movable pulley onto the load to double your strength.',
    loadType: 'column',
    loadStartY: 400,
    targetY: 140,
    baseMA: 1,
    allowMovable: true,
    maxMovable: 1,
    hasCounterweight: false,
    cwPalette: [],
    allowRigs: false,
    isWindlass: false,
    scriptedEvent: null,
  },
  3: {
    id: 'compound_pulleys',
    name: '🗿 Lift the Statue',
    desc: 'Pick the rig with enough ropes to lift a heavy statue!',
    loadType: 'statue',
    loadStartY: 400,
    targetY: 170,
    baseMA: 1,
    allowMovable: false,
    maxMovable: 0,
    hasCounterweight: false,
    cwPalette: [],
    allowRigs: true,   // player picks RIG_1 / RIG_2 / RIG_4
    isWindlass: false,
    scriptedEvent: null,
  },
  4: {
    id: 'counterweight',
    name: '⛏️ The Quarry Hoist',
    desc: 'Drag a counterweight stone into the bucket to ease the lift!',
    loadType: 'quarry_block',
    loadStartY: 400,
    targetY: 140,
    baseMA: 2,         // pre-rigged with a movable pulley
    allowMovable: false,
    maxMovable: 0,
    hasCounterweight: true,
    cwPalette: ['cw_5', 'cw_15', 'cw_25', 'cw_40'],
    allowRigs: false,
    isWindlass: false,
    scriptedEvent: null,
  },
  5: {
    id: 'elevator_elephant',
    name: '🐘 The Zoo Lift',
    desc: 'Build the elevator rig — but watch for surprises!',
    loadType: 'elevator',
    loadStartY: 400,
    targetY: 100,
    baseMA: 1,
    allowMovable: true,
    maxMovable: 2,     // up to MA = 4
    hasCounterweight: true,
    cwPalette: ['cw_15', 'cw_25', 'cw_40'],
    allowRigs: false,
    isWindlass: false,
    scriptedEvent: 'elephant',
    elephantMass: 35,
    elephantTrigger: 0.6, // 60 % of lift range
  },
  6: {
    id: 'differential_windlass',
    name: "⚙️ Archimedes' Temple Engine",
    desc: 'Grab the crank and turn clockwise to raise the temple stone!',
    loadType: 'temple_stone',
    loadStartY: 400,
    targetY: 230,
    baseMA: 1,
    allowMovable: false,
    maxMovable: 0,
    hasCounterweight: false,
    cwPalette: [],
    allowRigs: false,
    isWindlass: true,
    windlassMA: 20,
    scriptedEvent: null,
  },
};

const NUM_LEVELS = Object.keys(LEVELS).length;

export const LEVEL_LIST = Object.entries(LEVELS).map(([n, cfg]) => ({
  number: Number(n), id: cfg.id, name: cfg.name,
}));

// ── helpers ──────────────────────────────────────────────────────────────────

const nextId = createIdCounter('pu');

function makeCWObj(type, homeX, homeY) {
  const d = CW_DEFS[type];
  if (!d) return null;
  return {
    id: nextId(), type, x: homeX, y: homeY,
    mass: d.mass, emoji: d.emoji, label: d.label, color: d.color,
    size: 28, homeX, homeY,
    claimedBy: null, claimTime: null, inSlot: false,
  };
}

function computeMA(sys, cfg) {
  if (cfg.isWindlass) return cfg.windlassMA;
  if (cfg.allowRigs) return sys.selectedRig || 1;
  let ma = cfg.baseMA;
  if (cfg.allowMovable && sys.movableCount > 0) {
    ma = cfg.baseMA * Math.pow(2, sys.movableCount);
  }
  return ma;
}

function effortNeeded(sys) {
  return Math.max(0, sys.loadMass - sys.cwMass) / sys.ma;
}

// ── module interface ─────────────────────────────────────────────────────────

export function initModule(state, subLevel) {
  const lvl = clamp(subLevel || 1, 1, NUM_LEVELS);
  const cfg = LEVELS[lvl];
  if (!cfg) return;

  initModuleBase(state, { _level: lvl, ...cfg });

  const loadDef = LOADS[cfg.loadType];

  // build CW palette objects
  state.objects = [];
  const spacing = 80;
  const startX = 400 - ((cfg.cwPalette.length - 1) * spacing) / 2;
  cfg.cwPalette.forEach((type, i) => {
    const obj = makeCWObj(type, startX + i * spacing, FLOOR_Y + 20);
    if (obj) state.objects.push(obj);
  });

  state.pulley = {
    // layout
    anchorY:     ANCHOR_Y,
    floorY:      FLOOR_Y,
    loadStartY:  cfg.loadStartY,
    targetY:     cfg.targetY,

    // core rope state
    handY:         ANCHOR_Y,   // handle starts at the ceiling (no pull yet)
    ropeConsumed:  0,          // cumulative rope fed through (persists across pulls)
    loadY:         cfg.loadStartY,

    // physics
    loadMass: loadDef.mass,
    baseLoadMass: loadDef.mass,
    ma:        cfg.baseMA,
    cwMass:    0,
    struggling: false,

    // config state
    movableCount:  0,
    maxMovable:    cfg.maxMovable || 0,
    selectedRig:   cfg.allowRigs ? 1 : 0,

    // events
    won:       false,
    eventFired: false,
    cwOverload: false,
    cwOverloadCountdown: 0,
    screenShake: 0,

    // windlass
    crankAngle: 0,

    // hints
    hint: null,
    hintTimer: 0,
  };

  state.message = cfg.desc;
}

export function stepModule(state, now) {
  expireStaleClaimsOnObjects(state.objects, state, now);
  const sys = state.pulley;
  if (!sys) return;
  const cfg = LEVELS[state.level];
  if (!cfg) return;

  // ── recompute MA ──────────────────────────────────────────────────────
  sys.ma = computeMA(sys, cfg);

  // ── recompute CW ──────────────────────────────────────────────────────
  sys.cwMass = 0;
  for (const o of state.objects) { if (o.inSlot) sys.cwMass += o.mass; }

  // ── CW overload ───────────────────────────────────────────────────────
  if (sys.cwMass > sys.loadMass + 3 && !sys.cwOverload) {
    sys.cwOverload = true;
    sys.cwOverloadCountdown = CW_RESET_TICKS;
    state.message = '⚠️ Too much counterweight — it shot up!';
    sys.screenShake = 15;
  }
  if (sys.cwOverload) {
    sys.ropeConsumed += CW_OVERLOAD_RISE * sys.ma;
    sys.cwOverloadCountdown--;
    if (sys.cwOverloadCountdown <= 0) {
      // auto-reset
      resetLevel(state);
      state.message = cfg.name + ': Try a different counterweight!';
      return;
    }
  }

  // ── scripted event: elephant ───────────────────────────────────────────
  if (cfg.scriptedEvent === 'elephant' && !sys.eventFired) {
    const range = sys.loadStartY - sys.targetY;
    const lift  = sys.loadStartY - sys.loadY;
    if (lift >= range * (cfg.elephantTrigger || 0.6)) {
      sys.eventFired = true;
      sys.loadMass += cfg.elephantMass || 35;
      sys.ropeConsumed = 0;           // drop back to floor
      sys.handY = ANCHOR_Y;
      sys.screenShake = 12;
      state.message = '🐘 A baby elephant hopped on! Reconfigure!';
    }
  }

  // ── load position from ropeConsumed ───────────────────────────────────
  const liftAmt = sys.ropeConsumed / sys.ma;
  sys.loadY = clamp(sys.loadStartY - liftAmt, sys.targetY, sys.loadStartY);

  // screen shake decay
  if (sys.screenShake > 0) sys.screenShake--;

  // ── win check ─────────────────────────────────────────────────────────
  if (sys.loadY <= sys.targetY && !sys.won && !sys.cwOverload) {
    sys.won = true;
    state.doorOpen = true;
    state.message = '🎉 Success! The door is open!';
  }

  // ── auto-hints ────────────────────────────────────────────────────────
  if (!sys.won) {
    sys.hintTimer++;
    // L1: idle for 5 s (100 ticks)
    if (cfg.id === 'fixed_pulley' && sys.ropeConsumed === 0 && sys.hintTimer > 100) {
      sys.hint = '👇 Grab the orange handle and drag DOWN!';
    }
    // L2: struggling without movable
    if (cfg.id === 'movable_pulley' && sys.struggling && sys.movableCount === 0 && sys.hintTimer > 60) {
      sys.hint = 'Too heavy! Drag the ⚙️ pulley onto the load.';
    }
    // L3: two failed rigs
    if (cfg.id === 'compound_pulleys' && sys.struggling && sys.hintTimer > 80) {
      sys.hint = 'Count the ropes holding the weight!';
    }
    // L4: no CW placed after 10 s
    if (cfg.id === 'counterweight' && sys.cwMass === 0 && sys.hintTimer > 200) {
      sys.hint = 'Drag a stone 🪨 into the bucket!';
    }
    // L5: post-elephant
    if (cfg.id === 'elevator_elephant' && sys.eventFired && sys.hintTimer > 60 && sys.struggling) {
      sys.hint = 'More pulleys? Bigger counterweight?';
    }
    // L6: wrong direction
    if (cfg.isWindlass && sys.hintTimer > 100 && sys.ropeConsumed === 0) {
      sys.hint = 'Grab the knob and drag CLOCKWISE ↻';
    }
  }
}

// ── input ────────────────────────────────────────────────────────────────────

export function applyModuleInput(state, playerId, input, now) {
  const player = state.players[playerId];
  if (!player || !player.connected) return false;
  const sys = state.pulley;
  if (!sys) return false;
  const cfg = LEVELS[state.level];
  if (!cfg) return false;

  switch (input.action) {

    // ── cursor move ─────────────────────────────────────────────────────
    case 'cursor_move': {
      const prevCY = player.cursorY;
      applyCursorMove(player, input, state.sceneWidth, state.sceneHeight);

      if (!player.heldObjectId) return true;

      // --- rope hand pull -------------------------------------------------
      if (player.heldObjectId === 'ROPE_HAND' && !cfg.isWindlass) {
        const desired = clamp(player.cursorY, ANCHOR_Y, FLOOR_Y);
        const delta   = desired - sys.handY;

        if (delta > 0) {
          // pulling DOWN — try to consume rope
          const eff = effortNeeded(sys);
          if (eff > MAX_EFFORT) {
            sys.struggling = true;
          } else {
            sys.struggling = false;
            const surplus = MAX_EFFORT - eff;
            const mult = clamp(surplus / 5, 0.15, 1);
            const actual = delta * mult;
            sys.handY += actual;
            sys.ropeConsumed += actual;
            sys.hintTimer = 0;  // reset hint timer on successful pull
            sys.hint = null;
          }
        } else {
          // moving hand up — free, doesn't change ropeConsumed
          sys.handY = desired;
        }
        return true;
      }

      // --- crank (windlass) -----------------------------------------------
      if (player.heldObjectId === 'CRANK' && cfg.isWindlass) {
        const cx = 400, cy = 140;   // crank centre in game coords
        const dx = player.cursorX - cx;
        const dy = player.cursorY - cy;
        const angle = Math.atan2(dy, dx);
        let dTheta = angle - sys.crankAngle;
        while (dTheta >  Math.PI) dTheta -= 2 * Math.PI;
        while (dTheta < -Math.PI) dTheta += 2 * Math.PI;

        if (dTheta > 0) {
          // clockwise
          const eff = effortNeeded(sys);
          if (eff > MAX_EFFORT) {
            sys.struggling = true;
          } else {
            sys.struggling = false;
            sys.ropeConsumed += dTheta * CRANK_SCALE;
            sys.hintTimer = 0;
            sys.hint = null;
          }
        }
        sys.crankAngle = angle;
        return true;
      }

      // --- dragging a CW object or movable pulley -------------------------
      if (player.heldObjectId === 'MOVABLE_PULLEY_DRAG') return true;
      const held = state.objects.find(o => o.id === player.heldObjectId);
      if (held) { held.x = player.cursorX; held.y = player.cursorY; }
      return true;
    }

    // ── grab ──────────────────────────────────────────────────────────────
    case 'grab': {
      const oid = input.objectId;

      if (oid === 'ROPE_HAND' && !cfg.isWindlass) {
        player.heldObjectId = 'ROPE_HAND';
        sys.struggling = false;
        return true;
      }
      if (oid === 'CRANK' && cfg.isWindlass) {
        player.heldObjectId = 'CRANK';
        const dx = player.cursorX - 400;
        const dy = player.cursorY - 140;
        sys.crankAngle = Math.atan2(dy, dx);
        return true;
      }

      // rig selection (L3)
      if (oid === 'RIG_1') { sys.selectedRig = 1; sys.hintTimer = 0; return true; }
      if (oid === 'RIG_2') { sys.selectedRig = 2; sys.hintTimer = 0; return true; }
      if (oid === 'RIG_4') { sys.selectedRig = 4; sys.hintTimer = 0; return true; }

      // movable pulley from palette
      if (oid === 'MOVABLE_PULLEY_ICON' && cfg.allowMovable &&
          sys.movableCount < sys.maxMovable) {
        player.heldObjectId = 'MOVABLE_PULLEY_DRAG';
        return true;
      }

      // CW objects
      const obj = state.objects.find(o => o.id === oid);
      if (!obj || obj.claimedBy) return true;
      claimObject(obj, player, now);
      obj.inSlot = false;
      return true;
    }

    // ── release ───────────────────────────────────────────────────────────
    case 'release': {
      sys.struggling = false;
      const held = player.heldObjectId;
      if (!held) return true;

      if (held === 'ROPE_HAND') {
        // ratchet: hand springs back to anchor, ropeConsumed stays
        sys.handY = ANCHOR_Y;
        player.heldObjectId = null;
        return true;
      }
      if (held === 'CRANK') {
        player.heldObjectId = null;
        return true;
      }
      if (held === 'MOVABLE_PULLEY_DRAG') {
        player.heldObjectId = null;
        // snap if dropped near load (x 300–500, y near loadY)
        if (player.cursorX > 300 && player.cursorX < 500 &&
            player.cursorY > sys.loadY - 80 && player.cursorY < sys.loadY + 40) {
          sys.movableCount = Math.min(sys.movableCount + 1, sys.maxMovable);
        }
        return true;
      }

      // CW object
      const obj = state.objects.find(o => o.id === held);
      if (!obj) { player.heldObjectId = null; return true; }
      releaseObject(obj, player);

      if (cfg.hasCounterweight) {
        // bucket zone: x 130–290, y < 320
        if (obj.x > 130 && obj.x < 290 && obj.y < 320) {
          // swap: remove any existing CW from slot
          for (const o of state.objects) {
            if (o.id !== obj.id && o.inSlot) {
              o.inSlot = false; o.x = o.homeX; o.y = o.homeY;
            }
          }
          obj.inSlot = true;
          sys.cwOverload = false;  // reset overload flag on CW swap
          sys.hint = null;
          sys.hintTimer = 0;
        } else {
          obj.inSlot = false;
          obj.x = obj.homeX; obj.y = obj.homeY;
        }
      }
      return true;
    }

    // ── reset ─────────────────────────────────────────────────────────────
    case 'reset': {
      resetLevel(state);
      return true;
    }

    case 'full_reset': {
      initModule(state, state.level);
      return true;
    }

    default: return false;
  }
}

function resetLevel(state) {
  const cfg = LEVELS[state.level];
  if (!cfg) return;
  const sys = state.pulley;
  if (!sys) return;

  sys.handY = ANCHOR_Y;
  sys.ropeConsumed = 0;
  sys.struggling = false;
  sys.cwMass = 0;
  sys.cwOverload = false;
  sys.cwOverloadCountdown = 0;
  sys.screenShake = 0;
  sys.hint = null;
  sys.hintTimer = 0;

  for (const o of state.objects) {
    o.inSlot = false; o.x = o.homeX; o.y = o.homeY;
    o.claimedBy = null; o.claimTime = null;
  }

  if (cfg.scriptedEvent === 'elephant') {
    sys.eventFired = false;
    sys.loadMass = LOADS[cfg.loadType].mass;
    sys.movableCount = 0;
  }

  state.message = cfg.desc;
}

export const numLevels = NUM_LEVELS;
