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

## Change

`server/tests/stack-activation-rehearsal.test.js`: the first-snapshot wait is 600 × 50 ms
(30 s) with the measurement in a comment. The in-room `send` timeout (8 s) is unchanged. A node
that never answers still fails, 22 s later than before, inside the test timeout.

## Checks

| Check | Result |
| --- | --- |
| `REDIS_URL=redis://127.0.0.1:16586 node --test server/tests/stack-activation-rehearsal.test.js` ×2 | Passed twice, 57.9 s and 59.4 s whole-test (the earlier two unfixed local passes took 37.9 s and 37.5 s; local duration varies with host load, matching the 42–59 s hosted spread). |
| `pnpm run verify` (core) | undefined |
| Hosted `preview checks` on the PR head | HOSTED_PLACEHOLDER |

## Gaps

- The runner-side latency itself is not measured (the test's receipt does not record it); the
  30 s figure is a margin over the local measurement, not a runner measurement.
- The flake can only be shown fixed statistically: hosted runs on this PR and on main after it.

## Next step

Draft PR; hosted `preview checks` is the evidence. Mark ready and land only with Val's
authorization.
