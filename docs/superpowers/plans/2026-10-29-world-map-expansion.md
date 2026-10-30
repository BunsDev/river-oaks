# World map: draw every composed expansion district

- **Goal:** Val, 2026-10-29: "ensure all the extended maps are visible"
- **Task id:** `world-map-expansion-20261029` (live register)
- **Owner:** `claude:river-oaks-22 (b90b7d)`
- **Branch:** `feat/world-map-expansion-20261029`
- **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-world-map-expansion`
- **Baseline head:** `39a5f30272ea620ce692b95fcc15a8c69b9aff9f` (`origin/main`, 2026-10-29)

## Objective

The sidebar World map (`preview/src/world-map.js`, shown with `VITE_WORLD_MAP=true`)
drew only `world.roads`, `world.buildings` and `world.parcels`. Under an expansion
revision (`east-garden-commons-market-1` … `typesafe-place-1`) the composed world's
`bounds_m` grows east, but the districts' streets, shells and water live in the kit
assemblies of `world.eastGardenCommons`, so the map showed the District beside a blank
envelope. Draw the composed layout: lanes, intersections, courts, the Commons
promenade/plaza/arrival loop, shells and water towers, bayou water, and each district
outlined and named (East Garden Commons, Bayou Heights, Studewood, Bayou Terraces,
Woodland Heights, TypeSafe Place). A world without the layout draws exactly as before.

## Files owned

- `preview/src/world-map.js`: `expansionMapFeatures(world)` (pure, exported), new
  `paving`/`districts` SVG groups, district labels, legend key `District`
- `preview/src/world-map.css`: `.world-map-lane`, `.world-map-court`, `.world-map-water`,
  `.world-map-district`, `.world-map-district-label`, `.world-map-key-district`, two tokens
- `preview/tests/world-map.test.js`: two regressions over the real composed world
- `.env.example` (one comment line), `docs/world-expansion.md` (one paragraph)
- this ledger

## Checks

- `node --test preview/tests/world-map.test.js`
- `pnpm run verify` (core gate)

## Results

- `node --test preview/tests/world-map.test.js`: 10 tests, 10 pass, 0 fail (2026-10-29).
- `pnpm run verify` (core, 2026-10-29 17:36 CDT, host load ~16, dirty tree before commit): **passed**, 11/11 stages
  (agent-tests 289/289, preview-tests 4683 run/4647 pass/0 fail with skips, server-tests 1365 run/1080 pass/0 fail with skips,
  desktop-tests 132/127/0, build, python lint/format/tests, demo, demo-verify, secrets). Skipped tests are Redis, browser
  and native scopes; core success excludes them. Receipt: `.runtime/agent/core.json`.

## Gaps

- Rendered/visual check of the map under `typesafe-place-1` in a browser is not part of
  this slice; the node regressions prove feature extraction, not pixels.
- Walks, sidewalks, trees and furniture are deliberately not drawn.
- Hosted play shows the districts only when the owner sets `VITE_WORLD_MAP=true` and
  `RIVER_OAKS_DISTRICT_REVISION=typesafe-place-1` for that environment (not done here).

## Next step

Draft PR, hosted checks, Val's visual review.
