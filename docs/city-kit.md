# City kit and neighborhood assembly

The city kit (#584) and the deterministic assembly pipeline (#585) build new neighborhoods out of one shared set of streets, sidewalks, intersections, building shells, storefronts, roofs, glazing, landscaping and street furniture. The first destination built with them is [Bayou Market Commons](level-design/expansion/bayou-market-commons.md) (#586). The same kit also assembles a second, deliberately different neighborhood, `nineteenth-and-yale`, which is preview-only and is not registered as playable land.

The kit extends existing systems rather than adding a city engine. Movement uses the Commons walking contract (`shared/east-garden-commons-layout.js`). Surfaces use the District PBR maps (`preview/src/materials.js`). Trees use the District's tree models and their level-of-detail and shadow batching (`buildMatureTrees`). Planters use the District planting palette (`buildPlanterPlanting`).

## Files

| Concern | File |
| --- | --- |
| Pieces, styles, materials, conventions, budgets | `shared/city-kit/catalog.js` |
| Recipe validation, seeded assembly, overrides, provenance, connectivity | `shared/city-kit/assemble.js` |
| Three.js rendering of a plan | `preview/src/city-kit/render.js` |
| Recipes, locks | `config/destinations/*.json`, `*.lock.json` |
| CLI | `scripts/destination.mjs` (`pnpm run destination …`) |
| In-engine preview of any recipe | `preview/e2e/fixtures/city-kit.html?recipe=<id>&seed=<n>&view=<view>` |
| Pedestrian-scale screenshot review | `preview/e2e/city-kit-review.js` (shared browser lock) |
| Tests | `preview/tests/city-kit.test.js`, `preview/tests/bayou-market-commons.test.js` |

## Conventions

- **Units and axes.** Recipes use site-local metres: x runs east of the site anchor and y runs north of it. Placement translates a plan into world east/north (`placePlan`). Rendering uses east, up and negative north, as the rest of the client does. Recipes snap to a 0.5 m module. The ground storey is 4.6 m and upper storeys are 3.5 m. Bays are 4.5–7.5 m wide.
- **Naming.** Every placed piece has a stable ID of the form `<neighborhood>/<group>/<role>-<n>`, such as `bayou-market-commons/market-row/parcel-2` or `bayou-market-commons/market-street/tree-s-3`. Overrides, additions, collision solids and render meshes all use these IDs.
- **Collision.** Assembly emits walkable rectangles: one for each curbless street (lane plus both sidewalks), one for each court and one for each plaza. Walkable rectangles are eroded by the 0.35 m walking radius, so neighbouring ground must overlap rather than merely touch. A shared edge alone is a wall. Courts overlap their sidewalk by a metre for this reason. Building shells stand outside walkable ground, so a facade is the walkable edge and needs no collision ring. Trees, lamps, bollards, benches, cafe sets, market stalls, planters, hedges, lanterns and water-tower legs are solids inside walkable ground. They block bodies and low flight. Assembly refuses any solid that is not fully inside walkable ground, so a seed cannot bury furniture inside a shop.
- **Materials.** The catalog defines 25 material slots. Most tint the District PBR sets (asphalt, brick, grass, pavement, paver, stone). Colours follow the established ivory, teal, brass, rose and mint language (`retro-palette.js`).
- **Level of detail.** Static geometry merges into one mesh per material per block. Facade detail (glazing, mullions, sills, canopies, awnings) is a separate batch that hides beyond 120 m. Trees use the District LOD distances of 22 m and 60 m.
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

## Commands

```sh
pnpm run destination build config/destinations/bayou-market-commons.json   # plan.json, plan.svg, report.json under .runtime/destinations/<id>-<seed>/
pnpm run destination build config/destinations/nineteenth-and-yale.json --seed 78
pnpm run destination build config/destinations/bayou-market-commons.json --lock   # after review: update the committed lock
pnpm run destination check                                                       # every committed lock still reproduces
pnpm run destination override config/destinations/bayou-market-commons.json bayou-market-commons/garden-court/parcel-2 --set roof='"stepped"' --note "Art pass"
pnpm run destination preview config/destinations/bayou-market-commons.json        # how to open it in-engine
```

`build` exits non-zero when a plan exceeds a budget, leaves any walkable sample unconnected, or makes a lantern unreachable. The SVG shows blocks by wall material, faced frontages, solids, tree crowns, lanterns, the landmark and every manually edited piece.

## Production workflow for the next neighborhood

1. Copy a recipe, choose a site inside an authored manifest location, and lay out streets, plazas and blocks with the authored items that matter: landmark, gathering places and activity points.
2. Run `destination build`, open the SVG, then open the in-engine preview at pedestrian height (`city-kit.html?recipe=…&view=street`). Try a few seeds and keep the best one.
3. Fix art direction with overrides and additions, not by editing output. Rebuild, review, then `--lock`.
4. Compose it into a manifest location with real walking ground (see `shared/commons-destination.js`), then add the movement and connectivity tests and a browser journey.

The second recipe showed which generator features were needed. Making a crossroads required north-running streets, east- and west-facing blocks (assembled in an x/y-swapped frame and mapped back exactly), clipped intersections and unsigned overflow shops. Those features were added for that recipe, and the Commons recipe did not change.

## Limits

The kit has rectangular, axis-aligned footprints only. Curved streets, angled blocks and terrain-following blocks would need further generator work. Buildings are exterior shells without interiors. Signs render on a shared canvas atlas, so text needs a DOM canvas; headless builds skip text and tree models. Automated screenshots are not human visual approval, and the budgets are authored estimates checked against draw-call counts, not GPU profiles on target devices.
