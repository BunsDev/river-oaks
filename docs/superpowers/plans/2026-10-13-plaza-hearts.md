# Plaza games: Hearts at the café table — 2026-10-13

**Objective:** Val chose "cards at the café" as the table game after dominoes:
Hearts with three plaza regulars at the round café table.

**Branch / worktree:** `feat/plaza-hearts-20261013` in
`../river-oaks-plaza-hearts-20261013`. It was started from the dominoes branch
(#304) and is merged with main once #304 lands.

## Change

- **`preview/src/seeded-random.js`** (new): the Mulberry32 shuffle, shared by
  dominoes (moved out of `dominoes-rules.js`, so the deals are unchanged) and Hearts.
- **`preview/src/hearts-rules.js`** (new): standard four-player Hearts.
  - **Passing:** three cards left, then right, then across; every fourth hand holds.
  - **Opening trick:** the 2♣ leads. Players must follow suit, and no points may
    be played on the first trick unless a hand holds nothing else.
  - **Hearts:** they cannot be led until broken, unless a hand holds only hearts.
  - **Tricks:** the highest card of the suit led takes the trick and leads next.
  - **Scoring:** each heart 1 and the Q♠ 13. Shooting the moon gives the shooter 0
    and the others 26. The game is to 100, lowest score wins.
  - **Records:** seeded deals that replay exactly from their moves (`pass:..` or a
    card), and `publicView`: the hand, the trick, cards seen, passed cards, points
    taken and known voids.
- **`preview/src/hearts-opponent.js`** (new): the regulars, working from that view.
  - **Passing:** the Q♠ when short of low spades, the A♠ and K♠ when they would be
    left to catch her, then high hearts and cards from short suits.
  - **Playing:** they duck under the winning card and save the Q♠ for a higher
    spade. When void they shed the queen, then high spades while she is out, then
    hearts.
  - They never lead the queen, and never lead a high spade while she is out.
  - Deterministic.
- **`preview/src/plaza-salon.js`:** cards on the round table.
  - Up to four face-up trick cards lie before their players. Their faces come from
    a 13×4 canvas atlas drawn in the browser; Node tests get a plain face.
  - Hands and won tricks are face-down stacks, all backs in one InstancedMesh.
- **`preview/src/plaza-hearts.js` + `.css`** (new): the Hearts sheet, inside the
  table-games frame.
  - Scores with points taken this hand, and the trick as a cross (you at the foot).
    The last trick shows with its taker marked.
  - Your hand as a toolbar of SVG cards with legal cards raised. You choose three
    to pass.
  - Next hand and New game.
  - The regulars play 0.65 s apart.
- **`preview/src/plaza-dominoes.js` and `main.js`:** a **Dominoes / Hearts**
  switch.
  - `main.js` keeps the café game last played (X reopens it) and clears the other
    game's pieces from the table when you switch.
  - Both sheets can close without returning focus to the world.
  - A `__riverPlazaHearts` debug hook (dev and `?motion-debug=1` only).
- **Journey:** `preview/e2e/plaza-hearts.js`, registered after `plaza-dominoes`.
- **Docs:** `docs/multiplayer.md`.

## Checks

| Check | Result |
|---|---|
| `hearts-rules.test.js` | 8/8. Covers the deck and points; deals, seeds, pass directions and the hold hand; passing and the 2♣ lead; following, the first-trick rule and forced points; leading hearts; trick winner and next lead; scoring over 40 seeded hands plus a constructed moon; replay and the public view. A one-off run of 800 random hands all scored 26 or 78. |
| `hearts-opponent.test.js` | 5/5. The first run caught a passing gap: the bot kept the A♠ and K♠ while passing the queen away. |
| `plaza-games-mirror.test.js` | Adds the cards: the trick before chair 2, the stacks, and clearing. |
| All `preview/tests` | 2733 pass, 0 fail |
| Journeys | `plaza-hearts`, `plaza-dominoes` (see below) |

## Gaps

- Practice only, like the other plaza games. Shared tables need the server to deal
  and keep hands out of the shared snapshot.
- The regulars never try to shoot the moon, and they do not track it to stop a
  shooter.
- No Jack-of-diamonds or other house variants.
