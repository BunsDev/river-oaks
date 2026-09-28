# River Oaks District data

`district.json` contains a transformed OpenStreetMap extract: © OpenStreetMap contributors, available under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Retain this attribution and comply with the database license when sharing derivatives. See [OpenStreetMap copyright](https://www.openstreetmap.org/copyright).

The extract has nine building footprints, 39 road/path parts, four mapped tree points, and 30 mapped tenant destinations. Its `provenance` field includes the source URL, SHA-256, and build timestamp. Store names were checked against the [River Oaks District directory](https://www.riveroaksdistrict.com/map) on September 17, 2026. This is a mapped subset, not a complete directory or a survey of current entrances.

The coordinate frame is EPSG:32615 relative to longitude −95.425, latitude 29.755. Ground heights derive from the USGS elevation observation receipt embedded in the terrain record. Mesh resampling does not improve the source elevation resolution.

`scripts/build_district.py` rebuilds this derivative from `data/raw/district-osm.xml` and `data/raw/terrain.tif`; absent OSM input is fetched from the bounded public API extent. Acquire the source terrain through the observation workflow documented in `docs/data.md`. The script preserves mapped footprints and derives arrival points outside them. Facades, untagged heights, entry locations, furnishings, and tree shapes are interpretations. Their photographic and survey accuracy is unverified. No proprietary official venue-map geometry or private residence plans are included.

The visual material set is independently licensed CC0 by [Poly Haven](https://polyhaven.com/license). `../assets/materials/sources.json` records each source and downloaded file hash; `scripts/fetch_visual_assets.py` recreates the set.

`district-vegetation.json` separately contains a public-domain USGS 3DEP derivative from the 2018 Coastal Texas survey. Voxel positions/heights derive from classified vegetation returns; leaf forms and branch supports are interpreted. It preserves the four OSM stem records and does not establish present-day accuracy. The independent historical canopy comparison fails. See [acquisition and verification](../../../docs/vegetation.md) for rebuild commands, licenses, counts and limitations.

The September 27 game adaptation retains Houston centerlines while setting vehicle
streets to at least 8.4 m curb-to-curb. `mapped_width_m` preserves the original
width and `mapped_visit` preserves the previous authored arrival. The builder
runs `scripts/fit_district_arrivals.mjs` to fit arrivals beside the widened lanes.
Twenty-nine interpreted branch supports were removed from the driving clearance;
observed canopy voxels and mapped tree points remain unchanged.
