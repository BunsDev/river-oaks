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
