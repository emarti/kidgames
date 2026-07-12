const TEAMS = ['red', 'white', 'blue', 'yellow'];
const ROLES = ['submarine', 'destroyer'];
const VISIBILITY_MODES = ['clear', 'low'];

const TEAM_COLORS = {
  red: '#ff4d4d',
  white: '#f8fafc',
  blue: '#4d94ff',
  yellow: '#ffd24d',
};

const DEFAULT_ROLES = {
  1: 'submarine',
  2: 'destroyer',
  3: 'submarine',
  4: 'destroyer',
};

const DEFAULT_TEAMS = {
  1: 'red',
  2: 'blue',
  3: 'white',
  4: 'yellow',
};

export const WORLD = {
  w: 1200,
  h: 800,
  waterlineY: 160,
  vehicleLength: 200,
  floor: {
    enabled: true,
    baselineY: 724,
    ridges: [
      { x: 0, y: 748 },
      { x: 120, y: 735 },
      { x: 250, y: 742 },
      { x: 380, y: 716 },
      { x: 530, y: 730 },
      { x: 690, y: 704 },
      { x: 850, y: 728 },
      { x: 1000, y: 712 },
      { x: 1120, y: 734 },
      { x: 1200, y: 724 },
    ],
    vents: [
      { x: 338, y: 716, h: 38 },
      { x: 920, y: 716, h: 28 },
    ],
    volcanoes: [
      { x: 684, y: 704, w: 96, h: 68 },
    ],
    collision: false,
    hazards: false,
  },
};

const TICK_MS = 50;
const DT = TICK_MS / 1000;
const BOAT_Y = WORLD.waterlineY + 8;
const SUB_MIN_Y = WORLD.waterlineY + 84;
const SUB_MAX_Y = WORLD.h - 55;
const PERISCOPE_VISUAL_RANGE = WORLD.w / 2;

const BOAT = {
  accel: 135,
  maxSpeed: 142,
  damping: 0.945,
};

const SUB = {
  surfacedY: SUB_MIN_Y,
  surfaceBand: 90,
  accelSurfaced: 125,
  accelSubmerged: 72,
  maxSurfaced: 130,
  maxSubmerged: 78,
  damping: 0.955,
  diveAccel: 46,
  periscopeDiveBoost: 2.2,
  maxDiveSpeed: 68,
  verticalDamping: 0.94,
};

const BUBBLE_LIFE_MS = 1200;
const MAX_BUBBLES = 80;
const HIT_RESET_MS = 3000;
const HIT_EFFECT_LIFE_MS = 1400;

const TORPEDO = {
  speed: 118,
  lifeMs: 9000,
  reloadMs: 3600,
  hitRadius: 26,
  spawnOffset: 96,
};

const DEPTH_CHARGE = {
  sinkSpeed: 52,
  inheritedVx: 0.35,
  lifeMs: 10500,
  reloadMs: 4200,
  hitRadius: 58,
  spawnOffset: 34,
};

const SONAR = {
  cooldownMs: 9500,
  revealMs: 2500,
  pulseLifeMs: 1800,
  maxRadius: 420,
};

const MISSILE = {
  riseSpeed: 96,
  lifeMs: 7000,
  reloadMs: 5500,
  spawnOffsetY: 28,
  surfaceY: WORLD.waterlineY + 10,
  blastRadius: 92,
  blastLifeMs: 850,
};

const PASSIVE_SONAR = {
  seaNoiseDb: 6,
  thresholdDb: 9,
  fadeDb: 20,
  speedNoiseDb: 50,
  destroyerSpeedBonusDb: 7,
  surfacedSubBonusDb: 2,
  submarineListenerBonusDb: 2.4,
  closeRange: WORLD.vehicleLength * 0.75,
  closeStrength: 0.24,
  closeBonus: 0.18,
  firingNoiseDb: 34,
  bubbleNoiseDb: 10,
  hitNoiseDb: 28,
};

function spawnForPlayer(playerId, role = DEFAULT_ROLES[playerId] ?? 'submarine') {
  const normalizedRole = normalizeRole(role);
  const lane = Number(playerId) - 1;
  const x = 220 + lane * 250;
  const y = normalizedRole === 'destroyer' ? BOAT_Y : WORLD.waterlineY + 190 + (lane % 2) * 130;
  return {
    x,
    y,
    heading: normalizedRole === 'destroyer' ? 0 : Math.PI,
  };
}

function makePlayer(playerId) {
  const role = DEFAULT_ROLES[playerId] ?? 'submarine';
  const team = DEFAULT_TEAMS[playerId] ?? TEAMS[(playerId - 1) % TEAMS.length];
  const spawn = spawnForPlayer(playerId, role);
  return {
    id: playerId,
    connected: false,
    paused: true,
    role,
    team,
    color: TEAM_COLORS[team],
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    heading: spawn.heading,
    resettingUntil: 0,
    fireReadyAt: 0,
    sonarReadyAt: 0,
    missileReadyAt: 0,
    lastFireInput: false,
    lastSonarInput: false,
    lastAltFireInput: false,
    noisyUntil: 0,
    lastNoise: null,
    input: {
      throttle: 0,
      turn: 0,
      dive: 0,
      fire: false,
      altFire: false,
      sonar: false,
    },
  };
}

export function newGameState() {
  const state = {
    tick: 0,
    paused: true,
    reasonPaused: 'start',
    visibilityMode: 'clear',
    world: { ...WORLD },
    teams: [...TEAMS],
    roles: [...ROLES],
    teamColors: { ...TEAM_COLORS },
    players: {
      1: makePlayer(1),
      2: makePlayer(2),
      3: makePlayer(3),
      4: makePlayer(4),
    },
    torpedoes: [],
    depthCharges: [],
    missiles: [],
    pulses: [],
    bubbles: [],
    hitEffects: [],
    visibility: makeVisibilityState('clear'),
    nextEntityId: 1,
  };
  updateVisibility(state);
  return state;
}

export function setPlayerConnected(state, playerId, connected) {
  const player = state.players[playerId];
  if (!player) return;
  player.connected = Boolean(connected);
  if (connected) player.paused = true;
  player.input = makePlayer(playerId).input;
  player.lastFireInput = false;
  player.lastSonarInput = false;
  player.lastAltFireInput = false;
  player.noisyUntil = 0;
  player.lastNoise = null;
}

export function resumeGame(state, playerId) {
  const player = state.players[playerId];
  if (player) player.paused = false;
  state.paused = false;
  state.reasonPaused = null;
}

export function pauseGame(state, playerId) {
  const player = state.players[playerId];
  if (player) player.paused = true;
  state.paused = true;
  state.reasonPaused = 'paused';
}

export function restart(state) {
  const previousPlayers = state.players;
  const previousVisibilityMode = state.visibilityMode;
  const fresh = newGameState();
  fresh.visibilityMode = VISIBILITY_MODES.includes(previousVisibilityMode) ? previousVisibilityMode : fresh.visibilityMode;
  for (const pid of [1, 2, 3, 4]) {
    const prev = previousPlayers[pid];
    const next = fresh.players[pid];
    next.connected = Boolean(prev.connected);
    next.paused = prev.paused ?? true;
    next.role = normalizeRole(prev.role);
    next.team = prev.team;
    next.color = TEAM_COLORS[next.team] ?? next.color;
    const spawn = spawnForPlayer(pid, next.role);
    next.x = spawn.x;
    next.y = spawn.y;
    next.heading = spawn.heading;
    next.fireReadyAt = 0;
    next.sonarReadyAt = 0;
    next.missileReadyAt = 0;
    next.lastFireInput = false;
    next.lastSonarInput = false;
    next.lastAltFireInput = false;
    next.noisyUntil = 0;
    next.lastNoise = null;
  }
  Object.assign(state, fresh);
  updateVisibility(state);
}

export function selectRole(state, playerId, role) {
  const normalizedRole = normalizeRole(role);
  if (!ROLES.includes(normalizedRole)) return false;
  const player = state.players[playerId];
  if (!player) return false;
  player.role = normalizedRole;
  const spawn = spawnForPlayer(playerId, normalizedRole);
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.heading = spawn.heading;
  player.resettingUntil = 0;
  player.fireReadyAt = 0;
  player.sonarReadyAt = 0;
  player.missileReadyAt = 0;
  player.lastFireInput = false;
  player.lastSonarInput = false;
  player.lastAltFireInput = false;
  player.noisyUntil = 0;
  player.lastNoise = null;
  player.input = makePlayer(playerId).input;
  updateVisibility(state);
  return true;
}

export function selectVisibilityMode(state, mode) {
  if (!VISIBILITY_MODES.includes(mode)) return false;
  state.visibilityMode = mode;
  updateVisibility(state);
  return true;
}

export function selectTeam(state, playerId, team) {
  if (!TEAMS.includes(team)) return false;
  const player = state.players[playerId];
  if (!player) return false;
  player.team = team;
  player.color = TEAM_COLORS[team];
  updateVisibility(state);
  return true;
}

export function applyInput(state, playerId, input = {}) {
  const player = state.players[playerId];
  if (!player) return false;
  player.input = {
    throttle: clampNumber(input.throttle, -1, 1, 0),
    turn: clampNumber(input.turn, -1, 1, 0),
    dive: clampNumber(input.dive, -1, 1, 0),
    fire: Boolean(input.fire),
    altFire: Boolean(input.altFire),
    sonar: Boolean(input.sonar),
  };
  return true;
}

export function step(state, now = Date.now()) {
  state.tick += 1;
  if (!state.paused) {
    for (const player of Object.values(state.players)) {
      if (!player.connected || player.paused) continue;
      if (stepReset(state, player, now)) continue;
      if (player.role === 'destroyer') {
        stepBoat(player);
      } else {
        stepSubmarine(state, player, now);
      }
      handleFireInput(state, player, now);
      handleAltFireInput(state, player, now);
      handleSonarInput(state, player, now);
    }
    stepWeapons(state, now);
  }
  stepBubbles(state, now);
  stepHitEffects(state, now);
  stepPulses(state, now);
  updateVisibility(state, now);
  return true;
}

function normalizeRole(role) {
  if (role === 'boat' || role === 'ship') return 'destroyer';
  return role;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function stepBoat(player) {
  const input = player.input ?? {};
  const throttle = clampNumber(input.throttle, -1, 1, 0);
  player.vx += throttle * BOAT.accel * DT;
  player.vx *= BOAT.damping;
  player.vx = clampNumber(player.vx, -BOAT.maxSpeed, BOAT.maxSpeed, 0);
  player.vy = 0;
  if (Math.abs(player.vx) > 4) player.heading = player.vx >= 0 ? 0 : Math.PI;

  player.x += player.vx * DT;
  player.y = BOAT_Y;
  clampToWorld(player, WORLD.vehicleLength * 0.5, true);
}

function stepSubmarine(state, player, now) {
  const input = player.input ?? {};
  const surfacedAmount = 1 - clampNumber((player.y - SUB.surfacedY) / SUB.surfaceBand, 0, 1, 1);
  const maxSpeed = lerp(SUB.maxSubmerged, SUB.maxSurfaced, surfacedAmount);
  const moveAccel = lerp(SUB.accelSubmerged, SUB.accelSurfaced, surfacedAmount);

  const throttle = clampNumber(input.throttle, -1, 1, 0);
  player.vx += throttle * moveAccel * DT;
  player.vx *= SUB.damping;
  player.vx = clampNumber(player.vx, -maxSpeed, maxSpeed, 0);
  if (Math.abs(player.vx) > 4) player.heading = player.vx >= 0 ? 0 : Math.PI;

  const dive = clampNumber(input.dive, -1, 1, 0);
  const diveBoost = dive > 0 && isAtPeriscopeDepth(player) ? SUB.periscopeDiveBoost : 1;
  player.vy += dive * SUB.diveAccel * diveBoost * DT;
  player.vy *= SUB.verticalDamping;
  player.vy = clampNumber(player.vy, -SUB.maxDiveSpeed, SUB.maxDiveSpeed, 0);

  player.x += player.vx * DT;
  player.y += player.vy * DT;
  clampToWorld(player, WORLD.vehicleLength * 0.5, false);

  if (Math.abs(dive) > 0.15 && state.tick % 3 === 0) {
    addBubble(state, player, dive, now);
  }
}

function stepReset(state, player, now) {
  if (!player.resettingUntil) return false;
  player.vx = 0;
  player.vy = 0;
  player.input = makePlayer(player.id).input;
  player.lastFireInput = false;
  player.lastSonarInput = false;
  player.lastAltFireInput = false;
  if (now < player.resettingUntil) return true;

  respawnPlayer(player);
  player.resettingUntil = 0;
  player.fireReadyAt = now + 900;
  player.sonarReadyAt = now + 900;
  player.missileReadyAt = now + 900;
  return false;
}

function respawnPlayer(player) {
  const spawn = randomSpawnForRole(player.role);
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.heading = spawn.heading;
}

function randomSpawnForRole(role) {
  const normalizedRole = normalizeRole(role);
  const margin = WORLD.vehicleLength * 0.5;
  const x = margin + Math.random() * Math.max(1, WORLD.w - margin * 2);
  const heading = Math.random() < 0.5 ? 0 : Math.PI;
  if (normalizedRole === 'destroyer') {
    return { x, y: BOAT_Y, heading };
  }
  return {
    x,
    y: SUB_MIN_Y + Math.random() * Math.max(1, SUB_MAX_Y - SUB_MIN_Y - 30),
    heading,
  };
}

function handleFireInput(state, player, now) {
  const wantsFire = Boolean(player.input?.fire);
  const isNewPress = wantsFire && !player.lastFireInput;
  player.lastFireInput = wantsFire;
  if (!isNewPress || now < (player.fireReadyAt ?? 0)) return;

  if (player.role === 'destroyer') {
    spawnDepthCharge(state, player, now);
    player.fireReadyAt = now + DEPTH_CHARGE.reloadMs;
  } else {
    spawnTorpedo(state, player, now);
    player.fireReadyAt = now + TORPEDO.reloadMs;
  }
  markNoisy(player, now, 1800, 'fire');
}

function handleAltFireInput(state, player, now) {
  const wantsAltFire = Boolean(player.input?.altFire);
  const isNewPress = wantsAltFire && !player.lastAltFireInput;
  player.lastAltFireInput = wantsAltFire;
  if (player.role !== 'submarine') return;
  if (!isNewPress || now < (player.missileReadyAt ?? 0)) return;

  spawnMissile(state, player, now);
  player.missileReadyAt = now + MISSILE.reloadMs;
  markNoisy(player, now, 1800, 'missile');
}

function handleSonarInput(state, player, now) {
  const wantsSonar = Boolean(player.input?.sonar);
  const isNewPress = wantsSonar && !player.lastSonarInput;
  player.lastSonarInput = wantsSonar;
  if (!isNewPress || now < (player.sonarReadyAt ?? 0)) return;

  state.pulses.push({
    id: nextEntityId(state, 'p'),
    owner: player.id,
    team: player.team,
    x: player.x,
    y: player.y,
    bornAt: now,
    lifeMs: SONAR.pulseLifeMs,
    revealUntil: now + SONAR.revealMs,
    maxRadius: SONAR.maxRadius,
  });
  player.sonarReadyAt = now + SONAR.cooldownMs;
}

function spawnTorpedo(state, player, now) {
  const dir = Math.cos(player.heading ?? 0) >= 0 ? 1 : -1;
  state.torpedoes.push({
    id: nextEntityId(state, 't'),
    owner: player.id,
    team: player.team,
    x: player.x + dir * TORPEDO.spawnOffset,
    y: player.y,
    vx: dir * TORPEDO.speed,
    vy: 0,
    heading: dir >= 0 ? 0 : Math.PI,
    radius: TORPEDO.hitRadius,
    bornAt: now,
    lifeMs: TORPEDO.lifeMs,
  });
}

function spawnDepthCharge(state, player, now) {
  const dir = Math.cos(player.heading ?? 0) >= 0 ? 1 : -1;
  state.depthCharges.push({
    id: nextEntityId(state, 'd'),
    owner: player.id,
    team: player.team,
    x: player.x - dir * DEPTH_CHARGE.spawnOffset,
    y: player.y + 16,
    vx: player.vx * DEPTH_CHARGE.inheritedVx,
    vy: DEPTH_CHARGE.sinkSpeed,
    radius: DEPTH_CHARGE.hitRadius,
    bornAt: now,
    lifeMs: DEPTH_CHARGE.lifeMs,
  });
}

function spawnMissile(state, player, now) {
  if (!Array.isArray(state.missiles)) state.missiles = [];
  state.missiles.push({
    id: nextEntityId(state, 'm'),
    owner: player.id,
    team: player.team,
    x: player.x,
    y: player.y - MISSILE.spawnOffsetY,
    vx: 0,
    vy: -MISSILE.riseSpeed,
    phase: 'rise',
    radius: 18,
    blastRadius: MISSILE.blastRadius,
    bornAt: now,
    lifeMs: MISSILE.lifeMs,
  });
}

function stepWeapons(state, now) {
  state.torpedoes = stepProjectileList(state, state.torpedoes, now, 'submarine');
  state.depthCharges = stepProjectileList(state, state.depthCharges, now, 'submarine');
  state.missiles = stepMissiles(state, state.missiles ?? [], now);
}

function stepMissiles(state, missiles, now) {
  const live = [];
  for (const missile of missiles) {
    if (missile.phase === 'blast') {
      if (now - missile.explodedAt < MISSILE.blastLifeMs) live.push(missile);
      continue;
    }

    const age = now - missile.bornAt;
    if (age >= missile.lifeMs) continue;

    missile.y += missile.vy * DT;
    if (missile.y <= MISSILE.surfaceY) {
      missile.y = MISSILE.surfaceY;
      missile.vy = 0;
      missile.phase = 'blast';
      missile.explodedAt = now;
      missile.radius = MISSILE.blastRadius;
      hitMissileTargets(state, missile, now);
      live.push(missile);
      continue;
    }

    if (missile.y < -80 || missile.y > WORLD.h + 80) continue;
    live.push(missile);
  }
  return live;
}

function hitMissileTargets(state, missile, now) {
  for (const target of Object.values(state.players)) {
    if (!target.connected || target.paused || target.resettingUntil) continue;
    if (target.id === missile.owner || target.team === missile.team) continue;
    if (normalizeRole(target.role) !== 'destroyer') continue;
    if (projectileHitsTarget(missile, target)) {
      hitPlayer(state, target, missile, now);
    }
  }
}

function stepProjectileList(state, projectiles, now, targetRole) {
  const live = [];
  for (const projectile of projectiles) {
    const age = now - projectile.bornAt;
    if (age >= projectile.lifeMs) continue;

    projectile.x += projectile.vx * DT;
    projectile.y += projectile.vy * DT;
    if (projectile.x < -80 || projectile.x > WORLD.w + 80 || projectile.y < -80 || projectile.y > WORLD.h + 80) continue;

    const target = findHitTarget(state, projectile, targetRole);
    if (target) {
      hitPlayer(state, target, projectile, now);
      continue;
    }

    live.push(projectile);
  }
  return live;
}

function findHitTarget(state, projectile, targetRole) {
  const targetRoles = Array.isArray(targetRole) ? targetRole : [targetRole];
  for (const target of Object.values(state.players)) {
    if (!target.connected || target.paused || target.resettingUntil) continue;
    if (target.id === projectile.owner || target.team === projectile.team) continue;
    if (!targetRoles.includes(normalizeRole(target.role))) continue;

    if (projectileHitsTarget(projectile, target)) return target;
  }
  return null;
}

function projectileHitsTarget(projectile, target) {
  const size = targetHitSize(target);
  const hitRadius = projectile.radius ?? 30;
  const heading = target.heading ?? 0;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const dx = projectile.x - target.x;
  const dy = projectile.y - target.y;
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  const outsideX = Math.max(Math.abs(localX) - size.halfLength, 0);
  const outsideY = Math.max(Math.abs(localY) - size.halfHeight, 0);
  return outsideX * outsideX + outsideY * outsideY <= hitRadius * hitRadius;
}

function targetHitSize(target) {
  if (normalizeRole(target.role) === 'destroyer') {
    return { halfLength: 72, halfHeight: 15 };
  }
  return { halfLength: 72, halfHeight: 18 };
}

function hitPlayer(state, target, projectile, now) {
  state.hitEffects.push({
    id: nextEntityId(state, 'h'),
    targetId: target.id,
    owner: projectile.owner,
    x: target.x,
    y: target.y,
    team: target.team,
    bornAt: now,
    lifeMs: HIT_EFFECT_LIFE_MS,
  });
  target.resettingUntil = now + HIT_RESET_MS;
  target.vx = 0;
  target.vy = 0;
  target.input = makePlayer(target.id).input;
  target.lastFireInput = false;
  target.lastSonarInput = false;
  target.lastAltFireInput = false;
  markNoisy(target, now, HIT_RESET_MS, 'hit');
}

function stepHitEffects(state, now) {
  state.hitEffects = state.hitEffects.filter((effect) => now - effect.bornAt < effect.lifeMs);
}

function stepPulses(state, now) {
  state.pulses = state.pulses.filter((pulse) => now - pulse.bornAt < pulse.lifeMs || now < pulse.revealUntil);
}

function clampToWorld(player, margin, boat) {
  if (player.x < margin) {
    player.x = margin;
    player.vx = Math.max(0, player.vx);
  } else if (player.x > WORLD.w - margin) {
    player.x = WORLD.w - margin;
    player.vx = Math.min(0, player.vx);
  }

  if (boat) {
    player.y = BOAT_Y;
    player.vy = 0;
    return;
  }

  if (player.y < SUB_MIN_Y) {
    player.y = SUB_MIN_Y;
    player.vy = Math.max(0, player.vy);
  } else if (player.y > SUB_MAX_Y) {
    player.y = SUB_MAX_Y;
    player.vy = Math.min(0, player.vy);
  }
}

function addBubble(state, player, dive, now) {
  const blowingBallast = dive < -0.15;
  markNoisy(player, now, blowingBallast ? 900 : 450, blowingBallast ? 'ballast' : 'dive');
  const count = blowingBallast ? 3 : 1;
  for (let i = 0; i < count; i += 1) {
    state.bubbles.push({
      id: `${state.tick}-${player.id}-${i}-${state.bubbles.length}`,
      owner: player.id,
      x: player.x - Math.cos(player.heading) * (20 + i * 6),
      y: player.y + (Math.random() - 0.5) * 12,
      vx: (Math.random() - 0.5) * 12,
      vy: blowingBallast ? -24 - Math.random() * 18 : -10 - Math.random() * 12,
      radius: blowingBallast ? 5 + Math.random() * 4 : 3 + Math.random() * 3,
      bornAt: now,
      lifeMs: BUBBLE_LIFE_MS,
    });
  }
  if (state.bubbles.length > MAX_BUBBLES) {
    state.bubbles.splice(0, state.bubbles.length - MAX_BUBBLES);
  }
}

function stepBubbles(state, now) {
  const live = [];
  for (const bubble of state.bubbles) {
    const age = now - bubble.bornAt;
    if (age >= bubble.lifeMs) continue;
    bubble.x += bubble.vx * DT;
    bubble.y += bubble.vy * DT;
    bubble.vy -= 4 * DT;
    live.push(bubble);
  }
  state.bubbles = live;
}

function nextEntityId(state, prefix) {
  const id = state.nextEntityId ?? 1;
  state.nextEntityId = id + 1;
  return `${prefix}${id}`;
}

function markNoisy(player, now, durationMs, reason) {
  player.noisyUntil = Math.max(player.noisyUntil ?? 0, now + durationMs);
  player.lastNoise = reason;
}

function makeVisibilityState(mode) {
  const teams = {};
  for (const team of TEAMS) teams[team] = { contacts: {} };
  return { mode, teams };
}

function updateVisibility(state, now = Date.now()) {
  const visibility = makeVisibilityState(state.visibilityMode);
  const players = Object.values(state.players);

  for (const viewerTeam of TEAMS) {
    const contacts = visibility.teams[viewerTeam].contacts;
    for (const target of players) {
      if (!target.connected) continue;
      const strength = state.visibilityMode === 'low'
        ? teamContactStrength(state, players, viewerTeam, target, now)
        : 1;
      contacts[target.id] = {
        strength,
        level: contactLevel(strength),
      };
    }
  }

  state.visibility = visibility;
}

function teamContactStrength(state, players, viewerTeam, target, now) {
  if (target.team === viewerTeam) return 1;
  let best = activeSonarContactStrength(state, players, viewerTeam, target, now);
  for (const listener of players) {
    if (!listener.connected || listener.team !== viewerTeam || listener.id === target.id) continue;
    best = Math.max(best, passiveContactStrength(listener, target, now));
    best = Math.max(best, periscopeVisualContactStrength(listener, target));
  }
  return clampNumber(best, 0, 1, 0);
}

function activeSonarContactStrength(state, players, viewerTeam, target, now) {
  let best = 0;
  for (const pulse of state.pulses ?? []) {
    if (now >= (pulse.revealUntil ?? 0)) continue;
    const radius = pulse.maxRadius ?? SONAR.maxRadius;
    if (pulse.team === viewerTeam) {
      if (distanceBetween(pulse, target) <= radius) best = 1;
      continue;
    }
    if (target.id !== pulse.owner) continue;
    const enemyInRange = players.some((listener) => (
      listener.connected
      && listener.team === viewerTeam
      && distanceBetween(listener, pulse) <= radius
    ));
    if (enemyInRange) best = 1;
  }
  return best;
}

function passiveContactStrength(listener, target, now) {
  const dx = listener.x - target.x;
  const dy = listener.y - target.y;
  const rawDistance = Math.hypot(dx, dy);
  const listenerRole = normalizeRole(listener.role);
  const effectiveDistance = listenerRole === 'submarine' ? rawDistance * 0.88 : rawDistance;
  const distance = Math.max(WORLD.vehicleLength * 0.25, effectiveDistance);
  const sourceDb = targetSourceDb(target, now) + (listenerRole === 'submarine' ? PASSIVE_SONAR.submarineListenerBonusDb : 0);
  const transmissionLossDb = 20 * Math.log10(distance / WORLD.vehicleLength);
  const receivedDb = sourceDb - transmissionLossDb - PASSIVE_SONAR.seaNoiseDb;
  let strength = (receivedDb - PASSIVE_SONAR.thresholdDb) / PASSIVE_SONAR.fadeDb;
  if (rawDistance <= PASSIVE_SONAR.closeRange) {
    const closeT = 1 - rawDistance / PASSIVE_SONAR.closeRange;
    strength = Math.max(strength, PASSIVE_SONAR.closeStrength + closeT * PASSIVE_SONAR.closeBonus);
  }
  return clampNumber(strength, 0, 1, 0);
}

function periscopeVisualContactStrength(listener, target) {
  const listenerRole = normalizeRole(listener.role);
  const targetRole = normalizeRole(target.role);
  const distance = distanceBetween(listener, target);
  if (distance > PERISCOPE_VISUAL_RANGE) return 0;

  const subAtPeriscopeSeesDestroyer = listenerRole === 'submarine'
    && isAtPeriscopeDepth(listener)
    && targetRole === 'destroyer';
  const destroyerSeesPeriscopeSub = listenerRole === 'destroyer'
    && targetRole === 'submarine'
    && isAtPeriscopeDepth(target);
  if (!subAtPeriscopeSeesDestroyer && !destroyerSeesPeriscopeSub) return 0;

  const distanceT = clampNumber(distance / PERISCOPE_VISUAL_RANGE, 0, 1, 1);
  return 0.78 + (1 - distanceT) * 0.22;
}

function targetSourceDb(target, now) {
  const role = normalizeRole(target.role);
  const surfaced = isSurfaced(target);
  const speed = Math.hypot(target.vx ?? 0, target.vy ?? 0);
  const maxSpeed = role === 'destroyer'
    ? BOAT.maxSpeed
    : surfaced ? SUB.maxSurfaced : SUB.maxSubmerged;
  const speed01 = clampNumber(speed / Math.max(1, maxSpeed), 0, 1, 0);
  const roleSpeedBonus = role === 'destroyer'
    ? PASSIVE_SONAR.destroyerSpeedBonusDb * speed01
    : surfaced ? PASSIVE_SONAR.surfacedSubBonusDb * speed01 : 0;
  const speedNoise = PASSIVE_SONAR.speedNoiseDb * Math.pow(speed01, 1.45) + roleSpeedBonus;
  const eventNoise = (target.noisyUntil ?? 0) > now ? eventNoiseDb(target.lastNoise) : 0;
  return speedNoise + eventNoise;
}

function eventNoiseDb(reason) {
  if (reason === 'fire') return PASSIVE_SONAR.firingNoiseDb;
  if (reason === 'missile') return PASSIVE_SONAR.firingNoiseDb;
  if (reason === 'ballast' || reason === 'dive') return PASSIVE_SONAR.bubbleNoiseDb;
  if (reason === 'hit') return PASSIVE_SONAR.hitNoiseDb;
  return 0;
}

function distanceBetween(a, b) {
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
}

function isSurfaced(player) {
  return normalizeRole(player.role) === 'destroyer' || isAtPeriscopeDepth(player);
}

function isAtPeriscopeDepth(player) {
  return normalizeRole(player.role) === 'submarine' && player.y <= SUB.surfacedY + SUB.surfaceBand;
}

function contactLevel(strength) {
  if (strength < 0.2) return 'hidden';
  if (strength < 0.45) return 'ping';
  if (strength < 0.75) return 'shadow';
  return 'exact';
}

function normalizeAngle(angle) {
  let a = angle;
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
