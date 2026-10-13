# Connect Four at the plaza chess tables — 2026-10-13

**Objective (Val):** "Lets also add connect four please?"

**Branch / worktree:** `feat/plaza-connect-four-20261013` in
`../river-oaks-connect-four-20261013`. river-oaks-c2 owns the plaza games
(chess, checkers, dominoes, Hearts, backgammon), and Connect Four follows their
adapter pattern. c2 reviewed the adapter changes at `daac74a` (see *Review*).

## Change

- **Rules** (`preview/src/connect-four-rules.js`):
  - 7 columns of 6, red moves first.
  - A move is a column letter; the disc falls to the lowest empty cell.
  - Cells are named `a1`–`g6`, from the bottom left.
  - A full column refuses a disc. Four in a row across, up or along either
    diagonal wins; a full board without one is a draw.
- **Opponent** (`preview/src/connect-four-opponent.js`):
  - The plaza regular searches with negamax, alpha-beta and iterative
    deepening, centre columns first.
  - It scores each window of four, prefers a faster win and a slower loss, and
    stops at a node budget so every reply is quick and deterministic.
  - It runs in `table-game-worker.js` like chess and checkers.
- **Sheet** (`preview/src/connect-four-adapter.js`, `plaza-table-games.js`,
  `plaza-table-games.css`):
  - `CONNECT_FOUR` describes the board size, cell names and drop moves.
    `plaza-table-games.js` reads them from the adapter instead of assuming an
    8×8 board.
  - Clicking any cell of a column drops into it. The landing cells are
    marked only while you may drop: not while the regular thinks, and not after
    the game ends.
  - The winning four is lit (`data-win`).
  - Switching games keeps the opponent mode of the game being left.
  - The seat action reads "Play a table game". The longer "Play chess,
    checkers or Connect Four" wrapped to two lines at 390 px.
- **Table** (`preview/src/plaza-salon.js`):
  - Each chess table has a standing blue frame
    (`userData.connectFour.show(tableId, board | null, firstChair)`).
  - Columns run from the first player's left, whichever chair they sit in.
  - Showing the frame puts the chess pieces away; chess brings them back.
  - Both tables share the frame, slot and disc geometries and materials.
- **Wiring:** `main.js` adds `getFourMirror` and a `four` field in
  `__riverPlazaGames`. The chess and checkers journeys match the new label.
  `docs/multiplayer.md` describes Connect Four with the other table games.

## Review (river-oaks-c2, at `daac74a`)

c2 confirmed that chess and checkers are unchanged apart from size lookups.
Four changes followed:
1. Landing marks no longer show during the regular's turn (`thinking` or not
   your turn).
2. The game-choice loops are scoped to `.table-game-choice [data-game]`. The
   board's own `data-game` was picking up `aria-pressed`. This was a latent
   bug from before Connect Four; Connect Four's CSS now relies on the board's
   attribute.
3. The shorter label: the journey measured the old one at two lines at 390 px.
4. The geometries and materials are hoisted and shared.

## Verification

- `node --test preview/tests/connect-four.test.js`: 6/6. The tests cover:
  - falling discs and turns;
  - full columns;
  - all four line directions;
  - the draw;
  - the regular taking a win, blocking a loss and favouring the centre;
  - the regular answering within its budget.
- `node --test preview/tests/plaza-connect-four.test.js`: 4/4. The tests cover:
  - the frame at every table;
  - discs stacked from the bottom;
  - columns facing the first player;
  - the adapter dropping a clicked cell into its column.
- `pnpm run verify`: `core: passed` (unit 2774 pass, 0 fail, 1 skipped; server
  421 pass, 134 skipped without Redis).
- `pnpm run test:experience plaza-connect-four`: passed (15 checks). The
  journey:
  - measures the seat action on one line at 390 px;
  - plays the opening;
  - watches that no landing slot shows while the regular thinks;
  - checks that only the choice buttons are pressed;
  - switches to chess and back;
  - wins with four in a row, and closes the sheet with Escape.
- Each review regression was checked against the old code. Restoring the old
  landing line fails the journey with `{"thinking":1,"marked":1}`. Restoring
  the unscoped loop fails it with "Only the game choices are pressed buttons".
- `plaza-chess` and `plaza-checkers` journeys: passed with the new label.

## Next step

PR and `pnpm run land`.
