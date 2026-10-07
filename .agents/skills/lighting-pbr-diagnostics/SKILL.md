---
name: lighting-pbr-diagnostics
description: Diagnose Unreal material, exposure, lighting and shadow problems separately, then compare a small correction across time of day and target-hardware performance.
---

# Lighting & PBR Diagnostics

Read the [shared working contract](../../../docs/level-design-skills.md#shared-working-contract)
and [skill safety and validation contract](../../../docs/level-design/skill-suite-contract.md).

## Inputs and inspection

Require runtime/map/revision, material and light identities, intended mood,
current render configuration, repeatable station and intended hardware/budget.
Read `unreal/Config/DefaultEngine.ini`, `unreal/Content/Python/bootstrap_world.py`,
`unreal/Content/Python/setup_post_process.py` and `docs/unreal.md` for native work.
The configured Lumen GI/reflections, virtual shadows and SSAO are starting facts,
not proof of the current viewport state. Verify loaded settings before diagnosis.
The blockout color material is not a finished PBR kit.

Inspect the material separately: shading model, base color, metallic, roughness,
normal direction/strength, texture color space, opacity and two-sided usage.
Use a controlled material/light comparison only when available; record actual
controls used. BRDF describes surface reflection; it is not a repair switch.
Then inspect light orientation/intensity, exposure adaptation, skylight, shadows,
AO and overlapping post-process volumes. Distinguish a material fault from
underexposure, missing geometry, shadow artifacts and intentional darkness.
Do not assume hardware ray tracing is required or enable costly features before
identifying the cause. Use Unreal's existing PBR pipeline and suitable material
shading; do not invent an alternate renderer.

## Modification and measurement

For an authorized correction, snapshot exact values and change one representative
material or light setting. Keep geometry, camera and unrelated settings stable.
Compare daylight, low-angle sunrise/sunset and night with recorded world time,
weather, exposure and adaptation settling. Check entrances/interior thresholds,
skin where present, foliage, reflective surfaces and accessible navigation cues.
Restore temporary overrides after inspection, including on failure.

Measure baseline/change/restored frame times on named target hardware with the
same route, population, resolution, quality, warmup and sample duration. Separate
CPU/GPU results; record distributions or spikes, not a single impressive frame.
Without hardware or a budget, cost acceptance stays not tested. NullRHI and
screenshots cannot prove rendered lighting or performance.

## Acceptance and output

Return material-versus-light diagnosis, verified cause or remaining hypothesis,
exact changed values, matched captures, multi-time results and measured cost.
Pass only the checks actually observed against agreed appearance and frame-time
criteria. Missing nighttime or hardware evidence leaves those checks incomplete.
Rollback restores saved values/assets and repeats the affected view. Use
**Vegetation Placement & Collision** for tree intersections and **Blockout Review**
when lighting merely masks spatial problems.

## Examples and validation

Use the [lighting-pbr-diagnostics fixture](../../../docs/level-design/skill-suite-fixtures.md#lighting-pbr-diagnostics)
for a successful-use example and a failure case. Execute its inspection scenario
before claiming skill validation; follow the fixture's proof limits.
