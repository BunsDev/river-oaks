# Plaza games: dominoes at the café table — 2026-10-13

**Objective:** after checkers, Val asked to "land it then start dominoes at the
café table". The round café table (four armchairs) gets a dominoes game against
the plaza regulars.

**Branch / worktree:** `feat/plaza-dominoes-20261013` in
`../river-oaks-plaza-dominoes-20261013`. It was started from the checkers branch
head (#299) and merged with main once #299 landed.

## Change

- **`preview/src/dominoes-rules.js`** (new):
  - A double-six set of 28 tiles.
  - A seeded deal (Mulberry32), so a round replays exactly from its seed and moves.
  - **Two players: the draw game.** Seven tiles each and a 14-tile boneyard. You
    draw until a tile fits; with an empty boneyard you pass.
  - **Four players: the block game.** Seven each and no boneyard.
  - The highest double leads (the heaviest tile when no double is dealt), and the
    first move must play it.
  - When both ends show one value, only the left end is offered.
  - **Playing out:** the player scores the pips left in every other hand.
  - **Blocked:** when everyone passes in turn, the lightest hand scores the others'
    pips. A tie for lightest scores nothing.
  - Notation is `L:3-5` / `R:3-5`, `draw` and `pass`. `publicView` gives a player
    their hand, the line, the hand sizes and which numbers each player has failed
    to follow, taken from the ends recorded at each draw or pass.
- **`preview/src/dominoes-opponent.js`** (new): the regulars see only that public
  view.
  - They shed heavy tiles and doubles, keep tiles that still fit an open end, and
    play onto numbers the next player is known to lack.
  - Deterministic.
- **`preview/src/plaza-salon-plan.js`:** `cafeSeat`, `cafeChairAngle` and
  `dominoLine`.
  - The line runs on a 0.4 m arc around the centrepiece, starting in front of your
    chair, with doubles laid crosswise.
- **`preview/src/plaza-salon.js`:**
  - The tiles are one InstancedMesh, and the pips plus centre divider a second.
  - The line lies face up. Each hand stands 0.64 m out at the table edge before
    its player's chair.
  - Only your hand shows its pips, so no camera angle reveals a regular's tiles.
- **`preview/src/plaza-dominoes.js` + `.css`** (new): the café sheet, inside the
  table-games glass frame.
  - Scores, the line with its open ends, the other hands as counts and the
    boneyard.
  - Your hand as a toolbar of SVG tiles. Arrow keys move between tiles, and a
    left/right chooser appears when a tile fits both ends.
  - Draw, Pass, Next round, 2 or 4 players, and Start over / New match.
  - The regulars play in turn, 0.6 s apart, fenced by a generation counter.
  - Standing up or changing chairs closes it.
- **`preview/src/plaza-table-games.css`:** the Play & rides dock hides for any
  open `.table-game-panel`.
- **`preview/src/main.js`:**
  - X plays chess or checkers at a chess chair and dominoes at a café chair.
  - A `__riverPlazaDominoes` debug hook can `deal(seed, players)` (dev and
    `?motion-debug=1` only).
- **Journey:** `preview/e2e/plaza-dominoes.js`, registered after `plaza-checkers`.
  The chess and checkers journeys now scope `.table-game-close` to their own sheet.
- **Docs:** `docs/multiplayer.md`.

## Checks

| Check | Result |
|---|---|
| `dominoes-rules.test.js` | 9/9 |
| What it covers | The set (28 tiles, 168 pips); deals and seeds; the double lead; matching and turning; draw and pass; playing out; blocked and tie; replay of 120 rounds; the public view. Also a one-off playout of 1000 random rounds (2 and 4 players): all end, and all 28 tiles are always accounted for. |
| `dominoes-opponent.test.js` | 3/3: plays onto a number the next player lacks, sheds the heavier tile, and only legal and deterministic moves across 30 four-player rounds |
| `plaza-games-mirror.test.js` | The line runs on its arc, hands stand at their chairs, and pip counts show only your hand. Float32 instance matrices need a 1 mm tolerance at world scale. |
| All `preview/tests` | 2719 pass, 0 fail |
| `plaza-dominoes` journey | Pass. Sit at a café chair and X opens the table. A seeded round where you lead plays to its end through the real controls (fitting tiles, the end choice, Draw and Pass), with the result and scores reported. The table mirrors the line and hands. Four players gives a block-game match. Escape closes it, and standing up leaves. |
| `plaza-chess`, `plaza-checkers`, `plaza-salon` | Pass |

## Gaps

- Practice only: the match lives in one browser. Shared tables need server-side
  dealing so hidden hands never reach the shared snapshot.
- Rounds are scored by the winner's take only. Common variants (all-fives,
  subtracting your own hand when blocked) are not offered.
- The seated camera does not look down at the tiles.
