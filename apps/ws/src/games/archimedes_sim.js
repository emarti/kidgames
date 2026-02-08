/**
 * Archimedes — Physics Toy Museum
 * Top-level simulation dispatcher.
 *
 * Routes step(), applyInput(), and initModule() to the currently-active
 * module handler (ferry, seesaw, pulley, …).
 *
 * The WebSocket host (archimedes.js) imports this file exclusively.
 * Individual modules live in archimedes_<name>_sim.js.
 */

import * as FerrySim from './archimedes_ferry_sim.js';

// ── Module registry ─────────────────────────────────────────────────────────
// Each entry maps a moduleType string to its handler module.
// Handlers must export: { initModule, stepModule, applyModuleInput, numLevels, LEVEL_LIST }

const MODULES = {
  ferry: { index: 1, name: '🚢 Buoyancy Ferry', handler: FerrySim },
  // seesaw: { index: 2, name: '⚖️ Seesaw Lab', handler: SeesawSim },
  // pulley: { index: 3, name: '🔗 Pulley Builder', handler: PulleySim },
  // gears:  { index: 4, name: '⚙️ Gears Playground', handler: GearsSim },
  // sail:   { index: 5, name: '⛵ Points of Sail', handler: SailSim },
  // density:{ index: 6, name: '🛁 Density Bath', handler: DensitySim },
  // sandbox:{ index: 7, name: '🏴‍☠️ Treasure Chest', handler: SandboxSim },
};

/** Ordered list of module types for navigation. */
const MODULE_ORDER = Object.entries(MODULES)
  .sort((a, b) => a[1].index - b[1].index)
  .map(([type]) => type);

const NUM_MODULES = MODULE_ORDER.length;

/** Exported list of modules for UI. */
export const MODULE_LIST = MODULE_ORDER.map(type => ({
  type,
  index: MODULES[type].index,
  name: MODULES[type].name,
  subLevels: MODULES[type].handler.LEVEL_LIST,
}));

function getHandler(state) {
  const mod = MODULES[state.moduleType];
  return mod ? mod.handler : FerrySim; // fallback
}

// ── Player helpers ──────────────────────────────────────────────────────────

function makePlayer(id) {
  return {
    id,
    connected: false,
    paused: true,
    color: ['#2ecc71', '#3498db', '#e67e22', '#9b59b6'][id - 1] || '#888',
    cursorX: 0,
    cursorY: 0,
    heldObjectId: null,
  };
}

// ── State management ────────────────────────────────────────────────────────

export function newGameState() {
  const state = {
    tick: 0,
    paused: true,
    gamePaused: false,
    reasonPaused: 'start',

    // Module tracking
    moduleType: 'ferry',       // key into MODULES
    moduleIndex: 1,            // 1-based display index
    moduleName: '🚢 Buoyancy Ferry',
    maxModuleUnlocked: 1,

    // Sub-level within the current module
    level: 1,
    levelId: '',
    levelName: '',

    sceneWidth: 800,
    sceneHeight: 500,

    // Module-specific fields will be set by initModule()
    objects: [],
    totalToDeliver: 0,
    deliveredCount: 0,
    tripsCompleted: 0,
    cargoMass: 0,

    players: { 1: makePlayer(1), 2: makePlayer(2), 3: makePlayer(3), 4: makePlayer(4) },

    doorOpen: false,
    showLevelSelect: false,
    message: '',
  };

  initModule(state, 'ferry', 1);
  return state;
}

/**
 * Switch to a module (physics toy) and optionally a sub-level within it.
 */
function initModule(state, moduleType, subLevel) {
  const mod = MODULES[moduleType];
  if (!mod) return;

  state.moduleType = moduleType;
  state.moduleIndex = mod.index;
  state.moduleName = mod.name;
  state.doorOpen = false;
  state.showLevelSelect = false;

  mod.handler.initModule(state, subLevel || 1);
}

export function setLevel(state, level) {
  const handler = getHandler(state);
  const clamped = Math.max(1, Math.min(Number(level) || 1, handler.numLevels));
  handler.initModule(state, clamped);
}

export function setModule(state, moduleType, subLevel) {
  initModule(state, moduleType, subLevel);
}

// ── Input handling ──────────────────────────────────────────────────────────

export function applyInput(state, playerId, input, now) {
  const player = state.players[playerId];
  if (!player || !player.connected) return;

  // Generic actions handled at dispatcher level
  switch (input.action) {
    case 'set_level': {
      setLevel(state, Number(input.level) || 1);
      return;
    }

    case 'set_module': {
      const mt = input.moduleType;
      if (MODULES[mt]) setModule(state, mt, Number(input.subLevel) || 1);
      return;
    }

    case 'toggle_level_select': {
      state.showLevelSelect = !state.showLevelSelect;
      return;
    }

    case 'toggle_pause': {
      state.gamePaused = !state.gamePaused;
      state.message = state.gamePaused ? 'PAUSED' : '';
      return;
    }

    case 'door_click': {
      if (state.doorOpen) {
        // Within the current module, advance to next sub-level
        const handler = getHandler(state);
        const nextLevel = state.level + 1;
        if (nextLevel <= handler.numLevels) {
          handler.initModule(state, nextLevel);
        } else {
          // Advance to next module
          const currentIdx = MODULE_ORDER.indexOf(state.moduleType);
          const nextModIdx = currentIdx + 1;
          if (nextModIdx < NUM_MODULES) {
            initModule(state, MODULE_ORDER[nextModIdx], 1);
          } else {
            state.message = 'You completed all modules!';
          }
        }
      }
      return;
    }
  }

  // Delegate to the active module's input handler
  const handler = getHandler(state);
  handler.applyModuleInput(state, playerId, input, now);
}

// ── Simulation step ─────────────────────────────────────────────────────────

export function step(state, now) {
  state.tick++;
  if (state.gamePaused) return true;

  const handler = getHandler(state);
  handler.stepModule(state, now);

  return true;
}

// ── Player management ───────────────────────────────────────────────────────

export function setPlayerConnected(state, playerId, connected) {
  const p = state.players[playerId];
  if (!p) return;
  p.connected = connected;

  if (!connected && p.heldObjectId) {
    const obj = state.objects.find(o => o.id === p.heldObjectId);
    if (obj) { obj.claimedBy = null; obj.claimTime = null; }
    p.heldObjectId = null;
  }
}

export function togglePause(state, playerId) {
  const p = state.players[playerId];
  if (!p) return;
  p.paused = !p.paused;
  if (!p.paused && state.reasonPaused === 'start') {
    state.reasonPaused = null;
    state.paused = false;
  }
}

export function resume(state, playerId) {
  const p = state.players[playerId];
  if (!p) return;
  p.paused = false;
  if (state.reasonPaused === 'start') {
    state.reasonPaused = null;
    state.paused = false;
  }
}

// ── Re-exports for client reference ─────────────────────────────────────────

export { HULL_WIDTH, HULL_HEIGHT, EMPTY_FREEBOARD, EMPTY_DRAFT } from './archimedes_ferry_sim.js';
