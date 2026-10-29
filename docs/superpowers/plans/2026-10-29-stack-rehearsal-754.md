# Stack rehearsal: size the first-snapshot wait to the boot-time migration (#754)

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

## Change

`server/tests/stack-activation-rehearsal.test.js`: the first-snapshot wait is 600 × 50 ms
(30 s) with the measurement in a comment, ends early on a socket close, and fails with the
socket's open/close timing, the first message types and the node's last twelve log lines when
no snapshot comes. The in-room `send` timeout (8 s) is unchanged.

## Checks

| Check | Result |
| --- | --- |
| `REDIS_URL=redis://127.0.0.1:16586 node --test server/tests/stack-activation-rehearsal.test.js` ×2 | Passed twice, 57.9 s and 59.4 s whole-test (the earlier two unfixed local passes took 37.9 s and 37.5 s; local duration varies with host load, matching the 42–59 s hosted spread). |
| `pnpm run verify` (core) | undefined |
| Hosted checks on `877b2e9a` (ledger-only over `65bdec99`) | 25/27: `preview checks` failed the same assertion at 68.4 s, with the 30 s wait in place; no diagnostics yet on that head. |
| Local with the diagnostics: alone, then twice beside the full Redis server suite | 29.3 s, 35.4 s, 30.4 s, all passed. |
| Hosted checks on `65bdec99` (PR #756) | 27/27 success; `preview checks` passed first attempt (02:55–03:05Z), where main's last two pushes and four #729 heads had failed it. One run is one sample; main after landing is the statistic. |

## Gaps

- The hosted cause is not yet known: a 30 s wait still failed once, so the join either never
  answers or is closed; the diagnostics in this head are the instrument. The flake fails about
  every other hosted run, so one to three hosted runs should produce the attribution.
- Until the cause is fixed, this PR only turns the flake into an attributable failure.

## Next step

Watch hosted `preview checks` on this head for the diagnostic message, then fix the cause
(the next step after attribution). Mark ready and land only with Val's authorization.
