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
- Run 39154402265 at `835c0c44`: three clicks on the door prompt and still outside. The
  cause was a #507 product bug. Campus ground rooms had no `summary`, and `enterStore` first
  selects the Map destination, whose `describeInterior` joins `summary.highlights`. It
  threw before any travel was sent, leaving only a fading "Could not step through". Fixed
  at #507 `086c197e` with a regression and merged here (`5c13cdca`). With the fit-out, the
  halls and café also list public workstations.
- Run 39155192638 at `5c13cdca`: inside the hall for the first time, then no "Sit down"
  walking action. Hall chairs are street seats, so the shared-seating picker offers them
  (`#nearby-seat`, `#seat-sit`), as for every bench in a room. The journey (`465785d2`) picks
  the first free hall chair there, steps the second resident north until one is in reach,
  and uses the HUD's Stand up and Use this desk buttons. Desktop ubuntu on that run timed out
  in the Vite CSS hot-reload probe (`desktop/e2e.js:258`). The same check passed at
  #525 `aed8b247`, which has the same code, so it is a runner flake.
- **Run 39155567833 at `465785d2`: `preview experience (campus)` passed `garden-campus-office`
  end to end, all 21 checks.** Those cover:
  - Play panel, desk closed away from a workstation;
  - 43-suite directory, no-charge terms, no price;
  - request shown as asked;
  - dialog keys, phone width and touch targets, Escape and focus;
  - operator offer, acceptance, closed request, directions;
  - public workstation empty desk, acknowledged save;
  - stand-up removes the action and closes the route (403);
  - reload recovers the work;
  - the neighbour's own empty desk, and no leak of the other account's work.

  The #512 candidate `ac88b09a` (run 39155682472) passed the same shard.
  The full Verify run is green at `465785d2` (`preview` aggregate), and at `ac88b09a` for #512.
- Desktop macOS at `c4be49c6` (and #512 at `9838e159`): "W moves the player: 0.00 m"
  ending at the spawn `[-2765.32, 20.14, 1295.06]`. That is the fixed point of the known
  macOS W-check flake (runs 38659435397, 38673593628, before any campus code), in the
  garage revision. Not campus-specific; re-run on the next head.

## Suites on #508's levels (`36c78e28` and after)

#508 is merged in. river-oaks-95 owns both #508 and #510 since Val reassigned #508, so the
seat hooks designed for two owners collapse into the existing seat path. Decision recorded
here and in #508's ledger.

- **Admission.** Suite floor admits whom #509's leases admit (`campus.suiteAccess`). An
  injected `campusAdmission` still wins in tests.
- **Seats.** `campusSuiteSeatSites` gives 116 desk and meeting seats, as `campus-suite:<seat>`
  build ids. They are separate from street benches, so townspeople never use them.
  - `sit` and `stand` on a campus floor follow `campusSit`/`campusStand`: 1.3 m from the stand
    point on the same floor, one occupant, no body on it, the suite admitting the sitter.
  - The workstation flag holds only while the suite still admits the sitter.
- **Furniture.** Suite furniture is a registered level obstacle on client and server.
- **Access loss.** When access ends (revoke, expiry, release, a removed guest), an occupant of
  that suite is stood up and moved to the lease landing outside the door.
- **Restore.** A suite sitter is restored standing at the stand point.
- **Client.** The seat picker offers only the desks of the suite the resident stands in. The
  page predicts suite doors from the resident's own entitlements (`setCampusSuiteGate`).
- **Browser.** `garden-campus-suite` (`preview/e2e/garden-campus-suite.js`, `campus` CI shard)
  passed all 10 checks on hosted CI at `1e6d32d7` (job 117798291819) and at candidate
  `0b833b31`. It passed again locally at 22:08Z (load ~150). Screenshots are in
  `docs/design/garden-campus/suite/`: the seated tenant's private desk, and the tenant walked out
  to the gallery after the lease ended, with the stranger at the door.
- **Evidence.** `server/tests/garden-campus-suite-seats.test.js` passes 3/3: door, desk and
  workstation for the tenant; door and desk refused to a stranger; revoke walks a seated tenant
  out; restore stands them. With an isolated Redis, the campus, lease, desk, room, walking,
  district, world and world-interactions suites pass 190/190.

## Dialog answered before the list caught up (found at candidate `e9716e46`)

- **What failed.** The hosted `campus` shard on #525 `e9716e46` (job 117820157741) failed
  `garden-campus-office` at "A request is shown as asked, not admitted". The suite journey
  passed. The failure screenshot shows the chip reading "You asked" once the page settled.
- **Cause.** `act()` set the confirmation ("Asked for suite T1-201.") before
  `await refresh()`. On a slow runner the dialog said the request was sent while T1-201's
  row still showed "Available" with its "Ask for this suite" button, and the journey read the
  row in that window.
- **Fix (`preview/src/garden-campus-ui.js`).** `act()` now lists again before writing its
  answer. `refresh()` reports whether it listed; if it could not, the answer keeps the
  action's result and adds the directory's error.
- **Regression.** `preview/tests/garden-campus-dialog.test.js` uses a small DOM double and
  holds the second listing.
  - While the listing is held, the dialog says "Sending…".
  - Once it lands, the dialog says "Asked for suite T1-201." with the chip "You asked".
  - A failed listing says both messages.
  - Against the old `act()`, both tests fail with the CI symptom
    `['Asked for suite T1-201.', 'Available']`.

## Still to do (in order)

1. Get the `campus` shard and macOS desktop green on the head that carries this fix. The
   macOS desktop job was green at `8f4a20ac`. Then hand the head SHA to river-oaks-b5; it
   lands #527 after #537.
2. When #537 lands (d8), merge main and re-run.
