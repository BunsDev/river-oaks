# Plaza games: Jenga on the curved bench — 2026-10-13

**Objective:** Val asked to start Jenga after backgammon landed, and authorized
landing it when green. It is the next game on Val's list (Jenga, then wine pong).

**Branch / worktree:** `feat/plaza-jenga-20261013` in
`../river-oaks-plaza-jenga-20261013`, from main 846a0aa (backgammon #312).

## Change

- **`preview/src/jenga-rules.js`** (new, pure):
  - 18 levels of 3 crossed blocks.
  - Legal pulls: never the top level, nor the one under an unfinished top, nor a
    level's last block.
  - A pulled block goes on top, finishing the top level (middle first) before a
    new one starts.
  - A level left on one edge block topples the tower.
  - `zone()` is the steady-hand safe zone. It narrows with height, weakened
    levels and the load a level carries; a middle block of a full level is
    loosest, and the last of two is hardest.
  - Pulls are recorded with their outcome (`7b`, `7b!`), so games replay exactly.
- **`preview/src/jenga-opponent.js`** (new): the regulars pull the loosest block.
  - They never pull a fatal block while a safe one remains.
  - They spare middles that would leave a level with no safe pull.
  - Their seeded taste among near-equal choices, and their steadiness, are both
    seeded with `Math.imul` mixing (the backgammon lesson).
  - Tuned so a table of three lasts a median of 20 pulls (p10 14, p90 30) over
    400 seeds.
- **`preview/src/plaza-salon-plan.js`:**
  - `JENGA` dimensions (12 × 4 × 2.4 cm blocks, on the drum clear of its
    lanterns and bowl).
  - `jengaBlock(bench, level, slot)` and `jengaSeat(sitting)`: any of the
    bench's three places.
- **`preview/src/plaza-salon.js`:** the tower as one InstancedMesh of maple
  blocks with grain variation (`userData.jenga.show(state|null)`, `count()`,
  `fallen()`). After a fall, every block lands from its own seeded throw, away
  from the bench, on the drum or the paving.
- **`preview/src/plaza-jenga.js` + `.css`** (new): the sheet.
  - The tower drawn level by level, with roving keyboard focus (arrows, then
    Enter).
  - Choosing a block starts the steady-hand meter (slower under reduced motion).
    Pull, or Space/Enter, stops it.
  - A running tally, New tower, and "with two regulars" or pass-and-play.
  - Focus is kept across redraws, the controls use `data-jenga-*` attributes,
    and a ticket cancels the regulars' turns.
- **`preview/src/main.js`:** one `playProviders` line and the
  `__riverPlazaJenga` debug hook (with `aim()` to hold the meter still for tests).
- **Journeys:** `plaza-jenga` (new).
- **Docs:** `docs/multiplayer.md`.

## Checks

| Check | Result |
|---|---|
| `jenga.test.js` | 5/5. Tower rules and protected levels; the fatal edge and unsteady falls; zone ordering; exact replay and mismatch rejection; regulars over five seeds up to `2 ** 32 - 1`. |
| `plaza-games-mirror.test.js` | The tower in place, the pulled block on top, clear of the drum's ornaments, and a fall that scatters all 54 blocks the same way each time. |
| All `preview/tests` | 2800 pass, 0 fail |
| Journeys | `plaza-jenga` passed (sit, X, a steady pull, the regulars' turns, a wobble and fall, the tally, New tower, layout fit, Escape, stand). `plaza-salon` passed. |

## Found by the journey

The first screenshot showed the shared `.table-game-body` grid laying the
sheet's rows out as columns, which pushed the tally and New tower off the
sheet. The sheet is now a column like backgammon's. The journey checks that the
tally, the tower and New tower sit inside the sheet.

## Gaps

- Practice only, like the other plaza games.
- Up to three at the table, all in this browser.
- The fall is a seeded scatter, not physics.
