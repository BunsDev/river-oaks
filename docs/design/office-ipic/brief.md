# Office + IPIC packet: design brief (G0 baseline, G1 input)

Issue #360 under tracker #359. Reconciled against `main` at
`489a60e4` on 2026-10-14 (the issue's snapshot `7cff31f4` plus #374). This is the
design side of the packet: what exists, what is only inferred, what the kit
proposes, and which decisions are still Val's. The engineering side
(`layout-contract.json`, `camera-manifest.json` and their validator) is a
separate branch owned by the engineering baseline task (draft PR #381); this
brief links to those files by name and does not restate their numbers.

Companion files in this folder:

- `reference-index.json`: every source this round depends on, with location,
  SHA-256, size, provenance and approval state. 147 entries: 28 in the repository,
  117 on this machine outside the repository, 2 named by the handoff and not found.
- `asset-manifest.json`: 53 assets (22 kit GLBs, 15 starter material maps, 9 kit
  reference images, 4 repository models, the 44 IPIC photographs, Jevica's
  sources record), with budgets, bounds and axes.
- `review-matrix.md`: each reviewable item classified observed, inferred or
  proposed, with an owner and the evidence behind it.

Both JSON files are generated and checked by `scripts/office-ipic-reference-index.mjs`
and `scripts/tests/office-ipic-references.test.js`. The check reads the files the
packet points at; it rejects duplicate ids, a non-SHA `sourceRevision`, an axis
convention other than the agreed one, repository paths that do not exist,
dangling references, bounds with min above max, and kit proxies over their LOD0
target, and it reports a repository file that changed since reconciliation as
drift rather than as a broken packet.

## Observed: what the game does today

Office (`docs/offices.md`, `preview/src/office-contract.js`, `workplace-room.js`,
`office-arrival-model.js`, `server/offices.js`):

| Item | Value | Source |
| --- | --- | --- |
| Room | 9 × 7 m, height 3.9 m, one level | `planWorkplaceRoom()`, `ROOM_HEIGHT` |
| Door | 1.7 m clear (half-width 0.85), 2.6 m high | `DOOR_HALF_WIDTH`, `door.height` |
| Spawn and speed | `[0, 1.25]`, 2.6 m/s budgeted on the server | `OFFICE_SPAWN`, `OFFICE_SPEED` |
| Avatar envelope | body half-width 0.505, turning radius 0.888, height 2.45, seated radius 1.27 m | `AVATAR_ENVELOPE`, measured from all 22 appearances |
| Collision | swept 2D segments against desks, review table, storage, planter and seated chairs; chairs add 0.4 m | `officeFree`, `officeSegmentFree` |
| Arrival | 10.6 s lobby-to-office film, lift rise 24.3 m to level 6, car 3.2 × 4 × 3.3 m, reduced motion skips | `ARRIVAL` |
| Authority | owner from the Jevica admin predicate; invite, approve, deny, revoke; visit ends on revocation; checkpoint v6 | `createOffices` |
| Companion capacity | two logical stations, independent of rendered desks | `STATION_IDS` |
| Desk | private, 24 tasks / 128 KiB per account | `DESK_LIMITS` |
| Eye and axes | first person at `[x, 1.68, -d]` | `office-scene.js` |

IPIC (`docs/ipic-interior.md`, `preview/src/ipic-plan.js`):

| Item | Value | Source |
| --- | --- | --- |
| Footprint | 13 m frontage, 34 m depth, authored estimates in the mapped footprint | `docs/ipic-interior.md` |
| Rises | two escalator flights, d 6–12 and 14–20, 3 m each; one support height per XY | `IPIC_FLIGHTS`, `ipicFloor` |
| Seats | two lounge-sofa seats and eight recliners (two rows of four) through the existing sit/stand protocol | `configureIpicRoom` |
| Lift | bronze doors are visual only; treads static | `docs/ipic-interior.md` |
| Screen | illuminated surface, no playback state | `docs/ipic-interior.md` |
| Review cameras | five photo-matched views: reception, mural, lounge, bar, auditorium | `IPIC_CAMERAS` |
| Photographs | 44 user-supplied, SHA-256 indexed, no redistribution license asserted | `assets/ipic/references/manifest.json` |
| GLB axes | +X across frontage, +Y up, −Z into venue; Blender Z up, +Y into venue | `docs/ipic-interior.md` |

Axis mapping, verified once in live code and recorded here so nobody converts
twice: the office camera sets `position.set(x, 1.68, -d)` and the workplace
graybox places every box at `z = -d`, so the kit's `(x,d,h)` is Three.js
`[x,h,-d]`, which is the kit manifest's own `x east / y up / z south`. IPIC rooms
go through `store-rooms.js` `toWorld(a,d) = facade + right·a + inward·d`; the GLB is
placed at that facade transform. Neither mapping is applied by the packet
checker; it only refuses a different convention.

Since the kit's repository receipts of 2026-10-13, `workplace-room.js` and
`server/offices.js` are byte-identical; `office-contract.js`, `office-scene.js`
and `package.json` changed (#345 arrival refinement). The kit's conclusions about
the room, envelope and authority still hold; its office-scene receipt is stale.

Baseline captures with avatars on real materials are in `captures/` with
`captures/receipt.json`: the `office-arrival-visual`, `office-visit` and
`office-desk` journeys at `7feef523` on local Chromium with Metal ANGLE
(1440 × 1000 viewport, Apple M3 Max), eight views mapped to O0–O3 of the camera
manifest. The IPIC views keep their committed receipts in `docs/ipic-review/`;
there is no penthouse to capture for O4.

## Inferred: estimates the current build relies on

- IPIC stacking, adjacencies, floor heights, seat count and accessibility routes
  are photo-guided estimates, not a survey (`docs/ipic-interior.md`).
- The office lobby finishes, interior dimensions and the 24.3 m lift rise are
  authored interpretations of the mapped frontage (`docs/offices.md`).
- The 0.888 m turning radius and 2.45 m height are rest-pose static bounds of the
  22 shared appearances; walking-cycle swing and cloth are excluded
  (`avatar-envelope.json`). #360 asks for a re-measurement of the largest rig,
  turning and seated envelopes; that is an engineering-side capture.

## Proposed: the supplied kit

`~/Downloads/jevica-office-kit` (71 of 71 checksums verified at indexing) proposes
a 30 × 20 m main floor at 7.6 m clear, a 180 m² mezzanine at +3.8 m over d 14–20,
a 160 m² terrace at x −23..−15, a 3.2 m stair at x 10.2..13.4 (22 risers, separate
ramp collision), two 4 m terrace portals, a lift preview at (−12, 18), arrival at
(0, 1.5), five stations with eleven displays, 32 placements and 46 colliders. The
blockout GLB is 41,864 triangles, 647 mesh nodes, 2.78 MB; the kit's own spatial
validation (9 checks) and browser smoke (9 checks) passed on 2026-10-13. Every kit
proxy is under its LOD0 target (largest: petal chandelier 6,048 of 12,000).

The kit states that it is a standalone blockout, not integrated, and that its
dimensions are design choices, not measurements. Its reference images were
generated from Val's approved direction; the kit does not record approval to
publish those bytes, so nothing from it is copied into this public repository.
The index points at the local copies by home-relative path and hash. Importing
the kit, or a subset such as `layout.json` and the GLBs, is a decision listed
below.

Cody's scale review of the kit walkthrough (`~/Downloads/jevica-office-scale-review`,
2026-10-13/14) keeps the double-height identity and stair width, finds the library
and terrace under-programmed, and ends in a library plan revision 3: two reading
chairs at d 18.3, bookcase-0 and the mezzanine table removed, an east passing bay
at x 9.1..14.1 / d 14.05..18.45 because a 2.4 m gallery cannot pass two 1.776 m
standing diameters. It is a proposal with calculated gaps, not runtime proof; the
review says so itself.

Two loose files in the download folder are byte-identical to kit references
(`office-main.png`, `office-computers.png`), and the loose walkthrough equals the
kit's; the index links them as duplicates.

## Keep, reuse, avoid against the open interiors stack (#349–#358)

Recorded before any geometry or rendering change, as #359 asks. The stack is
open and owned by other sessions; nothing below assumes it merged.

- Keep: the current 9 × 7 m office as default and rollback; the IPIC entrance,
  neighbours and both escalator paths; server authority for entry, movement, seats
  and revocation; the two logical companion stations and the #214/#221 flags.
- Reuse (engineering, #361): #349's building-local level plans with stable ids,
  server-approved digests, level occupancy and checkpoint migration; #350's
  prepare-only-the-occupied-level streaming for a mezzanine; #352's rule that
  revocation clears level occupancy in the same ejection; #357's documented
  `interior.generation` field shape as the model for a versioned layout record.
- Reuse (design and measurement): #353's repeated entry/eviction soak and
  #356's AO geometry diagnostic as the pattern for office capture journeys;
  #354's Auto-quality tail handling if the penthouse shows the same moving-frame
  tails; #351/#358 exterior culling and AO masking, which the office's terrace
  glazing will need in the same form rather than a second rule.
- Avoid: editing shared plans, scene roots or the AO lifecycle while #351–#358
  are open; forking a second geometry source or renderer path; converting axes a
  second time; treating #355 (footprint ring validity) as related, it is not.

## Decisions for Val

1. Import the kit bytes into the public repository (all 19 MB, or `layout.json`,
   `asset-manifest.json` and the GLBs only), or keep them external and indexed by
   hash as now. The kit's own README gives no publication approval.
2. Physical fit: the kit's 7.6 m clear main volume sits above the 24.3 m lift
   rise inside a building the engineering baseline measures at about 28 m. The
   number and the options are in the engineering packet; the layout cannot be
   approved until this is answered.
3. Adopt Cody's library revision 3 (two chairs, one bookcase removed, east passing
   bay) as the mezzanine programme for the blockout, or keep the kit's library.
4. The IPIC lift: keep it decorative in this increment, or implement a
   fixed-endpoint, server-validated reduced-motion route. The brief records that
   a decorative door is not a usable route and that the accessibility implication
   is unresolved.
5. The handoff briefs `typesafe-place-coding-familiar-handoff.md` and
   `typesafe-place-design-familiar-handoff.md` were not found in the repository or
   on this machine. Supply them or confirm #359 and its children are the record.

## What this brief does not do

No layout is activated, no asset is enabled, no provider is called, nothing is
deployed. The current office remains the default. Human visual review,
target-device performance and native acceptance are outside this packet.

## Validation

```sh
node scripts/office-ipic-reference-index.mjs --check
node --test scripts/tests/office-ipic-references.test.js
```

Regenerate after the kit changes, from a checkout with the kit present:

```sh
node scripts/office-ipic-reference-index.mjs --write \
  --kit ~/Downloads/jevica-office-kit --scale-review ~/Downloads/jevica-office-scale-review \
  --loose ~/Downloads/jevica-office-production-guide.md --loose ~/Downloads/jevica-office-walkthrough.html \
  --loose ~/Downloads/jevica-office-production-kit.zip
```
