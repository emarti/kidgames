const TEAMS = ['red', 'white', 'blue', 'yellow'];
const ROLES = ['submarine', 'destroyer'];
const VISIBILITY_MODES = ['clear', 'low'];
const PLAYER_IDS = [1, 2, 3, 4, 5, 6];
const RELOAD_OPTIONS_MS = [2000, 5000, 10000];
const DEFAULT_RELOAD_MS = 10000;

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
  5: 'submarine',
  6: 'destroyer',
};

const DEFAULT_TEAMS = {
  1: 'red',
  2: 'blue',
  3: 'white',
  4: 'yellow',
  5: 'red',
  6: 'blue',
};

export const WORLD = {
  w: 1800,
  h: 1200,
  waterlineY: 240,
  vehicleLength: 200,
  floor: {
    enabled: true,
    baselineY: 1086,
    ridges: [
      { x: 0, y: 1122 },
      { x: 180, y: 1102 },
      { x: 375, y: 1113 },
      { x: 570, y: 1074 },
      { x: 795, y: 1095 },
      { x: 1035, y: 1056 },
      { x: 1275, y: 1092 },
      { x: 1500, y: 1068 },
      { x: 1680, y: 1101 },
      { x: 1800, y: 1086 },
    ],
    vents: [
      { x: 507, y: 1074, h: 57 },
      { x: 1380, y: 1074, h: 42 },
    ],
    volcanoes: [
      { x: 1026, y: 1056, w: 144, h: 102 },
    ],
    collision: false,
    hazards: false,
  },
  scenery: {
    fishSchools: [
      { id: 'school-a', x: 230, y: 470, count: 9, spread: 82, dir: 1, speed: 10, color: '#b7f7ff' },
      { id: 'school-b', x: 1140, y: 615, count: 13, spread: 116, dir: -1, speed: 7, color: '#d8f3dc' },
      { id: 'school-c', x: 1580, y: 350, count: 7, spread: 72, dir: -1, speed: 12, color: '#fde68a' },
    ],
    fish: [
      { id: 'tuna-a', x: 650, y: 530, dir: 1, speed: 8, size: 1.1 },
      { id: 'tuna-b', x: 1320, y: 805, dir: -1, speed: 6, size: 0.9 },
      { id: 'tuna-c', x: 980, y: 430, dir: 1, speed: 5, size: 0.8 },
    ],
    mammals: [
      { id: 'dolphin-a', kind: 'dolphin', x: 420, y: 320, dir: 1, speed: 12, size: 1 },
      { id: 'whale-a', kind: 'spermWhale', x: 1460, y: 720, dir: -1, speed: 3, size: 1 },
    ],
    crabs: [
      { id: 'crab-a', x: 1180, y: 1080, dir: 1, size: 1 },
    ],
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
  accelSurfaced: 172,
  accelSubmerged: 99,
  maxSurfaced: 179,
  maxSubmerged: 108,
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
  hitRadius: 26,
  spawnOffset: 96,
  maxTravel: WORLD.w * 0.75,
};

const DEPTH_CHARGE = {
  sinkSpeed: 24,
  terminalSinkSpeed: 64,
  verticalApproach: 0.08,
  inheritedVx: 0.35,
  horizontalDamping: 0.88,
  lifeMs: 10500,
  hitRadius: 58,
  spawnOffset: 34,
};

const SONAR = {
  cooldownMs: 9500,
  revealMs: 2500,
  pulseLifeMs: 1800,
  maxRadius: 420,
  destroyerRadiusScale: 1.3,
};

const MISSILE = {
  riseSpeed: 96,
  lifeMs: 7000,
  spawnOffsetY: 28,
  surfaceY: WORLD.waterlineY + 10,
  blastRadius: 64,
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

const BOT = {
  difficulties: ['easy', 'normal'],
  thinkMinMs: 450,
  thinkJitterMs: 380,
  patrolMargin: WORLD.vehicleLength * 0.7,
  waypointReach: 55,
  confidentContact: 0.72,
  vagueContact: 0.45,
  sonarSearchStrength: 0.58,
  destroyerDropDx: 58,
  submarineFireDxMin: 95,
  submarineFireDxMax: 410,
  submarineFireDy: 36,
  missileDx: 70,
  missileAttackY: SUB_MIN_Y + 135,
  patrolDepths: [SUB_MIN_Y + 40, SUB_MIN_Y + 165, SUB_MAX_Y - 80],
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
  const role = DEFAULT_ROLES[playerId] ?? (playerId % 2 === 0 ? 'destroyer' : 'submarine');
  const team = DEFAULT_TEAMS[playerId] ?? TEAMS[(playerId - 1) % TEAMS.length];
  const spawn = spawnForPlayer(playerId, role);
  return {
    id: playerId,
    connected: false,
    bot: false,
    botDifficulty: null,
    botMode: 'patrol',
    botTargetId: null,
    botWaypointX: null,
    botWaypointY: null,
    botNextThinkAt: 0,
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
    respawnHidden: false,
    input: {
      throttle: 0,
      turn: 0,
      dive: 0,
      fire: false,
      torpedo: false,
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
    settings: {
      wrapX: true,
      showBubbles: true,
      reloadMs: DEFAULT_RELOAD_MS,
    },
    visibilityMode: 'low',
    world: { ...WORLD },
    teams: [...TEAMS],
    roles: [...ROLES],
    teamColors: { ...TEAM_COLORS },
    players: Object.fromEntries(PLAYER_IDS.map((pid) => [pid, makePlayer(pid)])),
    torpedoes: [],
    depthCharges: [],
    missiles: [],
    pulses: [],
    bubbles: [],
    hitEffects: [],
    visibility: makeVisibilityState('low'),
    nextEntityId: 1,
  };
  updateVisibility(state);
  return state;
}

export function setPlayerConnected(state, playerId, connected) {
  const player = state.players[playerId];
  if (!player) return;
  player.connected = Boolean(connected);
  clearBotState(player);
  if (connected) player.paused = true;
  player.input = makePlayer(playerId).input;
  player.lastFireInput = false;
  player.lastSonarInput = false;
  player.lastAltFireInput = false;
  player.noisyUntil = 0;
  player.lastNoise = null;
  player.respawnHidden = false;
  updatePauseState(state);
}

export function resumeGame(state, playerId) {
  const player = state.players[playerId];
  if (player) player.paused = false;
  updatePauseState(state);
}

export function pauseGame(state, playerId) {
  const player = state.players[playerId];
  if (player) player.paused = true;
  updatePauseState(state);
}

export function restart(state) {
  const previousPlayers = state.players;
  const previousVisibilityMode = state.visibilityMode;
  const previousSettings = state.settings;
  const fresh = newGameState();
  fresh.visibilityMode = VISIBILITY_MODES.includes(previousVisibilityMode) ? previousVisibilityMode : fresh.visibilityMode;
  fresh.settings = {
    wrapX: previousSettings?.wrapX !== false,
    showBubbles: previousSettings?.showBubbles !== false,
    reloadMs: normalizeReloadMs(previousSettings?.reloadMs),
  };
  for (const pid of PLAYER_IDS) {
    const prev = previousPlayers[pid];
    const next = fresh.players[pid];
    if (!prev || !next) continue;
    next.connected = Boolean(prev.connected);
    if (prev.bot) {
      next.bot = true;
      next.botDifficulty = normalizeDifficulty(prev.botDifficulty);
      next.botMode = prev.botMode ?? 'patrol';
      next.botTargetId = null;
      next.botWaypointX = prev.botWaypointX ?? null;
      next.botWaypointY = prev.botWaypointY ?? null;
      next.botNextThinkAt = 0;
    }
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
    next.respawnHidden = false;
  }
  Object.assign(state, fresh);
  updatePauseState(state);
  updateVisibility(state);
}

export function claimHumanSlot(state) {
  for (const pid of PLAYER_IDS) {
    if (!state.players?.[pid]?.connected) return pid;
  }
  for (const pid of PLAYER_IDS) {
    const player = state.players?.[pid];
    if (!player?.bot) continue;
    setPlayerConnected(state, pid, false);
    updateVisibility(state);
    return pid;
  }
  return null;
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
  player.respawnHidden = false;
  player.input = makePlayer(playerId).input;
  updateVisibility(state);
  return true;
}

export function addBot(state, options = {}) {
  let playerId = Number(options.playerId);
  if (!state.players?.[playerId] || state.players[playerId].connected) {
    playerId = null;
    for (const pid of PLAYER_IDS) {
      if (!state.players?.[pid]?.connected) {
        playerId = pid;
        break;
      }
    }
  }
  if (!playerId) return null;

  const role = normalizeRole(options.role);
  const player = state.players[playerId];
  const normalizedRole = ROLES.includes(role) ? role : DEFAULT_ROLES[playerId] ?? (playerId % 2 === 0 ? 'destroyer' : 'submarine');
  const team = TEAMS.includes(options.team) ? options.team : player.team;
  prepareBotPlayer(player, playerId, normalizedRole, team, options.difficulty);
  updatePauseState(state);
  updateVisibility(state);
  return playerId;
}

export function removeBot(state, playerId = null) {
  const targetId = playerId
    ? Number(playerId)
    : [...PLAYER_IDS].reverse().find((pid) => state.players?.[pid]?.bot);
  const player = state.players[targetId];
  if (!player?.bot) return false;
  setPlayerConnected(state, targetId, false);
  updateVisibility(state);
  return true;
}

export function configureBot(state, playerId, options = {}) {
  const player = state.players[Number(playerId)];
  if (!player?.bot) return false;
  const nextRole = ROLES.includes(normalizeRole(options.role)) ? normalizeRole(options.role) : player.role;
  const nextTeam = TEAMS.includes(options.team) ? options.team : player.team;
  const roleChanged = nextRole !== player.role;
  player.role = nextRole;
  player.team = nextTeam;
  player.color = TEAM_COLORS[nextTeam];
  player.botDifficulty = normalizeDifficulty(options.difficulty ?? player.botDifficulty);
  if (roleChanged) {
    const spawn = spawnForPlayer(player.id, nextRole);
    player.x = spawn.x;
    player.y = spawn.y;
    player.heading = spawn.heading;
  }
  player.vx = 0;
  player.vy = 0;
  player.resettingUntil = 0;
  player.respawnHidden = false;
  resetBotDecision(player);
  updateVisibility(state);
  return true;
}

export function selectVisibilityMode(state, mode) {
  if (!VISIBILITY_MODES.includes(mode)) return false;
  state.visibilityMode = mode;
  updateVisibility(state);
  return true;
}

export function setWrapEnabled(state, enabled) {
  state.settings = normalizeSettings(state.settings);
  state.settings.wrapX = Boolean(enabled);
  return true;
}

export function setBubblesEnabled(state, enabled) {
  state.settings = normalizeSettings(state.settings);
  state.settings.showBubbles = Boolean(enabled);
  if (!state.settings.showBubbles) state.bubbles = [];
  return true;
}

export function setReloadMs(state, ms) {
  const reloadMs = Number(ms);
  if (!RELOAD_OPTIONS_MS.includes(reloadMs)) return false;
  state.settings = normalizeSettings(state.settings);
  state.settings.reloadMs = reloadMs;
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
  if (!player || player.bot) return false;
  player.input = {
    throttle: clampNumber(input.throttle, -1, 1, 0),
    turn: clampNumber(input.turn, -1, 1, 0),
    dive: clampNumber(input.dive, -1, 1, 0),
    fire: Boolean(input.fire || input.torpedo),
    torpedo: Boolean(input.fire || input.torpedo),
    altFire: Boolean(input.altFire),
    sonar: Boolean(input.sonar),
  };
  return true;
}

export function step(state, now = Date.now()) {
  state.tick += 1;
  state.settings = normalizeSettings(state.settings);
  updatePauseState(state);
  if (hasActivePlayers(state)) {
    for (const player of Object.values(state.players)) {
      if (player.connected && player.bot && !player.paused && !player.resettingUntil) {
        updateBotInput(state, player, now);
      }
    }
    for (const player of Object.values(state.players)) {
      if (!player.connected || player.paused) continue;
      if (stepReset(state, player, now)) continue;
      if (player.role === 'destroyer') {
        stepBoat(state, player);
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

function prepareBotPlayer(player, playerId, role, team, difficulty) {
  const spawn = spawnForPlayer(playerId, role);
  player.connected = true;
  player.bot = true;
  player.botDifficulty = normalizeDifficulty(difficulty);
  player.botMode = 'patrol';
  player.botTargetId = null;
  player.botWaypointX = null;
  player.botWaypointY = null;
  player.botNextThinkAt = 0;
  player.paused = false;
  player.role = role;
  player.team = team;
  player.color = TEAM_COLORS[team];
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
  player.respawnHidden = false;
  player.input = makePlayer(playerId).input;
}

function clearBotState(player) {
  player.bot = false;
  player.botDifficulty = null;
  player.botMode = 'patrol';
  player.botTargetId = null;
  player.botWaypointX = null;
  player.botWaypointY = null;
  player.botNextThinkAt = 0;
}

function resetBotDecision(player) {
  player.botMode = 'patrol';
  player.botTargetId = null;
  player.botWaypointX = null;
  player.botWaypointY = null;
  player.botNextThinkAt = 0;
  player.input = makePlayer(player.id).input;
  player.lastFireInput = false;
  player.lastSonarInput = false;
  player.lastAltFireInput = false;
}

function normalizeDifficulty(difficulty) {
  return BOT.difficulties.includes(difficulty) ? difficulty : 'easy';
}

function normalizeSettings(settings) {
  return {
    wrapX: settings?.wrapX !== false,
    showBubbles: settings?.showBubbles !== false,
    reloadMs: normalizeReloadMs(settings?.reloadMs),
  };
}

function normalizeReloadMs(ms) {
  const reloadMs = Number(ms);
  return RELOAD_OPTIONS_MS.includes(reloadMs) ? reloadMs : DEFAULT_RELOAD_MS;
}

function hasActivePlayers(state) {
  return Object.values(state.players ?? {}).some((player) => (
    player.connected && !player.paused
  ));
}

function updatePauseState(state) {
  const active = hasActivePlayers(state);
  state.paused = !active;
  if (active) {
    state.reasonPaused = null;
  } else if (state.reasonPaused !== 'start') {
    state.reasonPaused = 'paused';
  }
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

function stepBoat(state, player) {
  const input = player.input ?? {};
  const throttle = clampNumber(input.throttle, -1, 1, 0);
  player.vx += throttle * BOAT.accel * DT;
  player.vx *= BOAT.damping;
  player.vx = clampNumber(player.vx, -BOAT.maxSpeed, BOAT.maxSpeed, 0);
  player.vy = 0;
  if (Math.abs(player.vx) > 4) player.heading = player.vx >= 0 ? 0 : Math.PI;

  player.x += player.vx * DT;
  player.y = BOAT_Y;
  clampToWorld(state, player, WORLD.vehicleLength * 0.5, true);
  clearRespawnHiddenOnMotion(player, throttle);
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
  clampToWorld(state, player, WORLD.vehicleLength * 0.5, false);
  clearRespawnHiddenOnMotion(player, throttle);

  if (state.settings?.showBubbles !== false && Math.abs(dive) > 0.15 && state.tick % 3 === 0) {
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
  player.respawnHidden = true;
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

function updateBotInput(state, bot, now) {
  if (now >= (bot.botNextThinkAt ?? 0)) {
    const targetInfo = chooseBotTarget(state, bot);
    bot.botTargetId = targetInfo?.player?.id ?? null;
    bot.botMode = targetInfo
      ? (targetInfo.strength >= BOT.confidentContact ? 'attack' : 'search')
      : 'patrol';
    if (!targetInfo && botWaypointReached(state, bot)) setBotPatrolWaypoint(bot);
    bot.botNextThinkAt = now + BOT.thinkMinMs + Math.random() * BOT.thinkJitterMs;
  }

  const target = bot.botTargetId ? state.players[bot.botTargetId] : null;
  const contact = target ? botContactStrength(state, bot, target) : 0;
  const input = normalizeRole(bot.role) === 'destroyer'
    ? destroyerBotInput(state, bot, target, contact, now)
    : submarineBotInput(state, bot, target, contact, now);
  bot.input = input;
}

function chooseBotTarget(state, bot) {
  let best = null;
  for (const player of Object.values(state.players)) {
    if (!player.connected || player.paused || player.resettingUntil) continue;
    if (player.id === bot.id || player.team === bot.team) continue;
    const strength = botContactStrength(state, bot, player);
    if (strength < BOT.vagueContact) continue;
    const distance = distanceBetween(bot, player, state);
    const roleBonus = botTargetRoleBonus(bot, player);
    const score = strength * 1000 + roleBonus - distance * 0.45;
    if (!best || score > best.score) best = { player, strength, distance, score };
  }
  return best;
}

function botContactStrength(state, bot, target) {
  if (!target?.connected) return 0;
  if (state.visibilityMode !== 'low') return 1;
  const contact = state.visibility?.teams?.[bot.team]?.contacts?.[target.id];
  return clampNumber(contact?.strength, 0, 1, 0);
}

function botTargetRoleBonus(bot, target) {
  const botRole = normalizeRole(bot.role);
  const targetRole = normalizeRole(target.role);
  if (botRole === 'destroyer' && targetRole === 'submarine') return 120;
  if (botRole === 'submarine' && targetRole === 'destroyer') return 90;
  if (botRole === 'submarine' && targetRole === 'submarine') return 70;
  return 0;
}

function destroyerBotInput(state, bot, target, contact, now) {
  const threat = nearestEnemyMissileThreat(state, bot);
  if (threat) {
    return {
      throttle: horizontalIntent(-wrappedDelta(threat.x - bot.x, WORLD.w, state.settings?.wrapX), 0),
      turn: 0,
      dive: 0,
      fire: false,
      altFire: false,
      sonar: false,
    };
  }

  const confidentTarget = target && contact >= BOT.confidentContact;
  const aimX = confidentTarget ? target.x : botPatrolX(state, bot);
  const dx = wrappedDelta(aimX - bot.x, WORLD.w, state.settings?.wrapX);
  const fire = confidentTarget
    && normalizeRole(target.role) === 'submarine'
    && wrappedAbsDx(target.x, bot.x, state) <= BOT.destroyerDropDx
    && target.y > bot.y + 40
    && now >= (bot.fireReadyAt ?? 0);
  const sonar = !confidentTarget
    && contact < BOT.sonarSearchStrength
    && now >= (bot.sonarReadyAt ?? 0)
    && Math.random() < 0.08;

  return {
    throttle: horizontalIntent(dx, 34),
    turn: 0,
    dive: 0,
    fire,
    altFire: false,
    sonar,
  };
}

function submarineBotInput(state, bot, target, contact, now) {
  const depthThreat = nearestDepthChargeThreat(state, bot);
  if (depthThreat) {
    return {
      throttle: horizontalIntent(-wrappedDelta(depthThreat.x - bot.x, WORLD.w, state.settings?.wrapX), 0),
      turn: 0,
      dive: bot.y < SUB_MAX_Y - 70 ? 1 : 0,
      fire: false,
      altFire: false,
      sonar: false,
    };
  }

  const confidentTarget = target && contact >= BOT.confidentContact;
  let goalX = confidentTarget ? target.x : botPatrolX(state, bot);
  let goalY = bot.botWaypointY ?? BOT.patrolDepths[1];
  let fire = false;
  let altFire = false;

  if (confidentTarget && normalizeRole(target.role) === 'destroyer') {
    goalY = BOT.missileAttackY;
    const dx = wrappedDelta(target.x - bot.x, WORLD.w, state.settings?.wrapX);
    goalX = target.x;
    altFire = Math.abs(dx) <= BOT.missileDx && now >= (bot.missileReadyAt ?? 0);
  } else if (confidentTarget && normalizeRole(target.role) === 'submarine') {
    goalY = target.y;
    const dx = wrappedDelta(target.x - bot.x, WORLD.w, state.settings?.wrapX);
    const dy = target.y - bot.y;
    const facingTarget = Math.cos(bot.heading ?? 0) * dx > 0;
    fire = Math.abs(dx) >= BOT.submarineFireDxMin
      && Math.abs(dx) <= BOT.submarineFireDxMax
      && Math.abs(dy) <= BOT.submarineFireDy
      && facingTarget
      && now >= (bot.fireReadyAt ?? 0);
  }

  const sonar = !confidentTarget
    && contact < BOT.sonarSearchStrength
    && now >= (bot.sonarReadyAt ?? 0)
    && Math.random() < 0.06;

  return {
    throttle: horizontalIntent(wrappedDelta(goalX - bot.x, WORLD.w, state.settings?.wrapX), 34),
    turn: 0,
    dive: verticalIntent(goalY - bot.y, 26),
    fire,
    altFire,
    sonar,
  };
}

function nearestEnemyMissileThreat(state, bot) {
  let best = null;
  for (const missile of state.missiles ?? []) {
    if (missile.team === bot.team || missile.phase === 'blast') continue;
    const dx = wrappedAbsDx(missile.x, bot.x, state);
    if (dx > 150) continue;
    const score = dx + Math.max(0, (missile.y ?? 0) - bot.y) * 0.25;
    if (!best || score < best.score) best = { ...missile, score };
  }
  return best;
}

function nearestDepthChargeThreat(state, bot) {
  let best = null;
  for (const charge of state.depthCharges ?? []) {
    if (charge.team === bot.team) continue;
    const dx = wrappedAbsDx(charge.x, bot.x, state);
    const dy = (charge.y ?? 0) - bot.y;
    if (dx > 120 || dy > 70 || dy < -210) continue;
    const score = dx + Math.abs(dy) * 0.5;
    if (!best || score < best.score) best = { ...charge, score };
  }
  return best;
}

function botPatrolX(state, bot) {
  if (botWaypointReached(state, bot)) setBotPatrolWaypoint(bot);
  return bot.botWaypointX ?? WORLD.w / 2;
}

function botWaypointReached(state, bot) {
  if (bot.botWaypointX == null) return true;
  const closeX = wrappedAbsDx(bot.x, bot.botWaypointX, state) <= BOT.waypointReach;
  const closeY = normalizeRole(bot.role) === 'destroyer'
    || bot.botWaypointY == null
    || Math.abs(bot.y - bot.botWaypointY) <= BOT.waypointReach;
  return closeX && closeY;
}

function setBotPatrolWaypoint(bot) {
  const min = BOT.patrolMargin;
  const max = WORLD.w - BOT.patrolMargin;
  bot.botWaypointX = min + Math.random() * Math.max(1, max - min);
  if (normalizeRole(bot.role) === 'submarine') {
    bot.botWaypointY = BOT.patrolDepths[Math.floor(Math.random() * BOT.patrolDepths.length)];
  } else {
    bot.botWaypointY = BOAT_Y;
  }
}

function horizontalIntent(dx, deadZone) {
  if (dx > deadZone) return 1;
  if (dx < -deadZone) return -1;
  return 0;
}

function verticalIntent(dy, deadZone) {
  if (dy > deadZone) return 1;
  if (dy < -deadZone) return -1;
  return 0;
}

function handleFireInput(state, player, now) {
  const wantsFire = Boolean(player.input?.fire);
  const isNewPress = wantsFire && !player.lastFireInput;
  player.lastFireInput = wantsFire;
  if (!isNewPress || now < (player.fireReadyAt ?? 0)) return;

  if (player.role === 'destroyer') {
    spawnDepthCharge(state, player, now);
    player.fireReadyAt = now + reloadMs(state);
  } else {
    spawnTorpedo(state, player, now);
    player.fireReadyAt = now + reloadMs(state);
  }
  player.respawnHidden = false;
  markNoisy(player, now, 1800, 'fire');
}

function handleAltFireInput(state, player, now) {
  const wantsAltFire = Boolean(player.input?.altFire);
  const isNewPress = wantsAltFire && !player.lastAltFireInput;
  player.lastAltFireInput = wantsAltFire;
  if (player.role !== 'submarine') return;
  if (!isNewPress || now < (player.missileReadyAt ?? 0)) return;

  spawnMissile(state, player, now);
  player.missileReadyAt = now + reloadMs(state);
  player.respawnHidden = false;
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
    maxRadius: sonarRadiusFor(player),
  });
  player.sonarReadyAt = now + SONAR.cooldownMs;
  player.respawnHidden = false;
}

function spawnTorpedo(state, player, now) {
  const dir = Math.cos(player.heading ?? 0) >= 0 ? 1 : -1;
  const x = player.x + dir * TORPEDO.spawnOffset;
  const wrapX = Boolean(state.settings?.wrapX);
  state.torpedoes.push({
    id: nextEntityId(state, 't'),
    owner: player.id,
    team: player.team,
    x: wrapX ? wrapCoordinate(x, WORLD.w) : x,
    y: player.y,
    vx: dir * TORPEDO.speed,
    vy: 0,
    wrapX,
    heading: dir >= 0 ? 0 : Math.PI,
    radius: TORPEDO.hitRadius,
    bornAt: now,
    lifeMs: TORPEDO.lifeMs,
    distanceTraveled: 0,
    maxTravel: TORPEDO.maxTravel,
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
    kind: 'depthCharge',
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
  state.torpedoes = stepTorpedoes(state, state.torpedoes, now);
  state.depthCharges = stepDepthCharges(state, state.depthCharges, now);
  state.missiles = stepMissiles(state, state.missiles ?? [], now);
}

function stepTorpedoes(state, torpedoes, now) {
  const live = [];
  for (const torpedo of torpedoes) {
    const dx = (torpedo.vx ?? 0) * DT;
    const dy = (torpedo.vy ?? 0) * DT;
    torpedo.x += dx;
    torpedo.y += dy;
    torpedo.distanceTraveled = (torpedo.distanceTraveled ?? 0) + Math.hypot(dx, dy);
    if (torpedo.distanceTraveled >= (torpedo.maxTravel ?? TORPEDO.maxTravel)) continue;

    if (torpedo.wrapX && state.settings?.wrapX) {
      torpedo.x = wrapCoordinate(torpedo.x, WORLD.w);
    } else if (torpedo.x < -80 || torpedo.x > WORLD.w + 80) {
      continue;
    }
    if (torpedo.y < -80 || torpedo.y > WORLD.h + 80) continue;

    const target = findHitTarget(state, torpedo, 'submarine');
    if (target) {
      hitPlayer(state, target, torpedo, now);
      continue;
    }

    live.push(torpedo);
  }
  return live;
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
    const subTarget = findHitTarget(state, missile, 'submarine');
    if (subTarget) {
      hitPlayer(state, subTarget, missile, now);
      continue;
    }

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

    if (missile.x < -80 || missile.x > WORLD.w + 80) continue;
    if (missile.y < -80 || missile.y > WORLD.h + 80) continue;
    live.push(missile);
  }
  return live;
}

function hitMissileTargets(state, missile, now) {
  for (const target of Object.values(state.players)) {
    if (!target.connected || target.paused || target.resettingUntil) continue;
    if (target.id === missile.owner || target.team === missile.team) continue;
    const role = normalizeRole(target.role);
    if (role !== 'destroyer' && role !== 'submarine') continue;
    if (projectileHitsTarget(state, missile, target)) {
      hitPlayer(state, target, missile, now);
    }
  }
}

function stepDepthCharges(state, depthCharges, now) {
  const live = [];
  for (const charge of depthCharges) {
    const age = now - charge.bornAt;
    if (age >= charge.lifeMs) continue;

    charge.vx = (charge.vx ?? 0) * DEPTH_CHARGE.horizontalDamping;
    if (Math.abs(charge.vx) < 0.02) charge.vx = 0;
    charge.vy += (DEPTH_CHARGE.terminalSinkSpeed - (charge.vy ?? 0)) * DEPTH_CHARGE.verticalApproach;
    charge.x += charge.vx * DT;
    charge.y += charge.vy * DT;
    if (charge.x < -80 || charge.x > WORLD.w + 80) continue;
    if (charge.y < -80 || charge.y > WORLD.h + 80) continue;

    const target = findHitTarget(state, charge, 'submarine');
    if (target) {
      hitPlayer(state, target, charge, now);
      continue;
    }
    live.push(charge);
  }
  return live;
}

function stepProjectileList(state, projectiles, now, targetRole) {
  const live = [];
  for (const projectile of projectiles) {
    const age = now - projectile.bornAt;
    if (age >= projectile.lifeMs) continue;

    projectile.x += projectile.vx * DT;
    projectile.y += projectile.vy * DT;
    if (projectile.x < -80 || projectile.x > WORLD.w + 80) continue;
    if (projectile.y < -80 || projectile.y > WORLD.h + 80) continue;

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

    if (projectileHitsTarget(state, projectile, target)) return target;
  }
  return null;
}

function projectileHitsTarget(state, projectile, target) {
  const size = targetHitSize(target);
  const hitRadius = projectile.radius ?? 30;
  const heading = target.heading ?? 0;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const rawDx = (projectile.x ?? 0) - (target.x ?? 0);
  const dx = projectile.wrapX && state.settings?.wrapX
    ? wrappedDelta(rawDx, WORLD.w, true)
    : rawDx;
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

function clampToWorld(state, player, margin, boat) {
  if (state.settings?.wrapX) {
    player.x = wrapCoordinate(player.x, WORLD.w);
  } else if (player.x < margin) {
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

function wrapCoordinate(value, size) {
  let n = Number(value) || 0;
  n %= size;
  if (n < 0) n += size;
  return n;
}

function wrappedDelta(dx, size, wrap) {
  if (!wrap) return dx;
  if (dx > size / 2) return dx - size;
  if (dx < -size / 2) return dx + size;
  return dx;
}

function wrappedAbsDx(a, b, state) {
  return Math.abs(wrappedDelta((a ?? 0) - (b ?? 0), WORLD.w, state.settings?.wrapX));
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

function reloadMs(state) {
  return normalizeReloadMs(state.settings?.reloadMs);
}

function sonarRadiusFor(player) {
  const scale = normalizeRole(player.role) === 'destroyer' ? SONAR.destroyerRadiusScale : 1;
  return SONAR.maxRadius * scale;
}

function clearRespawnHiddenOnMotion(player, throttle) {
  if (!player.respawnHidden) return;
  if (Math.abs(throttle) > 0.15 || Math.abs(player.vx ?? 0) > 8 || Math.abs(player.vy ?? 0) > 8) {
    player.respawnHidden = false;
  }
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
  if (target.respawnHidden) return best;
  for (const listener of players) {
    if (!listener.connected || listener.team !== viewerTeam || listener.id === target.id) continue;
    best = Math.max(best, passiveContactStrength(state, listener, target, now));
    best = Math.max(best, periscopeVisualContactStrength(state, listener, target));
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

function passiveContactStrength(state, listener, target, now) {
  const dx = wrappedDelta((listener.x ?? 0) - (target.x ?? 0), WORLD.w, state.settings?.wrapX);
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

function periscopeVisualContactStrength(state, listener, target) {
  const listenerRole = normalizeRole(listener.role);
  const targetRole = normalizeRole(target.role);
  const distance = distanceBetween(listener, target, state);

  const subAtPeriscopeSeesDestroyer = listenerRole === 'submarine'
    && isAtPeriscopeDepth(listener)
    && targetRole === 'destroyer';
  const destroyerSeesPeriscopeSub = listenerRole === 'destroyer'
    && targetRole === 'submarine'
    && isAtPeriscopeDepth(target);
  const destroyerSeesDestroyer = listenerRole === 'destroyer'
    && targetRole === 'destroyer';
  const range = destroyerSeesDestroyer ? WORLD.w * (2 / 3) : PERISCOPE_VISUAL_RANGE;
  if (distance > range) return 0;
  if (!subAtPeriscopeSeesDestroyer && !destroyerSeesPeriscopeSub && !destroyerSeesDestroyer) return 0;

  const distanceT = clampNumber(distance / range, 0, 1, 1);
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

function distanceBetween(a, b, state = null) {
  const dx = wrappedDelta((a.x ?? 0) - (b.x ?? 0), WORLD.w, state?.settings?.wrapX);
  return Math.hypot(dx, (a.y ?? 0) - (b.y ?? 0));
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
