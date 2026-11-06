# Clear the v0.3.0 release blockers

Objective: clear the gates that left v0.3.0 BLOCKED on `a42b3835`
([qualification ledger](2026-11-02-release-v030.md)), then give a fresh GO or BLOCKED on a new
pinned `main` head. BLOCKED with a measured residual and a named cause is an acceptable outcome. A
loosened budget is not.

Owner: `claude:river-oaks-4f (3158e24e)` since 2026-11-06 01:50Z, taken over from `claude:river-oaks-28 (e724ab60)` (see Takeover), who took it over from river-oaks-5d by Val's decision on 2026-11-03. Task `v030-blockers-20261103`, branch
`fix/v030-blockers-20261103`.

## Authority

Val's goal, as `/goal` in session `e724ab60`. Landing is authorized once required local checks, review and hosted preview pass, except a change to a budget, rollback behavior or the default finish. Val separately chose the low resident budget for every client on 2026-11-03. Not authorized: tag, version bump, publish, deploy, production access, paid services, large downloads, reverting #831, closing other owners' PRs.

Since 2026-11-06, Val's goal in session `3158e24e`: close this PR's gaps, mark it ready, and land it **only once Val authorizes the merge**; then pin the head, rerun rows 3, 4b and 5, core, `verify full` and hosted, and post GO or BLOCKED on #359 and #587. Phone two-player and reconnect are not accepted (Val, 2026-11-03): attribute and fix, never rerun for a pass. One browser lock, caffeinate, load <8. Tag, publish and deploy stay with Val.

## Takeover

On 2026-11-06 at about 01:50Z, river-oaks-28 was not live: it was absent from ListAgents, no process held any of its ten worktrees (`lsof +D`), nothing had been written there since 2026-11-04 14:22Z, its lease had expired at 11:39Z that day, and the land queue was empty. Its worktrees and `.runtime` receipts are preserved unchanged.

Its last chain (`.runtime/v030-blockers-receipts/chain2.log`, `e3bac30b` plus five uncommitted files) passed core at 04:33Z. The `graphics-recovery` and `world-streaming` runs after it, and the leak control in `river-oaks-v030-lowfig`, all died at Chromium launch (`bootstrap_check_in … unknown error code (141)`, the stale-daemon failure after a macOS re-login). They are void, not results.

The five uncommitted files were river-oaks-28's tightening of the bound, committed here after review and a 5/5 unit run:
- only a figure actually shown excuses anything, read in the frame that drew it, so a step behind the camera cannot pass;
- a hidden scene object that shares a resource keeps it counted;
- no figure excuses more than the most one was measured to add: 25 geometries and 5 textures (measured up to 23 and 5).

## Files owned

- this ledger
- `preview/e2e/graphics-recovery.js`, `preview/e2e/world-streaming.js`, `preview/e2e/resource-bounds.js`
- `preview/src/figure-resources.js`, `preview/tests/resident-figure-resources.test.js`
- one development-only line each in `preview/src/main.js` and `preview/src/remote-players.js`

## Landed for this gate

| PR | Merge | Change |
| --- | --- | --- |
| #878 | `ce7d140c` | Jevica rigid parts batched |
| #882 | `5ca62273` | every client on three resident figures within 30 m |
| #685 | `5ced6522` | sun-shadow proxies |

## graphics-recovery: no leak from #708 found

The goal assumed #708 leaks GPU-resource listeners across context restore. The evidence does not support that. Context loss empties three's disposal listeners and each resource registers again on its next draw, so the raw count says which objects have been in view since the restore.

Listeners across five restores:

| Run | Tree | Listeners | Result |
| --- | --- | --- | --- |
| Raw sampling, listener diagnostic | `8a51f750` | 2330, 2344, 2345, 2345, 2345 | rises with draws, resources unchanged |
| Draw everything first | `8a51f750` | 2560 ×5 | pass |
| Draw first + settled sampling | `240b4dbd` (#685+#882+#878) | 2461, 2461, 2461, 2451, 2448 | pass |
| Same, with 21 listeners injected per restore (control) | `240b4dbd` | 2501, 2524, 2545, 2566, 2577 | **fails**, on the listener check only |

The journey change is test-only: draw everything once, then sample when two reads a second apart agree. The control shows it still catches a real leak. Logs: `.runtime/v030-blockers-receipts/` and `integ/`.

## world-streaming: the swing is resident figures, not retention

Earlier single runs, one run each at different load: `33ade52a` passed, `f0d01729` failed 8 of 20 laps on the evicted GPU bound.

`240b4dbd` with per-lap counts (`integ/streaming.log`, 01:00 to 02:16Z), failed 5 laps of the unchanged bound. Geometries by figures drawn, measured laps 3 to 22:

| State, client | 0 figures | 1 | 2 | 3 |
| --- | ---: | ---: | ---: | ---: |
| loaded, A | **883** (9 laps) | 883–906 | 918–928 | |
| loaded, B | **832** (9 laps) | 848–855 | 877 | |
| evicted, A | **769** (4 laps) | 769–788 | 811 | 790–833 |
| evicted, B | **718** (3 laps) | 737–739 | 757 | 739–784 |

**Measured justification for a resident-aware bound:** with no figures drawn the counts are identical on every lap from lap 7 to lap 17, and scene objects are 9093 loaded and 8610 evicted on all 22 laps. Nothing is retained. The bound compared a lap with three figures against a baseline with fewer, and each figure adds about 15 to 25 geometries.

The limits stay +20 objects, +20 geometries and +10 textures. `preview/e2e/resource-bounds.js` removes, from both sides, only what the drawn figures alone hold (`preview/src/figure-resources.js`). A resource shared with anything else still counts, and anything retained alongside figures still fails (`preview/tests/resident-figure-resources.test.js`). This is the bound change the goal allowed; the PR names it so Val can read it.

## Gaps

- The resident-aware bound has no full `world-streaming` run yet, and no injected per-lap leak was run end to end. The unit tests cover the arithmetic. Running now from a detached snapshot (see Runs).
- `graphics-recovery` still compares raw counts, with figures allowed to change between samples. It passed, and it could flake if a new figure walks in during a sample.

## Runs

Pending: core on the merged head, then `graphics-recovery`, a full `world-streaming` and the same journey with three drawn geometries retained per measure (must fail on the resource bound), in one browser lock under caffeinate, each gated on 1- and 5-minute load <8.

## Next step

Read the runs, record them here, mark #885 ready, and ask Val for merge authorization. After the merge, pin the head and re-qualify every gate row in `2026-11-02-release-v030.md`.
