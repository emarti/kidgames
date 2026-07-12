# Submarine — LLM notes

Submarine is a soft PvP hunt-and-evade game for up to 4 players. Players choose a role (`submarine` or `destroyer`) and a team (`red`, `white`, `blue`, `yellow`). The current implementation supports room flow, setup/pause overlay selection, server-authoritative movement/weapons, single-screen arena rendering, shared touch D-pad controls, submarine bubbles, clear-mode readable wakes/trails, low-visibility passive sonar, range-limited active sonar pulses, submarine upward missiles, and decorative ocean-floor world hooks.

## Current implementation status

- Implemented: Phase 0 paths/planning, Phase 1 placeholder scaffold, Phase 2 first playable movement, Phase 3 weapons/forgiving hits, Phase 4 setup/team switching, Phase 5 clear visibility baseline, Phase 6 low visibility/passive sonar, Phase 7 active sonar, Phase 8 decorative world content, and the post-Phase-8 fog/sonar/missile tuning pass.
- Not implemented yet: gameplay terrain collision/hazards and computer control.
- Planning source of truth: `submarine/PLAN.md`.

## Where things live

Server:
- `apps/ws/src/games/submarine.js` — WebSocket room host and message routing
- `apps/ws/src/games/submarine_sim.js` — authoritative placeholder state and state mutation

Client:
- `submarine/client/src/net.js` — WebSocket client; waits for `hello_ack` before flushing queued messages
- `submarine/client/src/game/scenes/BootScene.js`
- `submarine/client/src/game/scenes/MenuScene.js`
- `submarine/client/src/game/scenes/PlayScene.js`
- Shared controls package: `packages/touch-controls/`

Infrastructure:
- Static route: `/games/submarine/`
- WebSocket route: `/games/submarine/ws`

## Core loop

- Host tick: every 50ms.
- Server calls `Sim.step(state, now)` and broadcasts `{ type: "state", state }`.
- `step()` increments `state.tick`, applies movement/firing when unpaused, clamps vehicles to world bounds, advances weapons, handles hits/resets, and updates transient effects.
- Clients render server state and send intent only.

## Protocol

Handshake:
- `{ type: "hello", gameId: "submarine", protocol: 1 }`

Lobby / room messages:
- `create_room`
- `join_room { roomId }`
- `get_rooms`

Setup/control:
- `pause`
- `resume`
- `restart`
- `select_role { role: "submarine" | "destroyer" }` (`boat` and `ship` are accepted as legacy aliases for `destroyer`)
- `select_team { team: "red" | "white" | "blue" | "yellow" }`
- `select_visibility { mode: "clear" | "low" }`
- `set_fog { enabled: boolean }` (compatibility helper; maps to `clear`/`low`)

Gameplay input:
- `input { throttle, turn, dive, fire, altFire, sonar }`

Current movement controls:
- `throttle`: `-1..1`, horizontal side-view movement intent (`-1` left, `1` right)
- `turn`: currently reserved/ignored; heading follows horizontal motion
- `dive`: `-1..1`, submarine depth/ballast intent (`-1` rise toward periscope depth, `1` dive/down); destroyers ignore depth and stay surface-only
- `fire`: implemented; submarines fire horizontal torpedoes and destroyers drop depth charges. Torpedoes reset enemy submarines only; they should not hit destroyers.
- `altFire`: implemented for submarines only; launches an upward missile that rises to the surface and explodes against enemy destroyers. Destroyers ignore it.
- `sonar`: implemented; rising edge fires an active sonar pulse if ready. Active sonar briefly reveals in-range targets to the pinger's whole team and reveals the pinger to enemy teams that have a player in range.

Client controls:
- Keyboard: arrow keys or WASD for complete movement: left/right move horizontally, up rises toward periscope depth, down dives; Space fires; `X` launches submarine upward missile; `Q` or `E` fires active sonar. Setup/pause overlay shortcuts are `1` Submarine, `2` Destroyer, `3-6` team colors, `F` fog, `Enter` resume, and `P`/`Esc` pause.
- Touch: shared `@games/touch-controls` D-pad + pause button for movement/pause; D-pad left/right move horizontally, up/down controls submarine depth. Right-side command buttons are Pause, Fire, Sonar, and Missile.
- Setup overlay: start/pause menu selects Submarine/Destroyer, team color, and fog on/off.

Server to client:
- `hello_ack { gameId }`
- `room_joined { roomId, playerId, state }`
- `room_list { rooms }`
- `state { state }`
- `error { message }`

## State shape

See `docs/STATE.md` for shared conventions.

Submarine state fields:
- `tick`
- `paused`, `reasonPaused`
- `visibilityMode`: `"clear"` by default. In `"low"`, clients render vessels through the team-shared passive-sonar mask; projectiles and effects remain broadly visible for readability.
- `world`: `{ w, h, waterlineY, vehicleLength, floor }`; current default is a single-screen `1200x800` arena. `floor` contains deterministic decorative ridges, vents, and volcanoes plus `collision: false` and `hazards: false`.
- `teams`: `["red", "white", "blue", "yellow"]`
- `roles`: `["submarine", "destroyer"]`
- `teamColors`: team name to hex color
- `players[1..4]`: `{ id, connected, paused, role, team, color, x, y, vx, vy, heading, resettingUntil, fireReadyAt, sonarReadyAt, missileReadyAt, lastFireInput, lastSonarInput, lastAltFireInput, input }`
- `bubbles`: transient submarine bubble objects
- `torpedoes`, `depthCharges`, `missiles`: active server-authoritative weapon objects. Server hit checks use elongated hull geometry so hits match the longer side-view vessel shapes.
- `hitEffects`: transient star/fireworks hit effect objects
- `pulses`: active sonar pulse objects, including `{ id, owner, team, x, y, bornAt, lifeMs, revealUntil, maxRadius }`
- `visibility`: full-state visibility mask. Current strategy broadcasts full state plus `visibility.teams[team].contacts[playerId] = { strength, level }`; clients use the local player's team mask to render hidden/ping/shadow/exact contacts in low visibility.

## Design decisions

- Boats are strictly surface-only once movement is implemented.
- Player-facing role label is Destroyer, not Boat. The server keeps `boat` as an accepted alias.
- Submarines should move faster at periscope depth than deep underwater.
- Submarine depth changes create bubbles, especially when rising/blowing ballast. Diving from periscope depth is intentionally faster than it used to be.
- Do not add separate Surface/Dive buttons. Up/down arrows or D-pad control depth, and rising stops at periscope depth rather than true surfacing.
- Destroyers sit at the surface with hull straddling/below the waterline and military superstructure above it. Submarines cannot fully surface; their hull stays below the water and only the periscope/mast reaches the surface.
- Submarines and destroyers are drawn as longer side-view silhouettes, roughly 50% wider than the first placeholder vessels. Submarines have a rounded nose and a visible stern propeller, not triangle fins on both ends.
- Hits trigger a star/fireworks win sound and Snake-style rainbow firework effect around the target, then reset that player after 3 seconds. Infinite lives.
- Same-team weapons do not reset teammates in v1.
- In low visibility, passive sonar is always on and shared within each team. Contacts are based on target speed/noise and distance; stopped vessels vanish at range regardless of depth, fast movement is louder, and very close stopped enemies remain vague pings for playability.
- At periscope depth, submarines and destroyers visually spot each other out to about half the screen width, and that reveal is shared with the whole team.
- Destroyers are louder than submarines at the same speed. Submarine listeners get a small passive range advantage.
- Active sonar is available to everyone and is range-limited: it reveals in-range targets to the pinger's whole team, and reveals the pinger to enemy teams that have a player in range.
- Current active sonar tuning: about 9.5s cooldown, 2.5s reveal window, 1.8s visual pulse lifetime, and a 420 world-unit radius.
- Submarine upward missile is a separate `altFire` weapon with about a 5.5s reload. It rises to the surface and can reset enemy destroyers in its surface blast; teammates are ignored. This is the submarine's anti-destroyer weapon.
- Hit regeneration respawns the target at a random role-appropriate location.
- Teammates use the exact same team color; same-team vessels may use alpha differences for readability.
- The local destroyer can have a thin white outline. Do not draw a white circle/ellipse around submarines.
- World edges are hard bounds; no crash damage.
- The ocean floor, vents, and volcano are visual-only Phase 8 scenery. They do not collide, damage, push, hide, score, or affect sonar yet.
- Clear baseline renders every connected player and projectile for everyone. Same-team vessels share the exact team color and use alpha differences for readability.

## Practical editing guidance

- Read `submarine/PLAN.md` before making changes.
- Movement, weapons, clear-mode readability, speed/event-driven low-visibility masking, range-limited active sonar, upward submarine missile, and decorative floor rendering are implemented. Server-authoritative terrain collision and active hazards belong to later phases.
- Do not run browser/game tests unless the user explicitly asks; the user will test gameplay manually.
- Do not run host `npm` or `node`; use Docker-only checks when needed.

## Common pitfalls

- Treating active sonar as global; it is now range-limited and team-shared.
- Reintroducing passive base visibility for stopped vessels; stopped targets should vanish at range.
- Forgetting `altFire` is submarine-only; destroyers ignore it.
- Treating Phase 8 floor scenery as gameplay terrain; movement still uses flat hard bounds.
- Diverging UI role labels from the plan: user-facing role labels should be `Submarine` and `Destroyer`.
- Forgetting that team visibility is shared within a team in the future low-visibility model.
- Making torpedoes/depth charges too punishing; later weapons should be slow, readable, and avoidable.
