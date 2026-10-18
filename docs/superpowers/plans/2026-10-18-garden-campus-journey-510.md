# Garden Offices #510: rentable suites, useful shared spaces and the private-desk journey

Owner: `claude:river-oaks-95 (5bececff)`, task `garden-campus-journey-510`, branch
`feat/garden-campus-journey-510-20261018`, worktree `river-oaks-garden-campus-510-20261018`.
Parent: #505.

## Inputs (by revision)

- #507 `5a572ea4`: overlay, street rooms, shells.
- #509 PR #522 head `38f8de52`, merged in. Lease commands `{type:'campus', action}`, the
  `CAMPUS_LEASE_*` contract, `world.campusSuiteAccess` and `campusAccess`, and checkpoint
  v13 `payload.campus`.
- #508: not yet. river-oaks-c5 will provide `registerCampusLevelObstacles`,
  `registerCampusOccupancy`, `registerCampusLevelAction('sit'|'stand')`, `isCampusSeated`,
  `releaseCampusSeat` and the private-suite seam through `campusSuiteAccess` and the
  suite-door openings.

## Built so far

- `shared/garden-campus-fitout.js` (`FITOUT_VERSION` 1), pure.
  - **Suites:** every one of the 43 suites has a primary private desk against the far
    wall, 88 desks in all. 14 deep suites trade an end desk for a two-seat meeting table:
    116 workstation seats.
  - **Shallow suites (under 5.58 m deep)** take one desk on each side of the door's
    axis, because a taken seat's 2.158 m envelope spans their depth.
  - **Validator:** furniture stays inside its suite, out of keepClear and away from door
    thresholds. Each stand point sits on its suite's private support, with the turning
    body clear of walls and furniture. Every stand point is reachable from the door, by a
    0.1 m flood fill, with every other seat of the suite taken. Meeting candidates that
    fail are dropped.
  - **Halls and café:** work tables, a reception counter, workbenches with stools and café
    tables are room obstacles, with 38 seats. They keep the door-to-lobby route and the
    core clear. Every seat is free for the 0.35 m walking body, and its approach is clear.
- **Public workstations.** The hall and café chairs are street seat sites
  (`campusSeatSites` in `benchSeats`), so the existing sit and stand authority applies and
  residents share them. While a player sits at a workstation the world publishes
  `campusWorkstation: true`. The office desk routes admit that player's own desk in that
  same session, in both transports. Standing up, another session or the garage revision
  refuses it.

## Evidence

- `node --test preview/tests/garden-campus-fitout.test.js`: 4/4, including mutations
  (spine, cramped stand, blocked route, hall table in the lobby route, café chair on its
  table).
- `REDIS_URL=… node --test server/tests/garden-campus-desk-transport.test.js`: 3/3, memory
  and Redis, through real ticket/WebSocket/HTTP gates.
  - Walk into the T1 hall and sit at a table chair. The snapshot flag appears, then save
    and read.
  - Bob at the next chair sees an empty desk of his own, and no private text appears in
    snapshots.
  - Standing up gives 403. Sitting again recovers the task.
  - The garage revision has no seats.
- Regression set (office desk transport, office desk, seating, world, world interactions,
  the campus district suites and campus leases): 111/111 after updating #507's hall
  obstacle test for the fit-out.

## Still to do (in order)

1. Fit-out rendering (desks, chairs, tables, neutral screens) for suites and halls.
2. A client "Use this desk" control from a seated workstation, reusing `createOfficeDeskUI`.
3. The campus panel: directory, availability, terms with "No charge — owner-managed",
   request, accept or decline, release, guests, the operator's issue, renew, revoke and
   decline, and errors from `CAMPUS_LEASE_ERRORS`.
4. After #508: suite sit and stand through its hooks, `player.campusSeat` restore and
   validation, suite workstation flag with `campusSuiteAccess`, and the eviction release.
5. Registered `garden-campus-office` journey with two fixture accounts and an operator.
   It is #510's first useful-work journey and feeds #512.
