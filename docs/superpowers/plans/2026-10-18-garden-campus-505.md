# Garden Offices campus delivery tracker (#505)

Owner: `claude:river-oaks-95 (5bececff)`, task `garden-campus-tracker-505`, branch
`docs/garden-campus-tracker-505-20261018`, worktree
`river-oaks-garden-campus-505-20261018`. Children are #506–#512. This ledger tracks
dependencies by delivered revision, not by issue state.

## Baseline

- Audited main: `153471bc2075e0d02e764a97b0a72129d6da5207` (merge of #493). Origin main
  was the same SHA when this ledger opened, at 2026-10-18 14:56Z.
- `preview/public/data/district.json` blob is `566d7c52295f8811b50890c23f448261bbf9a0a7`.
  The garage is `osm-way-625330790`, kind `parking`, 20 m high on base 18.25939189446673.
  It is one of the nine `collisionPolygons`.
- #496 (`3592780c`) removed personal-office provisioning and the shared workspace APIs.
  Jevica's office is invitation-only. The account-private desk (`server/office-desk.js`) is
  guarded by "active office visit in that same session".
- Open PRs touching campus-adjacent files: #477 (office outlook cost, shared skyline
  and render files; #511 coordinates with it), #489 (creator-region Café; independent).
  No campus PR exists yet.

## Source facts that shape the design (read at 153471bc)

- Client and server share one walking model: `createWalkingEnvironment(world, colliders,
  levelId)` in `preview/src/walking.js`. With `levelId` null it is the street: building
  polygons are obstacles, store rooms are free pockets and `groundAt` uses
  `groundSurfaceHeight`, the highest registered triangle. With a `levelId` it is one
  interior level: only that level's rooms are free.
- `groundSurfaceHeight` (`preview/src/world-surface.js`) takes the highest triangle at
  (x, z). A bridge deck or upper floor registered there would lift a street walker onto it.
- District multi-level players carry `{buildingId, levelId}`. `town-snapshot.js` accepts
  either both null, or a `levelId` that starts with `${buildingId}/l`. `world.js`
  `interiorLevel` changes level only from within 1.3 m of a stairs portal, to its paired
  portal, and only onto a free landing.
- The office layout model (`preview/src/office-layouts.js`) already has per-level
  collision, paired stair/lift portals, same-height floor changes (`officeWalk`), landing
  spots (`officeLandingSpot`), seats with the 2.158 m occupied clearance, and anchors. It
  runs in an office-local frame inside a visit.
- The client loads `district.json` statically. Client and server both apply the approved
  gallery overlay (`attachDistrictGalleryPlan`). The world fingerprint is
  `digest(worldData)`, and district changes chain checkpoint migrations
  (`server/district-*-checkpoint-migration.js`).
- `main` deploys to production, so an ungated garage replacement would activate on
  merge. The campus has to be a server-selected content revision with the garage as the
  default.

## Agreed interface (2026-10-18, river-oaks-c5 ⇄ river-oaks-95)

Recorded from the #506 owner's message at about 15:05Z. Its first fixture-stable push is
due about 15:50Z on `feat/garden-campus-contract-506-20261018`.

- Module `shared/garden-campus-layout.js`: pure data plus validation, no three.js.
  `GARDEN_CAMPUS_ID = 'river-oaks-garden-campus'`. `GARDEN_CAMPUS_VERSIONS = {schema:1,
  layout:'3.0', floors:1, support:1, units:1}`.
- Exports: `checkCampusCompatibility`, the transforms `sourceToCampus`, `campusToSource`
  and `campusToScene`, `GARDEN_CAMPUS_LAYOUT`, `campusLevels()`,
  `campusSupportAt(levelId,u,v)`, `campusRoute(from,to,{publicOnly})`,
  `validateGardenCampus(layout,{district,required})` and `campusUnitInventory()`.
- Support model (`support:1`):
  - Campus levels are keyed per elevation, campus-wide: `buildingId: 'garden-campus'`,
    `levelId: 'garden-campus/l0'` to `l7`, for z 0/5/9/13/17/21/25/29.
  - l3 (z 13) holds the three F4 galleries, the spurs, core lobbies, landings, B12, B23
    and the T2 z 13 terrace.
  - Ground halls, the café and the pergola are street-environment rooms (levelId null).
    l0 is published as data only.
  - Upper surfaces never enter `groundSurfaceHeight`.
- Stairs are enclosed level-change portals, not walked flights. The lift is the step-free
  route. A walked flight would be a core-envelope change under a new layout version
  (`CORE_DECISION` in #506).
- Units: `<tower>-F<level>-<W-S|W-N|E|E-S|E-N>`, e.g. `T1-F2-W-S` with display number
  `T1-201`. Each has a net rect, a door `{position, opensTo: spine id}` and a desk anchor
  with 1.27 m seated clearance. Suites are F2 and above; F1 halls are public.
- Requested in the first push:
  - Every public terrace and roof has its reaching portal or door, plus a headhouse
    obstacle inside the silhouette. A roof without one fails validation.
  - Every unit door names both the spine it opens from and the suite surface it opens
    into.

## Package ownership and dependencies (as of 2026-10-18 ~17:20Z)

| Package | Owner / task | Branch → PR | Delivered revision | Status |
| --- | --- | --- | --- | --- |
| #506 contract | river-oaks-c5 (1e70822d) / `garden-campus-contract-506` | → #519 (ready) | `63ef1b10`, layout 3.1 | hosted CI all green, CLEAN |
| #507 shells + ground | river-oaks-95 / `garden-campus-shells-507` | → #523 (draft, base #519) | `15e8400a` | green at `0eb42839`; re-running at 15e8400a; matched views captured |
| #508 upper circulation | river-oaks-c5 / `garden-campus-traversal-508` | stacks on #507 | none | can start now (#519 ready) |
| #509 leases | river-oaks-95 delegated agent / `garden-campus-leases-509` | → #522 (ready, base #519) | `d72f0bea`, checkpoint v13 | hosted CI all 13 green (server 932/932) |
| #510 resident journey | river-oaks-95 / `garden-campus-journey-510` | branch, PR after the journey | `0dc1da19` | lease dialog, fit-out, public workstations, seat rules; journey queued behind the browser lock |
| #511 finish + rendering | river-oaks-95 delegated agent / `garden-campus-finish-511` | branch | `cefa4ee7` and on | finish pass, relight hook, 67-rect obstacle proposal with #506 |
| #512 integration | river-oaks-95 / `garden-campus-acceptance-512` | branch | `ed50f3ff` (#507 + #509 + #510) | cutover, epoch fence, configuration rollback with inert leases; 94/94 + 6/6 tests |

Interfaces agreed between owners (all recorded in their ledgers):

- **#506 → all.** `shared/garden-campus-layout.js`, versions `{schema:1, layout:'3.1', floors:1,
  support:1, units:1}`. Levels are `garden-campus/l0..l7`. Stairs are portals, with the lift
  as the step-free route. Units are `T1-F2-W-S` and similar.
- **#507 → all.** `RIVER_OAKS_DISTRICT_REVISION=river-oaks-gardens-3`, with the garage as
  the default. The overlay comes with `detachGardenCampus`, the street rooms are
  `campus:T*-F1-hall` and `campus:C-hall`, the platform is at the base altitude, and
  `districtRevision` appears in world-data and snapshots.
- **#509 → #508/#510.** `world.campusSuiteAccess(userId, unitId)` and `campusAccess`, with
  the `campusAccessEnded(event)` seam, `campusLeaseUnits()`, and `{type:'campus', action}`
  commands. Checkpoint v13 carries `payload.campus`, inert without the campus.
- **#508 → #510** (agreed, to be frozen in #508's first push):
  `registerCampusLevelObstacles`, `registerCampusOccupancy`,
  `registerCampusLevelAction('sit'|'stand')`, `isCampusSeated` and `releaseCampusSeat`.
  `player.campusSeat` is owned by #510 and rides v13.
- **#510 → #508/#512.** `campusFitout()` obstacles and seats (`shared/garden-campus-fitout.js`),
  plus the public workstation flag `campusWorkstation`.

External owners:

- #486 (TypeSafe Computer tab): a peer session is working on it, started 14:53Z. It is
  coordinated only for the real Computer claim.
- #487 owns the real Computer persistence evidence.
- The IPIC #497 package is owned by river-oaks-4b. It shares no campus files.

## Open decisions

1. Content revision gating for #507/#512. Proposed: a server option selects the
   district revision, unset meaning the garage. The client learns the served revision
   before it builds the district, and a mismatch fails closed with a reload message.
2. Lease persistence for #509. Proposed: a lease store outside world checkpoints, with
   memory and Redis adapters like the desk store. Acquisition is atomic across gateways.
   Presence and seat state stay in the world checkpoint. To confirm against the desk
   store's Redis pattern.
3. Commercial mode (#509). Owner-managed, non-charging leases only. The paid-mode
   proposal lists the missing decisions (operator, currency, prices, period,
   cancellation/refund, provider, settlement source). Nothing is charged or invented.

## Integration risks found (owner: #512 unless noted)

- **Cutover outage risk.** `redis-room.js` restores the durable checkpoint with the
  served district and chains only the tower → levels → interior → height recoveries. With
  `RIVER_OAKS_DISTRICT_REVISION=river-oaks-gardens-3` and today's garage checkpoint,
  restore fails and the room throws "Invalid durable town checkpoint". #512 must add a
  garage → campus recovery before anyone selects the campus on Redis.
  - Players stay: the garage was solid collision, so nobody stands in the parcel.
  - A flight the new volumes enclose fails closed, as the tower raise did, unless #512
    relocates it.
- **Rollback by configuration, not code revert.** #509 moves the checkpoint to v13 with
  writer tokens v14/v13, and older writers are fenced. Rolling back means setting the
  district revision back to the garage on the new code. That needs a campus → garage
  recovery that moves parcel and campus-level occupants to a valid street point, keeps
  leases inert and keeps private desks. A code revert past v13 is not a supported
  rollback without a tested downgrade.
- **Fingerprint inputs.** Garage `5fc38cbe…38b80` (main 153471bc, unchanged on #507).
  Campus `29c1c02a…74389` at contract `0e46ec36`. The campus fingerprint changes with any
  contract layout change, so #512 pins it at the release candidate.

## Evidence

None yet.

## Next action

1. Run the `garden-campus-office` journey (queued behind the browser lock), then open the
   #510 draft PR (base #522).
2. When #508 publishes its first push, integrate suite seats and entry through its hooks.
3. Run #512's two-account candidate journey, including below-bridge movement and access
   loss.
4. Then the release handoff.
