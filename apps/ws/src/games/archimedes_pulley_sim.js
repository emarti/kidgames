/**
 * Archimedes — Module 3: Pulley Builder
 * Server-side stateful simulation.
 *
 * Exports the module interface expected by archimedes_sim.js dispatcher:
 *   { initModule, stepModule, applyModuleInput, numLevels, LEVEL_LIST }
 */

import { clamp } from './maze_utils.js';
import {
  TICK_DT,
  CONFETTI_DURATION,
  createIdCounter,
  claimObject,
  releaseObject,
  expireStaleClaimsOnObjects,
  applyCursorMove,
  initModuleBase,
} from './archimedes_utils.js';
import {
  GRAVITY,
  MAX_LOAD_SPEED,
  MOVABLE_PULLEY_OFFSET,
  canLiftLoad,
  computeMA,
  clampLoad,
  computeWindlassRopePull,
  checkLoadFeasibility,
} from './archimedes_pulley_physics.js';

// ── Level configs ─────────────────────────────────────────────────────────────

const LEVELS = {
  1: {
    id: 'fixed_pulley',
    name: '🏮 Hoist the Lantern',
    desc: 'Pull the rope down to lift the lantern up.',
    MA: 1,
    multiPlayer: false,
    anchorX: 400, anchorY: 40,
    load: { mass: 9, emoji: '🏮', color: '#e67e22', label: 'Lantern (9)', startY: 380, targetY: 100, radius: 22 },
    fixedPulleys: [{ id: 'fp1', x: 400, y: 60, radius: 18 }],
    movablePulleys: [],
    effortPoints: [{ id: 'ep1', x: 500, startY: 120 }],
    counterweight: null,
    windlass: null,
    pulleySlots: null,
    pulleyPalette: null,
    ropeSegments: [
      { from: 'anchor', to: 'fp1', supporting: false },
      { from: 'fp1',    to: 'load', supporting: false },
      { from: 'fp1',    to: 'ep1',  supporting: false },
    ],
    doorTarget: 1,
    hintAfterTicks: 120,
    winCondition: 'reach_top',
    elephantEvent: null,
  },
  2: {
    id: 'build_rig',
    name: '🏗️ Build Your Rig',
    desc: 'Too heavy to lift alone! Drag a pulley pair into the ring to add mechanical advantage.',
    MA: 1,
    multiPlayer: false,
    anchorX: 400, anchorY: 40,
    load: { mass: 22, emoji: '🗿', color: '#95a5a6', label: 'Column (22)', startY: 380, targetY: 100, radius: 24 },
    fixedPulleys: [],
    movablePulleys: [],
    effortPoints: [{ id: 'ep1', x: 500, startY: 160 }],
    counterweight: null,
    windlass: null,
    pulleySlots: [
      { id: 'slot1', fixedX: 380, fixedY: 60, movableXOffset: -20 },
    ],
    pulleyPalette: [
      { id: 'pair1', x: 200, y: 450 },
    ],
    // ropeSegments computed dynamically
    ropeSegments: null,
    doorTarget: 1,
    hintAfterTicks: 100,
    winCondition: 'reach_top',
    elephantEvent: null,
  },
  3: {
    id: 'two_pulleys',
    name: '🗽 Two Pulleys',
    desc: 'Very heavy! One pulley isn\'t enough — you need two pulley pairs.',
    MA: 1,
    multiPlayer: false,
    anchorX: 400, anchorY: 40,
    load: { mass: 40, emoji: '🗽', color: '#bdc3c7', label: 'Statue (40)', startY: 380, targetY: 100, radius: 28 },
    fixedPulleys: [],
    movablePulleys: [],
    effortPoints: [{ id: 'ep1', x: 520, startY: 160 }],
    counterweight: null,
    windlass: null,
    pulleySlots: [
      { id: 'slot1', fixedX: 360, fixedY: 60, movableXOffset: -20 },
      { id: 'slot2', fixedX: 440, fixedY: 60, movableXOffset: +20 },
    ],
    pulleyPalette: [
      { id: 'pair1', x: 180, y: 450 },
      { id: 'pair2', x: 300, y: 450 },
    ],
    // ropeSegments computed dynamically
    ropeSegments: null,
    doorTarget: 1,
    hintAfterTicks: 100,
    winCondition: 'reach_top',
    elephantEvent: null,
  },
  4: {
    id: 'counterweight',
    name: '⛏️ Quarry Hoist',
    desc: 'Pick the right counterweight to make lifting easy.',
    MA: 2,
    multiPlayer: false,
    anchorX: 400, anchorY: 40,
    load: { mass: 24, emoji: '🪨', color: '#7f8c8d', label: 'Stone (24)', startY: 380, targetY: 100, radius: 26 },
    fixedPulleys: [{ id: 'fp1', x: 400, y: 60, radius: 18 }],
    movablePulleys: [{ id: 'mp1', segments: 2, radius: 18 }],
    effortPoints: [{ id: 'ep1', x: 520, startY: 120 }],
    counterweight: {
      mass: 0,
      emoji: '⬜',
      color: '#ecf0f1',
      label: 'None',
      fixed: false,
      homeX: 270, homeY: 200,
      palette: [
        { mass: 4,  emoji: '🪨', color: '#95a5a6', label: '4 kg' },
        { mass: 8,  emoji: '🪨', color: '#7f8c8d', label: '8 kg' },
        { mass: 12, emoji: '🪨', color: '#5d6d7e', label: '12 kg' },
      ],
    },
    windlass: null,
    pulleySlots: null,
    pulleyPalette: null,
    ropeSegments: [
      { from: 'anchor', to: 'mp1', supporting: true },
      { from: 'mp1',    to: 'fp1', supporting: true },
      { from: 'fp1',    to: 'ep1', supporting: false },
    ],
    doorTarget: 1,
    hintAfterTicks: 180,
    winCondition: 'reach_top',
    elephantEvent: null,
  },
  5: {
    id: 'zoo_lift',
    name: '🐘 Zoo Lift',
    desc: 'Lift normally — then something unexpected happens!',
    MA: 2,
    multiPlayer: true,
    anchorX: 400, anchorY: 40,
    load: { mass: 20, emoji: '📦', color: '#e67e22', label: 'Crate (20)', startY: 380, targetY: 100, radius: 26 },
    fixedPulleys: [{ id: 'fp1', x: 400, y: 60, radius: 18 }],
    movablePulleys: [{ id: 'mp1', segments: 2, radius: 18 }],
    effortPoints: [
      { id: 'ep1', x: 480, startY: 120 },
      { id: 'ep2', x: 560, startY: 120 },
    ],
    counterweight: {
      mass: 10,
      emoji: '⚖️',
      color: '#3498db',
      label: 'CW (10)',
      fixed: true,
      homeX: 260, homeY: 200,
      palette: [],
    },
    windlass: null,
    pulleySlots: null,
    pulleyPalette: null,
    ropeSegments: [
      { from: 'anchor', to: 'mp1', supporting: true },
      { from: 'mp1',    to: 'fp1', supporting: true },
      { from: 'fp1',    to: 'ep1', supporting: false },
    ],
    doorTarget: 1,
    hintAfterTicks: 200,
    winCondition: 'reach_top',
    elephantEvent: { triggerY: 280, addedMass: 8, addedEmoji: '🐘', message: 'Baby elephant jumped on! Need another puller!' },
  },
  6: {
    id: 'temple_engine',
    name: '⚙️ Temple Engine',
    desc: 'Turn the windlass crank to lift the heavy block.',
    MA: null, // computed from geometry
    multiPlayer: false,
    anchorX: 400, anchorY: 40,
    load: { mass: 50, emoji: '🧱', color: '#8d6e63', label: 'Block (50)', startY: 400, targetY: 100, radius: 30 },
    fixedPulleys: [],
    movablePulleys: [],
    effortPoints: [],
    counterweight: null,
    windlass: {
      centerX: 500, centerY: 280,
      drumA: { radius: 40 },
      drumB: { radius: 24 },
      handleRadius: 80,
      angle: 0,
    },
    pulleySlots: null,
    pulleyPalette: null,
    ropeSegments: [
      { from: 'anchor',   to: 'windlass', supporting: false },
      { from: 'windlass', to: 'load',     supporting: false },
    ],
    doorTarget: 1,
    hintAfterTicks: 120,
    winCondition: 'reach_top',
    elephantEvent: null,
  },
};

const NUM_LEVELS = Object.keys(LEVELS).length;

export const LEVEL_LIST = Object.entries(LEVELS).map(([num, cfg]) => ({
  number: Number(num),
  id: cfg.id,
  name: cfg.name,
}));

// ── ID counter ────────────────────────────────────────────────────────────────

const nextId = createIdCounter('pu');

// ── Dynamic rig helpers ───────────────────────────────────────────────────────

/**
 * Compute the effective MA for a rig, accounting for placed pulley pairs.
 * For building-mechanic rigs: MA = 1 + 2 * placed pairs.
 * For windlass rigs: delegates to computeMA from physics.
 * For fixed MA rigs: uses rig.MA.
 */
function computeRigMA(rig) {
  if (rig.windlass) return computeMA(rig);
  if (rig.pulleySlots) {
    const placed = rig.pulleySlots.filter(s => s.occupiedBy).length;
    return 1 + placed * 2;
  }
  return rig.MA || 1;
}

/**
 * Compute rope segments for a building-mechanic rig based on placed slots.
 * anchor → [mp_slotN → fp_slotN]... → ep1
 */
function computeRigRopeSegments(rig) {
  const segs = [];
  const occupied = (rig.pulleySlots || []).filter(s => s.occupiedBy);
  let from = 'anchor';
  for (const slot of occupied) {
    segs.push({ from, to: `mp_${slot.id}`, supporting: true });
    from = `mp_${slot.id}`;
    segs.push({ from, to: `fp_${slot.id}`, supporting: true });
    from = `fp_${slot.id}`;
  }
  // Final segment to effort point
  const ep = rig.effortPoints?.[0];
  segs.push({ from, to: ep ? ep.id : 'ep1', supporting: false });
  return segs;
}

// ── Init helpers ──────────────────────────────────────────────────────────────

function buildRig(cfg, sceneH) {
  const effortPoints = (cfg.effortPoints || []).map(ep => {
    const homeY = ep.startY || 150;
    return {
      id: ep.id,
      type: 'effort_point',
      x: ep.x,
      y: homeY,
      homeX: ep.x,
      homeY,
      claimedBy: null,
      claimTime: null,
    };
  });

  const fixedPulleys = (cfg.fixedPulleys || []).map(fp => ({
    id: fp.id,
    type: 'fixed_pulley',
    x: fp.x,
    y: fp.y,
    radius: fp.radius || 18,
  }));

  const movablePulleys = (cfg.movablePulleys || []).map(mp => ({
    id: mp.id,
    type: 'movable_pulley',
    x: cfg.anchorX + (mp.xOffset || 0),
    y: cfg.load.startY - MOVABLE_PULLEY_OFFSET,
    radius: mp.radius || 18,
    segments: mp.segments || 2,
    xOffset: mp.xOffset || 0,
  }));

  let counterweight = null;
  if (cfg.counterweight) {
    const cw = cfg.counterweight;
    counterweight = {
      id: 'cw',
      type: 'counterweight',
      mass: cw.mass,
      emoji: cw.emoji,
      color: cw.color,
      label: cw.label,
      x: cw.homeX,
      y: cw.homeY,
      homeX: cw.homeX,
      homeY: cw.homeY,
      startY: cw.homeY,
      vy: 0,
      fixed: cw.fixed,
      palette: (cw.palette || []).map((item, i) => ({
        id: nextId(),
        type: 'cw_palette',
        mass: item.mass,
        emoji: item.emoji,
        color: item.color,
        label: item.label,
        x: 80 + i * 80,
        y: sceneH - 40,
        homeX: 80 + i * 80,
        homeY: sceneH - 40,
        claimedBy: null,
        claimTime: null,
      })),
      claimedBy: null,
      claimTime: null,
    };
  }

  let windlass = null;
  if (cfg.windlass) {
    windlass = {
      id: 'windlass',
      type: 'windlass',
      centerX: cfg.windlass.centerX,
      centerY: cfg.windlass.centerY,
      drumA: { radius: cfg.windlass.drumA.radius },
      drumB: { radius: cfg.windlass.drumB.radius },
      handleRadius: cfg.windlass.handleRadius,
      angle: 0,
      claimedBy: null,
      claimTime: null,
    };
  }

  // Building-mechanic slots and palette
  let pulleySlots = null;
  let pulleyPalette = null;
  if (cfg.pulleySlots) {
    pulleySlots = cfg.pulleySlots.map(s => ({
      id: s.id,
      fixedX: s.fixedX,
      fixedY: s.fixedY,
      movableXOffset: s.movableXOffset || 0,
      occupiedBy: null,
    }));
  }
  if (cfg.pulleyPalette) {
    pulleyPalette = cfg.pulleyPalette.map(p => ({
      id: p.id,
      type: 'pulley_palette',
      x: p.x,
      y: p.y,
      homeX: p.x,
      homeY: p.y,
      claimedBy: null,
      claimTime: null,
      inSlot: null,
    }));
  }

  const rig = {
    MA: cfg.MA || 1,
    anchorX: cfg.anchorX,
    anchorY: cfg.anchorY,
    fixedPulleys,
    movablePulleys,
    effortPoints,
    counterweight,
    windlass,
    pulleySlots,
    pulleyPalette,
    ropeSegments: cfg.ropeSegments || [],
    multiPlayer: cfg.multiPlayer || false,
    load_homeY: cfg.load.startY,
  };

  // Compute dynamic rope segments for building levels
  if (pulleySlots) {
    rig.ropeSegments = computeRigRopeSegments(rig);
  }

  return rig;
}

function buildLoad(cfg) {
  return {
    id: 'load',
    type: 'load',
    mass: cfg.load.mass,
    emoji: cfg.load.emoji,
    color: cfg.load.color,
    label: cfg.load.label,
    x: cfg.anchorX,
    y: cfg.load.startY,
    vy: 0,
    homeY: cfg.load.startY,
    targetY: cfg.load.targetY,
    radius: cfg.load.radius || 22,
    atTop: false,
  };
}

// ── Module interface ──────────────────────────────────────────────────────────

export function initModule(state, subLevel) {
  const lvl = clamp(subLevel || 1, 1, NUM_LEVELS);
  const cfg = LEVELS[lvl];
  if (!cfg) return;

  initModuleBase(state, { _level: lvl, ...cfg });

  const sceneH = state.sceneHeight || 500;

  const load = buildLoad(cfg);
  const rig  = buildRig(cfg, sceneH);

  state.pu = {
    rig,
    load,
    hintTicks: 0,
    hoistsCompleted: 0,
    elephantEventFired: false,
    elephantEvent: cfg.elephantEvent || null,
    doorTarget: cfg.doorTarget || 1,
    hintAfterTicks: cfg.hintAfterTicks || 120,
  };

  // Clear module-specific ferry/seesaw leftovers
  state.objects = [];
  state.beam = null;
  state.confetti = null;

  state.message = `${cfg.name}: ${cfg.desc}`;
}

// ── Step ──────────────────────────────────────────────────────────────────────

export function stepModule(state, now) {
  const pu   = state.pu;
  if (!pu) return;
  const rig  = pu.rig;
  const load = pu.load;

  if (state.doorOpen) return;

  // 1. Expire stale claims on effort points and windlass
  expireStaleClaimsOnObjects(rig.effortPoints, state, now);
  if (rig.windlass) expireStaleClaimsOnObjects([rig.windlass], state, now);

  // 2. Expire stale claims on palette items; reset any unclaimed+unplaced to home
  if (rig.pulleyPalette) {
    expireStaleClaimsOnObjects(rig.pulleyPalette, state, now);
    for (const item of rig.pulleyPalette) {
      if (!item.claimedBy && !item.inSlot) {
        item.x = item.homeX;
        item.y = item.homeY;
      }
    }
  }

  // 3. Load physics — direct rope-pull model
  if (!rig.windlass) {
    const anyHolding = rig.effortPoints.some(ep => ep.claimedBy);
    if (anyHolding) {
      // Held: freeze load in place
      load.vy = 0;
    } else {
      // Free fall until floor
      load.vy = clamp(load.vy + GRAVITY * TICK_DT, -MAX_LOAD_SPEED, MAX_LOAD_SPEED);
      const newY = load.y + load.vy * TICK_DT;
      const clamped = clampLoad(load, newY, load.vy);
      load.y   = clamped.y;
      load.vy  = clamped.vy;
      load.atTop = clamped.atTop;
    }
  }

  // 4. Update pre-placed movable pulley positions
  for (const mp of rig.movablePulleys) {
    mp.y = load.y - MOVABLE_PULLEY_OFFSET;
    mp.x = load.x + (mp.xOffset || 0);
  }

  // 5. Update effort point visual position when unclaimed (follows rope geometry)
  if (!rig.windlass) {
    const ma = computeRigMA(rig);
    const effortPulled = (load.homeY - load.y) * ma;
    for (const ep of rig.effortPoints) {
      const targetY = ep.homeY + effortPulled;
      if (!ep.claimedBy) {
        ep.y += (targetY - ep.y) * 0.15;
      }
    }
  }

  // 6. Update counterweight position
  if (rig.counterweight && !rig.counterweight.fixed) {
    const rise = load.homeY - load.y;
    rig.counterweight.y = rig.counterweight.homeY + rise;
  }

  // 7. Elephant event (level 5)
  if (pu.elephantEvent && !pu.elephantEventFired) {
    const ev = pu.elephantEvent;
    if (load.y <= ev.triggerY) {
      pu.elephantEventFired = true;
      load.mass += ev.addedMass;
      load.emoji = ev.addedEmoji;
      load.label = `${ev.addedEmoji} (${load.mass})`;
      state.message = ev.message;
    }
  }

  // 8. Hint system
  const connectedPlayers = Object.values(state.players).filter(p => p.connected).length;
  const ma = computeRigMA(rig);
  const cwMass = rig.counterweight ? rig.counterweight.mass : 0;
  const feas = checkLoadFeasibility(rig, load, cwMass, connectedPlayers, ma);

  if (!feas.canLift && !load.atTop) {
    pu.hintTicks++;
    if (pu.hintTicks === pu.hintAfterTicks) {
      emitHint(state, pu, rig, load, cwMass, ma);
    }
  } else {
    pu.hintTicks = 0;
  }

  // 9. Win check
  if (load.atTop && !state.doorOpen) {
    pu.hoistsCompleted++;
    load.vy = 0;

    state.confetti = { startTime: now, x: load.x, y: load.y };

    if (pu.hoistsCompleted >= pu.doorTarget) {
      state.doorOpen = true;
      state.message  = 'Load hoisted! Door opened!';
    } else {
      const remaining = pu.doorTarget - pu.hoistsCompleted;
      state.message = `Hoisted! ${remaining} more to go.`;
    }
  }

  // Clear confetti after duration
  if (state.confetti && now - state.confetti.startTime > CONFETTI_DURATION) {
    state.confetti = null;
  }
}

function emitHint(state, pu, rig, load, cwMass, ma) {
  // Building mechanic: suggest placing pulleys
  if (rig.pulleySlots && rig.pulleyPalette?.length > 0) {
    const allPlaced = rig.pulleySlots.every(s => s.occupiedBy);
    if (!allPlaced) {
      state.message = 'Drag a pulley pair into the dotted ring to build your rig!';
      return;
    }
  }

  const anyPulling = rig.effortPoints.some(ep => ep.claimedBy);
  if (!anyPulling && rig.effortPoints.length > 0) {
    state.message = 'Grab the handle and pull down to lift the load!';
    return;
  }
  if (rig.counterweight && !rig.counterweight.fixed && rig.counterweight.mass === 0) {
    state.message = 'Try adding a counterweight to reduce the effort needed.';
    return;
  }
  if (pu.elephantEventFired) {
    state.message = 'The load got heavier! You need another player to help.';
    return;
  }
  const netMass = Math.max(0, load.mass - cwMass);
  state.message = `Too heavy! MA ×${ma} isn't enough — need MA > ${Math.ceil(netMass / 12)}.`;
}

// ── Input ─────────────────────────────────────────────────────────────────────

const SLOT_SNAP_RADIUS = 60;

export function applyModuleInput(state, playerId, input, now) {
  const player = state.players[playerId];
  if (!player || !player.connected) return false;

  const pu = state.pu;
  if (!pu) return false;

  switch (input.action) {

    case 'cursor_move': {
      applyCursorMove(player, input, state.sceneWidth, state.sceneHeight);

      if (player.heldObjectId) {
        const rig  = pu.rig;
        const load = pu.load;

        // Move held effort point — direct rope-pull model
        const ep = rig.effortPoints.find(e => e.id === player.heldObjectId);
        if (ep) {
          const ma = computeRigMA(rig);
          const cwMass = rig.counterweight ? rig.counterweight.mass : 0;
          const nHolding = rig.effortPoints.filter(e => e.claimedBy).length;

          const delta = player.cursorY - ep.y; // positive = cursor moved down
          ep.x = player.cursorX;
          ep.y = player.cursorY;

          // Only lift if dragging down AND physically feasible
          if (delta > 0 && canLiftLoad(load.mass, cwMass, ma, nHolding)) {
            load.y -= delta / ma;
            const clamped = clampLoad(load, load.y, 0);
            load.y   = clamped.y;
            load.vy  = clamped.vy;
            load.atTop = clamped.atTop;
          }
        }

        // Move windlass crank
        if (rig.windlass && player.heldObjectId === 'windlass') {
          const w = rig.windlass;
          const prevX = player._prevCrankX ?? player.cursorX;
          const prevY = player._prevCrankY ?? player.cursorY;
          const pull = computeWindlassRopePull(w, prevX, prevY, player.cursorX, player.cursorY);
          load.y -= pull;
          const clamped = clampLoad(load, load.y, load.vy);
          load.y   = clamped.y;
          load.vy  = clamped.vy;
          load.atTop = clamped.atTop;
          const dx = player.cursorX - w.centerX;
          const dy = player.cursorY - w.centerY;
          w.angle = Math.atan2(dy, dx);
        }
        player._prevCrankX = player.cursorX;
        player._prevCrankY = player.cursorY;

        // Move dragged palette item
        if (rig.pulleyPalette) {
          const item = rig.pulleyPalette.find(i => i.id === player.heldObjectId);
          if (item) {
            item.x = player.cursorX;
            item.y = player.cursorY;
          }
        }
      }
      return true;
    }

    case 'grab': {
      const { objectId } = input;

      // Effort point grab
      const ep = pu.rig.effortPoints.find(e => e.id === objectId);
      if (ep && !ep.claimedBy) {
        claimObject(ep, player, now);
        return true;
      }

      // Windlass grab
      if (pu.rig.windlass && objectId === 'windlass' && !pu.rig.windlass.claimedBy) {
        claimObject(pu.rig.windlass, player, now);
        player._prevCrankX = player.cursorX;
        player._prevCrankY = player.cursorY;
        return true;
      }

      // Counterweight palette item
      if (pu.rig.counterweight && !pu.rig.counterweight.fixed) {
        const item = pu.rig.counterweight.palette?.find(i => i.id === objectId);
        if (item && !item.claimedBy) {
          claimObject(item, player, now);
          return true;
        }
      }

      // Pulley palette item (building mechanic)
      if (pu.rig.pulleyPalette) {
        const item = pu.rig.pulleyPalette.find(i => i.id === objectId);
        if (item && !item.claimedBy) {
          // If this item is in a slot, remove it from the slot first
          if (item.inSlot) {
            const slot = pu.rig.pulleySlots.find(s => s.id === item.inSlot);
            if (slot) slot.occupiedBy = null;
            item.inSlot = null;
            pu.rig.ropeSegments = computeRigRopeSegments(pu.rig);
          }
          claimObject(item, player, now);
          return true;
        }
      }

      return true;
    }

    case 'release': {
      if (!player.heldObjectId) return true;
      const heldId = player.heldObjectId;

      // Release effort point
      const ep = pu.rig.effortPoints.find(e => e.id === heldId);
      if (ep) {
        releaseObject(ep, player);
        return true;
      }

      // Release windlass
      if (pu.rig.windlass && heldId === 'windlass') {
        releaseObject(pu.rig.windlass, player);
        player._prevCrankX = null;
        player._prevCrankY = null;
        return true;
      }

      // Release counterweight palette item — snap to slot if dropped near CW anchor
      if (pu.rig.counterweight && !pu.rig.counterweight.fixed) {
        const cw = pu.rig.counterweight;
        const item = cw.palette?.find(i => i.id === heldId);
        if (item) {
          releaseObject(item, player);
          const dist = Math.hypot(player.cursorX - cw.homeX, player.cursorY - cw.homeY);
          if (dist < 80) {
            cw.mass  = item.mass;
            cw.emoji = item.emoji;
            cw.color = item.color;
            cw.label = item.label;
            state.message = `Counterweight set to ${item.label}`;
          }
          item.x = item.homeX;
          item.y = item.homeY;
          return true;
        }
      }

      // Release pulley palette item — snap to slot if dropped near one
      if (pu.rig.pulleyPalette) {
        const item = pu.rig.pulleyPalette.find(i => i.id === heldId);
        if (item) {
          releaseObject(item, player);
          let placed = false;
          for (const slot of pu.rig.pulleySlots || []) {
            if (slot.occupiedBy) continue;
            const dist = Math.hypot(player.cursorX - slot.fixedX, player.cursorY - slot.fixedY);
            if (dist < SLOT_SNAP_RADIUS) {
              slot.occupiedBy = item.id;
              item.inSlot = slot.id;
              item.x = slot.fixedX;
              item.y = slot.fixedY;
              pu.rig.ropeSegments = computeRigRopeSegments(pu.rig);
              const ma = computeRigMA(pu.rig);
              state.message = `Pulley placed! MA is now ×${ma}. Pull the rope!`;
              placed = true;
              break;
            }
          }
          if (!placed) {
            item.x = item.homeX;
            item.y = item.homeY;
            item.inSlot = null;
          }
          return true;
        }
      }

      player.heldObjectId = null;
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

export const numLevels = NUM_LEVELS;
