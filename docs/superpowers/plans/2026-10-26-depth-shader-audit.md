# Depth layers and shader audit (2026-10-26)

Val asked on 2026-10-26 at about 21:50Z, with a capture of a city-kit planter whose mulch was broken by a sawtooth of tan: "comprehensively audit all shaders and comprehensively patch e2e".

## Objective

- Find why the planter flickers, and fix it.
- Find and fix every case of the same kind in the town.
- Audit every custom shader and shader patch.
- Add browser coverage that would have caught all of it.

Task `depth-shader-audit-20261026`, owner river-oaks-3e. Branch `fix/depth-shader-audit-20261026`, worktree `river-oaks-depth-audit`, from main `8b73888a`.

## What was wrong

The planter was not a shader fault. Its brass "rim" was a solid slab across the whole bed, with its top at 0.6125 m. The mulch sat 1.5 mm above it, at 0.614 m.

Depth resolution falls with the square of distance. Measured on this Mac (below), faces 1.5 mm apart stop being separable from 40 m at a low angle and from 80 m at steeper ones. A weaker depth buffer fails nearer. Past that point the slab wins the depth test in triangle-shaped patches that crawl as the camera moves.

The same kind of fault is spread across the town. Faces of different materials share a plane, or sit millimetres to centimetres apart.

## What changed

### `preview/src/depth-layer-audit.js` (new)

- **`findDepthFights(root)`** finds pairs of faces that:
  - face the same way;
  - are of different materials;
  - overlap;
  - are too close for the depth buffer at a distance where the overlap still covers a few pixels.
- **The distance model** is `fightMetres = sqrt(gap * near * 2^24 / slack)`. It uses the walking camera's 6 cm near plane. Visibility comes from the overlap's narrowest width at 700 px focal length and 4 px, capped at 120 m.
- **Pairs that can't reach the screen are dropped:**
  - Buried pairs. A ray going forward from the nearer face leaves some mesh more often than it enters it. Open sheets, such as the paving, cannot hide what they pass through.
  - Pairs below the terrain, and undersides resting on it.
  - Pairs settled by polygon offset. For different planes the front layer must be the one pulled forward; on one plane, either.
- **Also skipped:** alpha-cut foliage and lettering.
- **Scan bounds:** the scan caps itself at 1.5 million faces and reports `truncated`. Faces wider than 1,024 cells go on a short list instead of the grid.
- **`measureDepthPrecision(renderer)`** draws a red plane under a green one at each gap, distance and elevation, and counts the red pixels.

### `preview/src/city-kit/render.js`

Every fight the scan found in both city-kit neighbourhoods:

- **Planter:** a porcelain body to 0.50 m, porcelain walls to 0.60 m, a brass frame (not a slab) on the walls, and mulch from 0.48 to 0.59 m inside them.
- **Floor plate:** stands 4 cm proud of the walls and parapets on every side. It was coplanar with them on unfaced sides.
- **One-storey wings:** no 2 cm wall sliver under the plate. The upper wall starts above the plate.
- **Roof membrane:** sits on whichever deck is uppermost, 8 cm thick.
- **Upper storeys:** start inside the plate, not 2 cm above its soffit.
- **Window heads and sills:** clear the wall pieces they meet by 1 cm.
- **Piers** stay within their own face. **Bay fascias** stop 2 cm short of a face's ends.
- **Storefront:** the layers in the recess (interior panel, display rails and lamps, glass, frames, door) are 6 cm or more apart.
- **Windows:** reveal glass moves 2 cm forward. Context-building window bands stand 7 cm proud.
- **Hedge planter cap:** 10 cm thick, not 5.
- **Water tower:** the roof's base sits 7 cm into its brass disc.
- **Polygon offset:**
  - shop signs: −2/−4;
  - each ground overlay layer pulls harder than the one under it;
  - the tree grate: −4/−8;
  - crossing bars are painted as an overlay.

#649 also edits `render.js`. It moves the planting placement next to the planter block, so whichever lands second resolves a small conflict.

### Shader audit (all 18 files with `onBeforeCompile` or `ShaderMaterial`)

- **Fixed: `room-ground-clip.js`** computed world position without `instanceMatrix` or `batchingMatrix`, so instanced or batched outdoor meshes inside a room footprint were never clipped. It was latent: today the clip only reaches the ground mesh.
- **Fixed: `near-camera-fade.js`** handled instancing but not batching.
- **Fixed: `materials.js` `physicalSurface`** read `vMapUv` outside `#ifdef USE_MAP`, so an unmapped surface failed to compile.
- **No change, noted:**
  - `vehicle-glints.js` and `angel-wings.js`: their points ignore fog and pixel ratio.
  - The `fract(sin(x) * 43758.5453)` hashes in `materials.js`, `district.js` and `reference-facades.js` are fine at highp. A change would alter the look.
- **No fault found:** every other hook. That includes cache keys, chaining, chunk anchors, `vColor`/`sampledDiffuseColor` guards, the emerald cut's anchor checks, and the skin scatter's prepended constant.

### Browser coverage: `preview/e2e/depth-layers.js` (new)

The journey runs at the Commons revision, which composes the District, the Gardens campus and the Commons.

1. **Measures** this renderer's depth reach. This is evidence only.
2. **Scans** at the District arrival, east of the Gardens campus, and inside the Commons, after streaming settles. It uses the fixed model (slack 4), so every runner gets the same answer.
3. **Fails on any surface pair** not in `preview/e2e/depth-layers-known.json`.
4. **Renders the shared shader patches** on plain, instanced, batched and unmapped meshes, with their real modules.
5. **Fails** on any shader compile error in the town, and on any page error.

`RIVER_OAKS_DEPTH_LAYERS_RECORD=1` rewrites the known list.

The development-only hooks are `window.__riverRenderAudit.depthFights()` and `depthPrecision()`, behind `?render-audit=1`. Hosted CI gets a `depth` experience shard. The journey is not part of local `verify full`, whose experience stage already uses about 90% of its 20 minutes.

## Evidence

| Check | Result |
| --- | --- |
| `node --test preview/tests/depth-layer-audit.test.js preview/tests/city-kit.test.js` | 21/21. The city-kit depth test fails on main's `render.js` and passes on this one (red check). |
| City-kit scan, fixed model | 69 classes on main, 0 now, in both neighbourhoods |
| `depth-layers` record run | Passed, 40 s, 388 pre-existing pairs listed. About 1.2 million faces per station, 5.6–6.0 s each. |
| Red check: the journey with main's three shader files | Failed exactly the three patched cases: instanced clip `inside: 1`; batched fade `near: 1`; unmapped surface "Fragment shader is not compiled". The plain clip still passed. |
| Final green journey on this tree (`RIVER_OAKS_E2E_REPORT=depth-layers-7.json pnpm run test:experience depth-layers`) | Passed, 38 s: 12 checks, 388 listed pairs, 0 new. Report sha256 `608319cef7c3544e…`. |
| `pnpm run verify` (core), Python 3.12 | **Passed on attempt 5** (2026-10-27 02:10–02:17Z, load 17–19): agent 276/276; preview 4,179 passed, 1 skipped; server 915 passed, 225 skipped (Redis cases); desktop 120 passed, 3 skipped; build; Python lint, format and tests; demo, demo-verify; secrets. Receipt `9c785d456f59b69a…`. Attempts 1, 2: the `land-pr` queued-lander wake test (30 s; the file alone passes). Attempt 3: the Garden Office asset manifest still held `materials.js`'s old hash; refreshed with `node scripts/garden-office-manifest.mjs --write` (only that hash, in its 9 records). Attempt 4: five server tests timed out (`request_timeout`, "Campus command timed out") at load 20–75; none touch this branch. All logs kept. |
| Depth reach, Apple M-series, ANGLE Metal | Worst slack 1.57. 1.5 mm separates out to 40 m at 10° elevation and 80 m at 30°/60°. 5 cm holds to 320 m. |

## Main merged (`96ec9e10`, 2026-10-27)

- **Conflicts.** #649 moved city-kit's planting placement into `cityKitLandscape()`. This branch keeps its planter and hedge geometry and drops the old planting lines.
- **New neighbourhoods.** #649 added six Heights neighbourhoods, and scanning them found fights only on party walls. Floor plates stood 4 cm proud into the neighbour's, and copings overhung each other on one plane, in different trims.
- **Party-wall fix.** `buildCityKit` now finds each shell's party walls:
  - the plate stops inside its own wall there;
  - the coping stays on its own parapet, short of the corners;
  - copings stop 2 cm short of a party corner instead of overhanging it.
- **Result.** All eight city-kit neighbourhoods have no fights. The city-kit test now builds every kit recipe in `config/destinations`.
- **Checks.** City-kit, depth-audit, Bayou Market Commons and Bayou Heights tests: 39/39. The journey on the merged tree passed, with 388 listed pairs and none new. Core verify passed on the first attempt (2026-10-27 03:09–03:14Z): agent 284/284; preview 4,221 passed, 1 skipped; server 965 passed, 250 skipped (Redis cases); desktop 127 passed, 5 skipped. Receipt `f0bdc45eadf020dc…`.

## Main merged again (`52c43c7a`, 2026-10-27)

- **verify.yml.** Main's `studewood` shard and this branch's `depth` shard both stay. The workflow parses, with shards streets, places, campus, campus-traversal, commons, heights, studewood, depth, access, playwright and experience.
- **Studewood's kit recipes.** #662's two recipes brought three pairs into the all-recipes city-kit test.
  - Two street sidewalks overlapped plaza paving by 1 m. The kit clipped street paving only at the west edge of the first plaza; Studewood has several plazas, met on any side.
  - A hedge ran 5 cm into a recessed shell's corner pier along the pier's north face. Piers stand 45 cm proud of a recessed face.
- **Fix.**
  - Street paving now yields to every plaza (`yieldTo`). Where a plaza overlaps only part of a street piece, the plaza yields instead. A piece only yields where the other covers that whole end, so no gap opens.
  - Hedges stop at a shell's proud piers (`pierProud`, shared with `renderShell`).
- **Result.** All ten kit neighbourhoods have no fights.
  - Geometry is unchanged in bayou-market-commons, both heights-boulevard recipes, nineteenth-and-yale and yale-street-south.
  - bayou-greenway, yale-icehouse and yale-street-north each lose a 1 m overlap that a lawn strip already covered, so the visible result doesn't change.
- **Checks.** 63 street, ground, kit, depth-audit, Studewood and destination files: 2,352 passed, 0 failed, 15 skipped. Core verify passed on the first attempt (03:39–03:44Z): agent 289/289; preview 4,233 passed, 1 skipped; server 970 passed, 251 skipped (Redis cases); desktop 127 passed, 5 skipped. Receipt `acc85ac49db62c7b…`.

## Main merged a third time (`74f12d76`, Bayou Terraces, 2026-10-27)

Main moved to #663 before the second merge was pushed. `verify.yml` keeps the `terraces` shard beside `depth`. Both new Terraces kit recipes have no fights, so all twelve neighbourhoods are clear. The 68 street, ground, kit, depth-audit, Studewood, Terraces and destination files: 2,396 passed, 0 failed, 16 skipped. Core verify passed on the first attempt (03:59–04:03Z): agent 289/289; preview 4,244 passed, 1 skipped; server 976 passed, 252 skipped (Redis cases); desktop 127 passed, 5 skipped.

The depth-layers journey on this tree (04:04Z, 37 s) passed:
- the 388 listed pairs remain, with none new and none fixed since listing; the junction paving and kit trims don't touch the three stations' listed pairs;
- 1.18–1.27 million faces per station;
- the four shader-patch checks pass, with no compile or page errors.

## Increment 2 (2026-10-27): 388 listed pairs to 313

- **`district.js`**:
  - Building masses draw walls only (`setDrawRange` on the extrusion's side group). The cap sat 2 cm under each roof sheet and fought it from the air. Stepped blocks keep a roof sheet at the step, so no terrace opens.
  - Plain finishes (frames, bands, rails, louvres) take polygon offset −1/−2 over the cladding they sit on.
  - Finish batches are named for the materials they draw (`finish:reference-gilt`, not a parameter key), so the list and census can say what they are.
- **`reference-blocks.js`**: the wall under a window stops 6 cm lower, at its sill's underside; the soffit board is 6 cm deep.
- **`depth-layer-audit.js`**:
  - It scans only what is drawn: a geometry's draw range, and its groups only when the material is an array, as three.js draws it.
  - A `focus` option scans around one spot.
  - Undersides within 10 cm of the terrain count as unseen (it was 2 cm). A new test fails under the 2 cm rule (a planter sunk under paving 6.4 cm proud) and keeps a bench seat's underside.
- **The list** went from 388 to 313 pairs:
  - district facades 216 → 152, roofs 17 → 9, other 62 → 57;
  - streets, campus and the Axe unchanged; iPic 9 → 11 (below).
  - 82 pairs went and 37 were renamed in place (the finish names). Seven are new to the list:
  - **Pavers × finish:** street pavers against a finish batch (hoarding, planter, soffit), 3.8 cm apart at (−2812, −1278). It appears only with the finish offset: an A/B scan at the arrival found the offset settles 58 pairs and adds this one. Both faces point down, 19–22 cm above the terrain, under the sidewalk's raised paving, so no camera can see them. A terrain-based rule can't tell; a walking-surface rule would, but could hide real fights under bridges. Listed as a false positive.
  - **Roof × residence panel:** an unnamed mesh (likely a roof sheet) and a residence panel's top, 1.1 cm apart at (−2855.4, 24, −1305). It isn't the finish offset, and a district-only offline scene doesn't reproduce it. Cause not isolated; listed.
  - **Five pre-existing pairs the scan catches only sometimes:** iPic Auditorium carpet × Tuck Room boards and × Upper lounge carpet; campus bronze × stone; campus glass × floor; facade interior × stone. The old audit finds the iPic pairs offline, and no increment-2 change touches these builders. The station scan's coverage varies with what has streamed in, so the ratchet could flake on them; listing them prevents that.
- **Checks**:
  - district, reference-block, audit and manifest files: 2,484 passed, 0 failed, 1 skipped;
  - audit tests 6/6, with the new case red under the old rule;
  - the depth-layers journey recorded at 10:16Z and confirmed by a normal run at 10:17Z;
  - core verify below.

## Val's triangle at (−2907.95, −1401.08)

- **What it was.** A hole, not a fight. A vertical-ray probe and a camera pick found nothing but the pale terrain under a 12 cm wedge: Westcreek Lane bends 1.7° where the District access lane meets it from the west. `joinStreetSegments` mitred only two-way bends, so both segments ended square at the junction, and on the east side (no other street) the asphalt, gutter, curb and pavers all left a wedge of bare ground.
- **First attempt, rejected.** Mitring a road's own pair through junctions closed the hole, but every junction end is interpolated along its whole segment. That moved the side streets' curb returns: tangent kinks of >1 cm went from 10 to 19 of 44, the worst from 0.64 m to 3.79 m.
- **Fix.** `street-profile.js` mitres only the open side, and on only one segment:
  - It applies where a road bends at most 20° through a junction and the outer side, the one no other street meets, is reflex.
  - The segment whose far end is not a junction (the longer, if both qualify) carries that side's cross-section to its neighbour's square end (`startOpen`/`endOpen`, read by `streetPoint` for that lateral sign only), so every band meets its neighbour exactly.
  - Of 11 such wedges in the Commons and Heights revisions, 9 close, at bends of 0.0–2.8°. Two stay square because both ends meet junctions; their bends are 0.04° and 0.00°.
  - All 44 curb tangents are byte-identical to main in both revisions.
- **Checks.**
  - The new street-profile test asserts the junction asphalt is whole and every curb return still meets its straight curb. It fails on square ends (800 bare points) and on the blanket mitre (a curb return moved), and passes with this fix.
  - 35 street, sidewalk, corner, ground and walking files: 226/226.
  - The fixture town's top-down pick at the spot now hits asphalt where it hit terrain; before and after captures are in the session scratchpad.
- **Tools.** The render-audit hooks gained `pick(x, y)` (what a screen pixel sees, nearest first) and `groundProbe([east, north])` (what a vertical ray meets on a small grid). Both are DEV-only, under `?render-audit=1`.

## Remaining (`depth-layers-known.json`, 388 pairs)

By source:

- **Reference facades** (`reference-facades.js`): finish panels laid exactly on stone, tile, render and residence panels, and facade roofs 2 cm above panels.
- **Gardens campus** (`garden-campus*.js`): glass, slab, bronze, guard and partition coplanar; ceiling and slab 2 cm apart; interior floor 6 mm over the slab.
- **Green roofs:** "Roof bronze" coplanar with "Roof field" and "Roof path".
- **Store interiors and iPic rooms:** brass, walnut, marble and mirror at 0.5–1.5 cm.
- **District streets and paving:** unnamed `MeshStandardMaterial` layers at 0–9 mm.

## Next step

Hosted checks on `86afad18` (the third merge): 26 of 26 passed, including the `depth`, `studewood` and `terraces` shards and the aggregate `preview`.

1. Burn the list down builder by builder, largest visible pairs first, rerunning the journey in record mode after each. Isolate the roof × residence-panel pair at (−2855.4, 24, −1305) with a focused browser scan.
2. If Val wants them: main's six curb-return tangents that miss their straight curb by 20–64 cm, at (−2790, −1431), (−2903, −1431), (−2770, −1177) and (−2780, −1431). Each is on a short segment whose far end is a mitred bend, and the return's arc starts at the square tangent. Val's triangle was a different fault (above): a junction wedge, not the corner fan.

## Decisions for Val

1. **Global depth precision.** The geometry fixes remove fights where they are. Two settings would buy distance everywhere:
   - three r186's reversed depth buffer with float depth. This also needs the GTAO pass adapted, and phone support checked.
   - A larger walking near plane than 6 cm.

   Both touch every frame and the phone budgets, so neither is in this branch.
2. **Landing with a known list.** This branch lands the planter, city-kit, the shader fixes and the journey, with 388 earlier pairs listed for burn-down. The alternative is holding it until the list is empty.
3. **Merge order with #649.** The planter block's neighbours change in both branches.
