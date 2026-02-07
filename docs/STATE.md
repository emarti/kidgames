# State conventions

This doc describes **server-auth state objects** broadcast in `{ type: "state", state: ... }` messages.

General rules:
- The server is authoritative. Clients render and send intent.
- Most games broadcast the entire state object each tick.
- `players` is keyed by numeric IDs `1..4`.

## Shared fields (most games)

- `tick`: integer, increments as the sim advances.
- `paused`: boolean, indicates a lobby/pause overlay state.
- `reasonPaused`: string or null. Often starts as `'start'`.
- `players`: object with keys `1..4`.

Typical player subfields:
- `connected`: boolean
- `paused`: boolean (some games use *per-player* pause)
- cosmetic fields like `color`, `avatar`, `skin`, `shape`

## Maze & Wallmover grid conventions

### Grid
- `w`, `h`: integer grid dimensions
- `start`: `{x,y}`
- `goal`: `{x,y}`

### Walls bitmask
`walls[y][x]` is a per-cell bitmask:
- `N = 1`
- `E = 2`
- `S = 4`
- `W = 8`

If a bit is **present**, that edge is **blocked**.

**Invariant (important):** when toggling an edge, the adjacent cell’s opposite bit must be updated too.

### Fog / shared reveal
- `revealed`: array of cell indices (integers). A cell index is `y*w + x`.
- Reveal is typically **shared**: if any connected player can see a cell, it becomes revealed for everyone.

### Paths (claimed edges)
Maze-like games may include:
- `paths`: array of segments `{ a:{x,y}, b:{x,y}, color }`
- These are presentation-only “breadcrumb trails” claimed the first time an edge is traversed.

## Wallmover Puzzle overrides

Wallmover Puzzle mode adds a second wall layer.

- `softMask[y][x]`: bitmask of which edges are editable.
- `softWalls[y][x]`: bitmask of the editable edges’ current values.

Effective wall mask uses **override semantics**:
- On editable edges: `softWalls` is authoritative.
- On non-editable edges: `walls` (heavy/locked) is authoritative.

Derived / helper state:
- `routeComplete`: boolean, whether `start → goal` is reachable under the effective walls.

## Snake

Arena state:
- `w`, `h`: dimensions
- `speed`: one of `very_slow|slow|medium|fast|very_fast`
- `wallsMode`: `walls|no_walls|klein|projective`
- `apple`, `redApple`: `{x,y}` or null

Player state (Snake):
- `state`: `WAITING|ALIVE|DEAD|COUNTDOWN`
- `lives`: integer
- `dir`, `pendingDir`: `UP|DOWN|LEFT|RIGHT`
- `body`: array of `{x,y}` (head is index 0)

## Comet

World state:
- `w`, `h`: pixel dimensions
- `topology`: `regular|klein|projective`
- `difficulty`: `easy|medium|hard`
- `bullets`: array of bullet objects (positions/velocities/lifetime)
- `comets`: array of comet objects (positions/velocities/size)

Player state (Comet):
- `x,y,vx,vy,angle`
- `input`: `{ turn, thrust, brake, shoot }`
- `shootCooldownMs`

## Archimedes

Scene state:
- `sceneWidth`, `sceneHeight`
- `level`, `levelId`, `levelName`
- `boat`: object with ferry position + stability/capsize status
- `objects`: array of draggable items with `mass`, `onBoat`, `onShore`, `delivered`, `claimedBy`
- progress: `deliveredCount`, `totalToDeliver`, `tripsCompleted`

Player state (Archimedes):
- `cursorX`, `cursorY`
- `heldObjectId`

