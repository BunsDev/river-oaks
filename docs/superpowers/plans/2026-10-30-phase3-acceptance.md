# Phase 3 (#584, #585, #586): acceptance audit on current main, and the gaps fixed

Branch `test/phase3-acceptance-20261030`, worktree `river-oaks-phase3` from `origin/main`
`bea70e05`. Register task `phase3-acceptance-20261030`. Owner `claude:river-oaks-86 (2421a3)`.

## Objective

Phase 3 asks for one realistic, socially useful destination built from a modular kit and a
deterministic assembly pipeline with manual overrides, playable by two players from the
District and back, then an inspection at pedestrian scale and a fix of the weakest parts.
Much of it already shipped (#611/#623 and later). This audit checks each issue's acceptance
criteria against evidence on current main, records what only a human can approve, and fixes
the gaps found.

## Acceptance against evidence (main `bea70e05`)

| Criterion | Evidence | State |
| --- | --- | --- |
| #584 kit: streets, sidewalks, intersections, shells, facades, storefronts, roofs, glazing, landscaping, lights, furniture | `docs/city-kit.md` piece families; `shared/city-kit/catalog.js` | met |
| #584 conventions: scale, materials, LOD, collision, licensing, budgets, naming | `docs/city-kit.md` Conventions; budgets checked by `destination build` and tests | met |
| #584 two distinct blocks from the kit | Commons (market-row, garden-court) and Nineteenth and Yale (heights-row) among 18 shipped recipes, 32 blocks, 354 shells | met |
| #584 pedestrian-scale review, draw calls, repetition | `city-kit-review.js` on this head: 18 views of two recipes at two seeds, 0 page errors, 0 missing assets; draw calls 122–356 per view (whole-view, trees and planting included) | captured; human visual approval outstanding |
| #584 parity screenshots against the District | the Commons journey captures `parity-district-arrival` and `parity-market-street` | pending: local run needs a quiet host (hosted runs keep no screenshots) |
| #585 deterministic, reproducible builds | `destination check`: all 21 locks reproduce; Commons seed 7 built twice: `b750b02a0df11b98` both times | met |
| #585 seeds | default seed 1912 `2241512f79d5bf79`, seed 7 `b750b02a0df11b98`; both fully connected (93,498/93,498 walkable samples, all 5 lanterns reachable), within budget (91,568/260,000 triangles, 62/160 solids, 14/28 materials) | met |
| #585 overrides survive regeneration | CLI override (`parcel-1 storeys=3`) on a copy, rebuilt at seeds 1912, 7, 99: applied every time, 0 orphaned | met |
| #585 one command to a previewable destination | `destination build` writes plan, `plan.svg`, `report.json`, `studio-region.json`; fixture `city-kit.html?recipe=` | met |
| #585 cleanup cost against hand authoring | `destination effort`: as quarters, every street 2 m wider costs 0 retyped numbers; authored, 128 | met for 16 of 18 recipes on main; **all 18 with this change** |
| #586 landmark, plaza, accessible streets, shared activity | Bayou Market Commons: water tower, Bayou Green plaza, curbless shared streets, Lantern Walk and the Commons chess table | met |
| #586 District → destination → District for two players | hosted `preview experience (commons)` on #761 head `28731ecc` (tree identical to main `bea70e05`), job 123839617409: two real clients walk in by keyboard, finish shared chess, light the Lantern Walk together, return without reload | met (hosted) |
| Kit and pipeline suites | 186/186 client and pipeline tests; server 27/27 with an isolated Redis (4 Redis tests skipped without it) | met |

## Inspection notes (pedestrian scale)

- **Storefront glazing reads dark.** Not changed: Val's review of the luxury captures asked for
  the dark, warm interior with one brass rail per bay and a pendant per pane (`d0044c9d`);
  the earlier pale interiors "read as beige boards with white squares".
- **Bayou Green reads open in the fixture.** The fixture draws the recipe only; residents,
  the chess table and players are absent. Judge it in the running game (parity captures).
- **Nineteenth and Yale street trees are uniform rows.** Recorded for the human review; no
  change without it.

## Gap fixed: the last two hand-authored recipes become quarters (#585)

The two Bayou Terrace studio rows were hand-placed half a metre off Terrace Lane, so no quarter
form reproduced them: a street edit there meant retyping rectangles (8 numbers) or leaving 27
shells in a wider lane. A quarter now takes an `inset` (`[west, south, east, north]` metres the
block stands back from its land). The land meets its street and runs only as long as it; the
block stands back by the inset; frontage is measured along the block's own length.
`destination migrate` tries land-with-inset forms last (they type four more numbers).

- Both terraces migrate with their lock geometry unchanged (`57ec6291e36c63a3`,
  `4bc9dd68a9b5780e`); plan hashes change because the recipe did, as for the first sixteen.
- `destination effort`: all 18 recipes as quarters; every street 2 m wider: 0 to retype, 0
  shells in the street, 34 and 20 terrace shells kept.
- Composed world for `bayou-terraces-1` differs from main only in the two plans' `hash`,
  `provenance.recipeHash` and new `provenance.layout`: no piece, surface, solid or walkable
  change.

## Checks

| Check | Result |
| --- | --- |
| Failing first | the new terrace test and inset test fail on main (terraces carry blocks; `inset` is an unknown quarter key) |
| `node --test` city-kit, terraces, Heights stream, resident locations, streetscape, neighborhood scripts | 136/136 |
| `pnpm run destination check` | every lock reproduces |
| Server suites for the Heights, Studewood, Terraces, Woodland, TypeSafe revisions and checkpoint migrations (isolated Redis) | 57/57, 0 skipped |
| `pnpm run verify` (core, host load ~41) | failed 1: `blocks-town.test.js` "the new socket is live" after a reconnect (player blocking, untouched here). Alone it passes twice on this tree and once on main. Tooling 289/289; preview 4656 pass + 35 todo + 1 skip of 4692; server 1080 pass + 285 skip of 1366 with that one failure. Rerun on a quiet host pending |
| Browser: Commons two-player journey with District parity captures | pending (quiet host) |

## Gaps

- Human visual approval of the destination and parity captures is Val's.
- The 10-22 lane `neighborhood-584-586` holds a 50-line block prototype, its test, fixture
  journey, spec and plan, superseded by `shared/city-kit/`; retiring it needs Val's
  cancellation authorization. The lane `neighborhood-authoring` is wholly on main (46 files
  byte-identical, delivered by #623).

## Next step

Core verify, draft PR, then the Commons journey with parity captures when the host is quiet.
