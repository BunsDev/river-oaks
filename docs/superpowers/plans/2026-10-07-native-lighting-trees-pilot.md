# Native lighting and tree pilot

## Objective and scope

Inspect and demonstrate a reversible correction in one representative area while
preserving buildings, layout, art style and the existing renderer. No map-wide
rollout, production merge or asset replacement is authorized.

Val delegated target selection, then explicitly chose “Finish the pilot; document
unsupported checks” after learning that native multiplayer movement, running and
enterable interiors are absent. Those features are not being implemented here.

- Base: `5b26f3a`; branch: `fix/native-lighting-trees-pilot`.
- Worktree: `/Users/buns/Documents/GitHub/BunsDev/.worktrees/river-oaks/native-lighting-trees-pilot`.
- Target: `/Game/Maps/RiverOaksDistrict`, courtyard beside retail building
  `625333008`, tree `osm-node-5904555939` (native canopy/trunk instance 3).
- Engine: UE 5.8.2, Mac Metal. HTTP disabled during inspection.
- Reference: actual unchanged native level; the attachment contained no screenshot.
- Other agents' IPIC/facade work and canonical main were untouched.

## Verified result

The actual exported sphere mesh penetrates the actual exported building cube:
LOD0 vertex `(-277626.951, 124067.513, 560.000)` cm is strictly inside its surface.
This is positive render-mesh evidence, not merely overlapping bounds.

The pilot changes only canopy instance 3's horizontal scale from `(7, 7)` to
`(6.58, 6.58)`: crown radius **3.50 → 3.29 m**. Height, trunk, tree position,
other trees, buildings, agents, lights and collision remain unchanged. The crown's
enclosing horizontal circle then clears every building, with minimum clearance
**4.36 cm**. Shrinking the crown cannot introduce a new intersection or move a
trunk into a path. This is a demonstration in the temporary Play world; assets and
maps were not saved. Exit Play restores the baseline. Re-run the harness to replay.

Actual native pawn capsule sweeps, before and after:

| Probe | Result |
|---|---|
| Walking-speed increments, 165 cm/s at 60 Hz | Stops 55.28 cm from trunk center |
| Faster sweep, 330 cm/s at 60 Hz | Stops 55.56 cm from trunk center; not a native run mode |
| Full 90 cm radius circle around base | Maximum path error 0 cm; no snag |
| 5 m passage under crown, 1 m beside trunk | Reaches endpoint without blocking |

The pawn radius is 35 cm and the cube trunk half-width is 20 cm. Those stopping
positions agree with the actual collision surfaces. No collision change is needed
for these assets. All four trees are instanced: cube trunks have simple query
collision, sphere canopies have none. There are no substantial branch or root
meshes in this blockout. The saved map contains no placed StaticMeshActor trees. Placed-tree variants and
imported foliage assets have not been accepted by these checks.

## Lighting inspection and remaining visual issue

The level already uses the standard Default Lit surface material and existing
Lumen GI/reflections, virtual shadow maps, mesh distance fields and SSAO pipeline.
Roughness is 0.85. Metallic, normal and emissive inputs have no connected nodes;
there are no normal-map textures to assess for compression or strength. A follow-up
read of serialized constants was rejected by Unreal's protected-property API;
`material-fields.json` records that inspection limitation rather than inventing values.
No Unlit material or camera/character-attached light was found in the inspected
runtime light inventory.

The sun is movable, about 6.93 intensity at hour 14; runtime weather controls its
angle/intensity. The movable skylight uses realtime captured scene, intensity 1.
Auto exposure is enabled; the volume's histogram/exposure fields have no overrides.
Virtual shadow normal bias is 0.5, light shadow/slope bias 0.5, contact length 0.
The unbound volume overrides AO intensity 0.6, radius 100 and quality 100.

Rendered baseline images show directional shadows and darker sheltered surfaces.
No specific building light leak or blown highlight was established in this area.
No speculative global relight was applied. The low-poly sphere crown still has a
stepped self-shadow edge. Its exact cause has not been isolated between geometric
normal/triangle mismatch and shadow sampling, so this remains a reported visual
issue, not a claimed fix. Raising global bias could detach other shadows; it was
not applied as a substitute for asset-level diagnosis.

## Evidence

Local review page: `output/native-lighting-trees/review.html`.

- `paired-before/CAM-01-approach.png`, `paired-after/CAM-01-approach.png`
- `paired-before/CAM-02-wall-contact.png`, `paired-after/CAM-02-wall-contact.png`
- Both `inspection.json` reports: same run, camera transforms, horizontal FOV 65,
  aspect 16:9, 1280×720, population 24, fixed world/pawn ticks and same lights/weather.
  Detached camera views are not human gameplay acceptance.
- `paired-before/Cube.obj`, `Sphere.obj`: actual engine LOD0 exports.
- `pilot-clearance-proof.json`: machine-checked intersections, clearance, unchanged
  scene, matched cameras and identical capsule outcomes.

All paths above are under `output/native-lighting-trees/`. Earlier `before/` files
are exploratory evidence; only the paired folders are the matched review set.

Editor frame cadence (180 Slate intervals after 3 s warmup per camera):

| Camera | Before median | After median | Before p95 | After p95 |
|---|---:|---:|---:|---:|
| Approach | 18.23 ms | 18.53 ms | 23.06 ms | 24.31 ms |
| Wall contact | 18.17 ms | 18.89 ms | 24.00 ms | 26.84 ms |

These single-run desktop measurements are noisy and do not prove a GPU regression
or improvement. No features, triangles, components or collision shapes were added.
GPU profiling, packaged performance and multiplayer load remain unmeasured.

## Files owned and verification

- `unreal/Content/Python/inspect_lighting_trees.py`: inspection, temporary correction,
  real pawn sweeps, matched captures and editor timing. Never saves scene assets.
- `scripts/verify_native_tree_pilot.py`: verifies actual captured geometry and probes.
- This ledger and local output artifacts. Generated editor configuration was backed
  up privately and restored; no engine-generated credentials enter the source diff.

Passed: dependency installation, `npm run agent:doctor`, baseline Python profile,
UE Editor Development build, `uv run ruff check` on both new scripts,
`uv run python scripts/verify_native_tree_pilot.py`, and the actual native paired
capture run. `npm run verify` core passed (receipt `.runtime/agent/core.json`; 139 Python
tests, repository JS/server/desktop checks, build, formatting and secret scan).
No C++ changed. Full Redis/browser, native multiplayer, packaging, human input,
accessibility, interior traversal and production acceptance are not claimed.

## Disposition

The paired pilot review and core gate are complete. Unsupported checks
and the canopy shadow artifact remain explicit gaps. The isolated worktree contains
undelivered scripts/evidence and must be retained. No commit/push/merge is requested
for this pilot. Ask Val to review the one-tree result before any map-wide rollout;
do not apply the 6% reduction indiscriminately to other trees.

Report erratum: the original `changes` description in paired JSON retained wording
from the first harness revision. Each report now includes `metadata_erratum` with
the actual tick-freeze/canopy behavior. Capture timestamps and measured data were
not changed. The harness wording is corrected for future runs.

## Approved permanent one-tree correction

Val's follow-up authorizes making this one-tree correction permanent. Scope is
still one native tree; no broad rollout or lighting changes. The owning native
exporter (`src/river_oaks/district.py`) now caps only `osm-node-5904555939` at
3.29 m. It preserves a smaller incoming crown and leaves the browser source,
trunk, location, height and all other trees unchanged. Regenerated the isolated
native manifest with `uv run --locked python scripts/export_district.py`.

Focused regression: reproduced failure at 3.5 m, then all four exporter tests
passed. Tests cover unchanged source/other fields, repeated export and preserving
a smaller radius. Fresh startup confirmed the crown and sweeps, but strict component comparison
caught unrelated building-height differences introduced by full regeneration.
The baseline native manifest was recovered from the canonical copy after verifying
its original SHA256, and only the target crown field was changed. The second startup
passed strict preservation of all static geometry and repeated capsule outcomes.
Evidence: `permanent/inspection.json`, screenshots and `permanent/verification.json`.
The initial concurrent core scan caught Unreal-generated configuration; that
configuration was preserved privately and restored after editor shutdown. The serial
core rerun passed; no leaks remain after restoring generated config.
Permanent capture mode (`RIVER_OAKS_TREE_PILOT_PERMANENT=1`) inspects the generated
scene without applying a runtime canopy adjustment; output is `permanent/`.
Rollback: remove the targeted cap, regenerate the manifest, repeat the baseline
route checks. No map binary, engine asset, browser source or C++ modification.

Skill fixture reasoning: Tree-7's actual trunk hit and canopy penetration require
separate collision and visual checks; Tree-8's bounds-only overlap is a candidate,
not permission for foliage deletion. This task uses exported render geometry and
actual capsule sweeps. The tabletop example is not runtime acceptance.

The first permanent startup is retained as `regenerated-source-diagnostic/`, not
accepted as unchanged-building evidence. Exporter source still preserves its input
buildings; the difference was pre-existing browser/native manifest drift.

Final permanent verification: `uv run python scripts/verify_native_tree_pilot.py
--permanent` passed against the corrected fresh startup, including unchanged
buildings/roads/trunks/other crowns and no runtime resize. Exporter regression:
4 passed. `npm run verify`: passed (141 Python tests); editor configuration
restored after the final native run. Source remains uncommitted on
`fix/native-lighting-trees-pilot`; retain this worktree until delivery. No map-wide
rollout or lighting change was made.

## PR delivery scope

Reconciled with `origin/main` at `b058391` before delivery. Ship the native exporter
change, two behavioral regressions and this ledger. One-off capture/verification
scripts were preserved in `output/native-lighting-trees/local-tools/` alongside
their local-only evidence, rather than shipped as general-purpose tooling. Earlier
commands record the paths used at execution time; moving the scripts does not
make them portable (their recorded project-relative paths need adjustment to rerun).
Generated screenshots, engine mesh exports and native map/material/data remain
local and are not in the PR. Keep the worktree for these artifacts after merge.
The user's latest instruction authorizes commit, push and PR merge to main.

Delivery verification on `b058391` plus the three-file patch: fresh
`npm run verify` passed, including the secret scan. Independent review found no
critical/important issues and reran all four exporter tests successfully.
Hosted PR checks and merge are the remaining delivery gates.
