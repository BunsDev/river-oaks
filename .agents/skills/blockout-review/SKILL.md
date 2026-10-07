---
name: blockout-review
description: Walk and review a level blockout before art polish, identifying cramped, empty, overly tall, confusing, or blocked spaces and reporting evidence-backed readiness.
---

# Blockout Review

Decide what spatial work remains before someone invests in detailed art.
Read the [shared working contract](../../../docs/level-design-skills.md#shared-working-contract)
and reuse the reference, scale, route, room, and camera evidence already available.

## Review the intended experience

Start with the location's purpose, fixed constraints, intended occupancy, and
primary route. Identify the exact runtime, scene/revision, controller, camera,
and relevant local changes. Do not require every optional skill to run if its
subject does not affect this review.

Walk from arrival through the key activities and back to an exit at normal
player height and speed. Include return trips and the expected occupied state.
Capture evidence at decision points and defects. Use an overhead view to locate
a problem after encountering it on foot, not as the only inspection.

## Assess the blockout

- **Cramped:** Measure clear width and turning space against the active player,
  camera, doors, queues, and work positions. Name the action that becomes awkward.
- **Empty:** Relate distance, travel time, and visual density to the room's
  purpose. Separate useful gathering/decision space from accidental dead space.
- **Too tall or small:** Compare ceilings, doors, fixtures, and facade rhythm to
  the scale buddy and reference intent. Record camera settings with the judgment.
- **Hard to navigate:** Check visible entrances/exits, route continuity,
  recognizable destinations, misleading openings, and recovery from wrong turns.
- **Blocked or implausible:** Reproduce collision failures and examine room
  connections, activity conflicts, unsupported vertical paths, and spawn clearance.

Keep architecture, movement, and readability findings ahead of materials or
decoration. Report performance issues when observed; do not infer a frame-rate
target from low polygon counts or a source-only test suite.

## Return a prioritized decision

For each finding, give severity, location/route ID, expected versus observed
behavior, measurements or capture, reproduction, consequence, and smallest useful
fix. Distinguish required fixes from optional improvements. Do not edit a reviewed
map unless the request includes fixes.

Conclude with one of:

- **Ready for art:** Critical routes and activities passed in the target runtime,
  with no unresolved spatial blockers or major usability issues. List minor work.
- **Needs blockout changes:** Evidence shows a blocker or major issue. Order the
  required fixes and name the skill/check that will validate each one.
- **Review incomplete:** Runtime access, measurements, or critical traversal
  evidence is missing. State what can be concluded and what remains not tested.

Link the evidence and identify which revision was reviewed. Source review,
automated traversal, rendered inspection, and human play are different proof
levels; do not label one as another. Re-review affected routes after changes.

## Safety, acceptance and examples

Apply the [shared skill contract](../../../docs/level-design/skill-suite-contract.md)
for required inputs, inspection/edit boundaries, approval, rollback and evidence.
Use the [blockout-review fixture](../../../docs/level-design/skill-suite-fixtures.md#blockout-review)
for successful-use and failure examples with explicit acceptance limits.
