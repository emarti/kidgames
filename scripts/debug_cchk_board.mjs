/**
 * debug_cchk_board.mjs — prints the Chinese Checkers board as ASCII art.
 *
 * Run with: node scripts/debug_cchk_board.mjs
 *
 * Shows the star of david grid using axial (q,r) → offset pixel mapping.
 * Each cell shows: arm initial (R/O/B/G/Y/P) for arm cells, '.' for center.
 * Also prints the pixel coordinates of each arm apex to verify geometry.
 */

// ── Geometry (copy from cchk_sim.js) ──────────────────────────────────────────

const HEX_DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];

const _ARM_QR = {
  top:        [[0,-5],[1,-5],[2,-5],[3,-5],[0,-6],[1,-6],[2,-6],[0,-7],[1,-7],[0,-8]],
  topRight:   [[5,-5],[5,-4],[5,-3],[5,-2],[6,-6],[6,-5],[6,-4],[7,-7],[7,-6],[8,-8]],
  right:      [[5,0],[4,1],[3,2],[2,3],[6,0],[5,1],[4,2],[7,0],[6,1],[8,0]],
  bottom:     [[0,5],[-1,5],[-2,5],[-3,5],[0,6],[-1,6],[-2,6],[0,7],[-1,7],[0,8]],
  bottomLeft: [[-5,5],[-5,4],[-5,3],[-5,2],[-6,6],[-6,5],[-6,4],[-7,7],[-7,6],[-8,8]],
  left:       [[-5,0],[-4,-1],[-3,-2],[-2,-3],[-6,0],[-5,-1],[-4,-2],[-7,0],[-6,-1],[-8,0]],
};

const ARM_LABEL = { top: 'R', topRight: 'B', right: 'Y', bottom: 'O', bottomLeft: 'G', left: 'P' };
const ARM_APEX  = { top: [0,-8], topRight: [8,-8], right: [8,0], bottom: [0,8], bottomLeft: [-8,8], left: [-8,0] };

// Build lookup: "q,r" → label
const cellLabel = {};
for (const [arm, cells] of Object.entries(_ARM_QR)) {
  for (const [q,r] of cells) cellLabel[`${q},${r}`] = ARM_LABEL[arm];
}

// ── Flat-top hex → pixel ───────────────────────────────────────────────────────
// x = 1.5 * q,  y = sqrt(3) * (r + q*0.5)
const SQRT3 = Math.sqrt(3);
function hexToXY(q, r) {
  return { x: 1.5 * q, y: SQRT3 * (r + q * 0.5) };
}

// ── Collect all board cells ────────────────────────────────────────────────────
const allCells = new Set();

// Central hexagon
for (let q = -4; q <= 4; q++)
  for (let r = -4; r <= 4; r++)
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q+r)) <= 4)
      allCells.add(`${q},${r}`);

// Arm cells
for (const cells of Object.values(_ARM_QR))
  for (const [q,r] of cells)
    allCells.add(`${q},${r}`);

console.log(`Total cells: ${allCells.size} (expect 121)`);
console.log();

// ── Verify each arm has exactly 10 unique cells with no overlaps ──────────────
const seen = new Set();
let ok = true;
for (const [arm, cells] of Object.entries(_ARM_QR)) {
  const dupes = cells.filter(([q,r]) => seen.has(`${q},${r}`));
  cells.forEach(([q,r]) => seen.add(`${q},${r}`));
  const inCenter = cells.filter(([q,r]) => Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r)) <= 4);
  console.log(`${arm.padEnd(11)}: ${cells.length} cells${dupes.length ? ` ⚠ DUPES: ${JSON.stringify(dupes)}` : ''}${inCenter.length ? ` ⚠ OVERLAPS CENTER: ${JSON.stringify(inCenter)}` : ''}`);
  if (dupes.length || inCenter.length) ok = false;
}
console.log(ok ? '\n✓ No duplicates or center overlaps' : '\n✗ Problems found!');
console.log();

// ── Print pixel coordinates of each arm apex ──────────────────────────────────
console.log('Arm apex pixel positions (flat-top hex, q×1.5 = x):');
for (const [arm, [q,r]] of Object.entries(ARM_APEX)) {
  const {x, y} = hexToXY(q, r);
  console.log(`  ${arm.padEnd(11)}: apex (q=${String(q).padStart(3)}, r=${String(r).padStart(3)}) → pixel (x=${x.toFixed(2).padStart(7)}, y=${y.toFixed(2).padStart(7)})`);
}
console.log();

// ── ASCII art: render on an offset grid ──────────────────────────────────────
// Convert all cells to pixel coords, find bounds, quantise to grid.
const pixelCells = [...allCells].map(k => {
  const [q,r] = k.split(',').map(Number);
  const {x,y} = hexToXY(q, r);
  return { q, r, x, y, label: cellLabel[k] ?? '.' };
});

const xs = pixelCells.map(c => c.x);
const ys = pixelCells.map(c => c.y);
const xMin = Math.min(...xs), xMax = Math.max(...xs);
const yMin = Math.min(...ys), yMax = Math.max(...ys);

// Scale to character grid: x step ≈ 1.5 → 2 chars wide; y step ≈ sqrt(3) ≈ 1.73 → 1 char tall
const SCALE_X = 2.0 / 1.5;  // chars per unit x
const SCALE_Y = 1.0 / SQRT3; // chars per unit y
const COLS = Math.round((xMax - xMin) * SCALE_X) + 4;
const ROWS = Math.round((yMax - yMin) * SCALE_Y) + 4;

const grid = Array.from({length: ROWS}, () => Array(COLS).fill(' '));

for (const c of pixelCells) {
  const col = Math.round((c.x - xMin) * SCALE_X) + 1;
  const row = Math.round((c.y - yMin) * SCALE_Y) + 1;
  if (row >= 0 && row < ROWS && col >= 0 && col < COLS)
    grid[row][col] = c.label;
}

console.log('ASCII board (R=red/top, O=orange/bottom, B=blue/topRight, G=green/bottomLeft, Y=yellow/right, P=purple/left, .=center):');
console.log('─'.repeat(COLS + 2));
for (const row of grid) console.log('|' + row.join('') + '|');
console.log('─'.repeat(COLS + 2));
console.log();
console.log('Expected Star of David: top arm straight UP, topRight arm upper-RIGHT, etc.');
console.log('In flat-top hex, y INCREASES downward, so top arm should appear at TOP of grid (small row index).');
