# Garden Offices #510: rentable suites, useful shared spaces and the private-desk journey

Owner: `claude:river-oaks-95 (5bececff)`, task `garden-campus-journey-510`, branch
`feat/garden-campus-journey-510-20261018`, worktree `river-oaks-garden-campus-510-20261018`.
Parent: #505.

## Inputs (by revision)

- #507 PR #523 head `40aec12a` (layout 3.2 from #506, main `97304fb7` with #486), merged
  in: overlay, street rooms, shells, finish-drawn furnishings.
- #509 PR #522 head `1d151a8d`, merged in. Lease commands `{type:'campus', action}` with
  `leaseRequestId`, the `CAMPUS_LEASE_*` contract, `world.campusSuiteAccess` and
  `campusAccess`, and checkpoint v13 `payload.campus`.
- #486 (main `97304fb7`): the office desk's Tasks and Computer tabs. The campus "Use this
  desk" opens the same `createOfficeDeskUI`, so Computer appears at a workstation exactly
  where it is configured; `close()`/`suspend()` destroy its frame when the seat is lost.
- #508: not yet started. river-oaks-c5 will provide `registerCampusLevelObstacles`,
  `registerCampusOccupancy`, `registerCampusLevelAction('sit'|'stand')`, `isCampusSeated`,
  `releaseCampusSeat` and the private-suite seam through `campusSuiteAccess` and the
  suite-door openings. `shared/garden-campus-seats.js` holds the rules those hooks call.

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

- **Client.** `preview/src/garden-campus-model.js` (directory, directions, errors, command
  intents that keep their operationId until a definite answer) and
  `preview/src/garden-campus-ui.js`: the Play section `#campus-panel` and the
  `#campus-dialog` (directory of 43 suites, "No charge — owner-managed" terms, request,
  withdraw, accept or decline an offer, give up, guests, and the operator's issue, renew,
  revoke and decline). Seated at a workstation, **Use this desk · X** opens
  `createOfficeDeskUI`; losing the seat suspends it.
- **Fit-out drawn** (`preview/src/garden-campus-fitout-render.js`) in #511's palette.
- **Journey** `preview/e2e/garden-campus-office.js`, registered in the experience profile
  and run by hosted CI in its own `campus` shard with the gardens revision and `bob` as
  operator.

## Hosted CI notes

- Run 39151750197 at `c4be49c6` (`preview experience (campus)`): 14 checks passed through
  the lease, then the hall entry timed out. The F press never entered on the
  software-rendered runner (fps 14), and the title check matched the street door's label
  ("Grove Offices · Shared work lounge…"), so the failure surfaced at "Sit down". The
  journey now clicks the door prompt, retries while the prompt stays, and waits for
  `#walking-hud[data-inside="campus:T1-F1-hall"]`, also after the reload. The server's
  interior arrival `room.toWorld(0, 2.4)` is 3.17 m from table-1 chair 2, inside the
  3.6 m seat reach.
- Desktop macOS at `c4be49c6` (and #512 at `9838e159`): "W moves the player: 0.00 m"
  ending at the spawn `[-2765.32, 20.14, 1295.06]`. That is the fixed point of the known
  macOS W-check flake (runs 38659435397, 38673593628, before any campus code), in the
  garage revision. Not campus-specific; re-run on the next head.

## Still to do (in order)

1. A green hosted `campus` shard on the current head (the journey has not yet passed end
   to end anywhere; local browser runs are blocked by machine load).
2. After #508: suite sit and stand through its hooks, `player.campusSeat` restore and
   validation, the suite workstation flag with `campusSuiteAccess`, the eviction release,
   and the journey's upstairs leg (enter the leased suite, a stranger refused).
3. Integrate #511's finish PR when it opens; re-run the journey on that head.
