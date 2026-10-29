# Hosted stack rehearsal #754 implementation and evidence ledger

Goal: reliable hosted verification while retaining real Redis, gateways, sockets, all
thirteen deployment steps and twelve migrations, rollback and stale-writer guarantees.
Spec: issue #754 and Val's October 28 investigation/fix request.
Base: main `7cc1fb871d41c6ec0f166d89e4ef559f17728e5e`.
Owner: codex:754-92122fc50826; branch `fix/754-stack-rehearsal`.

## Plan
- [ ] Reproduce the first-attempt failure with isolated disposable Redis and inspect
  gateway admission, lease/commit, socket lifecycle and event-loop timings.
- [ ] Add test-only timing/close diagnostics and a failing-first behavioral regression
  for the demonstrated failure mechanism; implement the narrow correction.
- [ ] Verify focused tests, Redis server suite, core gate and hosted checks as available;
  publish a focused draft PR recording first failures and evidence limits.

Production timeout policies, lease fencing, district activation and authentication are
out of scope for accommodation changes. No retries may convert a failed rehearsal to pass.

## Initial findings
- Issue #754 has no corrective implementation; no matching local task claim exists.
- Latest main Verify run 40768823845, first attempt: preview checks fails with
  `alice snapshot on river-oaks-gardens-3@7` after 59.57 s; all other preview jobs pass.
- `join` swallows socket errors and ignores close; warnings are captured and hidden
  unless debug is enabled. Its eight-second poll can hide a terminal 1013 rejection.
- Server request deadline is 7 s; Redis writer lease is 5 s. The synchronous rollback
  migration chain is performed before the fenced commit. Hypothesis pending timings:
  CPU contention makes migration overrun a lease/request deadline.
- Existing local worktrees belong to Pink Jet-Age work; preserve them. No cleanup
  candidate has an owner release. A sibling task worktree was created from fresh main.
- Tool bootstrap: inherited pnpm 11 rejected by project; using existing pnpm 10.34.5.
  Redis absent; unpacking Ubuntu Redis 7.0.15 locally (hosted uses Redis 7.4.11).
  No credentials or environment files copied.

## Reproduction and correction
- First baseline isolated rehearsal failed at the exact Gardens@7 assertion (54.73 s).
  A diagnostic run failed again (44.87 s): commit held lease 5,386 ms and returned 0;
  max event-loop stall 5,247 ms; Alice closed 1013 at 10,031 ms. These commands use
  an isolated loopback Redis process and unique namespaces. Earlier bootstrap
  connection-refused attempts are setup failures, not test evidence.
- A concurrent second baseline run passed (65.70 s). It remains an intermittent pass,
  not a rebuttal of the failed first attempt. Its nonexistent extra filenames did
  not add coverage; the only executed test was the stack rehearsal.
- CPU profile of a four-player Woodland→Gardens recovery: TypeSafe candidate refusal
  499 ms; Woodland recovery 5,070 ms. Most sampled CPU: `store-clearance.js`
  candidate-distance sorting and candidate construction. This pure layout helper
  runs repeatedly while fresh source/target worlds validate the migration chain.
- Ruling: optimize the shared clearance helper rather than increase any lease or
  timeout — measured compute overruns a real writer lease; preserving exact nearest
  candidates and stable ties preserves world/activation behavior. Cost if wrong:
  changed authored resident positions; focused placement tests and full real-room
  position comparison explicitly check that risk.
- Minimal algorithm: scan the existing candidate order once, retain the nearest free
  candidate with strict `<` (first equal-distance candidate wins). Same clamping,
  distance, collision and spacing predicates, grid and staff facing.
- All Woodland store-room people JSON compared byte-for-byte to the original before
  the change (including positions/facing); comparison passed. Recovery on the same
  four-player fixture now 2,222 ms (+351 ms rejected TypeSafe candidate).
- Original wait extracted into a real-WebSocket regression: terminal 1013 close
  fails first (wait times out, code undefined); event-driven observer passes 3/3,
  retaining an 8 s deadline. Open/non-snapshot frames cannot count as admission.
- Stale deployment assertion tightened: requires a terminal 1013, not any caught
  exception. Failure/success receipt records joins, ticket/open/snapshot timing,
  observed Redis lease-held time/commit outcomes and event-loop max; hosted workflow
  uploads an attempt-numbered artifact even when the server suite fails.

## Review and verification in progress
- Independent fresh review: one P2, receipt write failure could abort resource teardown.
  Corrected with unconditional teardown in `finally`; observer focused tests remain 3/3.
- First optimized isolated stack run: passed, 35.374 s, no skips. All thirteen deploys,
  twelve migrations and stale refusal assertions ran. Its first diagnostic wrapper
  covered `evalBuffer` only, so commit counts were absent, not zero-rejection proof;
  corrected to observe `eval` (commit) as well before the full suite.
- Core first attempt: failed at tooling, 284/289 passed; five failures all in
  `scripts/tests/project-prune-cancel.test.js` from `ps -axo command=` returning
  `fatal library error, lookup self`. Remaining core stages not run by that command.
  Original receipt retained at `.runtime/754/core-first-failure.json`.
- Redis suite is being run independently so this unrelated environment failure
  does not prevent verification of the fix. Redis recovery prerequisites are local
  unpacked executables, with no changes to project dependencies or production data.
- GitHub connector-created commits are unsigned (verified via commit API), despite
  using contents writes. Keep the PR draft and record signing as a landing blocker;
  do not weaken signature requirements. No merge is authorized by this task.
