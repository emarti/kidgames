# Pac-Friends — LLM notes

Pac-Friends is a cooperative Pac-Man–inspired arcade game for up to 4 players. Players share a maze, eat dots, and avoid (or eat) ghosts. It is server-authoritative with a 50ms tick.

## Where things live

Server:
- `apps/ws/src/games/pacfriends.js` — WebSocket room host + routing
- `apps/ws/src/games/pacfriends_sim.js` — authoritative simulation (movement, collisions, ghost AI, scoring)
- `apps/ws/src/games/pacfriends_levels.js` — level definitions, maze assembly, overlays, validation
- `apps/ws/src/games/pacfriends_maze_engine.js` — pure maze generation (stateless, deterministic)

Client:
- `pacfriends/client/src/main.js` — Phaser 3 boot
- `pacfriends/client/src/net.js` — WebSocket client
- `pacfriends/client/src/game/scenes/PlayScene.js` — input, HUD, game loop
- `pacfriends/client/src/game/renderer.js` — tile / character / effect rendering
- `pacfriends/client/src/game/sounds.js` — audio

## Core loop

- Host tick: every **50ms** the host calls `Sim.step(state, now)` and broadcasts `{type:"state"}`.
- Clients render the full state snapshot.

## Protocol (Pac-Friends)

Handshake:
- Client sends `{type:"hello", gameId:"pacfriends", protocol:1}` on open.

Lobby/room messages (common):
- `create_room`, `join_room {roomId}`, `get_rooms`

Gameplay messages:
- `input { dir: "UP"|"RIGHT"|"DOWN"|"LEFT" }`
- `pause`, `resume`, `restart`
- `set_difficulty { difficulty: "easy"|"medium"|"hard" }`
- `set_speed { speed: "slow"|"medium"|"fast" }`
- `set_color { color: "#RRGGBB" }`
- `set_decoration { decoration: "plain"|"bow"|"beanie"|"bowtie" }`
- `select_level { level: number }`

Server → client:
- `room_joined { roomId, playerId, state }`
- `state { state }`

## Grid system

| Dimension      | Value |
|----------------|-------|
| Tile grid      | 22 cols × 26 rows (`GRID_W` × `GRID_H`) |
| Logical grid   | 10 cols × 12 rows (`MAZE_LW` × `MAZE_LH`) |
| Tile size       | 16 px (server virtual units) |
| Symmetry axis  | Between cols 10 and 11 (col `i` mirrors col `21−i`) |

Each logical cell `(lc, lr)` centers at tile `(1 + lc*2, 1 + lr*2)`. Gap tiles between cells are DOT (open) or WALL (closed). Pillar tiles at even-even coords default to WALL.

## Tile types

```
WALL   0   Solid wall
DOT    1   Small pellet (10 pts)
POWER  2   Power pellet (50 pts)
EMPTY  3   Open space (no dot)
HOUSE  4   Ghost house interior (ghosts only)
DOOR   5   Ghost house door (ghosts only)
TUNNEL 6   Horizontal wrap at left/right edge
PORTAL 7   Topological portal (torus/klein/projective)
```

## Fixed layout elements (tile coords)

- **Ghost house**: rows 8–11, cols 7–13. Door at `(10, 8)`. Interior rows 9–10, exit corridor row 11.
- **Side exits**: handcrafted and generated levels can use rows 7, 12, and/or 17. Normal exits use `TUNNEL` at cols 0 and 21; Klein exits use `PORTAL` pairs.
- **Power pellets**: `(1,7)`, `(20,7)`, `(1,17)`, `(20,17)` (near four corners).
- **Player spawns**: `(9,19)`, `(11,19)`, `(9,21)`, `(11,21)` — centered below ghost house.
- **Ghost spawns**: Blinky `(11,7)`, Pinky `(9,10)`, Inky `(11,10)`, Clyde `(12,10)`.
- **Fruit spawn**: handcrafted levels use `(10,15)`; simplified generated levels use `(7,15)` so fruit sits on their left-center backbone.

## Ghost AI

Four ghosts: Blinky (red), Pinky (pink), Inky (cyan), Clyde (orange).

Modes: `scatter` → `chase` → `frightened` → `eaten` → `house`.

- **Scatter**: move toward fixed corner targets.
- **Chase**: Blinky targets nearest player directly; Pinky targets 4 tiles ahead; Inky uses triangulation; Clyde switches based on distance.
- **Frightened**: random walk (avoids reversing), half speed. Triggered when any player eats a power pellet.
- **Eaten**: BFS gradient descent toward ghost door via pre-computed `toHomeMap`. Double speed.
- **House exit**: time-based fallback `[0, 4, 9, 15]s` per ghost, or dot-threshold–based.

Scatter/chase cycle: 7s, 20s, 7s, 20s, 5s, 20s, 5s, ∞ chase.

## Difficulty & speed

| Setting    | Ghost speed | Frightened duration |
|------------|-------------|---------------------|
| Easy       | 1.5 px/tick | 8 000 ms            |
| Medium     | 2.0 px/tick | 6 000 ms            |
| Hard       | 2.6 px/tick | 4 000 ms            |

Player speed: 2.5 px/tick (before speed multiplier).
Speed multipliers: slow 0.65×, medium 1.0×, fast 1.55×.

## Tunnel & portal mechanics

Wrapping is **tile-based** — the sim checks `tileAt() === T.TUNNEL` at cols 0 / 21 and warps to the opposite edge. Multiple tunnel rows work without code changes; just place `TUNNEL` tiles at both edges on the desired rows.

Portal pairs (topological): stored in `portalPairs[]`. When a player/ghost enters a PORTAL tile moving toward the border, they teleport to the paired tile.

## Level structure

- **Levels 1–4**: pre-built hand-crafted layouts in `LEVELS[]`. They pass through `carveLargeLoopLayout()` so the opener set stays simple: long lanes, a few vertical trunks, larger loops, and fewer tiny branch choices.
- **Levels 5+**: deterministic procedural layouts via `generateLevel(levelNum)`.
- Procedural levels use the strict loop-only generator: no dead ends, no non-exempt 2×2 open blocks, connected player space, and hard validation before returning.
- Procedural levels 5+ intentionally use a simpler reserved-cell mask and low extra-loop density (`0.03`–`0.10`) so they read as cleaner Pac-Man corridors instead of dense labyrinths.
- Each procedural level chooses either 2 or 3 side rows from `[7,17]` or `[7,12,17]`, then chooses one left/right mode for the whole level:
  - `torus_lr`: normal side tunnels using `TUNNEL` edge tiles and same-row wrap.
  - `klein_lr`: Klein side portals using `PORTAL` edge tiles, with top ↔ bottom and middle ↔ middle when row 12 is present.

## Maze generation pipeline

1. `generateLogicalMaze(seed, loopDensity, reservedFn)` — builds a 10×12 logical grid with cycle-first algorithm (Hamiltonian cycle → random extra edges). Guarantees no dead ends, no 2×2 open blocks, connectivity.
2. `toTileGrid(walls, reservedFn, T)` — expands to 22×26 tile grid.
3. `applyOverlays(grid, sidePlan)` — stamps ghost house, side tunnels/portals, power pellets, perimeter.
4. `repairConnectivity(grid)` — flood-fill + straight-line bridge for isolated regions.
5. `eliminateDeadEnds(grid)` — iteratively walls off ≤1-neighbor tiles.
6. `collectGeneratedLevelIssues(...)` / `validateMaze(...)` — hard validation for generated levels, diagnostic warnings for legacy/special layouts.
7. `buildToHomeMap(tiles, T, doorX, doorY)` — BFS distance map for eaten-ghost pathfinding.

## Maze design rules

These rules apply to all maze layouts (hand-crafted or generated):

1. **Bilateral symmetry** — left-right mirror around the vertical center axis (col `i` ↔ col `21−i`). The original Pac-Man and its sequels use bilateral symmetry; it makes the maze feel fair and legible.
2. **No dead ends** — every walkable tile must have ≥2 non-wall orthogonal neighbors. Dead ends trap players and make ghost encounters feel unfair.
3. **Corridors exactly 1 tile wide** — no 2×2 block of tiles may all be walkable (exempt: ghost house vicinity rows 7–12 cols 5–15, tunnel wings rows 11–13 cols 0–6 / 14–21). This preserves the tension of corridor navigation.
4. **Side exits (tunnels)** — at least two tunnel wraps per side, at roughly 1/3 and 2/3 of the maze height. These give escape routes and strategic shortcuts.
5. **Ghost house centered** — rows 8–11, cols 7–13, door at `(10, 8)`, approach corridors on cols 6 and 14. This is fixed infrastructure; do not move it.
6. **Power pellets near corners** — 4 power pellets placed symmetrically, away from ghost house and player spawns, so players must commit to a detour.
7. **Connected graph** — all player-accessible tiles must be reachable from any other via walkable tiles.
8. **Walled perimeter** — rows 0 / 25 and cols 0 / 21 are walls, except tunnel exits and portal tiles.
9. **Player spawns below ghost house** — centered at rows 19/21, giving a safe starting area.
10. **Fruit spawn at center** — at `(10, 15)`, reachable from all directions.
11. **Wall blocks for structure** — use solid wall rectangles (2×2 to 2×4 in tile space) to create rooms and corridors, not just random single-tile walls. This gives the maze a clean, deliberate look.
12. **Loops and T-junctions** — every section of the maze should offer at least two escape routes. Avoid long straight corridors with no branches.

## State shape highlights

See `docs/STATE.md` for shared conventions.

Key fields (non-exhaustive):
- `tiles[][]` — mutable 26×22 grid (dots removed as eaten)
- `toHomeMap[][]` — BFS distance from ghost door
- `players[1..4]` — `{x, y, dir, pendingDir, moving, lives, alive, respawnTimer, powerTimer, dotsEaten, color, decoration, connected, paused}`
- `ghosts[0..3]` — `{id, name, color, x, y, dir, pendingDir, mode, frightenedBy, frightenedTimer, houseExitDots, houseTimer, prevTileKey}`
- `score`, `totalDots`, `dotsRemaining`, `dotsEatenTotal`
- `ghostMode`, `ghostModeTimer`, `scatterChaseIndex`
- `fruit`, `fruitThresholdIdx`, `fruitEaten`
- `popups[]` — transient score/text popups for client FX

## Practical editing guidance

- **New maze layout**: define the left half as a visual ASCII template, mirror it, and run through the overlay/repair/validate pipeline. See `handCraftedLevel1()` in `pacfriends_levels.js` for the pattern.
- **Tunnel wrapping**: tile-based; just place `T.TUNNEL` at cols 0 and 21 on any row. No sim changes needed.
- **Ghost behavior**: modify chase targeting in `chooseGhostTarget()` or speed constants at top of `pacfriends_sim.js`.
- **Difficulty tuning**: adjust `GHOST_SPEED_PX`, `FRIGHTENED_DURATION_MS`, `SPEED_MULT` constants.
- **Adding levels**: append to `LEVELS[]` or modify `generateLevel()` for procedural levels 7+.

## Common pitfalls

- Editing overlays (ghost house, tunnel, power pellets) carelessly can create dead ends or disconnect regions. Always run `repairConnectivity()` and `eliminateDeadEnds()` after manual edits.
- The `toHomeMap` must be rebuilt whenever the tile grid changes (call `buildToHomeMap()`), or eaten ghosts won't path home.
- Portal pairs must be symmetric (each pair needs both directions).
- The 2×2 open-block constraint is relaxed in the ghost house and tunnel approach zones — don't flag those as errors.
