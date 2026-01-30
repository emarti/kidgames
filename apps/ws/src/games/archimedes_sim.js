/**
 * Archimedes - Physics Toy Museum
 * Server-side simulation for Level 1: River Ferry
 * 
 * A cooperative multiplayer physics playground where players drag objects
 * onto a ferry boat to transport them across a river.
 */

import { clamp } from './maze_utils.js';

// ----- Constants -----

const WATER_DENSITY = 1.0; // g/cm³ equivalent units

// Boat properties - wide ferry for river crossing
const BOAT = {
  hullWidth: 270,      // wide ferry
  hullHeight: 120,     // TALL hull (doubled) - half above water, half below
  mass: 60,            // boat mass
  maxPayload: 55,      // max cargo mass before capsize (100kg total cargo needs 2 trips)
  deckY: -50,          // Y offset from boat center where objects sit (higher deck)
  baseHeight: 30,      // how high boat center sits above waterline when empty
};

// Object type definitions for Level 1
// Total: 4 kids (100kg) + 2 ducks (6kg) + 2 balloons (-6kg) = 100kg
// Boat maxPayload = 55kg, so MUST take 2 trips
const OBJECT_TYPES = {
  duck: { mass: 3, volume: 100, size: 32, shape: 'circle', color: '#FFD700', emoji: '🦆', label: 'Duck' },
  kid: { mass: 25, volume: 120, size: 44, shape: 'circle', color: '#FFAB91', emoji: '🧒', label: 'Kid' },
  balloon: { mass: -3, volume: 250, size: 48, shape: 'circle', color: '#E1BEE7', emoji: '🎈', label: 'Helium Balloon' },
};

// Level configurations
// Level 1 math: 4 kids (100kg) + 2 ducks (6kg) + 2 balloons (-6kg) = 100kg total
// Boat can hold 55kg, so loading all = CAPSIZE
// Solution: 2 trips of ~50kg each
const LEVELS = {
  1: {
    id: 'river_ferry',
    name: '🚢 River Ferry',
    description: 'Get everyone across! (Hint: 2 trips needed)',
    objects: [
      // 4 kids on the shore - positioned on grass just above waterline (y ~280-295)
      { type: 'kid', x: 40, y: 280 },
      { type: 'kid', x: 90, y: 285 },
      { type: 'kid', x: 60, y: 270 },
      { type: 'kid', x: 110, y: 275 },
      // 2 ducks
      { type: 'duck', x: 130, y: 290 },
      { type: 'duck', x: 30, y: 285 },
      // 2 balloons (float a bit higher)
      { type: 'balloon', x: 75, y: 250 },
      { type: 'balloon', x: 120, y: 245 },
    ],
  },
  2: {
    id: 'heavy_load',
    name: '⚖️ Heavy Load',
    description: '6 kids to transport! Use balloons wisely.',
    objects: [
      { type: 'kid', x: 40, y: 280 },
      { type: 'kid', x: 85, y: 285 },
      { type: 'kid', x: 55, y: 270 },
      { type: 'kid', x: 100, y: 275 },
      { type: 'kid', x: 70, y: 290 },
      { type: 'kid', x: 115, y: 280 },
      { type: 'balloon', x: 50, y: 245 },
      { type: 'balloon', x: 90, y: 250 },
      { type: 'balloon', x: 130, y: 248 },
    ],
  },
  3: {
    id: 'balloon_lift',
    name: '🎈 Balloon Lift',
    description: 'Can you fit 3 kids in one trip with enough balloons?',
    objects: [
      { type: 'kid', x: 55, y: 280 },
      { type: 'kid', x: 90, y: 285 },
      { type: 'kid', x: 70, y: 275 },
      { type: 'balloon', x: 40, y: 250 },
      { type: 'balloon', x: 65, y: 245 },
      { type: 'balloon', x: 95, y: 248 },
      { type: 'balloon', x: 120, y: 252 },
    ],
  },
};

// ----- Helper Functions -----

function generateObjectId() {
  return Math.random().toString(36).substring(2, 10);
}

function createObject(type, x, y, shore = 'left') {
  const def = OBJECT_TYPES[type];
  if (!def) return null;
  return {
    id: generateObjectId(),
    type,
    x,
    y,
    mass: def.mass,
    volume: def.volume,
    size: def.size,
    shape: def.shape,
    color: def.color,
    emoji: def.emoji,
    label: def.label,
    onBoat: false,
    onShore: shore,  // 'left', 'right', or null (on boat)
    delivered: false, // true when successfully transported to right shore
    claimedBy: null,
    claimTime: null,
  };
}

function makePlayerState(id) {
  return {
    id,
    connected: false,
    paused: true,
    color: ['#2ecc71', '#3498db', '#e67e22', '#9b59b6'][id - 1] || '#888888',
    cursorX: 0,
    cursorY: 0,
    heldObjectId: null,
  };
}

// ----- State Management -----

export function newGameState() {
  const state = {
    tick: 0,
    paused: true,
    gamePaused: false,  // separate flag for P key pause
    reasonPaused: 'start',
    level: 1,
    maxLevelUnlocked: 3, // Allow 3 levels for debugging
    levelId: 'river_ferry',
    levelName: '🚢 River Ferry',

    // Scene dimensions
    sceneWidth: 800,
    sceneHeight: 600,

    // River layout - side view: water at middle, grass below on sides
    waterY: 300,           // Water surface at middle of screen
    waterBottom: 600,      // Bottom of scene
    leftShoreX: 180,       // Right edge of left shore (where water starts)
    rightShoreX: 620,      // Left edge of right shore (where water ends)
    
    // Shore areas - grass is BELOW waterline on sides (side view perspective)
    // Objects sit on the grass, visually just above the waterline
    leftShoreArea: { x: 0, y: 240, width: 180, height: 80 },   // Near waterline
    rightShoreArea: { x: 620, y: 240, width: 180, height: 80 },

    // Boat state
    boat: {
      x: 240,              // Start near left shore
      sinkOffset: 0,       // How much boat sinks due to cargo
      targetX: 220,
      sailing: false,
      sailSpeed: 4.0,      // Fast crossing
      tilt: 0,
      capsized: false,
      capsizeTimer: 0,
      capsizeRotation: 0,  // For capsize animation
      capsizeSplash: 0,    // Splash effect intensity
      atDock: 'left',
      criticalTilt: 25,    // Max safe tilt angle (degrees) - decreases with load
    },

    // Objects in the world
    objects: [],
    
    // Level progress tracking
    totalToDeliver: 8,
    deliveredCount: 0,
    tripsCompleted: 0,

    // Players
    players: {
      1: makePlayerState(1),
      2: makePlayerState(2),
      3: makePlayerState(3),
      4: makePlayerState(4),
    },

    // Door state
    doorOpen: false,

    // Computed physics values (for display)
    comX: 0,
    comY: 0,
    cobX: 0,
    cobY: 0,
    totalMass: BOAT.mass,
    cargoMass: 0,

    // UI state
    message: '',
    showHints: true,
    showLevelSelect: false, // Level select UI visibility
  };

  // Initialize level
  initLevel(state, 1);

  return state;
}

function initLevel(state, level) {
  const lvl = clamp(level, 1, Object.keys(LEVELS).length);
  const levelConfig = LEVELS[lvl];
  
  if (!levelConfig) {
    state.message = 'Level not found!';
    return;
  }

  state.level = lvl;
  state.levelId = levelConfig.id;
  state.levelName = levelConfig.name;
  state.objects = [];
  state.deliveredCount = 0;
  state.tripsCompleted = 0;
  state.doorOpen = false;
  state.showLevelSelect = false;
  
  // Reset boat
  state.boat.x = 220;
  state.boat.targetX = 220;
  state.boat.sailing = false;
  state.boat.capsized = false;
  state.boat.capsizeRotation = 0;
  state.boat.capsizeSplash = 0;
  state.boat.atDock = 'left';
  state.boat.tilt = 0;
  state.boat.sinkOffset = 0;
  state.boat.criticalTilt = 25;

  // Create all objects on left shore
  state.totalToDeliver = levelConfig.objects.length;
  for (const objDef of levelConfig.objects) {
    const obj = createObject(objDef.type, objDef.x, objDef.y, 'left');
    if (obj) {
      state.objects.push(obj);
    }
  }
  
  state.message = `${levelConfig.name}: ${levelConfig.description}`;
}

export function setLevel(state, level) {
  const lvl = clamp(Number(level) || 1, 1, Object.keys(LEVELS).length);
  initLevel(state, lvl);
}

// ----- Physics Calculations -----

function getObjectsOnBoat(state) {
  return state.objects.filter(obj => obj.onBoat);
}

function computeBoatPhysics(state) {
  const onBoat = getObjectsOnBoat(state);
  
  // Total mass = boat + cargo (balloon has negative mass = lift)
  let cargoMass = 0;
  let massWeightedX = 0;
  let massWeightedY = 0;

  for (const obj of onBoat) {
    cargoMass += obj.mass;
    const relX = obj.x - state.boat.x;
    const relY = obj.y - state.boat.y;
    massWeightedX += obj.mass * relX;
    massWeightedY += obj.mass * relY;
  }

  const totalMass = BOAT.mass + Math.max(0, cargoMass); // Balloon lift can't make boat fly

  // Center of Mass relative to boat center
  const comX = totalMass > 0 ? massWeightedX / totalMass : 0;
  const comY = totalMass > 0 ? massWeightedY / totalMass : 0;

  // Waterline offset based on total mass
  const effectiveMass = BOAT.mass + cargoMass; // Include balloon lift
  const waterlineOffset = Math.max(0, Math.min(
    BOAT.hullHeight * 0.95,
    (effectiveMass / WATER_DENSITY) / (BOAT.hullWidth * 0.6)
  ));

  // Center of Buoyancy
  const cobX = 0;
  const cobY = waterlineOffset / 2;

  // Tilt angle based on COM-COB horizontal offset
  const maxTilt = 35;
  const tiltFactor = 0.4; // Less sensitive for larger boat
  let tilt = clamp(comX * tiltFactor, -maxTilt, maxTilt);

  // Capsize conditions
  const capsizeThreshold = 28;
  const overloaded = cargoMass > BOAT.maxPayload;
  const tooTilted = Math.abs(tilt) >= capsizeThreshold;

  state.totalMass = totalMass;
  state.cargoMass = cargoMass;
  state.comX = comX;
  state.comY = comY;
  state.cobX = cobX;
  state.cobY = cobY;
  state.boat.tilt = tilt;
  
  // Sink effect - boat descends as cargo increases
  // At 55kg (max safe), sinks about 55 pixels
  const sinkFactor = 1.0;
  state.boat.sinkOffset = Math.min(70, Math.max(0, cargoMass * sinkFactor));
  
  // Calculate critical tilt angle based on load
  // More cargo = boat sits lower = less tilt before deck hits water
  // Formula: criticalTilt decreases as sinkOffset increases
  // Empty boat (sink=0): ~25° safe tilt
  // Full boat (sink=55): ~8° safe tilt  
  // Overloaded (sink=70+): ~3° safe tilt (very unstable)
  const hw = BOAT.hullWidth / 2; // 135
  const deckHeight = BOAT.hullHeight * 0.4; // deck is 40% up from center = 48
  const baseHeight = BOAT.baseHeight; // 30
  // criticalTilt = arcsin((baseHeight + deckHeight - sinkOffset) / hw)
  const margin = baseHeight + deckHeight - state.boat.sinkOffset; // safe margin
  const criticalSin = Math.max(0.05, Math.min(0.5, margin / hw));
  state.boat.criticalTilt = Math.asin(criticalSin) * (180 / Math.PI);
  
  // Capsize conditions:
  // 1. Overloaded (cargo > maxPayload)
  // 2. Tilted past critical angle (deck would go underwater)
  const tiltCapsize = Math.abs(tilt) >= state.boat.criticalTilt;

  return {
    shouldCapsize: tiltCapsize || overloaded,
    tiltedButStable: Math.abs(tilt) >= 3 && Math.abs(tilt) < state.boat.criticalTilt,
    overloaded,
  };
}

// ----- Game Actions -----

function unloadBoatToShore(state, shore) {
  const onBoat = getObjectsOnBoat(state);
  const shoreArea = shore === 'left' ? state.leftShoreArea : state.rightShoreArea;
  
  let unloadedCount = 0;
  for (const obj of onBoat) {
    obj.onBoat = false;
    obj.onShore = shore;
    
    // Position on shore
    const margin = obj.size / 2 + 10;
    obj.x = shoreArea.x + margin + Math.random() * (shoreArea.width - margin * 2);
    obj.y = shoreArea.y + 50 + Math.random() * (shoreArea.height - 100);
    
    if (shore === 'right' && !obj.delivered) {
      obj.delivered = true;
      state.deliveredCount++;
      unloadedCount++;
    }
  }
  
  return unloadedCount;
}

function resetBoatTrip(state) {
  // Reset boat to left dock
  state.boat.x = 220;
  state.boat.targetX = 220;
  state.boat.sailing = false;
  state.boat.capsized = false;
  state.boat.capsizeTimer = 0;
  state.boat.capsizeRotation = 0;
  state.boat.capsizeSplash = 0;
  state.boat.atDock = 'left';
  state.boat.tilt = 0;
  state.boat.sinkOffset = 0;
  state.boat.criticalTilt = 25;

  // Return all objects on boat back to left shore
  for (const obj of state.objects) {
    if (obj.onBoat) {
      obj.onBoat = false;
      obj.onShore = 'left';
      // Reposition on left shore
      obj.x = state.leftShoreArea.x + 20 + Math.random() * (state.leftShoreArea.width - 40);
      obj.y = state.leftShoreArea.y + 50 + Math.random() * (state.leftShoreArea.height - 100);
    }
    obj.claimedBy = null;
    obj.claimTime = null;
  }

  state.message = '';
}

function startSailing(state) {
  if (state.boat.sailing || state.boat.capsized) return;
  
  const onBoat = getObjectsOnBoat(state);
  if (onBoat.length === 0) {
    state.message = '⚠️ Load something onto the boat first!';
    return;
  }
  
  const physics = computeBoatPhysics(state);
  if (physics.overloaded) {
    state.message = '⚠️ Too heavy! Remove some items.';
    return;
  }

  // Set destination
  if (state.boat.atDock === 'left') {
    state.boat.targetX = state.rightShoreX - 60;
  } else {
    state.boat.targetX = state.leftShoreX + 40;
  }
  
  state.boat.sailing = true;
  state.boat.atDock = null;
  state.message = '⛵ Sailing...';
}

function fullReset(state) {
  initLevel(state, state.level);
}

function checkWinCondition(state) {
  if (state.deliveredCount >= state.totalToDeliver && !state.doorOpen) {
    state.doorOpen = true;
    state.message = `🎉 All ${state.totalToDeliver} items delivered! Door opened!`;
    // Unlock next level
    if (state.level >= state.maxLevelUnlocked && state.level < Object.keys(LEVELS).length) {
      state.maxLevelUnlocked = state.level + 1;
    }
  }
}

// ----- Input Handling -----

export function applyInput(state, playerId, input, now) {
  const player = state.players[playerId];
  if (!player || !player.connected) return;

  switch (input.action) {
    case 'cursor_move': {
      player.cursorX = clamp(input.x || 0, 0, state.sceneWidth);
      player.cursorY = clamp(input.y || 0, 0, state.sceneHeight);
      
      // If holding an object, move it
      if (player.heldObjectId) {
        const obj = state.objects.find(o => o.id === player.heldObjectId);
        if (obj) {
          obj.x = player.cursorX;
          obj.y = player.cursorY;
        }
      }
      break;
    }

    case 'grab': {
      const targetId = input.objectId;
      const obj = state.objects.find(o => o.id === targetId);
      
      // Can only grab objects on the current dock's shore or on boat at dock
      if (obj && !obj.claimedBy && !state.boat.sailing) {
        const canGrab = obj.onBoat || 
          (obj.onShore === 'left' && state.boat.atDock === 'left') ||
          (obj.onShore === 'right' && state.boat.atDock === 'right');
        
        if (canGrab) {
          obj.claimedBy = playerId;
          obj.claimTime = now;
          player.heldObjectId = obj.id;
          obj.onShore = null;
          obj.onBoat = false;
        }
      }
      break;
    }

    case 'release': {
      if (player.heldObjectId) {
        const obj = state.objects.find(o => o.id === player.heldObjectId);
        if (obj) {
          obj.claimedBy = null;
          obj.claimTime = null;
          
          // Calculate effective boat Y position (baseY + sink)
          const boatY = state.boat.baseY + (state.boat.sinkOffset || 0);
          
          // Check if dropped on boat (wider hit area for easier dropping)
          const boatLeft = state.boat.x - BOAT.hullWidth / 2 - 30;
          const boatRight = state.boat.x + BOAT.hullWidth / 2 + 30;
          const boatTop = boatY - BOAT.hullHeight - 50;
          const boatBottom = boatY + 50;
          
          if (obj.x >= boatLeft && obj.x <= boatRight &&
              obj.y >= boatTop && obj.y <= boatBottom &&
              state.boat.atDock && !state.boat.sailing) {
            obj.onBoat = true;
            obj.onShore = null;
            // Snap to deck
            obj.y = boatY + BOAT.deckY;
          } else {
            // Drop on current shore
            obj.onBoat = false;
            if (state.boat.atDock === 'left' || obj.x < state.sceneWidth / 2) {
              obj.onShore = 'left';
              obj.x = clamp(obj.x, 20, state.leftShoreX - 20);
            } else {
              obj.onShore = 'right';
              obj.x = clamp(obj.x, state.rightShoreX + 20, state.sceneWidth - 20);
            }
            obj.y = clamp(obj.y, state.leftShoreArea.y + 20, state.leftShoreArea.y + state.leftShoreArea.height - 20);
          }
        }
        player.heldObjectId = null;
      }
      break;
    }

    case 'go': {
      if (!state.boat.sailing && !state.boat.capsized && !state.gamePaused) {
        startSailing(state);
      }
      break;
    }

    case 'reset': {
      resetBoatTrip(state);
      break;
    }

    case 'full_reset': {
      fullReset(state);
      break;
    }

    case 'set_level': {
      const lvl = clamp(Number(input.level) || 1, 1, Object.keys(LEVELS).length);
      setLevel(state, lvl);
      break;
    }

    case 'toggle_level_select': {
      state.showLevelSelect = !state.showLevelSelect;
      break;
    }

    case 'toggle_pause': {
      state.gamePaused = !state.gamePaused;
      if (state.gamePaused) {
        state.message = '⏸️ PAUSED - Press P to resume';
      } else {
        state.message = '';
      }
      break;
    }

    case 'door_click': {
      if (state.doorOpen) {
        // Advance to next level
        const nextLevel = state.level + 1;
        if (nextLevel <= Object.keys(LEVELS).length) {
          setLevel(state, nextLevel);
        } else {
          state.message = '🎉 You completed all levels!';
        }
      }
      break;
    }

    case 'toggle_hints': {
      state.showHints = !state.showHints;
      break;
    }
  }
}

// ----- Simulation Step -----

export function step(state, now) {
  state.tick++;

  // If game is paused (P key), skip physics but still process input
  if (state.gamePaused) {
    return true;
  }

  // Release stale claims (3 second timeout)
  const CLAIM_TIMEOUT = 3000;
  for (const obj of state.objects) {
    if (obj.claimedBy && obj.claimTime && (now - obj.claimTime > CLAIM_TIMEOUT)) {
      const player = state.players[obj.claimedBy];
      if (player) player.heldObjectId = null;
      obj.claimedBy = null;
      obj.claimTime = null;
    }
  }

  // Update boat physics
  const physics = computeBoatPhysics(state);

  // Handle capsize - only when sailing (after GO is pressed) and overloaded
  if (physics.shouldCapsize && !state.boat.capsized && state.boat.sailing) {
    state.boat.capsized = true;
    state.boat.capsizeTimer = now;
    state.boat.capsizeRotation = 0;
    state.boat.capsizeSplash = 1;
    state.message = '💦 SPLASH! Capsized!';
  }

  // Animate capsize - flip the boat 180 degrees!
  if (state.boat.capsized) {
    const elapsed = now - state.boat.capsizeTimer;
    // Flip 180 degrees over 1 second, then sink
    if (elapsed < 1000) {
      state.boat.capsizeRotation = (elapsed / 1000) * 180;
      state.boat.capsizeSplash = Math.max(0, 1 - elapsed / 600);
    } else {
      state.boat.capsizeRotation = 180;
      // Sink effect - boat goes under water
      state.boat.sinkOffset = Math.min(120, 60 + (elapsed - 1000) / 15);
    }
  }

  // Auto-reset after capsize animation (3 seconds for full show)
  if (state.boat.capsized && now - state.boat.capsizeTimer > 3000) {
    resetBoatTrip(state);
  }

  // Sailing movement
  if (state.boat.sailing && !state.boat.capsized) {
    const dx = state.boat.targetX - state.boat.x;
    const moveAmount = Math.min(Math.abs(dx), state.boat.sailSpeed);
    
    if (Math.abs(dx) < 2) {
      // Arrived at destination
      state.boat.x = state.boat.targetX;
      state.boat.sailing = false;
      
      const arrivedAt = state.boat.x > state.sceneWidth / 2 ? 'right' : 'left';
      state.boat.atDock = arrivedAt;
      state.tripsCompleted++;
      
      // Auto-unload
      const unloaded = unloadBoatToShore(state, arrivedAt);
      
      if (arrivedAt === 'right' && unloaded > 0) {
        state.message = `🎉 Delivered ${unloaded} item${unloaded > 1 ? 's' : ''}! (${state.deliveredCount}/${state.totalToDeliver})`;
      } else {
        state.message = `⛵ Arrived at ${arrivedAt} shore.`;
      }
      
      // Check win
      checkWinCondition(state);
    } else {
      state.boat.x += Math.sign(dx) * moveAmount;

      // Move objects with boat
      for (const obj of getObjectsOnBoat(state)) {
        if (!obj.claimedBy) {
          obj.x += Math.sign(dx) * moveAmount;
        }
      }
    }
  }

  return true;
}

// ----- Player Management -----

export function setPlayerConnected(state, playerId, connected) {
  const player = state.players[playerId];
  if (!player) return;

  player.connected = connected;

  if (!connected) {
    if (player.heldObjectId) {
      const obj = state.objects.find(o => o.id === player.heldObjectId);
      if (obj) {
        obj.claimedBy = null;
        obj.claimTime = null;
      }
      player.heldObjectId = null;
    }
  }
}

export function togglePause(state, playerId) {
  const player = state.players[playerId];
  if (!player) return;
  player.paused = !player.paused;

  if (!player.paused && state.reasonPaused === 'start') {
    state.reasonPaused = null;
    state.paused = false;
  }
}

export function resume(state, playerId) {
  const player = state.players[playerId];
  if (!player) return;
  player.paused = false;

  if (state.reasonPaused === 'start') {
    state.reasonPaused = null;
    state.paused = false;
  }
}

// Export LEVELS for client reference if needed
export const LEVEL_LIST = Object.entries(LEVELS).map(([num, cfg]) => ({
  number: Number(num),
  id: cfg.id,
  name: cfg.name,
}));
