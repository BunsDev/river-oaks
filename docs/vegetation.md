# Observed district vegetation

The development scene uses 2018 LiDAR vegetation returns to place its canopy. The original four OSM tree points remain a separate inventory. The 230 branch supports beneath the canopy are interpretations, not surveyed trunks.

## Acquisition

The [USGS Coastal B1 EPT dataset](https://usgs-lidar-public.s3.amazonaws.com/TX_Coastal_B1_2018/ept.json) covers the district. [NOAA project metadata](https://www.fisheries.noaa.gov/inport/item/58236) describes January–March 2018 acquisition during the leaf-off season and public-domain distribution. EPT declares EPSG:3857 horizontally but omits a vertical datum. Relative canopy heights therefore use ground returns from the same cloud before being placed on the scene DEM.

`scripts/fetch_district_lidar.py` includes every intersecting hierarchy subtree and ancestor tile. EPT is additive; leaf tiles alone lose observations. The area includes a 20 m ground-support margin and the complete vertical extent. Five hierarchy pages and 63 LAZ tiles yield 3,354,009 tile points and 1,169,790 clipped points, using approximately 20.8 MB of source files.

Budgets are 8 MiB per file, 128 MiB total, 64 hierarchy pages, 256 tiles and five million tile points. Invalid paths, repeated/cyclic nodes, missing subtrees and mismatched decoded point counts fail acquisition. Tiles, metadata and clipped points have SHA-256 receipts in ignored `data/raw/lidar-district/`.

## Derivation and rendering

Only non-withheld, non-synthetic class 4/5 returns enter canopy selection. Height uses the nearest mean of class-2 ground returns in a 2 m cell, no farther than 12 m. Unsupported ground and heights outside 2.5–45 m are excluded.

Within district bounds, 29,565 candidates yield 24,387 retained returns. Four lack nearby ground; 5,174 fall outside the height range. Their 0.65 m voxel centroids produce 18,832 runtime positions and approximately 4,993 m² of occupied 1 m footprint cells. Voxel size is a display aggregation choice, not survey accuracy.

The [runtime derivative](../preview/public/data/district-vegetation.json) is approximately 660 KB. The loader validates its source frame, OSM source hash, heights, budgets and return accounting. It never replaces the four OSM records with inferred stems.

Spatial instances retain every measured voxel at each distance level: 16 nearby leaf cards, five intermediate cards, one distant card. Cards contain several original leaves at a plausible scale. Branch scaffolds use [CC0 bark textures](https://polyhaven.com/a/bark_brown_02) recorded in the material receipt. Branch positions, species, leaf forms and foliage between returns are interpretations. Production wind, botanical assets and Nanite are still outstanding.

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
node --test preview/tests/vegetation.test.js
```

Tests cover additive traversal, incomplete data, budgets, class/quality filtering, missing ground, vertical-offset invariance, runtime frame checks, hash/accounting and spatial batch coverage. Browser checks cover actual foliage, conversations, source disclosure, UHD resolution and resources across scene changes. These checks do not establish current botanical accuracy or target-hardware UE5 performance.
