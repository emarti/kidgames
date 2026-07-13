# Submarine — LLM notes

Submarine is a soft PvP hunt-and-evade game for up to 4 players. Players choose a role (`submarine` or `destroyer`) and a team (`red`, `white`, `blue`, `yellow`). The current implementation supports room flow, per-player setup/pause overlay selection, server-authoritative movement/weapons, single-screen arena rendering, shared touch D-pad controls, optional submarine bubbles, clear-mode readable wakes/trails, low-visibility passive sonar, range-limited active sonar pulses, submarine upward missiles, decorative ocean-floor/sea-life world hooks, optional side wrapping, and optional server-side computer players.

## Current implementation status

- Implemented: Phase 0 paths/planning, Phase 1 placeholder scaffold, Phase 2 first playable movement, Phase 3 weapons/forgiving hits, Phase 4 setup/team switching, Phase 5 clear visibility baseline, Phase 6 low visibility/passive sonar, Phase 7 active sonar, Phase 8 decorative world content, the post-Phase-8 fog/sonar/missile tuning pass, Phase 9 optional computer control, and the post-Phase-9 polish/settings pass.
- Not implemented yet: gameplay terrain collision/hazards, scoring, richer bot difficulty tuning, and post-playtest content phases.
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
- `step()` increments `state.tick`, applies movement/firing for non-paused connected players, clamps or wraps vehicles depending on room settings, advances weapons, handles hits/resets, and updates transient effects.
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
- `set_wrap { enabled: boolean }`
- `set_bubbles { enabled: boolean }`
- `add_bot { role, team?, difficulty?, playerId? }`
- `remove_bot { playerId? }`
- `configure_bot { playerId, role?, team?, difficulty? }`

Gameplay input:
- `input { throttle, turn, dive, fire, torpedo?, altFire, sonar }`

Current movement controls:
- `throttle`: `-1..1`, horizontal side-view movement intent (`-1` left, `1` right)
- `turn`: currently reserved/ignored; heading follows horizontal motion
- `dive`: `-1..1`, submarine depth/ballast intent (`-1` rise toward periscope depth, `1` dive/down); destroyers ignore depth and stay surface-only
- `fire`: implemented as the primary weapon. Submarines fire horizontal torpedoes and destroyers drop depth charges. Torpedoes reset enemy submarines only; they should not hit destroyers.
- `torpedo`: accepted as a compatibility alias for submarine primary weapon input; `fire` remains the wire-compatible field.
- `altFire`: implemented for submarines only; launches an upward missile that rises toward the surface. It can hit enemy submarines while rising and explodes near the surface against enemy vessels. Destroyers ignore it.
- `sonar`: implemented; rising edge fires an active sonar pulse if ready. Active sonar briefly reveals in-range targets to the pinger's whole team and reveals the pinger to enemy teams that have a player in range.

Client controls:
- Keyboard: arrow keys or WASD for complete movement: left/right move horizontally, up rises toward periscope depth, down dives; Space fires the primary weapon; `X` launches submarine upward missile; `Q` or `E` fires active sonar. Setup/pause overlay shortcuts are `1` Submarine, `2` Destroyer, `3-6` team colors, `F` fog, `Enter` resume, and `P`/`Esc` pause.
- Touch: shared `@games/touch-controls` D-pad + pause button for movement/pause; D-pad left/right move horizontally, up/down controls submarine depth. Track held D-pad directions separately so opposite presses cancel and release cleanly. Right-side command buttons are Pause, Torpedo/Charge, Sonar, and Missile.
- Setup overlay: start/pause menu selects Submarine/Destroyer, team color, fog on/off, wrap on/off, bubbles on/off, and optional computer player slots.

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
- `settings`: `{ wrapX, showBubbles }`; `wrapX` defaults on and applies only to player vessels, not weapons, sonar pulses, bubbles, hit effects, scenery, or sea life.
- `visibilityMode`: `"low"` by default. In `"low"`, clients render vessels through the team-shared passive-sonar mask; clear mode remains available from setup/pause.
- `world`: `{ w, h, waterlineY, vehicleLength, floor, scenery }`; current default is a single-screen `1800x1200` arena. `floor` contains deterministic decorative ridges, vents, and volcanoes plus `collision: false` and `hazards: false`. `scenery` contains decorative sea life only.
- `teams`: `["red", "white", "blue", "yellow"]`
- `roles`: `["submarine", "destroyer"]`
- `teamColors`: team name to hex color
- `players[1..4]`: `{ id, connected, bot, botDifficulty, botMode, botTargetId, botWaypointX, botWaypointY, botNextThinkAt, paused, role, team, color, x, y, vx, vy, heading, resettingUntil, fireReadyAt, sonarReadyAt, missileReadyAt, lastFireInput, lastSonarInput, lastAltFireInput, input }`
- `bubbles`: transient submarine bubble objects
- `torpedoes`, `depthCharges`, `missiles`: active server-authoritative weapon objects. Server hit checks use elongated hull geometry so hits match the longer side-view vessel shapes. Torpedoes wrap horizontally when Wrap is on and expire after traveling `0.75 * world.w`.
- `hitEffects`: transient star/fireworks hit effect objects
- `pulses`: active sonar pulse objects, including `{ id, owner, team, x, y, bornAt, lifeMs, revealUntil, maxRadius }`; clients render pulse rings only for the pinger's team or local enemies inside pulse range.
- `visibility`: full-state visibility mask. Current strategy broadcasts full state plus `visibility.teams[team].contacts[playerId] = { strength, level }`; clients use the local player's team mask to render hidden/ping/shadow/exact contacts in low visibility.

## Design decisions

- Boats are strictly surface-only once movement is implemented.
- Ordinary pause/resume is per-player. One paused human opens their own setup overlay but does not freeze other players, bots, weapons, effects, or scenery.
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
- Active sonar rings should not be a global giveaway; enemy clients outside pulse range should not render the pulse ring.
- Current active sonar tuning: about 9.5s cooldown, 2.5s reveal window, 1.8s visual pulse lifetime, and a 420 world-unit radius.
- Primary weapon reloads are 10 seconds for submarine torpedoes and destroyer depth charges. Submarine upward missile reload is also 10 seconds.
- Depth charges inherit some horizontal ship velocity on drop, then horizontal drift damps out while vertical speed approaches terminal sink speed.
- Submarine upward missile is a separate `altFire` weapon. It rises to the surface, can reset enemy submarines on the way up, and can reset enemy vessels in its smaller surface blast; teammates are ignored.
- Hit regeneration respawns the target at a random role-appropriate location.
- Teammates use the exact same team color; same-team vessels may use alpha differences for readability.
- The local destroyer can have a thin white outline. Do not draw a white circle/ellipse around submarines.
- World edges wrap horizontally by default; when `settings.wrapX` is false, submarines and destroyers use hard side bounds. Torpedoes also wrap in wrap mode, but depth charges, missiles, sonar pulses, bubbles, hit effects, scenery, and sea life do not wrap.
- `settings.showBubbles` controls whether new submarine ballast/depth bubbles are created. Existing wake/trail readability effects are separate. In fog mode, bubbles are visible only to the owner's team; in clear mode, bubbles are visible to everyone.
- The ocean floor, vents, volcano, fish schools, larger fish, dolphin/whale silhouettes, and crab are visual-only scenery. They do not collide, damage, push, hide, score, or affect sonar.
- Clear baseline renders every connected player and projectile for everyone. Same-team vessels share the exact team color and use alpha differences for readability.
- Optional bots consume ordinary player slots, are marked with `bot: true`, and are off by default. Human joins prefer empty slots, then replace the lowest-numbered bot slot if needed.
- Default bot difficulty is `easy`; `normal` is still accepted for compatibility.
- Bots generate server-side `input` before normal movement and reuse the same movement, weapon, sonar, visibility, hit, and reset systems as humans.
- Current bot behavior is intentionally simple: destroyers patrol/search/chase submarines, drop depth charges, use sonar while searching, and dodge upward missiles; submarines patrol depth bands, chase submarines with torpedoes, move under destroyers for upward missiles, use sonar while searching, and evade depth charges.
- In low visibility, bots use their team's contact strengths and should not perfectly target hidden enemies at range.

## Practical editing guidance

- Read `submarine/PLAN.md` before making changes.
- Movement, weapons, clear-mode readability, speed/event-driven low-visibility masking, range-limited active sonar, upward submarine missile, decorative floor/sea-life rendering, optional wrapping/bubble settings, and optional bots are implemented. Server-authoritative terrain collision and active hazards belong to later phases.
- Do not run browser/game tests unless the user explicitly asks; the user will test gameplay manually.
- Do not run host `npm` or `node`; use Docker-only checks when needed.

## Common pitfalls

- Treating active sonar as global; it is now range-limited and team-shared.
- Reintroducing passive base visibility for stopped vessels; stopped targets should vanish at range.
- Forgetting `altFire` is submarine-only; destroyers ignore it.
- Reintroducing shared/global pause for ordinary pause/resume; pause is local to the player except the initial start overlay metadata.
- Renaming the wire field `fire` outright; keep `fire` compatibility even though the submarine-facing UI says Torpedo.
- Treating decorative sea life as gameplay objects; scenery does not interact.
- Reintroducing reset/appearing circles around vessels; hits already have fireworks and reset state should not add a giveaway ring.
- Letting depth charges, missiles, sonar pulses, bubbles, hit effects, scenery, or sea life wrap around the sides; only vessels and torpedoes should wrap.
- Letting bots use perfect hidden-player knowledge in low fog; they should act from team-shared contacts.
- Forgetting that `connected: true` can mean a human or a bot; check `bot: true` before accepting client input or removing computer players.
- Treating Phase 8 floor scenery as gameplay terrain; movement still uses flat hard bounds.
- Diverging UI role labels from the plan: user-facing role labels should be `Submarine` and `Destroyer`.
- Forgetting that team visibility is shared within a team in the future low-visibility model.
- Making torpedoes/depth charges too punishing; later weapons should be slow, readable, and avoidable.
