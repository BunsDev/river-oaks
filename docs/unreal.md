# Unreal Engine foundation

This is a **GIS blockout**, not a photorealistic scene. Unreal Engine is not installed on the development host, so the C++ module, editor script, automation tests, rendered scene, and packaged build have **not been compiled or run**. No 4K/60 fps claim is made. The generated map is intentionally not checked in because creating it requires the editor.

## Build and open

1. Install Unreal Engine **5.6** and its supported native toolchain. Generate project files for `unreal/RiverOaks.uproject`, then build the **RiverOaksEditor Development** target using the engine's `Build.bat` (Windows) or `Build.sh` (macOS/Linux). The module uses Engine, HTTP, Json and InputCore; no marketplace plugin is required.
2. Generate `unreal/Content/Data/world.json` using the repository pipeline. Keep the manifest and its verification report together. The loader accepts schema 1, EPSG:32615, local east/north/up meters; it converts to Unreal east/south/up centimeters. `center` on buildings and `position` on trees denote their base, not geometric center.
3. Open the project. Before the map exists, the configured startup map cannot load; create/open an empty level. Save any current work. In the Python console run:

   ```python
   import runpy, unreal

   runpy.run_path(
       unreal.Paths.project_content_dir() + "Python/bootstrap_world.py", run_name="__main__"
   )
   ```

   The bootstrap creates `/Game/Maps/RiverOaks`, a color-parameter material, movable sun, sky atmosphere, skylight, fog, world actor and player start. It refuses to overwrite an existing map. Unreal's `new_level` closes the current persistent level, so save your editor work before invoking it. See [LevelEditorSubsystem](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/LevelEditorSubsystem?application_version=5.6).
4. Press **Play** and click the viewport. The engine spectator pawn provides mouse look, WASD and E/Q vertical movement. Escape exits play. The scene geometry is generated at BeginPlay; an empty editor viewport before Play is expected. Select `River Oaks GIS BLOCKOUT` to change agent count (0–500), weather parameters and asset slots.
5. Start the Python decision service on `127.0.0.1:8765` to use decisions. With no service, local movement continues using deterministic rules. No API key belongs in the Unreal project.

For a source-built engine, a typical editor build invocation is:

```sh
"$UE_ROOT/Engine/Build/BatchFiles/Mac/Build.sh" RiverOaksEditor Mac Development \
  -Project="$PWD/unreal/RiverOaks.uproject" -WaitMutex
```

Replace the platform/script for your installation. This is an instruction to run on an engine-equipped machine, not recorded build evidence.

## What runs in the foundation

The actor reads `Content/Data/world.json`, rejects malformed geometry, and creates instanced road boxes, four representative roof treatments (Tudor, Georgian, French and modern), building masses, trunk/canopy shapes and NPC markers. Roads preserve input polylines and declared widths; road surfaces are narrow flat prisms, not intersection topology. Parcel boundaries are used by the offline pipeline to place houses; the runtime does not draw parcels. Tree arrays remain empty when no observed canopy input is supplied. The ground is flat; no elevation model has been supplied.

NPCs are scaled sphere markers, with pedestrians and joggers following road-edge offsets. Local motion caps each step at 50 ms, stops at static collision/bounds, checks other agents, and reverses when obstructed. This is a lightweight movement foundation, not skeletal animation, crowd navigation, surveyed sidewalks, vehicle traffic or a complete daily schedule. Local schedules pause pedestrians overnight (before 06:00 and from 22:00) and joggers overnight/at midday (11:00–17:00). Inference cannot override these motion limits. Storm state selects shelter; rain above 0.5 or humidity above 0.85 slows active pedestrians. External stop/pause/shelter decisions remain stationary even when local rules allow movement. Intersection crossings and route continuity still require a lane/sidewalk graph. `seek_shelter` currently pauses the marker; no reachable shelter search exists.

One asynchronous HTTP request may be outstanding at a time. Packets are sent at most every two seconds; they contain up to 500 agents and eight nearby observations each. A 1.25-second HTTP timeout and 1.5-second local watchdog bound pending work; stale tick/age responses and malformed actions are rejected. Decisions expire after 1.5 seconds. Callbacks explicitly execute on the game thread. Geometry collision and nearby-agent checks run locally regardless of service output. The server is fixed to loopback; inference cannot supply URLs or execute code.

Weather cycles time of day, sun intensity/orientation, humidity, fog density and rain/storm state. `OnWeatherChanged` is a Blueprint event for connecting authored rain Niagara, wetness materials, thunder/audio, wind and lightning. Rain values alone do not render raindrops. These assets and effects are not shipped.

## Asset replacement

`BuildingStyleMeshes` maps manifest style strings to licensed meshes. `CanopyMesh` replaces the canopy placeholder. These slots use centered meshes with nominal 100 cm bounds, scaled to manifest dimensions; preprocess meshes to that convention before assignment. Replacement building meshes should include roofs. `BlockoutMaterial` has a `Color` vector parameter; it is a simple rough color material, not a PBR asset kit. Building collision requires simple collision on replacement meshes.

For production, author a separate species/facade kit importer with real dimensions, pivots, materials, LOD/Nanite settings, wind and collision instead of treating these uniform slots as a finished art pipeline. This repository contains no licensed Megascans/Fab content. Generic house masses intentionally do not reproduce individual residences.

## Required engine verification

Run the automation tests after building:

```sh
"$UE_EDITOR_CMD" "$PWD/unreal/RiverOaks.uproject" \
  -unattended -NullRHI -ExecCmds="Automation RunTests RiverOaks" \
  -TestExit="Automation Test Queue Empty" -log
```

Tests were written before the C++ helpers. Their red/green execution is blocked by the absent engine; they are **unexecuted tests**, not passing tests. They cover coordinate handedness/unit conversion, ground-centered building placement, bounded movement/population, stale response policy, action safety, and authoritative schedule/weather limits against external movement decisions. They do not establish that UHT, the runtime loader, map bootstrap, rendering or packaging works.

Before accepting the Unreal deliverable, build both Editor and Game targets; run automation; bootstrap and play the map; inspect orientation and known intersections; test service absent/slow/invalid responses; verify no bounds or house collisions; package and verify JSON staging; profile 500 agents at 4K on named target hardware; attach frame timing, screenshots and a capture. Review the generated geometry and GIS acceptance report independently. World Partition/HLOD, production traffic/crowds, weather/audio effects, accurate ground/canopy and licensed photoreal assets remain separate delivery work.
