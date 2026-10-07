---
name: reference-scene-comparison
description: Compare a built scene with approved references using matched camera, scale and render conditions, separating measurable differences from artistic judgment.
---

# Reference-to-Scene Comparison

Read the [shared working contract](../../../docs/level-design-skills.md#shared-working-contract)
and [skill safety and validation contract](../../../docs/level-design/skill-suite-contract.md).

## Inputs and inspection

Require sourced reference IDs and reuse rights, intended transferable qualities,
scene revision, scale anchors and camera stations. Read **Reference Board** and
**Camera & Framing** outputs. A photograph with unknown lens/height is a
qualitative reference; never invent calibration or measured dimensions.

For baseline/variant captures, record runtime, scene, station, world camera
position/rotation and axes/units, projection, FOV axis and angle (or orthographic
size), aspect, resolution, exposure, time/weather and occupancy. Match these
conditions before attributing a difference to geometry or material changes.
Use `node scripts/compare_skill_views.mjs <baseline.json> <variant.json>` with the
format in [the fixtures](../../../docs/level-design/skill-suite-fixtures.md#matched-view-helper).
It checks metadata equality, not pixels or truthful capture provenance. If
lighting is the intentional variable, record it as an experimental difference;
the helper correctly declines a fully matched comparison.

Compare annotated silhouette, entrance location, mass ratios, negative space,
depth and material/light roles side by side. Separate measured discrepancies,
observer judgments and deliberate stylization. Never optimize toward literal
photo similarity at the cost of gameplay or readability.

## Modification

Inspection changes no scene. If correction is requested, preserve baseline
captures and alter one evidenced variable in one area. Recreate the same views,
then route geometry issues to **Shape Language & Depth**, materials/light issues
to **Lighting & PBR Diagnostics**, and movement issues to **Player Path & Collision**.
Do not replace reference files or earlier captures to hide disagreement.

## Acceptance and output

Deliver a comparison table with reference/capture IDs, matching conditions,
observed difference, intended adaptation and follow-up. A matched comparison
requires complete compatible capture metadata; unknown conditions remain
qualitative. A metadata pass alone cannot approve art, collision or performance.
Rollback restores the changed variable and recaptures the baseline station.

## Examples and validation

Use the [reference-scene-comparison fixture](../../../docs/level-design/skill-suite-fixtures.md#reference-scene-comparison)
for a successful-use example and a failure case. Execute its inspection scenario
before claiming skill validation; follow the fixture's proof limits.
