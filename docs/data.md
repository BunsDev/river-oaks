# Data sources and geometry contract

The pipeline downloads a bounded subset of public road and parcel geometry. It records the URL, acquisition time, canonical JSON SHA-256, field whitelist, feature count, and requested bounds in `data/raw/sources.json`. Raw and generated geometry are local artifacts, excluded from Git until redistribution terms are reviewed.

| Input | Source | Current use |
| --- | --- | --- |
| Parcels | [HCAD parcels served by Harris County](https://www.gis.hctx.net/arcgis/rest/services/HCAD/Parcels/MapServer/0) | Geometry, `OBJECTID`, and `state_class` only |
| Roads | [City of Houston street centerlines](https://geogimsms.houstontx.gov/arcgis/rest/services/HPC/LandbaseAndRoads_hpc/MapServer/9) | Geometry, `OBJECTID`, `NAME`, and `ST_TYPE` |
| Ground elevation | [USGS 3DEP elevation service](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer) | Houston 2024 catalog raster, NAVD88; observed DEM acquired |
| Historical canopy footprint | [H-GAC Urban Forestry CIR layer 3](https://gis.h-gac.com/arcgis/rest/services/UrbanForestry/UrbanForestry_CIR_UA/MapServer/3) | Service labeled 2016; acquired footprint, no stems/heights/species |
| Individual canopy heights | [USGS 2018 Coastal LiDAR EPT](https://usgs-lidar-public.s3.amazonaws.com/TX_Coastal_B1_2018/ept.json) | Metadata inspected; vegetation points not yet extracted |

No Google Earth imagery is downloaded or redistributed. Regional land-cover forest classes cannot establish individual live-oak placement. The catalog does not imply that missing datasets have been licensed or acquired.

## Acquire and build

Edit the provisional WGS84 `bbox` in `config/river-oaks.json` before acquisition. The current rectangle extends beyond the requested neighborhood. An authoritative boundary polygon is still needed before claiming full River Oaks coverage or the brief's approximate acreage.

ArcGIS object IDs are enumerated first. Feature chunks use POST to avoid the county server's GET URL-length limit. Each chunk must return exactly the requested IDs. Only allowlisted attributes survive acquisition; owner/mail records never enter the local artifact. Features are clipped in a projected meter CRS, and invalid geometry aborts the build.

`world.json` uses `schema_version: 1`, `crs: EPSG:32615`, and horizontal local coordinates relative to the projected `origin`. X points east, Y north, Z up. Unreal converts `(x,y,z)` to `(100x,-100y,100z)`. With `--terrain`, Z is absolute NAVD88 elevation in meters; without it, the fixture is flat at zero and cannot pass elevation checks.

- `roads`: stable source-part ID, name, polyline points, provisional width of 8 m, unknown lane count. Widths, medians, signals, and esplanades require observations.
- `parcels`: stable source-part ID, exterior `ring`, and interior `holes`. Geometry keeps its original shape.
- `buildings`: parcel ID, ground-centered location, width/depth/height, yaw, and seeded style. Only `A1` residential parcels receive house massing. Footprints shrink until the source parcel inset contains them. Style/height choices are synthetic and all houses enter manual review.
- `trees`: observed location, crown radius, height, species label, and source ID. No input means no generated trees.
- `provenance`: source hashes and acquisition receipts. Generated counts are not accuracy evidence.

## Observed ground and canopy mask

`river-oaks observe` locks the USGS export to catalog raster `TX_Houston_B24` instead of silently selecting a different mosaic. The source catalog describes 1 m native resolution; the bounded 513×513 download is about 8.82 m/pixel. The browser mesh resamples that export to 257×257. The source receipt records the catalog raster, export parameters, returned dimensions, SHA-256, CRS, and NAVD88 datum. The catalog date is not independently verified as the flight date.

Road segments are densified to at most 20 m before sampling elevations; house and tree bases sample the same DEM. Bilinear sampling fails on missing or out-of-bounds pixels. `verify --terrain` independently resamples every grid vertex and feature height; this tests import fidelity, not survey accuracy. The optional manifest `terrain` uses south-to-north rows and west-to-east columns. `grid_origin_m`, `spacing_m`, `width`, `height`, and flat `heights_m` specify that grid.

The H-GAC export preserves its **returned extent**, which may be wider than the requested bbox. Only the verified tree-canopy color is classified; unexpected renderer colors fail acquisition. `canopy-reference.json` records the resulting local-meter Polygon/MultiPolygon, export resolution (about 4.32 m/pixel), source label year, and receipt. Native imagery resolution and exact acquisition dates are unknown. The service exposes no clear redistribution license, so downloads remain ignored local inspection artifacts. This overlay is a historical reference and does not populate `trees`. A later LiDAR crown extraction must use an independently sourced observation and account for date/leaf-season differences.

## Supply canopy observations

Convert licensed LiDAR-derived individual trees to a WGS84 GeoJSON FeatureCollection. Add a top-level `source_id`, a unique feature `id`, point geometry, and properties `crown_radius_m`, `height_m`, and optional `species`. Unknown species should remain `unknown`.

```sh
uv run river-oaks build --trees data/raw/observed-trees.geojson \
  --output unreal/Content/Data/world.json
```

For independent canopy verification, supply a separate reference file with `source_id`, `crs: "local_m"`, and a Polygon/MultiPolygon `geometry` transformed into the manifest's local frame. Reference provenance must identify a distinct measurement source from tree placements. Do not simply rename the same layer. The verifier rejects identical source IDs, but establishing source independence also requires reviewing source receipts.

```sh
uv run river-oaks verify --world unreal/Content/Data/world.json \
  --canopy data/raw/independent-canopy.json
```

The verifier compares crown coverage fraction and intersection-over-union, so equal canopy area in the wrong location fails. IoU ≥ 0.75 and coverage error ≤ 0.05 are provisional thresholds that require agreement for the selected sensor resolution.

## Interpret verification

Road and parcel checks compare generated geometry against independently reconstructed source geometry, including missing/extra IDs. The road threshold is a strict maximum Hausdorff deviation below 5 m. A zero import deviation proves source geometry survived processing; it does not establish source survey accuracy. Building checks independently reconstruct rotated footprints and require containment in source parcel setbacks. Bounds must match the projected clipping extent.

Release gates remain blocked for independent survey accuracy, exact neighborhood boundary, terrain, lane topology, residence similarity, production visuals, live Jev, and GPU performance. The verifier has no switch to override these missing gates. Add a verified evidence importer with each production milestone instead of treating a manual boolean as proof.

`residence-review.json` queues every synthetic house for review. No facade similarity detector or licensed comparison corpus exists yet. There are no recreated private interiors or copied architectural plans in this project.
