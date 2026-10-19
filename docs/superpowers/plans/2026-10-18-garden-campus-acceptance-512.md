# Garden Offices #512: migration, two-player use, recovery and release readiness

Owner: `claude:river-oaks-95 (5bececff)`, task `garden-campus-acceptance-512`, branch
`test/garden-campus-acceptance-512-20261018`, worktree `river-oaks-garden-campus-512-20261018`.
Parent tracker: #505. This branch becomes the integrated candidate: #507, then the
#508/#509/#510/#511 heads as they land, each named by SHA below.

## Integrated inputs (by revision)

Candidate code head `0b833b31` (PR #525), base main `97304fb7` (#486 Computer tab included).

| Package | Revision in this branch | Notes |
| --- | --- | --- |
| #506 contract | layout 3.2 (through #507 `40aec12a`) | PR #519 head `3fac6c32`, hosted 19/19 |
| #507 shells, overlay, gate | `3e58f384` (main `ab0059fc` with #519) | detachGardenCampus restores the garage byte for byte; halls and café carry room summaries |
| #508 upper circulation | `75f8e277` (PR #537) | campus floors on the interior-level machinery, lifts/stairs, facade glass, ceilings; slice (b) `2c650446` |
| #509 leases | `1d151a8d` | checkpoint v13, `payload.campus`, `campusServed`, `leaseRequestId` |
| #510 resident journey | `1e6d32d7` (suite seats, suite journey) | dialog, fit-out, public workstations, seat rules, `garden-campus-office` journey and its `campus` CI shard |
| #511 finish and rendering | `eab230b9` (PR #528) | 67 furnishings drawn once each, storey bands 6/7/6, dusk glow; resources vs garage at street +10% calls / +18% triangles |

## Cutover and rollback (implemented)

`server/district-gardens-checkpoint-migration.js`, wired first in `redis-room.js`'s recovery
chain:

- **Garage → Gardens.** The checkpoint must validate against the exact garage district
  (`detachGardenCampus`), through the tower → levels → interior → height recoveries if it
  is older. Nobody can stand in the garage. Residents flying in or over the parcel
  (within 4.5 m) land on clear street ground beyond the nearest entry, 0.9 m apart.
  Everything else is carried unchanged.
- **Gardens → garage (configuration rollback).** The checkpoint must validate against
  the exact campus this code builds. A campus from another contract revision fails
  closed. Everyone on the parcel, in the halls or on a campus level
  (`buildingId 'garden-campus'`) moves to street ground, off seats, vehicles and levels.
- Logged once per switch as `district_gardens_checkpoint_migrated {from, to, moved}`.
- #509 keeps `payload.campus` inert, byte for byte, in a world without the campus
  (`campusServed(worldData, worldId)`), so a rollback and re-select keeps leases. Its test
  used a stand-in marker. The candidate reruns it on the real campus
  (`loadDistrictData({ districtRevision })`): "a configuration rollback keeps every lease
  inert, byte for byte, and switching back honours it".

## Acceptance matrix (from #512)

| Case | Status | Evidence |
| --- | --- | --- |
| Skyline/plot | done for the candidate | #507 contract and render tests, #511 day/dusk sheets, slice (b) circulation sheet with suite walls (`c1feaf6b`). Val's visual review is open |
| Public route | done | #508 levels test: Floor 4 is one walk from T1's lift to T3, and every public surface is reached from its cores. Hosted `garden-campus-traversal` |
| Stacked movement | done | in-process, transport (memory and Redis) and browser, with two residents at one x/z on B12 and P2, each seeing the other at their own level and height |
| Rental/permission | done | #509 race, retry, forged and coordinator tests. Hosted `garden-campus-office` and `garden-campus-suite` (request → offer → accept; a stranger kept outside the suite door) |
| Useful private work | done | a public workstation (office journey) and a suite desk (suite journey, private work saved with the server's acknowledgement), with no leak to another account |
| Access loss | done | an ended lease walks the tenant out to the gallery side of the door and the desk action goes (suite journey). #510 server test: revoke while seated |
| Persistence/cutover | done | reload recovers work (office journey); a seated tenant is restored standing; reconnect resumes on Floor 4 (transport); garage ↔ Gardens recovery, epoch fence and leases inert across a rollback (#512 tests); the rollback clears real campus-floor occupants (Floor 4, mid-B12, Floor 2, a seated suite tenant) and the garage restores (2026-10-19) |
| Interaction/accessibility | partial | keyboard, emulated phone touch and reduced motion in the traversal journey; dialog keys, phone width and touch targets. Physical devices are unproven |
| Visual/resource | partial | #511 A/B on an M3 Max (street +10% calls / +18% triangles). Target-GPU and mobile budgets are unmeasured |
| Optional Computer/paid mode | not claimed | Computer appears at any workstation where #486 is configured. Paid mode needs the #509 business decisions |

## Evidence

- **Hosted CI at candidate `0b833b31`** (Verify run 39169199120): all three campus journeys passed.
  - `preview experience (campus)` (job 117798531567): `garden-campus-office` and `garden-campus-suite`.
  - `preview experience (campus-traversal)` (job 117798531796): `garden-campus-traversal`.
- **#510 `1e6d32d7`** (job 117798291819): `garden-campus-suite` passed 10/10 checks, among them:
  - the stranger was kept in the gallery at [14.48, 51.20];
  - the resident was walked out to [15.10, 51.00] when the lease ended.
- **Integrated suite at the candidate before these journey merges, `7d863b88`:** 258/259 under
  host load ~400. The one failure, #509's Redis lease UI transport test, passes 5/5 alone, so
  it is load-sensitive (8 s request timeout).
- At `57a99589` (#510 `465785d2` and #511 `b73cf65a` merged), 2026-10-18 18:50Z, load ~60, with
  an isolated Redis: 175/175. This is the integrated set below plus #511's
  `garden-campus-finish` and the `shared-population`, `store-rooms`, `venue-rooms` and
  `walking` suites.
- At `284a5ca3` (2026-10-18 18:32Z, load ~55), with an isolated Redis
  (`REDIS_URL=redis://127.0.0.1:16507`, `--test-timeout=240000`): 145/145. The set is:
  - `district-gardens-checkpoint-migration` (6), `redis-room` and the tower, levels,
    gallery and interior recoveries;
  - every `preview/tests/garden-campus-*` and `server/tests/garden-campus-*` test, the
    `campus-leases*` transports and coordinators, and the office desk suites;
  - `scripts/tests/agent.test.js` (the experience profile lists `garden-campus-office`).
- Hosted at `9838e159`: everything green except the `campus` shard and Desktop macOS, which
  hit the known W-check flake at the garage spawn.
- The `campus` shard's stall at the hall door (#510 runs 39151750197, 39154402265) was a
  #507 product bug. The campus ground rooms had no `summary`, so the Map's
  `describeInterior` threw inside `enterStore` before any travel was sent. The same throw
  broke the Map's destination list for a campus hall. Fixed at #507 `086c197e`, with a
  regression. At `f6311e65`: campus, migration, room and walking suites 80/80. Hosted re-run
  pending.
- Earlier, at `936e4983`: hosted Desktop on all three runners green with the campus UI in.

## Gaps

- A code revert past checkpoint v13 is not a supported rollback without a downgrade
  path. The release plan must say "configuration rollback first".

## Rollback with campus-floor occupants (2026-10-19, after #525 landed)

The gap was that no test had a resident on a campus floor when the town rolled back to the
garage. `server/tests/district-gardens-checkpoint-migration.test.js` now has one ("the
configuration rollback clears every campus floor, seated tenants included, and the garage
restores"). It builds a real Gardens town and moves its residents into place with real
commands:
- one rides T1's lift to Floor 4 (`garden-campus/l3`);
- one walks Floor 4 to midway along B12;
- one stops on Floor 2's spine (`garden-campus/l1`);
- a tenant leases T1-201 from the operator, walks through its door and sits at its
  workstation desk;
- a street walker is the control.

The rollback moves exactly the four campus residents. Each is on foot at street level, off
the parcel, with no level, building, seat or vehicle, at least 0.9 m from the others. The
street walker and the lease section are carried unchanged. The garage restores the town,
and a moved resident's next step is accepted. Switching forward again moves nobody, and
the Gardens restore that town.

- **Mutations:** the case fails when the rollback leaves `levelId` set, and when its
  selection skips level occupants (both `incompatible_district`). Dropping `sitting: null`
  from the move does not fail it, because the migration first restores the town in the
  Gardens world, which stands seated residents up.
- **Results (main `7c10f418` plus this test):**
  - migration, suite-seat and traversal suites with an isolated Redis: 15/15, including
    the epoch-fenced Redis coordinator switch;
  - `pnpm run test:server` with that Redis: 983/983, 0 skipped. On the final tree, with the
    transport hardening below, it was 982/983 at a load average of ~27. The one failure was
    `redis-room`'s "default district commits the approved two-level revision" on its
    request deadline (`request_timeout`); that file passes 21/21 alone.
  - Every other core verify step passes: preview tests 3,686 (1 skipped), desktop 76/76,
    build, ruff check and format, pytest 145, demo, demo-verify (expected exit 2) and the
    secret scan.
  - `pnpm run verify` (core) itself stops at `test:agent` on one failure that main shares:
    `scripts/tests/ipic-short-intake.test.js` ("the approved silent short and the fixture
    are not a second film with dialogue and music"). #547 registered a second short that
    really has dialogue and music, and the test runs only where ffmpeg is installed. It was
    reported to its owner, river-oaks-4b. The other 126 agent tests pass.
- **Transport test hardening (#509's suite, same PR):** one local run of
  `campus-leases-transport.test.js` stalled for 33 minutes at a load average of ~55, because
  `join()` waited for the first snapshot with no timeout and did not reject on `close`. It
  now rejects on a close before the first snapshot and after 15 s of silence, and each test
  has a 120 s timeout. Against a socket server that accepts and closes cleanly, the old wait
  was still pending after 5 s; the new one failed in 54 ms with the close code. The file
  passes 5/5 with Redis.

## Next action

Delivered. All packages are on main:
- #519 `ab0059fc`, #522 `53fba3fa`, #523 `5bb321ba`, #537 `3767d42b`, #528 `4eca5153` and
  #527 `69699036`;
- this candidate, #525, merged at 2026-10-19T06:29:36Z as `7c10f418` from head `d70607a4`,
  18/18 hosted.

Still open:
1. Production activation, by river-oaks-b5 under Val's authorization, as written in
   `docs/garden-campus.md`. Its `district_gardens_checkpoint_migrated` log line goes into
   the #505 tracker.
2. Physical devices, target-GPU and mobile budgets.
3. Val's visual review.
