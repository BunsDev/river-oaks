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
- Latest #507 head merged: `086c197e`, which adds campus ground room summaries (signed merge
  `4381fe96`). The focused campus tests pass afterwards: 35/35. Views and the resource A/B
  were taken at `6b8c51e6`. The merge touches only garden-campus-district.js (room summaries),
  so rendering is unchanged.
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

### Focused tests

At `bb8cd938`:
`node --test preview/tests/garden-campus-finish.test.js preview/tests/garden-campus-district.test.js preview/tests/garden-campus-layout.test.js`
gives 34/34. The finish tests:

- silhouette under each cap, with only the headhouse and roof-planter planting above a parapet;
- no part in any walkable surface between 0.05 m and 2.75 m, except inside a published
  obstacle or the 0.2 m facade line, sampled on a 5 cm grid on every level;
- portals, terrace doors and entrances open;
- storey bands and lit floors exactly 6/7/6;
- planting support;
- no lights, and relight touches only the glow;
- three rebuilds release everything and repeat their counts;
- draw and triangle budgets;
- furnishings drawn over their footprints, with crowns above clearance.

### Mutation checks

| Change | Result |
| --- | --- |
| Canopy lowered to 2.3 m | Walkable test fails (12 parts) |
| Troughs not cut at skywalks, strands unclamped | Walkable and portal tests fail |
| Bench top shrunk by 0.1 m | Both footprint tests fail |

### Core gate

| Run | Revision | Result |
| --- | --- | --- |
| `nice -n 19 pnpm run verify` | `cefa4ee7` (layout 3.1) | passed: agent 121/121, preview 3569/3570 (1 skip), server 681 pass with 205 Redis skips, desktop 76/76, build, python 141, secrets |
| `nice -n 19 pnpm run verify`, first try | `bb8cd938` | stopped by the 10-minute preview cap at load ~500 |
| `nice -n 19 pnpm run verify`, rerun | `bb8cd938` | preview 3581/3583, 1 skip, 1 fail |
| Remaining core profiles, one at a time | `bb8cd938` | all passed: server 681 (+205 Redis skips), desktop 76/76, build, python 141, security |

The one preview failure is the known penthouse wall-clock test "surfaces are drawn in short
idle slices" (a 231 ms slice under load). It passes alone, and this PR does not touch it.

### Resource A/B

`node preview/e2e/garden-campus-render-resources.mjs garage=garage gardens=gardens main=garage@<origin/main 97304fb7 copy> --rounds 2 --rebuilds 3`

- Hardware: Apple M3 Max, ANGLE Metal, Chrome 156.0.8078.4.
- Profile: 1280x800 at DPR 1, Smoothest, 15:00, vsync off, 180 frames per view.
- Rounds were interleaved. Load average was 27–53 during the run (1-minute).
- Receipt: [resources-2026-10-18.json](../../design/garden-campus/finish/resources-2026-10-18.json).

Draw calls, triangles and programs are deterministic for a view. Frame times are this host
under load: medians over two rounds, with vsync off.

| View | garage | gardens | origin/main | gardens vs garage |
| --- | --- | --- | --- | --- |
| Steady, street under B12: calls / triangles | 1042 / 3.53M | 1150 / 4.16M | 1042 / 3.53M | +108 (+10%) / +634k (+18%) |
| Southeast aerial (worst skyline + both bridges): calls / triangles | 1355 / 4.02M | 1394 / 4.14M | 1355 / 4.02M | +39 (+3%) / +127k (+3%) |
| Office roof outlook: calls / triangles | 1040 / 3.23M | 1094 / 3.44M | 1040 / 3.23M | +54 (+5%) / +206k (+6%) |
| Live GL programs at steady state (rounds) | 140–142 | 143–147 | 141–143 | +3 to +5 |
| GPU geometries / textures at steady state | 545 / 181 | 557 / 181 | 544–545 / 175–181 | +12 / 0 |
| Steady frame p50 / p95, ms (round 0, round 1) | 17.4/34.6, 15.1/33.0 | 17.2/34.9, 16.4/34.0 | 14.7/29.6, 15.4/30.8 | within this host's spread |
| Aerial frame p50 / p95, ms | 19.3/34.1, 15.9/33.7 | 18.1/34.4, 18.1/34.8 | 16.7/34.7, 16.4/33.8 | within this host's spread |
| First entry: ready / arrival p50 / p95 (round 0) | 4.1 s / 16.9 / 34.8 ms | 5.1 s / 20.6 / 41.8 ms | 3.6 s / 15.9 / 41.7 ms | +1 s ready, +7 ms p95 |

Rebuilds, read at the aerial view after each Reload:

| Arm | Geometries | Textures | Programs |
| --- | --- | --- | --- |
| garage | 547 → 565 → 565 → 565 | 181 → 191 → 191 → 191 | 142 → 141 → 141 → 141 |
| gardens | 559 → 569 → 569 → 569 | 181 → 191 → 191 → 191 | 147 → 146 → 146 → 146 |
| origin/main | 547 → 565 → 565 → 565 | same as garage | same as garage |

- The one-time step after the first rebuild exists without the campus, on origin/main too.
- After that step, no arm grows.

Gardens' second first entry is excluded from the first-entry row. Its readiness fired before
the district uploaded: 0.1 MiB uploaded and 16 programs at ready.

Proposed budgets, from these measurements. The campus may add, against the garage at the same
view:
- at most +12% draw calls and +20% triangles at street level beside the towers;
- at most +5% calls and triangles in the whole-campus aerial;
- at most +6 live programs;
- no growth across rebuilds beyond the existing district step.

No universal frame claim: frame differences at this load are inside the host's own spread.
Mobile and target-GPU budgets are unmeasured.

### Matched views

`node preview/e2e/garden-campus-render-views.mjs both`

- Twelve cameras: the contract's five plus seven finish cameras, covering both long sides, the
  south office approach, under each skywalk, the Floor 4 gallery, a roof garden and a terrace.
- 15:00 and 18:30, garage and gardens.
- The campus glow read 0.8 by day and 2.08 at 18:30 in the page, which confirms the main.js
  relight hook.
- Contact sheets: [day](../../design/garden-campus/finish/sheet-day.jpg) and
  [dusk](../../design/garden-campus/finish/sheet-dusk.jpg).

## Gaps and owners

- Occupied-suite views and occupied-route checks need #508's circulation and #510's fit-out
  merged into one candidate (#512).
- Seats and tables are collision only until #510 makes them usable.
- Flight volumes do not include terrace troughs, canopies or green walls: a flyer can pass
  through them. They are above body clearance and outside every walk surface.

## Next action

Delivered. #528 merged at 2026-10-19T03:45:20Z as `4eca5153` (river-oaks-b5, from head
`c358c573`, 16/16 hosted). The #512 candidate integrated it, with the occupied-suite views
and route checks (#525 → `7c10f418`). The local worktree is retired, with `.runtime`,
`output/playwright` and `data/generated` archived.
