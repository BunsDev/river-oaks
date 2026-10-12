# Shared landing queue

Objective: remove the hand-run merge coordination between sessions. On 2026-10-11
one session ran a merge queue by message: it agreed an order, pinged each owner,
and every merge forced the rest to rebase. A Codex merge outside that queue
(#246) still sent everyone back behind `main`.

Owner: Claude Code session `46fc41e0-26d1-4116-956a-7cac77a13769`. Task
`shared-landing-queue`. Branch `feat/shared-landing-queue-20261012` from `main` at
`88a6cc6`.

## Decision

GitHub's merge queue needs a repository owned by an organization. `BunsDev` is a
user account (`gh api users/BunsDev` reports `type=User`). Val chose a shared local
landing script. Moving the repository into an organization, or dropping the
up-to-date requirement, were the alternatives.

## Change

- `scripts/land-pr.mjs`, run as `pnpm run land <pr>` or `pnpm run land --status`:
  - The queue and its lock live in the common Git directory, shared by every
    worktree. Entries left by dead processes are dropped. A PR queued by another
    live session is refused.
  - On its turn: update-branch, wait for Verify, rerun the failed jobs once, then
    merge through the merge guard. When `main` moves first, it updates and goes
    again; it gives up after four attempts.
  - It fails closed on a conflict, a second failure, any other guard refusal, or a
    missing guard.
- It talks to GitHub over REST through `gh api`, which keeps it off the shared
  GraphQL budget. The guard does its own GraphQL reads.
- `docs/project-management/workflow.md`: a "Landing a pull request" section.

## Checks

- Red first: the test failed with `ERR_MODULE_NOT_FOUND` before the module existed.
- `node --test scripts/tests/land-pr.test.js`: 10 passed. The tests cover turn order,
  dead entries, double queueing, behind then update then merge, rerun once, still
  failing, conflict, `main` moving under the guard, fail-closed refusal, and waiting
  for a turn.
- CLI: `--status` prints the empty queue, and a bad argument prints the usage.
- `pnpm run verify`: core passed all 11 tasks (tooling 67, including the 10 new;
  preview 2664 passed, 1 skipped; server 376 passed, 125 Redis-only skipped;
  desktop 49).

## Next

Land this PR with `pnpm run land`: the first end-to-end use.
