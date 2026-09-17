# River Oaks implementation ledger

**Goal:** Build the requested geospatial UE5 simulation, with explicit evidence for each delivery gate.
**Architecture:** Offline Python GIS processing produces a metric, versioned world manifest. UE5 consumes that manifest; local movement never waits for inference. A loopback Python decision service batches Jev classification, validates responses, and falls back on local rules.
**Stack:** Python 3.11+, Shapely, pyproj, httpx, FastAPI; Unreal Engine 5 C++ and editor Python.

The repository starts with only README and .gitignore. No Unreal Editor was found in standard installation locations or Spotlight. No licensed foliage/material/audio assets, canopy observations, or Jev credentials have been provided. These are delivery dependencies, not passing checks.

## Execution

- [x] Data: test projection, clipping, source provenance, polygon containment, and independent geometry/canopy metrics; implement acquisition and build CLI; acquire bounded live roads/parcels.
- [x] Agents: test batched asynchronous classification, timeout/invalid response handling, safety overrides, schedules; implement documented TypeSafe adapter and loopback service. Stale-response tests exist in UE but cannot run here; live Jev remains unverified.
- [x] UE source: create C++ project, manifest loader, instanced world geometry, explorable camera, local agent movement and async decision bridge; provide editor scene bootstrap, weather and asset hooks. Compile/run remains blocked below.
- [x] Integrate: generate manifest and verification JSON/Markdown; exercise real loopback HTTP and 500-agent local benchmark; review contracts and code. Reviews caught and fixed unchecked bounds/buildings, conflicting fallback schedules, and a CI tool-install permission issue.
- [x] Secret protection: install staged-index Gitleaks hook, block credential filenames, pin scanner/checksum and CI actions, test actual rejected Git commit with synthetic secret. Worktree/history scans clean; GitHub CI and branch protection not exercised.
- [ ] Delivery: compile/run UE, import licensed Nanite foliage and PBR/audio assets, ingest independent canopy/elevation data, validate GIS and residence review, profile 4K/60 fps on target hardware.

## Contracts

Manifest `schema_version: 1`, local coordinates in meters; CRS EPSG:32615 offset by projected WGS84 origin `[-95.425, 29.755]`. UE uses X=east, Y=south, Z=up in centimeters. Features retain opaque IDs only; no owner names, addresses, or valuation records enter agent packets.

Manifest fields: `origin`, `crs`, `bounds_m`, `roads` (`id`, `name`, `points`, `width_m`, `lanes`, `width_source`), `parcels` (`id`, `ring`), `buildings` (`id`, `parcel_id`, `center`, `size`, `yaw_deg`, `style`, `review_status`), `trees` (`id`, `position`, `crown_radius_m`, `height_m`, `species`, `source`), `provenance`, `limitations`.

POST `/v1/decisions`: `{schema_version:1, tick:int, agents:[{id,kind,position:[x,y,z],activity,nearby:[{id,kind,distance_m}],vehicle_distance_m,blocked}], weather:{rain,humidity,storm}, hour:float}`. Response `{schema_version:1,tick,decisions:[{id,action,source}],latency_ms}`. Actions: `continue`, `pause`, `greet`, `redirect`, `seek_shelter`, `slow`, `stop`. Jev cannot override local collision/traffic constraints. Server owns API keys; UE targets loopback. Late batches are discarded by UE.

## Verification gates

Run `uv run pytest` and `uv run ruff check .`; CLI acquisition/build/verify and HTTP smoke tests. Test altered/missing GIS features, missing canopy, inference timeout, malformed/partial output, bounded concurrency and 500-agent dispatch. Report each check as pass/fail/blocked with measured values and provenance. A round trip to the same GIS input is only an import-fidelity check; it cannot establish survey accuracy. Missing canopy, reference facades, engine, assets, or GPU measurements must prevent overall acceptance.

## Remaining production milestones

Full neighborhood boundary approval and coverage; LiDAR ground surface and canopy extraction; independent satellite canopy validation; authored four-style facade kits and landscape rules; licensed Nanite species/wind; weather Niagara/clouds and spatial sound assets; lane topology/signals/vehicles and animation; World Partition/HLOD; privacy review workflow; recorded target-hardware benchmark. The first runnable foundation does not satisfy photorealism or these release gates.

## Local delivery evidence

### Continuation: observed terrain and live development view

Previous goal turn: progress (working GIS/decision code and fresh verification). UE execution and production assets remain unavailable. Continue public terrain/canopy acquisition while adding a browser inspection view requested by Val, without changing UE5 as the final target.

- [x] Expose only the generated world and its matching verification report through the loopback API; test missing files and stale reports.
- [x] Render the actual manifest in a development browser view, exercise controls, and leave its process live for Val.
- [x] Locate a public DEM/canopy source, record CRS/datum/resolution/lineage, and implement observed terrain ingestion if available.
- [x] Re-run meaningful behavior tests, secret protection, and artifact verification; preserve production acceptance blockers.

- 2026-09-17: downloaded 10,420 parcel records and 1,026 road features; output 9,981 parcel parts, 940 road parts, 2,605 house masses, zero observed trees.
- `unreal/Content/Data/world.json` and residence review queue exist locally and remain ignored. Import fidelity and building containment pass; overall verification is blocked.
- 500-agent real HTTP smoke test passed in local-rules mode. `data/reports/` includes verification, benchmark, HTTP evidence, and a static GIS layout.
- Python 3.11/3.13 regression suites run locally. UE automation is authored but unexecuted. No commit, push, GitHub CI run, or release occurred.
- Waiting for an engine/toolchain location, licensed art/audio, independently sourced canopy/elevation and boundary/survey evidence, and Jev credentials/live inference access to complete the production objective.

### Interactive showcase: appearance, architecture, flight, and economy

Val requested a live development server, System/Light/Dark appearance, more realistic buildings, a futuristic floating moped, and playable economics demonstrating Jev.

- [x] Start loopback bridge and Vite development server at ports 8765 and 5173.
- [x] Add System/Light/Dark preference with persistence and live OS following.
- [x] Acquire USGS Houston DEM and H-GAC historical canopy footprint; attach observation receipts. Terrain import passes; absent generated trees now correctly fail comparison with the canopy reference.
- [x] Add original four-style facade/roof kits with instancing and footprint bounds tests; this is improved procedural architecture, not completed photorealism.
- [x] Add hovering moped cockpit, bounded scenic tour/manual flight, accessible pause/exit, and reduced-motion behavior.
- [x] Add neighborhood-service scenarios: demand, fees, wages/staffing, storms; visible decision provenance and accounting, using asynchronous reactions through the loopback bridge. Actual live Jev remains unverified without credentials.
- [x] Verify actual browser interactions, appearance modes, flight, economic accounting and stale-response handling; repeat secret scans and appropriate regression checks.

The bonus flight is a browser camera experience. Its local scenic autopilot does not invoke Jev. Economics will be a synthetic demonstration model, not an estimate of actual River Oaks business outcomes. UE5 remains the final rendering target and is still unavailable on this host.

### Active goal: realism, locals, consequential scenarios, and street-level riding

Previous goal turn classification: **progress**. The authoritative worktree contains the live browser, moped, architecture kits, economic engine, tests, and verification artifacts; both dev servers were revalidated on continuation.

- [ ] Replace flat visual treatment with physically based surface materials, environment lighting, contact shadows, and credible streetscape detail while retaining source geometry.
- [ ] Acquire/extract observed 3D vegetation efficiently if available, preserving provenance and independent canopy verification; do not label synthetic stem positions as surveyed trees.
- [ ] Let the moped descend to street level with smooth controls, local terrain/building collision, and seamless return to the tour.
- [ ] Make locals selectable/interactable; interactions must alter real scenario state with visible consequence and explicit Jev/local provenance.
- [ ] Add consequential bounded scenarios with objectives, interventions, and outcome evidence, retaining deterministic accounting and reactive-only Jev.
- [ ] Inspect live visual results and exercise behavioral/performance/secret tests; do not claim final photorealism or live Jev without their evidence.

### User follow-up: collapsible controls for UHD viewing

- [x] Add a persistent collapsible side panel and an edge trigger outside the hidden/inert controls, with keyboard focus recovery and mobile behavior.
- [x] Resize the render surface with its viewport and cap backing-buffer work to a native UHD pixel budget (3840×2160), avoiding accidental 8K rendering on Retina 4K displays.
- [x] Exercise the complete collapse/reopen/persistence flow at 3840×2160 and mobile widths, including while riding and running a scenario; inspected screenshots, no browser errors. Native collapsed buffer 3840×2160; mobile 390×844 with no horizontal overflow.

### Focused destination: River Oaks District, 4444 Westheimer

Val authorized reducing the geographic scope to improve a walkable, realistic experience around actual public storefronts and conversations with fictional locals. The neighborhood import remains available as source work; the focused district is the current experience priority.

- [ ] Acquire the district's official public directory/layout, record date and spatial limitations; never invent store positions and label them accurate.
- [ ] Add a focused district scene and ground-level walking controls with collision, storefront destinations, and the existing moped/expandable UHD interface.
- [ ] Place fictional locals at public gathering points, add reactive conversations and interventions with visible outcomes.
- [ ] Verify walking, store discovery, conversations, mission effects, scene switching and UHD/mobile UI end to end. Preserve explicit gaps for photographic geometry, live Jev, UE execution and hardware profiling.
