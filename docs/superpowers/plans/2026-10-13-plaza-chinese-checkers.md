# Plaza games: Chinese checkers in the grove — 2026-10-13

**Objective:** Chinese checkers (Sternhalma) for two, from c2's queue. Val
authorized landing it when green, and said "pls proceed", so it was built while
the earlier queued games landed.

**Branch / worktree:** `feat/plaza-chinese-checkers-20261013` in
`../river-oaks-plaza-chinese-checkers-20261013`, from main bd3e534 (#337).

## Change

- **`preview/src/chinese-checkers-rules.js`** (new, pure):
  - The 121-hole star: the union of two big triangles in axial coordinates.
  - Each player has ten marbles in the point nearest them, and their goal is
    the opposite point.
  - A move is a step or a chain of hops over any marble. `movesFrom()` finds
    each reachable hole by its shortest chain, with the moving marble lifted, so
    a chain never hops over the hole it left.
  - The first to fill the far point wins. The other side's stragglers there
    count, if one of the player's own marbles is among them.
  - After 400 moves the player with more marbles home wins, or it is a draw.
  - Games replay exactly from their paths (`96-74-52`).
- **`preview/src/chinese-checkers-opponent.js`** (new):
  - The regular scores each move by the rows it gains, plus half the best gain
    it sets up next. It nudges its last marble forward and stays near the
    middle, with a seeded tie-break.
  - Regular-versus-regular games finish in 64–93 moves, at about 0.2 ms a move.
- **`preview/src/plaza-salon-plan.js`:** `STAR` and `starSpot()`. The first
  player's point faces their chair.
- **`preview/src/plaza-salon.js`:** a round maple board with 121 holes and
  twenty glass marbles (red and blue), hidden until it is the grove table's
  game.
- **`preview/src/plaza-chinese-checkers.js` + `.css`** (new): the seated sheet.
  - The star board from your point, at the bottom.
  - Choose a marble, and the holes it can reach are marked. A hop chain plays
    leg by leg on the sheet and on the table.
  - The arrow keys move between holes, and Enter chooses.
  - A tally of marbles home for each side.
- **The grove switch:** Mancala, Go and Chinese checkers in all three sheets.
  `main.js` adds it to `groveGames()` and swaps the boards. The
  `__riverPlazaChineseCheckers` debug hook (`reset()`).
- **Salon Guide:** a Chinese checkers chapter after Go. Its hop picture is
  checked against `movesFrom()`.
- **Journeys:** `plaza-chinese-checkers` (new). Docs: `docs/multiplayer.md`.

## Checks

| Check | Result |
|---|---|
| `chinese-checkers.test.js` | 5/5. The star and its points, steps and hop chains (never back over its own hole), illegal moves, filling the point (with a straggler), exact replay, and regulars racing to a finish over four seeds. |
| `plaza-games-mirror.test.js` | 13/13. Each point faces its player's chair, the board turns with the chair, a moved marble stands on its new hole, every hole is on the board, and the mancala board swaps out. |
| `salon-guide.test.js` | The hop picture is the shortest chain there, over blue then red. |
| All `preview/tests` | 2935 pass, 0 fail on the branch; 2961 pass, 0 fail after merging darts, liar's dice, shuffleboard and Yacht |
| Journeys | `plaza-chinese-checkers` passed. It sits at the grove table and X opens mancala. The switch sets out the star (mancala board and goban away, 20 marbles). Then it covers: Enter choosing a marble and marking the hop, the arrow keys, clicking the hop's hole (on the sheet and the table), the layout fit, the regular's reply, focus kept in the board, Escape, X reopening Chinese checkers where it was, the switch back, and standing up. `plaza-go` and `plaza-mancala` passed with the three-way switch, and again with darts on main and the stand-up fix below. |

## Found on the way

Darts (#336) put its throwing line within reach of the spots the server picks
when a player stands up from the grove chairs (and some chess chairs). There,
**Play darts** is rightly offered, so the grove journeys' "standing up leaves the
grove table" check failed with the play button showing darts. Hosted CI doesn't
run the plaza journeys, so #336 went green. The mancala, Go and Chinese checkers
journeys now check that the grove table no longer offers its own games.

## Gaps

- Practice only, like the other plaza games.
- Two players only (no three- or six-player star).
