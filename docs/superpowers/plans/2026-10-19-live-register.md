# Live task register in the common Git directory

Task `live-register-20261019`, branch `chore/live-register-20261019`, worktree
`../river-oaks-live-register`, owner `claude:river-oaks-d8 (015e1f43)`.

## Why

The live register was an uncommitted edit to `docs/project-management/tasks.json`
in the primary checkout, while feature PRs committed their own entries to the same
file. On main it changed 34 times in three days. Each change met the primary's
uncommitted copy on the next pull:

- On 2026-10-18 at 23:17Z, GitHub Desktop pulled #522 and auto-stashed the live
  register (`!!GitHub_Desktop<main>`). The register then read as main's 224-task
  snapshot instead of 308 tasks, with 19 active claims missing, until it was
  restored by id at about 23:25Z.
- GitHub's update-branch cannot run the register merge driver, so PRs carrying
  register entries kept going dirty against each other.

Val chose this design over untracking the file, on 2026-10-19.

## Design

- `scripts/task-register.mjs` keeps the live register at
  `<git common dir>/river-oaks-tasks.json`, guarded by a directory lock (stale after
  30 s), the same pattern as the land queue. CLI: `pnpm run register
  path|show|patch|absorb|snapshot`.
- Every read absorbs a legacy edit to the primary's tracked copy by task id, using
  `mergeRegisters` (newer `updatedAt` wins; a deletion never discards the other
  side's edit). It then writes the committed text back, so the primary checkout
  stays clean.
  - A tracked copy that changed again since it was read is left for the next read.
  - A copy with conflict markers is left for a person, and `project:status` names
    it.
- Writes refuse changes that add validation errors.
- `project:status` reads the live register by default from any worktree.
  `project:prune`, `project:inventory` and `project:archives` use it through
  `primaryRegisterPath`. Prune's register update takes the same lock.
- `check-register-snapshot.mjs`, a step in Verify, fails a pull request that
  changes `docs/project-management/tasks.json` unless its branch is
  `docs/register-sweep*`. The snapshot is then refreshed only by sweeps, via
  `register snapshot`.
- Docs updated: AGENTS.md, docs/project-management/workflow.md,
  docs/agent-workflow.md and the project-management skill.

## Migration (after this lands)

1. From the primary checkout, run `pnpm run register absorb`. It seeds the live
   file from the primary's current uncommitted register and restores the tracked
   file to main's snapshot.
2. Confirm `git status` is clean for `tasks.json` in the primary checkout and that
   `register show` lists every task.
3. Tell the live sessions:
   - write through `register patch`;
   - PRs that commit `tasks.json` need
     `git checkout origin/main -- docs/project-management/tasks.json`.

Old-style edits keep working: the next read absorbs them.

## Verification

- `node --test scripts/tests/task-register.test.js`: 9/9, using temporary repositories
  with a linked worktree. Covered:
  - shared path, and a clean primary;
  - an uncommitted primary edit seeding the live file, with the tracked file reset;
  - later legacy edits absorbed by id, the newer update winning;
  - conflict markers left alone and named by `project:status` (exit 2);
  - invalid writes refused and the file unchanged;
  - patch semantics;
  - the CLI path, patch, show and snapshot commands;
  - stale lock reclaim;
  - the snapshot check (a feature branch refused, a sweep branch allowed).
- With the existing status, prune, cancel and merge-driver suites: 52/52.
- `pnpm run test:agent`: 130/130. `pnpm run verify security`: passed.
  `plans:index --check`: passes.
- `node scripts/check-register-snapshot.mjs main chore/live-register-20261019`
  exits 0 on this branch.
- Before landing, the real common Git directory has no `river-oaks-tasks.json`, and
  nothing here ran against the live repository. The migration is a separate,
  explicit step.

## Gaps

- In-flight PRs that already commit `tasks.json` fail the new Verify step until
  they drop it.
- The plans index README still regenerates per ledger, so PRs that add ledgers can
  still conflict there; it now changes less, because the snapshot it reads is
  stable.
