// Obstacle word lists — order matches THEMES in PlayScene.js (indexed by obstacleIndex)
// Difficulty groups: levels 0-1 = 3 letters, 2-4 = 4 letters, 5-7 = 5 letters,
//                   8-10 = 6 letters, 11-13 = 7 letters
export const OBSTACLES = [
  // ── 3-letter words ──────────────────────────────────────────────────────────
  {
    name: 'tree',
    emoji: '🌳',
    words: [
      { word: 'cat', emoji: '🐱' },
      { word: 'dog', emoji: '🐶' },
      { word: 'hat', emoji: '🎩' },
      { word: 'sun', emoji: '☀️' },
      { word: 'run', emoji: '🏃' },
      { word: 'ant', emoji: '🐜' },
      { word: 'cup', emoji: '☕' },
      { word: 'egg', emoji: '🥚' },
      { word: 'pig', emoji: '🐷' },
      { word: 'hen', emoji: '🐔' },
      { word: 'owl', emoji: '🦉' },
      { word: 'bee', emoji: '🐝' },
      { word: 'bat', emoji: '🦇' },
      { word: 'fox', emoji: '🦊' },
      { word: 'bug', emoji: '🐛' },
      { word: 'bus', emoji: '🚌' },
      { word: 'box', emoji: '📦' },
      { word: 'bed', emoji: '🛏️' },
      { word: 'hot', emoji: '🔥' },
      { word: 'ice', emoji: '🧊' },
      { word: 'sky', emoji: '🌤️' },
      { word: 'sea', emoji: '🌊' },
      { word: 'red', emoji: '🍎' },
      { word: 'big', emoji: '🐘' },
      { word: 'wet', emoji: '💧' },
      { word: 'map', emoji: '🗺️' },
      { word: 'toy', emoji: '🪀' },
      { word: 'arm', emoji: '💪' },
      { word: 'ear', emoji: '👂' },
      { word: 'net', emoji: '🥅' },
    ],
  },
  {
    name: 'mountain',
    emoji: '⛰️',
    words: [
      { word: 'air', emoji: '💨' },
      { word: 'bow', emoji: '🏹' },
      { word: 'can', emoji: '🥫' },
      { word: 'car', emoji: '🚗' },
      { word: 'cow', emoji: '🐄' },
      { word: 'cry', emoji: '😢' },
      { word: 'cut', emoji: '✂️' },
      { word: 'day', emoji: '🌅' },
      { word: 'dry', emoji: '☀️' },
      { word: 'eye', emoji: '👁️' },
      { word: 'fan', emoji: '🌀' },
      { word: 'fly', emoji: '🦋' },
      { word: 'fun', emoji: '🎉' },
      { word: 'hop', emoji: '🐰' },
      { word: 'hug', emoji: '🤗' },
      { word: 'jug', emoji: '🫙' },
      { word: 'key', emoji: '🔑' },
      { word: 'leg', emoji: '🦵' },
      { word: 'log', emoji: '🪵' },
      { word: 'mud', emoji: '💧' },
      { word: 'nut', emoji: '🥜' },
      { word: 'oak', emoji: '🌲' },
      { word: 'pan', emoji: '🍳' },
      { word: 'pen', emoji: '✏️' },
      { word: 'pie', emoji: '🥧' },
      { word: 'pop', emoji: '🎈' },
      { word: 'pup', emoji: '🐶' },
      { word: 'row', emoji: '🚣' },
      { word: 'tug', emoji: '💪' },
      { word: 'zoo', emoji: '🦁' },
    ],
  },
  // ── 4-letter words ──────────────────────────────────────────────────────────
  {
    name: 'snowy mountain',
    emoji: '❄️',
    words: [
      { word: 'snow', emoji: '❄️' },
      { word: 'cold', emoji: '🥶' },
      { word: 'wind', emoji: '💨' },
      { word: 'coat', emoji: '🧥' },
      { word: 'wool', emoji: '🐑' },
      { word: 'sled', emoji: '🛷' },
      { word: 'boot', emoji: '👢' },
      { word: 'pine', emoji: '🌲' },
      { word: 'hawk', emoji: '🦅' },
      { word: 'deer', emoji: '🦌' },
      { word: 'wolf', emoji: '🐺' },
      { word: 'rock', emoji: '🪨' },
      { word: 'cave', emoji: '🕳️' },
      { word: 'path', emoji: '🛤️' },
      { word: 'crow', emoji: '🐦' },
      { word: 'peak', emoji: '🏔️' },
      { word: 'gray', emoji: '☁️' },
      { word: 'hill', emoji: '⛰️' },
      { word: 'fern', emoji: '🌿' },
      { word: 'melt', emoji: '💧' },
      { word: 'glow', emoji: '✨' },
      { word: 'beam', emoji: '🔦' },
      { word: 'nest', emoji: '🪺' },
      { word: 'pale', emoji: '🌫️' },
      { word: 'wild', emoji: '🌿' },
      { word: 'tall', emoji: '⛰️' },
      { word: 'thin', emoji: '❄️' },
      { word: 'deep', emoji: '🌊' },
      { word: 'mist', emoji: '🌫️' },
      { word: 'hail', emoji: '🌨️' },
    ],
  },
  {
    name: 'volcano',
    emoji: '🌋',
    words: [
      { word: 'bear', emoji: '🐻' },
      { word: 'frog', emoji: '🐸' },
      { word: 'fish', emoji: '🐟' },
      { word: 'duck', emoji: '🦆' },
      { word: 'bird', emoji: '🐦' },
      { word: 'tree', emoji: '🌳' },
      { word: 'rain', emoji: '🌧️' },
      { word: 'star', emoji: '⭐' },
      { word: 'moon', emoji: '🌙' },
      { word: 'cake', emoji: '🎂' },
      { word: 'milk', emoji: '🥛' },
      { word: 'ball', emoji: '⚽' },
      { word: 'book', emoji: '📚' },
      { word: 'rose', emoji: '🌹' },
      { word: 'boat', emoji: '⛵' },
      { word: 'kite', emoji: '🪁' },
      { word: 'drum', emoji: '🥁' },
      { word: 'bell', emoji: '🔔' },
      { word: 'leaf', emoji: '🍂' },
      { word: 'corn', emoji: '🌽' },
      { word: 'farm', emoji: '🚜' },
      { word: 'lake', emoji: '🏞️' },
      { word: 'hand', emoji: '✋' },
      { word: 'song', emoji: '🎵' },
      { word: 'blue', emoji: '💙' },
      { word: 'jump', emoji: '🐸' },
      { word: 'open', emoji: '🚪' },
      { word: 'worm', emoji: '🪱' },
      { word: 'buzz', emoji: '🐝' },
      { word: 'toad', emoji: '🐸' },
    ],
  },
  {
    name: 'reef',
    emoji: '🪸',
    words: [
      { word: 'reef', emoji: '🪸' },
      { word: 'crab', emoji: '🦀' },
      { word: 'kelp', emoji: '🌿' },
      { word: 'dive', emoji: '🤿' },
      { word: 'tide', emoji: '🌊' },
      { word: 'wave', emoji: '🌊' },
      { word: 'clam', emoji: '🦪' },
      { word: 'seal', emoji: '🦭' },
      { word: 'sand', emoji: '🏖️' },
      { word: 'swim', emoji: '🏊' },
      { word: 'warm', emoji: '☀️' },
      { word: 'salt', emoji: '🧂' },
      { word: 'pool', emoji: '🏊' },
      { word: 'gill', emoji: '🐟' },
      { word: 'tail', emoji: '🐠' },
      { word: 'foam', emoji: '🌊' },
      { word: 'cove', emoji: '🏝️' },
      { word: 'weed', emoji: '🌿' },
      { word: 'cool', emoji: '🧊' },
      { word: 'damp', emoji: '💧' },
      { word: 'dark', emoji: '🌑' },
      { word: 'raft', emoji: '🛶' },
      { word: 'wade', emoji: '🌊' },
      { word: 'teal', emoji: '🩵' },
      { word: 'puff', emoji: '🐡' },
      { word: 'buoy', emoji: '🛟' },
      { word: 'fins', emoji: '🤿' },
      { word: 'rays', emoji: '☀️' },
      { word: 'gust', emoji: '💨' },
      { word: 'mast', emoji: '⛵' },
    ],
  },
  // ── 5-letter words ──────────────────────────────────────────────────────────
  {
    name: 'jungle',
    emoji: '🌴',
    words: [
      { word: 'apple', emoji: '🍎' },
      { word: 'cloud', emoji: '☁️' },
      { word: 'dance', emoji: '💃' },
      { word: 'earth', emoji: '🌍' },
      { word: 'flame', emoji: '🔥' },
      { word: 'grape', emoji: '🍇' },
      { word: 'happy', emoji: '😊' },
      { word: 'juice', emoji: '🍹' },
      { word: 'lemon', emoji: '🍋' },
      { word: 'music', emoji: '🎵' },
      { word: 'night', emoji: '🌙' },
      { word: 'ocean', emoji: '🌊' },
      { word: 'plant', emoji: '🌱' },
      { word: 'queen', emoji: '👸' },
      { word: 'river', emoji: '🌊' },
      { word: 'sheep', emoji: '🐑' },
      { word: 'tiger', emoji: '🐯' },
      { word: 'whale', emoji: '🐋' },
      { word: 'zebra', emoji: '🦓' },
      { word: 'bread', emoji: '🍞' },
      { word: 'crown', emoji: '👑' },
      { word: 'heart', emoji: '❤️' },
      { word: 'igloo', emoji: '🏠' },
      { word: 'koala', emoji: '🐨' },
      { word: 'light', emoji: '💡' },
      { word: 'mango', emoji: '🥭' },
      { word: 'panda', emoji: '🐼' },
      { word: 'pizza', emoji: '🍕' },
      { word: 'robot', emoji: '🤖' },
      { word: 'flute', emoji: '🪈' },
    ],
  },
  {
    name: 'underwater',
    emoji: '🌊',
    words: [
      { word: 'coral', emoji: '🪸' },
      { word: 'shark', emoji: '🦈' },
      { word: 'squid', emoji: '🦑' },
      { word: 'otter', emoji: '🦦' },
      { word: 'prawn', emoji: '🦐' },
      { word: 'snail', emoji: '🐌' },
      { word: 'trout', emoji: '🐟' },
      { word: 'algae', emoji: '🌿' },
      { word: 'salty', emoji: '🧂' },
      { word: 'water', emoji: '💧' },
      { word: 'pearl', emoji: '⚪' },
      { word: 'shell', emoji: '🐚' },
      { word: 'storm', emoji: '🌪️' },
      { word: 'brave', emoji: '🦸' },
      { word: 'float', emoji: '🌊' },
      { word: 'sunny', emoji: '☀️' },
      { word: 'puppy', emoji: '🐶' },
      { word: 'kitty', emoji: '🐱' },
      { word: 'bunny', emoji: '🐰' },
      { word: 'candy', emoji: '🍬' },
      { word: 'daisy', emoji: '🌼' },
      { word: 'lucky', emoji: '🍀' },
      { word: 'rainy', emoji: '🌧️' },
      { word: 'dizzy', emoji: '💫' },
      { word: 'fuzzy', emoji: '🐻' },
      { word: 'sandy', emoji: '🏖️' },
      { word: 'bloom', emoji: '🌺' },
      { word: 'fishy', emoji: '🐟' },
      { word: 'rocky', emoji: '🪨' },
      { word: 'brine', emoji: '🌊' },
    ],
  },
  {
    name: 'cloud',
    emoji: '☁️',
    words: [
      { word: 'cloud', emoji: '☁️' },
      { word: 'light', emoji: '💡' },
      { word: 'rainy', emoji: '🌧️' },
      { word: 'foggy', emoji: '🌫️' },
      { word: 'windy', emoji: '💨' },
      { word: 'storm', emoji: '⛈️' },
      { word: 'drift', emoji: '🌊' },
      { word: 'misty', emoji: '🌫️' },
      { word: 'sunny', emoji: '☀️' },
      { word: 'above', emoji: '⬆️' },
      { word: 'float', emoji: '🎈' },
      { word: 'glide', emoji: '🪁' },
      { word: 'wispy', emoji: '🌫️' },
      { word: 'gusty', emoji: '💨' },
      { word: 'puffy', emoji: '☁️' },
      { word: 'fluff', emoji: '🐑' },
      { word: 'crisp', emoji: '🍃' },
      { word: 'vapor', emoji: '💨' },
      { word: 'moist', emoji: '💧' },
      { word: 'swirl', emoji: '🌀' },
      { word: 'frost', emoji: '❄️' },
      { word: 'patch', emoji: '🏔️' },
      { word: 'white', emoji: '⬜' },
      { word: 'layer', emoji: '🎂' },
      { word: 'sheet', emoji: '📄' },
      { word: 'clear', emoji: '🔭' },
      { word: 'angel', emoji: '👼' },
      { word: 'shiny', emoji: '✨' },
      { word: 'blowy', emoji: '💨' },
      { word: 'perch', emoji: '🐦' },
    ],
  },
  // ── 6-letter words ──────────────────────────────────────────────────────────
  {
    name: 'olympus mons',
    emoji: '🔴',
    words: [
      { word: 'planet', emoji: '🌍' },
      { word: 'crater', emoji: '🌋' },
      { word: 'canyon', emoji: '🏜️' },
      { word: 'desert', emoji: '🏜️' },
      { word: 'launch', emoji: '🚀' },
      { word: 'frozen', emoji: '❄️' },
      { word: 'valley', emoji: '🏔️' },
      { word: 'summit', emoji: '⛰️' },
      { word: 'oxygen', emoji: '💨' },
      { word: 'lander', emoji: '🛸' },
      { word: 'rocket', emoji: '🚀' },
      { word: 'garden', emoji: '🌻' },
      { word: 'hammer', emoji: '🔨' },
      { word: 'castle', emoji: '🏰' },
      { word: 'bridge', emoji: '🌉' },
      { word: 'engine', emoji: '🚂' },
      { word: 'flower', emoji: '🌸' },
      { word: 'pencil', emoji: '✏️' },
      { word: 'rabbit', emoji: '🐰' },
      { word: 'school', emoji: '🏫' },
      { word: 'turtle', emoji: '🐢' },
      { word: 'violin', emoji: '🎻' },
      { word: 'window', emoji: '🪟' },
      { word: 'butter', emoji: '🧈' },
      { word: 'candle', emoji: '🕯️' },
      { word: 'finger', emoji: '👆' },
      { word: 'giggle', emoji: '😂' },
      { word: 'insect', emoji: '🐛' },
      { word: 'jigsaw', emoji: '🧩' },
      { word: 'muffin', emoji: '🧁' },
    ],
  },
  {
    name: 'space',
    emoji: '🚀',
    words: [
      { word: 'galaxy', emoji: '🌌' },
      { word: 'nebula', emoji: '🌌' },
      { word: 'saturn', emoji: '🪐' },
      { word: 'cosmic', emoji: '🌌' },
      { word: 'meteor', emoji: '☄️' },
      { word: 'starry', emoji: '🌟' },
      { word: 'bright', emoji: '✨' },
      { word: 'silent', emoji: '🌌' },
      { word: 'wonder', emoji: '🌟' },
      { word: 'silver', emoji: '⭐' },
      { word: 'kitten', emoji: '🐱' },
      { word: 'ladder', emoji: '🪜' },
      { word: 'monkey', emoji: '🐒' },
      { word: 'doctor', emoji: '👩‍⚕️' },
      { word: 'purple', emoji: '💜' },
      { word: 'pretty', emoji: '🌸' },
      { word: 'button', emoji: '🔘' },
      { word: 'circle', emoji: '⭕' },
      { word: 'mirror', emoji: '🪞' },
      { word: 'spider', emoji: '🕷️' },
      { word: 'parrot', emoji: '🦜' },
      { word: 'forest', emoji: '🌲' },
      { word: 'friend', emoji: '🤝' },
      { word: 'ribbon', emoji: '🎀' },
      { word: 'spring', emoji: '🌱' },
      { word: 'sleepy', emoji: '😴' },
      { word: 'soccer', emoji: '⚽' },
      { word: 'smooth', emoji: '🌊' },
      { word: 'locket', emoji: '❤️' },
      { word: 'orange', emoji: '🍊' },
    ],
  },
  {
    name: 'aurora',
    emoji: '🌌',
    words: [
      { word: 'aurora', emoji: '🌌' },
      { word: 'arctic', emoji: '🧊' },
      { word: 'tundra', emoji: '🌨️' },
      { word: 'purple', emoji: '💜' },
      { word: 'frozen', emoji: '❄️' },
      { word: 'starry', emoji: '🌟' },
      { word: 'ribbon', emoji: '🎀' },
      { word: 'marvel', emoji: '✨' },
      { word: 'wonder', emoji: '🌟' },
      { word: 'shimmy', emoji: '💃' },
      { word: 'ripple', emoji: '🌊' },
      { word: 'gentle', emoji: '🕊️' },
      { word: 'stream', emoji: '🌊' },
      { word: 'lights', emoji: '💡' },
      { word: 'colors', emoji: '🌈' },
      { word: 'dancer', emoji: '💃' },
      { word: 'spiral', emoji: '🌀' },
      { word: 'velvet', emoji: '🖤' },
      { word: 'cobalt', emoji: '🔵' },
      { word: 'canopy', emoji: '🌿' },
      { word: 'frosty', emoji: '❄️' },
      { word: 'winter', emoji: '☃️' },
      { word: 'shadow', emoji: '🌑' },
      { word: 'spirit', emoji: '👻' },
      { word: 'mystic', emoji: '🔮' },
      { word: 'signal', emoji: '📡' },
      { word: 'copper', emoji: '🟤' },
      { word: 'golden', emoji: '🌟' },
      { word: 'indigo', emoji: '🔷' },
      { word: 'radial', emoji: '✨' },
    ],
  },
  // ── 7-letter words ──────────────────────────────────────────────────────────
  {
    name: 'skyscraper',
    emoji: '🏙️',
    words: [
      { word: 'dolphin', emoji: '🐬' },
      { word: 'chicken', emoji: '🐔' },
      { word: 'blanket', emoji: '🛏️' },
      { word: 'captain', emoji: '⚓' },
      { word: 'diamond', emoji: '💎' },
      { word: 'firefly', emoji: '✨' },
      { word: 'giraffe', emoji: '🦒' },
      { word: 'popcorn', emoji: '🍿' },
      { word: 'rainbow', emoji: '🌈' },
      { word: 'sparrow', emoji: '🐦' },
      { word: 'unicorn', emoji: '🦄' },
      { word: 'monster', emoji: '👹' },
      { word: 'feather', emoji: '🪶' },
      { word: 'brother', emoji: '👦' },
      { word: 'teacher', emoji: '👩‍🏫' },
      { word: 'thunder', emoji: '⛈️' },
      { word: 'kitchen', emoji: '🍳' },
      { word: 'penguin', emoji: '🐧' },
      { word: 'lantern', emoji: '🏮' },
      { word: 'mystery', emoji: '🔍' },
      { word: 'present', emoji: '🎁' },
      { word: 'history', emoji: '📚' },
      { word: 'morning', emoji: '🌅' },
      { word: 'country', emoji: '🌍' },
      { word: 'flowers', emoji: '🌸' },
      { word: 'animals', emoji: '🦁' },
      { word: 'balloon', emoji: '🎈' },
      { word: 'chimney', emoji: '🏠' },
      { word: 'curtain', emoji: '🪟' },
      { word: 'village', emoji: '🏘️' },
    ],
  },
  {
    name: 'tornado',
    emoji: '🌪️',
    words: [
      { word: 'tornado', emoji: '🌪️' },
      { word: 'cyclone', emoji: '🌀' },
      { word: 'twister', emoji: '🌪️' },
      { word: 'thunder', emoji: '⛈️' },
      { word: 'weather', emoji: '🌤️' },
      { word: 'shelter', emoji: '🏠' },
      { word: 'warning', emoji: '⚠️' },
      { word: 'howling', emoji: '🐺' },
      { word: 'roaring', emoji: '🦁' },
      { word: 'rushing', emoji: '💨' },
      { word: 'swirled', emoji: '🌀' },
      { word: 'sunbeam', emoji: '☀️' },
      { word: 'bluster', emoji: '💨' },
      { word: 'gushing', emoji: '💦' },
      { word: 'whipped', emoji: '💨' },
      { word: 'churned', emoji: '🌊' },
      { word: 'billows', emoji: '☁️' },
      { word: 'smashed', emoji: '💥' },
      { word: 'rainbow', emoji: '🌈' },
      { word: 'windows', emoji: '🪟' },
      { word: 'rooftop', emoji: '🏠' },
      { word: 'puddles', emoji: '💧' },
      { word: 'drizzle', emoji: '🌧️' },
      { word: 'crackle', emoji: '⚡' },
      { word: 'scatter', emoji: '🍂' },
      { word: 'caravan', emoji: '🚐' },
      { word: 'outside', emoji: '🏞️' },
      { word: 'cottage', emoji: '🏡' },
      { word: 'sparkle', emoji: '✨' },
      { word: 'twirled', emoji: '💃' },
    ],
  },
  {
    name: 'glacier',
    emoji: '🧊',
    words: [
      { word: 'glacier', emoji: '🧊' },
      { word: 'iceberg', emoji: '🧊' },
      { word: 'crystal', emoji: '💎' },
      { word: 'frosted', emoji: '❄️' },
      { word: 'snowcap', emoji: '🏔️' },
      { word: 'flowing', emoji: '🌊' },
      { word: 'ancient', emoji: '🗿' },
      { word: 'beneath', emoji: '⬇️' },
      { word: 'endless', emoji: '♾️' },
      { word: 'shimmer', emoji: '✨' },
      { word: 'glisten', emoji: '💧' },
      { word: 'silence', emoji: '🤫' },
      { word: 'journey', emoji: '🗺️' },
      { word: 'pathway', emoji: '🛤️' },
      { word: 'explore', emoji: '🔍' },
      { word: 'breathe', emoji: '💨' },
      { word: 'crevice', emoji: '🕳️' },
      { word: 'distant', emoji: '🌅' },
      { word: 'melting', emoji: '💧' },
      { word: 'glowing', emoji: '🌟' },
      { word: 'dazzled', emoji: '😍' },
      { word: 'clarity', emoji: '🔭' },
      { word: 'freedom', emoji: '🦅' },
      { word: 'sunrise', emoji: '🌅' },
      { word: 'shining', emoji: '✨' },
      { word: 'coldest', emoji: '🥶' },
      { word: 'heights', emoji: '⛰️' },
      { word: 'forever', emoji: '♾️' },
      { word: 'mystery', emoji: '🔍' },
      { word: 'horizon', emoji: '🌄' },
    ],
  },
];

const AVATARS = ['🦊', '🐱', '🐶', '🐸', '🐼', '🦄'];
const DEFAULT_AVATARS = ['🦊', '🐱', '🐶', '🐸'];
const PLAYER_COLORS = { 1: '#ff4d4d', 2: '#4d94ff', 3: '#4dff88', 4: '#ffcc4d' };
const ALLOWED_COLORS = new Set(['#ff4d4d', '#4d94ff', '#4dff88', '#ffcc4d', '#cc4dff', '#ff8c4d']);

export const WORDS_PER_OBSTACLE = 30;

function makePlayer(id) {
  return {
    id,
    connected: false,
    paused: false,
    avatar: DEFAULT_AVATARS[id - 1] ?? '🦊',
    color: PLAYER_COLORS[id] ?? '#ffffff',
  };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeWordOrder(count) {
  return shuffle([...Array(count).keys()]);
}

export function newGameState() {
  const obstacle = OBSTACLES[0];
  const wordOrder = makeWordOrder(obstacle.words.length);
  const firstWord = obstacle.words[wordOrder[0]];
  return {
    tick: 0,
    paused: true,
    reasonPaused: 'start',
    obstacleIndex: 0,
    wordIndex: 0,
    wordOrder,
    letterIndex: 0,
    wordsCompleted: 0,
    wordsPerObstacle: WORDS_PER_OBSTACLE,
    currentWord: firstWord.word,
    currentEmoji: firstWord.emoji,
    obstacleName: obstacle.name,
    obstacleEmoji: obstacle.emoji,
    recentWords: [],
    celebrating: false,
    celebrateStart: 0,
    lastTypedBy: null,
    players: {
      1: makePlayer(1),
      2: makePlayer(2),
      3: makePlayer(3),
      4: makePlayer(4),
    },
  };
}

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
    // Initial start screen — unpause to begin game
    state.paused = false;
    state.reasonPaused = null;
  } else if (!state.paused) {
    // Pause mid-game
    state.paused = true;
    state.reasonPaused = 'paused';
  } else {
    // Resume from mid-game pause
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

export function applyKey(state, playerId, key) {
  if (state.paused) return;
  if (state.celebrating) return;

  const k = String(key ?? '').toLowerCase();
  if (k.length !== 1 || !/[a-z]/.test(k)) return;
  if (k !== state.currentWord[state.letterIndex]) return;

  state.letterIndex++;
  state.lastTypedBy = playerId;

  if (state.letterIndex >= state.currentWord.length) {
    // Word complete
    const done = { word: state.currentWord, emoji: state.currentEmoji };
    state.recentWords = [done, ...state.recentWords].slice(0, 6);
    state.wordsCompleted++;

    if (state.wordsCompleted >= state.wordsPerObstacle) {
      state.celebrating = true;
      state.celebrateStart = Date.now();
      state.letterIndex = 0;
    } else {
      state.wordIndex++;
      state.letterIndex = 0;
      const words = OBSTACLES[state.obstacleIndex].words;
      const rawIndex = state.wordOrder ? state.wordOrder[state.wordIndex] : state.wordIndex;
      const next = words[rawIndex];
      state.currentWord = next.word;
      state.currentEmoji = next.emoji;
    }
  }
}

function loadObstacle(state, obstacleIndex) {
  const obstacle = OBSTACLES[obstacleIndex];
  const wordOrder = makeWordOrder(obstacle.words.length);
  const firstWord = obstacle.words[wordOrder[0]];
  state.obstacleIndex = obstacleIndex;
  state.wordOrder = wordOrder;
  state.wordIndex = 0;
  state.letterIndex = 0;
  state.wordsCompleted = 0;
  state.recentWords = [];
  state.celebrating = false;
  state.celebrateStart = 0;
  state.lastTypedBy = null;
  state.currentWord = firstWord.word;
  state.currentEmoji = firstWord.emoji;
  state.obstacleName = obstacle.name;
  state.obstacleEmoji = obstacle.emoji;
}

export function nextObstacle(state) {
  if (!state.celebrating) return;
  const nextIdx = (state.obstacleIndex + 1) % OBSTACLES.length;
  loadObstacle(state, nextIdx);
  state.paused = true;
  state.reasonPaused = 'start';
}

export function restart(state) {
  loadObstacle(state, state.obstacleIndex);
}

export function selectObstacle(state, index) {
  const idx = Math.max(0, Math.min(OBSTACLES.length - 1, index));
  loadObstacle(state, idx);
  state.paused = true;
  state.reasonPaused = 'start';
}

export function step(state, _now) {
  state.tick++;
}
