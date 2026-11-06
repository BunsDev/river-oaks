# Pink Jet-Age R9 baseline: matched cameras on the Gardens and Commons routes

- **Issue:** #747 (R9, matched visual acceptance and budgets) under epic #738; first slice
- **Task id:** `pink-jet-age-r9-baseline` (live register)
- **Owner:** `claude:cody-pja-r9-20261028`
- **Branch:** `feat/pink-jet-age-r9-baseline-20261028`
- **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-pja-r9`
- **Base:** `be166248` (fetched `origin/main`, 2026-10-28, after #749 R1 kit)

## Objective

Capture the current (classic) look of two routes from fixed cameras at pinned hours
and a pinned graphics preset, with draw calls, triangles and frame times per view,
so each later pink-finish PR can be compared at matched cameras. No rendering,
material, geometry or game-behavior change.

- Route A, Gardens: arrival, T2 facade approach, entrance hall, lift lobby, Floor 4
  skywalk and gallery, a seated terrace stop and the social pergola.
- Route B, Commons: market-street gateway, garden court, seated court cafe, the
  Bayou Lantern water tower (two views), a seated green bench and the pavilion chess table.

## Files

- `preview/e2e/pink-jet-age-routes-plan.mjs` (new): camera table, pinned hours,
  options, luma verdict and report validation (pure).
- `preview/e2e/pink-jet-age-routes.mjs` (new): the runner, built on
  `garden-campus-render-common.mjs`.
- `preview/e2e/garden-campus-render-common.mjs`: optional `districtRevision` on
  `startFixture`/`openDistrict` so a campus-bearing revision other than the Gardens
  can be served and asserted. Default behavior for `garage`/`gardens` is unchanged.
- `preview/tests/pink-jet-age-routes.test.js` (new): 7 behavioral tests.

## Usage

```sh
node scripts/browser-lock.mjs pja-r9 -- node preview/e2e/pink-jet-age-routes.mjs \
  [--graphics=sharp|smooth] [--hours=day,dusk,night] [--cameras=id,id] [--finish=classic] [--out=dir]
```

Defaults: `sharp`, all three hours, all cameras, `classic`,
`.runtime/pink-jet-age-r9/<timestamp>/`. Output: `<camera>-<hour>.png`,
`sheet-gardens.jpg`, `sheet-commons.jpg`, `report.json` (HEAD, dirty flag,
served revision, per-view calls/triangles/frame p50/p95/CPU p50/memory/programs,
luma mean/spread verdict, host load). The run fails if any view is blank or dark.

## Checks

- `node --test preview/tests/pink-jet-age-routes.test.js`
- The capture under the browser lock, with PNGs inspected by eye
- `pnpm run verify` (core)

## Results

- `node --test preview/tests/pink-jet-age-routes.test.js`: 7/7 pass.
- `pnpm run verify` (core) passed on the final source tree, before commit `21746aac`
  (receipt `.runtime/agent/core.json`, 2026-10-28 ~20:07-20:11Z). Counts: agent 289/289;
  preview 4348 pass + 1 skip of 4349; server 1077 pass + 283 skip (Redis, as core
  permits) of 1360; desktop 127 pass + 5 skip of 132; pytest 170 passed; ruff clean;
  secrets clean. Earlier core runs on the intermediate trees also passed with the same counts.
- Framing, under the browser lock (`.runtime/pink-jet-age-r9/framing-1`, `framing-2`):
  I inspected every day PNG. Three cameras were re-posed:
  - `a04` was too close to the core box.
  - `a07` was the Floor 4 terrace bench, which faces the tower glazing; it moved to the T2 roof bench.
  - `b07` got a corrected subject line.
- **Baseline:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-pja-r9/.runtime/pink-jet-age-r9/baseline-21746aac-sharp/`
  (ignored by Git). Head `21746aac`, clean tree, revision `east-garden-commons-market-1`,
  graphics `sharp`, finish `classic`, 1280x800 DPR 1, 15 cameras x day 15 / dusk 18.5 /
  night 19 = 45 views. Every view passed the luma check (spread 30.6-62.3); finished
  2026-10-28T20:23Z; host load 1-min about 20-24. Draw calls per view were 409 to 3010 and
  triangles 3.1 M to 9.8 M. Frame p50 was 16.7 ms (vsync) except `a03` at dusk (33.2 ms).
  I inspected dusk and night PNGs and both contact sheets.

| camera | day calls / tris (M) | dusk | night |
| --- | --- | --- | --- |
| a01-arrival-e1 | 1791 / 5.66 | 1961 / 6.95 | 2015 / 7.55 |
| a02-t2-facade-approach | 1423 / 5.52 | 1715 / 6.24 | 1776 / 6.45 |
| a03-t2-entrance-hall | 2410 / 7.75 | 2712 / 8.52 | 2762 / 8.72 |
| a04-t2-lift-lobby | 2279 / 7.24 | 2583 / 7.99 | 2621 / 8.19 |
| a05-f4-b12-skywalk | 1149 / 4.82 | 1380 / 5.43 | 1492 / 5.68 |
| a06-f4-t2-gallery | 1037 / 4.86 | 1216 / 5.31 | 1371 / 5.68 |
| a07-t2-roof-seat | 2222 / 7.19 | 2303 / 7.36 | 2348 / 7.49 |
| a08-social-pergola | 1722 / 6.27 | 1894 / 6.69 | 1939 / 6.87 |
| b01-gateway | 908 / 5.58 | 1137 / 6.53 | 1167 / 6.67 |
| b02-garden-court | 778 / 3.88 | 961 / 4.44 | 1050 / 4.91 |
| b03-court-cafe-seat | 2738 / 7.72 | 2939 / 9.36 | 3010 / 9.78 |
| b04-green-to-tower | 567 / 4.92 | 662 / 5.28 | 699 / 5.36 |
| b05-tower-base | 409 / 3.11 | 491 / 3.46 | 523 / 3.61 |
| b06-green-bench-seat | 661 / 4.83 | 773 / 5.10 | 850 / 5.19 |
| b07-pavilion-chess | 467 / 3.24 | 564 / 3.44 | 587 / 3.61 |

**Comparability caveat:** calls and triangles for the same camera rise from day to
dusk to night. The hours run in sequence in one page, so this mixes the hour's effect
with continued streaming and resident movement. Compare a later run against the same
hour of this baseline, not one hour against another.

## Gaps

- **Finish passthrough:** R1 added `finish` to `buildCityKit`, but no live caller
  passes one. `--finish` accepts only `classic`; anything else fails with a pointer
  to the TODO in `pink-jet-age-routes-plan.mjs` (`LIVE_FINISHES`) and the runner.
- **Night:** the client's `#sun-hour` slider stops at 19:00 (twilight already 1).
  There is no later night in the client, so `night` is pinned to 19 and the report
  says so. A true night needs a client change, out of scope here.
- **Lift car interior:** the lift is a solid core box in `garden-campus.js`; there is
  no car interior to frame. The baseline frames the T2 lift lobby and lift door.
- Seated stops are camera poses at seated eye height (1.2 m), not an avatar seated
  through the seat interaction.
- Frame times are this host under recorded load; not a device budget and not a
  human visual review.

## Next step

- Draft PR #752. Hosted checks pending; do not mark ready or land without authorization.
- Later pink-finish PRs rerun the same command with the same graphics preset and
  compare `report.json` and the sheets against the baseline folder above, hour for hour.
- Wire a live finish selector, then extend `LIVE_FINISHES`.
- Optionally capture a `smooth` baseline as well.

## Amendment 2026-11-01: the redesigned workload, #747 provenance, and the concept-image rule

Val's long-running prompt amendment (2026-11-01): include the redesigned workload and
#747's source/device provenance in this comparison plan; do not invent a new architecture
solely to imitate a concept image. This section amends the plan above; nothing above is
rewritten, and the 2026-10-28 baseline folder and table stay the classic reference.

- **Task id:** `pink-jet-age-r9-plan-amendment` (live register); **owner**
  `claude:fable-pja-r9-plan-20261101`
- **Branch:** `docs/pink-jet-age-r9-comparison-plan-20261101` from `origin/main` `decb4e9a`;
  **worktree** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-pja-r9-plan`
- **Files:** this ledger; `preview/e2e/garden-campus-render-common.mjs` (`captureProvenance`);
  `preview/e2e/pink-jet-age-routes-plan.mjs` (`validateProvenance`, `EVIDENCE_CLASSES`,
  `MATCHED_CONDITIONS`, `comparisonMismatches`; `validateReport` checks a provenance block
  when one is present); `preview/e2e/pink-jet-age-routes.mjs` (records `report.provenance`);
  `preview/tests/pink-jet-age-provenance.test.js` (new). No rendering, material, geometry
  or game-behavior change; the camera table, hours and metrics are untouched.

### The comparison's arms and the redesigned workload

The "Gaps" entry above ("`--finish` accepts only `classic`") is closed. The live finish
selector exists: `?finish=pink-jet-age` is read once per load (#753, Commons and Heights),
the Gardens campus materials follow it (#758) and the Gardens jet-age forms draw under it
(#774, `forms` role, rollback switch `jetAgeForms: false`). Route C over the original District
joins the runner in #787 (draft; `districtFinish` asserted the same way `campusFinish` is).

A comparison is therefore two runs of the same command on one candidate head, differing
only in `--finish`:

```sh
node preview/e2e/pink-jet-age-routes.mjs --graphics=sharp --finish=classic      --out=.runtime/pink-jet-age-r9/<head>-classic
node preview/e2e/pink-jet-age-routes.mjs --graphics=sharp --finish=pink-jet-age --out=.runtime/pink-jet-age-r9/<head>-pink
```

Read the two `report.json` files hour for hour (the day-to-dusk-to-night caveat above still
applies). Two checks precede any per-view reading:

1. `comparisonMismatches(classic, pink)` from `pink-jet-age-routes-plan.mjs` must be empty.
   It compares the matched conditions (`revision`, `graphics`, `viewport`,
   `deviceScaleFactor`, `hours`, browser, GPU renderer, machine platform/arch/CPU, player
   count and evidence class). `head` and `finish` are the arms, not conditions. A non-empty
   list is a mislabelled comparison, not a finding.
2. The classic arm is the drift check. A finish never changes a plan, its hash, a lock, a
   piece ID, geometry, collision or a recipe override (`shared/city-kit/catalog.js`), so any
   difference between the classic arm and the 2026-10-28 table at the same hour must be
   explained by named classic changes landed since `21746aac` (new props, residents,
   streaming), never by the finish. Unexplained classic drift is a regression of the
   candidate, whatever the pink arm shows. Pink minus classic on the same head is the
   finish's cost.

**The player workloads #747 names are not this runner's.** This runner's workload is one
authenticated client, standing still at fixed cameras with the interface hidden while
residents keep moving; `report.provenance.workload` says exactly that. The one- and
two-player playable routes stay with their existing owners, and the redesigned arm must be
measured through them, not through a new harness:

| #747 workload | Existing owner | Finish passthrough today |
| --- | --- | --- |
| Warmed frame p95 / CPU-submission p95, one and two players, reconnect median of five, position drift, resource counts | `preview/audit/world-expansion-baseline.js` (three 30 s samples per workload, `desktop` and `phone-viewport`, `--reconnects=5`), decided by `preview/audit/baseline-compare.js`; wording in `docs/world-expansion.md` | None: it opens `/?motion-debug=1&render-audit=1`. The smallest next action is a `--finish` option that appends `&finish=<name>` to that address, the way `districtPath` does, and records it in the report. |
| Gardens arrival → public campus route → existing bridge (B12 skywalk) → social stop → return | `preview/e2e/garden-campus-traversal.js` (two residents: lift to Floor 4, skywalk, T2 roof garden), `garden-campus-readiness.js` | None: the journeys open the fixture's default address. Same next action: a finish option on the journey page address; no second journey. |
| Commons two-player Lantern Walk / chess → footbridge → return, with reconnect | `preview/e2e/east-garden-commons.js` through the shared runner (`RIVER_OAKS_SHARED_JOURNEY`), `plaza-chess.js` | None, as above. |
| Unavailable-chunk escape | No journey exercises it by that name. `preview/tests/spatial-chunk-stream.test.js` covers a renderer that fails to attach; the playable escape under either finish is an open gap for the streaming owners (#587/#512). | Not applicable until a journey exists. |

Budgets are unchanged and are not this ledger's to change: the wording in
`docs/world-expansion.md` (10% matched warmed frame p95 / CPU-submission p95, 10%
District-only production cold-transfer growth, reconnect median-of-five no more than 20%
slower, drift no more than 0.5 m, three warmed 30-second samples per matched workload) is
the budget for the redesigned arm, with the pending vsync-locked-p95 proposal recorded there
left for Val's decision. Nothing here substitutes a more favorable metric.

### Provenance every report records (#747's evidence contract)

`report.json` now carries a `provenance` block read from the live page once it is ready, so
the GPU string is the context that drew, not an assumption. The contract's fields and where
each one lives:

| #747 field | Where it is recorded |
| --- | --- |
| Exact before/after heads | `head`, `dirty` of each arm's report |
| Data revision | `revision` (served; asserted against the world manifest on load) |
| Style revision | `finish` asked, `campusFinish` drawn (asserted), `districtFinish` once #787 lands |
| Device / GPU / browser | `provenance.browser` (Playwright's Chromium build), `provenance.gpu.renderer` (unmasked WebGL renderer) with `gpu.software` true for SwiftShader/llvmpipe/basic-render fallbacks, `provenance.machine` (platform, arch, OS release, CPU model, logical CPUs, memory GiB) |
| Quality | `graphics` (preset asked) and `provenance.quality` (the client's quality stats: mode, scale, occlusion, fps) |
| Resolution / DPR | `viewport`, `deviceScaleFactor`, `provenance.gpu.buffer` (the drawing buffer) |
| Camera | `cameras[]` and each view's `pose` |
| Lighting | `hours`, each view's `appliedHour` and `glow` |
| Route | each view's `route`, `camera` and `stop` |
| Player workload | `provenance.workload` (`players`, `clients`, `movement`, `interface`, `residents`) |
| Evidence class | `provenance.evidenceClass`, one of `EVIDENCE_CLASSES`: `source-implementation`, `local-fixture`, `hosted`, `packaged-native`, `physical-device`, `human-accessibility`, `visual-approval`. This runner is always `local-fixture`; it never fills the other rungs, and a ledger that cites it must say which rungs stay open. |
| Original failures and skips | `failure.json` on a failed run (head, error, the views captured so far); per-view `hostLoad`; the run refuses a blank or dark view rather than skipping it |

The 2026-10-28 baseline predates the block, so `comparisonMismatches(baseline, candidate)`
names every provenance key as `null -> <value>`. That is intended: its device provenance
exists only as this ledger's prose (this Mac, Playwright Chromium, host load 20-24). A
provenance-complete comparison recaptures the classic arm on the candidate head on the same
machine, and uses `baseline-21746aac-sharp` as the classic drift reference, hour for hour.

### Rule: concept images are guidance, never a target architecture

The design sheets (`docs/design/pink-jet-age/`, the galleries on #739-#746, the atlas on
#747) are design guidance, not acceptance evidence, and not a target to rebuild toward. No
new architecture is invented solely to imitate a concept image. A shape change reaches this
comparison only when all three hold:

1. Val has recorded the source-contract decision it needs. Open today: R3 increment 2
   (tower eyebrows, curved corners, pergola and canopy height; the tower glass massing) and
   the Route C reference-facade question on #787.
2. It arrives under the finish's `forms` switch with classic byte-identical (the mesh
   signature probe in #787 and the `jetAgeForms: false` rollback in #774 are the pattern).
3. It is compared on these cameras against its classic arm, with the provenance above.

A capture that differs from a concept render is not a failure. A pink arm that regresses
against its matched classic arm beyond the budgets, or a classic arm that drifts from the
2026-10-28 table, is. The #747 rule against a regenerated "before" panel stands: the
classic reference is a captured run on a named head, never a render made to look like one.

### Amended long-running prompt for #747

The issue's "Long-running goal prompt" should read as below. This session did not edit the
issue; Val owns its text.

```text
Qualify the Pink Jet-Age redesign under #738 by extending existing acceptance owners and
harnesses. Start from the actual current-source classic baseline (R9 ledger, head
21746aac) and compare it, hour for hour and camera for camera, with the redesigned arm:
the same command on the same candidate head with --finish=pink-jet-age. Record in every
report the exact heads, served data revision, finish drawn, device, GPU, browser, quality,
resolution and DPR, cameras, lighting, route and player workload, and name the evidence
class (source implementation, local fixture, hosted, packaged native, physical device,
human accessibility, visual approval). Refuse to read views until the matched conditions
agree. Measure the one- and two-player playable workloads through the existing owners
(world-expansion-baseline.js, garden-campus-traversal.js, east-garden-commons.js) under
the redesigned finish, with the current budgets and sample protocol; add a finish option to
them rather than a new harness. Do not use concept images or a regenerated before panel as
evidence, and do not invent new architecture solely to imitate a concept image: shape
changes need Val's recorded contract decision, the finish's forms switch with classic
byte-identical, and a matched comparison. Challenge new transparency, foliage, skin-lighting
and depth artifacts rather than hiding them in a permissive baseline. Run applicable
focused, core, browser, Redis and hosted gates without bypassing prerequisites. Keep
physical-device, native, human-accessibility and visual approval separate. Verify
compatible rollback and record every failure, skip and missing device. Deliver a
per-package evidence matrix and the smallest next action; no silent budget increase,
production activation, deployment or release claim.
```

### Checks for this amendment

- `node --test preview/tests/pink-jet-age-provenance.test.js preview/tests/pink-jet-age-routes.test.js`
- A two-camera day smoke of both arms under the browser lock, then
  `comparisonMismatches` across the two reports and against the 2026-10-28 baseline report
- `pnpm run verify` (core)

### Results for this amendment

- Focused: 12/12 (4 new provenance tests, the 8 route tests unchanged).
- Smoke capture, 2026-11-01 ~06:25-06:30Z, under the browser lock (queued behind another
  session's core verification), on `decb4e9a` with this amendment uncommitted (`dirty: true`;
  the runner records it), `--cameras=a01-arrival-e1,b05-tower-base --hours=day`, both arms,
  outputs `.runtime/pja-r9-plan/smoke-{classic,pink}/` in the worktree (ignored by Git):
  - Both arms passed (2/2 views each, luma ok). `campusFinish` was `classic` and
    `pink-jet-age` respectively; I inspected both `a01` PNGs: the pink arm draws pink
    fascias, canopy edges and window surrounds on the same framing, the classic arm none.
  - Provenance recorded on both: Chromium `156.0.8078.4`; GPU `ANGLE (Apple, ANGLE Metal
    Renderer: Apple M5 Max, Unspecified Version)`, `software: false`; darwin arm64 27.2.0,
    Apple M5 Max, 18 logical CPUs, 128 GiB; quality mode `sharp`, scale 1; workload one
    still client; evidence class `local-fixture`. Host load 1-min 9.9-10.3.
  - `comparisonMismatches(classic, pink)`: `[]`, so the arms are comparable.
  - `comparisonMismatches(baseline-21746aac, classic)`: `hours` (the smoke ran day only) and
    the seven provenance keys as `null -> <value>`, as designed; the 10-28 report has no block.
  - Day calls / triangles: `a01` baseline 1791 / 5.66 M, classic now 2016 / 6.17 M, pink
    1973 / 6.02 M; `b05` baseline 409 / 3.11 M, classic 414 / 3.16 M, pink 415 / 3.17 M.
    The classic-vs-baseline difference is main's classic content since `21746aac` plus
    resident movement; pink below classic on `a01` is that movement, not a saving. Frame p50
    was 33.3 ms on classic `a01` and 16.7 ms elsewhere at this load (vsync-quantised; not a
    budget reading). A two-view day smoke proves the mechanism, not the redesign.
- `pnpm run verify` (core) passed on this tree before commit, 2026-11-01 06:53-06:59Z
  (receipt `.runtime/agent/core.json` in the worktree; host load fell from 13 to about 7
  before the start and rose to about 10 during the run). Counts: tooling 294/294; preview
  4781 pass + 1 skip + 35 todo of 4817; server 1110 pass + 285 Redis skips of 1395, as core
  permits; desktop 127 pass + 5 skip of 132; pytest 215 passed; ruff clean; gitleaks found no leaks.
  Core excludes Redis, browser, native, live auth and production acceptance; the smoke above
  is the only browser evidence here.

### Gaps for this amendment

- The world-expansion baseline and the route journeys still have no finish option; the
  redesigned arm's one-/two-player budgets cannot be measured until that passthrough exists.
- No journey covers the unavailable-chunk escape under either finish.
- `provenance.machine` is this host; the physical-device, native, hosted, accessibility and
  visual-approval rungs stay open, as before.
- #787 (Route C) is a draft; when it lands, `districtFinish` joins the style-revision row
  above with no further change here.

### Next step for this amendment

- Draft PR #833 on `7f1f1089`; hosted checks pending. Val reviews the amendment and decides
  whether to paste the amended prompt into #747. Do not mark ready or land without
  authorization.
- Follow-up tasks, each its own branch: a `--finish` passthrough for
  `world-expansion-baseline.js` and the route journeys; a journey for the unavailable-chunk
  escape; after #787 lands, rerun both arms over all three routes and all hours on one head.
