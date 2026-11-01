# Pink Jet-Age depth burndown (#836 under #825 M0)

- Task `pja-depth-burndown-825-20261101`; branch `fix/pink-jet-age-depth-burndown-825-20261101`; worktree `../river-oaks-pja-depth-825` from `origin/main` `decb4e9a`.
- Owner `claude:river-oaks-6d (2a62a6) worker:depth-836`, 2026-11-01.

## Objective

The `depth-layers` journey passes with `pink-jet-age` as the finish, so #831/#837 can land. Hosted job
[124753515956](https://github.com/BunsDev/river-oaks/actions/runs/41274397767/job/124753515956) on #831 failed only
`preview experience (depth)`: 10 pairs of surfaces fight for depth under pink that classic lacks. The job's
`experience-failure-depth` artifact (id 13070901383, `journeyEvidence.fresh`) lists all ten; the console line shows
the first eight.

## The ten pairs and their fixes

All reproduced in node with the journey's own audit (`findDepthFights` on `buildGardenCampus(campus, { kitFinish: 'pink-jet-age' })`
and on `buildCityKit(assembleNeighborhood(bayou-market-commons), { finish: 'pink-jet-age' })`), probes in
`.runtime/pja-depth-825/probe-campus.mjs` and `probe-kit.mjs` (not committed). Before: campus 54 fights (classic 47),
kit 7 (classic 3). After: campus 46 (every one in classic's set), kit 3 (classic's set).

| # | Pair (hosted) | Cause (campus metres, scene z) | Fix |
| --- | --- | --- | --- |
| 1 | `campus:core / campus:slab` 0 mm at -2713.4,43.3,-1217.7 | lift/stair shaft tops at `roof.z` share the roof slab's top plane; the rounded ivory headhouse (inset 0.04, radius 1.2) leaves the rect corners open, where classic's stone headhouse boxes covered them | `garden-campus.js`: under forms the shafts stop at the roof slab's soffit (`roof.z - slab`); the slab closes them, no face inside or on the slab. Classic path unchanged (`shaftTop = roof.z`). |
| 2 | `campus:guard-glass / campus:jet-age:ivory` 0 mm at -2697.6,35.3,-1217.8 | bullnose cap top at `floor.z1` = the terrace guard's underside | `CAMPUS_JET_AGE.bullnoseRecess = 0.003`: each bullnose is 6 mm shorter about the same centre, its caps 3 mm inside the slab above and the stone band below |
| 3 | `campus:jet-age:chrome / campus:timber` 0 mm at -2715.4,22.2,-1213.4 | pilotis capital top at `item.height - 0.22` = the pergola edge beam's top | `pergola.columnRecess = 0.003`: the column is 3 mm shorter, its capital buried in the beam |
| 4 | `campus:jet-age:ivory / campus:slab` 0 mm at -2714,35.3,-1274.7 | bullnose cap top on the slab top at an open plate corner | bullnose recess (as 2) |
| 5 | `campus:jet-age:ivory / campus:stone` 0 mm at -2714.1,27.3,-1277.5 | bullnose cap bottom on the stone band's underside (and top on its top) | bullnose recess (as 2) |
| 6 | `campus:jet-age:pink / campus:timber` 0 mm at -2706.9,50,-1265.6 | headhouse band top (`base - 0.02` = `head.z1 - 0.25`) equals the timber door head's top (`head.z1 - cap`), and the band's outer face at the rect edge equals the door head's east face | `headhouse.bandDrop = 0.003`, `headhouse.bandInset = 0.003`: across the door bay the band is buried in the timber; elsewhere it is 3 mm lower and 3 mm inside the rect |
| 7 | `garden-court:city-kit/bronze-satin / trim-ivory` 0 mm at -2648.4,22,-1341.9 | capsule sign plate underside (`signUp - plate/2` = ground + 3.6) equals the canopy fascia strip's underside | `city-kit/render.js`: under forms the plate and its round ends use `city-kit/trim-ivory:plate`, the existing overlay pattern (polygon offset factor -1, units -2), one layer ahead of the fascia and behind the lettering (-2/-4) |
| 8 | `garden-court:city-kit/bronze-satin / trim-ivory` 19.9 mm at -2649.3,22,-1341.9 | plate front (o = 0.08) 2 cm ahead of the fascia strip front (o = 0.06); a 0.66 m plate needs 57 mm or a bias | plate overlay (as 7) |
| 9 | `garden-court:city-kit/limestone / trim-ivory` 19.9 mm at -2657.8,23,-1341.9 | plate front 2 cm ahead of the wall band of a loggia/recessed bay | plate overlay (as 7) |
| 10 | `market-row:city-kit/limestone / trim-ivory` 19.9 mm at -2628.4,23.1,-1328.1 | same as 9 on Market Row | plate overlay (as 7) |

Why not a millimetre move for 8–10: the plate's front must stay behind the lettering at o = 0.09, and the model needs
`safeGap(0.66 m)` = 53 mm (57 mm at the 120 m cap), so no placement inside that centimetre clears it; the overlay bias is the
repository's pattern for a thin layer on a surface (paint, signs, tree grates).

## Files owned

- `preview/e2e/depth-layers.js`: `RIVER_OAKS_FINISH` (validated name, default `classic`) → `?finish=` on the page URL; `finish` in the result and evidence.
- `preview/src/garden-campus-jet-age.js`: the four constants and their use (band, bullnose, pilotis).
- `preview/src/garden-campus.js`: shaft top under forms only.
- `preview/src/city-kit/render.js`: `signPlate` material under forms only (`renderShell` takes it as a trailing argument).
- `preview/tests/pink-jet-age-depth.test.js`: new; one assertion per pair, plus "pink adds no pair classic lacks" for the campus and the Commons kit.
- This ledger.

## Checks

| Check | Result |
| --- | --- |
| `node --test preview/tests/pink-jet-age-depth.test.js` | pass 2/2 (27 s campus, 1.7 s kit) at load ~118 |
| Mutation check: each offset reverted in turn (`bandDrop=0`, `bandInset=0`, `bullnoseRecess=0`, `columnRecess=0`, `shaftTop=roof.z`, `signPlate=null`), test rerun, sources restored | each run fails exactly the assertion for its pair: band top (pair 6, facing up at -2706.6,46.0,-1227.0), band face (pair 6, facing east at -2706.9,50.0,-1265.6), bullnose/slab (pair 4 at -2695.2,23.3,-1277.7), pilotis/timber (pair 3 at -2715.2,22.2,-1200.0), core/slab (pair 1 at -2714.3,43.3,-1297.7), bronze-satin/trim-ivory 0 mm and 20 mm (pairs 7–8). Log `.runtime/pja-depth-825/mutate.log` (not committed). |
| Focused suites: `node --test` on pink-jet-age-depth, garden-campus-jet-age, jet-age-forms, district-depth, depth-layer-audit, city-kit, city-kit-batch/effort/pipeline/reference/shipped-quarters/studio, garden-campus-kit-finish, kit-finish-live, garden-campus-finish/fitout/ceilings/partitions/readiness/district, east-garden-commons, bayou-heights, streetscape-kit | 157/158 at load ~100: the one failure, garden-campus-readiness "fresh snapshots do not complete startup until a correlated application acknowledgement" (a socket timing test, no file of this branch), passes 12/12 rerun alone at load 64 |
| `RIVER_OAKS_FINISH=pink-jet-age RIVER_OAKS_DISTRICT_REVISION=east-garden-commons-market-1 node preview/e2e/experience-runner.js development depth-layers` before the fix (sources from `origin/main` `5ba4a3f0`) | failed as expected, 45 s, 2026-11-01 11:01Z at load 5.6: exactly the 10 hosted pairs (report `.runtime/pja-depth-825/report-depth-before-pink.json`, not committed) |
| Same after the fix (expect 0 new pairs) | on `5ba4a3f0` + fix, 11:38Z start (load 12.1): passed, 98.8 s, 0 new pairs, 3 listed pairs gone (161 of 164 remain), three stations (District arrival 246 fights, east of campus 252, Commons 252). Not rerun on the `0d7b021d` fast-forward (host load 15–90 for 3 h; Val asked to land, hosted depth journey is the gate) |
| Same under classic (expect unchanged known list, no new pairs) | 13:02Z on `5ba4a3f0` + fix at load 54–280: failed after 110 s on `The town did not confirm this action` (multiplayer ack timeout under host starvation, no depth result; not counted). Not rerun locally (same reason); hosted `preview experience (depth)` runs classic |
| `pnpm run verify` (core) | not run locally: load never fell below the gate of 8 in 3 h; Val (2026-11-01 ~14:15Z) asked to commit, push and merge, so the hosted `preview` aggregate is the gate. Focused on `0d7b021d` + fix: pink-jet-age-depth, garden-campus-jet-age, jet-age-forms, city-kit, district-depth, depth-layer-audit 39/39 pass |
| `python3 scripts/check_secrets.py --staged` | see commit |

## Gaps

- The browser journey has not yet run locally in either finish; the node audit is the same code path as the page's
  `window.__riverRenderAudit.depthFights()` but at one station each (whole campus, whole Commons kit) rather than the
  journey's three stations with the District present, so the journey remains the gate.
- The polygon-offset plate (7–10) is a bias, not a move; if Val prefers a geometric fix, the alternative is a thicker
  plate (front at o ≥ 0.12) with the lettering moved to o = 0.13 under forms, a visible change to the capsule.

## Next step

Wait for load < 8, run the depth journey under pink (reproduce on `decb4e9a` via a detached snapshot, then on the branch),
then classic, then `pnpm run verify`; commit signed; draft PR via REST; patch the register with the PR number.
