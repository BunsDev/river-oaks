# Nine men's morris at the plaza chess tables — 2026-10-13

**Objective:** nine men's morris at the plaza. It was queued for river-oaks-c2 and
handed to river-oaks-3b at Val's direction ("yes, take Reversi and morris"). Val
confirmed with 3b: land when green. On c2's advice it is on the chess tables,
because the grove table belongs to mancala and Go.

**Branch / worktree:** `feat/plaza-morris-20261013` in
`../river-oaks-morris-20261013`, stacked on `feat/plaza-reversi-20261013`
(#331). It merges main once #331 lands.

## Change

- **Rules** (`preview/src/morris-rules.js`):
  - The 24 points of a 7×7 grid, the 16 mills, and neighbours along the lines.
  - White places first, nine each. Then pieces step along lines, and a side
    down to three flies.
  - A move that closes a mill takes an opponent's piece: never one in a mill,
    unless all of them are.
  - A side with two pieces after placing, or no move, loses. A hundred plies
    without a mill, or a threefold position, is a draw.
  - Notation: `d1`, `a1-a4`, `g1xd7`.
- **Opponent** (`preview/src/morris-opponent.js`):
  - negamax with alpha-beta and iterative deepening under a node budget;
  - it counts pieces on the board and in hand, open two-in-a-rows and room to
    move;
  - it takes the history for repetition. Replies run under 0.2 s at 15,000
    nodes.
- **Sheet adapter** (`preview/src/morris-adapter.js`): `playable` (24 of 49
  cells), `drop` as a function of the position (placing), `takeLabel`, a
  "To place: White 9 · Black 9." alert, and the short switch label "Morris".
- **`plaza-table-games.js`:**
  - `drop` may be a function; cells that are not `playable` are inert
    (`data-void`, disabled, aria-hidden).
  - A move with several `take` options waits for a click on a marked piece:
    "Choose a black piece to take."
  - The arrow keys step past non-points.
  - The chess, Connect Four and morris mirrors are switched by `mirror` kind.
  - The switch shows `short` names.
- **The table** (`plaza-salon.js`): a walnut board laid over each chess table's
  squares, with 32 brass strips (the joins), 24 studs and 18 pieces, turned to
  the first player's chair (`userData.morris.show / visible / pieces`).
  `main.js` wires `getMorrisMirror` and adds `morris` to `__riverPlazaGames`.
- **Worker:** a `morris` entry, with history.
- **CSS:** the lines as an inline SVG background through the cell centres (CSP
  `img-src` allows `data:`), point dots and flat pieces.
- **Salon Guide:** a chapter of taking a seat, the aim, placing then moving,
  taking and flying, and the keys. Its mill, step and take pictures are played
  on the rules.

## Verification

- `node --test preview/tests/morris.test.js`: 7/7.
  - **Board:** the points, mills and neighbour degrees; the placing counts 24,
    552 and 12144.
  - **Mills:** takes, mill protection and the all-in-mills case.
  - **Endings:** steps along lines, flying, two pieces, blocked, and the draws.
  - **Adapter and regular:** the adapter phases and take options. The regular
    completes and blocks mills, stays legal and stays within its budget.
- `node --test preview/tests/plaza-morris-mirror.test.js`: 2/2. It covers the
  board, strips and studs per table; pieces on their points inside the chess
  footprint; turning for the other chair; and hiding it again.
- `node --test preview/tests/salon-guide.test.js`: 13/13, including the morris
  pictures. The step picture first put a black piece on its target, d2; the
  test caught it.
- `pnpm run test:experience plaza-morris`: passed, with 15 checks.
  - **Setup:** the switch offers Morris; 24 points with 25 void cells; the
    table board is shown with the chess pieces put away.
  - **Play:** a placement and the regular's answer; the right arrow steps from
    d2 to f2, past e2.
  - **A mill:** a pass-and-play mill marks a7 and d7, and d7 is taken
    (`g1xd7`).
  - **Switching:** chess and back keeps the position.
  - **Phone and close:** the switch fits at 390 px; Escape, and the table keeps
    the position.
- `pnpm run verify`: `core: passed` (unit 2905 pass, 0 fail, 1 skipped).

## Next step

When #331 (Reversi) lands, merge main, rerun the plaza-morris, salon-guide and
plaza-reversi journeys, then PR and `pnpm run land`.
