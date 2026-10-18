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
  default. Campus fingerprint `a9b7b4cc…6d84d455` (contract `0e46ec36`, with full replaced-building provenance for detachGardenCampus).
- `node --test preview/tests/garden-campus-district.test.js`: 10/10.
- `REDIS_URL=redis://127.0.0.1:16507 node --test server/tests/garden-campus-district.test.js`:
  10/10, Redis gateway included, 0 skipped.
- Mutation checks: removing the facade openings fails the render test. Leaving the garage
  collision ring in place fails 6 tests across both files.
- Focused existing suites (debug-geometry, district, garden-campus-layout, places,
  room-ground-clip, store-rooms, venue-rooms, walking, world-surface): 58/58.

## Browser views (local, at `0eb42839`)

`node preview/e2e/garden-campus-views.mjs both` uses #506's five contract cameras: garage
(default) against the campus revision on this Mac (Apple M3 Max, ANGLE Metal, 1280×800,
`smooth` preset, sun hour 15). Load was about 31–35 (1 min) and 72–92 (5/15 min).
Screenshots are in `output/playwright/garden-campus-views/`; they are local and not
committed.

What the screenshots show:

- **Aerial:** the garage is gone. Three stepped towers stand in its parcel with terrace
  decks and guards, headhouses, the green-roofed café, the pool, paths and the planted
  platform. The neighbouring buildings and streets are unchanged.
- **Street under B12:** the 23 m skywalk spans above the P2 cross-route from the T1 to the
  T2 facade, and the street walker's camera is on the ground.
- **Floor 4 on B12:** the deck runs between planted edge zones and glass guards to T2's
  open 3 m south portal.

| Camera | Revision | Draw calls | Triangles |
| --- | --- | --- | --- |
| 01-southeast-aerial | garage | 1355 | 4017928 |
| 02-street-under-b12 | garage | 1042 | 3530544 |
| 03-floor4-bridge-walk | garage | 562 | 2337989 |
| 04-northwest-high-oblique | garage | 1232 | 3693091 |
| 05-office-terrace-outlook | garage | 1022 | 3230036 |
| 01-southeast-aerial | gardens | 1367 | 3988312 |
| 02-street-under-b12 | gardens | 1059 | 3513484 |
| 03-floor4-bridge-walk | gardens | 579 | 2320929 |
| 04-northwest-high-oblique | gardens | 1244 | 3663475 |
| 05-office-terrace-outlook | gardens | 1040 | 3212988 |

Every view adds 12–18 draw calls and about 17,000–30,000 fewer triangles than the garage.
The garage's roof plant and mass go, and the instanced shells come in.

## Hosted CI

- PR #523 at `0eb42839`: every reported check passed (read over REST at about 17:05Z).
  That covers the aggregate `preview`, `preview checks` (pnpm test and the Redis server
  suite), `preview experience (places)`, `preview experience (streets)`,
  `preview shared (development)`, `preview shared (required)`,
  `preview shared (worlds-and-creator)`, `verify (3.11)`, `verify (3.13)` and
  `dependency-review`.
- The penthouse idle-slice test that failed locally at load 145 or more passes there.

## Found downstream

- **Halls and café had no room summary (found by #510's hosted journey, run 39154402265).**
  `describeInterior` in `main.js` reads `summary.label` and joins `summary.highlights`
  whenever the Map selects a destination, and `enterStore` selects first. For a campus room
  that threw, so "Step inside" never sent its travel and the walking HUD showed only "Could
  not step through". The Map's destination list failed the same way for a campus hall.
  `groundRoom` now carries `summary` like the axe room (`axe-room-plan.js`). Regression:
  "every hall and the café describe themselves like any walk-in room", which fails on
  `40aec12a`. With an isolated Redis, the campus suites plus `shared-population`,
  `store-rooms`, `venue-rooms` and `walking` pass 60/60. Rooms are derived, so the world
  fingerprint is unchanged.

## Gaps and owners

- Upper-level movement, portals and gallery rendering: #508, river-oaks-c5.
- Fit-out, signage and useful public program inside the halls: #510.
- Finishes, planting, lighting and resource budgets: #511.
- The garage → campus checkpoint migration and rollback matrix: #512. Today a garage
  checkpoint fails closed against the campus, by test.
- Frame timing per view: the first capture's script read the render audit's records
  wrongly. It is fixed for the next run; frame budgets are #511's measurement.

## Next action

Full preview/server suites, then a signed commit, then send the SHA to river-oaks-c5 for
#508. After that, browser capture with `RIVER_OAKS_DISTRICT_REVISION=river-oaks-gardens-3`,
the core verify, push and draft PR.
