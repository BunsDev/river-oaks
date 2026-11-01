# Five Rooms Landscape (#840): courts, paving, planting and ground from the #838 contract

Task `five-rooms-landscape-courts-825-20261101`, branch `feat/five-rooms-landscape-courts-825-20261101`.
It is stacked on #849 (`feat/five-rooms-layout-825-20261101` at `49862e17`) in worktree
`../river-oaks-five-rooms-landscape-courts-825`. The street-tree increment is a separate PR, #848
(task `five-rooms-landscape-825-20261101`).

## Objective

Build the entrance paving, the Shade Garden court, the planting beds and the Ribbon's planted edge
from the Five Rooms contract (`expandFiveRooms(config/ribbon/five-rooms.json, site)`). Nothing is
hand-placed. Prove with unit tests that:

- nothing planted enters a door, a seat's access zone, a step-free route, a no-go zone, a camera
  corridor, a walk or a post;
- court floors lie in their venue;
- the ground pieces follow `groundSurfaceHeight`.

## Files

- `preview/src/five-rooms/landscape.js` (new):
  - `fiveRoomsLandscapePlan` (data)
  - `buildFiveRoomsLandscape` (three.js group)
  - `fiveRoomsLandscapeAppliesTo` (`pink-jet-age` only)
  - `FIVE_ROOMS_LANDSCAPE_FLAGS`, `FIVE_ROOMS_LANDSCAPE_RULES`
- `preview/src/five-rooms/ground.js` (new): `fiveRoomsGroundPieces` (data) and
  `buildFiveRoomsGround`, a single mesh in the shape `registerGroundSurfaces` reads.
- `preview/tests/five-rooms-landscape.test.js` (new).
- This ledger.

Not touched: `main.js`, `walking.js`, `server/*`, `config/ribbon/*`, `district.json`,
`street-furniture.js` and the contract module. Nothing imports the new modules yet; Integration
(#841) wires them in. Classic is unchanged byte for byte because no loaded module changed, and
`fiveRoomsLandscapeAppliesTo` is false for classic, for an unset finish and for a world without
the host buildings.

## What is built

- **Entrance aprons (always, under pink).** There are five. Each is the hull of the entrance's
  doorway zone and its link reach, which is public ground between the walk edge and the door.
- **Shade Garden court** (`court:shade-garden`, the venue's `interior.floor`). It sits behind
  `shadeGardenOpenCourt: false` and is pending **Val's decision 6**. I recorded the decision and
  did not take it.
- **Court bed.** It comes from the venue's `bed` attachment and is planted in the court floor (no
  shell), so its top (19.36 m) stays below the interior camera corridor (19.571 m). It sits behind
  the same flag.
- **Ribbon planted edge.** A lane-planter unit is placed every 2 modules, 0.1 m beyond the edge
  posts, on the side no link uses (both sides of `link-studios`). #838 marks all three segments
  `blocked`, so the edge sits behind `blockedSegmentPlanting: false`.
- **Beds** reuse the lane-planter composition (`buildPlanterPlanting`). No new assets.

Plan stats:

- Default flags: 5 paving, 0 courts, 0 beds, 8 dropped, 35 pending.
- Both flags on: 5 paving, 1 court, 34 beds, 8 dropped, 0 pending.

Beds the District displaces, by name:

| Candidate | Displaced by |
|---|---|
| bed:spine:edge:002:l, 004:l | no-go road-625330795-8 (side-lane mouth, #827 finding) |
| bed:spine:edge:006:l | no-go tree-pit-103 |
| bed:spine:edge:008:l | no-go tree-pit-76 |
| bed:spine:edge:018:l | seat-access bench-5, no-go bin-3 |
| bed:spine:edge:026:l | no-go tree-pit-126 |
| bed:south:edge:012:l | no-go tree-pit-3 |
| bed:south:edge:016:l | no-go lamp-11 |

## Ground

Each apron and the court are fanned into triangles. Every triangle is split on a grid no coarser
than 0.5 m, and every vertex is set at `groundAt` + 0.008 m. Measured: corners are within 0.8 cm
and the worst triangle centroid is 0.85 cm from `groundSurfaceHeight`. All triangles face up. The
drawn mesh and the registered mesh are the same single mesh.

In node, `groundSurfaceHeight` falls back to terrain, because no surfaces are registered. In the
client, Integration must build with the live `groundAt` after the District's supports are
registered.

## Draw calls

Measured in node:

- Default flags: 1 draw call (the paving).
- Both flags on: 63 draw calls (paving 1, bed shells 1, mulch 1, and 60 procedural planting
  batches, which `buildProceduralPlants` batches per part per 24 m cell along about 200 m). After
  the GLB templates load, `buildPlanterPlanting` adds its boxwood and grass batches. That part
  needs a browser and was not measured.

## Trees

Every crown that passes through a segment's canopy is named in that segment's blocked record:

- spine: tree-104, 127, 153, 37, 77, 84, 85
- south: tree-108
- link-studios: tree-118, 48

No bed stands under a crown low enough to reach its planting. #848 keeps the spine's per-tree gaps.
Its check can import #838's rules once #838 is on #848's base (#828). #849 currently sits on #827,
not #828.

## Checks and results

- `node --test preview/tests/five-rooms-landscape.test.js preview/tests/five-rooms-layout.test.js preview/tests/ribbon-route-district.test.js preview/tests/ribbon-layout.test.js`:
  33 tests, 33 pass, 0 fail, 0 skipped.
- Mutations in the test:
  - moving the bed attachment 0.5 m moves the bed 0.5 m;
  - a bed attachment moved to 0.3 m inside the Shade Garden door is dropped as
    `doorway door-entrance-shade-garden…`;
  - lowering the interior camera corridor 0.8 m drops the court bed as
    `camera camera:shade-garden:interior`.
- `pnpm run verify` (core): not run; 1-minute load was 24.49 at 04:36 local (gate below 8). Pending.

## Gaps

- No browser frame, depth journey under pink, or WebKit run. Nothing is wired into the scene until
  Integration (#841).
- Draw calls with the model batches loaded are not measured.
- **Switch to v2 fields when river-oaks-c2 publishes five-rooms-v2.** River-oaks-c2 accepted both
  requests on 2026-11-01. Until v2, the defaults derived here are the intended behaviour:
  - Per-segment `planting: { side, every }` replaces the derived side. The derived side is the one
    opposite the link side, or both sides when a segment has no side link.
  - `bed` attachments get `size: [along, across]`, which replaces the 1.5 x 0.62 m planter unit.
- Lane-end crossing, confirmed by river-oaks-c2: only `link:studios-overlook` may cross road pieces,
  and only the pieces listed in `links[].crossesLaneEnd`. Today that is `road-625330795-0`. The
  test asserts that every apron crosses only listed pieces, and that `paving:studios-overlook`
  stays inside its reach plus those pieces.
- Server movement and support were not exercised. `ground.js` only provides the triangles.
- `docs/design/five-rooms/landscape.md` (named in #840) was not written in this increment.

## Decisions for Val

1. **Decision 6.** May the Shade Garden open the Hermès bay as a court inside its mapped building?
   If yes, set `shadeGardenOpenCourt: true`.
2. **Planted edge.** It stays off until #838's segments clear (street trees, the side-lane mouth,
   bench-5, the REF-HW-01 bed), or until Val accepts planting along a blocked segment
   (`blockedSegmentPlanting`).

## Next step

Run core verify. Wait for river-oaks-c2's reply on the three contract requests. Then hand to
Integration (#841): register `buildFiveRoomsGround` with the District supports and add the group
under pink.
