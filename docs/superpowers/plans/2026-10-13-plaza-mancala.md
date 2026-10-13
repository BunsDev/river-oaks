# Plaza games: mancala at the grove table — 2026-10-13

**Objective:** Val asked for the next table game after Spades, and c2 chose mancala.
Val authorized landing it when green.

**Branch / worktree:** `feat/plaza-mancala-20261013` in
`../river-oaks-plaza-mancala-20261013`, from main df54d3f (Spades #324).

## Change

- **`preview/src/mancala-rules.js`** (new, pure): Kalah with six pits of four a
  side.
  - Sowing runs counter-clockwise and skips the opponent's store.
  - Ending in your own store earns another turn.
  - A capture takes your own empty pit plus the seeds opposite, when that pit
    has any.
  - An empty side ends the game, and each player banks what is left on their
    side.
  - `last` records the sowing (path, capture, extra turn), and games replay
    exactly from their moves.
- **`preview/src/mancala-opponent.js`** (new):
  - Alpha-beta search to depth 6, valuing stores and seeds on each side.
  - Moves that earn another turn are tried first and win ties, so it opens
    with the classic pit 3.
  - Over 12 games it won at least 10 of 12 against random play; its slowest
    move in self-play took 14 ms.
- **`preview/src/plaza-salon-plan.js`:**
  - The grove table at (-2792.4, -1299.2), the most central spot with at least
    1 m clearance in a scan for open paving, trunks and footprints. Its chairs
    sit east and west.
  - `groveSeat`, and `MANCALA` / `mancalaSpot` (pits and stores for either
    chair).
- **`preview/src/plaza-salon.js`:** the table, a carved board with ebony cups and
  stores, and 48 glass beads in five colours heaped on spirals.
  `userData.mancala.show(state|null, sideZeroChair)` and `count()`.
- **`preview/src/plaza-mancala.js` + `.css`** (new): the board sheet.
  - Your pits along the bottom and your store on the right, with seed beads and
    counts.
  - Open pits are outlined and the last sowing is marked.
  - Scores, New game, the regular or pass-and-play, and you or the regular
    moving first.
  - Focus is kept across redraws, and the controls use `data-mancala-*`
    attributes.
- **`preview/src/main.js`:** a `playProviders` line, the update, and the
  `__riverPlazaMancala` debug hook.
- **Salon Guide:** a mancala chapter (taking a seat, the aim, sowing, capturing,
  the keys) with three pictures checked against the rules, plus an icon.
- **Journeys:** `plaza-mancala` (new). `plaza-salon` now expects 15 seats.

## Checks

| Check | Result |
|---|---|
| `mancala.test.js` | 5/5. The board; sowing, the extra turn and skipping the other store; capture and no capture; end and banking; replay; the regular's opening, legality, determinism and wins against random play. |
| `plaza-salon.test.js` | 8/8 with the grove table: open paving, trunks, footway connectivity, and seats resolvable by the town. |
| `plaza-games-mirror.test.js` | The opening, a sown pit and the store, and the board turned for the other chair. |
| `salon-guide.test.js` | 11/11, including the mancala pictures against the rules. |
| All `preview/tests` | 2880 pass, 0 fail |
| Journeys | `plaza-mancala` passed: sit, X, pit 3 into the store for another turn (marked and announced), pit 6, the regular's answer, 48 beads, focus kept, Escape, stand. `plaza-salon` passed (15 seats). |

## Gaps

- Practice only.
- Kalah (6,4) only; no other mancala variants.
