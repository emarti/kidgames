# Wallmover — LLM notes

Wallmover is a Maze-like cooperative grid game plus a collaborative level editor.
It has two modes:
- **Freeform**: open interior canvas with fixed border walls.
- **Puzzle**: a generated “heavy wall” maze with a large editable subset (“soft walls”).

## Where things live

Server:
- `apps/ws/src/games/wallmover.js` (WebSocket room host + routing)
- `apps/ws/src/games/wallmover_sim.js` (authoritative sim + editor/puzzle logic)

Client:
- `wallmover/client/src/net.js`
- `wallmover/client/src/game/scenes/MenuScene.js`
- `wallmover/client/src/game/scenes/PlayScene.js` (editor UI + play/test UI)

Shared:
- `apps/ws/src/games/maze_utils.js` (rand, clamp)

## Core loop

- Host tick: every **150ms** calls `Sim.step(state, now)` and broadcasts `{type:"state"}`.
- The server rejects edits during test/play.

## Protocol (Wallmover)

Handshake:
- `{type:"hello", gameId:"wallmover", protocol:1}`

Lobby / room messages (common):
- `create_room`, `join_room {roomId}`, `get_rooms`

Setup / cosmetics:
- `select_vision_mode { mode:"fog"|"glass" }`
- `select_avatar { avatar:string }`
- `select_color { color:"#RRGGBB" }`
- `select_level { level:number }`
- `restart`
- `pause`, `resume`

Editor + test/play:
- `set_mode { mode:"freeform"|"puzzle" }`
- `edit_set_wall { x:number, y:number, dir:"UP"|"RIGHT"|"DOWN"|"LEFT", on:boolean }`
- `edit_place { kind:string, x:number, y:number }` (Freeform-only for items)
- `autoplay_start`, `autoplay_stop`
- `start_play` (enter test/play)
- `stop_test` (return to editor)
- `next_level`

Movement:
- `input { dir: "UP"|"RIGHT"|"DOWN"|"LEFT" }`

Server → client:
- `state { state }`

## State shape highlights

See `docs/STATE.md` for shared conventions.

Wallmover adds editor/test fields (non-exhaustive):
- `mode`: `"freeform"|"puzzle"`
- `testing` / `playing` (edit gating)
- `walls[y][x]`: heavy/locked wall bitmask grid
- `softMask[y][x]`: bitmask of editable edges (Puzzle)
- `softWalls[y][x]`: current editable edges’ wall values (Puzzle)
- `routeComplete`: boolean; reachability from `start` to `goal` under the *effective* wall mask
- `message`: server-driven status overlay text
- solver/autoplay fields (internal helpers)

### Wall override semantics (Puzzle)
Effective wall mask per cell is:
- keep heavy walls on non-editable edges
- use `softWalls` on editable edges (can override heavy walls)

This logic is implemented by `wallMaskAt(state,x,y)` on the server.

### Route completion
`routeComplete` is computed server-side via BFS (reachability) using the effective wall mask.
It updates:
- on level build/reset
- after `edit_set_wall`

## Practical editing guidance

- Any editor rule must be enforced server-side in `setWallEdge`/`placeCollectible`.
- If you change which edges are editable in Puzzle:
  - update `seedPuzzleEditableEdges_` and related seeding helpers
  - ensure UI makes fixed vs editable edges visually distinct

## Common pitfalls

- Breaking edit gating (must remain “no edits during test/play”).
- Forgetting to update `routeComplete` after a wall edit.
- Diverging wall bit conventions from Maze/Walls rendering (both client and server use N=1,E=2,S=4,W=8).
