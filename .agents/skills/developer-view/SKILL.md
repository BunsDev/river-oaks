---
name: developer-view
description: Use or extend toggleable in-game diagnostics for measurements, movement collision, routes, camera guides, and object details, with bounded runtime cost and accurate data provenance.
---

# Developer View

Make the live world explain its geometry and movement without changing gameplay.
Read the [shared working contract](../../../docs/level-design-skills.md#shared-working-contract)
and runtime notes. Inspect existing debug tools before proposing new ones.

## Choose observation or implementation

For an inspection request, use the existing overlays and report their coverage
and limitations. For an implementation request, extend the owning debug system
with only the missing layers. Preserve each runtime's build policy: River Oaks'
browser tools ship lazily, while native diagnostics may be development-only.

Bind overlays to authoritative runtime providers, not copied constants or a
parallel collision model. Record whether values are exact, sampled, approximate,
unsupported, or unavailable. Object bounds are not necessarily collision shapes.

## Layer contract

Keep each layer independently toggleable, with a small legend and readable units:

| Layer | Display | Authority and limitation |
| --- | --- | --- |
| Measurements | Scale buddy, distances, clear width/height, and axes | Transformed geometry and identified endpoints; distinguish local/world bounds |
| Collision | Actual capsule/shape, floor support, blocking hit/normal, supported step/slope limits | Active controller and movement queries; label supplemental probes |
| Paths | Intended route, traversed positions, blocked segments, and relevant activity zones | Navigation/runtime route data; planned does not mean traversable |
| Camera | Position, view cone/frustum, FOV convention, aspect, and target/sightline | Live camera; guides do not prove pixel visibility or comfort |
| Object details | Selected object/component/instance ID, transform, dimensions, asset, and collision settings | Picked runtime object; resolve instance transforms and current asset identity |

Only show fields the engine supports. When implementing the complete view, cover
all five layers or explicitly identify unavailable providers and remaining work.
Keep this legend separate from game-facing interaction prompts.

## Keep diagnostics bounded

- Use local selection, cached geometry, spatial queries, and on-demand updates.
  Bound sample rate, radius, draw count, and retained history. Avoid per-frame
  world enumeration, mesh reconstruction, and unbounded debug lines.
- Stop a layer's diagnostic queries, recording, and drawing when it is disabled.
  Reuse the normal simulation's results where possible. Clean up on world reload,
  teardown, and target changes; restore any temporary material/render settings.
- Leave movement, collision, navigation, and network authority unchanged. Overlays
  must not become blockers, receive gameplay selection, or pollute render passes.
- Keep controls compatible with existing game input and text focus. Provide an
  obvious all-off path. Preserve build exclusions and shipping behavior.

## Verify useful behavior and cost

Exercise each layer in play against a known object, route, and camera. Check
independent toggles, selection misses, object removal, instance bounds, scene
reload, and complete disable/restore. Validate units against a known distance.
For native changes, verify the intended build configurations as well as automation.

Compare layers off/on/off over the same route and settings, recording CPU/GPU
frame time, draw calls, query counts, update rates, and history caps where tools
support them. State hardware, resolution, population, sample duration, and any
unmeasured costs. Do not claim zero overhead or target frame rate without evidence.

Return controls, implemented layers and data sources, unsupported fields, captures,
validation results, and measured cost. Link reproducible movement failures to
**Player Path & Collision** and spatial findings to **Blockout Review**.

## Safety, acceptance and examples

Apply the [shared skill contract](../../../docs/level-design/skill-suite-contract.md)
for required inputs, inspection/edit boundaries, approval, rollback and evidence.
Use the [developer-view fixture](../../../docs/level-design/skill-suite-fixtures.md#developer-view)
for successful-use and failure examples with explicit acceptance limits.
