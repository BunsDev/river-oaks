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

- [x] Add local CC0 PBR surface maps, HDR environment lighting, shadows and interpreted streetscape detail while retaining source geometry. Photographic facade reconstruction remains outstanding.
- [ ] Acquire/extract observed 3D vegetation efficiently if available, preserving provenance and independent canopy verification; do not label synthetic stem positions as surveyed trees.
- [x] Let the moped descend to street level with smooth controls, local terrain/building collision, and seamless return to the tour. Current browser check reaches 3 m displayed ground clearance and then rises above roofs.
- [x] Make locals selectable/interactable; interactions alter scenario state with visible consequence and explicit Jev/local provenance.
- [x] Add bounded heatwave, storm and delivery scenarios with finite resources, delayed aid, failure states and demonstrated six-neighbor success.
- [x] Inspect live visual results and exercise behavioral/secret checks and native UHD resolution. Final photorealism, target-GPU performance and live Jev remain unverified.

### User follow-up: collapsible controls for UHD viewing

- [x] Add a persistent collapsible side panel and an edge trigger outside the hidden/inert controls, with keyboard focus recovery and mobile behavior.
- [x] Resize the render surface with its viewport and cap backing-buffer work to a native UHD pixel budget (3840×2160), avoiding accidental 8K rendering on Retina 4K displays.
- [x] Exercise the complete collapse/reopen/persistence flow at 3840×2160 and mobile widths, including while riding and running a scenario; inspected screenshots, no browser errors. Native collapsed buffer 3840×2160; mobile 390×844 with no horizontal overflow.

### Focused destination: River Oaks District, 4444 Westheimer

Val authorized reducing the geographic scope to improve a walkable, realistic experience around actual public storefronts and conversations with fictional locals. The neighborhood import remains available as source work; the focused district is the current experience priority.

- [x] Match 30 mapped OSM tenants against the official directory; preserve ODbL attribution and source receipt. Use permitted OSM geometry rather than the proprietary venue map. Mark inferred storefront/arrival positions as unverified.
- [x] Add a focused district scene and ground-level walking controls with source-footprint collision, storefront destinations, and the moped/expandable UHD interface.
- [x] Place 24 fictional encounters at mapped public stops, with authored conversations, immediate reaction packets and consequential support actions.
- [x] Verify walking, store discovery, nearby conversations, mission success, scene switching and UHD/mobile controls. See `data/reports/district-e2e.json` and `sidebar-e2e.json`.

### Resident identities, local voices, and TypeSafe appearance

- [x] Give 20 fictional residents first-person identities, interests, routines and separate per-scene encounter/support memories. Scenario resets preserve memories; scene reloads reset them.
- [x] Add sourced fictional portrayals of Ima Hogg, Barbara Jordan, Hakeem Olajuwon and Beyoncé, with historical/contemporary labels and public biography links. Do not assert current private residences or clone voices/likenesses.
- [x] Carry at most 512 characters of persona context into the existing Jev classification packet, preserving local safety and reactive-only decisions. Mock transport confirms delivery; actual Jev still runs in local fallback without credentials.
- [x] Install optional free local Kokoro-82M int8 CPU voices, pinned model hashes, 24 distinct presets, one active job, bounded cache, opt-in UI and cancellation. Real WAV generation and browser playback/mute verified; no subjective listening-quality or mass-concurrency claim.
- [x] Match neutral light/dark surfaces, pink accents and system typography to `BunsDev/typesafe-ai-playground` `app/dashboard.css` at `fcd1773`; leave that repository unchanged. Verify live OS appearance changes.
- [x] Fix service-worker visibility on first economy launch while preserving subsequent user visibility choices.
- [x] Verification: 73 JavaScript tests, 41 Python tests, Python lint/format, production browser build, UHD/mobile browser flows, worktree/history secret scans. Three.js chunk-size advisory remains nonfatal. No commit/push performed in this continuation.

Current continuation classification: **progress**. Keep the full goal open: UE5 execution, photographic storefronts/interiors, production characters, observed 3D canopy, independent survey evidence, live Jev throughput and target-GPU 4K/60 profiling are still required. Browser improvements do not satisfy those production gates. Development servers remain on loopback ports 5173 and 8765.

### Current visual-fidelity pass

Previous turn classification: **progress**, verified against current modified files, stored browser receipts and live loopback processes. The full objective remains active.

- [x] Replace rough masonry/opaque storefront bands with pale cut-stone cladding, recessed glazing and original display interiors, guided by Gensler's public district photograph while preserving mapped footprints. Tenant categories distinguish dining furniture from retail displays.
- [x] Replace capsule figures with clothed CC0 human meshes generated through an isolated Blender/MPFB asset pipeline; retain fictional identities and bounded runtime cost. Six cached, skinned templates serve 24 encounters; model hashes, licenses and rebuild inputs are recorded.
- [x] Inspect before/after street-level renders, exercise conversations and scenario behavior, and measure asset/render costs. Record source licenses and remaining photo/survey accuracy gaps in `docs/visual-fidelity.md`.

Fresh validation on 2026-09-17: 74 JavaScript tests and 41 Python tests pass, with Python lint/format and the production browser build. District browser regression verifies walking, 30 destinations, nearby conversation, six-neighbor scenario success, scene switching and mobile/UHD controls. The visual receipt records 24 loaded characters, a 3840×2160 drawing buffer, no browser/WebGL errors and stable geometry/texture counts after two warmed scene round trips. Its short Chrome animation-frame sample measures 16.7 ms median and 17.4 ms p95; this does not establish target-GPU or UE5 performance.

This continuation remains **progress**. Photographic storefront reconstruction, observed 3D canopy, autonomous resident navigation, production animation and the outstanding UE5/GIS/Jev acceptance gates remain open. The readonly asset-build disk image was detached; the development view and local voice bridge remain running.

The final voice replay check exposed an HTTP 503 from the occupied local speech worker. The identical utterance subsequently returned a valid WAV. Added an explicit retry header for worker contention and cancellable, bounded client waiting for only the latest line; missing models still fail immediately. Regression tests reproduced the failure before the fix. Current suites pass 77 JavaScript tests and 42 Python tests; the production browser build also passes.

### Observed district vegetation

Previous turn classification: **progress**, revalidated against the modified worktree, browser receipts and live bridge. The district still has only four mapped OSM tree points with estimated dimensions; the larger neighborhood canopy comparison still fails.

- [x] Acquire a bounded, complete district subset of the public USGS Coastal 2018 LiDAR EPT hierarchy, retaining source tiles, hashes, CRS and coverage evidence. All 63 intersecting additive tiles decoded to their declared counts; 1,169,790 points remain in the district margin.
- [x] Inspect classifications and ground support before extracting canopy. Retain 24,387 class 4/5 returns with supported relative heights as 18,832 voxels. Keep the four OSM stems separate from 230 interpreted branch supports; species and current stem accuracy remain unverified.
- [x] Integrate observed vegetation with spatial foliage batches, distance-based detail and CC0 bark maps. Inspect source/scene renders and verify source-frame checks, UHD rendering, resource stability and walking/conversation/scenario behavior.

This turn is **progress**. Source integrity passes; the independent H-GAC comparison fails (IoU 0.00986; coverage-fraction error 0.06677). The live panel and `data/reports/district-canopy.json` preserve that failure. See `docs/vegetation.md` for dating, classification, relative-height and branch-interpretation limits. Full-neighborhood canopy, present-day site accuracy and the UE5 production gates remain open.

The street regression exposed a cached-neighbor bug: rapid arrival followed by E could address the previous resident before the 150 ms HUD refresh. Talk now recomputes proximity at the action. A synchronous arrival/close/E regression opened Amara correctly; the six-neighbor mission, UHD/mobile controls and scene switching passed. Current suites pass 80 JavaScript and 50 Python tests. The visual run has no browser/WebGL errors, a native 3840×2160 buffer and unchanged warmed geometry/texture counts after two scene round trips. Its 16.7 ms median/17.5 ms p95 animation-frame sample remains a local Chrome observation, not target-GPU performance proof.

### Resident movement and visible reactions

Previous continuation: **progress**. Resident personas, local voices and observed foliage are present; the people still stand at fixed encounter points.

- [x] Add bounded district navigation around source footprints and interpreted tree supports. Keep short public-stop routes outside the inference loop; reject inaccessible destinations without teleporting.
- [x] Move residents at walking speed, pause for conversations and nearby visitors, and respond to weather with interpreted awning destinations. Batch immediate reactions with deadlines and stale-response rejection.
- [x] Animate generic clothed characters from actual travel distance. Verify movement, collision, pause/resume, weather, conversations and resource scenarios in tests and the running development view.

Routes, routines, shelter choices and character animation are simulation interpretations. They do not establish real pedestrian access, emergency shelter suitability, current residence or a public figure's actual behavior.

This continuation is **progress**. Fourteen new JavaScript tests reproduced missing routing, excess movement per frame, opposing-walker deadlock, obsolete asynchronous paths, permanent shelter actions and incorrect redirect behavior before their fixes. All 94 JavaScript and 50 Python tests pass, along with Python lint/format, the production build, staged-hook tests and worktree/history secret scans. No commit or push was made.

The actual browser verified worker-based routes, batched role packets, conversation holds, storm shelter/resumption, movement pause and reduced motion, plus a native 3840×2160 buffer. The local animation-frame sample was 20.8 ms median / 25 ms p95; this does not meet a measured 60 fps claim. The district regression still completed the six-neighbor objective, rapid E conversation and mobile controls. The persona/voice run verified all four named portrayals, encounter memory, the TypeSafe palette and actual 513,068-byte local WAV playback followed by mute. Receipts are in `data/reports/`. The live bridge remains in local-rules mode; no live Jev inference or UE5/target-GPU proof is claimed.

### Visible volunteer visits

Previous turn: **progress**, confirmed by the current worktree, browser receipts and running development services. District volunteer visits still complete solely by elapsed time.

- [x] Make district visits require an assigned helper's physical arrival and on-site work. Preserve finite resources, pause/storm holds and generation fencing; return unused capacity when no route is available.
- [x] Recruit existing available residents as volunteers and reuse the navigation worker and character assets. Show their progress and make active helpers easy to locate.
- [x] Verify real arrival, unreachable routes, interrupted/stale work, weather and an achievable community objective, then inspect the live scene and leave development running.

The community model remains fictional. Helpers, travel times and effects do not represent real residents, services or emergency response.

This turn is **progress**. Six new regression tests cover physical arrival, worker movement around a wall, scenario/storm holds, route-failure refunds, stale route rejection and task-aware dialogue/reactions. All 100 JavaScript and 50 Python tests pass; the browser build and Python lint/format also pass. The native district browser run completed the six-neighbor objective with four physical visits, finite remaining supplies, rapid E interaction, mobile controls and correct navigation-worker disposal.

The focused live visit traversed 29.32 meters and started on-site work at 1.436 meters from the recipient. Its visible supply bag, task-aware greeting, conversation hold, storm hold, ambient-pause behavior, completed request and reset cleanup all passed without browser errors. The cast remains 24 people, with shared character and bag assets and one route worker. See `data/reports/volunteer-visits-e2e.json`, `data/reports/district-e2e.json` and `docs/resident-life.md`. The unchanged neighborhood preview still has abstract timers. Live Jev, photogrammetric storefronts, UE5 execution and target-hardware 4K/60 fps remain unverified; this does not complete the full project goal.

### Storefront lighting and reflections

Previous continuation: **progress**. Live inspection shows weak glass reflections and uniformly lit display rooms. Unreal Editor remains unavailable on this Mac; a UE5 workstation/path question is pending while browser work continues.

- [ ] Give thin storefront panes angle-dependent reflection, remove overlapping entry glazing, and add bounded local environment captures spread across frames.
- [ ] Add original, reusable room occlusion and warm display-light gradients, preserving source footprints and exterior collision boundaries.
- [ ] Verify reflection lifecycle/failure recovery, inspect clear/overcast and street/UHD renders, measure current frame cost, and leave development running.

Local cubemap reflections and baked room shading are rendering approximations. They do not establish photographic reconstruction, real shop interiors, ray tracing or measured UE5 performance.
