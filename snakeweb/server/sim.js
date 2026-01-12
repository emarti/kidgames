import { randInt } from "./utils.js";

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
    speed: null,          // "slow"|"medium"|"fast"
    speedLocked: false,
    apple: null,
    players: {
      1: newPlayerState(1, w, h),
      2: newPlayerState(2, w, h)
    }
  };
  spawnApple(state);
  return state;
}

function newPlayerState(id, w, h) {
  if (id === 1) {
    return basePlayer(id, "RIGHT");
  } else {
    return basePlayer(id, "LEFT");
  }
}

function basePlayer(id, dir) {
  return {
    id,
    connected: false,
    name: "",
    skin: null,
    lives: 3,
    state: "WAITING", // "ALIVE", "DEAD", "COUNTDOWN", "WAITING"
    countdown: 0,
    dir,
    pendingDir: dir,
    grow: 0,
    body: [],
    lengthAtLastDeath: 3
  };
}

export function setPlayerConnected(state, playerId, connected) {
  const p = state.players[playerId];
  p.connected = connected;
  if (connected) {
    if (p.state === "WAITING") {
      respawnPlayer(state, playerId);
    }
  } else {
    p.state = "WAITING";
    p.body = [];
  }
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

  // Recreate at spawn, same direction
  if (pid === 1) {
    p.dir = "RIGHT";
    p.pendingDir = "RIGHT";
    p.body = [];
    for (let i = 0; i < len; i++) p.body.push({ x: 2 - i, y: 2 });
  } else {
    p.dir = "LEFT";
    p.pendingDir = "LEFT";
    p.body = [];
    for (let i = 0; i < len; i++) p.body.push({ x: state.w - 3 + i, y: state.h - 3 });
  }
  p.grow = 0;
  p.state = "ALIVE";
  delete p.deathReason;
}



export function setPlayerMeta(state, playerId, { name }) {
  if (name != null) state.players[playerId].name = String(name).slice(0, 20);
}

export function tryLockSpeed(state, speed) {
  if (state.speedLocked) return false;
  if (!["slow", "medium", "fast"].includes(speed)) return false;
  state.speed = speed;
  state.speedLocked = true;
  return true;
}

export function trySelectSkin(state, playerId, skin) {
  const skins = ["coral", "viper", "corn", "brillan", "usa"];
  if (!skins.includes(skin)) return { ok: false, reason: "bad_skin" };

  // no duplicates
  for (const pid of [1, 2]) {
    if (pid !== playerId && state.players[pid].skin === skin) {
      return { ok: false, reason: "taken" };
    }
  }
  state.players[playerId].skin = skin;
  return { ok: true };
}

export function togglePause(state, reason = "toggle") {
  state.paused = !state.paused;
  state.reasonPaused = state.paused ? reason : null;
}

export function forcePause(state, reason) {
  state.paused = true;
  state.reasonPaused = reason;
}

export function resumeGame(state) {
  // Only resume if both connected? For now: allow if at least one.
  state.paused = false;
  state.reasonPaused = null;
}

export function newGame(state) {
  const w = state.w, h = state.h;
  const keep = {
    w, h,
    // Keep chosen speed/lock and skins? Spec implies “new game reset room”.
    // We'll reset everything except connections+names for now.
  };

  const fresh = newGameState({ w, h });
  // preserve connections + names so rejoin feels smooth
  for (const pid of [1, 2]) {
    fresh.players[pid].connected = state.players[pid].connected;
    fresh.players[pid].name = state.players[pid].name;
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
  if (state.paused) return;

  state.tick++;

  // Handle Countdowns
  for (const pid of [1, 2]) {
    const p = state.players[pid];
    if (p.state === "COUNTDOWN") {
      if (state.tick % 6 === 0) { // Approx 1 sec if tick rate is 150ms? No, 150ms * 6 = 900ms ~ 1s
        p.countdown--;
        if (p.countdown <= 0) {
          respawnPlayer(state, pid);
        }
      }
    }
  }

  // Apply inputs, then move both snakes simultaneously
  const moves = {};
  for (const pid of [1, 2]) {
    const p = state.players[pid];
    if (p.state !== "ALIVE") continue;

    p.dir = p.pendingDir;
    const d = DIRS[p.dir];
    const head = p.body[0];
    moves[pid] = { x: head.x + d.x, y: head.y + d.y };
  }

  // Head-to-head: both ALIVE heads same cell
  if (moves[1] && moves[2] && moves[1].x === moves[2].x && moves[1].y === moves[2].y) {
    killPlayer(state, 1, "head_to_head");
    killPlayer(state, 2, "head_to_head");
    return;
  }

  // Build occupancy maps (for collision checks)
  const occ = new Map(); // key -> pid owning that cell
  for (const pid of [1, 2]) {
    const p = state.players[pid];
    if (p.state !== "ALIVE") continue;
    for (let i = 0; i < p.body.length; i++) {
      const c = p.body[i];
      occ.set(key(c.x, c.y), pid);
    }
  }

  // Determine deaths and apple eats before mutating bodies
  const eatsApple = { 1: false, 2: false };
  const dies = { 1: false, 2: false };

  for (const pid of [1, 2]) {
    const p = state.players[pid];
    if (p.state !== "ALIVE") continue;
    const nh = moves[pid];

    // wall
    if (nh.x < 0 || nh.y < 0 || nh.x >= state.w || nh.y >= state.h) {
      dies[pid] = true;
      continue;
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
  for (const pid of [1, 2]) {
    const p = state.players[pid];
    if (p.state !== "ALIVE") continue;
    if (dies[pid]) continue;

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
  if (eatsApple[1] || eatsApple[2]) {
    spawnApple(state);
  }

  // Resolve deaths
  for (const pid of [1, 2]) {
    if (dies[pid]) {
      killPlayer(state, pid, "collision");
    }
  }
}



function spawnApple(state) {
  // Place apple in a free cell
  const forbidden = new Set();
  for (const pid of [1, 2]) {
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
  // fallback: no apple if grid is full
  state.apple = null;
}

function key(x, y) {
  return `${x},${y}`;
}
