# Plaza games: a backgammon table — 2026-10-13

**Objective:** Val asked for the next table game after Hearts, and authorized
landing backgammon when green. It covers "more game tables" from Val's list.

**Branch / worktree:** `feat/plaza-backgammon-20261013` in
`../river-oaks-plaza-backgammon-20261013`. It was started from the Hearts branch
and is merged with main once Hearts lands.

## Change

- **`preview/src/backgammon-rules.js`** (new): standard backgammon.
  - Points are numbered from white's side. Moving, the bar, hitting blots and
    bearing off (exact, or higher from the farthest point) all follow the
    standard rules. The opening roll decides who starts, and doubles give four
    moves.
  - Legal plays are whole-turn sequences: as many dice as possible, and the
    higher die when only one of two can be used. Single moves are the next step
    of any legal play, so the rule holds checker by checker.
  - A turn passes on its own when its dice are used or nothing else can move, and
    a player with no play passes.
  - Scoring is 1, 2 for a gammon and 3 for a backgammon.
  - The dice come from the seed per turn, so a game replays from its seed and
    moves (`24-18`, `bar-20`, `3-off`). `fromPosition` sets up a position by hand.
- **`preview/src/backgammon-opponent.js`** (new): one ply over every legal play,
  scored on race, hits, made points (home board first), bearing off and the shots
  left against its blots. Deterministic.
- **`preview/src/plaza-salon-plan.js`:**
  - The table at (-2789.6, -1297.4), between the grove's middle trunks, with two
    chairs east and west.
  - `backgammonSeat`, plus `BACKGAMMON` and `backgammonSpot` for checker placement:
    points, stacks, the bar and the bear-off trays, turned for either chair.
- **`preview/src/plaza-salon.js`:**
  - A walnut table and a board texture: frame, bar, felt and 24 points in
    oxblood and cream.
  - The checkers as one InstancedMesh with instance colours, and a
    `userData.backgammon` mirror that shows the opening when idle.
- **`preview/src/plaza-backgammon.js` + `.css`** (new): the board sheet in the
  table-games frame.
  - An SVG board drawn from your side, with the dice.
  - Pick a checker or the bar, then a point or the tray.
  - Undo within your turn, Next game, a running score with pips, and the
    regular or pass-and-play, white or black.
  - The regular plays its roll 0.5 s per checker.
- **`preview/src/main.js`:** the backgammon provider. X now reads a
  `playProviders` list, so each game table (or 3b's stage) adds its own line
  rather than editing one shared expression, which conflicted on every merge
  today.
- **Journeys:** `plaza-backgammon` (new). `plaza-salon` now expects 13 seats.
- **Docs:** `docs/multiplayer.md`.

## Checks

| Check | Result |
|---|---|
| `backgammon-rules.test.js` | 7/7. The opening (167 pips each), the dice rules (higher die, a blocked six, doubles), bar entry and a closed board, hitting, bearing off (exact and higher from the farthest), single, gammon and backgammon, and replay over 40 games. A one-off run of 150 random games all ended with 30 checkers. |
| `backgammon-opponent.test.js` | 4/4. Opens 3-1 as 8/5 6/5, hits safely, bears off, and every chosen play is legal and repeatable over 12 games. |
| `plaza-salon.test.js` | The new table passes the plaza's own checks: open paving, clear of trunks, the footway still connected, and seats resolvable by the town. |
| `plaza-games-mirror.test.js` | The opening, a game's points, bar and trays. |
| `backgammon-rules.test.js` (large seeds) | Seeds up to `2 ** 32 - 1` open and roll varied dice. It hung before the `Math.imul` fix (below). |
| All `preview/tests` | 2778 pass, 0 fail (after merging main with Hearts #310) |
| `pnpm run verify` (core) | Passed: preview unit tests, server 51 pass/134 skipped (Redis), Python 141 passed |
| Journeys | `plaza-backgammon` and `plaza-salon` passed (13 seats), `plaza-chess` passed, `plaza-hearts` passed |

## Found by the journey

- **Dice from large seeds.** The die mixed a 32-bit seed with a float product. Above
  ~3.4M that passes 2^53 and rounds the turn and slot away, so every die matched and
  `openingRoll` looped for ever. The sheet deals from `Math.random() * 2 ** 32`, so
  X hung the page. Fixed with `Math.imul` and an xor mix; tests cover large seeds.
- **Undo never enabled.** After each of your moves, the regular's run cancelled at
  once (not its turn), but its cleanup still reset the start of your turn. It now
  resets only when the regular actually played.
- **Keyboard focus lost on redraw.** The board's points are replaced on each render,
  so focus fell to the page and Escape stopped closing the board. Focus now stays on
  the same point (or a playable one, or Close), as in the Hearts sheet.
- **Global locators.** `data-action` / `data-mode` / `data-side` clashed with the
  chess sheet's journey locators. Backgammon uses `data-backgammon-*`.

## Gaps

- Practice only, like the other plaza games.
- No doubling cube.
- The opponent looks one ply ahead.
