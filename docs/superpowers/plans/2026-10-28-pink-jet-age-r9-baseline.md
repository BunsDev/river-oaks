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

_Filled in below as checks complete._

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

Later pink-finish PRs rerun the same command with the same graphics preset and
compare `report.json` and the sheets against this baseline folder.
