# Let queued socket events run before the connect deadline expires — 2026-10-12

**Objective:** stop the town client closing a connection that has already
succeeded. On #281 (head 37af532, Verify run 38219510723), email access failed
#276's one-socket assertion: the first socket closed and a second opened 19.8 s
later, which fits the 12 s open budget plus a retry backoff. river-oaks-c2
found the race in `watchConnection` (#260).

**Branch / worktree:** `fix/connect-grace-20261012` in
`../river-oaks-connect-grace-20261012`, a sparse checkout of the two files and
the plans folder, from `edc306b`. The disk had under 1 GB free (about 37 GB of
swap), so no dependency install was done.

## Cause

A socket's `readyState` only becomes OPEN when its queued open task runs, and
the first snapshot is a queued message. A timer and a network event that came
due during the same long software-rendered frame can run in either order. If
the frame ends within the 2 s starvation allowance, the deadline timer counts
as on time. When it runs before the queued event, it sees no progress and
closes a connection that had already succeeded.

## Change

`preview/src/connection-deadline.js`: when a budget runs out without progress,
the deadline waits one more short timer (`graceMs`, 1 s) before expiring.
`opened()` or `stop()` cancel it, and a socket found OPEN moves on to the
snapshot budget. If the grace timer itself fires more than `starvedMs` late,
the page was starved, so the budget restarts within `maxRestarts`. A socket
that truly never opens now expires about 1 s later than before.

## Verification

- `node --test preview/tests/connection-deadline.test.js`: 9/9. Four new tests
  cover the race:
  - an open queued behind the open timer;
  - a socket reporting OPEN by the grace timer;
  - a first snapshot queued behind the snapshot timer;
  - a late grace timer.

  Against main's module, 8 of the 9 fail (the four new ones, plus the timings
  the grace step deliberately shifts).
- The full gate runs in hosted Verify only. With under 1 GB free, `pnpm run
  verify` was not run locally.

## Next step

PR, then `pnpm run land` behind #281.
