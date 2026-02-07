// Avatar masks are arrays of strings.
// Transparent pixel: '.'
// Class-tinted pixel: 'X' (colored by the player's selected color)
// Compatibility: '#' (treated like 'X'), '+' (darker tint), 'o' (white highlight)
// Grayscale pixels: '0'..'9' map to 8-bit gray (0=black, 9=white)
// These are original sprites (not copied from any existing game art).

const AVATARS = {
  // 16x24 knight, holding a sword (generated programmatically)
  knight: makeKnightSword16x24(),
  // 16x24 mage with big pointy hat (generated programmatically)
  mage: makeMageBigHat16x24(),
  // 16x24 little boy with backpack
  kid: makeBoyBackpack16x24(),
  // Backward-compat alias (older saved selections)
  archer: makeBoyBackpack16x24(),
  // 16x24 octopus with four splayed arms (generated programmatically)
  octopus: makeOctopusSplayed16x24(),
  // 16x24 snake (generated programmatically)
  snake: makeSnake16x24(),
  // 16x24 robot (generated programmatically)
  robot: makeRobot16x24(),
};

function makeKnightSword16x24() {
  const W = 16;
  const H = 24;
  const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));

  const set = (x, y, ch) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    grid[y][x] = ch;
  };
  const hline = (y, x0, x1, ch) => {
    const a = Math.min(x0, x1);
    const b = Math.max(x0, x1);
    for (let x = a; x <= b; x++) set(x, y, ch);
  };
  const vline = (x, y0, y1, ch) => {
    const a = Math.min(y0, y1);
    const b = Math.max(y0, y1);
    for (let y = a; y <= b; y++) set(x, y, ch);
  };
  const rect = (x0, y0, x1, y1, ch) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, ch);
  };

  // --- Silhouette / pose ---
  // Helmet + head (more helmet-like: dome + ridge + visor + cheek guards)
  rect(6, 1, 9, 1, 'X');
  rect(5, 2, 10, 2, 'X');
  rect(4, 3, 11, 5, 'X');

  // Helmet ridge highlight
  set(7, 2, '6');
  set(8, 2, '6');
  set(7, 3, '3');
  set(8, 3, '3');

  // Visor opening (dark) + eye slit (light)
  rect(6, 4, 9, 4, '1');
  set(7, 4, '7');
  set(8, 4, '7');

  // Cheek guards + breathing holes
  set(5, 5, '2');
  set(10, 5, '3');
  set(7, 5, '2');
  set(8, 5, '2');

  // Torso armor
  rect(5, 6, 10, 12, 'X');
  // Chest shading + belt
  hline(9, 5, 10, '3');
  hline(12, 5, 10, '2');

  // Shoulders
  rect(4, 6, 5, 7, 'X');
  rect(10, 6, 11, 7, 'X');

  // Left arm (down)
  rect(4, 8, 5, 11, 'X');
  rect(4, 12, 5, 13, '3');

  // Right arm (holding sword)
  rect(10, 8, 11, 10, 'X');
  rect(11, 10, 12, 11, 'X');

  // Sword (grayscale): handle + guard + blade + highlight
  // Handle
  vline(12, 12, 13, '2');
  set(11, 12, '2');
  set(13, 12, '2');
  // Blade
  vline(12, 3, 11, '6');
  vline(13, 4, 10, '4');
  // Tip
  set(12, 2, '7');
  set(12, 1, '8');

  // Legs
  rect(6, 13, 7, 18, 'X');
  rect(8, 13, 9, 18, 'X');
  // Knee shading
  hline(16, 6, 9, '3');

  // Boots
  rect(5, 19, 7, 20, '2');
  rect(8, 19, 10, 20, '2');
  set(10, 20, '3');

  // Small cape/back shadow to the left
  rect(3, 7, 4, 14, '1');
  rect(3, 15, 4, 18, '2');

  // Give the silhouette a bit more width at the bottom
  set(5, 20, '2');
  set(10, 19, '2');

  return grid.map((row) => row.join(''));
}

function makeMageBigHat16x24() {
  const W = 16;
  const H = 24;
  const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));

  const set = (x, y, ch) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    grid[y][x] = ch;
  };
  const rect = (x0, y0, x1, y1, ch) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, ch);
  };
  const hline = (y, x0, x1, ch) => {
    for (let x = x0; x <= x1; x++) set(x, y, ch);
  };
  const vline = (x, y0, y1, ch) => {
    for (let y = y0; y <= y1; y++) set(x, y, ch);
  };

  // Big pointy hat (tinted)
  // Tip
  set(8, 0, 'X');
  // Cone
  rect(7, 1, 9, 1, 'X');
  rect(6, 2, 10, 2, 'X');
  rect(5, 3, 11, 3, 'X');
  rect(5, 4, 11, 4, 'X');
  // Brim (wide)
  rect(3, 5, 13, 6, 'X');
  // Brim underside shading
  hline(6, 4, 12, '2');

  // Hat shading on the right edge
  vline(11, 2, 4, '3');
  vline(10, 3, 4, '2');

  // Face (under brim)
  rect(6, 7, 10, 9, '2');
  set(7, 8, '9');
  set(9, 8, '9');
  set(8, 9, '4');

  // Robe body (tinted)
  rect(5, 10, 11, 18, 'X');
  // Robe sleeves
  rect(3, 11, 4, 14, 'X');
  rect(12, 11, 13, 14, 'X');

  // Robe shading + folds
  vline(10, 11, 18, '3');
  vline(6, 12, 18, '2');
  hline(14, 6, 10, '2');
  hline(17, 6, 10, '2');

  // Belt / sash
  hline(13, 5, 11, '2');
  set(8, 13, '6');

  // Hands (gloves)
  rect(3, 15, 4, 15, '2');
  rect(12, 15, 13, 15, '2');

  // Feet (peek out)
  rect(6, 19, 7, 20, '2');
  rect(9, 19, 10, 20, '2');
  set(10, 20, '3');

  return grid.map((row) => row.join(''));
}

function makeBoyBackpack16x24() {
  const W = 16;
  const H = 24;
  const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));

  const set = (x, y, ch) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    grid[y][x] = ch;
  };
  const rect = (x0, y0, x1, y1, ch) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, ch);
  };
  const hline = (y, x0, x1, ch) => {
    for (let x = x0; x <= x1; x++) set(x, y, ch);
  };
  const vline = (x, y0, y1, ch) => {
    for (let y = y0; y <= y1; y++) set(x, y, ch);
  };

  // Hair (bigger, rounder head silhouette)
  rect(6, 0, 9, 0, '2');
  rect(5, 1, 10, 1, '2');
  rect(4, 2, 11, 2, '2');
  rect(4, 3, 11, 3, '2');
  // Bangs / fringe row
  rect(5, 4, 10, 4, '2');
  // Tiny hair shine highlight
  set(8, 1, '6');
  set(7, 2, '5');

  // Face (wider by 1px on each side)
  rect(4, 5, 11, 8, '7');
  // Round cheeks
  set(3, 7, '7');
  set(12, 7, '7');

  // Anime-ish big eyes (2x2 each) + tiny mouth
  rect(5, 6, 6, 7, '1');
  rect(9, 6, 10, 7, '1');
  set(6, 6, '8');
  set(10, 6, '8');
  set(8, 8, '3');

  // Shirt (tinted) (shifted down to preserve head size)
  rect(5, 9, 10, 14, 'X');
  // Sleeves
  rect(3, 10, 4, 13, 'X');
  rect(11, 10, 12, 13, 'X');
  // Hands
  rect(3, 14, 4, 14, '7');
  rect(11, 14, 12, 14, '7');

  // Backpack (grayscale) on right side/back
  rect(10, 10, 12, 17, '3');
  rect(10, 14, 12, 16, '4'); // pocket
  hline(13, 10, 12, '5'); // top highlight
  // Straps on front
  vline(6, 10, 14, '3');
  vline(9, 10, 14, '3');
  set(7, 12, '5');
  set(8, 12, '5');

  // Shorts
  rect(6, 15, 9, 17, '4');
  hline(15, 6, 9, '3'); // waistband shade

  // Legs (skin)
  rect(6, 18, 7, 21, '7');
  rect(8, 18, 9, 21, '7');

  // Shoes
  rect(5, 22, 7, 23, '2');
  rect(8, 22, 10, 23, '2');

  // Little shadow on left side
  vline(4, 10, 17, '2');

  return grid.map((row) => row.join(''));
}

function makeOctopusSplayed16x24() {
  const W = 16;
  const H = 24;
  const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));

  const set = (x, y, ch) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    grid[y][x] = ch;
  };
  const rect = (x0, y0, x1, y1, ch) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, ch);
  };

  // Head dome
  rect(5, 2, 10, 2, 'X');
  rect(4, 3, 11, 4, 'X');
  rect(3, 5, 12, 8, 'X');

  // Eyes (white highlights)
  set(6, 6, 'o');
  set(9, 6, 'o');
  set(6, 7, '1');
  set(9, 7, '1');

  // Mouth
  set(7, 8, '2');
  set(8, 8, '2');

  // Arms (splayed)
  // Left upper arm
  rect(1, 9, 3, 10, 'X');
  rect(2, 11, 4, 11, 'X');
  // Left lower arm
  rect(0, 12, 2, 13, 'X');
  rect(1, 14, 3, 14, 'X');

  // Right upper arm
  rect(12, 9, 14, 10, 'X');
  rect(11, 11, 13, 11, 'X');
  // Right lower arm
  rect(13, 12, 15, 13, 'X');
  rect(12, 14, 14, 14, 'X');

  // Lower tentacles
  rect(4, 9, 11, 16, 'X');
  // Tentacle tips
  rect(4, 17, 5, 20, 'X');
  rect(6, 17, 7, 22, 'X');
  rect(8, 17, 9, 22, 'X');
  rect(10, 17, 11, 20, 'X');

  // A little shading
  rect(10, 5, 11, 16, '+');
  rect(9, 6, 9, 16, '+');

  return grid.map((row) => row.join(''));
}

function makeRobot16x24() {
  const W = 16;
  const H = 24;
  const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));

  const set = (x, y, ch) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    grid[y][x] = ch;
  };
  const rect = (x0, y0, x1, y1, ch) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, ch);
  };
  const hline = (y, x0, x1, ch) => {
    for (let x = x0; x <= x1; x++) set(x, y, ch);
  };

  // Head
  rect(5, 1, 10, 5, 'X');
  // Antenna
  set(8, 0, '3');
  set(8, 1, '3');

  // Eyes
  rect(6, 2, 7, 3, '1');
  rect(9, 2, 9, 3, '1');
  set(7, 2, 'o');

  // Mouth grill
  hline(4, 6, 9, '3');

  // Body
  rect(4, 6, 11, 15, 'X');
  // Body panel
  rect(6, 8, 9, 12, '3');
  rect(7, 9, 8, 11, '6');

  // Arms
  rect(2, 7, 3, 12, 'X');
  rect(12, 7, 13, 12, 'X');

  // Legs
  rect(6, 16, 7, 21, 'X');
  rect(8, 16, 9, 21, 'X');

  // Feet
  rect(5, 22, 7, 23, '3');
  rect(8, 22, 10, 23, '3');

  return grid.map((row) => row.join(''));
}

function makeSnake16x24() {
  const W = 16;
  const H = 24;
  const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));

  const dot = (x, y, ch) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    grid[y][x] = ch;
  };

  // A curvy snake body: define centerline points and thicken.
  const center = [
    [7, 2],
    [7, 3],
    [7, 4],
    [8, 5],
    [9, 6],
    [10, 7],
    [10, 8],
    [9, 9],
    [8, 10],
    [7, 11],
    [6, 12],
    [5, 13],
    [5, 14],
    [6, 15],
    [7, 16],
    [8, 17],
    [9, 18],
    [10, 19],
    [10, 20],
    [9, 21],
  ];

  const addBody = (x, y) => {
    dot(x, y, 'X');
    dot(x + 1, y, 'X');
    dot(x, y + 1, 'X');
    // Slight shading on right edge
    dot(x + 1, y + 1, '+');
  };

  for (const [x, y] of center) addBody(x, y);

  // Head (a bit wider)
  dot(6, 1, 'X');
  dot(7, 1, 'X');
  dot(8, 1, 'X');
  dot(9, 1, 'X');
  dot(6, 2, 'X');
  dot(9, 2, 'X');

  // Eyes
  dot(7, 2, 'o');
  dot(8, 2, 'o');

  // Belly highlight (grayscale) along the inner curve
  const belly = [
    [6, 7],
    [7, 8],
    [9, 9],
    [9, 10],
    [8, 11],
    [6, 13],
    [5, 14],
    [5, 15],
    [6, 16],
    [7, 17],
    [9, 19],
    [10, 20],
    [11, 21],
  ];
  for (const [x, y] of belly) dot(x, y, '3');
  // A couple brighter scales
  dot(8, 9, '6');
  dot(6, 15, '6');
  dot(9, 20, '6');

  return grid.map((row) => row.join(''));
}

export function listAvatars() {
  return ['knight', 'mage', 'kid', 'octopus', 'snake', 'robot'];
}

export function drawAvatarPixels(graphics, cx, cy, cellSize, avatarName, colorHex) {
  const normalized = avatarName === 'archer' ? 'kid' : avatarName;
  const mask = AVATARS[normalized] ?? AVATARS.knight;
  const px = mask[0].length;
  const py = mask.length;

  // Fit within the cell; leave a bit of padding.
  // Slightly smaller padding helps on tablets where cells can land in the
  // "in-between" size range where pixel scaling would otherwise stay at 1.
  const pad = Math.max(1, Math.floor(cellSize * 0.06));
  const size = Math.max(8, cellSize - pad * 2);

  // Prefer rounding so the avatar grows sooner, but cap oversize so it doesn't
  // dominate the maze tile too much.
  let pixelSize = Math.max(1, Math.round(size / Math.max(px, py)));
  while (pixelSize > 1 && (py * pixelSize) > (cellSize * 1.15)) pixelSize -= 1;
  const w = px * pixelSize;
  const h = py * pixelSize;

  const x0 = Math.round(cx - w / 2);
  const y0 = Math.round(cy - h / 2);

  const fill = parseInt(String(colorHex || '#000000').replace('#', '0x'), 16);
  const eye = 0xffffff;
  const accent = darken(fill, 0.65);

  // Build outline pixels around any non-empty pixel.
  const isSolid = (ch) => ch !== '.';
  const solid = new Set();
  for (let y = 0; y < py; y++) {
    for (let x = 0; x < px; x++) {
      if (isSolid(mask[y][x])) solid.add(`${x},${y}`);
    }
  }
  const outline = new Set();
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const key of solid) {
    const [sx, sy] = key.split(',').map(Number);
    for (const [dx, dy] of dirs) {
      const nx = sx + dx;
      const ny = sy + dy;
      if (nx < 0 || nx >= px || ny < 0 || ny >= py) continue;
      const nkey = `${nx},${ny}`;
      if (!solid.has(nkey)) outline.add(nkey);
    }
  }

  // Outline pass
  graphics.fillStyle(0x000000, 1);
  for (const key of outline) {
    const [x, y] = key.split(',').map(Number);
    const rx = x0 + x * pixelSize;
    const ry = y0 + y * pixelSize;
    graphics.fillRect(rx, ry, pixelSize, pixelSize);
  }

  // Body + details pass
  for (let y = 0; y < py; y++) {
    for (let x = 0; x < px; x++) {
      const ch = mask[y][x];
      if (!isSolid(ch)) continue;

      const rx = x0 + x * pixelSize;
      const ry = y0 + y * pixelSize;

      if (ch === 'X' || ch === '#') {
        graphics.fillStyle(fill, 1);
      } else if (ch === '+') {
        graphics.fillStyle(accent, 1);
      } else if (ch === 'o') {
        graphics.fillStyle(eye, 1);
      } else if (ch >= '0' && ch <= '9') {
        const v = Math.round((Number(ch) / 9) * 255);
        const g = (v << 16) | (v << 8) | v;
        graphics.fillStyle(g, 1);
      } else {
        // Unknown non-transparent pixel -> treat as tinted.
        graphics.fillStyle(fill, 1);
      }

      graphics.fillRect(rx, ry, pixelSize, pixelSize);
    }
  }
}

function darken(rgb, amount) {
  // amount in (0..1], lower -> darker
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const nr = Math.max(0, Math.min(255, Math.floor(r * amount)));
  const ng = Math.max(0, Math.min(255, Math.floor(g * amount)));
  const nb = Math.max(0, Math.min(255, Math.floor(b * amount)));
  return (nr << 16) | (ng << 8) | nb;
}
