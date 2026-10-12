# Route waypoint clearance

Objective: stop the `spatial-streets` "Hermès: stalled" flake by keeping navigation
waypoints clear of fixtures. The change also helps residents, who route with the
same planner.

Owner: Claude Code session `46fc41e0-26d1-4116-956a-7cac77a13769`. Task
`route-waypoint-clearance`. Branch `fix/route-waypoint-clearance-20261012` from
`main` at `f4db264`. Diagnosis by river-oaks-3b; c2 and 3b agreed to leave
`spatial-streets` and `navigation.js` to this task.

## Root cause

river-oaks-3b found the journey stalling at the same place on unrelated PRs.
The walker sat at x -2747 to -2749, aiming for waypoint `(-2753.28, -1382.61)`.

- A thin, slightly slanted walking obstacle runs east-west just south of that
  point. `isFree` already includes the walker's 0.35 m body.
- The journey corrects its heading only beyond 0.03 rad. So the walker came in
  slightly south of the waypoint line, slid along the slant, and never got within
  the 0.15 m arrival radius.
- The waypoint came from `createResidentNavigation`'s 1 m A* grid. A node is usable
  when its centre is free, with no clearance check, so smoothing kept a node with
  only 0.08 m of free ground around it.

Reproduced on the real district data: the Equinox to Hermès and Dior to Equinox
routes both contain that waypoint, measuring 0.08 m clearance.

## Change

`preview/src/navigation.js`:
- After A* and the existing zigzag smoothing, any intermediate waypoint with less
  than `WAYPOINT_CLEARANCE` (0.3 m) of free ground is moved to the nearest point
  within 0.6 m that has that clearance. Free ground is checked on rings every 0.05 m
  at 24 angles.
- The move happens only if both of its legs stay walkable, which includes the
  pedestrian cost rule. Otherwise the waypoint is kept.
- The destination never moves, and grid topology is untouched. Making near-wall
  nodes unusable instead would close narrow sidewalks on a 1 m grid.

## Checks

- Red: a new `navigation.test.js` case routes Equinox→Hermès, Dior→Equinox and
  Hermès→Dior on the real district. It requires 0.3 m of clearance at every
  intermediate waypoint, probed every 0.02 m, and a walkable route throughout. It
  failed on `main` and passes after the change.
- Every store-to-store route in the district, 870 routes and 6,393 waypoints:
  - waypoints under 0.3 m clearance went from 202 to 0;
  - unwalkable segments: 0 before and 0 after;
  - total routing time went from 20.2 s to 21.6 s, about 1.6 ms more per route.
- All 8 suites that use resident navigation passed: 47 tests.
- `pnpm run verify`: core passed all 11 tasks (tooling 76; preview 2668 passed,
  1 skipped; server 377 passed, 125 Redis-only skipped; desktop 49).
- Journeys, local macOS, with runs taking turns through the browser lock:
  - `spatial-streets` passed twice, reaching Dior (42.5 m), Equinox (136 m) and
    Hermès (94.6 m, in 63 s);
  - `spatial-circulation` passed.
- The before case: river-oaks-3b's #276 (head `724def7`, run 38207740345) stalled
  at this waypoint on 3 of 3 hosted runs. Its next run, on top of this change, is
  the hosted after check.
