# Archimedes — LLM notes

Archimedes is a cooperative, touch-first **2D physics “toy museum”** for kids (~5) + parents.

Current implementation status:
- Implemented today: **River Ferry / buoyancy toy** with multiple ferry sub-levels.
- Planned (legacy spec): additional toy levels (seesaw, pulleys, gears, sailing upwind, density bath, sandbox mashup, and a Pi bonus).

This file is meant to be accurate about **how the current repo works** (protocol + authority), while also carrying the **future roadmap** in one place.

## Product goals (merged + current)

- 2D only, web-first, touch-first but mouse/keyboard works.
- Online multiplayer, 1–4 players per room; all players have equal abilities.
- Educational via cause → effect → iterate (minimal text, mostly visual hints).
- Free-play vibe: door can open when “explored enough”, but it should not force exit.
- Low frustration: quick reset, forgiving interactions, big hitboxes.

## Where things live

Server:
- `apps/ws/src/games/archimedes.js` (WebSocket room host + routing)
- `apps/ws/src/games/archimedes_sim.js` (authoritative simulation + level configs)

Client:
- `archimedes/client/src/net.js` (includes `sendInput(action, data)` helper)
- `archimedes/client/src/game/scenes/MenuScene.js`
- `archimedes/client/src/game/scenes/PlayScene.js`

## Core loop

- Host tick: every **50ms** calls `Sim.step(state, now)` and broadcasts `{type:"state"}`.
- Input is mostly event-driven (cursor moves + grab/release + go/reset).

## Current levels (implemented)

Archimedes currently ships with ferry variants defined in `apps/ws/src/games/archimedes_sim.js` under `LEVELS`:

- Level 1: **🚢 River Ferry** — baseline buoyancy/stability toy.
- Level 2: **⚖️ Heavy Load** — more cargo, balloons matter more.
- Level 3: **🎈 Balloon Lift** — explore lift vs payload.

The current “completion” logic is pragmatic: when all items are delivered, `doorOpen` becomes true and the UI shows the door opening, but the experience is still intended to remain free-play.

## Protocol (Archimedes)

Handshake:
- `{type:"hello", gameId:"archimedes", protocol:1}`

Lobby / room messages (common):
- `create_room`, `join_room {roomId}`, `get_rooms`

Pause/control:
- `pause`, `resume`

Gameplay input:
- A single message type: `input` with an `action` string.

Common actions (from client + server):
- `cursor_move { x:number, y:number }`
- `grab { objectId:string }`
- `release`
- `go`
- `reset`
- `toggle_pause`
- `toggle_level_select`
- `set_level { level:number }`
- `door_click`

Server → client:
- `state { state }`

Notes on authority (important):
- This repo uses a **server-authoritative Node WebSocket backend** (not a client-host/peer host).
- Clients should treat `state` snapshots as truth and only send intent via messages.

## State shape highlights

See `docs/STATE.md` for shared conventions.

Archimedes state fields (non-exhaustive):
- Scene layout: `sceneWidth`, `sceneHeight`, `waterY`, `leftShoreX`, `rightShoreX`, shore areas
- Progress: `totalToDeliver`, `deliveredCount`, `tripsCompleted`, `doorOpen`
- Boat:
  - `boat.x`, `boat.targetX`, `boat.sailing`, `boat.atDock`
  - stability fields like `boat.tilt`, `boat.capsized`, `boat.sinkOffset`, `boat.criticalTilt`
- Objects:
  - each object has `id`, `type`, `mass`, `volume`, `size`, `x`, `y`
  - placement flags: `onBoat`, `onShore` ('left'|'right'|null), `delivered`
  - multi-user coordination: `claimedBy`, `claimTime`
- Players:
  - `cursorX`, `cursorY`, `heldObjectId`

## Multi-player interaction model

- Objects are “claimable” to avoid two players dragging the same item:
  - `grab` sets `obj.claimedBy = playerId` and `player.heldObjectId = obj.id`.
  - `cursor_move` moves the held object (server-authoritative).
  - `release` clears the claim and snaps the object to boat/shore based on hit-testing.

## Practical editing guidance

- Keep the game touch-first: large hitboxes and forgiving drop logic.
- If you add new levels or object types:
  - update `LEVELS` / `OBJECT_TYPES` in the server sim
  - ensure the client overlay/UI reflects new level names and buttons

## Common pitfalls

- Letting objects be draggable while the boat is sailing (server blocks some actions; keep it that way).
- Forgetting to clear `claimedBy` when resetting or when a player disconnects.

## Roadmap levels & phases (legacy spec, not yet implemented)

The items below are copied/merged from an older Archimedes planning doc. They are **not implemented** in the current codebase, but represent the intended museum progression.

### Global UX rules (intended)

- Persistent UI for all levels:
  - top-left: level title
  - top-right: door (closed until “explored enough”)
  - bottom: toolbox/palette
  - bottom-right: GO + RESET (+ optional “KEEP SETUP”)
- Door open condition should be soft (any of):
  - 3–6 “discoveries” per level
  - time spent experimenting (e.g. 90s)
  - or a mix

### Level 1: Buoyancy Ferry (already implemented, keep evolving)

Legacy spec intent to keep:
- COM/COB visual dots, waterline + “UH-OH line”, forgiving capsizes + fast reset.
- Door can open via discoveries (successful sail with balloon, tilted sail, capsize once, multiple trips, etc.).

### Level 2: Seesaw Lab (Levers)

Theme: balance and torque.

Phases (progressive unlock, but remain free-play):
- Phase 1: baskets at ends only (drop weights into baskets)
- Phase 2: place weights anywhere along the beam
- Phase 3: pivot point becomes draggable

Mechanic sketch:
- Torque balance: $\tau = \sum_i (m_i \cdot d_i)$ about the pivot.
- Beam angle is based on net torque with gentle damping.

Door open: balance successfully at ~3 distinct pivot positions.

### Level 3: Pulley Builder

Theme: mechanical advantage (pull far to lift a little).

Interactions:
- Start with a simple pulley that fails for heavier loads.
- Players add fixed/movable pulleys; rope endpoints snap to anchors.
- Visual teaching: rope tick marks/striping showing motion vs load height.

Door open: lift 3 heavier loads OR build elevator + counterweight.

### Level 4: Gears Playground (+ winch)

Theme: gear ratios, speed vs strength.

Interactions:
- Drag gears onto pegs; auto-mesh if adjacent.
- Output devices: spinner (speed) + winch drum (strength).
- Avoid numbers; show FAST/SLOW icons; gentle stall instead of harsh failure.

Door open: complete ~3 “challenge cards” or time exploring.

### Level 5: Points of Sail (Sailing Upwind)

Theme: you can’t sail directly into the wind; tacking makes progress.

Interactions:
- Top-down corridor, wind arrow always visible.
- Steering only; sails auto-trim.
- Speed depends on angle to wind (no-go cone, beam reach fastest, etc.).

Door open: maintain upwind progress for $N$ seconds across changing wind OR perform ~3 tacks.

### Level 6: Density Measurement Bath (capstone)

Theme: compare weight in air vs submerged; displacement and density.

Interactions:
- Put object on balance in air; then suspend it in water.
- Visualize buoyant lift by indicator change and/or water rise.

Door open: test 3 objects in both states OR time exploring.

### Level 7: Treasure Chest Playground (optional sandbox mashup)

Theme: combine toys (buoyancy + currents + winch/pulleys/gears).

Goal: no win; just playful experiments.

### Bonus: π (Pi Jar)

Theme: discover $\pi$ visually.

Parts:
- String around a circle: unwrap and lay along a lined background.
- Inscribed/circumscribed polygons with a sides slider (3, 6, 12, 24, 48, …).

## Implementation phasing (legacy spec, adapted to this repo)

The old spec described creating a brand-new client/server/shared project. In this repo, the equivalent is:

- Backend: add/extend state + actions in `apps/ws/src/games/archimedes_sim.js` and route messages in `apps/ws/src/games/archimedes.js`.
- Client: implement new level UI + rendering in `archimedes/client/src/game/scenes/PlayScene.js`.
- Protocol: prefer **additive** changes and document new actions in `docs/PROTOCOL.md`.
