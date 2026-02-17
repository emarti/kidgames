import { randInt } from './utils.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function randRange(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const WORLD_W = 800;
const WORLD_H = 600;

const MAX_POWER = 100;
const FIRE_COOLDOWN_MS = 600;
const MAX_PROJECTILES_PER_PLAYER = 3;
const PROJECTILE_RADIUS = 10;
const TARGET_RADIUS = 22;

// Terrain heightmap resolution
const TERRAIN_STEP = 8; // one height sample every 8px

// Projectile & target types (easy to swap later)
const PROJECTILE_TYPE = 'rubber_duck';
const TARGET_TYPE = 'alien_ship';

// ---------------------------------------------------------------------------
// Planet configs — physics calibrated so 65% power at 45° covers ~520px
// ---------------------------------------------------------------------------
const PLANETS = {
  earth: {
    id: 'earth',
    gravity: 400,
    airResistance: 0.15,
    powerToVelocity: 7.5,  // 65%→487.5 px/s, range w/ air ~520px
  },
  mars: {
    id: 'mars',
    gravity: 200,
    airResistance: 0.03,
    powerToVelocity: 5.0,  // 65%→325, range ~528px
  },
  moon: {
    id: 'moon',
    gravity: 100,
    airResistance: 0.0,
    powerToVelocity: 3.5,  // 65%→227.5, range ~518px
  },
  enceladus: {
    id: 'enceladus',
    gravity: 50,
    airResistance: 0.0,
    powerToVelocity: 2.5,  // 65%→162.5, range ~528px
  },
  io: {
    id: 'io',
    gravity: 120,
    airResistance: 0.0,
    powerToVelocity: 3.8,  // 65%→247, range ~510px
  },
};

// Level definitions: planet, target count, terrain difficulty
const LEVELS = [
  /*  1 */ { planet: 'earth',     targets: 2, difficulty: 2 },
  /*  2 */ { planet: 'earth',     targets: 3, difficulty: 3 },
  /*  3 */ { planet: 'earth',     targets: 4, difficulty: 3 },
  /*  4 */ { planet: 'mars',      targets: 3, difficulty: 3 },
  /*  5 */ { planet: 'mars',      targets: 4, difficulty: 4 },
  /*  6 */ { planet: 'moon',      targets: 4, difficulty: 3 },
  /*  7 */ { planet: 'moon',      targets: 5, difficulty: 4 },
  /*  8 */ { planet: 'enceladus', targets: 5, difficulty: 4 },
  /*  9 */ { planet: 'enceladus', targets: 6, difficulty: 5 },
  /* 10 */ { planet: 'io',        targets: 5, difficulty: 4 },
  /* 11 */ { planet: 'io',        targets: 6, difficulty: 5 },
];

function getLevelDef(level) {
  return LEVELS[clamp(level, 1, LEVELS.length) - 1];
}

function getPlanet(level) {
  return PLANETS[getLevelDef(level).planet];
}

// Avatars
const AVATARS = [
  'hunter',
  'mrwhatwhat',
  'chaihou',
  'taolabi',
  'chichi',
  'starway',
  'brillan',
  'daddy',
];
const DEFAULT_AVATARS = ['brillan', 'chaihou', 'mrwhatwhat', 'chichi'];

// Avatar-associated colors
const AVATAR_COLORS = {
  hunter: '#8b6914',
  mrwhatwhat: '#7b3fa0',
  chaihou: '#ff8c00',
  taolabi: '#2e8b57',
  chichi: '#ff69b4',
  starway: '#00bfff',
  brillan: '#ff4d4d',
  daddy: '#8b7355',
};

// ---------------------------------------------------------------------------
// Terrain generation — varies by planet
// ---------------------------------------------------------------------------
function generateTerrain(level) {
  const def = getLevelDef(level);
  const planet = def.planet;
  const diff = def.difficulty;
  const n = Math.ceil(WORLD_W / TERRAIN_STEP) + 1;
  const heights = new Array(n);

  if (planet === 'earth') {
    // Green rolling hills — sine waves
    const baseH = 100;
    const amp1 = 15 + diff * 18;
    const amp2 = 8 + diff * 10;
    const amp3 = 4 + diff * 5;
    const p1 = randRange(0, Math.PI * 2);
    const p2 = randRange(0, Math.PI * 2);
    const p3 = randRange(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const t = (i * TERRAIN_STEP) / WORLD_W;
      let h = baseH;
      h += Math.sin(t * Math.PI * 2 + p1) * amp1;
      h += Math.sin(t * Math.PI * 4.7 + p2) * amp2;
      h += Math.sin(t * Math.PI * 8.3 + p3) * amp3;
      heights[i] = Math.round(clamp(h, 80, WORLD_H - 140));
    }
  } else if (planet === 'mars') {
    // Rocky red terrain — sharper features, plateaus
    const baseH = 110;
    const amp1 = 20 + diff * 20;
    const amp2 = 12 + diff * 12;
    const amp3 = 6 + diff * 8;
    const p1 = randRange(0, Math.PI * 2);
    const p2 = randRange(0, Math.PI * 2);
    const p3 = randRange(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const t = (i * TERRAIN_STEP) / WORLD_W;
      let h = baseH;
      h += Math.sin(t * Math.PI * 2.5 + p1) * amp1;
      h += Math.sin(t * Math.PI * 5.5 + p2) * amp2;
      // Sharper: abs(sin) for mesa/plateau shapes
      h += Math.abs(Math.sin(t * Math.PI * 9 + p3)) * amp3;
      heights[i] = Math.round(clamp(h, 80, WORLD_H - 140));
    }
  } else if (planet === 'moon') {
    // Gray terrain with craters — bumpy like Earth hills
    const baseH = 90;
    const bumpScale = 0.6 + diff * 0.35; // diff 3 → 1.65
    const p1 = randRange(0, Math.PI * 2);
    const p2 = randRange(0, Math.PI * 2);
    const p3 = randRange(0, Math.PI * 2);
    const p4 = randRange(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const t = (i * TERRAIN_STEP) / WORLD_W;
      let h = baseH;
      h += Math.sin(t * Math.PI * 2 + p1) * 40 * bumpScale;
      h += Math.sin(t * Math.PI * 4.7 + p2) * 22 * bumpScale;
      h += Math.sin(t * Math.PI * 8.3 + p3) * 12 * bumpScale;
      h += Math.sin(t * Math.PI * 13 + p4) * 5 * bumpScale;
      heights[i] = h;
    }
    // Stamp craters (more craters with higher difficulty)
    const craterCount = 3 + diff + Math.floor(Math.random() * 3);
    for (let c = 0; c < craterCount; c++) {
      const cx = Math.floor(randRange(n * 0.15, n * 0.85));
      const craterW = Math.floor(randRange(5, 10 + diff * 2));
      const craterDepth = randRange(12 + diff * 5, 25 + diff * 8);
      for (let i = -craterW; i <= craterW; i++) {
        const idx = cx + i;
        if (idx < 0 || idx >= n) continue;
        const f = 1 - (i / craterW) ** 2;
        heights[idx] -= craterDepth * f;
        if (Math.abs(i) >= craterW - 2 && Math.abs(i) <= craterW) {
          heights[idx] += craterDepth * 0.25;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      heights[i] = Math.round(clamp(heights[i], 80, WORLD_H - 140));
    }
  } else if (planet === 'enceladus') {
    // Icy cliffs — dramatic, bumpiness scales with difficulty
    const baseH = 100;
    const bumpScale = 0.6 + diff * 0.3; // diff 4 → 1.8
    const p1 = randRange(0, Math.PI * 2);
    const p2 = randRange(0, Math.PI * 2);
    const p3 = randRange(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const t = (i * TERRAIN_STEP) / WORLD_W;
      let h = baseH;
      // Large cliff features
      h += Math.sin(t * Math.PI * 2 + p1) * 50 * bumpScale;
      // Sawtooth-like ridges, softened with sine blend
      const rawSaw = ((t * 7 + p2 / Math.PI) % 1) * 2 - 1;
      const saw = rawSaw * 0.65 + Math.sin(t * Math.PI * 7 + p2) * 0.35;
      h += saw * 30 * bumpScale;
      // Fine ice texture
      h += Math.sin(t * Math.PI * 14 + p2) * 10 * bumpScale;
      // Extra jagged detail at high difficulty (toned down)
      h += Math.sin(t * Math.PI * 18 + p3) * 4 * bumpScale;
      heights[i] = Math.round(clamp(h, 80, WORLD_H - 140));
    }
  } else if (planet === 'io') {
    // Volcanic terrain — calderas and lava flows
    const baseH = 105;
    const bumpScale = 0.6 + diff * 0.3;
    const p1 = randRange(0, Math.PI * 2);
    const p2 = randRange(0, Math.PI * 2);
    const p3 = randRange(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const t = (i * TERRAIN_STEP) / WORLD_W;
      let h = baseH;
      // Broad volcanic shields
      h += Math.sin(t * Math.PI * 2.2 + p1) * 35 * bumpScale;
      // Mid-frequency ridges
      h += Math.sin(t * Math.PI * 5.5 + p2) * 20 * bumpScale;
      // Sharp volcanic peaks (abs for pointed tops)
      h += Math.abs(Math.sin(t * Math.PI * 11 + p3)) * 15 * bumpScale;
      // Fine roughness
      h += Math.sin(t * Math.PI * 16 + p2) * 6 * bumpScale;
      heights[i] = Math.round(clamp(h, 80, WORLD_H - 140));
    }
    // Stamp calderas (volcanic craters — wider and flatter than moon craters)
    const calderaCount = 2 + diff + Math.floor(Math.random() * 2);
    for (let c = 0; c < calderaCount; c++) {
      const cx = Math.floor(randRange(n * 0.1, n * 0.9));
      const cw = Math.floor(randRange(6, 12 + diff * 2));
      const cDepth = randRange(15 + diff * 4, 28 + diff * 6);
      for (let i = -cw; i <= cw; i++) {
        const idx = cx + i;
        if (idx < 0 || idx >= n) continue;
        const f = 1 - (i / cw) ** 2;
        heights[idx] -= cDepth * f;
        // Raised rim
        if (Math.abs(i) >= cw - 2 && Math.abs(i) <= cw) {
          heights[idx] += cDepth * 0.3;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      heights[i] = Math.round(clamp(heights[i], 80, WORLD_H - 140));
    }
  }

  return { heights, step: TERRAIN_STEP };
}

// Get interpolated terrain height at any world x
function terrainHeightAt(terrain, x) {
  const idx = x / terrain.step;
  const i0 = clamp(Math.floor(idx), 0, terrain.heights.length - 1);
  const i1 = Math.min(i0 + 1, terrain.heights.length - 1);
  const frac = idx - Math.floor(idx);
  return terrain.heights[i0] * (1 - frac) + terrain.heights[i1] * frac;
}

// Ground Y in world coords (0=top) at a given x
function groundYAt(terrain, x) {
  return WORLD_H - terrainHeightAt(terrain, x);
}

// ---------------------------------------------------------------------------
// Player placement (left side of terrain)
// ---------------------------------------------------------------------------
function placePlayers(state) {
  const { terrain } = state;
  const positions = [0.06, 0.12, 0.18, 0.24];
  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    const wx = Math.round(WORLD_W * positions[pid - 1]);
    p.x = wx;
    p.y = groundYAt(terrain, wx);
  }
}

// ---------------------------------------------------------------------------
// Target placement (right side of terrain)
// ---------------------------------------------------------------------------
function placeTargets(state) {
  const { terrain, level } = state;
  const def = getLevelDef(level);
  const numTargets = def.targets;

  state.targets = [];
  const startFrac = 0.65;
  const endFrac = 0.95;
  const span = endFrac - startFrac;

  for (let i = 0; i < numTargets; i++) {
    const frac = numTargets === 1
      ? (startFrac + endFrac) / 2
      : startFrac + (span * i) / (numTargets - 1);
    const wx = Math.round(WORLD_W * frac);
    const gy = groundYAt(terrain, wx);
    state.targets.push({
      id: `t${i}`,
      x: wx,
      y: gy - TARGET_RADIUS * 0.5,
      hit: false,
    });
  }
}

// ---------------------------------------------------------------------------
// Apply planet physics to state (called when level changes)
// ---------------------------------------------------------------------------
function applyPlanetPhysics(state) {
  const planet = getPlanet(state.level);
  state.planet = planet.id;
  state.gravity = planet.gravity;
  state.airResistance = planet.airResistance;
  state.powerToVelocity = planet.powerToVelocity;
}

// ---------------------------------------------------------------------------
// State factory
// ---------------------------------------------------------------------------
export function newGameState({ now = Date.now() } = {}) {
  const state = {
    w: WORLD_W,
    h: WORLD_H,
    tick: 0,
    paused: true,
    reasonPaused: 'start',
    lastNow: now,
    level: 1,
    maxLevel: LEVELS.length,
    levelComplete: false,
    // Planet physics (set by applyPlanetPhysics)
    planet: 'earth',
    gravity: 400,
    airResistance: 0.15,
    powerToVelocity: 7.5,
    terrain: null,
    targets: [],
    projectiles: [],
    showGuides: false,
    projectileType: PROJECTILE_TYPE,
    targetType: TARGET_TYPE,
    avatars: AVATARS,
    players: {
      1: basePlayer(1),
      2: basePlayer(2),
      3: basePlayer(3),
      4: basePlayer(4),
    },
  };

  applyPlanetPhysics(state);
  state.terrain = generateTerrain(state.level);
  placePlayers(state);
  placeTargets(state);

  return state;
}

export function basePlayer(id) {
  return {
    id,
    connected: false,
    paused: true,
    avatar: DEFAULT_AVATARS[(id - 1) % DEFAULT_AVATARS.length],
    color: AVATAR_COLORS[DEFAULT_AVATARS[(id - 1) % DEFAULT_AVATARS.length]],
    x: 60,
    y: WORLD_H - 120,
    aimAngle: 45,
    aimPower: 50,
    fireCooldownMs: 0,
  };
}

// ---------------------------------------------------------------------------
// Avatar selection
// ---------------------------------------------------------------------------
export function selectAvatar(state, playerId, avatar) {
  const p = state.players[playerId];
  if (!p || !p.connected) return false;
  const a = String(avatar ?? '').toLowerCase();
  if (!AVATARS.includes(a)) return false;
  p.avatar = a;
  p.color = AVATAR_COLORS[a] ?? p.color;
  return true;
}

// ---------------------------------------------------------------------------
// Show guides toggle (global)
// ---------------------------------------------------------------------------
export function setGuides(state, show) {
  state.showGuides = Boolean(show);
}

// ---------------------------------------------------------------------------
// Player connection
// ---------------------------------------------------------------------------
export function setPlayerConnected(state, playerId, connected) {
  const p = state.players[playerId];
  p.connected = connected;
  if (connected) {
    p.paused = true;
  }
}

// ---------------------------------------------------------------------------
// Pause / resume
// ---------------------------------------------------------------------------
export function togglePause(state, playerId) {
  if (!playerId) return;
  const p = state.players[playerId];
  p.paused = !p.paused;

  if (state.paused && state.reasonPaused === 'start') {
    state.paused = false;
    state.reasonPaused = null;
  }
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

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------
export function applyAim(state, playerId, angle, power) {
  const p = state.players[playerId];
  if (!p || !p.connected) return;
  p.aimAngle = clamp(Number(angle) || 45, 5, 85);
  p.aimPower = clamp(Number(power) || 50, 5, MAX_POWER);
}

export function fire(state, playerId, now) {
  const p = state.players[playerId];
  if (!p || !p.connected) return;
  if (p.fireCooldownMs > 0) return;
  if (state.paused) return;
  if (state.levelComplete) return;

  const myCount = state.projectiles.filter((pr) => pr.owner === playerId && pr.active).length;
  if (myCount >= MAX_PROJECTILES_PER_PLAYER) return;

  const angleRad = (p.aimAngle * Math.PI) / 180;
  const speed = p.aimPower * state.powerToVelocity;

  state.projectiles.push({
    id: `p${state.tick}-${playerId}-${randInt(1e9)}`,
    owner: playerId,
    x: p.x,
    y: p.y - 14,
    vx: Math.cos(angleRad) * speed,
    vy: -Math.sin(angleRad) * speed,
    rotation: 0,
    rotationSpeed: randRange(4, 10) * (Math.random() < 0.5 ? 1 : -1),
    active: true,
    bornAt: now,
  });

  p.fireCooldownMs = FIRE_COOLDOWN_MS;
}

// ---------------------------------------------------------------------------
// Level management
// ---------------------------------------------------------------------------
export function setLevel(state, level) {
  const lv = clamp(Math.round(Number(level) || 1), 1, state.maxLevel);
  state.level = lv;
  state.levelComplete = false;
  state.projectiles = [];
  applyPlanetPhysics(state);
  state.terrain = generateTerrain(lv);
  placePlayers(state);
  placeTargets(state);
}

export function nextLevel(state) {
  if (state.level < state.maxLevel) {
    setLevel(state, state.level + 1);
  }
}

export function restart(state, now) {
  setLevel(state, state.level);
}

// ---------------------------------------------------------------------------
// New game (preserves connections + avatars)
// ---------------------------------------------------------------------------
export function newGame(state, now = Date.now()) {
  const fresh = newGameState({ now });
  for (const pid of [1, 2, 3, 4]) {
    fresh.players[pid].connected = state.players[pid].connected;
    fresh.players[pid].avatar = state.players[pid].avatar;
    fresh.players[pid].color = state.players[pid].color;
    if (fresh.players[pid].connected) {
      fresh.players[pid].paused = true;
    }
  }
  placePlayers(fresh);
  return fresh;
}

// ---------------------------------------------------------------------------
// Collision helpers
// ---------------------------------------------------------------------------
function projectileHitsTerrain(px, py, terrain) {
  if (px < 0 || px > WORLD_W) return false;
  return py >= groundYAt(terrain, px);
}

function projectileHitsTarget(px, py, targets) {
  for (const t of targets) {
    if (t.hit) continue;
    const dx = px - t.x;
    const dy = py - t.y;
    if (dx * dx + dy * dy <= (PROJECTILE_RADIUS + TARGET_RADIUS) ** 2) {
      return t;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Simulation step — uses per-planet gravity & air resistance from state
// ---------------------------------------------------------------------------
export function step(state, now = Date.now()) {
  if (state.paused) {
    state.lastNow = now;
    return;
  }

  const prevNow = Number.isFinite(state.lastNow) ? state.lastNow : now;
  state.lastNow = now;
  const dt = clamp((now - prevNow) / 1000, 0.005, 0.1);
  state.tick++;

  const gravity = state.gravity;
  const airRes = state.airResistance;

  // Decay fire cooldowns
  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    if (p.fireCooldownMs > 0) {
      p.fireCooldownMs = Math.max(0, p.fireCooldownMs - dt * 1000);
    }
  }

  // Update projectiles
  const alive = [];
  for (const pr of state.projectiles) {
    if (!pr.active) continue;

    // Air resistance
    if (airRes > 0) {
      pr.vx *= (1 - airRes * dt);
      pr.vy *= (1 - airRes * dt);
    }

    // Gravity
    pr.vy += gravity * dt;

    // Integrate position
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;

    // Tumble rotation
    pr.rotation += pr.rotationSpeed * dt;

    // Off-screen check
    if (pr.x < -50 || pr.x > WORLD_W + 50 || pr.y > WORLD_H + 50 || pr.y < -300) {
      continue;
    }

    // Terrain collision
    if (projectileHitsTerrain(pr.x, pr.y, state.terrain)) {
      continue;
    }

    // Target collision
    const hitTarget = projectileHitsTarget(pr.x, pr.y, state.targets);
    if (hitTarget) {
      hitTarget.hit = true;
      continue;
    }

    alive.push(pr);
  }
  state.projectiles = alive;

  // Check level completion
  if (!state.levelComplete && state.targets.length > 0) {
    const allHit = state.targets.every((t) => t.hit);
    if (allHit) {
      state.levelComplete = true;
    }
  }
}
