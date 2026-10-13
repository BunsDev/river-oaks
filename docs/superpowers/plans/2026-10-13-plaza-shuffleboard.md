# Plaza games: shuffleboard on the long café table — 2026-10-13

**Objective:** table shuffleboard, from c2's queue. Val authorized landing it when
green, and said "pls proceed", so it was built while darts and liar's dice landed.

**Branch / worktree:** `feat/plaza-shuffleboard-20261013` in
`../river-oaks-plaza-shuffleboard-20261013`, from main cce7b0b (cribbage #333).

## Change

- **`preview/src/shuffleboard-rules.js`** (new, pure):
  - The wine pong table (2.4 × 0.6 m) with a foul line at 1.65 m, then zones worth
    1, 2 and 3 toward the far end; a puck hanging over the end scores 4.
  - A throw is an aim and a power. `slide()` simulates it in fixed 1/240 s steps:
    steady friction, equal-mass collisions with a little bounce, the gutters and the
    end. A puck short of the foul line is taken off.
  - Four pucks each a round, alternating. Only the player furthest along scores:
    each of their pucks beyond the other's best counts its zone. The first throw
    alternates by round, and the first to 15 wins.
  - Games replay exactly from their throws. `powerFor()` and `restFor()` convert
    between a power and a lone puck's resting place.
- **`preview/src/shuffleboard-opponent.js`** (new): the regular knocks your
  leading puck when you lie ahead, and otherwise places a puck deep in the 3 zone
  (offset when that spot is taken). A seeded wobble in aim and power, mixed with
  `Math.imul`.
- **`preview/src/plaza-salon.js`:** `userData.winePong.setVisible()` puts the
  glasses away; `userData.shuffleboard` is eight red and blue pucks (one
  InstancedMesh), placed in the rules' frame from whichever end you stand at.
- **`preview/src/plaza-wine-pong.js`:** a Wine pong / Shuffleboard switch at the
  top of the sheet, and `close({ toWorld })` for switching.
- **`preview/src/plaza-shuffleboard.js` + `.css`** (new): the standing sheet.
  - The table from your end, with the zones and the foul line.
  - A line sweeps across for the aim, then a target rides along it for the power
    (slower under reduced motion). The puck's slide plays on the sheet and on the
    real table.
  - Scores, pucks left, and a line for each round's result. The regular throws
    after you; Pass and play shares the end.
- **`preview/src/main.js`:** `longTableGames()` / `switchLongTable`, like the
  walnut and grove tables: X opens the last game played, and switching swaps the
  glasses and the pucks. The `__riverPlazaShuffleboard` debug hook (`hold()` holds
  the line still for tests; `reset()`).
- **Salon Guide:** a shuffleboard chapter, after wine pong. Its zone, throw and
  scoring pictures are checked against the rules.
- **Journeys:** `plaza-shuffleboard` (new). Docs: `docs/multiplayer.md`.

## Checks

| Check | Result |
|---|---|
| `shuffleboard.test.js` | 5/5. Slides by power, the foul line, off the end and into the gutter, `powerFor`/`restFor`; collisions; scoring and the hanger; turns, rounds and the win; exact replay and the regular. |
| `plaza-games-mirror.test.js` | The pucks placed from either end, out pucks hidden, and the glasses put away. |
| `salon-guide.test.js` | The chapter's pictures follow the rules (the scoring round and the hanger). |
| All `preview/tests` | 2934 pass, 0 fail |
| Journeys | `plaza-shuffleboard` passed: walk to the west end, X opens wine pong and its switch sets out shuffleboard (glasses away, pucks shown), a straight slide to rest at 2.3 m through the aim and power presses (on the sheet and the table), the layout fit, the regular's answer, focus kept through both slides, Escape, X reopening shuffleboard where it was, and the switch back. `plaza-wine-pong` passed. |

## Gaps

- Practice only, like the other plaza games.
- The aim line on the sheet is a guide, not an exact prediction of the slide.
