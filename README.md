# River Oaks

Build a geospatial Unreal Engine world and run local NPC reactions through TypeSafe Jev. This repository provides a data/decision foundation, an interactive browser showcase, and an uncompiled UE5 blockout. The verification report records remaining production gates.

## Run the live showcase

Run the bridge and browser development server in separate terminals:

```sh
uv sync --locked
uv run river-oaks serve
```

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/**. The default is a walkable River Oaks District scene at 4444 Westheimer, with bundled OpenStreetMap geometry, 30 directory-matched storefront destinations, and 24 fictional encounters. It loads without downloading the full neighborhood; the bridge supplies reactions, economic scenarios, and optional speech. Choose the neighborhood scene to use the larger generated GIS dataset below.

Residents have consistent local identities, remember encounters, walk between public stops and pause to chat. Four labeled fictional encounters feature Ima Hogg, Barbara Jordan, Hakeem Olajuwon and Beyoncé. Resident route searches run in a Web Worker; immediate reactions are batched for Jev or local fallback. [Resident life and controls](docs/resident-life.md)

Community dispatches recruit a visible resident carrying supplies. Use **Find volunteer** to watch them reach the recipient and help on site; only then is the request resolved. Conversations and storms can delay the visit, while an inaccessible route returns unused capacity.

WASD walks, dragging looks around, Shift walks faster, and E talks to a nearby person. Choose **Hover moped** to fly; Q/E descends/climbs, F assists a street-level arrival, R rises above nearby roofs, and Escape exits. The side trigger collapses controls for a native UHD render surface. System/Light/Dark appearance uses the neutral surfaces, pink accents, and system typography from `BunsDev/typesafe-ai-playground`.

Residents have first-person roles, interests, routines, and per-scene conversation memories. Ima Hogg, Barbara Jordan, Hakeem Olajuwon, and Beyoncé are explicitly fictional cultural encounters with linked public biographies. Their dialogue is authored; Jev receives bounded role context and chooses immediate reactions. Clothed CC0 human meshes now replace the capsule figures, and storefronts have pale cladding and recessed display bays. These remain interpreted reconstructions; see [visual evidence and asset provenance](docs/visual-fidelity.md).

District foliage now follows 18,832 canopy voxels derived from public 2018 LiDAR, with distance-based detail and local bark materials. The four OSM tree points remain distinct from interpreted branch supports. The independent historical canopy comparison fails; see [vegetation evidence](docs/vegetation.md).

### Optional free local speech

Install the optional CPU runtime and pinned model, then start the bridge with that extra:

```sh
uv sync --locked --extra voice
uv run --extra voice python scripts/fetch_voice_model.py
uv run --extra voice river-oaks serve
```

In **People & place → Spoken dialogue**, choose **Kokoro · local neural voices**. It runs on the local CPU after the initial approximately 121 MB model download, without an inference account or API charge. The 24 encounter presets are distinct generic voices, not celebrity imitations. **Device voices · local only** uses installed English voices when available. Speech defaults off on reload; muting, changing person, hiding the tab, or closing the conversation cancels playback. One job at a time and a bounded cache keep speech out of the render loop. See [showcase controls and limitations](docs/showcase.md).

The **Scenario lab** runs an illustrative neighborhood-service economy. Change demand, service fees, hourly wages, staffing, and storms; watch jobs, queues, revenue, and costs. Decisions travel through the same loopback Jev bridge, with visible live/local/safety provenance. Without a server-side key, it runs local fallback and says so. Jev makes reactive micro-decisions; schedules and accounting follow deterministic rules. The browser is a development showcase, not the final UE5 renderer. See [controls and model assumptions](docs/showcase.md) and [local showcase evidence](data/reports/preview-smoke.json).

## Acquire source data

```sh
uv sync --locked
brew install gitleaks                 # macOS; required for the commit guard
sh scripts/install-hooks.sh
uv run pytest -q
uv run river-oaks acquire
uv run river-oaks observe
uv run river-oaks build --terrain data/raw/terrain.tif \
  --terrain-source data/raw/terrain-source.json \
  --canopy-reference data/raw/canopy-reference.json \
  --output unreal/Content/Data/world.json
uv run river-oaks verify --world unreal/Content/Data/world.json \
  --terrain data/raw/terrain.tif --canopy data/raw/canopy-reference.json
uv run river-oaks serve
```

`verify` currently exits **1 (failed)** when supplied the observed canopy reference: generated tree coverage is still zero. Other production gates remain blocked. Exit 2 means blocked without a failing comparison; exit 0 is reserved for complete acceptance. The decision service runs at `http://127.0.0.1:8765` using local rules until you supply a Jev key.

Follow [the Unreal setup](docs/unreal.md) to compile `unreal/RiverOaks.uproject`, create the map, and explore it. Unreal Engine was unavailable on the development host; the C++ module and editor bootstrap have not been executed. You need UE5.6 and its native toolchain. The project is not a finished photorealistic environment.

## Current evidence

- Live city/county acquisition on September 17, 2026: 10,420 parcel records and 1,026 road features. Clipping produces 9,981 parcel parts, 940 road parts, and 2,605 synthetic house masses. The bounding box includes adjacent areas; it is not an authoritative River Oaks boundary.
- Geometry retains meter coordinates in EPSG:32615 relative to `[-95.425, 29.755]`. Unreal converts east/north/up meters into east/south/up centimeters.
- Houses fit source parcel setbacks and use seeded Tudor, Georgian, French, or modern massing. Styles are representative choices, not surveyed labels. Owner names, addresses, and property values are not downloaded or included in NPC packets.
- The local world includes a USGS Houston DEM exported at about 8.82 m resolution and resampled to a 257×257 preview grid, with NAVD88 elevations. Its import fidelity passes; source-date and independent vertical accuracy remain unverified. UE terrain rendering is still pending.
- The H-GAC service labeled 2016 supplies a historical canopy footprint overlay. It provides no individual stems, heights, or species; the generated world still has **zero trees** and fails its canopy comparison. The export is about 4.32 m/pixel, not a claim about native imagery resolution.
- The 500-agent loopback smoke test covers local fallback reactions. The local benchmark measures Python decisions only; neither establishes Jev throughput nor UE frame rate.

See [verification results](data/reports/verification.md), [GIS layout](data/reports/layout.svg), [machine-readable checks](data/reports/verification.json), [HTTP evidence](data/reports/http-smoke.json), and [local benchmark](data/reports/local-benchmark.json).

## Use Jev

Copy `.env.example` to the ignored `.env` file and set `TYPESAFE_API_KEY` locally. Keep it out of Unreal assets and logs.

```sh
uv run --env-file .env river-oaks serve
```

The adapter uses the documented `POST /v1/systemone` choice interface with `jev-1.13.0`, at most 32 questions per batch, four concurrent requests, and a 750 ms overall deadline. It caps starts at 15 batches per second and falls back when overloaded, late, malformed, or low-confidence. Batch priority rotates each tick to avoid starving the last agents. No remote retry backlog accumulates. Each question names its target NPC explicitly. A provided key enables billable remote calls; tests use local transports and synthetic fixtures only.

Unreal sends a snapshot at most every two seconds and never blocks movement on HTTP. One request may be outstanding; old ticks and responses older than 1.5 seconds are rejected. Local collision, schedule, and weather limits remain authoritative. `seek_shelter` pauses a marker in this foundation; reachable shelter navigation and vehicle lane topology remain unimplemented.

A 60 fps frame is 16.67 ms. A 300 ms network classification cannot finish in that frame; inference runs asynchronously across frames. Full-population latency and fallback frequency require a live benchmark. [TypeSafe HTTP API](https://docs.typesafe.ai/api)

## Test and protect changes

```sh
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
npm test
npm run build
python3 scripts/check_secrets.py --all
gitleaks git --log-opts=--all --redact --no-banner --ignore-gitleaks-allow
```

The installed Git hook scans the **staged index**, blocks credential filenames even when force-added, and fails closed if Gitleaks is missing. CI runs the same protection plus a full-history scan, lint, Python 3.11/3.13 tests, preview behavior tests/build on Node 24, and an offline pipeline smoke test. Actions and the scanner archive are pinned. CI has not run on GitHub. New clones must run `scripts/install-hooks.sh`; require the `Verify` checks in repository branch protection before relying on CI as a merge gate.

Tests target observable failure modes: missing ArcGIS pages, coordinate/containment corruption, mismatched canopy placement, malformed Jev answers, bounded timeouts, overloaded HTTP requests, schedule preservation, and real secret-guard rejection in temporary Git repositories. They do not substitute for Unreal compilation, visual inspection, privacy review, or GPU profiling. [Testing approach](docs/testing.md)

## Work without downloads

```sh
uv run river-oaks demo
uv run river-oaks verify --config data/generated/demo/config.json \
  --raw data/generated/demo --world data/generated/demo/world.json \
  --output data/generated/demo/report.json
uv run river-oaks benchmark --agents 500 --iterations 1000
```

The demo is a labeled synthetic fixture and never counts as River Oaks accuracy evidence. To explore it in Unreal, copy its `world.json` into `unreal/Content/Data/`.

Raw GIS, generated neighborhood manifests, voice weights, review queues, and Unreal binary assets remain ignored. The bundled district derivative is attributed under [ODbL](preview/public/data/README.md); surface maps and HDR lighting have [CC0 source receipts](preview/public/assets/materials/sources.json). [Data contracts and source catalog](docs/data.md) explain observed canopy inputs and attribution. [Execution ledger](docs/superpowers/plans/2026-09-17-river-oaks.md) records what still needs delivery.
