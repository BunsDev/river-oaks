# Expandable plaza game layout

Objective: give the five-game plaza sheet a larger usable board, explicit expanded
view, and legible game selection while preserving positions, keyboard controls,
practice/shared modes and guide behavior.

Owned files: preview/src/plaza-table-games.js, plaza-table-games.css;
preview/e2e/plaza-game-layout.js; this ledger and own task register entry.
Branch feat/plaza-game-layout-20261015 at ae541c70, external sibling checkout
river-oaks-game-layout. Existing Character Studio checkout and running gate82727
preserved. No changes to rules or authoritative state.

Design: existing forest glass, ivory #ece2cd, charcoal #4a464d, sage action and gold
selection accent. Existing HUD type for labels and symbols for pieces. Horizontal
five-game selector above board, compact status/history/controls beside board,
Expand board/Restore size in header. Expanded fills viewport; narrow layouts keep
board and selector full width with scrollable controls. Board dimensions drive piece
size. Selected game gets a small board motif and a clear active state.

Checks: focused game resize/switch/keyboard browser journey with screenshots;
existing chess/Morris/guide journeys; core pnpm run verify. Browser work waits for
shared lock. Human accessibility and physical device acceptance remain unproven.

Status: implementation in progress. No commit, PR, merge or archive eligibility.

Implemented: game selector moved above the board and reuses existing Salon Guide
icons; active game has raised fill and sage underline. Larger board and proportional
pieces; Expand board/Restore size preserves state and focus. Medium expanded
screens put controls below the board; desktop retains the side controls; phone
layout keeps all five choices visible and scrolls controls. Scoped CSS leaves other
plaza game sheets unchanged.

Verification so far: agent:doctor passed all prerequisites; node --check and git
diff --check pass; table-game-lessons tests9/9 pass. Independent read-only review
found no blocker. Frozen hashes .runtime/plaza-game-layout/source-hashes.json match.
Browser session53651 queues test:experience plaza-game-layout plaza-morris salon-guide;
core session32971 queues verify with its own isolated Redis. Logs /tmp/river-games-
browser.log and core-runner.log. Poll existing processes after interruption; never
restart merely because an observation timed out. No rendered acceptance yet.

First rendered run: layout31 checks and Morris15 checks passed. Desktop and expanded
screenshots visually inspected; the board grows580 to798 pixels at1440×1000, phone
board340 at390px, and the five-game selector fits. Salon Guide caught its phone
header placement contract: guide medallion was on a second row at the same right
edge as Close. Fixed the title's reserved space and placed the guide beside Close.
Failed receipt retained as browser-before-guide-fix.json/.log. Final browser session
8835 queues the same three journeys; new captures include dark theme. Core32971
still queued. No source edits during active gates.

Final verification passed on frozen source. Core11/11 tasks passed with isolated
Redis: tooling112, preview3324 passed/1 existing skip, server795 with zero skips,
desktop69; Python/build/lint/demo/secrets passed. Browser final: layout31, Morris15,
Salon Guide22 checks passed. Actual light/dark desktop, expanded and phone screenshots
inspected; final header retains guide/close spacing. Receipts core.json/.log,
browser.json/.log, source-hashes.json and failed-before-fix report retained under
.runtime/plaza-game-layout. No human accessibility, physical device, merge or
deployment acceptance. Ready for signed commit and reviewable PR; preserve checkout.

2026-10-16 continuation: draft PR #468 opened at signed c7ad1a65. Its 16 hosted
checks passed. GitHub later reported a task-register conflict as main advanced.
Merged origin/main a00a4d19 locally with the repository register driver; all other
task entries match main exactly and all three game source hashes remain unchanged.
Reinstalled frozen dependencies and agent:doctor passed. Reverified the integrated
tree before committing: core 11/11, tooling112, preview3367 passed/1 existing skip,
server795 with zero skips, desktop76, Python141 passed/66 warnings. Build, lint,
demo (expected verification exit2) and secrets passed. The layout31, Morris15 and
Salon Guide22 browser checks all passed; fresh expanded desktop and phone captures
were visually inspected. Receipts and captures are retained under
.runtime/plaza-game-layout/main-refresh-20261016. The core receipt records the
pre-merge HEAD and dirty integration tree; integration.json records both parents.
Push the signed integration commit for renewed hosted checks and maintainer review.
No merge, deployment, human accessibility or physical-device acceptance. Preserve
the checkout and local evidence until delivery and guarded retirement.
