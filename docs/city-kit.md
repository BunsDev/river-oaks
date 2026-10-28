# City kit and neighborhood assembly

The city kit (#584) and the deterministic assembly pipeline (#585) build new neighborhoods out of one shared set of streets, sidewalks, intersections, building shells, storefronts, roofs, glazing, landscaping and street furniture. The first destination built with them is [Bayou Market Commons](level-design/expansion/bayou-market-commons.md) (#586). The same kit also assembles a second, deliberately different neighborhood, `nineteenth-and-yale`. [Bayou Heights](level-design/expansion/bayou-heights.md) promotes it, with unchanged geometry, as the crossroads of the next connected district, alongside six new recipes.

The kit extends existing systems rather than adding a city engine. Movement uses the Commons walking contract (`shared/east-garden-commons-layout.js`). Surfaces use the District PBR maps (`preview/src/materials.js`). Trees use the District's tree models and their level-of-detail and shadow batching (`buildMatureTrees`). Planters use the District planting palette (`buildPlanterPlanting`).

## Files

| Concern | File |
| --- | --- |
| Pieces, styles, materials, conventions, budgets | `shared/city-kit/catalog.js` |
| Recipe validation, seeded assembly, overrides, provenance, connectivity | `shared/city-kit/assemble.js` |
| Blocks derived from streets, quarters and reservations | `shared/city-kit/layout.js` |
| Kit streets from a geographic reference: grid, crop, snap, merge, dropped-road diagnostics | `shared/city-kit/reference.js` |
| A plan as a World Studio region (Open JSON), checked against Studio's limits | `shared/city-kit/studio.js` |
| Three.js rendering of a plan | `preview/src/city-kit/render.js` |
| Recipes, locks | `config/destinations/*.json`, `*.lock.json` |
| CLI | `scripts/destination.mjs` (`pnpm run destination …`) |
| In-engine preview of any recipe | `preview/e2e/fixtures/city-kit.html?recipe=<id>&seed=<n>&view=<view>` |
| Pedestrian-scale screenshot review | `preview/e2e/city-kit-review.js` (shared browser lock) |
| Tests | `preview/tests/city-kit.test.js`, `preview/tests/city-kit-pipeline.test.js`, `preview/tests/city-kit-shipped-quarters.test.js`, `preview/tests/city-kit-layout.test.js`, `preview/tests/city-kit-reference.test.js`, `preview/tests/city-kit-studio.test.js`, `preview/tests/bayou-market-commons.test.js` |

## Conventions

- **Units and axes.** Recipes use site-local metres: x runs east of the site anchor and y runs north of it. Placement translates a plan into world east/north (`placePlan`). Rendering uses east, up and negative north, as the rest of the client does. Recipes snap to a 0.5 m module. The ground storey is 4.6 m and upper storeys are 3.5 m. Bays are 4.5–7.5 m wide.
- **Naming.** Every placed piece has a stable ID of the form `<neighborhood>/<group>/<role>-<n>`, such as `bayou-market-commons/market-row/parcel-2` or `bayou-market-commons/market-street/tree-s-3`. Overrides, additions, collision solids and render meshes all use these IDs.
- **Collision.** Assembly emits walkable rectangles: one for each curbless street (lane plus both sidewalks), one for each court and one for each plaza. Walkable rectangles are eroded by the 0.35 m walking radius, so neighbouring ground must overlap rather than merely touch. A shared edge alone is a wall. Courts overlap their sidewalk by a metre for this reason. Building shells stand outside walkable ground, so a facade is the walkable edge and needs no collision ring. Trees, lamps, bollards, benches, cafe sets, market stalls, planters, hedges, lanterns and water-tower legs are solids inside walkable ground. They block bodies and low flight. Assembly refuses any solid that is not fully inside walkable ground, so a seed cannot bury furniture inside a shop.
- **Materials.** The catalog defines 25 material slots. Most tint the District PBR sets (asphalt, brick, grass, pavement, paver, stone). Colours follow the established ivory, teal, brass, rose and mint language (`retro-palette.js`).
- **Level of detail.** Static geometry merges into one mesh per material per block. Facade detail (glazing, mullions, sills, canopies, awnings) is a separate batch that hides beyond 120 m. Trees use the District LOD distances of 22 m and 60 m.
- **Trees and planting.** Each kit draws its own street trees and planted beds, and each one clones the tree and planting models. A caller that streams several neighborhoods passes `landscape: false` to `buildCityKit`, then draws every plan's `cityKitLandscape` placements once. Bayou Heights does this. Planted beds draw at every distance unless `plantingMetres` limits them; `cullPlanting` applies the same rule to a caller's own planting. Bayou Heights uses 60 m, the trees' middle detail level, for its own beds and for the Commons it presents.
- **Budgets per neighborhood:** at most 260,000 authored triangles, 70 draw calls, 28 materials and 160 solids. `report.json` from `destination build` and the tests check these. Bayou Market Commons builds 53 meshes (the second neighborhood 62) with lanterns and tower, before trees and planting; their triangle estimates are 92,692 and 183,312.
- **Licensing.** All kit geometry is original procedural geometry authored here. Shop names are fictional. No facade copies a real building. Surfaces and trees reuse assets whose provenance is already recorded in `preview/public/assets/materials/sources.json` and `preview/public/assets/landscape/manifest.json`. The kit downloads nothing.

## Piece families

| Family | Pieces | Notes |
| --- | --- | --- |
| Streets | shared lane, sidewalk, flush curb, court, crossing table, intersection, crosswalk | Curbless shared streets keep the walking contract continuous. Crossing streets are clipped and replaced by a lane square, four striped crosswalks and four sidewalk corners. |
| Buildings | shell, context massing | Each shell carries storeys, height, wall/trim materials, roof kind, faced sides, bay count, storefront variant, awning and sign. Context massing is visual only. |
| Facades | storefront (canopy, awning, recessed, loggia), upper windows (arched, tall, paired), band and blade signs | Glazing sits in a real recess: 0.45 m (0.9 m recessed, 2.2 m loggia) at the storefront and 0.25 m at upper windows, with a dim shop interior, display shelves and pendant lights behind the storefront glass. Piers and spandrels stand on the face plane. Blade signs carry the shop name on both faces. |
| Roofs | parapet, cornice, stepped, sawtooth | Cornices project in two steps. Sawtooth roofs add north-light glazing. |
| Landscape | street tree, tree pit, planter, lawn, hedge, bayou | Trees and planting come from the District systems. Hedges are a stone curb with planting. |
| Furniture | bench, lamp, bollard, bike rack, cafe set, market stall, lantern, railing | Lantern glass and halo switch on the shared Lantern Walk state. A market stall takes a `sign` and an `awning` canvas: counter, produce crates, a striped roof and a lettered board from the shop-sign atlas. |
| Landmark | water tower | Legs, bracing, balcony, a lettered tank band and a beacon that lights when the Lantern Walk completes. |

Three styles combine these pieces: `market-row` (rose and umber brick, teal trim, canopies and awnings, arched windows, cornices), `garden-court` (ivory stucco, mint trim, loggias, tall windows, stepped parapets, blade signs) and `heights-row` (apricot stucco and umber brick, deep-teal trim, awnings, paired windows, sawtooth roofs).

## Recipes, seeds and overrides

A recipe names its kit version, seed, site rectangle, streets (east- or north-running), plazas (lawns, hedges, tree rows), blocks (rectangle, front, faced sides, depth/storey/bay ranges, a pool of shop names, an optional court), landmarks, furniture, visual-only context, `overrides` and `additions`. See `config/destinations/bayou-market-commons.json`.

The seed varies only what a recipe leaves open: parcel widths, storeys, depths, wall materials, roof kinds, storefront variants, awning colours, tree sizes and orientation. Each decision draws from its own random stream keyed by the piece's stable ID. Changing one block therefore never reshuffles another (tested). Streets, courts, plazas, landmarks, furniture and lanterns are authored and do not move with the seed.

Manual artistic edits live in the recipe as intent, never as edited generated output:

- `overrides["<piece id>"] = { "set": { … } }` changes allowed fields: `variant`, `awning`, `sign`, `storeys`, `wall`, `trim`, `roof`, `at`, `yaw`, `height`, `radius`, `depth`. Setting `storeys` recomputes height.
- `overrides["<piece id>"] = { "suppress": true }` removes a piece and its children, such as a tree with its pit and its collision solid.
- `additions` places hand-authored pieces under `<neighborhood>/manual/<id>`.
- A shop name pinned by an override leaves the generator's name pool, so no other shop repeats it. When a block has more shopfronts than names, the remainder stay unsigned rather than duplicating a name.

Overrides are applied after generation by stable ID. If a different seed no longer produces an overridden ID, the plan reports that ID under `provenance.overrides.orphaned`. The override itself stays in the recipe. Every plan records the kit version, seed, recipe hash, overrides hash and the applied, orphaned and added lists. Plans are canonical JSON with a browser-safe 64-bit hash, identical in Node and the browser.

## Derive blocks from streets

A recipe may carry a `layout` instead of typing every block rectangle by hand. Its `quarters` state the artistic constraints for an area of the site: style, parcel depth, storeys and bay ranges, a pool of original shop names, and optionally a `court`, an explicit `front` or `sides`, and `split`. Its `reserved` rectangles keep ground out of generation. Derivation runs inside `assembleNeighborhood`, so the in-engine preview, locks, overrides, budgets, connectivity and every runtime composition see derived blocks exactly as authored ones. See `config/destinations/layout-grid-example.json` for a worked example and `pnpm run destination layout <recipe>` for its diagnostics.

```json
"layout": {
  "quarters": [
    { "id": "north-row", "rect": [0, 57.5, 120, 97], "style": "market-row", "depth": [12, 16], "storeys": [1, 2], "bays": [5, 7], "names": ["Pecan & Pearl", "…"] },
    { "id": "south-row", "rect": [0, 0, 120, 42.5], "style": "heights-row", "depth": [11, 16], "storeys": [1, 2], "bays": [4.5, 6.5], "names": ["Cypress Supply", "…"] }
  ],
  "reserved": [{ "id": "chapel-yard", "rect": [0, 0, 33.5, 14] }]
}
```

- **Land.** Every street's corridor (lane plus both sidewalks), every plaza, authored block, context massing and reservation is cut out of the site. What remains is split into rectangles along street and quarter edges; the split that leaves fewer frontages partly off a street wins. A quarter claims the land inside its `rect` (a quarter without one claims the rest); its edges also cut land, so a quarter can divide one row into two styles. Land no quarter claims is reported as open and left empty.
- **Frontage.** A block faces the main street bounding its land: the widest, then the longest frontage, then north, south, east, west. A street on the opposite side as well splits the land into two back-to-back blocks on the module midline, when both halves are at least the quarter's minimum parcel depth; `"split": "none"` keeps one block. A quarter can name its `front` explicitly, as a street id or a side, for the garden court that should open onto the quieter cross street. Corner blocks face a crossing street that fully bounds their side (`sides`), unless the quarter lists its own.
- **Names and IDs.** The quarter's name pool is shared out along its blocks by frontage length, so no shop name repeats. A quarter that yields one block names it; several blocks are `<quarter>-<street>-<side>-<offset>`, where the offset is the block's distance in metres from the site's west or south edge, so land added elsewhere does not rename a block. Overrides and additions address derived pieces by the same stable IDs as authored ones, and a changed street reports an override whose parcel no longer exists under `provenance.overrides.orphaned`.
- **What never moves.** Streets, plazas, landmarks, furniture, authored blocks, overrides and additions. A landmark or furnishing standing on land a block would cover is refused with the block's name and the remedy (a plaza or a reservation), instead of being built over. Derived blocks never overlap each other, a street, a plaza or an authored block; the generator checks this and fails rather than emitting a broken plan.
- **Diagnostics.** The plan's `provenance.layout` records the layout hash, the land count, each derived block's rectangle, front and sides, and warnings. `destination build` writes `layout.json` with every piece of land, its bounding streets and coverage, what became of it and why (open, too narrow, too shallow, partly off a street, a split that could not happen), prints the warnings, and outlines derived blocks with dashes and open or skipped land in red in `plan.svg`. `destination layout <recipe>` prints the same as a table.
- **Budget.** The renderer batches each block separately, about twelve draw calls per block beside roughly twenty for the streets and plazas, so a recipe holds about four blocks inside the 70-call budget. The example derives three; a larger site is several recipes, as Studewood and Woodland Heights are north and south recipes.
- **Freeze.** `destination layout <recipe> --freeze` writes the derived blocks into the recipe as authored blocks and removes the layout, after checking that the frozen recipe places identical pieces, surfaces and solids. Use it when a neighborhood is approved and later edits should be by hand; the recipe hash changes, so lock again.

Against the shipped world (`preview/tests/city-kit-shipped-quarters.test.js`): eleven committed neighborhoods, 24 blocks, derive the same plan and lock hash from quarters as from their hand-authored blocks, with only the artistic fields carried over (style, ranges, names, `front`, `sides`, `court`). The two terrace studio rows were hand-placed half a metre off Terrace Lane; a quarter flush to the lane moves every shell that half metre, and six rear wings, half a metre deeper, gain a bay. The reproduction keeps each block's rectangle: ten of the eleven stop short of their land by design at district seams and site edges, so loosening the rectangles moves their walls; the saving is for new neighborhoods, where the kit's placement is accepted. Two rules make the shipped courts and edges derivable: hand-placed furniture may stand in a derived block's court (open ground), and a stated `front` on the site's own edge faces the neighbouring recipe's street, with a warning.


## Start from a geographic reference

`destination reference <world.json> --site w,s,e,n --id <id>` turns the mapped roads inside a site into a recipe skeleton. The source is any world export with a `roads` list of polylines in local metres: the bundled `preview/public/data/district.json`, a `river-oaks build` world, or a World Studio region as **Export JSON** writes it (`preview/public/data/sample-region.json` is one); nothing in it is changed. The site is in the source's frame; its rectangle is turned about its own centre with the grid.

- **Grid.** The dominant heading of the road inside the site, length-weighted and refined to a tenth of a degree, becomes the kit's east axis (`--rotation <deg>` fixes it). Runs of a road within `--tolerance` (5°) of an axis become streets; the run's mean offset is snapped to the half-metre module, its ends are clipped to the site, and the map's `width_m` is the lane (`--lane` when the map has none; `--sidewalk` 3.5 m). Pieces of one way that line up end to end are one street, named after the mapped name.
- **What is dropped, and why.** Bends and diagonals (with the worst angle), runs shorter than `--min-length` (20 m), corridors that would leave the site, kinds not in `--kinds`, and corridors that overlap a wider or longer street. Each is printed and recorded under `reference.dropped` with its mapped id and length, so a curved street is added by hand, not lost.
- **Buildings and names.** Mapped buildings inside the site are counted, not reproduced; the kit builds original architecture, and the skeleton's one quarter carries one placeholder name per derived block. Name the shops, add plazas, landmarks and furniture, choose quarters, then `build`.
- **Parcels drawn in Studio decide where blocks go.** When the source carries `parcels` with `bounds_m` (a World Studio region, or a candidate from the neighborhood compiler's `scripts/neighborhood.mjs build`), each parcel inside the site becomes a quarter of its own: its bounds turned into the kit frame, snapped to the module and clipped to the site, and an edge within a metre of a street's corridor edge is moved onto it so the parcel's blocks have frontage (the move is reported). Land outside the parcels stays open and is reported as a total, not built on; parcels outside the site or thinner than a bay are listed with the reason. `--parcels ignore` lays one quarter over the site instead. Each quarter faces its streets by the auto rule; set `front` per quarter where the drawing meant otherwise.
- **Provenance.** `reference` records the source file's name and SHA-256, CRS and origin, the site, rotation, tolerance and the mapped roads behind every street. It is part of the recipe, so the plan's recipe hash covers it.
- `--trees <m>` and `--lamps <m>` furnish every kept street by spacing (4 to 40 m), the same `trees`/`lamps` fields a hand-authored street carries: trees start half a spacing in, lamps a metre past half theirs and alternate sides. Without them a reference street is bare.

## From a drawing to a walkable neighborhood

The steps above chain. `config/destinations/garden-blocks-kit.json` is the worked example, and `preview/tests/city-kit-pipeline.test.js` reruns it from scratch:

```sh
node scripts/neighborhood.mjs build --recipe config/neighborhoods/garden-blocks.json --out .runtime/candidate
pnpm run destination reference .runtime/candidate/region.json --site=-8,-8,84,84 --style=garden-court --trees=8 --lamps=14 --id=garden-blocks-kit --title="Garden Blocks (kit)" --out=config/destinations/garden-blocks-kit.json
# name the shops in the recipe, then
pnpm run destination build config/destinations/garden-blocks-kit.json --lock
pnpm run destination check
```

The compiler's drawing (six roads, sixteen parcels) is deterministic. The reference step keeps the four streets and four parcels inside the site, snaps parcel edges to the street corridors, and writes the recipe with a placeholder name per block and a budget line. The build derives four blocks of 32 shells on the parcels, 56 street trees and 16 lamps, locks the plan and writes `studio-region.json`, which World Studio opens with **Open JSON** (the `city-kit-studio` journey does so in a browser). What the author typed: four site numbers, one style, two spacings and eight shop names. What the tools wrote: 80 numbers of streets, furnishing and quarters, 236 pieces. The hand-authored Nineteenth & Yale crossroads, the same size, types 70 numbers for its streets, plaza, blocks, landmark and furniture, each block rectangle kept flush to a street by hand.

## Open a plan in World Studio

`destination build` also writes `studio-region.json`: the plan as a schema-v1 creator region that World Studio opens with **Open JSON** and the server's region package compiler accepts. Streets are roads with their lanes (a lane under 6 m is a footway); every building shell is a box of its footprint and height, named by its stable piece id; street and plaza trees keep their crowns; the landmark, plazas and streets are places; the blocks, authored and derived, are parcels; the arrival stands on the widest street's sidewalk. The bounds pad the site by 2 m, because Studio keeps everything 1 m inside. It is a review view: walk it, mark places, measure; edits go back into the recipe as overrides by piece id, never into this file. Kit pieces under 4 m a side (rear wings) and context massings beyond the region are listed under `omitted` in the console summary, never widened. A plan Studio would refuse (more than 80 buildings, no street, fewer than four places) is refused here with the reason.

## Commands

```sh
pnpm run destination build config/destinations/bayou-market-commons.json   # plan.json, plan.svg, report.json, studio-region.json under .runtime/destinations/<id>-<seed>/
pnpm run destination build config/destinations/nineteenth-and-yale.json --seed 78
pnpm run destination build config/destinations/bayou-market-commons.json --lock   # after review: update the committed lock
pnpm run destination check                                                       # every committed lock still reproduces
pnpm run destination override config/destinations/bayou-market-commons.json bayou-market-commons/garden-court/parcel-2 --set roof='"stepped"' --note "Art pass"
pnpm run destination preview config/destinations/bayou-market-commons.json        # how to open it in-engine
pnpm run destination layout config/destinations/layout-grid-example.json          # the land each quarter claims and the blocks it derives; --freeze writes them as authored blocks
pnpm run destination reference preview/public/data/district.json --site=-2910,-1400,-2760,-1280 --id district-crop   # a recipe skeleton from the mapped roads inside a site
pnpm run destination reference data/generated/neighborhoods/garden-001/region.json --site=-96,-96,8,8 --id garden-sw   # a Studio compiler candidate: its parcels become quarters
```

`build` exits non-zero when a plan exceeds a budget, leaves any walkable sample unconnected, or makes a lantern unreachable. The SVG shows blocks by wall material, faced frontages, solids, tree crowns, lanterns, the landmark and every manually edited piece.

## Production workflow for the next neighborhood

1. Copy a recipe, or start one with `destination reference` from the mapped roads of the place that inspires it; choose a site inside an authored manifest location, and lay out streets, plazas and the authored items that matter: landmark, gathering places and activity points. Describe the blocks as quarters in a `layout` (above) and let the streets place them; type a block by hand only where its rectangle must differ from the land its streets leave.
2. Run `destination build`, open the SVG, open `studio-region.json` in World Studio (**Open JSON**) to walk the massing and mark places, then open the in-engine preview at pedestrian height (`city-kit.html?recipe=…&view=street`). Try a few seeds and keep the best one.
3. Fix art direction with overrides and additions, not by editing output. Rebuild, review, then `--lock`.
4. Compose it into a manifest location with real walking ground (see `shared/commons-destination.js` and `shared/bayou-heights.js`), then add the movement and connectivity tests and a browser journey. When a recipe's ground joins a neighbouring plan, name the seam in `ENTRIES` in `scripts/destination.mjs` so its own connectivity check includes it.

The second recipe showed which generator features were needed. Making a crossroads required north-running streets, east- and west-facing blocks (assembled in an x/y-swapped frame and mapped back exactly), clipped intersections and unsigned overflow shops. Those features were added for that recipe, and the Commons recipe did not change.

## Limits

The kit has rectangular, axis-aligned footprints only. Curved streets, angled blocks and terrain-following blocks would need further generator work. Buildings are exterior shells without interiors. Signs render on a shared canvas atlas, so text needs a DOM canvas; headless builds skip text and tree models. Automated screenshots are not human visual approval, and the budgets are authored estimates checked against draw-call counts, not GPU profiles on target devices.
