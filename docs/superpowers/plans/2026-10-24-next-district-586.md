# Next connected district (#586 continuation, #638 lane 3)

Task `next-district-586-20261024`, owner `claude:river-oaks-91 (a3bcb4)`. Branch
`feat/next-district-586-20261024`, worktree `../river-oaks-next-district-586`, from
origin/main `1c23170f`. Master handoff #638; acceptance list in #586's 2026-10-24
continuation.

## Objective

Add the next connected, socially useful district built from the city kit. Work toward
a measured 2× of the Gardens reachable-ground baseline: 46,477.75 m² at 0.5 m, so the
2× total is 92,955.5 m². Commons on main measured 51,962 m², which leaves 40,993.5 m²
to add. Deliver the largest honestly verified increment and record any gap. The
3× target needs more land or a metric decision, so it is out of scope.

## Design

**Bayou Heights** is a fictional, Houston Heights-inspired neighborhood on the east
bank of the bayou that edges Bayou Market Commons. All buildings, names and lettering
are original. It reproduces no real building.

- **Revision.** It is the new opt-in content revision `bayou-heights-1`, composed as
  Gardens, then Commons market, then Heights. The garage default, Gardens and
  `east-garden-commons-market-1` keep their exact geometry and world fingerprints.
  Commons is the rollback for Heights.
- **Land.** The manifest partitions `east-garden-reserve` into an authored
  `bayou-heights` location (its west part) and a smaller reserved
  `east-garden-reserve`. Total area does not grow and nothing overlaps. Adjacency
  stays reciprocal. The reservation is not enlarged.
- **Connection.** The Lantern Footbridge continues the Market Street axis
  (north −1335) behind the Bayou Lantern tower. It runs from the Bayou Green's east
  edge over the bayou to the east bank. This revision splits the Commons railing
  and bayou pieces around the bridge with recipe overrides. The Commons recipe and
  its lock do not change.
- **Place.**
  - *Spine.* Nineteenth Street continues the axis east. The preview
    `nineteenth-and-yale` crossroads is promoted, unchanged in geometry, as the
    commercial heart, and placed by anchor.
  - *Bayou Greenway.* A trail runs the length of the east bank.
  - *Heights Green.* A park with lawns, groves, benches, market stalls and the
    Heights Bandstand, which is the landmark.
  - *Icehouse patio.* A court with picnic sets and the shared game table.
  - *Esplanade.* A linear park inspired by Heights Boulevard.
- **Activity.** The icehouse game table is a two-chair table on the existing
  authoritative table-game rules (`server/table-games.js`, through
  `plazaSalonPlan`), offering chess, checkers, Connect Four, reversi and morris.
  Walking, sitting, invite, accept, moves, checkpoints and the game's departure rules
  are all existing server authority. No `server/world.js` change is needed.
- **Interfaces.**
  - The Heights overlay extends `world.eastGardenCommons` with its surfaces, solids
    and bounds, so the shared walking, ground, collision, flight and server-bounds
    paths need no edits.
  - `layout.heights` records the plans, the base Commons revision and the index
    where Heights surfaces and solids start.
  - `districtRevisionOf` reports `bayou-heights-1`.
  - Streaming and chunk interfaces come from #623. They are not on main, and final
    integration is coordinated with that owner.

## Files owned

New files:
- Recipes and locks: `config/destinations/{bayou-greenway,yale-icehouse,yale-street-north,yale-street-south,heights-boulevard-north,heights-boulevard-south}.json`.
- `shared/bayou-heights.js` (composition) and `shared/bayou-heights-layout.js` (constants, so revision lists stay light).
- `preview/src/bayou-heights-world.js` (attach/detach/registration), `preview/src/bayou-heights.js` (scene, loaded dynamically) and `preview/src/bayou-heights-arrival.js` (arrival notice).
- `server/district-heights-checkpoint-migration.js`.
- Tests: `preview/tests/bayou-heights.test.js` and `server/tests/bayou-heights.test.js`.
- `preview/e2e/bayou-heights.js`.
- `docs/level-design/expansion/bayou-heights.md`.
- This ledger.

Small edits to existing files:
- `config/destinations/nineteenth-and-yale.json`: title, anchor and inspiration only, then re-lock. The plan's pieces, surfaces, solids and stats are identical; only provenance and hash change.
- `preview/public/data/world-manifest.json`: the partition.
- `scripts/destination.mjs`: two `ENTRIES` seams for recipe-level connectivity.
- `server/district-data.js`, `preview/src/main.js`, `preview/src/garden-campus-district.js`: revision selection, the scene call and the debug hook.
- `preview/src/plaza-salon-plan.js`: the icehouse table, its seat pattern and chair title.
- `server/redis-room.js`: Heights recovery first in the chain, and its log event.
- `preview/e2e/experience-runner.js` and `.github/workflows/verify.yml`: the journey environment and its own CI shard.
- `preview/audit/world-expansion-footprint.js`: the Heights sample.
- Docs: `docs/world-expansion.md` and `docs/city-kit.md`.

I will not edit:
- `walking.js`, `player-avatar.js`, `remote-players.js`, or the crime and police
  modules (onfoot-637-640).
- The `bayou-market-commons` recipe and lock, kit `catalog.js`, `assemble.js` and
  `render.js` (#641).
- `east-garden-commons.js` and `lantern-walk.js` (#623 and #641).

## Checks

- Focused:
  - Recipe validation and connectivity, and locks via `pnpm run destination check`.
  - Composition parity between server and client.
  - Flood fill from the District side, with no dead-end pockets.
  - The real walking controller crosses the bridge and walks the streets.
  - Refusals: the water, blocks, remaining reserve and building placement.
  - Manifest partition.
  - Two-player icehouse game through the shared world.
  - Checkpoint restore and rollback in both directions.
  - Unchanged Commons, Gardens and garage fingerprints.
- `pnpm run verify`, then `pnpm run verify full` with an isolated Redis service,
  because the migration touches Redis recovery.
- `node preview/audit/world-expansion-footprint.js --reachable` at 1 m and 0.5 m,
  with composed-world hashes.
- A two-player browser journey (`pnpm run test:experience bayou-heights`) through
  `scripts/browser-lock.mjs`.
- Pedestrian captures, inspected.
- A matched District performance comparison, as far as local tooling allows.
- Current-head hosted checks on the draft PR.

## Results

Not started.

## Gaps and coordination

- Streaming, unload and chunk-bounded loading depend on #623. Until it merges, the
  Heights scene is loaded with the revision, like Commons on main.
- Human visual approval, physical devices, hosted multiplayer and Unreal parity are
  separate acceptance.

## Next step

Author the Heights recipes, build them, measure their walkable area, and iterate the
layout toward the 2× target before wiring the runtime.
