---
name: blockout-builder
description: Turn an approved sketch or reference into simple meter-based level geometry, separating travel routes from activity spaces before detailed environment art.
---

# Blockout Builder

Build the smallest playable geometry that tests the location's spatial idea.
Read the [shared working contract](../../../docs/level-design-skills.md#shared-working-contract)
and the notes for the runtime you will edit.

## Establish the layout

1. Reuse the reference board or sketch. Identify fixed anchors, boundaries,
   entrances, floor elevations, destinations, and intended activities. If scale
   is absent, use a labeled anchor and propose dimensions in meters.
2. Read the existing geometry generator, scene structure, and controller. Use
   the repo's source of truth so regeneration does not erase a manual change.
   Confirm unit/axis conversion, grid increment, and base-versus-center placement.
3. Draw circulation first: entrance → decision points → destination → exit.
   Give routes stable IDs. Size clear space for the active collision shape and
   relevant passing, turning, door, or camera needs; record any extra margin.
4. Mark activity zones separately: counters, queues, desks, seating, workstations,
   and conversations. Include the person and usable approach space. Test that a
   stopped occupant does not consume the only through-route.

## Build simple geometry

Use boxes, planes with appropriate collision, ramps, and cylinders. Label masses,
openings, routes, and activity zones with a small, documented color legend.
Represent floor thickness, wall thickness, thresholds, and overhead clearance
when they affect movement. Avoid zero-thickness collision assumptions.

Keep geometry parameterized where the repo already uses procedural construction.
Prefer repeated primitives and shared materials. Do not introduce decorative
meshes, texture work, or a new art pipeline to answer a spatial question.

Save an inspectable artifact in the existing scene/source workflow. If you cannot
run the editor, produce a dimensioned plan and explicit build specification;
report the playable blockout as not built rather than presenting the plan as one.

## Verify and hand off

- Inspect the plan and the actual player-height view with the current controller.
- Traverse each primary route in both directions, including turns and exits.
  Keep occupied work/wait areas present where applicable.
- Check gaps, overlapping masses, spawn clearance, and entrance alignment. Leave
  detailed threshold diagnosis to **Player Path & Collision** when needed.
- Record artifact paths, object IDs, transforms, dimensions, route widths,
  activity footprints, and assumptions. A compact object/zone table is enough.
- Run validation appropriate to changed code or assets; label unavailable play
  checks. Do not overwrite an existing map or unrelated scene work to stage a test.

Hand the geometry and its measurement table to **Map Scale & Blockout**. A camera
that looks attractive from above is not evidence that the route works on foot.
