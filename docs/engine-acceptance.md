# Unreal Engine acceptance

The River Oaks Editor and Game Development targets build on Unreal Engine 5.8.2.
This records the September 20, 2026 compatibility run, not production visual acceptance.

The subsequent [street-level acceptance](street-level-plan.md#verification) supersedes
the original residential scene below with the compact shopping district.

## Environment

- Apple M3 Max, 48 GB RAM, macOS 26.6.2.
- Epic Launcher engine 5.8.2, changelist 56702186.
- Xcode 26.6, Clang 21.1.6, Mac SDK 26.5.
- Engine location: `/Users/Shared/Epic Games/UE_5.8`.

## Build evidence

Both commands ended with `Result: Succeeded`:

```sh
"$UE_ROOT/Engine/Build/BatchFiles/Mac/Build.sh" RiverOaksEditor Mac Development \
  -Project="$PWD/unreal/RiverOaks.uproject" -WaitMutex -NoUBA -NoUBALocal -MaxParallelActions=4
"$UE_ROOT/Engine/Build/BatchFiles/Mac/Build.sh" RiverOaks Mac Development \
  -Project="$PWD/unreal/RiverOaks.uproject" -WaitMutex -NoUBA -NoUBALocal -MaxParallelActions=4
```

The original 5.6/V5 target settings conflicted with the installed 5.8 editor's
shared build settings. The targets now use `BuildSettingsVersion.V7` and the
`Unreal5_8` include order. The project association is `5.8`.
An initial Unreal Build Accelerator run crashed after compilation; its zero shell
exit status was not accepted as success. The bounded retry linked and deployed.

## Native automation and persisted map

The `RiverOaks` automation group finished with **8 succeeded, 0 failed, 0 not run**:
Coordinates, HumanAuthority, HumanBackendSelection, HumanPoseSequence, Locomotion,
PortrayalRecipe, Safety and ScheduleAuthority.

```sh
"$UE_ROOT/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/unreal/RiverOaks.uproject" \
  -unattended -NullRHI -ExecCmds="Automation RunTests RiverOaks" \
  -TestExit="Automation Test Queue Empty" -ReportExportPath=/tmp/river-oaks-engine-tests
```

The native Python run created the map, ran global-volume setup twice, saved,
opened a blank map, and reopened `/Game/Maps/RiverOaks`. It verified exactly one
**River Oaks Global Post Process** volume, enabled and unbound, with blend weight 1.
AO intensity, radius and quality were 0.6, 100 and 100, with their override flags
set. It also checked the four SSAO console variables against `DefaultEngine.ini`.
The world fixture contains 940 road features and 2,605 buildings; the rendered
runtime loaded those counts. This does not establish survey accuracy.

An initial harness requested immediate shutdown after asset work and crashed
while destroying an ICU text object through a Slate notification ticker. The
saved-map assertions had passed, but the process failed. A rerun that allowed
notifications to settle before quitting passed and exited zero. A normal rendered
game session also exited zero. The stack identifies the shutdown path; it does
not establish a general engine root cause or prove the crash can never recur.
The shipped setup script does not request editor shutdown.

## Rendered SSAO and Lumen

The first rendered run reported that Lumen had no ray tracing data. Enabling
`r.GenerateMeshDistanceFields=True` and restarting removed the warning.
This is the prerequisite for Lumen software ray tracing described in
[Epic's technical documentation](https://dev.epicgames.com/documentation/unreal-engine/lumen-technical-details-in-unreal-engine).
The project also enables instanced-static-mesh usage on the generated blockout
material so runtime instances can use it instead of the default material.

At 1280×720 on the M3 Max, a GPU capture of paused frame 24522 recorded:

| Pass | GPU time |
| --- | ---: |
| AmbientOcclusionSetup 640×360 | 0.020 ms |
| AmbientOcclusionSetup 320×180 | 0.009 ms |
| AmbientOcclusionPS 320×180 | 0.030 ms |
| AmbientOcclusionPS 640×360 | 0.071 ms |
| AmbientOcclusionPS 1280×720 | 0.174 ms |

These passes establish that SSAO executes. Their sum, 0.304 ms, is one sampled
frame, not a benchmark or a 4K/60 fps result. Same-camera screenshots with
`r.Lumen.DiffuseIndirect.SSAO` set to 1, 0 and then 1 showed small differences,
but temporal variation exceeded the on/off difference. They are illustrative,
not an isolated image-quality measurement. SSAO was restored to 1 afterward.

## Evidence and limits

The [checked-in result summary](../data/reports/unreal-engine-acceptance.json)
records the native test, volume and GPU results without account identifiers.
Local artifacts from this run:

- `/tmp/river-oaks-game-build.log`: successful Game target build.
- `/tmp/river-oaks-engine-tests/index.json`: native automation results.
- `/tmp/river-oaks-bootstrap-acceptance.json`: persisted global-volume assertions.
- `/tmp/river-oaks-bootstrap-recheck.log`: clean repeated setup and shutdown.
- `/tmp/river-oaks-material-acceptance.log`: material usage assertion and clean shutdown.
- `/tmp/river-oaks-render-fixed.log`: loaded scene, distance fields and GPU capture.
- `/tmp/river-oaks-ssao-on.png`, `/tmp/river-oaks-ssao-off.png`, and
  `/tmp/river-oaks-ssao-restored.png`: illustrative captures before material repair.

The generated map and material remain local Unreal assets and are not committed.
Packaging/JSON staging, target-scale performance, production GIS accuracy and
finished art are not verified by this run. See [the production checklist](unreal.md#required-engine-verification).
