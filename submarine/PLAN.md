# Submarine Implementation Plan

This file is the source of truth for building Submarine in small LLM-friendly slices. Each future session should read this file first, then check off only the items it actually completes.

Do not implement more than the current requested phase. Do not game-test or browser-test unless the user explicitly asks; the user will test gameplay manually. Agents may still run narrow non-playtesting checks when needed, such as Docker builds or import checks.

## Game Vision

Submarine is a soft PvP hunt-and-evade game for 1-6 players. Players choose a role, either submarine or surface boat/ship, and a team color: red, white, blue, or yellow. The submarine uses torpedoes. The surface boat, likely a destroyer-style ship, uses depth charges. Hits should feel playful and forgiving: a tag, splash, reset, forced surface/dive, or short stun rather than a harsh elimination.

The game is a 2D side-view ocean. The waterline stays near the top of the world/screen, leaving most of the vertical space underwater for submarines. Treat "water level near the top, maybe 80%" as: roughly 80% of the visible height is underwater and roughly 20% is sky/surface area, unless the user clarifies otherwise.

The playable area is a single-screen 2D ocean arena. All players should be on the same visible screen; do not use camera-follow scrolling or require a minimap. Later versions can add an ocean floor, volcano, caves, hazards, or terrain; do not add those in early phases.

The first version uses clear visibility so everyone can see everything. The long-term interesting version adds optional low visibility: submarines and ships become hard to find, passive sonar always gives each team partial contact information, slow quiet submarines are especially hard to locate, and active sonar temporarily reveals everyone before they can maneuver away.

Use an arcade version of diesel-electric submarine behavior: submarines move faster near periscope depth and slower when deep. Diving and rising are intentionally momentum-based. Show bubbles when the submarine changes ballast/depth, especially when blowing ballast upward.

## Physics To Fun Translation

Use real submarine/naval ideas as inspiration, then simplify aggressively for a kid-friendly arcade game.

- Diesel-electric submarine speed: classic WWII-style submarines were often much faster surfaced than submerged because they used powerful diesel engines on the surface and weaker electric propulsion underwater. A Type VIIC U-boat example lists 17.7 knots surfaced and 7.6 knots submerged. In game terms, make a submarine meaningfully faster near periscope depth, but prevent true surfacing so horizontal torpedoes cannot hit destroyers.
- Ballast and depth: real submarines flood ballast tanks to dive and blow compressed air into ballast tanks to surface. Diving planes plus forward motion help control depth. In game terms, depth changes should have inertia and delay, not instant up/down movement. Blowing ballast should create a clear bubble trail.
- Boats: boats are strictly surface-only. Their fun is horizontal pursuit, sonar timing, and depth-charge placement, not vertical movement.
- Torpedoes: real torpedoes are fast, but game torpedoes should be slower and highly readable so boats can dodge. They should create tense "I see it coming" moments, not instant kills.
- Depth charges: real depth charges detonate near the target at set depths. In game terms, depth charges should sink slowly, warn clearly, and reward good prediction rather than surprise.
- Active sonar: active sonar sends a ping and listens for echoes, but the ping can reveal the emitter. In game terms, a sonar pulse temporarily reveals everyone to everyone, including the sonar user to enemies, creating a bold "I found you, but now you found me" decision.
- Low visibility: real passive detection depends heavily on sound/noise. In game terms, quiet slow submarines are harder to locate, fast movement is easier to notice, and visibility is shared within a team so teammates can coordinate.
- Passive sonar math: do not simulate real underwater acoustics fully, but use the shape of the passive sonar equation. Targets have a source level based on role, periscope/deep state, and speed. Sound weakens with distance using a log-like transmission loss. Detection quality comes from received loudness minus a threshold. This gives the right feel: closer is easier, faster is louder, and quiet submarines can disappear at range.

Suggested passive sonar formula for low-visibility mode:

```js
speed01 = clamp(speed / maxSpeedForCurrentState, 0, 1)
sourceDb =
  baseNoiseDb(role, surfacedState)
  + speedNoiseDb * Math.pow(speed01, 1.4)
  + eventNoiseDb(firing, activeSonar, bubbles, recentHit)

distance = Math.max(vehicleLength * 0.25, dist(listener, target))
transmissionLossDb = 20 * Math.log10(distance / vehicleLength)
receivedDb = sourceDb - transmissionLossDb - seaNoiseDb
contactStrength = clamp((receivedDb - detectionThresholdDb) / contactFadeDb, 0, 1)
```

Team-shared visibility should use the strongest listener on that team:

```js
teamContactStrength[targetId][team] = max(contactStrengthFromEachConnectedTeamMember)
```

Recommended contact rendering thresholds:

- `0.00-0.20`: hidden.
- `0.20-0.45`: vague passive ping, no exact silhouette.
- `0.45-0.75`: fuzzy shadow/contact blob.
- `0.75-1.00`: readable vessel position.
- Active sonar override: exact reveal for a short duration for everyone.

Useful reference facts:

- Type VIIC speed example: https://en.wikipedia.org/wiki/German_submarine_U-606
- Ballast tank diving/surfacing overview: https://en.wikipedia.org/wiki/Ballast_tank
- Active sonar overview and emitter-reveal tradeoff: https://en.wikipedia.org/wiki/Sonar
- Depth charge overview: https://en.wikipedia.org/wiki/Depth_charge
- WWII torpedo speed examples: https://en.wikipedia.org/wiki/List_of_World_War_II_torpedoes_of_Germany

## Product Defaults And Open Questions

Use these defaults until the user says otherwise:

- Role labels: use `Submarine` and `Destroyer` in player-facing UI. The server accepts legacy `boat`/`ship` as aliases for `destroyer`.
- Teams: red, white, blue, yellow. Teammates use the exact same team color. Like Snake, same-team vessels can be drawn with slight alpha differences so players remain distinguishable.
- Local player marker: draw a thin white outline around the local destroyer only. Do not draw a white circle/ellipse around submarines.
- World scale: fixed single-screen side-view world; current default is `world.w = 1800`, `world.h = 1200`.
- World edges: hard boundaries. Vehicles cannot pass through them, but there is no crash damage.
- Waterline: about 20% from the top, meaning about 80% underwater.
- Surface alignment: destroyers should sit at the waterline with hull straddling/below the water and superstructure above it; submarines should stop at periscope depth, with hull below the water and only the periscope/mast reaching the surface.
- Submarine combat: horizontal torpedoes should not hit destroyers; submarines use upward missiles to attack destroyers from below and to threaten enemy submarines above them.
- Vessel scale: draw submarines and destroyers as long side-view silhouettes, roughly 50% wider than the first placeholder shapes. Keep server hit geometry elongated enough that bow/stern hits match the visuals.
- Hits: play a star/fireworks win sound and effect around the boat/submarine that was hit, then reset that player after 3 seconds. Infinite lives.
- Boats: strictly surface-only.
- Visibility: default to fog-on low visibility for new rooms; clear visibility remains an option for debugging and casual play.
- Passive sonar: in low visibility, everyone is always listening; target detectability depends on target speed/noise and distance. Faster is louder, closer is louder.
- Low visibility sharing: visibility/contact information is shared within each team.
- Active sonar: available to everyone; temporarily reveals in-range targets to the pinger's team and reveals the pinger to in-range enemies.
- Computer control: defer until after human movement, weapons, setup UI, and visibility are stable.

Questions to revisit before the relevant phase:

- Should a hit award team points, or is the fireworks/reset moment enough reward for v1?
- What exact passive-sonar constants feel best: base noise, speed exponent, detection threshold, and fade width?
- How long should the active-sonar reveal last, and how long should its cooldown be?
- Should same-team alpha differences be based on player id, distance, or local-vs-other-player status?

## Phase 0 - Paths And Planning

- [x] Create `submarine/`.
- [x] Create this `submarine/PLAN.md`.
- [x] Create the future client path `submarine/client/src/game/scenes/`.
- [x] Add `docs/submarine_LLM.md` once the first runtime scaffold exists.
- [x] Add backend/client runtime files in Phase 1, not in the setup-only slice.

## Phase 1 - Buildable Placeholder Scaffold

Goal: make `/games/submarine/` load and connect, but keep gameplay minimal.

- [x] Add backend host `apps/ws/src/games/submarine.js`.
- [x] Add backend sim `apps/ws/src/games/submarine_sim.js`.
- [x] Register `createSubmarineHost()` in `apps/ws/src/server.js`.
- [x] Add `submarine/client/package.json`, `vite.config.js`, `index.html`, `src/main.js`, `src/net.js`, and Boot/Menu/Play scenes.
- [x] Add Docker client build stage `submarine-client-build`.
- [x] Copy the client build into `/srv/games/submarine/` in the gateway image.
- [x] Add Caddy redirect for `/games/submarine` to `/games/submarine/`.
- [x] Add Caddy WebSocket proxy for `/games/submarine/ws*`.
- [x] Add a Submarine launcher card to `infra/site/games/index.html`.
- [x] Follow Docker-only rule; do not run host `npm` or `node`.

Initial server state:

```js
{
  tick: 0,
  paused: true,
  reasonPaused: 'start',
  visibilityMode: 'low',
  settings: { wrapX: true, showBubbles: true },
  world: { w: 1800, h: 1200, waterlineY: 240, vehicleLength: 200 },
  players: {
    1: { connected: false, paused: true, role: 'submarine', team: 'red', color: '#ff4d4d', x: 0, y: 0, vx: 0, vy: 0, heading: 0, resettingUntil: 0, input: {} },
    2: { connected: false, paused: true, role: 'destroyer', team: 'blue', color: '#4d94ff', x: 0, y: 0, vx: 0, vy: 0, heading: 0, resettingUntil: 0, input: {} },
    3: { connected: false, paused: true, role: 'submarine', team: 'white', color: '#f8fafc', x: 0, y: 0, vx: 0, vy: 0, heading: 0, resettingUntil: 0, input: {} },
    4: { connected: false, paused: true, role: 'destroyer', team: 'yellow', color: '#ffd24d', x: 0, y: 0, vx: 0, vy: 0, heading: 0, resettingUntil: 0, input: {} }
  },
  torpedoes: [],
  depthCharges: [],
  pulses: [],
  bubbles: [],
  hitEffects: []
}
```

Initial protocol:

- [x] `create_room`
- [x] `join_room { roomId }`
- [x] `get_rooms`
- [x] `pause`
- [x] `resume`
- [x] `restart`
- [x] `select_role { role: 'submarine' | 'destroyer' }` (`boat`/`ship` aliases accepted)
- [x] `select_team { team: 'red' | 'white' | 'blue' | 'yellow' }`
- [x] `select_visibility { mode: 'clear' | 'low' }`
- [x] `input { throttle, turn, dive, fire, sonar }`

Phase 1 client should show only a placeholder ocean and basic room flow. Do not implement movement, weapons, sonar, or stealth in this phase.

## Phase 2 - First Playable Movement

Goal: vehicles feel heavy, readable, and distinct.

- [x] Add server-authoritative movement for boats and submarines.
- [x] Use momentum: acceleration and braking take time.
- [x] Use side-view horizontal movement: left/right move the vessel with momentum, and heading follows horizontal motion for drawing/firing.
- [x] Clamp vehicles to the world bounds.
- [x] Keep boats strictly surface-only.
- [x] Let submarines dive, rise to periscope depth, and hold depth.
- [x] Make submarine depth changes slow.
- [x] Make submarines faster at periscope depth than deep.
- [x] Add bubbles when submarines dive/rise, with extra emphasis when blowing ballast upward.
- [x] Render the full world as a single-screen arena with no scrolling camera.
- [x] Remove the minimap requirement; the full arena is visible at once.
- [x] Add keyboard controls.
- [x] Add touch controls sized for kids and tablets.
- [x] Use shared `@games/touch-controls` D-pad + pause control from Snake/Maze.
- [x] Use arrow keys/WASD and shared D-pad as the complete movement controls: left/right move, up/down change submarine depth, and destroyers ignore vertical input.
- [x] Track held D-pad directions separately so opposite-direction touch presses cancel and release cleanly.
- [x] Keep right-side buttons to commands only, currently Pause, Torpedo/Charge, Sonar, and Missile; do not add separate Surface/Dive buttons.

Recommended first movement constants, to tune later:

- World width: one-screen arena, currently `1800`.
- World height: enough for sky/surface, midwater, and deep evasion; keep about 80% of visible height underwater.
- Host tick: 50ms.
- Boat speed: moderate, surface-only.
- Submarine periscope-depth speed: near ship speed, with submarine depth changes still slower than horizontal movement.
- Submarine submerged speed: clearly slower.
- Dive/rise rate: slow enough that depth changes are strategic; rising happens by holding up until the submarine reaches the periscope-depth clamp.

## Phase 3 - Weapons And Forgiving Hits

Goal: weapons create pressure without making the game frustrating.

- [x] Add submarine torpedoes.
- [x] Add destroyer depth charges.
- [x] Give both weapons slow reload timers but infinite supply.
- [x] Make torpedoes slow enough that moving submarines can dodge.
- [x] Let submarine torpedoes hit enemy submarines only; destroyers are handled by upward missiles.
- [x] Make depth charges sink slowly enough that a submarine can react.
- [x] Add a submarine-only upward missile on separate `altFire` input so a submarine can attack a destroyer from directly below.
- [x] Use large visual trails and warning cues.
- [x] Make hitboxes generous for visual clarity but keep hits forgiving.
- [x] On hit, play a star/fireworks win sound and Snake-style rainbow firework effect around the target.
- [x] On hit, mark the target as resetting for 3 seconds, then respawn/reappear safely.
- [x] Use infinite lives; never eliminate a player from the room.
- [x] Add clear cooldown HUD for fire readiness.
- [x] Keep all weapon movement and hit detection server-authoritative.
- [x] Use elongated hull hit geometry so the longer vessel visuals and server collision agree.
- [x] Ignore same-team hits for v1 so team play stays forgiving.
- [x] Add touch Torpedo/Charge button and keyboard Space primary-weapon input.

## Phase 4 - Setup Screen, Teams, And Switching

Goal: room setup is simple and spectator-friendly.

- [x] Add start/pause overlay with role choice: Submarine or Destroyer.
- [x] Add team choice: Red, White, Blue, Yellow.
- [x] Allow multiple players to choose the same role.
- [x] Allow teammates to share the exact same team color.
- [x] Add fog on/off choice (`visibilityMode: 'clear' | 'low'`) to the setup overlay.
- [x] When a player switches role, respawn/reappear cleanly at a safe location.
- [x] Preserve the player's team when switching role unless they choose another.
- [x] Show room code, player role/team, fog, and pause state clearly.
- [x] Make the overlay usable with mouse, touch, and keyboard. Keyboard shortcuts: `1` Submarine, `2` Destroyer, `3-6` team colors, `F` fog, `Enter` resume, `P`/`Esc` pause.

## Phase 5 - Clear Visibility Baseline

Goal: finish the non-stealth game before adding fog.

- [x] Keep clear-mode behavior: no stealth masking yet, so all players remain visible even if the Phase 4 fog toggle is changed before Phase 6.
- [x] Render all vehicles and projectiles for all players.
- [x] Add readable silhouettes for periscope-depth and deep submarines.
- [x] Add surface wake for boats and periscope-depth submarines.
- [x] Add underwater trails/bubbles for submarines.
- [x] Draw same-team vessels in the exact same team color with subtle alpha differences.
- [x] Draw a thin white outline around the local destroyer only; submarines should not have a white circle/ellipse around them.
- [x] Add simple audio cues if useful, but keep gameplay playable without sound.
- [x] Do a static readability pass for two-player and four-player rooms; leave final gameplay/readability testing to the user.

## Phase 6 - Low Visibility And Stealth

Goal: make searching interesting without making it confusing.

- [x] Add `visibilityMode: 'clear' | 'low'`.
- [x] Share low-visibility reveal information within a team.
- [x] Add passive sonar that runs all the time for every connected player.
- [x] Compute passive contact strength from target speed/noise and distance.
- [x] Use team-shared contact strength: each team sees the best contact information any teammate can hear.
- [x] In low visibility, make submarines harder to locate the slower they move.
- [x] Make fast movement, periscope-depth visual exposure, firing, sonar input, and bubble/noise events increase detectability.
- [x] Tune fog so stopped vessels disappear at range regardless of depth, with only close vague contacts remaining for playability.
- [x] Make destroyers louder than submarines at the same speed.
- [x] Give submarine listeners a small passive range advantage over destroyer listeners.
- [x] Keep nearby vehicles visible enough that collisions and close dodges are readable.
- [x] Show uncertain contacts as vague pings or shadows, not exact silhouettes.
- [x] Make boats easier to detect than submerged submarines.
- [x] Make periscope-depth submarines visually detectable by destroyers at about half-screen range.
- [x] Use full-state broadcasts with explicit `visibility.teams[team].contacts[playerId]` masks for server simplicity.
- [x] Document the state strategy in `docs/submarine_LLM.md`.

## Phase 7 - Active Sonar Pulse

Goal: sonar reveals hidden opponents briefly, with counterplay.

- [x] Add `input.sonar` for both boats and submarines.
- [x] Add sonar cooldown.
- [x] Add expanding pulse visuals.
- [x] Temporarily reveal in-range players to the sonar user's team when a sonar pulse fires.
- [x] Make active sonar reveal the sonar user to enemy teams that have a player in range.
- [x] Treat active sonar as a loud range-limited reveal while the ping/reveal is active.
- [x] Make the reveal long enough for players to react but short enough that evasion still matters.
- [x] Add HUD feedback for sonar ready/cooling down.
- [x] Tune pulse range and reveal duration for the current single-screen arena.

Current Phase 7 constants to tune after playtesting:

- Sonar cooldown: about 9.5 seconds.
- Sonar reveal window: about 2.5 seconds.
- Visual pulse lifetime: about 1.8 seconds.
- Pulse radius: about 420 world units, roughly half the current map area as a circular scan.
- Controls: keyboard `Q`/`E` or the right-side `Sonar` button.

## Phase 8 - Future World Content

Goal: prepare for richer ocean scenes without blocking v1.

- [x] Add static `world.floor` metadata for future world content.
- [x] Add ocean floor rendering.
- [x] Add inactive volcano/hydrothermal vent scenery.
- [x] Add subtle ridges and seabed details without adding caves or complex terrain.
- [x] Keep movement on the existing flat bounds for this visual-only slice.
- [x] Document that future terrain collision must be server-authoritative.
- [x] Avoid adding complex terrain until single-screen rendering and visibility are stable.

Current Phase 8 defaults:

- `world.floor.collision` is `false`.
- `world.floor.hazards` is `false`.
- Floor, vents, and volcanoes are scenery only; they do not damage, block, push, hide, score, or affect sonar.
- Future level definitions should wait until movement, visibility, and weapon feel are stable after user playtesting.

## Post-Phase 8 - Fog Logic And Submarine Missile Tuning

Goal: make fog mode feel like sound-based hunting rather than depth-based visibility.

- [x] Replace passive sonar base visibility with speed/event-driven detection.
- [x] Keep stopped submarines and stopped destroyers hidden at range.
- [x] Keep very close stopped contacts as vague pings, not exact silhouettes.
- [x] Add periscope-depth visual spotting out to about half the screen width between submarines and destroyers.
- [x] Share all passive and active reveals within the detecting team.
- [x] Limit active sonar to a circular scan instead of a global reveal.
- [x] Reveal the sonar user to enemy teams only when an enemy teammate is inside scan range.
- [x] Add `input.altFire` for submarine upward missile.
- [x] Add `missiles` state and missile cooldown fields.
- [x] Render upward missiles, trails, and surface blasts.
- [x] Preserve clear-mode full visibility and existing torpedo/depth-charge behavior.

Current tuning defaults:

- Active sonar radius: about `420` world units.
- Active sonar reveal: about `2.5` seconds.
- Passive close contact: vague ping only below exact silhouette threshold.
- Upward missile reload: `10` seconds.
- Upward missile target: enemy destroyers and enemy submarines; teammates are ignored.
- Upward missile control: keyboard `X` or right-side `Missile` button.
- Submarine ceiling: periscope depth only; the submarine hull cannot surface.
- Regeneration after a hit respawns the player at a random role-appropriate location.

## Phase 9 - Computer Control

Goal: add optional AI later without changing the room model.

- [x] Use ordinary disconnected player slots for computer-controlled players.
- [x] Mark bots with `bot: true` while keeping them in `players[1..6]`.
- [x] Let humans replace the lowest-numbered bot when joining a full bot-filled room.
- [x] Add server messages: `add_bot`, `remove_bot`, and `configure_bot`.
- [x] Add server-side bot input generation before normal movement.
- [x] Start with simple patrol/search behavior.
- [x] Add separate destroyer and submarine behavior.
- [x] Make destroyer bots patrol, chase detected submarines, drop depth charges, use sonar while searching, and dodge upward missiles.
- [x] Make submarine bots patrol depth bands, chase detected submarines with torpedoes, attack destroyers with upward missiles, use sonar while searching, and evade depth charges.
- [x] Keep low-visibility bots limited by team-shared contact strength instead of giving them perfect knowledge.
- [x] Add compact setup/pause UI controls for adding, removing, and cycling bot role/team.
- [x] Keep computer control optional and off by default.

Current Phase 9 defaults:

- Bots consume normal player slots and count as connected players in state.
- `easy` is the default bot difficulty; `normal` remains accepted, but richer difficulty tuning is deferred.
- Bots are full team members for shared passive/active visibility.
- Bots do not add scoring, terrain collision, hazards, or a win condition.
- After Phase 9, the planned v1 roadmap is complete; future work should be planned after manual playtesting.

## Post-Phase 9 - Polish Options, Larger World, And Scenery

Goal: add room options and visual polish while preserving the manual-test workflow.

- [x] Enlarge the one-screen arena from `1200x800` to `1800x1200`.
- [x] Keep vehicles visually smaller relative to the larger full-world view.
- [x] Add room settings `wrapX` and `showBubbles`.
- [x] Add setup/pause menu toggles for Wrap and Bubbles.
- [x] Make ordinary pause/resume local to the specific player instead of freezing the room.
- [x] Keep the lobby/start overlay behavior through `reasonPaused: 'start'`.
- [x] Set torpedo, depth-charge, and upward-missile reloads to 10 seconds.
- [x] Make depth charges damp horizontal drift and approach a vertical terminal sink speed.
- [x] Rename submarine-facing primary weapon UI from Fire to Torpedo while preserving `input.fire` compatibility.
- [x] Add deterministic decorative sea-life scenery with no collision, sonar, scoring, or damage behavior.
- [x] Render wrapping duplicates for vessels near side edges.
- [x] Keep depth charges, missiles, sonar pulses, bubbles, and hit effects from wrapping; submarines, destroyers, and torpedoes wrap when Wrap is on.
- [x] Shrink the submarine upward missile surface blast after playtesting feedback; current radius is `64`.
- [x] Hide active sonar pulse rings from enemy clients outside the pulse range.
- [x] Hide reset/appearing circles around vessels; fireworks remain the hit/reset feedback.
- [x] Let upward submarine missiles reset enemy submarines as well as enemy destroyers.
- [x] Slightly increase submarine horizontal acceleration and max speed after playtesting feedback.
- [x] Default new rooms to fog-on and wrap-on.
- [x] In fog mode, hide submarine ballast/depth bubbles from enemy teams while keeping teammate bubbles visible.
- [x] Let torpedoes wrap horizontally in wrap mode and expire after traveling `0.75 * world.w`.

## Post-Phase 9 - Reload, Six Players, And Visibility Tuning

Goal: streamline room setup and tune late-v1 multiplayer play.

- [x] Remove Wrap and Bubbles controls from the setup/pause menu while keeping compatibility messages and default-on settings.
- [x] Add room-wide weapon reload controls: `2 s`, `5 s`, and `10 s` default.
- [x] Apply reload settings to torpedoes, depth charges, and submarine upward missiles; sonar cooldown remains separate.
- [x] Expand Submarine rooms from 4 to 6 player/bot slots.
- [x] Add defaults for player 5 as red submarine and player 6 as blue destroyer.
- [x] Increase submarine horizontal acceleration and max speed by about 30%.
- [x] Keep passive sonar detection scaled against the new submarine max speeds.
- [x] Let destroyers visually spot other destroyers over about two-thirds of the screen.
- [x] Keep destroyer/periscope-submarine visual spotting at about half the screen.
- [x] Increase destroyer active sonar radius by 30%.
- [x] Hide regenerated vessels from enemy passive/visual detection until they move, fire, or use sonar.
- [x] Add a toggleable LA-class-inspired submarine silhouette with the previous symmetric style retained as `classic`.

Current polish defaults:

- `visibilityMode` defaults to `low`; clear mode remains available from the setup/pause menu.
- `settings.wrapX` defaults to `true`; hard side bounds remain available through compatibility messages, but the setup UI no longer exposes Wrap.
- Torpedoes wrap horizontally when Wrap is on, but expire after traveling about `0.75 * world.w` (`1350` units in the current world).
- `settings.showBubbles` defaults to `true`; when false through compatibility messages, new ballast bubble entities are not created.
- `settings.reloadMs` defaults to `10000`; supported room-wide weapon reload values are `2000`, `5000`, and `10000`.
- `SUBMARINE_SILHOUETTE_STYLE` in `PlayScene.js` defaults to `la_class`; set it to `classic` to restore the earlier symmetric submarine.
- With fog on, bubbles are visible only to the owning team. With fog off, bubbles are visible to everyone.
- Scenery is hand-drawn client-side from `world.scenery` metadata only.
- Wrap, bubble, and reload settings are room-wide because they affect fairness and stealth.

## Checks And User Testing

The user will test gameplay manually. Do not spend agent time playtesting in a browser unless the user explicitly asks for it.

Agent checks should be limited to implementation confidence:

- [ ] Use Docker for builds and import checks when runtime files exist.
- [ ] Do not run host `npm` or `node`.
- [ ] Confirm `games-backend` imports cleanly after server files exist.
- [ ] Confirm gateway build includes `/games/submarine/` after client wiring exists.
- [ ] Confirm no existing game route/build wiring was accidentally removed.
- [ ] Leave gameplay feel, visual readability, and multiplayer playtesting to the user unless explicitly requested.

## Design Guardrails

- Server owns movement, collisions, visibility, weapons, hits, cooldowns, and respawns.
- Clients render state and send intent only.
- Keep all data JSON-safe.
- Keep UI touch-first with large targets.
- Avoid harsh failure loops.
- Make every future mechanic readable to a parent watching over a child's shoulder.
- Prefer simple, tunable arcade constants over simulation detail.
- Keep future phases checkable; when implementing a phase, update this file in the same commit/change.
