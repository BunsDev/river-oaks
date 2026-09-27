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

Importer version 3 keeps the mesh and skeleton in Interchange's native +Y-facing,
Z-up basis. The runtime component rotates both together to the simulation's +X
forward direction. Version 2 imports must be regenerated using the backup steps
below; changing only the runtime code leaves those older assets facing incorrectly.

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
Idle and shelter settle into a relaxed standing pose with lowered shoulders and
slightly bent elbows. Slow walking, walking, and jogging share a distance-driven
stride with speed/state-dependent amplitude. Each proxy blends that amplitude
with a critically damped spring, preserving its velocity when movement changes
and retaining the accepted-distance phase through a stop.

Run `Automation RunTests RiverOaks.Contracts` for source-only native contracts.
After importing assets, run `Automation RunTests RiverOaks` to include
`RiverOaks.NativeAssets.Residents` and the generated-district ground check.
The resident suite loads every profile, checks its
five material slots and rig, checks toe bones and eye bind geometry against three
world headings, evaluates forward leg swing and shelter poses, and checks
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

The September 20 runtime check confirmed upright clothed residents and visible
suit, skin and hair materials. It did not establish correct face direction: its
orientation assertion measured bones alone. The September 22 conversation check
exposed visible geometry facing sideways despite correct simulated heading.
Importer version 3 therefore preserves the neutral mesh/skeleton basis and applies
facing correction to the component. The asset suite now checks both eye bind
geometry and toe bones in world space. With regenerated assets, all 15 native
tests and both Development builds pass. A rendered `woman-casual` encounter
confirmed facing the visitor, E close, and reopening; the other five profiles
have automated geometry coverage but still need rendered inspection. Evidence is
in [`native-resident-facing.json`](../data/reports/native-resident-facing.json).

The September 22 resting-pose follow-up passed all 21 native tests and both
Development builds. The six-profile asset suite checks wrist height, elbow
flexion, thigh clearance, forward stride, and evaluated stop continuity. It also
compares slow-walk, walk, and jog amplitudes at equal phase and checks that idle
suppresses gait despite accepted displacement. Separate
contracts check the blend at 30, 60, and 144 Hz, interrupted transitions, and
invalid inputs. A rendered `woman-casual` sample confirms lowered arms, a moving
stride, and the settled stance after stopping. Quantitative transition continuity
comes from automation; the screenshots are sampled poses, not a complete motion
review. See [`native-resting-poses.json`](../data/reports/native-resting-poses.json).

Resident roots now follow static support near their current sole height. The
query accepts surfaces up to 30 cm above or below that height with normals no
steeper than 45 degrees. Missing support, larger steps, and steep surfaces block
movement; unsupported spawn points are skipped. Held conversation partners keep
their accepted position. Roads participate in collision queries at their existing
rendered height, without changing the district geometry.

`RiverOaks.Contracts.NativeGroundContact` uses synthetic floors and requires no
generated district. `RiverOaks.NativeAssets.DistrictGroundContact` measures the
24 spawn positions against the locally generated district. The resident asset
suite also measures each profile's resting shoe bind geometry. These checks
establish standing placement and supported roots. Moving feet still need contact
solving, and curb height changes need step animation.

The support-height follow-up passed 23 native tests, both Development builds,
and a 21-test Contracts run with the generated manifest absent. All 24 district
spawn roots measured zero gap to support, and all six resting shoe meshes met
their expected ground height. Rendered acceptance sampled `woman-casual` on the
road and confirmed E open/close. Results and coverage limits are in
[`native-ground-contact.json`](../data/reports/native-ground-contact.json).

This is prototype locomotion, without authored animation clips, foot IK, or
collision-aware foot placement. Source hair transparency is rendered with a
two-sided masked material. Native interactions still provide a basic greeting;
the browser has the fuller conversation interface. Native greetings now hold the
selected resident, check visible talking reach and release on close, expiry or
separation. Native input tests cover E, walking away and pawn destruction; the
rendered check covers E open/close and facing on one resident. In-flight HTTP
timing and broader motion acceptance remain open. See the
[interaction progress record](people-interaction-progress.md#native-encounter-holds-september-22). The earlier
[street-level acceptance limits](street-level-plan.md#verification) for native
input/collision and isolated SSAO image comparison still apply.
