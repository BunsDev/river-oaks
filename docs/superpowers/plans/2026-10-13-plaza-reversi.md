# Reversi at the plaza chess tables — 2026-10-13

**Objective:** Reversi (Othello) at the plaza chess tables. It was queued for
river-oaks-c2 and handed to river-oaks-3b at Val's direction ("yes, take Reversi
and morris"). Val confirmed with 3b: land when green.

**Branch / worktree:** `feat/plaza-reversi-20261013` in
`../river-oaks-reversi-20261013`, from `5725d38`.

## Change

- **Rules** (`preview/src/reversi-rules.js`):
  - 8×8, with squares as in `chess-rules.js`; black ('d') moves first from the
    four centre discs.
  - A placement must outflank at least one straight line, and every
    outflanked line turns.
  - A side with no move passes on its own. The turn stays, and `passed` is
    set.
  - The game ends when neither side can move. The reason reads as the count
    ("36 to 28", "32 discs each").
  - `mobility` counts placements without working out the flips.
- **Opponent** (`preview/src/reversi-opponent.js`):
  - negamax with alpha-beta and iterative deepening under a node budget;
  - corner-weighted squares, with the squares beside an occupied corner
    neutralised;
  - mobility, and exact disc counts at the end;
  - the sign flips only when the turn changes, so passes stay correct;
  - half the sheet's budget in the worker, about 0.3 s per move on average.
- **Sheet adapter** (`preview/src/reversi-adapter.js`):
  - drop-style, with one click on a marked square;
  - the status keeps the count ("Black 2 · White 2.") and says who passed;
  - it ends "No moves left, 36 to 28."
- **`plaza-table-games.js`:**
  - Reversi joins `TABLE_GAMES`.
  - After the regular moves, the sheet asks it again, because in Reversi it
    moves twice when you pass. A strictly alternating game returns at once.
  - Take back steps back until it is your turn (a loop), past a pass.
- **The table** (`plaza-salon.js`): the chess mirror's discs (`d`/`l` letters)
  draw Reversi with no new meshes. The disc capacity rises from 48 to 64 per
  table.
- **Worker:** a `reversi` entry. **CSS:** a green baize board and flat discs.
- **The game switch** (`.table-game-choice`) is a grid of as many columns as
  fit. With a fourth game, a flex row spilled the last button out of the
  1440 px side column; it is now 2×2 there and adapts on phones.
- **Salon Guide:** a Reversi chapter after Connect Four (taking a seat, the aim,
  a turn, passing and corners, at the table), with three pictures played on the
  rules. **Docs:** `docs/multiplayer.md`.

## Verification

- `node --test preview/tests/reversi.test.js`: 5/5.
  - the opening and Othello perft at depths 1–6 (4, 12, 56, 244, 1396, 8200);
    depth 7, 55092, was checked by hand;
  - flips in every direction and only closed lines;
  - a real pass from a random game; outcome and score text;
  - the adapter's drop, count and pass alert;
  - the regular takes a corner, answers within its budget and plays only legal
    moves;
  - a board with empties where neither side can move is a result, not an
    endless pass.
- `node --test preview/tests/salon-guide.test.js`: 12/12. The opening marks,
  the e4 placement and the a1 corner are all played on the rules.
- `pnpm run verify`: `core: passed` (unit 2895 pass, 0 fail, 1 skipped).
- `pnpm run test:experience plaza-reversi`: passed, with 13 checks.
  - **Setup:** the switch fits its column at 1440 px; a new game as black reads
    "Black 2 · White 2. Your move, black."; c4, d3, e6 and f5 are marked; and
    the table shows the four centre discs with the chess pieces put away.
  - **Play:** d3 turns d4 and the regular answers; the table follows and the
    count is kept.
  - **Switching:** chess and back resumes the game on the table.
  - **A full game:** a nine-move pass-and-play game ends "No moves left, 13 to
    0. Black wins."
  - **Closing:** the switch fits at 390 px, and Escape puts the board away.
- `plaza-chess`, `plaza-checkers` and `plaza-connect-four` journeys: passed
  with the grid switch and the 64-disc mirror.

## Next step

PR and `pnpm run land`; Val confirmed land-when-green with 3b.
