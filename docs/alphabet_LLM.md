# Alphabet — LLM notes

Alphabet is a multiplayer letter-recognition game for up to 4 players, designed to teach 5-year-olds to read. A word is displayed with one letter replaced by an underscore; a large emoji picture hint is shown above the word. Players tap the missing letter on an alphabetical A–Z on-screen keyboard (or physical keyboard). Any player can answer — a parent can help when a child is stuck.

If the child answers incorrectly twice on the same word, the correct letter is revealed in green for 1.5 seconds and the game moves on automatically (errorless-learning approach — no punishment, no dead ends).

Seven levels of increasing difficulty follow the pedagogically correct phonics progression: initial sound (onset) → final sound (rime) → medial vowel → any position, with easy CVC words first and harder blends/digraphs in the final level.

Target audience: 5-year-olds learning letter-sound correspondence, ideally playing with a parent.

## Theme & Characters

Players choose from 6 animal emoji avatars: 🐱 🐶 🐰 🦊 🐸 🐼 and 4 colors.

## Where things live

Server:
- `apps/ws/src/games/alphabet.js` — WebSocket room host + message routing
- `apps/ws/src/games/alphabet_sim.js` — authoritative simulation, word lists, level definitions

Client:
- `alphabet/client/src/net.js`
- `alphabet/client/src/game/scenes/BootScene.js`
- `alphabet/client/src/game/scenes/MenuScene.js`
- `alphabet/client/src/game/scenes/PlayScene.js`
- `alphabet/client/src/main.js`

Infrastructure:
- Caddy: `/games/alphabet/` static + `/games/alphabet/ws*` WebSocket proxy
- Deploy: `infra/lightsail/lightsail_restart.sh` builds `alphabet/client` with `VITE_BASE=/games/alphabet/` and rsyncs to `/srv/games/alphabet/`

## Core loop

- Host tick: every **50ms** calls `Sim.step(state, now)` and broadcasts `{type:"state"}`.
- On `input { key }` the server calls `Sim.applyKey(state, playerId, key)`:
  - Correct → word advances, recent-words history updated
  - Wrong (1st time) → `wrongAttempts` incremented, child gets another try
  - Wrong (2nd time) → `autoReveal = true`; client waits 1.5 s then sends `advance_after_reveal`
- 15 words per level (`WORDS_PER_LEVEL`). After 15 words, `celebrating = true`.

## Protocol (Alphabet)

Handshake:
- `{type:"hello", gameId:"alphabet", protocol:1}`

Lobby / room messages:
- `create_room`, `join_room {roomId}`, `get_rooms`

Setup/control:
- `resume` — start or unpause
- `pause` — pause, opens setup overlay
- `restart` — reset current level
- `next_level` — advance after celebration (only when `state.celebrating === true`)
- `select_level { index: 0–6 }` — change level from setup overlay
- `select_avatar { avatar: string }`
- `select_color { color: string }`

Gameplay:
- `input { key: string }` — single lowercase letter
- `advance_after_reveal` — sent by client ~1.5 s after `autoReveal` goes true; calls `Sim.advanceAfterReveal(state)` on server

Server → client:
- `state { state }` every tick

## State shape

See `docs/STATE.md` for shared conventions.

Alphabet-specific state fields:
- `levelIndex`: number — 0–6
- `levelName`: string — e.g. `"A to Z"`, `"Last Letter"`
- `levelEmoji`: string — e.g. `"🔤"`, `"🔚"`
- `missingMode`: `'first' | 'last' | 'middle' | 'random'`
- `wordIndex`: number — position within `wordOrder`
- `wordOrder`: number[] — shuffled (or ordered for Level 1) indices into the level's word array
- `currentWord`: string — the full word (e.g. `"cat"`)
- `currentEmoji`: string — picture hint shown above the word (e.g. `"🐱"`)
- `missingIndex`: number — which letter position is hidden (0 = first, etc.)
- `wordsCompleted`: number — words finished this level (0–15)
- `wordsPerLevel`: 15
- `recentWords`: `[{ word, emoji, missingIndex, revealed? }, ...]` — last 6 completed words, newest first; `revealed: true` if the answer was auto-revealed
- `wrongAttempts`: number — wrong guesses on the current word (resets on advance); triggers auto-reveal at 2
- `autoReveal`: boolean — true when the answer is being shown; input is ignored; client sends `advance_after_reveal` after 1.5 s
- `celebrating`: boolean — true when the level is complete; triggers confetti + Next Level button
- `celebrateStart`: number — server timestamp of celebration start
- `lastTypedBy`: number | null — playerId who last answered correctly
- `players[pid]`: `{ id, connected, paused, avatar, color }`

## Levels

| # | Name | Emoji | Words | Missing position |
|---|------|-------|-------|-----------------|
| 1 | A to Z | 🔤 | 26 canonical A–Z words (Apple → Zebra) | First letter — in alphabetical order |
| 2 | A to Z Mix | 🔀 | Same 26 A–Z words | First letter — shuffled |
| 3 | First Letter | 🅰️ | 20 easy CVC words (bug, hen, fox…) | First letter |
| 4 | Last Letter | 🔚 | 20 easy CVC words (car, bus, cow…) | Last letter |
| 5 | Middle Vowel | 🔵 | 20 CVC words (cat, sun, pig…) | Middle vowel (always the medial vowel) |
| 6 | Any Letter | ❓ | 20 easy 3–4 letter words (frog, star…) | Random position |
| 7 | Challenge | ⭐ | 20 harder words with blends/digraphs (shark, train…) | Random position |

**Pedagogical rationale**: The level order follows onset → rime → medial vowel (Yopp 1988, Adams 1990), the universally accepted difficulty progression for phonemic awareness. The middle vowel (medial position) is the hardest phoneme to isolate and is taught last among single-letter positions.

## Word lists (summary)

Level 1 & 2 — A–Z canonical: apple ⚽ ball 🐱 cat 🐶 dog 🥚 egg 🐟 fish 🍇 grapes 🎩 hat 🧊 ice 🫙 jar 🪁 kite 🦁 lion 🌙 moon 🪺 nest 🍊 orange 🐷 pig 👸 queen 🌈 rainbow ☀️ sun 🌳 tree ☂️ umbrella 🚐 van 🐋 whale 🎵 xylophone 🧶 yarn 🦓 zebra

Level 3 — First letter: bug cup hen fox bat bed ant nut jam van web leg ram yak lip log map mud pen zip

Level 4 — Last letter: car bus cow bee ham bat pin dog fan hen pot owl gem key mop pea run sun tap zip

Level 5 — Middle vowel: cat sun pig dog bug hen cup hat bed fox bat pin nut pot leg ram fin gem log map

Level 6 — Random: frog star bear duck cake moon bell fish drum king leaf rose bone corn ring nest worm tree coat boat

Level 7 — Challenge (blends/digraphs): shark cloud grape whale train horse snail bread flame crown sheep lemon mouse truck chair peach sword brush globe slide
