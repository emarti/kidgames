# Games overview (co-op, kid-focused)

These games are designed to be:
- **Collaborative**: players cooperate toward shared goals.
- **Arcade-simple**: fast to understand, easy to control.
- **Friendly for a 5-year-old**: big UI targets, immediate feedback, low reading burden.

All games support up to 4 players per room.

For concrete message/state details, see:
- `docs/STATE.md`
- `maze_LLM.md`, `snake_LLM.md`, `wallmover_LLM.md`, `comet_LLM.md`, `archimedes_LLM.md`

## Shared design principles

- **No PvP**: avoid mechanics where one player can “beat” another.
- **Shared progress**: state changes are visible to everyone.
- **Forgiving loops**: failure should be recoverable and non-punitive.
- **Spectator-friendly**: additional players can join and understand what’s happening quickly.

## Snake (co-op variant)

Folder:
- Client: `snake/client/`
- Server: `apps/ws/src/games/snake.js`, `apps/ws/src/games/snake_sim.js`

Intent:
- Classic snake feel as a shared arcade toy.
- Multiple players can exist in the same arena.

Collaboration hooks:
- Shared world + shared pacing.
- UI emphasizes room + players rather than scoring.

LLM notes:
- There is a Snake-specific doc at `snake/for_llm.txt`.
  - Canonical per-game overview: `snake_LLM.md`.

## Maze

Folder:
- Client: `maze/client/`
- Server: `apps/ws/src/games/maze.js`, `apps/ws/src/games/maze_sim.js`

Intent:
- A cooperative maze exploration game.
- Often uses fog-of-war (shared reveal) so exploration feels like teamwork.

Collaboration hooks:
- Shared reveal: one player’s exploration helps everyone.
- Players can split up to reveal more of the maze.

Canonical per-game overview: `maze_LLM.md`.

## Wallmover

Folder:
- Client: `wallmover/client/`
- Server: `apps/ws/src/games/wallmover.js`, `apps/ws/src/games/wallmover_sim.js`

Intent:
- A Maze-like experience plus a *collaborative editor*.
- Players can create and test levels together.

Modes:
- **Freeform**: editing a canvas (border walls fixed).
- **Puzzle**: a generated maze with a large editable subset of edges (“soft walls”). Players can draw/erase walls to make a route from start→goal.

Collaboration hooks:
- Editing is shared and server-authoritative.
- Testing/Play mode is gated (no edits while testing).
- The UI provides immediate feedback (e.g., a route status indicator).

Canonical per-game overview: `wallmover_LLM.md`.

## Comet

Folder:
- Client: `comet/client/`
- Server: `apps/ws/src/games/comet.js`, `apps/ws/src/games/comet_sim.js`

Intent:
- A lightweight cooperative arcade experience.

Collaboration hooks:
- Shared simulation state and goals.

Canonical per-game overview: `comet_LLM.md`.

## Archimedes

Folder:
- Client: `archimedes/client/`
- Server: `apps/ws/src/games/archimedes.js`, `apps/ws/src/games/archimedes_sim.js`

Intent:
- A playful physics/intuition game.

Collaboration hooks:
- Shared state and cooperative experimentation.

Canonical per-game overview: `archimedes_LLM.md`.

## Fling

Folder:
- Client: `fling/client/`
- Server: `apps/ws/src/games/fling.js`, `apps/ws/src/games/fling_sim.js`

Intent:
- A cooperative projectile game inspired by QBasic Gorilla.
- Players choose from 7 story characters (Hunter, Mr. What What, Chaihou, Taolabi, Chichi Gonju, Starway, Brillan) and fling rubber ducks at alien ships eating the Earth.
- Point-and-click aiming with persistent angle/power between shots.
- Outdoor hills landscape with tumbling projectiles and air resistance.

Collaboration hooks:
- All players fire at the same shared targets from the left side.
- Shared progress: targets hit by any player count for everyone.
- Level progression is shared (5 levels, increasing targets and terrain complexity).

Theme notes:
- The projectile type (`rubber_duck`) and target type (`alien_ship`) are designed to be easily swapped.
- 7 selectable character avatars with distinct visual designs and associated colors.

Canonical per-game overview: `fling_LLM.md`.

## Adding a new co-op game (recommended checklist)

- Server:
  - Add `apps/ws/src/games/<game>.js` (host: rooms + messages)
  - Add `apps/ws/src/games/<game>_sim.js` (authoritative sim)
  - Register host in `apps/ws/src/server.js`
- Client:
  - Create `<game>/client/` (Vite + Phaser)
  - Add a `<game>-client-build` stage in `Dockerfile`
  - Copy build output into the `gateway` stage under `/srv/games/<game>/`
- Protocol:
  - Document message types in `docs/PROTOCOL.md`
- Product:
  - Document kid/co-op intent + controls in this file
