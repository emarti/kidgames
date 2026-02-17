/**
 * Archimedes — Module 3: Pulley Builder
 * Server-side simulation for the Pulley module.
 *
 * Physics model: mechanical advantage via pulleys.
 *   - MA = number of rope segments supporting the load
 *   - effortRequired = max(0, loadWeight - counterweightWeight) / MA
 *   - Player pulls rope down, load goes up; speed proportional to surplus effort
 *
 * Exports the module interface expected by archimedes_sim.js dispatcher:
 *   { initModule, stepModule, applyModuleInput, numLevels, LEVEL_LIST }
 */

import { clamp } from './maze_utils.js';

// ── Constants ────────────────────────────────────────────────────────────────

const TICK_DT = 0.05;           // 50ms per tick
const CLAIM_TIMEOUT = 3000;     // ms
const CONFETTI_DURATION = 2000; // ms
const MAX_EFFORT = 15;          // player's maximum pull strength
const GRAVITY_SINK = 0.3;       // px/tick load sinks when not pulling
const LIFT_SPEED_FACTOR = 1.5;  // px per unit of surplus effort per tick
const STRAIN_BUDGE = 2.5;       // px the load budges when straining
const STRAIN_SINK = 0.15;       // px/tick sink-back when straining
const SNAP_DIST = 40;           // px for snapping pulleys to anchors/load
const LIFTED_HOLD_TICKS = 30;   // ticks load must stay at target to win
const ROPE_STRIPE_SPEED = 3;    // stripe offset per px of pull

// ── Levels ───────────────────────────────────────────────────────────────────

const LEVELS = {
  1: {
    id: 'direct_lift',
    name: '🔗 Direct Lift',
    desc: 'Pull the rope to lift the crate!',
    load: { weight: 5, emoji: '📦', label: 'Crate', width: 50, height: 40 },
    anchors: [
      { id: 'a1', x: 400, y: 60, type: 'fixed' },
    ],
    startPulleys: [
      { type: 'fixed', anchorId: 'a1' },
    ],
    palette: [],
    counterweight: null,
    elevator: null,
    doorTarget: 1,
    targetY: 100,
    ceilingY: 50,
    floorY: 400,
  },
  2: {
    id: 'too_heavy',
    name: '🔗 Too Heavy!',
    desc: 'Too heavy! Add a movable pulley.',
    load: { weight: 20, emoji: '📦', label: 'Heavy Crate', width: 55, height: 45 },
    anchors: [
      { id: 'a1', x: 400, y: 60, type: 'fixed' },
      { id: 'a2', x: 300, y: 60, type: 'fixed' },
    ],
    startPulleys: [
      { type: 'fixed', anchorId: 'a1' },
    ],
    palette: [
      { type: 'movable' },
    ],
    counterweight: null,
    elevator: null,
    doorTarget: 1,
    targetY: 120,
    ceilingY: 50,
    floorY: 400,
  },
  3: {
    id: 'even_heavier',
    name: '🔗 Even Heavier!',
    desc: 'A boulder! You\'ll need lots of pulleys.',
    load: { weight: 45, emoji: '🪨', label: 'Boulder', width: 60, height: 55 },
    anchors: [
      { id: 'a1', x: 400, y: 60, type: 'fixed' },
      { id: 'a2', x: 300, y: 60, type: 'fixed' },
      { id: 'a3', x: 500, y: 60, type: 'fixed' },
    ],
    startPulleys: [
      { type: 'fixed', anchorId: 'a1' },
    ],
    palette: [
      { type: 'movable' },
      { type: 'movable' },
      { type: 'fixed' },
    ],
    counterweight: null,
    elevator: null,
    doorTarget: 1,
    targetY: 130,
    ceilingY: 50,
    floorY: 400,
  },
  4: {
    id: 'the_elevator',
    name: '🛗 The Elevator',
    desc: 'Build an elevator!',
    load: { weight: 8, emoji: '🛗', label: 'Elevator', width: 70, height: 50 },
    anchors: [
      { id: 'a1', x: 350, y: 60, type: 'fixed' },
      { id: 'a2', x: 250, y: 60, type: 'fixed' },
      { id: 'a3', x: 450, y: 60, type: 'fixed' },
    ],
    startPulleys: [
      { type: 'fixed', anchorId: 'a1' },
    ],
    palette: [
      { type: 'movable' },
      { type: 'fixed' },
    ],
    counterweight: { maxWeight: 40, items: [] },
    elevator: {
      waves: [
        { people: [], totalMass: 0 },                                         // wave 0: empty
        { people: [{ emoji: '🧒', mass: 8 }, { emoji: '🧒', mass: 8 }], totalMass: 16 }, // wave 1
      ],
    },
    doorTarget: 2,
    targetY: 100,
    ceilingY: 50,
    floorY: 400,
  },
  5: {
    id: 'busy_elevator',
    name: '🛗 Busy Elevator',
    desc: 'Handle all the passengers!',
    load: { weight: 8, emoji: '🛗', label: 'Elevator', width: 70, height: 50 },
    anchors: [
      { id: 'a1', x: 350, y: 60, type: 'fixed' },
      { id: 'a2', x: 250, y: 60, type: 'fixed' },
      { id: 'a3', x: 450, y: 60, type: 'fixed' },
      { id: 'a4', x: 550, y: 60, type: 'fixed' },
    ],
    startPulleys: [
      { type: 'fixed', anchorId: 'a1' },
    ],
    palette: [
      { type: 'movable' },
      { type: 'movable' },
      { type: 'fixed' },
    ],
    counterweight: { maxWeight: 60, items: [] },
    elevator: {
      waves: [
        { people: [], totalMass: 0 },                                                         // wave 0: empty
        { people: [{ emoji: '🧒', mass: 8 }], totalMass: 8 },                                // wave 1
        { people: [{ emoji: '🧒', mass: 8 }, { emoji: '🧒', mass: 8 }, { emoji: '👨', mass: 15 }], totalMass: 31 }, // wave 2
      ],
    },
    doorTarget: 3,
    targetY: 100,
    ceilingY: 50,
    floorY: 400,
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
function nextId() { return 'pu_' + (++_idCounter); }

/** Compute mechanical advantage: count rope segments supporting the load. */
function computeMA(pulleys) {
  // MA = 1 (fixed only, rope redirects) + 1 per movable pulley in the system
  // More precisely: each movable pulley doubles the segments on the load side.
  // Simple model: MA = number of rope segments touching the load block.
  // With only fixed pulleys: MA = 1
  // Each movable pulley added: MA += 1 (it adds one supporting segment)
  const placed = pulleys.filter(p => p.placed);
  const movableCount = placed.filter(p => p.type === 'movable').length;
  // Base MA is 1 (the free end going to player). Each movable pulley adds 1 segment.
  // If there are fixed pulleys redirecting, the MA doesn't change from fixed alone.
  // MA = 1 + movableCount (standard compound pulley)
  return 1 + movableCount;
}

/** Build rope waypoints from placed pulleys (top-down zigzag). */
function buildRopeWaypoints(state) {
  const pulleys = state.pulley.pulleys.filter(p => p.placed);
  const load = state.pulley.load;
  const waypoints = [];

  // Sort pulleys: fixed ones at ceiling, movable ones at load
  const fixed = pulleys.filter(p => p.type === 'fixed').sort((a, b) => a.x - b.x);
  const movable = pulleys.filter(p => p.type === 'movable').sort((a, b) => a.x - b.x);

  // Build zigzag: rope starts at anchor point, goes down to load/movable, back up to fixed, etc.
  // Simple model: rope goes from anchor → down to load zone → up to next fixed → down → ...
  // Then free end hangs down for player to pull.

  if (fixed.length === 0) {
    // No pulleys at all - rope straight from ceiling to load
    waypoints.push({ x: load.x, y: state.pulley.ceilingY });
    waypoints.push({ x: load.x, y: load.y });
    state.pulley.rope.waypoints = waypoints;
    return;
  }

  // First fixed pulley: rope attached at top
  const loadCenterX = load.x;
  const loadTopY = load.y - load.height / 2;

  // Interleave: fixed[0] → movable[0] → fixed[1] → movable[1] → ...
  // Start with attachment point on load
  waypoints.push({ x: loadCenterX, y: loadTopY, type: 'load' });

  let fi = 0, mi = 0;
  let goingUp = true;
  while (fi < fixed.length || mi < movable.length) {
    if (goingUp && fi < fixed.length) {
      waypoints.push({ x: fixed[fi].x, y: fixed[fi].y, type: 'fixed', id: fixed[fi].id });
      fi++;
      goingUp = false;
    } else if (!goingUp && mi < movable.length) {
      // Movable pulley is at load level
      waypoints.push({ x: movable[mi].x, y: loadTopY, type: 'movable', id: movable[mi].id });
      mi++;
      goingUp = true;
    } else if (fi < fixed.length) {
      waypoints.push({ x: fixed[fi].x, y: fixed[fi].y, type: 'fixed', id: fixed[fi].id });
      fi++;
      goingUp = false;
    } else {
      break;
    }
  }

  // Free end: comes down from last waypoint
  const last = waypoints[waypoints.length - 1];
  const freeEndX = last.x + 30;
  const freeEndY = state.pulley.floorY - 20;
  waypoints.push({ x: freeEndX, y: freeEndY, type: 'free' });

  state.pulley.rope.waypoints = waypoints;
  state.pulley.rope.freeEndX = freeEndX;
  state.pulley.rope.freeEndY = freeEndY;
}

function computeEffortEmoji(ratio) {
  // ratio = effortRequired / maxEffort
  if (ratio <= 0.3) return '😊';
  if (ratio <= 0.6) return '😤';
  if (ratio <= 1.0) return '😰';
  return '😫';
}

/** Counterweight palette items for levels 4-5 */
const CW_BLOCKS = [
  { type: 'cw_small', weight: 5, emoji: '🧱', label: '5kg' },
  { type: 'cw_medium', weight: 10, emoji: '🪨', label: '10kg' },
  { type: 'cw_large', weight: 15, emoji: '⚒️', label: '15kg' },
];

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
  state.confetti = null;
  state.doorTarget = cfg.doorTarget;
  state.doorProgress = 0;

  // Clear seesaw/ferry fields
  state.beam = null;
  state.boat = null;
  state.deliveredCount = 0;
  state.tripsCompleted = 0;
  state.cargoMass = 0;

  const loadX = 400;

  state.pulley = {
    ceilingY: cfg.ceilingY,
    floorY: cfg.floorY,
    targetY: cfg.targetY,

    load: {
      weight: cfg.load.weight,
      baseWeight: cfg.load.weight,
      y: cfg.floorY - cfg.load.height / 2,
      x: loadX,
      emoji: cfg.load.emoji,
      label: cfg.load.label,
      width: cfg.load.width,
      height: cfg.load.height,
    },

    anchors: cfg.anchors.map(a => ({ ...a })),

    pulleys: [],
    palette: [],

    rope: {
      waypoints: [],
      freeEndX: loadX + 30,
      freeEndY: cfg.floorY - 20,
      pulledAmount: 0,
      stripeOffset: 0,
    },

    ma: 1,
    effortRequired: cfg.load.weight,

    pull: {
      playerId: null,
      active: false,
      dragStartY: 0,
      currentY: 0,
      effort: 0,
      maxEffort: MAX_EFFORT,
    },

    effortMeter: {
      value: 0,
      emoji: '😊',
    },

    liftProgress: 0,
    lifted: false,
    liftedTicks: 0,

    counterweight: null,
    elevator: null,
  };

  // Place starting pulleys
  let pulleyIndex = 0;
  for (const sp of cfg.startPulleys) {
    const anchor = cfg.anchors.find(a => a.id === sp.anchorId);
    const pulley = {
      id: nextId(),
      type: sp.type,
      x: anchor ? anchor.x : loadX,
      y: anchor ? anchor.y : cfg.ceilingY,
      anchorId: sp.anchorId || null,
      radius: 15,
      placed: true,
      claimedBy: null,
      claimTime: null,
    };
    state.pulley.pulleys.push(pulley);
    pulleyIndex++;
  }

  // Create palette items (pulleys to place)
  const paletteStartX = 150;
  const paletteSpacing = 80;
  for (let i = 0; i < cfg.palette.length; i++) {
    const pp = cfg.palette[i];
    const pulley = {
      id: nextId(),
      type: pp.type,
      x: paletteStartX + i * paletteSpacing,
      y: cfg.floorY + 40,
      anchorId: null,
      radius: 15,
      placed: false,
      claimedBy: null,
      claimTime: null,
    };
    state.pulley.pulleys.push(pulley);
    state.pulley.palette.push(pulley.id);
  }

  // Counterweight setup
  if (cfg.counterweight) {
    state.pulley.counterweight = {
      weight: 0,
      y: cfg.ceilingY + 30,
      maxWeight: cfg.counterweight.maxWeight,
      items: [],
      // CW palette
      cwPalette: CW_BLOCKS.map((b, i) => ({
        id: nextId(),
        ...b,
        x: 650 + i * 50,
        y: cfg.floorY + 40,
        placed: false,
        claimedBy: null,
        claimTime: null,
      })),
    };
  }

  // Elevator setup
  if (cfg.elevator) {
    state.pulley.elevator = {
      people: [],
      peopleWaveIndex: 0,
      totalMass: 0,
      waves: cfg.elevator.waves,
      waveCompleted: false,
    };
  }

  // Compute initial state
  state.pulley.ma = computeMA(state.pulley.pulleys);
  updateEffort(state);
  buildRopeWaypoints(state);

  // Release all player holds
  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    if (p) p.heldObjectId = null;
  }

  state.objects = []; // pulley module doesn't use shared objects array
  state.message = `${cfg.name}: ${cfg.desc}`;
}

function updateEffort(state) {
  const pu = state.pulley;
  const totalLoadWeight = pu.load.weight + (pu.elevator ? pu.elevator.totalMass : 0);
  const cwWeight = pu.counterweight ? pu.counterweight.weight : 0;
  const netWeight = Math.max(0, totalLoadWeight - cwWeight);
  pu.effortRequired = netWeight / pu.ma;
  pu.effortMeter.value = pu.effortRequired;
  pu.effortMeter.emoji = computeEffortEmoji(pu.effortRequired / pu.pull.maxEffort);
}

/**
 * Pulley simulation step. Called each tick by the dispatcher.
 */
export function stepModule(state, now) {
  const pu = state.pulley;
  if (!pu) return;

  // 1. Expire stale claims on pulleys
  for (const p of pu.pulleys) {
    if (p.claimedBy && p.claimTime && now - p.claimTime > CLAIM_TIMEOUT) {
      const player = state.players[p.claimedBy];
      if (player) player.heldObjectId = null;
      p.claimedBy = null;
      p.claimTime = null;
    }
  }

  // Expire stale CW claims
  if (pu.counterweight) {
    for (const item of pu.counterweight.cwPalette) {
      if (item.claimedBy && item.claimTime && now - item.claimTime > CLAIM_TIMEOUT) {
        const player = state.players[item.claimedBy];
        if (player) player.heldObjectId = null;
        item.claimedBy = null;
        item.claimTime = null;
      }
    }
  }

  // 2. Update effort
  updateEffort(state);

  // 3. Handle pull physics
  const pull = pu.pull;
  const load = pu.load;
  const maxY = pu.floorY - load.height / 2;  // bottom position
  const minY = pu.targetY;                     // target position (top)

  if (pull.active && pull.playerId) {
    const dragDist = pull.dragStartY < pull.currentY
      ? pull.currentY - pull.dragStartY : 0;
    // effort proportional to drag distance, capped at maxEffort
    pull.effort = clamp(dragDist / 15, 0, pull.maxEffort);

    if (pull.effort > pu.effortRequired) {
      // Lifting! Speed proportional to surplus
      const surplus = pull.effort - pu.effortRequired;
      const liftSpeed = surplus * LIFT_SPEED_FACTOR / pu.ma;
      load.y = Math.max(minY, load.y - liftSpeed);
      pu.rope.pulledAmount += liftSpeed * pu.ma;
      pu.rope.stripeOffset += liftSpeed * ROPE_STRIPE_SPEED;
    } else if (pull.effort > pu.effortRequired * 0.5) {
      // Straining: budge up slightly then sink back
      const budge = STRAIN_BUDGE * (pull.effort / pu.effortRequired - 0.5);
      load.y = Math.max(minY, load.y - budge * 0.1);
      // But also slowly sinking
      load.y = Math.min(maxY, load.y + STRAIN_SINK);
    }
  } else {
    // Not pulling: gravity sinks load slowly
    if (load.y < maxY) {
      load.y = Math.min(maxY, load.y + GRAVITY_SINK);
      pu.rope.stripeOffset -= GRAVITY_SINK * ROPE_STRIPE_SPEED * 0.5;
    }
    pull.effort = 0;
  }

  // Update movable pulley Y positions to track load
  for (const p of pu.pulleys) {
    if (p.type === 'movable' && p.placed) {
      p.y = load.y - load.height / 2;
    }
  }

  // Update counterweight position (inversely to load)
  if (pu.counterweight) {
    const loadRange = maxY - minY;
    const loadProgress = (maxY - load.y) / loadRange;
    pu.counterweight.y = pu.ceilingY + 30 + loadProgress * (pu.floorY - pu.ceilingY - 80);
  }

  // Update rope waypoints
  buildRopeWaypoints(state);

  // 4. Lift progress and completion check
  const loadRange = maxY - minY;
  pu.liftProgress = loadRange > 0 ? (maxY - load.y) / loadRange : 0;

  if (load.y <= minY + 5) {
    pu.liftedTicks++;
    if (pu.liftedTicks >= LIFTED_HOLD_TICKS && !pu.lifted) {
      pu.lifted = true;
      handleLiftComplete(state, now);
    }
  } else {
    pu.liftedTicks = 0;
  }

  // 5. Clear confetti
  if (state.confetti && now - state.confetti.startTime > CONFETTI_DURATION) {
    state.confetti = null;
  }
}

function handleLiftComplete(state, now) {
  const pu = state.pulley;

  state.doorProgress++;
  state.confetti = { startTime: now, x: pu.load.x, y: pu.targetY - 30 };

  // Check elevator wave progression
  if (pu.elevator) {
    const nextWave = pu.elevator.peopleWaveIndex + 1;
    if (nextWave < pu.elevator.waves.length) {
      // Lower elevator back, add next wave of people
      pu.elevator.waveCompleted = true;

      // Schedule next wave after brief pause (handled in next few ticks)
      setTimeout(() => {
        if (!pu.elevator) return;
        pu.load.y = pu.floorY - pu.load.height / 2;
        pu.lifted = false;
        pu.liftedTicks = 0;
        pu.liftProgress = 0;

        pu.elevator.peopleWaveIndex = nextWave;
        const wave = pu.elevator.waves[nextWave];
        pu.elevator.people = wave.people.map(p => ({ ...p }));
        pu.elevator.totalMass = wave.totalMass;
        pu.elevator.waveCompleted = false;

        updateEffort(state);
        buildRopeWaypoints(state);

        if (nextWave > 0) {
          state.message = `${wave.people.length} passenger${wave.people.length !== 1 ? 's' : ''} boarding! (${wave.totalMass}kg added)`;
        }
      }, 1500);

      state.message = `Lift complete! More passengers incoming...`;
    } else {
      state.message = 'All passengers delivered!';
    }
  }

  if (state.doorProgress >= state.doorTarget && !state.doorOpen) {
    state.doorOpen = true;
    state.message = 'Lifted! Door opened!';
  } else if (!state.doorOpen) {
    const remaining = state.doorTarget - state.doorProgress;
    state.message = remaining > 0
      ? `Lifted! ${remaining} more lift${remaining !== 1 ? 's' : ''} to go.`
      : 'Lifted!';
  }
}

/**
 * Handle pulley-specific input.
 */
export function applyModuleInput(state, playerId, input, now) {
  const player = state.players[playerId];
  if (!player || !player.connected) return false;
  const pu = state.pulley;
  if (!pu) return false;

  switch (input.action) {
    case 'cursor_move': {
      player.cursorX = clamp(input.x || 0, 0, state.sceneWidth);
      player.cursorY = clamp(input.y || 0, 0, state.sceneHeight);

      // Move held pulley
      if (player.heldObjectId) {
        const pulley = pu.pulleys.find(p => p.id === player.heldObjectId);
        if (pulley) {
          pulley.x = player.cursorX;
          pulley.y = player.cursorY;
        }
        // Move held CW item
        if (pu.counterweight) {
          const cwItem = pu.counterweight.cwPalette.find(c => c.id === player.heldObjectId);
          if (cwItem) {
            cwItem.x = player.cursorX;
            cwItem.y = player.cursorY;
          }
        }
      }

      // Update pull drag
      if (pu.pull.active && pu.pull.playerId === playerId) {
        pu.pull.currentY = player.cursorY;
      }
      return true;
    }

    case 'pull_start': {
      if (pu.pull.active) return true; // someone already pulling

      // Check if pointer is near the rope free end
      const dist = Math.hypot(
        player.cursorX - pu.rope.freeEndX,
        player.cursorY - pu.rope.freeEndY
      );
      if (dist < 50) {
        pu.pull.playerId = playerId;
        pu.pull.active = true;
        pu.pull.dragStartY = player.cursorY;
        pu.pull.currentY = player.cursorY;
        pu.pull.effort = 0;
      }
      return true;
    }

    case 'pull_stop': {
      if (pu.pull.playerId === playerId) {
        pu.pull.active = false;
        pu.pull.playerId = null;
        pu.pull.effort = 0;
        pu.pull.dragStartY = 0;
        pu.pull.currentY = 0;
      }
      return true;
    }

    case 'grab': {
      const objectId = input.objectId;

      // Check pulleys
      const pulley = pu.pulleys.find(p => p.id === objectId);
      if (pulley && !pulley.claimedBy) {
        pulley.claimedBy = playerId;
        pulley.claimTime = now;
        player.heldObjectId = pulley.id;
        if (pulley.placed) {
          pulley.placed = false;
          pulley.anchorId = null;
          // Recalculate
          pu.ma = computeMA(pu.pulleys);
          updateEffort(state);
          buildRopeWaypoints(state);
        }
        return true;
      }

      // Check CW palette items
      if (pu.counterweight) {
        const cwItem = pu.counterweight.cwPalette.find(c => c.id === objectId && !c.claimedBy && !c.placed);
        if (cwItem) {
          cwItem.claimedBy = playerId;
          cwItem.claimTime = now;
          player.heldObjectId = cwItem.id;
          return true;
        }
      }
      return true;
    }

    case 'release': {
      if (!player.heldObjectId) return true;

      // Check if releasing a pulley
      const pulley = pu.pulleys.find(p => p.id === player.heldObjectId);
      if (pulley) {
        pulley.claimedBy = null;
        pulley.claimTime = null;
        player.heldObjectId = null;

        // Try to snap to anchor or load zone
        if (pulley.type === 'fixed') {
          // Snap to nearest unoccupied anchor
          let bestAnchor = null;
          let bestDist = SNAP_DIST;
          for (const anchor of pu.anchors) {
            if (anchor.type !== 'fixed') continue;
            // Check if anchor is already occupied
            const occupied = pu.pulleys.some(p => p.placed && p.anchorId === anchor.id && p.id !== pulley.id);
            if (occupied) continue;
            const dist = Math.hypot(pulley.x - anchor.x, pulley.y - anchor.y);
            if (dist < bestDist) {
              bestAnchor = anchor;
              bestDist = dist;
            }
          }
          if (bestAnchor) {
            pulley.placed = true;
            pulley.anchorId = bestAnchor.id;
            pulley.x = bestAnchor.x;
            pulley.y = bestAnchor.y;
          } else {
            // Return to palette
            pulley.placed = false;
            pulley.y = pu.floorY + 40;
          }
        } else if (pulley.type === 'movable') {
          // Snap to load zone (near the load)
          const loadTopY = pu.load.y - pu.load.height / 2;
          const dist = Math.abs(pulley.y - loadTopY);
          if (dist < SNAP_DIST + 30) {
            pulley.placed = true;
            pulley.y = loadTopY;
            // Keep x near where dropped, but constrain
            pulley.x = clamp(pulley.x, pu.load.x - 60, pu.load.x + 60);
          } else {
            pulley.placed = false;
            pulley.y = pu.floorY + 40;
          }
        }

        // Recalculate
        pu.ma = computeMA(pu.pulleys);
        updateEffort(state);
        buildRopeWaypoints(state);
        return true;
      }

      // Check CW item release
      if (pu.counterweight) {
        const cwItem = pu.counterweight.cwPalette.find(c => c.id === player.heldObjectId);
        if (cwItem) {
          cwItem.claimedBy = null;
          cwItem.claimTime = null;
          player.heldObjectId = null;

          // Check if near counterweight zone (right side of screen)
          if (cwItem.x > 580 && cwItem.y < pu.floorY - 30) {
            cwItem.placed = true;
            pu.counterweight.items.push({ ...cwItem });
            pu.counterweight.weight = pu.counterweight.items.reduce((s, i) => s + i.weight, 0);
            updateEffort(state);
          } else {
            cwItem.placed = false;
            cwItem.y = pu.floorY + 40;
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

/** How many sub-levels this module has. */
export const numLevels = NUM_LEVELS;
