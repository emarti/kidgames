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
  hline(20, 6, 9, '6');

  // Shoes
  rect(5, 22, 7, 23, '2');
  rect(8, 22, 10, 23, '2');
  set(10, 23, '3');

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
  const plot = (points, ch = 'X') => {
    for (const [x, y] of points) set(x, y, ch);
  };
  const plotThick = (points, dx, ch = 'X', ch2 = null) => {
    // Draw a 2px-thick arm: main pixel plus a neighbor in direction dx.
    for (const [x, y] of points) {
      set(x, y, ch);
      set(x + dx, y, ch);
      if (ch2) {
        // subtle underside shading
        set(x, y + 1, ch2);
      }
    }
  };

  // Head dome (centered)
  rect(6, 1, 9, 1, 'X');
  rect(4, 2, 11, 3, 'X');
  rect(3, 4, 12, 6, 'X');
  rect(4, 7, 11, 7, 'X');
  rect(5, 8, 10, 8, 'X');

  // Face: eyes + small mouth
  set(6, 5, '9');
  set(9, 5, '9');
  set(7, 6, '2');
  set(8, 6, '2');

  // Inner shading on the right side of the dome
  for (let y = 3; y <= 7; y++) set(10, y, '3');
  for (let y = 4; y <= 6; y++) set(11, y, '2');

  // Four arms splayed out (clearly separated columns) with curled tips.
  // Arm 1: far-left (splays left)
  const a1 = [
    [4, 9],
    [3, 10],
    [2, 11],
    [1, 12],
    [1, 13],
    [2, 14],
    [3, 15],
    [4, 16],
    [3, 17],
  ];
  plotThick(a1, +1, 'X', '2');
  plot(
    [
      [2, 12],
      [2, 14],
      [3, 16],
    ],
    '8'
  );

  // Arm 2: mid-left (mostly down)
  const a2 = [
    [6, 9],
    [6, 10],
    [5, 11],
    [5, 12],
    [4, 13],
    [5, 14],
    [6, 15],
    [7, 16],
    [8, 17],
    [7, 18],
  ];
  plotThick(a2, +1, 'X', '3');
  plot(
    [
      [6, 12],
      [6, 14],
      [7, 16],
    ],
    '8'
  );

  // Arm 3: mid-right (mostly down)
  const a3 = [
    [9, 9],
    [9, 10],
    [10, 11],
    [10, 12],
    [11, 13],
    [10, 14],
    [9, 15],
    [8, 16],
    [7, 17],
    [8, 18],
  ];
  plotThick(a3, -1, 'X', '3');
  plot(
    [
      [9, 12],
      [9, 14],
      [8, 16],
    ],
    '8'
  );

  // Arm 4: far-right (splays right)
  const a4 = [
    [11, 9],
    [12, 10],
    [13, 11],
    [14, 12],
    [14, 13],
    [13, 14],
    [12, 15],
    [11, 16],
    [12, 17],
  ];
  plotThick(a4, -1, 'X', '2');
  plot(
    [
      [13, 12],
      [13, 14],
      [12, 16],
    ],
    '8'
  );

  // Fill a small "skirt" bridge so the arms connect to the body.
  rect(5, 9, 10, 10, 'X');
  rect(5, 10, 6, 10, '2');
  rect(9, 10, 10, 10, '3');

  // Add separation/shadow near tentacle roots for definition
  set(7, 10, '.');
  set(8, 10, '.');
  set(7, 11, '1');
  set(8, 11, '1');

  // Add slight shadow under the body center
  for (let x = 6; x <= 9; x++) set(x, 11, '2');

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
  const vline = (x, y0, y1, ch) => {
    for (let y = y0; y <= y1; y++) set(x, y, ch);
  };

  // Antenna
  set(8, 0, '7');
  set(8, 1, '6');

  // Head block
  rect(4, 2, 11, 7, 'X');
  // Head edge shading
  vline(11, 3, 7, '3');
  vline(4, 3, 7, '2');
  hline(7, 5, 10, '2');

  // Face panel
  rect(5, 4, 10, 6, '2');
  // Eyes (bright)
  set(6, 5, '9');
  set(9, 5, '9');
  // Mouth grille
  set(7, 6, '4');
  set(8, 6, '4');

  // Neck
  rect(6, 8, 9, 8, '2');

  // Torso
  rect(4, 9, 11, 16, 'X');
  // Torso panel + shading
  rect(5, 11, 10, 14, '3');
  rect(6, 12, 9, 13, '2');
  // A little "core" light
  set(8, 13, '8');

  // Arms (blocky)
  rect(2, 10, 3, 13, 'X');
  rect(12, 10, 13, 13, 'X');
  // Arm shading
  rect(3, 11, 3, 13, '2');
  rect(12, 11, 12, 13, '3');

  // Hands
  rect(1, 13, 3, 14, '2');
  rect(12, 13, 14, 14, '2');
  set(14, 14, '3');

  // Legs
  rect(6, 17, 7, 21, 'X');
  rect(8, 17, 9, 21, 'X');
  // Knee/leg joints
  hline(19, 6, 9, '3');
  // Feet
  rect(5, 22, 7, 22, '2');
  rect(8, 22, 10, 22, '2');
  set(10, 22, '3');

  return grid.map((row) => row.join(''));
}

function makeSnake16x24() {
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
  const dot = (x, y, ch) => set(x, y, ch);

  // Head (top-left-ish)
  rect(3, 2, 7, 5, 'X');
  rect(2, 3, 2, 4, 'X');
  rect(8, 3, 8, 4, 'X');
  // Eyes
  dot(4, 4, '9');
  dot(6, 4, '9');
  // Mouth line + tongue tip
  dot(5, 5, '2');
  dot(5, 6, '4');
  dot(4, 7, '4');

  // Curved body (S-shape)
  // Upper body curve
  rect(6, 6, 9, 8, 'X');
  rect(8, 8, 11, 10, 'X');
  rect(6, 10, 10, 12, 'X');
  rect(4, 12, 8, 14, 'X');
  rect(3, 14, 7, 16, 'X');
  rect(5, 16, 9, 18, 'X');
  rect(7, 18, 11, 20, 'X');
  rect(8, 20, 12, 21, 'X');

  // Tail tip
  rect(11, 21, 12, 22, 'X');
  dot(13, 21, '3');

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
