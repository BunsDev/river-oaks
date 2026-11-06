# v0.3.0: attribute the CPU and frame excess beyond #708

Objective: name the commits behind the warmed-performance excess against v0.2.2 that #708 does not
explain, fix what can be fixed in small PRs, and run the `--reconnect-backoff=skip` diagnostic.
Results go to `v030-blockers-20261103`, which this session now owns.
Budgets are not changed here.

Owner: `claude:river-oaks-4f (3158e24e)` since 2026-11-06 01:31Z, taken over from `claude:river-oaks-28 (e724ab60)`, who wrote everything above "Takeover" (not live: absent from ListAgents, no process on its worktrees, nothing written after 2026-11-04 14:22Z, lease expired). Task `v030-perf-attribution-20261103`, branch
`docs/v030-perf-attribution-20261103`. Arm worktree: detached `river-oaks-v030-perf-arm`.

Split with river-oaks-5d (2026-11-03 02:32Z): it owns the #708 listeners, `world-streaming`, the
resident-figure bound and the final re-qualify. This ledger owns the rest of the attribution and
the reconnect diagnostic.

## Recorded arms (2026-11-02 receipts, Gardens spawn, full protocol)

Median per arm from `report.json` in the qualification worktrees. Arms come from different ABBA
sets, so timing across sets is context only; the counts are stable.

| Commit | Desktop 1p calls | Geometries | Desktop 1p CPU p95 (two arms) | Desktop 2p frame mean (two arms) |
| --- | ---: | ---: | --- | --- |
| `f4dd959a` v0.2.2 | 1629–1630 | 530 | 9.5, 8.4 | 25.70, 24.48 |
| `33ade52a` #708's parent | 1825 | 607 | 10.2, 9.5 | 26.14, 24.31 |
| `f0d01729` #708 | 1932–1940 | 691 | 10.0, 10.1 | 26.93, 26.96 |
| `b9a48487` | 1946–1952 | 693 | 10.2, 11.2 | 28.03, 28.89 |
| `a42b3835` candidate | 1978 | 700 | 11.1, 11.2 / 10.4, 10.1 | 29.44, 29.33 / 28.66, 28.19 |

## Method

1. **Count sweep.** `.runtime/v030-attr/sweep.mjs` runs the unmodified audit at first-parent
   commits (short samples, desktop, one reconnect) and subdivides any interval where 1p calls moved
   by at least 8 or geometries by at least 5. Its timing is not evidence. It uses
   `RIVER_OAKS_BROWSER_LOCK=off`, starts each step at one-minute load below 8, records start and
   end times, and pauses while an ABBA or baseline owner is in the lock queue (agreed with
   river-oaks-5d, whose journeys hold the lock).
2. **ABBA** at the named contributors, under one held browser lock with the load gate inside it.
3. **Reconnect diagnostic** with `--reconnect-backoff=skip`.

## Results

### Draw-call attribution (counts, desktop 1p, Gardens spawn)

First-parent sweep, `.runtime/v030-attr/sweep.jsonl`. Counts only. Resident figures make a single
sample move, so comparisons below pair samples with identical submitted triangles.

| Commit | Merge | Calls | Step |
| --- | --- | ---: | ---: |
| `f4dd959a` | v0.2.2 | 1647 | |
| `f3b01149` | #688 city bike racks | 1666 | +19 |
| `aaca45ff` | #770 Jev reference look | 1653 | -15 |
| `986977ef` | **#775 Jevica reference look** | 1825 | **+172** |
| `33ade52a` | #708's parent | 1825 | 0 |
| `f0d01729` | **#708 resident figures** | 1933 | **+108** |
| `8355e0ca` | #834 (one sample) | 1891 | not paired |
| `8a51f750` | main | 1941 | not paired |

The sweep finished (33 probes over 116 commits, `sweep.log`). `f0d01729..8a51f750` has no further step that holds at matched triangles: samples move between 1891 and 1945 calls with the resident figures in view. The largest named step left is #728 (`6b919747`) at +17 at a different triangle count, unpaired.

### Candidate fixes, paired against main `0c040286`

| Tree | Calls at the same state | Saving | Submitted triangles |
| --- | --- | ---: | --- |
| main `0c040286` | 1923 at 6,093,976; 1986 at 6,282,264 | | |
| #878 `c287be87` | 1791 at 6,093,976; 1854 at 6,282,264 | **-132** | unchanged |
| #685 `4544477b` | 1750 at 6,311,371; 1813 at 6,499,659 | **-173** | +217,395 (+3.6%) |

#878's -132 matches a mesh census on the real rig: 76 to 30 shown meshes and 63 to 23 shadow casters
(46 main + 46 AO + 40 shadow). It recovers about 77% of #775's step. The rest of that step is
unattributed.

The two are expected to sum to about 1618 with #708 still in, which is below v0.2.2's 1647. That sum is
arithmetic, not a measurement. Calls are not the budget: CPU p95 and frame mean are, and only the ABBA
decides them.

### ABBA: v0.2.2 vs #878 + #685 (`e1c4b28d`), 2026-11-03 06:01–07:05Z

`river-oaks-v030-combined/.runtime/abba/` (`arms.json`, `compare.json`, `compare-skip.json`).
Wrapper held the lock once as "v0.3.0 perf ABBA baseline". Each arm started at one-minute load
below 8, but the samples ran at load 9–19, against 4–6 for the 2026-11-02 qualification. Lock-free
work in other sessions ran beside it, including a `verify full` from a `git archive` snapshot
(session `f0c942c9`) and a `shared-runner` in `river-oaks-seat-chat-ui-825`. The two v0.2.2 arms
differ by 18% on desktop 1p CPU p95 (12.0 and 10.2 ms), so this is direction, not a gate result.

| Workload | Metric | v0.2.2 | Combined | Change |
| --- | --- | ---: | ---: | ---: |
| desktop 1p | CPU p95 | 11.10 | 12.75 | +14.9% |
| desktop 2p | CPU p95 | 12.60 | 16.55 | +31.3% |
| desktop 2p | frame mean | 26.69 | 33.54 | +25.7% |
| phone 1p | CPU p95 | 8.80 | 10.80 | +22.7% |
| phone 2p | CPU p95 | 10.40 | 13.35 | +28.4% |
| phone 2p | frame mean | 21.49 | 24.50 | +14.0% |

**NOT MET** even with both fixes. Draw calls are now within 4% of v0.2.2 (desktop 1p 1629 to 1696),
but triangles are +18% and geometries +33%. Per-frame phase medians, v0.2.2 to combined:
`players` +0.60 to +1.10 ms in every workload; `pipeline` +0.10 (1p) and +1.40 to +1.70 ms (2p).

**Reconnect, `--reconnect-backoff=skip`** (five rejoins per arm, no overlap between trees):

| | v0.2.2 A1 | combined B1 | combined B2 | v0.2.2 A2 |
| --- | --- | --- | --- | --- |
| desktop ms | 197, 176, 246, 191, 208 | 841, 626, 612, 605, 736 | 475, 606, 519, 554, 473 | 216, 232, 217, 200, 233 |
| phone ms | 168, 219, 195, 214, 196 | 256, 220, 358, 292, 426 | 151, 162, 301, 259, 277 | 143, 150, 130, 172, 172 |

Medians 207 to 572 ms desktop (+176%), 173 to 276 ms phone (+59%). The reconnect slowdown is real,
not the client's retry delay. Its cause is not yet attributed.

**CPU profile** (one 20 s window, desktop 2p, `--cpu-profile=on`, load 10–13; leads, not shares):
new inclusive cost in `player-avatar.js` update (6.4% of the profile), `jevica-costume.js` update
(5.2%, with `jevica-drape.js` `columnRadius` 2.2% self), `remote-players.js` update (3.3%), foot
placement (1.2%), bird cams (0.5%), and shader compiles inside the sample window.

### ABBA: v0.2.2 vs `e1c4b28d` with every client on the low figure budget, 07:25–07:58Z

`river-oaks-v030-lowfig` (detached; `residentFigureBudget` always returns the low budget, 3 within
30 m). Samples at load 5–9; the v0.2.2 arms agreed (desktop 1p 8.3 and 8.3 ms).

| Workload | CPU p95 | Frame mean |
| --- | ---: | ---: |
| desktop 1p | +6.6% | +0.1% |
| desktop 2p | +8.9% | +4.1% |
| phone 1p | +9.7% | 0.0% |
| phone 2p | **+11.0% over** | +5.4% |

Reconnect (keep): desktop +16.0%, phone -11.3%, within. So the resident figures are the largest
remaining cost after #878 and #685.

### ABBA: v0.2.2 vs `e1c4b28d` + #882's bound (8 figures, beyond 30 m quarter rate, no shadow), 08:11–08:44Z

`river-oaks-v030-lod` (detached, #882's diff applied uncommitted, so reports say `e1c4b28d`).
Samples at load 4–7, the quietest set.

| Workload | CPU p95 | Frame mean |
| --- | ---: | ---: |
| desktop 1p | +12.5% over | 0.0% |
| desktop 2p | +18.8% over | +10.8% over |
| phone 1p | +13.8% over | 0.0% |
| phone 2p | +16.6% over | +7.1% |

Reconnect (keep): desktop +42.6% over, phone -4.3%. Keeping all eight figures with #882's bound is not
enough. Only the low budget for everyone came close.

**Reconnect, `--reconnect-backoff=skip`, same set:** desktop 210.89 to 597.16 ms (+183%), phone 154.76 to 309.80 ms (+100%). Same slowdown as the combined arms, so #882's bound did not touch it.

### Reconnect attribution, `--reconnect-backoff=skip`, 2026-11-03 23:54 to 00:10Z

`.runtime/v030-attr/reconnect.mjs`, one held lock, each arm started at load below 8, five rejoins per arm, medians in ms. One arm per tree except v0.2.2, so read this as attribution, not a gate result.

| Tree | Desktop | Phone |
| --- | ---: | ---: |
| v0.2.2 `f4dd959a` (first arm) | 238 | 208 |
| `33ade52a` #708's parent | 265 | 300 |
| **`f0d01729` #708** | **703** | 389 |
| `e1c4b28d` #878 + #685 | 514 | 252 |
| `a42b3835` old candidate | 477 | 287 |
| **`e1c4b28d` + low budget** | **248** | 219 |
| v0.2.2 `f4dd959a` (last arm) | 225 | 158 |

The desktop slowdown enters at #708 (+438 ms) and the low resident budget removes it (248 ms against 225 to 238 ms). Phone stays noisier: 219 ms against 158 to 208 ms. The re-qualification ABBA decides this row.

## Val's decisions (2026-11-03)

- Every client draws the low resident budget for 0.3.0: three within 30 m (#882, reworked from the bound measured above).
- The last excess is still open, not accepted: phone 2p CPU p95 (+11.0%, about +0.95 ms) and the reconnect slowdown.
- `v030-blockers-20261103` moved to this session. river-oaks-5d stopped with no runs left.

## Reviews of the fixes

Independent read-only reviews on 2026-11-03:

- #878 `c287be87`: no findings.
- #882: a resident within 5 m of the set's farthest figure stayed undrawn behind a full set of three, while the town could refuse a build for them. Fixed with a smaller swap margin within 4 m; the test failed first.
- #685 `4544477b`: `buildStoreInteriors` silenced the casters of streamed Gallery rooms (`osm-way-625333006/l0` and `l1`), whose proxies nothing shows. Now only the District build opts in. The IPIC cull also left other stores' proxies drawing; `renderOnly` now silences those. Both tests failed first. #685's parity is rerun after these.

## Gaps

- Main's Verify on `8a51f750` (a CI-action bump) failed `ribbonwing-passenger` on attempt 1
  ("stopped short of landing", 3.57 m; run 41501249712, job 125468999926). The one rerun, attempt 2,
  passed at 02:36:48Z. Same journey as #798 with a different signature, after #841's landing change.
  Not classified further here: `ci-streak-pr-drain-20261102` owns the flake ledger, and its owner
  has no running process.
- Sweep counts ran with `RIVER_OAKS_BROWSER_LOCK=off`, at load below 8, beside river-oaks-5d's journeys.

## Next step

Land #878, #685, #882. Then measure the reconnect slowdown and phone 2p on that head, and attribute what remains.

## Takeover (2026-11-06)

This ledger was left uncommitted in `river-oaks-v030-perf-attr`; it is committed here unchanged above this section. #878, #685 and #882 are on main (`1dc64db1`). The ABBA at `5ced6522` on 2026-11-04 (`river-oaks-v030-combined/.runtime/abba/arms.json`, 02:16 to 03:26Z) ran at load 9 to 19 and is void for two-player; the phone CPU profile at 14:12Z died at Chromium launch (error 141). Neither is evidence.

Val's goal (2026-11-06): phone two-player and reconnect are still not accepted; attribute and fix, never rerun for a pass. Next: `v030-drape-reach-20261106` (the drape updates only the rows the peplum reads, exact output) and a phone-viewport ABC under one lock: v0.2.2, main, main plus the drape change. The gate itself is the ABBA on the head pinned after #885.

