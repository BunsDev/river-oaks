# Skeletal backend acceptance

PR #5 was integrated onto the street-level `main` implementation and verified on
September 20, 2026 with the installed UE 5.8.2 toolchain. The shopping footprint,
walking-only entry, browser conversations and SSAO settings are unchanged.

## Results

- Editor and Game Development targets: `Result: Succeeded`, exit 0.
- Native automation: 11 succeeded, 0 failed, 0 not run.
- Python: 71 passed; Ruff check and format check passed.
- JavaScript: 87 passed; production preview build passed. The existing Three.js
  chunk-size advisory remains.
- Worktree and staged secret checks passed before commit.
- Independent source review found no remaining blockers.

The native regression first failed against the original backend with six
expected assertions: missing or unrelated animation classes were accepted, and
unknown or altered appearance recipes received a mesh. It passes with the fixes.
The expanded suite uses two built-in engine meshes in a transient world to check
catalogue-specific selection, refusal without allocation, required finite
stature, reference-ground alignment, scale across successive poses, speed after
a time-zero pose, stale sequences, external component destruction, duplicate
teardown and handles that are never reused. The eight existing contract tests
also pass.

Local evidence:

- `/tmp/river-oaks-pr5-red-tests/index.json`: reproduced configuration failures.
- `/tmp/river-oaks-pr5-green-tests/index.json`: all 11 native results.
- `/tmp/river-oaks-pr5-final-editor-build.log`: final Editor build.
- `/tmp/river-oaks-pr5-game-build.log`: Game build.
- `/tmp/river-oaks-pr5-js-tests.log` and
  `/tmp/river-oaks-pr5-browser-build.log`: browser validation.

## Asset acceptance still required

The following describes the PR #5 baseline. The subsequent
[native resident integration](native-residents.md) adds reproducible asset import
and procedural locomotion, with its own validation record.

No production native character mesh or animation graph is included. The default
`ResidentAppearances` map is empty and the district retains markers. The engine
fixtures establish backend behavior, not visible character fidelity or a working
production locomotion graph.

Before enabling native characters, import all six catalogue profiles with their
matching body, hair and garments; assign compatible animation classes derived
from `URiverLocomotionAnimInstance`; and visually check feet, stature, orientation
and all five locomotion states. Bounds-based alignment assumes upright meshes
and requires review on actual people. Failed animation initialization destroys
the newly registered component before returning refusal; the fixture tests do
not deliberately induce that post-registration failure.

The prior [street-level acceptance](street-level-plan.md#verification) still
records the native input/collision and visual SSAO acceptance limits.
