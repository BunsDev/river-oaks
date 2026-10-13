# Plaza games: Yacht at the bench — 2026-10-13

**Objective:** Yacht, the five-dice game, from c2's queue. Val authorized landing it
when green, and said "pls proceed", so it was built while darts, liar's dice and
shuffleboard landed.

**Branch / worktree:** `feat/plaza-yacht-20261013` in
`../river-oaks-plaza-yacht-20261013`, from main 36a9748 (#335).

## Change

- **`preview/src/yacht-rules.js`** (new, pure):
  - Classic Yacht with twelve boxes and no bonus: ones to sixes, full house, four
    of a kind, little and big straight, choice, and yacht.
  - A turn is a roll, up to two rerolls keeping marked dice, then one open box.
  - Dice come from the seed, the turn and the roll, mixed with `Math.imul`, so a
    game replays exactly from moves like `roll:10010` and `score:fourKind`.
  - The highest total wins; ties share the win.
- **`preview/src/yacht-opponent.js`** (new): the regulars weigh each box against
  its par. After each roll they look one roll ahead over every distinct set of
  dice to keep, and roll again while that beats scoring now. Over 200 solo
  games: median 157 (p10 112, p90 210), about 4 ms a decision.
- **`preview/src/plaza-salon.js`:**
  - An `ivoryDice()` helper: pip textures and the turn that brings each value
    face up.
  - `userData.yacht`: five dice where the tower stands. Rolled dice are tumbled
    by a seeded turn; kept dice line up toward the bench. Hidden until Yacht is
    in play.
  - `userData.jenga.setVisible()` puts the tower away.
- **`preview/src/plaza-jenga.js`:** a Jenga / Yacht switch at the top of the
  sheet, and `close({ toWorld })` for switching.
- **`preview/src/plaza-yacht.js` + `.css`** (new): the seated sheet.
  - Five SVG dice; choose a die to keep it.
  - The score card has a column per player. On your turn, each open box shows
    what the dice would score there.
  - Roll is focused at the start of each turn, and focus returns to it after
    scoring.
- **`preview/src/main.js`:** `benchGames()` / `switchBench`, like the walnut,
  grove and long tables. X opens the last game played, and switching swaps the
  tower and the dice. The `__riverPlazaYacht` debug hook (`deal(seed)`).
- **Salon Guide:** a Yacht chapter after Jenga. Its keep and scoring pictures
  are checked against the rules.
- **Journeys:** `plaza-yacht` (new). Docs: `docs/multiplayer.md`.

## Checks

| Check | Result |
|---|---|
| `yacht.test.js` | 5/5. Every box, the turn and reroll rules, exact replay with large seeds, regulars over five seeds up to `2 ** 32 - 1`, and keeping a made yacht, chasing a near one, and dumping junk in ones. |
| `plaza-games-mirror.test.js` | 13/13. Dice show their values face up, kept dice line up nearer the bench, all clear of the drum's ornaments, and the tower swaps out. |
| `salon-guide.test.js` | The Yacht pictures follow the rules. |
| All `preview/tests` | 2934 pass, 0 fail |
| Journeys | `plaza-yacht` passed: sit on the bench, X opens Jenga, and its switch sets out Yacht (tower away, five dice on the drum); a seeded deal, Space rolls, keeping two dice through the second roll, Choice offering the sum, the layout fit, scoring, focus back on Roll, both regulars' turns, Escape, X reopening Yacht where it was, the switch back, and standing up. `plaza-jenga` passed. |

## Gaps

- Practice only, like the other plaza games.
- Liar's dice builds its own dice; once it lands, both should share `ivoryDice()`.
