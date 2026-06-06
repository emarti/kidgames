// ============================================================
// Pac-Friends Level Definitions
//
// All levels use a 10-column × 12-row logical grid which
// expands to a 22×26 tile grid (GRID_W × GRID_H).
//
// Tile types (T):
//   WALL   0 — solid wall
//   DOT    1 — small pellet
//   POWER  2 — power pellet
//   EMPTY  3 — open space (no dot)
//   HOUSE  4 — ghost house interior
//   DOOR   5 — ghost house door
//   TUNNEL 6 — horizontal wrap portal (left/right edge)
//   PORTAL 7 — vertical wrap portal (top/bottom, topological)
// ============================================================

import {
  MAZE_LW, MAZE_LH, GRID_W, GRID_H,
  makePRNG, ALL_WALLS, N_BIT, S_BIT, E_BIT, W_BIT, NBRS,
  countBits, shuffle,
  generateLogicalMaze, toTileGrid, buildToHomeMap,
} from './pacfriends_maze_engine.js';

export { GRID_W, GRID_H };

export const T = {
  WALL:   0,
  DOT:    1,
  POWER:  2,
  EMPTY:  3,
  HOUSE:  4,
  DOOR:   5,
  TUNNEL: 6,
  PORTAL: 7,
};

// ============================================================
// Fixed layout constants (tile coordinates)
//
// Ghost house occupies logical cells lc=3..6, lr=4..5.
//   lc=3 -> tc=7,  lc=6 -> tc=13
//   lr=4 -> tr=9,  lr=5 -> tr=11
//
// Door row: tile row 8 (gap between lr=3 tr=7 and lr=4 tr=9).
// House interior: rows 9-10, cols 7-13 (side walls at 7,13).
// Exit corridor: row 11, cols 8-12.
//
// Tunnel: tile row 12 (gap between lr=5 tr=11 and lr=6 tr=13).
//   Left corridor  cols 0-6  (0=TUNNEL, 1-6=EMPTY).
//   Right corridor cols 14-21 (14-20=EMPTY, 21=TUNNEL).
//   The house blocks cols 7-13 -- tunnel goes around it.
//
// Power pellets: near the four corners of the playfield.
//
// Player spawns: centred below the ghost house (lr=9-10 area).
// Ghost spawns:  Blinky just above door, others inside house.
// ============================================================

const GHOST_DOOR_X = 10;
const GHOST_DOOR_Y = 8;
const HOUSE_LEFT   = 7;
const HOUSE_RIGHT  = 13;

// ============================================================
// Reserved cell predicate (10x12 logical grid)
// ============================================================
function isWallBlock(lc, lr) {
  if (lc >= 3 && lc <= 6 && lr >= 4 && lr <= 5) return true;
  if (lc >= 1 && lc <= 2 && lr >= 1 && lr <= 2) return true;
  if (lc >= 7 && lc <= 8 && lr >= 1 && lr <= 2) return true;
  if (lc >= 1 && lc <= 2 && lr >= 9 && lr <= 10) return true;
  if (lc >= 7 && lc <= 8 && lr >= 9 && lr <= 10) return true;
  return false;
}

// ============================================================
// Flood-fill connectivity repair
// ============================================================
function floodFill(grid, startR, startC) {
  const visited = new Set();
  const stack = [[startR, startC]];
  while (stack.length) {
    const [r, c] = stack.pop();
    const key = r * GRID_W + c;
    if (visited.has(key)) continue;
    if (grid[r][c] === T.WALL) continue;
    visited.add(key);
    if (r > 0)        stack.push([r - 1, c]);
    if (r < GRID_H-1) stack.push([r + 1, c]);
    if (c > 0)        stack.push([r, c - 1]);
    if (c < GRID_W-1) stack.push([r, c + 1]);
  }
  return visited;
}

function repairConnectivity(grid) {
  let seedR = -1, seedC = -1;
  outer: for (let r = 1; r < GRID_H - 1; r++) {
    for (let c = 1; c < GRID_W - 1; c++) {
      const v = grid[r][c];
      if (v !== T.WALL && v !== T.HOUSE && v !== T.DOOR) {
        seedR = r; seedC = c; break outer;
      }
    }
  }
  if (seedR === -1) return;

  for (let pass = 0; pass < 12; pass++) {
    const reachable = floodFill(grid, seedR, seedC);
    let isolated = null;
    outer2: for (let r = 1; r < GRID_H - 1; r++) {
      for (let c = 1; c < GRID_W - 1; c++) {
        const v = grid[r][c];
        if (v === T.WALL || v === T.HOUSE || v === T.DOOR) continue;
        if (!reachable.has(r * GRID_W + c)) { isolated = [r, c]; break outer2; }
      }
    }
    if (!isolated) break;

    const [ir, ic] = isolated;
    let bestR = seedR, bestC = seedC, bestD = Infinity;
    for (const key of reachable) {
      const rr = (key / GRID_W) | 0, cc = key % GRID_W;
      const d = (rr - ir) ** 2 + (cc - ic) ** 2;
      if (d < bestD) { bestD = d; bestR = rr; bestC = cc; }
    }
    for (let r = Math.min(ir, bestR); r <= Math.max(ir, bestR); r++)
      if (grid[r][ic] === T.WALL) grid[r][ic] = T.DOT;
    for (let c = Math.min(ic, bestC); c <= Math.max(ic, bestC); c++)
      if (grid[bestR][c] === T.WALL) grid[bestR][c] = T.DOT;
  }
}

// ============================================================
// applyOverlays — writes all fixed features onto the tile grid
// ============================================================
function applyOverlays(grid, portalPairs) {
  // ---- Ghost house ----
  // Row 8: top wall + door
  for (let c = HOUSE_LEFT; c <= HOUSE_RIGHT; c++) grid[8][c] = T.WALL;
  grid[8][GHOST_DOOR_X] = T.DOOR;

  // Rows 9-10: interior with side walls
  grid[9][HOUSE_LEFT]  = T.WALL; grid[9][HOUSE_RIGHT]  = T.WALL;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[9][c]  = T.HOUSE;
  grid[10][HOUSE_LEFT] = T.WALL; grid[10][HOUSE_RIGHT] = T.WALL;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[10][c] = T.HOUSE;

  // Row 11: exit corridor
  grid[11][HOUSE_LEFT] = T.WALL; grid[11][HOUSE_RIGHT] = T.WALL;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++)
    if (grid[11][c] === T.WALL) grid[11][c] = T.EMPTY;

  // Approach corridors (cols 6 and 14), rows 7-12
  for (let r = 7; r <= 12; r++) {
    if (grid[r][6]  === T.WALL) grid[r][6]  = T.EMPTY;
    if (grid[r][14] === T.WALL) grid[r][14] = T.EMPTY;
  }

  // Path directly above the door (rows 5-7, col 10)
  for (let r = 5; r <= 7; r++)
    if (grid[r][10] === T.WALL) grid[r][10] = T.EMPTY;

  // ---- Tunnel (row 12) ----
  // Row 12 is a gap row between logical rows lr=5 (tr=11) and lr=6 (tr=13).
  // Open the inner corridor so players can traverse it.  Rows 11 and 13
  // are left as the maze generator produced them — walling them off
  // destroyed maze connections for lr=5 and lr=6 cells, causing dead ends
  // and disconnections that repairConnectivity could not cleanly fix.
  grid[12][0]  = T.TUNNEL;
  grid[12][21] = T.TUNNEL;
  for (let c = 1;  c <= 5;  c++) grid[12][c] = T.EMPTY;
  for (let c = 15; c <= 20; c++) grid[12][c] = T.EMPTY;

  // ---- Power pellets ----
  // Placed at mid-height on each side column (lc=0 and lc=9),
  // rows lr=3 and lr=8 in logical space → tile rows 7 and 17.
  // These cells are never reserved and always part of the maze graph.
  grid[7][1]  = T.POWER;   // left side, upper
  grid[7][19] = T.POWER;   // right side, upper
  grid[17][1] = T.POWER;   // left side, lower
  grid[17][19]= T.POWER;   // right side, lower

  // ---- Portal border tiles ----
  // Mark all portal entry/exit tiles including left/right edge columns.
  for (const p of portalPairs) {
    grid[p.fromY][p.fromX] = T.PORTAL;
    grid[p.toY][p.toX]     = T.PORTAL;
  }

  // ---- Perimeter walls ----
  for (let c = 0; c < GRID_W; c++) {
    if (grid[0][c]          !== T.PORTAL) grid[0][c]          = T.WALL;
    if (grid[GRID_H - 1][c] !== T.PORTAL) grid[GRID_H - 1][c] = T.WALL;
  }
  for (let r = 1; r <= GRID_H - 2; r++) {
    if (r !== 12) {
      if (grid[r][0]          !== T.PORTAL) grid[r][0]          = T.WALL;
      if (grid[r][GRID_W - 1] !== T.PORTAL) grid[r][GRID_W - 1] = T.WALL;
    }
  }
}

// ============================================================
// Dead-end elimination
//
// Iteratively converts DOT/EMPTY tiles with ≤1 non-WALL
// neighbour to WALL.  Protects special tiles (POWER, TUNNEL,
// PORTAL, DOOR, HOUSE).  This is a safety net — the logical
// maze generator produces no dead ends, and overlays should
// not create them now that destructive tunnel walling is gone.
// ============================================================
function eliminateDeadEnds(grid) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 1; r < GRID_H - 1; r++) {
      for (let c = 1; c < GRID_W - 1; c++) {
        const v = grid[r][c];
        if (v !== T.DOT && v !== T.EMPTY) continue;
        let n = 0;
        if (grid[r - 1][c] !== T.WALL) n++;
        if (grid[r + 1][c] !== T.WALL) n++;
        if (grid[r][c - 1] !== T.WALL) n++;
        if (grid[r][c + 1] !== T.WALL) n++;
        if (n <= 1) {
          grid[r][c] = T.WALL;
          changed = true;
        }
      }
    }
  }
}


// ============================================================
// Maze validation (diagnostic — logs warnings, never crashes)
// ============================================================
function validateMaze(grid, seed) {
  // 1. Dead-end check
  for (let r = 1; r < GRID_H - 1; r++) {
    for (let c = 1; c < GRID_W - 1; c++) {
      const v = grid[r][c];
      if (v === T.WALL || v === T.HOUSE || v === T.DOOR) continue;
      let n = 0;
      if (grid[r - 1][c] !== T.WALL) n++;
      if (grid[r + 1][c] !== T.WALL) n++;
      if (grid[r][c - 1] !== T.WALL) n++;
      if (grid[r][c + 1] !== T.WALL) n++;
      if (n <= 1) {
        console.warn(`[pacfriends] seed=${seed} dead end at (${c},${r}) type=${v} neighbours=${n}`);
      }
    }
  }

  // 2. Connectivity check (player-accessible tiles only)
  let seedR = -1, seedC = -1;
  outer: for (let r = 1; r < GRID_H - 1; r++) {
    for (let c = 1; c < GRID_W - 1; c++) {
      const v = grid[r][c];
      if (v !== T.WALL && v !== T.HOUSE && v !== T.DOOR) {
        seedR = r; seedC = c; break outer;
      }
    }
  }
  if (seedR === -1) return;
  const reachable = floodFill(grid, seedR, seedC);
  for (let r = 1; r < GRID_H - 1; r++) {
    for (let c = 1; c < GRID_W - 1; c++) {
      const v = grid[r][c];
      if (v === T.WALL || v === T.HOUSE || v === T.DOOR) continue;
      if (!reachable.has(r * GRID_W + c)) {
        console.warn(`[pacfriends] seed=${seed} unreachable tile at (${c},${r}) type=${v}`);
      }
    }
  }

  // 3. 2×2 open-block check (single-corridor constraint)
  // Exempt overlay regions: ghost house vicinity (rows 7-12, cols 5-15)
  // and tunnel wings (row 11-13, cols 0-6 and 14-21).
  for (let r = 1; r < GRID_H - 2; r++) {
    for (let c = 1; c < GRID_W - 2; c++) {
      if (grid[r][c] !== T.WALL && grid[r][c + 1] !== T.WALL &&
          grid[r + 1][c] !== T.WALL && grid[r + 1][c + 1] !== T.WALL) {
        const types = [grid[r][c], grid[r][c+1], grid[r+1][c], grid[r+1][c+1]];
        if (types.some(t => t === T.HOUSE || t === T.DOOR || t === T.TUNNEL)) continue;
        // Overlay zones: approach corridors + ghost house + tunnel wings
        if (r >= 7 && r <= 12 && c >= 5 && c + 1 <= 15) continue;
        if (r >= 11 && r <= 13 && (c <= 6 || c >= 14)) continue;
        console.warn(`[pacfriends] seed=${seed} 2x2 open block at (${c},${r})`);
      }
    }
  }
}

// ============================================================
// Core maze generator
// ============================================================
export function generateMaze({
  seed,
  loopDensity = 0.35,
  topology = 'none',
  topologyCount = 5,
  customReservedFn = null,
} = {}) {
  const rng = makePRNG(seed);
  const reservedFn = customReservedFn ?? isWallBlock;

  const walls = generateLogicalMaze(seed, loopDensity, reservedFn);

  const portalPairs = [];
  if (topology !== 'none') {
    if (topology === 'klein_lr' || topology === 'torus_lr') {
      // Left/right wall portals — pair row lr on left with pairedLr on right.
      // Klein LR: diagonal twist (lr ↔ MAZE_LH-1-lr). Torus LR: same row.
      const validRows = Array.from({ length: MAZE_LH }, (_, i) => i)
        .filter(lr => !(lr >= 4 && lr <= 5));  // avoid ghost-house height rows
      const rows = shuffle(validRows, rng).slice(0, topologyCount);
      for (const lr of rows) {
        const pairedLr = (topology === 'torus_lr') ? lr : (MAZE_LH - 1 - lr);
        const tileRowLeft  = 1 + lr * 2;
        const tileRowRight = 1 + pairedLr * 2;
        walls[lr][0]               &= ~W_BIT;
        walls[pairedLr][MAZE_LW-1] &= ~E_BIT;
        // Left edge → right edge at mirrored row (and reverse)
        portalPairs.push({ fromX: 0,          fromY: tileRowLeft,  toX: GRID_W - 1, toY: tileRowRight });
        portalPairs.push({ fromX: GRID_W - 1, fromY: tileRowRight, toX: 0,          toY: tileRowLeft  });
      }
    } else {
      // Top/bottom portals (topology = 'torus', 'klein', 'projective')
      const validCols = Array.from({ length: MAZE_LW }, (_, i) => i)
        .filter(lc => !isWallBlock(lc, 0) && !isWallBlock(lc, MAZE_LH - 1));
      const cols = shuffle(validCols, rng).slice(0, topologyCount);
      for (const lc of cols) {
        const pairedLc = (topology === 'torus') ? lc : (MAZE_LW - 1 - lc);
        const tileColTop = 1 + lc * 2;
        const tileColBot = 1 + pairedLc * 2;
        walls[0][lc]                 &= ~N_BIT;
        walls[MAZE_LH - 1][pairedLc] &= ~S_BIT;
        portalPairs.push({ fromX: tileColTop, fromY: 0,          toX: tileColBot, toY: GRID_H - 1 });
        portalPairs.push({ fromX: tileColBot, fromY: GRID_H - 1, toX: tileColTop, toY: 0 });
      }
    }
  }

  const grid = toTileGrid(walls, reservedFn, T);

  applyOverlays(grid, portalPairs);
  repairConnectivity(grid);
  eliminateDeadEnds(grid);
  validateMaze(grid, seed);

  const toHomeMap = buildToHomeMap(grid, T, GHOST_DOOR_X, GHOST_DOOR_Y);

  return {
    tiles: grid,
    walls,
    toHomeMap,
    topology,
    portalPairs,
    playerSpawns: [
      { x:  9, y: 19 },
      { x: 11, y: 19 },
      { x:  9, y: 21 },
      { x: 11, y: 21 },
    ],
    ghostSpawns: [
      { x: 11, y: 7  },
      { x:  9, y: 10 },
      { x: 11, y: 10 },
      { x: 12, y: 10 },
    ],
    ghostHouse:  { x: HOUSE_LEFT, y: 8, w: HOUSE_RIGHT - HOUSE_LEFT + 1, h: 4 },
    ghostDoor:   { x: GHOST_DOOR_X, y: GHOST_DOOR_Y },
    tunnelRows:  [12],
    fruitSpawn:  { x: 10, y: 15 },
  };
}

// ============================================================
// Letter-B custom reserved function + generator
//
// The B outline consists of:
//   lc=0  — vertical spine (left edge)
//   lr=0  — top horizontal bar
//   lr=6  — middle horizontal bar (B's waist)
//   lr=11 — bottom horizontal bar
//   lc=9  — right column (both bump curves)
//
// All other cells become walls so Prim's carves only within
// the B shape.  Ghost house cells are always reserved.
// ============================================================
function isBReserved(lc, lr) {
  // Ghost house always stays walled (overlays handle it)
  if (lc >= 3 && lc <= 6 && lr >= 4 && lr <= 5) return true;
  // B outline cells — open for maze carving
  if (lc === 0)  return false;   // spine
  if (lr === 0)  return false;   // top bar
  if (lr === 6)  return false;   // middle bar (B's waist)
  if (lr === 11) return false;   // bottom bar
  if (lc === 9)  return false;   // right column (both bumps)
  // Everything else is a wall block
  return true;
}

function generateBMaze(seed) {
  const result = generateMaze({
    seed,
    loopDensity: 0.08,
    topology: 'none',
    topologyCount: 0,
    customReservedFn: isBReserved,
  });
  // Player spawns: 2 on spine (lc=0, tc=1), 2 on right column (lc=9, tc=19)
  result.playerSpawns = [
    { x:  1, y: 19 },
    { x: 19, y: 19 },
    { x:  1, y: 21 },
    { x: 19, y: 21 },
  ];
  // Fruit spawn on the middle bar, centre gap tile
  result.fruitSpawn = { x: 10, y: 13 };
  return result;
}

// ============================================================
// Pre-built levels 1-6
//
// Level 1 is fixed (classic sparse Pac-Man feel).
// Levels 2-6 are auto-generated with increasing loopDensity
// for greater variety.  The cycle-first engine guarantees no
// dead ends and 1-tile-wide corridors by construction.
// ============================================================
export const LEVELS = [
  // 1 — fixed classic layout
  generateMaze({ seed: 1001, loopDensity: 0.05, topology: 'none', topologyCount: 0 }),
  // 2-6 — auto-generated, increasing density
  generateMaze({ seed: 2002, loopDensity: 0.18, topology: 'none', topologyCount: 0 }),
  generateMaze({ seed: 3003, loopDensity: 0.26, topology: 'none', topologyCount: 0 }),
  generateMaze({ seed: 4004, loopDensity: 0.34, topology: 'none', topologyCount: 0 }),
  generateMaze({ seed: 5005, loopDensity: 0.40, topology: 'none', topologyCount: 0 }),
  generateMaze({ seed: 6006, loopDensity: 0.46, topology: 'none', topologyCount: 0 }),
];

// ============================================================
// Random levels 7+
// ============================================================
const TOPOLOGIES = ['klein', 'projective', 'torus'];

export function generateLevel(levelNum) {
  const seed = ((levelNum * 2654435761) + 987654321) >>> 0;
  const rng  = makePRNG(seed);
  const loopDensity   = 0.25 + rng() * 0.25;
  const topology      = rng() < 0.33 ? TOPOLOGIES[Math.floor(rng() * 3)] : 'none';
  const topologyCount = 4 + Math.floor(rng() * 3);
  return generateMaze({ seed, loopDensity, topology, topologyCount });
}

// ============================================================
// Utilities
// ============================================================
export function countDots(levelData) {
  let n = 0;
  for (const row of levelData.tiles)
    for (const cell of row)
      if (cell === T.DOT || cell === T.POWER) n++;
  return n;
}
