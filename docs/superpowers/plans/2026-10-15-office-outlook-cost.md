# Live office outlook cost (#449): first-entry compile and per-frame host uploads

- **Task:** `office-outlook-cost-20261015` (live register), owner `claude:penthouse-readiness (e5bbe058)`.
- **Branch / worktree:** `perf/office-outlook-cost-20261015` in `../river-oaks-outlook-cost`, from
  `origin/main` `be38c507`.
- **Source:** item 2 of the "River Oaks penthouse & waitlist handoff" (2026-10-15).

## Objective

Measure #449's live district view through the penthouse glass on a throttled laptop profile, with an
interleaved A/B against `origin/main` and vsync off. Fix the two review risks: precompile office
materials on entry so the first entry does not stall, and stop re-uploading masked host
`instanceMatrix` data every frame. Report frame time and draw calls before and after.

## Method

`preview/e2e/office-outlook-cost.mjs label=<checkout> ...` serves each arm from its own loopback
fixture (penthouse layout, hardware rendering). The arms are `git archive` copies in the session
scratchpad, each with its own `node_modules`, so no live worktree is served:

- `main`: `origin/main` `be38c507`.
- `fix`: this branch's `preview/src` over the same base.
- `lighting`: #473's lighting diff over the same base, to report its cost too.

Rounds take the arms in alternating order, and each round opens a fresh page (a fresh WebGL context and
shader cache): a first entry, 180 sampled frames from Roof gardens and from Overview, then a repeat entry.

Profile: 1440×900 at DPR 1, Smoothest graphics (three-quarter scale, no AO; still the live outlook), the
arrival played with motion, CPU throttled 4× through CDP after the district loads, and
`--disable-gpu-vsync --disable-frame-rate-limit`, so a frame interval is the frame's real cost. Metal
on this M3 Max. The GPU is not throttled: this is not device evidence.

Counters: program links (`linkProgram`) and buffer upload bytes (`bufferData`/`bufferSubData`) are
wrapped in the page; draws and triangles come from `renderer.info` (reset once per frame).

## Changes

1. **Host mask without uploads** (`office-skyline.js`). The live mask zeroed the host tower's
   instances before each draw and restored them after, so every host mesh's whole instance buffer was
   uploaded every frame. Each host mesh now gets a stand-in built once per visit with only its unmasked
   instances (same geometry and material, so the same programs). Draws swap the stand-ins in and back,
   including on exceptions. Other renders (the storefront reflection probe) and raycasts between draws
   still see the district unchanged, and a host mesh whose instances change gets a fresh stand-in.
2. **First-entry precompile** (`office-world-scene.js`, `render-pipeline.js`). The office's five lamps
   join the scene's lights when it first shows, which changes the program of every lit material in view.
   The visit queues what will be drawn (the visible district and the office, one object per material
   and kind) and compiles a batch each frame during the arrival, sized to a few milliseconds, against the
   pipeline's scene target with the office shown for each call. A skipped arrival holds on the street
   until the programs are ready, for at most three seconds.

The first version of change 2 called `compileAsync` once on the whole scene with no target bound. Round 0
showed it backfiring: 189 links instead of main's 64 and a 2.8 s frame, with 14 links still at the door.
`compile()` prepares hidden objects too, and without the scene target it builds tone-mapped screen
variants the pipeline never uses. Commit `b2289d67` replaced it.

## Results

### Final A/B: `main` against this branch's head

Medians of three interleaved rounds at `0c9b8fc4` (the code is `47b035c3`'s), against `main` `be38c507`.
The machine was busy (load 24 to 72 at the rounds), so steady frame times are noisier than the earlier run.

| Metric (4x CPU, vsync off) | main | fix |
| --- | --- | --- |
| First entry, longest frame | 927 ms | 398 ms |
| First entry, doors opening (3 frames) | 310 ms | 115 ms |
| Programs linked at the doors / in all | 18 / 64 | 0 / 125 |
| Precompile queue at the office | none | 503 queued, 0 remaining |
| Roof gardens, frame / whole-frame CPU | 129.7 / 90.4 ms | 111.7 / 80.7 ms |
| Roof gardens, draws / triangles | 1,435 / 4.46M | 1,434 / 4.45M |
| Overview, frame / draws | 101.1 ms / 566 | 98.1 ms / 563 |
| Buffer uploads per frame | 212 KiB in 12 calls | 124 KiB in 2 calls |
| Repeat entry, longest frame | 477 ms | 1,197 ms |

The repeat entry swung with load on both arms in this run (main 213 to 850 ms, fix 443 to 1,251 ms); in
the quiet three-arm run below it was 181 ms on `main` and 187 ms on the fix. Receipt:
`output/playwright/office-outlook-cost-final-20261015/result.json` (archived with the task's evidence).

### Earlier runs

Three-arm run, medians of three interleaved rounds (load 7 to 14). `fix` here is `b2289d67`, whose
precompile batches could shrink to one object a frame; `47b035c3` sized them past the per-call light walk.

| Metric (4x CPU) | main | fix `b2289d67` | lighting (#473) |
| --- | --- | --- | --- |
| First entry, longest frame | 658 ms | 265 ms | 682 ms |
| First entry, doors opening (3 frames) | 250 ms | 80 ms | 250 ms |
| Programs linked at the doors / in all | 18 / 64 | 0 / 125 | 19 / 64 |
| Roof gardens, frame / whole-frame CPU | 88.5 / 63.6 ms | 95.2 / 67.9 ms | 92.1 / 66.4 ms |
| Roof gardens, draws / triangles | 1,435 / 4.46M | 1,434 / 4.45M | 1,445 / 4.46M |
| Overview, frame / draws | 70.3 ms / 566 | 67.5 ms / 563 | 72.2 ms / 585 |
| Buffer uploads per frame | 212 KiB in 12 calls | 124 KiB in 2 calls | 212 KiB in 12 calls |

**An open finding: Roof gardens.** In every round where both changes ran together, Roof gardens was
4 to 10 ms slower per frame than `main` (four of four rounds), while Overview was not. Neither change
alone reproduces it. An isolation run (two rounds each) measured stand-ins only at 86.4 and 99.7 ms and
precompile only at 89.5 and 97.0 ms, against `main` at 92.6 and 96.8 ms. A CPU profile pair (`--profile`)
found the precompile queue empty during the sample (503 queued, 0 remaining), the same draw count, and
no new hot function. The extra time spreads across three's per-object render work and page work that
varies with each arm's own fixture town (remote players, the drape simulation, `checkVisibility`). It is
not attributed to the change, and not ruled out either.

The extra 61 programs the precompile links are district materials visible from the street that the
office never draws; they compile in parallel during the arrival and cost nothing per frame after it.

## Checks

| Check | Result |
| --- | --- |
| New stand-in, precompile and pipeline regressions on the base sources | red (4 skyline tests; pipeline `compileAsync` absent) |
| `node --test preview/tests/render-pipeline.test.js preview/tests/office-*.test.js` | 138/138 |
| `pnpm run verify` (core) at `58fd3441` | passed: agent 112, preview 3352 + 1 skip, server 599 + 154 skips (Redis suites; no `REDIS_URL`), desktop 76, Python 141, build, Ruff, secrets |
| `pnpm run verify` (core) at `0c9b8fc4` | first attempt failed one test on a missing `node_modules/vite/dist`: an outside disk sweep at 22:17 CDT deleted every worktree's `node_modules` and then every `dist` folder. After `pnpm install --frozen-lockfile --force`: passed, agent 112, preview 3353 + 1 skip, server 599 + 154 skips, desktop 76, Python 141, build, Ruff, secrets |
| A/B harness runs | three-arm (3 rounds), isolation (2 rounds), profile pair and final (3 rounds): all passed with no page errors |

## Gaps

- A throttled CPU on an M3 Max is not a weaker laptop's GPU; the real-device pass is in the decision doc.
- The remaining per-frame uploads after the fix belong to other dynamic buffers in the scene, not the host mask.

## Next

PR and hosted CI. Landing waits for Val, after #473 (they meet in `docs/offices.md` and the end of `office-skyline.test.js`).

## Authorized landing, 2026-10-18

Val authorized merging #448, #477, #468 and #484 and pruning their delivered
worktrees. Landing owner: `codex-pr-448-477-468-484`.

Merged current `origin/main` into this checkout without committing yet. Resolved
`docs/offices.md` by retaining the stand-in/precompile description and main's
time-of-day lamp behavior. Retained both appended test groups in
`preview/tests/office-skyline.test.js`. No performance claims were refreshed.

Verification is running: focused office/render-pipeline tests and `pnpm run verify`.
Logs: `/tmp/river-oaks-477-focused.log` and `/tmp/river-oaks-477-core.log`.
Next: inspect results, fix any integration regression, then sign and push the
merge and use the shared landing queue. Hosted CI and retirement remain pending.

Focused integration result: 159/159 passed. The initial failure expected the old
`desks` graybox mesh, removed by main's #362 furnishing package. The regression
now requires the furnished meshes' programs and distinguishes vertex/instance
color variants when checking uniqueness. No renderer behavior changed for this
adjustment. The first core run started before this correction and must be followed
by a fresh preview gate; it is still running under the agent runner.
