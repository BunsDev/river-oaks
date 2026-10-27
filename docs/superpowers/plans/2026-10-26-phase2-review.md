# Phase 2 engineering and gameplay review (2026-10-26)

## Objective

Review the integrated Phase 2 streaming on main `40f4e786` (#582/#583, delivered by #623 and later fixes): continuous travel, collision, position validation, concurrent players, reconnects, failed loads, repeated transitions and scene cleanup. Profile frame time, memory, asset loading and network behaviour against the Phase 1 baseline. Fix blocking problems with regressions, demonstrate the District → Bayou Market Commons → District journey and document measured results before content production.

Task `phase2-review-20261026`, owner `claude:river-oaks-phase2 (044cb069)`, branch `review/phase2-20261026`, checkout `/Users/buns/Documents/GitHub/BunsDev/river-oaks-phase2-review`. The earlier `phase2-review-582-583` task was cancelled and archived on 2026-10-24; it reviewed a pre-integration patch and is not restored. Evidence runs use a detached snapshot of main `40f4e786` at `/private/tmp/claude-501/-Users-buns-Documents-GitHub-BunsDev-river-oaks/044cb069-f058-43eb-afaa-f967c4a7dea7/scratchpad/phase2-snapshot` so edits here cannot void them.

## Files owned

- `docs/superpowers/plans/2026-10-26-phase2-review.md` (this ledger)
- `docs/acceptance/phase2-review-20261026.md` and its receipts directory
- `preview/src/spatial-chunk-stream.js`, `preview/src/commons-stream.js` and their tests, only where a confirmed finding needs a fix

## Checks

| Check | Command | Result |
| --- | --- | --- |
| Focused streaming/Commons/manifest suites | `node --test preview/tests/spatial-chunk-stream.test.js preview/tests/commons-stream.test.js preview/tests/commons-ride-guard.test.js preview/tests/continuous-walk-582.test.js preview/tests/east-garden-commons.test.js preview/tests/east-garden-commons-ramp.test.js preview/tests/bayou-market-commons.test.js preview/tests/world-manifest.test.js server/tests/east-garden-commons.test.js server/tests/world-manifest.test.js` | 91 passed, 0 failed, 0 skipped on main `40f4e786` (review checkout, 2026-10-26 23:37 UTC) |
| World-streaming journey (two warm-ups + 20 measured round trips, probe client failure/context-loss, reconnect) | `pnpm run test:experience world-streaming` from the snapshot | main: failed lap 8 (eviction wait under load) after 7 clean laps. Corrected source attempt 2: failed lap 22 outward walk (harness walk under load) after 21 clean laps, 2 texture-bound violations on client 0 (+13, pre-existing, outside the streamed chunk). Attempt 3: all 22 round trips completed; failed only the final far-point walk (player 1 inside a building room at load 34); after-twenty heap sample not taken. |
| Matched Gardens vs Commons rendering comparison | `node preview/audit/world-streaming-matched.js` from the snapshot | attempt 1 killed externally; attempt 2 failed (owner socket lost during the first two-client Gardens window at load 24; single-client Gardens windows p95 16.7 ms). Script now reports the loss readably; attempt 3 from a second snapshot passed all four profiles (frame p95 equal to Gardens everywhere, CPU and reconnects below the Phase 1 baseline). |
| Core gate | `pnpm run verify` | attempts 1–3 failed single timing tests under load (each passes alone); attempt 4 at load 13 passed every stage except secrets (raw journey receipt read as keys; receipts compacted, scan passes); attempt 5 (load 12) failed one 300 ms tooling timing case, passes alone ×3; attempt 6 at load 7.5 passed every stage (tooling 276, preview 4,177 + 1 skip, server 915 + 225 Redis skips, desktop 120 + 3 skips, build, Python lint/format/170 tests, demo, demo-verify, secrets); receipt core-attempt-6. Attempt 7 on the merged tree (`1607f32b`, clean, load 7.3) passed every stage: tooling 289, preview 4,241 + 1 skip, server 1,007 + 264 skips, desktop 127 + 5 skips, build, Python, demo, demo-verify, secrets; receipt core-attempt-7 |

## Findings

| Area | Reviewed | Finding and disposition |
| --- | --- | --- |
| Continuous travel | `preview/src/commons-stream.js`, `walking-ui.js` step guards, `preview/e2e/world-streaming.js` | Presentation readiness vetoes only the local mover's walking/flight/bicycle candidates; shared occupancy, World Map and authority stay resident. No defect. |
| Collision and position validation | `server/world.js` pose handler | Finite/level/ground (±0.2 m) checks, speed budget (at most one second of fast walking banked), 0.15 m path sampling against `isFree`/`canFly`, private rooms and suites, bounded elbow acceptance round convex corners. `continuous-walk-582` and server Commons suites cover seam teleports, solid penetration, reserved land and malformed poses. No defect. |
| Concurrent players and reconnect | `multiplayer-client.js` socket rotation/loss/watchdog, server join/leave grace, journey reconnect check | Reconnect within the transport grace keeps identity, appearance and position (0 m drift in the journey); after the grace the player re-spawns at the District arrival, as in Phase 1. Lantern state is re-applied whenever the streamed scene object changes. No Phase 2 defect. |
| Failed loads, timeouts, stale completions | `spatial-chunk-stream.js` | Backoff 1–30 s, 15 s stall accounting against physical pending capacity, abort-fenced late completions, teardown disposal; the probe client's injected failure and two context losses pass in the journey. No defect. |
| Repeated transitions and cleanup | `east-garden-commons.js`, `city-kit/render.js` dispose, `landscape-models.js` cancellation | Owned geometries, materials, instanced meshes and canvas textures are disposed; shared PBR textures and tree templates stay cached by design; cancelled landscape loads are fenced. Node: 3,051,868 geometry bytes per Market build, about 20–25 ms to build, disposal under 1 ms. No leak found in review; the journey's twenty-trip bounds are the measurement. |
| **Visible interruption and churn (fixed)** | `commons-stream.js` frustum retention | Beyond the 110 m radius the chunk was unloaded the instant the camera lost sight of it and rebuilt as soon as it came back: four slow orbits at 150 m rebuilt the Market five times, nine times at 250 m. Each rebuild is a main-thread build of about 3 MB of geometry plus tree instancing and GPU uploads. Fix: a 15 s visibility linger in the adapter; new regressions in `commons-stream.test.js` (orbit builds once; sustained looking away still unloads). The previous "distant camera" test now expects the linger. |
| Scheduler byte accounting (improved) | `spatial-chunk-stream.js` | Candidate selection used the authored estimate (3 MiB) even after a chunk had measured larger (about 7.5 MB in the browser with trees); a second chunk could be built only to be rejected by the ceiling. Fix: the measured size replaces the estimate after a load; regression in `spatial-chunk-stream.test.js`. |
| Naming (deferred minor from the previous review) | `commons-stream.js` notices | Loading/stall/retry notices said "East Garden Commons" while the HUD says "Bayou Market Commons". Notices now use the composed destination's name; covered by the existing failed-import test. |
| Unnecessary complexity | scheduler, adapter, journey harness | One scheduler, one adapter, no server partition, no framework. The scheduler's `retry(id)` is exercised only by tests (the adapter relies on automatic backoff); left in place as a one-line hook. Docs (`docs/world-streaming.md`) still described the blockout revision, a 1 MiB ceiling and a texture-free Commons; corrected. |
| Network behaviour | matched audit, simulation | The 200 ms town snapshot with 98 residents costs about 290 kB/s of application payload per client in both Gardens and Commons configurations (Phase 1 measured about 280 kB/s). This is pre-existing and not changed by streaming; recorded, not fixed here. |

## Run log

- 23:38 UTC: main-snapshot journey (pid 18775) took the browser lock; matched audit queued behind it.
- 00:07 UTC: journey failed at lap 8 (eviction wait, 120 s); evidence copied to the acceptance receipts; `data/reports/experience.json` restored in the snapshot.
- 00:07–00:09 UTC: the matched audit started and died with "browserContext.close: Target page, context or browser has been closed" after two samples; the queued fixed-source journey (pid 61787) exited 143 (SIGTERM) without running. Neither was stopped by this session; other sessions' queue entries vanished at the same time. Partial matched report preserved under the scratchpad evidence directory.
- 00:12 UTC: harness amended (face west before the eviction wait, report stream state on timeout); fixed-source journey (pid 57167) and matched audit (pid 57584) requeued from the refreshed snapshot behind three other sessions' runs.
- Core gate: attempt 1 failed `land-pr` wake timing (tooling), attempt 2 failed a 40 ms campus-readiness timing case (preview), attempt 3 failed two office transport timeouts (server); each passes alone; all receipts kept under `.runtime/phase2-review/`. Attempt 4 waits for a one-minute load under 16.

- 01:11 UTC: core attempt 4 failed only the secrets stage (34 gitleaks `generic-api-key` hits in the raw checkpoint under docs/acceptance); checkpoint compacted, `check_secrets.py --all` clean; receipt kept as core-attempt-4.
- 01:21 UTC: fixed-source journey attempt 2 (pid 57167) failed at lap 22 outward (player 1 wedged 48 m west / 30 m north of the lane, speed 0) after 21 clean laps; receipt, log and screenshots copied as journey-fix-attempt2; snapshot report restored.
- 01:26 UTC: matched attempt 2 (pid 57584) failed with a null town snapshot in the first two-client window (socket lost at load 24); compact receipt kept as matched-fix-attempt1. Audit script hardened to report the loss; a routed outward leg was tried and reverted (no navigation route crosses the seam).
- 01:30 UTC: journey attempt 3 queued from the refreshed snapshot; matched attempt 3 queued from a second snapshot (`phase2-snapshot-fix-b`) carrying the hardened script; core attempt 5 waits for one-minute load < 12.

- 02:22 UTC: core attempt 5 started at load 11.9 and failed `browser queue admission does not consume the command execution timeout` (tooling, 300 ms nested budget); passes alone ×3 at load 15–18; receipt kept as core-attempt-5; attempt 6 waits for load < 8 and no own browser runs.

- 02:43 UTC: journey attempt 3 (pid 22588) completed 22/22 round trips and failed the final eviction walk (player 1 in room osm-node-8172494980, 27 m north of the far point, load 34); receipt and screenshots copied as journey-fix-attempt3; snapshot report restored; secrets scan clean. Matched attempt 3 (pid 23941) started at 02:43 UTC.

- 02:59 UTC: matched attempt 3 passed (receipt matched-fix-attempt2); core attempt 6 still waiting for one-minute load < 8 (9.5 at 02:59 UTC).

- 04:12 UTC: core attempt 6 passed every stage at load 7.5 (receipt core-attempt-6).

- 04:14 UTC: committed `69b7403e` (signed) and opened draft PR #697 via the REST API (the GraphQL endpoint was rate limited).

- 04:15–04:38 UTC: PR #697 reported a conflict with main; merged `f403dc33` (resolved `commons-stream.js`), focused suites 34/34, pushed `1607f32b`; core attempt 7 passed every stage at load 7.3 (receipt core-attempt-7).

## Results, gaps and next step

Results: the review found Phase 2's streaming design sound (server authority resident, local-only readiness veto, abort-fenced late completions, disposal on every path) and fixed one visible defect, camera churn beyond the retention radius (15 s linger, regression test), plus measured-byte accounting in the scheduler (regression test), notice naming and stale docs. Evidence: three journeys (7, 21, 22 round trips; 49 evictions releasing all 8,239,722 bytes; 0 loading notices on 88 crossings; probe failure and context-loss recovery three times; reconnects ≤ 1.42 s with 0 m drift) and a passing matched comparison (Market frame p95 equal to Gardens on all four profiles; CPU, reconnect and transfer within the Phase 1 budgets). Full detail and tables: [the acceptance report](../acceptance/phase2-review-20261026.md).

Gaps (not blocking): (1) one client's renderer texture count plateaus +13 over the lap-1 reference (bound +10) in every run, outside the streamed Market, bounded after lap 16, unattributed; (2) the after-twenty post-GC heap sample was never reached because each run's final far-point walk failed under load; (3) the harness keyboard walk (straight outward leg, no route across the seam) is fragile above one-minute load ~15; (4) the server simulation was taken on a loaded host (p50 is the stable signal); (5) the core gate needed six attempts because attempts 1–3 and 5 each failed one different host-timing test under other sessions' load (each passes alone) and attempt 4 failed the secrets scan on a raw receipt; attempt 6 passed in full; (6) no hosted, physical-device, production or human-accessibility evidence.

Delivery: commit `69b7403e` (SSH-signed, verified) on `review/phase2-20261026`, pushed; draft PR [#697](https://github.com/BunsDev/river-oaks/pull/697) opened 2026-10-27 04:15 UTC and recorded on the register. Merged main `f403dc33` into the branch at `1607f32b` (one conflict in `commons-stream.js`; focused suites 34/34; core attempt 7 passed). Hosted checks on `1607f32b`: 23 completed without failure, 1 in progress at 04:40 UTC. Next step: address review, then mark ready only with merge authorization. Not merged. The browser evidence predates the merge (main moved 115 commits, Bayou Heights/Terraces/Studewood); rerun the journey from a snapshot of the merged head if the reviewer wants post-merge streaming evidence.

Retirement: the three detached snapshot worktrees under this session's scratchpad (`phase2-snapshot`, `phase2-snapshot-fix`, `phase2-snapshot-fix-b`, all at main `40f4e786`, the latter two carrying the branch patch as working-tree edits) have finished their runs and their evidence is copied; `project:prune --cancel-stale --detached-path` refused them on 2026-10-27 03:05 UTC (touched within the cutoff), so they are registered as `phase2-review-snapshot-*-20261026` with that next action instead of being removed by hand.
