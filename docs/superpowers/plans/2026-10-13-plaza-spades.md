# Plaza games: Spades at the café — 2026-10-13

**Objective:** Val asked for the next table game after wine pong, and c2 chose
Spades. Val authorized landing it when green.

**Branch / worktree:** `feat/plaza-spades-20261013` in
`../river-oaks-plaza-spades-20261013`, from main f06cf7b (wine pong #323).

## Change

- **`preview/src/spades-rules.js`** (new, pure):
  - Partnerships 0+2 against 1+3, with bidding from the dealer's left (0 is nil).
  - Spades are trumps and can't be led until broken, unless a hand holds only
    spades.
  - Trick winner: the highest spade, or else the highest card of the suit led.
  - Scoring: 10 a trick bid plus a point a bag, minus 10 a trick bid when set,
    nil ±100 (a nil bidder's tricks are bags), and 100 off for every tenth bag.
  - Game to 500, or a loss at −200.
  - Hands replay exactly from their seed, dealer and moves.
- **`preview/src/spades-opponent.js`** (new):
  - Bidding counts aces, guarded kings, high and long spades and ruffable short
    suits, and bids nil on a hand with nothing high.
  - Play wins cheaply while the bid is needed and ducks once it's made. It also
    covers a partner's nil and keeps its own.
  - Over 400 seeds: average combined bid 11.7, 83% of contracts made, about 0.9
    bags per partnership per hand, and 27 of 32 nils made.
- **`preview/src/plaza-spades.js` + `.css`** (new): the café sheet.
  - The Hearts card art, trick cross and hand bar, with `cardArt` now exported
    from plaza-hearts.js.
  - Bids from Nil to 13 on your turn, and a chip per seat for bid and tricks.
  - Partnership scores with bags. The dealer rotates each hand.
  - The café switch, and focus kept across redraws.
- **Café switch:** Dominoes / Hearts / Spades in all three sheets.
  - `main.js` keeps a `cafeGames()` map.
  - `switchCafe` clears the table only when the pieces change (tiles or cards).
  - One café provider: `cafeGames()[cafeGame]`.
- **Salon Guide** (river-oaks-3b's #321 format): a `spades` entry with five
  pages, a ♠ icon, and the pictures `spades-bids`, `spades-trump` and
  `spades-score`. A test checks the pictures against the real rules (the trump
  takes the trick; bid 7, took 8 scores 71).
- **Journeys:** `plaza-spades` (new).
  - `plaza-hearts` and the new journey now wait for the X relabel instead of
    reading it at once. That read was flaky: it failed one of two runs on
    unchanged code, and passed 3/3 after.
- **Docs:** `docs/multiplayer.md`.

## Checks

| Check | Result |
|---|---|
| `spades.test.js` | 6/6. Deal and bidding order; leads, following and trumps; the trick winner; scoring (made with bags, set, nil made and failed, the bag penalty, game end); regulars legal and deterministic over six seeds up to `2 ** 32 - 1` with exact replay; a nil kept by ducking. |
| `salon-guide.test.js` | Passes with the spades entry and its picture test. |
| All `preview/tests` | 2873 pass, 0 fail |
| Journeys | `plaza-spades` passed: switch from dominoes; bid through the bid buttons; the regulars' bids; 13 cards played through the hand; the table's backs; partnership scores carry the hand; the dealer moves; switch to Hearts; Escape; stand. `plaza-dominoes` passed, and `plaza-hearts` passed 3/3 after the relabel wait. |

## Gaps

- Practice only.
- No blind nil.
- The regulars play by heuristics, without searching ahead.
