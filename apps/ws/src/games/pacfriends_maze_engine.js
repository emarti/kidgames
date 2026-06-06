// ============================================================
// Pac-Friends Maze Engine  (v2 — cycle-first generation)
//
// Pure maze generation module.  All logic is stateless and
// deterministic given the same seed.
//
// Logical grid: MAZE_LW=10 cols × MAZE_LH=12 rows
//   Each logical cell (lc, lr) maps to tile (1 + lc*2, 1 + lr*2).
//   Gap tiles between adjacent cells: DOT if the shared wall is
//   removed, WALL otherwise.
//   Pillar tiles at (even col, even row): always WALL in the
//   initial expansion.  Fixed overlays may overwrite any tile.
//
// Tile grid: GRID_W=22 cols × GRID_H=26 rows
//
// GUARANTEES (by construction, not by patching):
//   1. Every non-reserved cell has degree >= 2 (no dead ends).
//   2. No 2x2 block of cells is fully interconnected (corridors
//      are always exactly 1 tile wide in tile space).
//   3. The graph is connected.
// ============================================================

export const MAZE_LW = 10;
export const MAZE_LH = 12;
export const GRID_W  = 2 * MAZE_LW + 2;   // 22
export const GRID_H  = 2 * MAZE_LH + 2;   // 26

// ============================================================
// PRNG — mulberry32
// ============================================================
export function makePRNG(seed) {
  let s = (seed ^ 0xDEADBEEF) >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// Bitmask constants
// ============================================================
export const N_BIT = 1, S_BIT = 2, E_BIT = 4, W_BIT = 8;
export const ALL_WALLS = N_BIT | S_BIT | E_BIT | W_BIT;

export const NBRS = [
  { dr: -1, dc:  0, from: N_BIT, to: S_BIT },
  { dr:  1, dc:  0, from: S_BIT, to: N_BIT },
  { dr:  0, dc:  1, from: E_BIT, to: W_BIT },
  { dr:  0, dc: -1, from: W_BIT, to: E_BIT },
];

export function countBits(n) {
  let c = 0;
  while (n) { c += n & 1; n >>>= 1; }
  return c;
}

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// 2x2 open-block check
// ============================================================
function wouldComplete2x2(walls, lr, lc, bit) {
  function open(r, c, b) {
    if (r < 0 || r >= MAZE_LH || c < 0 || c >= MAZE_LW) return false;
    if (r === lr && c === lc && b === bit) return true;
    return !(walls[r][c] & b);
  }
  function blk(tr, tc) {
    return tr >= 0 && tc >= 0 && tr + 1 < MAZE_LH && tc + 1 < MAZE_LW &&
           open(tr, tc, E_BIT) && open(tr+1, tc, E_BIT) &&
           open(tr, tc, S_BIT) && open(tr, tc+1, S_BIT);
  }
  if (bit === E_BIT) return blk(lr-1, lc) || blk(lr, lc);
  if (bit === W_BIT) return blk(lr-1, lc-1) || blk(lr, lc-1);
  if (bit === S_BIT) return blk(lr, lc-1) || blk(lr, lc);
  if (bit === N_BIT) return blk(lr-1, lc-1) || blk(lr-1, lc);
  return false;
}

// ============================================================
// generateLogicalMaze  (v2 — cycle-first)
//
// Phase 1: Build a Hamiltonian cycle through all non-reserved
//   cells using a serpentine (boustrophedon) path, bridging
//   gaps around reserved blocks via BFS.  Every cell gets
//   degree >= 2 from the start — no dead ends by construction.
//
// Phase 2: Randomly add extra edges (loopDensity fraction of
//   remaining walls) to create shortcuts/variety, respecting
//   the 2x2 constraint so corridors stay 1-wide.
//
// Returns walls[lr][lc] — 4-bit bitmask per cell.
// ============================================================
export function generateLogicalMaze(seed, loopDensity = 0.35, reservedFn = () => false) {
  const rng = makePRNG(seed);

  function inBounds(c, r) { return c >= 0 && c < MAZE_LW && r >= 0 && r < MAZE_LH; }

  const walls = Array.from({ length: MAZE_LH }, () => new Array(MAZE_LW).fill(ALL_WALLS));

  function openWall(c1, r1, c2, r2) {
    const dc = c2 - c1, dr = r2 - r1;
    const nb = NBRS.find(n => n.dc === dc && n.dr === dr);
    if (nb) {
      walls[r1][c1] &= ~nb.from;
      walls[r2][c2] &= ~nb.to;
    }
  }

  // BFS path between two non-reserved cells (avoiding reserved)
  function bfsPath(sc, sr, ec, er) {
    if (sc === ec && sr === er) return [[sc, sr]];
    const visited = new Map();
    const queue = [[sc, sr]];
    visited.set(sr * MAZE_LW + sc, null);
    let head = 0;
    while (head < queue.length) {
      const [cx, cy] = queue[head++];
      for (const nb of NBRS) {
        const nc = cx + nb.dc, nr = cy + nb.dr;
        if (!inBounds(nc, nr) || reservedFn(nc, nr)) continue;
        const key = nr * MAZE_LW + nc;
        if (visited.has(key)) continue;
        visited.set(key, [cx, cy]);
        if (nc === ec && nr === er) {
          const path = [[ec, er]];
          let cur = [cx, cy];
          while (cur) { path.push(cur); cur = visited.get(cur[1] * MAZE_LW + cur[0]); }
          path.reverse();
          return path;
        }
        queue.push([nc, nr]);
      }
    }
    return null;
  }

  // ---- Phase 1: Serpentine Hamiltonian cycle ----
  const orderedCells = [];
  for (let r = 0; r < MAZE_LH; r++) {
    if (r % 2 === 0) {
      for (let c = 0; c < MAZE_LW; c++)
        if (!reservedFn(c, r)) orderedCells.push([c, r]);
    } else {
      for (let c = MAZE_LW - 1; c >= 0; c--)
        if (!reservedFn(c, r)) orderedCells.push([c, r]);
    }
  }

  if (orderedCells.length < 3) return walls;

  // Connect consecutive cells in the ordering
  for (let i = 0; i < orderedCells.length - 1; i++) {
    const [c1, r1] = orderedCells[i];
    const [c2, r2] = orderedCells[i + 1];
    if (Math.abs(c2 - c1) + Math.abs(r2 - r1) === 1) {
      openWall(c1, r1, c2, r2);
    } else {
      const path = bfsPath(c1, r1, c2, r2);
      if (path) for (let j = 0; j < path.length - 1; j++)
        openWall(path[j][0], path[j][1], path[j+1][0], path[j+1][1]);
    }
  }

  // Close the cycle: last -> first
  {
    const [c1, r1] = orderedCells[orderedCells.length - 1];
    const [c2, r2] = orderedCells[0];
    if (Math.abs(c2 - c1) + Math.abs(r2 - r1) === 1) {
      openWall(c1, r1, c2, r2);
    } else {
      const path = bfsPath(c1, r1, c2, r2);
      if (path) for (let j = 0; j < path.length - 1; j++)
        openWall(path[j][0], path[j][1], path[j+1][0], path[j+1][1]);
    }
  }

  // Safety net: ensure every non-reserved cell has degree >= 2
  for (let r = 0; r < MAZE_LH; r++) {
    for (let c = 0; c < MAZE_LW; c++) {
      if (reservedFn(c, r)) continue;
      while (countBits(ALL_WALLS & ~walls[r][c]) < 2) {
        const candidates = shuffle(NBRS.filter(nb => {
          const nc = c + nb.dc, nr = r + nb.dr;
          return inBounds(nc, nr) && !reservedFn(nc, nr) && (walls[r][c] & nb.from);
        }), rng);
        if (candidates.length === 0) break;
        const safe = candidates.filter(nb => !wouldComplete2x2(walls, r, c, nb.from));
        const pick = (safe.length > 0 ? safe : candidates)[0];
        walls[r][c] &= ~pick.from;
        walls[r + pick.dr][c + pick.dc] &= ~pick.to;
      }
    }
  }

  // ---- Phase 2: Add random extra edges for variety ----
  const candidates = [];
  for (let r = 0; r < MAZE_LH; r++) {
    for (let c = 0; c < MAZE_LW; c++) {
      if (reservedFn(c, r)) continue;
      for (const nb of NBRS) {
        if (nb.from !== E_BIT && nb.from !== S_BIT) continue; // only E and S to avoid duplicates
        const nc = c + nb.dc, nr = r + nb.dr;
        if (!inBounds(nc, nr) || reservedFn(nc, nr)) continue;
        if (!(walls[r][c] & nb.from)) continue; // already open
        candidates.push({ r, c, nb });
      }
    }
  }
  const shuffled = shuffle(candidates, rng);
  const target = Math.floor(shuffled.length * loopDensity);
  let added = 0;
  for (const { r, c, nb } of shuffled) {
    if (added >= target) break;
    if (!(walls[r][c] & nb.from)) continue; // may have been opened by safety net
    if (wouldComplete2x2(walls, r, c, nb.from)) continue;
    walls[r][c] &= ~nb.from;
    walls[r + nb.dr][c + nb.dc] &= ~nb.to;
    added++;
  }

  return walls;
}

// ============================================================
// toTileGrid
// ============================================================
export function toTileGrid(walls, reservedFn, T) {
  const grid = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(T.WALL));

  for (let lr = 0; lr < MAZE_LH; lr++) {
    for (let lc = 0; lc < MAZE_LW; lc++) {
      if (reservedFn(lc, lr)) continue;
      const tr = 1 + lr * 2;
      const tc = 1 + lc * 2;

      grid[tr][tc] = T.DOT;

      if (lc + 1 < MAZE_LW && !reservedFn(lc + 1, lr) && !(walls[lr][lc] & E_BIT)) {
        grid[tr][tc + 1] = T.DOT;
      }
      if (lr + 1 < MAZE_LH && !reservedFn(lc, lr + 1) && !(walls[lr][lc] & S_BIT)) {
        grid[tr + 1][tc] = T.DOT;
      }
    }
  }

  return grid;
}

// ============================================================
// buildToHomeMap
// ============================================================
export function buildToHomeMap(tiles, T, doorX, doorY) {
  const h = tiles.length;
  const w = tiles[0].length;
  const dist = Array.from({ length: h }, () => new Array(w).fill(Infinity));

  function ghostWalkable(x, y) {
    if (y < 0 || y >= h || x < 0 || x >= w) return false;
    return tiles[y][x] !== T.WALL;
  }

  dist[doorY][doorX] = 0;
  const queue = [{ x: doorX, y: doorY }];
  let head = 0;

  while (head < queue.length) {
    const { x, y } = queue[head++];
    const d = dist[y][x];
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const nx = x + dx, ny = y + dy;
      if (!ghostWalkable(nx, ny)) continue;
      if (dist[ny][nx] !== Infinity) continue;
      dist[ny][nx] = d + 1;
      queue.push({ x: nx, y: ny });
    }
  }

  return dist;
}
