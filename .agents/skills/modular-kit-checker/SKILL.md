---
name: modular-kit-checker
description: Audit modular environment assets for consistent dimensions, grid snapping, pivots, naming, collision, and reusable joins; flag gaps, overlaps, and exceptions before assembly.
---

# Modular Kit Checker

Check whether the kit assembles predictably without per-instance repairs.
Read the [shared working contract](../../../docs/level-design-skills.md#shared-working-contract)
and inspect the importer and renderer that actually use the assets.

## Establish the kit contract

Find the existing base grid, allowed subdivisions, unit conversion, forward/up
axes, origin/pivot convention, rotation increments, wall thickness, floor height,
and naming scheme. If no contract exists, propose a small one from the dominant
pieces and label it provisional. Do not rescale mapped footprints onto a kit grid.

Audit source mesh dimensions separately from placed, transformed dimensions.
Check parent transforms, unapplied scale, mirroring, and import conversion. Use
local bounds or oriented dimensions for rotated parts; a world-aligned bounding
box can overstate their size.

River Oaks' native replacement slots currently expect centered meshes with nominal
100 cm bounds. Verify that slot contract before applying a corner-pivot convention
from another kit. A production facade kit may need a separate importer.

## Assemble the combinations that reveal defects

1. Inventory each relevant asset: ID/path, role, dimensions in meters, pivot,
   transforms, sockets or join planes, collision, and material usage.
2. Compare intended snapping dimensions to the grid with an explicit tolerance.
   Distinguish nominal module size from decorative overhang and collision bounds.
3. Build or inspect repeated runs, inside/outside corners, door/window joins,
   floors/ceilings, and vertical stacks as relevant. Test permitted rotations.
   Two pieces meeting once does not prove a long run will avoid accumulated drift.
4. Measure gaps, overlaps, coplanar faces, mismatched thickness, exposed backs,
   pivot offsets, and collision discontinuities at joins. Capture a ruler or
   numeric measurement with the assembly evidence.
5. Check that names communicate function, size, orientation/handedness, and
   variant using existing conventions. Flag ambiguity and near duplicates;
   do not mass-rename assets without updating their references.
6. Flag one-off geometry, stretched textures, unique materials, or excessive
   collision complexity that undermines reuse. Recommend instancing or shared
   materials only where the target renderer benefits; profiling proves cost.

## Report exceptions and repairs

| Asset/assembly | Expected contract | Measured deviation | Reuse consequence | Smallest fix |
| --- | --- | --- | --- | --- |

Classify intentional exceptions separately from defects. Include the adopted
grid, tolerance, pivot convention, source/placed dimensions, and assembly capture
IDs so someone can repeat the check. If the editor is unavailable, report the
dimension audit separately from untested visual and collision seams.

When repairs are requested, rerun the affected joins and dependency checks.
Hand verified pieces to **Blockout Builder** and movement seams to **Player Path &
Collision**. Do not replace the whole kit to repair a local mismatch.

## Safety, acceptance and examples

Apply the [shared skill contract](../../../docs/level-design/skill-suite-contract.md)
for required inputs, inspection/edit boundaries, approval, rollback and evidence.
Use the [modular-kit-checker fixture](../../../docs/level-design/skill-suite-fixtures.md#modular-kit-checker)
for successful-use and failure examples with explicit acceptance limits.

## Asset inventory, provenance and import pilot

Before reuse, record source/creator, license text or receipt, permitted uses,
attribution, asset/version/hash and importer settings. Unknown rights block reuse;
a reference board or locally present file is not a license. Inventory variants,
materials, texture color spaces, LOD/Nanite choices and collision separately.
For an authorized assembly/import pilot, build a small asset zoo in a recoverable
test scene: one source and one placed
instance, repeated join, rotated join and one deliberately incompatible piece.
Verify units, normals, pivots, transforms, material slots and actual simple
collision after import. Do not mass-import, download large packs or overwrite
existing asset paths merely to conduct this review. Unreal replacement slots are
not a general production importer; unsupported assets need an explicit proposal.
Restore owned pilot assets/settings on regression and repeat the original joins.
