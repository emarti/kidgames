import { randInt } from "./utils.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, 'game_config.json');
let config = { TICKS_PER_MOVE: { fast: 1, medium: 2, slow: 4 } };
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.error("Failed to load game_config.json, using defaults", e);
}

export const DIRS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 }
};

export function isOpposite(a, b) {
  return (a === "UP" && b === "DOWN") ||
    (a === "DOWN" && b === "UP") ||
    (a === "LEFT" && b === "RIGHT") ||
    (a === "RIGHT" && b === "LEFT");
}

export function newGameState({ w = 30, h = 22 } = {}) {
  // Slightly bigger than classic; tweak later
  const state = {
    w, h,
    tick: 0,
    paused: true,
    reasonPaused: "start",
    speed: "slow",            // "slow"|"medium"|"fast"
    speedLocked: false,
    wallsMode: "walls",       // "walls" | "no_walls"
    apple: null,
    players: {
      1: newPlayerState(1, w, h),
      2: newPlayerState(2, w, h),
      3: newPlayerState(3, w, h),
      4: newPlayerState(4, w, h)
    }
  };
  spawnApple(state);
  return state;
}

function newPlayerState(id, w, h) {
  const dirs = { 1: "RIGHT", 2: "LEFT", 3: "RIGHT", 4: "LEFT" };
  return basePlayer(id, dirs[id]);
}

export function basePlayer(id, dir) {
  return {
    id,
    connected: false,
    name: "",
    skin: "coral",
    lives: 3,
    state: "WAITING", // "ALIVE", "DEAD", "COUNTDOWN", "WAITING"
    paused: true, // Start paused (waiting for ready)
    countdown: 0,
    dir,
    pendingDir: dir,
    grow: 0,
    body: [],
    lengthAtLastDeath: 3
  };
}

function killPlayer(state, pid, why) {
  const p = state.players[pid];
  p.lives--;
  p.state = "DEAD";
  p.deathReason = why;
  p.lengthAtLastDeath = p.body.length;
  // Clear body so they don't block others
  p.body = [];
  // No immediate respawn; waiting for user request
}

export function requestRespawn(state, pid) {
  const p = state.players[pid];
  if (p.state === "DEAD") {
    p.state = "COUNTDOWN";
    p.countdown = 3;
  }
}

function respawnPlayer(state, pid) {
  const p = state.players[pid];
  const len = Math.max(3, p.lengthAtLastDeath);

  p.body = [];
  if (pid === 1) {
    p.dir = "RIGHT"; p.pendingDir = "RIGHT";
    for (let i = 0; i < len; i++) p.body.push({ x: 2 - i, y: 2 });
  } else if (pid === 2) {
    p.dir = "LEFT"; p.pendingDir = "LEFT";
    for (let i = 0; i < len; i++) p.body.push({ x: state.w - 3 + i, y: state.h - 3 });
  } else if (pid === 3) {
    p.dir = "RIGHT"; p.pendingDir = "RIGHT";
    for (let i = 0; i < len; i++) p.body.push({ x: 2 - i, y: state.h - 3 });
  } else if (pid === 4) {
    p.dir = "LEFT"; p.pendingDir = "LEFT";
    for (let i = 0; i < len; i++) p.body.push({ x: state.w - 3 + i, y: 2 });
  }

  p.grow = 0;
  p.state = "ALIVE";
  delete p.deathReason;
}

export function setPlayerMeta(state, playerId, { name }) {
  if (name != null) state.players[playerId].name = String(name).slice(0, 20);
}

export function tryLockSpeed(state, speed) {
  if (!["slow", "medium", "fast"].includes(speed)) return false;
  state.speed = speed;
  // Speed is intentionally changeable from the pause/setup UI.
  state.speedLocked = false;
  return true;
}

export function setWallsMode(state, mode) {
  if (!["walls", "no_walls", "klein"].includes(mode)) return false;
  state.wallsMode = mode;
  return true;
}

export function trySelectSkin(state, playerId, skin) {
  // Always allow skin selection (duplicates permitted)
  state.players[playerId].skin = skin;
  return { ok: true };
}

export function setPlayerConnected(state, playerId, connected) {
  const p = state.players[playerId];
  p.connected = connected;
  if (connected) {
    p.paused = true; // Start paused when joining/rejoining room
    if (p.state === "WAITING") {
      respawnPlayer(state, playerId);
    }
  } else {
    p.state = "WAITING";
    p.body = [];
    p.paused = true;
  }
}

export function togglePause(state, playerId) {
  if (!playerId) return;
  const p = state.players[playerId];
  p.paused = !p.paused;

  // Any interaction clears the system-level pause (Lobby)
  if (state.paused && state.reasonPaused === 'start') {
    state.paused = false;
    state.reasonPaused = null;
  }
}

export function forcePause(state, reason) {
  // Force pause everyone (e.g. system event)? 
  // For now, set everyone to paused.
  state.players[1].paused = true;
  state.players[2].paused = true;
  state.paused = true; // System pause
  state.reasonPaused = reason;
}

export function resumeGame(state, playerId) {
  if (!playerId) return;
  const p = state.players[playerId];
  p.paused = false;

  if (state.paused) {
    state.paused = false;
    state.reasonPaused = null;
  }
}

function updateGlobalPause(state) {
  // Deprecated for "Individual Pause" mode.
  // logic moved to toggle/resume.
}

// ...

export function newGame(state) {
  const w = state.w, h = state.h;
  const fresh = newGameState({ w, h });
  // preserve connections + names so rejoin feels smooth
  for (const pid of [1, 2]) {
    fresh.players[pid].connected = state.players[pid].connected;
    fresh.players[pid].name = state.players[pid].name;
    fresh.players[pid].skin = state.players[pid].skin;
  }
  return fresh;
}

export function queueInput(state, playerId, dir) {
  if (!DIRS[dir]) return;
  const p = state.players[playerId];
  // disallow 180 turns (compare against current dir, not pending)
  if (isOpposite(p.dir, dir)) return;
  p.pendingDir = dir;
}

export function step(state) {
  if (state.paused) return; // System pause (Lobby) blocks everything

  state.tick++;

  // Handle Countdowns
  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    if (p.state === "COUNTDOWN") {
      if (state.tick % 6 === 0) {
        p.countdown--;
        if (p.countdown <= 0) {
          respawnPlayer(state, pid);
        }
      }
    }
  }

  // Speed Control: Only move snakes on certain ticks
  const ticksPerMove = config.TICKS_PER_MOVE[state.speed || "medium"] || 2;
  const isMoveTick = (state.tick % ticksPerMove === 0);

  if (!isMoveTick) return;

  const mode = state.wallsMode || 'walls';
  const wrap = (mode === 'no_walls' || mode === 'klein');

  // Apply inputs, then move snakes simultaneously
  const moves = {};
  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    if (p.state !== "ALIVE") continue;
    if (p.paused) continue;

    p.dir = p.pendingDir;
    const d = DIRS[p.dir];
    const head = p.body[0];

    let nx = head.x + d.x;
    let ny = head.y + d.y;

    if (wrap) {
      if (mode === 'klein') {
        // Klein bottle: left/right wrap normally; top/bottom wrap with a twist.
        // When crossing the top/bottom edge, mirror the x coordinate.
        if (ny < 0) {
          ny = state.h - 1;
          nx = (state.w - 1) - nx;
        } else if (ny >= state.h) {
          ny = 0;
          nx = (state.w - 1) - nx;
        }
      }

      nx = (nx + state.w) % state.w;
      ny = (ny + state.h) % state.h;
    }

    moves[pid] = { x: nx, y: ny };
  }

  // Build occupancy maps (for collision checks)
  const occ = new Map();
  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    if (p.state !== "ALIVE") continue;
    for (let c of p.body) {
      occ.set(key(c.x, c.y), pid);
    }
  }

  const eatsApple = { 1: false, 2: false, 3: false, 4: false };
  const dies = { 1: false, 2: false, 3: false, 4: false };

  // Head-to-head collisions (mutual destruction if moving to same cell)
  const moveTargets = new Map(); // key -> list of pids
  for (const pid of [1, 2, 3, 4]) {
    if (!moves[pid]) continue;
    const k = key(moves[pid].x, moves[pid].y);
    if (!moveTargets.has(k)) moveTargets.set(k, []);
    moveTargets.get(k).push(pid);
  }

  for (const [k, pids] of moveTargets) {
    if (pids.length > 1) {
      for (const pid of pids) dies[pid] = true;
    }
  }

  // Individual collision / wall / apple checks
  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    if (p.state !== "ALIVE" || dies[pid]) continue;

    const nh = moves[pid];
    if (!nh) continue;

    // wall
    if (!wrap) {
      if (nh.x < 0 || nh.y < 0 || nh.x >= state.w || nh.y >= state.h) {
        dies[pid] = true;
        continue;
      }
    }

    // collision: self or other
    if (occ.has(key(nh.x, nh.y))) {
      dies[pid] = true;
      continue;
    }

    // apple
    if (state.apple && nh.x === state.apple.x && nh.y === state.apple.y) {
      eatsApple[pid] = true;
    }
  }

  // Apply moves
  for (const pid of [1, 2, 3, 4]) {
    if (!moves[pid] || dies[pid]) continue;
    const p = state.players[pid];
    const nh = moves[pid];
    p.body.unshift({ x: nh.x, y: nh.y });

    if (eatsApple[pid]) {
      p.grow += 2;
    }

    if (p.grow > 0) {
      p.grow--;
    } else {
      p.body.pop();
    }
  }

  // Resolve apple
  let anyEat = false;
  for (const pid of [1, 2, 3, 4]) if (eatsApple[pid]) anyEat = true;
  if (anyEat) spawnApple(state);

  // Resolve deaths
  for (const pid of [1, 2, 3, 4]) {
    if (dies[pid]) {
      killPlayer(state, pid, "collision");
    }
  }
}

function spawnApple(state) {
  const forbidden = new Set();
  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    for (const c of p.body) forbidden.add(key(c.x, c.y));
  }
  for (let tries = 0; tries < 500; tries++) {
    const x = randInt(state.w);
    const y = randInt(state.h);
    if (!forbidden.has(key(x, y))) {
      state.apple = { x, y };
      return;
    }
  }
  state.apple = null;
}

function key(x, y) {
  return `${x},${y}`;
}
