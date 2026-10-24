# External procedural tools experiment (#588)

Evaluation-only scripts for [the procedural tools evaluation](../../docs/procedural-tools-evaluation.md).
Nothing here is imported by the client, server, bridge or build, and no tool used
here is a project dependency. Outputs go to `.runtime/procedural-tools/` (ignored).

| File | Purpose |
| --- | --- |
| `blender_block.py` | Builds the District block (bundled `district.json` footprints and road centrelines) in a Geometry Nodes graph created from code, then exports GLB. Variants: `realized` (one mesh per object), `joined` (one mesh), `instanced` (`EXT_mesh_gpu_instancing`). `--meshopt` enables the exporter's meshopt compression; `--repeat N` tiles the block N × N. Writes a JSON receipt with timings, triangle/instance counts and output SHA-256. |
| `harness/` | A Three.js page that renders the in-house `buildDistrictBuildings` output or a GLB under identical lighting and cameras and reports load time, draw calls, triangles and frame/CPU distributions. |
| `measure-browser.mjs` | Serves the harness with Vite and runs every case in headless Chromium (ANGLE Metal on macOS). Run it through `scripts/browser-lock.mjs`. |
| `lidar_heights.py` | Measures each District footprint's roof height (class-6 p95 above local class-2 ground) from the LiDAR subset written by `scripts/fetch_district_lidar.py`, and compares it with the authored height. |
| `overture_heights.py` | Bounding-box query of an Overture buildings release for height coverage and per-building height source. Runs with an ephemeral DuckDB; not a project dependency. |

## Reproduce

Blender is acquired per run, not installed by the project. The evaluation used the
official Blender 5.2.3 LTS macOS arm64 build (SHA-256
`acc05374485a272342d4b323c15ac01953e7f697da2f1bad8af9c3bf087267a4`, matching the
published checksum on two mirrors; Blender Foundation code signature).

```sh
BLENDER=/path/to/Blender.app/Contents/MacOS/Blender
for variant in realized joined instanced; do
  "$BLENDER" -b --factory-startup --python experiments/procedural-tools/blender_block.py -- \
    --district preview/public/data/district.json --variant "$variant" \
    --out .runtime/procedural-tools/$variant.glb --receipt .runtime/procedural-tools/$variant.json
done
# Add --meshopt for compressed variants (joined-meshopt, instanced-meshopt) and
# --repeat 4 for the 4 × 4 scale test (joined-4x4, instanced-meshopt-4x4).

node scripts/browser-lock.mjs procedural-tools -- node experiments/procedural-tools/measure-browser.mjs \
  --glb-dir .runtime/procedural-tools --materials /path/to/preview/public/assets/materials \
  --out .runtime/procedural-tools/browser-report.json --repeats 3
```

`--bake` first builds the in-house District in the page, exports it with three.js
`GLTFExporter` (stripping runtime `userData`), writes `inhouse-baked.glb` into the GLB
directory, and then measures it alongside the other cases (`--only inhouse-baked` limits
the run to it).

Heights (the LiDAR fetch is about 20.8 MB of public-domain USGS 3DEP data):

```sh
uv run --locked python scripts/fetch_district_lidar.py
uv run --locked python experiments/procedural-tools/lidar_heights.py --out .runtime/procedural-tools/lidar-heights.json
uv run --no-project --with duckdb==1.4.1 python -I experiments/procedural-tools/overture_heights.py \
  --release 2026-10-21.0 --out .runtime/procedural-tools/overture-heights.json
```

The OSM2World comparison used OSM2World 0.4.0 (`OSM2World-0.4.0-bin.zip`, SHA-256
`c05b37920d29c26710a06e30c170ca62e5e8ea653cccbbb3243dfc7e5d20b899`; no published
checksum) on Temurin JRE 21.0.13, with the same bounded OSM API extent as
`scripts/build_district.py`:

```sh
java -Xmx4G -jar OSM2World.jar --config standard.properties -i district.osm --lod 3 -o o2w-lod3.glb
```

Facade bays, storey heights and window modules in `blender_block.py` are generic
evaluation choices. They are not the photographed River Oaks facades and must not
replace them.
