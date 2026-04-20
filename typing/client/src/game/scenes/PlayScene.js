import Phaser from 'phaser';

// Visual theme per obstacle index
const THEMES = [
  { label: '🌳 Tree',           bgDraw: drawTreeBg },
  { label: '⛰️ Mountain',       bgDraw: drawMountainBg },
  { label: '❄️ Snowy Mountain', bgDraw: drawSnowyMountainBg, darkText: true },
  { label: '🌋 Volcano',        bgDraw: drawVolcanoBg },
  { label: '🪸 Reef',           bgDraw: drawReefBg },
  { label: '🌴 Jungle',         bgDraw: drawJungleBg },
  { label: '🌊 Underwater',     bgDraw: drawUnderwaterBg },
  { label: '☁️ Cloud',          bgDraw: drawCloudBg, darkText: true },
  { label: '🔴 Olympus Mons',   bgDraw: drawOlympusBg },
  { label: '🚀 Space',          bgDraw: drawSpaceBg },
  { label: '🌌 Aurora',         bgDraw: drawAuroraBg },
  { label: '🏙️ Skyscraper',    bgDraw: drawSkyscraperBg },
  { label: '🌪️ Tornado',       bgDraw: drawTornadoBg },
  { label: '🧊 Glacier',        bgDraw: drawGlacierBg, darkText: true },
];

const AVATARS = ['🦊', '🐱', '🐶', '🐸', '🐼', '🦄'];
const COLORS = ['#ff4d4d', '#4d94ff', '#4dff88', '#ffcc4d', '#cc4dff', '#ff8c4d'];
const MAX_WORD_LENGTH = 7;

// ---------------------------------------------------------------------------
// Background drawing functions — each receives (g, w, gh)
// g is positioned at (0, HUD_H) so draw from y=0 downward within gh
// ---------------------------------------------------------------------------

function drawTreeBg(g, w, gh) {
  // Dappled forest sky
  g.fillGradientStyle(0x4aacdd, 0x4aacdd, 0x7acf55, 0x7acf55, 1);
  g.fillRect(0, 0, w, gh);

  // Trunk: wide, fills most of the center
  const tw = Math.round(w * 0.30);
  const tx = (w - tw) / 2;
  g.fillStyle(0x6b3a1f, 1);
  g.fillRect(tx, 0, tw, gh);

  // Bark depth stripes
  const stripes = [0x7a4427, 0x5a2d10, 0x6e3820, 0x4e2610, 0x7a4427, 0x5a2d10];
  stripes.forEach((c, s) => {
    g.fillStyle(c, 1);
    g.fillRect(tx + s * (tw / stripes.length), 0, tw / stripes.length, gh);
  });

  // Bark ridges (horizontal)
  g.fillStyle(0x3d1a08, 0.55);
  for (let y = 10; y < gh; y += 28) {
    g.fillRect(tx + 6, y, tw - 12, 3);
  }

  // Knot holes
  g.fillStyle(0x2a0e04, 0.8);
  [[tx + tw * 0.3, gh * 0.18], [tx + tw * 0.6, gh * 0.45], [tx + tw * 0.25, gh * 0.7]].forEach(([kx, ky]) => {
    g.fillEllipse(kx, ky, 16, 11);
    g.fillStyle(0x1a0802, 1);
    g.fillEllipse(kx, ky, 8, 6);
    g.fillStyle(0x2a0e04, 0.8);
  });

  // Highlight on bark (left-side light)
  g.fillStyle(0xaa6633, 0.25);
  g.fillRect(tx + 4, 0, 18, gh);

  // Branch stubs left and right
  g.fillStyle(0x5a2d10, 1);
  for (let y = 50; y < gh; y += 110) {
    const bOff = (y * 13) % 20;
    g.fillRect(tx - 48, y + bOff, 50, 18);
    g.fillRect(tx + tw - 2, y + bOff + 55, 50, 18);
    // Leaf tufts at branch tips
    g.fillStyle(0x228b22, 0.85);
    g.fillCircle(tx - 52, y + bOff + 9, 22);
    g.fillCircle(tx + tw + 50, y + bOff + 64, 22);
    g.fillStyle(0x1a6b1a, 0.65);
    g.fillCircle(tx - 62, y + bOff + 2, 16);
    g.fillCircle(tx + tw + 60, y + bOff + 57, 16);
    g.fillStyle(0x5a2d10, 1);
  }

  // Dense leaf layers on both sides
  const leafColors = [0x228b22, 0x2ea02e, 0x145214, 0x1e8c1e, 0x35c035, 0x107010];
  for (let y = 0; y < gh; y += 38) {
    leafColors.forEach((c, ci) => {
      const r = 20 + (ci * 5 + y * 3) % 18;
      const ox = (ci * 17 + y * 7) % 35;
      g.fillStyle(c, 0.85);
      g.fillCircle(tx - 22 + ox - 30, y + (ci * 13) % 35, r);
      g.fillCircle(tx + tw + 18 + ox, y + (ci * 11) % 35, r);
    });
  }

  // Sunlight shafts through canopy
  g.fillStyle(0xffff88, 0.04);
  for (let i = 0; i < 4; i++) {
    const sx = i * w * 0.08;
    g.fillTriangle(sx, 0, sx + 28, 0, sx + 55, gh);
  }

  // Small creature: squirrel on right branch
  const sqY = gh * 0.28;
  g.fillStyle(0xaa6633, 1);
  g.fillCircle(tx + tw + 54, sqY - 6, 10); // body
  g.fillCircle(tx + tw + 52, sqY - 16, 7); // head
  g.fillStyle(0xcc8844, 1);
  g.fillCircle(tx + tw + 54, sqY - 15, 4); // face
  // Bushy tail
  g.fillStyle(0xaa6633, 0.8);
  g.fillEllipse(tx + tw + 66, sqY - 4, 18, 26);
}

function drawMountainBg(g, w, gh) {
  // Blue sky at top, haze at bottom
  g.fillGradientStyle(0x1a4a8a, 0x1a4a8a, 0x8ab8d8, 0x8ab8d8, 1);
  g.fillRect(0, 0, w, gh);

  // Far rocky face
  g.fillStyle(0x6a6a72, 1);
  g.fillRect(w * 0.05, 0, w * 0.9, gh);

  // Rock strata layers with varying shades
  const strata = [0x6e6e78, 0x626268, 0x787880, 0x5c5c64, 0x707078, 0x646470, 0x6a6a74];
  strata.forEach((c, i) => {
    const ly = (gh / strata.length) * i;
    g.fillStyle(c, 1);
    g.fillRect(w * 0.05, ly, w * 0.9, gh / strata.length + 2);
    // Layer boundary shadow
    g.fillStyle(0x404048, 0.4);
    g.fillRect(w * 0.05, ly, w * 0.9, 2);
  });

  // Vertical cracks
  g.lineStyle(2, 0x3a3a44, 0.7);
  [[0.22, 0, 0.20, 1], [0.40, 0.1, 0.38, 1], [0.60, 0, 0.57, 0.9], [0.78, 0.2, 0.75, 1]].forEach(([x1f, y1f, x2f, y2f]) => {
    g.beginPath();
    g.moveTo(w * x1f, gh * y1f);
    g.lineTo(w * x2f, gh * y2f);
    g.strokePath();
  });

  // Horizontal fractures
  g.lineStyle(1, 0x505058, 0.5);
  for (let y = 15; y < gh; y += 32) {
    g.beginPath();
    g.moveTo(w * 0.06, y);
    g.lineTo(w * 0.94, y + ((y * 7) % 10) - 5);
    g.strokePath();
  }

  // Ledge overhangs with snow on top
  const ledges = [[0.12, 0.2], [0.55, 0.42], [0.18, 0.65], [0.60, 0.82]];
  ledges.forEach(([xf, yf]) => {
    const lx = w * xf, ly = gh * yf;
    g.fillStyle(0x8a8a94, 1);
    g.fillRect(lx, ly, w * 0.28, 7);
    // Snow on ledge
    g.fillStyle(0xf0f4f8, 0.9);
    g.fillRect(lx + 2, ly - 4, w * 0.28 - 4, 5);
    for (let sx = lx + 2; sx < lx + w * 0.28 - 4; sx += 16) {
      g.fillCircle(sx + 6, ly - 5, 7);
    }
  });

  // Mountain goat
  const goatX = w * 0.7, goatY = gh * 0.42 - 14;
  g.fillStyle(0xe8e0d0, 1);
  g.fillEllipse(goatX, goatY, 22, 12);
  g.fillCircle(goatX + 10, goatY - 7, 7);
  g.fillStyle(0xc8c0b0, 1);
  g.fillRect(goatX - 6, goatY + 5, 4, 10);
  g.fillRect(goatX + 2, goatY + 5, 4, 10);
  g.fillRect(goatX + 10, goatY + 5, 4, 10);
  // Horns
  g.fillStyle(0x888070, 1);
  g.fillTriangle(goatX + 8, goatY - 14, goatX + 11, goatY - 14, goatX + 10, goatY - 20);
  g.fillTriangle(goatX + 13, goatY - 13, goatX + 16, goatY - 13, goatX + 15, goatY - 19);

  // Rock face highlight
  g.fillStyle(0xa0a0aa, 0.3);
  g.fillRect(w * 0.05, 0, 12, gh);
}

function drawSnowyMountainBg(g, w, gh) {
  // Pale arctic sky
  g.fillGradientStyle(0x2255aa, 0x2255aa, 0xb8d8f0, 0xb8d8f0, 1);
  g.fillRect(0, 0, w, gh);

  // Snow face — gradient from bright white at top to blue-white
  g.fillGradientStyle(0xf8faff, 0xf8faff, 0xb0ccee, 0xb0ccee, 1);
  g.fillRect(w * 0.04, 0, w * 0.92, gh);

  // Ice layers — subtle horizontal bands of blue
  for (let y = 0; y < gh; y += 36) {
    const alpha = 0.08 + ((y * 3) % 3) * 0.05;
    g.fillStyle(0x6699cc, alpha);
    g.fillRect(w * 0.04, y, w * 0.92, 14);
  }

  // Snow ledges with rounded drifts
  for (let y = 28; y < gh; y += 72) {
    const ledgeX = w * 0.08 + ((y * 11) % (w * 0.15));
    const ledgeW = w * 0.55 + (y * 7) % (w * 0.2);
    g.fillStyle(0xffffff, 0.95);
    g.fillRect(ledgeX, y, ledgeW, 6);
    // Rounded caps
    for (let sx = ledgeX; sx < ledgeX + ledgeW; sx += 14) {
      g.fillCircle(sx + 7, y - 1, 9);
    }
    // Shadow under ledge
    g.fillStyle(0x88aac8, 0.3);
    g.fillRect(ledgeX + 4, y + 5, ledgeW, 5);
  }

  // Icicles on ledges
  g.fillStyle(0xaaccee, 0.75);
  for (let y = 28; y < gh; y += 72) {
    const ledgeX = w * 0.08 + ((y * 11) % (w * 0.15));
    for (let ix = ledgeX + 6; ix < ledgeX + w * 0.5; ix += 12 + (ix * 3) % 8) {
      const ih = 10 + (ix * 5 + y * 3) % 22;
      g.fillTriangle(ix, y + 5, ix + 5, y + 5, ix + 2, y + 5 + ih);
    }
  }

  // Deep blue crevasse shadows
  g.fillStyle(0x2255aa, 0.2);
  for (let i = 0; i < 5; i++) {
    const cx = w * (0.12 + i * 0.16);
    const cy = (i * gh * 0.23) % gh;
    g.fillRect(cx, cy, 7, gh * 0.35 + (i * 20) % 60);
  }

  // Ice crystal sparkles (cross-shaped)
  g.fillStyle(0xffffff, 0.95);
  for (let y = 5; y < gh; y += 25) {
    for (let x = w * 0.06; x < w * 0.94; x += 38) {
      const ox = (x * 7 + y * 13) % 32 - 16;
      const oy = (x * 11 + y * 7) % 20 - 10;
      const sx = x + ox, sy = y + oy;
      // Only draw some sparkles
      if ((sx * 3 + sy * 7) % 4 === 0) {
        g.fillRect(sx - 2, sy, 5, 2);
        g.fillRect(sx, sy - 2, 2, 5);
      }
    }
  }

  // Snow falling particles
  g.fillStyle(0xffffff, 0.7);
  for (let y = 0; y < gh; y += 40) {
    const sx = (y * 37) % (w * 0.9) + w * 0.05;
    const sx2 = (y * 23 + 100) % (w * 0.9) + w * 0.05;
    g.fillCircle(sx, y, 2.5);
    g.fillCircle(sx2, y + 20, 1.8);
  }

  // Ice face edge sheen
  g.fillStyle(0x88bbdd, 0.25);
  g.fillRect(w * 0.04, 0, 10, gh);
  g.fillStyle(0xffffff, 0.15);
  g.fillRect(w * 0.06, 0, 5, gh);
}

function drawVolcanoBg(g, w, gh) {
  // Smoky blood-orange sky
  g.fillGradientStyle(0x060101, 0x060101, 0x4a0c00, 0x4a0c00, 1);
  g.fillRect(0, 0, w, gh);

  // Dark basalt
  g.fillStyle(0x1c1c1c, 1);
  g.fillRect(w * 0.04, 0, w * 0.92, gh);

  // Basalt columns (natural hexagonal-ish vertical slabs)
  const colW = Math.round(w * 0.12);
  for (let c = 0; c < 8; c++) {
    const cx = w * 0.04 + c * colW;
    const shade = c % 2 === 0 ? 0x1c1c1c : 0x252525;
    g.fillStyle(shade, 1);
    g.fillRect(cx, 0, colW - 1, gh);
    // Column edge line
    g.fillStyle(0x0c0c0c, 0.6);
    g.fillRect(cx + colW - 2, 0, 2, gh);
  }

  // Horizontal cooling fractures
  g.lineStyle(1, 0x0a0a0a, 0.8);
  for (let y = 18; y < gh; y += 24) {
    g.beginPath();
    g.moveTo(w * 0.04, y);
    g.lineTo(w * 0.96, y + ((y * 5) % 6) - 3);
    g.strokePath();
  }

  // Lava channels — 3 main flows
  [0.22, 0.50, 0.75].forEach((xf, ci) => {
    const cx = w * xf;
    const cw = 10 + ci * 4;
    // Wide orange glow halo
    g.fillStyle(0xff3300, 0.08);
    g.fillRect(cx - cw * 3, 0, cw * 6, gh);
    // Mid glow
    g.fillStyle(0xff5500, 0.18);
    g.fillRect(cx - cw * 1.5, 0, cw * 3, gh);
    // Channel body
    g.fillStyle(0xff6600, 0.7);
    g.fillRect(cx - cw / 2, 0, cw, gh);
    // Bright core
    g.fillStyle(0xffcc00, 0.9);
    g.fillRect(cx - cw / 4, 0, cw / 2, gh);
    // Lava pools — irregular bright spots along channel
    for (let y = 20; y < gh; y += 45 + ci * 15) {
      const px = cx + ((y * (ci + 1) * 17) % 14) - 7;
      g.fillStyle(0xffaa00, 0.8);
      g.fillEllipse(px, y, cw * 1.8, cw * 0.9);
      g.fillStyle(0xffee44, 0.6);
      g.fillEllipse(px, y, cw * 0.9, cw * 0.45);
    }
  });

  // Glowing cracks branching off channels
  g.lineStyle(1, 0xff5500, 0.5);
  for (let i = 0; i < 8; i++) {
    const startX = w * (0.1 + i * 0.1);
    const startY = (i * 80) % gh;
    g.beginPath();
    g.moveTo(startX, startY);
    g.lineTo(startX + ((i * 31) % 40) - 20, startY + 35);
    g.lineTo(startX + ((i * 47) % 50) - 25, startY + 65);
    g.strokePath();
  }

  // Ash cloud wisps at top
  g.fillStyle(0x444444, 0.3);
  [0.15, 0.4, 0.65, 0.85].forEach((xf, i) => {
    g.fillEllipse(w * xf, gh * 0.04 + i * 8, 60, 20);
  });
  g.fillStyle(0x333333, 0.2);
  [0.25, 0.55, 0.78].forEach((xf) => {
    g.fillEllipse(w * xf, gh * 0.06, 45, 14);
  });

  // Floating embers
  g.fillStyle(0xff8800, 0.7);
  for (let y = 0; y < gh; y += 28) {
    const ex = w * 0.05 + (y * 41) % (w * 0.9);
    g.fillCircle(ex, y + (y * 13) % 20, 2);
  }

  // Sulphur tinge at edges
  g.fillStyle(0xff4400, 0.05);
  g.fillRect(0, 0, w * 0.04, gh);
  g.fillRect(w * 0.96, 0, w * 0.04, gh);
}

function drawJungleBg(g, w, gh) {
  // Humid green air
  g.fillGradientStyle(0x0a4a10, 0x0a4a10, 0x1a7a28, 0x1a7a28, 1);
  g.fillRect(0, 0, w, gh);

  // Sky patches visible through canopy gaps
  g.fillStyle(0x44aaee, 0.9);
  [[0.08, 0.0, 0.14, 0.12], [0.45, 0.0, 0.22, 0.08], [0.74, 0.02, 0.16, 0.10], [0.25, 0.15, 0.10, 0.07]].forEach(([xf, yf, wf, hf]) => {
    g.fillEllipse(w * (xf + wf / 2), gh * (yf + hf / 2), w * wf, gh * hf);
  });

  // Dense canopy layer at top
  [0x0d4a14, 0x0f5a18, 0x14651e, 0x0a4010].forEach((c, i) => {
    g.fillStyle(c, 1);
    g.fillRect(0, i * 8, w, 30);
  });

  // Background vines (thin, darker)
  g.lineStyle(3, 0x2a5a18, 0.6);
  [0.1, 0.3, 0.55, 0.72, 0.9].forEach(xf => {
    g.beginPath();
    g.moveTo(w * xf, 0);
    for (let y = 0; y <= gh; y += 18) {
      const sway = Math.sin(y * 0.08 + xf * 10) * 10;
      g.lineTo(w * xf + sway, y);
    }
    g.strokePath();
  });

  // Foreground vines (thick, bright)
  g.lineStyle(5, 0x3a7a22, 0.85);
  [0.05, 0.22, 0.68, 0.88].forEach((xf, vi) => {
    g.beginPath();
    g.moveTo(w * xf, 0);
    for (let y = 0; y <= gh; y += 15) {
      const sway = Math.sin(y * 0.09 + vi * 2.5) * 14;
      g.lineTo(w * xf + sway, y);
    }
    g.strokePath();
  });

  // Large tropical leaves (left side)
  const leafColors = [0x2ea82e, 0x228b22, 0x1a7a1a, 0x33bb33, 0x3cb73c, 0x18681a];
  for (let y = 0; y < gh; y += 52) {
    leafColors.forEach((lc, ci) => {
      const lx = (ci * 9 + y * 3) % (w * 0.22);
      const angle = (ci * 0.5 + y * 0.02) % (Math.PI * 0.6) - 0.3;
      g.fillStyle(lc, 0.88);
      g.fillEllipse(lx + 28, y + (ci * 15) % 44, 70, 20);
      // Leaf vein (midrib)
      g.lineStyle(1, 0x145214, 0.5);
      g.beginPath();
      g.moveTo(lx + 2, y + (ci * 15) % 44);
      g.lineTo(lx + 54, y + (ci * 15) % 44);
      g.strokePath();
    });
    // Right side leaves
    leafColors.forEach((lc, ci) => {
      const lx = w - 28 - (ci * 9 + y * 3) % (w * 0.22);
      g.fillStyle(lc, 0.88);
      g.fillEllipse(lx, y + (ci * 13 + 22) % 44, 70, 20);
    });
  }

  // Flowers on foreground vines
  const flowerColors = [0xff4488, 0xff8800, 0xffcc00, 0xff2255, 0xff99aa, 0xee44ff];
  [0.05, 0.22, 0.68, 0.88].forEach((xf, vi) => {
    for (let y = 35; y < gh; y += 85) {
      const sway = Math.sin(y * 0.09 + vi * 2.5) * 14;
      const fx = w * xf + sway;
      const fc = flowerColors[(vi * 3 + Math.floor(y / 28)) % flowerColors.length];
      // Petals
      g.fillStyle(fc, 0.9);
      g.fillCircle(fx + 10, y, 10);
      g.fillCircle(fx - 10, y, 10);
      g.fillCircle(fx, y + 10, 10);
      g.fillCircle(fx, y - 10, 10);
      g.fillStyle(0xffee66, 1);
      g.fillCircle(fx, y, 6);
    }
  });

  // Sunlight shafts
  g.fillStyle(0xaaff44, 0.055);
  for (let i = 0; i < 5; i++) {
    const sx = w * (i * 0.22);
    g.fillTriangle(sx - 15, 0, sx + 35, 0, sx + i * 12 + 10, gh);
  }

  // Butterfly
  const bx = w * 0.42, by = gh * 0.38;
  g.fillStyle(0xff8800, 0.85);
  g.fillEllipse(bx - 10, by - 5, 18, 12);
  g.fillEllipse(bx + 10, by - 5, 18, 12);
  g.fillEllipse(bx - 7, by + 5, 13, 9);
  g.fillEllipse(bx + 7, by + 5, 13, 9);
  g.fillStyle(0x1a1a00, 1);
  g.fillRect(bx - 1, by - 10, 2, 20);

  // Parrot (right side)
  const px = w * 0.82, py = gh * 0.62;
  g.fillStyle(0x33cc33, 1);
  g.fillCircle(px, py, 12);
  g.fillStyle(0xff4400, 1);
  g.fillCircle(px, py - 8, 8);
  g.fillStyle(0xffcc00, 1);
  g.fillEllipse(px - 5, py - 8, 8, 6); // beak
  g.fillStyle(0x111111, 1);
  g.fillCircle(px + 2, py - 10, 2);
  g.fillStyle(0x2244ee, 1);
  g.fillEllipse(px + 6, py + 4, 16, 8); // wing
}

function drawUnderwaterBg(g, w, gh) {
  // Ocean water — light above, deep below
  g.fillGradientStyle(0x0099cc, 0x0099cc, 0x002244, 0x002244, 1);
  g.fillRect(0, 0, w, gh);

  // Caustic light pattern at top (wavy light from surface)
  g.fillStyle(0x55ccff, 0.07);
  for (let i = 0; i < 9; i++) {
    const lx = w * (i * 0.12);
    g.fillTriangle(lx - 10, 0, lx + 50, 0, lx - 30 + i * 15, gh * 0.6);
  }
  // Brighter caustic shimmer near top
  g.fillStyle(0x88ddff, 0.12);
  for (let i = 0; i < 5; i++) {
    const lx = w * (0.1 + i * 0.18);
    g.fillTriangle(lx, 0, lx + 28, 0, lx - 14, gh * 0.35);
  }

  // Seaweed (left and right edges)
  [[0.03, 1], [0.09, 0.8], [0.15, 0.95], [0.82, 1], [0.88, 0.85], [0.94, 0.9]].forEach(([xf, heightFrac], si) => {
    const sx = w * xf;
    const swH = gh * 0.38 * heightFrac;
    const swBase = gh - 14;
    const colors = [0x1a7a30, 0x228b22, 0x2ea02e, 0x186820];
    g.lineStyle(7, colors[si % colors.length], 0.85);
    g.beginPath();
    g.moveTo(sx, swBase);
    for (let y = swBase; y > swBase - swH; y -= 14) {
      const sway = Math.sin((swBase - y) * 0.14 + si * 1.8) * 13;
      g.lineTo(sx + sway, y);
    }
    g.strokePath();
    // Smaller fronds
    g.lineStyle(4, colors[(si + 1) % colors.length], 0.65);
    g.beginPath();
    g.moveTo(sx + 8, swBase);
    for (let y = swBase; y > swBase - swH * 0.7; y -= 12) {
      const sway = Math.sin((swBase - y) * 0.12 + si * 2.2) * 9;
      g.lineTo(sx + 8 + sway, y);
    }
    g.strokePath();
  });

  // Sandy floor
  g.fillStyle(0xccaa66, 0.7);
  g.fillRect(0, gh - 14, w, 14);
  // Sandy ripples
  g.lineStyle(1, 0xbbaa55, 0.4);
  for (let x = 10; x < w - 10; x += 30) {
    g.beginPath();
    g.moveTo(x, gh - 10);
    g.lineTo(x + 20, gh - 12);
    g.strokePath();
  }

  // Coral formations
  const coralData = [
    [0.08, 0xff6688], [0.18, 0xff4466], [0.30, 0xff8844],
    [0.55, 0xffaa44], [0.68, 0xff66aa], [0.77, 0xdd44cc],
    [0.88, 0xff4488], [0.96, 0xff6644],
  ];
  coralData.forEach(([xf, cc]) => {
    const cx = w * xf;
    const baseY = gh - 14;
    const coralH = 28 + (cx * 3) % 38;
    // Main trunk
    g.lineStyle(5, cc, 1);
    g.beginPath();
    g.moveTo(cx, baseY);
    g.lineTo(cx, baseY - coralH);
    g.strokePath();
    // Branch left
    g.lineStyle(3, cc, 0.9);
    g.beginPath();
    g.moveTo(cx, baseY - coralH * 0.55);
    g.lineTo(cx - 14, baseY - coralH * 0.85);
    g.strokePath();
    // Branch right
    g.beginPath();
    g.moveTo(cx, baseY - coralH * 0.4);
    g.lineTo(cx + 12, baseY - coralH * 0.68);
    g.strokePath();
    // Tips
    g.fillStyle(cc, 1);
    g.fillCircle(cx, baseY - coralH, 5);
    g.fillCircle(cx - 14, baseY - coralH * 0.85, 4);
    g.fillCircle(cx + 12, baseY - coralH * 0.68, 4);
  });

  // Starfish on sand
  [[0.25, 0xffaa44], [0.60, 0xff5533], [0.85, 0xffcc55]].forEach(([xf, sc]) => {
    const sfx = w * xf, sfy = gh - 10;
    g.fillStyle(sc, 0.85);
    for (let arm = 0; arm < 5; arm++) {
      const angle = (arm / 5) * Math.PI * 2;
      g.fillRect(sfx + Math.cos(angle) * 8 - 2, sfy + Math.sin(angle) * 5 - 2, 5, 5);
    }
    g.fillCircle(sfx, sfy, 5);
  });

  // Fish
  const fishList = [
    { x: 0.18, y: 0.15, c: 0xff8800, s: 14, d: 1 },
    { x: 0.65, y: 0.22, c: 0xff3355, s: 11, d: -1 },
    { x: 0.38, y: 0.40, c: 0xffcc00, s: 13, d: 1 },
    { x: 0.80, y: 0.48, c: 0x44aaff, s: 10, d: -1 },
    { x: 0.12, y: 0.58, c: 0xff66aa, s: 12, d: 1 },
    { x: 0.52, y: 0.65, c: 0x88ff44, s: 9, d: -1 },
    { x: 0.70, y: 0.32, c: 0xffffff, s: 10, d: 1 },
    { x: 0.28, y: 0.72, c: 0xffaa44, s: 14, d: -1 },
    { x: 0.45, y: 0.12, c: 0x44ffcc, s: 8,  d: 1 },
  ];
  fishList.forEach(f => {
    const fx = w * f.x, fy = gh * f.y, s = f.s, d = f.d;
    g.fillStyle(f.c, 0.92);
    g.fillEllipse(fx, fy, s * 2.4, s);
    // Tail
    g.fillTriangle(fx - d * s * 0.9, fy - s * 0.45, fx - d * s * 0.9, fy + s * 0.45, fx - d * s * 1.8, fy);
    // Fin
    g.fillStyle(f.c, 0.6);
    g.fillTriangle(fx, fy - s * 0.5, fx + d * s * 0.4, fy - s * 0.5, fx + d * s * 0.2, fy - s);
    // Eye
    g.fillStyle(0x000000, 1);
    g.fillCircle(fx + d * s * 0.55, fy - s * 0.08, s * 0.17);
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(fx + d * s * 0.57, fy - s * 0.10, s * 0.07);
    // Stripe for clownfish-style
    if (f.c === 0xff8800 || f.c === 0xffcc00) {
      g.fillStyle(0xffffff, 0.55);
      g.fillRect(fx - s * 0.1, fy - s * 0.48, s * 0.22, s * 0.96);
    }
  });

  // Bubbles
  g.fillStyle(0x88ddff, 0.25);
  g.lineStyle(1, 0xaaeeff, 0.35);
  for (let y = 0; y < gh - 30; y += 38) {
    const bx = w * 0.08 + (y * 29) % (w * 0.85);
    const br = 3 + (y * 7) % 9;
    g.fillCircle(bx, y, br);
    g.strokeCircle(bx, y, br);
  }
}

function drawOlympusBg(g, w, gh) {
  // Thin Martian atmosphere — very dark at top, rusty at bottom
  g.fillGradientStyle(0x0a0200, 0x0a0200, 0xb84010, 0xb84010, 1);
  g.fillRect(0, 0, w, gh * 0.12);
  g.fillGradientStyle(0xb84010, 0xb84010, 0xcc6622, 0xcc6622, 1);
  g.fillRect(0, gh * 0.12, w, gh * 0.88);

  // Ancient volcanic slope — deep rust
  g.fillStyle(0x7a2808, 1);
  g.fillRect(w * 0.04, 0, w * 0.92, gh);

  // Lava flow strata — cooled layers from billions of years ago
  const lavaStrata = [0x6a2006, 0x7a2808, 0x5a1a04, 0x8a3010, 0x642208, 0x702408, 0x5c1e06, 0x7c2a0a];
  lavaStrata.forEach((c, i) => {
    const ly = (gh / lavaStrata.length) * i;
    g.fillStyle(c, 1);
    g.fillRect(w * 0.04, ly, w * 0.92, gh / lavaStrata.length + 1);
    // Layer contact (darker)
    g.fillStyle(0x2a0a02, 0.5);
    g.fillRect(w * 0.04, ly, w * 0.92, 2);
  });

  // Impact craters (shallow on the slope)
  const craters = [[0.20, 0.12, 22], [0.62, 0.32, 16], [0.33, 0.55, 28], [0.75, 0.78, 19], [0.14, 0.82, 14], [0.52, 0.68, 12]];
  craters.forEach(([xf, yf, cr]) => {
    const cx = w * xf, cy = gh * yf;
    // Rim (slightly raised/lighter)
    g.fillStyle(0xaa4418, 0.4);
    g.fillCircle(cx, cy, cr + 4);
    // Bowl
    g.fillStyle(0x330c02, 0.75);
    g.fillCircle(cx, cy, cr);
    // Rim highlight
    g.fillStyle(0x994012, 0.35);
    g.fillCircle(cx - cr * 0.3, cy - cr * 0.3, cr * 0.55);
  });

  // Wind erosion channels (diagonal grooves)
  g.lineStyle(2, 0x3a0e04, 0.55);
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.moveTo(w * (0.06 + i * 0.12), 0);
    g.lineTo(w * (0.06 + i * 0.12) + ((i * 23) % 30) - 15, gh);
    g.strokePath();
  }

  // Dust particles drifting
  g.fillStyle(0xdd8844, 0.5);
  for (let y = 0; y < gh; y += 22) {
    const dx = w * 0.05 + (y * 47) % (w * 0.9);
    g.fillCircle(dx, y, 1.8);
    g.fillCircle(dx + 18, y + 10, 1.2);
  }

  // Distant Martian sky haze at horizon (top)
  g.fillStyle(0xff6622, 0.1);
  g.fillRect(0, 0, w, gh * 0.07);

  // Small rock outcrops
  g.fillStyle(0x4a1404, 0.9);
  for (let i = 0; i < 10; i++) {
    const rx = w * (0.08 + i * 0.09);
    const ry = gh * (0.06 + (i * 17) % 88 / 100);
    const rw = 10 + (i * 7) % 16;
    g.fillTriangle(rx, ry, rx + rw, ry, rx + rw / 2, ry - 6 - (i * 3) % 8);
  }

  // Orange dust veil at right edge
  g.fillStyle(0xcc6622, 0.06);
  g.fillRect(w * 0.84, 0, w * 0.16, gh);
}

function drawSpaceBg(g, w, gh) {
  // Pure deep space
  g.fillStyle(0x000005, 1);
  g.fillRect(0, 0, w, gh);

  // Milky Way band
  g.fillStyle(0x1a2a44, 0.35);
  g.fillRect(w * 0.08, 0, w * 0.45, gh);
  g.fillStyle(0x22334e, 0.2);
  g.fillRect(w * 0.14, 0, w * 0.32, gh);

  // Star field — many tiny stars
  g.fillStyle(0xffffff, 0.85);
  for (let y = 2; y < gh; y += 7) {
    for (let x = 2; x < w; x += 10) {
      const hash = (x * 13 + y * 7) % 9;
      if (hash < 2) {
        const sx = x + (y * 3) % 8;
        const sy = y + (x * 5) % 6;
        g.fillRect(sx, sy, 1.2, 1.2);
      }
    }
  }

  // Medium stars with twinkle glow
  g.fillStyle(0xffffff, 0.18);
  for (let i = 0; i < 18; i++) {
    const sx = (i * w * 0.067 + 22) % w;
    const sy = (i * gh * 0.11 + 15) % gh;
    g.fillCircle(sx, sy, 4);
  }
  g.fillStyle(0xffffff, 0.95);
  for (let i = 0; i < 18; i++) {
    const sx = (i * w * 0.067 + 22) % w;
    const sy = (i * gh * 0.11 + 15) % gh;
    g.fillRect(sx - 1, sy - 1, 2, 2);
  }

  // Bright stars with cross-glow
  [[0.15, 0.1], [0.72, 0.28], [0.44, 0.62], [0.88, 0.75], [0.30, 0.88]].forEach(([xf, yf]) => {
    const sx = w * xf, sy = gh * yf;
    g.fillStyle(0xffffff, 0.12);
    g.fillCircle(sx, sy, 8);
    g.fillStyle(0xffffff, 0.4);
    g.fillCircle(sx, sy, 3);
    g.fillStyle(0xffffff, 1);
    g.fillRect(sx - 5, sy - 1, 10, 2);
    g.fillRect(sx - 1, sy - 5, 2, 10);
  });

  // Earth (bottom-left)
  const ex = w * 0.14, ey = gh * 0.82, er = 52;
  g.fillStyle(0x0066bb, 0.95);
  g.fillCircle(ex, ey, er);
  g.fillStyle(0x22aa44, 0.9);
  g.fillEllipse(ex - 12, ey - 14, 32, 24);  // North America-ish
  g.fillEllipse(ex + 10, ey + 8, 24, 20);   // Southern continent
  g.fillEllipse(ex - 22, ey + 18, 20, 14);  // Another continent
  g.fillStyle(0xffffff, 0.7);
  g.fillEllipse(ex + 5, ey - 28, 40, 14);   // Arctic ice / cloud band
  g.fillStyle(0x44aaff, 0.18);
  g.fillCircle(ex, ey, er + 9);             // Atmosphere glow

  // Saturn with rings (upper right)
  const satX = w * 0.80, satY = gh * 0.20;
  const satR = 30;
  g.fillStyle(0xddbb77, 0.9);
  g.fillCircle(satX, satY, satR);
  g.fillStyle(0xccaa55, 0.6);
  g.fillEllipse(satX, satY - 6, satR * 1.8, satR * 0.7); // Band
  g.lineStyle(7, 0xbbaa55, 0.65);
  g.strokeEllipse(satX, satY, satR * 3.4, satR * 0.85);
  g.lineStyle(4, 0xccbb77, 0.4);
  g.strokeEllipse(satX, satY, satR * 4.0, satR * 1.0);

  // Space station / satellite
  const stX = w * 0.54, stY = gh * 0.42;
  g.fillStyle(0xcccccc, 0.95);
  g.fillRect(stX - 7, stY - 5, 14, 10);     // Central module
  g.fillStyle(0x4466cc, 0.9);
  g.fillRect(stX - 28, stY - 3, 18, 6);     // Left panel
  g.fillRect(stX + 10, stY - 3, 18, 6);     // Right panel
  g.fillStyle(0xaaaaaa, 0.8);
  g.fillRect(stX - 2, stY - 12, 4, 24);     // Cross beam

  // Comet / shooting star
  g.fillStyle(0xffffff, 0.85);
  g.fillCircle(w * 0.66, gh * 0.07, 3);
  g.lineStyle(2, 0xaaddff, 0.5);
  g.beginPath();
  g.moveTo(w * 0.66, gh * 0.07);
  g.lineTo(w * 0.44, gh * 0.02);
  g.strokePath();
  g.lineStyle(1, 0xaaddff, 0.25);
  g.beginPath();
  g.moveTo(w * 0.63, gh * 0.09);
  g.lineTo(w * 0.42, gh * 0.04);
  g.strokePath();

  // Colorful nebula cloud (right-center)
  g.fillStyle(0x5511aa, 0.07);
  g.fillEllipse(w * 0.72, gh * 0.55, 130, 90);
  g.fillStyle(0x2244cc, 0.06);
  g.fillEllipse(w * 0.68, gh * 0.58, 100, 70);
  g.fillStyle(0xaa1133, 0.05);
  g.fillEllipse(w * 0.75, gh * 0.52, 90, 60);

  // Moon (small, upper area)
  g.fillStyle(0xddd8c0, 0.9);
  g.fillCircle(w * 0.34, gh * 0.14, 18);
  g.fillStyle(0xbbb4a0, 0.6);
  g.fillCircle(w * 0.34 + 5, gh * 0.14 - 4, 7);
  g.fillCircle(w * 0.34 - 7, gh * 0.14 + 5, 5);
}

function drawSkyscraperBg(g, w, gh) {
  // Night sky at top
  g.fillGradientStyle(0x080e1a, 0x080e1a, 0x152035, 0x152035, 1);
  g.fillRect(0, 0, w, gh);

  // A few city stars at the top
  g.fillStyle(0xffffff, 0.5);
  for (let i = 0; i < 14; i++) {
    g.fillRect((i * w * 0.074 + 18) % w, (i * 19 + 6) % Math.round(gh * 0.12), 2, 2);
  }

  // Steel and glass facade
  g.fillStyle(0x1e2e48, 1);
  g.fillRect(w * 0.03, 0, w * 0.94, gh);

  // Floor sections — alternating tones
  const floorH = 52;
  for (let y = 0; y < gh; y += floorH) {
    const shade = (Math.floor(y / floorH) % 2 === 0) ? 0x1e2e48 : 0x182438;
    g.fillStyle(shade, 1);
    g.fillRect(w * 0.03, y, w * 0.94, floorH);
    // Concrete band (floor slab edge)
    g.fillStyle(0x0e1824, 1);
    g.fillRect(w * 0.03, y + floorH - 4, w * 0.94, 4);
  }

  // Window grid
  const winW = 15, winH = 11, winGapX = 24, winGapY = 19;
  const startX = w * 0.07;
  const endX = w * 0.93;
  const cols = Math.floor((endX - startX) / winGapX);
  for (let row = 0; row * winGapY < gh; row++) {
    for (let col = 0; col < cols; col++) {
      const wx = startX + col * winGapX;
      const wy = row * winGapY + 5;
      // Lit / unlit / warm / cool
      const hash = (row * 11 + col * 7) % 7;
      if (hash < 4) {
        const warm = hash < 2;
        g.fillStyle(warm ? 0xfff0aa : 0xddeeff, warm ? 0.88 : 0.65);
      } else {
        g.fillStyle(0x0a1222, 1);
      }
      g.fillRect(wx, wy, winW, winH);
    }
  }

  // Vertical structural columns
  g.fillStyle(0x0e1824, 1);
  const numCols = 6;
  for (let c = 0; c < numCols; c++) {
    g.fillRect(w * 0.03 + c * (w * 0.94 / numCols), 0, 4, gh);
  }

  // Reflection: diagonal glass sheen
  g.fillStyle(0xffffff, 0.025);
  g.fillTriangle(w * 0.03, 0, w * 0.28, 0, w * 0.03, gh);

  // City glow from the street below
  g.fillGradientStyle(0x000000, 0x000000, 0x441800, 0x441800, 0.5);
  g.fillRect(0, gh - 30, w, 30);

  // Helicopter light (top right)
  const hx = w * 0.84, hy = gh * 0.08;
  g.fillStyle(0xffffff, 0.9);
  g.fillCircle(hx, hy, 4);
  g.fillStyle(0xffffff, 0.15);
  g.fillCircle(hx, hy, 12);
  // Blinking red light nearby
  g.fillStyle(0xff2200, 0.8);
  g.fillCircle(hx + 18, hy - 4, 3);
}

function drawReefBg(g, w, gh) {
  // Shallow tropical water — bright above, deep teal below
  g.fillGradientStyle(0x00ccee, 0x00ccee, 0x006688, 0x006688, 1);
  g.fillRect(0, 0, w, gh);

  // Caustic light shimmer from surface
  g.fillStyle(0x88ffff, 0.07);
  for (let i = 0; i < 8; i++) {
    const lx = w * (i * 0.13);
    g.fillTriangle(lx, 0, lx + 40, 0, lx - 20 + i * 10, gh * 0.55);
  }

  // Sandy floor
  g.fillStyle(0xddcc88, 0.85);
  g.fillRect(0, gh - 18, w, 18);
  g.lineStyle(1, 0xccbb77, 0.4);
  for (let x = 8; x < w - 8; x += 26) {
    g.beginPath(); g.moveTo(x, gh - 12); g.lineTo(x + 16, gh - 14); g.strokePath();
  }

  // Coral formations
  const coralData = [
    [0.06, 0xff5577], [0.16, 0xff7722], [0.28, 0xffaa44],
    [0.42, 0xff4499], [0.56, 0xee44cc], [0.68, 0xff6644],
    [0.79, 0xff3366], [0.90, 0xffbb44],
  ];
  coralData.forEach(([xf, cc]) => {
    const cx = w * xf, baseY = gh - 18;
    const coralH = 30 + (cx * 3) % 44;
    g.lineStyle(6, cc, 1);
    g.beginPath(); g.moveTo(cx, baseY); g.lineTo(cx, baseY - coralH); g.strokePath();
    g.lineStyle(3, cc, 0.85);
    g.beginPath(); g.moveTo(cx, baseY - coralH * 0.5); g.lineTo(cx - 13, baseY - coralH * 0.8); g.strokePath();
    g.beginPath(); g.moveTo(cx, baseY - coralH * 0.35); g.lineTo(cx + 11, baseY - coralH * 0.65); g.strokePath();
    g.fillStyle(cc, 1);
    g.fillCircle(cx, baseY - coralH, 5);
    g.fillCircle(cx - 13, baseY - coralH * 0.8, 4);
    g.fillCircle(cx + 11, baseY - coralH * 0.65, 4);
  });

  // Seaweed on edges
  [[0.02, 1], [0.08, 0.75], [0.86, 0.9], [0.93, 1]].forEach(([xf, hf], si) => {
    const sx = w * xf, swH = gh * 0.32 * hf;
    g.lineStyle(6, 0x22aa44, 0.8);
    g.beginPath(); g.moveTo(sx, gh - 18);
    for (let y = gh - 18; y > gh - 18 - swH; y -= 12) {
      g.lineTo(sx + Math.sin((gh - 18 - y) * 0.15 + si * 1.8) * 11, y);
    }
    g.strokePath();
  });

  // Fish
  [[0.22, 0.20, 0xff8822, 12, 1], [0.60, 0.35, 0xffee00, 10, -1],
   [0.40, 0.55, 0x44ddff, 11, 1], [0.75, 0.18, 0xff4466, 9, -1],
   [0.14, 0.62, 0xffffff, 8, 1]].forEach(([xf, yf, c, s, d]) => {
    const fx = w * xf, fy = gh * yf;
    g.fillStyle(c, 0.9);
    g.fillEllipse(fx, fy, s * 2.2, s);
    g.fillTriangle(fx - d * s * 0.9, fy - s * 0.4, fx - d * s * 0.9, fy + s * 0.4, fx - d * s * 1.7, fy);
    g.fillStyle(0x000000, 1); g.fillCircle(fx + d * s * 0.5, fy - s * 0.08, s * 0.15);
  });

  // Bubbles
  g.lineStyle(1, 0xaaeeff, 0.3);
  for (let y = 0; y < gh - 30; y += 34) {
    const bx = w * 0.07 + (y * 31) % (w * 0.86);
    const br = 2 + (y * 5) % 7;
    g.strokeCircle(bx, y, br);
  }
}

function drawCloudBg(g, w, gh) {
  // Bright sky — pale blue fading to white near clouds
  g.fillGradientStyle(0x55aaee, 0x55aaee, 0xddeeff, 0xddeeff, 1);
  g.fillRect(0, 0, w, gh);

  // Sun rays (top)
  g.fillStyle(0xffffcc, 0.08);
  for (let i = 0; i < 7; i++) {
    const sx = w * (0.35 + i * 0.05);
    g.fillTriangle(sx - 10, 0, sx + 10, 0, sx + i * 8 - 28, gh);
  }

  // Large fluffy clouds on each side
  const cloudColor = 0xffffff;
  const cloudGroups = [
    // [centerX fraction, top Y fraction, width fraction]
    { xf: 0.08,  yf: 0.08, wf: 0.30 },
    { xf: 0.88,  yf: 0.15, wf: 0.28 },
    { xf: 0.12,  yf: 0.38, wf: 0.32 },
    { xf: 0.85,  yf: 0.44, wf: 0.26 },
    { xf: 0.06,  yf: 0.62, wf: 0.30 },
    { xf: 0.90,  yf: 0.70, wf: 0.26 },
    { xf: 0.10,  yf: 0.84, wf: 0.32 },
    { xf: 0.87,  yf: 0.90, wf: 0.24 },
  ];
  cloudGroups.forEach(({ xf, yf, wf }) => {
    const cx = w * xf, cy = gh * yf, cw = w * wf;
    // Cloud shadow
    g.fillStyle(0xaaccee, 0.18);
    g.fillEllipse(cx, cy + 10, cw * 0.85, 22);
    // Main cloud puffs
    g.fillStyle(cloudColor, 0.96);
    g.fillEllipse(cx, cy, cw * 0.5, 36);
    g.fillEllipse(cx - cw * 0.22, cy + 8, cw * 0.38, 28);
    g.fillEllipse(cx + cw * 0.22, cy + 8, cw * 0.38, 28);
    g.fillEllipse(cx - cw * 0.38, cy + 14, cw * 0.28, 22);
    g.fillEllipse(cx + cw * 0.38, cy + 14, cw * 0.28, 22);
    // Flat base
    g.fillRect(cx - cw * 0.44, cy + 18, cw * 0.88, 10);
    // Inner highlight
    g.fillStyle(0xffffff, 0.55);
    g.fillEllipse(cx - cw * 0.06, cy - 6, cw * 0.28, 16);
  });

  // Birds (simple V shapes) in open sky
  [[0.35, 0.12], [0.50, 0.08], [0.42, 0.18], [0.60, 0.25], [0.55, 0.32]].forEach(([xf, yf]) => {
    const bx = w * xf, by = gh * yf;
    g.lineStyle(2, 0x334466, 0.55);
    g.beginPath(); g.moveTo(bx - 8, by); g.lineTo(bx - 2, by + 4); g.lineTo(bx + 2, by + 4); g.lineTo(bx + 8, by); g.strokePath();
  });

  // Small hot air balloon
  const ballX = w * 0.52, ballY = gh * 0.55;
  const ballColors = [0xff4444, 0xffcc00, 0xff4444, 0x4488ff, 0xffcc00, 0x4488ff];
  ballColors.forEach((c, i) => {
    g.fillStyle(c, 0.9);
    g.fillRect(ballX - 18 + i * 6, ballY - 28, 6, 50);
  });
  g.fillStyle(0xff4444, 0.85);
  g.fillEllipse(ballX, ballY - 10, 40, 56); // balloon shape on top
  g.fillStyle(0xffcc00, 0.9);
  g.fillRect(ballX - 11, ballY - 28, 22, 50);
  // Basket
  g.fillStyle(0xcc9944, 1);
  g.fillRect(ballX - 9, ballY + 26, 18, 12);
  // Ropes
  g.lineStyle(1, 0x886633, 0.7);
  g.beginPath(); g.moveTo(ballX - 9, ballY + 26); g.lineTo(ballX - 14, ballY + 18); g.strokePath();
  g.beginPath(); g.moveTo(ballX + 9, ballY + 26); g.lineTo(ballX + 14, ballY + 18); g.strokePath();
}

function drawAuroraBg(g, w, gh) {
  // Deep arctic night sky
  g.fillGradientStyle(0x000818, 0x000818, 0x020d22, 0x020d22, 1);
  g.fillRect(0, 0, w, gh);

  // Stars
  g.fillStyle(0xffffff, 0.8);
  for (let y = 0; y < gh * 0.7; y += 6) {
    for (let x = 0; x < w; x += 9) {
      if ((x * 11 + y * 7) % 11 < 2) g.fillRect(x + (y * 3) % 7, y + (x * 5) % 5, 1.5, 1.5);
    }
  }
  // Bright stars
  [[0.18, 0.06], [0.44, 0.12], [0.70, 0.04], [0.85, 0.18], [0.30, 0.22]].forEach(([xf, yf]) => {
    const sx = w * xf, sy = gh * yf;
    g.fillStyle(0xffffff, 0.2); g.fillCircle(sx, sy, 5);
    g.fillStyle(0xffffff, 1); g.fillRect(sx - 1, sy - 1, 2, 2);
    g.fillRect(sx - 4, sy, 8, 1); g.fillRect(sx, sy - 4, 1, 8);
  });

  // Aurora curtains — sweeping bands of color
  const auroraLayers = [
    { color: 0x00ff88, alpha: 0.12, yOff: 0.10, amp: 0.08, freq: 0.018 },
    { color: 0x00cc66, alpha: 0.22, yOff: 0.14, amp: 0.07, freq: 0.022 },
    { color: 0x8844ff, alpha: 0.10, yOff: 0.08, amp: 0.10, freq: 0.015 },
    { color: 0x44ffcc, alpha: 0.08, yOff: 0.18, amp: 0.06, freq: 0.025 },
    { color: 0x00ff88, alpha: 0.16, yOff: 0.20, amp: 0.09, freq: 0.020 },
  ];
  auroraLayers.forEach(({ color, alpha, yOff, amp, freq }) => {
    for (let stripe = 0; stripe < 3; stripe++) {
      g.fillStyle(color, alpha * (1 - stripe * 0.25));
      for (let x = 0; x < w; x += 2) {
        const baseY = gh * (yOff + stripe * 0.06);
        const curtainH = gh * (amp + stripe * 0.04);
        const wave = Math.sin(x * freq + stripe * 2.1) * gh * 0.03;
        g.fillRect(x, baseY + wave, 2, curtainH);
      }
    }
  });

  // Vertical ray shimmer lines within aurora
  g.lineStyle(1, 0x44ffaa, 0.12);
  for (let x = 10; x < w; x += 22) {
    const topY = gh * 0.07 + Math.sin(x * 0.025) * gh * 0.04;
    g.beginPath(); g.moveTo(x, topY); g.lineTo(x + (x * 3) % 12 - 6, topY + gh * 0.35); g.strokePath();
  }

  // Silhouetted Arctic horizon (bottom)
  g.fillStyle(0x010a18, 1);
  g.fillRect(0, gh * 0.78, w, gh * 0.22);
  // Snow mound silhouette
  g.fillStyle(0x020e20, 1);
  for (let i = 0; i < 5; i++) {
    const mx = w * (i * 0.25), mw = w * 0.30;
    g.fillEllipse(mx, gh * 0.80, mw, gh * 0.08);
  }
  // Snow top highlights
  g.fillStyle(0x445577, 0.6);
  g.fillRect(0, gh * 0.77, w, 4);
  g.fillStyle(0x8899aa, 0.3);
  g.fillRect(0, gh * 0.77, w, 2);
}

function drawTornadoBg(g, w, gh) {
  // Eerie green-grey storm sky
  g.fillGradientStyle(0x1a2a0a, 0x1a2a0a, 0x3a4820, 0x3a4820, 1);
  g.fillRect(0, 0, w, gh);

  // Heavy cloud banks
  const cloudShades = [0x2a3515, 0x222c10, 0x323e1a, 0x1e2a0e];
  cloudShades.forEach((c, i) => {
    g.fillStyle(c, 0.85);
    for (let x = 0; x < w; x += 48) {
      g.fillEllipse(x + (i * 31) % 40, gh * (0.03 + i * 0.05), 80, 30 + (x * 3) % 20);
    }
  });

  // Funnel cloud — wide at top, narrowing to a point
  const funnelCX = w * 0.50;
  const funnelTopW = w * 0.48;
  const funnelBotW = w * 0.05;
  const funnelTop = 0;
  const funnelBot = gh * 0.72;
  // Dark funnel body with layered opacity
  for (let layer = 0; layer < 8; layer++) {
    const t = layer / 8;
    const lw = funnelTopW * (1 - t) + funnelBotW * t;
    const ly = funnelTop + (funnelBot - funnelTop) * t;
    const lh = (funnelBot - funnelTop) / 8 + 2;
    g.fillStyle(0x1a2008, 0.4 + layer * 0.06);
    g.fillRect(funnelCX - lw / 2, ly, lw, lh);
  }
  // Swirling edge highlights
  g.lineStyle(2, 0x445522, 0.35);
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const lw = funnelTopW * (1 - t) + funnelBotW * t + 8;
    const ly = funnelTop + (funnelBot - funnelTop) * t;
    g.beginPath();
    g.moveTo(funnelCX - lw / 2, ly);
    g.lineTo(funnelCX - lw / 2 + ((i * 17) % 20) - 10, ly + 20);
    g.strokePath();
    g.beginPath();
    g.moveTo(funnelCX + lw / 2, ly);
    g.lineTo(funnelCX + lw / 2 + ((i * 13) % 20) - 10, ly + 20);
    g.strokePath();
  }

  // Debris field around funnel
  g.fillStyle(0x4a3820, 0.75);
  for (let i = 0; i < 20; i++) {
    const dx = w * 0.05 + (i * 47 + 30) % (w * 0.9);
    const dy = gh * 0.15 + (i * 83) % (gh * 0.55);
    const ds = 3 + (i * 7) % 8;
    g.fillRect(dx, dy, ds, ds * 0.6);
  }
  g.fillStyle(0x5a4428, 0.5);
  for (let i = 0; i < 12; i++) {
    const dx = w * 0.08 + (i * 61) % (w * 0.84);
    const dy = gh * 0.20 + (i * 71) % (gh * 0.45);
    g.fillRect(dx, dy, 12, 3);
  }

  // Ground with destroyed structures
  g.fillStyle(0x2a3010, 1);
  g.fillRect(0, gh * 0.82, w, gh * 0.18);
  // Scattered rubble
  g.fillStyle(0x3a3820, 0.9);
  [[0.10, 0.84, 22, 8], [0.35, 0.85, 16, 6], [0.65, 0.83, 28, 10], [0.85, 0.85, 18, 7]].forEach(([xf, yf, rw, rh]) => {
    g.fillRect(w * xf, gh * yf, rw, rh);
  });

  // Lightning bolt (left side)
  g.lineStyle(3, 0xddff44, 0.6);
  const lx = w * 0.22, ly1 = gh * 0.02;
  g.beginPath();
  g.moveTo(lx, ly1); g.lineTo(lx - 10, ly1 + gh * 0.18);
  g.lineTo(lx + 6, ly1 + gh * 0.18); g.lineTo(lx - 8, ly1 + gh * 0.35);
  g.strokePath();
  g.lineStyle(1, 0xeeff88, 0.3);
  g.beginPath();
  g.moveTo(lx + 2, ly1); g.lineTo(lx - 8, ly1 + gh * 0.18);
  g.lineTo(lx + 8, ly1 + gh * 0.18); g.lineTo(lx - 6, ly1 + gh * 0.35);
  g.strokePath();
}

function drawGlacierBg(g, w, gh) {
  // Deep glacial ice — rich blue-white gradient
  g.fillGradientStyle(0xddeeff, 0xddeeff, 0x4488bb, 0x4488bb, 1);
  g.fillRect(0, 0, w, gh);

  // Ice face — layered blue strata
  const iceStrata = [0xe8f4ff, 0xd0e8ff, 0xb8d8f8, 0xc8e4ff, 0xa8ccf0, 0xb8d8ff, 0x9abce0, 0xb0ccee];
  iceStrata.forEach((c, i) => {
    const ly = (gh / iceStrata.length) * i;
    g.fillStyle(c, 1);
    g.fillRect(w * 0.04, ly, w * 0.92, gh / iceStrata.length + 1);
    // Strata contact line
    g.fillStyle(0x6699cc, 0.25);
    g.fillRect(w * 0.04, ly, w * 0.92, 2);
  });

  // Deep crevasse cracks
  g.lineStyle(3, 0x2255aa, 0.6);
  [[0.18, 0, 0.20, 0.7], [0.45, 0.1, 0.42, 0.85], [0.68, 0, 0.64, 0.6], [0.82, 0.15, 0.78, 0.9]].forEach(([x1f, y1f, x2f, y2f]) => {
    g.beginPath(); g.moveTo(w * x1f, gh * y1f); g.lineTo(w * x2f, gh * y2f); g.strokePath();
    // Crevasse depth fill
    g.fillStyle(0x1133aa, 0.15);
    g.fillRect(w * x1f - 6, gh * y1f, 12, gh * (y2f - y1f));
  });
  // Thin hairline cracks
  g.lineStyle(1, 0x3366bb, 0.35);
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.moveTo(w * (0.08 + i * 0.11), 0);
    g.lineTo(w * (0.08 + i * 0.11) + (i * 19 % 30) - 15, gh * 0.5);
    g.strokePath();
  }

  // Icicle formations at horizontal ledges
  g.fillStyle(0xaaccee, 0.8);
  for (let ledgeY = 35; ledgeY < gh; ledgeY += 90) {
    const ledgeX = w * 0.06 + ((ledgeY * 11) % (w * 0.12));
    const ledgeW = w * 0.65 + (ledgeY * 7) % (w * 0.18);
    // Ledge itself
    g.fillStyle(0xccddee, 0.7);
    g.fillRect(ledgeX, ledgeY, ledgeW, 5);
    // Icicles
    g.fillStyle(0xaaccee, 0.75);
    for (let ix = ledgeX + 5; ix < ledgeX + ledgeW - 5; ix += 10 + (ix * 3) % 7) {
      const ih = 12 + (ix * 5 + ledgeY * 3) % 26;
      g.fillTriangle(ix, ledgeY + 5, ix + 4, ledgeY + 5, ix + 2, ledgeY + 5 + ih);
    }
  }

  // Ice crystal sparkles
  g.fillStyle(0xffffff, 0.9);
  for (let y = 5; y < gh; y += 22) {
    for (let x = w * 0.06; x < w * 0.94; x += 34) {
      const ox = (x * 7 + y * 13) % 28 - 14;
      const oy = (x * 11 + y * 7) % 18 - 9;
      if ((Math.floor(x) * 3 + Math.floor(y) * 7) % 4 === 0) {
        const sx = x + ox, sy = y + oy;
        g.fillRect(sx - 2, sy, 5, 1); g.fillRect(sx, sy - 2, 1, 5);
        g.fillRect(sx - 1, sy - 1, 3, 3);
      }
    }
  }

  // Soft blue edge sheen
  g.fillStyle(0x88bbdd, 0.2);
  g.fillRect(w * 0.04, 0, 10, gh);
  g.fillStyle(0xffffff, 0.12);
  g.fillRect(w * 0.06, 0, 5, gh);

  // Polar bear (small, bottom area)
  const bx = w * 0.72, by = gh * 0.82;
  g.fillStyle(0xeef4ff, 1);
  g.fillEllipse(bx, by, 28, 16);       // body
  g.fillCircle(bx + 12, by - 8, 10);   // head
  g.fillStyle(0xdde8f8, 1);
  g.fillCircle(bx + 14, by - 7, 4);    // snout
  g.fillStyle(0x111111, 1);
  g.fillCircle(bx + 15, by - 9, 2);    // eye
  g.fillStyle(0xeef4ff, 1);
  g.fillRect(bx - 10, by + 7, 5, 10); g.fillRect(bx - 2, by + 7, 5, 10);
  g.fillRect(bx + 6, by + 7, 5, 10);  // legs
}

// ---------------------------------------------------------------------------
// PlayScene
// ---------------------------------------------------------------------------
export default class PlayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PlayScene' });
  }

  create() {
    this.state = this.game.net.latestState;
    this.scrollOffset = 0;
    this.bgScrollY = 0;
    this._audioUnlocked = false;
    this.showHints = localStorage.getItem('typing_showHints') !== 'false';
    this.prevFirstRecentWord = null;
    this.letterTexts = [];
    this.emojiWordText = null;
    this.recentRowTexts = [];
    this.keyRects = {};
    this.confettiPieces = [];
    this.lastObstacleIndex = -1;

    // Graphics layers for background (two copies for seamless wrap-around scroll)
    this.bgGraphics = this.add.graphics();
    this.bgGraphics2 = this.add.graphics();

    // Recent words container (above current word)
    this.recentContainer = this.add.container(0, 0);

    // Create letter pool
    for (let i = 0; i < MAX_WORD_LENGTH; i++) {
      const t = this.add.text(0, 0, '', {
        fontSize: '58px',
        fontStyle: 'bold',
        color: '#ffffff',
      }).setOrigin(0.5).setVisible(false);
      this.letterTexts.push(t);
    }
    this.emojiWordText = this.add.text(0, 0, '', { fontSize: '58px' }).setOrigin(0.5).setVisible(false);
    this.avatarCharText = this.add.text(0, 0, '', { fontSize: '36px' }).setOrigin(0.5, 1).setVisible(false);

    // Recent word text objects (6 rows)
    for (let i = 0; i < 6; i++) {
      const t = this.add.text(0, 0, '', {
        fontSize: '34px',
        color: '#dddddd',
      }).setOrigin(0.5).setVisible(false);
      this.recentRowTexts.push(t);
    }

    // Progress bar (right side)
    this.progressBg = this.add.graphics();
    this.progressFill = this.add.graphics();
    this.progressLabel = this.add.text(0, 0, '', {
      fontSize: '14px', color: '#ffffff',
    }).setOrigin(0.5);

    // HUD
    this.hudGraphics = this.add.graphics();
    this.roomText = this.add.text(0, 0, '', { fontSize: '16px', color: '#94a3b8' });
    this.obstacleText = this.add.text(0, 0, '', { fontSize: '16px', color: '#ffd24d', fontStyle: 'bold' });
    this.playerDots = [];
    for (let i = 0; i < 4; i++) {
      this.playerDots.push(this.add.text(0, 0, '', { fontSize: '20px' }).setVisible(false));
    }
    // Pause/menu button — top right of HUD
    this.pauseBtn = this.add.text(0, 0, '☰', {
      fontSize: '22px',
      color: '#ffffff',
      backgroundColor: '#374151',
      padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.game.net.send('pause'))
      .on('pointerover', () => this.pauseBtn.setBackgroundColor('#4b5563'))
      .on('pointerout', () => this.pauseBtn.setBackgroundColor('#374151'));

    // Keyboard
    this.kbGraphics = this.add.graphics();
    this.keyRects = {};
    this.createKeyboard();

    // Setup overlay
    this.setupContainer = null;
    this.createSetupOverlay();

    // Celebration overlay
    this.celebContainer = null;
    this.createCelebrationOverlay();

    // Confetti graphics
    this.confettiGraphics = this.add.graphics();

    // Physical keyboard input
    this.input.keyboard.on('keydown', (evt) => {
      if (evt.key.length === 1 && /[a-zA-Z]/.test(evt.key)) {
        this._unlockAudio();
        this.game.net.send('input', { key: evt.key.toLowerCase() });
      }
    });

    // Network listener
    this.game.net.addEventListener('state', (e) => {
      const prev = this.state;
      this.state = e.detail;
      this.onStateChange(prev, this.state);
    });

    this.scale.on('resize', () => {
      this.recreateLayout();
    });

    this.render();
  }

  // ---------------------------------------------------------------------------
  // Layout helpers
  // ---------------------------------------------------------------------------
  getLayout() {
    const cam = this.cameras.main;
    const W = cam.width;
    const H = cam.height;
    const HUD_H = 44;
    const KB_H = Math.min(Math.round(H * 0.42), 280);
    const GAME_H = H - HUD_H - KB_H;
    // Current word near the TOP of the game area — completed words fall below
    const WORD_Y = HUD_H + Math.round(GAME_H * 0.22);
    const WORD_SPACING = Math.round(GAME_H * 0.16);
    const KB_Y = H - KB_H;
    return { W, H, HUD_H, KB_H, GAME_H, WORD_Y, WORD_SPACING, KB_Y };
  }

  // ---------------------------------------------------------------------------
  // Background
  // ---------------------------------------------------------------------------
  drawBackground() {
    if (!this.state) return;
    const { W, GAME_H } = this.getLayout();
    const theme = THEMES[this.state.obstacleIndex % THEMES.length];
    this.bgGraphics.clear();
    this.bgGraphics2.clear();
    // Position is managed each frame by updateBgScroll(); just draw content here
    theme.bgDraw(this.bgGraphics, W, GAME_H);
    theme.bgDraw(this.bgGraphics2, W, GAME_H);
    // Reset scroll on new obstacle
    this.bgScrollY = 0;
  }

  _unlockAudio() {
    if (this._audioUnlocked) return;
    this._audioUnlocked = true;
    // Play a silent sound on first user gesture to satisfy iOS autoplay policy
    const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    a.play().catch(() => {});
  }

  _speakWord(word) {
    // BASE_URL is '/games/typing/' in prod, '/' in dev (Vite env)
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/${word}.wav`);
    audio.play().catch(() => {}); // silently skip if file missing or autoplay blocked
  }

  updateBgScroll() {
    const { HUD_H, GAME_H } = this.getLayout();
    const offset = this.bgScrollY % GAME_H;
    this.bgGraphics.setPosition(0, HUD_H + offset);
    // Second copy sits one GAME_H above to fill the gap at the top when primary shifts down
    this.bgGraphics2.setPosition(0, HUD_H + offset - GAME_H);
  }

  // ---------------------------------------------------------------------------
  // Word display
  // ---------------------------------------------------------------------------
  updateWordDisplay() {
    if (!this.state) return;
    const { currentWord, currentEmoji, letterIndex } = this.state;
    const { W, WORD_Y } = this.getLayout();

    const LETTER_SIZE = 58;
    const LETTER_STEP = Math.round(LETTER_SIZE * 0.82);
    const totalW = currentWord.length * LETTER_STEP;
    const startX = (W - totalW) / 2 + LETTER_STEP / 2;

    // Position avatar character to the left of the word (only reposition, not animate)
    if (this.avatarCharText.text) {
      this.avatarCharText.setX(startX - 48);
      this.avatarCharText.setVisible(true);
    }

    const theme = THEMES[this.state.obstacleIndex % THEMES.length];
    const dark = theme.darkText;
    currentWord.split('').forEach((ch, i) => {
      const lt = this.letterTexts[i];
      const typed = i < letterIndex;
      lt.setText(ch.toUpperCase());
      lt.setPosition(startX + i * LETTER_STEP, WORD_Y + this.scrollOffset);
      lt.setAlpha(typed ? 1.0 : 0.35);
      lt.setColor(typed ? (dark ? '#1a1a2e' : '#ffffff') : (dark ? '#555577' : '#cccccc'));
      lt.setVisible(true);
    });

    // Hide unused letter slots
    for (let i = currentWord.length; i < this.letterTexts.length; i++) {
      this.letterTexts[i].setVisible(false);
    }

    // Emoji to the right
    const emojiX = startX + currentWord.length * LETTER_STEP + 14;
    this.emojiWordText.setText(this.showHints ? currentEmoji : '');
    this.emojiWordText.setPosition(emojiX, WORD_Y + this.scrollOffset);
    this.emojiWordText.setVisible(true);
  }

  updateRecentWords() {
    if (!this.state) return;
    const { recentWords } = this.state;
    const { W, WORD_Y, WORD_SPACING, HUD_H, GAME_H } = this.getLayout();
    const maxY = HUD_H + GAME_H - 20; // don't draw below game area

    recentWords.slice(0, 6).forEach((rw, i) => {
      const t = this.recentRowTexts[i];
      // Completed words fall BELOW the current word
      const y = WORD_Y + (i + 1) * WORD_SPACING + this.scrollOffset;
      if (y > maxY) {
        t.setVisible(false);
        return;
      }
      const theme = THEMES[this.state.obstacleIndex % THEMES.length];
      t.setColor(theme.darkText ? '#1a1a2e' : '#dddddd');
      const emojiSuffix = (this.showHints && rw.emoji) ? `  ${rw.emoji}` : '';
      t.setText(`${rw.word.toUpperCase()}${emojiSuffix}`);
      t.setPosition(W / 2, y);
      t.setAlpha(Math.max(0.06, 0.65 - i * 0.12));
      t.setVisible(true);
    });

    for (let i = recentWords.length; i < this.recentRowTexts.length; i++) {
      this.recentRowTexts[i].setVisible(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Progress bar
  // ---------------------------------------------------------------------------
  updateProgressBar() {
    if (!this.state) return;
    const { W, H, HUD_H, GAME_H } = this.getLayout();
    const { wordsCompleted, wordsPerObstacle } = this.state;
    const frac = Math.min(1, wordsCompleted / wordsPerObstacle);

    const barX = W - 22;
    const barTop = HUD_H + 10;
    const barH = GAME_H - 20;
    const barW = 12;

    this.progressBg.clear();
    this.progressBg.fillStyle(0x000000, 0.3);
    this.progressBg.fillRect(barX - barW / 2, barTop, barW, barH);

    this.progressFill.clear();
    const fillH = Math.round(barH * frac);
    this.progressFill.fillStyle(0x4dff88, 0.85);
    this.progressFill.fillRect(barX - barW / 2, barTop + barH - fillH, barW, fillH);

    this.progressLabel.setPosition(barX, barTop - 14);
    this.progressLabel.setText(`${wordsCompleted}/${wordsPerObstacle}`);
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------
  updateHUD() {
    if (!this.state) return;
    const { W, HUD_H } = this.getLayout();
    const net = this.game.net;

    this.hudGraphics.clear();
    this.hudGraphics.fillStyle(0x000000, 0.45);
    this.hudGraphics.fillRect(0, 0, W, HUD_H);

    const theme = THEMES[this.state.obstacleIndex % THEMES.length];
    this.roomText.setPosition(8, 12);
    this.roomText.setText(`Room: ${net.roomId ?? '----'}`);

    this.obstacleText.setPosition(W / 2, 12);
    this.obstacleText.setText(theme.label).setOrigin(0.5, 0);

    // Pause button (far right)
    this.pauseBtn?.setPosition(W - 6, 6);
    this.pauseBtn?.setVisible(!this.state.paused && !this.state.celebrating);

    // Player dots (right side, left of pause button)
    let dotX = W - 58;
    [1, 2, 3, 4].forEach((pid, i) => {
      const p = this.state.players[pid];
      const dot = this.playerDots[i];
      if (p && p.connected) {
        dot.setText(p.avatar);
        dot.setPosition(dotX, 10);
        dot.setVisible(true);
        dotX -= 36;
      } else {
        dot.setVisible(false);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------
  createKeyboard() {
    const rows = [
      ['q','w','e','r','t','y','u','i','o','p'],
      ['a','s','d','f','g','h','j','k','l'],
      ['z','x','c','v','b','n','m'],
    ];

    this.kbRows = rows;
    this._buildKeyboard();
  }

  _buildKeyboard() {
    // Destroy old keys
    for (const [, { rect, label }] of Object.entries(this.keyRects)) {
      rect.destroy();
      label.destroy();
    }
    this.keyRects = {};
    this.kbGraphics.clear();

    const { W, H, KB_Y, KB_H } = this.getLayout();
    const rows = this.kbRows;

    // Keyboard background
    this.kbGraphics.fillStyle(0x2d3748, 1);
    this.kbGraphics.fillRect(0, KB_Y, W, KB_H);
    this.kbGraphics.lineStyle(1, 0x4a5568, 1);
    this.kbGraphics.beginPath();
    this.kbGraphics.moveTo(0, KB_Y);
    this.kbGraphics.lineTo(W, KB_Y);
    this.kbGraphics.strokePath();

    const PAD = 8;
    const GAP = 4;
    const maxCols = 10;
    const keyW = Math.floor((W - PAD * 2 - GAP * (maxCols - 1)) / maxCols);
    const keyH = Math.floor((KB_H - PAD * 2 - GAP * 2) / 3);
    const fontSize = Math.max(14, Math.floor(keyH * 0.48));

    rows.forEach((row, rowIdx) => {
      const rowTotalW = row.length * keyW + (row.length - 1) * GAP;
      const rowStartX = (W - rowTotalW) / 2;

      row.forEach((letter, colIdx) => {
        const kx = rowStartX + colIdx * (keyW + GAP);
        const ky = KB_Y + PAD + rowIdx * (keyH + GAP);

        const rect = this.add.rectangle(kx + keyW / 2, ky + keyH / 2, keyW, keyH, 0x4a5568, 1)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            this._unlockAudio();
            this.game.net.send('input', { key: letter });
            rect.setFillStyle(0x718096);
            this.time.delayedCall(120, () => rect.setFillStyle(0x4a5568));
          });

        const label = this.add.text(kx + keyW / 2, ky + keyH / 2, letter.toUpperCase(), {
          fontSize: `${fontSize}px`,
          color: '#ffffff',
          fontStyle: 'bold',
        }).setOrigin(0.5);

        this.keyRects[letter] = { rect, label };
      });
    });
  }

  recreateLayout() {
    this._buildKeyboard();
    this.destroySetupOverlay();
    this.createSetupOverlay();
    this.destroyCelebrationOverlay();
    this.createCelebrationOverlay();
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Setup overlay
  // ---------------------------------------------------------------------------
  createSetupOverlay() {
    const { W, H } = this.getLayout();

    this.setupContainer = this.add.container(0, 0);

    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75);
    this.setupContainer.add(overlay);

    const panelW = Math.min(520, W - 40);
    const panelH = 540;
    const px = W / 2;
    const py = H / 2;

    const panel = this.add.rectangle(px, py, panelW, panelH, 0x1e293b, 1);
    const panelBorder = this.add.rectangle(px, py, panelW, panelH, 0x475569).setFillStyle(0, 0);
    panelBorder.setStrokeStyle(2, 0x475569);
    this.setupContainer.add(panel);
    this.setupContainer.add(panelBorder);

    const title = this.add.text(px, py - panelH / 2 + 28, '✏️ TYPING', {
      fontSize: '36px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.setupContainer.add(title);

    const roomLabel = this.add.text(px, py - panelH / 2 + 68, '', {
      fontSize: '16px',
      color: '#94a3b8',
    }).setOrigin(0.5);
    this.setupRoomLabel = roomLabel;
    this.setupContainer.add(roomLabel);

    // Avatar label
    const avatarLabel = this.add.text(px - panelW / 2 + 16, py - 110, 'Pick your character:', {
      fontSize: '15px', color: '#94a3b8',
    }).setOrigin(0, 0.5);
    this.setupContainer.add(avatarLabel);

    // Avatar buttons
    const avatarBtnSize = 48;
    const avatarSpacing = 56;
    const avatarStartX = px - ((AVATARS.length - 1) * avatarSpacing) / 2;
    this.setupAvatarBtns = [];
    AVATARS.forEach((emoji, i) => {
      const bx = avatarStartX + i * avatarSpacing;
      const by = py - 76;

      const bg = this.add.rectangle(bx, by, avatarBtnSize, avatarBtnSize, 0x334155, 1)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.game.net.send('select_avatar', { avatar: emoji }));
      const label = this.add.text(bx, by, emoji, { fontSize: '28px' }).setOrigin(0.5);
      this.setupContainer.add(bg);
      this.setupContainer.add(label);
      this.setupAvatarBtns.push({ bg, emoji });
    });

    // Color label
    const colorLabel = this.add.text(px - panelW / 2 + 16, py - 10, 'Pick your color:', {
      fontSize: '15px', color: '#94a3b8',
    }).setOrigin(0, 0.5);
    this.setupContainer.add(colorLabel);

    // Color buttons
    const colorBtnSize = 38;
    const colorSpacing = 52;
    const colorStartX = px - ((COLORS.length - 1) * colorSpacing) / 2;
    this.setupColorBtns = [];
    COLORS.forEach((color, i) => {
      const bx = colorStartX + i * colorSpacing;
      const by = py + 28;
      const hex = parseInt(color.replace('#', ''), 16);

      const bg = this.add.circle(bx, by, colorBtnSize / 2, hex, 1)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.game.net.send('select_color', { color }));
      this.setupContainer.add(bg);
      this.setupColorBtns.push({ bg, color });
    });

    // Picture hints toggle
    const hintsToggleBtn = this.add.text(px, py + 54, '', {
      fontSize: '17px',
      color: '#1a1a2e',
      backgroundColor: '#4dff88',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.showHints = !this.showHints;
        localStorage.setItem('typing_showHints', this.showHints ? 'true' : 'false');
        hintsToggleBtn.setText(`Picture hints: ${this.showHints ? 'ON' : 'OFF'}`);
      });
    this.hintsToggleBtn = hintsToggleBtn;
    this.setupContainer.add(hintsToggleBtn);

    // Level selector (debug)
    const levelLabel = this.add.text(px - panelW / 2 + 16, py + 96, 'Obstacle:', {
      fontSize: '15px', color: '#94a3b8',
    }).setOrigin(0, 0.5);
    this.setupContainer.add(levelLabel);

    const levelLeftBtn = this.add.text(px - 36, py + 96, '◀', {
      fontSize: '20px', color: '#ffffff', backgroundColor: '#334155',
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (this.state) this.game.net.send('select_obstacle', { index: this.state.obstacleIndex - 1 });
      });
    this.setupContainer.add(levelLeftBtn);

    this.setupLevelText = this.add.text(px, py + 96, '1', {
      fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.setupContainer.add(this.setupLevelText);

    const levelRightBtn = this.add.text(px + 36, py + 96, '▶', {
      fontSize: '20px', color: '#ffffff', backgroundColor: '#334155',
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (this.state) this.game.net.send('select_obstacle', { index: this.state.obstacleIndex + 1 });
      });
    this.setupContainer.add(levelRightBtn);

    // Start button (initial start only)
    const startBtn = this.add.text(px, py + 148, '🚀  START !', {
      fontSize: '28px',
      color: '#1a1a2e',
      backgroundColor: '#ffd24d',
      padding: { x: 24, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.game.net.send('resume'))
      .on('pointerover', () => startBtn.setBackgroundColor('#ffe066'))
      .on('pointerout', () => startBtn.setBackgroundColor('#ffd24d'));
    this.setupContainer.add(startBtn);

    // Resume button (mid-game pause only)
    const resumeBtn = this.add.text(px, py + 140, '▶  Resume', {
      fontSize: '26px',
      color: '#1a1a2e',
      backgroundColor: '#4dff88',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.game.net.send('resume'))
      .on('pointerover', () => resumeBtn.setBackgroundColor('#7fffaa'))
      .on('pointerout', () => resumeBtn.setBackgroundColor('#4dff88'));
    this.setupResumeBtn = resumeBtn;
    this.setupContainer.add(resumeBtn);

    // Restart button (mid-game pause only, below resume)
    const restartBtn = this.add.text(px, py + 198, '↺  Restart obstacle', {
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#64748b',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.game.net.send('restart'))
      .on('pointerover', () => restartBtn.setBackgroundColor('#7a8fa8'))
      .on('pointerout', () => restartBtn.setBackgroundColor('#64748b'));
    this.setupRestartBtn = restartBtn;
    this.setupContainer.add(restartBtn);

    this.setupStartBtn = startBtn;
    this.setupContainer.setVisible(false);
  }

  destroySetupOverlay() {
    if (this.setupContainer) {
      this.setupContainer.destroy(true);
      this.setupContainer = null;
    }
  }

  updateSetupOverlay() {
    if (!this.setupContainer || !this.state) return;

    const net = this.game.net;
    const me = this.state.players[net.playerId];
    const isStart = this.state.paused && this.state.reasonPaused === 'start';

    if (this.setupRoomLabel) {
      this.setupRoomLabel.setText(`Room: ${net.roomId ?? '----'}  •  You are Player ${net.playerId}`);
    }

    // Show start OR resume+restart depending on context
    this.setupStartBtn?.setVisible(isStart);
    this.setupResumeBtn?.setVisible(!isStart);
    this.setupRestartBtn?.setVisible(!isStart);

    // Sync hints toggle label
    this.hintsToggleBtn?.setText(`Picture hints: ${this.showHints ? 'ON' : 'OFF'}`);

    // Level display
    if (this.setupLevelText) {
      this.setupLevelText.setText(`${(this.state.obstacleIndex ?? 0) + 1} / ${THEMES.length}`);
    }

    // Highlight selected avatar
    this.setupAvatarBtns?.forEach(({ bg, emoji }) => {
      const selected = me?.avatar === emoji;
      bg.setFillStyle(selected ? 0x1e40af : 0x334155);
    });

    // Highlight selected color
    this.setupColorBtns?.forEach(({ bg, color }) => {
      const selected = (me?.color ?? '').toLowerCase() === color.toLowerCase();
      bg.setAlpha(selected ? 1 : 0.45);
    });
  }

  // ---------------------------------------------------------------------------
  // Celebration overlay
  // ---------------------------------------------------------------------------
  createCelebrationOverlay() {
    const { W, H } = this.getLayout();

    this.celebContainer = this.add.container(0, 0);

    const overlay = this.add.rectangle(W / 2, H * 0.45, W, H * 0.5, 0x000000, 0.7);
    this.celebContainer.add(overlay);

    this.celebEmoji = this.add.text(W / 2, H * 0.22, '', {
      fontSize: '80px',
    }).setOrigin(0.5);
    this.celebContainer.add(this.celebEmoji);

    this.celebTitle = this.add.text(W / 2, H * 0.35, '🎉 You reached the top!', {
      fontSize: '30px',
      color: '#ffd24d',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.celebContainer.add(this.celebTitle);

    this.celebSubtitle = this.add.text(W / 2, H * 0.44, '', {
      fontSize: '20px',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.celebContainer.add(this.celebSubtitle);

    const nextBtn = this.add.text(W / 2, H * 0.54, '🌟  Next Obstacle  →', {
      fontSize: '28px',
      color: '#1a1a2e',
      backgroundColor: '#ffd24d',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.game.net.send('next_obstacle'))
      .on('pointerover', () => nextBtn.setBackgroundColor('#ffe066'))
      .on('pointerout', () => nextBtn.setBackgroundColor('#ffd24d'));
    this.celebContainer.add(nextBtn);

    this.celebContainer.setVisible(false);
  }

  destroyCelebrationOverlay() {
    if (this.celebContainer) {
      this.celebContainer.destroy(true);
      this.celebContainer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Confetti
  // ---------------------------------------------------------------------------
  spawnConfetti() {
    const { W } = this.getLayout();
    this.confettiPieces = [];
    const colors = [0xff4d4d, 0x4d94ff, 0x4dff88, 0xffcc4d, 0xcc4dff, 0xff8c4d, 0xffffff];
    for (let i = 0; i < 60; i++) {
      this.confettiPieces.push({
        x: Math.random() * W,
        y: -20 - Math.random() * 100,
        vx: (Math.random() - 0.5) * 3,
        vy: 2 + Math.random() * 4,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.2,
        w: 8 + Math.random() * 10,
        h: 5 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
      });
    }
  }

  updateConfetti(_delta) {
    if (!this.confettiPieces.length) return;
    const { H } = this.getLayout();
    this.confettiGraphics.clear();
    this.confettiPieces = this.confettiPieces.filter((p) => p.alpha > 0.05);
    for (const p of this.confettiPieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotV;
      if (p.y > H * 0.6) p.alpha -= 0.02;
      this.confettiGraphics.fillStyle(p.color, p.alpha);
      this.confettiGraphics.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
    }
  }

  // ---------------------------------------------------------------------------
  // State change handler
  // ---------------------------------------------------------------------------
  onStateChange(prev, next) {
    // Trigger scroll animation when a word completes
    if (prev && next.recentWords.length > 0 &&
        next.recentWords[0]?.word !== prev.recentWords[0]?.word) {
      const { WORD_SPACING } = this.getLayout();
      // Start completed words shifted UP (at current-word position), tween them DOWN
      this.scrollOffset = -WORD_SPACING;
      this.tweens.add({
        targets: this,
        scrollOffset: 0,
        duration: 380,
        ease: 'Quad.Out',
      });

      // Scroll background downward permanently (climbing effect)
      this.tweens.add({
        targets: this,
        bgScrollY: this.bgScrollY + WORD_SPACING,
        duration: 380,
        ease: 'Quad.Out',
      });

      // Speak the completed word
      const completedWord = next.recentWords[0]?.word;
      if (completedWord) this._speakWord(completedWord);

      // Flash the last-typed player's dot
      const typedBy = next.lastTypedBy;
      if (typedBy != null) {
        const dot = this.playerDots[typedBy - 1];
        if (dot) {
          this.tweens.add({
            targets: dot,
            scaleX: 1.6,
            scaleY: 1.6,
            yoyo: true,
            duration: 180,
          });
        }
      }
    }

    // Avatar character jump on every correct letter
    const letterAdvanced = prev &&
      (next.letterIndex !== prev.letterIndex || next.wordIndex !== prev.wordIndex) &&
      next.lastTypedBy != null;
    if (letterAdvanced) {
      const player = next.players[next.lastTypedBy];
      if (player?.avatar) {
        this.avatarCharText.setText(player.avatar);
      }
      const { WORD_Y } = this.getLayout();
      this.avatarCharText.setY(WORD_Y);
      this.tweens.killTweensOf(this.avatarCharText);
      this.tweens.add({
        targets: this.avatarCharText,
        y: WORD_Y - 35,
        yoyo: true,
        duration: 180,
        ease: 'Quad.Out',
      });
    }

    // Trigger confetti on celebration
    if (next.celebrating && !prev?.celebrating) {
      this.spawnConfetti();
    }

    // Redraw background when obstacle changes
    if (prev?.obstacleIndex !== next.obstacleIndex) {
      this.drawBackground();
    }
  }

  // ---------------------------------------------------------------------------
  // Full render (called every update)
  // ---------------------------------------------------------------------------
  render() {
    if (!this.state) return;
    const { obstacleIndex } = this.state;

    // Redraw background if obstacle changed
    if (obstacleIndex !== this.lastObstacleIndex) {
      this.lastObstacleIndex = obstacleIndex;
      this.drawBackground();
    }
    this.updateBgScroll();

    this.updateHUD();
    this.updateProgressBar();

    const paused = this.state.paused;
    const celebrating = this.state.celebrating;

    if (!paused && !celebrating) {
      this.updateWordDisplay();
      this.updateRecentWords();
    } else {
      // Hide word elements when overlays shown
      this.letterTexts.forEach(t => t.setVisible(false));
      this.emojiWordText?.setVisible(false);
      this.recentRowTexts.forEach(t => t.setVisible(false));
      this.avatarCharText?.setVisible(false);
    }

    // Overlays
    const showSetup = paused;
    const showCeleb = celebrating;

    if (this.setupContainer) {
      this.setupContainer.setVisible(showSetup);
      if (showSetup) this.updateSetupOverlay();
    }
    if (this.celebContainer) {
      this.celebContainer.setVisible(showCeleb);
      if (showCeleb && this.state) {
        this.celebEmoji?.setText(this.state.obstacleEmoji ?? '🎉');
        const nextTheme = THEMES[(this.state.obstacleIndex + 1) % THEMES.length];
        this.celebSubtitle?.setText(`Next up: ${nextTheme.label}`);
      }
    }
  }

  update(_time, delta) {
    this.render();
    this.updateConfetti(delta);
  }
}
