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

## Next

Signed commit and draft PR; then the reviews listed under the decision. No merge.
