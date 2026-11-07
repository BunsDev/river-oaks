# Clear the v0.3.0 release blockers

Objective: clear the gates that left v0.3.0 BLOCKED on `a42b3835`
([qualification ledger](2026-11-02-release-v030.md)), then give a fresh GO or BLOCKED on a new
pinned `main` head. BLOCKED with a measured residual and a named cause is an acceptable outcome. A
loosened budget is not.

Owner: `claude:river-oaks-c7 (178fa13a)` since 2026-11-06 23:59Z, taken over from `claude:river-oaks-4f (3158e24e)` (see Takeover). river-oaks-4f took it over from `claude:river-oaks-28 (e724ab60)` on 2026-11-06 01:31Z, who took it over from river-oaks-5d by Val's decision on 2026-11-03. Task `v030-blockers-20261103`, branch
`fix/v030-blockers-20261103`.

## Authority

Val's goal, as `/goal` in session `e724ab60`. Landing is authorized once required local checks, review and hosted preview pass, except a change to a budget, rollback behavior or the default finish. Val separately chose the low resident budget for every client on 2026-11-03. Not authorized: tag, version bump, publish, deploy, production access, paid services, large downloads, reverting #831, closing other owners' PRs.

Since 2026-11-06, Val's goal in session `3158e24e`: close this PR's gaps, mark it ready, and land it **only once Val authorizes the merge**; then pin the head, rerun rows 3, 4b and 5, core, `verify full` and hosted, and post GO or BLOCKED on #359 and #587. Phone two-player and reconnect are not accepted (Val, 2026-11-03): attribute and fix, never rerun for a pass. One browser lock, caffeinate, load <8. Tag, publish and deploy stay with Val.

Since 2026-11-06 23:59Z, Val's goal in session `178fa13a` keeps that scope: bring #885 green on current `main`, land it once Val authorizes, pin the head, then fix the phone two-player +11% and reconnect regressions against v0.2.2 and post GO or BLOCKED on #359.

## Takeover

On 2026-11-06 at about 01:31Z, river-oaks-28 was not live: it was absent from ListAgents, no process held any of its ten worktrees (`lsof +D`), nothing had been written there since 2026-11-04 14:22Z, its lease had expired at 11:39Z that day, and the land queue was empty. Its worktrees and `.runtime` receipts are preserved unchanged.

Its last chain (`.runtime/v030-blockers-receipts/chain2.log`, `e3bac30b` plus five uncommitted files) passed core at 04:33Z. The `graphics-recovery` and `world-streaming` runs after it, and the leak control in `river-oaks-v030-lowfig`, all died at Chromium launch (`bootstrap_check_in … unknown error code (141)`, the stale-daemon failure after a macOS re-login). They are void, not results.

The five uncommitted files were river-oaks-28's tightening of the bound, committed here after review and a 5/5 unit run:
- only a figure actually shown excuses anything, read in the frame that drew it, so a step behind the camera cannot pass;
- a hidden scene object that shares a resource keeps it counted;
- no figure excuses more than the most one was measured to add: 25 geometries and 5 textures (measured up to 23 and 5).

On 2026-11-06 at 23:59Z, river-oaks-4f was not live: it was absent from ListAgents, its chain pids (71829, 20526) were gone, no process held files in its four worktrees, nothing had been written there since 02:15Z, its leases had expired between 07:31Z and 09:38Z, and the land queue was idle. Its snapshot `river-oaks-v030-qualify-4f` and receipts (`.runtime/v030-qualify/`) are preserved unchanged.

Its last chain ran on `94ae357c`. Core passed at 02:07Z, and `graphics-recovery` failed at 02:15Z on the listener check (listeners 2553, 2555, 2555, 2545, 2545; geometries 723, 725, 725, 723, 723). The chain stopped there. The cause is below.

## Files owned

- this ledger
- `preview/e2e/graphics-recovery.js`, `preview/e2e/world-streaming.js`, `preview/e2e/resource-bounds.js`
- `preview/src/figure-resources.js`, `preview/tests/resident-figure-resources.test.js`
- the shadow-proxy rule in `preview/src/landscape-models.js` and its test in `preview/tests/landscape-models.test.js`
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

### 2026-11-07: the +2 after the first restore was two birds' shadow proxies

On `94ae357c` (river-oaks-4f) and again on `89c6ad12` (main merged in), the count rose by 2 listeners and 2 geometries after the first restore and then held. A scratch probe that diffs every scene resource's listeners between samples named both: the hidden shadow proxies of the Mourning dove and the Cardinal, under the bird cams. Each went from 0 to 1 listener and stayed at 1. Nothing was retained: the restore disposes every scene resource, hidden ones included (`releaseSceneGraphics`), so each sample counts what has been drawn since its own restore.

A proxy is shown only while the sun draws its map, and only inside the sun's frustum (`castShadowsFromProxies`). The development registration turns frustum culling off, but that frustum test was the proxy rule's own, so a bird flying outside the sun's frustum was not drawn at the first sample and was drawn by the second. The figures were not the cause: three were shown in every sample, with the same resources in all but one.

The fix makes the proxy rule follow three's own shadow-pass test: a casting proxy is shown when it is inside the frustum **or its culling is off**. No production proxy turns culling off, so play is unchanged; the registration now reaches every proxy. A unit assertion covers it (`preview/tests/landscape-models.test.js`).

The figure-aware listener bound stays for the gap below: figures do change during the cycles (one swap moved the count by -10 listeners at the fifth sample, on both trees). It leaves out what the shown figures alone hold, now counting their materials and bone textures as well, capped at 55 listeners per figure (51 measured across 120 samples by a scratch probe).

| Run, `89c6ad12` + this patch's files | Listeners across five restores | Result |
| --- | --- | --- |
| Before the proxy fix | 2552, 2554, 2554, 2554, 2544 | **fails**; the diff probe names the two bird proxies |
| Diff probe, after the fix | 2620 ×5 | no resource changed between samples |
| `graphics-recovery`, after the fix | 2620 ×5 (725 geometries, 214 textures ×5) | pass, 26 checks |
| Same, 21 listeners injected per restore (control) | 2662, 2683, 2704, 2725, 2746 | **fails**, on the listener check |

The count is higher after the fix because the registration now also draws the proxies outside the sun's frustum; the geometry count is the same. Logs: `river-oaks-v030-qualify-c7/.runtime/v030-graphics/`.

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

### 2026-11-07 full run on `465413bb`: one lap over, from a figure's shared geometry

`river-oaks-v030-qualify-c7`, 01:56 to 03:11Z, load 6 to 8 at start. All other checks passed. The bound failed at lap 20, on client B's loaded state only: 890 geometries against 855 at the baseline. Net of what the shown figures alone hold, every lap is flat: loaded 883 (A) on laps 2 to 22, and 832 (B) on all of them except lap 20. Evicted is 769 (A) and 718 (B) on every lap. Scene objects are 9093 and 8610 on all 22.

At lap 20, client B showed two figures that added 58 geometries, but only 35 counted as theirs alone. The other 23, one figure's worth, are also held by some object outside the figures that was not drawn. Avatars are `SkeletonUtils.clone`s of one cached template per appearance (`instantiateAvatar`), and residents wear the appearances players can wear, so every wearer of a look shares its geometries. The leak control was stopped before it started, because it would be void once the figure accounting changes.

A scratch probe (120 samples at the District spawn, 03:44Z) listed, for every shown figure, the resources some object outside the figures also uses. In 57 of 120 samples a resident shared geometry only with objects that are never drawn: a hidden avatar holder directly under the scene (Jevica-rig body, hair, brows, lashes) and hidden boutique staff in the store interiors layer (`man-casual` suit). The old rule kept those counted, though only the figure uploaded them; `remove()` disposes the figure's avatar, which frees them when the figure leaves.

That explains part of lap 20, not all of it. Client A, about 1 m away and most likely drawing the same two residents, had them add 42 geometries, all figure-only. On client B they added 58 and only 35 counted: about 7 shared with an undrawn object (the class above) and about 16 new geometries no shown figure held, freed by the next lap. Those 16 are not attributed.

The rule now counts a shared resource as the figure's unless a **drawn** object outside the figures uses it. An object hidden after it was drawn keeps its upload until disposed, so at most what a shown figure shares with it is excused, and only while that figure is shown. The per-figure caps were re-measured under the new rule (240 samples, two context-loss cycles, 03:50Z): up to 26 geometries, 2 textures and 54 listeners. Caps: 28 geometries, 5 textures (the 2026-11-04 measure) and 58 listeners.

### 2026-11-07 merged head `5800b4c1`: passes, with no texture headroom on one lap

Main `230d8814` (#896, removing retired features) was merged in as signed `5800b4c1`. From the same snapshot moved to `5800b4c1`, under one lock (06:36 to 07:58Z, 1-minute load 4.9 to 5.3 at each start):

- Per-figure caps re-measured (240 samples, two context-loss cycles): up to 54 listeners, 26 geometries and 2 textures. All within 58, 28 and 5.
- `graphics-recovery` **passed**: 2621 listeners, 725 geometries and 214 textures on all five samples; three figures holding 70 geometries alone.
- `world-streaming` **passed**, 20 of 20 measured trips. Net geometries are flat as before: loaded 882–883 (A) and 831–832 (B), evicted 768–769 and 717–718; scene objects 9093 and 8610 on all 22 laps.

Textures had no headroom. The baseline is lap 2, where client A's evicted state had two figures and all five of their textures counted, so its net (274) equalled the no-figure level. On laps 6 to 9 three figures stayed shown and the net rose +7, +8, +9 and **+10** over it; the bound allows +10. Raw textures held at 285 to 287 while the textures counted as the figures' fell from 4 to 2. On every lap with no figure shown (10, 12 and 18 to 22) the net is exactly 274, so nothing is retained. The pre-merge run has the same rise, about 2 to 3 uncounted textures per figure (three figures: 285 to 287 raw, 4 or 5 counted), but its baseline lap had three figures and a net of 282, so later laps stayed under it. Whether the texture bound passes therefore depends on which residents are near on the baseline lap.

Not yet attributed. Refuted (08:02Z probe, 160 samples at the District spawn, `5800b4c1`): bone and morph textures. With 0 to 3 figures (up to 6 bone textures and 9 morph geometries), raw textures stayed 220 to 223, and raw minus the no-figure level minus counted material textures was −2 to +2. A diagnostic world-streaming run (scratch only) is listing, per lap, uploaded textures on hidden parts of shown figures and figure textures a drawn object outside the figures also uses.

## Gaps

- `world-streaming` textures passed with no headroom on the merged head (above); the figure-correlated part not counted as the figures' is not yet attributed.
- The world-streaming leak control showed detection on 12 laps but crashed at lap 18 before its final assertion (see Runs). It was not rerun. Why the page reloaded is unproven. An independent review (session d2e1, 06:28 and 07:37Z) found: the access entry deliberately reloads after any server-answered failed recheck (`access-recheck.js`, fail-closed, unchanged here); the browser fixture's `/auth/session` never answers 503 and sets each identity's expiry an hour from every request, so elapsed time does not explain it; the report kept two console 503s without URLs. Its diagnostics-only patch to `world-streaming.js` (main-frame navigations, HTTP errors by path, failed requests; no query, header, cookie or body; no assertion or bound changed) was reviewed here and is in the diagnostic run above.
- About 16 geometries at lap 20 of the failed `465413bb` run are not attributed; they were freed by the next lap and did not recur in the passing run.
- `graphics-recovery` now leaves out what the shown figures alone hold, as world-streaming does. A figure walking in during the cycles has not been seen in a run; the unit tests cover it.
- One pass of each journey; hosted CI runs neither long journey.

## Runs

From detached snapshot `river-oaks-v030-qualify-c7` (`89c6ad12` plus this patch's files), one browser lock each, under caffeinate, each run gated on 1- and 5-minute load <8:

- 2026-11-07 01:31–01:37Z: figure probe (max 51 listeners per figure), `graphics-recovery` failed (bird proxies, above), listener control failed.
- 01:39Z: diff probe named the two bird proxies.
- 01:44–01:47Z, with the proxy fix: diff probe clean, `graphics-recovery` passed, listener control failed on the listener check.

Core (`pnpm run verify`) on `89c6ad12` plus this patch passed 01:48–01:53Z: tooling 307/307, preview 5272 pass / 1 skip / 30 todo, server 1132 pass / 285 skip, desktop 127 pass / 5 skip, Python 215 passed.

- 01:56–03:11Z: full `world-streaming` on `465413bb` failed lap 20 (above); its leak control was stopped before it started.
- 03:44Z: figure sharing probe (above). 03:50Z: per-figure caps re-measured under the new rule.
- With the drawn-sharer rule and the new caps (`figure-resources.js` here differs from the run snapshot by one comment line, edited after the runs began): 04:05Z `graphics-recovery` passed (2620 listeners ×5, 725 geometries and 214 textures ×5, three figures holding 70 geometries alone); 04:07Z its 21-listener control failed on the listener check (2662 to 2746).

- 04:07–05:21Z, load 5 to 7 at start: full `world-streaming` **passed**, 20 of 20 measured trips within the bound. Net of what the shown figures alone hold, loaded is 882–883 (A) and 831–832 (B) and evicted 768–769 and 717–718 on every lap; scene objects 9093 and 8610 on all 22. The −1 laps are the rule's stated leniency (a geometry a figure shares with an object hidden after it drew). The lap-20 step of the earlier run did not recur.

- 05:21–06:20Z: the same journey with three drawn geometries retained per measure. The bound flagged every measured lap from lap 6 to lap 17 ("Resource bound exceeded", net loaded rising 6 a lap from 897 to 988), against none in the clean run. At lap 18, about 59 minutes in, the run stopped on `window.__riverCarriage is not a function` before its final assertion. The page was on the opening splash with no canvas, so it had reloaded. The detection is shown; a clean end-to-end failure of the control is not. An earlier version of this line tied the stop to the fixture identity's hour; that is withdrawn (see Gaps).
- Core (`pnpm run verify`) on the final tree passed 06:22–06:27Z: tooling 307/307, preview 5272 pass / 1 skip / 30 todo, server 1132 pass / 285 skip, desktop 127 pass / 5 skip, Python 215 passed.
- Merge of main `230d8814` as signed `5800b4c1`. Core on it passed 06:28–06:33Z: tooling 307/307, preview 5238 pass / 1 skip / 30 todo, server 1132 pass / 285 skip, desktop 127 pass / 5 skip, Python 215. Hosted: 34 of 34 checks passed.
- 06:36–07:58Z on `5800b4c1`: cap probe, `graphics-recovery` passed, `world-streaming` passed (above). 08:02–08:07Z: texture probe at the spawn (above).

## Next step

Mark #885 ready and ask Val for merge authorization, naming the texture headroom; do not land before it. Finish attributing the figure-correlated textures; any accounting change is pushed to #885 if it is still open, else opened as its own PR. After the merge, pin the head and re-qualify every gate row in `2026-11-02-release-v030.md`, then the phone two-player and reconnect work in `2026-11-03-v030-perf-attribution.md`.
