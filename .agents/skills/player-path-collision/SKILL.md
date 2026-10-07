---
name: player-path-collision
description: Visualize actual movement collision and routes, test supported slopes and step limits, and reproduce stuck-player failures before making targeted geometry or controller fixes.
---

# Player Path & Collision

Explain a movement failure using the same geometry and queries that move the player.
Read the [shared working contract](../../../docs/level-design-skills.md#shared-working-contract)
and the runtime notes before assuming capsule, step, or slope behavior.

## Read the movement contract

Record the active movement mode, collision shape and dimensions, collision
channels/masks, skin or contact margin, speed, ground support, and any implemented
step/slope limits. Distinguish capsule half-height from total height. State whether
angles are degrees or slopes are rise/run percentages.

Mark absent features **unsupported**. River Oaks' native street pawn is not an
Unreal CharacterMovement controller; the browser also has its own movement rules.
Do not fill missing settings with engine defaults or silently add a new solver.

## Visualize and reproduce

1. Use existing developer tools to show the actual capsule or other clearance
   shape, blocking geometry, desired movement, resulting displacement, contact
   point/normal, and floor support where available. Label approximate bounds.
2. Record map/revision, spawn or start transform with axes/units, route ID,
   movement/camera mode, input sequence, speed, occupancy, and frame conditions.
   Reproduce with normal movement, not a teleport past the suspected obstacle.
3. Test entrances, exits, corners, narrow passages, thresholds, slopes, and
   dynamic obstacles that exist in scope. Traverse both directions and relevant
   diagonal approaches. For implemented limits, probe below/at/above the limit
   using a documented tolerance instead of assuming exact boundary behavior.
4. For a stuck case, compare intended and actual progress over time. Identify
   the blocking object/component/instance and query result. Separate initial
   penetration, an oversized collider, a missing floor, a bounds clamp, a step
   limitation, and a failed navigation route. Tangential sliding is progress;
   released input is not a continuing stuck attempt.
5. Compare the proposed navigation path with physical traversal. A route graph
   may be disconnected despite free space, or cross geometry the pawn cannot
   pass. A debug raycast is not proof of the movement sweep's blocking cause.

## Fix and verify within scope

When a fix is requested, change the owning geometry, collision configuration, or
movement logic supported by the evidence. Do not shrink the capsule, disable wall
collision, raise step limits globally, or teleport the player merely to hide a
local snag. Such behavior changes need an explicit design reason.

Repeat the original route and nearby alternatives, including a negative case
where a real wall must still block. Add a focused behavior regression for a code
fix; a documentation-only diagnosis needs no new test code.

Return a route table with pass/fail/not-tested outcomes and a compact reproduction
for each failure: expected behavior, actual behavior, blocker identity, evidence,
cause confidence, proposed/applied fix, and rerun result. Hand unresolved blockers
to **Blockout Review**; hand missing instrumentation to **Developer View**.
