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
- The remaining 11 crossing/carriageway overlaps are short connectors where no
  clear station exists; they render as before.
- Paver texture realism is a separate PR (#231); plant variety is separate too.

## Delivery

Merged by #233 as `c4a871b` (reviewed head `88496d9`; all 11 hosted checks passed).
The first run on `ce24f7d` failed only the known `creator-objects` flake at
`creator-objects.js:77`; the branch had passed twice before and passed again.
Main's own run on `c4a871b` failed the email-access browser timeout, which also
hit unrelated #234 and passed on rerun.

**Next step:** retire `feat/sidewalk-corners` and its worktree with
`project:prune` once the `street-visuals-register` task is on the primary.
