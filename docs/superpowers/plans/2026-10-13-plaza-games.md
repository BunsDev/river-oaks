# Plaza games, phase 1: chess at the plaza tables — 2026-10-13

**Objective:** Val pointed at the Dior–Toulouse plaza (the stone chess tables with
pink armchairs from #270) and asked to "add some games in the scenery". Asked to
choose, Val picked:
- **Phase 1:** solo chess first, opened with **X** and a "Play chess" action
  while seated at a chess chair.
- **Later:** checkers on the chess tables, cards or dominoes at the café table,
  more game tables, Jenga and wine pong.

**Branch / worktree:** `feat/plaza-chess-20261013` in
`../river-oaks-plaza-games-20261013`, from `9d37efb`.

## What existed

- Two travertine chess tables (`chess-west`, `chess-east`), each with two armchairs.
  Chair 0 is east of its table and chair 1 west. Every chair is a shared bench
  seat, `bench:plaza-salon-chess-<side>-<n>`.
- The boards were decoration: 14 hashed post-and-ball pieces per table, spaced
  0.072 m apart on 0.068 m cells.
- The inlay put a dark square at each player's right hand. Working from
  BoxGeometry's top-face UVs (u along +x, v = 0 at +z, DataTexture rows unflipped,
  all confirmed in three.js) and the table's quarter turn, the near-right corner
  was dark from both chairs.
- No chess library was a dependency.

## Change

- **`preview/src/chess-rules.js`** (new): pure rules with no dependencies.
  - Legal moves, castling (not through check), en passant, promotion.
  - Check, mate, stalemate, the fifty-move rule, threefold repetition and
    insufficient material.
  - FEN in and out, SAN and UCI, and a checked `replay`.
- **`preview/src/chess-opponent.js` + `chess-opponent-worker.js`** (new): the
  "plaza regular".
  - Iterative-deepening negamax with alpha-beta, a capture-only quiescence search,
    MVV-LVA ordering and the simplified piece-square evaluation.
  - A node budget (30k in play) and repetition avoidance.
  - Deterministic. It runs in a module worker, and each request carries an id so a
    late answer is dropped.
- **`preview/src/plaza-salon-plan.js`:** `CHESS_CELL_M`, `chessCellIsDark`,
  `chessCell(square, whiteChair)`, `chessCellOffset`, `chessCellPosition` and
  `chessSeat(buildId)`. Dark cells are those with (i + j) even, so a1 is dark and h1
  light for whichever chair white takes.
- **`preview/src/plaza-salon.js`:**
  - The inlay follows `chessCellIsDark`.
  - The hashed posts are replaced by Staunton-style pieces built from primitives:
    six InstancedMeshes with ivory and ebony as instance colours, so a full set on
    both tables costs six draw calls.
  - `group.userData.chess.show(tableId, board, whiteChair)` mirrors a position.
    Pieces face the other player, and idle tables show the opening.
- **`preview/src/plaza-chess.js` + `.css`** (new): the game and its board sheet.
  - The sheet is a non-modal glass panel beside the table, so the 3D board stays in
    view. Like the HUD sheets after #297, the frame never scrolls; only its body
    may, on a small window.
  - The board is a keyboard grid with a roving tab stop: arrows move, Enter picks.
    Legal targets, captures, the last move and check are marked.
  - The panel also has a promotion chooser, an algebraic move list, take-back, a
    "Plaza regular / Pass and play" toggle, a choice of white or black, and new
    game.
  - Each table keeps its game while you are away, and the 3D pieces mirror every
    move.
  - Escape or X closes the board, and standing up puts it away.
- **`preview/src/walking-ui.js` / `contextual-action.js`:** a `#walking-play`
  action on X, primary when seated at a game table. Z still stands.
- **`preview/src/main.js`:** keeps the plaza group, creates the game, and adds a
  `__riverPlazaChess` debug hook (dev and `?motion-debug=1` only).
- **`preview/e2e/plaza-chess.js`** (new, in the experience suite after
  `plaza-salon`) and `docs/multiplayer.md` (seating section).

## Checks

| Check | Result |
|---|---|
| `chess-rules.test.js`: perft for start (20/400/8902), Kiwipete (48/2039), en-passant pins (14/191/2812), promotions (6/264), discovered checks (44/1486); FEN, castling, en passant, promotion, all endings, SAN, refusals | 11/11 pass. One-off depth-3 runs also match: Kiwipete 97862, position 5 62379, position 4 9467. |
| `chess-opponent.test.js`: mate in one, takes a hung queen, moves its attacked queen to a square no pawn covers, budget and determinism, finished games, repetition | 5/5 |
| `plaza-salon.test.js`: from every chair, h1 is the near-right corner and light, and a1 is dark | pass (7/7 in the file) |
| `plaza-chess-mirror.test.js`: builds the real plaza group. Opening counts p32 r8 n8 b8 q4 k4; a shown game moves only its table's pieces; pieces face the opponent from either chair | 3/3 |
| `contextual-action.test.js`: Play is primary when seated at a game table | pass |
| `plaza-chess` journey: Play offered only at a chess chair; X opens a game; keyboard e2-e4 answered by the regular and mirrored on the table; illegal move refused; take-back; pass-and-play Scholar's mate marked; Escape and reopen keep the game; 390×844 fits; standing up closes it | Pass |
| Phone layout | After resizing an open panel, an `aspect-ratio` board misreported its height and overlapped the status. The board now has an explicit square size. |

## Gaps and next phases

- **Practice only.** The game lives in one browser, so other visitors see the
  opening position.
- **Phase 2:** shared two-player tables through the town.
  - A table-session command validated on the server with the shared
    `chess-rules.js`.
  - A `sessionId` plus `ply` late-move fence.
  - Checkpoint version 6. This is one-way, so rollback needs care.
- **Phase 3, the games Val listed:**
  - Checkers on the chess tables.
  - Cards or dominoes at the café table. Hidden hands must be dealt by the server
    and never put in the shared snapshot.
  - More game tables.
  - Jenga and wine pong. These are physical games that need their own interaction
    design.
- **Not addressed:** the seated camera looks over the avatar's shoulder, so the
  table is mostly hidden behind the body. The jagged black shadow wedges on the
  plaza paving appear on `main` too.
