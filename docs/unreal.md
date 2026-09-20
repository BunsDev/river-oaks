# Unreal Engine foundation

This is a **GIS blockout**, not a photorealistic scene. The Editor and Game Development targets compile on Unreal Engine 5.8.2 with Xcode 26.6 on an Apple M3 Max. Native contract and imported-resident tests pass; see [native resident validation](native-residents.md#animation-and-verification) for the current results. Map bootstrap, saved-volume persistence, and rendered SSAO are verified; see [engine acceptance](engine-acceptance.md). Packaging remains unverified. No 4K/60 fps claim is made. The generated map is intentionally not checked in because creating it requires the editor.

## Shopping district scope

The active map is `/Game/Maps/RiverOaksDistrict`, restricted to the bundled River Oaks District footprint at Westheimer and Westcreek: approximately 254 × 290 metres, 9 building footprints, 39 road/path segments and 30 storefront destinations. The old residential map is no longer a startup or game map. The runtime rejects non-district and oversized manifests.

Stage the native input with:

```sh
uv run python scripts/export_district.py
```

This copies the browser district’s geographic x/y into `unreal/Content/Data/district.json`. The native blockout uses a flat ground plane, so the export intentionally flattens altitude; the browser retains its observed terrain. Follow [native resident setup](native-residents.md) to import the six clothed profiles and enable procedural locomotion. Without that local setup, native people use markers. Native interaction provides a basic proximity greeting; the browser provides the complete topic-based conversation interface.

## Build and open

1. Install Unreal Engine **5.8.2** and its supported native toolchain. Generate project files for `unreal/RiverOaks.uproject`, then build the **RiverOaksEditor Development** target using the engine's `Build.bat` (Windows) or `Build.sh` (macOS/Linux). The module uses Engine, HTTP, Json and InputCore; no marketplace plugin is required.
2. Run `uv run python scripts/export_district.py` to stage `unreal/Content/Data/district.json` from the bundled shopping footprint. Keep its source attribution. The loader accepts schema 1, EPSG:32615, local east/north/up meters; it converts to Unreal east/south/up centimeters. `center` on buildings and `position` on trees denote their base, not geometric center.
3. Open the project. Before the map exists, the configured startup map cannot load; create/open an empty level. Save any current work. In the Python console run:

   ```python
   import runpy, unreal

   runpy.run_path(
       unreal.Paths.project_content_dir() + "Python/bootstrap_world.py", run_name="__main__"
   )
   ```

   The bootstrap creates `/Game/Maps/RiverOaksDistrict`, a color-parameter material, movable sun, sky atmosphere, skylight, fog, world actor, player start and an unbound global Post Process Volume. It refuses to overwrite an existing map. Unreal's `new_level` closes the current persistent level, so save your editor work before invoking it. See [LevelEditorSubsystem](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/LevelEditorSubsystem?application_version=5.6).
4. Press **Play** and click the viewport. The walking pawn provides mouse look, WASD movement, arrow-key turning and E to greet a nearby visitor. Movement remains at street height and within the district; there is no vertical flight control. Escape exits editor play. The scene geometry is generated at BeginPlay; an empty editor viewport before Play is expected. Select `River Oaks GIS BLOCKOUT` to change agent count (24 by default), weather parameters and asset slots.
5. Start the Python decision service on `127.0.0.1:8765` to use decisions. With no service, local movement continues using deterministic rules. No API key belongs in the Unreal project.

For a source-built engine, a typical editor build invocation is:

```sh
"$UE_ROOT/Engine/Build/BatchFiles/Mac/Build.sh" RiverOaksEditor Mac Development \
  -Project="$PWD/unreal/RiverOaks.uproject" -WaitMutex
```

Replace the platform/script for your installation. This is an instruction to run on an engine-equipped machine, not recorded build evidence.

## Global Post Process Volume and SSAO

Newly bootstrapped maps contain **River Oaks Global Post Process**, enabled with
Infinite Extent (Unbound), blend weight 1, and AO intensity 0.6, radius 100 and
quality 100. Only those AO settings are overridden; other post-process settings
retain their existing values. These are initial tuning values. The native run confirms that SSAO renders; it does
not establish final art quality or a performance target.

For an existing map, open the intended map and run this in the editor Python console:

```python
import runpy, unreal

runpy.run_path(
    unreal.Paths.project_content_dir() + "Python/setup_post_process.py", run_name="__main__"
)
```

Inspect the result and save the level. Repeating setup updates the named volume
without adding another or modifying artist-authored volumes. Duplicate named
volumes cause an explicit error. The bootstrap still refuses to overwrite maps.
Restart the editor after updating `DefaultEngine.ini` so its SystemSettings apply.
The config selects SSAO (`r.AmbientOcclusion.Method=0`), enables quality-selected
AO levels, disables Lumen ShortRangeAO and enables `r.Lumen.DiffuseIndirect.SSAO`.
Lumen GI and reflections remain enabled. `r.GenerateMeshDistanceFields=True`
provides the geometry representation required by Lumen software ray tracing;
without it, Unreal reports that Lumen has no ray tracing data. Restart after
changing this setting and allow the distance fields to build. See Epic's
[Lumen technical details](https://dev.epicgames.com/documentation/unreal-engine/lumen-technical-details-in-unreal-engine). Epic's
[UE5.6 rendering update](https://www.docswell.com/s/EpicGamesJapan/KWM1EQ-CEDEC2025-ue5_6update)
describes the Lumen SSAO path; the
[PostProcessSettings API](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/PostProcessSettings?application_version=5.6)
documents the volume controls.

The UE5.8.2 acceptance run built both targets, passed all eight native tests,
saved and reopened exactly one named unbound volume, and verified the four
console variables. A GPU capture contains the SSAO setup and pixel passes.
See [the acceptance record](engine-acceptance.md) for evidence and limitations.
The Python unit tests cover orchestration with an editor double; native checks
establish the Unreal property bindings, persistence, and rendering separately.

For a map created before instanced material usage was enabled, run this once in
the editor Python console to update the generated material:

```python
import runpy, unreal

bootstrap = runpy.run_path(unreal.Paths.project_content_dir() + "Python/bootstrap_world.py")
bootstrap["configure_blockout_material"](unreal.load_asset(bootstrap["MATERIAL"]))
```

## What runs in the foundation

The actor reads `Content/Data/district.json`, rejects malformed geometry, and creates instanced road boxes, retail building masses, trunk/canopy shapes and NPC markers. Roads preserve input polylines and declared widths; road surfaces are narrow flat prisms, not intersection topology. Parcel boundaries are used by the offline pipeline to place houses; the runtime does not draw parcels. Tree arrays remain empty when no observed canopy input is supplied. The ground is flat; no elevation model has been supplied.

NPCs are scaled sphere markers, with pedestrians and joggers following road-edge offsets. Marker rendering now sits behind the `IRiverHumanBackend` contract (`Source/RiverOaks/Public/RiverOaksHumans.h`): `ARiverOaksWorld::MoveAgents` computes the authoritative position and hands each backend a sequenced `FRiverHumanPose`; `FRiverMarkerBackend` is the built-in fallback. Backend discovery is enabled (`bRiverHumanBackendDiscoveryEnabled` is `true`), so a plugin registered under the `RiverHumanBackend` modular feature with a higher priority replaces the marker backend with no host change. Appearance is resolved, never authored: `SpawnAgents` calls `URiverAppearanceCatalogue::Resolve` and `FRiverRecipeValidator::Validate` before `CreateHuman`, and falls back to the marker backend on rejection. The catalogue holds the same six CC0 profiles the browser showcase ships, and the four fictional portrayals are locked to fixed generic presets; `tests/test_appearance_catalogue.py` enforces that parity in CI (see `docs/astra-integration.md`). That code compiles in both native targets, and its authority, backend-selection, pose-sequence and recipe tests pass in UE5.8.2. Local motion caps each step at 50 ms, stops at static collision/bounds, checks other agents, and reverses when obstructed. This is a lightweight movement foundation, not skeletal animation, crowd navigation, surveyed sidewalks, vehicle traffic or a complete daily schedule. Local schedules pause pedestrians overnight (before 06:00 and from 22:00) and joggers overnight/at midday (11:00–17:00). Inference cannot override these motion limits. Storm state selects shelter; rain above 0.5 or humidity above 0.85 slows active pedestrians. External stop/pause/shelter decisions remain stationary even when local rules allow movement. Intersection crossings and route continuity still require a lane/sidewalk graph. `seek_shelter` currently pauses the marker; no reachable shelter search exists.

One asynchronous HTTP request may be outstanding at a time. Packets are sent at most every two seconds; they contain up to 500 agents and eight nearby observations each. A 1.25-second HTTP timeout and 1.5-second local watchdog bound pending work; stale tick/age responses and malformed actions are rejected. Decisions expire after 1.5 seconds. Callbacks explicitly execute on the game thread. Geometry collision and nearby-agent checks run locally regardless of service output. The server is fixed to loopback; inference cannot supply URLs or execute code.

Weather cycles time of day, sun intensity/orientation, humidity, fog density and rain/storm state. `OnWeatherChanged` is a Blueprint event for connecting authored rain Niagara, wetness materials, thunder/audio, wind and lightning. Rain values alone do not render raindrops. These assets and effects are not shipped.

## Asset replacement

`ResidentAppearances` maps the six catalogue IDs to native skeletal meshes and locomotion animation classes. Each mesh must include its catalogue body, hair and garments, with Z up and X forward. The backend applies the recipe's stature from reference import bounds and aligns the mesh beneath the simulation anchor. It refuses unsupported recipes or incomplete animation setup before taking a handle; the existing marker fallback then handles the session. Released components are destroyed, and disabling backend discovery always selects markers. No native character assets or animation graphs ship yet, so the default scene keeps its markers. See [skeletal backend acceptance](skeletal-backend-acceptance.md) for coverage and remaining asset work.

`BuildingStyleMeshes` maps manifest style strings to licensed meshes. `CanopyMesh` replaces the canopy placeholder. These slots use centered meshes with nominal 100 cm bounds, scaled to manifest dimensions; preprocess meshes to that convention before assignment. Replacement building meshes should include roofs. `BlockoutMaterial` has a `Color` vector parameter; it is a simple rough color material, not a PBR asset kit. Building collision requires simple collision on replacement meshes.

For production, author a separate species/facade kit importer with real dimensions, pivots, materials, LOD/Nanite settings, wind and collision instead of treating these uniform slots as a finished art pipeline. This repository contains no licensed Megascans/Fab content. Generic house masses intentionally do not reproduce individual residences.

## Required engine verification

Run the automation tests after building:

```sh
"$UE_EDITOR_CMD" "$PWD/unreal/RiverOaks.uproject" \
  -unattended -NullRHI -ExecCmds="Automation RunTests RiverOaks" \
  -TestExit="Automation Test Queue Empty" -log
```

The C++ automation tests compile with the Editor target. Their execution status is recorded in [engine acceptance](engine-acceptance.md). They cover coordinate handedness/unit conversion, ground-centered building placement, bounded movement/population, stale response policy, action safety, and authoritative schedule/weather limits against external movement decisions. They do not establish that map bootstrap, rendering, or packaging works.

For production acceptance, repeat the recorded native build, automation, bootstrap and play checks; inspect orientation and known intersections; test service absent/slow/invalid responses; verify no bounds or house collisions; package and verify JSON staging; profile 500 agents at 4K on named target hardware; attach frame timing, screenshots and a capture. Review the generated geometry and GIS acceptance report independently. World Partition/HLOD, production traffic/crowds, weather/audio effects, accurate ground/canopy and licensed photoreal assets remain separate delivery work.
