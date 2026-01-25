import { randInt } from './utils.js';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function normAngle(a) {
  // Normalize to [-pi, pi]
  const pi = Math.PI;
  let x = a;
  while (x <= -pi) x += 2 * pi;
  while (x > pi) x -= 2 * pi;
  return x;
}

function randRange(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

function difficultyKey(state) {
  const d = String(state?.difficulty ?? 'easy').toLowerCase();
  if (d === 'easy' || d === 'medium' || d === 'hard') return d;
  return 'easy';
}

function difficultyParams(state) {
  const d = difficultyKey(state);
  const BASE_COMET_MIN = 6500;
  const BASE_COMET_MAX = 11000;
  const mediumHardScale = 1 / 1.15; // 15% more comets => ~15% shorter average interval

  if (d === 'easy') {
    return {
      bulletCooldownMs: 125,
      bulletLifeMs: 3600,
      cometSpawnMinMs: BASE_COMET_MIN,
      cometSpawnMaxMs: BASE_COMET_MAX,
      initialCometSize: 1,
      shipTurnMult: 1.0,
      shipThrustMult: 1.0,
      shipReverseMult: 1.0,
      shipCometCollision: false,
    };
  }

  if (d === 'medium') {
    return {
      bulletCooldownMs: 250,
      bulletLifeMs: 1800,
      cometSpawnMinMs: Math.round(BASE_COMET_MIN * mediumHardScale),
      cometSpawnMaxMs: Math.round(BASE_COMET_MAX * mediumHardScale),
      initialCometSize: 2,
      shipTurnMult: 1.56,
      shipThrustMult: 1.20,
      shipReverseMult: 1.20,
      shipCometCollision: false,
    };
  }

  // hard
  return {
    bulletCooldownMs: 250,
    bulletLifeMs: 1800,
    cometSpawnMinMs: Math.round(BASE_COMET_MIN * mediumHardScale),
    cometSpawnMaxMs: Math.round(BASE_COMET_MAX * mediumHardScale),
    initialCometSize: 2,
    shipTurnMult: 1.755,
    shipThrustMult: 1.35,
    shipReverseMult: 1.35,
    shipCometCollision: true,
  };
}

function wrappedDelta(d, span) {
  if (!(span > 0)) return d;
  let x = d % span;
  if (x > span / 2) x -= span;
  if (x < -span / 2) x += span;
  return x;
}

function tryFindSafeSpawn(state) {
  // Client renders ships at size ~14px; use similar radius for collisions.
  const SHIP_R = 14;
  const margin = 6;
  const tries = 14;

  for (let t = 0; t < tries; t++) {
    const x = randRange(0, state.w);
    const y = randRange(0, state.h);

    let ok = true;
    for (const c of state.comets ?? []) {
      const r = cometRadius(c.size) + SHIP_R + margin;
      const dx = wrappedDelta(x - c.x, state.w);
      const dy = wrappedDelta(y - c.y, state.h);
      if ((dx * dx + dy * dy) <= (r * r)) {
        ok = false;
        break;
      }
    }

    if (ok) return { x, y };
  }

  return null;
}

function clampVelocityToSpeedCap(vx, vy, speedCap) {
  const sp = Math.hypot(vx, vy);
  if (!(sp > speedCap)) return { vx, vy };
  const k = speedCap / sp;
  return { vx: vx * k, vy: vy * k };
}

function applyWrap(obj, w, h, mode) {
  // Regular: torus (no flips)
  // Klein: top/bottom flips x
  // Projective: top/bottom flips x AND left/right flips y

  // X wrap first
  if (obj.x < 0) {
    obj.x += w;
    if (mode === 'projective') {
      obj.y = h - obj.y;
      if (Number.isFinite(obj.vy)) obj.vy = -obj.vy;
      if (Number.isFinite(obj.angle)) obj.angle = normAngle(-obj.angle);
    }
  } else if (obj.x >= w) {
    obj.x -= w;
    if (mode === 'projective') {
      obj.y = h - obj.y;
      if (Number.isFinite(obj.vy)) obj.vy = -obj.vy;
      if (Number.isFinite(obj.angle)) obj.angle = normAngle(-obj.angle);
    }
  }

  // Y wrap second
  if (obj.y < 0) {
    obj.y += h;
    if (mode === 'klein' || mode === 'projective') {
      obj.x = w - obj.x;
      if (Number.isFinite(obj.vx)) obj.vx = -obj.vx;
      if (Number.isFinite(obj.angle)) obj.angle = normAngle(Math.PI - obj.angle);
    }
  } else if (obj.y >= h) {
    obj.y -= h;
    if (mode === 'klein' || mode === 'projective') {
      obj.x = w - obj.x;
      if (Number.isFinite(obj.vx)) obj.vx = -obj.vx;
      if (Number.isFinite(obj.angle)) obj.angle = normAngle(Math.PI - obj.angle);
    }
  }
}

export function newGameState({ w = 800, h = 600, now = Date.now() } = {}) {
  const state = {
    w,
    h,
    tick: 0,
    paused: true,
    reasonPaused: 'start',
    topology: 'regular', // 'regular' | 'klein' | 'projective'
    difficulty: 'easy', // 'easy' | 'medium' | 'hard'
    lastNow: now,
    // Spawn cadence is intentionally slow and capped by how many comets exist.
    nextCometAt: now + randRange(6500, 11000),
    bullets: [],
    comets: [],
    players: {
      1: basePlayer(1),
      2: basePlayer(2),
      3: basePlayer(3),
      4: basePlayer(4),
    },
  };

  return state;
}

export function basePlayer(id) {
  const defaults = ['#ff4d4d', '#4da6ff', '#a78bfa', '#ffd24d', '#4dff4d', '#ff7a18'];
  const defaultShapes = ['triangle', 'rocket', 'ufo', 'enterprise'];
  return {
    id,
    connected: false,
    name: '',
    color: defaults[(id - 1) % defaults.length],
    shape: defaultShapes[id - 1] ?? 'triangle',
    state: 'WAITING',
    paused: true,
    respawnAt: null,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    input: { turn: 0, thrust: false, brake: false, shoot: false },
    shootCooldownMs: 0,
  };
}

function placePlayer(state, pid) {
  const p = state.players[pid];
  const pad = 60;
  if (pid === 1) {
    p.x = pad;
    p.y = pad;
    p.angle = 0;
  } else if (pid === 2) {
    p.x = state.w - pad;
    p.y = state.h - pad;
    p.angle = Math.PI;
  } else if (pid === 3) {
    p.x = pad;
    p.y = state.h - pad;
    p.angle = 0;
  } else {
    p.x = state.w - pad;
    p.y = pad;
    p.angle = Math.PI;
  }
  p.vx = 0;
  p.vy = 0;
}

export function setPlayerConnected(state, playerId, connected) {
  const p = state.players[playerId];
  p.connected = connected;
  if (connected) {
    p.paused = true;
    if (p.state === 'WAITING') {
      p.state = 'ALIVE';
      placePlayer(state, playerId);
    }
  } else {
    p.state = 'WAITING';
    p.paused = true;
    p.vx = 0;
    p.vy = 0;
  }
}

export function togglePause(state, playerId) {
  if (!playerId) return;
  const p = state.players[playerId];
  p.paused = !p.paused;

  // Any interaction clears the system-level start pause.
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

export function newGame(state, now = Date.now()) {
  const fresh = newGameState({ w: state.w, h: state.h, now });
  fresh.difficulty = difficultyKey(state);
  // Preserve connections + names/colors
  for (const pid of [1, 2, 3, 4]) {
    fresh.players[pid].connected = state.players[pid].connected;
    fresh.players[pid].name = state.players[pid].name;
    fresh.players[pid].color = state.players[pid].color;
    // Back-compat: older clients used 'xwing' and 'sts' for the shuttle silhouette.
    // STS is no longer selectable; map legacy values to 'rocket'.
    const prevShape = String(state.players[pid].shape ?? '').toLowerCase();
    fresh.players[pid].shape = (prevShape === 'xwing' || prevShape === 'sts') ? 'rocket' : state.players[pid].shape;
    if (fresh.players[pid].connected) {
      fresh.players[pid].state = 'ALIVE';
      fresh.players[pid].paused = true;
      placePlayer(fresh, pid);
    }
  }
  return fresh;
}

export function setTopology(state, topology) {
  if (!['regular', 'klein', 'projective'].includes(topology)) return false;
  state.topology = topology;
  return true;
}

export function setDifficulty(state, difficulty) {
  const d = String(difficulty ?? '').toLowerCase();
  if (!['easy', 'medium', 'hard'].includes(d)) return false;
  state.difficulty = d;
  return true;
}

export function trySelectColor(state, playerId, color) {
  if (!playerId) return false;
  const p = state.players[playerId];
  if (!p) return false;
  if (typeof color !== 'string') return false;
  const c = color.trim();
  if (!/^#([0-9a-fA-F]{6})$/.test(c)) return false;
  const allowed = new Set([
    '#ff4d4d', // red
    '#4da6ff', // blue
    '#a78bfa', // purple
    '#ffd24d', // yellow
    '#4dff4d', // green
    '#ff7a18', // orange
  ]);
  const normalized = c.toLowerCase();
  if (!allowed.has(normalized)) return false;
  p.color = normalized;
  return true;
}

export function trySelectShape(state, playerId, shape) {
  if (!playerId) return false;
  const p = state.players[playerId];
  if (!p) return false;
  if (typeof shape !== 'string') return false;
  const s0 = shape.trim().toLowerCase();

  // Back-compat: older clients used 'xwing'/'sts' for a shuttle silhouette.
  // STS is no longer selectable; map legacy values to 'rocket'.
  const s = (s0 === 'xwing' || s0 === 'sts') ? 'rocket' : s0;
  const allowed = new Set(['triangle', 'rocket', 'ufo', 'tie', 'enterprise']);
  if (!allowed.has(s)) return false;
  p.shape = s;
  return true;
}

export function applyInput(state, playerId, input) {
  const p = state.players[playerId];
  if (!p || p.state !== 'ALIVE') return;

  const turn = clamp(Number(input?.turn ?? 0), -1, 1);
  p.input.turn = turn;
  p.input.thrust = Boolean(input?.thrust);
  p.input.brake = Boolean(input?.brake);
  p.input.shoot = Boolean(input?.shoot);
}

function spawnBullet(state, p) {
  const BULLET_SPEED = 240; // px/s
  const BULLET_LIFE_MS = difficultyParams(state).bulletLifeMs;

  const dirX = Math.cos(p.angle);
  const dirY = Math.sin(p.angle);

  const x = p.x + dirX * 16;
  const y = p.y + dirY * 16;

  state.bullets.push({
    id: `${state.tick}-${p.id}-${randInt(1e9)}`,
    owner: p.id,
    x,
    y,
    vx: p.vx + dirX * BULLET_SPEED,
    vy: p.vy + dirY * BULLET_SPEED,
    bornAt: state.lastNow,
    lifeMs: BULLET_LIFE_MS,
  });
}

function cometRadius(size) {
  // size=2: biggest (first hit splits)
  // size=1: big (second hit splits)
  // size=0: fragments (third hit destroys)
  if (size >= 2) return 38;
  if (size === 1) return 28;
  return 16;
}

function spawnComet(state, now) {
  const size = difficultyParams(state).initialCometSize;
  const edge = randInt(4);

  const speed = randRange(55, 90);

  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;

  if (edge === 0) {
    // top
    x = randRange(0, state.w);
    y = -10;
    vx = randRange(-0.4, 0.4) * speed;
    vy = speed;
  } else if (edge === 1) {
    // bottom
    x = randRange(0, state.w);
    y = state.h + 10;
    vx = randRange(-0.4, 0.4) * speed;
    vy = -speed;
  } else if (edge === 2) {
    // left
    x = -10;
    y = randRange(0, state.h);
    vx = speed;
    vy = randRange(-0.4, 0.4) * speed;
  } else {
    // right
    x = state.w + 10;
    y = randRange(0, state.h);
    vx = -speed;
    vy = randRange(-0.4, 0.4) * speed;
  }

  state.comets.push({
    id: `${now}-${randInt(1e9)}`,
    seed: randInt(1e9),
    size,
    x,
    y,
    vx,
    vy,
  });
}

function splitComet(state, comet) {
  const nextSize = comet.size - 1;
  if (nextSize < 0) return [];

  const baseSpeed = Math.hypot(comet.vx, comet.vy);
  const speed = clamp(baseSpeed * 1.15, 50, 140);
  const baseAngle = Math.atan2(comet.vy, comet.vx);

  const child = (sign) => {
    const a = baseAngle + sign * randRange(0.35, 0.7);
    return {
      id: `${state.tick}-${randInt(1e9)}`,
      seed: randInt(1e9),
      size: nextSize,
      x: comet.x + Math.cos(a) * 6,
      y: comet.y + Math.sin(a) * 6,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
    };
  };

  return [child(1), child(-1)];
}

export function step(state, now = Date.now()) {
  if (state.paused) {
    state.lastNow = now;
    return;
  }

  const prevNow = Number.isFinite(state.lastNow) ? state.lastNow : now;
  state.lastNow = now;

  const dt = clamp((now - prevNow) / 1000, 0.01, 0.1);
  state.tick++;

  // Spawn comets occasionally, but cap count.
  const MAX_COMETS = 4;
  if (now >= (state.nextCometAt ?? 0)) {
    if ((state.comets?.length ?? 0) < MAX_COMETS) {
      spawnComet(state, now);
      const dp = difficultyParams(state);
      state.nextCometAt = now + randRange(dp.cometSpawnMinMs, dp.cometSpawnMaxMs);
    } else {
      // Try again soon; do not exceed cap until some are destroyed.
      state.nextCometAt = now + 2000;
    }
  }

  // Handle hard-mode auto-respawn timers.
  for (const pid of [1, 2, 3, 4]) {
    const p = state.players?.[pid];
    if (!p || !p.connected) continue;
    if (p.state !== 'WAITING' || !Number.isFinite(p.respawnAt)) continue;
    if (now < p.respawnAt) continue;

    const spot = tryFindSafeSpawn(state);
    if (spot) {
      p.x = spot.x;
      p.y = spot.y;
    } else {
      // Fallback: deterministic corner placement.
      placePlayer(state, pid);
    }

    p.vx = 0;
    p.vy = 0;
    p.angle = randRange(-Math.PI, Math.PI);
    p.state = 'ALIVE';
    p.paused = false;
    p.respawnAt = null;
    p.shootCooldownMs = 0;
  }

  // Update players
  const dp = difficultyParams(state);
  const TURN_RATE = 1.35 * dp.shipTurnMult; // rad/s
  const THRUST = 45 * dp.shipThrustMult; // px/s^2
  const REVERSE = 45 * dp.shipReverseMult; // px/s^2
  // Signed speed bounds along the ship's facing direction.
  // Forward max is SPEED_MAX; reverse max is |SPEED_MIN|.
  const SPEED_MAX = 220; // px/s
  const SPEED_MIN = -220; // px/s
  // Overall velocity magnitude is also capped to avoid runaway diagonals.
  const SPEED_CAP = Math.max(Math.abs(SPEED_MAX), Math.abs(SPEED_MIN));

  for (const pid of [1, 2, 3, 4]) {
    const p = state.players[pid];
    if (!p || p.state !== 'ALIVE') continue;

    // Cooldown always decays (even if paused individually).
    p.shootCooldownMs = Math.max(0, (p.shootCooldownMs ?? 0) - (dt * 1000));

    if (p.paused) continue;

    const turn = clamp(Number(p.input?.turn ?? 0), -1, 1);
    p.angle = normAngle(p.angle + (turn * TURN_RATE * dt));

    // No damping: pure inertial integration.
    // Apply acceleration, but only the component that keeps speed within bounds.
    const fx = Math.cos(p.angle);
    const fy = Math.sin(p.angle);

    let dvx = 0;
    let dvy = 0;

    if (p.input?.thrust) {
      dvx += fx * THRUST * dt;
      dvy += fy * THRUST * dt;
    }
    if (p.input?.brake) {
      dvx -= fx * REVERSE * dt;
      dvy -= fy * REVERSE * dt;
    }

    // Signed clamp along facing direction.
    const signedSpeed = p.vx * fx + p.vy * fy;
    const dvForward = dvx * fx + dvy * fy;
    if (signedSpeed >= SPEED_MAX && dvForward > 0) {
      dvx -= dvForward * fx;
      dvy -= dvForward * fy;
    } else if (signedSpeed <= SPEED_MIN && dvForward < 0) {
      dvx -= dvForward * fx;
      dvy -= dvForward * fy;
    }

    // At the speed cap, allow tangential acceleration (turning) but disallow
    // outward acceleration that would increase |v|.
    const sp = Math.hypot(p.vx, p.vy);
    if (sp >= SPEED_CAP * 0.999) {
      const vhatX = p.vx / sp;
      const vhatY = p.vy / sp;
      const dvAlongV = dvx * vhatX + dvy * vhatY;
      if (dvAlongV > 0) {
        dvx -= dvAlongV * vhatX;
        dvy -= dvAlongV * vhatY;
      }
    }
    p.vx += dvx;
    p.vy += dvy;

    // Hard safety clamp (handles numeric drift / weirdness).
    ({ vx: p.vx, vy: p.vy } = clampVelocityToSpeedCap(p.vx, p.vy, SPEED_CAP));

    // Integrate
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    applyWrap(p, state.w, state.h, state.topology);

    // Shoot
    if (p.input?.shoot && p.shootCooldownMs <= 0) {
      spawnBullet(state, p);
      p.shootCooldownMs = dp.bulletCooldownMs;
    }
  }

  // Update bullets
  const bullets = [];
  for (const b of state.bullets) {
    const age = now - b.bornAt;
    if (age >= b.lifeMs) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    applyWrap(b, state.w, state.h, state.topology);
    bullets.push(b);
  }
  state.bullets = bullets;

  // Update comets
  for (const c of state.comets) {
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    applyWrap(c, state.w, state.h, state.topology);
  }

  // Hard: ship vs comet collisions (lethal).
  if (dp.shipCometCollision) {
    const SHIP_R = 14;
    for (const pid of [1, 2, 3, 4]) {
      const p = state.players?.[pid];
      if (!p || !p.connected || p.state !== 'ALIVE') continue;
      if (p.paused) continue;

      let crashed = false;
      for (const c of state.comets ?? []) {
        const r = cometRadius(c.size) + SHIP_R;
        const dx = wrappedDelta(p.x - c.x, state.w);
        const dy = wrappedDelta(p.y - c.y, state.h);
        if ((dx * dx + dy * dy) <= (r * r)) {
          crashed = true;
          break;
        }
      }

      if (crashed) {
        p.state = 'WAITING';
        p.respawnAt = now + 3000;
        p.vx = 0;
        p.vy = 0;
        p.shootCooldownMs = 0;
        // Prevent stuck shooting when coming back.
        if (p.input) p.input.shoot = false;
      }
    }
  }

  // Bullet vs comet hits
  const remainingBullets = [];
  const remainingComets = [];

  for (const c of state.comets) {
    remainingComets.push(c);
  }

  for (const b of state.bullets) {
    let hitIndex = -1;
    for (let i = 0; i < remainingComets.length; i++) {
      const c = remainingComets[i];
      const r = cometRadius(c.size);
      const dx = b.x - c.x;
      const dy = b.y - c.y;
      if ((dx * dx + dy * dy) <= (r * r)) {
        hitIndex = i;
        break;
      }
    }

    if (hitIndex >= 0) {
      const hit = remainingComets.splice(hitIndex, 1)[0];
      if (hit.size > 0) {
        remainingComets.push(...splitComet(state, hit));
      }
      // bullet consumed
      continue;
    }

    remainingBullets.push(b);
  }

  state.bullets = remainingBullets;
  state.comets = remainingComets;
}
