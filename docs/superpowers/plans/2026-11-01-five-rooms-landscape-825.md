# Five Rooms Landscape (#840): increment 1, street-tree clearance for the Ribbon spine

Task `five-rooms-landscape-825-20261101`, branch `feat/five-rooms-landscape-825-20261101`, stacked on
`feat/ribbon-graybox-825-20261031` (#828) at `1a85f208`. Worktree
`../river-oaks-five-rooms-landscape-825`.

## Objective

Val's decision 2 on #835 (2026-11-01 09:40Z): "accept street trees near the canopy for M0; tree
exclusions land in Landscape (#840)". The #828 ledger flagged that no check stops a street-tree
crown from passing through the spine canopy. This increment measures every drawn street tree
against the District spine (`expandRibbon(config/ribbon/district-spine.json)` via
`districtRibbonPlan`) and adds a test that fails when a tree blocks the spine without a declaration.
It does not include courts, paving or ground support. Those come once #838 v1 is published.

## Files

- `preview/src/ribbon-tree-clearance.js` (new): `districtRibbonTreeClearance(world)`,
  `RIBBON_TREE_RULES`, and the declared list `DISTRICT_RIBBON_TREE_DECLARED`. It only measures and
  changes nothing that is drawn.
- `preview/tests/ribbon-tree-clearance.test.js` (new).
- This ledger.

Not changed: `shared/city-kit/ribbon-layout.js` (`exclusionKinds` is untouched, so #838's owner
river-oaks-c2 needs no contract change), `district.json`, `district-vegetation.json`,
`config/ribbon/*`, `street-furniture.js` and the renderer.

## Tree source and model

- The trees are the client's: `district.json` plus the LiDAR `branch_supports` in
  `district-vegetation.json` (merged by `main.js`), placed by `matureTreePlacements`. That gives
  199 trees and 198 pits (one tree stands in the Harry Winston bed and has no pit). Without the
  LiDAR file, only the four OSM trees remain, and all of them are more than 10 m off the spine.
- The crown model is #838's (`siteFromDistrict` / `crownFindings` in
  `shared/city-kit/five-rooms-layout.js` on `feat/five-rooms-layout-825-20261101`, not pushed when
  measured). It was adopted at the coordinator's request so that the repo has a single tree model.
  A crown is a disc of the drawn radius. Its underside is the lowest LiDAR branch end, or 55 % of
  the height when no branch end is recorded. A crown passes through the canopy when the disc
  overlaps a walk module and its underside is below the slab top (3.6 m clear + 0.4 m slab = 4.0 m).
  A pit is the 1.3 m grate plus a 0.1 m frame, treated as a square. It blocks the spine when it
  overlaps a walk module (`walk`) or a standing post (`post`).
- The rules are copied into `RIBBON_TREE_RULES` until #838 merges. After that, import the
  contract's rules instead.

## Measured: trees within 5 m of the spine walk

Key = stem (source east, north). Ids are #838's (`tree-<placement index>`, `tree-pit-<pit index>`).
Crown gap = crown underside minus the 4.0 m slab top. Plan gap = signed stem distance to the walk
(negative: the stem is on the walk).

| Stem | Tree | Pit | Radius m | Crown base m | Crown gap cm | Plan gap m | Through canopy | Pit | Declared |
|---|---|---|---|---|---|---|---|---|---|
| -2755,-1297 | tree-118 | tree-pit-117 | 3.10 | 3.458 | -54 | 3.781 | no | – | no (clear) |
| -2757,-1285 | tree-124 | tree-pit-123 | 3.532 | 5.809 | +181 | 1.579 | no | – | no (clear) |
| -2761,-1279 | tree-104 | tree-pit-103 | 3.10 | 3.189 | -81 | 0.525 | yes | walk | yes |
| -2761,-1273 | tree-77 | tree-pit-76 | 3.10 | 3.822 | -18 | 0.627 | yes | walk | yes |
| -2757,-1267 | tree-172 | tree-pit-171 | 3.745 | 4.347 | +35 | 1.268 | no | – | no (clear) |
| -2761,-1263 | tree-37 | tree-pit-36 | 3.10 | 3.724 | -28 | 0.801 | yes | post | yes |
| -2759,-1257 | tree-85 | tree-pit-84 | 3.10 | 3.891 | -11 | -0.395 | yes | walk | yes |
| -2759,-1251 | tree-153 | tree-pit-152 | 3.10 | 3.532 | -47 | -0.512 | yes | walk | yes |
| -2759,-1219 | tree-127 | tree-pit-126 | 3.10 | 3.794 | -21 | -0.389 | yes | walk | yes |
| -2759,-1205 | tree-28 | tree-pit-27 | 3.442 | 4.244 | +24 | -0.116 | no | walk | yes (pit only) |
| -2759,-1199 | tree-84 | tree-pit-83 | 3.10 | 3.622 | -38 | 0.000 | yes | walk | yes |

This agrees with #838's `layout.md` for the spine: 7 crowns through the canopy (104, 127, 153, 37,
77, 84, 85, with the same crown bases) and 8 pits (27, 36, 76, 83, 84, 103, 126, 152). Pit 36
overlaps a post's footprint, not the walk.

## Drawn mesh versus the model (gap, not gated)

Before adopting #838's model, I measured the rendered crown itself. I read every vertex of
`ez-oak-high/mid/low.glb`, scaled each the way `buildMatureTrees` scales it, and took the furthest
radial reach per 4 % height band. The drawn mesh has leaves from 12.4 % of the tree's height, about
0.93 m on a 7.5 m tree, so it does not follow LiDAR branch ends. Against the drawn mesh and the
graybox's drawn 0.12 m slab (3.72 m top), 10 crowns reach over the spine walk below the top: the
seven above plus tree-28 (-348 cm), tree-124 (-199 cm) and tree-172 (-251 cm). Their horizontal
gaps run from -199 to -352 cm. Lifting crowns to 4.0 m in data therefore does not clear them
visually unless the renderer also honours the crown base. I reported this to river-oaks-c2 and did
not add a second gate, so the repo keeps one model.

## Fix within the pit: none possible

The pit is 1.3 m, so a stem can move at most about 0.6 m inside it. Seven stems sit 0.0–0.8 m
from or on the walk, and their crowns (radius ≥ 3.1 m, the floor `matureTreePlacements` clamps to)
overlap it by more than 2.3 m. No offset inside the pit clears the walk or the pit. A crown trim
cannot clear the disc either. Only lifting the crown base clears the canopy, and that is a data
correction to LiDAR crown bases, which this increment does not apply. Nothing was applied.

## Checks and results

- Mutation: in the data, I moved the clear support -2755,-1297 to -2757,-1240 (stem and endpoints)
  in `district-vegetation.json`. The test failed with
  `'tree-118 at -2757,-1240: crown gap -54 cm through the canopy'`, and the file was restored with
  `git checkout`. The test also holds three in-test mutations: a tree moved beside the walk, the
  pit-only tree-28 crown lowered to 3.5 m, and a declared gap drifted by 5 cm. Each one throws.
- `node --test preview/tests/ribbon-tree-clearance.test.js preview/tests/ribbon-graybox.test.js preview/tests/ribbon-route-district.test.js preview/tests/ribbon-layout.test.js`:
  22 tests, 22 pass, 0 fail, 0 skipped.
- `pnpm run verify` (core): not run. 1-minute load was 116.66 at 04:23 local (gate is below 8). Pending.

## Robustness to the #827 side-lane fix

Assertions are keyed by stem position and measured crown gap. No assertion names a post or module
ID, or where the spine starts. A declared tree that stops blocking (for example, after the start
moves north of side lane `osm-way-625330795`'s kerb at about y −1285.7) is reported as a test
diagnostic, not a failure. The test does not certify posts against roads. #838 found that posts
002–004 stand in `osm-way-625330795`. That finding belongs to #827 and is not hidden here.

## Gaps

- The rules are a copy of #838's until it merges. Import them then.
- The drawn mesh disagrees with the crown-base model (see above). There is no renderer change.
- Only the spine is covered. The south and link-studios segments are #838 drafts not yet expanded
  here (tree-108, tree-118 and tree-48 per #838).
- Trunks on the walk are navigation obstacles (`navigation.js` trunk radius about 0.5 m). Server
  movement was not exercised.

## Decision for Val

For the 8 declared trees: move their pits out of the 2.0 m walk and lift the 7 crowns above 4.0 m
(a data correction in the style of `tree-placements.js`, which keeps the LiDAR source records,
plus a renderer change so drawn leaves respect the crown base). Or lower the canopy to 3.0 m clear,
which per #838 leaves tree-104 and the pits. Or cut tree openings into the canopy (a ribbon-1 kit
rule).

## Next step

Rebase onto the #827 side-lane fix when the coordinator moves the stack, and prune stale
declarations. Then build courts from #838 v1.
