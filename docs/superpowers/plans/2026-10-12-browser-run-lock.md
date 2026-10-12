# Local browser runs take turns

Objective: stop concurrent local browser journeys from starving the machine. On
2026-10-11 load averages of 285 to 384, from several sessions' journeys plus desktop
apps, made `creator-objects` fail with a timed-out town `travel` command and a null
snapshot. The same tree passed 11 of 11 at normal load. Other journeys showed the
same kind of starvation failure.

Owner: Claude Code session `46fc41e0-26d1-4116-956a-7cac77a13769`. Task
`browser-run-lock`. Branch `feat/browser-run-lock-20261012` from `main` at `72a6c22`.

## Change

- `scripts/local-queue.mjs`: the first-come queue from `land-pr.mjs` (#272), moved
  here so both tools share it. Entries are keyed by `id`, and older landing entries
  keyed by `pr` are still read. `land-pr.mjs` imports it.
- Change-over: river-oaks-3b noticed that `main`'s lander (#272) reads only `pr`. It
  showed this branch's entry as `#undefined` and could miss it in its duplicate check.
  Landing entries now carry both `id` and `pr`, and a regression test covers both
  directions. The live entry for #277 was patched under the queue lock.
- `scripts/browser-lock.mjs`:
  - `holdBrowserLock(name)` resolves when it is this run's turn and returns the
    release function, which also runs on process exit.
  - A run started inside a run that holds the lock passes straight through
    (`RIVER_OAKS_BROWSER_LOCK_HELD`).
  - Hosted CI (`CI=true`) and `RIVER_OAKS_BROWSER_LOCK=off` skip the lock.
  - `node scripts/browser-lock.mjs <name> -- <command>` wraps any command and passes
    its exit code through.
- `preview/e2e/shared-runner.js` and `preview/e2e/experience-runner.js` hold the lock
  around their whole run, so direct `node` invocations are covered too.
- `package.json` wraps `test:security:e2e`, `test:reflections:webgl` and
  `test:trees:webgl`.
- `docs/project-management/workflow.md`: a "Local browser runs take turns" section,
  linked from `docs/agent-workflow.md`.

## Checks

- Red first: the test failed with `ERR_MODULE_NOT_FOUND` before the module existed.
- `node --test scripts/tests/browser-lock.test.js scripts/tests/land-pr.test.js`:
  16 passed. They include two real-process tests: concurrent wrapped commands run
  strictly one after the other, and the exit code passes through with the lock
  released.
- Real runners, two `pnpm run test:experience world-studio` started 2 s apart in
  one worktree:
  - The second printed `Waiting for 1 local browser run to finish (running:
    experience journeys (pid 48185), …)` three times.
  - It started its journey only after the first finished: first run 548.1 to
    561.7 s, second run ending at 577.4 s.
  - Both passed, taking 10.9 s and 10.7 s.
- `pnpm run verify`: core passed all 11 tasks (tooling 73, including the 6 new;
  preview 2664 passed, 1 skipped; server 377 passed, 125 Redis-only skipped;
  desktop 49).
