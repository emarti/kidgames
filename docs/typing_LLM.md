# Typing — LLM notes

Typing is a collaborative word-typing game for up to 4 players. A shared word appears on screen (faded at low opacity); players tap letters on an in-game QWERTY keyboard (or a physical keyboard) to type it together. Any player can contribute the next correct letter — a parent can help when a child gets stuck. Wrong keys are silently ignored. Completing 30 words finishes an obstacle (e.g. tree, volcano) and unlocks the next. Words scroll downward as you climb, giving a feeling of ascending each obstacle.

Target audience: smart 5-year-olds learning to read, write, and type. All word lists are age-appropriate.

## Theme & Characters

Players choose from 6 animal emoji avatars: 🦊 🐱 🐶 🐸 🐼 🦄 and 6 colors.

## Where things live

Server:
- `apps/ws/src/games/typing.js` — WebSocket room host + message routing
- `apps/ws/src/games/typing_sim.js` — authoritative simulation, word lists, obstacle definitions

Client:
- `typing/client/src/net.js`
- `typing/client/src/game/scenes/BootScene.js`
- `typing/client/src/game/scenes/MenuScene.js`
- `typing/client/src/game/scenes/PlayScene.js`
- `typing/client/src/main.js`

## Core loop

- Host tick: every **50ms** calls `Sim.step(state, now)` and broadcasts `{type:"state"}`.
- On each `input { key }` message the server checks if `key === currentWord[letterIndex]`; if so, advances `letterIndex`. Wrong keys are ignored.

## Protocol (Typing)

Handshake:
- `{type:"hello", gameId:"typing", protocol:1}`

Lobby / room messages (common):
- `create_room`, `join_room {roomId}`, `get_rooms`

Setup/control:
- `resume` — start game (from lobby) or unpause
- `pause` — pause mid-game, opens setup/pause overlay
- `restart` — reset current obstacle to word 0
- `next_obstacle` — advance to next obstacle after celebration (only works when `state.celebrating === true`)
- `select_avatar { avatar: string }` — one of: `🦊`, `🐱`, `🐶`, `🐸`, `🐼`, `🦄`
- `select_color { color: string }` — hex color, one of: `#ff4d4d`, `#4d94ff`, `#4dff88`, `#ffcc4d`, `#cc4dff`, `#ff8c4d`

Gameplay input:
- `input { key: string }` — single lowercase letter; server ignores if wrong or game is paused/celebrating

Server → client:
- `state { state }`

## State shape

See `docs/STATE.md` for shared conventions.

Typing-specific state fields:
- `obstacleIndex`: number — which obstacle (0–13), wraps around
- `wordIndex`: number — index into current obstacle's word list (0–29)
- `letterIndex`: number — how many letters have been typed correctly in the current word
- `wordsCompleted`: number — words finished in this obstacle (0–30)
- `wordsPerObstacle`: 30
- `currentWord`: string — the word players are currently typing (e.g. `"cat"`)
- `currentEmoji`: string — emoji shown next to the current word (e.g. `"🐱"`)
- `obstacleName`: string — e.g. `"tree"`, `"volcano"`
- `obstacleEmoji`: string — e.g. `"🌳"`, `"🌋"`
- `recentWords`: `[{ word, emoji }, ...]` — last 6 completed words, newest first; used for the scrolling word trail below the current word
- `celebrating`: boolean — true when the obstacle is complete; triggers confetti and shows Next button
- `celebrateStart`: number — server timestamp of when celebration began
- `lastTypedBy`: number | null — playerId who typed the most recent correct letter (used for player avatar bounce animation)
- `players[pid]`: `{ id, connected, paused, avatar, color }`

## Obstacles & word lists

14 obstacles in order, each with 30 words. Difficulty groups: 2 levels per word length, then 3 per length from 4+ letters:

| #  | Name           | Emoji | Word length |
|----|----------------|-------|-------------|
|  0 | tree           | 🌳    | 3 letters   |
|  1 | mountain       | ⛰️    | 3 letters   |
|  2 | snowy mountain | ❄️    | 4 letters   |
|  3 | volcano        | 🌋    | 4 letters   |
|  4 | reef           | 🪸    | 4 letters   |
|  5 | jungle         | 🌴    | 5 letters   |
|  6 | underwater     | 🌊    | 5 letters   |
|  7 | cloud          | ☁️    | 5 letters   |
|  8 | olympus mons   | 🔴    | 6 letters   |
|  9 | space          | 🚀    | 6 letters   |
| 10 | aurora         | 🌌    | 6 letters   |
| 11 | skyscraper     | 🏙️   | 7 letters   |
| 12 | tornado        | 🌪️    | 7 letters   |
| 13 | glacier        | 🧊    | 7 letters   |

Word lists are defined in `OBSTACLES` array in `typing_sim.js`. After obstacle 8, `next_obstacle` wraps back to 0.

## Visual layout (PlayScene)

```
+--------------------------------------------------+  y=0
|  HUD: Room | 🌳 Tree | [🦊][🐱] avatars  [☰]   |  44px
+--------------------------------------------------+
|                                                  |
|  [Obstacle background art fills this area]       |
|                                                  |
|  > C A T  🐱 <   ← current word (near top, ~22%)|
|  dog  🐶           ← completed word (below)     |
|  cat  🐱           ← older word (more faded)    |
|                                                  |
|  [Progress bar: thin vertical strip right edge]  |
+--------------------------------------------------+  ~60% down
|  [Q][W][E][R][T][Y][U][I][O][P]                  |
|   [A][S][D][F][G][H][J][K][L]                    |
|      [Z][X][C][V][B][N][M]                       |
+--------------------------------------------------+  y=H
```

- Current word near the **top** of the game area (~22% down from HUD). Completed words fall **below** and scroll downward as you type more, giving a climbing sensation.
- Each letter rendered as an individual Text object: alpha 0.28 + gray when untyped, alpha 1.0 + white when typed.
- Emoji displayed to the right of each word.
- Scroll animation: when a word completes, `scrollOffset` jumps to `-WORD_SPACING` and tweens to 0 over 380ms, making completed words appear to drop into position.
- Keyboard occupies ~42% of screen height (capped at 280px). Keys are sized to fill screen width across 10 columns.
- HUD `☰` button (top-right) sends `pause`; overlay shows Resume + Restart obstacle buttons.
- Celebration overlay: full-screen confetti, obstacle emoji, "Next Obstacle →" button.

## Background art

Each obstacle has a detailed Phaser Graphics background drawn once on obstacle change (`drawBackground()`):

- **🌳 Tree** — Wide bark trunk, knot holes, branch stubs with leaf clusters, squirrel, dappled sunlight shafts
- **⛰️ Mountain** — Rock strata layers, fractures, snow-capped ledges, mountain goat on a ledge
- **❄️ Snowy Mountain** — Ice face, hanging icicles, rounded snow drifts, sparkle crystals, falling snowflakes
- **🌋 Volcano** — Basalt columns, 3 flowing lava channels with glowing cores, ash clouds, floating embers
- **🌴 Jungle** — Dense canopy, vines with flowers, tropical leaves, butterfly, parrot
- **🌊 Underwater** — Caustic light rays, seaweed, coral, 9 fish species, starfish, bubbles, sandy floor
- **🔴 Olympus Mons** — Ancient lava strata, impact craters, Martian dust, thin atmosphere gradient
- **🚀 Space** — Star field, Milky Way, Earth, Saturn with rings, space station, comet, nebula, Moon
- **🏙️ Skyscraper** — Night sky, glass facade with lit windows, structural columns, city glow, helicopter

Background functions: `drawTreeBg`, `drawMountainBg`, `drawSnowyMountainBg`, `drawVolcanoBg`, `drawJungleBg`, `drawUnderwaterBg`, `drawOlympusBg`, `drawSpaceBg`, `drawSkyscraperBg` — all in `PlayScene.js` header, each takes `(g, w, gh)` where `g` is a Phaser Graphics object positioned at `(0, HUD_H)`.

## Pause / setup overlay

- **Lobby** (`state.paused && state.reasonPaused === 'start'`): shows 🚀 START button only
- **Mid-game pause** (`state.paused && state.reasonPaused === 'paused'`): shows ▶ Resume button + ↺ Restart obstacle button (separate rows, no overlap)
- Both modes show avatar and color pickers; selected options are highlighted
- Overlay is rebuilt on screen resize via `recreateLayout()`

## Practical editing guidance

- To add a new obstacle: add an entry to `OBSTACLES` in `typing_sim.js` (name, emoji, 30 words with emoji), add a matching entry to `THEMES` in `PlayScene.js` with a `bgDraw` function, write the `drawXxxBg(g, w, gh)` function.
- To change words: edit the `words` array in the relevant `OBSTACLES` entry in `typing_sim.js`. The server broadcasts `currentWord`/`currentEmoji` directly, so no client changes needed.
- To change obstacles per game: change `WORDS_PER_OBSTACLE` in `typing_sim.js` (currently 30).
- Avatar/color changes: update `AVATARS`/`ALLOWED_COLORS` in `typing_sim.js` and `AVATARS`/`COLORS` in `PlayScene.js`.
- The keyboard sends `input { key }` for each tap; the server ignores it if paused or celebrating.

## Common pitfalls

- `letterIndex` is 0-based. A word is complete when `letterIndex >= currentWord.length`.
- `recentWords[0]` is the **most recently** completed word (newest first).
- `scrollOffset` is a client-side animation value (not in server state) — it tweens from `-WORD_SPACING` to 0 after each word completes.
- The `☰` pause button is hidden while the setup overlay is visible (checked each frame via `state.paused`).
- `togglePause` cycles: start-screen → unpause; mid-game → pause; paused mid-game → unpause. Never set `reasonPaused` to anything other than `'start'` or `'paused'` (null when unpaused).
- Background is only redrawn when `obstacleIndex` changes — not every frame. The `bgGraphics` object is a persisted Phaser Graphics object at position `(0, HUD_H)`.
