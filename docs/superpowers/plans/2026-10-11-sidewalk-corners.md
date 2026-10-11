# Sidewalk corner conditions

**Objective:** replace square, overlapping junction corners (two sidewalks with
crossing brick grains, buried crossing ramps) with curb returns modelled on the
River Oaks District corner at Kettering Drive (user Street View reference,
June 2024).

**Branch / worktree:** `feat/sidewalk-corners`,
`../river-oaks-sidewalk-corners-20261011`.

**Files owned:** `preview/src/street-corners.js` (new),
`preview/src/sidewalks.js`, `preview/src/street-roads.js`,
`preview/src/pedestrian-network.js` (crossing placement only),
`preview/tests/street-corners.test.js` (new),
`preview/e2e/fixtures/corners.{html,js}` (new), `docs/street-standards.md`.

## Result

- 22 of the district's 39 junction corners get a 3 m curb return with one paving
  field; the other 17 stay square because the corner would reach another
  carriageway, its sidewalks stop for one just past it, or a stub street's
  crossing cannot move clear.
- Crossings near junctions moved beyond the corners. District crossings that
  overlap another carriageway: 37 → 11. Crossings under a mapped footway: 6 → 1.
- Seam steps between corner paving and sidewalks: < 3 mm away from crossings
  (terrain interpolation), < 8 mm inside a ramp flare.

## Checks

- `node --test preview/tests/street-corners.test.js`: 6/6.
- `pnpm test`: 2593 tests, 2592 pass, 1 pre-existing skip.
- `pnpm run build`: passes.
- Rendered before/after of all 39 corners (street and plan) through the corners
  fixture with Metal ANGLE Chromium; reviewed a sample by eye.

## Gaps

- No in-game walk-through of a corner; ground continuity is tested numerically.
- Hosted CI `preview` journeys not yet run for this branch.
- The remaining 11 crossing/carriageway overlaps are short connectors where no
  clear station exists; they render as before.
- Paver texture realism is a separate PR (#231); plant variety is separate too.

**Next step:** open the PR, pass hosted checks, merge after #227 and #231.
