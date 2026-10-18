# Garden Offices #512: migration, two-player use, recovery and release readiness

Owner: `claude:river-oaks-95 (5bececff)`, task `garden-campus-acceptance-512`, branch
`test/garden-campus-acceptance-512-20261018`, worktree `river-oaks-garden-campus-512-20261018`.
Parent tracker: #505. This branch becomes the integrated candidate: #507, then the
#508/#509/#510/#511 heads as they land, each named by SHA below.

## Integrated inputs (by revision)

Candidate code head `f6311e65` (PR #525), base main `97304fb7` (#486 Computer tab included).

| Package | Revision in this branch | Notes |
| --- | --- | --- |
| #506 contract | layout 3.2 (through #507 `40aec12a`) | PR #519 head `3fac6c32`, hosted 19/19 |
| #507 shells, overlay, gate | `086c197e` | detachGardenCampus restores the garage byte for byte; halls and café carry room summaries |
| #508 upper circulation | **not yet** | not started; c5's queued goal, which Val starts |
| #509 leases | `1d151a8d` | checkpoint v13, `payload.campus`, `campusServed`, `leaseRequestId` |
| #510 resident journey | `5c13cdca` | dialog, fit-out, public workstations, seat rules, `garden-campus-office` journey and its `campus` CI shard |
| #511 finish and rendering | not yet | `bb8cd938` pushed; PR after its core verify |

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
  uses a stand-in marker. This branch must rerun it with
  `attachGardenCampus(loadDistrictData())` once #509 is integrated.

## Acceptance matrix (from #512)

| Case | Status | Evidence / next |
| --- | --- | --- |
| Skyline/plot | partial | #507 contract and render tests, matched views at #507; #511's finish views and Val's visual review pending |
| Public route | partial | ground E1/E2/E3 → halls/café/pergola flood test (#507); the hall door and seats in the `garden-campus-office` journey; upper route is #508 |
| Stacked movement | partial | a street walker below both skywalks stays on the platform (#507 server test); deck walkers are #508 |
| Rental/permission | partial | #509 race, retry, forged-command and coordinator tests (memory and Redis, real sockets); the dialog's request → offer → accept, withdraw and decline over the real socket (#510); browser leg in the hosted `campus` shard |
| Useful private work | partial | public workstation desk in both transports (#510 desk transport test); the browser save → stand → 403 → reload → recover leg in the `campus` shard; suite desks need #508 |
| Access loss | partial | #509 revoke/expiry; standing or leaving closes the desk (#510); suite eviction needs #508 |
| Persistence/cutover | done for street and halls | garage ↔ Gardens recovery, older chain, epoch fence, refusals, Redis coordinator, leases inert across a configuration rollback; campus-level occupants need #508 |
| Interaction/accessibility | partial | dialog: Escape and focus return, keys do not walk, phone-width containment and 43 px targets (emulated) |
| Visual/resource | open | #511 |
| Optional Computer/paid mode | not claimed | Computer appears at a workstation exactly where #486 configures it; paid mode needs the #509 business decisions |

## Evidence

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

- No campus-level occupant exists yet to exercise the rollback's level clearing. The
  test covers hall and platform occupants. Rerun once #508's levels exist.
- A code revert past checkpoint v13 is not a supported rollback without a downgrade
  path. The release plan must say "configuration rollback first".

## Next action

1. A green hosted `campus` shard at `284a5ca3`.
2. Merge #511's PR head when it opens, and re-run the shard and the views.
3. When #508 lands, merge it with #510's suite-seat integration, then write and run the
   two-account candidate journey: Floor 4 across both skywalks, a walker below a bridge
   while another crosses it, suite entry by the lease holder, a stranger refused, revoke
   ending entry and the desk, reconnect and restore on a level, and a coordinator
   takeover. Rerun the rollback test with real campus-level occupants.
