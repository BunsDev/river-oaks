# Plaza games: xiangqi in the grove — 2026-10-13

**Objective:** xiangqi (Chinese chess), from c2's queue. Val authorized landing it
when green and said "pls proceed", so it was built while the earlier queued games
landed. It plays on the grove table's switch rather than a new table.

**Branch / worktree:** `feat/plaza-xiangqi-20261013` in
`../river-oaks-plaza-xiangqi-20261013`, from main 9598392 (darts #336).

## Change

- **`preview/src/xiangqi-rules.js`** (new, pure):
  - The 9×10 board, with the river and the palaces.
  - Every piece's moves: a hobbled horse, the elephant's eye and the river,
    cannons capturing over one screen, and soldiers turning aside once across.
  - The flying-general rule, and no move that leaves your general attacked.
  - Having no legal move loses, whether in check or stalemated.
  - The plaza's simplification of the chasing rules: a third repetition, or 120
    moves without a capture, is a draw.
  - Moves are written like `h2e2`, and games replay exactly.
- **`preview/src/xiangqi-opponent.js`** (new): an iterative-deepening negamax
  with alpha-beta and capture quiescence under a node budget. The evaluation is
  material, with bonuses for soldiers across the river, central horses and
  cannons, and advanced chariots.
  - Self-play reaches checkmate in 84 moves, at about 0.2 s a reply with a
    budget of 20,000 nodes.
  - It runs in `table-game-worker.js`, with a main-thread fallback at a third of
    the budget.
- **`preview/src/plaza-salon-plan.js` / `plaza-salon.js`:** `XIANGQI` and
  `xiangqiSpot()`. The table board carries its lines, river and palace crosses.
  The 32 disc pieces are one InstancedMesh per kind, with the character painted
  on top where there is a document. Red faces red's chair, and the board is
  hidden until it is the grove table's game.
- **`preview/src/plaza-xiangqi.js` + `.css`** (new): the seated sheet.
  - The board from your side, in characters, with English labels for screen
    readers.
  - Choose a piece, and its moves are dotted (captures ringed). The last move
    is outlined, and a general in check glows.
  - The arrow keys move between points, and Enter chooses.
  - Play as red or black, against the regular or pass and play.
- **The grove switch:** after merging Chinese checkers, every grove sheet offers Mancala, Go, Chinese checkers and Xiangqi. `main.js` adds it
  to `groveGames()` and swaps the boards. The `__riverPlazaXiangqi` debug hook
  (`reset()`).
- **Salon Guide:** a xiangqi chapter after Go. Its horse and cannon pictures
  are checked against the rules.
- **Journeys:** `plaza-xiangqi` (new). Docs: `docs/multiplayer.md`.

## Checks

| Check | Result |
|---|---|
| `xiangqi.test.js` | 6/6. The opening (44 moves), hobbled horses, blocked elephants, soldiers over the river, palaces, facing generals, cannon screens, answering check, checkmate and stalemate both losing, replay and repetition, and the regular taking a hanging chariot, finding mate in one and replying deterministically. |
| `plaza-games-mirror.test.js` | 14/14. 32 pieces, each side toward its chair, the board turning with red's chair, a moved cannon, every point on the board, and the mancala board swapping out. |
| `salon-guide.test.js` | The horse and cannon pictures follow the rules. |
| All `preview/tests` | 2942 pass, 0 fail on the branch; 2969 pass, 0 fail after merging liar's dice, shuffleboard, Yacht and Chinese checkers |
| Journeys | `plaza-xiangqi` passed. It sits at the grove table and X opens mancala. The switch sets out the xiangqi board (mancala and goban away, 32 pieces). Then it covers: Enter choosing the cannon and marking its moves (the capture over the screen too), the arrow keys, a click choosing the other cannon, a click playing h2e2 on the sheet and the table, the layout fit, the regular's reply from the worker, focus kept in the board, Escape, X reopening xiangqi where it was, the switch back, and standing up. After merging Chinese checkers (the four-way grove switch), `plaza-xiangqi` (now also switching straight to Chinese checkers and back to mancala), `plaza-chinese-checkers`, `plaza-go` and `plaza-mancala` all passed. Before that merge, `plaza-mancala` had failed at standing up, at the darts line; Chinese checkers' journey fix covers it |

## Gaps

- Practice only, like the other plaza games.
- The perpetual-check and chasing rules are simplified to a draw on repetition.
- The characters need a CJK font. Without one, the sheet still names every piece
  for screen readers, and the guide lists them in English.
