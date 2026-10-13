# Plaza games: liar's dice at the café — 2026-10-13

**Objective:** liar's dice, from c2's queue (Val authorized landing when green; Val
said "pls proceed", so it was built while cribbage and darts landed).

**Branch / worktree:** `feat/plaza-liars-dice-20261013` in
`../river-oaks-plaza-liars-dice-20261013`, from main 8451204.

## Change

- **`preview/src/liars-dice-rules.js`** (new, pure):
  - Four players with five dice each, rolled from a seed per round and player
    (`Math.imul`).
  - Bids on faces 2–6, with ones wild, and each bid must raise the last.
  - On a call, the cups are counted: a good bid costs the caller a die, a bad
    one the bidder. The loser opens the next round, players out of dice drop
    out, and the last with dice wins.
  - Games replay exactly.
- **`preview/src/liars-dice-opponent.js`** (new): reasons from its own cup (its
  own matches plus a third of the unseen dice).
  - Calls when a bid is well beyond that, with seeded nerve.
  - Otherwise raises on the face it holds most of.
- **`preview/src/plaza-salon.js`:** cups and ivory dice on the café table
  (`userData.dice`).
  - The pips are painted per face and each die is turned with its value up.
  - Cups only for players still in, lifted on a call.
- **`preview/src/plaza-liars-dice.js` + `.css`** (new): the sheet.
  - Dice counts, your dice as SVG pips, and the round's bids.
  - A bid builder: count stepper, face buttons, Bid, and Liar!
  - The reveal with matching dice lit. The regulars' turns pause on a reveal.
- **The café switch:** four games (Dominoes / Hearts / Spades / Liar's dice) in
  every café sheet. `main.js` maps `dice` to its own table pieces.
- **Salon Guide:** a liar's dice chapter with bid and call pictures. A test
  checks them against `countOf`.
- **Journeys:** `plaza-liars-dice` (new). Docs: `docs/multiplayer.md`.

## Checks

| Check | Result |
|---|---|
| `liars-dice.test.js` | 4/4. Cups, raises and wild ones; a call's loser either way; players dropping out, the last standing, and replay over six seeds up to `2 ** 32 - 1`; the regulars call the impossible and bid what they hold. |
| `plaza-games-mirror.test.js` | Cups for players still in; on a call, dice with their value up. |
| `salon-guide.test.js` | 16/16. |
| All `preview/tests` | Pass, 0 fail |
| Journeys | `plaza-liars-dice` passed: the four-game switch, four cups, opening through the stepper and faces, the regulars, a call that lifts the cups and costs a die, the table's dice, switching back clears them, stand. `plaza-dominoes` and `plaza-hearts` passed with the four-game switch. The rerun after the SVG dice also passed. |

## Gaps

- Practice only.
- No bids on ones.
- The regulars don't bluff deliberately beyond their seeded nerve.
