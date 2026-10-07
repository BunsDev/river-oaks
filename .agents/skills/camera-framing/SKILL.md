---
name: camera-framing
description: Place reproducible gameplay test cameras to review field of view, sightlines, entrances, reveals, and visual priority at key moments in a level blockout.
---

# Camera & Framing

Check what the player sees while finding, entering, and using a place.
Read the [shared working contract](../../../docs/level-design-skills.md#shared-working-contract)
and reuse route IDs from the blockout.

## Set reproducible camera stations

Read the live camera mode, projection, eye height, arm/offset, FOV convention,
aspect ratio, near plane, and obstruction behavior. Record horizontal or vertical
FOV explicitly: the same degree value is not interchangeable across conventions.
For orthographic views, record view size instead of a perspective FOV.

Place stations at the relevant arrival, entrance, turn, destination reveal,
interaction, and return/exit moments. Use the normal player position and movement
mode. Label any detached presentation camera separately from gameplay evidence.

| Station/route | Position and axes/units | Target or rotation | FOV axis/aspect | Intended first cue |
| --- | --- | --- | --- | --- |

## Inspect the experience

1. Capture each station with the real viewport. Check whether the entrance,
   destination, route continuation, and next decision are visible or deliberately
   revealed. Distinguish visibility from recognition: a tiny door can be in frame
   yet remain hard to notice.
2. Record what you notice first and why: silhouette, contrast, framing, motion,
   scale, or light. Compare that cue to the intended player action. Keep observer
   judgment separate from a raycast's unobstructed/not-obstructed result.
3. Walk into and out of the station. Inspect camera-wall clipping, abrupt camera
   corrections, occlusion by the avatar or fixtures, and lost landmarks while
   turning. A staged still does not establish camera comfort in motion.
4. Check relevant aspect ratios and actual HUD/UI coverage. Keep resolution,
   camera settings, time of day, and occupancy stable for before/after comparisons.
5. Propose the smallest spatial or cue change that improves the moment. Do not
   widen FOV, change movement speed, or use a cinematic lens to conceal bad scale.
   When lens changes are requested, compare them separately from geometry changes.

## Hand off evidence

Return the station table, labeled captures, intended versus observed visual
priority, and route-specific fixes. If no renderer is available, provide camera
coordinates and a capture plan, with framing and motion marked not tested.

Use **Map Scale & Blockout** for proportion issues and **Player Path & Collision**
for physical camera/pawn constraints. Pass remaining navigation cues and camera
comfort concerns to **Blockout Review** before art polish.

## Safety, acceptance and examples

Apply the [shared skill contract](../../../docs/level-design/skill-suite-contract.md)
for required inputs, inspection/edit boundaries, approval, rollback and evidence.
Use the [camera-framing fixture](../../../docs/level-design/skill-suite-fixtures.md#camera-framing)
for successful-use and failure examples with explicit acceptance limits.

## Wayfinding, occlusion and interiors

Treat landmarks as navigation aids: test recognition at arrival, turns and return,
including occupancy, alternate aspect ratios and low light. Do not rely on color
alone or add decorative landmarks that compete with the destination. Check from
outside through the entrance, inside looking out and during threshold crossing;
separate physical occlusion, camera clipping, exposure and intentional privacy.
If dithering/fading is proposed, first establish renderer/material support and
compare motion, transparency, shadows and readability on the target platform.
Do not claim an unimplemented fade solves camera collision. Preserve the baseline
and obtain any missing approval before broad material changes. Use Lighting & PBR Diagnostics
for exposure and Reference-to-Scene Comparison for matched captures.
