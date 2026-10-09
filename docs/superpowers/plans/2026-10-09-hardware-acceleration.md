# Hardware acceleration warning

Objective: warn when the active WebGL renderer is known to use software, without
mistaking privacy restrictions or slow frames for disabled acceleration.

Branch: feat/hardware-acceleration-warning. Isolated sibling worktree; preserve
main's unrelated staged work and conflict. Val authorized commit, push and merge
on 2026-10-09.

Owned files: preview/src/hardware-acceleration.js and .css, main.js integration,
preview/tests/hardware-acceleration.test.js, preview/e2e/hardware-acceleration.js,
experience-runner.js suite registration, this ledger.

Plan:
- [x] Regression tests for software, GPU, masked and unavailable renderer queries.
- [x] Dismissible, accessible warning using the existing context at startup.
- [x] WebGL startup failure guidance, without asserting the cause.
- [x] Browser checks for startup, dismissal, reload, GPU/unknown, mobile layout.
- [x] Focused tests/build and npm run verify; record results and limitations.

Detection uses WEBGL_debug_renderer_info, falling back to RENDERER. Known
software names only; no raw renderer logging, storage or telemetry. Check once,
no per-frame probing, extra contexts, performance inference or quality changes.
A dismissal lasts for this visit only. Warning does not block entry.

Verification (2026-10-09, base e059ee0 with this uncommitted patch):
- `npm ci --ignore-scripts --no-audit --no-fund`, `uv sync --locked`: passed.
- `npm run agent:doctor`: passed after Python setup; `npm run agent:list`: read.
- `node --test preview/tests/hardware-acceleration.test.js`: initially failed
  because the new module did not exist; final 20/20 passed.
- `RIVER_OAKS_E2E_REPORT=hardware-acceleration-local.json npm run test:experience -- hardware-acceleration`:
  passed all 12 checks using substituted browser driver metadata and real GPU drawing.
  Covers startup, polite status, no focus theft, keyboard dismissal/focus return,
  reload, 390px layout, GPU/unknown suppression, unavailable WebGL guidance.
  Receipt moved to `output/playwright/hardware-acceleration-local.json` to keep
  generated evidence separate. Desktop/mobile screenshots in the same directory
  were visually inspected; notice readable and within both viewports.
- `npm run verify`: passed all core tasks, receipt `.runtime/agent/core.json`.
  Agent 17 passed; preview 2528 passed / 1 skipped; server 276 passed / 102
  skipped (Redis unavailable); desktop 9 passed; Python 141 passed. Build,
  Python lint/format, synthetic pipeline and secret guard passed. Synthetic
  verification returned its expected domain exit 2. Build chunk-size warning
  and two Python deprecation warnings remain.
- `git diff --check`: passed; reviewed integration diff and new modules/tests.

Implementation and scoped verification complete. Delivery authorized: refresh
against current main, review, commit, push and merge through a checked PR.
Pre-commit focused detection suite: 20 passed; diff whitespace check passed.
Unverified scope: full Redis/browser suite, native/packaged app, human accessibility,
physical browser-setting toggle and target GPU performance.
