# Stack rehearsal: reset the ticket window between deploy steps (2026-10-28)

Owner: claude:river-oaks-de (d13c5d). Branch `fix/stack-rehearsal-ticket-window-20261028`
from main 91656cec. Worktree `river-oaks-stack-rehearsal-ticket-window`.

## Objective

`server/tests/stack-activation-rehearsal.test.js` (from #720, merged this morning as
ea684681) joins four accounts on every one of its thirteen deploy steps. The Redis
security (`server/redis-security.js`, `issueTicket`) allows 10 tickets per user per fixed
one-minute window. On a hosted runner that reaches the 11th step inside the window, the
ticket request returns 429 and the test fails:

```
✖ Stack rehearsal from Gardens … (35765 ms)
  AssertionError [ERR_ASSERTION]: bob ticket on heights-studewood-1@10
  429 !== 200
```

Seen on PR #694 head 0687136c (`preview checks`, Verify run 40687370831, job
122813089569). Passing runs took 46 s (main 6f85ba9b) and 58 s (#718 head d2c311ad),
long enough for the first tickets to fall out of the window. It is a timing flake in
the test, not in the server or in #694.

## Change

`stop(node)` (between deploy steps) deletes the namespace's `limit:tickets:*` keys, so
each step starts with a fresh window, as production deploy steps minutes apart would.
One file: `server/tests/stack-activation-rehearsal.test.js`.

## Checks and results

- Ticket-window mechanism against an isolated loopback Redis (port 6411, createRedisSecurity
  with a throwaway prefix): one user gets 10 of 13 tickets in one window; after deleting the
  window key the 11th is issued.
- Patched test against the same Redis: pass, 45.9 s; receipt 12 steps, 101 checks, 0 failed.
- Unpatched main copy against the same Redis: pass, 45.3 s (the failure needs the steps to
  share one calendar minute, which this machine did not do).
- `pnpm run verify` (core) on the patched tree, 12:35:36Z to 12:45:50Z: passed.
  289 of 289; 4294 pass, 1 skip; 1048 pass, 279 skips; 127 pass, 5 skips. Core excludes
  Redis, browser, native, live auth and production acceptance, so the rehearsal itself ran
  only in the focused Redis run above.
- Hosted `preview checks` on the PR head: pending.

## Gaps

- The failure cannot be reproduced locally on demand: it needs a runner that completes
  ten steps in under a minute. The evidence is the hosted log above.

## Next step

Open a draft PR, mark ready after core verify, queue a lander behind the current queue.
