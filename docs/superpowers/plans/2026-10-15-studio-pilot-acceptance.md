# Garden Office pilot acceptance (#417, parent #413)

## Objective and ownership

Decide, with revision-bound evidence, whether the Garden Office (#416, merged as
`05a5e9fe` via #439) is ready to be the reusable local-template baseline: the full
edit/refusal/repair/undo/save/reopen/walk/exit journey, bounded resource use over
repeated cycles, recovery from late and missing assets, real-GPU measurements and
keyboard/layout checks. Fix only demonstrated defects, narrowly.

Branch `test/studio-acceptance-417-20261015` in `river-oaks-studio-acceptance-417`,
owner `claude:river-oaks-safe-edits (e9aa0185)`, register task
`studio-acceptance-417`. Base `d8f9cdee542728df36f43aa8bae013b5c540b6f2` (origin/main
at pickup, contains #416). Coding scope only: visual approval belongs to a design
reviewer, and product/device decisions and human screen-reader/touch checks to Val
or a named human reviewer. No merge, deployment or production change.

## Review profile (recorded 2026-10-15, before any tuning)

| | |
| --- | --- |
| Machine | MacBook Pro Mac15,9, Apple M3 Max (16 CPU cores, 40 GPU cores, Metal 4), 48 GB |
| OS | macOS 26.7.1 (25G241) |
| Browser | Chromium 156.0.8078.4 via Playwright, headless, `--use-angle=metal` |
| WebGL renderer | ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max) |
| Viewport / DPR | 1440 × 1000 (experience runner), device pixel ratio 1 |
| Quality | Studio has no quality tiers; antialias on, PCF shadows, ACES tone mapping |
| Desktop app | Electron 44.7.0 (`node desktop/studio-e2e.js` path) |
| Three.js | 0.186.1 |
| Room / assets | Garden Office recipe at `d8f9cdee`; forms per `docs/design/garden-office/asset-manifest.json` |
| Controller | `studio-walking-v1`: radius 0.35 m, eye 1.68 m, 1.65 m/s; route profile `office` v1 |
| Fixtures | No avatars or residents; Studio walks a single local controller |

Shared machine: other agents' browser runs and the owner's own Chrome load the same
GPU. Frame times are only comparable as interleaved A/B runs with vsync off; see
"Frame timing" below when measured. The issue's report ceilings (150 extra draw
calls, 250k room triangles, 128 MiB textures, 16.7/33.3 ms) are hypotheses, not
accepted budgets.

## Soak design

`preview/e2e/studio-pilot-soak.js` (registered by name with the experience runner):
one warm-up cycle plus ten more. Each cycle opens Garden Office from the template
chooser, walks (1.5 s forward, turn 90°, 1 s forward), returns to the editor and
replaces it with Courtyard House, which disposes the office scene. Two samples per
cycle, office open and after replacement, each after `HeapProfiler.collectGarbage`
and a fresh viewport render-stats reading: renderer `calls`, `triangles`,
`geometries`, `textures`, `programs`; Chromium `JSEventListeners`, `Nodes`,
`JSHeapUsedSize`; canvas count.

Expected persistent state, bounded: the shared PBR texture cache (`materials.js`,
loaded on first stone/paver surface), one PMREM reflection target per viewport, and
compiled shader programs. Media/audio: not applicable (Studio owns none).

Instrumentation: `viewport.js` publishes the game's `data-render-stats` format on the
Studio viewport once a second, plus `programs` and the sample time `at`.

## Checks and evidence

### Soak run 1 (source `d8f9cdee` + render-stats instrumentation, 2026-10-15)

`RIVER_OAKS_E2E_REPORT=studio-pilot-soak-1.json pnpm run test:experience studio-pilot-soak`:
passed in 56.1 s, about 5.1 s per cycle, no page errors
(`.runtime/acceptance/studio-pilot-soak-1.json`, local-only).

| Cycle | Office: calls / tris / geoms / tex / progs / listeners / nodes / heap MiB | After replace: same |
| --- | --- | --- |
| 0 (warm-up) | 648 / 48,564 / 25 / 7 / 6 / 157 / 916 / 13.37 | 670 / 59,744 / 25 / 10 / 6 / 165 / 1,003 / 14.13 |
| 1 | 648 / 48,564 / 25 / 10 / 6 / 157 / 921 / 13.73 | … / 10 / 6 / 165 / 1,003 / 15.37 |
| 2 | … / 14.39 | … / 14.66 |
| 3 | … / 14.31 | … / 14.68 |
| 4 | … / 14.39 | … / 14.84 |
| 5 | … / 15.18 | … / 14.83 |
| 6 | … / 14.87 | … / 15.31 |
| 7 | … / 15.02 | … / 14.85 |
| 8 | … / 14.93 | … / 16.38 |
| 9 | … / 15.01 | … / 16.36 |
| 10 | … / 14.50 | … / 16.47 |

"…" means identical to cycle 1. All GPU counts, listeners, nodes and canvases are
constant from cycle 1. Textures step 7 → 10 once, in the warm-up, when Courtyard
House first loads the shared stone/paver maps: the shared PBR cache, never disposed
by design. Draw calls include the shadow pass (about twice the office's 326 meshes).
JS heap rises about 0.1 MiB per cycle. Hypothesis, not yet shown: each template open
pushes the previous document onto undo history (`historyLimit` 80), so 11 cycles add
22 snapshots; heap should level off near 40 cycles. To confirm with a longer run.

### Long soak and heap diagnosis

`STUDIO_SOAK_CYCLES=50 … studio-pilot-soak` passed in 259.4 s
(`.runtime/acceptance/studio-pilot-soak-50.json`). GPU geometries 25, textures 10,
programs 6, listeners 157/165, nodes 921/1,003, canvases 1 and draw calls 648/670
are constant for all 50 post-warm-up cycles. Heap after replacement, mean: cycles
1–10 14.97 MiB, 21–30 15.78, 41–50 16.81, with bimodal sample noise of about
1.5 MiB. That contradicts "levels off at cycle 40", so the growth was treated as
unexplained and diagnosed instead of assumed.

Heap snapshots (`STUDIO_SOAK_CYCLES=40 STUDIO_SOAK_SNAPSHOTS=10,40`, compared by type
and constructor, `.runtime/acceptance/heap-10-40/`): live self size 31.47 → 32.49
MiB. Largest growth: heap numbers +18,612 (223 KB), plain objects +2,829 (148 KB),
strings +21,110 (138 KB); V8 compiled code (InstructionStream, TrustedByteArray,
ProtectedFixedArray, about 320 KB) from optimisation tiers; Chromium performance
timeline entries (layout shift, LCP, script timing, LoAF; about 100 KB), whose
layout-shift count stopped at exactly 150, Chromium's buffer limit. Studio
registers no PerformanceObserver; the game's debug report, which does, is not
loaded in Studio and is capped. Cycles 10–40 are exactly when undo history fills
from about 22 to its 80-entry cap, so this window cannot separate history from a
leak.

Decisive run, `STUDIO_SOAK_CYCLES=70 STUDIO_SOAK_SNAPSHOTS=40,70`, passed
(`.runtime/acceptance/studio-pilot-soak-heap-70.json`, snapshots in `heap/`):

| Snapshot window | Live self size | Numbers | Plain objects | Strings |
| --- | --- | ---: | ---: | ---: |
| 10 → 40 (history filling) | +1.02 MiB | +18,612 | +2,829 | +21,110 |
| 40 → 70 (history full) | +0.41 MiB | +1,303 | +181 | +1,279 |

With history at its cap, document data stops growing. The remaining +0.41 MiB is
V8 compiled code (InstructionStream, TrustedByteArray, ProtectedFixedArray, about
270 KB) and Chromium performance-timeline entries (script timing, LoAF, event and
long-task timing, about 60 KB), both browser-managed. Heap means per ten cycles:
14.90 (1–10), 15.38, 15.80, 15.92 (41–50), 15.98 (51–60), 15.97 (61–70). GPU
geometries 25, textures 10, programs 6 and listeners 165 constant for all 70 cycles;
DOM nodes 1,003, once 973.

**Soak disposition:** no unexplained sustained growth. Bounded persistent state is
the shared PBR texture cache, one PMREM target, six shader programs and undo history
(80 entries, about 1.4 MiB here). No fix is needed. Reuse: `pnpm run test:experience
studio-pilot-soak` (one warm-up plus ten cycles), longer with `STUDIO_SOAK_CYCLES`.

### Acceptance journey

`preview/e2e/studio-pilot-journey.js`. Run 1 failed on a test-script error: it
treated the sofa's North move as the blocking edit; in the #414 journey that move is
accepted and moving the sofa east into the doorway is refused. Run 2 passed every
edit and storage check (valid edit; refusal with a meeting-room finding and the sofa
unmoved; three undos and a redo; save keeps the office assessment context; reload
reopens and reassesses; a second tab's save is kept and the stale tab's save is
refused), then failed reading the position readout before walk mode's first frame
(placeholder text). The walker now waits for a real reading.

Run 3, `RIVER_OAKS_E2E_REPORT=studio-pilot-journey-3.json pnpm run test:experience studio-pilot-journey`:
**passed, 13 checks, 59.6 s, no page or console errors**
(`.runtime/acceptance/studio-pilot-journey-3.json`). The walker follows each assessed
route, shortened to straight stretches that `spaceMovementSegment` accepts both
ways, steering by drag and stepping with W, and returns along the reverse:

| Target | Waypoints | Reached (E, N) | Back at | Seconds |
| --- | ---: | --- | --- | ---: |
| reception (0, −4) | 2 | 0, −4 | 0, −8.5 | 5.98 |
| work area (−2, 1) | 4 | −1.9, 1 | 0, −8.6 | 14.62 |
| meeting room (3, 1) | 4 | 3, 1 | 0, −8.6 | 16.23 |
| kitchenette (−1, 5) | 2 | −1, 5 | 0, −8.5 | 19.50 |

Readout precision is 0.1 m; arrival tolerance 0.3 m. This exercises the real walking
controller and collision in the browser, not only the route assessment.

### Late and missing assets

A furnished space's only asynchronous assets are the shared stone and paver
textures (`materials.js`). `preview/e2e/studio-pilot-assets.js` stands at CAM-02 and
averages the limestone counter top's brightness (0–255) in a 150 × 40 px patch; each
case uses a fresh page, and routing disables the HTTP cache. Run 1 (before any fix,
passed as a measurement, `.runtime/acceptance/assets-1/`):

| Case | Counter top | Textures resident |
| --- | ---: | ---: |
| normal | 170 | 7 |
| stone textures blocked | **69** | 4 |
| delayed 8 s, 1.1 s after opening | **69** | — |
| delayed, after loading | 170 | 7 |
| scene replaced while loading, then reopened | 170 | 10 |

**Defect A1:** a missing or still-loading texture renders its surface near black and
glossy. Three.js binds no texture until an image is uploaded, and WebGL samples that
as black; the ARM map's black also makes the surface smooth. Late arrivals after a
scene replacement are fine: textures are a shared cache, scenes hold no load
callbacks, so nothing is revived, and there were no page errors.

Fix at the owner (`materials.js`, shared with the game): each texture starts with a
neutral one-pixel image per channel (light grey albedo, flat normal, ARM with no
occlusion, roughness 0.86, metalness 0) and keeps it if the photograph never
arrives. Three.js allocates immutable storage at the first upload's size, so the
load callback disposes the texture's GPU storage; the next frame reallocates at full
size. `ImageLoader` always delivers asynchronously (cache hits use `setTimeout`), so
the placeholder cannot overwrite a loaded photograph. The scenario now requires
missing, loading, loaded and replaced cases within 40 of normal; run 1's 69 vs 170
already shows it failing without the fix.

Run 2 with the fix (`.runtime/acceptance/assets-2/`): **passed** in 24.4 s, no page
errors. Normal 170, blocked **198**, loading **198**, loaded 170 (7 textures), replaced
and reopened 170 (10). The stand-in reads lighter than limestone because one neutral
grey serves every texture set (stone, paver, brick, asphalt…). The loaded case
returning to 170 confirms the full-size photograph replaces the 1×1 allocation.
Focused Studio suite with the change: 96 / 0 / 0. Game impact checked separately.

### Frame timing and load (perf run 1)

`STUDIO_PERF_OUT=.runtime/acceptance/perf-1 node preview/e2e/studio-pilot-perf.mjs`
(new; follows `office-ipic-perf.mjs`): source `d8f9cdee` plus instrumentation, before
the texture fix. Chromium 156.0.8078.4, ANGLE Metal on the M3 Max,
`--disable-gpu-vsync --disable-frame-rate-limit`, 1440 × 1000 at DPR 1. Shared machine
under heavy load: load average 61.8 → 99.9 during the run. No page errors.

| View | Interval p50 / p95 / p99 (ms) | Window p50/p95 | Calls | Triangles |
| --- | --- | --- | ---: | ---: |
| whole scene, overhead | 1.3 / 4.4 / 6.4 | 1.3/4.3, 1.2/5.0, 1.2/4.1 | 648 | 48,564 |
| CAM-01 entry | 1.5 / 4.9 / 6.7 | 1.6/4.6, 1.5/5.3, 1.5/4.7 | 532 | 38,220 |
| CAM-02 reception | 1.6 / 4.3 / 6.9 | 1.6/5.4, 1.7/4.3, 1.5/4.0 | 376 | 27,396 |
| CAM-03 workstation | 1.5 / 5.1 / 6.7 | 1.5/5.1, 1.7/4.7, 1.5/5.6 | 390 | 27,924 |
| CAM-04 meeting | 1.5 / 5.0 / 7.8 | 1.5/5.6, 1.5/4.9, 1.4/5.8 | 383 | 27,592 |
| CAM-05 kitchenette | 1.5 / 4.7 / 6.6 | 1.6/4.7, 1.4/4.5, 1.6/5.2 | 394 | 29,172 |
| CAM-06 exit | 1.4 / 4.6 / 7.1 | 1.7/4.7, 1.4/4.6, 1.4/4.9 | 342 | 25,012 |

Calls and triangles include the shadow pass. Resident: 25–34 geometries, 10 textures.
Cold load to `data-studio-ready` 970 ms; Garden Office open 381 ms cold (routes
passed 506 ms), 488 ms warm (593 ms). Transfer 8.5 MB at ready and 10.3 MB after the
office (dev server: modules unbundled and uncompressed, not production bytes).
Resident texture estimate, not a measurement: six 1024² PBR maps with mipmaps
≈ 34 MiB, plus the PMREM target and the 2048² shadow map. No VRAM figure is claimed.

Against the issue's provisional ceilings (hypotheses, not accepted budgets): every
view is far inside the 16.7 ms tier and the 250k-triangle room ceiling; draw calls
reach 648 with the shadow pass (about 324 per pass). A budget decision belongs to
Val; this records the measured basis. Interval p95/p99 on this loaded machine are
"occasional doubled frames under load", not a property of a view.

### Occupied-use circulation

`preview/tests/studio-pilot-acceptance.test.js`: every chair pushed back 0.25 m and
0.4 m from its desk or table (along its back, `(-sin yaw, cos yaw)`) and grown to a
seated footprint of at least 0.6 × 0.75 m; standing people (0.5 × 0.4 m) at the
reception counter's front and at the kitchenette sink. All four required routes and
the exit still pass at both push-backs. Teeth check: three standing people across the
2 m entrance block the reception route (`blocked required-route office-1`). These are
synthetic circulation fixtures, not seating or multiplayer evidence. Visible occupant
figures in captures are not possible: Studio has no person form, and #417 excludes
new systems, so occupied-use review is route evidence only.

### Keyboard and non-drag controls (finding)

Walk mode moves with W/A/S/D and the arrows (left/right strafe), Shift hurries,
Escape exits; turning is only by pointer drag (`viewport.js` keydown). A keyboard-only
user can reach every point by strafing but cannot turn to face a room.

`preview/e2e/studio-pilot-a11y.js` (new). First run on unfixed code, with a trial
E key for turning: **failed at the turning check**, "moved 0.0 E, 1.0 N after E then
W". Every earlier check passed: 320 × 640 and 390 × 844 with no sideways scroll and
Walk through, Undo, Redo, Save on device and Space templates reachable at 24 px or
more; Enter on a scene object selects it; a typed East value commits without
dragging; the undo shortcut restores it (`.runtime/acceptance/a11y-red/`).

Decision: match the existing convention instead of adding keys. The office walk
(`office-ui.js`: W/A/S/D move, ←/→ turn at 1.6 rad/s) and bird-cam flight both turn
with the left/right arrows. Studio's walk mode now does the same: W/S and ↑/↓ move,
A/D strafe, ←/→ turn at 1.6 rad/s; drag still turns. This changes Studio's arrows
from strafing to turning. Hint text, `docs/world-studio.md` and the desktop agent's
Studio guide (`desktop/studio-agent-guide.js`) updated. The scenario's turn check now
measures only W's step after the arrow, so it heads east after a real turn and still
north if the arrow merely strafed (old behaviour by inspection: arrows fed `strafe`).

### Game check for the shared `materials.js` change

`RIVER_OAKS_E2E_REPORT=studio-pilot-game-check.json pnpm run test:experience player-lifecycle hud-and-quality`:
both passed (9.9 s and 20.4 s), no page errors. Hosted CI's street and places
experience suites remain the wider gate.

Rerun with arrow turning, `RIVER_OAKS_E2E_REPORT=studio-pilot-a11y-1.json pnpm run test:experience studio-pilot-a11y`:
**passed, 19 checks**, no page errors (`.runtime/acceptance/a11y-1/`). After →, W
moved 1.0 m east and 0.0 m north; focus stays on the viewport after leaving walk
mode and returns to Space templates when the chooser closes; with reduced motion
emulated, no animations run (Studio's only CSS animation, the agent pulse, already
stops under reduced motion). Focused Studio suite 97 / 0 / 0. The 320 px capture is
usable: header controls wrap to three rows, walk controls stay visible, panels stack.
Emulated widths are not a physical-device or touch pass.

## Decision: continue, with named reviews outstanding

The evidence supports keeping the Garden Office pilot as the local-template baseline:
the full journey passes on the real GPU; 70 cycles show no unexplained growth; late,
missing and replaced-while-loading textures recover (after fix A1); required routes
hold with every seat occupied; frame times are far inside the provisional tiers; and
keyboard-only use now includes turning. Changes made, each narrow and measured:
`materials.js` neutral texture placeholder (shared with the game), Studio arrow-key
turning, and the viewport's render-stats publication.

Not decided here, by role:

- **Val:** whether to accept a scoped budget for this profile (MacBook Pro M3 Max,
  Chromium 156, 1440 × 1000 at DPR 1) from the measured numbers above, or keep the
  decision open; whether Studio's arrows turning (matching the office) is accepted.
  Electron: `node desktop/studio-e2e.js` is the supported native path, run in the gate
  below; packaged builds are outside this scope unless Val says otherwise.
- **Design reviewer:** visual disposition of the paired captures from #416
  (`studio-office-stations`, baseline and four after sets, six stations × three
  presets); known open items D3 (counters, tables and cabinets), D7 (no ceiling) and
  D9 (bare exterior).
- **Human reviewer:** screen-reader (VoiceOver), touch and uncoached use. Automated
  checks here are not that review; each remains open.
- Physical devices (including iOS, #289) and full Redis profiles: not run, not claimed.

## Affected gates (base `d8f9cdee` + this patch, 2026-10-15)

`.runtime/acceptance/gates/` (local-only):

- `pnpm run verify`: **core passed, 11/11 tasks**. Agent 112; preview 3,279 passed,
  1 skipped, 1 TODO; server 591 passed, 150 Redis skips; desktop 69; Python 141.
  Total **4,192 passed / 151 skipped / 1 TODO**; includes the build.
- `pnpm run test:experience world-studio`: **passed in 31.385 s, 0 page errors**.
- `node desktop/studio-e2e.js`: **11/11** native checks (supported Electron path).
- Focused `node --test preview/tests/studio-*.test.js server/tests/studio-assets.test.js`: 97 / 0 / 0.
- Game check for `materials.js`: `player-lifecycle` and `hud-and-quality` passed.

## Next (2026-10-15)

Signed commit and draft PR; then the reviews listed under the decision. No merge. Done: #452
merged as `5dc0303a`. The 2026-10-18 section below is current.

## Current-main acceptance (2026-10-18)

### Ownership and decisions carried in

- **Task:** register `studio-acceptance-417-20261018`, owner `claude:studio-acceptance-417 (1e70822d)`,
  branch `test/studio-acceptance-417-20261018` in `../river-oaks-studio-acceptance-417-20261018`, from
  `origin/main` `dd9b61ee17e3e385dd6ea318e0becc3f01c5b49c` (#490).
- **Codex refresh candidate:** `codex:root-studio-acceptance-417-refresh-20261015` measured
  `a797d6b4` plus a five-file uncommitted diff in `../river-oaks-studio-acceptance-refresh` and went
  idle on 2026-10-16 05:41Z with its lease expired. On 2026-10-18 Val chose to take #417 over on a
  fresh branch. That worktree, its appendix to this ledger and its untracked
  `data/reports/studio-417-*.json` receipts are preserved as history; nothing was committed from it.
- **Val, 2026-10-17** (recorded on #417):
  - **Budget:** p95 frame time under 16.7 ms on the review profile (M3 Max, Chromium with ANGLE
    Metal on the real GPU, 1440 × 1000 at DPR 1, vsync off), desktop only. Phones, other GPUs and
    software rendering are not covered. The report's draw-call, triangle and texture ceilings stay
    provisional.
  - **Arrow keys:** keep turning in walk mode, as in the office walk.
  - **Packaged builds:** out of scope; development Electron covers #417. Packaged installs stay
    with the desktop release track (#369–#373).

### Review profile and what Studio actually renders

Unchanged hardware from the 2026-10-15 profile: MacBook Pro Mac15,9, Apple M3 Max (40 GPU
cores, Metal 4), 48 GB, macOS 26.7.1 (25G241); Electron 44.7.0, Three.js 0.186.1, Node 24.18.1.
The Chromium build and ANGLE renderer string are recorded in each perf receipt.

Studio does not use the game's pipeline. `viewport.js` creates its own `WebGLRenderer`
(antialias, ACES tone mapping, PCF shadows from one 2048² directional light), one PMREM
`RoomEnvironment` reflection target per viewport, created on the first furnished space and
kept, and a single `requestAnimationFrame` loop. There are no quality tiers, composer passes
or media/audio. Replacing a scene disposes the old content group's geometries and materials
(`disposeStudioScene`). Shared photographic textures persist in `materials.js`. Route
assessment runs in a worker per job (`space-assessment-runner.js`), terminated on finish,
supersession or disposal, with a 10 s timeout. Media/audio counters are not applicable:
Studio owns none.

Resources the templates own, by traversal of `createSpaceScene(createSpace(id))` on this
source (main pass only; the renderer's calls and triangles also include the shadow pass):

| Template | Meshes | Triangles | Geometries | Geometry arrays | Materials | Photographic maps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Garden Office | 346 | 26,574 | 35 | 524,468 B | 27 | 0 |
| Courtyard House | 352 | 31,098 | 48 | 766,876 B | 27 | 6 |
| Atelier Boutique | 315 | 24,906 | 40 | 481,076 B | 26 | 3 |
| Corner Café | 403 | 35,490 | 43 | 538,244 B | 23 | 6 |

The shipped Garden Office requests no photographic texture at all. The six shared 1024² maps
(stone and paver colour/normal/ARM) arrive with the first House, Boutique or Café, or with an
edit to a limestone or terracotta floor.

Bounded persistent state, by owner:

- **Viewport (one per Studio page):** shadow map (2048² RGBA8 colour plus 2048² depth texture,
  about 32 MiB by format), PMREM target (768 × 1024 half-float RGBA, about 6 MiB), compiled
  programs (6 for the office, 8 with House).
- **`materials.js` (shared with the game):** at most one texture per material and channel,
  never disposed by design (six maps here, about 32 MiB as RGBA8 with mipmaps).
- **Document:** undo history capped at 80 entries (the 2026-10-15 70-cycle heap diagnosis).

### Finding: the delayed-photograph defect does not reproduce

The uncommitted refresh reported that a delayed limestone floor stayed at the neutral stand-in
after its requests finished, and added `loaded.needsUpdate = true` to `materials.js`. Its
evidence does not establish that:

- **Live counts.** Its `loaded` result stored the live request-count object, so "3 finished"
  was written when the report was serialised, not when the screenshot was taken.
- **Timing.** The 8 s route delay starts when the floor edit requests the textures, after the
  Office opens, but the capture was timed from the open. The same change added a five-second
  retry window, which would also explain its "after fix" pass.

Three.js r186 also says the change is unnecessary. `TextureLoader` sets `needsUpdate` before
calling `onLoad`. `dispose()` then removes the texture's renderer properties, so the next
`setTexture2D` sees no recorded version, creates a new GL texture and uploads the full image
(`forceUpload`). Studio materials use the shared textures directly; nothing clones them.

Measured on main `dd9b61ee` with the unmodified loader and the revised scenario below, which
copies request counts at each capture and waits for the requests to finish:

| Template | Surface | Normal | Missing | Loading | Loaded | Replaced | Requests settled |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Garden Office | limestone meeting floor (edited) | 186 | 200 | 200 | **186** | 186 | 8.5 s |
| Courtyard House | terracotta patio | 81 | 111 | 111 | **81** | 81 | 8.2 s |
| Atelier Boutique | limestone sales floor | 154 | 184 | 184 | **154** | 154 | 8.4 s |
| Corner Café | terracotta floor | 82 | 112 | 112 | **82** | 82 | 8.4 s |

Every delayed texture recovered exactly on the first capture after its requests settled. The
`materials.js` change is not carried; the refresh's manifest hash refresh falls away with it.

### Scenario and instrumentation changes (commit `b0e2d78a`)

- **`studio-pilot-assets.js`** keeps #478's per-template stations. Garden Office's case makes
  one valid edit (meeting-room floor to limestone, routes still passing) and looks down at it
  from inside the room. Request counts are copied at each capture. The loaded capture waits for
  the requests to finish, then allows five rendered seconds. Each template must read at least
  5 levels differently without its texture (so the check can fail). Missing and loading stay
  within 40 of normal (not black); loaded and replaced-then-reopened within 3. A replacement
  made while the textures are pending must keep its mode, item list, selection, status and
  geometry count once the late images arrive.
- **`studio-pilot-soak.js`** records, per sample, distinct scene materials and the viewport's
  render targets (both now in `data-render-stats`), material image requests, live
  route-assessment workers and pending timeouts. The worker and timeout counts come from a
  test-side init script that wraps `Worker` and `setTimeout`; no product code counts them.
- **`viewport.js`** adds `materials` (distinct materials in the current content) and
  `renderTargets` (shadow map and reflection target) to its once-a-second stats.
- **`studio-pilot-perf.mjs`** reads the GPU process's physical footprint with `footprint`
  at Studio ready, cold office open, the other template, warm office open and the end. On
  Apple silicon, Metal allocations land in that process as `IOAccelerator (graphics)`. A
  probe uploading eight 2048² RGBA8 textures (128 MiB) raised that category by 132 MiB.
  The totals include ANGLE/driver staging and the canvas buffers, so phases are compared, not
  read as per-resource VRAM.

**Teeth check (mutated loader, never committed).** `materials.js` was edited in the worktree,
the scenarios run, and the file restored byte-for-byte (`cmp` against HEAD).

| Mutation | New scenario | Main's scenario (±40) |
| --- | --- | --- |
| Photographs never upload | fails: House patio and Office floor "not a textured surface" (111/111, 200/200) | **passes** (every House reading 111) |
| Photographs arriving > 2 s after creation never replace the stand-in | fails: "loaded terracotta patio reads 111, normal 81: the texture did not recover"; Office 200 vs 186 | **passes** (normal 81, loaded 111, replaced 111) |

Main's check could not detect either failure, including the exact one the refresh suspected.

### Exact-revision results (`b0e2d78a`, app code = main `dd9b61ee` + the stats fields)

One batch through the browser lock, clean tree, load average 27–37 (other sessions' runs).
`RIVER_OAKS_GARDEN_CAPTURE_PREFIX=garden-office-417-b0e2d78a RIVER_OAKS_E2E_REPORT=studio-417-b0e2d78a-scenarios.json
pnpm run test:experience world-studio studio-pilot-journey studio-pilot-soak studio-pilot-assets studio-pilot-a11y
studio-office-stations studio-office-occupied studio-office-neutral`: **8/8 passed**, no page errors
(`data/reports/studio-417-b0e2d78a-scenarios.json`).

- **`world-studio`** (27.3 s): create, transform, undo, save, reopen, pick, export, import, walk,
  safe edits and repair.
- **`studio-pilot-journey`** (59.0 s), 14 checks: valid edit; blocked meeting-room route refused
  with a finding and the sofa unmoved; repair; undo and redo; save keeps the office assessment
  context; reload reopens and reassesses; the stale tab's save is refused and the other tab's
  kept; the saved layout passes; walked tour, returning to the arrival each time:

  | Target | Waypoints | Reached (E, N) | Back at | Seconds |
  | --- | ---: | --- | --- | ---: |
  | reception | 2 | 0, −4 | 0, −8.4 | 6.0 |
  | work area | 4 | −1.9, 1 | 0, −8.5 | 14.4 |
  | meeting room | 4 | 3, 1.1 | 0, −8.5 | 15.9 |
  | kitchenette | 2 | −1, 5 | 0, −8.5 | 19.4 |

  Then exit to the editor.
- **`studio-pilot-soak`** passed here too. The receipt of record is the `ae3173cb` run below,
  which adds GPU memory.
- **`studio-pilot-assets`** (office): normal 186, missing 200, loading 200, loaded 186, replaced
  186. House, Boutique and Café passed separately
  (`data/reports/studio-417-b0e2d78a-assets-{house,boutique,cafe}.json`) with the readings in
  the finding table above.
- **`studio-pilot-a11y`**, 19 checks:
  - **Layout:** 320 × 640 and 390 × 844 with no sideways scroll. Walk through, Undo, Redo, Save
    on device and Space templates are reachable at 24 px or more.
  - **Keyboard:** Enter selects a scene object; a typed East value commits without dragging; the
    undo shortcut restores it; → then W moves 1.0 m east and −0.1 m north (arrows turn); focus
    stays on the viewport after leaving walk mode, and returns to Space templates when the
    chooser closes.
  - **Reduced motion:** 0 running animations.

  These are emulated widths and DOM checks, not touch or screen-reader evidence.
- **Captures:** 33 shipped (11 stations × daylight/warm/evening), 33 with all nine chairs pulled
  back 0.4 m and deepened to 0.75 m, and 22 neutral diagnostic. The neutral run restored and
  hash-checked the original `viewport.js` response
  (`641afe766d30930195f8f5cc366330cdbdf4d88b4771618f3a8cda82a1321cc2`). PNGs are local in
  `output/playwright/garden-office-417-b0e2d78a-*`.

`node scripts/browser-lock.mjs … -- node desktop/studio-e2e.js`: **11/11** development Electron
checks (`.runtime/agent/studio-desktop.json`):
- native menu open;
- export through the native policy, JSON filter and region-v1;
- oversized JSON blocked;
- Keep editing / Discard;
- world round trip;
- save/reopen keeps the assessment sidecar;
- bare v1 export/import without a fabricated assessment;
- renderer isolation and external navigation blocked;
- cancelled close;
- crash recovery with the saved draft.

Loopback identity only: no packaged build, native dialog interaction or live auth.

### Soak of record (`ae3173cb`; `preview/src` identical to `b0e2d78a`)

`RIVER_OAKS_E2E_REPORT=studio-417-ae3173cb-soak.json pnpm run test:experience studio-pilot-soak`:
passed in 56.3 s, one warm-up plus ten cycles. Each cycle opens Garden Office, waits for its
routes, walks (W 1.5 s, turn, W 1 s), returns to the editor, then replaces it with Courtyard
House. Each sample follows a forced GC and a fresh render-stats frame
(`data/reports/studio-417-ae3173cb-soak.json`).

All ten post-warm-up samples are identical for every renderer and DOM count:

| Sample | Calls | Triangles | Geometries | Materials | Textures | Render targets | Programs | Listeners | DOM nodes | Canvases |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Office open, cycles 1–10 | 688 | 53,076 | 35 | 27 | 10 | 2 | 6 | 157 | 925 | 1 |
| After replacement, cycles 0–10 | 700 | 62,136 | 48 | 27 | 10 | 2 | 8 | 168 | 1,022 | 1 |

The warm-up's office sample had 4 textures and 917 nodes: the shared maps arrive with the first
House. Pending at every sample: 0 material requests (6 started and finished, all at the first
House), 0 live route-assessment workers (22 created over the run, one per open, all
terminated), 0 timeouts.

Values that vary, per cycle (MiB):

| Cycle | Office heap | Office GPU process | Office Metal | Replaced heap | Replaced GPU process | Replaced Metal |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 13.67 | 612.7 | 42.3 | 15.38 | 688.6 | 100.4 |
| 1 | 14.65 | 506.8 | 78.0 | 14.70 | 690.2 | 99.9 |
| 2 | 15.06 | 508.7 | 82.2 | 15.04 | 676.0 | 89.4 |
| 3 | 14.59 | 506.0 | 79.2 | 14.52 | 686.2 | 98.8 |
| 4 | 15.45 | 511.0 | 83.4 | 14.65 | 684.8 | 96.8 |
| 5 | 14.53 | 502.8 | 82.1 | 14.70 | 690.4 | 101.1 |
| 6 | 14.80 | 509.0 | 79.4 | 14.77 | 693.7 | 103.4 |
| 7 | 14.80 | 509.9 | 79.3 | 14.74 | 694.9 | 101.9 |
| 8 | 14.91 | 528.6 | 75.9 | 14.85 | 695.3 | 101.9 |
| 9 | 15.74 | 667.2 | 73.3 | 15.36 | 692.3 | 98.8 |
| 10 | 15.43 | 674.3 | 78.0 | 15.41 | 691.3 | 97.4 |

"Metal" is the GPU process's `IOAccelerator (graphics)` footprint: textures, buffers and render
targets on unified memory. It holds 73–83 MiB with the office open and 89–103 MiB with House,
with no trend. The whole GPU-process footprint stays at or below the House level (676–695 MiB);
at cycles 9–10 the office reading rose to that level rather than above it. That is non-Metal
memory in the GPU process (ANGLE and allocator pages kept after House is disposed), not scene
resources. JS heap moves 14.5–15.7 MiB without a trend over this window; the 70-cycle diagnosis
of 2026-10-15 bounds it by the 80-step undo history.

**Longer run.** `STUDIO_SOAK_CYCLES=30 RIVER_OAKS_E2E_REPORT=studio-417-ae3173cb-soak-30.json pnpm
run test:experience studio-pilot-soak`: passed in 159.1 s
(`data/reports/studio-417-ae3173cb-soak-30.json`).
- **Counts:** every count above is identical for all 30 post-warm-up cycles. The one exception
  is a single replaced sample with 992 DOM nodes instead of 1,022, a dip rather than growth.
  Pending loads, workers and timeouts are 0 throughout.
- **Memory, by ten-cycle window:**

  | Cycles | Metal, office | Metal, House | Highest GPU-process footprint | Heap, office |
  | --- | ---: | ---: | ---: | ---: |
  | 1–10 | 80.6 MiB | 99.2 MiB | 697.9 MiB | 14.9 MiB |
  | 11–20 | 82.8 MiB | 102.8 MiB | 696.9 MiB | 15.7 MiB |
  | 21–30 | 82.2 MiB | 101.8 MiB | 700.8 MiB | 15.8 MiB |

  Metal memory is flat. The heap's small rise is undo history filling (two snapshots per
  cycle toward the 80-step cap, as diagnosed on 2026-10-15). **Soak disposition:** no
  unexplained sustained growth; no fix needed.

### Performance and resident memory on the review GPU (`b0e2d78a`)

`STUDIO_PERF_OUT=.runtime/acceptance/b0e2d78a-perf node preview/e2e/studio-pilot-perf.mjs`
(copied to `data/reports/studio-417-b0e2d78a-perf.json`). Chromium 156.0.8078.4, `ANGLE (Apple,
ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)`, 1440 × 1000 at DPR 1, vsync and the
frame-rate limit off; one-minute load 26.9 → 24.8. No page errors. Three windows of 180 frames
per view:

| View | p50 / p95 / p99 ms | Window p50/p95 | Calls | Triangles |
| --- | --- | --- | ---: | ---: |
| Whole scene, overhead | 1.5 / 5.1 / 6.5 | 1.9/4.4, 1.5/5.1, 1.4/5.2 | 688 | 53,076 |
| CAM-01 entry | 1.5 / 3.8 / 5.3 | 1.6/3.8, 1.5/3.7, 1.5/4.3 | 550 | 40,164 |
| CAM-02 reception | 1.5 / 4.3 / 5.7 | 1.4/4.5, 1.5/4.1, 1.5/4.4 | 396 | 29,652 |
| CAM-03 work area | 1.5 / 4.1 / 5.8 | 1.5/4.5, 1.5/3.8, 1.4/3.9 | 418 | 31,716 |
| CAM-04 meeting room | 1.5 / 4.0 / 6.1 | 1.6/3.9, 1.5/4.0, 1.5/4.0 | 407 | 29,896 |
| CAM-05 kitchenette | 1.5 / 4.6 / 6.3 | 1.5/4.3, 1.4/4.9, 1.6/4.2 | 416 | 31,164 |
| CAM-06 exit | 1.5 / 4.2 / 6.2 | 1.4/4.2, 1.7/4.7, 1.5/4.2 | 362 | 27,268 |

Calls and triangles include the shadow pass. Every view's p95 is under a third of Val's
16.7 ms budget for this profile. Studio swaps whole content groups rather than adding a room to
a running world, so the game-style "incremental room" cost doesn't apply. Whole-scene and
station times are the measure.

Loading: cold Studio ready 336 ms; cold Garden Office open 687 ms, routes passed 884 ms; warm
open 282 / 370 ms. Transfer at ready 55 requests, 8,622,357 bytes; after the office 78 requests,
8,630,740 bytes (15,418,541 decoded). These are dev-server bytes (unbundled, uncompressed), not
production transfer and not GPU memory.

GPU process memory at each phase (MiB):

| Phase | Footprint | Metal (IOAccelerator) | Other graphics | Textures | Geometries |
| --- | ---: | ---: | ---: | ---: | ---: |
| Studio ready (default region) | 399.6 | 25.8 | 291.1 | — | — |
| Garden Office, cold | 447.3 | 32.8 | 310.3 | 4 | 35 |
| Courtyard House | 509.3 | 70.5 | 314.5 | 10 | 48 |
| Garden Office, warm | 509.1 | 73.2 | 314.5 | 10 | 35 |
| After the six stations | 522.1 | 83.1 | 316.2 | 10 | 44 |

Against format estimates:
- **Opening the office:** adds 7.0 MiB of Metal memory, against the PMREM reflection target
  (≈6 MiB) plus 0.5 MiB of geometry.
- **The first House:** adds 37.7 MiB for the six shared 1024² maps (≈32 MiB as RGBA8 with
  mipmaps) plus House's own geometry.
- **The 2048² shadow map:** about 32 MiB, already resident at Studio ready.
- **The stations:** placing the arrival brings up the transform gizmo (+9 geometries, +2
  programs, then constant at every station).

The soak above holds Metal memory flat across ten cycles. So the realistic resident set with the
office open is about 80 MiB of Metal allocations in a 500–690 MiB GPU process, on this machine.
That's a measurement on unified memory, not a per-resource VRAM breakdown; other GPUs, drivers
and phones are unmeasured.

### Accessibility and human review

The automated checks above cover keyboard-only edit/undo/walk/turn, focus recovery after walk
mode and the chooser, reduced motion, and 320/390 px emulated layouts. They are not the review
#417 requires. That review belongs to Val (recorded on #417 2026-10-16 and 2026-10-17) and is
posted on #417 as a checklist:
- VoiceOver announcements for controls, selection, the blocked-route finding, save/reopen/stale
  messages and walk mode;
- keyboard-only use with visible focus;
- physical touch;
- uncoached edit/refusal/repair/save/reopen/walk/exit, including exit wayfinding.

No result is inferred here.

One fact for the touch review, from the source rather than a device: walk mode moves only from
the keyboard (W/A/S/D and the arrows) and turns by pointer drag. There are no on-screen
movement controls (`viewport.js` keydown; nothing in `main.js` or `studio.css`). On a
touch-only device a visitor can turn but not walk. Val decides whether that is an accepted
limit of the desktop-only profile or a follow-up; this patch doesn't add touch controls.
Physical iOS stays with #289.

### Paired player-height captures and visual disposition

All captures use the fixed `studio-office-stations` cameras (eye 1.68 m, 1440 × 1000, ANGLE
Metal on the M3 Max) under the daylight, warm and evening presets. Real materials throughout;
the neutral set is the response-only diagnostic.

| Pair | Baseline | Candidate | Mean pixel difference |
| --- | --- | --- | --- |
| Pre-pilot → current | `326506f7` recaptured now from a `git archive` with the current station script (33 views; neutral not possible: that viewport lacks the diagnostic's anchor) | `b0e2d78a` (33) | 7.6–37.3 by station and preset |
| #416 reviewed → current | `garden-office-c644-review2-*`, #471's final set (33 + 33 occupied + 22 neutral) | `b0e2d78a` (33 + 33 + 22) | 0.0–0.6 at CAM-01/02/04/05/06/10/11; 1.3–5.3 at the workstation views CAM-03/07/08/09 |

The `c644-final` shipped-preset CAM-07–10 frames predate their merged camera definitions
(captured 20:48 CDT; `d0064437` landed 20:58), so they aren't comparable; `review2` is. PNGs and
contact sheets are local only.

Engineering inspection (not an independent design review):

- **Pre-pilot → current.** The #416 defects stay fixed on the same physical plan:
  - D1: no floating desk lamps;
  - D2/D3: true-size desks on charcoal legs and true-size chairs, not stretched boxes;
  - D4: a linear pendant instead of a flattened disc;
  - D5: polished concrete instead of the outdoor paver;
  - D6: charcoal glazing frames;
  - D8: evening visibly warmer and darker;
  - and the restrained `#F486A1` art accent.

  Every station shows the same positions and room plan.
- **#416 reviewed → current.** Two pieces changed, both from shared furniture families:
  - **Shelving (#474):** from a deep single-bay case with thick boards to the two-bay shelving
    with thin boards at a real shelf pitch, with books. Seen at CAM-03/07/08/09, and at the
    frame edge in CAM-05/10.
  - **Meeting table (#476, `4b529e5c`):** from a thick rounded slab on inset legs to a 30 mm
    square-cornered walnut top on corner legs with aprons. Same position and size; seen at
    CAM-04 and through the glass at CAM-01.

  My first inspection missed the table, whose mean difference is small (0.4–0.6); the
  independent review below caught it. Desks, chairs, lights, art, floor, glazing and the
  kitchenette (sink seated in its worktop, CAM-11) are unchanged. The reception counter is the
  plain slab since #466.
- **Scale and contact:** desks, chairs and shelving rest on the floor with contact shadows in
  every preset.
- **Glass:** the meeting-room partitions read as glass with charcoal mullions. Plants and
  chairs behind them draw correctly, with no sorting artefacts seen. The glass looks pale
  because the open roof and bare exterior (D7, D9) show through.
- **Occupied use:** with all nine chairs pulled back and deepened, every required route still
  passes and the views read the same.
- **Exit wayfinding:** CAM-06 still faces a blank wall. The walked journey proves the exit is
  reachable, not that a new visitor finds it.

**Independent agent design review (2026-10-18, revision `1221547e`): accept with notes.**
A separate agent with fresh, read-only context reviewed all 88 current captures against all 88
`review2` captures and the pre-pilot set, with its own pixel differences and close-ups. Its
report is local at `.runtime/acceptance/design-review-417-1221547e.md`. This is agent review,
not Val's approval or human/device acceptance.
- **Changes:** it found no design fix needed, the table change above (F1), and that the
  shelving and table improve on #416 (thin boards at real pitch, oak and charcoal matching the
  desk family, clean floor contact).
- **Unchanged, passes:** glazing, glass sorting, preset response, the pink accent only on the
  reception art, the sink fit and occupied-use readability.
- **Optional notes, no fix required:**
  - F4: the shelving's kick is only about 4.5 mm deep;
  - F5: the shelf contents come from the boutique fill, with no upright spines;
  - F6/F7: faint shadow speckle and a 1 px table-edge alias, visible only zoomed in;
  - F8: the four meeting chairs sit off the table ends on its long-edge lines (north 2.0/3.2,
    `space-templates.js:79-80`), about 8 cm from the new corner legs, which no capture shows as
    a clash.

  F8 is a question about the approved plan, not a measured defect, so it isn't changed here.
  D7/D9 remain known limits from #416.

### Decision

**Engineering: continue with Garden Office as the local-template baseline, on the scoped
desktop profile, at the final revision `1221547e` (below).**
- The edit/refusal/repair/undo/save/reopen/stale-tab/walk/exit journey passes on the real GPU,
  as does development Electron.
- Ten post-warm-up cycles hold every renderer, DOM, listener, worker, timer and pending-load
  count constant, and GPU Metal memory flat.
- Late, missing and replaced-while-loading textures recover exactly, and the check can now fail.
- Frame times are far inside Val's 16.7 ms p95 budget.
- No product defect was found that needed a fix; the only source change is two fields in the
  existing render stats.

Still open, by owner:

- **Val (human review):** VoiceOver, keyboard-only, physical touch and uncoached use, including
  exit wayfinding and the touch-walk limit above. #417 stays open until these are recorded.
- **Design:** the independent agent review accepted the office's shelving (#474) and meeting
  table (#476) changes with notes. **Val, 2026-10-18:** keep the meeting chairs as they are
  (F8), and accept the shelving's 4.5 mm base recess (F4) and boutique-style fill (F5) as is.
  D7 (open roof) and D9 (bare exterior) remain known limits from #416.
- **Not run, not claimed:** physical devices (#289), packaged Electron (out of scope per Val),
  other GPUs, software rendering, isolated Redis/full (no server or shared code changed),
  production.

### Gates

- **Focused:** `node --test preview/tests/studio-*.test.js server/tests/studio-assets.test.js`
  132 / 0 / 0 (on `dd9b61ee` plus the scenario edits; no test or `preview/src` file changed
  after).
- **Core:** `pnpm run verify` at `ae3173cb`, twice. Both times agent 116/116 passed, then
  preview-tests stopped the gate at 3,410 passed / 1 failed / 1 skipped. The failure both times
  was `office-penthouse-furnishings.test.js` "surfaces are drawn in short idle slices…", a
  wall-clock < 40 ms assertion (48.3 ms, then 1.8 s total), at load averages of about 35 and
  42. This branch doesn't touch that test or the office sources. Alone it passes 15/15. The
  remaining core tasks were run one profile at a time:
  - `verify server`: 593 passed, 154 Redis skips, 6 failed. All six were real-transport
    timeouts ("timed out", "Office command timed out", `request_timeout`) at load averages
    70–95. Their five files rerun alone: 13 passed, 0 failed, 5 Redis skips.
  - `verify desktop`: 76/76.
  - `verify build`: passed.
  - `verify python`: passed (lint, format, tests, demo, demo-verify).
  - `check_secrets.py --all`: no leaks.

  Logs are in `.runtime/acceptance/verify*-ae3173cb.log` and `verify-{server,desktop,build,python}.log`.
- **Third attempt** at `1221547e`, under the browser lock (which holds back other sessions'
  browser runs, but not their Rust builds or servers): the same single failure at load 41–102.
  That test can't pass in the full parallel suite while this machine is that loaded. Its
  threshold is not this task's to change, so it is reported, not edited.
- **Not run:** isolated Redis/full (no server, shared-state or game code changed), physical
  devices, packaged Electron. Hosted CI runs the core gate on the PR head.

### Final revision: everything at `1221547e`

The receipts above span `b0e2d78a` (scenarios), `ae3173cb` (soak with GPU memory) and their app
code `dd9b61ee`. To put every check on one revision, origin/main (#492, an office journey script
only) was merged with a signed merge as `1221547e`, and everything was rerun there on a clean
tree. Machine conditions were poor: load averages of 75–237 from other sessions' Rust builds and
Next.js servers, and the disk filled once at 10:46Z. The perf and Electron runs that hit ENOSPC
were rerun once space returned (16–20 GB), and their failed starts are environment failures, not
findings.

| Check | Result at `1221547e` | Receipt |
| --- | --- | --- |
| 8 browser scenarios (journey 14 checks, soak 1 + 10, office assets, a11y 19 checks, 88 captures) | all passed | `data/reports/studio-417-1221547e-scenarios.json` |
| `studio-pilot-assets` House / Boutique / Café | passed: 81/111/111/81/81, 154/184/184/154/154, 82/112/112/82/82 | `studio-417-1221547e-assets-*.json` |
| Office assets (normal/missing/loading/loaded/replaced) | 186/200/200/186/186 | scenarios receipt |
| Metal profile | whole scene p50/p95/p99 2.4/8.6/9.6 ms at load 123–176; stations p95 2.7–5.7 ms; 688 calls, 53,076 triangles; cold ready 974 ms, cold open/routes 658/761 ms, warm 307/389 ms | `studio-417-1221547e-perf.json` |
| Development Electron | 11/11 | `studio-417-1221547e-desktop.json` |
| Focused Studio/asset tests | 132/132 | `.runtime/acceptance/focused-1221547e.log` |
| Core `pnpm run verify` (under the browser lock) | agent 116/116, then preview-tests stopped the gate at 3,410 passed / 1 failed / 1 skipped: the same penthouse idle-slice wall-clock test, at load 41–102. A third local attempt; see Gates. The single-run gate on a clean machine is hosted CI's `verify` jobs on the PR head. | `.runtime/acceptance/core-1221547e.log` |

The soak at `1221547e` repeats the counts of record:
- **Constant:** office 688 / 53,076 / 35 / 27 / 10 / 2 / 6 / 157 / 925 / 1, and pending 0/0/0,
  in every post-warm-up cycle.
- **After replacement:** listeners and DOM nodes dip in some samples (168 → 164; 1,022 → 992 or
  990) and never grow.
- **Metal memory:** read 82–129 MiB with the office open and 74–114 MiB after replacement, with
  no trend. This run had swap nearly full, so the reading included compressed and swapped pages.
  The calm-machine run at `ae3173cb` (same app code) read 73–83 MiB.

The p95 under that load is still about half of Val's 16.7 ms budget.

### Core gate: hosted single run, and the local idle-slice flake

**Hosted, at PR head `959df11b`:** all 17 checks passed, including aggregate `preview`. Together
the jobs run every core task in one run each on a clean runner:
- `preview checks`: agent tooling, `pnpm test`, `test:server` with Redis installed,
  `test:desktop` and the build, plus the security, reflections and screening browser runs;
- `verify (3.11)` and `verify (3.13)`: secrets, ruff check and format, pytest, demo and
  demo-verify.

`959df11b` differs from the tested code revision `1221547e` only in this ledger and six receipt
files.

**Locally, the penthouse idle-slice test is a coin flip on this machine.** An interleaved A/B of
the full preview suite (`pnpm test`, under the browser lock) compared an untouched archive of
main `a308a95d` with this branch's worktree at `959df11b`:

| Round | main `a308a95d` | branch `959df11b` | Load (1 min) |
| --- | --- | --- | --- |
| 1 | pass (3,411 / 0) | fail, longest slice 53.3 ms (3,410 / 1) | 28 → 31 |
| 2 | fail, longest slice 115.4 ms (3,410 / 1) | **pass (3,411 / 0)** | 31 → 30 (80 at end) |

Main fails the same way at the same load, and the branch passes the whole preview suite in round
2. The test asserts each `setTimeout` slice runs in under 40 ms of wall-clock time, while the
suite runs about 15 test processes at once on a machine other sessions already load to 30–200.
It is not a regression from this branch, and its threshold belongs to the penthouse lane
(#362/#473), so it is reported, not changed.

A fifth local attempt, at `959df11b`, waited for the one-minute load to fall below 30 and
started at 26. Other sessions pushed it to 62 during the run, and the gate stopped at the same
single test (agent 116/116, preview 3,410 passed / 1 failed / 1 skipped). That makes five local
core attempts today, each stopped only by this test.

**Disposition (accepted by Val, 2026-10-18: hosted CI is the gate for this PR):** the core gate
passed as one run of each hosted job at the PR head. Every local
core task other than this test passed: agent and preview in each attempt, the rest one profile
at a time, and the branch's full preview suite in A/B round 2. Re-running the whole local gate
until the coin lands is not evidence of anything, so it stops here.

### Handoff to local rollout

The accepted engineering profile is the one above, at `1221547e`: MacBook Pro M3 Max, Chromium 156 with ANGLE
Metal on the real GPU, 1440 × 1000 at DPR 1, vsync off for timing; development Electron 44.7.0.
Val's budget (p95 < 16.7 ms) applies there only. The reusable acceptance check, per template:

```sh
STUDIO_TEMPLATE=<office|house|boutique|cafe> pnpm run test:experience studio-pilot-assets   # texture missing/late/replaced; fails if a texture never shows or never recovers
STUDIO_TEMPLATE=<id> pnpm run test:experience studio-pilot-soak                             # 1 + 10 cycles; STUDIO_SOAK_CYCLES=N for longer
STUDIO_TEMPLATE=<id> node preview/e2e/studio-pilot-perf.mjs                                 # frame times, load, GPU-process memory
pnpm run test:experience studio-pilot-journey studio-pilot-a11y                             # Garden Office; studio-template-journey for the others
node desktop/studio-e2e.js
```

House, Boutique and Café already pass the stricter texture check on this revision. Receipts of
record, in `data/reports/`:
- `studio-417-1221547e-{scenarios,assets-house,assets-boutique,assets-cafe,perf,desktop}.json`,
  at the final revision;
- `studio-417-ae3173cb-soak.json` and `-soak-30.json`, the calm-machine soaks with GPU memory
  (same app code).

The `b0e2d78a` receipts are the first exact-revision run, kept for comparison.

Pre-commit runs, mutated-loader runs and captures stay local under `.runtime/acceptance/` and
`output/playwright/`.

### Next

| Item | Owner | Next action |
| --- | --- | --- |
| VoiceOver, keyboard-only, physical touch, uncoached use and exit wayfinding | Val | Work through the #417 checklist and record pass/fail with device details; decide on touch walking |
| Design notes F4/F5/F8 | — | Val accepted all three as is on 2026-10-18; nothing to do |
| PR #493 | this task | Val authorized landing on 2026-10-18; land with `pnpm run land 493` and record the merge |
| Codex's refresh worktree `river-oaks-studio-acceptance-refresh` | Val / register | Keep as history until this PR lands; its receipts are superseded, not deleted |
| Physical iOS | #289 | Not started here |

#417 stays open until Val's review is recorded.

## Review readiness (2026-10-22)

Task `studio-review-417-20261022`, branch `test/studio-review-417-20261022`, from origin/main
`f850abfa`. `git log 153471bc..origin/main -- preview/src/studio preview/src/materials.js` is
empty, so main's Studio still equals the #493 candidate and the pilot journeys did not need a re-run.

### What the checklist exposed (probe on unmodified main)

A temporary probe (not committed) recorded focus, live-region text and focus rings for each
checklist flow in a detached checkout of `f850abfa`:

| Flow | Unmodified main |
| --- | --- |
| Enter on a scene object | focus fell to `body`: every render replaced the list's buttons |
| Commit a field (Enter or Tab) | focus fell to `body`: the form was rebuilt and its fields disabled during the check |
| Refused edit | footer said only "Clear the route to meeting room at 3, 1 m; move or resize the obstructing furnishing."; "Edit rejected." and the Select buttons sit in a panel that isn't announced |
| Save, stale-tab notice, stale-save refusal, reopen | announced in the footer status region |
| Walk enter and Escape | announced; focus on the 3D viewport throughout |
| Focus rings | all 43 Tab stops show one |

### Fix (`preview/src/studio/main.js`)

- The scene list and inspector form are rebuilt only when their shape changes (objects, or the
  selected object's fields); otherwise they update in place.
- While an edit is checked, text and number fields are read-only instead of disabled, so Tab can
  still reach them. Selects stay disabled.
- A control that is disabled or rebuilt while focused gets focus back after the event; Undo and Redo
  hand focus to each other when history runs out. A deliberate move elsewhere is not overridden.
- A refused edit announces "Edit not applied; your draft is unchanged.", then the finding, then
  "Nearby:" and the furnishings' names.

### Regressions

- `studio-pilot-a11y.js`: focus stays on the selected scene object; Tab after an edit reaches the
  next field; Enter keeps focus in the field; Undo/Redo hand focus across; every Tab stop shows focus.
  On unmodified main it fails at the first: "focus stays on the selected scene object (BODY)".
- `studio-pilot-journey.js`: the status region announces the refusal and names Waiting Sofa. On
  unmodified main it fails with the old message verbatim.

### Not automatable (left for Val's review)

- Saving twice writes identical text; whether VoiceOver repeats it needs a human.
- Whether the announcements read well in VoiceOver at all; automated checks read the DOM only.
- Touch, uncoached use and exit wayfinding.

### Results on this branch (app code = main `f850abfa` + this `main.js` change)

- `pnpm run test:experience studio-pilot-a11y studio-pilot-journey`: 25 and 15 checks, both passed
  (receipt `data/reports/studio-review-417-a11y.json`, ANGLE Metal, 1440 × 1000).
- `world-studio` and `studio-pilot-soak` (1 + 10 cycles) passed on the same app code.
- `node desktop/studio-e2e.js`: development Electron 11/11.
- `node --test preview/tests/studio-*.test.js`: 131/131.
- `pnpm run verify` (core): agent 173, preview 3,699 (1 skipped), server 732 (212 Redis skips),
  desktop 115 (3 skipped), build, Python, secrets. This shell's `python3` is macOS 3.9, so the run
  put the locked `.venv/bin` first on PATH; #576 makes the runner do that itself.
- Not run: isolated Redis/full, physical devices, VoiceOver. None of these results is human review.

## Closeout run on main `1cb79549` (2026-10-23)

Task `studio-417-closeout-20261023`, branch `test/studio-417-closeout-20261023`, from origin/main
`1cb79549`. Goal: re-run #417's scenarios and #359's office journeys on one main, refresh Val's review
packet, and propose a register reconciliation. No app code changes.

### Does the checklist's candidate still equal main?

No. The checklist (issuecomment-6248646285) names `0d1e69a2`, app code = main `dd9b61ee`. Since #493
(`153471bc`), main changed three files Studio loads:

| File | Change | Effect on Studio |
| --- | --- | --- |
| `preview/src/studio/main.js` | #579 (`52379be6`): focus kept on the control in use; refusals announced with nearby furnishings | Intended; the review should exercise it |
| `preview/src/walking.js` | East Garden Commons bounds (#580/#581), campus flight volumes, Jevica's fast-walk speed | None by source: `commonsAllows` is true without a commons layout, flight is unused in Studio, normal/fast speeds unchanged (1.65/3.2 m/s) |
| `desktop/main.js` | Windows Squirrel install events (#372) | None on macOS dev Electron; exits only for a Squirrel argument |

So the review candidate is now main `1cb79549`. The runs below are on it.

### Results (`1cb79549`, clean app code; MacBook Pro M3 Max, Chromium ANGLE Metal, 1440 × 1000)

Run under one browser-lock hold, 08:36–08:46Z, load 8–14.

| Scenario | Result | Receipt (`data/reports/`) |
| --- | --- | --- |
| `studio-pilot-journey` | passed, 15 checks: refusal announced with "Nearby: Waiting Sofa, …", repair, undo/redo, save/reload, stale tab, four destinations and back, exit | `studio-417-1cb79549-pilot.json` |
| `studio-pilot-assets` (office) | passed: limestone meeting floor 186 normal → 200 missing/loading → 186 loaded (8.3 s) and replaced; 3/3 and 6/6 requests, none pending | same |
| `studio-pilot-soak` (1 + 10) | passed: every post-warm-up office cycle 688 calls, 53,076 triangles, 35 geometries, 27 materials, 159 listeners, 0 live workers, 0 pending timeouts/loads; heap 15.4–16.0 MiB; Metal 70–83 MiB | same |
| `studio-pilot-a11y` | passed, 25 checks, including #579's focus checks; 33 Tab stops show focus; 320/390 px no overflow | same |
| `studio-template-journey` office / house / boutique / café | passed, 13 checks each | `studio-417-1cb79549-template-{office,house,boutique,cafe}.json` |
| `node desktop/studio-e2e.js` (development Electron, after the #372 `desktop/main.js` change) | passed, 11/11, 12:40Z, same app code | `studio-417-1cb79549-desktop.json` |

### #359 non-regression (same main)

| Scenario | Result | Receipt |
| --- | --- | --- |
| `office-visit` | passed, 12 checks | `studio-417-1cb79549-office359.json` |
| `office-desk` | passed, 18 checks | same |
| `office-computer-embed` | passed, 61 checks | same |
| `office-ipic-journey-runner.mjs` | passed, 30 checks, 109 s (ported harness, below): refusal, invitation, arrival, private My tasks, one chair for two clients, floors/library/terrace, late IPIC join within 500 ms, both back in town | `studio-417-1cb79549-ipic.json` |

The first IPIC run failed at its first step: it waits for "Request a visit"
(`#office-request-send`). On 2026-10-18, `2b5062b6` ("restrict offices to Jevica") replaced visit requests with
Jevica's invitation and updated `office-visit.js`, but not this journey. The journey has been stale since then;
the product behaved as designed (the resident's dialog says "An invitation from Jevica is required to enter."). This
branch ports the journey the same way `office-visit.js` was ported: A picks bob in the Offices panel's guest list
and clicks Invite resident. A second run failed because that control sits in the play dock's Office pane, which
was not selected (the same tab change `ec9f99ac` handled in the other office journeys); the journey now selects
`#play-tab-office` first. The third run passed. The IPIC journey runs only locally (it is not in CI), which is why
the drift went unnoticed: `2026-10-18-play-rail-menu.md` already recorded it failing on `153471bc`. No app code
changes.

### Gates

- `pnpm run verify` (core), revision `1cb79549`, 08:48–08:51Z: passed. Agent 201/201; preview 3,827 passed,
  1 skipped, including the penthouse idle-slice test; server 757 passed, 215 skipped (Redis and other env-gated
  tests); desktop 115, 3 skipped; build, Python (149) and secrets. The tree was dirty only with this branch's
  e2e harness, ledger and receipts. An earlier run at 08:37Z, load ~26, stopped on that idle-slice wall-clock test
  (longest slice 67.8 ms); it passed alone right after, and the clean rerun above is the gate of record.
- Not run: isolated Redis/full, physical devices, VoiceOver, packaged Electron. None of this is human review.

### Decisions for Val

1. **Refresh-task record**: authorize, or decline, the record-only change below.
2. **Café phone and other-GPU review** (added from #420): run it, or record it as outside the desktop-only
   profile accepted on 2026-10-17, as was done for packaged builds.
3. **Café placed in a creator region**: it exists only on draft #489 (conflicting with main). Review it from that
   branch, defer it until #489 lands, or drop it from #417.
4. **Touch walking**: an accepted limit or a follow-up (unchanged).

#### Register: `studio-acceptance-417-refresh-20261015` (proposal for Val)

Facts checked on 2026-10-23 from the primary checkout:
- Status `blocked`, owner `codex:root-studio-acceptance-417-refresh-20261015`, lease expired 2026-10-16T07:40Z.
- Its worktree `river-oaks-studio-acceptance-refresh` is not on disk. Branch `test/studio-acceptance-417-refresh-20261015`
  exists neither locally nor on `origin`, there are no archive tags for it, and no `manifest.json` under
  `~/worktree-backups/river-oaks/` names it. Its uncommitted diff and untracked receipts are gone from this machine.
- Its content is superseded: #493 (`153471bc`) delivered the revised scenario/viewport changes, and its
  `materials.js` change was disproved on unmodified main (ledger, "Finding: the delayed-photograph defect does not reproduce").

`project:cancel` can't act on it: it archives and removes an existing branch or detached checkout, and
there is neither. What remains is a record-only change, which discards the record of unfinished work and so
needs your authorization. Proposed patch (not applied):

```sh
pnpm run register patch studio-acceptance-417-refresh-20261015 --unset leaseUntil --json '{
  "owner": null,
  "branches": [],
  "cancelledBranches": ["test/studio-acceptance-417-refresh-20261015"],
  "nextAction": "Cancelled by Val <date>: worktree, branch and receipts were already absent from disk (no archive); content superseded by #493 (153471bc); materials.js change disproved. Nothing to restore."
}'
```

It stays `blocked` (the register has no `cancelled` status, and `retired` needs delivery evidence and an
archive this work never had), matching other cancelled records such as `cartier-pilot`. The alternative is to
leave the record as it is; `project:check` will keep reporting it as an orphan.
