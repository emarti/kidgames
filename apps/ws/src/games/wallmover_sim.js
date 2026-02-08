import { randInt, clamp } from './maze_utils.js';

// Reuse Maze's wall bit conventions for compatibility with existing client patterns.
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

const ORIENTS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];

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

const ALLOWED_VISION = new Set(['fog', 'glass']);

function levelSize(level) {
  const baseW = 10;
  const baseH = 10;
  const w = baseW + (level - 1) * 1;
  const h = baseH + (level - 1) * 1;
  return { w: Math.min(w, 30), h: Math.min(h, 30) };
}

function objectivesForLevel(level) {
  // Same as Maze; collectibles are cosmetic only in Wallmover.
  const L = clamp(Number(level || 1), 1, 999);
  const apples = L <= 3 ? L : (L === 4 ? 3 : 4);
  const chests = L >= 4 ? (L <= 10 ? Math.min(3, L - 3) : Math.min(4, L - 7)) : 0;
  const batteries = L >= 8 ? Math.min(3, L - 7) : 0;
  const fish = L >= 10 ? Math.min(3, L - 9) : 0;
  const ducks = L >= 13 ? Math.min(3, L - 12) : 0;
  return { apples, chests, batteries, fish, ducks };
}

function inBounds(w, h, x, y) {
  return x >= 0 && x < w && y >= 0 && y < h;
}

function cellIndex(w, x, y) {
  return y * w + x;
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

function computeVisibleCellsLos(state, x, y) {
  const visible = new Set([cellIndex(state.w, x, y)]);

  // Walk each direction until a wall blocks.
  const walks = [DIRS.UP, DIRS.RIGHT, DIRS.DOWN, DIRS.LEFT];
  for (const d of walks) {
    let cx = x;
    let cy = y;
    while (true) {
      const mask = wallMaskAt(state, cx, cy);
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

function wallMaskAt(state, x, y) {
  const heavy = state?.walls?.[y]?.[x] ?? 0;
  const editable = state?.softMask?.[y]?.[x] ?? 0;
  const soft = state?.softWalls?.[y]?.[x] ?? 0;
  // For editable edges, softWalls is authoritative (can carve heavy walls).
  // For non-editable edges, keep the heavy maze walls.
  return (heavy & ~editable) | (soft & editable);
}

function routeExists_(state) {
  if (!state?.start || !state?.goal) return false;
  const w = state.w;
  const h = state.h;
  const sx = state.start.x;
  const sy = state.start.y;
  const gx = state.goal.x;
  const gy = state.goal.y;
  if (!inBounds(w, h, sx, sy) || !inBounds(w, h, gx, gy)) return false;
  if (sx === gx && sy === gy) return true;

  const visited = new Uint8Array(w * h);
  const qx = [sx];
  const qy = [sy];
  visited[cellIndex(w, sx, sy)] = 1;

  let qi = 0;
  while (qi < qx.length) {
    const x = qx[qi];
    const y = qy[qi];
    qi++;

    const mask = wallMaskAt(state, x, y);
    for (const key of ORIENTS) {
      const d = DIRS[key];
      if ((mask & d.bit) !== 0) continue;
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (!inBounds(w, h, nx, ny)) continue;
      if (nx === gx && ny === gy) return true;
      const idx = cellIndex(w, nx, ny);
      if (visited[idx]) continue;
      visited[idx] = 1;
      qx.push(nx);
      qy.push(ny);
    }
  }

  return false;
}

function updateRouteStatus_(state) {
  state.routeComplete = routeExists_(state);
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

function generateBorderWalls(w, h) {
  // Border walls only: interior is open.
  const walls = Array.from({ length: h }, () => Array.from({ length: w }, () => 0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let mask = 0;
      if (y === 0) mask |= WALL_N;
      if (y === h - 1) mask |= WALL_S;
      if (x === 0) mask |= WALL_W;
      if (x === w - 1) mask |= WALL_E;
      walls[y][x] = mask;
    }
  }
  return walls;
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

function enforceBorderWalls(state) {
  const { w, h } = state;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let mask = state.walls[y][x] ?? 0;
      if (y === 0) mask |= WALL_N;
      if (y === h - 1) mask |= WALL_S;
      if (x === 0) mask |= WALL_W;
      if (x === w - 1) mask |= WALL_E;
      state.walls[y][x] = mask;
    }
  }
}

function clearAllCollectibles(state) {
  state.apples = [];
  state.treasures = [];
  state.batteries = [];
  state.fishes = [];
  state.ducks = [];
  state.applesCollected = 0;
  state.treasuresCollected = 0;
  state.batteriesCollected = 0;
  state.fishesCollected = 0;
  state.ducksCollected = 0;
}

function placeDefaultCollectibles(state) {
  const { apples, chests, batteries, fish, ducks } = objectivesForLevel(state.level);

  state.appleTarget = apples;
  state.treasureTarget = chests;
  state.batteryTarget = batteries;
  state.fishTarget = fish;
  state.duckTarget = ducks;

  state.applesCollected = 0;
  state.treasuresCollected = 0;
  state.batteriesCollected = 0;
  state.fishesCollected = 0;
  state.ducksCollected = 0;

  const start = state.start;
  const forbidden = new Set([
    cellIndex(state.w, start.x, start.y),
    cellIndex(state.w, state.goal.x, state.goal.y),
  ]);

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
  state.batteries = placeN(batteries);
  state.fishes = placeN(fish);
  state.ducks = placeN(ducks);
}

function resetPlayers(state) {
  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    if (!p) continue;
    p.x = state.start.x;
    p.y = state.start.y;
  }
}

function resetSolver(state) {
  state.solver = {
    x: state.start.x,
    y: state.start.y,
    dir: 'DOWN',
    running: false,
    steps: 0,
    lastTurnAt: 0,
  };
}

function isolateGoal(state) {
  // Make the goal unsolvable by surrounding it with walls that block any entry.
  const { x, y } = state.goal;

  // Block north edge (primary entry point from above).
  if (y > 0) {
    state.walls[y][x] |= WALL_N;
    state.walls[y - 1][x] |= WALL_S;
  }

  // Block west/east edges so the goal can't be reached from the sides.
  if (x > 0) {
    state.walls[y][x] |= WALL_W;
    state.walls[y][x - 1] |= WALL_E;
  }
  if (x < state.w - 1) {
    state.walls[y][x] |= WALL_E;
    state.walls[y][x + 1] |= WALL_W;
  }
}

function buildLevel(state, level) {
  state.level = clamp(Number(level || 1), 1, 999);
  const size = levelSize(state.level);
  state.w = size.w;
  state.h = size.h;

  state.start = startCell(state.w);
  // Goal matches Maze: bottom-left tile.
  state.goal = { x: 0, y: state.h - 1 };

  const mode = String(state.mode || 'freeform').toLowerCase();
  if (mode === 'freeform') {
    // Editor canvas: interior open, border walls fixed.
    state.walls = generateBorderWalls(state.w, state.h);
    state.softWalls = null;
    state.softMask = null;
  } else {
    // Puzzle: heavy (locked) maze walls + soft (editable) walls that can be
    // toggled (draw/erase) to restore solvability.
    state.walls = generateMazePrim(state.w, state.h);
    state.softWalls = Array.from({ length: state.h }, () => Array.from({ length: state.w }, () => 0));
    state.softMask = Array.from({ length: state.h }, () => Array.from({ length: state.w }, () => 0));
  }
  enforceBorderWalls(state);

  if (mode === 'puzzle') {
    seedPuzzleEditableEdges_(state);
    addPuzzleBlockers_(state);
    seedExtraPuzzleSoftWalls_(state);
  }

  // Reset players
  resetPlayerPositionsAndTrails(state);

  // Reset shared path claims
  state.paths = [];
  state._pathOwners = {};

  clearAllCollectibles(state);
  placeDefaultCollectibles(state);

  // Reveal reset + initial reveal
  state.revealed = [];
  updateVisibility(state);

  updateRouteStatus_(state);

  state.win = false;
  state.message = '';

  state._advanceAt = null;
  state._advanceToLevel = null;
  state._minoResetAt = null;
  state._minoHit = null;
}

function findUniquePathEdgesHeavy_(state) {
  const w = state.w;
  const h = state.h;
  const sx = state.start.x;
  const sy = state.start.y;
  const gx = state.goal.x;
  const gy = state.goal.y;

  const startIdx = cellIndex(w, sx, sy);
  const goalIdx = cellIndex(w, gx, gy);

  const prev = Array.from({ length: w * h }, () => null);
  const qx = [sx];
  const qy = [sy];
  prev[startIdx] = { px: sx, py: sy, dir: null };

  let qi = 0;
  while (qi < qx.length) {
    const x = qx[qi];
    const y = qy[qi];
    qi++;
    if (x === gx && y === gy) break;

    for (const key of ORIENTS) {
      const d = DIRS[key];
      const mask = state.walls[y][x] ?? 0;
      if ((mask & d.bit) !== 0) continue;
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (!inBounds(w, h, nx, ny)) continue;
      const nIdx = cellIndex(w, nx, ny);
      if (prev[nIdx] != null) continue;
      prev[nIdx] = { px: x, py: y, dir: key };
      qx.push(nx);
      qy.push(ny);
    }
  }

  if (prev[goalIdx] == null) return [];

  const edges = [];
  let cx = gx;
  let cy = gy;
  while (!(cx === sx && cy === sy)) {
    const curIdx = cellIndex(w, cx, cy);
    const step = prev[curIdx];
    if (!step || !step.dir) return [];
    edges.push({ x: step.px, y: step.py, dir: step.dir });
    cx = step.px;
    cy = step.py;
  }
  edges.reverse();
  return edges;
}

function addPuzzleBlockers_(state) {
  if (!state?.softWalls || !state?.softMask) return;

  const edges = findUniquePathEdgesHeavy_(state);
  if (!edges || edges.length === 0) return;

  const rawK = Math.min(12, Math.max(1, Math.floor(Number(state.level ?? 1))));
  const K = Math.max(1, Math.min(edges.length, rawK));

  const idxs = edges.map((_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const t = idxs[i];
    idxs[i] = idxs[j];
    idxs[j] = t;
  }

  for (let k = 0; k < K; k++) {
    const e = edges[idxs[k]];
    const dir = String(e?.dir || '').toUpperCase();
    const d = DIRS[dir];
    if (!d) continue;
    const x = e.x;
    const y = e.y;
    const nx = x + d.dx;
    const ny = y + d.dy;
    if (!inBounds(state.w, state.h, x, y)) continue;
    if (!inBounds(state.w, state.h, nx, ny)) continue;

    // Only block an open corridor in the heavy maze.
    const heavyA = state.walls[y][x] ?? 0;
    if ((heavyA & d.bit) !== 0) continue;

    // Ensure these edges are editable regardless of the sampling.
    state.softMask[y][x] |= d.bit;
    state.softMask[ny][nx] |= d.opp;
    state.softWalls[y][x] |= d.bit;
    state.softWalls[ny][nx] |= d.opp;
  }
}

function edgeKey2_(w, ax, ay, bx, by) {
  const a = cellIndex(w, ax, ay);
  const b = cellIndex(w, bx, by);
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function seedPuzzleEditableEdges_(state) {
  if (!state?.softMask || !state?.softWalls) return;

  // Target: make puzzle mode feel quite freeform while still having some
  // locked structure.
  const TARGET_EDITABLE_FRAC = 0.78;

  // Build a list of unique interior edges (RIGHT/DOWN only).
  const edges = [];
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) {
      const heavy = state.walls?.[y]?.[x] ?? 0;
      if (x < state.w - 1) {
        const open = (heavy & WALL_E) === 0;
        edges.push({ x, y, dir: 'RIGHT', open });
      }
      if (y < state.h - 1) {
        const open = (heavy & WALL_S) === 0;
        edges.push({ x, y, dir: 'DOWN', open });
      }
    }
  }
  if (edges.length === 0) return;

  const target = Math.max(1, Math.floor(edges.length * TARGET_EDITABLE_FRAC));

  // Start by always allowing edits on existing corridors.
  const editable = new Set();
  for (let i = 0; i < edges.length; i++) {
    if (edges[i].open) editable.add(i);
  }

  // Then add more edges (closed heavy walls) at random until we hit target.
  if (editable.size < target) {
    const closedIdxs = [];
    for (let i = 0; i < edges.length; i++) {
      if (!edges[i].open) closedIdxs.push(i);
    }
    for (let i = closedIdxs.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      const t = closedIdxs[i];
      closedIdxs[i] = closedIdxs[j];
      closedIdxs[j] = t;
    }
    for (let i = 0; i < closedIdxs.length && editable.size < target; i++) {
      editable.add(closedIdxs[i]);
    }
  }

  // Apply to softMask symmetrically and initialize softWalls to match heavy
  // state for those edges (so the puzzle starts consistent).
  for (const i of editable) {
    const e = edges[i];
    const d = DIRS[e.dir];
    if (!d) continue;
    const x = e.x;
    const y = e.y;
    const nx = x + d.dx;
    const ny = y + d.dy;
    if (!inBounds(state.w, state.h, nx, ny)) continue;

    state.softMask[y][x] |= d.bit;
    state.softMask[ny][nx] |= d.opp;

    const heavyA = state.walls?.[y]?.[x] ?? 0;
    const wallOn = (heavyA & d.bit) !== 0;
    if (wallOn) {
      state.softWalls[y][x] |= d.bit;
      state.softWalls[ny][nx] |= d.opp;
    } else {
      state.softWalls[y][x] &= ~d.bit;
      state.softWalls[ny][nx] &= ~d.opp;
    }
  }
}

function seedExtraPuzzleSoftWalls_(state) {
  if (!state?.softWalls || !state?.softMask) return;

  // Collect unique editable edges that are currently open (RIGHT and DOWN only).
  const corridors = [];
  const used = new Set();

  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) {
      const heavy = state.walls?.[y]?.[x] ?? 0;

      if (x < state.w - 1) {
        const key = edgeKey2_(state.w, x, y, x + 1, y);
        if (!used.has(key)) {
          used.add(key);
          const allowed = ((state.softMask?.[y]?.[x] ?? 0) & WALL_E) !== 0;
          const softA = state.softWalls?.[y]?.[x] ?? 0;
          const openNow = (softA & WALL_E) === 0;
          // Only consider edges that are editable and currently open.
          if (allowed && openNow) corridors.push({ x, y, dir: 'RIGHT' });
        }
      }
      if (y < state.h - 1) {
        const key = edgeKey2_(state.w, x, y, x, y + 1);
        if (!used.has(key)) {
          used.add(key);
          const allowed = ((state.softMask?.[y]?.[x] ?? 0) & WALL_S) !== 0;
          const softA = state.softWalls?.[y]?.[x] ?? 0;
          const openNow = (softA & WALL_S) === 0;
          if (allowed && openNow) corridors.push({ x, y, dir: 'DOWN' });
        }
      }
    }
  }

  if (corridors.length === 0) return;

  // Seed some extra soft walls so the board isn't just "erase K blockers".
  // Keep this smaller now that many edges are editable.
  const target = Math.max(10, Math.floor(corridors.length * 0.14));
  const count = Math.min(corridors.length, target);

  for (let i = corridors.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const t = corridors[i];
    corridors[i] = corridors[j];
    corridors[j] = t;
  }

  for (let i = 0; i < count; i++) {
    const e = corridors[i];
    const d = DIRS[e.dir];
    if (!d) continue;
    const x = e.x;
    const y = e.y;
    const nx = x + d.dx;
    const ny = y + d.dy;
    if (!inBounds(state.w, state.h, nx, ny)) continue;

    // Respect mask (corridor-edges only).
    const allowedA = ((state.softMask?.[y]?.[x] ?? 0) & d.bit) !== 0;
    const allowedB = ((state.softMask?.[ny]?.[nx] ?? 0) & d.opp) !== 0;
    if (!allowedA || !allowedB) continue;

    state.softWalls[y][x] |= d.bit;
    state.softWalls[ny][nx] |= d.opp;
  }
}

function remainingObjectives(state) {
  const a = Math.max(0, (state.appleTarget ?? 0) - (state.applesCollected ?? 0));
  const t = Math.max(0, (state.treasureTarget ?? 0) - (state.treasuresCollected ?? 0));
  const b = Math.max(0, (state.batteryTarget ?? 0) - (state.batteriesCollected ?? 0));
  const f = Math.max(0, (state.fishTarget ?? 0) - (state.fishesCollected ?? 0));
  const d = Math.max(0, (state.duckTarget ?? 0) - (state.ducksCollected ?? 0));
  return { apples: a, treasures: t, batteries: b, fish: f, ducks: d };
}

function maybeScheduleNextLevel(state, now) {
  // Wallmover: do not auto-advance. Mark solved and let the client show a
  // "Next Level" button.
  state.win = true;
  state.message = 'Solved!';
  state.testing = false;
  state.playing = false;
  if (state.solver) state.solver.running = false;
  if (state.autoplay) state.autoplay.running = false;
  state._advanceAt = null;
  state._advanceToLevel = null;
  state._solvedAt = now ?? Date.now();
}

function canMove(state, x, y, dirKey) {
  const d = DIRS[dirKey];
  if (!d) return false;
  const mask = wallMaskAt(state, x, y);
  if ((mask & d.bit) !== 0) return false;
  const nx = x + d.dx;
  const ny = y + d.dy;
  if (!inBounds(state.w, state.h, nx, ny)) return false;
  return true;
}

function tryWinFromPlayer(state, playerId) {
  if (!state.testing) return;
  const p = state.players?.[playerId];
  if (!p?.connected) return;
  if (p.x !== state.goal.x || p.y !== state.goal.y) return;

  state.win = true;
  state.message = 'Solved!';
  state.testing = false;
  state.playing = false;
  if (state.solver) state.solver.running = false;
}

function turnLeft(dirKey) {
  const idx = ORIENTS.indexOf(dirKey);
  return ORIENTS[(idx + 3) % 4] ?? 'UP';
}
function turnRight(dirKey) {
  const idx = ORIENTS.indexOf(dirKey);
  return ORIENTS[(idx + 1) % 4] ?? 'UP';
}
function turnBack(dirKey) {
  const idx = ORIENTS.indexOf(dirKey);
  return ORIENTS[(idx + 2) % 4] ?? 'UP';
}

function collectAt(state, x, y) {
  const removeOne = (arr) => {
    const i = arr?.findIndex((p) => p.x === x && p.y === y) ?? -1;
    if (i >= 0) arr.splice(i, 1);
    return i >= 0;
  };

  if (removeOne(state.apples)) state.applesCollected = clamp((state.applesCollected ?? 0) + 1, 0, 999);
  if (removeOne(state.treasures)) state.treasuresCollected = clamp((state.treasuresCollected ?? 0) + 1, 0, 999);
  if (removeOne(state.batteries)) state.batteriesCollected = clamp((state.batteriesCollected ?? 0) + 1, 0, 999);
  if (removeOne(state.fishes)) state.fishesCollected = clamp((state.fishesCollected ?? 0) + 1, 0, 999);
  if (removeOne(state.ducks)) state.ducksCollected = clamp((state.ducksCollected ?? 0) + 1, 0, 999);
}

function checkMinotaurCollision(state, x, y) {
  const found = state.minotaurs?.findIndex((m) => m.x === x && m.y === y) ?? -1;
  return found >= 0;
}

function resetMaze(state) {
  // Reset player positions and trails but keep the same maze
  resetPlayerPositionsAndTrails(state);

  // Keep previously claimed path segments and revealed fog so players can
  // still see where they've been after a minotaur hit.
  updateVisibility(state);

  // Clear any level-up message
  state.message = '';
  state._advanceAt = null;
  state._advanceToLevel = null;

  // Clear minotaur reset state
  state._minoResetAt = null;
  state._minoHit = null;
}

function stepSolver(state, now) {
  const s = state.solver;
  if (!s || !s.running) return;

  // Global pause blocks solver.
  if (state.paused) return;

  // Move at a fixed cadence (slower than the server tick).
  const moveEveryTicks = 2;
  if ((state.tick % moveEveryTicks) !== 0) return;

  const curDir = ORIENTS.includes(s.dir) ? s.dir : 'DOWN';

  const left = turnLeft(curDir);
  const right = turnRight(curDir);
  const back = turnBack(curDir);

  let nextDir = curDir;
  if (canMove(state, s.x, s.y, left)) nextDir = left;
  else if (canMove(state, s.x, s.y, curDir)) nextDir = curDir;
  else if (canMove(state, s.x, s.y, right)) nextDir = right;
  else if (canMove(state, s.x, s.y, back)) nextDir = back;

  if (!canMove(state, s.x, s.y, nextDir)) {
    // Fully boxed-in (should be rare unless user draws it).
    s.running = false;
    state.message = 'Solver stuck (boxed in).';
    return;
  }

  const d = DIRS[nextDir];
  s.dir = nextDir;
  s.x += d.dx;
  s.y += d.dy;
  s.steps = clamp((s.steps ?? 0) + 1, 0, 1e9);

  collectAt(state, s.x, s.y);

  if (s.x === state.goal.x && s.y === state.goal.y) {
    state.win = true;
    state.message = 'Solved!';
    s.running = false;

    // End testing; reveal the whole board.
    state.testing = false;
    state.playing = false;
  }
}

function stepAutoplay(state, now) {
  const a = state.autoplay;
  if (!a?.running) return;
  if (state.paused) return;

  const pid = Number(a.playerId || 0);
  const p = state.players?.[pid];
  if (!p?.connected) {
    a.running = false;
    return;
  }
  if (p.paused) return;

  // Move at a fixed cadence (slower than the server tick).
  const moveEveryTicks = 2;
  if ((state.tick % moveEveryTicks) !== 0) return;

  // Initialize exploration memory if missing.
  if (!a.visited || typeof a.visited !== 'object') a.visited = {};
  if (!Array.isArray(a.stack)) a.stack = [];

  const curIdx = cellIndex(state.w, p.x, p.y);
  if (a.stack.length === 0) {
    a.stack.push({ x: p.x, y: p.y });
    a.visited[String(curIdx)] = 1;
  }

  // If we've reached the goal, mark solved.
  if (p.x === state.goal.x && p.y === state.goal.y) {
    maybeScheduleNextLevel(state, now ?? Date.now());
    return;
  }

  const curDir = ORIENTS.includes(a.dir) ? a.dir : 'DOWN';
  const validDirs = ORIENTS.filter((d) => canMove(state, p.x, p.y, d));
  if (validDirs.length === 0) {
    a.running = false;
    state.message = 'Autoplay stuck (boxed in).';
    return;
  }

  const neighbors = validDirs.map((dir) => {
    const d = DIRS[dir];
    const nx = p.x + d.dx;
    const ny = p.y + d.dy;
    const idx = cellIndex(state.w, nx, ny);
    return { dir, nx, ny, idx };
  });

  const unvisited = neighbors.filter((n) => !a.visited[String(n.idx)]);

  if (unvisited.length > 0) {
    // Directed exploration with a tiny bit of randomness.
    const left = turnLeft(curDir);
    const right = turnRight(curDir);

    let best = unvisited[0];
    let bestScore = -1e9;
    for (const n of unvisited) {
      let score = 0;
      if (n.dir === curDir) score += 3.0;
      else if (n.dir === left) score += 2.0;
      else if (n.dir === right) score += 1.0;

      // Encourage variety but keep it directed.
      score += Math.random() * 0.35;

      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }

    a.dir = best.dir;
    movePlayerCore_(state, pid, best.dir, now, true);
    const nidx = cellIndex(state.w, p.x, p.y);
    a.stack.push({ x: p.x, y: p.y });
    a.visited[String(nidx)] = 1;
    return;
  }

  // Dead end / fully explored: backtrack along the stack.
  if (a.stack.length <= 1) {
    a.running = false;
    state.message = 'Explored all paths!';
    return;
  }

  // Pop current position and move toward previous.
  a.stack.pop();
  const target = a.stack[a.stack.length - 1];
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  let backDir = null;
  if (dx === 1 && dy === 0) backDir = 'RIGHT';
  else if (dx === -1 && dy === 0) backDir = 'LEFT';
  else if (dx === 0 && dy === 1) backDir = 'DOWN';
  else if (dx === 0 && dy === -1) backDir = 'UP';
  else {
    // If walls changed and the stack is inconsistent, fall back to any move.
    backDir = validDirs[0];
  }

  a.dir = backDir;
  movePlayerCore_(state, pid, backDir, now, true);
}

export function autoplayStart(state, playerId) {
  const pid = Number(playerId || 0);
  if (!pid) return;
  const p = state.players?.[pid];
  if (!p?.connected) return;

  // Only allow in editor mode.
  if (state.testing || state.playing) return;

  state.win = false;
  state.message = '';
  if (state.solver) state.solver.running = false;

  // Ensure the room isn't globally paused.
  if (state.paused && state.reasonPaused === 'start') {
    state.paused = false;
    state.reasonPaused = null;
  }

  // Reset the demo runner to start.
  p.x = state.start.x;
  p.y = state.start.y;
  p.trail = [{ x: p.x, y: p.y }];
  updateVisibility(state);

  if (!state.autoplay) state.autoplay = { running: false, playerId: pid, dir: 'DOWN' };
  state.autoplay.running = true;
  state.autoplay.playerId = pid;
  state.autoplay.dir = 'DOWN';
  state.autoplay.stack = [{ x: p.x, y: p.y }];
  state.autoplay.visited = { [String(cellIndex(state.w, p.x, p.y))]: 1 };
  p.paused = false;
}

export function autoplayStop(state) {
  if (state.autoplay) state.autoplay.running = false;
}

export function newGameState() {
  const level = 1;
  const { w, h } = levelSize(level);
  const start = startCell(w);

  const state = {
    tick: 0,
    paused: true,
    reasonPaused: 'start',

    level,
    w,
    h,

    // Maze-style vision selection.
    visionMode: 'fog',

    // Wallmover mode ("Free" editor canvas is 'freeform').
    // Default to Puzzle so hosted games land in the curated ruleset.
    mode: 'puzzle',

    start,
    goal: { x: 0, y: h - 1 },

    // Live connectivity status from start -> goal.
    routeComplete: false,

    walls: [],

    // Puzzle-only: editable wall bits (softWalls) and the set of edges that are
    // allowed to be toggled (softMask). Null in Free mode.
    softWalls: null,
    softMask: null,

    apples: [],
    appleTarget: 0,
    applesCollected: 0,

    treasures: [],
    treasureTarget: 0,
    treasuresCollected: 0,

    batteries: [],
    batteryTarget: 0,
    batteriesCollected: 0,

    fishes: [],
    fishTarget: 0,
    fishesCollected: 0,

    ducks: [],
    duckTarget: 0,
    ducksCollected: 0,

    minotaurs: [],
    revealed: [],
    // Claimed path segments; each segment has a fixed color from the first traversal.
    paths: [],
    _pathOwners: {},

    solver: null,

    players: {
      1: makePlayerState(1, start),
      2: makePlayerState(2, start),
      3: makePlayerState(3, start),
      4: makePlayerState(4, start),
    },

    win: false,
    message: '',

    _advanceAt: null,
    _advanceToLevel: null,
    _minoResetAt: null,
    _minoHit: null,

    autoplay: { running: false, playerId: 1, dir: 'DOWN' },
  };

  buildLevel(state, level);
  return state;
}

export function step(state, now) {
  state.tick++;

  // Minotaur reset takes precedence over level-up.
  if (state._minoResetAt != null) {
    if (now >= state._minoResetAt) {
      resetMaze(state);
    }
    return;
  }

  stepAutoplay(state, now);
  stepSolver(state, now);
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

export function togglePause(state, playerId) {
  if (!playerId) return;
  const p = state.players[playerId];
  if (!p) return;
  p.paused = !p.paused;

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
  state.message = '';
  state.win = false;
  state._advanceAt = null;
  state._advanceToLevel = null;
  state._minoResetAt = null;
  state._minoHit = null;
  if (state.autoplay) state.autoplay.running = false;

  buildLevel(state, state.level);

  // Back to lobby.
  state.paused = true;
  state.reasonPaused = 'start';
  for (const pid of [1, 2, 3, 4]) {
    if (state.players[pid]) state.players[pid].paused = true;
  }
}

export function nextLevel(state) {
  state.message = '';
  state.win = false;
  state.testing = false;
  state.playing = false;
  if (state.autoplay) state.autoplay.running = false;
  buildLevel(state, (state.level ?? 1) + 1);

  // Return to lobby so players can edit/prepare before testing again.
  state.paused = true;
  state.reasonPaused = 'start';
  for (const pid of [1, 2, 3, 4]) {
    if (state.players[pid]) state.players[pid].paused = true;
  }
}

export function setMode(state, mode) {
  const m = String(mode || '').toLowerCase();
  if (m !== 'freeform' && m !== 'puzzle') return false;
  state.mode = m;
  state.message = '';
  state.win = false;
  state.testing = false;
  state.playing = false;
  if (state.autoplay) state.autoplay.running = false;
  buildLevel(state, state.level);
  // Back to lobby after mode switch.
  state.paused = true;
  state.reasonPaused = 'start';
  for (const pid of [1, 2, 3, 4]) {
    if (state.players[pid]) state.players[pid].paused = true;
  }
  return true;
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

export function solverStart(state) {
  if (!state.solver) resetSolver(state);
  state.solver.running = true;
  state.message = '';
  state.win = false;
  state.testing = true;
  state.playing = false;
  if (state.paused && state.reasonPaused === 'start') {
    state.paused = false;
    state.reasonPaused = null;
  }
}

export function solverStop(state) {
  if (!state.solver) return;
  state.solver.running = false;
  state.testing = false;
  state.playing = false;
}

export function solverReset(state) {
  resetSolver(state);
  state.win = false;
  state.testing = false;
  state.playing = false;
}

export function startPlay(state, playerId) {
  if (!playerId) return;
  const p = state.players?.[playerId];
  if (!p?.connected) return;

  state.message = '';
  state.win = false;
  state.testing = true;
  state.playing = true;
  if (state.solver) state.solver.running = false;
  if (state.autoplay) state.autoplay.running = false;

  // Fresh test run from start (keep walls/items).
  resetPlayerPositionsAndTrails(state);
  state.paths = [];
  state._pathOwners = {};
  state.revealed = [];
  updateVisibility(state);

  p.paused = false;

  if (state.paused && state.reasonPaused === 'start') {
    state.paused = false;
    state.reasonPaused = null;
  }
}

export function stopTest(state) {
  state.message = '';
  state.win = false;
  state.testing = false;
  state.playing = false;
  if (state.solver) state.solver.running = false;
  if (state.autoplay) state.autoplay.running = false;

  // Clear breadcrumbs and put everyone back at the start.
  resetPlayerPositionsAndTrails(state);
  state.paths = [];
  state._pathOwners = {};
  state.revealed = [];
  updateVisibility(state);

  // Leave the room unpaused so editing can continue.
  state.paused = false;
  state.reasonPaused = null;
  for (const pid of [1, 2, 3, 4]) {
    if (state.players[pid]) state.players[pid].paused = false;
  }
}

export function setVisionMode(state, mode) {
  const m = String(mode || '').toLowerCase();
  if (!ALLOWED_VISION.has(m)) return false;
  state.visionMode = m;
  return true;
}

function movePlayerCore_(state, playerId, dir, now, allowWhenNotTesting) {
  if (!playerId) return;
  if (!DIRS[dir]) return;

  // Player-controlled movement only during test/play.
  if (!allowWhenNotTesting && !state.testing) return;

  // During a minotaur-hit countdown, freeze movement.
  if (state._minoResetAt != null) return;

  // Global pause blocks movement.
  if (state.paused) return;

  const p = state.players[playerId];
  if (!p || !p.connected) return;

  // Local pause blocks only this player.
  if (p.paused) return;

  // Clear transient messages on movement.
  if (state.message && state._minoResetAt == null) state.message = '';

  const d = DIRS[dir];
  const mask = wallMaskAt(state, p.x, p.y);
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

  // Check minotaur collision BEFORE collecting items
  if (checkMinotaurCollision(state, nx, ny)) {
    // Start a short countdown before resetting (same maze, items stay put).
    state.message = '⚠️ The Minotaur got you! Resetting...';
    state._minoResetAt = (now ?? Date.now()) + 3000;
    state._minoHit = { x: nx, y: ny, at: now ?? Date.now() };

    // Cancel any scheduled level-up.
    state._advanceAt = null;
    state._advanceToLevel = null;
    return;
  }

  collectAt(state, nx, ny);

  if (nx === state.goal.x && ny === state.goal.y) {
    // Objectives are optional; reaching the goal always finishes the level.
    maybeScheduleNextLevel(state, now ?? Date.now());
  }
}

export function applyInput(state, playerId, dir, now) {
  movePlayerCore_(state, playerId, dir, now, false);
}

export function inputMove(state, playerId, dirKey) {
  const dir = String(dirKey || '').toUpperCase();
  applyInput(state, playerId, dir, Date.now());
  return true;
}

export function setLevel(state, level) {
  const next = clamp(Number(level || 1), 1, 999);
  state.message = '';
  state.win = false;
  state._advanceAt = null;
  state._advanceToLevel = null;
  state._minoResetAt = null;
  state._minoHit = null;
  buildLevel(state, next);
}

function wallEdgeAllowed(state, x, y, dirKey) {
  const d = DIRS[dirKey];
  if (!d) return false;
  // Disallow edits that would touch the outer boundary.
  const nx = x + d.dx;
  const ny = y + d.dy;
  if (!inBounds(state.w, state.h, x, y)) return false;
  if (!inBounds(state.w, state.h, nx, ny)) return false;
  return true;
}

export function setWallEdge(state, x, y, dirKey, on) {
  if (state.testing || state.playing) return false;
  const mode = String(state.mode || 'freeform').toLowerCase();
  const dir = String(dirKey || '').toUpperCase();
  const d = DIRS[dir];
  if (!d) return false;
  const cx = Math.floor(Number(x));
  const cy = Math.floor(Number(y));
  if (!wallEdgeAllowed(state, cx, cy, dir)) return false;

  const nx = cx + d.dx;
  const ny = cy + d.dy;

  if (mode === 'puzzle') {
    // Only allow toggling of puzzle-provided soft walls (undo supported).
    if (!state.softWalls || !state.softMask) return false;
    const allowedA = ((state.softMask?.[cy]?.[cx] ?? 0) & d.bit) !== 0;
    const allowedB = ((state.softMask?.[ny]?.[nx] ?? 0) & d.opp) !== 0;
    if (!allowedA || !allowedB) return false;

    if (on) {
      state.softWalls[cy][cx] |= d.bit;
      state.softWalls[ny][nx] |= d.opp;
    } else {
      state.softWalls[cy][cx] &= ~d.bit;
      state.softWalls[ny][nx] &= ~d.opp;
    }
    updateRouteStatus_(state);
    return true;
  }

  if (on) {
    state.walls[cy][cx] |= d.bit;
    state.walls[ny][nx] |= d.opp;
  } else {
    state.walls[cy][cx] &= ~d.bit;
    state.walls[ny][nx] &= ~d.opp;
  }

  enforceBorderWalls(state);
  updateRouteStatus_(state);
  return true;
}

export function placeCollectible(state, kind, x, y) {
  if (state.testing || state.playing) return false;
  if (String(state.mode || 'freeform').toLowerCase() === 'puzzle') return false;
  const k = String(kind || '').toLowerCase();
  const cx = Math.floor(Number(x));
  const cy = Math.floor(Number(y));
  if (!inBounds(state.w, state.h, cx, cy)) return false;
  if (cx === state.start.x && cy === state.start.y) return false;
  if (cx === state.goal.x && cy === state.goal.y) return false;

  const add = (arr) => {
    if (!Array.isArray(arr)) return false;
    if (arr.some((p) => p && p.x === cx && p.y === cy)) return false;
    arr.push({ x: cx, y: cy });
    return true;
  };

  const remove = (arr) => {
    const i = arr?.findIndex((p) => p && p.x === cx && p.y === cy) ?? -1;
    if (i >= 0) {
      arr.splice(i, 1);
      return true;
    }
    return false;
  };

  const removeAll = () => {
    let removed = false;
    removed = remove(state.apples) || removed;
    removed = remove(state.treasures) || removed;
    removed = remove(state.batteries) || removed;
    removed = remove(state.fishes) || removed;
    removed = remove(state.ducks) || removed;
    return removed;
  };

  if (k === 'erase' || k === 'none') return removeAll();

  const alreadyHas = (arr) => Array.isArray(arr) && arr.some((p) => p && p.x === cx && p.y === cy);

  // Allow re-clicking the same cell to remove the item (toggle).
  if (k === 'apple') {
    if (alreadyHas(state.apples)) return remove(state.apples);
    removeAll();
    return add(state.apples);
  }
  if (k === 'treasure' || k === 'chest') {
    if (alreadyHas(state.treasures)) return remove(state.treasures);
    removeAll();
    return add(state.treasures);
  }
  if (k === 'battery') {
    if (alreadyHas(state.batteries)) return remove(state.batteries);
    removeAll();
    return add(state.batteries);
  }
  if (k === 'fish') {
    if (alreadyHas(state.fishes)) return remove(state.fishes);
    removeAll();
    return add(state.fishes);
  }
  if (k === 'duck') {
    if (alreadyHas(state.ducks)) return remove(state.ducks);
    removeAll();
    return add(state.ducks);
  }

  return false;
}

export function getPublicState(state) {
  // State is already safe/plain JSON. This hook exists if we later want to hide internals.
  return state;
}

export const WALL = { WALL_N, WALL_E, WALL_S, WALL_W };
export const DIR = DIRS;
