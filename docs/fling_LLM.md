# Fling — LLM notes

Fling is a cooperative projectile game inspired by QBasic Gorilla. Up to 4 players fling rubber ducks at alien ships that are eating the Earth (and other planets), across landscapes of rolling hills, rocky plateaus, craters, and icy cliffs.

## Theme & Characters

Players choose from 10 story characters:
- **Hunter** — a human hunter with a brown hat and green jacket
- **Mr. What What** — looks like Tom Baker with curly hair and a long multicolor scarf
- **Chaihou** — an orange tiger with black stripes
- **Taolabi** — a green woodpecker with a red crest and yellow beak
- **Chichi Gonju** — a white rabbit with long pink-lined ears and whiskers
- **Starway** — a blue electric eel with yellow lightning sparks
- **Brillan** — a red robot boy with a square head, cyan eyes, and antenna
- **Daddy** — a balding dad with a blue shirt, cane, and warm expression
- **Mama** — a beautiful woman in a qipao with black hair just below the shoulders
- **Gugu** — shortish brown neck-length hair, jeans, and a shirt

**Targets:** Alien fish — blue-gray (`0x2a3a50`) pac-man-shaped fish oriented vertically, head pointing down, tail fin up, dorsal fin to one side. The bottom quarter of the body is a wide-open mouth gap (pac-man cutout, no dark fill). Fish are sunk 25% into the ground (center at `gy - TARGET_RADIUS * 0.5`). Friendly single eye, no teeth or red parts. When hit, a rainbow explosion of 20 radial streaks bursts outward.

**Projectiles:** Rubber ducks — yellow with orange beak, tumble/rotate as they fly. Air resistance varies by planet.

**Landscapes:** Vary by world — green hills (Earth), cave tunnels with ceilings and stalactites (Cave), red rocky plateaus (Mars), gray craters (Moon), icy cliffs (Enceladus), volcanic plains (Io), and a rough bumpy nucleus (Comet).

## Where things live

Server:
- `apps/ws/src/games/fling.js` (WebSocket room host + routing)
- `apps/ws/src/games/fling_sim.js` (authoritative simulation)

Client:
- `fling/client/src/net.js`
- `fling/client/src/game/scenes/MenuScene.js`
- `fling/client/src/game/scenes/PlayScene.js`

## Core loop

- Host tick: every **50ms** calls `Sim.step(state, now)` and broadcasts `{type:"state"}`.
- State includes terrain heightmap, planet physics, player positions/aim/avatar, projectiles in flight, and targets.

## Protocol (Fling)

Handshake:
- `{type:"hello", gameId:"fling", protocol:1}`

Lobby / room messages (common):
- `create_room`, `join_room {roomId}`, `get_rooms`

Setup/control:
- `pause`, `resume`
- `restart`
- `select_level { level: number }` (1–16)
- `next_level`
- `select_avatar { avatar: string }` — one of: `hunter`, `mrwhatwhat`, `chaihou`, `taolabi`, `chichi`, `starway`, `brillan`, `daddy`, `mama`, `gugu`
- `set_guides { show: boolean }` — toggle trajectory preview dots (global for all players)

Gameplay input:
- `input { action: "aim", angle: number, power: number }`
  - angle: degrees from horizontal (5–85), power: 5–100
- `input { action: "fire" }`

Server → client:
- `state { state }`

## State shape highlights

See `docs/STATE.md` for shared conventions.

Fling state fields:
- `w`, `h`: pixel dimensions (800×600)
- `level`: current level (1–16)
- `maxLevel`: 16
- `levelComplete`: boolean
- `showGuides`: boolean — trajectory preview dots visible for all players (toggled via `set_guides`)
- `planet`: `"earth"` | `"cave"` | `"mars"` | `"moon"` | `"enceladus"` | `"io"` | `"comet"` — current planet ID
- `gravity`: number — px/s², varies by planet
- `airResistance`: number — drag coefficient, varies by planet
- `powerToVelocity`: number — power-to-speed multiplier, varies by planet
- `terrain`: `{ heights: number[], step: number, ceilingHeights?: number[] }` — heightmap sampled every 8px; cave levels also include a ceiling profile
- `targets[]`: `{ id, x, y, hit }` — placed on right-side terrain
- `projectiles[]`: `{ id, owner, x, y, vx, vy, rotation, rotationSpeed, active, bornAt }`
- `projectileType`: `"rubber_duck"` (easy to change)
- `targetType`: `"alien_ship"` (easy to change)
- `avatars`: `string[]` — list of available avatar IDs (sent to client for selection UI)
- `players[pid]`: `{ connected, paused, avatar, color, x, y, aimAngle, aimPower, fireCooldownMs }`

## Planet system

7 worlds with calibrated physics:

| World     | Gravity (px/s²) | Air Resistance | Power→Velocity | Levels |
|-----------|-----------------|----------------|----------------|--------|
| Earth     | 400             | 0.15           | 7.5            | 1–3    |
| Cave      | 320             | 0.05           | 6.2            | 4–5    |
| Mars      | 200             | 0.03           | 5.0            | 6–7    |
| Moon      | 100             | 0.0            | 3.5            | 8–9    |
| Enceladus | 50              | 0.0            | 2.5            | 10–11  |
| Io        | 120             | 0.0            | 3.8            | 12–13  |
| Comet     | 35              | 0.0            | 2.0            | 14–16  |

Planet physics are stored in `PLANETS` config in `fling_sim.js` and broadcast as state fields (`state.gravity`, `state.airResistance`, `state.powerToVelocity`).

## Terrain system

- Terrain is a heightmap: `terrain.heights[i]` gives the ground height at x = `i * terrain.step`
- Height is measured from the bottom of the screen (higher value = taller ground)
- Ground Y in world coords: `WORLD_H - terrainHeightAt(terrain, x)`
- Terrain generation varies by planet:
  - **Earth**: 3 layered sine waves with random phases (rolling green hills)
  - **Cave**: floor heightmap + separate ceiling heightmap with stamped stalactites/stalagmites
  - **Mars**: Sine waves + `abs(sin)` for mesa/plateau features (red rocky terrain)
  - **Moon**: 4 layered sine waves (including high-frequency surface roughness) + stamped parabolic craters with raised rims; bumpiness scales with difficulty via `bumpScale`
  - **Enceladus**: Large sine cliffs + sawtooth ridges + fine ice texture + extra jagged detail; bumpiness scales with difficulty via `bumpScale`
  - **Comet**: 67P-inspired bilobed rough nucleus with neck dips, pits, scarps/terraces, and very low gravity

## Level design

16 levels across 7 worlds:

- **Level 1** (Earth): gentle hills, 1 target
- **Level 2** (Earth): moderate hills, 2 targets
- **Level 3** (Earth): steeper hills, 3 targets
- **Levels 4–5** (Cave): cave tunnels with a real ceiling and stalactites/stalagmites
- **Levels 6–7** (Mars): rocky plateaus
- **Levels 8–9** (Moon): crater-heavy gray terrain
- **Levels 10–11** (Enceladus): icy cliffs with geysers
- **Levels 12–13** (Io): volcanic ridges and sulfur-like patches
- **Levels 14–16** (Comet): very bumpy low-gravity comet-nucleus terrain

Players are placed on the left ~25% of the terrain.
Targets are placed across the right ~35%.

## Physics

Physics vary by planet (see Planet system table above). Common rules:
- Power maps to initial speed: `power × powerToVelocity = px/s`
- Air resistance: `velocity *= (1 - airResistance * dt)` each tick (0 for airless worlds)
- Projectiles collide with terrain surface (absorbed), cave ceilings (absorbed), and targets (destroyed)
- Fire cooldown: 600ms per player
- Max 3 in-flight projectiles per player
- Projectiles tumble: rotation field increments by rotationSpeed * dt each tick

## Rendering (planet-specific)

PlayScene renders sky, terrain, and details based on `state.planet`:

**Sky:**
- Earth: blue gradient, yellow sun, white clouds
- Cave: dark cave interior with warm glows and dust motes
- Mars: orange-red dusty gradient, small distant sun, dust particles
- Moon: black starfield, Earth in distance (upper-left, radius 66) with orthographic-projected continent polygons (`EARTH_CONTINENTS` — 7 continents defined as [lon°, lat°] outlines), random rotation per level, half-sphere phase overlay (alpha 0.3), atmosphere glow; stars
- Enceladus: dark blue-black starfield, Saturn with rings (upper-right, radius 53) and hexagonal polar storm, geyser plumes
- Comet: dense starfield with faint bluish comet-tail haze

**Terrain colors:**
- Earth: green surface, dark green depth, grass tufts
- Cave: brown rocky floor/depth plus separate rocky cave ceiling
- Mars: red-brown surface, dark red depth, rocky pebbles
- Moon: gray surface, darker gray depth, crater rim highlights
- Enceladus: icy blue-white surface, blue depth, shine highlights
- Comet: dusty gray-green rough surface with rubble highlights

**Trajectory preview** reads physics from `state.gravity`, `state.airResistance`, `state.powerToVelocity` so it stays in sync with the server. Gated on `state.showGuides` (global toggle).

**Effects:**
- Rainbow explosion: 20 radial rainbow-colored streaks burst from each target on hit, fading over 900ms
- Level complete: synthesized trumpet fanfare (C5-E5-G5 via Web Audio), characters bounce with frequency proportional to `sqrt(gravity)`
- Fire button is positioned dynamically below the player each frame

## Avatar system

- 10 selectable avatars, each with an associated color
- Default assignments: P1=brillan, P2=chaihou, P3=mrwhatwhat, P4=chichi
- Avatar selection via `select_avatar` message, available during pause
- Each avatar has a distinct drawing function in `PlayScene.js` (`AVATAR_DRAW` object)
- Selecting an avatar also updates the player's color to match

## Aiming

- Drag-to-aim: click and drag the arrow tip to change angle and power
  - A draggable handle circle (18px) is shown around the arrow tip
  - Grab detection radius is 60px; clicks below the player's ground level are excluded
  - While dragging, an angle-finder arc (protractor) appears with tick marks every 15°
  - Aim is sent to server on drag release
- Click-to-aim fallback: clicking elsewhere on the play area (above ground level) also sets aim
- Angle computed from player position to pointer position
- Power proportional to pointer distance (scaled to 0–100)
- Aim persists between shots (not reset after firing)
- Text HUD shows current angle, power, and planet name
- Trajectory preview drawn as dotted arc (gated on global "Show guides" toggle from state)
  - Guide length scales with level difficulty (global for all players):
    - Levels 1-3: full path
    - Level 4: ~75% of full trajectory
    - Level 5: ~50% of full trajectory
    - Level 6: ~25% of full trajectory
    - Level 7+: capped to 3 dots (and remains this short for any future higher levels)

## Pause / Setup menu

- Uses the `setupContainer` pattern from maze/snake
- Two modes:
  - **Lobby** (`state.paused && state.reasonPaused === 'start'`): shows "GAME SETUP" title, level selector (1–16), avatar selector, Show guides toggle, Start button
  - **Pause** (`me.paused`): shows "PAUSED" title, avatar/level selectors, guides toggle, Continue button
- Pause button is large, positioned top-left below the HUD text
- Fire button is positioned dynamically below the player's character
- Space and P keys toggle pause/resume
- Selected avatar, level, and guides option are highlighted with dark background
- `createSetupUI()` builds the container once; `updateSetupUI()` updates highlights/visibility each frame

## Practical editing guidance

- To add a new avatar: add to `AVATARS` array in fling_sim.js, add to `AVATAR_COLORS`, add to `AVATAR_DRAW` in PlayScene.js, add label to `AVATAR_LABELS`
- To change projectile type: update `PROJECTILE_TYPE` in sim, update `drawProjectiles()` in PlayScene
- To change target type: update `TARGET_TYPE` in sim, update `drawTargets()` in PlayScene
- To adjust terrain difficulty: modify amplitude calculations in `generateTerrain()`
- To add a new planet: add to `PLANETS` config in sim, add level entries to `LEVELS`, add terrain generation branch in `generateTerrain()`, add sky/terrain rendering in PlayScene (`drawSky*()`, palettes in `drawTerrain()`)
- To add a new level: add entry to `LEVELS` array in sim (planet + targets + difficulty)
- Physics are broadcast in state — trajectory preview in PlayScene reads from state, no hardcoded constants to keep in sync

## Common pitfalls

- Angle is in degrees in the protocol but radians in physics calculations
- Screen Y is inverted (0 = top), so `vy` is negative for upward motion
- Terrain collision uses world coordinates; rendering uses scaled screen coordinates
- Physics values (gravity, airResistance, powerToVelocity) vary by planet — always read from state, never hardcode
- The terrain heightmap is broadcast every tick as part of full state — keep it compact (100 samples)
