# Comet — LLM notes

Comet is a cooperative arcade space game: players fly ships, shoot comets, and experiment with different world topologies.

## Where things live

Server:
- `apps/ws/src/games/comet.js` (WebSocket room host + routing)
- `apps/ws/src/games/comet_sim.js` (authoritative simulation)

Client:
- `comet/client/src/net.js`
- `comet/client/src/game/scenes/MenuScene.js`
- `comet/client/src/game/scenes/PlayScene.js`

## Core loop

- Host tick: every **50ms** calls `Sim.step(state, now)` and broadcasts `{type:"state"}`.
- State includes ship positions/velocities, bullets, and comets.

## Protocol (Comet)

Handshake:
- `{type:"hello", gameId:"comet", protocol:1}`

Lobby / room messages (common):
- `create_room`, `join_room {roomId}`, `get_rooms`

Setup/control:
- `pause`, `resume`
- `restart`
- `select_topology { mode:"regular"|"klein"|"projective" }`
- `select_difficulty { difficulty:"easy"|"medium"|"hard" }`
- `select_color { color:"#RRGGBB" }`
- `select_shape { shape:"triangle"|"rocket"|"ufo"|"tie"|"enterprise" }`

Gameplay input:
- `input { turn:number, thrust:boolean, brake:boolean, shoot:boolean }`
  - `turn` is typically clamped to [-1,1] server-side.

Server → client:
- `state { state }`

## State shape highlights

See `docs/STATE.md` for shared conventions.

Comet state fields (non-exhaustive):
- `w`, `h` pixel dimensions
- `topology`: `regular|klein|projective`
- `difficulty`: `easy|medium|hard`
- `bullets[]` with `x,y,vx,vy,bornAt,lifeMs,owner`
- `comets[]` with `x,y,vx,vy,size,seed`
- `players[pid]` with `x,y,vx,vy,angle,input,shootCooldownMs,color,shape`

## Topology details

The sim uses wrapping rules:
- `regular`: torus wrap without flips
- `klein`: top/bottom wrap flips x and may invert velocity/angle
- `projective`: left/right flips y; top/bottom flips x

These rules are implemented by `applyWrap(obj,w,h,mode)`.

## Practical editing guidance

- If you add a new selectable `shape`, you must update both:
  - server `trySelectShape` allowed set
  - client ship renderer in `PlayScene.js`

- If you tweak difficulty, keep the parameters grouped in `difficultyParams(state)`.

## Common pitfalls

- Adding a new field to bullets/comets that isn’t JSON-safe (must serialize cleanly).
- Client allowing a selection that server rejects (keep allowed sets in sync).
