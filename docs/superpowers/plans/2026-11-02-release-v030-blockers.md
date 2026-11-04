# Clear the v0.3.0 release blockers

Objective: clear the gates that left v0.3.0 BLOCKED on `a42b3835`
([qualification ledger](2026-11-02-release-v030.md)), then give a fresh GO or BLOCKED on a new
pinned `main` head. BLOCKED with a measured residual and a named cause is an acceptable outcome. A
loosened budget is not.

Owner: `claude:river-oaks-28 (e724ab60)`, taken over from river-oaks-5d by Val's decision on 2026-11-03. Task `v030-blockers-20261103`, branch
`fix/v030-blockers-20261103`.

## Authority

Val's goal, as `/goal` in session `e724ab60`. Landing is authorized once required local checks, review and hosted preview pass, except a change to a budget, rollback behavior or the default finish. Val separately chose the low resident budget for every client on 2026-11-03. Not authorized: tag, version bump, publish, deploy, production access, paid services, large downloads, reverting #831, closing other owners' PRs.

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

- The resident-aware bound has no full `world-streaming` run yet, and no injected per-lap leak was run end to end. The unit tests cover the arithmetic.
- `graphics-recovery` still compares raw counts, with figures allowed to change between samples. It passed, and it could flake if a new figure walks in during a sample.

## Next step

Core verify and both journeys on this tree, publish, land, then pin the head and re-qualify every gate row in `2026-11-02-release-v030.md`.
