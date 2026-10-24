# Bayou Market Commons: luxury polish and road cohesion

Register task `bayou-luxe-polish`, branch `feat/bayou-luxe-polish-20261024`, worktree `river-oaks-destination-slice`, base `2cbc4dc4` (main after #611 landed as `00a36290`).

## Objective

Val reviewed the merged destination locally and asked for a polish pass. The roads should read as one network with the District. The destination should feel luxurious, modern and highly detailed, while keeping its own character: Market Street, the Bayou Green, the Bayou Lantern and the Lantern Walk.

## Audit (before)

The District's street vocabulary (`preview/src/street-profile.js`, `street-furniture.js`, `retro-palette.js`):

- **Roads:** crowned asphalt with 6 cm granite curbs.
- **Sidewalks:** porcelain paver sidewalks.
- **Lamps:** mid-century orbital lamps (opal globe, brass ring) on deep-teal bronze columns.
- **Tree pits:** bronze tree grates in pale stone surrounds.
- **Planters:** porcelain stone planters.
- **Palette:** ivory, porcelain, teal, deep teal and brass.

The Commons diverged on every one of these:

- **Lane:** a red brick shared lane.
- **Tree pits:** bare soil.
- **Lamps:** generic lanterns.
- **Ramp:** a flat ivory slab at the gateway.
- **Facades:** Heights-style red brick storefronts.

Captures: `.runtime/tmp/luxe-before/` (local review aid).

## Plan

1. **Road cohesion:**
   - Charcoal granite setts on Market Street, with porcelain cross bands at the tree rhythm and a flush bronze channel drain.
   - Granite curb edges.
   - The gateway ramp paved to match, so the District's sidewalk and street materials carry into the Commons.
2. **Street furniture:** District orbital lamps, bronze tree grates in stone surrounds, and modern stone-and-timber benches.
3. **Architecture:** a `luxe-modern` kit style for Market Row:
   - Honed limestone walls.
   - Full-height storefront glazing with slim black-steel mullions.
   - Cantilevered bronze canopies with downlight strips.
   - Vertical bronze fins and ribbon windows above.
   - Brass-letter signs on dark plates.
   - The garden court in travertine with brass.
4. **Landscape:** steel lawn edging and limestone-capped planter walls in place of curb-and-hedge edges.
5. **Budgets:** stay within the kit's draw-call (70), material (28) and triangle budgets. Regenerate locks. Keep connectivity at 1.0.

## Checks

- Focused city-kit and destination tests, with regressions for the new behaviour.
- `pnpm run verify`.
- `pnpm run test:experience east-garden-commons` on an untouched commit.
- In-game before/after captures at the same camera poses.

## Results

- [ ] Before captures
- [ ] Road cohesion
- [ ] Street furniture
- [ ] Luxe-modern architecture
- [ ] Landscape edges
- [ ] Focused tests, core, journey, after captures

## Gaps and next step

Human visual approval, physical-device performance and production activation stay outside automated evidence.
