# Archimedes — LLM notes

Archimedes is a cooperative, touch-first **2D physics "toy museum"** for kids (~5) + parents.

## Current implementation status

- **Implemented:** Module 1 (Buoyancy Ferry), Module 2 (Seesaw Lab), Module 3 (Pulley Builder).
- **Planned:** Modules 4–7 + bonus Pi module (see roadmap below).

Each "module" is a self-contained physics toy (previously called a "level"). Within a module there can be sub-levels that share the same physics engine.

This file describes **how the current repo works** (protocol + authority) and carries the **future roadmap** in one place.

## Product goals

- 2D only, web-first, touch-first but mouse/keyboard works.
- Online multiplayer, 1–4 players per room; all players have equal abilities.
- Educational via cause → effect → iterate (minimal text, mostly visual hints).
- Free-play vibe: door can open when "explored enough", but it should not force exit.
- Low frustration: quick reset, forgiving interactions, big hitboxes.

## Where things live

Server:
- `apps/ws/src/games/archimedes.js` — WebSocket room host + routing (generic, no module-specific logic)
- `apps/ws/src/games/archimedes_sim.js` — top-level dispatcher: `step()`, `applyInput()`, `initModule()` route to the active module's handler
- `apps/ws/src/games/archimedes_utils.js` — **shared utilities** for all module sims: claim/release, cursor movement, `initModuleBase`, tick constants
- `apps/ws/src/games/archimedes_ferry_sim.js` — Module 1 (Buoyancy Ferry): boat physics, sailing, capsize, object types, sub-levels
- `apps/ws/src/games/archimedes_seesaw_sim.js` — Module 2 (Seesaw Lab): torque-driven beam, baskets, pivot drag, 6 sub-levels
- `apps/ws/src/games/archimedes_pulley_sim.js` — Module 3 (Pulley Builder): mechanical advantage, rope segments, counterweight, elevator, 6 sub-levels

Client:
- `archimedes/client/src/net.js` (includes `sendInput(action, data)` helper)
- `archimedes/client/src/game/scenes/MenuScene.js`
- `archimedes/client/src/game/scenes/PlayScene.js` — top-level scene: dispatches rendering + input to the active module's renderer
- `archimedes/client/src/game/renderers/renderer_utils.js` — **shared utilities** for all renderers: common UI chrome, confetti, emoji caching, door button
- `archimedes/client/src/game/renderers/ferry_renderer.js` — Module 1 renderer: boat hull, mainsail, shores, water, ferry objects
- `archimedes/client/src/game/renderers/seesaw_renderer.js` — Module 2 renderer: beam, baskets, pivot triangle, earth/archimedes characters
- `archimedes/client/src/game/renderers/pulley_renderer.js` — Module 3 renderer: pulleys, rope, load, counterweight, elevator

## Core loop

- Host tick: every **50ms** calls `Sim.step(state, now)` and broadcasts `{type:"state"}`.
- Input is mostly event-driven (cursor moves + grab/release + go/reset).

## Boat physics model (Level 1)

Constants (defined in `archimedes_sim.js`):
```
HULL_WIDTH = 200        // hull width in game pixels
HULL_HEIGHT = 60        // total hull height
EMPTY_FREEBOARD = 40    // hull above water when empty
EMPTY_DRAFT = 20        // hull below water when empty
SINK_PX_PER_MASS = 2.0  // extra pixels of sinking per mass unit
MAX_SAFE_SINK = 36      // beyond this → deck underwater → capsize
```

Computed each tick:
- `sinkOffset = max(0, cargoMass) * SINK_PX_PER_MASS`
- `deckY = waterY - EMPTY_FREEBOARD + sinkOffset`
- `tilt = clamp(comOffsetX * 0.6, -35, 35)` (mass-weighted COM offset)
- Capsize when `sinkOffset > MAX_SAFE_SINK` OR `|tilt| >= 30`

Visual principle: water is drawn as a semi-transparent overlay from `waterY` downward. The boat hull is drawn first, then water covers the submerged portion. This makes sinking visually obvious — as cargo increases, more hull disappears under water.

## Sail and wind model

- The boat has a **mainsail** (vertical mast + horizontal boom, purely visual, weightless).
- When 'go' is pressed, the **wind automatically blows in the travel direction**.
- `boat.windDir`: `1` (blowing right), `-1` (blowing left), `0` (calm, at dock).
- The sail switches side as the boat changes direction (boom swings to the downwind side).
- Wind particles animate while sailing.
- Going right requires cargo on the boat; going left (return) always allowed.

## Module 1 sub-levels (implemented)

### 1-1: River Ferry
- 2 kids (mass 10 each) + 2 ducks (mass 3 each) = 26 total
- Boat safe payload ≈ 18. Two kids = 20 → capsizes!
- Solution: 1 kid + 2 ducks (16) then 1 kid (10). **3 trips (R-L-R).**

### 1-2: Heavy Load
- 2 kids (20) + 1 duck (3) + 1 helium balloon (-2) = 21 net
- Helium balloon reduces effective load. **3 trips (R-L-R).**

### 1-3: Boulder Run
- 2 kids (20) + 1 duck (3) + 1 stone (15) + 2 helium balloons (-4) = 34 net
- Stone alone fills most of the payload. Need **5 trips (R-L-R-L-R).** (3 delivery trips)

### Trip mechanics
- Going right (delivering) requires at least one item on the boat.
- Going left (returning) is always allowed with an empty boat.
- Wind automatically blows in the direction the boat needs to travel.

## Protocol (Archimedes)

Handshake:
- `{type:"hello", gameId:"archimedes", protocol:1}`

Lobby / room messages (common):
- `create_room`, `join_room {roomId}`, `get_rooms`

Pause/control:
- `pause`, `resume`

Gameplay input — single `input` message with `action` field:
- `cursor_move { x, y }` — move cursor (and held object)
- `grab { objectId }` — pick up an object
- `release` — drop held object (server does boat hit-test)
- `go` — start sailing
- `reset` — reset current trip (boat returns to left dock)
- `full_reset` — restart entire level
- `toggle_pause` — pause/unpause game
- `toggle_level_select` — show/hide module picker
- `set_level { level }` — switch to a specific sub-level within the current module
- `set_module { module }` — switch to a different module (physics toy)
- `door_click` — advance to next module (when door is open)

Server → client:
- `state { state }`

Notes on authority:
- Server-authoritative Node WebSocket backend.
- Clients treat `state` snapshots as truth and only send intent via messages.
- Drop hit-testing happens server-side: `release` checks if object position overlaps boat bounds.

## State shape highlights

See `docs/STATE.md` for shared conventions.

Archimedes state fields:
- Module: `moduleType` (e.g. `'ferry'`, `'seesaw'`, `'pulley'`…), `moduleIndex` (1-based), `moduleName`
- Layout: `sceneWidth`, `sceneHeight`, `waterY`, `leftShoreX`, `rightShoreX`, shore areas *(ferry-specific)*
- Progress: `totalToDeliver`, `deliveredCount`, `tripsCompleted`, `doorOpen`
- Boat: `boat.x`, `boat.deckY`, `boat.sinkOffset`, `boat.tilt`, `boat.capsized`, `boat.capsizeRotation`, `boat.sailing`, `boat.atDock`, `boat.targetX`, `boat.windDir`, `boat.hasSail`
- Objects: array of `{ id, type, x, y, mass, size, emoji, color, label, onBoat, onShore, delivered, claimedBy, claimTime }`
  - types: `kid`, `duck`, `balloon`, `helium_balloon`, `stone`
- Players: `cursorX`, `cursorY`, `heldObjectId`
- `cargoMass`: computed total mass on boat (negative = balloon lift)

## Multi-player interaction model

- Objects are "claimable" to avoid two players dragging the same item:
  - `grab` sets `obj.claimedBy = playerId` and `player.heldObjectId = obj.id`.
  - `cursor_move` moves the held object (server-authoritative).
  - `release` clears the claim. Server hit-tests against boat bounds and either snaps to deck or drops on shore.
  - Objects auto-arrange on deck in evenly-spaced slots.

## Client rendering (layered draw order)

PlayScene draws in this order for correct waterline visibility:
1. Sky (above waterY)
2. Shores (left/right grass + edges)
3. Boat hull (full trapezoid from deckY to keelY)
4. Mainsail (vertical mast + boom, sail switches side with wind direction)
5. Wind particles (when sailing)
6. Objects on boat / being dragged
7. Water body (semi-transparent overlay from waterY down — covers submerged hull)
8. Water surface line (prominent, at waterY)
9. Objects on shore
10. Player cursors
11. UI (toolbar, messages, door — door is large 48px, grows to 56px when open)

## Practical editing guidance

- Keep the game touch-first: large hitboxes and forgiving drop logic.
- **Adding a new module** (physics toy):
  1. Create `apps/ws/src/games/archimedes_<name>_sim.js` exporting `{ initModule, step, applyInput }`.
  2. Register it in `archimedes_sim.js` MODULES table.
  3. Create `archimedes/client/src/game/renderers/<name>_renderer.js` exporting `{ create, renderState, onPointerDown, onPointerMove, onPointerUp }`.
  4. Register it in PlayScene's renderer map.
  5. Add the module to the level select overlay (auto-populated from MODULES).
- **Adding sub-levels within a module**: update `LEVELS` in the module's sim file.
- Boat constants (HULL_WIDTH, HULL_HEIGHT, EMPTY_FREEBOARD, etc.) are exported from `archimedes_ferry_sim.js` for client reference.
- **Module transitions**: `initModule()` sets `state.objects = []` which clears all items. The client cleans up stale cached text objects by checking current object IDs each render frame.
- **Module select**: Press `L` or tap the 📋 button (bottom-left) to open the module picker for debugging.

## Common pitfalls

- Letting objects be draggable while the boat is sailing (server blocks this; keep it that way).
- Forgetting to clear `claimedBy` when resetting or when a player disconnects.
- The old code had `boat.baseY` referenced but never initialized — causing NaN in all drop hit-tests. The new code uses `boat.deckY` which is computed every tick.

---

## Module 2: Seesaw Lab — implementation details

### Physics model

Constants:
```
PHYSICS_SCALE = 10     // angular acceleration scale
BEAM_MASS = 1          // normalized beam inertia
DAMPING = 0.6065       // = exp(−0.5); critically damped unloaded beam
RESTORE_FACTOR = 32    // spring toward horizontal
MAX_ANGLE = π/6        // ±30°
BALANCE_TORQUE_TOL = 0.3
BALANCE_VEL_TOL = 0.02
BALANCE_TICKS = 20     // 1 second of sustained balance required
BASKET_HANGER_LEN = 36 // world px from beam to basket top
BASKET_ITEM_Y = 24     // world px from basket top to item center
```

Computed each tick:
1. `netTorque = Σ(mass × beamPosition × PHYSICS_SCALE) − beam.angle × RESTORE_FACTOR`
2. `I = BEAM_MASS + Σ(mass × beamPosition²)`
3. `angularAccel = netTorque / I`
4. `angularVelocity = angularVelocity × DAMPING + angularAccel × TICK_DT`
5. `angle += angularVelocity × TICK_DT`
6. Clamped by `beamGroundY` (separate from visual `groundY` so baskets don't clip ground)

Balance is detected when `|massTorque| < 0.3 AND |angularVelocity| < 0.02` for 20 consecutive ticks AND at least one non-fixed object is on the beam.

### Ground separation

Two Y values are tracked:
- `state.groundY = 465` — visual ground line (sky/grass boundary)
- `state.beamGroundY = 400` (with baskets) or `465` (no baskets) — physics stop for beam ends; keeps basket bottoms above visual ground

### beamPosition conventions

`beamPosition` is a normalized value in `[leftLimit, rightLimit]` where:
- `leftLimit = -leftArm / span`, `rightLimit = rightArm / span`
- `beamPosition × span` = arm distance in world px from pivot
- For `pinWorldX` objects (earth, archimedes): `beamPosition = physArm / span` where `physArm = pinWorldX − pivotX`. The object rotates **with** the beam (no cos-division). This matches how `drawBeam` draws with `rotateCanvas`.

### Sub-levels

| # | Id | Key mechanic |
|---|-----|-------------|
| 1 | `fixed_four` | Right basket fixed at 4. Build 4 on left. |
| 2 | `fixed_six` | Right basket fixed at 6. Too many weights — find the combo. |
| 3 | `half_arm_basket` | Right arm is half-length. Balance with half the weight. |
| 4 | `single_slider` | Fixed basket endpoints; drag the pivot to balance. |
| 5 | `torque_arms` | Three left slots at different distances; `doorTarget: 2` (balance twice). |
| 6 | `earth_and_archimedes` | Archimedes (mass 12) sits on left end; Earth (mass 112) on right. Slide fulcrum to the limit. `baskets: false`, `fixedBeamEndpoints: true`. |

### Basket system

- `state.baskets.left` / `.right` — single basket positions (`pos` in beam-position units)
- `state.baskets.leftSlots` — array of `{pos}` for multi-basket levels
- Objects in baskets track `inBasket`, `basketIndex`, `basketCount` for side-offset stacking
- `reindexBasket(state, objects, name)` recomputes indices after any add/remove

### Rendering coordinate transform

The beam is drawn via `rotateCanvas(beam.angle)` with `scaleX = sx(1) − sx(0)` applied to all offsets. This means `scaleX` is used for both X and Y displacements in beam-local space. All beam-space features (baskets, earth, archimedes) must use this same transform:
```js
const scaleX = (sx(scene, 1) - sx(scene, 0)) || 1;
const pivX = sx(scene, beam.pivotX);
const pivY = sy(scene, beam.pivotY);
const beamT = obj.beamPosition * beamSpan(beam) * scaleX;
const screenX = pivX + beamT * Math.cos(angle);
const screenY = pivY + beamT * Math.sin(angle);
```
Using `sy(obj.y)` for on-beam objects introduces drift on non-square aspect ratios.

### Level 6 special rendering

Earth and Archimedes sit on the beam top surface (perpendicular offset):
```js
const seatOffset = BEAM_HALF_H + r * 0.5;  // BEAM_HALF_H = 6
x = bx - seatOffset * Math.sin(angle);
y = by - seatOffset * Math.cos(angle);
```
Archimedes' leg line runs along the beam direction (`cos(angle)`, `sin(angle)`) so it looks like he's straddling the lever.

---

## Module 3: Pulley Builder — implementation details

### Physics model (position-based rope with ratchet)

```
MAX_EFFORT       = 15    // max force a player can exert
ANCHOR_Y         = 60    // Y of ceiling pulley axle
FLOOR_Y          = 445   // Y of floor
CW_OVERLOAD_RISE = 3     // px/tick load rises when CW too heavy
CW_RESET_TICKS   = 40    // ticks before auto-reset (~2 s)
CRANK_SCALE      = 25    // rope-px per radian of crank rotation
```

Core state variable: `ropeConsumed` — total rope pulled through the system.
- `loadY = loadStartY − ropeConsumed / MA`
- `effortRequired = max(0, loadMass − cwMass) / MA`
- Pull speed scales with surplus effort: `speedMult = clamp((MAX_EFFORT − effortReq) / 5, 0.15, 1.0)`
- If `effortRequired > MAX_EFFORT`: handle won't move (struggle animation)
- On release: **ratchet** — handle springs back to ceiling, `ropeConsumed` stays, load stays at current height
- CW overload (`cwMass > loadMass + 3`): load auto-rises, then auto-resets after 2 s

### Sub-levels (6 levels)

| # | Id | Load (mass) | MA | Key mechanic |
|---|-----|------------|-----|-------------|
| 1 | `fixed_pulley` | Lantern 🏮 (8) | 1 | Fixed pulley — pull down to lift up |
| 2 | `movable_pulley` | Column 🏛️ (20) | 1→2 | Drag movable pulley from palette (MA doubles) |
| 3 | `compound_pulleys` | Statue 🗿 (45) | 1/2/4 | Select between 3 rig configs; count supporting segments |
| 4 | `counterweight` | Quarry Block ⛏️ (30) | 2 (pre-rigged) | 4 CW stones (5/15/25/40); too heavy CW causes auto-reset |
| 5 | `elevator_elephant` | Elevator 🛗 (15→50) | 1→4 | Baby elephant 🐘 steps on at 60% progress; reconfigure MA + CW |
| 6 | `differential_windlass` | Temple Stone 🪨 (200) | 20 | Crank-driven concentric drums; MA=20 |

### Rope model (ratchet pull)

- Player grabs handle, drags down → `ropeConsumed` increases → load rises
- On release: handle springs to ceiling (ratchet), `ropeConsumed` persists, load stays
- L1 (MA=1) fits in one pull; higher MA levels need multiple pulls (teaching force-distance trade-off)
- Supporting segments highlighted green with count badge
- Rope stripe animation: dash offset tracks `ropeConsumed`
- Level 6 uses a rotary crank instead of the linear handle

### Hint system

- Auto-triggered hints after idle/struggle delays (5–10 s)
- Hints point toward actions ("try the palette", "count the ropes") but never name the solution
- Tracked via `pulley.hint` string and `pulley.hintTimer` tick counter

### Counterweight system

- CW palette: `cw_5(5)`, `cw_15(15)`, `cw_25(25)`, `cw_40(40)`
- One CW at a time in bucket (swaps on new drop)
- Drop zone: `x∈[130,290], y<320`; outside → returns to home
- Balance gauge (semicircular, red/green/orange) rendered in L4/L5

---

## Roadmap: All modules (implement in order)

### Module 1: Buoyancy Ferry ✅ (implemented — see implementation details above)

**Theme:** Float/sink and stability while ferrying objects across a lake.

#### Scene
- A lake spanning left-to-right.
- A small boat with a mainsail that travels between docks (left dock → right dock).
- Dock platforms with object inventory (finite counts).
- A "waterline" drawn on boat hull and an "UH-OH line" above it.

#### Objects (finite counts per level)
- Kids (mass 10, 🧒)
- Ducks (mass 3, 🦆)
- Helium Balloons (mass -2, 🎈, light blue — reduce effective load)
- Balloons (mass -5, 🎈, purple — large volume, low mass)
- Stones/Boulders (mass 15, 🪨 — heavy!)

Each object has:
- `mass`
- `size` (for stacking + collision)
- `emoji`, `color`, `label`

#### Sub-levels (current implementation)
- **1-1: River Ferry** — 2 kids + 2 ducks = 26 total. **3 trips (R-L-R).**
- **1-2: Heavy Load** — 2 kids + 1 duck + 1 helium balloon = 21 net. **3 trips (R-L-R).**
- **1-3: Boulder Run** — 2 kids + 1 duck + 1 stone + 2 helium balloons = 34 net. **5 trips (R-L-R-L-R).**

#### Core interactions
- Players drag objects onto boat (auto-arranged on deck).
- Boat reacts:
  - sinks deeper as total mass increases
  - stability changes if COM shifts
- Press **GO**:
  - boat sails across to other side
  - wind auto-adjusts to blow in the direction of travel (forgiving; no navigation needed)
  - sail (mainsail rig: vertical mast + boom) switches side as boat changes direction
- Going right (delivering) requires at least one item on the boat.
- Going left (returning) is always allowed with an empty boat.

#### Buoyancy + stability model (2D)
Simplified stable toy model:
- Boat has:
  - `HULL_WIDTH = 200`, `HULL_HEIGHT = 60`, `EMPTY_FREEBOARD = 40`
  - `waterlineY` as function of payload mass
- Compute:
  - `sinkOffset = max(0, cargoMass) * SINK_PX_PER_MASS` (2px per mass unit)
  - `deckY = waterY - EMPTY_FREEBOARD + sinkOffset`
  - **Center of Mass (COM)** = mass-weighted average of all onboard items + boat mass
  - `tilt = clamp(comOffsetX * 0.6, -35, 35)` (COM-based tilt from lateral imbalance)
- Capsize condition:
  - if `sinkOffset > MAX_SAFE_SINK (36)` (deck goes underwater) OR
  - if `|tilt| >= 30°`
  ⇒ capsizes (only while sailing).
- Capsize: splash animation → auto-reset after 3s (boat + cargo back to left dock).

#### Feedback
- If capsizes: quick splash animation → **RESET boat trip** (boat back to dock, cargo back to left shore).

#### Door open condition
- **Current:** deliver all items to the right shore.
- **Future (planned):** any 3 of:
  - successfully sail with at least X ducks
  - sail with a balloon on board
  - capsize once (yes, discovery counts!)
  - sail while visibly tilted but not capsized
  - perform 3 trips

---

### Module 2: Seesaw Lab (Levers) ✅ (implemented — see implementation details above)

**Theme:** Balance and torque with a seesaw.

#### Scene
- Horizontal beam
- Pivot point (initially fixed)
- Two baskets at ends (Phase 1)
- Weight objects in palette

#### Phases (progressive unlock; remain free-play)
- Phase 1: Only baskets (players drop weights into baskets)
- Phase 2: Place weights anywhere along beam
- Phase 3: Pivot point becomes draggable

#### Mechanics
- Beam angle determined by torque balance:
  - `torque = sum(mass * distanceFromPivot)`
- When beam settles near level (within tolerance) for a moment:
  - show "Good job!" (sound + confetti)
  - then automatically move pivot to a new location
- Final "Archimedes lever" moment:
  - very long lever, Archimedes character on one side
  - balancing causes the **background/world to scroll** slightly to signal "moved the world"

#### Door open condition
- Balanced successfully at 3 different pivot positions.

---

### Module 3: Pulley Builder ✅ (implemented — see implementation details above)

**Theme:** Mechanical advantage — lots of rope pull → little lift.

#### Scene
- A load hanging from a hook
- Anchor points (ceiling, load hook, wall)
- A rope with a draggable end players can "pull"
- A drum/winch visualization OR a bottom "distance pulled" track

#### Interactions
- Start with a single simple pulley setup that fails for heavier loads.
- Players add pulleys from palette:
  - fixed pulley
  - movable pulley
- Rope auto-routes to sensible defaults:
  - snapping endpoints to anchors/pulleys
  - maintain a single continuous rope

#### Visual teaching
- Rope has moving **tick marks** (or striped pattern) to show how much rope moved.
- Load has a clear height marker.
- Emphasize "pull a long distance to lift a little."

#### Progression
- Levels are "heavier loads" (increasing required mechanical advantage).

#### Capstone: Elevator + counterweight
- Add a counterweight object.
- Once counterweight ~ matches load, elevator becomes easy to move.
- "Effort meter" drops visibly.

#### Door open condition
- Successfully lifts 3 progressively heavier loads OR builds elevator system.

---

### Module 4: Gears Playground (+ Winch)

**Theme:** Fast vs slow, gear trains, and output strength.

#### Scene
- Gear placement grid / pegs
- Output devices:
  - a flag spinner (speed)
  - a winch drum that lifts a crate (strength)
- Input crank controlled by dragging/turning.

#### Interactions
- Drag gears onto pegs; gears mesh automatically if adjacent.
- Output shows immediate motion.
- Avoid numbers; label output as FAST/SLOW with icons.

#### Gear model
- Each gear has teeth count implied by size.
- Rotation ratio derived from radii/teeth.
- For winch:
  - "fast gearing" can stall with heavy load (gentle stall; no frustration)
  - "slow gearing" lifts heavy load but slowly

#### Optional challenge cards (non-mandatory)
- "Make the flag spin super fast."
- "Lift the heavy crate."
- "Make two wheels spin opposite directions."
- "Use 3+ gears."

#### Door open condition
- Trigger 3 challenge cards OR time exploring.

---

### Module 5: Points of Sail (Sailing Upwind)

**Theme:** You can't sail directly into the wind; some angles are faster; tacking makes upwind progress.

#### Scene
- Top-down river/lake corridor with banks
- Boat at center
- Wind arrow always visible
- Background scrolls downward when boat makes upward progress

#### Controls
- Steering only (left/right); sails auto-trim.
- Wind direction changes slowly over time.

#### Mechanics
- Boat speed depends on angle between boat heading and wind:
  - No-go cone near wind direction (stall/very slow)
  - Fast around beam reach (~90°)
  - Fast around broad reach (~120–135°)
- If boat hits bank: it stops until steered away.

#### Door open condition
- Maintain upward scrolling for total of N seconds across changing wind OR perform 3 successful tacks.

---

### Module 6: Density Measurement Bath (Late/Capstone)

**Theme:** Modern "Archimedes" measurement — compare weight in air vs submerged; displacement and density.

#### Scene
- A tank of water
- A lever balance that evolves into a scale (ties to seesaw)
- Objects to test (same size/different mass etc.)

#### Interactions
- Place object on balance in air: see indicator
- Place object submerged (suspended in water): see indicator change
- Show displacement effect visually in tank (water rise) OR show "buoyant lift" via balance difference

#### Teaching visuals (minimal numbers)
- Show "heavier/lighter" and clear comparative markers.
- Allow free-play comparisons across objects.

#### Door open condition
- Test 3 objects in both states (air + water) OR time exploring.

---

### Module 7: Treasure Chest Playground (Optional sandbox mashup)

**Theme:** Combine toys: buoyancy + currents + winch + pulleys + gears.

#### Scene
- Floating platform + water
- A heavy treasure chest that shifts stability
- A current/wind field
- Attachment points for pulley/winch
- Gear box that can power winch

#### Goal
- No win. Just playful "make it move" experiments.

---

### Bonus Module: Pi Jar

**Theme:** Discover π visually.

**Part A — String around circle:**
- A circle with a string wrapped around it.
- Player drags string end to unwrap and lay along a lined background.
- Players can place tick marks along the string.

**Part B — Inscribed/circumscribed polygons:**
- Slider for polygon sides: 3, 6, 12, 24, 48…
- Show inscribed and circumscribed shapes converging to circle.
- Show "gap" shrinking visually.

**Pi Jar:** A jar that "collects" progress as a playful keepsake (visual only).

---

## Implementation phasing (adapting roadmap to this repo)

- **Backend:** Each module gets its own sim file (`archimedes_<module>_sim.js`). The dispatcher in `archimedes_sim.js` routes `step()`/`applyInput()` to the active module. `archimedes.js` is unchanged (fully generic).
- **Client:** Each module gets its own renderer file (`<module>_renderer.js`). PlayScene dispatches `renderState()` and input events to the active renderer.
- **Protocol:** Prefer **additive** changes and document new actions in `docs/PROTOCOL.md`.
- **Per-module approach:** Each new module introduces a different physics toy. The sim dispatches to module-specific step/input handlers based on `state.moduleType`.

### Global UX rules (intended for all modules)

- Persistent UI:
  - Top-left: module title
  - Top-right: door (closed until "explored enough")
  - Bottom: GO + RESET buttons
- Door open condition should be soft (any of): N "discoveries" per module, time spent experimenting (~90s), or a mix.
- Free-play: door opening doesn't force exit — players can keep experimenting.
