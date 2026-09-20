# Native residents

The UE district can use the same six CC0 clothed character profiles as the browser.
`import_residents.py` imports their skeletal meshes, assigns body, hair, garment,
eye and shoe materials, and saves the district's `ResidentAppearances` map.
Missing or invalid appearances still fall back to markers.

## Reproduce on an engine host

Use UE 5.8.2 and build `RiverOaksEditor` as described in
[engine acceptance](engine-acceptance.md#build-evidence). Bootstrap
`/Game/Maps/RiverOaksDistrict` before importing residents.

From the repository root:

```sh
uv sync --locked --extra assets
uv run --extra assets python scripts/prepare_native_characters.py
```

This verifies the checked-in source hashes and replaces embedded WebP textures
with PNG textures for Unreal Interchange. Mesh geometry, skin weights and bone
hierarchies are preserved. Output goes to `data/generated/native-characters`.
No Blender installation or commercial character plugin is required.

In the project's Unreal Editor Python console, run:

```python
import runpy, unreal

runpy.run_path(
    unreal.Paths.project_content_dir() + "Python/import_residents.py", run_name="__main__"
)
```

Wait for `RIVER_RESIDENTS_READY profiles=6`. Assets are saved below
`/Game/Generated/Residents`; the configured map is saved automatically. The
source scripts and manifests are versioned; generated GLBs, Unreal assets and
the map remain local under the existing repository policy. A fresh checkout
therefore needs this setup before it displays native clothed residents.

The importer checks the prepared profile IDs, source hashes and filenames against
the current catalogue before touching editor assets. An import receipt permits rerunning the editor script without duplicating
completed profiles. Existing unreceipted folders are deliberately refused. If
conversion is interrupted, move the partial `data/generated/native-characters`
directory aside and rerun conversion. If an individual Unreal import fails,
close the editor and move only that profile's unreceipted folder out of
`unreal/Content/Generated/Residents`, then rerun the editor script. Preserve the
receipt and completed folders. A source-hash or importer-version change makes the
receipt stale. For an intentional full regeneration, close the editor, move both
`unreal/Content/Generated/Residents` and `unreal-import.json` to a backup outside
the project, then rerun the import. Preserve any manually edited assets before
doing this. The importer never performs that replacement automatically.

## Animation and verification

`URiverProceduralAnimInstance` evaluates a small procedural gait on the imported
rig. The simulation supplies state, horizontal speed and accepted travel
distance; animation changes limb rotations without moving the component.
Idle and shelter return to the reference pose. Slow walking, walking and jogging
share a distance-driven stride with speed/state-dependent amplitude.

Run `Automation RunTests RiverOaks.Contracts` for source-only native contracts.
After importing assets, run `Automation RunTests RiverOaks` to include
`RiverOaks.NativeAssets.Residents`. The latter loads every profile, checks its
five material slots and rig, evaluates walking and shelter poses, and checks
that animation preserves the authoritative component transform. Inspect the
exported JSON result counts; a zero process exit alone is insufficient.

September 20, 2026 validation on the installed UE 5.8.2 host:

- Editor and Game Development builds succeeded.
- Native automation: 13 succeeded, 0 failed, 0 not run.
- Python: 74 passed, including GLB preservation and refusal checks; Ruff passed.
- JavaScript: 87 passed; preview production build passed with its existing
  Three.js chunk-size advisory.
- Independent source review found no blocker; import recovery limits are above.

Local native evidence is in `/tmp/river-native-final-tests/index.json`,
`/tmp/river-upright-build-2.log`, `/tmp/river-native-final-game-build.log`
and `/tmp/river-native-upright-import.log`. The repeat import with catalogue
validation reused all six profiles and exited zero; see
`/tmp/river-native-import-resume.log`.

The rendered runtime reopened the saved district with clothed residents. A
front/back close-up confirmed upright orientation and visible suit, skin and hair
materials; runtime shutdown exited zero. This is a sampled visual check, not a
full motion or material review of every profile. The initial render exposed an
incorrect positional rotation argument. The stronger orientation test then failed
for all six profiles; explicit named yaw and regenerated assets pass. Evidence
for the failing regression is `/tmp/river-upright-red-2/index.json`.

Stationary residents retain the source rig's relaxed A-pose. This is prototype
locomotion, without authored animation clips, foot IK or
collision-aware foot placement. Source hair transparency is rendered with a
two-sided masked material. Native interactions still provide a basic greeting;
the browser has the fuller conversation interface. The earlier
[street-level acceptance limits](street-level-plan.md#verification) for native
input/collision and isolated SSAO image comparison still apply.
