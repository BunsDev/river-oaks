---
name: vegetation-placement-collision
description: Inspect placed and instanced vegetation intersections, trunk collision and route clearance, then validate a small correction in the owning runtime.
---

# Vegetation Placement & Collision

Read the [shared working contract](../../../docs/level-design-skills.md#shared-working-contract)
and [skill safety and validation contract](../../../docs/level-design/skill-suite-contract.md).

## Inputs and inspection

Require scene/revision, foliage asset/component/instance IDs, placement source,
transforms, controller dimensions, collision channels and routes. Read
`RiverOaksWorld.cpp` for native trunk/canopy generation and the browser landscape
and movement owners for web work. Existing native trunks block while crowns do
not; verify actual components rather than assuming replacement meshes inherit a
correct setup. Confirm source licenses before reuse/import through **Modular Kit
Checker**; do not download asset packs as part of an inspection.

Use bounds only to shortlist candidates. Inspect transformed mesh/triangle or
engine collision geometry and actual intersections at facade, entrance and path
locations. State whether an intersection concerns visual triangles, simple
collision or the movement sweep; none substitutes for the others. Resolve each
instanced foliage transform and collision setup, as well as ordinary placed meshes.
If geometry is unavailable, report a candidate intersection, not a confirmed hit.

Check trunks, roots and branches at player height. Block trunks appropriately
without wrapping the entire canopy in an impassable collider. Preserve clear
entrances, sightlines and walking routes; a nonblocking crown can still penetrate
a wall visually. Test both directions and diagonal approaches, capsule snagging,
narrow passages and the supported step/slope limits. Mark the native street
pawn's absent step/slope solver unsupported rather than using Character defaults.

## Modification

Preserve the baseline and correct one representative instance or generator rule
only when authorized. Prefer a measured placement or collision correction over
blanket removal, disabling all tree collision or shrinking the pawn. Keep generated
source and placed instance edits consistent. Broad regeneration/removal requires
approval and recoverable source/map snapshots. Recheck nearby entrances and
navigation landmarks after any move.

## Acceptance and output

Return instance IDs/transforms, confirmed versus candidate intersections, actual
hit/sweep evidence, route outcomes and a negative trunk-blocking test. For shared
web behavior test the authoritative server and two clients, including reconnect;
use the existing fixture harness. Native local sweeps do not establish network
correctness: native replication is not demonstrated by this project foundation.
Report unavailable network checks explicitly. Pass only when visual intersections
are reviewed, routes pass and intended trunks still block in the affected runtime.
Use **Lighting & PBR Diagnostics** for multiple times of day and measured cost.
Rollback restores recorded placement/collision values and reruns original routes.

## Examples and validation

Use the [vegetation-placement-collision fixture](../../../docs/level-design/skill-suite-fixtures.md#vegetation-placement-collision)
for a successful-use example and a failure case. Execute its inspection scenario
before claiming skill validation; follow the fixture's proof limits.
