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
  GRID_W, GRID_H,
  makePRNG,
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

const SIMPLE_GENERATED_OPEN_ROWS = new Set([0, 3, 6, 8, 11]);
const SIMPLE_GENERATED_OPEN_COLS = new Set([0, 3, 6, 9]);

function isSimpleGeneratedReserved(lc, lr) {
  if (isWallBlock(lc, lr)) return true;
  if (SIMPLE_GENERATED_OPEN_ROWS.has(lr)) return false;
  if (SIMPLE_GENERATED_OPEN_COLS.has(lc)) return false;
  if (lc >= 4 && lc <= 5 && lr >= 9 && lr <= 10) return false;
  return true;
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
function applyOverlays(grid, { tunnelRows = [12], portalPairs = [], sideRows = tunnelRows } = {}) {
  const tunnelRowSet = new Set(tunnelRows);
  const sideRowSet = new Set(sideRows);

  // ---- Ghost house ----
  // Row 8: top wall + door
  for (let c = HOUSE_LEFT; c <= HOUSE_RIGHT; c++) grid[8][c] = T.WALL;
  grid[8][GHOST_DOOR_X] = T.DOOR;

  // Rows 9-10: interior with side walls
  grid[9][HOUSE_LEFT]  = T.WALL; grid[9][HOUSE_RIGHT]  = T.WALL;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[9][c]  = T.HOUSE;
  grid[10][HOUSE_LEFT] = T.WALL; grid[10][HOUSE_RIGHT] = T.WALL;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[10][c] = T.HOUSE;

  // Row 11: ghost-house exit corridor
  grid[11][HOUSE_LEFT] = T.WALL; grid[11][HOUSE_RIGHT] = T.WALL;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[11][c] = T.HOUSE;

  // Approach corridors (cols 6 and 14), rows 7-12
  for (let r = 7; r <= 12; r++) {
    if (grid[r][6]  === T.WALL) grid[r][6]  = T.EMPTY;
    if (grid[r][14] === T.WALL) grid[r][14] = T.EMPTY;
  }

  // Path directly above the door (rows 5-7, col 10)
  for (let r = 5; r <= 7; r++)
    if (grid[r][10] === T.WALL) grid[r][10] = T.EMPTY;

  // ---- Left/right side exits ----
  // Row 12 is a gap row between logical rows lr=5 (tr=11) and lr=6 (tr=13).
  // When selected, open its wings so players can traverse around the ghost
  // house. Other side-exit rows naturally connect through the edge cells.
  for (const row of sideRowSet) {
    if (row === 12) {
      for (let c = 1;  c <= 5;  c++) grid[row][c] = T.EMPTY;
      for (let c = 15; c <= 20; c++) grid[row][c] = T.EMPTY;
    } else {
      if (grid[row][1] === T.WALL) grid[row][1] = T.DOT;
      if (grid[row][20] === T.WALL) grid[row][20] = T.DOT;
    }
  }
  for (const row of tunnelRowSet) {
    grid[row][0] = T.TUNNEL;
    grid[row][21] = T.TUNNEL;
  }

  // ---- Power pellets ----
  // Placed at mid-height on each side column (lc=0 and lc=9),
  // rows lr=3 and lr=8 in logical space → tile rows 7 and 17.
  // These cells are never reserved and always part of the maze graph.
  grid[7][1]  = T.POWER;   // left side, upper
  grid[7][20] = T.POWER;   // right side, upper
  grid[17][1] = T.POWER;   // left side, lower
  grid[17][20]= T.POWER;   // right side, lower

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
    if (!tunnelRowSet.has(r)) {
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

function isPlayerAccessibleTile(tile) {
  return tile != null && tile !== T.WALL && tile !== T.HOUSE && tile !== T.DOOR;
}

function portalKey(x, y) {
  return `${x},${y}`;
}

function buildPortalMap(portalPairs) {
  const map = new Map();
  for (const p of portalPairs ?? []) {
    map.set(portalKey(p.fromX, p.fromY), { x: p.toX, y: p.toY });
  }
  return map;
}

function walkableNeighbours(grid, x, y, { tunnelRows = [], portalPairs = [] } = {}) {
  const out = [];
  for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
    const nx = x + dx, ny = y + dy;
    if (ny < 0 || ny >= GRID_H || nx < 0 || nx >= GRID_W) continue;
    if (isPlayerAccessibleTile(grid[ny][nx])) out.push({ x: nx, y: ny });
  }

  const tile = grid[y][x];
  if (tile === T.TUNNEL && tunnelRows.includes(y)) {
    if (x === 0 && grid[y][GRID_W - 1] === T.TUNNEL) out.push({ x: GRID_W - 1, y });
    if (x === GRID_W - 1 && grid[y][0] === T.TUNNEL) out.push({ x: 0, y });
  }

  if (tile === T.PORTAL) {
    const dest = buildPortalMap(portalPairs).get(portalKey(x, y));
    if (dest && isPlayerAccessibleTile(grid[dest.y]?.[dest.x])) out.push(dest);
  }

  return out;
}

function collectMazeIssues(grid, label, {
  tunnelRows = [],
  portalPairs = [],
  requiredTiles = [],
} = {}) {
  const issues = [];
  const portalMap = buildPortalMap(portalPairs);
  const neighbourCtx = { tunnelRows, portalPairs };

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (!isPlayerAccessibleTile(grid[y][x])) continue;
      if (walkableNeighbours(grid, x, y, neighbourCtx).length <= 1) {
        issues.push(`${label}: dead end at (${x},${y})`);
      }
    }
  }

  let start = null;
  outer: for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (isPlayerAccessibleTile(grid[y][x])) { start = { x, y }; break outer; }
    }
  }

  const reachable = new Set();
  if (start) {
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop();
      const key = portalKey(cur.x, cur.y);
      if (reachable.has(key)) continue;
      reachable.add(key);
      for (const n of walkableNeighbours(grid, cur.x, cur.y, neighbourCtx)) stack.push(n);
    }
  }

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (!isPlayerAccessibleTile(grid[y][x])) continue;
      if (!reachable.has(portalKey(x, y))) {
        issues.push(`${label}: unreachable tile at (${x},${y})`);
      }
    }
  }

  for (let y = 0; y < GRID_H - 1; y++) {
    for (let x = 0; x < GRID_W - 1; x++) {
      if (grid[y][x] !== T.WALL && grid[y][x + 1] !== T.WALL &&
          grid[y + 1][x] !== T.WALL && grid[y + 1][x + 1] !== T.WALL) {
        const types = [grid[y][x], grid[y][x + 1], grid[y + 1][x], grid[y + 1][x + 1]];
        if (types.some(t => t === T.HOUSE || t === T.DOOR || t === T.TUNNEL)) continue;
        if (y >= 7 && y <= 12 && x >= 5 && x + 1 <= 15) continue;
        if (y >= 11 && y <= 13 && (x <= 6 || x >= 14)) continue;
        issues.push(`${label}: 2x2 open block at (${x},${y})`);
      }
    }
  }

  for (const tile of requiredTiles) {
    const v = grid[tile.y]?.[tile.x];
    if (!isPlayerAccessibleTile(v)) {
      issues.push(`${label}: required tile ${tile.name} is blocked at (${tile.x},${tile.y})`);
    } else if (!reachable.has(portalKey(tile.x, tile.y))) {
      issues.push(`${label}: required tile ${tile.name} is unreachable at (${tile.x},${tile.y})`);
    }
  }

  for (const p of portalPairs ?? []) {
    if (!portalMap.has(portalKey(p.toX, p.toY))) {
      issues.push(`${label}: portal at (${p.fromX},${p.fromY}) has no reverse mapping`);
    }
  }

  return issues;
}

// ============================================================
// Core maze generator
// ============================================================
const GENERATED_SIDE_ROW_OPTIONS = [
  [7, 17],
  [7, 12, 17],
];

function buildKleinSidePortalPairs(sideRows) {
  const rows = [...sideRows].sort((a, b) => a - b);
  const pairs = [];
  for (let i = 0; i < rows.length; i++) {
    const leftRow = rows[i];
    const rightRow = rows[rows.length - 1 - i];
    pairs.push({ fromX: 0,          fromY: leftRow,  toX: GRID_W - 1, toY: rightRow });
    pairs.push({ fromX: GRID_W - 1, fromY: rightRow, toX: 0,          toY: leftRow  });
  }
  return pairs;
}

function makeSidePlan({ sideMode = 'normal', sideRows = [12], topology = 'none' } = {}) {
  const rows = [...sideRows].sort((a, b) => a - b);
  if (sideMode === 'klein') {
    return {
      sideMode,
      sideRows: rows,
      topology: 'klein_lr',
      tunnelRows: [],
      portalPairs: buildKleinSidePortalPairs(rows),
    };
  }
  return {
    sideMode,
    sideRows: rows,
    topology: sideMode === 'normal' && topology === 'none' && rows.length !== 1 ? 'torus_lr' : topology,
    tunnelRows: rows,
    portalPairs: [],
  };
}

function generatedRequiredTiles(levelData) {
  return [
    ...levelData.playerSpawns.map((p, i) => ({ ...p, name: `playerSpawn${i + 1}` })),
    { ...levelData.fruitSpawn, name: 'fruitSpawn' },
    { x: 1,  y: 7,  name: 'upperLeftPower' },
    { x: 20, y: 7,  name: 'upperRightPower' },
    { x: 1,  y: 17, name: 'lowerLeftPower' },
    { x: 20, y: 17, name: 'lowerRightPower' },
  ];
}

function collectGeneratedLevelIssues(levelData, label, sidePlan) {
  const issues = collectMazeIssues(levelData.tiles, label, {
    tunnelRows: levelData.tunnelRows,
    portalPairs: levelData.portalPairs,
    requiredTiles: generatedRequiredTiles(levelData),
  });

  if (sidePlan.sideRows.length !== 2 && sidePlan.sideRows.length !== 3) {
    issues.push(`${label}: expected 2 or 3 side rows, got ${sidePlan.sideRows.length}`);
  }

  if (sidePlan.sideMode === 'klein') {
    if (levelData.topology !== 'klein_lr') issues.push(`${label}: expected topology klein_lr`);
    if (levelData.tunnelRows.length !== 0) issues.push(`${label}: Klein level should not expose tunnelRows`);
    if (levelData.portalPairs.length !== sidePlan.sideRows.length * 2) {
      issues.push(`${label}: expected ${sidePlan.sideRows.length * 2} Klein portal pairs`);
    }
    for (const row of sidePlan.sideRows) {
      if (levelData.tiles[row][0] !== T.PORTAL || levelData.tiles[row][GRID_W - 1] !== T.PORTAL) {
        issues.push(`${label}: missing Klein portal edge on row ${row}`);
      }
    }
  } else {
    if (levelData.topology !== 'torus_lr') issues.push(`${label}: expected topology torus_lr`);
    if (levelData.portalPairs.length !== 0) issues.push(`${label}: normal level should not expose portalPairs`);
    if (levelData.tunnelRows.length !== sidePlan.sideRows.length) {
      issues.push(`${label}: expected ${sidePlan.sideRows.length} tunnel rows`);
    }
    for (const row of sidePlan.sideRows) {
      if (!levelData.tunnelRows.includes(row)) issues.push(`${label}: missing tunnel row ${row}`);
      if (levelData.tiles[row][0] !== T.TUNNEL || levelData.tiles[row][GRID_W - 1] !== T.TUNNEL) {
        issues.push(`${label}: missing tunnel edge on row ${row}`);
      }
    }
  }

  return issues;
}

export function generateMaze({
  seed,
  loopDensity = 0.35,
  topology = 'none',
  topologyCount = 5,
  sideMode = null,
  sideRows = null,
  fruitSpawn = { x: 10, y: 15 },
  hardValidate = false,
  label = null,
  customReservedFn = null,
} = {}) {
  const reservedFn = customReservedFn ?? isWallBlock;
  const legacySideRows = sideRows ?? [12];
  const legacySideMode = sideMode ?? 'normal';
  const maxAttempts = hardValidate ? 48 : 1;
  let lastIssues = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptSeed = (seed + Math.imul(attempt, 0x9E3779B9)) >>> 0;
    const sidePlan = makeSidePlan({
      sideMode: legacySideMode,
      sideRows: legacySideRows,
      topology,
    });
    const walls = generateLogicalMaze(attemptSeed, loopDensity, reservedFn);
    const grid = toTileGrid(walls, reservedFn, T);

    applyOverlays(grid, sidePlan);
    repairConnectivity(grid);
    eliminateDeadEnds(grid);

    const toHomeMap = buildToHomeMap(grid, T, GHOST_DOOR_X, GHOST_DOOR_Y);
    const levelData = {
      tiles: grid,
      walls,
      toHomeMap,
      topology: sidePlan.topology,
      portalPairs: sidePlan.portalPairs,
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
      tunnelRows:  sidePlan.tunnelRows,
      fruitSpawn,
    };

    if (!hardValidate) {
      validateMaze(grid, seed);
      return levelData;
    }

    const levelLabel = label ?? `seed_${seed}`;
    lastIssues = collectGeneratedLevelIssues(levelData, `${levelLabel}/attempt_${attempt}`, sidePlan);
    if (lastIssues.length === 0) return levelData;
  }

  throw new Error(`Unable to generate valid Pacfriends maze for ${label ?? seed}: ${lastIssues.slice(0, 6).join('; ')}`);
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

function carveLargeLoopLayout(grid, {
  horizontalRows = [1, 7, 12, 17, 21, 24],
  verticalCols = [1, 6, 14, 20],
} = {}) {
  const keep = new Set([T.HOUSE, T.DOOR, T.TUNNEL, T.PORTAL]);
  for (let y = 1; y < GRID_H - 1; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      if (!keep.has(grid[y][x])) grid[y][x] = T.WALL;
    }
  }

  const open = (x, y, tile = T.DOT) => {
    if (x <= 0 || x >= GRID_W - 1 || y <= 0 || y >= GRID_H - 1) return;
    if (grid[y][x] === T.HOUSE || grid[y][x] === T.DOOR) return;
    grid[y][x] = tile;
  };

  for (const y of horizontalRows) {
    for (let x = 1; x < GRID_W - 1; x++) open(x, y);
  }
  for (const x of verticalCols) {
    for (let y = 1; y < GRID_H - 1; y++) open(x, y);
  }

  // Keep the house readable: two side approaches, a top door approach,
  // and a center fruit spine below the house.
  for (let y = 7; y <= 12; y++) {
    open(6, y, T.EMPTY);
    open(14, y, T.EMPTY);
  }
  for (let y = 5; y <= 7; y++) open(10, y, T.EMPTY);
  for (let y = 12; y <= 17; y++) open(10, y);

  // Simple lower arena around the player spawns.
  for (let x = 6; x <= 14; x++) {
    open(x, 19);
    open(x, 21);
  }
  for (let y = 17; y <= 21; y++) {
    open(6, y);
    open(14, y);
  }

  grid[7][1] = T.POWER;
  grid[7][20] = T.POWER;
  grid[17][1] = T.POWER;
  grid[17][20] = T.POWER;
}

// ============================================================
// Hand-crafted Level 1 — classic symmetric Pac-Man layout
//
// Left half (cols 0–10) defined as a numeric array, mirrored
// to cols 11–21.  Col 10 mirrors to col 11.  Ghost house is
// stamped over the template.  Tunnel exits at rows 7 and 17.
//
// The template is designed so that no 2×2 block of walkable
// tiles exists (outside the exemption zones around the ghost
// house and tunnel wings).
// ============================================================
function handCraftedLevel1() {
  const W = T.WALL, D = T.DOT, P = T.POWER, E = T.EMPTY;
  const H = T.HOUSE, DR = T.DOOR, TN = T.TUNNEL;

  // Left half: cols 0–10 (11 values), 26 rows.
  // Mirror: col c → col 21−c.  Col 10 → col 11.
  //
  // 2×2 constraint at center axis (cols 10-11):
  //   After mirroring, cols 10 and 11 are identical.
  //   So if L[r][10] and L[r+1][10] are BOTH open → 2×2.
  //   Fix: never have two consecutive rows with col 10 open,
  //   UNLESS col 9 is wall on at least one of those rows.
  //
  // 2×2 constraint elsewhere:
  //   For any (c,r), if tiles at (c,r),(c+1,r),(c,r+1),(c+1,r+1)
  //   are all non-wall, that's a violation.
  //
  // Ghost house (rows 8-11, cols 7-13) and tunnel wings
  // (rows 11-13 cols 0-6/14-21) are exempt from the 2×2 check.
  //
  // Template notation:
  //   Each row shows cols 0-10.  After mirroring:
  //     col 0→col 21, col 1→col 20, ..., col 10→col 11
  //
  // Visual key: W=wall, D=dot, P=power, E=empty, H=house, TN=tunnel
const L = [
  //c: 0   1  2  3  4  5  6  7  8  9 10
  [  W,  W, W, W, W, W, W, W, W, W, W ],  //  0
  [  W,  D, D, D, D, D, D, D, D, D, D ],  //  1
  [  W,  D, W, W, D, W, W, D, W, W, W ],  //  2
  [  W,  D, W, W, D, W, W, D, W, W, W ],  //  3
  [  W,  D, D, D, D, D, D, D, W, W, W ],  //  4
  [  W,  D, W, W, D, W, W, D, D, D, D ],  //  5
  [  W,  D, W, W, D, W, W, W, W, W, W ],  //  6
  [ TN,  P, D, D, D, D, D, D, D, D, D ],  //  7

  [  W,  D, W, W, W, W, W, W, W, W, W ],  //  8
  [  W,  D, W, W, W, W, W, W, W, W, W ],  //  9
  [  W,  D, W, W, W, W, W, W, W, W, W ],  // 10
  [  W,  D, W, W, W, W, W, W, W, W, W ],  // 11
  [  W,  D, D, D, D, D, D, W, W, W, W ],  // 12

  [  W,  D, W, W, W, W, D, W, W, W, W ],  // 13
  [  W,  D, D, D, D, D, D, D, W, W, W ],  // 14
  [  W,  D, W, W, D, W, W, D, W, W, W ],  // 15
  [  W,  D, W, W, D, W, W, D, W, W, W ],  // 16
  [ TN,  P, D, D, D, D, D, D, D, D, D ],  // 17

  [  W,  D, W, W, D, W, W, D, W, W, W ],  // 18
  [  W,  D, D, D, D, D, D, D, D, D, D ],  // 19
  [  W,  D, W, W, D, W, W, D, W, W, W ],  // 20
  [  W,  D, D, D, D, D, D, D, D, D, D ],  // 21
  [  W,  D, W, W, D, W, W, D, W, W, W ],  // 22
  [  W,  D, W, W, D, W, W, D, W, W, W ],  // 23
  [  W,  D, D, D, D, D, D, D, D, D, D ],  // 24
  [  W,  W, W, W, W, W, W, W, W, W, W ],  // 25
];

  // Build full 22×26 grid by mirroring left half
  const grid = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(W));

  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c <= 10; c++) {
      grid[r][c] = L[r][c];
      const mc = GRID_W - 1 - c;
      if (mc !== c) grid[r][mc] = L[r][c];
    }
  }

  // Ghost house: stamp proper structure
  for (let c = HOUSE_LEFT; c <= HOUSE_RIGHT; c++) grid[8][c] = W;
  grid[8][GHOST_DOOR_X] = DR;
  grid[9][HOUSE_LEFT] = W;  grid[9][HOUSE_RIGHT] = W;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[9][c] = H;
  grid[10][HOUSE_LEFT] = W; grid[10][HOUSE_RIGHT] = W;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[10][c] = H;
  grid[11][HOUSE_LEFT] = W; grid[11][HOUSE_RIGHT] = W;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[11][c] = E;

  // Approach corridors: cols 6 and 14 open from rows 7–12
  for (let r = 7; r <= 12; r++) {
    if (grid[r][6]  === W) grid[r][6]  = E;
    if (grid[r][14] === W) grid[r][14] = E;
  }

  // Path above door: col 10 rows 5–7
  for (let r = 5; r <= 7; r++) {
    if (grid[r][10] === W) grid[r][10] = E;
  }

  // Center corridor row 12, without a side tunnel.
  for (let c = 1; c <= 5; c++)   if (grid[12][c] === W) grid[12][c] = E;
  for (let c = 15; c <= 20; c++) if (grid[12][c] === W) grid[12][c] = E;

  // Side tunnels rows 7 and 17
  grid[7][0]  = TN;  grid[7][21]  = TN;
  grid[17][0] = TN;  grid[17][21] = TN;

  // Power pellets
  grid[7][1]  = P;  grid[7][20]  = P;
  grid[17][1] = P;  grid[17][20] = P;

  // Perimeter walls (except tunnels)
  for (let c = 0; c < GRID_W; c++) {
    if (grid[0][c]  !== TN) grid[0][c]  = W;
    if (grid[25][c] !== TN) grid[25][c] = W;
  }
  for (let r = 1; r <= 24; r++) {
    if (r !== 7 && r !== 17) {
      grid[r][0]  = W;
      grid[r][21] = W;
    }
  }

  carveLargeLoopLayout(grid, {
    horizontalRows: [1, 7, 12, 17, 21, 24],
    verticalCols: [1, 6, 14, 20],
  });

  // Player spawns: EMPTY (no dot at spawn)
  for (const [sx, sy] of [[9,19],[11,19],[9,21],[11,21]]) {
    if (grid[sy][sx] !== W) grid[sy][sx] = E;
  }
  // Fruit spawn: EMPTY
  if (grid[15][10] !== W) grid[15][10] = E;
  if (grid[15][11] !== W) grid[15][11] = E;

  // Safety nets
  repairConnectivity(grid);
  eliminateDeadEnds(grid);
  validateMaze(grid, 'handcrafted_1');

  const toHomeMap = buildToHomeMap(grid, T, GHOST_DOOR_X, GHOST_DOOR_Y);

  return {
    tiles: grid,
    walls: null,
    toHomeMap,
    topology: 'none',
    portalPairs: [],
    playerSpawns: [
      { x: 9, y: 19 }, { x: 11, y: 19 },
      { x: 9, y: 21 }, { x: 11, y: 21 },
    ],
    ghostSpawns: [
      { x: 11, y: 7 }, { x: 9, y: 10 },
      { x: 11, y: 10 }, { x: 12, y: 10 },
    ],
    ghostHouse: { x: HOUSE_LEFT, y: 8, w: HOUSE_RIGHT - HOUSE_LEFT + 1, h: 4 },
    ghostDoor: { x: GHOST_DOOR_X, y: GHOST_DOOR_Y },
    tunnelRows: [7, 17],
    fruitSpawn: { x: 10, y: 15 },
  };
}

// ============================================================
// Hand-crafted Level 2 — simpler training loops and two side tunnel highways
// ============================================================
function handCraftedLevel2() {
  const W = T.WALL, D = T.DOT, P = T.POWER, E = T.EMPTY;
  const H = T.HOUSE, DR = T.DOOR, TN = T.TUNNEL;

  const L = [
    //c: 0   1  2  3  4  5  6  7  8  9 10
    [  W,  W, W, W, W, W, W, W, W, W, W ],  //  0
    [  W,  D, D, D, D, D, D, D, D, D, D ],  //  1
    [  W,  D, W, W, D, W, W, D, W, W, W ],  //  2
    [  W,  D, W, W, D, W, W, D, W, W, W ],  //  3
    [  W,  D, D, D, D, D, D, D, W, W, W ],  //  4

    [  W,  D, W, W, D, W, W, D, D, D, D ],  //  5
    [  W,  D, W, W, D, W, W, W, W, W, W ],  //  6
    [ TN,  P, D, D, D, D, D, D, D, D, D ],  //  7

    [  W,  D, W, W, W, W, W, W, W, W, W ],  //  8
    [  W,  D, W, W, W, W, W, W, W, W, W ],  //  9
    [  W,  D, W, W, W, W, W, W, W, W, W ],  // 10
    [  W,  D, W, W, W, W, W, W, W, W, W ],  // 11

    [  W,  D, D, D, D, D, D, W, W, W, W ],  // 12
    [  W,  D, W, W, W, W, D, W, W, W, W ],  // 13
    [  W,  D, D, D, D, D, D, D, W, W, W ],  // 14

    [  W,  D, W, W, D, W, W, D, W, W, W ],  // 15
    [  W,  D, W, W, D, W, W, D, W, W, W ],  // 16
    [ TN,  P, D, D, D, D, D, D, D, D, D ],  // 17

    [  W,  D, W, W, D, W, W, D, W, W, W ],  // 18
    [  W,  D, D, D, D, D, D, D, D, D, D ],  // 19
    [  W,  D, W, W, D, W, W, D, W, W, W ],  // 20
    [  W,  D, D, D, D, D, D, D, D, D, D ],  // 21
    [  W,  D, W, W, D, W, W, D, W, W, W ],  // 22
    [  W,  D, W, W, D, W, W, D, W, W, W ],  // 23
    [  W,  D, D, D, D, D, D, D, D, D, D ],  // 24
    [  W,  W, W, W, W, W, W, W, W, W, W ],  // 25
  ];

  const grid = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(W));

  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c <= 10; c++) {
      grid[r][c] = L[r][c];
      const mc = GRID_W - 1 - c;
      if (mc !== c) grid[r][mc] = L[r][c];
    }
  }

  // Ghost house: stamp proper structure.
  for (let c = HOUSE_LEFT; c <= HOUSE_RIGHT; c++) grid[8][c] = W;
  grid[8][GHOST_DOOR_X] = DR;
  grid[9][HOUSE_LEFT] = W;  grid[9][HOUSE_RIGHT] = W;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[9][c] = H;
  grid[10][HOUSE_LEFT] = W; grid[10][HOUSE_RIGHT] = W;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[10][c] = H;
  grid[11][HOUSE_LEFT] = W; grid[11][HOUSE_RIGHT] = W;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[11][c] = E;

  // Approach corridors: cols 6 and 14 open from rows 7-12.
  for (let r = 7; r <= 12; r++) {
    if (grid[r][6]  === W) grid[r][6]  = E;
    if (grid[r][14] === W) grid[r][14] = E;
  }

  // Path above door: col 10 rows 5-7.
  for (let r = 5; r <= 7; r++) {
    if (grid[r][10] === W) grid[r][10] = E;
  }

  // Side tunnels rows 7 and 17.
  grid[7][0]  = TN;  grid[7][21]  = TN;
  grid[17][0] = TN;  grid[17][21] = TN;

  // Power pellets.
  grid[7][1]  = P;  grid[7][20]  = P;
  grid[17][1] = P;  grid[17][20] = P;

  // Perimeter walls (except tunnels).
  for (let c = 0; c < GRID_W; c++) {
    if (grid[0][c]  !== TN) grid[0][c]  = W;
    if (grid[25][c] !== TN) grid[25][c] = W;
  }
  for (let r = 1; r <= 24; r++) {
    if (r !== 7 && r !== 17) {
      grid[r][0]  = W;
      grid[r][21] = W;
    }
  }

  carveLargeLoopLayout(grid, {
    horizontalRows: [1, 5, 7, 12, 17, 21, 24],
    verticalCols: [1, 6, 10, 14, 20],
  });

  // Player spawns: EMPTY (no dot at spawn).
  for (const [sx, sy] of [[9,19],[11,19],[9,21],[11,21]]) {
    if (grid[sy][sx] !== W) grid[sy][sx] = E;
  }
  // Fruit spawn: EMPTY.
  if (grid[15][10] !== W) grid[15][10] = E;
  if (grid[15][11] !== W) grid[15][11] = E;

  repairConnectivity(grid);
  eliminateDeadEnds(grid);
  validateMaze(grid, 'handcrafted_2');

  const toHomeMap = buildToHomeMap(grid, T, GHOST_DOOR_X, GHOST_DOOR_Y);

  return {
    tiles: grid,
    walls: null,
    toHomeMap,
    topology: 'none',
    portalPairs: [],
    playerSpawns: [
      { x: 9, y: 19 }, { x: 11, y: 19 },
      { x: 9, y: 21 }, { x: 11, y: 21 },
    ],
    ghostSpawns: [
      { x: 11, y: 7 }, { x: 9, y: 10 },
      { x: 11, y: 10 }, { x: 12, y: 10 },
    ],
    ghostHouse: { x: HOUSE_LEFT, y: 8, w: HOUSE_RIGHT - HOUSE_LEFT + 1, h: 4 },
    ghostDoor: { x: GHOST_DOOR_X, y: GHOST_DOOR_Y },
    tunnelRows: [7, 17],
    fruitSpawn: { x: 10, y: 15 },
  };
}

// ============================================================
// Hand-crafted Level 3 — split bridges and lower pretzel routes
// ============================================================
function handCraftedLevel3() {
  const W = T.WALL, D = T.DOT, P = T.POWER, E = T.EMPTY;
  const H = T.HOUSE, DR = T.DOOR, TN = T.TUNNEL, PT = T.PORTAL;

  const L = [
    //c: 0   1  2  3  4  5  6  7  8  9 10
    [  W,  W, W, W, W, W, W, W, W, W, W ],  //  0
    [  W,  D, D, D, D, D, D, D, D, D, D ],  //  1
    [  W,  D, W, W, D, W, W, D, W, W, W ],  //  2
    [  W,  D, W, W, D, W, W, D, W, W, W ],  //  3
    [  W,  D, D, D, D, D, D, D, W, W, W ],  //  4

    [  W,  D, W, W, D, W, W, D, D, D, D ],  //  5
    [  W,  D, W, W, D, W, W, W, W, W, W ],  //  6
    [ TN,  P, D, D, D, W, W, D, D, D, D ],  //  7

    [  W,  D, W, W, W, W, W, W, W, W, W ],  //  8
    [  W,  D, W, W, W, W, W, W, W, W, W ],  //  9
    [  W,  D, W, W, W, W, W, W, W, W, W ],  // 10
    [  W,  D, W, W, W, W, W, W, W, W, W ],  // 11

    [  W,  D, D, D, D, D, D, D, W, W, W ],  // 12
    [  W,  D, W, W, W, W, W, D, W, W, W ],  // 13
    [  W,  D, D, D, D, D, D, D, W, W, W ],  // 14

    [  W,  D, W, W, D, W, W, D, D, D, D ],  // 15
    [  W,  D, W, W, D, W, W, D, W, W, W ],  // 16
    [ TN,  P, D, D, D, W, W, D, D, D, D ],  // 17

    [  W,  D, W, W, D, W, W, D, W, W, W ],  // 18
    [  W,  D, D, D, D, W, W, D, D, D, D ],  // 19
    [  W,  D, W, W, D, W, W, D, W, D, W ],  // 20
    [  W,  D, D, D, D, W, W, D, D, D, D ],  // 21
    [  W,  D, W, W, D, W, W, D, W, W, W ],  // 22
    [  W,  D, W, W, D, W, W, D, W, W, W ],  // 23
    [  W,  D, D, D, D, D, D, D, D, D, D ],  // 24
    [  W,  W, W, W, W, W, W, W, W, W, W ],  // 25
  ];

  const grid = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(W));

  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c <= 10; c++) {
      grid[r][c] = L[r][c];
      const mc = GRID_W - 1 - c;
      if (mc !== c) grid[r][mc] = L[r][c];
    }
  }

  // Ghost house: stamp proper structure.
  for (let c = HOUSE_LEFT; c <= HOUSE_RIGHT; c++) grid[8][c] = W;
  grid[8][GHOST_DOOR_X] = DR;
  grid[9][HOUSE_LEFT] = W;  grid[9][HOUSE_RIGHT] = W;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[9][c] = H;
  grid[10][HOUSE_LEFT] = W; grid[10][HOUSE_RIGHT] = W;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[10][c] = H;
  grid[11][HOUSE_LEFT] = W; grid[11][HOUSE_RIGHT] = W;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[11][c] = E;

  // Approach corridors: cols 6 and 14 open from rows 7-12.
  for (let r = 7; r <= 12; r++) {
    if (grid[r][6]  === W) grid[r][6]  = E;
    if (grid[r][14] === W) grid[r][14] = E;
  }

  // Path above door: col 10 rows 5-7.
  for (let r = 5; r <= 7; r++) {
    if (grid[r][10] === W) grid[r][10] = E;
  }

  // Klein side portals: bottom-left <-> top-right, top-left <-> bottom-right.
  const portalPairs = [
    { fromX: 0,         fromY: 17, toX: GRID_W - 1, toY: 7  },
    { fromX: GRID_W - 1, fromY: 7,  toX: 0,          toY: 17 },
    { fromX: 0,         fromY: 7,  toX: GRID_W - 1, toY: 17 },
    { fromX: GRID_W - 1, fromY: 17, toX: 0,          toY: 7  },
  ];
  for (const p of portalPairs) {
    grid[p.fromY][p.fromX] = PT;
    grid[p.toY][p.toX] = PT;
  }

  // Power pellets.
  grid[7][1]  = P;  grid[7][20]  = P;
  grid[17][1] = P;  grid[17][20] = P;

  // Perimeter walls (except tunnels).
  for (let c = 0; c < GRID_W; c++) {
    if (grid[0][c]  !== PT) grid[0][c]  = W;
    if (grid[25][c] !== PT) grid[25][c] = W;
  }
  for (let r = 1; r <= 24; r++) {
    if (r !== 7 && r !== 17) {
      if (grid[r][0] !== PT) grid[r][0] = W;
      if (grid[r][21] !== PT) grid[r][21] = W;
    }
  }

  carveLargeLoopLayout(grid, {
    horizontalRows: [1, 7, 12, 17, 21, 24],
    verticalCols: [1, 6, 14, 20],
  });

  // Player spawns: EMPTY (no dot at spawn).
  for (const [sx, sy] of [[9,19],[11,19],[9,21],[11,21]]) {
    if (grid[sy][sx] !== W) grid[sy][sx] = E;
  }
  // Fruit spawn: EMPTY.
  if (grid[15][10] !== W) grid[15][10] = E;
  if (grid[15][11] !== W) grid[15][11] = E;

  repairConnectivity(grid);
  eliminateDeadEnds(grid);
  validateMaze(grid, 'handcrafted_3');

  const toHomeMap = buildToHomeMap(grid, T, GHOST_DOOR_X, GHOST_DOOR_Y);

  return {
    tiles: grid,
    walls: null,
    toHomeMap,
    topology: 'klein_lr',
    portalPairs,
    playerSpawns: [
      { x: 9, y: 19 }, { x: 11, y: 19 },
      { x: 9, y: 21 }, { x: 11, y: 21 },
    ],
    ghostSpawns: [
      { x: 11, y: 7 }, { x: 9, y: 10 },
      { x: 11, y: 10 }, { x: 12, y: 10 },
    ],
    ghostHouse: { x: HOUSE_LEFT, y: 8, w: HOUSE_RIGHT - HOUSE_LEFT + 1, h: 4 },
    ghostDoor: { x: GHOST_DOOR_X, y: GHOST_DOOR_Y },
    tunnelRows: [],
    fruitSpawn: { x: 10, y: 15 },
  };
}

// ============================================================
// Hand-crafted Level 4 — classic cloverleaf with a center tunnel
// ============================================================
function handCraftedLevel4() {
  const W = T.WALL, D = T.DOT, P = T.POWER, E = T.EMPTY;
  const H = T.HOUSE, DR = T.DOOR, TN = T.TUNNEL, PT = T.PORTAL;

  const L = [
    //c: 0   1  2  3  4  5  6  7  8  9 10
    [  W,  W, W, W, W, W, W, W, W, W, W ],  //  0
    [  W,  D, D, D, D, D, D, D, D, D, D ],  //  1
    [  W,  D, W, W, D, W, W, D, W, W, W ],  //  2
    [  W,  D, W, W, D, D, D, D, W, W, W ],  //  3
    [  W,  D, D, D, D, W, W, D, D, D, D ],  //  4

    [  W,  D, W, W, D, W, W, D, W, W, W ],  //  5
    [  W,  D, W, W, D, W, W, D, W, W, W ],  //  6
    [ TN,  P, D, D, D, D, D, D, D, D, D ],  //  7

    [  W,  D, W, W, W, W, W, W, W, W, D ],  //  8
    [  W,  D, W, W, W, W, W, W, W, W, D ],  //  9
    [  W,  D, W, W, W, W, W, W, W, W, D ],  // 10
    [  W,  D, W, W, W, W, W, W, W, W, D ],  // 11

    [ TN,  D, D, D, D, D, D, D, D, D, D ],  // 12
    [  W,  D, W, W, W, W, W, D, W, W, D ],  // 13
    [  W,  D, D, D, D, D, D, D, W, W, W ],  // 14

    [  W,  D, W, W, D, W, W, D, D, D, D ],  // 15
    [  W,  D, W, W, D, W, W, D, W, W, W ],  // 16
    [  W,  P, D, D, D, W, W, D, W, W, D ],  // 17

    [  W,  D, W, W, D, W, W, D, W, W, W ],  // 18
    [  W,  D, D, D, D, W, W, D, D, D, D ],  // 19
    [  W,  D, W, W, D, W, W, D, W, D, W ],  // 20
    [  W,  D, D, D, D, D, D, D, W, D, D ],  // 21
    [  W,  D, W, W, D, W, W, D, W, W, W ],  // 22
    [  W,  D, W, W, D, W, W, D, W, W, W ],  // 23
    [  W,  D, D, D, D, D, D, D, D, D, D ],  // 24
    [  W,  W, W, W, W, W, W, W, W, W, W ],  // 25
  ];

  const grid = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(W));

  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c <= 10; c++) {
      grid[r][c] = L[r][c];
      const mc = GRID_W - 1 - c;
      if (mc !== c) grid[r][mc] = L[r][c];
    }
  }

  // Ghost house: stamp proper structure.
  for (let c = HOUSE_LEFT; c <= HOUSE_RIGHT; c++) grid[8][c] = W;
  grid[8][GHOST_DOOR_X] = DR;
  grid[9][HOUSE_LEFT] = W;  grid[9][HOUSE_RIGHT] = W;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[9][c] = H;
  grid[10][HOUSE_LEFT] = W; grid[10][HOUSE_RIGHT] = W;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[10][c] = H;
  grid[11][HOUSE_LEFT] = W; grid[11][HOUSE_RIGHT] = W;
  for (let c = HOUSE_LEFT + 1; c < HOUSE_RIGHT; c++) grid[11][c] = E;

  // Approach corridors: cols 6 and 14 open from rows 7-12.
  for (let r = 7; r <= 12; r++) {
    if (grid[r][6]  === W) grid[r][6]  = E;
    if (grid[r][14] === W) grid[r][14] = E;
  }

  // Path above door: col 10 rows 5-7.
  for (let r = 5; r <= 7; r++) {
    if (grid[r][10] === W) grid[r][10] = E;
  }

  // Three Klein side portals: top <-> bottom, middle <-> middle.
  const portalPairs = [
    { fromX: 0,          fromY: 7,  toX: GRID_W - 1, toY: 17 },
    { fromX: GRID_W - 1, fromY: 17, toX: 0,          toY: 7  },
    { fromX: 0,          fromY: 12, toX: GRID_W - 1, toY: 12 },
    { fromX: GRID_W - 1, fromY: 12, toX: 0,          toY: 12 },
    { fromX: 0,          fromY: 17, toX: GRID_W - 1, toY: 7  },
    { fromX: GRID_W - 1, fromY: 7,  toX: 0,          toY: 17 },
  ];
  for (const p of portalPairs) {
    grid[p.fromY][p.fromX] = PT;
    grid[p.toY][p.toX] = PT;
  }

  // Power pellets.
  grid[7][1]  = P;  grid[7][20]  = P;
  grid[17][1] = P;  grid[17][20] = P;

  // Perimeter walls (except portals).
  for (let c = 0; c < GRID_W; c++) {
    if (grid[0][c]  !== PT) grid[0][c]  = W;
    if (grid[25][c] !== PT) grid[25][c] = W;
  }
  for (let r = 1; r <= 24; r++) {
    if (r !== 7 && r !== 12 && r !== 17) {
      if (grid[r][0] !== PT) grid[r][0] = W;
      if (grid[r][21] !== PT) grid[r][21] = W;
    }
  }

  carveLargeLoopLayout(grid, {
    horizontalRows: [1, 4, 7, 12, 17, 21, 24],
    verticalCols: [1, 6, 14, 20],
  });

  // Player spawns: EMPTY (no dot at spawn).
  for (const [sx, sy] of [[9,19],[11,19],[9,21],[11,21]]) {
    if (grid[sy][sx] !== W) grid[sy][sx] = E;
  }
  // Fruit spawn: EMPTY.
  if (grid[15][10] !== W) grid[15][10] = E;
  if (grid[15][11] !== W) grid[15][11] = E;

  repairConnectivity(grid);
  eliminateDeadEnds(grid);

  validateMaze(grid, 'handcrafted_4');

  const toHomeMap = buildToHomeMap(grid, T, GHOST_DOOR_X, GHOST_DOOR_Y);

  return {
    tiles: grid,
    walls: null,
    toHomeMap,
    topology: 'klein_lr',
    portalPairs,
    playerSpawns: [
      { x: 9, y: 19 }, { x: 11, y: 19 },
      { x: 9, y: 21 }, { x: 11, y: 21 },
    ],
    ghostSpawns: [
      { x: 11, y: 7 }, { x: 9, y: 10 },
      { x: 11, y: 10 }, { x: 12, y: 10 },
    ],
    ghostHouse: { x: HOUSE_LEFT, y: 8, w: HOUSE_RIGHT - HOUSE_LEFT + 1, h: 4 },
    ghostDoor: { x: GHOST_DOOR_X, y: GHOST_DOOR_Y },
    tunnelRows: [],
    fruitSpawn: { x: 10, y: 15 },
  };
}

// ============================================================
// Pre-built levels 1-6
//
// Levels 1-4 are hand-crafted for classic symmetric play.
// Levels 5+ are generated by the strict loop-only generator.
// ============================================================
export const LEVELS = [
  // 1 — hand-crafted classic symmetric layout
  handCraftedLevel1(),
  // 2 — hand-crafted wide-loop layout
  handCraftedLevel2(),
  // 3 — hand-crafted split-bridge layout
  handCraftedLevel3(),
  // 4 — hand-crafted cloverleaf layout
  handCraftedLevel4(),
  // 5-6 — strict generated layouts
  generateLevel(5),
  generateLevel(6),
];

// ============================================================
// Random levels 7+
// ============================================================
export function generateLevel(levelNum) {
  const seed = ((levelNum * 2654435761) + 987654321) >>> 0;
  const rng  = makePRNG(seed);
  const loopDensity   = 0.03 + rng() * 0.07;
  const sideRows      = rng() < 0.75 ? GENERATED_SIDE_ROW_OPTIONS[0] : GENERATED_SIDE_ROW_OPTIONS[1];
  const sideMode      = rng() < 0.5 ? 'normal' : 'klein';
  return generateMaze({
    seed,
    loopDensity,
    sideMode,
    sideRows,
    fruitSpawn: { x: 7, y: 15 },
    customReservedFn: isSimpleGeneratedReserved,
    hardValidate: true,
    label: `level_${levelNum}`,
  });
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
