# Workplace: unattended recovery of orphaned tasks (#221 gap)

**Status:** implemented on `fix/workplace-task-sweep`, which is stacked on `fix/workplace-retention-status` (PR #232).
**Owner:** Claude session `river-oaks-c2` (task `workplace-task-sweep`).
**Source:** finding 3 of the independent #221 evidence review. Before this change, a task whose instance died stayed `running` until its owner read again. With no reads, it stayed that way until the grant expired.

## Changes

- **Due index** (`server/workplace.js`): `{ns}:workplace:v1:due`, a sorted set of owners with a queued or running task, scored by when the next step is due.
  - It is updated in the same atomic save as the owner document, through new `zadd` and `zrem` side operations.
  - Pausing or settling a task removes its owner from the index.
- **Sweep:**
  - `createWorkplace({sweepMs})` runs a loop that takes up to 50 overdue owners and drives each one through the usual access check and step.
  - Compare-and-set keeps each step exactly-once across instances.
  - A stale entry, for a document that expired or was deleted, is removed with a conditional `ZREM` that only fires if the score is unchanged.
- **Wiring:**
  - The Redis gateway sweeps every 5 s when `workplaceSweep` is on.
  - `redis-backend.js` turns it on unless `VERCEL=1`, because serverless functions can't keep timers.
  - The in-memory town doesn't sweep, because it keeps everything in one process.

## Checks

- `server/tests/sweep-workplace.test.js`: 9 cases (memory and Redis), plus one live case where a second Redis gateway finishes a task orphaned by the first with no owner reads. All failed before the change.
- Mutation check:
  - Without the index writes, 7 cases fail.
  - Without stale-entry cleanup, 1 case fails.
- Results at the final head are in the PR.

## Gaps

- There is no sweep on Vercel. If hosted serverless needs unattended progress, it needs a scheduled job, such as Vercel Cron calling an internal sweep route.
- The index holds raw user ids server-side, because the access check needs them. It is never exposed through a route.
