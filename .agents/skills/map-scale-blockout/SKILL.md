---
name: map-scale-blockout
description: Measure an existing blockout with a scale buddy and the actual player controller, checking proportions, clearances, and travel time at player height.
---

# Map Scale & Blockout

Check whether the blockout works at the scale the player experiences.
Read the [shared working contract](../../../docs/level-design-skills.md#shared-working-contract)
and the target runtime's units and controller notes.

## Establish the scale buddy

Read the actual pawn or avatar, collision dimensions, feet datum, eye height,
movement speeds, and camera mode. Treat visual stature, collision height, and eye
height as separate measurements. Record any nonuniform mesh or parent scaling.

Use the real avatar or a simple labeled proxy with matching dimensions as a
**scale buddy**. Keep it non-colliding unless collision is the test. A generic
1.8 m human may be an explicitly labeled visual reference, never a substitute
for the shipped controller. Remove or hide temporary helpers after the check.

## Measure and walk

1. Verify one known horizontal length and one vertical length in the rendered
   world against the source. Catch unit, axis, origin, and transform errors before
   judging the architecture. Record meters and engine units where they differ.
2. Place the buddy at entrances, narrow turns, counters, workspaces, stairs or
   ramps, and large rooms. Measure actual free space, including protrusions and
   fixtures, rather than nominal wall-to-wall dimensions alone.
3. Inspect door clear width/height, corridor width, floor-to-ceiling height,
   landing depth, overhead clearance, furniture reach, and room proportions.
   Derive targets from the brief and controller; avoid universal doorway numbers.
4. Walk the main routes at the normal game camera and speed. Record route length,
   measured travel time, pauses, and occupancy. Distance divided by speed is an
   estimate; turns, acceleration, and interactions require a timed traversal.
5. Compare overhead, player-height, and third-person views where supported. Hold
   FOV and aspect ratio fixed while comparing geometry revisions. A wide lens can
   conceal a cramped room; changing the lens is not a scale fix.

## Report useful corrections

| Check/location | Expected basis | Measured meters | Player-height observation | Status/fix |
| --- | --- | --- | --- | --- |

Include buddy/controller dimensions, camera setup, dimension anchors, and linked
captures. Explain whether a space feels cramped, empty, too tall, or too slow to
cross, and connect that observation to a measured condition or gameplay purpose.
Do not shrink an intentional gathering space simply because it is empty in a
zero-occupant test.

When edits are requested, change the smallest controlling dimension and repeat
the affected measurement and route. Otherwise, return proposed corrections.
Hand unresolved movement failures and reproducible routes to **Player Path &
Collision**. Mark unsupported stairs/slopes or unavailable play as not tested.
