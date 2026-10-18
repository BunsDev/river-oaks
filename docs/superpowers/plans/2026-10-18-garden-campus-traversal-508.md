# #508 Garden campus: authoritative public traversal

## Objective

Make the whole public campus traversable on the server's authority, using #506's support
model and #507's shells:
- lifts and stairs;
- six terraces and three roof gardens;
- a continuous Floor 4 route through both skywalks and all three buildings.

The same x/z must hold a ground walker and a Floor 4 visitor safely. No teleport,
highest-ground hack or visual-only platform is allowed (#508 acceptance).

## Ownership

- **Task:** `garden-campus-traversal-508`.
- **Owner:** `claude:river-oaks-95 (5bececff)` since 2026-10-18 ~19:55Z. Val chose "Take #508
  now" in river-oaks-95's session. river-oaks-c5 (`1e70822d`, the previous owner) stood down
  having pushed no code, and handed over this ledger draft and a machinery map (summarised
  below).
- **Branch:** `feat/garden-campus-traversal-508-20261018` in
  `../river-oaks-garden-campus-508-20261018`, from #507 `a6dbb661` (signed). That carries #506
  layout 3.2 (`3fac6c32`), main `97304fb7` and #507's walls and suite doors
  (`shared/garden-campus-partitions.js`).
- **This task covers:**
  - the server authority and per-level walking environments for `garden-campus/l0..l7`;
  - lift and stair portal transitions;
  - continuous deck walking;
  - the client level hooks;
  - the gallery, landing and core-lobby finishes (floors, ceilings, lighting).
- **Slice (b)**, the two-player browser journey and matched views, is the same owner, on
  `test/garden-campus-traversal-journey-508-20261018`.
- **#509** (PR #522) seams: `world.campusSuiteAccess(userId, unitId)`, `campusAccessEnded`,
  `campusLeaseUnits()`.
- **#510** (PR #527) supplies the seat rules (`shared/garden-campus-seats.js`) and the fit-out
  (`shared/garden-campus-fitout.js`).

## Model (from c5's machinery map, extended)

1. **One shared plan.** `campusInteriorPlan(world)` returns
   `{buildingId:'garden-campus', campus:true, levels}`. Each level has its id, index,
   `floorElevation = base + z` and portals in source coordinates, with `toLevelId` and
   `toPortal`. It is merged into `world.js` `interiorLevels`, so `assignedUpper`,
   `environmentForLevel`, voice, the command fence and restore all extend in one place. It
   stays out of `world.buildingInteriors`, which would render it, throw in `storeRoomsFor`
   and change the fingerprint.
2. **One room per upper level**, a generated-plan room, so `walking.js` uses `containsAccess`,
   `blocks` and `floor` unchanged.
   - **Support:** `campusSupportAt` at the centre, public or private-suite.
   - **Blocking:** within the body radius of any of these:
     - the level's contract obstacles (shafts, guards, planters, furniture, headhouses);
     - full-height partition walls;
     - facade glass (plate edges minus portals and terrace doors);
     - service rooms;
     - registered obstacles (`registerCampusLevelObstacles`).
   - A closure test proves every edge of walkable support is closed, which is what refuses
     off-edge walking.
3. **Suites** are physically reachable only through their doors. `world.js` refuses each
   step onto private-suite floor without `campusSuiteAccess` (`private_suite`), as it does
   for private homes. The client can gate its own prediction through `setCampusSuiteGate`;
   the server never sets it.
4. **Ground seam.** The tower halls carry `planId: 'garden-campus/l0'`, so the existing source
   lookup finds l0 and its lift and stair portals. Arriving at l0 writes `null`/`null`, as
   in any street room.
5. **`changeInteriorLevel`** accepts `lift` as well as `stairs`, and pairs by `toPortal` when
   present: the two roof down-portals share one headhouse landing.

## Seams frozen for #510

- `registerCampusLevelObstacles(provider)`, `registerCampusOccupancy(provider)` and
  `registerCampusLevelAction('sit'|'stand', handler)`.
- `isCampusSeated(player)`, consulted before moves and portals.
- `releaseCampusSeat(player, reason)`.
- `player.campusSeat` rides checkpoint v13.
- Persisted level state is `player.levelId`/`player.buildingId` only.

## Reference

- `server/tests/garden-campus-support.test.js` (#506): its walks and refusal names.
- c5's map (`i508-machinery-map.md`, copied into the evidence notes below) names
  `world.js:679` (stairs only), `:682-684` (position pairing, same plan),
  `walking.js:37` (one room per level), `town-snapshot.js:22` (levelId prefix) and restore
  (throws on unsupported positions).

## Built (first push)

- `preview/src/garden-campus-levels.js` (new): `campusInteriorPlan`, `campusLevelRoom`,
  `campusFacadeGlass`, `interiorLevelFor`, `registerCampusLevelObstacles` and
  `setCampusSuiteGate`.
- `preview/src/store-rooms.js`: `interiorLevelRoomsFor` returns the campus level room.
- `preview/src/garden-campus-district.js`: the tower halls carry `planId: 'garden-campus/l0'`.
- **`server/world.js`:**
  - campus levels join `interiorLevels`;
  - `changeInteriorLevel` takes lifts, pairs by `toPortal` and returns `null`/`null` at the
    street;
  - an unknown portal is `invalid_level_portal` (it was `level_portal_out_of_reach`; no test
    relied on that);
  - every step onto suite floor needs `campusAdmission(userId, unitId)`, which fails closed
    by default (`private_suite`);
  - `campus` commands are allowed upstairs.
- `preview/src/walking-ui.js`: lift and stair prompts in the tower halls and at every core
  ("Take the lift up", "Go down one level"); server poses resolve campus levels.

## Evidence

- `server/tests/garden-campus-traversal.test.js`: 5/5, on the real world authority.
  - The full route: T1's lift to Floor 4, the T1 gallery, B12, T2's terrace and gallery, B23,
    T3's gallery, then T3's stairs down to the street in its hall.
  - A walker under B12 and a visitor on it at one x/z (BASE and BASE+13).
  - Refusals: forged level, height, late street pose, deck edge, flight, travel upstairs,
    portal reach and identity, a suite wall, and a suite door without admission.
  - Admission into exactly one suite through its door.
  - An occupied landing arrives beside its occupant; checkpoint and restore keep level and
    place.
- `preview/tests/garden-campus-levels.test.js`: 5/5.
  - The plan pairs portals both ways.
  - No free body overhangs an edge or a service room on any upper level (0.5 m grid,
    12-point body ring). A one-off 0.25 m probe found 0 overhangs in 71,025 free points.
  - Floor 4 is one walk from T1's lift to T3, and every public surface is reached from its
    level's cores.
  - The glass is open at every portal and terrace door.
  - Registered obstacles block only their own level.
- `server/tests/garden-campus-traversal-transport.test.js`: memory and Redis (isolated
  `REDIS_URL`), real ticket and WebSocket gates.
  - Both clients see the walker and the visitor at one x/z and their own heights.
  - A forged deck pose is refused.
  - A reconnect resumes on Floor 4.
- **Regression.** These pass 154/154:
  - the garden-campus suites;
  - creator four-level and building interiors;
  - the gallery levels and transition;
  - generated private level access;
  - interactions, world and world interactions;
  - building interior levels and plans, store rooms, walking, and studio interior levels.

  World migration, redis-room, office lifecycle, hardening, character world, IPIC, town
  worlds and world gateway pass 49/49.

## Next action

1. Push and open the draft PR.
2. Slice (b): the two-player browser journey against this protocol.
3. Gallery, landing and core-lobby finishes (ceilings, lighting).
4. #510 suite seats through the seat hooks, and #509 admission wired in the candidate.
