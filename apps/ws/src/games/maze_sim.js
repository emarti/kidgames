import { randInt, clamp } from './maze_utils.js';

// Client constants (must match maze/client/src/game/scenes/PlayScene.js)
const WALL_N = 1;
const WALL_E = 2;
const WALL_S = 4;
const WALL_W = 8;

const DIRS = {
  UP: { dx: 0, dy: -1, bit: WALL_N, opp: WALL_S },
  RIGHT: { dx: 1, dy: 0, bit: WALL_E, opp: WALL_W },
  DOWN: { dx: 0, dy: 1, bit: WALL_S, opp: WALL_N },
  LEFT: { dx: -1, dy: 0, bit: WALL_W, opp: WALL_E },
};

const PLAYER_COLORS = {
  1: '#2ecc71',
  2: '#3498db',
  3: '#e67e22',
  4: '#9b59b6',
};

const ALLOWED_AVATARS = new Set(['knight', 'mage', 'kid', 'archer', 'octopus', 'snake', 'robot']);
const ALLOWED_COLORS = new Set([
  '#2ecc71',
  '#3498db',
  '#e67e22',
  '#9b59b6',
  '#e74c3c',
  '#111111',
]);

function levelSize(level) {
  const baseW = 10;
  const baseH = 10;
  // Option A: grow more slowly to keep prize density higher.
  const w = baseW + (level - 1) * 1;
  const h = baseH + (level - 1) * 1;
  return { w: Math.min(w, 30), h: Math.min(h, 30) };
}

function objectivesForLevel(level) {
  const L = clamp(Number(level || 1), 1, 999);

  // Levels requested:
  // 1: 1 apple
  // 2: 2 apples
  // 3: 3 apples
  // 4: 4 apples
  // 5: 4 apples, 1 chest
  // 6: 4 apples, 2 chests
  // 7: 4 apples, 3 chests
  // 8: 4 apples, 3 chests, 1 funny
  // 9: 4 apples, 3 chests, 2 funny
  // 10: 4 apples, 3 chests, 3 funny
  const apples = Math.min(4, L);
  const chests = L >= 5 ? Math.min(3, L - 4) : 0;
  const funny = L >= 8 ? Math.min(3, L - 7) : 0;
  return { apples, chests, funny };
}

function cellIndex(w, x, y) {
  return y * w + x;
}

function inBounds(w, h, x, y) {
  return x >= 0 && x < w && y >= 0 && y < h;
}

function startCell(w) {
  return { x: Math.floor(w / 2), y: 0 };
}

function makePlayerState(id, start) {
  return {
    id,
    connected: false,
    paused: true,
    color: PLAYER_COLORS[id] ?? '#000000',
    avatar: 'knight',
    x: start.x,
    y: start.y,
    trail: [],
  };
}

export function newGameState() {
  const level = 1;
  const { w, h } = levelSize(level);
  const start = startCell(w);

  const state = {
    tick: 0,
    paused: true,
    reasonPaused: 'start',
    visionMode: 'fog',
    level,
    w,
    h,
    walls: [],
    goal: { x: 0, y: h - 1 },
    apples: [],
    appleTarget: 0,
    applesCollected: 0,
    treasures: [],
    treasureTarget: 0,
    treasuresCollected: 0,
    funnies: [],
    funnyTarget: 0,
    funniesCollected: 0,
    revealed: [],
    // Claimed path segments; each segment has a fixed color from the first traversal.
    paths: [],
    _pathOwners: {},
    players: {
      1: makePlayerState(1, start),
      2: makePlayerState(2, start),
      3: makePlayerState(3, start),
      4: makePlayerState(4, start),
    },
    message: '',
    _advanceAt: null,
    _advanceToLevel: null,
  };

  buildLevel(state, level);
  return state;
}

function edgeKey(w, ax, ay, bx, by) {
  const a = cellIndex(w, ax, ay);
  const b = cellIndex(w, bx, by);
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function claimPathEdge(state, ax, ay, bx, by, color) {
  const key = edgeKey(state.w, ax, ay, bx, by);
  if (state._pathOwners[key]) return;
  state._pathOwners[key] = String(color || '#000000');
  state.paths.push({ a: { x: ax, y: ay }, b: { x: bx, y: by }, color: state._pathOwners[key] });
}

function generateMazePrim(w, h) {
  // Wall bitmask per cell. Start fully walled.
  const walls = Array.from({ length: h }, () => Array.from({ length: w }, () => (WALL_N | WALL_E | WALL_S | WALL_W)));
  const inMaze = Array.from({ length: h }, () => Array.from({ length: w }, () => false));
  const frontier = [];

  const dirs = [
    { dx: 0, dy: -1, bit: WALL_N, opp: WALL_S },
    { dx: 1, dy: 0, bit: WALL_E, opp: WALL_W },
    { dx: 0, dy: 1, bit: WALL_S, opp: WALL_N },
    { dx: -1, dy: 0, bit: WALL_W, opp: WALL_E },
  ];

  function addFrontierEdges(x, y) {
    for (const d of dirs) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (inBounds(w, h, nx, ny) && !inMaze[ny][nx]) {
        frontier.push({ x, y, d });
      }
    }
  }

  const sx = randInt(w);
  const sy = randInt(h);
  inMaze[sy][sx] = true;
  addFrontierEdges(sx, sy);

  while (frontier.length > 0) {
    const idx = randInt(frontier.length);
    const edge = frontier.splice(idx, 1)[0];

    const { x, y, d } = edge;
    const nx = x + d.dx;
    const ny = y + d.dy;
    if (!inBounds(w, h, nx, ny)) continue;
    if (inMaze[ny][nx]) continue;

    // Carve
    walls[y][x] &= ~d.bit;
    walls[ny][nx] &= ~d.opp;

    inMaze[ny][nx] = true;
    addFrontierEdges(nx, ny);
  }

  return walls;
}

function placeCollectibles(state) {
  const { apples, chests, funny } = objectivesForLevel(state.level);

  state.appleTarget = apples;
  state.applesCollected = 0;
  state.treasureTarget = chests;
  state.treasuresCollected = 0;
  state.funnyTarget = funny;
  state.funniesCollected = 0;

  const start = startCell(state.w);
  const forbidden = new Set([cellIndex(state.w, start.x, start.y), cellIndex(state.w, state.goal.x, state.goal.y)]);

  const placeN = (count) => {
    const chosen = new Set();
    let attempts = 0;

    while (chosen.size < count && attempts < 20000) {
      attempts++;
      const x = randInt(state.w);
      const y = randInt(state.h);
      const idx = cellIndex(state.w, x, y);
      if (forbidden.has(idx) || chosen.has(idx)) continue;
      if (Math.abs(x - start.x) + Math.abs(y - start.y) < 3) continue;
      chosen.add(idx);
    }

    while (chosen.size < count) {
      const x = randInt(state.w);
      const y = randInt(state.h);
      const idx = cellIndex(state.w, x, y);
      if (forbidden.has(idx) || chosen.has(idx)) continue;
      chosen.add(idx);
    }

    for (const idx of chosen) forbidden.add(idx);
    return [...chosen].map((idx) => ({ x: idx % state.w, y: Math.floor(idx / state.w) }));
  };

  state.apples = placeN(apples);
  state.treasures = placeN(chests);
  state.funnies = placeN(funny);
}

function computeVisibleCellsLos(state, x, y) {
  const visible = new Set([cellIndex(state.w, x, y)]);

  // Walk each direction until a wall blocks.
  const walks = [DIRS.UP, DIRS.RIGHT, DIRS.DOWN, DIRS.LEFT];
  for (const d of walks) {
    let cx = x;
    let cy = y;
    while (true) {
      const mask = state.walls[cy][cx];
      if ((mask & d.bit) !== 0) break;
      const nx = cx + d.dx;
      const ny = cy + d.dy;
      if (!inBounds(state.w, state.h, nx, ny)) break;
      visible.add(cellIndex(state.w, nx, ny));
      cx = nx;
      cy = ny;
    }
  }

  return visible;
}

function updateVisibility(state) {
  const revealed = new Set(state.revealed);

  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    if (!p?.connected) continue;
    for (const idx of computeVisibleCellsLos(state, p.x, p.y)) {
      revealed.add(idx);
    }
  }

  state.revealed = [...revealed];
}

function resetPlayerPositionsAndTrails(state) {
  const start = startCell(state.w);
  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    if (!p) continue;
    p.x = start.x;
    p.y = start.y;
    p.trail = [{ x: start.x, y: start.y }];
  }
}

function buildLevel(state, level) {
  state.level = level;
  const size = levelSize(level);
  state.w = size.w;
  state.h = size.h;

  state.walls = generateMazePrim(state.w, state.h);

  // Goal is one cell on bottom row
  state.goal = { x: randInt(state.w), y: state.h - 1 };

  // Reset players
  resetPlayerPositionsAndTrails(state);

  // Reset shared path claims
  state.paths = [];
  state._pathOwners = {};

  // Apples
  placeCollectibles(state);

  // Reveal reset + initial reveal
  state.revealed = [];
  updateVisibility(state);
}

function collectAppleIfPresent(state, x, y) {
  const idx = cellIndex(state.w, x, y);
  const found = state.apples.findIndex((a) => a.x === x && a.y === y);
  if (found >= 0) {
    state.apples.splice(found, 1);
    state.applesCollected = clamp((state.applesCollected ?? 0) + 1, 0, 999);
  }
}

function collectTreasureIfPresent(state, x, y) {
  const found = state.treasures?.findIndex((t) => t.x === x && t.y === y) ?? -1;
  if (found >= 0) {
    state.treasures.splice(found, 1);
    state.treasuresCollected = clamp((state.treasuresCollected ?? 0) + 1, 0, 999);
  }
}

function collectFunnyIfPresent(state, x, y) {
  const found = state.funnies?.findIndex((f) => f.x === x && f.y === y) ?? -1;
  if (found >= 0) {
    state.funnies.splice(found, 1);
    state.funniesCollected = clamp((state.funniesCollected ?? 0) + 1, 0, 999);
  }
}

function remainingObjectives(state) {
  const a = Math.max(0, (state.appleTarget ?? 0) - (state.applesCollected ?? 0));
  const t = Math.max(0, (state.treasureTarget ?? 0) - (state.treasuresCollected ?? 0));
  const f = Math.max(0, (state.funnyTarget ?? 0) - (state.funniesCollected ?? 0));
  return { apples: a, treasures: t, funnies: f };
}

function allObjectivesComplete(state) {
  const rem = remainingObjectives(state);
  return rem.apples <= 0 && rem.treasures <= 0 && rem.funnies <= 0;
}

function maybeScheduleNextLevel(state, now) {
  // Prevent multiple triggers if two players hit goal in the same frame.
  if (state._advanceAt != null) return;

  state.message = `You reached the end! Level up → ${state.level + 1}`;
  // Leave time for the client goal-fireworks celebration.
  state._advanceAt = now + 3000;
  state._advanceToLevel = state.level + 1;
}

export function step(state, now) {
  state.tick++;

  if (state._advanceAt != null && now >= state._advanceAt) {
    const next = state._advanceToLevel ?? (state.level + 1);
    state._advanceAt = null;
    state._advanceToLevel = null;
    state.message = '';
    buildLevel(state, next);
  }
}

export function setPlayerConnected(state, playerId, connected) {
  const p = state.players[playerId];
  if (!p) return;

  p.connected = !!connected;

  // Disconnect must not pause or stop the level.
  // On connect/reconnect, spawn at start (one browser == one player).
  if (p.connected) {
    const start = startCell(state.w);
    p.x = start.x;
    p.y = start.y;
    p.trail = [{ x: start.x, y: start.y }];
    if (!p.avatar) p.avatar = 'knight';
    if (!p.color) p.color = PLAYER_COLORS[playerId] ?? '#000000';
  }

  updateVisibility(state);
}

export function setVisionMode(state, mode) {
  if (mode !== 'fog' && mode !== 'glass') return false;
  state.visionMode = mode;
  return true;
}

export function togglePause(state, playerId) {
  if (!playerId) return;
  const p = state.players[playerId];
  if (!p) return;
  p.paused = !p.paused;

  // Any interaction clears the system-level lobby pause.
  if (state.paused && state.reasonPaused === 'start') {
    state.paused = false;
    state.reasonPaused = null;
  }
}

export function resumeGame(state, playerId) {
  if (!playerId) return;
  const p = state.players[playerId];
  if (!p) return;
  p.paused = false;

  if (state.paused && state.reasonPaused === 'start') {
    state.paused = false;
    state.reasonPaused = null;
  }
}

export function restart(state) {
  // Keep current level, connections, vision mode.
  state.message = '';
  state._advanceAt = null;
  state._advanceToLevel = null;

  buildLevel(state, state.level);

  // Back to lobby
  state.paused = true;
  state.reasonPaused = 'start';
  for (const pid of [1, 2, 3, 4]) {
    if (state.players[pid]) state.players[pid].paused = true;
  }
}

export function trySelectAvatar(state, playerId, avatar) {
  const p = state.players[playerId];
  if (!p) return false;
  const a = String(avatar || '').toLowerCase();
  if (!ALLOWED_AVATARS.has(a)) return false;
  p.avatar = a === 'archer' ? 'kid' : a;
  return true;
}

export function trySelectColor(state, playerId, color) {
  const p = state.players[playerId];
  if (!p) return false;
  const c = String(color || '').toLowerCase();
  if (!ALLOWED_COLORS.has(c)) return false;
  p.color = c;
  return true;
}

export function applyInput(state, playerId, dir, now) {
  if (!playerId) return;
  if (!DIRS[dir]) return;

  // Global pause blocks movement.
  if (state.paused) return;

  const p = state.players[playerId];
  if (!p || !p.connected) return;

  // Local pause blocks only this player.
  if (p.paused) return;

  // Clear transient messages on movement.
  if (state.message && state._advanceAt == null) state.message = '';

  const d = DIRS[dir];
  const mask = state.walls[p.y][p.x];
  if ((mask & d.bit) !== 0) return;

  const ox = p.x;
  const oy = p.y;

  const nx = ox + d.dx;
  const ny = oy + d.dy;
  if (!inBounds(state.w, state.h, nx, ny)) return;

  p.x = nx;
  p.y = ny;

  const last = p.trail[p.trail.length - 1];
  if (!last || last.x !== nx || last.y !== ny) {
    p.trail.push({ x: nx, y: ny });
  }

  // Shared path: first traversal claims the segment color.
  claimPathEdge(state, ox, oy, nx, ny, p.color);

  updateVisibility(state);
  collectAppleIfPresent(state, nx, ny);
  collectTreasureIfPresent(state, nx, ny);
  collectFunnyIfPresent(state, nx, ny);

  if (nx === state.goal.x && ny === state.goal.y) {
    // Objectives are optional; reaching the goal always finishes the level.
    maybeScheduleNextLevel(state, now);
  }
}

export function setLevel(state, level) {
  const next = clamp(Number(level || 1), 1, 999);
  state.message = '';
  state._advanceAt = null;
  state._advanceToLevel = null;
  buildLevel(state, next);
}
