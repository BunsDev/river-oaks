# The Salon Guide: a tutorial for every plaza table game — 2026-10-13

**Objective (Val):** "create a tutorial for all games and make it designed in a
luxurious manner". Val chose the **illustrated guide** over guided first games.

**Branch / worktree:** `feat/plaza-games-guide-20261013` in
`../river-oaks-games-guide-20261013`, from `2642eda`. The sheets belong to
river-oaks-c2, who agreed to these touch points:
- one import and one `attachGuide` line per sheet;
- the button sits inside `.table-game-header`, with `data-guide-*` attributes;
- storage is guarded;
- headers are checked at 1440 and 390 px;
- their six game journeys are rerun.

Jenga, wine pong, Spades and mancala will add their own entries once this is on
main.

## Change

- **`preview/src/salon-guide-content.js`** (pure, tested in node):
  - `GUIDE`: six games (chess, checkers, Connect Four, dominoes, Hearts,
    backgammon), with 4–5 pages each. Every game starts with taking a seat and
    ends with its keys.
  - `DIAGRAMS`: the positions the pictures show.
  - `figureMarkup` and `iconMarkup`: inline SVG boards, discs, tiles, cards and
    checkers, styled by the book's palette.
  - `guideStep`: paging, which carries into the next game.
  - `createGuideMemory`: guides read on this device. Every storage call is
    wrapped in try/catch.
- **`preview/src/salon-guide.js` and `.css`:**
  - **The book:** one modal dialog on `<body>`, outside the sheets, with:
    - a masthead and a double gold rule;
    - an index of gilded medallions;
    - pages numbered in roman chapters, with a drop cap;
    - a footer with Previous, diamond page dots, and Next (or the next game's
      name, or "Back to the table").
  - **Keys:** they stay in the book. Left and right turn pages, up and down
    move through the index, Home and End jump. Escape or a click outside
    closes it, and focus returns to the opener.
  - **Theme:** ivory and gold in the light theme, ink and gold in the dark
    (`:root[data-theme=dark]` tokens). Titles use the bundled Fraunces, text
    the bundled Outfit.
  - **CI-safe:** no backdrop blur and no endless animation.
  - **Phones** (≤700 px or a short window): one column, with the index as a row
    of medallions.
  - **`attachGuide(panel, id | () => id)`:** puts "How to play" in the sheet
    header before the close button.
    - On a game not yet read it reads "New here? How to play" and carries a
      gold dot (`data-guide-new`).
    - Under 520 px it becomes a 36 px "?" medallion.
    - For the table-games sheet, it follows `data-game`.
  - **`createGuideEntry()`:** a "Game guide" entry in Play & rides, after
    Photo mode.
- **Sheets:** one import and one line each.
  - `plaza-table-games.js`: `() => panel.dataset.game`.
  - `plaza-dominoes.js`, `plaza-hearts.js`, `plaza-backgammon.js`: their ids.
- **`main.js`:** the Play & rides entry.
- **Docs:** a paragraph in `docs/multiplayer.md`.

## Verification

- `node --test preview/tests/salon-guide.test.js`: 9/9.
  - **Pictures on the real rules:**
    - the chess back-rank mate is checkmate (`chess.outcome`), and the knight's
      marks equal its legal moves;
    - the checkers double jump is legal, and the only kind of move, because
      captures are compulsory;
    - the crowning makes a king;
    - the Connect Four diagonal is `winningLine`, and the drop lands on d3;
    - the hearts trick winner is `trickWinner`;
    - the backgammon 3–1 makes the five-point, the hit sends the blot to the
      bar, and the held point is closed.
  - **Text against the rules modules:** the first movers, the 40-move draw,
    28 tiles, 100-point matches, 7 tiles each with or without a boneyard,
    1 and 13 points, 26 to shoot the moon, the pass order, and 15 checkers.
  - **Paging and memory,** including storage that throws and saved data that
    isn't valid JSON.
- `pnpm run test:experience salon-guide`: passed, with 20 checks.
  - **Sheets and opening:** every sheet has the button. It's marked new before
    the close button at 1440 px, and the title and eyebrow stay one line each.
    The book opens modal on the sheet's game, with focus on it.
  - **Keys:** arrows turn the page. X and W, pressed in the book, reach neither
    the sheet nor the world. Escape closes only the book, and focus returns.
  - **Read marks and switching:** the new mark clears once a game is read, and
    the button follows a switch to Connect Four.
  - **Index and closing:** down the index moves to the next game. Every page
    of all six games fits without scrolling at 1440 × 900. "Back to the table"
    and a click outside both close the book.
  - **Elsewhere:** Play & rides opens the book, and it reads in the dark theme.
    At 390 px the sheet button is a 36 px medallion, and the book fits the
    phone.
- The sheets' own journeys pass with the button in their headers:
  `plaza-chess`, `plaza-checkers`, `plaza-connect-four`, `plaza-dominoes`,
  `plaza-hearts` and `plaza-backgammon`.
- `pnpm run verify`: `core: passed` (unit 2816 pass, 0 fail, 1 skipped).
- Screenshots in `output/playwright/salon-guide-*.png`: the light chess pages,
  the Connect Four win, the backgammon turn, Hearts in the dark theme, and the
  phone layouts.

## Next step

PR and `pnpm run land`. Afterwards c2 adds Jenga, wine pong, Spades and mancala
to `GUIDE`, with one `attachGuide` line in each sheet.
