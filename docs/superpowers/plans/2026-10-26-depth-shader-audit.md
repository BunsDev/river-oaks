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

## Remaining (`depth-layers-known.json`, 388 pairs)

By source:

- **Reference facades** (`reference-facades.js`): finish panels laid exactly on stone, tile, render and residence panels, and facade roofs 2 cm above panels.
- **Gardens campus** (`garden-campus*.js`): glass, slab, bronze, guard and partition coplanar; ceiling and slab 2 cm apart; interior floor 6 mm over the slab.
- **Green roofs:** "Roof bronze" coplanar with "Roof field" and "Roof path".
- **Store interiors and iPic rooms:** brass, walnut, marble and mirror at 0.5–1.5 cm.
- **District streets and paving:** unnamed `MeshStandardMaterial` layers at 0–9 mm.

## Next step

1. Merge main (`3df540ee`, with #649's city-kit edits beside the planter block) and reverify.
2. Increment 2, already measured in a scratch checkout (378 pairs to 318):
   - building masses draw walls only (no cap 2 cm under each roof sheet);
   - finish batches are named after the materials they draw;
   - plain facade finishes (frames, bands, rails, louvres) are pulled forward over the cladding they sit on;
   - window sills and eaves soffits no longer share planes with walls and eaves.
3. Val's spot at (−2907.952, −1401.081), ground 18.012, 2026-10-27: a long sliver triangle of corner paving crosses the asphalt there. The corner field in `sidewalks.js` is a fan about `corner.center`, which folds back across a corner whose outline is not star-shaped from that centre. Under investigation.
4. Burn the list down builder by builder, largest visible pairs first, rerunning the journey in record mode after each.

## Decisions for Val

1. **Global depth precision.** The geometry fixes remove fights where they are. Two settings would buy distance everywhere:
   - three r186's reversed depth buffer with float depth. This also needs the GTAO pass adapted, and phone support checked.
   - A larger walking near plane than 6 cm.

   Both touch every frame and the phone budgets, so neither is in this branch.
2. **Landing with a known list.** This branch lands the planter, city-kit, the shader fixes and the journey, with 388 earlier pairs listed for burn-down. The alternative is holding it until the list is empty.
3. **Merge order with #649.** The planter block's neighbours change in both branches.
