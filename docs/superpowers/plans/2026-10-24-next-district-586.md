# Next connected district (#586 continuation, #638 lane 3)

Task `next-district-586-20261024`, owner `claude:river-oaks-91 (a3bcb4)`. Branch
`feat/next-district-586-20261024`, worktree `../river-oaks-next-district-586`, from
origin/main `1c23170f`. Master handoff #638; acceptance list in #586's 2026-10-24
continuation.

## Objective

Add the next connected, socially useful district built from the city kit. Work toward
a measured 2× of the Gardens reachable-ground baseline: 46,477.75 m² at 0.5 m, so the
2× total is 92,955.5 m². Commons on main measured 51,962 m², which leaves 40,993.5 m²
to add. Deliver the largest honestly verified increment and record any gap. The
3× target needs more land or a metric decision, so it is out of scope.

## Design

**Bayou Heights** is a fictional, Houston Heights-inspired neighborhood on the east
bank of the bayou that edges Bayou Market Commons. All buildings, names and lettering
are original. It reproduces no real building.

- **Revision.** It is the new opt-in content revision `bayou-heights-1`, composed as
  Gardens, then Commons market, then Heights. The garage default, Gardens and
  `east-garden-commons-market-1` keep their exact geometry and world fingerprints.
  Commons is the rollback for Heights.
- **Land.** The manifest partitions `east-garden-reserve` into an authored
  `bayou-heights` location (its west part) and a smaller reserved
  `east-garden-reserve`. Total area does not grow and nothing overlaps. Adjacency
  stays reciprocal. The reservation is not enlarged.
- **Connection.** The Lantern Footbridge continues the Market Street axis
  (north −1335) behind the Bayou Lantern tower. It runs from the Bayou Green's east
  edge over the bayou to the east bank. This revision splits the Commons railing
  and bayou pieces around the bridge with recipe overrides. The Commons recipe and
  its lock do not change.
- **Place.**
  - *Spine.* Nineteenth Street continues the axis east. The preview
    `nineteenth-and-yale` crossroads is promoted, unchanged in geometry, as the
    commercial heart, and placed by anchor.
  - *Bayou Greenway.* A trail runs the length of the east bank.
  - *Heights Green.* A park with lawns, groves, benches, market stalls and the
    Heights Bandstand, which is the landmark.
  - *Icehouse patio.* A court with picnic sets and the shared game table.
  - *Esplanade.* A linear park inspired by Heights Boulevard.
- **Activity.** The icehouse game table is a two-chair table on the existing
  authoritative table-game rules (`server/table-games.js`, through
  `plazaSalonPlan`), offering chess, checkers, Connect Four, reversi and morris.
  Walking, sitting, invite, accept, moves, checkpoints and the game's departure rules
  are all existing server authority. No `server/world.js` change is needed.
- **Interfaces.**
  - The Heights overlay extends `world.eastGardenCommons` with its surfaces, solids
    and bounds, so the shared walking, ground, collision, flight and server-bounds
    paths need no edits.
  - `layout.heights` records the plans, the base Commons revision and the index
    where Heights surfaces and solids start.
  - `districtRevisionOf` reports `bayou-heights-1`.
  - Streaming and chunk interfaces come from #623, merged to main as part of 1fd53fb9.
    Heights integrates by merge commit (see Streaming integration under Results).

## Files owned

New files:
- Recipes and locks: `config/destinations/{bayou-greenway,yale-icehouse,yale-street-north,yale-street-south,heights-boulevard-north,heights-boulevard-south}.json`.
- `shared/bayou-heights.js` (composition) and `shared/bayou-heights-layout.js` (constants, so revision lists stay light).
- `preview/src/bayou-heights-world.js` (attach/detach/registration), `preview/src/bayou-heights.js` (neighborhoods and the shared landscape, loaded dynamically) and `preview/src/heights-stream.js` (streaming, loaded only for the revision). The interim `bayou-heights-arrival.js` was removed in the merge; main's location label names Heights instead.
- `server/district-heights-checkpoint-migration.js`.
- Tests: `preview/tests/bayou-heights.test.js`, `preview/tests/heights-stream.test.js` and `server/tests/bayou-heights.test.js`.
- `preview/e2e/bayou-heights.js`.
- `docs/level-design/expansion/bayou-heights.md`.
- This ledger.

Small edits to existing files:
- `config/destinations/nineteenth-and-yale.json`: title, anchor and inspiration only, then re-lock. The plan's pieces, surfaces, solids and stats are identical; only provenance and hash change.
- `preview/public/data/world-manifest.json`: the partition.
- `scripts/destination.mjs`: two `ENTRIES` seams for recipe-level connectivity.
- `server/district-data.js`, `preview/src/main.js`, `preview/src/garden-campus-district.js`: revision selection, the stream and the debug hook.
- `preview/src/commons-stream.js`: an optional presented layout, and its step gate leaves ground east of the Commons to the Heights stream.
- `preview/src/world-location-label.js`: names Bayou Heights.
- `preview/src/city-kit/render.js`: `cityKitLandscape` (the placement rules, moved out of the build loop unchanged), `disposeLandscape` (moved), and `landscape: false`.
- `preview/src/plaza-salon-plan.js`: the icehouse table, its seat pattern and chair title.
- `server/redis-room.js`: Heights recovery first in the chain, and its log event.
- `preview/e2e/experience-runner.js` and `.github/workflows/verify.yml`: the journey environment and its own CI shard.
- `preview/audit/world-expansion-footprint.js`: the Heights sample.
- Docs: `docs/world-expansion.md` and `docs/city-kit.md`.

I will not edit:
- `walking.js`, `player-avatar.js`, `remote-players.js`, or the crime and police
  modules (onfoot-637-640).
- The `bayou-market-commons` recipe and lock, kit `catalog.js`, `assemble.js` and
  `render.js` (#641).
- `east-garden-commons.js` (#623 and #641). `lantern-walk.js` is one exception: an import plus one chip-visibility line, so the Commons status hides in Heights. It merges with #623's head without conflicts (`git merge-file`), and #641 does not touch it.

## Checks

- Focused:
  - Recipe validation and connectivity, and locks via `pnpm run destination check`.
  - Composition parity between server and client.
  - Flood fill from the District side, with no dead-end pockets.
  - The real walking controller crosses the bridge and walks the streets.
  - Refusals: the water, blocks, remaining reserve and building placement.
  - Manifest partition.
  - Two-player icehouse game through the shared world.
  - Checkpoint restore and rollback in both directions.
  - Unchanged Commons, Gardens and garage fingerprints.
- `pnpm run verify`, then `pnpm run verify full` with an isolated Redis service,
  because the migration touches Redis recovery.
- `node preview/audit/world-expansion-footprint.js --reachable` at 1 m and 0.5 m,
  with composed-world hashes.
- A two-player browser journey (`pnpm run test:experience bayou-heights`) through
  `scripts/browser-lock.mjs`.
- Pedestrian captures, inspected.
- A matched District performance comparison, as far as local tooling allows.
- Current-head hosted checks on the draft PR.

## Results

Evidence for head `b1ded7ab` (draft PR #649), rebased onto main `67203a6a`, unless noted.

- **Reachable area: complete for 2×.** `node preview/audit/world-expansion-footprint.js --reachable` samples from the District spawn on foot. Reserved land, upper floors, flight, travel and islands are excluded.

  | Grid | Gardens | Commons | Bayou Heights | Added by Heights | Ratio to Gardens |
  | --- | ---: | ---: | ---: | ---: | ---: |
  | 1 m | 46,549 | 52,130 | 93,906 | 41,776 | 2.0174× |
  | 0.5 m | 46,477.75 | 52,030.75 | 93,509.75 | 41,479 | 2.0119× |

  The margin over 2× is 554.25 m² at 0.5 m. The first layout measured 1.969×. Replacing one Yale storefront block with Twentieth Street Square, which joins Heights Green to Yale Street, closed the gap. The fresh Commons sample is the current main value; the base commit has the same Commons fingerprint. It differs from the historical table in `docs/world-expansion.md` (51,962) by 0.13%.
- **Pinned composed-world sha256.** Base `1c23170f` and branch are identical for:
  - garage `5fc38cbe54099258f54a199f314eb0f6910a0488dff6efe6d692037b73e38b80`;
  - Gardens `df44715b918971e92630d480c200a048b3cd8b371e69625d08edb2a7a96eaf6b`;
  - Commons `d5f1179d93732630368c9b1ff7419931e72816f815b8db048c23eadff4346315`.

  Heights is `5824c9a38f81399597f3880ecb7c3f79e45077e0263497d860f432fd9a56d674`.
- **Recipes.** All seven build with connectivity 1 and within budgets, and `destination check` reproduces every lock. The crossroads' pieces, surfaces, solids and stats equal the base. Totals: 1,321 pieces, 176 shells, 521 solids and 783,488 authored triangles. Client meshes per plan are 21–62, against a budget of 70.
- **Focused tests.**
  - `preview/tests/bayou-heights.test.js`: 8/8.
  - `server/tests/bayou-heights.test.js`: 6/6 with `REDIS_URL`.
  - With main's #630 activation rehearsal and the Commons migration suite on isolated Redis: 16/16.
- **Core gate.** `pnpm run verify` passed:
  - agent: 237/237;
  - preview: 4,021 passed, 1 skipped;
  - server: 893 passed, 226 Redis-only skips;
  - desktop: 115 passed, 3 skipped;
  - build, Python and secrets.

  The first post-rebase run failed `scripts/tests/land-pr.test.js`, "queue release did not wake the lander", at load about 37. It passed alone (29/29), and the rerun passed. The log is kept in the session scratchpad.
- **Redis server suite.** `test:server` with `REDIS_URL` on an isolated Redis passed 1,161/1,161 at load about 22. The pre-rebase run at load about 37 failed one test (1,158/1,159): the Commons Redis fence's travel request was rejected. That test passed alone twice. The browser stages of `verify full` were not run as a whole; see Gaps.
- **Production build.** The Heights recipes and scene are `assets/bayou-heights-*.js`: 30,761 bytes, 8,593 gzipped. The chunk is reached only through `import()` for `bayou-heights-1` and is not modulepreloaded.
- **Cold transfer for `b1ded7ab`** (support task D, river-oaks-3e). Production builds of base `67203a6a` and head `b1ded7ab` were compared by static analysis of what a District visit downloads:
  - JS and CSS, gzipped: 1,728.9 → 1,731.5 KiB (+0.15%);
  - play-page initial JS: +0.50%;
  - recipe markers appear only in the lazy Heights chunk;
  - public data: only `world-manifest.json` changed.

  This is within the +10% limit. It has to be re-run on the fixed head, because the chunk split can move.
- **Lantern Walk chip.** Before the fix, the Commons status chip ("Lantern Walk · 0 of 5 lit") stayed on screen across all of Heights, because the client treated everything east of the District edge as the Commons. `preview/tests/lantern-walk-client.test.js` failed on "Bayou Heights hides the Commons chip" before the fix and passes after it. The journey now checks the chip on both sides of the footbridge.
- **Review and rollback rehearsal for `b1ded7ab`** (support task C, river-oaks-3e). No blocking defects were found. The reviewer adapted #630's harness and ran it through the real Redis gateway, tickets and WebSockets on a disposable loopback Redis, covering:
  - activation from the Commons;
  - standing, seated and airborne Heights occupants;
  - a stale Commons deployment, relaying and refusing alone;
  - rollback to the Commons;
  - refusal of the superseded Heights deployment;
  - re-activation and the chained rollback to Gardens.

  All 30 checks passed. The four migration log lines show `moved` 0, 3, 0 and 3. The reviewer also found:
  - a missing Heights runbook section, now added to `docs/world-expansion-activation.md`;
  - a misleading `commonsBounds`, now documented;
  - an extra Commons-plus-Heights world build on failed restores, which is acceptable at once per migration.

  The harness is adopted as `server/tests/heights-activation-rehearsal.test.js`, minus #630 leftovers. It passes 30/30 here on an isolated Redis and skips without `REDIS_URL`.
- **First browser failures for `b1ded7ab`.**
  - **Hosted** `preview experience (heights)`, run 40126391598, job 120968634599: `alice approach: stalled`, about 2.4 m from a District waypoint, while walking at 3.2 m/s with no refusals. The CPU renderer (llvmpipe) reported 1 fps, 1,164 calls and 8.03 M triangles. On main, the Commons journey's District approach took 42 s (owner) and 72 s (alice). On Heights, neither finished within the 300 s deadline, and page-ready took 33 s against 19 s.
  - District walkability is identical between the Commons and Heights revisions: 0 differences over 295,148 samples at 0.5 m, and the stall segment is free. So the cause is rendering, a real District regression on CPU rendering.
  - **Local**, Metal at 39 fps: the journey reached Heights, then failed "Crossing the footbridge names Bayou Heights". Its notice observer attached at `DOMContentLoaded`, before the walking HUD creates `#walking-notice`. It now attaches once the player is ready. The capture `output/playwright/experience-bayou-heights-failure.png` shows Heights rendered correctly from the east bank.
- **District rendering fix.**
  - **Before:** Heights drew every tree batch of each kit plan within 300 m, including from the District. That is 112–227 street trees in 12 m instanced batches, each a draw call at every distance. The 80 landmark parts were 80 separate shadow-casting meshes. Separately, the scene's shadow-proxy list was copied before the trees loaded, so Heights drew no tree shadows at all, Commons trees included.
  - **Now:** Heights tree batches and their shadows draw only within the kit's 120 m block-detail distance. The landmarks merge into one mesh per material, plus the clock faces, 10 meshes in all. The shadow list follows the loaded trees.
  - **Tests:** `preview/tests/bayou-heights.test.js` gains a test with stand-in batches. It checks that far batches and their shadows don't draw, and that near ones and the Commons trees do. The preview suite passes 4,023/4,024 with 1 existing skip.
  - **Measurement:** see Performance below.
- **Streaming integration (merge of main 1fd53fb9).** #623 (streaming) and #643 (MVP readiness) merged while this branch was open, and the PR conflicted. Rebasing would have needed a force-push, so main is merged instead.
  - **Design.** Heights streams as its own location in eight parts: seven neighborhoods and one shared part, under the Commons' 16 MiB ceiling, unchanged. The Commons streams separately, presented with its bayou opened for the bridge. The details are in [bayou-heights.md](../../level-design/expansion/bayou-heights.md#streaming).
  - **Memory.** Each kit cloned the three oak levels (3.13 MiB from the GLB accessors) and the planting models. Seven neighborhoods would have held about 22 MiB of duplicate oaks. Heights now draws its 355 trees and 329 planted beds once. Measured headless, the neighborhoods own 12.95 MiB; the shared part adds about 6.2 MiB in the browser by calculation (oaks 3.13, procedural planting 2.37, planting models 0.24, instances, landmarks 0.11). That is pending the browser measurement the journey records.
  - **Ceiling.** Heights is larger than 16 MiB in all, so deep inside it the neighborhoods the camera cannot see stream out. The stand-in test shows one or two going at Nineteenth and Yale. A larger Heights ceiling is not within this task's authority, and is listed under Decisions.
  - **Kit parity.** `cityKitLandscape` reproduces the kit's own placements. For all seven Heights plans and the Commons destination, trees, planting modules, meshes and triangles equal main's kit.
  - **Fingerprints.** Garage `5fc38cbe…`, Gardens `df44715b…` and Commons `d5f1179d…` equal main 1fd53fb9. Heights is still `5824c9a3…`.
  - **Focused tests.** All pass on the merged tree:
    - `bayou-heights.test.js`: 9/9.
    - `heights-stream.test.js`: 6/6. It covers parts near the footbridge, release in the District with disposal, estimates, ceiling priority and turning, the gate, camera rules and status.
    - `world-location-label.test.js`: 5/5.
    - `lantern-walk-client.test.js`: 3/3.
  - **Suites.** Preview 4,106/4,107 with 1 existing skip. Server 1,163/1,163 on isolated Redis.
- **Hosted run on `5ea9171f` (Verify 40132921105).** Every job passed except `preview experience (heights)`, job 120988297785.
  - **The District regression is fixed.** Both players crossed the District and the Commons and were over the footbridge by 21:18Z, about 5 minutes after start. On `b1ded7ab`, neither had left the District after 300 s.
  - **Streaming.** Heights streamed in before the footbridge, within the ceiling and with each part within its estimate. The shared part measured 6,570,294 bytes (6.27 MiB, against a 6.5 MiB estimate), the greenway 1,666,368 and the icehouse 2,128,128. The footbridge crossing, the "Entering Bayou Heights" notice, the Lantern Walk chip check and the icehouse table game passed.
  - **First failure.** `alice nineteenth: stalled` at x 275 of the Commons frame, heading for x 300, still moving east at 3.2 m/s with no refusals. The input trace shows about 1.5 m/s to x 228, then about 0.4 m/s from x 231, where the crossroads neighborhoods stream in. At the failure the client drew 1,975 calls and 7.73 M triangles at 3 fps under llvmpipe (quality scale 0.6). The lane is collision-free.
  - **Cause, by calculation.** At x 275 the landscape draws about 2.2 M tree triangles within 120 m in all directions, plus 1.25 M of planting, which also casts shadows. The ceiling also binds there, and the walk helper's small camera corrections flip neighborhoods at the edge of the view in and out. Each flip can cancel a load or rebuild a neighborhood.
  - **Fix.** Planting draws within 60 m, the trees' middle detail level, which brings it to about 0.01 M triangles at x 275. A neighborhood in view keeps its priority for 5 s, and loaded ones outrank unloaded ones, so a glance does not rebuild anything. Tests cover both. The harness's timeouts are unchanged.
- **Browser journey and captures.** Pending the hosted shard on the fix and a local run (queued on the browser lock).
- **Performance.** Not started. ABBA under the #626 protocol, with thresholds unamended, is support task D (river-oaks-3e). The `#626` decision is recorded only on #643's branch (D11).

## Gaps and coordination

- **Decision for Val:** Heights holds about 19 MiB of retained geometry in all, against the Commons' 16 MiB ceiling, which it keeps. Holding all of Heights at once needs a larger ceiling for this location. Sharing the oak models with the District's trees (one copy app-wide) would save about 3 MiB more, but it changes shared disposal. Either is a separate task.
- Residents do not route across locations. That work is support task B, river-oaks-3e, on `feat/resident-locations-20261024`. Once residents can stand in Heights, the Heights rollback must relocate them as it does players.
- `verify full` browser stages (security-browser, reflections, experience, shared, ipic-screening) were not run here as a whole, because the shared browser lock has a long queue. The Heights journey runs on its own, and hosted CI runs the matrix, including the new `heights` shard.
- Human visual approval, physical devices, hosted multiplayer and Unreal parity are separate acceptance.

## Next step

1. Get the local `pnpm run test:experience bayou-heights` result and inspect its pedestrian captures in `output/playwright/heights-*.png`.
2. Get the hosted checks on #649.
3. Get the ABBA performance results (D) and the review and rehearsal (C) from river-oaks-3e.
4. Post one evidence comment each on #586 and #638.
5. Fix any review findings and re-verify.
