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
- **Hosted run on `6f7efdfe` (Verify 40135009578).** Every job passed except `preview experience (heights)`, job 120994565995.
  - **Passed.** The journey crossed the District, the Commons and the footbridge, played the icehouse game, reached the bandstand, reconnected, and walked Nineteenth Street to the crossroads at about 10 fps. Both players were at x 300 by 21:46:13Z.
  - **First failure.** `alice home: stalled` at x 255 of the Commons frame, walking west toward x 165, with no refusals. The CPU acceptance profile draws once a second (`main.js`), and the walk caps each frame at 0.08 s. Facing west from x 300, the client loop fell to about 1–1.7 Hz: about 20 movement commands per 20 s, against about 90 facing east. Walking efficiency fell from 85–90 % facing east to 11.5 % (alice, 3.2 m/s) and 14 % (owner, 6.4 m/s). At the failure the client drew 1,885 calls and 7.65 M triangles.
  - **Not stream churn.** A replay of the walk through `createHeightsStream`, with byte-sized stand-ins, builds one neighborhood on the walk home.
  - **Draw composition, by calculation (landscape only, 70° wedge).** Facing west from x 280, the view takes in Heights trees (0.54 M triangles), the Commons destination's trees and planting (0.81 M; the kit draws both at every distance), and the District's 199 trees at their low level (1.77 M). Facing west from the Commons at x 80, it is 1.55 M. The rest of the 7.65 M is the District and kits as a whole. In the Commons shard, alice walks west at 40–53 % efficiency.
- **Diagnostics on `diag/heights-west-draw-20261024`.** These are heights-only `workflow_dispatch` runs of a diagnostic branch, never for merge. The probes reached the scene through three.js's devtools hook.
  - **Run 40137664965: hiding groups one at a time at the crossroads.**
    - Facing west, each client drew about 1,950 calls and 7.6 M triangles: the Commons 2.40 M, the District's trees 1.77 M (all 199, at their low level), Heights 0.8 M, and the District's other groups.
    - Standing still, the loop ran at 10–24 Hz. Hiding any single group changed it little.
  - **Run 40140188988: render-audit phases for both clients, along Nineteenth Street and 30 m west.**
    - Frame CPU outside drawing was 6–8 ms. The heaviest phase was `players`, at 5–6.6 ms.
    - The once-a-second CPU draw took about 600 ms (p95 interval).
    - Walking west ran at 54 % (owner) and 47 % (alice) of walking speed, which matches the 0.08 s frame clamp across those draws. Heights stream loads took about 50 ms each, with no failures.
  - **Run 40138801425: the same journey stalled on the eastward walk.** Alice crawled at about 0.4 m/s from x 238, once the owner had arrived first and faced back west.
  - **Conclusion.** Walking speed falls off a cliff, from about 50 % to 11–14 %, when two CPU-rendered clients draw full westward views together on the four-core runner. Which side of the cliff a run lands on varies by run. Facing east from x 300, the Commons and the District are behind the camera and frustum-culled.
- **Fix.**
  - **Planting.** The Commons as Heights presents it draws its planted beds within 60 m, as Heights' own do (`heightsCommonsLayout` → `buildCityKit({ plantingMetres })`). Seen from Heights, that was about 1 M triangles (0.60 M of bed models and 0.38 M procedural). The Commons revision is unchanged (`plantingMetres` defaults to every distance). `cullPlanting` is now the kit's one rule, shared with Heights.
  - **Walking home.** The journey walks the players home one at a time. Alice goes first while the owner faces east; then the owner, while alice faces east. Waypoints and each 120 s stall deadline are unchanged.
  - **Journey readiness.** `ready()` now waits for the loading screen to close, as described under the local runs above.
  - **Candidate on the diagnostic branch, run 40141092066 (same tree, heights shard only): passed.** "Passed bayou-heights" took 9 min 45 s. Both players reached the crossroads by 23:09:15Z. Alice walked the 302 m home in 147 s (2.05 m/s, 64 % of walking speed). The owner, who had waited facing east, took 88 s. The return notices, the release of Heights, and "No page errors" passed.
  - **Core gate.** `pnpm run verify` passed on the second run:
    - agent 274/274;
    - preview 4,107 passed, 1 skipped;
    - server 894 passed, 227 Redis-only skips;
    - desktop 115 passed, 3 skipped;
    - Python 170.

    The first run, at a load average of about 8, failed the known load-sensitive `scripts/tests/land-pr.test.js` "queue release did not wake the lander", which stops the later stages. Alone, the file passed 29/29 at a load average of 10.5.
- **Second diagnostic run of the `8f3c94fd` tree, run 40141990171 (adds a captures upload): failed on a too-broad journey check.**
  - **What failed.** "Bayou Heights hides the Commons Lantern Walk status without announcing the District", just after the players crossed the footbridge.
  - **Cause.** Replaying the owner's 250 ms input trace through the HUD's `connectedLocationAt` on the Heights world shows the owner overshot the waypoint 1 m west of the District edge by 1.14 m (x +0.14). They stepped into the Commons and walked back (x −0.06), so the HUD rightly said "Back in River Oaks District", 70 s before the footbridge.
  - **Heights itself.** After "Entering Bayou Heights" there were no crossings. The chip was hidden in the failure capture.
  - **Fix.** The check now reads only the notices since entering Heights, which is its intent. The return check already orders notices the same way.
- **Hosted run on `8f3c94fd` (Verify 40141895401).** Every job passed except `preview experience (heights)`, job 121015197669, which failed with `alice nineteenth: stalled` at x 282, 18 m short of the crossroads.
  - The trace shows the owner arrived first at x 301.4, overshot, turned back and stood at x 300.1 facing west (yaw 1.58).
  - From then on alice walked east at 0.54–0.70 m/s, about a fifth of walking speed, until her 120 s deadline. Diagnostic run 40138801425 had stalled the same way.
  - So one client merely standing still facing west slows the other to a crawl. Facing west, it draws the District, the Commons and Heights at once, 5.5 M triangles after the planting fix.
  - **Fix.** The journey adds a turn-only `face()` helper, using the walk helper's own camera drag. Each player turns to face east on arriving at the crossroads, and alice faces east once home while the owner walks. Waypoints and deadlines are unchanged.
- **Diagnostic runs of the fixed journey (heights shard only, captures uploaded).**
  - **Run 40142521345 (scoped notice check): passed.** "Passed bayou-heights" took 11 min 24 s. Alice walked home 302 m in 185 s.
  - **Run 40142827652 (scoped check plus `face()`; the tree committed next): passed.** "Passed bayou-heights" took 9 min 14 s.
    - Once the owner faced east, alice finished Nineteenth Street 28 s later.
    - Alice walked home in 152 s (about 62 % of walking speed); the owner took 84 s.
- **Hosted run on `7291b566` (Verify 40143775558).** Every job passed except `preview experience (heights)`, job 121020743869, which failed with `alice home: stalled` 0.34 m short of x 165.
  - The facing fix held: the owner faced east throughout, and alice reached the crossroads 23 s after the owner.
  - Alice was not stuck. Alone facing west, she walked steadily at about 1.2 m/s, 37 % of walking speed. The 135 m leg from x 300 to x 165 ran out its 120 s deadline on the final approach.
  - In the diagnostic runs, the same walk went at about 62 %. The PR runs, with all sixteen jobs starting together, were about 1.5× slower at every leg, which suggests shared-host contention.
- **Leg lengths.**
  - The 120 s per-waypoint stall deadline is the shared convention: the Commons and `baseline-580` journeys use it too. The Commons journey's longest single leg is 73.5 m (`east-garden-commons.js:146`).
  - Heights had legs of 94.5–135 m. Its implied pace floor, up to 1.13 m/s, was stricter than the Commons journey's 0.61 m/s.
  - The journey now adds waypoints on the straight lines both players already walk: Market Street at x 50, the green lane at y 50, Nineteenth Street at x 250 and 255, and the walk home at x 235 and x 50. No leg exceeds 70 m.
  - **Tradeoff.** The deadline itself is unchanged, but the pace floor on the longest leg drops to 0.58 m/s (70 m in 120 s), close to the Commons journey's 0.61 m/s.
    - So a crawl like `8f3c94fd`'s (0.54–0.70 m/s) would no longer reliably fail on its own. The face-east change removes that cause, and a true stall still fails.
    - The heights job keeps its 20 min timeout, which bounds the whole journey.
  - **Diagnostic run 40144799151 (this journey): passed, slowly.** Every leg ran slower than in earlier runs. The journey took 16 min 53 s, and alice walked home in 284 s (about 33 % of walking speed). The job took 18 min 20 s under the diagnostic workflow's 45 min limit.
    - The PR workflow allows 20 min, so on a runner that slow this shard would be near its limit. That is a recorded risk, not a measured failure.
    - The earlier diagnostic jobs took 10.5–12.6 min.
- **Hosted run on `6e5abdff` (Verify 40146685019; merges main `2da76e1f`): every job passed, 16/16**, including `preview experience (heights)` and the aggregate `preview`.
  - The heights job took 13 min 30 s, and "Passed bayou-heights" came after 12 min 10 s.
  - Alice walked home in 199 s and the owner in 129 s.
  - Core verify on the merged tree passed:
    - agent: 274/274;
    - preview: 4,118 passed, 1 skipped;
    - server: 894 passed, 227 Redis-only skips;
    - desktop: 115 passed, 3 skipped;
    - Python: 170.
- **Evidence comments** for this increment: #586 (comment 6391752189) and #638 (comment 6391752328).
- **Main moved after `6e5abdff`** (#651, `4122fe07`), including `preview/src/render-quality.js`. It was not merged while the first ABBA pair (`2da76e1f` against `6e5abdff`) was queued. Once that ABBA failed and the head had to change anyway, `3cd60702` merged main `a437cbbf` (#645, #647, #651, #652) without conflicts. The next ABBA pair is that main against `3cd60702`, the head that would land.
- **Cold transfer for `6e5abdff`** (support task D part 2, river-oaks-3e).
  - **Pair.** Base main `2da76e1f` against head `6e5abdff`. Each was a clean detached worktree with `pnpm install --frozen-lockfile` and `pnpm run build`; both exited 0, and the lockfiles are identical.
  - **Method.** Static analysis of `dist/preview` over what every District visit downloads: the play page's static-import closure plus main's static imports. The tools are the reviewer's own scratch tools, the same as for `b1ded7ab`.
  - **Visit JS+CSS, gzipped:** 1,727.0 → 1,729.3 KiB (+0.13 %), within the +10 % limit. It was +0.15 % on `b1ded7ab`.
  - **Play-page initial JS:** 12.9 → 13.0 KiB (+0.90 %).
  - **What a District visit carries for Heights:** `bayou-heights-layout` (1.1 KiB gzipped: ids, bounds and the revision name), the revision's manifest entry, and the `heights-stream` import edge.
  - **Lazy only.** The Heights scene loads only in the lazy `heights-stream` chunk: 239.6 KiB gzipped, dynamic, not modulepreloaded.
- **ABBA District performance for `6e5abdff`** (support task D part 1, river-oaks-3e): **gate not met.** One-client CPU-submission p95 was over the +10 % limit on both viewports. Every other gate metric was within its limit.
  - **Arms.** A is base `2da76e1f` at `east-garden-commons-market-1`; B is the head at `bayou-heights-1`. They ran in the order A1 B1 B2 A2, under one held browser lock, 02:44:53–03:15:24Z on 2026-10-25.
  - **Commands.** `RIVER_OAKS_BASELINE_REVISION=<rev> node preview/audit/world-expansion-baseline.js --label=d-<arm>`, with harness defaults: vsync on, 1440×1000 and 390×844, one and two clients, three warmed 30 s samples, District spawn camera. Then `node preview/audit/baseline-compare.js --base=d-a1.json,d-a2.json --candidate=d-b1.json,d-b2.json`. The harness file is byte-identical on base and head.
  - **Limits, unamended:** mean frame and CPU-submission p95 within +10 %, reconnect within +20 %, drift at most 0.5 m. Vsync-locked frame p95 is informational under #626 (D11).
  - All four runs passed, with no page errors, no failed assets and 0 m drift.
  - **Receipts** are in the reviewer's scratchpad (`abba-6e5abdff/`). Their sha256 prefixes, checked here:
    - `compare.json` c3f662f1f25bc37a;
    - `d-a1.json` ac6657b08ddc9d9f;
    - `d-b1.json` 41e74b85385e5a34;
    - `d-b2.json` 7a451fac963cb81f;
    - `d-a2.json` 6b5c2fe928dd396b.

    | Workload | Metric | A | B | Change |
    | --- | --- | ---: | ---: | ---: |
    | Desktop, 1 client | frame mean | 16.67 ms | 16.67 ms | 0.0 % |
    | Desktop, 1 client | CPU p95 | 9.80 ms | 12.15 ms | **+24.0 %, over** |
    | Desktop, 2 clients | frame mean | 26.12 ms | 25.48 ms | −2.4 % |
    | Desktop, 2 clients | CPU p95 | 12.20 ms | 13.25 ms | +8.6 % |
    | Desktop | reconnect | 1,066 ms | 810 ms | −24.1 % |
    | Phone, 1 client | frame mean | 16.67 ms | 16.67 ms | 0.0 % |
    | Phone, 1 client | CPU p95 | 7.75 ms | 9.15 ms | **+18.1 %, over** |
    | Phone, 2 clients | frame mean | 22.19 ms | 21.59 ms | −2.7 % |
    | Phone, 2 clients | CPU p95 | 9.95 ms | 10.90 ms | +9.5 % |
    | Phone | reconnect | 941 ms | 1,057 ms | +12.4 % |

  - **Host load confounds part of it.** The median one-minute load per arm was A1 18.4, B1 35.7, B2 16.0 and A2 27.0. B1's phone samples ran at load 36–52. B2's phone samples, at load 9–13, measured CPU p95 8.1–8.2 ms, within A's 7.5–9.1 ms. B2's desktop samples were not low-load, at 25.7–36.8.
  - **One cost does not depend on load.** The render audit's `interactions` phase (`main.js`, from the `residents` mark to the `interactions` mark) roughly doubled in every Heights sample: a mean of 0.73–1.08 ms against 0.40–0.57 ms on A, in every workload and both B runs. Draw calls and geometries were equal or slightly lower on B.
  - **Cause.** Every walking query scanned all collision polygons and Commons solids, wherever it was asked. That covers `isFree`, `canFly` and `hasSightLine` in `preview/src/walking.js`. Heights raises the client collision list from 104 polygons to 626, and the Commons solids from 69 to 591.
    - In that phase, the third-person camera boom alone asks `canFly` 42 times a frame (`third-person.js`). Walking substeps, the companion and greetings sight lines ask more, and the `players` phase uses the same queries.
    - Rooms, seats, salon props, stores and buildings are nearly the same on both revisions, and nothing else per frame reads the Heights solids.
    - **Measured in Node at District spawn** (`scratchpad/heights/bench-walking.mjs`), Commons → Heights:
      - `isFree`: 221 → 628 ns;
      - `canFly`: 166 → 1,837 ns;
      - a 10 m sight line: 9.5 → 34 µs.
  - **Fix (`dd682a7b`).** Obstacles, Commons flight solids and rooms now share one 16 m bucket grid, the one rooms already used.
    - Each box is listed in every cell it touches, so the exact tests see every box a full scan would match.
    - Answers are unchanged. A digest over about 3.8 M sampled walking, flight, area-clearance and sight queries (`scratchpad/heights/walk-answers.mjs`) is identical before and after for the garage, Gardens, Commons and Heights revisions.
    - Heights at District spawn now measures 166 ns, 127 ns and 4.4 µs, below the Commons before the fix. The Commons itself is also faster: 117 ns, 111 ns and 2.4 µs.
    - **New tests:**
      - bucketed lookups give exact answers across bucket edges and signs (`walking.test.js`);
      - District walking, flight and sight on Heights answer as on the Commons and read no Heights solid (`bayou-heights.test.js`). It fails on the full scan.
    - Focused suites: 106 passed, 0 failed. The two Redis-only Heights tests ran against an isolated scratch Redis: 7/7.
  - **Core verify on `3cd60702`, with this ledger in the tree: not green as one gate.**
    - Three full runs of the tooling stage, at load 11–19, each failed one test: `scripts/tests/land-pr.test.js`, "queue release did not wake the lander". It waits up to 30 s for a file-system notification on a temporary directory, and that notification arrives late on this loaded macOS host.
    - The file passed alone twice (29/29). `scripts/`, `package.json` and the lockfile are byte-identical to `c6d42f43`, where the full gate passed. The first failure is kept (`scratchpad/heights/verify-bucket-1.log`).
    - The gate stops at its first failing stage, so every other stage ran under its own profile, and each passed:
      - preview: 4,169 passed, 1 skipped;
      - server: 894 passed, 227 Redis-only skips;
      - desktop: 120 passed, 3 skipped;
      - build, Python (170) and secrets: passed.
    - Hosted Verify on the pushed head is the merge gate.
  - **Next:** a fresh ABBA under the same protocol, A = main `a437cbbf` at `east-garden-commons-market-1` against B = `3cd60702` at `bayou-heights-1`.
    - It is queued on the shared browser lock as "piece D ABBA #649 3cd60702 (river-oaks-3e)" (03:29Z, three runs ahead). Its labels are `e-a1`, `e-b1`, `e-b2` and `e-a2`.
    - Inside the lock, each arm waits for a one-minute load of 16 or less, then runs anyway: up to 15 min before A1 and up to 5 min before each later arm. The wait and the load are logged.
    - The `6e5abdff` CPU-profiled pair was dropped before it started, because the Node timings already attribute the cost.
- **Cold transfer for the landing pair** (river-oaks-3e): main `a437cbbf` against `3cd60702`, measured by the same method as for `6e5abdff`.
  - **Visit JS+CSS, gzipped:** 1,729.8 → 1,732.1 KiB (+0.13 %), within the +10 % limit.
  - **Play-page initial JS:** 12.9 → 13.0 KiB (+0.92 %).
  - The walking chunk grew from 17.2 to 17.4 KiB. The Heights scene stays only in the lazy `heights-stream` chunk, which is not modulepreloaded.
- **Pedestrian captures, inspected.** Both runs uploaded all eight `heights-*.png`. They are CI software-profile renders: llvmpipe at render scale 0.25, with every material replaced by `MeshNormalMaterial` (`main.js:232`). So they show geometry, not appearance.
  - **Greenway:** street trees and kit blocks on both sides.
  - **Icehouse patio:** the two-chair game table, with "Icehouse game table" in the seat picker and a "Sit on the bench" prompt.
  - **Green:** the open lawn with trees and blocks beyond.
  - **Nineteenth and Yale:** a tree-lined street with buildings on both sides.
  - Every Heights view names Bayou Heights in the HUD. None shows holes, missing blocks or floating pieces.
  - **Black marks.** A scan for near-black clusters found:
    - a 76×72 px square beside the owner's head in the eastward crossroads view;
    - a few 8×8 px specks in the District arrival and the footbridge approach.

    The square is the glow sprite of the owner's costume (`preview/src/jevica-costume.js:150`). Sprites carry no normals, so under the override they draw black. Heights' own groups have no sprites (checked headless). The District specks predate this branch.
  - This is not visual approval.
- **Local browser runs (Metal, through the shared browser lock).**
  - **Journey.** A local run of the `6f7efdfe` tree failed at its first Heights check, "The client composed Bayou Heights for the served revision". Both clients had connected to `bayou-heights-1`. The console showed two 503 responses, at a load average of about 10. `data/reports/experience.json` was restored afterwards.
  - **Explained by the diagnostic branch.** The first diagnostic dispatch (run 40137423840) failed the same check 13 s after the journey started. Its capture still showed "Building the view". The journey's `ready()` waited for the avatar (`playerReady`), which can be ready before the district is built. Hosted PR runs had passed only because the district finished first (24–43 s). `ready()` now also waits for the loading screen to close, with the same 180 s timeout.
  - **Draw calls.** Calls and triangles at fixed views facing north (yaw 0), on main `1fd53fb9` and on the Heights tree (`6f7efdfe`):
    - gate: 1,260 / 4.59 M on main, 1,258 / 4.63 M on Heights;
    - Commons market: 877 / 5.46 M on main, 967 / 5.90 M on Heights;
    - Heights footbridge: 636 / 4.04 M;
    - Heights green lane: 382 / 2.07 M;
    - Nineteenth Street: 621 / 2.47 M.

    The District views did not record on either tree.
- **Performance.** ABBA under the #626 protocol, with thresholds unamended, is support task D (river-oaks-3e); the first result, for `6e5abdff`, is above. The `#626` decision is recorded only on #643's branch (D11).

## Status at handoff (product head `3cd60702`, draft PR #649)

**Overall: blocked.** Items 1–4 and 6 are complete. Item 5 failed its first ABBA on `6e5abdff`: one-client CPU p95 was +24.0 % on desktop and +18.1 % on phone. The load-independent cause is found and fixed in `dd682a7b`. The fixed head `3cd60702`, which also merges main, still needs its own ABBA and cold transfer. Both are support task D (river-oaks-3e) under the #626 protocol, and the gate's limits are unchanged. Heights is not activated anywhere; production activation is not authorized.

1. **Ledger before source: complete.** The objective, design, files-owned and checks sections were written before any source edit. They were committed with the first source in `b1ded7ab`, so git history alone does not show the order.
2. **Authoritative ground and connection: complete.**
   - Manifest registration partitions the reserve without enlarging it.
   - Server walking, collision, refusals and checkpoints cover Heights.
   - The Lantern Footbridge is an accessible, level street connection.
   - Two real clients walk the round trip in the hosted heights shard.
   - Focused tests cover the new ground, entries and refusals.
3. **A real place: complete.**
   - It has seven locked kit recipes, including the promoted crossroads with its geometry unchanged.
   - Its landmarks are Heights Hall's clock tower, the bandstand and the footbridge.
   - It has street trees and planted beds, pedestrian streets, seating, and the icehouse table game for two.
   - `pnpm run destination check` reproduces every lock, and the authored overrides are preserved.
4. **Measured gain: complete.** Reachable ground is 2.0119× at 0.5 m (93,509.75 m²) and 2.0174× at 1 m, with pinned composed-world hashes. Reserved land, upper floors, flight, travel and islands are excluded.
5. **No District regression: blocked. The first ABBA failed; the fix awaits its re-measure.**
   - **Done:**
     - District-only cold transfer: +0.13 % on `6e5abdff`, and +0.13 % for `3cd60702` against main `a437cbbf`, both within +10 %;
     - streaming and unload checks (focused tests, and the journey's release on the way home);
     - reconnect identity and drift within 0.5 m in Heights (journey);
     - the pedestrian captures, inspected (CI software profile only).
   - **Failed on `6e5abdff`:** the ABBA District comparison. One-client CPU p95 was +24.0 % on desktop and +18.1 % on phone, against +10 %. Mean frame, two-client CPU p95, reconnect and drift were within their limits.
   - **Fixed, not yet re-measured:** the walking queries that scanned every Heights solid from the District (`dd682a7b`).
   - **Not done:** the ABBA for `3cd60702` against main `a437cbbf`, queued with load gating. It settles the load-confounded part as well.
6. **Signed, verified commits in draft PRs: complete.** Every commit on #649 is SSH-signed.
   - Core verify passed on every earlier head that changed code.
   - On `3cd60702`, every stage passed except one load-sensitive tooling test, unchanged since earlier heads, which passes alone (see Results).
   - Hosted Verify passed 16/16 on `6e5abdff`; the result for `3cd60702` is recorded in the PR body once it runs. Results are recorded per head under Results. Nothing is merged, enqueued or deployed.

## Gaps and coordination

- **Decision for Val:** Heights holds about 19 MiB of retained geometry in all, against the Commons' 16 MiB ceiling, which it keeps. Holding all of Heights at once needs a larger ceiling for this location. Sharing the oak models with the District's trees (one copy app-wide) would save about 3 MiB more, but it changes shared disposal. Either is a separate task.
- Residents do not route across locations. That work is support task B, river-oaks-3e, on `feat/resident-locations-20261024`. Once residents can stand in Heights, the Heights rollback must relocate them as it does players.
- `verify full` browser stages (security-browser, reflections, experience, shared, ipic-screening) were not run here as a whole, because the shared browser lock has a long queue. The Heights journey runs on its own, and hosted CI runs the matrix, including the new `heights` shard.
- Human visual approval, physical devices, hosted multiplayer and Unreal parity are separate acceptance.
- **Retirement check at handoff (`pnpm run project:inventory`).**
  - This task's branch and worktree are active, with a draft PR, so they are not eligible.
  - `diag/heights-west-draw-20261024` exists only on the remote. It is mine, cited here as evidence, and never for merge. Delete it once #649 closes.
  - The only retire candidate listed, `test/mvp-regression-20261023`, belongs to another owner, so it is untouched.

## Next step

1. Get hosted Verify green on `3cd60702` (or the docs-only head above it), including `preview experience (heights)` and the aggregate `preview`. If main moves again, merge it without force; the ABBA then has to match the new head.
2. Get the ABBA result for `3cd60702` against main `a437cbbf` (support task D, river-oaks-3e), with the limits unchanged; its cold transfer already passed at +0.13 %. Record it here and on #586. If one-client CPU p95 is still over, compare the `interactions` and `players` phases with the first run's, and profile what remains.
3. Fix any review findings and re-verify. Merge, auto-merge and activation stay with Val.
4. Decisions for Val, not taken here:
   - a larger retained-geometry ceiling for Heights;
   - sharing the oak models with the District's trees.

### Next-session prompt

> Continue task `next-district-586-20261024` (#586, #638 lane 3) in `../river-oaks-next-district-586`, on branch `feat/next-district-586-20261024`, draft PR #649. Read `docs/superpowers/plans/2026-10-24-next-district-586.md` first, especially "Status at handoff" and "Results".
>
> Items 1–4 and 6 are complete. Item 5, the District performance gate, is blocked. Its first ABBA, on `6e5abdff`, failed on one-client CPU p95: +24.0 % on desktop and +18.1 % on phone, against +10 %. The load-independent cause is fixed in `dd682a7b`: walking queries scanned every Heights solid from the District. `3cd60702` adds that fix and merges main `a437cbbf`.
>
> Cold transfer for `3cd60702` against main `a437cbbf` passed at +0.13 %. The ABBA for that pair (#626 protocol, limits unchanged: mean frame and CPU p95 +10 %, reconnect +20 %, drift 0.5 m) is queued by river-oaks-3e on the shared browser lock. If the product head moves, both have to be re-measured.
>
> Check hosted Verify on the head (the `heights` shard and the aggregate `preview`), and merge `main` without force if it has moved. The heights shard is sensitive to runner speed (see Results), and its 20 min job timeout is a recorded risk. Collect the ABBA result from river-oaks-3e, or run it under the protocol. Post one evidence comment each on #586 and #638.
>
> Do not merge, enable auto-merge, activate `bayou-heights-1`, change budgets or the area metric, or edit other owners' branches. The diagnostic branch `diag/heights-west-draw-20261024` is evidence only, never for merge.
