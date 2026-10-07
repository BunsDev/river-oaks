---
name: room-logic
description: Review building layouts for believable room adjacency, doors, stairs, offices, bathrooms, exits, and shared spaces, separating public, staff, and service circulation.
---

# Room Logic

Check whether people can use the building in a way that fits its purpose.
Read the [shared working contract](../../../docs/level-design-skills.md#shared-working-contract)
and reuse the blockout's room, route, and activity IDs.

## Map the building's use

Inventory the rooms and their intended occupants. Mark public, shared, staff,
private, and service areas, and note which spaces are playable, represented behind
a door, or deliberately omitted. Do not add a complete real-world floor plan to a
small gameplay space without a need from the brief.

Trace the journeys that matter: visitor arrival and departure, staff reaching a
workstation, bathroom access, deliveries/storage, and shared-space use. Represent
rooms as nodes and usable doors, stairs, ramps, or lifts as connections. A drawn
door is not a connection until its destination and movement behavior are known.

## Check adjacencies and clearance

- Entrances should lead to a legible arrival area and an understandable next
  destination. Exits should reconnect to reachable space, not a blocked mass.
- Public circulation should not accidentally require crossing a private office,
  bathroom, or active service station. Keep intentional exceptions explicit.
- Place offices, bathrooms, storage, and staff access according to the building's
  use. Check bathroom privacy and plausible service access without turning an
  artistic interpretation into a compliance claim.
- Check door swings, queue positions, and furniture occupancy against clear
  routes. Check both sides of a doorway, not only its opening width.
- Connect stairs to the correct floor elevation, with landings and headroom.
  Check whether the active controller can actually traverse them. Treat an
  unsupported vertical route as a gameplay gap even if its plan looks sensible.
- Shared rooms need usable entrances and space for their expected occupancy.
  Look for isolated rooms, accidental dead ends, conflicting flows, and activities
  that block the only exit.

## Return the smallest useful revision

Produce a room/adjacency table or a simple plan, plus route-based findings:

| Room/connection | Intended use and access | Conflict and evidence | Proposed change |
| --- | --- | --- | --- |

Separate required connectivity fixes from optional realism improvements. Preserve
mapped anchors and authored omissions. If fixes are requested, move the minimum
door, partition, or activity zone and repeat affected journeys. Use **Map Scale &
Blockout** for dimensions and **Player Path & Collision** for traversal evidence.

State which findings are source review versus in-game observations. Do not claim
fire, accessibility, or building-code compliance from this gameplay check.

## Safety, acceptance and examples

Apply the [shared skill contract](../../../docs/level-design/skill-suite-contract.md)
for required inputs, inspection/edit boundaries, approval, rollback and evidence.
Use the [room-logic fixture](../../../docs/level-design/skill-suite-fixtures.md#room-logic)
for successful-use and failure examples with explicit acceptance limits.
