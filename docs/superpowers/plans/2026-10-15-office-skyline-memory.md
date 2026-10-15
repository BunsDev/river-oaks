# Penthouse skyline: resident memory for phones (#363)

- **Task:** `office-skyline-memory` (live register), owner `claude:river-oaks-penthouse (7a57e655)`.
- **Branch / worktree:** `perf/office-skyline-memory-20261015` in `../river-oaks-office-skyline-memory`, from `origin/main` `f72a173e`.
- **Follows:** `2026-10-15-office-skyline-prototype.md` (#408), whose Limits named 72 MiB at 1024 as a lot for phones.

## Objective

Cut the GPU memory the penthouse skyline holds for a whole visit, most of all on phones, without changing what the
backdrop shows or its lifecycle: one capture per visit, restored on every exit path, late captures fenced, the host tower
hidden only during the capture, no capture in software rendering.

## Approach

1. **No depth buffer that outlives the capture.** `WebGLCubeRenderTarget` gives each of its six faces its own depth
   renderbuffer, and `CubeCamera` drew into them, so the visit held 24 MiB of depth at 1024 that nothing reads after the
   capture. Now each face is drawn, with depth, into **one** temporary 2D `WebGLRenderTarget(size, size, HalfFloat)`, then
   copied texel for texel (`texelFetch`, no filtering or conversion) by a full-screen quad into that face of a cube target
   created with `depthBuffer: false`. The temporary is disposed in the capture's `finally`, failure included.
2. **Same faces as before.** The six cameras are CubeCamera's own for WebGL (`node_modules/three/src/cameras/CubeCamera.js`,
   r186): fov −90 (CubeCamera's deliberate mirror), aspect 1, the same look directions and up vectors, face order +x, −x,
   +y, −y, +z, −z. Each camera is turned at the origin, as CubeCamera turns its children, then placed at the eye, so the
   matrices match CubeCamera's exactly. The cube texture is still a `WebGLCubeRenderTarget` texture
   (`isRenderTargetTexture`), so `scene.background` reads it exactly as before. The capture also restores the previous
   render target, face and mip level and the XR flag itself, which CubeCamera did only when no draw threw.
3. **Smaller faces where memory is short.** `officeSkylineSize({ scale, coarsePointer, maxCubemapSize, maxTextureSize })`:
   512 on a phone or tablet, or when the render scale is below 0.75; 1024 otherwise; never above the device's cube or 2D
   texture limit. "Phone or tablet" is `matchMedia('(pointer: coarse)')`, the query `walking-ui.js` already uses to show the
   movement pad. `render-quality.js` has no device detection to reuse. `main.js` passes the renderer's `maxTextureSize` too,
   because the faces are now drawn into a 2D target first.
4. **Honest stats.** `stats.bytes` is what stays for the visit, colour only (6 × size² × 8). The new `stats.peakBytes` adds
   the temporary face and its depth (size² × 12) held during the capture.
5. **One copy pass per page.** The first build disposed the copy material after each capture. Run 1 below showed every
   later visit then compiled its program again (`newPrograms` 1 on every visit), and warm captures took 55–70 ms against
   main's 28–38 ms. The copy material, its quad and scene are now created once per page, as three.js keeps its own
   background meshes. Between captures it holds no texture (`uniforms.face` is null). The program is a few kilobytes.
6. **A failed capture** releases the cube at once, since nothing is shown, instead of at the end of the visit.

## Files

`preview/src/office-skyline.js`, `preview/tests/office-skyline.test.js`, `preview/src/main.js` (the skyline size line
only), `docs/offices.md` (the skyline paragraph), this ledger, and the register entry.

## Memory

From the allocations (RGBA half float = 8 bytes per texel; depth renderbuffer = 4 bytes per texel):

| Face size | Before: held for the visit | After: held for the visit | After: peak during the capture |
| --- | --- | --- | --- |
| 1024 | 72 MiB (48 colour + 24 depth) | **48 MiB** | 60 MiB (48 + 12 temporary) |
| 512 | 18 MiB (12 + 6) | **12 MiB** | 15 MiB (12 + 3) |

So a phone or tablet at full render scale held 72 MiB before (it got 1024 faces) and now holds 12 MiB (peak 15).

**Measured** GPU-process footprint (`footprint -p <GPU pid>`). Each reading is a fresh Chromium with Metal ANGLE on a
minimal page, after both paths were warmed at 16 px. The table shows growth after one 1024 capture, before release
(run 2, alternating order):

| Path | Held after capture (MiB) |
| --- | --- |
| Before: CubeCamera into a cube target with depth | 53.8, 57.1, 57.1 |
| After: this branch | 35.5, 32.9, 32.9 |

The gap, 21–24 MiB, is the 24 MiB of depth buffers removed. The absolute growth is about 75% of the nominal 72 / 48 MiB
on both paths. That is the macOS accounting of GPU allocations, not a smaller allocation: three.js asks for exactly the
sizes above. At 512 the reading is inside the noise (+2.3 / −3.6 MiB). In the full district the GPU process swings
±100 MiB between identical visits (run 1), so the visit-level footprint cannot resolve these numbers.

## CPU cost (`inspect().skyline`)

Headless Chromium 156.0.8078.4, Metal ANGLE, 1440 × 900, on this Mac shared with other sessions; load average about 17.
Fixture servers: origin/main `f72a173e` (exported with `git archive`, no worktree) on :5195/:8795 and this branch on
:5194/:8794. Each private Vite dependency cache was set in a scratch wrapper config. Visits are interleaved, and each "cold"
capture comes from a fresh browser. "Warm" is a second visit in the same page. The 512 rows force both versions' size
rule to 512 the same way: the served module's `return Math.min(<rule> ? 512 : 1024, …)` becomes `Math.min(512, …)`. No
touch emulation is used for them.

Final code (runs 3 and 4), milliseconds for the whole `capture()`, median (range):

| Size | Version | Cold, first capture in a page | Warm, later visit | Longest frame on entry (cold) | `newPrograms` cold / warm |
| --- | --- | --- | --- | --- | --- |
| 1024 | before | 126.2 (77.9–294.7), n 8 | 21.6 (18.0–25.3) | 167 (117–333) | 0 / 0 |
| 1024 | after | 165.7 (80.1–215.6), n 8 | 22.7 (19.5–44.8) | 191.5 (100–267) | 1 / 0 |
| 512 | before | 163.0 (93.9–220.9), n 7 | 23.9 (19.2–25.4) | 200 (133–250) | 0 / 0 |
| 512 | after | 173.7 (100.5–195.5), n 4 | 24.0 (22.1–27.0) | 208.5 (133–233) | 1 / 0 |
| 512 | after, touch emulation (`pointer: coarse` true, real rule) | 150.6 (140.6–248.7), n 3 | 25.3 (20.0–26.5) | 183 (183–300) | 1 / 0 |

Run 1 (the first build, copy material disposed per visit), 1024: cold before 230.6 / 245.6 / 246.2, after 165.1 / 138.3 /
147.4. Warm before 27.9 / 28.9 / 28.4, after 70.7 / 70.4 / 61.1 (`newPrograms` 1 every visit), which led to approach item 5.

Reading:
- **Warm captures and frames inside the office are unchanged.** Warm 21.6 vs 22.7 ms at 1024 and 23.9 vs 24.0 ms at 512.
  The one 44.8 ms was a 23 ms host search, not the submission. Inside the office, median and p95 are 16.7 / 16.7–16.8 ms
  for every variant.
- **Cold first captures cannot be told apart at these sample sizes.** The same code ranged from 78 to 295 ms (before).
  Run 1 had the branch faster (median 147 vs 246 ms), runs 3 and 4 had it slower (166 vs 126 ms), and the ranges overlap
  almost entirely. The cost the branch adds by construction is one copy program, compiled once per page (`newPrograms` 1
  on the first visit only); see the copy probe below.
- **The copy program, measured alone.** A fresh browser per row, an empty scene (no scene programs to compile), three
  1024 captures each, 8 rows alternating. First capture: before 3.9–4.2 ms, after 9.0–11.8 ms. Later captures: 0.3–1.6 ms
  on both. So the copy pass adds about 5–8 ms once per page. In that probe the shader was already in the system's Metal
  cache. The very first branch capture on this machine (run 1's texel probe, 256) took 96.6 ms, against 6.2 ms for the
  same step in run 2. That suggests a cold first compile costs about 90 ms once per device and browser cache. This is
  inferred from two numbers, not profiled.
- These are CPU submission times on one shared Mac, not GPU time or phone evidence.

## Faces: orientation and handedness

**GPU texel probe** (runs 1 and 2, branch server, Metal ANGLE). A synthetic scene: a sphere whose vertex colours encode
direction, so any mirrored, rotated or swapped face changes texels. Per axis, an HDR (value 4.0) box sits partly in front
of a far box, so depth must work inside a face, plus a lit torus knot. Captured from one eye by three's `CubeCamera` into
a cube target with depth (before) and by `createOfficeSkyline` (after). All six faces were read back as half floats:

- **0 differing values on every face, at 256 and 1024** (262,144 and 4,194,304 values per face), and no unread values.
- To show the check discriminates: a horizontally mirrored face would have differed in 118,622–151,358 values at 256
  (47–58%), and a half-turned one in 171,994–196,078 (66–75%).
- HDR values reached 4.0 on both paths.
- Five views with either cube as `scene.background`, read back in 8 bits: 0 of 1,310,720 values differ.

**Penthouse views** (run 3, GPU, before and after, twice each). The visit is the same scripted journey on both servers
(views limited to what can be framed from the same eye):

- **Exact eyes,** placed by the server: the arrival point; the executive desk chair (sitting puts the eye at [−3, 6.55],
  seated height, yaw 0); both lift landings ([−12, 18] on each floor).
- **Headings** are whole drag pixels from a server-set yaw. The camera position and quaternion recorded at each shot are
  bit-identical between before and after, and between repeats, for all eight exact-eye views.
- **Views:** arrival toward the terrace, chair toward the terrace, chair front-west, chair front glass, chair east glass,
  mezzanine toward the front, lift landing toward the terrace, lift landing west. Two terrace views are walked, so their
  eye differs by 2–22 mm between runs and is left out of the table.

Fraction of pixels that differ at all, and the mean difference (0–255), exact-eye views at 1024:

| View | main vs main (control) | branch vs branch (control) | before vs after (a) | before vs after (b) |
| --- | --- | --- | --- | --- |
| arrival → terrace | 5.95% / 0.148 | 27.26% / 0.772 | 5.97% / 0.149 | 27.26% / 0.771 |
| chair → terrace | 2.80% / 0.069 | 2.73% / 0.067 | 2.79% / 0.069 | 2.79% / 0.068 |
| chair → front-west | 2.20% / 0.078 | 2.10% / 0.058 | 2.06% / 0.058 | 2.19% / 0.078 |
| chair → front glass | 4.40% / 0.101 | 4.31% / 0.081 | 4.23% / 0.078 | 4.40% / 0.102 |
| chair → east glass | 4.52% / 0.175 | 4.42% / 0.151 | 3.88% / 0.098 | 4.52% / 0.211 |
| mezzanine → front | 10.55% / 0.296 | 10.33% / 0.224 | 9.35% / 0.163 | 10.57% / 0.305 |
| lift → terrace | 4.86% / 0.137 | 4.75% / 0.132 | 4.83% / 0.134 | 4.84% / 0.135 |
| lift → west | 8.21% / 0.176 | 8.09% / 0.173 | 8.25% / 0.179 | 8.19% / 0.175 |

At 512: before vs after 2.04–9.27% / 0.060–0.178 over the same eight views.

- **Before and after match to within run-to-run variation.** The before/after difference is the same size as two runs of
  the same code, view by view. The differing pixels lie on office geometry edges and the floor-to-glass line, not in the
  sky or the district. Between runs the arrival animation, the district's moving people and cars, and screen-space effects
  differ. The one 27% outlier is the branch's second arrival shot, a sub-pixel shift of the office's own mullions and slab
  edges against every other run. The sky in that pair is unchanged. A single red pixel at the horizon in some shots is a
  district object caught at capture time; it appears on main too.
- **The comparison is sensitive.** 1024 against 512 differs in 15–28% of pixels (mean 0.28–1.06 over the exact eyes), and
  those numbers agree before and after to within 0.05 percentage points. So the branch's 512 picture is main's 512 picture.
  512 is visibly softer than 1024 on rooftops and clouds.
- After leaving, the street returns in every run, restored the same way on both. The 512 pair's street shots differ only
  because touch emulation shows the movement pad.

Screenshots (session scratchpad, not committed): `…/scratchpad/skyline-memory/run3/<variant>-<view>.png`, with diff
heatmaps `run3/diff-*.png` and the table `run3/diff.json`. Run 1's set is in `run1/`.

## Checks

| Check | Result |
| --- | --- |
| `node --test preview/tests/office-*.test.js` before any change | 99/99 |
| `office-skyline.test.js` with the new and updated tests, before the implementation | red: 10 of 13 failed (size rule missing; draws went straight into the cube) |
| same, after the implementation | 13/13 |
| Mutations, each restored after: +y face up flipped, positive fov, ±z faces swapped, depth kept on the cube, temporary not disposed, failed cube kept, every copy into face 0 | each caught (1–2 failures) |
| Copy reuse test (written first, red), then one copy pass per page | 1 failed, then 14/14 |
| `node --test preview/tests/office-*.test.js` | 102/102 |
| GPU texel probe, 256 and 1024 | 0 differing values on all 6 faces at both sizes (runs 1 and 2) |
| GPU memory probe, 1024 | before +53.8/57.1/57.1 MiB, after +35.5/32.9/32.9 MiB |
| GPU penthouse views, run 3 | before/after within the same-code control; see above |
| Copy program probe (empty scene, 8 fresh browsers) | first capture before 3.9–4.2 ms, after 9.0–11.8 ms; later ~1 ms on both |
| `pnpm run verify` (core, receipt `.runtime/agent/core.json`, status passed) | agent 111/111; preview 3208/3210 (1 skipped, 1 todo); server 580/729 (149 skipped: Redis cases without `REDIS_URL`); desktop 69/69; build; ruff lint and format; pytest 141 passed; demo; demo-verify (expected exit 2); secrets clean |

## Gaps

- No phone or tablet was measured. The 512 rule and its memory saving are by construction and on this Mac only. Touch
  emulation proves only that `pointer: coarse` reaches the rule.
- `pointer: coarse` is a proxy. A touch laptop whose primary pointer is fine keeps 1024. A tablet with a trackpad as its
  primary pointer may too.
- Cold first-capture times are too noisy here to say the branch is neither faster nor slower; only warm captures and
  inside frames are shown to be unchanged.
- The visit-level GPU footprint cannot resolve 24 MiB; the memory reading comes from a minimal page.
- The peak during the capture (60 MiB at 1024) is below the old resident 72 MiB but is still held for one frame.
- The copy program compiles in the capture frame on a page's first visit (about 5–8 ms here, likely about 90 ms the first
  time on a device). The doors are closed then. If a phone shows a hitch, a `RawShaderMaterial` copy (whose program key
  does not depend on the bound target) could be compiled with `compileAsync` during the approach.
- CPU software acceptance (hosted CI) still takes no capture, so CI does not exercise the GPU path; the unit tests and these
  local GPU runs do.

## Next

Independent review. Then measure on a real phone (memory and the first-capture frame) before the penthouse is activated
anywhere.
