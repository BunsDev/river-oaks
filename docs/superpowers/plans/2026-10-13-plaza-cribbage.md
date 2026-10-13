# Plaza games: cribbage at the walnut table — 2026-10-13

**Objective:** cribbage, from c2's queue (Val authorized landing when green; Val
said "pls proceed", so it started while Go was landing).

**Branch / worktree:** `feat/plaza-cribbage-20261013` in
`../river-oaks-plaza-cribbage-20261013`, from main 12eb954.

## Change

- **`preview/src/cribbage-rules.js`** (new, pure): two-player cribbage to 121.
  - The deal, discards to the dealer's crib, and the starter (his heels).
  - The play: fifteen and thirty-one, pairs and pair royals, runs, go and last
    card. The count resets after a go, led by the other player.
  - The show: pone, then the dealer, then the crib. Fifteens, pairs, runs
    counted with multiplicity, flushes (the crib needs all five) and nobs.
  - The game ends the moment someone reaches 121. The deal alternates.
  - Games replay exactly from their seed and moves.
- **`preview/src/cribbage-opponent.js`** (new):
  - The discard is the best of fifteen splits, by the hand's average show over
    every starter, plus or minus the crib's worth.
  - Play takes the most points now, avoids leaving 5 or 21, and otherwise lays
    low.
  - A whole self-play game takes about 55 ms.
- **`preview/src/plaza-cribbage.js` + `.css`** (new): the card sheet.
  - The Hearts card art.
  - Score chips with tracks to 121, the starter and the crib beside the pile
    and the count, and the show's breakdown.
  - Laying away two, Next hand, and New game.
- **Walnut table switch:** Backgammon / Cribbage, in both sheets.
  - `main.js` keeps `walnutGames()` and `switchWalnut()`.
  - `plaza-salon.js` adds a maple pegging board laid over the backgammon board,
    with 240 holes and two pegs, and a `setVisible` for the backgammon checkers.
- **Salon Guide:** a cribbage chapter with crib, play and show pictures. A test
  checks them against the rules: 7+8 makes fifteen; 5 5 10 J♣ with a 5♣ starter
  makes 21.
- **Journeys:** `plaza-cribbage` (new).

## Checks

| Check | Result |
|---|---|
| `cribbage.test.js` | 6/6. The show (29, double-double run, a run with fifteens, flushes in hand and crib, nobs, nineteen); the play; a full hand and the deal passing; his heels; whole games to 121 over five seeds with exact replay; the regular's discard and fifteen. |
| `plaza-games-mirror.test.js` | The pegging board replaces the checkers, and the pegs follow the scores from either chair. |
| `salon-guide.test.js` | 14/14, including the cribbage pictures. |
| All `preview/tests` | 2910 pass, 0 fail |
| Journeys | `plaza-cribbage` passed: the switch swaps sheets and boards; two cards laid away; the hand played through the buttons to the show (3 entries); pegs at the scores; Next hand passes the deal; switching back; Escape; stand. `plaza-backgammon` passed. |

## Gaps

- Practice against the regular only: hidden hands make pass-and-play unsuited.
- No "muggins".
- Pegs are a single front peg each, with no back peg.
