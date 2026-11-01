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
| #584 parity screenshots against the District | `parity-district-arrival` and `parity-market-street` from the local Commons run on `ec1ae3c6`: the market street reuses the District's street trees, patterned paving, tree pits and lamp posts; its storefronts are darker by Val's design (`d0044c9d`) | captured; human visual approval outstanding |
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
| `pnpm run verify` (core) | at load ~41: one failure in `blocks-town.test.js` ("the new socket is live", player blocking, untouched here), which passes alone on this tree and on main. Rerun from a detached snapshot of `ec1ae3c6` at load ~10 (2026-10-30 05:37–05:43Z): passed, tooling 289/289; preview 4656 pass + 35 todo + 1 skip of 4692; server 1081 pass + 285 skip of 1366; 127 pass + 5 skip of 132 |
| Browser: `east-garden-commons` two-player journey, `ec1ae3c6` snapshot (05:43–06:00Z, load 18–32) | passed: both players walk in from the District, light all five Lantern Walk lanterns together (credited to both), return home without reload; no page errors |

## Follow-up inspection on main `2df5089e` (after #780 and #781)

Measured on every committed recipe with the kit's own assembly and renderer
(`assembleNeighborhood`, `walkableConnectivity`, `buildCityKit`, headless, trees excluded
from draw counts) plus the composed-world connectivity test. Probes are local evidence, not
committed tests; the lamp rule below is.

| Check | Result |
| --- | --- |
| Draw calls, the two Commons blocks (#584) | market-row 11 (3 massing + 8 detail), garden-court 10 (3 + 7); whole Commons plan 63 calls, 43 materials, 31,316 triangles. All 21 recipes 28–66 calls. Every block draws as a massing and a detail group |
| Collisions, Commons | 0 overlapping solids, 0 overlapping shells, 0 solids inside a shell |
| Collisions, all recipes, before | 39 overlapping solid pairs; **23 street lamps in 13 recipes stood exactly on a street tree** (column in the trunk, globe at 5 m inside the canopy), because street trees and lamps were spaced independently on the same kerb line |
| Collisions, all recipes, after the fix | 0 lamp overlaps. 14 pairs remain: 4 hedge planters meeting end to end (intended), 5 tree/bench touches of 1 cm, and 5 authored placements overlapping a tree by 0.1–0.6 m (Nineteenth and Yale corner benches and café set, the Heights Boulevard end hedge). Recorded, not changed |
| Dead ends, Commons | flood fill from the Market Street walk reaches 92,994/92,994 walkable samples; all 5 lanterns reachable |
| Dead ends, all recipes | 19 of 21 recipes fully connected on their own. The Bayou Greenway strip and a Yale Icehouse patch are pockets only in isolation: the composed-world test (`bayou-heights.test.js`, every Heights sample connects to the footbridge) requires 100% and passes |
| Repetition | 424 shells: 4 of 378 adjacent pairs share every visible field, the longest identical run is 2, the most common façade signature is at most 35% of a recipe (Bayou Terraces, TypeSafe North and Penthouse) and 11% in the Commons. One tree model throughout, varied per tree by height (8.5–11.5 m), crown radius (3.1–3.9 m) and yaw; rows are evenly spaced by design |
| Lighting and landscaping parity | one scene sun and sky light the District and every destination; the kit draws paving with the District's `paverSurface`, trees and planting with `buildMatureTrees`/`buildPlanterPlanting`, the District's orbital lamp, tree grate and porcelain planter. Local captures `parity-district-arrival` and `parity-market-street` show the same trees, paving, tree pits and lamps |

### Fix: no street lamp stands in a tree pit

`shared/city-kit/assemble.js`: where a lamp would stand within 1 m of a tree on its kerb,
it moves half a tree spacing along the street (forward, else back) if that spot is open
and clear of trees. 25 lamps in 13 recipes moved; no other piece changed (piece-by-piece
diff against main). The Commons is unchanged. 13 locks rebuilt (`destination build --lock`);
the ten migrated recipes' recorded authored-ground hashes and the test's table moved with
it, with a note (both forms move identically; the migrate/freeze round trip still holds).
New test in `preview/tests/city-kit.test.js` fails on main and passes here.

| Check (lamp fix) | Result |
| --- | --- |
| `destination check` | every lock reproduces |
| city-kit suites | 56/56 plus the new test |
| full preview suite | 4766 pass + 35 todo + 1 skip of 4802 |
| server suites for Heights, Studewood, Terraces, Woodland, TypeSafe, residents and checkpoint migrations (isolated Redis) | 72/72, 0 skipped |
| `pnpm run verify` (core, load 22–31) | passed: tooling 294/294; preview 4767 pass + 35 todo + 1 skip of 4803; server 1110 pass + 285 skip of 1395; 127 pass + 5 skip of 132 |

### Fix: no furniture or hedge overlaps a street tree; street-tree rows vary like the District's

On `56e03eec` (after #812), 14 overlapping solid pairs remained. This change clears every
one except hedge planters that continue one another:

- Heights Boulevard North: the esplanade's last tree pair stood inside the end hedge;
  the street now has `clear: [[158, 163]]`, so its trees stop before the hedge.
- Nineteenth and Yale: both corner benches move 1.5 m and the court café set 2.5 m
  along their frontage, off the street trees.
- Bayou Greenway (4 benches) and Yale Icehouse (1): the benches touched a tree's
  collision square by 1 cm; each moves 0.5 m along the greenway.

The Nineteenth and Yale rows read as one repeated tree because the kit drew street trees
8.5–11.5 m tall with 3.1–3.9 m crowns, while the District's 199 surveyed street trees run
7.5–16 m and 2.1–5.2 m (spacing is similar: the District's are mostly 6 m apart). Street
trees now draw 7.5–14 m tall with 2.6–4.8 m crowns. Only tree `height` and `radius`
change; tree positions and collision squares do not.

| Check (this change) | Result |
| --- | --- |
| Overlap probe, all 21 recipes | 4 pairs left, all hedge-to-hedge joins (intended) |
| New test `no two solids overlap in any committed recipe, except hedge planters that continue one another` | fails on main's recipes (`bayou-greenway/greenway/tree-s-2 overlaps …greenway-bench-22`), passes here |
| `destination check` | all 21 locks reproduce after `build --lock`; the 18 migrated recipes' recorded authored-ground hashes and the test table move with a note |
| `destination effort --write` | massing 707 (+2: the esplanade's `clear`), typed 2617 |
| Composed Commons world vs main | differs only in seven street trees' `height`/`radius` and three hashes; the resident-route fixture's digest line is updated with a `digestRecaptured2` note, and all 60 route cases still match |
| `city-kit-review.js`, main vs this change (local Chromium, 4 cases, 18 views each) | 0 page errors and 0 missing assets in both; draw calls 122–359 per view in both. In `nineteenth-and-yale-77-street` the rows now vary in height and crown from tree to tree |
| Full preview suite | 4775 pass + 35 todo + 1 skip of 4811 |
| Server suites for Commons, Heights, Studewood, Terraces, Woodland, TypeSafe, residents and checkpoint migrations (isolated Redis) | 89/89, 0 skipped |
| `pnpm run verify` (core, load 7–13) | passed: tooling 294/294; preview 4775 pass + 35 todo + 1 skip of 4811; server 1110 pass + 285 skip of 1395; 127 pass + 5 skip of 132 |

## Gaps

- Human visual approval of the destination and parity captures is Val's; the measured
  checks and the before/after review above do not replace it. Issues #584–#586 stay open
  for that review, by Val's decision (evidence comments posted 2026-10-30).
- The two 10-22 lanes were cancelled to restore-tested archives on 2026-10-30 with Val's
  authorization (`cancel-stale-nRFn91`, `cancel-stale-rxIZxX`).

## Next step

Open the PR for the overlap and tree change; landing needs Val's authorization.
