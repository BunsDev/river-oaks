# Stack rehearsal: pay the room's first load outside the join budget (#754)

Task `stack-rehearsal-754-20261029`, branch `fix/stack-rehearsal-754-20261029`, worktree
`river-oaks-rehearsal-754` created at main `7cc1fb87` on 2026-10-29.

## Objective

`preview checks` on the hosted Verify matrix fails `server/tests/stack-activation-rehearsal.test.js`
intermittently with `alice snapshot on river-oaks-gardens-3@7`, the first join after the one-step
rollback from Woodland Heights to Gardens. On 2026-10-28 main failed it on three of its last five
pushes (`36e906b2`, `e5cfada6`, `7cc1fb87`) and docs-only pushes to #729 lost the aggregate
`preview` check to it four times, so the merge gate is red for everyone (#754).

## Finding

`join()` waits 160 × 50 ms (8 s) for the first snapshot. That wait covers the freshly booted
node's boot work: loading the room from Redis and, after a stack step, migrating the checkpoint
to the revision now served. Measured locally with an isolated Redis at host load 6 (temporary
instrumentation, not committed): the rollback step at epoch 7 is the longest first snapshot at
1,600 ms; the direct Woodland activation at epoch 8 is 1,369 ms; every other step is under
1,000 ms. The whole test runs in 38 s locally and 42–59 s on the hosted runner, so the runner
has no margin on the one step that migrates the most. The test's own timeout is 300 s.

**The 30 s wait was not enough.** The ledger-only push `877b2e9a` on this branch failed the same
assertion with the test at 68.4 s: alice's first snapshot after the rollback boot did not arrive
in 30 s, so the cause is not a slow migration but a join that never answers (or a close the test
did not record). Locally the rehearsal passes alone (29.3 s) and twice while the whole Redis server
suite runs beside it (35.4 s, 30.4 s), so the condition is specific to the hosted runner. `join()`
now records the socket's open and close (code, reason), the first message types and the node's
last log lines, and fails with them when the snapshot does not come, so the next hosted failure
attributes itself.

**Attributed on `5b0b1e29` (hosted run, 2026-10-29).** The diagnostic read: socket open after 2 ms,
no message received, closed by the server with `1013 The town cannot accept this connection.`
after 11,616 ms, and the node's log still ending at the Woodland migration of the previous step,
so the rollback node had not committed its first tick. That close is `distributed-app.js`
admission after `room.request({type:'join'})` returned not ok: `redis-room.js` bounds every
request at `REQUEST_MS` (7 s), and the first request of a freshly leased room also pays the
room's load (taking the lease, unpacking the checkpoint, building the world and migrating the
checkpoint to the served revision; the one-step rollback walks four occupants home through five
districts). That load is synchronous CPU work, so on a loaded 4-vCPU runner it held the event
loop past the 7 s timer, which fired at 11.6 s and bounced the join. Not a slow test wait: the
first visitor after a deploy whose migration outlives 7 s is refused by the server itself.

## Change

- `server/redis-room.js`: a request that finds the room without a loaded state (`cached` null:
  a fresh process, a lost lease or a failed commit) first awaits the loading tick, bounded by a new
  `LOAD_MS` (20 s), and only then starts its `REQUEST_MS` response deadline; the outer race timer
  grows by the same allowance for that request only. A loaded room's budget is unchanged (7 s).
  A follower (another process holds the lease) is unchanged: its tick returns at once without
  loading. Errors from the loading tick (`Invalid durable …`) still propagate as before.
- `server/tests/redis-room.test.js`: the stalled-commit test now stalls the commit of a loaded
  room (alice joined, bob's commit stalls) so it keeps proving the 7 s deadline and that the
  tentative join is not published; a new test holds the lease acquisition 7.5 s past the request
  window and requires the first join to succeed afterwards, with nothing published meanwhile.
- `server/tests/stack-activation-rehearsal.test.js`: the first-snapshot wait is 600 × 50 ms
  (30 s), ends early on a socket close, and fails with the socket's open/close timing, the first
  message types and the node's last twelve log lines when no snapshot comes. The in-room `send`
  timeout (8 s) is unchanged.

## Checks

Local checks use the isolated Redis at `127.0.0.1:16586`; host one-minute load 3–4 unless noted.

| Check | Head | Result |
| --- | --- | --- |
| `REDIS_URL=… node --test server/tests/stack-activation-rehearsal.test.js` ×2 | `65bdec99` | Passed twice, 57.9 s and 59.4 s whole-test (unfixed local passes took 37.9 s and 37.5 s; duration varies with host load). |
| Hosted checks on `65bdec99` (PR #756) | `65bdec99` | 27/27; `preview checks` passed first attempt. One sample. |
| Hosted checks on `877b2e9a` (ledger-only) | `877b2e9a` | 25/27: `preview checks` failed the same assertion at 68.4 s with the 30 s wait in place; no diagnostics on that head. |
| Rehearsal with the diagnostics: alone, then twice beside the full Redis server suite | `5b0b1e29` | 29.3 s, 35.4 s, 30.4 s, all passed. |
| Hosted checks on `5b0b1e29` | `5b0b1e29` | 26/27: `preview checks` failed with the diagnostic quoted under Finding (closed 1013 after 11,616 ms, no message, no new migration logged). |
| `REDIS_URL=… node --test server/tests/redis-room.test.js` | fix (uncommitted) | 22 passed, 0 failed, 0 skipped, 62.9 s; the reworked stalled-commit test 7.0 s, the new slow-first-load test 7.5 s. |
| `REDIS_URL=… node --test server/tests/stack-activation-rehearsal.test.js` ×2 | fix (uncommitted) | Passed twice, 29.1 s and 28.9 s. |
| `REDIS_URL=… pnpm run test:server` (whole server suite with Redis) | fix (uncommitted) | 1,403 passed, 0 failed, 0 skipped (119 s), with the new and reworked room tests included. |
| `pnpm run verify` (core) | fix (uncommitted) | Passed 2026-10-29T04:06:38Z (`.runtime/agent/core.json`): tooling 289; preview 4,348 + 1 existing skip; server 1,077 + 284 Redis skips (covered by the row above); desktop 127 + 5 skips; Ruff; pytest 170; demo and demo-verify; secret scan clean. |
| Hosted checks on the fix | fix | `8e6668cb` 27/27 success (run 40815957232); `preview checks` passed first attempt (04:07–04:22Z), rehearsal 44.5 s on the runner, the new room tests 7.0 s and 7.5 s. One sample against a one-in-four failure rate on main; the ledger-only push after this adds a second. |

Main's `preview checks` job on its last twelve Verify runs (2026-10-28 12:59–21:04Z): failed on
`36e906b2`, `e5cfada6` and `7cc1fb87`, passed on the other nine (the `be166248` run failed
elsewhere). About one in four main runs, every other run late in the day.

## Gaps

- The loading allowance (`LOAD_MS`, 20 s) is chosen from one hosted sample (the timer fired at
  11.6 s) with margin under the rehearsal's 30 s first-snapshot wait; a runner slower than that
  still fails the rehearsal, now with the socket close and log in the message. The combined
  budget for a request that both loads and stalls (`LOAD_MS + REQUEST_MS`, 27 s) is not covered
  by a test: proving it costs 27 s per run, and the stalled-commit test covers the loaded-room
  deadline that matters in steady state.
- Hosted `preview checks` passes about three runs in four on main without the fix, so one green
  hosted run on the fix is weak evidence; main after landing is the statistic.
- Warming the configured world's room at gateway boot (before `listen`) would move the load
  ahead of the first visitor entirely; not done here, since the lease may still be held by the
  draining deployment during overlap and the request-side fix covers every reload path.

## Next step

Watch the second hosted sample (this ledger push) and PR #729's `preview checks` once this lands.
Mark ready and land only with Val's authorization.
