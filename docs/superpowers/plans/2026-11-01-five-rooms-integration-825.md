# #841 (#825 M1) Five Rooms integration: ledger

- Task: `five-rooms-integration-825-20261101`, owner `claude:river-oaks-33 (0fedea)`.
- Branch `feat/five-rooms-integration-825-20261101`, worktree `../river-oaks-five-rooms-integration-825`.
- Stacked on #860 (`feat/five-rooms-shells-825-20261101`, #839) at `ddf3f6a4`, which sits on #849 + #828.
- Landscape (#851) is **not merged yet**: on `five-rooms-v2` its own tests fail 3 of 9. They pin v1
  ids and dropped-bed lists, which the #840 owner's next action re-reads. Integration never edits
  its files. It merges #851 once that branch is on v2 and wires `buildFiveRoomsLandscape` and
  `buildFiveRoomsGround` (ground registration, court support) then.

## Val's decisions (2026-11-01, this session)

1. **Bays stay visual until decision 5.** Solid parts are the Ribbon posts and the shell parts that
   stand in front of the mapped walls. Each frontage keeps gaps at the contract entrance and at the
   old tenant door, and every store room stays as it is.
2. **Collision is world-level.** The same solids apply for every finish, on client and server (kit
   rule: a finish never changes collision). Classic players meet undrawn posts.

## Changed behaviour

- `preview/src/main.js` (District build section only):
  - Under `pink-jet-age` it builds the finished Ribbon (`buildRibbon`, replacing the graybox draw)
    and the five shells (`buildFiveRoomsShells`).
  - `updateAtmosphere` relights both (`twilight`), and world teardown disposes them.
  - `__riverSpatialStream()` reports `finish.fiveRooms`.
  - The shells are built with `interiors: false` while the bays' store rooms stay (decision 5): the
    envelope's floor, ceiling and walls lay on the rooms' (18 depth pairs under pink).
  - Classic builds neither.
- `preview/src/five-rooms/solids.js` (new, renderer-free) provides the discs:
  - Ribbon posts: r 0.21 m, height post + 0.4.
  - Each bay's frontage strip: r 0.2 at 0.45 m out, every 0.3 m, with gaps at the entrance and the
    old door.
  - Starlight arch feet, Shade Garden hoop legs and the four Studios hoop legs.
  - A world without the District's central lane gets none.
- `preview/src/walking.js`:
  - Adds those discs to the prop boxes (walkers and low flight), for client and server alike.
  - `createWalkingEnvironment(..., { fiveRooms: false })` gives the environment as it was before,
    for restore.
- `server/world.js` restore: a ground player saved where a new solid now stands, on ground that was
  free before, is moved to the nearest free ground. Every other invalid position still fails
  closed. The world fingerprint does not change, so no district migration runs.
- `preview/src/bike-racks.js`: the Amorino rack moved to (-2775.5, -1203), parking west.
  - Its bikes had parked on the Ribbon's west post line.
  - The curb-to-post footway (~1.75 m) cannot hold a rack (~2.9 m).
  - The new spot is the nearest of a 0.5 m search grid that keeps every bike-racks.test.js rule and
    stays 1 m off the Ribbon walk. The id is kept.
- From #860, merged here:
  - `ddf3f6a4`: the Shade Garden hoop is widened to door + 1.5 m, so its legs clear the Hermès door,
    which stays in use.
  - `1127046a`: `buildFiveRoomsShells(..., { interiors })`.
  - `115b5752`: the Starlight frontage moves 4 cm proud of the IPIC stone facade, which was 49.7 mm
    behind it.
- `preview/tests/fixtures/district-routes-main.json`: six cases recaptured with a `recaptured2` note.
  - Two resident routes now return null: their stop is 0.31 m from a post.
  - Two resident routes and two police routes are each one waypoint shorter.
  - 54 cases and the world digests are unchanged.

## Acceptance against #841

| Item | Evidence | State |
|---|---|---|
| No-flag startup builds shells, Ribbon, landscape; classic none | main.js wiring (pink only); landscape waits on #851 v2 | shells + Ribbon done; landscape pending |
| Posts and shell walls solid; Ribbon walk spawn→IPIC clear for the 1.01 m body; court floors support standing | `five-rooms-integration.test.js` (walk sampled at 0.2 m, centre and body edges), `world.test.js` "Five Rooms posts and frontages are solid" | posts/frontages done; courts wait on #851 |
| Pre-change checkpoint loads with every player on valid ground | `world.test.js` "a town saved before the Five Rooms solids…" | done (players); residents are not relocated (see gaps) |
| Camera: no clip, `route-clearance.js` passes | `preview/tests/route-clearance.test.js` in core; the browser walk (world-streaming) not run | unit only |
| Depth under pink: 0 new pairs | `RIVER_OAKS_FINISH=pink-jet-age node preview/e2e/experience-runner.js depth-layers` passed (third run) | done |
| Teardown: resource counts return to baseline | dispose wired; browser inventory not run | pending |
| Core verify, server tests with isolated Redis, hosted green | core and Redis passed (Checks); hosted pending | core + Redis done |

## Checks

| When | Command | Result |
|---|---|---|
| 2026-11-01 | `node --test preview/tests/five-rooms-integration.test.js` | 5/5 |
| 2026-11-01 | `node --test --test-name-pattern="Five Rooms" server/tests/world.test.js` | 2/2 |
| 2026-11-01 | `node --test preview/tests/bike-racks.test.js server/tests/cycling.test.js` | 15/15 |
| 2026-11-01 | `node --test preview/tests/resident-locations.test.js` | 10/10 (after recapture) |
| 2026-11-01 | full preview suite before the fixes | 8 failures, all fixed above (rack ×1, Hermès walk-in ×6, routes ×1) |
| 2026-11-01 ~22:05Z | depth-layers under pink, run 1 (`9e618462` tree) | failed: 18 new pairs, the shell envelope against the store-room interiors (brass, leather, textile) |
| 2026-11-01 ~22:12Z | `REDIS_URL=<own redis-server :6487> pnpm run test:server` (`8e55a65a` code) | 1440/1440, 0 skipped |
| 2026-11-01 22:20Z | depth-layers under pink, run 2 (with `interiors: false`) | failed: 1 pair, Starlight ivory against the IPIC grey stone, 49.7 mm |
| 2026-11-01 22:23-22:28Z | `pnpm run verify` (core; tree = `115b5752` shells + this main.js) | passed: node 307/307, preview 5153 of 5185, server 1113 of 1398, 127 of 132; 0 failures |
| 2026-11-01 22:29Z | depth-layers under pink, run 3 (same tree) | **passed**; the receipt is kept in `.runtime/841/experience-depth-pink.json` and `data/reports/experience.json` is restored (the run rewrites it to one journey) |
| 2026-11-01 ~22:04-22:09Z | `pnpm run verify` (core, `ddf3f6a4` plus these changes, load ~7-10) | passed: node 307/307, preview 5151 of 5183 (32 skipped), server 1113 of 1398 (285 skipped: Redis/browser/live), 127 of 132; build ok; 0 failures |

## Gaps

- A District resident stop at (-2759.18, -1215.19) is 0.31 m from a Ribbon post, so residents
  cannot reach it. The stop or the post must move (request to #838 / Ribbon route).
- Residents saved standing on a new solid are not relocated on restore (players are).
- Live checks not yet run:
  - render budget under pink: `render-budget.js` loads the default (classic) finish and takes no
    finish option, so it needs a journey change;
  - the browser teardown inventory;
  - matched noon/night captures;
  - the world-streaming route walk.
- When decision 5 retires the rooms, interiors return, and the envelope floor then lies 4 mm on the
  building's facade-floor (`five-rooms-shells.test.js` notes this).

## Next step

Draft #862 is up (head `9e618462`, base #860), and #851 has a coordination comment. Next:

- hosted checks;
- browser route-clearance, depth journey and render budget from a detached snapshot;
- isolated-Redis server tests;
- the #851 merge once it is on v2.

Landing waits for Val.
