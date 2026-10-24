# External procedural and geospatial tools: evaluation (#588)

Evaluated on 2026-10-23 against `origin/main` `7bf0bbf6`; extended and re-measured the
same day on `f4aa1670` (heights, GLTFExporter bake, browser rerun). Decision for TypeSafe Place's
long-term city production pipeline: **do not adopt any external procedural tool as a
production dependency now.** Keep the in-house JSON-first pipeline (OSM/USGS data,
the deterministic neighborhood compiler, runtime Three.js geometry), and run one bounded,
reversible Blender experiment only when a human artist needs to author kit modules.
The measured gap is data, not generation: OSM lacks heights for 97% of buildings, and
the project's own USGS LiDAR measured every District height. The east expansion is
authored fictional content ([world expansion](world-expansion.md)), so measured heights
matter only where real mapped buildings are used: today that means validating the
District's estimated heights, without changing its approved appearance.

| Option | Decision | Deciding evidence |
| --- | --- | --- |
| In-house pipeline (OSM + USGS → `district.json`, neighborhood compiler, runtime geometry) | **Keep** | Collision, walk surfaces and rendering derive from one plan; compiler candidate in 0.08–0.09 s, byte-identical; 131 KB JSON shared with the server; highest fidelity |
| Offline baking of in-house render geometry to GLB (three.js `GLTFExporter`) | **Defer to #583; not a drop-in** | Measured: 4.99 MB GLB parses in ~40 ms versus ~0.6 s runtime build, but 23 of 154 materials lose their shader patches (visible roof/facade change) and 49.7 MB of runtime `userData` must be stripped |
| Blender Geometry Nodes for block/district generation | **Reject** | Duplicates the compiler, loses the authority link, 0.13–5.2 MB per District, API churn, corner defects, instanced export slows at scale |
| Blender for authoring fixed kit modules (GLB) | **Defer** | Useful for human-authored detail; trigger and exit criteria below |
| Houdini (Indie/Engine) | **Reject now** | Batch use needs a paid Engine licence or Indie-only file formats; duplicates the compiler; no team expertise; not run |
| ArcGIS CityEngine / PyPRT / Vitruvio | **Reject** | No macOS; $2,200+/yr subscription; PyPRT web/redistribution restrictions; not run |
| Unreal PCG + World Partition | **Reject for the web pipeline; defer for native** | Engine-bound output; Unreal is an offline blockout, not the shipped client; not run on this host |
| OSM2World (turnkey OSM → glTF) | **Reject** | 21.6–27.3 MB GLBs for nine buildings, hundreds of draw calls, own coordinate origin |
| OSM data via the existing Python bridge, plus 3DEP LiDAR heights | **Keep; use LiDAR heights for real mapped buildings** | OSM footprints exist but 97% lack heights and roads have no widths; the project's own LiDAR subset measured all nine District heights (9–13 points/m²) |
| Overture buildings | **Reject as a height source; keep as a cross-check** | 96.7% height coverage, but its good heights are the same USGS LiDAR; both District buildings with ML heights were 3.8–10.2 m wrong |
| Google Photorealistic 3D Tiles | **Reject** | Terms forbid caching, offline use and deriving geometry |
| 3D Tiles (`3d-tiles-renderer`), glTF-Transform/meshopt | **Defer** | Revisit if streamed GLB content becomes the delivery format (#583) |

## The River Oaks constraint that decides most of this

The product is a browser Three.js client with an authoritative Node server. The
server's movement environment (`createWalkingEnvironment`, `preview/src/walking.js`,
used by `server/world.js`) is built from world JSON: building rings,
`collisionPolygons`, roads and terrain. The browser builds facades from the same
records at runtime (`preview/src/district.js`, `reference-facades.js`,
`reference-blocks.js`). The neighborhood compiler emits envelopes, wall collision,
floor supports and sockets in one plan.

Any external tool that outputs only meshes therefore produces render-only geometry.
Using it would need either a reverse step (mesh → footprints/colliders) or a
second, hand-kept collision source. Either reintroduces the client/server drift the
current design avoids. That constraint, not feature lists, rules out generating
blocks in an external tool.

## Representative block

The block is the real River Oaks District (≈254 × 290 m): nine OSM building
footprints (5–13 vertices), 39 road/path centrelines and their observed base
elevations from the bundled `preview/public/data/district.json` (SHA-256
`c5662c26…0326`). The same input fed every pipeline.

### Blender Geometry Nodes (run)

`experiments/procedural-tools/blender_block.py` creates its node graph from code
(reviewable, diffable source; no opaque `.blend`). Per building: extrude the
footprint by height (stone sides, roof top), sample bay points every 3 m along the
outline, align modules to the wall, place a storefront module per bay and a window
module per bay per storey (3.3 m storeys above a 4.25 m retail storey, matching
`upperWindowLevels`). Roads are curve-to-mesh ribbons at their game widths. Blender
5.2.3 LTS ran headless on Apple M5 Max (macOS 26.7.1).

| Variant | Triangles rendered | GPU instances | GLB bytes | glTF meshes / primitives | Wall time |
| --- | ---: | ---: | ---: | --- | ---: |
| realized (mesh per object) | 97,022 | 0 | 4,987,576 | 49 / 76 | 3.7 s |
| joined (one mesh) | 97,022 | 0 | 5,238,436 | 2 / 6 | 0.7–2.3 s |
| joined + meshopt | 97,022 | 0 | 1,439,124 | 2 / 6 | 0.7 s |
| instanced (`EXT_mesh_gpu_instancing`) | 97,022 | 4,024 | 256,828 | 67 / 94 | 1.3–4.1 s |
| instanced + meshopt | 97,022 | 4,024 | 129,452 | 67 / 94 | 1.2 s |
| joined, 4 × 4 tiles (≈1.2 km²) | 1,552,172 | 0 | 83,732,360 | 2 / 6 | 3.2 s |
| instanced + meshopt, 4 × 4 tiles | 1,552,172 | 64,384 | 1,820,084 | — | 75.0 s |

Findings:

- **Reproducible.** Three fresh processes produced byte-identical GLBs for each
  variant, and the lint-formatted script reproduced the same hashes.
- **Fast to evaluate, slow to export instances.** Graph evaluation took under 0.1 s.
  The glTF exporter dominates. Instanced export grew from ~1.3 s to 75–82 s at 16×
  the content, while joined export stayed at ~3 s.
- **Instancing works but is not shared.** The exporter wrote distinct storefront and
  window modules correctly, but duplicated each module mesh per building (18 copies
  of two meshes). `EXT_mesh_gpu_instancing` is in `extensionsUsed`, not
  `extensionsRequired`, so a loader without it silently shows one module per node.
- **Geometry quality needs more graph work.** Spacing modules along the whole outline
  places 43 of 777 window bays (5.5%) and 54 storefront bays (6.9%) across a building
  corner. The in-house per-edge facade logic (`facadeEdges`) avoids this. Fixing it in
  Geometry Nodes means per-edge resampling and corner rules, which the in-house code
  already has.
- **Maintenance friction appeared immediately.** Blender 5.x moved modifier inputs
  from ID properties (`mod["Socket_1"] = v`) to `mod.properties.inputs.Socket_1.value`,
  so 4.x scripts fail. `Material.use_nodes` is deprecated for 6.0. Converting an
  object to a mesh silently drops Geometry Nodes instances unless the graph realizes
  them: the first export had 434 triangles instead of 97,022, with no error.
- **No authority data.** The GLB carries no collision, walk surface, entrance or
  socket data. The joined variant also loses building IDs.

### OSM2World (run)

OSM2World 0.4.0 (LGPL) on the same bounded OSM API extent as
`scripts/build_district.py`:

| LOD | GLB bytes | Embedded images | Triangles | glTF meshes | Wall time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 21,606,320 | 20 (20.1 MB) | 6,067 | 484 | 6.9 s |
| 3 | 27,309,860 | 32 (25.4 MB) | 8,671 | 583 | 8.6 s |

It includes every way the OSM API returns for the box (≈800 × 1,025 m of partial
ways), in its own local frame centred on the data rather than EPSG:32615 relative to
the District origin. Heights default where OSM has none.

### OSM data completeness (measured)

An Overpass query around the District and its eastern expansion land
(29.735–29.750 N, 95.440–95.462 W, ≈3.3 km², OSM base 2026-10-23T05:33:51Z):

| Tag | Buildings with tag (of 1,560) |
| --- | ---: |
| `height` | 35 (2.2%) |
| `building:levels` | 27 (1.7%) |
| either | 44 (2.8%) |
| `roof:shape` | 3 (0.2%) |
| `name` | 76 (4.9%) |

Of 1,132 vehicle roads, 0 have `width`, 324 have `lanes` and 81 have any `sidewalk*`
tag. 1,263 buildings are tagged only `building=yes`.

Every OSM-driven generator (Blosm, OSM2World, CityEngine's OSM import, Houdini Labs
OSM nodes) reads the same tags, so each would invent about 97% of massing and every
street cross-section, as River Oaks already does. The bottleneck is observed data,
not generation. The project already ingests USGS 3DEP LiDAR for vegetation
(`scripts/fetch_district_lidar.py`); deriving building heights from the same
public-domain source attacks the real gap without a new tool; the measured check is
below.

### Measured building heights: own LiDAR versus Overture (run)

Added 2026-10-23 on `origin/main` `f4aa1670` to test the two height claims above.

`scripts/fetch_district_lidar.py` re-fetched the public-domain USGS 3DEP
`TX_Coastal_B1_2018` subset in 21 s (63 tiles, 20.8 MB, 1,169,790 clipped points,
matching `docs/vegetation.md` exactly; 541,561 are class 6, building).
`experiments/procedural-tools/lidar_heights.py` takes class-6 points inside each
footprint shrunk 1.5 m, subtracts the median class-2 ground in a 2–12 m outside band,
and reports the 95th percentile (single-point maxima include noise up to 260 m).

`experiments/procedural-tools/overture_heights.py` ran a bounding-box query against
Overture release `2026-10-21.0` (ephemeral DuckDB 1.4.1, 37 s, no project dependency)
over the same ≈3.3 km² box as the Overpass query.

| Building (`osm-way-…`) | Authored height (source) | LiDAR p95 | Overture height (from) |
| --- | ---: | ---: | ---: |
| 625330785 | 33.0 (photo 28 m + 5 m penthouse, #363) | 25.2 | 15.0 (Microsoft ML) |
| 625330790 | 20.0 (default levels) | 21.3 | 24.7 (USGS LiDAR) |
| 625330792 | 14.5 (photo) | 11.8 | 12.7 (USGS LiDAR) |
| 625330798 | 18.5 (photo) | 16.9 | 17.4 (USGS LiDAR) |
| 625333006 | 9.2 (photo) | 7.9 | 8.6 (USGS LiDAR) |
| 625333008 | 13.5 (photo) | 11.3 | 7.5 (Microsoft ML) |
| 625333009 | 10.6 (photo) | 11.3 | 12.0 (USGS LiDAR) |
| 878472795 | 23.5 (photo) | 22.4 | 23.1 (USGS LiDAR) |
| 878472797 | 23.5 (photo) | 22.1 | 23.2 (USGS LiDAR) |

Findings:

- **The project already holds measured heights.** LiDAR covered all nine footprints
  at 9.4–13.2 points/m². Excluding the deliberate penthouse override, the
  seven photograph-estimated heights sit 0.7 m below to 2.7 m above the LiDAR p95,
  mostly above; whether that comes from parapets, the p95 statistic or the estimates
  was not separated. The one default-levels height (625330790) is 1.3 m low.
- **Overture's coverage is real, but its quality depends on its source.** In the box,
  1,481 of 1,531 Overture buildings (96.7%) have a height, against 2.8% in OSM.
  Heights come from Microsoft ML Buildings (911) and USGS LiDAR (467). Its LiDAR
  heights track ours within +0.5 to +3.4 m. Both District buildings with ML heights
  are wrong by 3.8–10.2 m, including the tallest building in the District.
- **Conclusion.** The height gap is closable with the 3DEP source and acquisition
  script the project already runs. Overture adds no measured source beyond it here.
  Its ML heights would import the largest errors observed. Use Overture only as an
  independent cross-check, or where LiDAR is missing or predates construction (the
  2018 flight). Every option still invents facades, storeys and street cross-sections.

### In-house pipeline (run)

The deterministic neighborhood compiler (in-flight `neighborhood-authoring` task,
staged revision on `52379be6`, not yet on `main`) built Garden Market (8 buildings,
28 modules) and Garden Court (6 buildings, 20 modules) in 0.08–0.09 s wall time per
run. Three runs per preset produced identical bytes. Its output already carries what
the external tools lack: approvals and manual overrides that survive regeneration,
wall collision, floor supports, sockets, kit provenance and Studio integration.

### Browser delivery (measured)

`experiments/procedural-tools/measure-browser.mjs` rendered each case in a fresh
headless Chromium page (ANGLE Metal, Apple M5 Max, 1440 × 1000 at DPR 1) with the
same lights, environment and cameras. It ran through the shared browser lock.
Values are medians of three runs, and every run had zero page errors. The report is
summarised in [`acceptance/procedural-tools-588/summary.json`](acceptance/procedural-tools-588/summary.json).

| Case (overview camera unless noted) | Transfer | Draw calls | Triangles | Build or parse | First render | CPU submit p95 | JS heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| In-house `buildDistrictBuildings` | 131 KB JSON (already needed by server/walking) + shared CC0 material textures | 343 | 628,764 | 536 ms | 293 ms | 1.2 ms | 96 MB |
| Blender joined | 5.24 MB | 5 | 97,010 | 3 ms | 8 ms | 0.2 ms | 39 MB |
| Blender joined + meshopt | 1.44 MB | 5 | 97,010 | 5 ms | 7 ms | 0.2 ms | 32 MB |
| Blender realized | 4.99 MB | 73 | 97,004 | 6 ms | 7 ms | 0.3 ms | 41 MB |
| Blender instanced | 257 KB | 91 | 97,004 | 5 ms | 14 ms | 0.3 ms | 29 MB |
| Blender instanced + meshopt | 129 KB | 91 | 97,004 | 7 ms | 14 ms | 0.3 ms | 29 MB |
| Blender joined, 4 × 4 (wide camera) | 83.7 MB | 5 | 1,552,160 | 17 ms (+106 ms fetch) | 18 ms | 0.2 ms | 264 MB |
| Blender instanced + meshopt, 4 × 4 (wide) | 1.82 MB | 1,010 | 1,154,254 | 44 ms | 28 ms | 2.4 ms | 57 MB |
| OSM2World LOD 1 | 21.6 MB | 296 | 4,245 | 75 ms | 278 ms | 1.3 ms | 94 MB |
| OSM2World LOD 3 | 27.3 MB | 389 | 6,789 | 89 ms | 397 ms | 1.0 ms | 107 MB |

How to read this:

- **The scenes are not equivalent.** The in-house builder renders the approved
  District: photographed facades, signage, canopies, green roofs, display rooms and
  interiors. That is 6.5× the triangles and far more materials than the generic Blender
  block. The cheaper Blender rows show what a generic block costs; they do not show
  the same content rendered more cheaply.
- **Frame time does not separate the cases.** Every case held ~16.8–18.3 ms p95, the
  60 Hz vsync interval, on this GPU. CPU submission and draw calls are the useful
  signals; physical mobile devices remain unmeasured.
- **The in-house cost to watch is main-thread build time:** ~0.53 s per District.
  Pre-baked GLBs parse in 3–7 ms. At the 3–5× expansion target, runtime building
  needs chunked or worker generation (#583), or offline baking of render geometry.
  That baking does not need an external tool: three.js `GLTFExporter` bakes the
  in-house generator's own output (measured below, with its fidelity limits). Treat
  it as a #583 option, not a reason to adopt Blender.
- **Re-measured on `f4aa1670`.** A second full run (45 runs, host load 7–17) reproduced
  every case's draw calls and triangles exactly, with the in-house build at 571–616 ms
  ([summary](acceptance/procedural-tools-588/summary-f4aa1670.json)).
- **Instancing trades bytes for draw calls.** Instanced + meshopt is the smallest
  transfer (129 KB per District), but the exporter emits one instanced node per
  building and module. At 4 × 4 that is 1,010 draw calls and 2.4 ms CPU submission,
  about 12× the joined variant. Joined is 5 draw calls but 84 MB uncompressed at 4 × 4.
- **OSM2World is the worst delivery option:** 21–27 MB, mostly textures, for nine
  low-detail buildings, and 300–400 draw calls.

Screenshots (overview cameras):
[in-house](acceptance/procedural-tools-588/inhouse-district-overview.jpg),
[Blender joined](acceptance/procedural-tools-588/glb-joined-overview.jpg),
[Blender 4 × 4 instanced](acceptance/procedural-tools-588/glb-instanced-meshopt-4x4-wide.jpg),
[OSM2World LOD 3](acceptance/procedural-tools-588/glb-o2w-lod3-o2w.jpg). The
generated block reads as a uniform window grid with flat white roofs. OSM2World
shows default-height red-roof boxes. The in-house District keeps its distinct
photographed buildings. The street-camera captures were not matched (one landed
inside a store interior), so no street-level visual comparison is claimed.

### Baking the in-house District with GLTFExporter (run)

Added on `f4aa1670` to test the claim above that three.js `GLTFExporter` can bake the
in-house output without an external tool. `measure-browser.mjs --bake` builds the
District with `buildDistrictBuildings` in the harness page, waits for all 31 texture
images, exports a binary GLB, and then measures it like the other GLB cases (three
runs per camera, zero page errors).

| Measure | In-house runtime build | Baked GLB |
| --- | ---: | ---: |
| Transfer | 131 KB JSON + shared textures | 4.99 MB (2.8 MB geometry, 1.8 MB re-encoded PNG textures) |
| Build or parse (overview / street) | 616 / 571 ms | 42 / 40 ms |
| First render (overview / street) | 330 / 152 ms | 266 / 209 ms |
| Draw calls (overview / street) | 343 / 123 | 401 / 125 |
| Triangles (overview / street) | 628,764 / 600,925 | 894,608 / 603,005 |
| CPU submit p95 (overview) | 1.3 ms | 1.1 ms |
| JS heap (overview) | 84 MB | 53 MB |

The export itself took 364 ms in the page. All 200 instanced meshes (28,764
instances) survived as `EXT_mesh_gpu_instancing`, which the exporter lists as
required. What it could not carry:

- **Runtime metadata.** The first export was 54.7 MB, of which 50 MB was JSON: room,
  interior and reflection records in `userData` that the exporter writes to glTF
  `extras`. The measured bake strips 49.7 MB of it. The runtime still needs that
  data, so a bake can only replace the render meshes; `district.json` stays.
- **Shader patches.** 23 of 154 materials use `onBeforeCompile` (texture variation,
  scale-aware instanced UVs, stone joints, thin storefront glass). glTF has no
  equivalent, so the baked roofs turn pale and flat and the long building's facade
  washes out
  ([in-house](acceptance/procedural-tools-588/inhouse-district-overview-f4aa1670.jpg),
  [baked](acceptance/procedural-tools-588/inhouse-baked-overview.jpg); the baked
  capture is from the export before `userData` was stripped, which does not change
  rendering). At the street camera, inside a store, the photographed display panel
  rendered as flat colour; that loss was not traced further.
- **Unexplained difference.** The baked overview draws 42% more triangles and 58
  more calls than the runtime build, while the street camera matches within 0.4%.
  No material is hidden or colour-masked, so the cause (likely culling or LOD
  differences) was not established.

Determinism of the bake was not tested: a second export was stopped after waiting
86 minutes in the shared browser-lock queue. The stored clean GLB has SHA-256
`daef127a…d561`.

Conclusion: baking cuts main-thread cost by about 15× and needs no new tool, but it
is not a drop-in. Shader-patched looks would need glTF-expressible materials (baked
textures or `KHR_*` extensions) first. That work belongs to #583's streaming design,
and is still cheaper than any external generator because collision and metadata stay
in the existing JSON.

## Tool-by-tool assessment

Prices and terms were checked on 2026-10-23 from vendor pages; links are in each row.

### Blender Geometry Nodes

Blender 5.2 LTS (2026-07-14, supported to July 2028) is free. Its licence page says
output belongs to the user; only distributed scripts must be GPL-compatible
([licence](https://www.blender.org/about/license/)). Headless use on macOS arm64 and
Linux works, as shown above. 5.0 made bundles and closures stable; 5.2 adds lists and
reusable node-group functions
([5.0 notes](https://developer.blender.org/docs/release_notes/5.0/geometry_nodes/)).

Strengths here: free, deterministic, scriptable, and good for hand-modelled detail.
Weaknesses here: render-only output, a second geometry language beside the JS
compiler, API churn between majors, and instanced export that does not scale. Blosm
(GPL, optional paid tier) adds OSM import but reads the same sparse tags.

### Houdini

Houdini 22 (2026-07-15). Indie costs $299/year (or $449 for 2 years) under $100K
revenue and $1M funding, and uses Indie-only `.hiplc`/`.hdalc` files
([Indie](https://www.sidefx.com/products/houdini-indie/)). Apprentice is
non-commercial and watermarked. Houdini Engine for Unreal/Unity is free, but headless
`hython`/batch work needs Houdini Engine ($525/workstation) or Engine Indie with
Indie files ([FAQ](https://www.sidefx.com/faq/question/how-much-do-the-houdini-engine-plug-ins-cost/)).
SideFX Labs has OSM import and building generators.

Not run: a lawful commercial test needs a paid licence and account sign-in. Houdini is
the most capable procedural tool on this list, but its advantages (large-scale
scattering, simulation, terrain) are not River Oaks' bottleneck. It would add a
paid, proprietary second source of truth, with format lock-in on the Indie tier.

### ArcGIS CityEngine

CityEngine 2026.0 is subscription-only, bundled with ArcGIS Professional ($2,200/yr)
or Professional Plus ($4,200/yr), on Windows and Linux only
([sales update](https://support.esri.com/en-us/knowledge-base/product-sales-update-arcgis-cityengine-000035055)).
It exports glTF, FBX, USD and SLPK. Headless PyPRT is free for non-commercial use
only, requires a CityEngine licence in the organization for commercial use, forbids
redistribution and web-service offerings unless permitted, and ships Linux/Windows
wheels only ([PyPRT](https://github.com/Esri/pyprt)). Vitruvio (Unreal) is Windows-only.

Not run: there is no macOS build for this host, and the terms do not fit a
browser-delivered world.

### Unreal PCG and World Partition

UE 5.7 declared PCG production-ready; 5.8 (June 2026) adds experimental Mesh Terrain
and PCG manual-edit layering
([5.7 release](https://www.unrealengine.com/news/unreal-engine-5-7-is-now-available)).
Licence: free under $1M lifetime gross, then a 5% royalty. Unreal's glTF exporter
covers static meshes, levels and baked materials, but its documentation does not
mention instanced static meshes, PCG output, Landscape, Nanite or
`EXT_mesh_gpu_instancing`
([glTF exporter](https://dev.epicgames.com/documentation/en-us/unreal-engine/how-the-gltf-exporter-handles-unreal-engine-content)).

In River Oaks, Unreal 5.8.2 is an offline GIS blockout that consumes exported JSON
(`docs/unreal.md`); it is not deployed. World Partition streams Unreal levels, not
browser chunks; browser streaming is #583's in-house chunk lifecycle. PCG output
would stay inside the engine. Not run: Unreal is not installed on this host.

### Other options

- **Overture Maps buildings** are ODbL (Places: CDLA-Permissive-2.0)
  ([attribution](https://docs.overturemaps.org/attribution/)). Worth one bounded
  check for height coverage here before any adoption.
- **Google Photorealistic 3D Tiles** forbid caching beyond terms, offline use and
  deriving or tracing geometry ([policies](https://developers.google.com/maps/documentation/tile/policies)).
  They cannot seed an owned world.
- **`3d-tiles-renderer`** (Apache-2.0, 0.5.3) and **glTF-Transform/meshoptimizer**
  (MIT) are sound web-delivery tools. They only matter if pre-baked GLB city content
  ships. Today facades are generated from KB-scale JSON.

## Licensing and data obligations

`district.json` is an ODbL derivative with attribution (`preview/public/data/README.md`).
Any external tool fed OSM keeps those obligations; generated meshes are a produced work
whose underlying derivative database must remain offerable. The tool choice does not
change this. CityEngine/PyPRT and Google tiles add restrictions; Blender and OSM2World
add none to the output.

## Bounded follow-up (reversible, only on a trigger)

Trigger: a human artist is assigned to author kit modules (storefronts, cornices,
canopies) beyond what code-authored modules reach, under #584.

Experiment: author one storefront module in Blender as a repository-owned master,
export a GLB under 150 KB, and load it as an alternate render for one existing
`config/neighborhoods/kit-snapshot.json` module. The compiler stays the only source of
envelopes, collision, sockets and supports. Keep it in the existing provenance
receipt pattern (`scripts/export-ipic-blender.py` precedent).

Adopt only if a rendered comparison is approved, the module keeps frame p95 and
transfer within the #580 provisional budgets (≤10% regression), and re-export is
deterministic. Otherwise remove the module and the experiment. No Blender binary
enters CI or `package.json` either way.

Revisit the whole decision if the client stops being browser-first, if a funded
team brings Houdini expertise, or if a data source provides measured facades (not only
heights) at scale.
