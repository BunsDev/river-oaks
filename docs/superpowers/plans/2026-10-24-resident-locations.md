# Residents walk anywhere in town, the Commons included

## Objective

Val asked on 2026-10-24 to let residents walk anywhere in the district for now, to run it in dev and to base it on main. Before this, the resident planner covered only the District grid: residents never crossed into Bayou Market Commons (`server/tests/east-garden-commons.test.js` asserted "cross-location resident routing is not yet granted"), and each resident circled the three stops nearest to where it stood, so most never left their own part of town. The approved Commons contract asks for bounded location routing rather than a bigger single grid (`docs/level-design/expansion/destination-proposal.md`).

## Ownership

Task `next-district-586-support-20261024`, owner `claude:river-oaks-3e (4e851f0b)`. Worktree `river-oaks-resident-locations`, branch `feat/resident-locations-20261024` from main `67203a6a`. The next-district lane (`next-district-586-20261024`, river-oaks-91, PR #649) owns Bayou Heights; this branch touches none of its files.

## Files owned

- `preview/src/navigation.js`: opt-in `locations` routing.
- `preview/src/resident-life.js`: Commons stops and wandering.
- `server/district-commons-checkpoint-migration.js`: Commons → Gardens rollback walks residents home.
- `preview/tests/resident-locations.test.js`, `server/tests/resident-locations-rollback.test.js`, this ledger.

## Design

- **Per-location grids.** `createResidentNavigation(world, { locations: true })` keeps the District grid exactly and adds one bounded grid per composed location: the Commons band from the District edge to the plaza (116 × 81 cells). Each grid keeps the 80,000-cell cap. A location over the cap gets no grid, which is the case for Bayou Heights on #649 (89,628 cells), so residents stay out of it until it is split.
- **Seam corridors are found, not authored.** Along each shared east/west edge, a perpendicular crossing counts when its ground is open, off the roadway, within the 0.25 m step limit and has a finite pedestrian cost. Runs at least a metre wide become portals. On main, one corridor joins the District (edge − 15 m, outside the site ring) to the promenade (edge + 0.5 m) at north −1333.5, on the sidewalk strip beside the boundary road.
- **Keep right through the corridor.** Eastbound walkers cross in the southern part of the run (north −1334.0) and westbound walkers in the northern part (north −1333.0). Before this, both directions shared one waypoint: two residents meeting there yielded to each other indefinitely (seen in the dev town, reproduced offline and by a staggered-meeting test).
- **Only residents use it.** Police, carriages and the creator audit call the planner without `locations` and keep the District grid byte for byte (a test compares routes).
- **Somewhere to go.** Three Commons lanterns (gateway, terrace, tower) become resident stops. More would make the nearest stops all Commons ones, and residents would stop coming back.
- **Wandering.** Every other outing is a stroll of up to 60 m toward a far stop, which changes every 12 outings. Residents cross the whole town over time, while every route search stays short. A first version that routed straight to any stop in town raised the server's p99 step from 7–9 ms to 33–46 ms after warm-up, so it was replaced. A second, which hopped between nearby stops toward the target, got stuck: the stops near the east edge are sparse, so greedy hops cycle about 80–95 m short of the Commons.
- **Rollback.** Commons → Gardens also moves residents standing in removed land (east of the District edge, or in a seam corridor) to the nearest clear District ground. It clears their route, seat and destination and requeues their errands. Residents seated on District benches are untouched.

## Checks

| Check | Result |
| --- | --- |
| New tests on main's source (red) | 6/6 failed |
| `preview/tests/resident-locations.test.js`, `server/tests/resident-locations-rollback.test.js`, `preview/tests/resident-life.test.js` | 33/33 passed |
| Related suites (navigation, companion, creator, auto-navigation, Commons client/server/migration/games/transport, Gardens migration, world migration, police, corner elbow, Lantern Walk) | 109 tests: 106 passed, 3 skipped (Redis), 0 failed. This ran before the wandering change. |
| `pnpm run verify` (core), Python 3.12 on PATH | Passed at 19:48Z, but `navigation.js` changed during the run (19:47:33Z), so it was superseded by `verify full` below. |
| `REDIS_URL=redis://127.0.0.1:6461 pnpm run verify full`, isolated loopback Redis, Python 3.12 | **Passed, 18/18 stages** (2026-10-24 20:20Z to 2026-10-25 03:21Z). Ran on the final source tree: every source and test file predates the start and equals `1f971206`. See Results |
| Hosted Verify on `22679471` | 22/22 green |
| Scratch merge with main `0b9a97c4` (not pushed), related suites with Redis | 172/172 passed |
| Offline 60-min server simulation, Commons revision | See Results |
| Dev town on 5481/8881, fixture sign-in, Commons revision | See Results |

## Results

All on main `09bd7a83` plus this branch's uncommitted tree unless noted. Host: Apple M5 Max, load 17–28 throughout (other sessions' runs).

- **Red on main's source:** the six original tests failed 6/6 with `navigation.js`, `resident-life.js` and the migration taken from `67203a6a`. The staggered-meeting test failed on the pre-lane code (offset 23: both residents stalled within a metre of the Commons end of the corridor).
- **Focused:** `preview/tests/resident-locations.test.js`, `server/tests/resident-locations-rollback.test.js`, `preview/tests/resident-life.test.js`: 34/34 passed.
- **Related suites on the rebased tree:** 117 tests, 114 passed, 3 skipped (Redis), 0 failed (before the lane change; the lane change touches only cross-location routes).
- **Offline server simulation** (`server/world.js` shared world, Commons revision, stepped as the server does: 0.25 s calls of 5 × 0.05 s resident steps, 98 residents):

  | 60 simulated minutes | main | this branch |
  | --- | ---: | ---: |
  | Distinct residents who entered the Commons | 0 | 7 (6 walked back) |
  | Residents in the Commons at a time, mean / max | 0 / 0 | 0.57 / 2 |
  | 20 m cells visited | 51 | 83 |
  | Median farthest distance from start | 45 m | 156 m |
  | Step call p50 / p95 / p99 / max | 2.6 / 4.9 / 8.5 / 212 ms | 3.0 / 11 / 25 / 329 ms |
  | Calls over 50 ms (per 10 min after the first 10) | 0 | 1–6 |

  Residents walk more, so each step does more work. The first 10 minutes carry the cache warm-up in both.
- **Stall hunt:** 40 simulated minutes on the final code: no resident within 20 m of the seam stood still for two minutes. On the pre-lane code, the first such stall came at minute 4.8.
- **Dev town:** `RIVER_OAKS_ACCEPTANCE_FIXTURE=1 RIVER_OAKS_DEV_TOWN_PORT=8881 RIVER_OAKS_DISTRICT_REVISION=east-garden-commons-market-1 pnpm run dev --port 5481`, watched over the real WebSocket for 15 minutes each time.
  - Before lanes: 3 residents entered the Commons, and 2 of them stalled at the seam.
  - After lanes (20:20–20:35Z): 4 distinct residents entered the Commons, up to 2 at once. Positions were sampled every 30 seconds, and no resident stood still near the seam. Two residents walked in together and were heading back toward the District when the watch ended.
- **`verify full`** (receipt `.runtime/agent/full.json`, status `passed`):
  - dependency audit;
  - agent 274/274;
  - preview 4,095 passed, 1 skipped;
  - server with Redis 1,158/1,158;
  - desktop 115 passed, 3 skipped;
  - build;
  - Python lint, format and 170 tests;
  - demo and demo-verify;
  - secrets and secret history;
  - security-browser;
  - reflections;
  - experience 17/17 journeys;
  - shared 27/27;
  - IPIC screening.

  The generated `data/reports` files were restored, not committed.
- **Compatibility with later main:** a scratch merge of `22679471` into main `0b9a97c4` was clean; it took in #641, #645, #646 (checkpoint v17, crime and police in `server/world.js`), #647, #651 and #652. These suites passed on it with Redis, 172/172 and 0 skipped:
  - resident locations, rollback and life;
  - navigation, companion, creator and auto-navigation;
  - community;
  - Commons client, server, games, transport and migration;
  - Gardens, District and world migrations;
  - police and crime;
  - the Commons activation rehearsal;
  - Redis room.

## Gaps

- Bayou Heights (#649) has no resident grid: 89,628 cells over the cap. When it is split, its rollback needs the same resident relocation (noted to river-oaks-91).
- No browser journey covers residents crossing the seam; the server simulation and the dev town are the evidence.
- Human review of how it looks in the Commons is Val's.

## Next step

Draft PR #655 waits for Val's review in the dev town and for Val's go to land. Merging and landing are not authorized for this task. With that go:
1. Merge current main into the branch.
2. Rerun the focused suites and `verify full` with an isolated Redis.
3. Wait for hosted Verify on the merged head.
4. Land through `pnpm run land` by whoever holds landing authority.
