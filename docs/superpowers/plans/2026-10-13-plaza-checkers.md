# Plaza games: checkers on the chess tables — 2026-10-13

**Objective:** after chess landed (#298), Val asked to "land the chess PR then
start checkers". Checkers is the first of the games Val listed for the plaza
(checkers, café cards or dominoes, more tables, Jenga, wine pong).

**Branch / worktree:** `feat/plaza-checkers-20261013` in
`../river-oaks-plaza-checkers-20261013`. It was started from #298's head
`5ba21fe` and then merged with main.

## Change

- **`preview/src/checkers-rules.js`** (new): American checkers (English draughts).
  - Men move one square diagonally forward; kings move one square in any diagonal
    direction.
  - Captures are compulsory, and a jumping piece completes its whole sequence.
    Jumped pieces stay on the board until the sequence ends, so none is taken twice.
  - A man crowned by reaching the far row stops there.
  - Dark moves first. A side with no move loses. A draw comes after forty moves
    each without a capture or a man moving, or on threefold repetition.
  - Squares use chess-rules.js numbering (a1 = 0). Playable squares are the inlay's
    dark ones, a1 included.
  - Notation is `c3-d4` for a step and `c3xe5xc7` for a jump sequence.
- **`preview/src/checkers-opponent.js`** (new): negamax with alpha-beta and
  iterative deepening.
  - It searches on through forced captures and stays within a node budget.
  - Evaluation: man 100, king 170, plus advancement, a guarded back row and the
    centre.
- **`preview/src/table-game-worker.js`**, renamed from `chess-opponent-worker.js`:
  one worker for both games. Each request names its game.
- **`preview/src/plaza-table-games.js` + `.css`**, renamed from `plaza-chess.*`:
  - Each game is now an adapter over its rules module: replay, pieces, moves,
    alerts, endings and the opponent's position.
  - The sheet gains a **Chess / Checkers** switch. Each table keeps one game per
    kind, and switching back resumes the other game.
  - The side choice reads White/Black or Dark/Light. Discs are drawn in CSS, and a
    king wears a crown.
  - Checkers status reads "A capture is compulsory." when one is.
  - When two jump sequences end on one square, the one that takes more is offered.
- **`preview/src/plaza-salon.js`:** the mirror draws checkers letters
  (`d`/`D`/`l`/`L`) as discs in one more InstancedMesh, with a king stacked two
  high. Dark, which moves first, sits where white does in chess.
- **`preview/src/main.js`:** `createPlazaTableGames`, plus a `__riverPlazaGames`
  debug hook replacing `__riverPlazaChess`.
- **Journeys:** `plaza-chess` uses the new names; `plaza-checkers` is new and
  registered after it.
- **Docs:** `docs/multiplayer.md`, seating section.

## Checks

| Check | Result |
|---|---|
| `checkers-rules.test.js` | 6/6. Perft from the opening matches the published counts 7 / 49 / 302 / 1469 / 7361 / 36768; one-off depth 7 gives 179740 and depth 8 gives 845931, both matching. Also covers the opening, compulsory and multi-jumps, crowning that stops, king moves, no-move and no-piece losses, the forty-move rule, repetition and refusals. |
| `checkers-opponent.test.js` | 4/4. It prefers the capture that takes more, does not step into a capture, is legal, budgeted and deterministic, and plays a forced capture at once. |
| `plaza-games-mirror.test.js` | Renamed. Adds discs: 24 at the opening, dark on a1 from chair 0, a king two discs high. |
| All `preview/tests` | 2706 pass, 0 fail |
| `pnpm run verify` (core) | Passed. Preview: 2706 pass, 1 skip. Server: 379 pass, 125 Redis-only skips. |
| Journeys | `plaza-checkers`, `plaza-salon`, `contextual-first-visit` and `hardware-acceleration` passed. `plaza-chess` caught a refactor regression: the alert was skipped once the game ended, so a mated king lost its check mark. The alert is now computed after the game ends too, and `plaza-chess` and `plaza-checkers` then passed on a rerun. |

## Gaps

- Practice only, as with chess: the game lives in one browser.
- A future shared mode needs the server to run `checkers-rules.js` too.
- When two jump sequences end on the same square with the same capture count,
  the first is played. A path picker would make the choice explicit.
