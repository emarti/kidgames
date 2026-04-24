/**
 * alphabet_sim.js — Game logic for the Alphabet reading game.
 *
 * Designed to help 5-year-olds learn letter-sound correspondence.
 * Seven levels of increasing difficulty following the pedagogically-sound
 * order: initial sound (onset) → final sound (rime) → medial vowel,
 * with easy words first and slightly harder words in level 7.
 *
 * State:
 *  { tick, paused, reasonPaused, levelIndex, wordIndex, wordOrder,
 *    currentWord, currentEmoji, missingIndex, wordsCompleted, wordsPerLevel,
 *    recentWords, celebrating, celebrateStart, lastTypedBy,
 *    wrongAttempts, players }
 */

// ─── Avatars / colors ─────────────────────────────────────────────────────────

const AVATARS = ['🐱', '🐶', '🐰', '🦊', '🐸', '🐼'];
const DEFAULT_AVATARS = ['🐱', '🐶', '🐰', '🦊'];
const PLAYER_COLORS = { 1: '#f6c90e', 2: '#6bcb77', 3: '#4d96ff', 4: '#ff6b6b' };
const ALLOWED_COLORS = new Set(Object.values(PLAYER_COLORS).map((c) => c.toLowerCase()));

// ─── Word lists ───────────────────────────────────────────────────────────────
//
// Each entry: { word, emoji, missing }
//   word    — the complete word (lowercase)
//   emoji   — picture hint shown to the child
//   missing — index of the letter to hide (computed at load time for levels
//              where it varies per word; stored as a number)

// Level 1 & 2 — canonical A-Z words, first letter missing, in alphabetical order
// Shown in order for L1, shuffled for L2.
export const LEVEL_AZ = [
  { word: 'apple',    emoji: '🍎' },
  { word: 'ball',     emoji: '⚽' },
  { word: 'cat',      emoji: '🐱' },
  { word: 'dog',      emoji: '🐶' },
  { word: 'egg',      emoji: '🥚' },
  { word: 'fish',     emoji: '🐟' },
  { word: 'gate',     emoji: '🚪' },
  { word: 'hat',      emoji: '🎩' },
  { word: 'ice',      emoji: '🧊' },
  { word: 'jar',      emoji: '🫙' },
  { word: 'kite',     emoji: '🪁' },
  { word: 'lion',     emoji: '🦁' },
  { word: 'moon',     emoji: '🌙' },
  { word: 'net',      emoji: '🥅' },
  { word: 'owl',      emoji: '🦉' },
  { word: 'pig',      emoji: '🐷' },
  { word: 'queen',    emoji: '👸' },
  { word: 'rainbow',  emoji: '🌈' },
  { word: 'sun',      emoji: '☀️' },
  { word: 'tree',     emoji: '🌳' },
  { word: 'umbrella', emoji: '☂️' },
  { word: 'van',      emoji: '🚐' },
  { word: 'whale',    emoji: '🐋' },
  { word: 'xylophone',emoji: '🎵' },
  { word: 'yarn',     emoji: '🧶' },
  { word: 'zebra',    emoji: '🦓' },
];

// Level 3 — first letter missing, new simple CVC/short words
const LEVEL_3_WORDS = [
  { word: 'bug',  emoji: '🐛' },
  { word: 'cup',  emoji: '🥤' },
  { word: 'hen',  emoji: '🐔' },
  { word: 'fox',  emoji: '🦊' },
  { word: 'bat',  emoji: '🦇' },
  { word: 'bed',  emoji: '🛏️' },
  { word: 'ant',  emoji: '🐜' },
  { word: 'nut',  emoji: '🥜' },
  { word: 'jam',  emoji: '🫙' },
  { word: 'van',  emoji: '🚐' },
  { word: 'web',  emoji: '🕸️' },
  { word: 'leg',  emoji: '🦵' },
  { word: 'ram',  emoji: '🐏' },
  { word: 'yak',  emoji: '🦬' },
  { word: 'lip',  emoji: '👄' },
  { word: 'log',  emoji: '🪵' },
  { word: 'map',  emoji: '🗺️' },
  { word: 'mud',  emoji: '💧' },
  { word: 'pen',  emoji: '✏️' },
  { word: 'zip',  emoji: '⚡' },
];

// Level 4 — last letter missing, simple CVC/short words
const LEVEL_4_WORDS = [
  { word: 'car',  emoji: '🚗' },
  { word: 'bus',  emoji: '🚌' },
  { word: 'cow',  emoji: '🐄' },
  { word: 'bee',  emoji: '🐝' },
  { word: 'ham',  emoji: '🍖' },
  { word: 'bat',  emoji: '🦇' },
  { word: 'pin',  emoji: '📌' },
  { word: 'dog',  emoji: '🐶' },
  { word: 'fan',  emoji: '🪭' },
  { word: 'hen',  emoji: '🐔' },
  { word: 'pot',  emoji: '🍯' },
  { word: 'owl',  emoji: '🦉' },
  { word: 'gem',  emoji: '💎' },
  { word: 'key',  emoji: '🔑' },
  { word: 'mop',  emoji: '🧹' },
  { word: 'pea',  emoji: '🫛' },
  { word: 'run',  emoji: '🏃' },
  { word: 'sun',  emoji: '☀️' },
  { word: 'tap',  emoji: '🚰' },
  { word: 'zip',  emoji: '⚡' },
];

// Level 5 — middle vowel missing, CVC words
const LEVEL_5_WORDS = [
  { word: 'cat',  emoji: '🐱' },
  { word: 'sun',  emoji: '☀️' },
  { word: 'pig',  emoji: '🐷' },
  { word: 'dog',  emoji: '🐶' },
  { word: 'bug',  emoji: '🐛' },
  { word: 'hen',  emoji: '🐔' },
  { word: 'cup',  emoji: '🥤' },
  { word: 'hat',  emoji: '🎩' },
  { word: 'bed',  emoji: '🛏️' },
  { word: 'fox',  emoji: '🦊' },
  { word: 'bat',  emoji: '🦇' },
  { word: 'pin',  emoji: '📌' },
  { word: 'nut',  emoji: '🥜' },
  { word: 'pot',  emoji: '🍯' },
  { word: 'leg',  emoji: '🦵' },
  { word: 'ram',  emoji: '🐏' },
  { word: 'fin',  emoji: '🐟' },
  { word: 'gem',  emoji: '💎' },
  { word: 'log',  emoji: '🪵' },
  { word: 'map',  emoji: '🗺️' },
];

// Level 6 — random position missing, easy words (mixed length)
const LEVEL_6_WORDS = [
  { word: 'frog',  emoji: '🐸' },
  { word: 'star',  emoji: '⭐' },
  { word: 'bear',  emoji: '🐻' },
  { word: 'duck',  emoji: '🦆' },
  { word: 'cake',  emoji: '🎂' },
  { word: 'moon',  emoji: '🌙' },
  { word: 'bell',  emoji: '🔔' },
  { word: 'fish',  emoji: '🐟' },
  { word: 'drum',  emoji: '🥁' },
  { word: 'king',  emoji: '👑' },
  { word: 'leaf',  emoji: '🍃' },
  { word: 'rose',  emoji: '🌹' },
  { word: 'bone',  emoji: '🦴' },
  { word: 'corn',  emoji: '🌽' },
  { word: 'ring',  emoji: '💍' },
  { word: 'nest',  emoji: '🪺' },
  { word: 'worm',  emoji: '🪱' },
  { word: 'tree',  emoji: '🌳' },
  { word: 'coat',  emoji: '🧥' },
  { word: 'boat',  emoji: '⛵' },
];

// Level 7 — harder words (blends, digraphs, 4-6 letters)
const LEVEL_7_WORDS = [
  { word: 'shark',   emoji: '🦈' },
  { word: 'cloud',   emoji: '☁️' },
  { word: 'grape',   emoji: '🍇' },
  { word: 'whale',   emoji: '🐋' },
  { word: 'train',   emoji: '🚂' },
  { word: 'horse',   emoji: '🐴' },
  { word: 'snail',   emoji: '🐌' },
  { word: 'bread',   emoji: '🍞' },
  { word: 'flame',   emoji: '🔥' },
  { word: 'crown',   emoji: '👑' },
  { word: 'sheep',   emoji: '🐑' },
  { word: 'lemon',   emoji: '🍋' },
  { word: 'mouse',   emoji: '🐭' },
  { word: 'truck',   emoji: '🚚' },
  { word: 'chair',   emoji: '🪑' },
  { word: 'peach',   emoji: '🍑' },
  { word: 'sword',   emoji: '⚔️' },
  { word: 'brush',   emoji: '🪥' },
  { word: 'globe',   emoji: '🌍' },
  { word: 'slide',   emoji: '🛝' },
];

// ─── Level definitions ────────────────────────────────────────────────────────

// missingMode: 'first' | 'last' | 'middle' | 'random'
// ordered: true  → no shuffle (Level 1 only)
export const LEVELS = [
  { name: 'A to Z',         emoji: '🔤', words: LEVEL_AZ,       missingMode: 'first',  ordered: true  },
  { name: 'A to Z Mix',     emoji: '🔀', words: LEVEL_AZ,       missingMode: 'first',  ordered: false },
  { name: 'First Letter',   emoji: '🅰️', words: LEVEL_3_WORDS,  missingMode: 'first',  ordered: false },
  { name: 'Last Letter',    emoji: '🔚', words: LEVEL_4_WORDS,  missingMode: 'last',   ordered: false },
  { name: 'Middle Vowel',   emoji: '🔵', words: LEVEL_5_WORDS,  missingMode: 'middle', ordered: false },
  { name: 'Any Letter',     emoji: '❓', words: LEVEL_6_WORDS,  missingMode: 'random', ordered: false },
  { name: 'Challenge',      emoji: '⭐', words: LEVEL_7_WORDS,  missingMode: 'random', ordered: false },
];

export const WORDS_PER_LEVEL = 15; // shorter sessions for young children

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeWordOrder(count, ordered) {
  const indices = [...Array(count).keys()];
  return ordered ? indices : shuffle(indices);
}

/**
 * Compute which index should be hidden based on missingMode.
 * For 'middle': always the median vowel (index 1 for CVC).
 * For 'random': choose any index that isn't a leading/trailing vowel in
 *               very short words to keep it guessable.
 */
function computeMissingIndex(word, missingMode) {
  const len = word.length;
  if (missingMode === 'first')  return 0;
  if (missingMode === 'last')   return len - 1;
  if (missingMode === 'middle') {
    // Find first vowel that is not the first or last character
    const VOWELS = 'aeiou';
    for (let i = 1; i < len - 1; i++) {
      if (VOWELS.includes(word[i])) return i;
    }
    return Math.floor(len / 2); // fallback
  }
  if (missingMode === 'random') {
    // Avoid trivially guessable positions if word is long enough
    if (len <= 3) return Math.floor(Math.random() * len);
    const idx = Math.floor(Math.random() * len);
    return idx;
  }
  return 0;
}

function makePlayer(id) {
  return {
    id,
    connected: false,
    paused: false,
    avatar: DEFAULT_AVATARS[id - 1] ?? '🐱',
    color: PLAYER_COLORS[id] ?? '#ffffff',
  };
}

// ─── State construction ───────────────────────────────────────────────────────

function loadLevel(state, levelIndex) {
  const level = LEVELS[levelIndex];
  const wordOrder = makeWordOrder(level.words.length, level.ordered);
  const firstWord = level.words[wordOrder[0]];
  const missingIndex = computeMissingIndex(firstWord.word, level.missingMode);

  state.levelIndex = levelIndex;
  state.levelName = level.name;
  state.levelEmoji = level.emoji;
  state.missingMode = level.missingMode;
  state.wordOrder = wordOrder;
  state.wordIndex = 0;
  state.currentWord = firstWord.word;
  state.currentEmoji = firstWord.emoji;
  state.missingIndex = missingIndex;
  state.wordsCompleted = 0;
  state.wordsPerLevel = level.words.length;
  state.recentWords = [];
  state.celebrating = false;
  state.celebrateStart = 0;
  state.wrongAttempts = 0;
  state.lastTypedBy = null;
}

function advanceWord(state) {
  const level = LEVELS[state.levelIndex];
  state.wordIndex++;
  state.wrongAttempts = 0;

  const rawIndex = state.wordOrder[state.wordIndex];
  const next = level.words[rawIndex];
  state.currentWord = next.word;
  state.currentEmoji = next.emoji;
  state.missingIndex = computeMissingIndex(next.word, state.missingMode);
}

export function newGameState() {
  const state = {
    tick: 0,
    paused: true,
    reasonPaused: 'start',
    levelIndex: 0,
    levelName: LEVELS[0].name,
    levelEmoji: LEVELS[0].emoji,
    missingMode: LEVELS[0].missingMode,
    wordOrder: [],
    wordIndex: 0,
    currentWord: '',
    currentEmoji: '',
    missingIndex: 0,
    wordsCompleted: 0,
    wordsPerLevel: 0, // set by loadLevel
    recentWords: [],
    celebrating: false,
    celebrateStart: 0,
    wrongAttempts: 0,
    lastTypedBy: null,
    players: {
      1: makePlayer(1),
      2: makePlayer(2),
      3: makePlayer(3),
      4: makePlayer(4),
    },
  };
  loadLevel(state, 0);
  state.paused = true;
  state.reasonPaused = 'start';
  return state;
}

// ─── Player management ────────────────────────────────────────────────────────

export function setPlayerConnected(state, playerId, connected) {
  const p = state.players[playerId];
  if (p) p.connected = connected;
}

export function resumeGame(state, playerId) {
  if (!playerId) return;
  const p = state.players[playerId];
  if (p) p.paused = false;
  if (state.paused) {
    state.paused = false;
    state.reasonPaused = null;
  }
}

export function togglePause(state, playerId) {
  if (!playerId) return;
  if (state.paused && state.reasonPaused === 'start') {
    state.paused = false;
    state.reasonPaused = null;
  } else if (!state.paused) {
    state.paused = true;
    state.reasonPaused = 'paused';
  } else {
    state.paused = false;
    state.reasonPaused = null;
  }
}

export function selectAvatar(state, playerId, avatar) {
  const p = state.players[playerId];
  if (!p) return;
  if (AVATARS.includes(avatar)) p.avatar = avatar;
}

export function selectColor(state, playerId, color) {
  const p = state.players[playerId];
  if (!p) return;
  const c = String(color ?? '').toLowerCase();
  if (ALLOWED_COLORS.has(c)) p.color = c;
}

// ─── Core game logic ──────────────────────────────────────────────────────────

/**
 * applyKey — called when a player presses a letter key.
 *
 * Returns:
 *  'correct'   — right letter, word advanced (or level complete)
 *  'wrong'     — wrong attempt, player keeps trying
 *  'ignored'   — input rejected (paused, celebrating, etc.)
 */
export function applyKey(state, playerId, key) {
  if (state.paused) return 'ignored';
  if (state.celebrating) return 'ignored';

  const k = String(key ?? '').toLowerCase();
  if (k.length !== 1 || !/[a-z]/.test(k)) return 'ignored';

  const answer = state.currentWord[state.missingIndex].toLowerCase();

  if (k === answer) {
    // ── Correct ──────────────────────────────────────────────────────────────
    const done = {
      word: state.currentWord,
      emoji: state.currentEmoji,
      missingIndex: state.missingIndex,
    };
    state.recentWords = [done, ...state.recentWords].slice(0, 6);
    state.wordsCompleted++;
    state.lastTypedBy = playerId;

    if (state.wordsCompleted >= state.wordsPerLevel) {
      state.celebrating = true;
      state.celebrateStart = Date.now();
    } else {
      advanceWord(state);
    }
    return 'correct';
  } else {
    // ── Wrong ─────────────────────────────────────────────────────────────────
    state.wrongAttempts++;
    return 'wrong';
  }
}

export function nextLevel(state) {
  if (!state.celebrating) return;
  const nextIdx = (state.levelIndex + 1) % LEVELS.length;
  loadLevel(state, nextIdx);
  // No pause — continue playing after celebration
}

export function restart(state) {
  loadLevel(state, state.levelIndex);
  state.paused = true;
  state.reasonPaused = 'start';
}

export function selectLevel(state, index) {
  const idx = Math.max(0, Math.min(LEVELS.length - 1, index));
  loadLevel(state, idx);
  state.paused = true;
  state.reasonPaused = 'start';
}

export function step(state, _now) {
  state.tick++;
}

export { AVATARS, PLAYER_COLORS, ALLOWED_COLORS };
