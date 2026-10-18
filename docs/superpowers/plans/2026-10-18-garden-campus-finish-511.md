# Garden Offices #511: finish, planting, lighting and bounded rendering

Owner: `claude:river-oaks-95/agent-511 (5bececff)`, task `garden-campus-finish-511`, branch
`feat/garden-campus-finish-511-20261018`, worktree `river-oaks-garden-campus-511-20261018`.
Parent tracker: #505 (`docs/superpowers/plans/2026-10-18-garden-campus-505.md`). Coordinator:
river-oaks-95 (session 5bececff).

## Objective

Finish #507's shells as planted, lit architecture inside #506's contract envelopes, without
moving a dimension to suit a render: 6/7/6 expressed storeys, 26/30/26 m parapets, silhouette
caps 28.1/32.1/28.1 m, every clear route, landing, portal and door left open. Prove it with
focused regressions, matched views against the garage, and resource measurements against a
matched baseline on this machine.

## Inputs (by revision)

- #507 shells: started at `5a572ea4`; merged `15e8400a` (signed merge `cefa4ee7`), which brings
  #506 layout `3.1` and origin/main `1d8740ad` (including #477).
- #506 contract `shared/garden-campus-layout.js`, versions `{schema 1, layout '3.2', floors 1,
  support 1, units 1}` (via #507 `40aec12a`, signed merge `d0b1c514`). Not edited here.
- #508 (upper circulation, river-oaks-c5) and #510 (suite fit-out, `The Gardens fit-out` root)
  are separate roots; this pass neither depends on nor restyles them.

## Files owned

- `preview/src/garden-campus.js`: the finish pass on #507's builder; signature and
  `userData.dispose()` kept, `userData.relight({twilight})` added.
- `preview/src/garden-campus-finish.js` (new): pure campus-metre finish geometry.
- `preview/src/garden-campus-planting.js` (new): the planting plan and its meshes.
- `preview/src/main.js`: one line in `updateAtmosphere()` calls the campus relight (approved by
  the coordinator for #507/#512 to merge).
- `preview/tests/garden-campus-finish.test.js` (new).
- `preview/e2e/garden-campus-render-common.mjs`, `garden-campus-render-views.mjs`,
  `garden-campus-render-resources.mjs` (new).
- `docs/design/garden-campus/finish/receipt.md` (new) and the review contact sheets beside it.
- `preview/tests/garden-campus-district.test.js`: the "every finish is drawn over its footprint"
  block only, rewritten for the finish meshes at the coordinator's request.

## Design

- **Storeys.** Each floor's ceiling slab carries a stone band 3 cm proud of the plate, cut
  where a skywalk deck meets the facade. Distinct band heights are exactly 6/7/6 per tower, and
  no band rises above a roof deck, so the headhouse never reads as a storey. A perimeter
  ceiling cove (emissive) lights each occupied floor through the glazing.
- **Facade.** Every second 1.5 m bronze mullion deepens into a fin that stops 5 mm inside the
  plate edge. Ground floors get a 0.4 m stone plinth between glass and plate edge, broken at
  doors. Above the ground floor, the west service riser (`<floor>-core-west`) is a solid
  planted wall instead of glass.
- **Roofline.** Parapets are stone to 0.93 m with a 7 cm bronze coping to exactly 26/30/26 m.
  Headhouses are timber over the shafts and lobby with a bronze cap to 28/32/28 m. Roof beds
  (the contract's planters) hold a stone planter, columnar trees topping out 0.12 m under the
  cap, and layered perennials and grasses.
- **Skywalks.** The deck's bottom 8 cm is a timber soffit inside the 0.35 m slab. The 0.5 m
  edge zones hold bronze troughs with reach-bounded perennials under the guard top, and a step
  light faces the deck. Rails stay inside the edge-zone rect.
- **Terraces.** Timber decks. Planted bronze troughs hang outside every terrace guard, on the
  slab edge, with trailing strands that stop at body clearance over anything below. No trough
  runs over a skywalk.
- **Ground.** Entrance canopies at z 3.3 (timber with a bronze edge and a TypeSafe pink inlay,
  the campus's only accent), pergola climbers on the slats and inside each post's rect, the
  café's green roof with a bronze fascia, flush path lights, paths in the district paver and
  the platform in the district grass.
- **Light.** Emissive only: no scene light is added. Glow is 0.8 by day and rises to 2.4 at
  full twilight (`CAMPUS_GLOW`) through `relight`, which main.js calls on every atmosphere
  change, including after a rebuild.
- **Bounded detail.** Fine procedural leaves and grasses submit within 60 m (green roofs use
  55). Foliage clumps use a 20-face form for small clumps and 80 faces for crowns. Every mesh
  is instanced and spatially batched.
- **Furnishings.** #511 proposed 67 terrace, roof and ground finishes as exact rects (26
  planters, 21 seats, 9 tables, 11 tree pits). #506 adopted all of them unchanged as layout
  3.2 (`GARDEN_CAMPUS_LAYOUT.furnishings`), validated their support and reach, and fixed one
  defect the proposal's own reach flood missed. In 3.1, B12's edge guards ran across T2's z 13
  terrace and cut off its west wing; the flood had filtered obstacles by centre distance. In 3.2
  `bridge.guardSpan` stops the guards at the terrace. The proposal file and its tests are
  retired. This pass draws each furnishing from `campusLevels()` once, over its whole
  footprint, replacing #507's interim massing:
  - a planter as stone walls with a toe light, soil and planting (roof planters get columnar
    trees; terrace beds the lighter species);
  - a seat as a bench top on bronze legs;
  - a table as a flush pad with a table and four chairs;
  - a tree as a stone kerb, a trunk and a crown above 3.2 m.

## Checks and results

(Filled in as runs complete; exact commands and counts below.)

## Gaps and owners

- Occupied-suite views and occupied-route checks need #508's circulation and #510's fit-out
  merged into one candidate (#512).
- Seats and tables are collision only until #510 makes them usable.
- Flight volumes do not include terrace troughs, canopies or green walls: a flyer can pass
  through them. They are above body clearance and outside every walk surface.

## Next action

Matched views (garage and gardens, day and dusk), resource A/B against the garage and an
origin/main copy, `pnpm run build`, `nice -n 19 pnpm run verify`, then a draft PR on
`feat/garden-campus-shells-507-20261018`.
