# #583 follow-up on current main: Heights chain crossings, owned textures, District release

Task `streaming-583-heights-crossings-20261028`, branch `feat/streaming-583-heights-crossings-20261028`,
worktree `river-oaks-streaming-583` created at main `1781924a` on 2026-10-28.

## Objective

The #583 follow-up prompt on the source main serves today: repeated crossings, leaks,
duplicate meshes, failed-load recovery and measured resources for the streamed Heights
chain (Bayou Heights, Studewood, the Bayou Terraces, Woodland Heights). The Commons
route already has twenty-trip browser evidence and its review fixes are in draft #697
(`river-oaks-phase2`); this task does not touch `commons-stream.js`. It did come to touch
#697's harness and its session-expiry fix in `server/app.js` (adopted verbatim, see Changes)
after four twenty-trip runs failed around the laps on exactly those points. Phase 2 travel
itself (#582) is on main through #594 and #623.

## Findings on main `1781924a`

1. **Walking home never released Heights on the Terraces revisions.** With the Bayou
   Terraces at the District edge (`bayou-terraces-1`, `woodland-heights-1`, the
   development town default), `heights-stream.js` drops District points so they cannot
   prefetch the terraces, and the scheduler ignores an update with no valid point (an
   invalid position must not evict). Once everyone was back in the District nothing was
   wanted and nothing was released: five chunks, 11,090,376 geometry bytes and their
   textures stayed resident until world teardown. `bayou-heights-1` (the hosted
   `heights-return` shard) was unaffected, which is why no journey saw it.
2. **The 16 MiB ceiling counts geometry only, and each neighborhood owns textures that
   outweigh its geometry.** A city-kit neighborhood builds its own sign atlas (1024 px by
   128 px per distinct sign, mipmapped), tower lettering and tree-grate texture and
   disposes them on eviction. Nineteenth and Yale has 20 signs: about 13.3 MiB of atlas
   against a 3.45 MiB geometry estimate. `docs/world-streaming.md` already said to
   extend byte accounting before textures arrived; they arrived with the kit.
3. **Per-frame state queries built the whole debug picture.** `heights-stream.js` asked
   `stream.debug().chunks.find(...)` up to several times per frame for notice states.

## Changes

- `preview/src/spatial-chunk-stream.js`: `state(id)` returns one chunk's lifecycle
  state without building `debug()`; `'absent'` after disposal, `null` for an unknown id.
- `preview/src/heights-stream.js`: when no point anchors Heights (everyone in the
  District on a Terraces revision) the scheduler is updated with a point beyond every
  chunk's retention distance, so Heights streams out as it does on `bayou-heights-1`;
  an all-invalid update still evicts nothing. `ownedTextureBytes(group)` sums textures
  marked `userData.owned` (RGBA, mipmaps add a third); each chunk's value is recorded on
  attach and reported as `measuredTextureBytes` and `residentTextureBytes` beside the
  geometry figures. The geometry ceiling and the authored estimates are unchanged: the
  texture figure is instrumentation for a ceiling decision, not a new admission rule.
  `state(id)` is exposed on the Heights stream.
- `preview/src/main.js`: dev-only `window.__riverRegisterResident()` draws every visible object
  once (frustum culling off for one frame, flags restored) and resolves with the count, so a
  journey can register resident GPU resources before sampling `renderer.info.memory`.
- `preview/e2e/world-streaming.js`: every `measure()` registers resident resources first and
  records the count per client (`registered`); `walk()` re-routes after 12 s without progress
  or when the player is in a room, else backs away and sidesteps (`unwedge`), at most two
  levels deep and eight recoveries per leg, with detours in the receipt; shorter key bursts
  (300 ms, Shift above 6 m); crossings during harness steering (`face`, `unwedge`) are tagged
  and excluded from the camera-continuity check, which reports steered and rough counts; the
  final socket check explains extra sockets by probe-counted rotate notices and planned close
  codes (1000, 1012, 4001, 4010). The re-route, steering and socket hunks follow #697's harness
  so the two merge cleanly.
- `server/app.js`, `preview/src/connection-policy.js` (adopted verbatim from #697 `cdbb005d`,
  with its regressions in `connection-policy.test.js` and `app.test.js`): an expired identity
  closes the socket with 4001 "Session expired. Reconnecting securely." and keeps the player in
  the world for the departure grace, so the secure reconnect resumes in place instead of
  re-joining at the District spawn; the page is asked to move before the identity expires; the
  client reads that close as a planned refresh. A ban or ended approval still removes the player.
- `preview/src/city-kit/render.js`: marks the sign atlas, tower lettering and tree-grate
  textures `userData.owned`. The halo and the landscape template maps stay unmarked
  because they survive eviction.
- Tests: `spatial-chunk-stream.test.js` (state accessor through every state);
  `heights-stream.test.js` (twenty footbridge round trips with the real builders checking
  bounded bytes, exact disposal of every owned geometry, material and texture, identical
  laps, no duplicate groups; three laps along the whole chain to Woodland and back on
  `woodland-heights-1`; the District release on the Terraces revisions; owned-texture
  accounting with mipmapped, flat and shared textures).

## Files owned

`preview/src/spatial-chunk-stream.js`, `preview/src/heights-stream.js`,
`preview/src/city-kit/render.js`, `preview/tests/spatial-chunk-stream.test.js`,
`preview/tests/heights-stream.test.js`, `preview/e2e/world-streaming.js`, `preview/src/main.js`
(dev hook), `server/app.js` and `preview/src/connection-policy.js` (the #697 session-expiry
hunks and their tests), `docs/world-streaming.md`, this ledger.

## Checks and results

| Check | Result |
| --- | --- |
| Failing first: chain laps and District release without the `away` anchor | 2 of 10 fail (`home in the District nothing stays`: 5 chunks, 11,090,376 bytes, 87,380 texture bytes resident), 10/10 with it |
| `node --test` spatial-chunk-stream, heights-stream, commons-stream, woodland-heights, bayou-heights, studewood, bayou-terraces, city-kit, streetscape-kit | 102 passed, 0 failed, 0 skipped (6.4 s) |
| `git diff --check` | clean |
| Headless benchmark, `update()` at the footbridge with 6 resident chunks, 20,000 updates ×2 | new `state(id)` 6.63 / 6.49 µs per update; previous `debug().chunks.find` 7.46 / 7.90 µs (host load 11–17; small in absolute terms) |
| `RIVER_OAKS_E2E_REPORT=streaming-583-terraces.json pnpm run test:experience bayou-terraces` (local, two rendered fixture clients, host load 17) | Passed, 14/14 checks, 0 page errors, reconnect 1,011 ms with 0 m drift. At the greenway: geometry 13,918,686 of 16,777,216 bytes (landscape 8,175,390; greenway 2,849,856; north terrace 2,893,440, each within its estimate) and owned textures 9,131,349 bytes resident (greenway 2,818,048; north terrace 6,313,301; landscape 0). Travel home approved for both players; both waited until `ready === false`, `residentBytes === 0`, `residentTextureBytes === 0`, `pending === 0`. Report kept in the session scratchpad, not committed. |
| `pnpm run verify` (core), worktree at main `1781924a` with this patch, host load 11–17 | Passed 2026-10-28T14:25:25Z (`.runtime/agent/core.json`): tooling 289; preview 4,313 + 1 existing skip; server 1,051 + 280 Redis skips; desktop 127 + 5 skips; Ruff; pytest 170; demo and demo-verify; secret scan clean. Core excludes Redis, browser and native coverage. |
| Focused tests for the adopted session-expiry hunks | `connection-policy.test.js` 6 passed; `server/tests/app.test.js` 17 passed (no Redis) |
| `pnpm run verify` (core) on the hardened tree (29 Oct, host load 6–10) | Passed 2026-10-29T02:13:22Z (`.runtime/agent/core.json`): tooling 289; preview 4,343 + 1 existing skip; server 1,080 + 283 Redis skips; desktop 127 + 5 skips; Ruff; pytest; demo and demo-verify; secret scan clean. |
| `REDIS_URL=redis://127.0.0.1:16586 pnpm run test:server` (isolated Redis, the `server/app.js` change) | 1,405 passed, 0 failed, 0 skipped. |
| Hosted checks on #729 head `323aff81` | 27/27 success, including the `terraces` shard with the new travel-home release check and the `woodland`, `heights` and `heights-return` shards (aggregate `preview` success). |
| Merge of main `36e906b2` (#725 TypeSafe Place, #715 moderation routing) | One conflict in `heights-stream.js` (main's view boxes over the tallest building beside this branch's `measuredTextures`); `docs/world-streaming.md` now counts twenty Heights chunks. Focused `node --test` with `typesafe-place.test.js` added: 115 passed, 0 failed, 0 skipped. `pnpm run verify` (core) on the merged tree passed 2026-10-28T19:21:52Z (`.runtime/agent/core.json`): tooling 289; preview 4,343 + 1 existing skip; server 1,077 + 283 Redis skips; desktop 127 + 5 skips; Ruff; pytest; demo and demo-verify; secret scan clean. Host load 17–24. |
| Hosted checks on `0204368e` (ledger-only push) | 19/20 Verify jobs success; `preview shared (worlds-and-creator)` failed `player-blocking-interface` waiting 45 s for the roster status "You blocked sage-dev." (`player-blocking-journey.js:85`), the same failure as main push `f424a492` (run 40709671541) that day; no roster or blocking code is in this diff. The docs-only push `1a6b47eb` got no Verify run because the PR was in conflict with main. |
| Hosted checks on #729 head `eb8f1bbe` (main `36e906b2` merged in) | 27/27 success, including `preview shared (worlds-and-creator)`, the `terraces`, `woodland`, `heights` and `heights-return` shards and the aggregate `preview`. |

## Phase 2 demonstrations on this head (`0204368e`, 2026-10-28)

Run from the worktree with the shared browser lock, caffeinated, host one-minute load 10–34 from other sessions. Receipts are in the session scratchpad (`phase2-receipts/`) and under the worktree's `.runtime/world-streaming/`; the journey's checkpoint is `journey-2026-10-28T14-44-39.280Z.json`, the matched report `matched-2026-10-28T15-52-05.514Z/report.json` (17 source hashes identical at start and end, head `0204368e`).

| Demonstration | Result |
| --- | --- |
| `pnpm run test:experience world-streaming` (District ↔ Bayou Market Commons, two bounded rendered fixture clients plus a probe client; 14:44–15:52Z) | All 22 laps completed (2 warm-ups + 20 measured round trips) with 271 checks passed: identity, avatar and shared return positions preserved; exactly one Commons presentation group per client; no duplicate remote avatars; bounded owned resources and unchanged documents on every lap; every eviction released all 8,239,722 owned bytes with zero pending loads (loads 22 = unloads 22 at the end). Probe client: recovery from the injected module failure (6 failures then success) and both context-loss probes (pending load and resident Commons; 0 m and 0.55 m authoritative drift, direction preserved). One forced reconnect: 1,163 ms, 0 m drift. Warmed post-GC heap at lap 2: 126.0 / 125.6 MB used. **Not met:** the warmed GPU-count allowance on 6 of 20 measured trips, a stable step on client 0 of +12 geometries and +13 textures (783/262 against 771/249, the same values each time, evicted counts 673/259 each time), so a one-time upload after the reference, not growth. **Outcome recorded as failed:** after lap 22's checks the harness's final eviction walk for player 1 stalled against an obstacle at (−2778.6, −1346.2) heading for (−2786, −1371) with the stream already clean, at host load 34; the post-twenty retained-heap sample therefore did not run. #697's harness re-routes wedged walks; main's does not. |
| `pnpm run test:experience world-streaming`, second run on `6ed1aaf0` (20:30–21:38Z, host load 12–22) | All 22 laps again with 281 checks passed and none failed; every eviction released all 8,239,722 owned bytes with zero pending loads (loads 23 = unloads 23 at the end); reconnect 812 ms with 0 m drift; two graphics recoveries; probe failed-load recovery. Post-GC retained heap after twenty measured trips 128.8 / 127.4 MB against the warmed 127.0 / 127.1 MB: ratios 1.014 and 1.002 against the 1.10 bound. GPU-count allowance missed once, on lap 22, client 0 at +12 geometries / +13 textures: the registration step (+12 / +9) came at eviction 16 this run and stayed flat for six laps; the ±4 texture transient made 13. Outcome again `failed`, after all laps: the harness's split-occupancy walk for the peer wedged at (−2714.7, −1305.3) with speed 0 heading for the plaza at host load 22. Receipt `journey-2026-10-28T20-30-27.517Z.json` in the scratchpad `phase2-receipts/`. |
| Third run, harness hardening (registration before each sample, walk re-route; 22:20–23:31Z, host load 7–10) | All 22 laps, 284 checks, **zero** GPU-count violations: loaded 799 / 277 and evicted 689 / 270 on client 0 on every lap, 743 / 271 and 633 / 264 on client 1 (±4 texture transient within the allowance); heap ratios 1.010 / 1.010 after twenty trips; one detour (eviction 21, player 1, nine waypoints) recovered a wedge. Outcome `failed` at the last check: both clients had one extra socket about an hour in, a planned close the socket check did not yet explain. Receipt `journey-2026-10-28T22-20-51.424Z.json`. |
| Fourth run, rotation-aware socket check (23:35–00:41Z, host load 7–8) | 21 laps clean, 269 checks, zero violations, one detour recovered. Failed at lap 22 "both peers see Commons plaza occupancy": the peer's identity expired during the outward walk and main's `disconnectUser(4001, "Please sign in again.")` re-joined it at the District spawn (closes in the receipt: client 0 1005 from the forced reconnect, client 1 4001). The third run had met the same expiry on a return leg and passed by timing. Receipt `journey-2026-10-28T23-35-30.332Z.json`. |
| Fifth run, with the #697 session-expiry fix (00:57–02:07Z, 29 Oct) | **Passed**: 290 checks, 49 samples, all 22 laps; zero GPU-count violations (client 0 loaded 799 / 277 and evicted 689 / 270–274 on every lap, client 1 743 / 271 and 633 / 264–268); every eviction released all owned bytes with zero pending loads (loads 22 = unloads 22 on both clients); no detours needed; reconnect 739 ms with 0 m drift; probe failed-load recovery (6 injected failures) and both context-loss probes; post-GC retained heap after twenty trips 1.005 / 1.003 of the warmed baseline; camera continuity on 44 and 46 crossings with no steered rows; the server moved each page to a fresh socket before its identity expired (one rotate notice each, the old socket closed 4009) with no spawn re-join; source hashes unchanged throughout. Host load 6–8. Receipt `journey-2026-10-29T00-57-24.581Z.json`; report `streaming-583-world-streaming-5.json` kept in the scratchpad, not committed. |
| `node preview/audit/world-streaming-matched.js` (Gardens `river-oaks-gardens-3` vs Market `east-garden-commons-market-1`, desktop and phone viewports, one and two players, three 30 s windows each, five rejoins; 15:52–16:12Z) | Passed all four profiles, no errors. Frame p95 (median of windows): desktop 1p 16.8 vs 16.7 ms; desktop 2p 50.0 vs 50.0 ms; phone 1p 16.7 vs 16.8 ms; phone 2p 33.4 vs 33.4 ms (vsync-locked steps). CPU submission p95: desktop 1p 14.9 vs 14.0 ms (+6 %); desktop 2p 17.6 vs 19.0 ms; phone 1p 13.0 vs 12.0 ms (+8 %); phone 2p 14.6 vs 13.5 ms (+8 %), all within the +10 % budget. Heap: Market 364 / 386 MB vs Gardens 435 / 386 MB. Loopback receive 294–300 kB/s on both. Reconnect medians: desktop 1,340 vs 1,182 ms (+13 %); phone 1,236 vs 1,088 ms (+14 %), within the 20 % budget, 0 m drift on all 20 rejoins. Initial transfer 539 resources, 75,679,787 vs 75,679,779 bytes (+8 B; unbundled Vite development transfer, not the production cold-load budget). Renderer geometries/textures identical between revisions at each tier. Host load 9.7–14.5 during windows. |
| `pnpm run verify full` (isolated Redis `127.0.0.1:16586`) | Passed 2026-10-28T18:58:07Z (`.runtime/agent/full.json`, revision `0204368e`, 19 of 19 stages): dependency audit with no known vulnerabilities; tooling 289; preview 4,313 + 1 existing skip; server with Redis 1,373 and 0 skips; desktop 127 + 5 skips; build; Ruff; pytest 170; demo and demo-verify; secret scan and gitleaks history clean. Browser stages behind the shared lock: security e2e, reflections WebGL, the 16-journey experience stage (19.0 min), the Commons journey (reconnect keeps identity and Commons position, no page errors), 28 shared journeys (19.0 min) and the IPIC screening (19 checks). Queue waits behind other sessions' browser runs totalled about 1 h 53 min; host load 13–21 during the stages. The generated `data/reports/experience.json` and `shared-experience.json` were restored afterwards and are not committed. |

## Gaps and risks

- Texture bytes are reported, not enforced. Whether the ceiling should become a total
  (geometry plus owned textures, which would need higher estimates or a raised 16 MiB
  ceiling) is Val's decision; the figures this adds are the input for it.
- Headless builds make no canvas, so the unit tests measure the tree-grate DataTexture
  and synthetic textures; atlas sizes in the browser come from the journey evidence.
- The hosted `terraces` and `woodland` shards do not walk home to the District, so the
  release fix needs a journey check or a local run to be browser-verified.
- The first two world-streaming runs missed the warmed GPU-count allowance on client 0 by a
  one-time +12 geometries / +9 textures step (lap 4, then eviction 16) with scene inventories
  identical on every sample: `renderer.info.memory` registering existing objects on first drawn
  use, the harness's own warm-up premise, plus a ±4 texture transient. Drawing every visible
  object once before each sample (`__riverRegisterResident`) removed the step: zero violations
  over 22, 21 and 22 laps in runs three to five. Objects that are hidden (`visible = false`)
  at sample time still register later if they appear; none did in three runs.
- The fixture identity's hour had never been crossed by a passing journey before: main's
  `disconnectUser(4001)` re-joined the expired player at the District spawn (run four failed on
  it mid-lap). The adopted #697 fix moves the page to a fresh socket first; it is a product
  change in `server/app.js` and `connection-policy.js` with #697's regressions, and #697 is
  told which hunks #729 carries so whichever lands second merges identical content.
- The first two runs recorded `failed` outside the laps, in main's harness walks under host
  load 22–34; the third and fourth runs' walk re-route recovered the one wedge each met.

## Next step

Draft PR #729 published; hosted Verify passed 27/27 on `323aff81` and on `eb8f1bbe` (main
`36e906b2` merged in); `verify full` passed on `0204368e`. The harness hardening and the
session-expiry adoption are verified by the fifth journey, core verify and the Redis-backed
server suite on their head (see Checks). Hosted Verify (including the `terraces` and
`woodland` shards) is the merge gate; `preview checks` is red on main itself for the stack
rehearsal flake (#754). Mark ready and land only with Val's authorization. Open for Val: whether
the Heights ceiling should count owned textures (and at what total).
