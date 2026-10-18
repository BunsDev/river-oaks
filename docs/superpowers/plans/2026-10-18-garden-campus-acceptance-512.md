# Garden Offices #512: migration, two-player use, recovery and release readiness

Owner: `claude:river-oaks-95 (5bececff)`, task `garden-campus-acceptance-512`, branch
`test/garden-campus-acceptance-512-20261018`, worktree `river-oaks-garden-campus-512-20261018`.
Parent tracker: #505. This branch becomes the integrated candidate: #507, then the
#508/#509/#510/#511 heads as they land, each named by SHA below.

## Integrated inputs (by revision)

| Package | Revision in this branch | Notes |
| --- | --- | --- |
| #506 contract | `0e46ec36` (through #507) | PR #519 head `82028fc8` adds a landing/portal check; no id change |
| #507 shells, overlay, gate | `5a572ea4` | detachGardenCampus restores the garage byte for byte |
| #508 upper circulation | not yet | river-oaks-c5, stacks on #507 `302b3e0f` |
| #509 leases | not yet | delegated agent; checkpoint v13, `payload.campus`, `campusServed` |
| #510 resident journey | not yet | |
| #511 finish and rendering | not yet | |

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
| Skyline/plot | partial | #507 contract and render tests; browser views pending under load |
| Public route | partial | ground E1/E2/E3 → halls/café/pergola flood test (#507); upper route is #508 |
| Stacked movement | partial | street walker below both skywalks stays on the platform (#507 server test); deck walkers are #508 |
| Rental/permission | open | #509 |
| Useful private work | open | #510 |
| Access loss | open | #509/#510 |
| Persistence/cutover | partial | garage ↔ Gardens recovery, older chain, refusals, Redis coordinator (this branch) |
| Interaction/accessibility | open | #510 |
| Visual/resource | open | #511 |
| Optional Computer/paid mode | not claimed | #486/#487; paid mode needs the #509 business decisions |

## Evidence

- `REDIS_URL=redis://127.0.0.1:16507 node --test server/tests/district-gardens-checkpoint-migration.test.js`:
  5/5, Redis coordinator included.
- `redis-room`, `district-tower-checkpoint-migration`, `district-checkpoint-migration`,
  `district-gallery-levels` and `district-building-interiors`, with the same isolated
  Redis: 34/34.

## Gaps

- No campus-level occupant exists yet to exercise the rollback's level clearing. The
  test covers hall and platform occupants. Rerun once #508's levels exist.
- A code revert past checkpoint v13 is not a supported rollback without a downgrade
  path. The release plan must say "configuration rollback first".

## Next action

Commit, then integrate #509 when its draft PR exists. Write `docs/garden-campus.md` with
operations, recovery and rollback. Prepare the two-account journey harness against #508's
levels.
