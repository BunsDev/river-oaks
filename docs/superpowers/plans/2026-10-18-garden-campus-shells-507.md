# Garden Offices #507: the campus replaces the garage, behind a district revision

Owner: `claude:river-oaks-95 (5bececff)`, task `garden-campus-shells-507`, branch
`feat/garden-campus-shells-507-20261018`, worktree `river-oaks-garden-campus-507-20261018`.
Parent tracker: #505 (`docs/superpowers/plans/2026-10-18-garden-campus-505.md`).

## Objective

Replace the parking garage `osm-way-625330790` in the real district with #506's three
6/7/6 tower shells and a connected public ground, using #506 as the only source of
geometry. Ship it as an explicit, server-selected district revision. The garage stays
the default and the rollback, so merging changes nothing until an operator selects the
campus.

## Inputs (by revision)

- #506 contract `shared/garden-campus-layout.js`, merged in at `0e46ec36` (PR #519 head is
  `82028fc8`, no export or id change since). Versions `{schema:1, layout:'3.0', floors:1,
  support:1, units:1}`.
- Base: origin/main `7ed86fc5`.

## Design

- **Revision gate.** `RIVER_OAKS_DISTRICT_REVISION` takes `river-oaks-garage-1`, the
  default, or `river-oaks-gardens-3`. Unset or unknown keeps the garage and logs
  `district_revision_ignored`. Both `server/town.js` and `server/redis-backend.js` read it
  and pass it to `loadDistrictData({districtRevision})`.
- **Overlay.** `attachGardenCampus(world)` in `preview/src/garden-campus-district.js` is
  pure and applied by both client and server. It first runs
  `validateGardenCampus(layout,{district})` and refuses any district the contract rejects
  (ring, datum or lanes). It then:
  - removes the garage building and its exact `collisionPolygons` ring;
  - adds `campus` buildings for T1/T2/T3, the café and the pergola (flight clearance and
    the map), with tower heights at the declared silhouette cap;
  - adds collision for the tower ground plates, the café, the pool and #506's eleven
    pergola posts;
  - records provenance in `world.gardenCampus.replaced`.
- **Ground.** `groundSurfaceHeight` returns one platform height (base 18.25939 m) for every
  parcel point, ahead of registered meshes, so client and server agree. The server
  registers no ground meshes; without this hook its street ground under B12 would be
  terrain + 0.2 = 17.88 m. Nothing elevated is ever ground. The skywalks are flight
  volumes only (`campusFlightVolumes`).
- **Ground rooms.** The F1 halls and the café are street walk-in rooms
  (`planCampusRooms`), in the store-room shape, entered through their contract east doors.
  The lift and stair shafts are obstacles; the core lobby is walkable. They have no staff.
  `campusDoorSites` puts them in the directory and in F-key door stepping; server travel
  accepts them like venue rooms.
- **Client.** The default world fetches `/api/world-data?world=river-oaks` with a 5 s
  timeout. The answer carries `districtRevision` only when the town serves the campus.
  Snapshots carry the same field (standalone, Redis view). If the page and the town
  disagree, the page reloads once; a second mismatch closes 4000, which shows "Refresh".
  An unknown revision string fails the load.
- **Rendering.** `preview/src/garden-campus.js` builds one rotated root in campus metres
  with an instanced draw per finish, all from contract data:
  - slabs per storey, inset glazing with bronze mullions;
  - openings for the four skywalk portals (3 m × 3.2 m), terrace doors and lobby doors;
  - cores to the headhouse tops, with headhouse doors;
  - terrace decks and glass guards, stone roof parapets and the declared roof beds;
  - skywalk decks, edge-zone planters and 1.25 m glass guards;
  - the café, pergola slats and posts, the raised pool, paths and the lawn platform.
  B12's deck stops at T2's z 13 terrace, which is its deck there. A render-only terrain
  mask (`campusGroundCutout`) keeps rising terrain from showing through the platform.
  Street sidewalks, benches and fountains are not generated on the parcel.

## Files owned

`preview/src/garden-campus-district.js` and `preview/src/garden-campus.js` are new.
`preview/tests/garden-campus-district.test.js` and
`server/tests/garden-campus-district.test.js` are new. Small hooks in:

- `preview/src/walking.js`, `world-surface.js`, `store-rooms.js`, `district.js`,
  `district-fantasy.js`, `debug-geometry.js`, `walking-ui.js`, `main.js` (district load,
  street space, ground clip, directory) and `multiplayer-client.js` (revision check);
- `server/district-data.js`, `town.js`, `redis-backend.js`, `world.js` (API field and
  travel), `app.js`, `distributed-app.js` and `redis-room.js`.

## Evidence (local, not yet hosted)

- Garage fingerprint `5fc38cbe…38b80`, identical on main `153471bc` and on this branch's
  default. Campus fingerprint `29c1c02a…74389` (contract `0e46ec36`).
- `node --test preview/tests/garden-campus-district.test.js`: 10/10.
- `REDIS_URL=redis://127.0.0.1:16507 node --test server/tests/garden-campus-district.test.js`:
  10/10, Redis gateway included, 0 skipped.
- Mutation checks: removing the facade openings fails the render test. Leaving the garage
  collision ring in place fails 6 tests across both files.
- Focused existing suites (debug-geometry, district, garden-campus-layout, places,
  room-ground-clip, store-rooms, venue-rooms, walking, world-surface): 58/58.

## Gaps and owners

- Upper-level movement, portals and gallery rendering: #508, river-oaks-c5.
- Fit-out, signage and useful public program inside the halls: #510.
- Finishes, planting, lighting and resource budgets: #511.
- The garage → campus checkpoint migration and rollback matrix: #512. Today a garage
  checkpoint fails closed against the campus, by test.
- Browser/visual evidence on the actual district with the campus revision: still to
  capture.

## Next action

Full preview/server suites, then a signed commit, then send the SHA to river-oaks-c5 for
#508. After that, browser capture with `RIVER_OAKS_DISTRICT_REVISION=river-oaks-gardens-3`,
the core verify, push and draft PR.
