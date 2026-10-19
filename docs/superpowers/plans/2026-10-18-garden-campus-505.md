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

## Package ownership and dependencies (as of 2026-10-19 06:40Z)

Landing (Val's decision, about 23:20Z):
- river-oaks-d8 lands #523, then #537.
- river-oaks-b5 lands #528 right after #523, #527 after #537, then #525 last, and does the
  production switch.
- river-oaks-95 keeps the branch updates on #528, #527 and #525, and hands each head SHA to
  b5 once its preview shards and macOS desktop job are green.
- #523 merged at 00:29Z as `5bb321ba`. #546, the repo-wide secret-scan fix (below), merged
  at 02:05Z as `2b4e4926`; Val approved landing it first and b5 landed it. #537 merged at
  02:29Z as `3767d42b` (d8). #528 merged at 03:45Z as `4eca5153` (b5).
- Val merged #542 (`eb8553ae`) at 03:29Z and pressed "Update branch" on #527 and #525. Their
  heads became GitHub-made, verified merges of the handed-over SHAs with `eb8553ae`: #527
  `2b5c3ac3` (from `8098839c`), #525 `b722b576` (from `c48a983b`). b5's land gate accepts
  exactly that shape. Val decided b5 lands #525 and does the switch; c5 stood down.
- #540 (`5f3f5dc2`, dev-invite override) made #527 and #525 conflict in `server/world.js`:
  both sides changed the `createSharedWorld` signature. #527 `822d0d66` keeps #540's
  `isDevGuest` and #510's `campusAdmission` with no default, so admission still falls back to
  #509's `suiteAccess`. #527 merged at 05:29Z as `69699036` (b5, from `1653f8ce`). The
  candidate then merged main `69699036` cleanly as `012f1601`; it adds only #512's 21 files
  on top of main. #525 merged at 06:29Z as `7c10f418` (b5, from `d70607a4`, 18/18). Every
  campus package is on main.
- Dependencies, by ancestry:
  - #527 contains #537's `d456fbca`. #537's own content has not changed since `75f8e277`;
    its later heads only merge main;
  - #528 contains only #507, now on main, so it can land before #537;
  - #527 and #528 do not depend on each other;
  - #525 contains all of them.

| Package | Owner / task | Branch → PR | Delivered revision | Status |
| --- | --- | --- | --- | --- |
| #506 contract | river-oaks-c5 | #519 | **merged to main `ab0059fc`** (layout 3.2, Val-authorized land) | done |
| #507 shells + ground | built by river-oaks-95; **river-oaks-d8 lands** / `garden-campus-shells-507` (claimed by d8) | #523 | `efb935cf` (the desktop e2e rejoin fix) | **merged to main `5bb321ba`** (00:29Z, d8) |
| #508 upper circulation | built by river-oaks-95; **river-oaks-d8 lands** / `garden-campus-traversal-508` (claimed by d8) | #537 | `75f8e277`; head `c675ff22` only adds main `2b4e4926` | **merged to main `3767d42b`** (02:29Z, d8; 17 checks green, tree equal to `c675ff22`). Lifts and stairs (`toPortal` pairing), facade glass, ceilings, fail-closed suite admission. **d8's review found nothing blocking:** 133/133 (campus, interior-level, store-room, walking and world suites, isolated Redis); suite surface ids equal #509's 43 unit ids; `toPortal` pairing correct. UX note: a lift moves one floor per press |
| #508 slice (b) | river-oaks-95 / `garden-campus-traversal-views-508b` | `test/garden-campus-traversal-journey-508-20261018` | `2c650446`, on main through #525 `7c10f418` | **delivered.** Browser journey passed locally end to end: keyboard + phone touch, occupied landing, above/below B12, T2 roof, T3 stairs. 14 circulation views on the design plans; carried by #525 |
| #509 leases | river-oaks-d8 | #522 | **merged to main `53fba3fa`** (23:15Z; 20 checks green, tree equal to the head `e7b98e42`) | delivered |
| #510 resident journey | river-oaks-95 / `garden-campus-journey-510` | #527 | `822d0d66` (main `5f3f5dc2`, #540's signature conflict resolved); landed head `1653f8ce` adds main `b76ab77c` | **merged to main `69699036`** (05:29Z, b5; 20/20, tree equal to `1653f8ce`). `822d0d66`: 211/211 with Redis across 33 files, 0 skips. | suite seats on #509 leases. Campus, world, interior and walking suites 191/191 with Redis at `27ac42e8`. **Hosted 20/20 at `8098839c` and at `2b5c3ac3`** (campus shard, desktop on all three OSes). `859965a9` failed only `places` (`office-computer-embed`: the frame's Continue button detached mid-click; main's flake, also on #546). The desktop job's first attempt failed after every check had passed: the runner's GPU process crashed on its own (`exit_code=6`, context lost), and three.js's 434 stale-object deletes after the restore tripped the console assertion. The rerun passed, and the same change was green on #525. Lands after #537 |
| #511 finish + rendering | river-oaks-95 (agent-511) / `garden-campus-finish-511` | #528 | `040fc700` (main `2b4e4926`); landed head `c358c573` adds main `3767d42b` and `eb8553ae` by update-branch | **merged to main `4eca5153`** (03:45Z, b5; 16/16 green, tree equal to `c358c573`). Campus, render-audit and remote-player suites 76/76 with Redis |
| #512 integration | river-oaks-95 / `garden-campus-acceptance-512` | #525 | `012f1601` (main `69699036` + #512's 21 files); landed head `d70607a4` adds main `28f8e9b2` | **merged to main `7c10f418`** (06:29Z, b5; 18/18, tree equal to `d70607a4`). `012f1601`: 215/215 with Redis across 31 files, 0 skips. | 124/124 across 20 campus, interior and render suites with Redis. **Hosted 21/21 at `a7b16ca2` and at `c48a983b`** (both campus shards, desktop on all three OSes; `c48a983b`'s macOS job passed on rerun after a runner GPU crash). At `b722b576` see the macOS frame-count finding below |

**Found at candidate `e9716e46`, fixed at its owner (#510 `79a5b580`).** The hosted `campus`
shard failed `garden-campus-office` at "A request is shown as asked, not admitted" (job
117820157741). The dialog's `act()` wrote "Asked for suite T1-201." before the directory had
listed again. On a slow runner the confirmation sat beside a row still showing "Available"
with its "Ask for this suite" button. `act()` now lists first, then answers. The DOM-double
regression `preview/tests/garden-campus-dialog.test.js` fails against the old code with the
CI symptom.

**Found at #527 `27ac42e8` (#508 `d456fbca` merged in), fixed at #510 `ef82b525`.** The
`campus` shard failed `garden-campus-suite` at "The suite door keeps the stranger in the
gallery (at [14.38,51.20])" (job 117835615845). No campus code changed in that merge. The
server holds a stranger at the door line: walking T1-201's door in 2 cm steps against
`createSharedWorld`, the last accepted u is 14.500, and 14.48 is refused `private_suite`.
The journey had read the HUD, which shows the page's prediction, on a 3 fps software page
before the correction arrived. It now reads the town's snapshot position once two reads
500 ms apart agree.

**Found on every PR and on main, fixed by #546 (`2b4e4926`).** From 00:30Z every `verify`
job failed the history scan `gitleaks git --log-opts=--all`. The scan reads every pushed
branch, and #517's `00a74a7c` added a character sources manifest whose SHA-256 digests sit
beside MakeHuman paths naming "keys", which trips `generic-api-key`. #546 allows a bare
64-hex value for that rule in `preview/public/assets/characters/*.sources.json` only, with
tests that the allowlist stays that narrow. Its ledger is
`docs/superpowers/plans/2026-10-19-gitleaks-asset-digests.md`.

**Found at #525 `b722b576`; runner speed, not campus code (no change).** The macOS desktop
job failed "render loop keeps advancing": 72 animation frames in 10 s against a threshold of
100 (`desktop/e2e.js:241`). The walk passed.
- **What the count measures:** the e2e selects Auto graphics, which restarts the governor
  (`preview/src/render-quality.js`) at full scale with ambient occlusion on, then waits 5 s
  and counts frames for 10 s. The governor steps down one 45-frame window at a time and
  drops AO only after two slow windows at its 0.6 floor. On a slow runner it is still drawing
  the AO pass when sampled.
- **Same scene in every run:** geometries (487) and textures (159) are identical across all
  runs. The two groups differ only by the AO pass: 1,004 calls and 3.70M triangles with AO
  off, 1,462 and 5.17M with it on.
- **The split followed the clock, not the code.** Every run from 23:30Z to 00:30Z reached AO
  off with 203–278 frames. Every run after 00:30Z sampled with AO on.
- **A/B on the same commit:** old main `5bb321ba` drew 264 frames with AO off at 00:29Z (run
  39180992526). Dispatched again at 03:40Z on a temporary `diag/` branch (since deleted), it
  drew 116, 110 and 137 frames with AO on (runs 39196369229, 39196375857, 39196382550).
  Main `eb8553ae`, dispatched by c5, drew 189 and 157. The candidate's runs (72–153, plus
  402 on one attempt of `c48a983b`) sit in the same distribution.
- The third old-main run also hit the runner GPU crash (`exit_code=6`), so that flake is on
  main too.
- **Follow-up, desktop e2e owner, outside campus scope:** the 100-frame threshold sits inside
  the slow runners' normal range. A fixed quality mode, or a longer settle, would measure the
  render loop without the governor's convergence time.

**Found while verifying #525's merge, follow-up for #509's owner:** one local run of
`server/tests/campus-leases-transport.test.js` stalled for 33 minutes at a load average of
about 55 (concurrency 4, `--test-timeout=0`). It passed 5/5 alone in 19 s, and 215/215 in the
full set at load 16. `join()` in its harness waits for the first snapshot with no timeout and
rejects only on a socket `error`, so a socket that closes cleanly under load leaves the test
waiting forever. A timeout and a `close` rejection there would make such a stall fail fast.

**Also at #525 `b722b576`, a flake outside campus code:** the `places` shard failed
`contextual-first-visit` on touch. Talk was pressed inside the travel cooldown its previous
step had started, and the town refused with `travel_cooldown`. Main `eb8553ae` and #527
`2b5c3ac3` pass that shard, so it was rerun.

### #508 slice (b) plan (river-oaks-95; assigned by Val, agreed with c5)

Owned files:
- `preview/e2e/garden-campus-traversal.js` (new);
- its runner fixture and CI shard entries;
- the Floor 4 and terrace cameras in `preview/e2e/garden-campus-views.mjs`;
- the view captures and the slice ledger.

c5 keeps the server authority, level environments, portal transitions, client walking/level
hooks and the gallery, landing and core-lobby finishes. HUD markers the journey needs (level
id, portal action labels) are requested from c5, not added here.

Journey checks, mapped to #508's acceptance and run against the first push's protocol:
1. **Continuous route.** A resident enters T1, takes the lift or stairs to Floor 4 with the
   HUD's own portal action, then walks T1-F4-public → B12 → T2-terrace-4 → T2-F4-public →
   B23 → T3-F4-public with keys, no travel. The position stays continuous (no step over
   the bridge spacing) and the level id stays `garden-campus/l3`. They return to the street
   through T3's core.
2. **Above and below.** A second resident stands on P2 under B12 at the same x/z while the
   first crosses. Altitudes differ by the deck height. Each resident sees the other at the
   correct height, and neither receives a correction (no rubber-banding).
3. **Landings.** An occupied lift landing does not barricade the arriving resident.
4. **Reach.** One terrace (T2-terrace-4, on the route) and one roof (T2-roof, l7) in the
   browser; all six terraces and three roofs come from c5's transport tests.
5. **Controls.** Phone viewport with touch for the portal and step-outside actions;
   reduced-motion arrival reaches the same authoritative destination.
6. **Feet.** The rendered avatar's feet agree with `campusSupportAt(level, u, v).z` within
   tolerance on the deck, in a lobby and on the terrace.

Matched views: contract camera `03-floor4-bridge-walk` plus Floor 4 gallery and T2-terrace-4
cameras, with a resident standing there, set against `docs/design/garden-campus/views/floor-4.svg`
and `section-u16.svg`. #511's sheets cover the unoccupied finish.

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
- **Command field collides with the socket envelope (found 17:30Z by #510's journey).**
  Both transports split `requestId` off every socket message to route replies. So #509's
  `requestId` command field never reached the world:
  - an offer from a request stayed unlinked, and the request stayed pending;
  - `cancel` and `decline` failed as invalid.

  It is being fixed at its owner: #509 renames the field to `leaseRequestId` and adds a
  real-socket transport test. #510's client follows the rename. Lesson: lease tests must
  cross the real ticket/WebSocket gate, not only `world.command`.
- **Campus rooms had no summary (found 18:35Z by #510's hosted journey, fixed at #507).**
  `enterStore` selects the Map destination first, and the Map's `describeInterior` joins
  `summary.highlights`. For a campus hall that threw before any travel was sent, so
  "Step inside" did nothing beyond a fading "Could not step through", and the Map's
  destination list broke on a campus hall. #507 `086c197e` adds summaries with a
  regression; #510 and #512 merged it. Lesson: a new room kind must satisfy every
  consumer of the store-room shape, not only walking.
- **Fingerprint inputs.** Garage `5fc38cbe…38b80` (main 153471bc, unchanged on #507).
  Campus `29c1c02a…74389` at contract `0e46ec36`. The campus fingerprint changes with any
  contract layout change, so #512 pins it at the release candidate.

## Evidence

**Delivered revisions on main** (each landed with `pnpm run land`; merge commit verified, tree
equal to the reviewed head):

| Package | PR | Reviewed head | Merge on main |
| --- | --- | --- | --- |
| #506 contract | [#519](https://github.com/BunsDev/river-oaks/pull/519) | `0222e9d1` | `ab0059fc` |
| #509 leases | [#522](https://github.com/BunsDev/river-oaks/pull/522) | `e7b98e42` | `53fba3fa` |
| #507 shells and ground | [#523](https://github.com/BunsDev/river-oaks/pull/523) | `c04d1b6d` | `5bb321ba` |
| secret-scan allowlist (blocker) | [#546](https://github.com/BunsDev/river-oaks/pull/546) | `8fb1bd8a` | `2b4e4926` |
| #508 upper circulation | [#537](https://github.com/BunsDev/river-oaks/pull/537) | `c675ff22` | `3767d42b` |
| #511 finish and rendering | [#528](https://github.com/BunsDev/river-oaks/pull/528) | `c358c573` | `4eca5153` |
| #510 resident journey | [#527](https://github.com/BunsDev/river-oaks/pull/527) | `1653f8ce` | `69699036` |
| #512 candidate (+ #508 slice (b)) | [#525](https://github.com/BunsDev/river-oaks/pull/525) | `d70607a4` | `7c10f418` |

**After landing: the rollback with campus-floor occupants**
([#551](https://github.com/BunsDev/river-oaks/pull/551), branch
`test/garden-campus-rollback-levels-20261019`). #512's ledger had one recovery gap: no
resident was ever on a campus floor when the town rolled back to the garage.
- **The case:** residents ride T1's lift to Floor 4, stop midway along B12 and on Floor 2,
  and a tenant leases T1-201 and sits at its desk. After the rollback each is on foot at
  street level off the parcel, the garage restores the town, a moved resident can walk,
  and switching forward again moves nobody.
- **Mutations:** the case fails if the move leaves `levelId` set or the selection skips
  level occupants.
- **Results:** 15/15 in the migration, seat and traversal suites with Redis;
  `test:server` 983/983 with Redis; hosted 18/18 at `08b5260c`. No product code changed.

**Production activation: done** (river-oaks-b5, under Val's authorization).
1. #525 merged as `7c10f418` at 06:29:36Z.
2. The garage deploy of `7c10f418` succeeded at 06:30:14Z.
3. Production was set to `RIVER_OAKS_DISTRICT_REVISION=river-oaks-gardens-3`,
   `RIVER_OAKS_DISTRICT_EPOCH=1`, and `RIVER_OAKS_CAMPUS_OPERATOR_IDS` = the account Val chose.
   The id is not written here. Each value was verified by comparison.
4. Redeployed at 06:31:43Z.
5. The town switched on the first sign-in after that:

   ```
   2026-10-19T17:39:14Z dpl_3UvSb1fELmtyr7HvfWFiVtXzZvRD {"event":"district_gardens_checkpoint_migrated","from":"garage","to":"gardens","moved":0}
   ```

In the hour after, the logs held zero `district_revision_ignored`, `campus_operator_ignored`,
`district_epoch_unchanged`, `newer_district_epoch` or "Invalid durable town district" lines,
and zero error-level lines. Rollback, if needed: `RIVER_OAKS_DISTRICT_REVISION=river-oaks-garage-1`,
`RIVER_OAKS_DISTRICT_EPOCH=2`, then redeploy (`docs/garden-campus.md`); #551 proves it clears
campus-floor occupants.

## Release decision (draft, completed as evidence lands)

**Merging and activating are separate decisions.** Every package ships with the garage as
the default (`RIVER_OAKS_DISTRICT_REVISION` unset), so merging the stack does not show the
campus to anyone. One production-visible effect of merging remains: #509 raises the town
checkpoint to v13 (writer v14 with the character store). From then on an older build cannot
replace the coordinator, so a code revert past that point needs a tested downgrade, which
does not exist. Roll back by configuration instead (`docs/garden-campus.md`).

**Merge order** (each through `pnpm run land`, signed, current with main, `preview` green):

1. #519 (#506 contract): merged `ab0059fc`.
2. #522 (#509 leases): merged `53fba3fa`.
3. #523 (#507): merged `5bb321ba` (d8).
4. #546 (secret-scan allowlist, not a campus package): merged `2b4e4926` (b5).
5. #537 (#508): merged `3767d42b` (d8).
6. #528 (#511): merged `4eca5153` (b5).
7. #527 (#510): merged `69699036` (b5).
8. #525 (#512: cutover, epoch fence, docs, candidate journeys): merged `7c10f418` (b5).

**Activation** (Val's separate authorization; production settings):

1. Set the following on every production function, then redeploy:
   - `RIVER_OAKS_DISTRICT_REVISION=river-oaks-gardens-3`
   - `RIVER_OAKS_DISTRICT_EPOCH=1`
   - `RIVER_OAKS_CAMPUS_OPERATOR_IDS=<the operator account>`. Val has chosen Jevica's
     production account. river-oaks-b5 holds the id, which is not written in this public
     ledger. b5 makes the switch once Val authorizes it.
2. Expect one `district_gardens_checkpoint_migrated {from:'garage', to:'gardens'}` log.
   Then check that snapshots carry `districtRevision`, and smoke-test:
   - sign in and go to the Grove Offices hall;
   - sit at a workstation, then write and reload private work;
   - have the operator offer a lease and the resident accept it;
   - #508 parts: walk Floor 4 across both skywalks and enter the leased suite.
3. Watch for `Invalid durable town district` with `checkpointReason`, runtime errors and
   draw/frame regressions (#511).

**Rollback:** set the revision back to the garage, set the epoch to 2, and redeploy. Expect
one `{from:'gardens', to:'garage'}` log. Leases stay inert and desks are untouched.

**Business decisions:**

- Operator: decided. Val chose Jevica's production account, for owner-issued tenancy that
  charges nothing.
- Still open, not invented and not configured: whether paid rentals exist at all. Paid mode
  stays off. If paid rentals are wanted, #509's proposal lists the decisions: the
  operator of record, currency, prices, periods, refunds and cancellation, the payment
  provider, the settlement source, failure and expiry handling, eligibility and record
  keeping, with a five-part readiness condition.

**Release gates still open (as of 2026-10-19 06:40Z):**

- The manual smoke test on production (Grove Offices hall, a workstation, an operator offer
  and a resident acceptance, Floor 4 across both skywalks). Only the migration and the log
  checks above are recorded so far.
- Val's visual review of the matched views (`docs/design/garden-campus/finish/`,
  `docs/design/garden-campus/circulation/sheet-day.jpg`, `docs/design/garden-campus/traversal/`).
- Physical phones and target-GPU or mobile resource budgets are unmeasured; touch is emulated.
- The commercial decision on paid rentals (above). Paid mode stays off until then.

**Closed: the Desktop workflow's macOS e2e ("W moves the player: 0.00 m")**

The bisect showed runner timing that main shares, not a #507 defect. Details are in #507's
ledger, section "Desktop macOS e2e".
- **Rates, 3 attempts per variant:** main 2/3 (run 39173762547); #507 2/3 (run 39173766491).
- **Mechanism:**
  1. While loading, the renderer blocks for 20–28 s. The town socket's handshake completes
     inside that block, so the page never answers the server's 30 s heartbeat ping, and the
     server terminates the socket.
  2. The page processes the 1006 close late, usually just as the walk begins.
  3. The gate takes focus, and the rejoin restores the server's pose.
  - The earlier suspect, the 4901 watchdog, never fired.
- **Fix:** `efb935cf` on #523 changes only the harness. A hold that the town's absence undid
  is repeated after the town is `joined` again; a hold with the town joined throughout still
  has to walk.
- **Proof:**
  - the old harness 0/3 (run 39174839205);
  - the fixed one passed the walk 9/9 (runs 39175116721 and 39175120310), with three
    repeated holds;
  - #527 `8f4a20ac`'s macOS desktop job is green.
- **Residual:** 1 in 15 logged attempts, on the slowest runner. The reloaded page's socket was
  also dropped, the gate closed the open settings dialog, and the e2e's close click timed
  out. `land`'s one rerun covers it.
- **Product follow-up (not campus scope):** a client whose renderer blocks for over 30 s right
  after the handshake is cut by the heartbeat and rejoins. This belongs to the
  connection-continuity owner (#447's policy).

**Closed since the last revision:**

- #508's traversal is authoritative, proven in-process, over real transports and in the
  browser.
- The #510 suite journey is green on hosted CI.
- #512's candidate runs all three two-account journeys green on hosted CI at `0b833b31`.
- The gallery walls and suite doors are in, opaque at any camera distance.

## Remaining follow-ups outside the campus packages

- **Desktop e2e owner:** the macOS "render loop keeps advancing" threshold (100 frames)
  sits inside slow runners' normal range; see the frame-count finding above.
- **#509's suite (handled in #551):** `campus-leases-transport.test.js`'s `join()` now rejects
  on a close before the first snapshot and after 15 s, and each test has a 120 s timeout.
- **#486's owner:** `office-computer-embed`'s account-change tail flaked three times today
  (#546, #527 `859965a9` and `822d0d66`). Each passed on rerun.
- **#501's owner (river-oaks-4b, confirmed):** `scripts/tests/ipic-short-intake.test.js` fails
  on main wherever ffmpeg is installed, since #547 registered the second short. Hosted
  runners have no ffmpeg, so CI skips it. The fix is on `test/ipic-intake-named-films-20261019`
  (task `ipic-intake-test-named-films-501`): the negative test names the two films it means,
  and a positive test admits the second short. It passes 7/7 locally with ffmpeg; its PR and
  landing are pending.
- **Ledgers (done in this PR, d8 agreed):** #507, #508, #510 and #511 now record their
  delivered merges instead of pre-landing steps.
- **Product, connection continuity (#447's policy):** a client whose renderer blocks for
  over 30 s right after the handshake is cut by the heartbeat.
- **UX, #508:** a lift moves one floor per press.

## Next action (2026-10-19 06:40Z)

1. Production is switched (Evidence above). The manual smoke test in the release decision is
   still to run and record.
2. #551 (rollback with floor occupants) is green on hosted CI, 18/18. Landing is up to Val or a
   lander.
3. Retire the #512, slice (b) and tracker worktrees through `project:prune` once this
   tracker's PR lands.
