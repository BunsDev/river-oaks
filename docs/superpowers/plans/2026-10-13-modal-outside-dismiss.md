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
