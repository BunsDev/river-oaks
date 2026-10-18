# Avatar crowd cost (#442)

## Objective

#442 asks for measured crowd budgets and recorded fallback/LOD behaviour. This
task measures what each remote player costs to render on human-only `main` and
attributes that cost to passes and owners. It then makes one remote-avatar change
whose effect is measured against an unmodified `origin/main`. It does not set
device budgets, and does not claim physical-device or human acceptance.

- Task: `avatar-crowd-cost-442-20261018` (primary live register)
- Owner: `claude:river-oaks (98f10148)`
- Branch / worktree: `perf/avatar-crowd-cost-442-20261018`, `../river-oaks-avatar-crowd-442`
- Base: `main` `5033ea37`

## Files owned

`preview/audit/rendered-multiplayer.js`, `preview/audit/metrics.js`,
`preview/src/draw-census.js` (new), the census hook in `preview/src/main.js`,
the owner tags in `preview/src/remote-players.js` and `preview/src/player-avatar.js`,
their tests, and this ledger.

Not touched: Codex's open draft #504 (`character-bodice-fit.js`, `romance-look.js`,
the Studio preview and CSS), and Codex's register tasks for #462 and #464.

## Starting evidence

- The 2026-10-16 and 2026-10-18 crowd measurements in `docs/character-studio.md`
  and on #442 report frame p95 of 33.4 ms at 1, 8 and 16 players alike, and 16.7 to
  16.8 ms in other runs. `preview/audit/rendered-multiplayer.js` launched Chromium
  with `--use-angle=metal` only, so rAF intervals snap to multiples of the 60 Hz
  refresh. A p95 can then read only 16.7 or 33.4 ms; it can't show a change
  smaller than a whole refresh interval. The two experiments rejected on 10-18
  (rigid-accessory batching, rigid-foot instancing) were judged on that metric
  and on CPU submission p95 under load.
- Mesh census (Node, shipped rigs, `createRomanceLook` as a remote player gets it),
  per exposed human look: 19 to 58 meshes, every one casting a shadow; 5 to 12 skinned
  meshes per look have `frustumCulled = false` (`avatars.js:104`, plus the skinned
  garment helpers). Sable: 20 meshes, 115,916 triangles, of which the body is
  88,912. Silvan feminine: 58 meshes, 292,744 triangles.
- Store people (the 98 `locals`) already re-enable frustum culling and skip shadows
  (`store-people.js:124`); they render only while interiors are visible.

## Changes

1. `--vsync=off` for the rendered multiplayer audit: adds `--disable-gpu-vsync` and
   `--disable-frame-rate-limit`, recorded in `report.options`. Default stays `on`
   so older reports remain comparable.
2. Draw census: `window.__riverRenderAudit.drawCensus()` (development audit only)
   counts one frame's draws and submitted triangles by pass (`shadow`, `occlusion`
   for GTAO's geometry pass, `main`, `other`) and owner (`remote-player`, `player`,
   `scene`). The audit records it per tier as `drawCensus`.
3. `--view=player` keeps the game's follow camera instead of framing the crowd, so
   some peers are off screen as in play. `--compare=avatar-culling` adds alternating
   segments per tier in the same page (four in rounds 1 and 2: off, on, on, off;
   eight from round 3: off, on, on, off, on, off, off, on). It records frame and
   CPU distributions and draw censuses per arm, and from round 3 per segment.
   `--view=away` faces away from the other players from the viewer's eye, and
   `--profile=on` saves a CDP CPU profile per tier beside the report.
4. Whole-figure culling for remote avatars (`preview/src/avatar-culling.js`).
   Each skinned mesh of a remote avatar gets one sphere around the whole figure
   (centre 0.55 h above the floor, radius 0.8 h, h = standing height) in its own
   space, and `frustumCulled` goes back on. three then culls the avatar in the
   main and GTAO passes against the camera, and in the shadow pass against the
   sun's shadow frustum. Skins carried by a bone stay unculled. Rigid trims
   already cull by their own geometry. `remotePlayers.setCulling()` exists only
   for the audit comparison.

## Checks and results

- `node --test preview/tests/avatar-culling.test.js`: 11/11. Every exposed look
  (Jevica with her costume included) runs idle, walk 1.4 m/s, run 3.4 m/s, all
  eleven gestures (acknowledge, amazed, bow, dance, enchanted, greet, handshake,
  perform, startled, water, wave), hover, fast flight and seated, sampled every
  12 frames (gestures every 24). After the world-matrix update a render does,
  every vertex of every visible culled skin lies within the sphere. Worst reach:
  0.751 of the radius (hover), so at least 25% headroom. Negative control: a
  0.55 h radius fails 9 of 11 looks (hover reaches 1.086).
- `node --test preview/tests/remote-players.test.js`: 18/18, including the new
  figure-culling and audit-switch test.
- `node --test preview/tests/draw-census.test.js preview/tests/render-audit.test.js`:
  5/5 (pass and owner attribution, wrapper removal, vsync/view/compare options).
- `node scripts/agent.mjs verify tooling` (agent tests): passed. `git diff --check`: clean.

### A/B round 1 (worktree at `5033ea37` plus the uncommitted change, 17:22–17:32Z)

Chromium 156.0.8078.4, Apple M3 Max, ANGLE Metal, sharp quality, vsync off, 98
NPCs. 10 s per segment after a 5 s warmup; culling arms alternate off, on, on,
off in the same page. Load average 27–68 (other sessions' builds and journeys).
Frame and CPU values are p50/p95 in ms.

**Crowd view** (`ab-crowd.json`, exit 0, every functional check passed):

| Viewport | Players | Peers on screen | Culling off | Culling on | Remote draws, off / on |
| --- | ---: | ---: | --- | --- | --- |
| desktop | 1 | 0 | 15.5/33.5 | 14.8/32.3 | 0 / 0 |
| desktop | 16 | 15/15 | 26.6/34.6 | 26.4/32.8 | 1192 / 1192 |
| phone viewport | 1 | 0 | 12.7/16.8 | 12.7/16.8 | 0 / 0 |
| phone viewport | 16 | 15/15 | 23.1/28.1 | 23.2/28.6 | 1192 / 1192 |

With every peer in view, culling submits exactly the same remote work: 1,192
draws and 4,376,556 triangles in both arms and both viewports. Frame differences
are within the spread of the 1-player rows, where there is nothing to cull.
Reconnect took 150 ms (desktop) and 284 ms (phone); departure converged after
the 30 s grace; no peers remained after cleanup.

**Player view** (`ab-player.json`, exit 1): desktop 1 and 16 players and phone
1 player completed. Desktop 16: 13/15 peers on screen; culling off 24.5/29.8,
on 24.2/29.8; remote draws 1,166 off and 1,176 on, so nothing was culled with
13 of 15 peers in front of the follow camera. The phone 16-player tier failed:
the viewer page's town socket closed (Vite's WebSocket proxy logged
`read ECONNRESET` at 17:26:31Z, `connected: false` in the diagnostics) and the
gesture acknowledgement wait at `rendered-multiplayer.js:225` timed out. The
crowd-view run passed the same tier afterwards. A rerun is queued.

### A/B round 2: away view (18:03–18:09Z, load 90–210)

`ab-away.json`, exit 0. The camera is at the viewer's eye and faces away from
the other players, so 1 of 15 peers is on screen. The tree is round 1's
except that `avatars.js` is restored and `figureHeight` replaces its `height`
field. The arms alternate off, on, on, off.

| Viewport, 16 players | Remote draws off → on | Remote triangles off → on | Frame p50 off → on | CPU p50 off → on | CPU p95 off → on | Frame p95 off → on |
| --- | --- | --- | --- | --- | --- | --- |
| desktop | 634–638 → 478–500 | 3.56M → 2.24–2.31M | 24.7 → 24.1 | 21.1 → 20.4 | 25.6 → 37.9 | 31.8 → 49.3 |
| phone viewport | 634 → 451 | 3.56M → 1.97M | 19.8 → 18.3 | 17.7 → 16.2 | 20.3 → 18.6 | 28.0 → 34.9 |

Culling removes main and GTAO draws of the peers behind the camera, but their
396 shadow draws remain: the sun's shadow map covers at least 36 m around the
camera. Medians and CPU p50 improve in both viewports, and phone frames per 20 s
rise from 999 to 1,084. The tails are inconsistent. On desktop, both p95s are
worse in the on arm. On the phone viewport, CPU p95 is better while frame p95 is
worse, and p99 is equal (35.2 vs 35.4). Two observations point to load rather
than culling. The desktop tier's main sample, taken a minute earlier with
culling on, had frame p95 29.0 and CPU p95 22.9. And the desktop tier's CPU
profile (taken with culling on) shows no new hot spot: `intersectsFrustum` is
1.8% for the whole scene and GC 50 ms in 10 s. An eight-segment rerun
(ABBA then BAAB, each segment recorded separately) is queued to settle it.

### A/B round 2b: player-view rerun (18:09–18:14Z, load 75–115)

`ab-player2.json`, exit 0, every functional check passed, including the phone
16-player tier that dropped its socket in round 1. Desktop 16: 13/15 peers on
screen, remote draws unchanged (1,158–1,174 off, 1,162–1,166 on), yet the arms
differ by 1.6 ms at p50 (24.6 vs 23.0) and 5.6 ms at p95 (35.2 vs 29.6). With
identical work in both arms, that is the noise floor. The 1-player phone tier
(nothing to cull) differed by 15 ms at p95. Phone 16: 6/15 peers on screen;
remote triangles 4.24M → 3.88–3.92M, because peers just off the narrow
viewport's sides still intersect the frustum within the sphere's margin.

### A/B round 3: eight segments, away view (18:15–18:19Z, load 52–87)

`ab-away8.json`, exit 0, reconnect 46 and 41 ms, cleanup to 0 peers. Order off,
on, on, off, on, off, off, on; each segment recorded.

| Desktop segment | 1 off | 2 on | 3 on | 4 off | 5 on | 6 off | 7 off | 8 on |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CPU p50 | 17.9 | 17.2 | 16.5 | 17.9 | 16.6 | 16.7 | 18.5 | 16.6 |
| Frame p50 | 20.9 | 20.4 | 19.7 | 20.9 | 19.7 | 19.5 | 21.6 | 19.8 |
| Frame p95 | 26.7 | 34.1 | 34.8 | 27.3 | 34.7 | 34.7 | 27.1 | 34.5 |

| Phone segment | 1 off | 2 on | 3 on | 4 off | 5 on | 6 off | 7 off | 8 on |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CPU p50 | 16.0 | 14.6 | 14.5 | 14.3 | 14.1 | 15.3 | 14.8 | 13.7 |
| Frame p50 | 17.9 | 16.2 | 16.2 | 15.6 | 15.4 | 16.7 | 16.0 | 15.0 |

Segment means, off → on: desktop CPU p50 17.75 → 16.73, frame p50 20.7 → 19.9,
frames 1,913 → 2,000; phone CPU p50 15.1 → 14.2, frame p50 16.55 → 15.7, frames
2,361 → 2,454. Remote draws: desktop 634–642 → 478–500, phone 634 → 451–465.
Remote triangles: desktop 3.56M → 2.24–2.31M, phone 3.56M → 1.97–2.03M.

The round 2 tail is explained: a frame p95 near 34.5 ms appears in every desktop
segment whose p50 is under about 20.5 ms, including off segment 6, so it follows
frame rate, not culling. It is a pacing artifact of headless Chromium with vsync
off.

### Other checks on the round 1 tree

- Pinned native-4K hero golden:
  `node scripts/character-hero-goldens.mjs --check preview/e2e/goldens/character-hero`
  passed with 0 changed pixels (maximum channel 0, mean 0). Chromium SHA and GPU
  pins matched. Report `.runtime/character-studio/hero-goldens/2026-10-18T17-21-29.030Z/`.
- `node preview/e2e/shared-runner.js required`, 17:21–17:59Z, load 30–530 while
  macOS reclaimed storage: 11/11 journeys passed (access-gate,
  connection-required, multiplayer, indoor-npcs, multiplayer-exclusivity,
  vehicle-exit, multiplayer-gate, resident-names, sit-and-water, greetings,
  character-studio-shared). The regenerated `data/reports/shared-experience.json`
  was not kept in the tree, because a later fix changed the tree. A copy is at
  `.runtime/crowd-442/shared-experience-required.json`.
- Full preview suite (`node --test --test-concurrency=6 preview/tests/*.test.js`,
  nice 19): 3541 passed, 1 skipped, 5 failed. The five failures were the bake
  provenance receipts (coat tails, Lyra, Silvan, seated skirt, Vesper), which
  hash `preview/src/avatars.js`. The first version added a `height` field there.
  That edit is reverted; `figureHeight(avatar)` in `avatar-culling.js` now reads
  the rig's height at its instantiated scale, which gives the same value. All
  five receipt tests and the culling, remote-player and audit tests pass (27 + 5).
- At 17:50Z the disk reached 127 MB free with swap 23.7 of 24.3 GB used. The
  main holder was an Ollama runner from coven-cave (9.7 GB); Val approved stopping
  it. Load peaked around 530 while macOS reclaimed storage.

**Where a peer's cost goes** (census, desktop 16 players, crowd view): about 79
draws per peer, an even three-way split between main (400 for 15 peers), GTAO
geometry (396) and sun shadow (396), and about 292,000 submitted triangles per
peer per frame across those passes. CPU p50 rises from 12.8 ms at 1 player to
23.2 ms at 16, about 0.7 ms per peer, and frame p50 follows it, so the frame is
CPU-bound on this machine.

## Gaps

- Peers behind the camera keep all their shadow draws (396 for 15 peers), and
  the shadow pass is 21.6% of CPU in the away profile. Culling a figure from the
  shadow pass when its shadow cannot reach the view is a separate increment.
- `getProgram`/`getParameters` take about 9% of CPU per frame in both profiles.
  three re-derives programs whenever consecutive draws change kind under GTAO's
  single override material (skinned vs rigid, morph targets, instancing).
  Unmeasured candidate.
- three advances `info.render.frame` on every `renderer.render()` call, so
  `WebGLObjects.update` (geometry attribute upkeep) runs once per pass rather than
  once per frame; skeletons are already pinned by `composeFrame`. Unmeasured
  candidate.
- The local player, carriage driver and other non-remote avatars still skip
  frustum culling.
- No physical iPhone or Mac device budget, and no human visual review. Phone
  viewport rows run on the host GPU.
- This is visibility culling, not an LOD tier; #442's "measured fallback/LOD
  behaviour" is only partly addressed (fallback placeholder already measured on
  2026-10-16).

## Next step

Commit and push the increment, open a draft PR, check hosted CI, and update #442.
Then measure the shadow-pass candidate: a conservative test of each figure's
shadow volume (the figure sphere swept along the sun direction to the ground)
against the camera frustum, A/B'd with the same eight-segment away run.
