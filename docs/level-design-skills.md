# Level design skills

Use these nine repository skills to take a location from references to a tested
blockout. Each skill produces evidence the next one can reuse.

In a skill-aware agent, start with:

```text
Use $reference-board for a River Oaks boutique entrance. Gather real-world and
game references, then explain their layout, materials, scale, and mood lessons.
```

The skills live in [`.agents/skills`](../.agents/skills). Codex can discover them
when you work in this repository; reopen the session if newly added skills are
missing. In another agent, explicitly load the selected `SKILL.md` and follow its
linked repository guide. These are agent workflows, not installed editor tools.
They do not require a particular browser, DCC application, or MCP server.

## Build order

Follow **Reference Board → Blockout Builder → Map Scale & Blockout → Player Path &
Collision → Blockout Review**. Reuse current evidence when entering midway. Add
the other four skills when their checks matter to the location.

| Skill | Use it for | Deliverable |
| --- | --- | --- |
| [Reference Board](../.agents/skills/reference-board/SKILL.md) | Gathering real-world and game references | Sourced reference cards and spatial decisions |
| [Blockout Builder](../.agents/skills/blockout-builder/SKILL.md) | Turning a sketch or reference into simple geometry | Meter-based blockout, circulation, and activity zones |
| [Map Scale & Blockout](../.agents/skills/map-scale-blockout/SKILL.md) | Testing proportions at player height | Scale buddy, dimension audit, and play observations |
| [Player Path & Collision](../.agents/skills/player-path-collision/SKILL.md) | Testing routes and reproducing movement failures | Collision settings, route evidence, and stuck reproductions |
| [Blockout Review](../.agents/skills/blockout-review/SKILL.md) | Deciding whether geometry is ready for art | Prioritized findings and readiness decision |
| [Room Logic](../.agents/skills/room-logic/SKILL.md) | Checking believable building use | Room adjacency and public/staff/service routes |
| [Modular Kit Checker](../.agents/skills/modular-kit-checker/SKILL.md) | Checking reusable pieces before assembly or art replacement | Grid, pivot, naming, and seam audit |
| [Camera & Framing](../.agents/skills/camera-framing/SKILL.md) | Checking entrances, reveals, and navigation cues | Reproducible camera stations and framing evidence |
| [Developer View](../.agents/skills/developer-view/SKILL.md) | Inspecting the live world or extending its debug tools | Toggleable measurements, collision, paths, camera, and object layers |

Example follow-up requests:

```text
Use $blockout-builder to turn the approved entrance reference into a blockout.
Keep the walking route separate from the reception desk and waiting area.

Use $player-path-collision to reproduce the snag at the boutique threshold.
Record the controller settings and blocking object before proposing a fix.

Use $blockout-review on the entrance-to-counter-to-exit route before art polish.
```

## Shared working contract

Read this section when using a skill. Then read only the runtime notes and source
files relevant to the task.

- Record the location, target runtime, map or scene, revision, and local changes
  that affect the result. A browser result does not establish native behavior.
- Reuse existing sketches, references, dimensions, and reports. Ask for missing
  information only when it changes the result; label reversible assumptions.
- Use meters for design dimensions. Label engine coordinates with their units,
  axes, origin, and whether a position denotes the feet, capsule center, or camera.
- Distinguish **observed**, **inferred**, and **proposed** dimensions. Never turn a
  photo estimate into a surveyed dimension or a design target into a measurement.
- Separate circulation from activity space: a route must still work while someone
  stands at a counter, sits, opens a door, or queues. Check the relevant occupancy.
- Use source and controller settings as authority. A drawn bound, nav path, or
  green debug cell is evidence about that tool, not proof of physical traversal.
- Keep edits scoped to the requested location. Reviews produce findings unless
  fixes are requested. Preserve unrelated work and existing asset provenance.
- If the editor or renderer is unavailable, finish the source/dimension work and
  mark play, visual, and performance checks **not tested**. Do not invent captures.

For durable reports, use `docs/level-design/<location>/<skill-name>.md` unless the
task has an existing report. Create only the needed files. Keep screenshots and
large generated assets in the repository's existing artifact storage; link their
location and say whether they are local-only. Ignored artifacts are not available
to someone who only clones the repo.

Each report should carry:

| Field | Record |
| --- | --- |
| Scope | Location, runtime, scene, revision, date, and relevant dirty files |
| Inputs | Reference IDs, source paths, existing blockout, and controller profile |
| Setup | Units/axes, scale, camera, movement mode, and occupancy |
| Evidence | Measurements, route/camera IDs, captures, and reproduction steps |
| Findings | Expected vs. observed result, consequence, and smallest useful fix |
| Status | Pass, fail, or not tested for each check; remaining assumptions |
| Handoff | Artifact paths and the next skill or action needed |

Use stable IDs such as `REF-01`, `ROUTE-01`, and `CAM-01` across reports. For
findings, distinguish a **blocker** (cannot traverse or complete an activity), a
**major** issue (misleading or materially awkward space), and **minor** polish.
Keep optional improvements separate from required fixes.

## River Oaks runtime notes

Preserve the mapped Houston layout and the authored science-fantasy direction.
Start with [world direction](world-direction.md), [street standards](street-standards.md),
and [data provenance](data.md) when those constraints affect the task. A game
layout review is not a building-code or accessibility certification.

### Units and geometry

The manifest uses local east/north/up meters in EPSG:32615. Recheck the actual
loader before exporting or editing transforms:

| Surface | Mapping from manifest `(east, north, up)` | Owning source |
| --- | --- | --- |
| Browser Three.js world | `(east, up, -north)` in meters | [`district.js`](../preview/src/district.js) and [`walking.js`](../preview/src/walking.js) |
| Native Unreal world | `(east × 100, -north × 100, up × 100)` in centimeters | [`RiverOaksRules.h`](../unreal/Source/RiverOaks/Public/RiverOaksRules.h) |

Native district export currently flattens altitude; the browser retains terrain.
Do not transfer a browser ground or slope result to native. Manifest building
positions are bases; native mass placement accounts for half the building height.
Generated geometry appears at BeginPlay, so an empty editor viewport is not a
missing-map diagnosis. See [Unreal setup](unreal.md) before map generation.

### Browser preview

- Start with `npm run dev` after installing dependencies as described in the root
  README. Shared-town admission is required; follow the existing local auth/fixture
  setup in [the agent workflow](agent-workflow.md).
- Inspect [`walking.js`](../preview/src/walking.js),
  [`navigation.js`](../preview/src/navigation.js),
  [`store-interiors.js`](../preview/src/store-interiors.js), and
  [`street-profile.js`](../preview/src/street-profile.js) for the applicable rules.
  Walking combines footprint clearance and ground support; do not label it an
  Unreal capsule or assume a universal step/slope setting.
- Press **F3** or use `?debug=1` for existing overlays. Read
  [debug tools](debug-tools.md) before adding duplicate instrumentation. Browser
  debug tools are lazy-loaded and available in shipped builds; preserve that
  policy unless the task changes it.
- Relevant checks include `node --test preview/tests/walking.test.js
  preview/tests/navigation.test.js preview/tests/street-profile.test.js
  preview/tests/debug-geometry.test.js`. Select the affected tests, then use the
  applicable rendered scenario from [testing](testing.md). Data tests do not
  establish camera comfort or human play acceptance.

### Native Unreal

- Read [Unreal setup and validation](unreal.md). Inspect
  [`RiverStreetPawn.cpp`](../unreal/Source/RiverOaks/Private/RiverStreetPawn.cpp)
  and [`RiverOaksWorld.cpp`](../unreal/Source/RiverOaks/Private/RiverOaksWorld.cpp)
  before stating controller or collision behavior.
- The current pawn uses a swept capsule constrained to street height. It has no
  `CharacterMovementComponent`, step-up solver, or walkable-slope solver. Report
  those checks as unsupported until the implementation changes; do not supply
  Unreal character defaults. Read radius, half-height, camera, and collision
  responses from the actual pawn rather than freezing values in a skill.
- Inspect the current checkout for native diagnostics before naming controls.
  Where available, follow `docs/native-diagnostics.md`; development overlays may
  be absent from another checkout or build. Existing bounds and floor probes are
  not necessarily the shapes or queries that govern movement.
- Build the affected native target and run the relevant automation as described
  in `docs/unreal.md`. `RiverOaks.Contracts` supports source-only validation;
  imported-asset checks need local assets. NullRHI automation does not validate
  rendered overlays, camera framing, packaged behavior, or GPU cost.

### Performance and handoff

Keep blockout geometry and diagnostics simple. Reuse meshes/materials where it
fits the renderer, bound debug history and local queries, and stop diagnostic work
when its layer is hidden. Measure frame time with the same route, hardware,
resolution, population, and graphics settings before claiming an improvement.

These skill files do not install runtime features, import assets, or establish
performance acceptance. On another project, keep the skill folders and replace
this guide's River Oaks notes with that project's units, controller, and validation
entry points. Keep relative links intact or update them during installation.
