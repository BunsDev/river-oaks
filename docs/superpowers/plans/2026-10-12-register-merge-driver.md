# Task register merge driver

Objective: stop git operations from damaging the live task register. Val asked for a
comprehensive fix after two GitHub Desktop pulls of the primary damaged it on
2026-10-11.

Owner: Claude Code session `46fc41e0-26d1-4116-956a-7cac77a13769`. Task
`register-merge-driver`. Branch `fix/register-merge-driver-20261012` from `main` at
`640abe3`.

## What went wrong

The primary checkout holds `docs/project-management/tasks.json` as an uncommitted
live edit, and branches commit their own entries.

- 20:34Z: GitHub Desktop pulled the primary, stashed the live register and never
  restored it. Sessions that wrote afterwards started from the committed copy, which
  dropped three tasks and rolled back twelve.
- 23:52Z: a second pull popped its stash into a line-merge conflict, leaving
  conflict markers and invalid JSON, and the register was unusable until it was
  merged by hand.
- Every branch update conflicted on the register too: #242 alone needed three
  hand resolutions in one day.

## Change

- `scripts/merge-task-register.mjs`: a three-way merge by task id. An entry changed
  on one side takes that side, including a deletion. An entry changed on both takes
  the newer `updatedAt`, and a deletion never discards an edit. Duplicate ids on one
  side collapse to the newest copy. Input that won't parse falls back to
  `git merge-file`, so a person still sees ordinary conflict markers.
- `.githooks/merge-task-register`: a shell wrapper that finds Node the same way as
  `reference-transaction`, so GUI clients without the shell's PATH still use the
  driver. If no Node is found, it falls back to a line merge.
- `scripts/install-project-hooks.mjs`: copies both files into the shared
  `river-oaks-hooks` directory and sets `merge.task-register.driver` in the common
  Git config, so the driver applies to every worktree and never runs branch code.
- `.gitattributes`: routes the register to the driver.
- `scripts/project-status.mjs`: reports a stash holding register edits as a gap,
  and names conflict markers instead of failing with a JSON parse error.
- `docs/project-management/workflow.md`: a "Register merges and stashes" section.

## Checks

- Red first: the new driver test failed with `ERR_MODULE_NOT_FOUND`. Both new
  status tests failed before their implementation.
- `node --test scripts/tests/merge-task-register.test.js scripts/tests/project-status.test.js scripts/tests/hardening-hooks.test.js`:
  24 passed.
- The tests include, on real Git through the installed hook, a branch merge and a
  GitHub Desktop-style stash, pull and pop. A control repository without the driver
  still conflicts (`UU`).
- Replay of the real 23:52Z conflict, using f8's backup in
  `~/worktree-backups/river-oaks/register-conflict-20261012T0005Z/` and base
  `77278c7`: the driver exits 0 with all 61 tasks, identical to the hand resolution.
- The new `project:status` reads the live primary register without error and
  reports no stashed register edits.
- `pnpm run verify`: core passed, all 11 tasks. Tooling 57 passed (13 new); preview
  2646 passed, 1 skipped; server 360 passed, 116 Redis-only skipped; desktop 49;
  Python 141. Log `.runtime/core.log`.

## Rollout

Installed early, by accident: `pnpm install --ignore-scripts` followed by `pnpm rebuild`
still ran the root `prepare` script, so this branch's installer ran before review. Every
hook it rewrote is byte-identical to `main`'s (`reference-transaction` differs only in
its pinned Node path). The only additions are the driver's two files and its
`merge.task-register` config. The driver is inert until a checkout's `.gitattributes`
routes the register to it; when installed, that was only this branch's worktree.

After merge, run `node scripts/install-project-hooks.mjs` (or `pnpm install`) once
from an up-to-date checkout. It installs the driver into the shared hooks for every
worktree. Checkouts pick up `.gitattributes` as they update from `main`.
