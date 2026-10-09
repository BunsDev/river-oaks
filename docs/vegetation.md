# Observed district vegetation

The development scene uses 2018 LiDAR-derived stems to place interpreted mature shade trees. The original four OSM tree points remain a separate inventory. The 230 branch supports beneath the canopy are interpretations, not surveyed trunks.

## Acquisition

The [USGS Coastal B1 EPT dataset](https://usgs-lidar-public.s3.amazonaws.com/TX_Coastal_B1_2018/ept.json) covers the district. [NOAA project metadata](https://www.fisheries.noaa.gov/inport/item/58236) describes January–March 2018 acquisition during the leaf-off season and public-domain distribution. EPT declares EPSG:3857 horizontally but omits a vertical datum. Relative canopy heights therefore use ground returns from the same cloud before being placed on the scene DEM.

`scripts/fetch_district_lidar.py` includes every intersecting hierarchy subtree and ancestor tile. EPT is additive; leaf tiles alone lose observations. The area includes a 20 m ground-support margin and the complete vertical extent. Five hierarchy pages and 63 LAZ tiles yield 3,354,009 tile points and 1,169,790 clipped points, using approximately 20.8 MB of source files.

Budgets are 8 MiB per file, 128 MiB total, 64 hierarchy pages, 256 tiles and five million tile points. Invalid paths, repeated/cyclic nodes, missing subtrees and mismatched decoded point counts fail acquisition. Tiles, metadata and clipped points have SHA-256 receipts in ignored `data/raw/lidar-district/`.

## Derivation and rendering

Only non-withheld, non-synthetic class 4/5 returns enter canopy selection. Height uses the nearest mean of class-2 ground returns in a 2 m cell, no farther than 12 m. Unsupported ground and heights outside 2.5–45 m are excluded.

Within district bounds, 29,565 candidates yield 24,387 retained returns. Four lack nearby ground; 5,174 fall outside the height range. Their 0.65 m voxel centroids produce 18,832 runtime positions and approximately 4,993 m² of occupied 1 m footprint cells. Voxel size is a display aggregation choice, not survey accuracy.

The [runtime derivative](../preview/public/data/district-vegetation.json) is approximately 660 KB. The loader validates its source frame, OSM source hash, heights, budgets and return accounting. It never replaces the four OSM records with inferred stems.

The mature-tree pass retains all 230 existing stem coordinates and terrain heights. It replaces the sparse voxel-card appearance with baked EZ Tree oak models with textured bark, recursive branches and smaller, denser leaf clusters. Spatially instanced batches use three mesh LODs (28,326 / 20,135 / 8,891 triangles per source tree), switching at 22 and 60 m. One leaf shell supplies the canopy; trunk and branch geometry is not duplicated. Mapped and creator-authored trees use the same assets. The original voxel records remain intact for validation, but no longer determine the displayed crown silhouette. Crown dimensions, species and foliage are artistic interpretations.

The batches occupy 12 m tiles. This reduces offscreen tree submissions compared with 24 m tiles while keeping stem coordinates fixed. The EZ Tree pass removes the previous overlapping canopy shells. An 8 m trial submitted almost the same geometry with more draw calls; 12 m was retained. Rendering measurements and remaining performance limits are recorded in [the people and movement progress report](people-interaction-progress.md).

The 38 rectangular lane planters retain their original shells, positions and orientation. Their planting combines trimmed boxwood-style leaf-and-twig clusters with arching ornamental grass tufts and soft seed heads. Existing roads, buildings, navigation and other street furniture are unchanged.

The visual reference is Fab/Megascans-quality foliage, including [European Hornbeam](https://www.fab.com/listings/c6f917b6-ffcb-4b86-9d9f-5274ba7f6a8e) and [Boxwood PBR](https://www.fab.com/listings/bf535af4-31f3-4a8a-b3de-9a5e68eccb8e). Tree geometry and textures are baked from [EZ Tree](https://github.com/dgreenheck/ez-tree) 1.1.0, distributed under MIT; its copyright and license ship beside the assets. The Oak Large preset uses seed 23399 with leaf size 3.2 and count 16. These are interpreted oaks, not identified species at each stem. Planter models are derived from Poly Haven [shrub_02](https://polyhaven.com/a/shrub_02) and [grass_medium_02](https://polyhaven.com/a/grass_medium_02), available under [CC0](https://polyhaven.com/license). The older Poly Haven tree assets remain available to reproduce earlier evidence. They are not purchased Fab assets or verified botanical boxwood/fountain-grass scans. The shrub shaping and grass seed heads are authored styling.

Source checksums and derivative SHA-256 receipts are recorded in [the landscape manifest](../preview/public/assets/landscape/manifest.json) and [the EZ Tree manifest](../preview/public/assets/landscape/ez-tree-manifest.json). The browser loads local GLBs; no procedural generation runs during gameplay. EZ Tree is a build-time dependency. The high tree LOD embeds 512px bark and leaf maps compressed as WebP; lower LODs contain geometry only and borrow materials by name. The three tree assets total 3.62 MB. Ground cover retains embedded 2k PBR maps. Full source downloads and temporary bakes stay in ignored `data/raw/landscape/`. Production wind and native Unreal/Nanite integration remain separate work.

The isolated three-tree WebGL fixture checks every LOD, alpha-tested materials and shadow proxies. Compared with the previous assets and leaf shells, visible near-tree geometry falls from 889,101 to 84,978 triangles; draw calls including shadows and ground fall from 13 to 9. This fixture is not a whole-town frame-rate benchmark. Screenshots and measurements are written to ignored `output/playwright/trees-*.png` and `tree-render-check.json`.

## Independent comparison

The [district canopy report](../data/reports/district-canopy.json) checks source-file integrity and compares the footprint with the separate H-GAC historical canopy export. The export rectangle covers the district in the correct frame. Its classification shows only 68.4 m² here; intersection-over-union is **0.00986**, below the provisional 0.75 threshold. The comparison fails and the live data panel says so.

The disagreement needs review of reference classification/coverage, dates, site change, leaf season and LiDAR classification errors. Sparse vegetation-classified returns also appear around roof edges in the inspected cloud. Successful rendering does not prove those returns are trees. H-GAC geometry remains a local inspection artifact because redistribution terms are unestablished; the shared report includes measurements and attribution.

The larger-neighborhood report is unchanged and still fails its own canopy comparison. No district result establishes current survey accuracy or overall project acceptance.

## Rebuild and verify

With district geometry and terrain already acquired:

```sh
uv run --extra voice python scripts/fetch_district_lidar.py
uv run --extra voice python scripts/build_district_vegetation.py
uv run --extra voice python scripts/fetch_visual_assets.py
uv run --extra voice pytest -q tests/test_lidar.py
python scripts/fetch_landscape_assets.py
python scripts/prepare_landscape_assets.py # legacy trees and current ground cover
pnpm run assets:trees
node --test preview/tests/vegetation.test.js preview/tests/landscape-models.test.js
pnpm run test:trees:webgl
```

Tests cover additive traversal, incomplete data, budgets, class/quality filtering, missing ground, vertical-offset invariance, runtime frame checks, hash/accounting and spatial batch coverage. Browser checks cover actual foliage, conversations, source disclosure, UHD resolution and resources across scene changes. These checks do not establish current botanical accuracy or target-hardware UE5 performance.

## Street View placement corrections, October 2026

`preview/src/tree-placements.js` selects three photo-aligned stems along
Hopdoddy's south frontage in place of four older inferred supports. The user's
June 2024 Street View screenshot (`2026-10-08 at 12.48.26.png`) shows two smaller
trees along the shops and a larger corner tree. The authored local coordinates
are placement estimates against the mapped frontage, not surveyed measurements.
The original canopy voxels, source records and independent comparison remain
unchanged. Rendering, tree pits, resident/companion navigation, NPC flight and
vehicle parking share the selector. The smaller crowns retain an authored 2.1 m
radius; their existing oak assets do not reproduce the pictured multi-stem species.
This does not add player trunk collision to the existing movement contract.
