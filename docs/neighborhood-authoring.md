# Neighborhood authoring

The offline neighborhood compiler builds reviewable candidates from versioned recipes. It generates a connected rectangular street lattice, blocks, frontage parcels and seeded building-template placements within existing Studio budgets. Optional fixed architectural modules provide shop rows and court shells in World Studio. These are authoring candidates; rendered acceptance remains tracked separately in the task ledger.

## Generate and preview

```sh
node scripts/neighborhood.mjs build --recipe config/neighborhoods/garden-blocks.json --out data/generated/neighborhoods/garden-001
```

Open `data/generated/neighborhoods/garden-001/preview.svg` for the top-down preview. In World Studio, choose **Open JSON** and open `region.json` from the same directory. The directory also contains `world.json` compiled through the existing authoritative region compiler, `diagnostics.json`, and `authoring.json` with the recipe, baseline, resolved result, template assignments, manual overrides and approvals. Keep the authoring artifact with the region export; the region alone cannot record regeneration history. Nothing is published or added to the shared District.

Every candidate directory must be new. The command refuses to overwrite any existing directory and has no force option. All input, geometry and region validation runs before creating the candidate. The complete authoring export, including provenance and retained history, must fit the same 2 MiB budget used when reopening it; a recipe that fits by itself can still exceed this output budget. Such a build fails before applying or writing a candidate. Files contain no clocks; equivalent recipes generate identical bytes. If a disk write fails, retain the incomplete directory for diagnosis and use a new path; only the final `authoring.json` marks that every export was written.

## Review candidates in World Studio

Choose **Neighborhood** in World Studio. Start with Garden Blocks, Garden Market or Garden Court, or open a recipe or authoring JSON. Choose a variation seed, then **Preview candidate**. The detached top-down preview shows the proposed layout and diagnostics. **Apply candidate** replaces the current region as one undoable edit; **Cancel preview** leaves it unchanged. Changing the seed invalidates the preview. A changed document also requires a fresh preview before application. Generation runs in a cancellable worker with a time limit.

After applying, edit buildings in the normal inspector. Select an object, reopen Neighborhood and choose **Preview approval of selected object**, then apply to retain it during later regeneration. Undo/redo restores the region, recipe baseline and approvals together. **Save on device** and **Reopen saved draft** retain the authoring baseline alongside your latest edits. **Export authoring** reconciles those edits, including deletions, into a portable artifact; reopen that artifact in Neighborhood to continue elsewhere. Ordinary **Export JSON** remains a region-only export and requires the previous artifact for CLI regeneration. Opening an unrelated ordinary region clears its active neighborhood context; undo restores that context.

Imports validate both the checksum and consistency between resolved geometry, generation and authored history. Editing an artifact by hand is not the way to edit a building: use the inspector or pass a Studio region export to the CLI. Geographic fit controls still require offline recompilation as described below. These browser controls do not publish or update a shared world.

## Edit and regenerate

Edit the candidate in Studio and use **Export JSON**. Pass that file alongside the artifact from which it was edited. Use a new recipe seed to vary eligible templates while preserving authored changes.

```sh
node scripts/neighborhood.mjs build --recipe config/neighborhoods/garden-blocks.json --previous data/generated/neighborhoods/garden-001/authoring.json --edited /path/to/world-studio-region.json --approve h-west-south-0-0 --out data/generated/neighborhoods/garden-002
node scripts/neighborhood.mjs build --recipe config/neighborhoods/garden-blocks.json --previous data/generated/neighborhoods/garden-002/authoring.json --out data/generated/neighborhoods/garden-003
```

`--approve` may repeat and records explicit object approvals. Approved objects become persistent overrides. Manual additions, edits and deletion tombstones also persist, including deletions whose generated slots disappear and later return. An intentional edit or deletion in a supplied Studio export updates that override; opening an artifact or changing a seed never discards it. There is currently no bulk reset or unapprove command. To retain alternatives, branch from an earlier candidate into a new directory.

The compiler refuses changes that conflict with preserved objects. Errors identify offending IDs and the failed constraint, such as road clearance, parcel setbacks, coverage or building overlap. Resolve the recipe or deliberately edit the Studio object and create another candidate. It never moves a landmark or drops an authored override to make validation pass. A changed recipe ID or geographic frame requires an explicit future migration workflow. Authored terrain also blocks bounds changes, which would otherwise silently move and stretch its grid.

## Recipe controls

`streets` defines authored north/east guide positions, stable IDs and widths. Intersections form connected roads; adjacent guides define blocks. Parcel rows face the bounding east/west streets. `constraints` controls minimum frontage, setbacks, maximum coverage and maximum height. `templates` supplies reusable building dimensions and kinds; the seed and stable building ID select among templates that fit. `reserved` rectangles keep candidate parcels and buildings out of handcrafted areas. Use stable street IDs when changing dimensions; renaming them changes generated identities.

Optional `spawn: [east, north]` sets the initial arrival and first arrival marker in local metres, at least 1 m inside the bounds. The stock recipes place arrival on the inner sidewalk beside the shops, clear of road junctions. Check a custom arrival with **Walk through**; coordinate validation does not certify its route. Existing recipes without `spawn` keep their original corner arrival. A spawn edited in Studio remains an authored override during regeneration, including when the recipe's arrival changes. The other three arrival markers remain perimeter review points.

The generator reserves the actual shared street sidewalk and curb widths. Roads and sidewalks cannot cross a handcrafted reservation or extend outside the region. It rejects layouts beyond 16 blocks, 32 parcels, current Studio limits or a template's usable footprint. Unsupported input fields and nonfinite values fail. It does not shrink architecture until it fits or silently expand the site. Change the explicit production constraints instead.

The recipe frame records local east/north metres and source attribution. The included fixture is synthetic and uses `LOCAL:METRES`. Exported creator worlds use their existing local-metre runtime contract. The geographic adapter below retains the source frame and provenance in the authoring artifact; an export alone does not establish survey accuracy.

## Fixed architectural modules

Garden Market builds sixteen retail envelopes from 56 fixed modules at its default seed. Its 24 m minimum frontage puts two buildings along each block edge while retaining the street grid and 3 m setbacks. Garden Court builds six envelopes from 20 modules around a reserved green court at its default seed. Module counts vary with the seed. Both are deliberately small synthetic layouts. Their recipe `architecture.bindings` assigns every template an assembly (`shop-row` or `court-shells`) and a palette (`market` or `court`). Templates must have widths of 8–32 m in 4 m increments, depths of 12–20 m and heights of 7.65–15 m. Modules retain their dimensions inside these envelopes; increasing an envelope does not stretch a facade. A candidate may contain at most 256 modules.

Existing authoring files keep their embedded recipe, including the earlier eight-building Market layout. Reopen the authoring file and change its seed to preserve that layout. Selecting the current Market preset explicitly changes parcel density; if that conflicts with approved or edited buildings, preview refuses the change and retains your draft. It does not relocate approved work to fit the new parcels.

```sh
node scripts/neighborhood.mjs build --recipe config/neighborhoods/garden-market.json --out data/generated/neighborhoods/market-review-001
node scripts/neighborhood.mjs build --recipe config/neighborhoods/garden-court.json --out data/generated/neighborhoods/court-review-001
```

Architecture-enabled candidates also export `architecture.json`: the recorded kit source hashes, per-building parts, transforms, wall collision, floor supports, sockets and fallback diagnostics. The compiler and renderer use the immutable snapshot recorded in `config/neighborhoods/kit-snapshot.json`. Each generated placement records its assignment, palette, facade direction, original dimensions and kit revision. Approved or manually edited placements retain this binding when recipe assignments change. An unavailable kit revision falls back visibly instead of silently upgrading approved work.

Open the candidate's `authoring.json` through Neighborhood to see its modules in Studio and walk through supported storefront openings. The same compiled plan supplies rendered geometry and private walking collision/supports. Ordinary `region.json` and `world.json` keep the existing region building contract and blockout envelopes; the sidecar does not change shared-world authority or publication. Opening only `region.json` loses the modular authoring context.

Unsupported authored dimensions, custom interiors or missing assignments retain their original solid blockouts and produce diagnostics. Terrain cells touching an envelope must vary by at most 0.15 m. This conservative check includes interior peaks and dips and may reject a steep cell that only partly touches the envelope. Author a suitable foundation/terrain or retain the blockout; the generator does not flatten terrain or move the building to conceal a conflict.

Run `node scripts/neighborhood-measure.mjs /path/to/new-report.json` to repeat five fresh-process exports per preset, compare every exported byte and exercise a moved approved building, deletion and manual place across regeneration. The report records local CLI timings, input controls, output counts and preservation evidence. It measures automated production work, not human minutes saved, visual quality or GPU performance.

For the broader regeneration review, run `node scripts/neighborhood-review.mjs /tmp/neighborhood-review-001` with a new output directory whose parent exists. It exports each modular preset twice for its default seed and six additional seeds, checks every exported byte, measures instantiated Studio bounds and frontage directions, walks street/entrance/exit/diagonal routes with the production solver, checks blocking walls, and preserves ten categories of authored state through successive rerolls. The report includes source fingerprints, per-route endpoints and comparisons with the manually authored Market Street and Garden Neighborhood blockouts. It covers flat, unrotated stock candidates; it does not certify arbitrary geography, occupancy or shared-world movement.

Run `pnpm run test:experience neighborhood-review` for the separate matched 3D comparison in the existing local browser fixture. It waits its turn in the shared browser queue and writes timestamped images, camera metadata and a source manifest under `output/playwright/neighborhood-review-*/`. Inspect the images: passing metadata checks does not establish visual quality. The [regeneration review ledger](superpowers/plans/2026-10-23-neighborhood-regeneration-review.md) records the before/after evidence, corrections and outstanding acceptance checks.

## Use a geographic reference

Prepare a controls recipe with `bounds_m` inside an existing local world-v1 export, spanning 40–512 metres in each direction. Keep the source file unchanged. The adapter accepts the existing `EPSG:32615` frame and its WGS84 origin, polygon parcels with holes, roads and optional terrain. It uses the controls recipe's fixed templates, setbacks, coverage, height limit and reservations; its street lattice is replaced by the source road geometry.

```sh
uv run --locked python -m river_oaks.neighborhood_reference --world /path/to/world.json --recipe /path/to/controls.json --out /path/to/reference-recipe.json
node scripts/neighborhood.mjs build --recipe /path/to/reference-recipe.json --out data/generated/neighborhoods/reference-001
```

The adapter crops roads to keep their full road and sidewalk footprints inside the site, retaining the surviving centerlines exactly. Road corridors define blocks. A bounded search places fixed-size templates within source parcels and their assigned blocks, respecting holes, setbacks, existing building footprints and reservations. The JavaScript compiler independently checks the final geometry. A parcel without a fit produces a diagnostic; the search does not prove that every possible placement is impossible. It never shrinks a template or moves an existing building to force a fit.

The reference plan preserves source IDs, source content hash, provenance and limitations. Terrain is resampled within observed coverage; missing terrain produces an explicit flat-ground warning. Source buildings appear as protected reference footprints in the preview, not replacement meshes in the candidate world. Irregular parcels, holes and rectangles too narrow for Studio remain reference overlays; only compatible exact rectangles become editable region parcels. Keep `authoring.json` and `preview.svg` to retain that context. This workflow does not export a replacement for the mapped source world.

Changing the seed selects among the precomputed template options. Changing bounds, templates, reservations or fit constraints requires rerunning the Python adapter into a new reference recipe. Supply the prior authoring artifact and optional Studio export to the normal build command to reconcile authored work. The compiler refuses stale reference controls, incompatible frames and conflicts with retained work. Large source data should be cropped before authoring: candidates retain the existing Studio limits, at most 32 reference parcels, 128 protected footprints and a 2 MiB reference recipe.

## Verification

```sh
node --test scripts/tests/neighborhood*.test.js preview/tests/studio-neighborhood*.test.js preview/tests/streetscape-kit.test.js preview/tests/studio-scene.test.js
uv run --locked pytest -q tests/test_neighborhood_reference.py
pnpm run test:experience neighborhood-authoring
pnpm run verify
pnpm run verify full
```

Behavioral tests exercise deterministic generation, geometric conflicts, Studio document editing, server compilation, repeated regeneration, approvals, persistent deletions, candidate directory protection, separate-process byte identity and Python-to-JavaScript reference compilation. Geographic cases include holes, bent-road clearance, protected landmarks, terrain coverage, stale controls and offsite feature budgets. Studio tests cover history, saves, cancellation and stale results; architectural tests cover fixed envelope fit, retained assignments, facade access, floor supports, resource disposal and terrain fallback. The [task ledger](superpowers/plans/2026-10-22-neighborhood-authoring.md) records passing corrected Studio browser journeys, core and full verification with isolated Redis, plus the six-requirement local acceptance audit. Full verification requires the isolated Redis and browser prerequisites documented in the [agent workflow](agent-workflow.md). None of the synthetic tests establishes survey accuracy, production visuals, native acceptance or deployment.
