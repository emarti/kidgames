import { LEVELS, T, GRID_W, GRID_H, countDots, generateLevel } from './pacfriends_levels.js';

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

export const TILE_PX = 16; // pixels per tile (server-side virtual units)

// Ghost names map to index
export const GHOST_NAMES = ['blinky', 'pinky', 'inky', 'clyde'];
const GHOST_COLORS = ['#FF0000', '#FFB8FF', '#00FFFF', '#FFB852'];

// Ghost scatter corner targets (col, row) — sized for 22×26 grid
const SCATTER_TARGETS = [
  { x: 20, y: 0  },   // Blinky: top-right
  { x: 1,  y: 0  },   // Pinky: top-left
  { x: 21, y: 25 },   // Inky: bottom-right
  { x: 0,  y: 25 },   // Clyde: bottom-left
];

// Scatter/Chase cycle durations (seconds): scatter7, chase20, scatter7, chase20, scatter5, chase20, scatter5, ∞chase
const SCATTER_CHASE_CYCLE = [7, 20, 7, 20, 5, 20, 5, Infinity];

const FRIGHTENED_DURATION_MS = { easy: 8000, medium: 6000, hard: 4000 };
const GHOST_SPEED_PX      = { easy: 1.5, medium: 2.0, hard: 2.6 };   // px/tick (at medium speed)
const PLAYER_SPEED_PX     = 2.5;   // px/tick (at medium speed)
const SPEED_MULT          = { slow: 0.65, medium: 1.0, fast: 1.55 };
const FRIGHTENED_SPEED_MULT = 0.5;
const EATEN_SPEED_MULT      = 2.5;

const TICK_MS = 50;   // host tick interval

const FRUIT_TYPES = ['cherry', 'strawberry', 'orange'];
const FRUIT_SCORES = { cherry: 100, strawberry: 300, orange: 500 };
const FRUIT_THRESHOLD = [70, 170]; // collective dots eaten to spawn fruit
const FRUIT_LIFETIME_MS = 10000;

const DOT_SCORE = 10;
const POWER_SCORE = 50;
const GHOST_EAT_SCORES = [200, 400, 800, 1600];

const RESPAWN_DELAY_MS = 2000;

const PLAYER_COLORS = ['#FFFF00', '#FFB8FF', '#00BFFF', '#00FF00', '#FF8C00', '#FF4444'];
const DEFAULT_COLORS = ['#FFFF00', '#FFB8FF', '#00BFFF', '#00FF00'];

// ------------------------------------------------------------------
// Utility
// ------------------------------------------------------------------

function tileAt(tiles, x, y) {
  if (y < 0 || y >= GRID_H || x < 0 || x >= GRID_W) return T.WALL;
  return tiles[y][x];
}

function isWalkable(tiles, x, y, isGhost) {
  const t = tileAt(tiles, x, y);
  if (t === T.WALL) return false;
  if (t === T.HOUSE && !isGhost) return false;
  if (t === T.DOOR && !isGhost) return false;
  // T.PORTAL and T.TUNNEL are always walkable
  return true;
}

/** Tile column/row from pixel position (center of character) */
function tileOf(px) {
  return Math.floor(px / TILE_PX);
}

/** Pixel center of a tile */
function tileCenterPx(t) {
  return t * TILE_PX + TILE_PX / 2;
}

function dist(ax, ay, bx, by) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function dist2(ax, ay, bx, by) {
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

const DIR_VECS = {
  UP:    { dx: 0,  dy: -1 },
  DOWN:  { dx: 0,  dy:  1 },
  LEFT:  { dx: -1, dy:  0 },
  RIGHT: { dx: 1,  dy:  0 },
};
const ALL_DIRS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };

// ------------------------------------------------------------------
// State construction
// ------------------------------------------------------------------

export function newGameState({ level = 1, difficulty = 'medium', speed = 'medium' } = {}) {
  const levelData = level <= LEVELS.length ? LEVELS[level - 1] : generateLevel(level);
  const tiles = levelData.tiles.map(row => [...row]);
  const totalDots = countDots(levelData);

  return {
    tick: 0,
    paused: true,
    reasonPaused: 'start',
    level,
    difficulty,
    speed,
    score: 0,
    totalDots,
    dotsRemaining: totalDots,
    // Mutable tile state
    tiles,
    // BFS distance map from ghost door — used for eaten-ghost gradient descent
    toHomeMap:      levelData.toHomeMap,
    // Config extracted from levelData — stored as small individual fields so
    // the large tile array isn't serialized on every broadcast tick.
    playerSpawns:   levelData.playerSpawns,
    ghostDoor:      levelData.ghostDoor,
    ghostHouse:     levelData.ghostHouse,
    tunnelRows:     levelData.tunnelRows,
    fruitSpawnTile: levelData.fruitSpawn,
    portalPairs:    levelData.portalPairs ?? [],
    topology:       levelData.topology ?? 'none',

    // Ghost global mode
    ghostMode: 'scatter',  // 'scatter' | 'chase' | 'frightened'
    ghostModeTimer: SCATTER_CHASE_CYCLE[0] * 1000,
    scatterChaseIndex: 0,

    fruit: null,  // { x, y, type, timer }
    fruitThresholdIdx: 0,  // which FRUIT_THRESHOLD we're at
    fruitEaten: [],        // types collected this level

    // Collective dots eaten this level (for fruit trigger)
    dotsEatenTotal: 0,

    // Ghost eat combo (resets when ghosts stop being frightened)
    ghostEatCombo: 0,
    teamPowerTimer: 0,

    ghosts: GHOST_NAMES.map((name, i) => newGhost(i, name, levelData)),

    players: {
      1: newPlayerState(1, DEFAULT_COLORS[0], levelData.playerSpawns),
      2: newPlayerState(2, DEFAULT_COLORS[1], levelData.playerSpawns),
      3: newPlayerState(3, DEFAULT_COLORS[2], levelData.playerSpawns),
      4: newPlayerState(4, DEFAULT_COLORS[3], levelData.playerSpawns),
    },

    // Popup messages for client FX (e.g. ghost eat score)
    popups: [],  // { x, y, text, ttl }
  };
}

function newGhost(idx, name, levelData) {
  // Blinky starts just outside, others start inside ghost house
  const spawnInside = idx !== 0;
  const spawn = levelData.ghostSpawns[idx] ?? { x: 11, y: 10 };
  return {
    id: idx,
    name,
    color: GHOST_COLORS[idx],
    // Pixel position
    x: tileCenterPx(spawn.x),
    y: tileCenterPx(spawn.y),
    dir: 'LEFT',
    pendingDir: 'LEFT',
    mode: spawnInside ? 'house' : 'scatter',   // 'scatter'|'chase'|'frightened'|'eaten'|'house'
    frightenedBy: null,  // playerId
    frightenedTimer: 0,
    // Dot threshold to leave house (Pinky=0, Inky=30, Clyde=60)
    houseExitDots: [0, 0, 30, 60][idx],
    houseTimer: 0,
    // Score multiplier for sequential eats during one power pellet
    eatComboIndex: 0,
    // Track previous tile to avoid back-and-forth oscillation in frightened mode
    prevTileKey: -1,
  };
}

function newPlayerState(id, color, playerSpawns) {
  const spawn = playerSpawns[id - 1] ?? { x: 9, y: 19 };
  return {
    id,
    connected: false,
    color,
    decoration: 'plain',   // 'plain'|'bow'|'beanie'|'bowtie'
    // Pixel position
    x: tileCenterPx(spawn.x),
    y: tileCenterPx(spawn.y),
    dir: 'LEFT',
    pendingDir: 'LEFT',
    moving: false,
    lives: 3,
    alive: true,
    respawnTimer: 0,
    // Shared power pellet timer mirrored onto each player for client FX.
    powerTimer: 0,
    paused: true,
    dotsEaten: 0,
  };
}

// ------------------------------------------------------------------
// Player connection
// ------------------------------------------------------------------

export function setPlayerConnected(state, playerId, connected) {
  const p = state.players[playerId];
  p.connected = connected;
  if (connected) {
    p.paused = true;
  } else {
    p.alive = true;
    p.respawnTimer = 0;
  }
}

// ------------------------------------------------------------------
// Settings (lobby)
// ------------------------------------------------------------------

export function setDifficulty(state, difficulty) {
  if (!['easy', 'medium', 'hard'].includes(difficulty)) return false;
  state.difficulty = difficulty;
  return true;
}

export function setSpeed(state, speed) {
  if (!['slow', 'medium', 'fast'].includes(speed)) return false;
  state.speed = speed;
  return true;
}

export function setPlayerColor(state, playerId, color) {
  if (!PLAYER_COLORS.includes(color)) return false;
  state.players[playerId].color = color;
  return true;
}

export function setPlayerDecoration(state, playerId, decoration) {
  if (!['plain', 'bow', 'beanie', 'bowtie'].includes(decoration)) return false;
  state.players[playerId].decoration = decoration;
  return true;
}

export function resumeGame(state, playerId) {
  const p = state.players[playerId];
  if (p) p.paused = false;
  if (state.paused) {
    state.paused = false;
    state.reasonPaused = null;
  }
}

export function pauseGame(state, playerId) {
  const p = state.players[playerId];
  if (p) p.paused = !p.paused;
}

export function setLevel(state, level) {
  if (!Number.isInteger(level) || level < 1 || level > 99) return false;
  state.level = level;
  return true;
}

export function queueInput(state, playerId, dir) {
  if (!ALL_DIRS.includes(dir)) return;
  const p = state.players[playerId];
  if (p && p.connected) {
    p.pendingDir = dir;
    // Any input clears lobby pause
    if (state.paused && state.reasonPaused === 'start') {
      state.paused = false;
      state.reasonPaused = null;
      p.paused = false;
    }
  }
}

export function requestRespawn(state, playerId) {
  const p = state.players[playerId];
  if (p && !p.alive) {
    // respawn immediately (respawnTimer already counted down)
    respawnPlayer(state, playerId);
  }
}

/** Reset game to initial state preserving connections + settings */
export function newGame(state) {
  const next = newGameState({ level: state.level, difficulty: state.difficulty, speed: state.speed });
  // Preserve player settings
  for (const pid of [1, 2, 3, 4]) {
    next.players[pid].connected = state.players[pid].connected;
    next.players[pid].color = state.players[pid].color;
    next.players[pid].decoration = state.players[pid].decoration;
  }
  return next;
}

// ------------------------------------------------------------------
// Respawn
// ------------------------------------------------------------------

function respawnPlayer(state, playerId) {
  const p = state.players[playerId];
  const spawn = state.playerSpawns[playerId - 1] ?? { x: 9, y: 19 };
  p.x = tileCenterPx(spawn.x);
  p.y = tileCenterPx(spawn.y);
  p.dir = 'LEFT';
  p.pendingDir = 'LEFT';
  p.alive = true;
  p.respawnTimer = 0;
  p.powerTimer = state.teamPowerTimer ?? 0;
  p.moving = false;
}

// ------------------------------------------------------------------
// Ghost house exit logic
// ------------------------------------------------------------------

// Ghost house time-based release schedule (ms after game start).
// Used as a fallback when dot thresholds aren't being met.
const GHOST_RELEASE_MS = [0, 4000, 9000, 15000];

function maybeExitGhostHouse(state, ghost) {
  // Exit if dot threshold met OR time-based fallback elapsed
  const timeElapsed = state.tick * TICK_MS;
  if (state.dotsEatenTotal >= ghost.houseExitDots ||
      timeElapsed >= GHOST_RELEASE_MS[ghost.id]) {
    if ((state.teamPowerTimer ?? 0) > 0) {
      ghost.mode = 'frightened';
      ghost.frightenedTimer = state.teamPowerTimer;
      ghost.frightenedBy = null;
    } else {
      ghost.mode = state.ghostMode;
    }
    const door = state.ghostDoor;
    ghost.x = tileCenterPx(door.x);
    ghost.y = tileCenterPx(door.y);
    ghost.dir = 'UP';
    ghost.pendingDir = 'UP';
  }
}

// ------------------------------------------------------------------
// Ghost AI targeting
// ------------------------------------------------------------------

function getGhostTarget(state, ghost) {
  const tiles = state.tiles;

  if (ghost.mode === 'scatter') {
    return SCATTER_TARGETS[ghost.id];
  }

  if (ghost.mode === 'frightened') {
    return null; // random movement
  }

  // Chase targets
  // Find nearest connected alive player
  const alivePlayers = [1, 2, 3, 4]
    .map(id => state.players[id])
    .filter(p => p.connected && p.alive);
  if (alivePlayers.length === 0) return SCATTER_TARGETS[ghost.id];

  const nearest = alivePlayers.reduce((a, b) =>
    dist2(ghost.x, ghost.y, a.x, a.y) <= dist2(ghost.x, ghost.y, b.x, b.y) ? a : b
  );

  const ptx = tileOf(nearest.x);
  const pty = tileOf(nearest.y);
  const pdir = nearest.dir;

  if (ghost.name === 'blinky') {
    return { x: ptx, y: pty };
  }

  if (ghost.name === 'pinky') {
    const v = DIR_VECS[pdir] ?? DIR_VECS.UP;
    return { x: ptx + v.dx * 4, y: pty + v.dy * 4 };
  }

  if (ghost.name === 'inky') {
    // 2 tiles ahead of player, doubled from Blinky's position
    const v = DIR_VECS[pdir] ?? DIR_VECS.UP;
    const px2 = ptx + v.dx * 2;
    const py2 = pty + v.dy * 2;
    const blinky = state.ghosts[0];
    const btx = tileOf(blinky.x);
    const bty = tileOf(blinky.y);
    return { x: 2 * px2 - btx, y: 2 * py2 - bty };
  }

  if (ghost.name === 'clyde') {
    // Chase if > 8 tiles away, else scatter
    if (dist(tileOf(ghost.x), tileOf(ghost.y), ptx, pty) > 8) {
      return { x: ptx, y: pty };
    }
    return SCATTER_TARGETS[ghost.id];
  }

  return { x: ptx, y: pty };
}

// ------------------------------------------------------------------
// Ghost movement
// ------------------------------------------------------------------

function moveGhost(state, ghost) {
  const tiles = state.tiles;
  const baseSpeed = (GHOST_SPEED_PX[state.difficulty] ?? 2.0) * (SPEED_MULT[state.speed] ?? 1.0);
  const speed = ghost.mode === 'eaten'
    ? baseSpeed * EATEN_SPEED_MULT
    : ghost.mode === 'frightened'
      ? baseSpeed * FRIGHTENED_SPEED_MULT
      : baseSpeed;

  const gtx = tileOf(ghost.x);
  const gty = tileOf(ghost.y);
  const centerX = tileCenterPx(gtx);
  const centerY = tileCenterPx(gty);

  const atCenterX = Math.abs(ghost.x - centerX) < speed + 0.5;
  const atCenterY = Math.abs(ghost.y - centerY) < speed + 0.5;

  // At tile center (only when approaching, to prevent snap-back oscillation): pick direction
  const gdv = DIR_VECS[ghost.dir] ?? { dx: 0, dy: 0 };
  const gApprX = gdv.dx === 0 || (gdv.dx > 0 ? ghost.x <= centerX : ghost.x >= centerX);
  const gApprY = gdv.dy === 0 || (gdv.dy > 0 ? ghost.y <= centerY : ghost.y >= centerY);
  if (atCenterX && atCenterY && gApprX && gApprY) {
    // Snap to center
    ghost.x = centerX;
    ghost.y = centerY;

    // Handle tunnel (horizontal wrap)
    if (tileAt(tiles, gtx, gty) === T.TUNNEL) {
      if (gtx === 0 && ghost.dir === 'LEFT') { ghost.x = tileCenterPx(GRID_W - 1); ghost.prevTileKey = -1; return; }
      if (gtx === GRID_W - 1 && ghost.dir === 'RIGHT') { ghost.x = tileCenterPx(0); ghost.prevTileKey = -1; return; }
    }
    // Handle portal (top/bottom or left/right) — only fire when moving INTO the border
    if (tileAt(tiles, gtx, gty) === T.PORTAL) {
      if ((gty === 0 && ghost.dir === 'UP') || (gty === GRID_H - 1 && ghost.dir === 'DOWN')) {
        const portal = findPortal(state, gtx, gty);
        if (portal) { ghost.x = tileCenterPx(portal.toX); ghost.y = tileCenterPx(portal.toY); return; }
      }
      if ((gtx === 0 && ghost.dir === 'LEFT') || (gtx === GRID_W - 1 && ghost.dir === 'RIGHT')) {
        const portal = findPortal(state, gtx, gty);
        if (portal) { ghost.x = tileCenterPx(portal.toX); ghost.y = tileCenterPx(portal.toY); ghost.prevTileKey = -1; return; }
      }
    }

    // Record previous tile for wander anti-oscillation
    ghost.prevTileKey = gty * GRID_W + gtx;

    // Eaten ghosts navigate home via BFS gradient descent
    if (ghost.mode === 'eaten') {
      const door = state.ghostDoor;
      if (gtx === door.x && gty === door.y) {
        ghost.mode = 'house';
        ghost.houseTimer = 2000;
        return;
      }
      // Gradient descent on precomputed BFS distance map — no loops
      const toHomeMap = state.toHomeMap;
      let bestDir = null;
      let bestDist = Infinity;
      for (const d of ALL_DIRS) {
        const v = DIR_VECS[d];
        const nx = gtx + v.dx, ny = gty + v.dy;
        if (!isWalkable(tiles, nx, ny, true)) continue;
        const dd = toHomeMap?.[ny]?.[nx] ?? Infinity;
        if (dd < bestDist) { bestDist = dd; bestDir = d; }
      }
      // Fallback: allow reverse if all forward directions are blocked
      if (!bestDir) {
        const rev = OPPOSITE[ghost.dir];
        const rv = DIR_VECS[rev];
        if (rv && isWalkable(tiles, gtx + rv.dx, gty + rv.dy, true)) bestDir = rev;
      }
      if (bestDir) { ghost.dir = bestDir; ghost.pendingDir = bestDir; }
    } else if (ghost.mode === 'frightened') {
      // Random walk — but avoid reversing OR returning to the previous tile
      // to prevent back-and-forth oscillation
      const prevKey = ghost.prevTileKey;
      let validDirs = ALL_DIRS.filter(d => {
        if (d === OPPOSITE[ghost.dir]) return false;
        const v = DIR_VECS[d];
        const nx = gtx + v.dx, ny = gty + v.dy;
        if (!isWalkable(tiles, nx, ny, true)) return false;
        if (ny * GRID_W + nx === prevKey) return false;  // avoid going back
        return true;
      });
      // If all non-reversing non-backtracking dirs are blocked, allow backtrack
      if (!validDirs.length) {
        validDirs = ALL_DIRS.filter(d => {
          const v = DIR_VECS[d];
          return isWalkable(tiles, gtx + v.dx, gty + v.dy, true);
        });
      }
      if (validDirs.length > 0) {
        ghost.dir = validDirs[Math.floor(Math.random() * validDirs.length)];
      }
    } else {
      // Normal: choose dir toward target
      const target = getGhostTarget(state, ghost);
      if (target) {
        ghost.dir = chooseDirToward(tiles, gtx, gty, target.x, target.y, ghost.dir, true);
      }
    }
  }

  // Move in current direction
  const v = DIR_VECS[ghost.dir];
  if (!v) return;
  const nx = ghost.x + v.dx * speed;
  const ny = ghost.y + v.dy * speed;
  const chkTX = v.dx > 0 ? tileOf(nx + speed) : (v.dx < 0 ? tileOf(nx - speed) : gtx);
  const chkTY = v.dy > 0 ? tileOf(ny + speed) : (v.dy < 0 ? tileOf(ny - speed) : gty);
  if (isWalkable(tiles, chkTX, chkTY, true)) {
    ghost.x = nx;
    ghost.y = ny;
  }
}

function findPortal(state, tileX, tileY) {
  for (const p of (state.portalPairs ?? [])) {
    if (p.fromX === tileX && p.fromY === tileY) return p;
  }
  return null;
}

function chooseDirToward(tiles, fromX, fromY, toX, toY, currentDir, isGhost) {
  let best = null;
  let bestDist = Infinity;
  for (const d of ALL_DIRS) {
    if (d === OPPOSITE[currentDir]) continue;
    const v = DIR_VECS[d];
    const nx = fromX + v.dx;
    const ny = fromY + v.dy;
    if (!isWalkable(tiles, nx, ny, isGhost)) continue;
    const dd = dist2(nx, ny, toX, toY);
    if (dd < bestDist) { bestDist = dd; best = d; }
  }
  return best ?? currentDir;
}

// ------------------------------------------------------------------
// Player movement
// ------------------------------------------------------------------

function movePlayer(state, player) {
  if (!player.alive || player.paused) return;
  const tiles = state.tiles;
  const speed = PLAYER_SPEED_PX * (SPEED_MULT[state.speed] ?? 1.0);

  const ptx = tileOf(player.x);
  const pty = tileOf(player.y);
  const centerX = tileCenterPx(ptx);
  const centerY = tileCenterPx(pty);

  const atCenterX = Math.abs(player.x - centerX) < speed + 0.5;
  const atCenterY = Math.abs(player.y - centerY) < speed + 0.5;

  // At center (only when approaching, to prevent snap-back oscillation): try to turn
  const pdv = DIR_VECS[player.dir] ?? { dx: 0, dy: 0 };
  const pApprX = pdv.dx === 0 || (pdv.dx > 0 ? player.x <= centerX : player.x >= centerX);
  const pApprY = pdv.dy === 0 || (pdv.dy > 0 ? player.y <= centerY : player.y >= centerY);
  if (atCenterX && atCenterY && pApprX && pApprY) {
    player.x = centerX;
    player.y = centerY;

    // Tunnel wrap (horizontal)
    if (tileAt(tiles, ptx, pty) === T.TUNNEL) {
      if (ptx === 0 && player.dir === 'LEFT') { player.x = tileCenterPx(GRID_W - 1); return; }
      if (ptx === GRID_W - 1 && player.dir === 'RIGHT') { player.x = tileCenterPx(0); return; }
    }
    // Portal warp (top/bottom or left/right) — only fire when moving INTO the border
    if (tileAt(tiles, ptx, pty) === T.PORTAL) {
      if ((pty === 0 && player.dir === 'UP') || (pty === GRID_H - 1 && player.dir === 'DOWN')) {
        const portal = findPortal(state, ptx, pty);
        if (portal) { player.x = tileCenterPx(portal.toX); player.y = tileCenterPx(portal.toY); return; }
      }
      if ((ptx === 0 && player.dir === 'LEFT') || (ptx === GRID_W - 1 && player.dir === 'RIGHT')) {
        const portal = findPortal(state, ptx, pty);
        if (portal) { player.x = tileCenterPx(portal.toX); player.y = tileCenterPx(portal.toY); return; }
      }
    }

    // Try pending direction
    if (player.pendingDir !== player.dir) {
      const pv = DIR_VECS[player.pendingDir];
      if (pv && isWalkable(tiles, ptx + pv.dx, pty + pv.dy, false)) {
        player.dir = player.pendingDir;
      }
    }
  }

  // Move
  const v = DIR_VECS[player.dir];
  if (!v) return;
  const nx = player.x + v.dx * speed;
  const ny = player.y + v.dy * speed;
  // Check wall
  const checkTX = v.dx > 0 ? tileOf(nx + TILE_PX / 2 - 1) : tileOf(nx - TILE_PX / 2 + 1);
  const checkTY = v.dy > 0 ? tileOf(ny + TILE_PX / 2 - 1) : tileOf(ny - TILE_PX / 2 + 1);
  if (isWalkable(tiles, v.dx !== 0 ? checkTX : ptx, v.dy !== 0 ? checkTY : pty, false)) {
    player.x = nx;
    player.y = ny;
    player.moving = true;
  } else {
    player.moving = false;
  }

  // Dot / power pellet collection
  const ntx = tileOf(player.x);
  const nty = tileOf(player.y);
  const tile = tileAt(tiles, ntx, nty);
  if (tile === T.DOT) {
    state.tiles[nty][ntx] = T.EMPTY;
    state.score += DOT_SCORE;
    state.dotsRemaining--;
    state.dotsEatenTotal++;
    player.dotsEaten++;
    checkFruitSpawn(state);
  } else if (tile === T.POWER) {
    state.tiles[nty][ntx] = T.EMPTY;
    state.score += POWER_SCORE;
    state.dotsRemaining--;
    state.dotsEatenTotal++;
    player.dotsEaten++;
    activatePowerPellet(state, player.id);
    checkFruitSpawn(state);
  }
}

function activatePowerPellet(state, playerId) {
  const duration = FRIGHTENED_DURATION_MS[state.difficulty];
  state.teamPowerTimer = duration;
  for (const pid of [1, 2, 3, 4]) {
    state.players[pid].powerTimer = duration;
  }
  // Reset ghost eat combo
  state.ghostEatCombo = 0;
  for (const ghost of state.ghosts) {
    if (ghost.mode === 'scatter' || ghost.mode === 'chase' || ghost.mode === 'frightened') {
      ghost.mode = 'frightened';
      ghost.frightenedBy = playerId;
      ghost.frightenedTimer = duration;
      ghost.eatComboIndex = 0;
    }
  }
}

// ------------------------------------------------------------------
// Fruit
// ------------------------------------------------------------------

function checkFruitSpawn(state) {
  if (state.fruitThresholdIdx >= FRUIT_THRESHOLD.length) return;
  if (state.dotsEatenTotal >= FRUIT_THRESHOLD[state.fruitThresholdIdx]) {
    const levelFruitIdx = Math.min(state.level - 1, FRUIT_TYPES.length - 1);
    const spawn = state.fruitSpawnTile;
    state.fruit = {
      x: tileCenterPx(spawn.x),
      y: tileCenterPx(spawn.y),
      type: FRUIT_TYPES[levelFruitIdx],
      timer: FRUIT_LIFETIME_MS,
    };
    state.fruitThresholdIdx++;
  }
}

// ------------------------------------------------------------------
// Collision: player ↔ ghost
// ------------------------------------------------------------------

function checkPlayerGhostCollisions(state) {
  for (const pid of [1, 2, 3, 4]) {
    const player = state.players[pid];
    if (!player.connected || !player.alive) continue;

    for (const ghost of state.ghosts) {
      if (ghost.mode === 'eaten' || ghost.mode === 'house') continue;

      const dx = player.x - ghost.x;
      const dy = player.y - ghost.y;
      const overlap = TILE_PX * 0.75;
      if (dx * dx + dy * dy > overlap * overlap) continue;

      if (ghost.mode === 'frightened' && player.powerTimer > 0) {
        // Eat ghost
        ghost.mode = 'eaten';
        ghost.frightenedBy = null;
        const scoreIdx = Math.min(state.ghostEatCombo, GHOST_EAT_SCORES.length - 1);
        const pts = GHOST_EAT_SCORES[scoreIdx];
        state.score += pts;
        state.ghostEatCombo++;
        // Popup for client
        state.popups.push({ x: ghost.x, y: ghost.y, text: String(pts), ttl: 1200 });
      } else if (ghost.mode !== 'frightened' && state.difficulty !== 'easy') {
        // Kill player
        player.alive = false;
        player.respawnTimer = RESPAWN_DELAY_MS;
        player.powerTimer = state.teamPowerTimer ?? 0;
        player.lives = Math.max(0, player.lives - 1);
        // Reset ghost positions (classic Pac-Man doesn't reset ghosts on death)
      }
    }
  }
}

// ------------------------------------------------------------------
// Player ↔ fruit collision
// ------------------------------------------------------------------

function checkFruitCollision(state) {
  if (!state.fruit) return;
  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    if (!p.connected || !p.alive) continue;
    const dx = p.x - state.fruit.x;
    const dy = p.y - state.fruit.y;
    if (dx * dx + dy * dy < (TILE_PX * 0.9) ** 2) {
      const pts = FRUIT_SCORES[state.fruit.type] ?? 100;
      state.score += pts;
      state.fruitEaten.push(state.fruit.type);
      state.popups.push({ x: state.fruit.x, y: state.fruit.y, text: String(pts), ttl: 1200 });
      state.fruit = null;
      return;
    }
  }
}

// ------------------------------------------------------------------
// Main step
// ------------------------------------------------------------------

export function step(state, nowMs) {
  if (state.paused) return false;

  // Check if all players are paused
  const anyActive = [1,2,3,4].some(id => {
    const p = state.players[id];
    return p.connected && !p.paused;
  });
  if (!anyActive) return false;

  state.tick++;
  let changed = true;

  // Respawn timers
  if (state.teamPowerTimer > 0) {
    state.teamPowerTimer -= TICK_MS;
    if (state.teamPowerTimer <= 0) state.teamPowerTimer = 0;
  }

  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    p.powerTimer = state.teamPowerTimer;
    if (!p.connected) continue;
    if (!p.alive) {
      p.respawnTimer -= TICK_MS;
      if (p.respawnTimer <= 0) {
        respawnPlayer(state, pid);
      }
    }
  }

  // Ghost global mode timer
  if (state.ghostMode !== 'frightened') {
    state.ghostModeTimer -= TICK_MS;
    if (state.ghostModeTimer <= 0 && state.scatterChaseIndex < SCATTER_CHASE_CYCLE.length - 1) {
      state.scatterChaseIndex++;
      const duration = SCATTER_CHASE_CYCLE[state.scatterChaseIndex];
      state.ghostMode = state.scatterChaseIndex % 2 === 0 ? 'scatter' : 'chase';
      state.ghostModeTimer = duration === Infinity ? 999999999 : duration * 1000;
      // Update ghosts (not frightened/eaten/house)
      for (const g of state.ghosts) {
        if (g.mode === 'scatter' || g.mode === 'chase') {
          g.mode = state.ghostMode;
        }
      }
    }
  }

  // Move ghosts
  for (const ghost of state.ghosts) {
    if (ghost.mode === 'house') {
      ghost.houseTimer -= TICK_MS;
      if (ghost.houseTimer <= 0) maybeExitGhostHouse(state, ghost);
      continue;
    }
    // Update frightened timer
    if (ghost.mode === 'frightened') {
      ghost.frightenedTimer -= TICK_MS;
      if (ghost.frightenedTimer <= 0) {
        ghost.mode = state.ghostMode;
        ghost.frightenedBy = null;
      }
    }
    moveGhost(state, ghost);
  }

  // Move players
  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    if (p.connected) movePlayer(state, p);
  }

  // Collisions
  checkPlayerGhostCollisions(state);

  // Fruit
  if (state.fruit) {
    state.fruit.timer -= TICK_MS;
    if (state.fruit.timer <= 0) state.fruit = null;
    else checkFruitCollision(state);
  }

  // Decay popups
  state.popups = state.popups.filter(p => { p.ttl -= TICK_MS; return p.ttl > 0; });

  // Level complete?
  if (state.dotsRemaining <= 0) {
    state.paused = true;
    state.reasonPaused = state.level >= 99 ? 'victory' : 'levelcomplete';
  }

  return changed;
}
