# Outside-click modal dismissal

Objective: dismiss approvals and dialogs with a backdrop on outside clicks while preserving inside clicks, drags, focus recovery, and existing close cleanup.

Implementation: `preview/src/modal-dismiss.js` checks both pointerdown and click against the modal bounds and backdrop target. Wired to approvals, invitations, Settings, Commands, Places, problem reports/inbox, region editor and Studio template picker. Full-screen photo/intro modes and required access gates retain their existing behavior.

Regression coverage: `preview/tests/modal-dismiss.test.js`, `preview/e2e/modal-dismiss.js`, and `preview/e2e/access-gate.js`. The access journey now explicitly clears the runner's owner fixture cookie to begin anonymously. Its new regression failed before the fix with “Clicking outside approvals closes it”. After the fix it checks focus recovery, inert release, inside clicks, drag protection, late-response fencing and Settings dismissal.

Verification:
- `node --test preview/tests/modal-dismiss.test.js`: 4 passed.
- `pnpm run test:experience access-gate modal-dismiss`: passed, 32 + 9 checks; `.runtime/modal-dismiss/browser.json`.
- `pnpm run verify`: passed; tooling 76, preview 2699 (1 skip), server 379 (125 skips), desktop 49, Python 141. Total 3344 passed, 126 existing skips. Build, Ruff, synthetic demo and secret scan passed. Demo verification's expected blocked result is fixture behavior. Receipt: `.runtime/agent/core.json`.
- `pnpm run agent:doctor`: passed.
- `git diff --check`: passed.
- `pnpm run --silent project:check --github --tasks /Users/buns/Documents/GitHub/BunsDev/river-oaks/docs/project-management/tasks.json`: valid task registration, 16 unrelated existing lifecycle gaps. This checkout is correctly preserved as dirty; `.runtime/modal-dismiss/project-check.json`.

Worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-modal-dismiss-20261013`; branch `fix/modal-outside-dismiss-20261013`, based on `f97f3e60b6d138706b29ef124aab3f4a0afff6ac`. One worktree/branch created by this task; none retired. Primary checkout edits preserved. Shared dependencies were used without copying private runtime state or credentials. Historical browser report restored; new evidence retained under `.runtime`.

Handoff: implementation verified, task queued and ownership released in the live primary register. No commit, PR, merge or deployment. Hosted CI, full/Redis, other modal journeys, native and human accessibility acceptance are unverified. Review and authorize delivery next. Preserve this worktree: it contains undelivered edits and is not safe to archive/remove.

## Delivery (river-oaks-3b, 2026-10-13)

Val authorized landing. The verified patch was committed as written, then main
was merged in.
- **Conflict.** One conflict, in the template picker's imports (World Studio
  spaces, #316): the picker keeps both the dismissal import and
  `space-templates.js`.

**Why the sign-in page now has its own copy.**
- **The problem.** `access-entry.js` imported `modal-dismiss.js`, which game
  modules and the World Studio entry import too. The build therefore split it
  into `/assets/modal-dismiss-*.js`. The asset gate refuses that chunk before
  sign-in, so the sign-in page would never have started.
- **Why the earlier checks missed it.** The journeys run on the Vite dev
  server, which has no gate. `scripts/check-access-entry.mjs`, added to the
  build in #314, refused the build and named that chunk.
- **The fix.** The access entry imports an import-free copy,
  `preview/src/access-modal-dismiss.js`. The unit test runs every case against
  both copies and fails if their code differs. The gate was not widened.
- **The problem report.** The first `test:security:e2e` run after that fix
  still failed: "Failed to fetch dynamically imported module …
  debug-report-ui-*.js", and `#report-dialog` never opened. The sign-in page
  loads the problem report (`debug-report-ui.js`) lazily. The patch made it
  import `modal-dismiss.js`, which was refused. Pointing it at the sign-in copy
  split that copy out too, into a refused `access-modal-dismiss-*.js`.
- **Final shape.** `debug-report-ui.js` imports no dismissal module. The access
  entry passes `dismissOnOutsideClick` into `openReportDialog` and
  `openReportInbox`.
- **The guard missed it,** for two reasons:
  - it did not follow dynamic imports at all;
  - Rolldown writes them with backticks.
- **The guard's fix.** `scripts/check-access-entry.mjs` now follows a dynamic
  import whose target the gate serves before sign-in, written with any quote.
  - A new case in `server/tests/check-access-entry.test.js` passes with the new
    guard and fails with main's.
  - On the real build, with the report importing `modal-dismiss.js` again, the
    guard names `/assets/modal-dismiss-*.js`. Fixed, it reports "Sign-in page:
    7 files, all served before sign-in."

**Also changed.**
- The Salon Guide (#321) uses `dismissOnOutsideClick` on its frame instead of a
  position-only backdrop check, which closed on a drag out of the book.
- The `salon-guide` journey now checks that a drag from inside to outside keeps
  the book open.
- The worktree's own copy of `tasks.json` (an uncommitted claim entry) was set
  aside to the session scratchpad. The live register is the primary's.

**Checks after the merge.**
- `node --test preview/tests/modal-dismiss.test.js`: 9/9 (both copies, and the
  drift check).
- `node --test server/tests/check-access-entry.test.js`: 4/4.
- `pnpm run build`: "Sign-in page: 7 files, all served before sign-in."
- `pnpm run test:security:e2e`: 2/2. The email-access test took 8.2 s, after
  timing out at 61 s on the problem report.
- `pnpm run test:experience access-gate modal-dismiss salon-guide`: passed.
  The guide journey now checks that a drag out keeps the book open.
- `RIVER_OAKS_SHARED_JOURNEY=access-gate pnpm run test:shared required`:
  passed.
- `pnpm run verify`: `core: passed` (unit 2875 pass, 0 fail, 1 skipped; server
  465 pass, 138 skipped without Redis).
