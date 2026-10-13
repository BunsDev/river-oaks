# Guided first games at the plaza tables — 2026-10-13

**Objective (Val):** "please proceed with recommendations". One recommendation was
guided first games: a Lesson mode in the chess-table sheet that plays a short scripted
game of each kind.

**Agreed with c2**, who owns `plaza-table-games.js`. Their requests:
- keep the `createWorkerThinker` export and the worker's `GAMES` map shape;
- namespace the new attributes (`data-lesson-hint`, `data-lesson-step`);
- put the scripts in a pure module that unit tests replay through the adapters;
- leave practice games untouched.

**Branch / worktree:** `feat/table-game-lessons-20261013` in
`../river-oaks-lessons-20261013`. Register task: `plaza-table-lessons`.

## Files owned

- `preview/src/table-game-lessons.js` (new, pure): `LESSONS` (four or five steps per
  kind, each `{ move, reply?, say, take? }`, plus a `done` line) and `lessonAt(lesson,
  moves)`.
- `preview/src/plaza-table-games.js`: Lesson mode only.
  - a `data-mode="lesson"` button and a lesson view per table (`entry.lessons`);
  - `allowed()` limits moves to the step's move;
  - the regular's scripted reply goes through the existing ticketed `reply()`;
  - a mill's take is still chosen on the board;
  - `nudge()` handles a square off the script;
  - hint marks and `panel.dataset.lessonStep`;
  - Start again and Take back;
  - `debug().lesson`.
- `preview/src/plaza-table-games.css`: Lesson's own row in the mode switch, and the
  static gold/red rings.
- `preview/tests/table-game-lessons.test.js`, `preview/e2e/plaza-table-lessons.js`,
  the suite entry in `preview/e2e/experience-runner.js`, and `docs/multiplayer.md`.
- `preview/src/salon-guide-content.js`: one sentence in `SALON_SHEET`, pointing new
  players to Lesson.

## The lessons

| Game | Moves | What it teaches |
| --- | --- | --- |
| Chess | e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7# | how pieces move, then attacking f7 |
| Checkers | c3-d4 f6-e5 d4xf6 g7xe5 d2-c3 b6-c5 e3-d4 c5xe3 f2xd4xf6 | compulsory jumps, then give one to take two |
| Connect Four | d d e e c f b | an open three, blockable at one end only |
| Reversi | d3 c3 f5 f4 b3 b2 a1 | trapping lines of discs, then a corner turning the diagonal |
| Morris | a1 a7 d1 d7 g1xa7 g7 a7 | a mill, its take, and blocking a mill |

The checkers and Reversi lines were found by searching the rules modules for short
lines:
- **Checkers:** the regular's capture after e3-d4 is its only legal move.
- **Reversi:** the regular steps onto b2, and a1 then flips b2, c3 and d4.

## Verification

- **Unit tests:** `node --test preview/tests/table-game-lessons.test.js` passed 9/9.
  - Every table game has a lesson.
  - Each script replays move for move through its adapter, alternating from the
    first side, with each move legal on its turn.
  - The endings match their captions: mate, four in a row from b1 to e1, ten men
    against nine, the a1–e5 diagonal, and the morris block.
  - The morris take is a real choice.
  - `lessonAt` handles the script, the reply, done, and moves off the script.
- **`plaza-table-lessons` journey:** passed, 29 checks.
  - **Chess:** a practice move first, then the lesson opens on step 1 with e2 and e4
    ringed. A pawn off the script is refused with "Play the marked move.", and only
    e4 is offered. The regular's scripted answer arrives, and the lesson plays
    through to mate, which the table's pieces show. Take back returns to step 4, and
    Start again to step 1.
  - **Connect Four:** a click in column d's top cell drops, and the lesson ends with
    four marked.
  - **Morris:** the mill asks for a7 only.
  - **Checkers:** ends with the double jump.
  - **Reversi:** the corner turns the diagonal.
  - **Back to practice:** the practice chess game is exactly as left.
  - **Layout:** Lesson has its own row of the switch at 1440×900 and 390×844.
- **Regression journeys:** `plaza-chess`, `plaza-checkers`, `plaza-connect-four`,
  `plaza-morris`, `plaza-shared-game`, `plaza-reversi` (13 checks) and `salon-guide`
  (22 checks) passed.
  - `plaza-reversi` first failed because I edited `salon-guide-content.js` while it
    ran: the journeys use a Vite dev server, which reloaded the page. It passed when
    re-run on the final tree.
- **Core gate:** `pnpm run verify` gave `core: passed`. Node: 2949 of 2950 (1
  skipped). Python: 76 of 76. Server: 476 of 616, with the 140 skipped needing
  Redis.
- **After merging main** (`1861d1b7`, which brought Yacht and shuffleboard):
  `plaza-table-lessons`, `salon-guide` and `plaza-chess` passed again. `pnpm run
  verify` gave `core: passed` (node 2963 of 2964, 1 skipped; Python 76 of 76).

## Gaps

- **Wrapped practice labels:** beside the board at 1440×900, "Plaza regular" and
  "Pass and play" wrap to two lines. They're 108 px wide, the same as on `main`
  before this change. Lesson's own row is one line. Left to c2's layout.
- **Shared games:** none here. Lessons are practice only.
