# Full-screen plaza games polish

## Objective
Address Val's 2026-10-18 screenshot: keep the entire expanded board visible, center board and controls together, clarify coordinates and controls, and improve dark-piece contrast while preserving rules, state and keyboard behavior.

## Ownership
Branch `fix/plaza-fullscreen-polish-20261018`; session `codex-pr-448-477-468-484`.
Files: `preview/src/plaza-table-games.{js,css}`, `preview/e2e/plaza-game-layout.js`, this ledger and plans index. Live claim resides in the primary checkout register.

## Verification
- Regression first: expanded desktop vertical fit, bounded rail gap, visible coordinates.
- Five game shapes, lesson/practice/shared states, flipped coordinates, responsive short/narrow windows, keyboard focus and restoration.
- Focused rules tests, core verify, browser layout/Morris/guide/shared journeys.

## Changes reviewed
| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| High | Expanded board | Height guessed from viewport; bottom row could overflow | Board bounded by the actual body container | Entire square board stays visible on wide windows |
| Medium | Board and side controls | Controls stranded at far right | Centered board and 248px rail with an 18px gap | Instruction and next action stay beside the board |
| Medium | Lesson coordinates | Square names only in instructions | Oriented file/rank edge labels in all five games | Players can locate the requested move |
| Medium | Controls | Empty history above actions, disabled lesson side choices | Actions above labeled history; contextual side selector; 44px header/action targets | Less searching and fewer inactive controls |
| Medium | Pieces | Dark checker edges and white chess glyphs blend into squares | Contrasting checker rim and chess outlines | Piece silhouettes remain readable |

## Results and gaps
- Red regression: `pnpm run test:experience plaza-game-layout` failed on expanded desktop full-board visibility/rail spacing before implementation. Its receipt write also failed because `.runtime` did not yet exist; console and screenshot preserved. Created the directory before subsequent runs.
- Focused rules/lesson tests: `node --test preview/tests/{chess-rules,checkers-rules,connect-four-rules,reversi-rules,morris-rules,table-game-lessons}.test.js`, 26/26 passed.
- `pnpm run test:experience plaza-game-layout plaza-morris salon-guide plaza-shared-game plaza-table-lessons`: 5/5 passed; `.runtime/fullscreen-browser.json`.
- Final layout rerun initially hit the multiplayer reconnect gate intercepting Restore size. A clean retry passed all 47 checks: `.runtime/fullscreen-final-layout-retry.json`. Reviewed light/dark, checkers lesson, Connect Four, Morris, phone and short-window screenshots in `output/playwright/plaza-games-*.png`.
- `pnpm run agent:doctor`: passed after frozen pnpm install and `uv sync --locked`.
- `pnpm run project:check --tasks <primary>/docs/project-management/tasks.json`: exit 1 from unrelated expired leases, retirement and missing-worktree records. This task is claimed and has no reported gap.
- `pnpm run verify`: agent tests passed; preview tests hit `ETIMEDOUT` at 600027 ms while running avatar/cloth tests, without a reported assertion failure. `.runtime/agent/core.json` retains the failed gate. The separate server stage reported 667 passed, 1 failed and 204 Redis skips; the failed office checkpoint recovery test passed in isolation (1/1) and its file/server sources match `origin/main`. The eight remaining stages passed in `.runtime/agent/core-after-server.json`: desktop, build, Python lint/format/tests (141 passed), synthetic demo, expected demo verification and secret scan. These separate results do not turn the original core run green. Automated browser coverage does not establish human accessibility acceptance. Val subsequently authorized committing, pushing, merging PR #521 and pruning its associated worktree/branch.

## Next step
Implementation and targeted acceptance are complete. Merge PR #521 through the exact-head hosted gate, then archive and retire its worktree/branch. Main integration only conflicted in the generated plans index; regeneration resolved it. Focused rules/lesson tests passed 26/26 and the build passed after integration.
