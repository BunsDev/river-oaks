# Memory and performance audit

Status: audit and verified fixes complete for the local workloads below.
Uncommitted delivery on `fix/memory-performance-20261009`; preserve this worktree.
Later results supersede historical running/failure entries without erasing them.

## Objective
Find and fix resource leaks and optimize expensive runtime work across the browser,
authoritative Node service, Python bridge, Electron, and Unreal. Preserve visual
quality, server authority, collision, access controls, and late-response fences.
No finite test proves the absence of every leak; record measured workloads and gaps.

## Workspace and ownership
- Base: e059ee0; branch: fix/memory-performance-20261009.
- External worktree: ../river-oaks-memory-20261009.
- Main has unrelated staged edits and a conflict; leave it untouched.
- Owned initially: this ledger, targeted lifecycle/performance tests and fixes
  (exact source files recorded with each result below).

## Plan and evidence requirements
1. Inventory resource ownership: GPU assets, scene reloads, listeners, timers,
   sockets, workers, async loads, caches, server rooms, bridge tasks, native requests.
2. Reproduce each confirmed defect with behavioral tests, then fix the owning seam.
3. Measure repeated churn and hot paths; optimize confirmed excess work without
   reducing world content or changing authority/visual settings.
4. Run focused suites, core verification, full Redis/browser gate with isolated
   services, and applicable native/desktop checks. Record counts/skips/receipts.
5. Review remaining risks against the original cross-runtime scope; retain gaps.

## Current results
- Inspected root/scoped instructions and architecture/workflow.
- Installed locked Node dependencies without lifecycle scripts in isolated tree.
- Initial doctor: Python environment missing; uv sync in progress.
- Preview baseline suite in progress.
- Reviewed scene reload, remote players, speech rigs, store people, shared builds,
  server room ownership, bounded rate limiter and GitHub-name store.

## Gaps / next step
Investigation is active. No leak-free, performance, full-gate, native, hosted,
physical-device or production acceptance claim yet. No commit/push/merge requested.
Next: establish regression evidence for resource lifetime and allocation findings.

## Verified first fixes
- `preview/src/remote-players.js` + its tests: ignore snapshots/updates after
  disposal; reuse three scratch vectors; read label viewport once per frame;
  replace repeated peer membership scans with a Set. Red test reproduced scene
  resurrection and 3,720 Vector3 clones for 31 peers over 60 frames. Green: zero
  clones in the same controller workload, 60 width/height reads each. This is an
  allocation/layout-read count, not an FPS measurement.
- `preview/src/avatars.js`, `preview/src/store-people.js`,
  `preview/tests/avatar-load-lifecycle.test.js`: failed secondary hairstyle loads
  release the already-instantiated avatar. Both real-rig regressions failed
  before the patch; all cloned materials now dispose exactly once.
- `server/town.js`, `server/tests/town-lifecycle.test.js`: close fences new room
  loads, awaits pending loads, closes late-created timers, clears owned room
  references and shares one closing promise. Both regressions failed before fix.
- Focused avatar/remote suites: 19 passed, zero skips. Town lifecycle/worlds:
  6 passed, zero skips.
- `npm run verify`: PASSED, receipt `.runtime/agent/core.json`, finished
  2026-10-09T19:19:09.749Z. Preview: 2,512 pass / 1 existing Vince glazing skip;
  server: 278 pass / 102 Redis skips; desktop: 9 pass; Python: 141 pass (2 warnings).
  Build, tooling, lint/format, offline demo and secret guard passed. Demo verification
  exited its expected 2 for missing real-world acceptance inputs, not live acceptance.
  Build still reports the existing >500 kB chunk warning.

## Browser evidence and open investigation
- Added `preview/e2e/memory-churn.js`: same-page scene rebuilds, post-GC CDP heap,
  DOM/listener and renderer resource samples. Uses the existing fixture server.
- Initial diagnostic: `RIVER_OAKS_E2E_REPORT=memory-churn-20261009.json npm run
  test:experience -- memory-churn`, 6 reloads, 30.921s, zero page errors.
  `data/reports/memory-churn-20261009.json`: 232 geometries throughout,
  textures 189 initially then 187, listeners 362 throughout, 88 store people.
  Heap grew 74,433,092 -> 79,872,164 bytes. This contradicts a completion claim;
  investigate retention vs cache warming before selecting a leak threshold.
- Extended 18-reload diagnostic with warm/final heap snapshots is in progress;
  snapshots belong in ignored `.runtime/memory/`, never in Git. Extended receipt
  includes measured source hashes. Initial receipt used the shorter earlier harness.
- Isolated Redis-backed server suite is in progress; no production service used.

## Remaining cross-runtime audit
- Confirmed bounded code paths (inspection only): rate limiter (4096 keys),
  GitHub name store (50,000 keys), local speech cache (32 entries / 16 MiB), remote
  speech (8 entries / 8 MiB), decision tasks cancelled and gathered on exit;
  Unreal request is weak-bound, bounded and cancelled/unbound in EndPlay.
- Still inspect/test player-avatar host/window/document listeners on dispose;
  late loads, construction failures beyond hairstyle, transient transport churn,
  world/gateway cache ownership, scene GPU cleanup and portrait cache retention.
- Complete full Redis/browser gate and longer churn/soak and before/after hot-path
  measurement. Native/packaged Electron/physical GPU/hosted auth remain unverified.
- Objective remains active; source changes are uncommitted and undelivered.

## Extended diagnostic results (current)
- Isolated `REDIS_URL=redis://127.0.0.1:<owned-port> npm run test:server`:
  391 passed, 0 failed, 0 skipped, 45.506s. Owned Redis terminated after the suite;
  persistence was disabled. Log: `/tmp/river-oaks-memory-redis.log`.
- Extended browser command: `RIVER_OAKS_E2E_REPORT=memory-churn-extended-20261009.json
  npm run test:experience -- memory-churn`: 18 rebuilds / 108.94s / no page errors.
  Fresh renderer receipts are observed before samples; no receipt timeout is ignored.
  Warm cycle 2 heap: 77,113,160; peak: 83,860,228; final: 78,227,728 bytes.
  The early rising trend later receded. Every sample: 232 geometries / 362 listeners /
  88 store people; warm/final textures 187. This workload shows no monotonic scene
  resource growth; it is not proof that all lifecycles are leak-free.
- Warm/final heap snapshots captured, summarized by `.runtime/memory/summarize.mjs`.
  `data/reports/memory-heap-summary-20261009.json` records selected object counts
  and largest shallow-size growth. Largest growth is V8 compiled code/metadata
  (InstructionStream +1,316,032 bytes), consistent with code warming rather than
  a retained copy of each scene. Shallow counts alone do not establish retainers.
- Next concrete work: reproduce and fix player-avatar global/host listener and
  queued appearance teardown; extend avatar swap/transport churn coverage, then
  run full gate and broader performance profiling. No full objective completion.

## Controller teardown follow-up
Previous goal turn classified as progress: patches plus core/Redis/heap evidence.
Revalidated the isolated worktree at e059ee0; earlier edits remain intact.
- Added `preview/e2e/player-lifecycle.js`. Real DOM/controller lifecycle exercises
  three create/dispose cycles, live vs retired keyboard input, window/document
  listeners, idempotent obstacle cleanup, queued appearance cancellation, late
  appearance replies and identity snapshots. Red reproduced 12 failing checks
  (queued request count 1 after disposal); green passed. Extended coverage now
  waits beyond appearance cooldown and also dispatches document visibility.
- `preview/src/player-avatar.js`: AbortController owns host/global listeners;
  dispose is idempotent, cancels appearance timer, releases subscriptions and
  owned rig references. Late replies/snapshots and updates remain inert.
- Added `preview/e2e/multiplayer-lifecycle.js`: actual fixture HTTP/WebSockets,
  suspended session/ticket responses, disposed live socket and pending commands.
  Red produced one post-disposal socket and six snapshots for each handshake
  stage, plus stale connection state and post-disposal callbacks.
- `preview/src/multiplayer-client.js`: abort owned HTTP requests, fence late
  handshake/event callbacks, clear connection state synchronously, reject queued
  commands, clear connection deadline and retained snapshot/player collections.
- Green browser command: `RIVER_OAKS_E2E_REPORT=controller-lifecycle-green-20261009.json
  npm run test:experience -- multiplayer-lifecycle player-lifecycle`, both passed.
  Both handshake probes now create zero sockets / publish zero snapshots after
  disposal. Fixture identities only; no live auth or paid service requests.
- Initial multiplayer harness used a fulfilled document, which Chromium classified
  outside loopback and blocked its WebSockets. Diagnosed the actual local-network
  errors, stopped only the owned browser, and corrected the harness to use a real
  loopback document navigation. No browser security flags or auth policy changed.
- Added both regressions to the default experience suite and the explicit browser/
  full profile experience task in `config/agent-workflow.json`.
- Fresh core verification is running for this patch. Full gate next, with owned
  disposable Redis. Earlier core and resource receipts predate these changes.

## Transport backpressure and shutdown
- Fresh controller core gate passed (`.runtime/agent/core.json`); subsequent server
  changes below require current full-profile validation, now running.
- Real transport regressions in `server/tests/shared-transport.test.js` reproduced:
  stalled approval permits more than eight acknowledged commands to queue, and
  shutdown creates a fresh 10-second grace timer retaining the world.
- `server/app.js` now matches distributed transport's eight pending acknowledged
  command bound, preserving pose coalescing and order around travel. Shutdown
  releases connected and already-departed players without creating grace timers;
  ordinary disconnect still retains reconnect grace before shutdown.
- `node --test server/tests/shared-transport.test.js server/tests/transport-failure.test.js
  server/tests/town-lifecycle.test.js`: 27 passed, zero failures/skips, 0.825s.
- `npm run verify -- full` is running through `.runtime/memory/verify-full.mjs`
  with fresh owned loopback Redis and persistence disabled. Receipt:
  `.runtime/agent/full.json`; Redis lifecycle `.runtime/memory/full-service.json`;
  log `/tmp/river-oaks-memory-full.log`. Do not restart while its handle remains live.
- Browser reports use new task-specific filenames; no old report is acceptance
  evidence for this new patch. Work remains uncommitted.

## Shutdown return guarantee and broader checks
- A new real-transport churn probe (`node --expose-gc .runtime/memory/server-churn.mjs`)
  found that `app.close()` returned before close-event callbacks released five
  remaining players. Strengthened both shutdown regressions to assert immediately
  after awaiting close: both failed. Shutdown now releases all connection-owned
  players and clears its connection map before terminating sockets.
- Focused transport/lifetime command above: 27 passed, zero skips, 1.888s after
  this follow-up. Logs `/tmp/river-oaks-server-close-{red,green}.log`.
- Churn rerun: 33 server lifetimes / eight real loopback clients each; all players
  released before close resolves, zero active resources at every post-GC sample.
  Receipt: `data/reports/server-memory-churn-20261009.json`. Heap warmed upward
  slightly, so resource release is established; a universal heap plateau is not.
- Native Editor build succeeded (124.57s) with installed UE5.8.2, using isolated
  project's `unreal/RiverOaks.uproject`, Development/Mac, `-WaitMutex -NoUBA
  -NoUBALocal -MaxParallelActions=2`. Log `/tmp/river-oaks-memory-native-build.log`.
- `UnrealEditor-Cmd <isolated-project> -unattended -NullRHI
  -ExecCmds="Automation RunTests RiverOaks.Contracts"
  -TestExit="Automation Test Queue Empty"
  -ReportExportPath=/tmp/river-oaks-memory-native-contracts`: report records
  25 succeeded, zero warnings/failures/not-run. Native rendered-memory/target-GPU
  acceptance remains separate; no imported assets or engine source changed.
- Full profile is still running. All tasks before shared journeys passed;
  `world-map` failed waiting for a visible peer marker (60s; no page errors).
  Remaining journeys continue. Isolate this failure after the running handle
  finishes. Server stage predates the final close-return fix and needs rerunning.

## Terminal gate and extended retention results
- Full profile finished **failed** only at the shared-journey task: 17 of 18 shared
  journeys passed; `world-map` timed out on the peer marker. All other full tasks
  passed. Counts: preview 2,512 pass / one existing skip; server 394 pass / zero
  skips; desktop nine; Python 141 / two warnings; tooling 17. Both new controller
  browser regressions passed in the full experience task.
- Final server patch rerun with fresh disposable Redis: `npm run test:server`,
  **394 passed, zero failures/skips, 33.236s**. Log
  `/tmp/river-oaks-memory-server-final.log`; lifecycle receipt
  `.runtime/memory/server-service.json` confirms Redis stopped, exit zero.
  The original full runner's Redis also stopped. No production services used.
- `RIVER_OAKS_SHARED_JOURNEY=world-map
  RIVER_OAKS_SHARED_REPORT=memory-world-map-isolated-20261009.json
  npm run test:shared -- development-world` passed without code/test changes.
  This does not erase the full-run failure; order/load sensitivity is unresolved.
- `node --expose-gc .runtime/memory/server-retention.mjs`: **96 server lifetimes,
  768 authenticated local client connections**, zero active resources in each
  sample. Weak references after six seconds idle and forced GC: zero worlds and
  zero server controllers retained. Final used heap 15,020,616 bytes. Receipt
  `data/reports/server-memory-retention-20261009.json` includes source hashes.
- Native command exited zero; a durable source-hashed summary is
  `data/reports/memory-native-contracts-20261009.json`. Editor-generated input
  defaults were moved from untracked `unreal/Config/DefaultInput.ini` into ignored
  `.runtime/memory/native-generated-DefaultInput.ini`; no native source edits.
- Rendering audit is now running separately from other owned test workloads:
  `npm run audit:multiplayer:render -- --players=1,32 --seconds=20 --warmup=10
  --output=data/reports/memory-render-20261009.json`. Desktop fixture acceptance
  and ordered world-map reproduction remain next. No universal leak-free claim.

## Render profile and final acceptance follow-up
- Unprofiled crowd rendering audit **passed** on Apple M3 Max / Chromium Metal,
  20 seconds at each tier, Sharp/full scale/AO/bloom/MSAA retained. Desktop p95:
  1 player 16.8ms frame / 10.2ms CPU; 32 players 33.4ms frame / 28.8ms CPU.
  Phone viewport on the same GPU: 16.8/7.4ms and 33.4/26.9ms respectively.
  All 31 peers were visible/loaded at capacity; no errors, rejected commands,
  missing assets or unexpected disconnects. This is not physical-phone evidence.
- Capacity renderer counts: desktop 4,146 draw calls / 14.35M triangles per frame;
  after departure zero peers and geometry 1,026 -> 204 (one-player baseline 202).
  Small cache/resource differences remain; this single departure is not a churn
  plateau. Report: `data/reports/memory-render-20261009.json` (source hashes).
  Host load average at start was 23.4 across 16 logical CPUs; unrelated user apps
  were preserved. No before/after FPS improvement is claimed from these samples.
- Added ignored diagnostic copy `.runtime/memory/render-profile.mjs` of the
  existing audit with eight-second CDP CPU sampling, one desktop tier. Its report
  and source hash identify the actual driver. Self samples are dominated by
  WebGL matrix uploads/draw submission; summary `memory-cpu-profile-20261009.json`.
  Profiled frame timing includes profiler overhead and is not the baseline.
  Next performance seam: inspect remaining crowd draw submissions/batching,
  preserve authored appearance, animation, named parts and visibility rules.
- Ordered `npm run test:shared -- development-world` **passed** both world-boundary
  and world-map unchanged. Receipt `memory-world-order-20261009.json`. The earlier
  full-run timeout remains recorded; two reruns do not justify rewriting it green.
- Initial offline desktop wrapper omitted the shell's existing acceptance-fixture
  flag, so startup correctly rejected missing live WorkOS configuration. Diagnosed
  from Electron stderr; set `RIVER_OAKS_ACCEPTANCE_FIXTURE=1` in the local wrapper.
  Production checks unchanged; no credentials read. The corrected desktop suite
  is running, with provider routes blocked by the local Vite fixture middleware.

## Current handoff
- Corrected desktop fixture command `node .runtime/memory/desktop.mjs` exited zero.
  `data/reports/memory-desktop-green-20261009.json`: passed, zero page errors,
  including movement, shop/conversation, preference persistence, fullscreen/minimize,
  native isolation/navigation restrictions, and renderer crash recovery. Optional
  provider requests returned the deliberate fixture 503. Shutdown logged proxy
  ECONNRESET while closing owned sockets; the harness and process exited cleanly.
  This custom fixture run did not execute the CLI `--dev`-only HMR check.
- `git diff --check` passes. Current edited-source hashes and validation summary:
  `data/reports/memory-audit-manifest-20261009.json`. No commit/push/merge performed.
- Completed in this goal turn: player/multiplayer controller teardown, bounded
  in-memory commands, server shutdown reference release, 96-lifetime collection
  proof, full-profile attempt, two world-map repeats, native build/contracts,
  desktop acceptance, actual crowd rendering and CPU sampling.
- Goal remains active. Next concrete step is to inspect crowd draw-call batching
  against the CPU profile (matrix uploads dominate), with a behavior/visual-preserving
  before/after probe before any production optimization. Existing costume batching
  already merges unnamed opaque meshes sharing a bone/material, and intentionally
  preserves named/transparent parts and Lyra's individual visibility handles.
- Remaining acceptance gaps: intermittent full-run world-map timeout; no clean
  terminal full receipt on this final source set; native rendered memory/long soak,
  physical mobile, live auth/providers/hosted CI and production are not proven.
  Those limits are not failures reproduced in the patched lifecycles.
- Worktree `../river-oaks-memory-20261009`, branch `fix/memory-performance-20261009`,
  contains undelivered edits and evidence. Do not archive or remove it.

## Crowd material batching follow-up
- Previous goal turn classified as progress (source fixes and live verification).
  Revalidated worktree/branch at e059ee0; canonical main has advanced to 99a6b94,
  so retained isolation and did not alter/rebase other work.
- CPU-profile-led inventory found identical flower petal/centre materials created
  for every blossom, preventing existing per-bone batching. A focused regression
  on shipped rigs failed with nine petal materials instead of one.
- `preview/src/reference-archetypes.js` lazily shares the two blossom materials
  within each owned outfit. No cross-avatar/global cache, geometry, animation,
  transparency, visual settings or named-part behavior changes.
- `preview/tests/reference-batching.test.js` covers both forest variants, per-avatar
  isolation and exact material disposal, and tightens existing draw budgets for
  both human/beast forms while retaining exact triangle counts.
- Focused reference/player/prince costume suites: 14 passed, zero skipped, 1.116s.
  Accessory mesh inventory: masculine forest 53 -> 37, feminine 66 -> 50.
- Matched textured render diagnostic compares original and patched reference looks
  under identical lights/cameras and rest/articulated poses. First probe reused a
  deliberately lost WebGL canvas and failed on the next capture; corrected to own
  a fresh canvas per capture. Pixel differences are recorded explicitly rather than
  silently tolerated; this diagnostic is not human visual acceptance. See reports
  `memory-flower-visual-20261009.json` and `memory-flower-visual-r2-20261009.json`.
- Next: inspect matched renders, measure the full crowd again, and rerun the full
  profile for a current terminal result. Broad goal remains active.

## Native lifetime reproduction and repair
- Continued owning-code audit found append-only retired native handle records and
  collapsed-but-never-reused marker slots. Added `RiverHumanLifetimeTests.cpp` with
  actual engine components and bounded live populations: 4,096 pose-ledger churn
  cycles, 1,024 marker replacements and 256 skeletal replacements/periodic GC.
- Editor red build succeeded (44.87s). `RiverOaks.Contracts.Lifetime` report
  `/tmp/river-oaks-native-lifetime-red/index.json`: **zero passed, three failed**.
  Marker instance count was 1,025 for a peak of two live residents; pose-ledger and
  skeletal metadata exceeded their warmed storage budgets. The command exited zero
  despite failed tests: the JSON report, not exit status, is authoritative.
- `RiverOaksHumans.{h,cpp}` now tracks live sequence records in a map while keeping
  issued handles monotonic and rejecting allocation exhaustion. Destroyed handles
  still reject late poses, including sequences greater than a replacement's.
- `RiverMarkerBackend.{h,cpp}` reuses retired instance slots under fresh handles;
  other live instance indices remain stable. `RiverSkeletalBackend.{h,cpp}` removes
  retired records and tears down sparse live handles rather than scanning historical
  indices. Allocation-size accessors support direct bounded-storage regressions.
- First green Editor build succeeded (43.53s). Strengthened stale-marker and sparse
  skeletal teardown assertions afterward; incremental final build is running before
  all 28 native contract tests and the Game target build.
- Full repository gate is separately still running, with world-map passed this time.
  Its Python/native-source checks preceded these C++ changes and need refreshing.

## Final gate and native results
- `node .runtime/memory/verify-full-batched.mjs` (owned persistence-free Redis;
  runs `npm run verify -- full`) passed all 17 profile stages. Durable receipt:
  `data/reports/memory-full-profile-final-20261009.json`. Redis stopped cleanly.
  Preview 2,513 passed / one existing skip; server 394 passed / zero skips;
  desktop unit 9 passed; agent tooling 17 passed; Python 141 passed / two warnings.
  All five selected experience journeys and all 18 shared journeys passed,
  including world-map. Original failed full receipt remains preserved separately.
- Final Editor build: succeeded, 20.13s. Mac Development Game build: succeeded,
  95.93s. `RiverOaks.Contracts`: 28 passed, zero warnings/failures/not-run, 2.883s.
  All three new lifetime tests passed. Python refreshed after the native source
  edits: `uv run --locked pytest -q`, 141 passed, two existing warnings, 6.93s.
  Source hashes and results: `memory-native-lifetime-final-20261009.json`.
- Engine-generated untracked DefaultInput.ini and Build directory moved into
  ignored `.runtime/memory/native-generated-*` artifacts; no authored files removed.
- Matched flower captures: 0–2 changed pixels out of 614,400 per view; exact
  triangle counts. Visually inspected textured rest/posed comparisons. Draws
  masculine 59 -> 43; feminine 74 -> 58. These are diagnostic comparisons,
  not formal human visual acceptance.
- `npm run audit:multiplayer:render -- --players=1,32 --seconds=20 --warmup=10
  --output=data/reports/memory-render-batched-20261009.json` passed. Full quality,
  all 31 peers loaded/visible, no asset/transport failures. Comparable desktop
  crowd snapshot: 4,146 -> 3,858 draw calls with 14,352,395 triangles unchanged.
  Independent runs did not consistently improve frame time (latest desktop p95
  50ms vs earlier 33.4ms); no FPS gain is claimed. ABBA paired probe is running.
- Independent read-only review requested using requesting-code-review skill;
  no commit, push, merge or publication performed.

## Paired render result
- `node .runtime/memory/render-paired.mjs --players=32 --seconds=20 --warmup=10
  --output=data/reports/memory-render-paired-20261009.json` passed all four desktop
  phases, baseline/patched/patched/baseline. Own heavy checks were finished first;
  unrelated user processes remained untouched. Driver/baseline hashes are recorded.
- All 31 peers loaded and visible, full Sharp quality. Frame p95: 33.4ms in all
  phases. CPU submission p95: baseline 30.5/30.4ms; patched 29.0/29.5ms. This small
  sampled improvement does not establish a general FPS gain or statistical effect.
- Same-triangle captured frames (14,355,423 triangles): 4,164 -> 3,876 calls,
  288 fewer (6.9%). Geometry allocations in paired samples: 1,026 -> 930.
  Animated sampling produces small count differences across other snapshots;
  fixed-camera single-outfit tests separately prove identical triangle counts.
- Final source manifest refreshed; original earlier manifest preserved as
  `memory-audit-manifest-first-20261009.json`. Independent review remains pending.


## Final disposition
- Fresh-context independent code review completed: no critical, important or minor
  correctness findings. Reviewer independently ran
  `node --test server/tests/shared-transport.test.js server/tests/transport-failure.test.js
  server/tests/town-lifecycle.test.js preview/tests/avatar-load-lifecycle.test.js
  preview/tests/reference-batching.test.js`: 32 passed, zero failures/skips.
- Completed objective within the documented local scope: cross-runtime ownership
  audit; reproduced browser/server/native lifetime defects and added regressions;
  allocation and material batching reductions; browser/server churn evidence;
  full Redis/browser profile, desktop fixture, native Editor/Game builds/contracts;
  paired rendering and independent review. No reproduced finding remains open.
- Limits remain explicit: no finite audit proves the absence of every leak.
  Native rendered GPU long soak, physical mobile, signed/packaged distribution,
  live auth/providers, hosted CI and production acceptance were not performed.
  Browser churn is 18 rebuilds, server churn 96 lifetimes; timings reflect this
  host and workload. One pre-existing preview skip and two Python warnings remain.
- Current source/evidence index: `data/reports/memory-audit-manifest-20261009.json`.
  Historical failed diagnostics remain for provenance; final successful receipts
  are separately named. No weakened timeout, visual quality or authority checks.
- Worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-memory-20261009`.
  Branch: `fix/memory-performance-20261009`, base e059ee0. No commit/push/merge.
  Next delivery step is review/commit when requested, followed by hosted CI before
  any merge. Do not archive/remove this worktree with its undelivered edits.
