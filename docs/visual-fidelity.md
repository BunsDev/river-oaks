# District visual-fidelity evidence

## Current art direction

The September 20 district update deliberately combines real shop names and mapped footprints with TypeSafe fantasy styling: neutral white and graphite, pink glass lanterns, silver arches, and floating lights along internal lanes. The neighborhood browser scene has been removed. Earlier photographic reference work below informs recognizable details; exact reconstruction is no longer the visual target.


This pass replaces the browser's capsule figures with clothed CC0 human meshes and corrects the most visible façade mismatch. It is progress toward the photorealistic environment, not completion of the UE5 deliverable.

## Reference and interpretation

The [architect's district project](https://www.gensler.com/projects/river-oaks-district) and its public façade photograph show pale stone, deep frames, glazed storefronts and a landscaped street. The photograph was inspected as a reference and is not redistributed as a texture or project asset.

The renderer retains mapped OSM footprint rings and roof extents. Ground-floor walls now have recessed openings with transparent glazing, original display alcoves and warm display strips. Nearby mapped tenant categories select restaurant tables and chairs or retail display forms; jewelry appears only for jewelry and fashion-accessory categories. Entry markers reserve gaps in the procedural pier grid, preventing a column from appearing through a doorway. Cut-stone shading uses subdued CC0 grain and measured-size joints instead of the previous rough masonry appearance. Walking shadows use a tighter camera-following region and bounded depth range to improve contact detail.

The [Dior boutique architect's project photos](https://aga-nyc.com/dior-river-oaks-tx-1/) show a pale, illuminated sign plane without the preview's generic projecting awning. The Dior destination now uses a lit sign and omits that awning. Its frontage dimensions, display contents, and current condition remain unverified.

Storefront arrival now aims the walking camera slightly upward so the entry and sign appear together in the first view.

The venue [reports Cartier's remodel](https://www.riveroaksdistrict.com/explore/cartier-vancleef-opening), and [Cartier's store page](https://stores.cartier.com/en_us/united-states/tx/houston/4444-westheimer-road) shows a light storefront with warm metal glazing. The preview now distinguishes its sign and entry frame from the generic dark frontage. The lettering is a drawn approximation, not a licensed logo or a measured reconstruction.

The venue's [2025 Van Cleef & Arpels release](https://www.riveroaksdistrict.com/press/van-cleef-arpels-expands-in-houstons-river-oaks-district) identifies three-dimensional ceramic diamonds and a warm beige gradient as the relocated boutique's signature facade. The preview adds original faceted ceramic geometry above that mapped destination and removes the generic awning. Tile count, spacing, extent and colors are approximations until measured facade references are available.

[Harry Winston's Houston salon photograph](https://www.harrywinston.com/en/locations/north-america/united-states/houston/harry-winston-houston) shows a stone arch and navy awnings; the renderer now gives its mapped entrance those cues. The [district's Steak 48 image](https://www.riveroaksdistrict.com/) shows a dark overhang with wood soffit and greenery, and [Gensler's Le Colonial district view](https://www.gensler.com/projects/river-oaks-district) shows a navy awning and planted outdoor edge. The renderer adds simplified versions at those destinations. Their dimensions, planting, furnishing and storefront boundaries are not surveyed.

The [current district shop](https://www.riveroaksdistrict.com/shop), [dining](https://www.riveroaksdistrict.com/dine), and [beauty and wellness](https://www.riveroaksdistrict.com/beauty-wellness) lists corroborate the mapped tenant names, with abbreviated map labels for some venues. They do not validate the OSM-derived position of each frontage; Van Cleef & Arpels in particular reports a relocation.

These designs, room depths, materials and display contents are interpretations. Doors now open into walk-in rooms (see Boutique interiors below); outside those rooms the walking collision model still uses full building footprints. Actual shop interiors, exact tenant frontages and present-day entrances require licensed/site reference work. The district's OSM and DEM import receipts do not establish survey or photographic accuracy.

## Boutique interiors

The September 20 interiors pass replaces the 2.7 m display alcoves with walk-in rooms behind all 30 mapped destinations. `preview/src/store-rooms.js` plans each room from the OSM footprint: it snaps the frontage to the renderer's ~3.2 m bay grid around the mapped entrance, keeps every corner inside the footprint ring, refuses to swallow a neighbour's door, and falls back to a symmetric span when no bay span fits. Rooms are 3–14 m wide and 4.5–9 m deep; two narrow one-bay "jewel box" rooms exist where doors sit close together.

Eleven category layouts furnish the rooms with original procedural fixtures: garment rails with shoulder-out garments and folded stacks, lit shelving with bags, shoes or perfume bottles, backlit jewelry niches and glass vitrines, a back bar with bottle rows and pendant lamps, salon stations with mirrors and basins, a gelato case with flavour tubs, poster light boxes and a concession counter, framed generated canvases and sculpture plinths, and eyewear walls. Floors use generated marble, staggered oak or walnut planks, terrazzo or carpet; walls are tinted plaster with fluted millwork. The earlier generated back-wall artwork survives as a framed feature wall at the rear of each room. No fixture is a product replica and no brand mark appears inside.

`preview/src/store-people.js` places 194 posed figures: sales associates behind counters, greeters, browsing and seated guests, and matte mannequins in fashion windows, all cloned from the six CC0 residents with role-based tints. Poses use joint axes measured on the shipped rigs (`output/playwright/pose-axes.png`); figures idle within 16 m, skip the shadow pass, and are culled per room beyond 32 m. They are not conversational residents and carry no identity.

Walking now enters rooms through the mapped door: `preview/src/walking.js` treats rooms as free pockets inside footprints, blocks the glazing beside the door, keeps the interior floor level with the pavement, and uses fixture footprints as obstacles. Each entrance has a single glass pivot leaf that swings inward when the visitor is within about 2.8 m, so the closed door still reflects the street. Bays that a room covers on a non-fronting edge become solid stone rather than glass, and near-zero slivers are dropped so no degenerate geometry reaches the bloom pass. A pool of eight warm point lights follows the visitor into the nearest boutique; walls and ceilings carry a faint self-illumination so shadowed faces never read as unlit.

The interface gains **Step inside** beside **Arrive at storefront**, a one-line interior summary per destination, an **F** key and HUD button that steps through the nearest door in either direction, an "Inside …" HUD state, and a **Boutique interiors & staff** layer toggle.

`preview/tests/store-rooms.test.js` checks that every room stays inside its footprint, never overlaps another, places all of its people, and that the walking model enters through the doorway, is stopped by glass and party walls, and keeps the floor within 0.3 m of the pavement. `preview/e2e/store-interiors.js` walks into five rooms in Chrome, confirms bounded movement and the F round trip, and records renderer counters and a frame sample in [the interiors receipt](../data/reports/store-interiors-e2e.json). Interior instances are batched per building and material so the renderer can cull them by bounds; even so, furnishing every room adds roughly 400 draw calls and up to a million triangles near the visitor, and the headless Chrome sample sits at the 30 fps boundary that the unfurnished street already approaches on this Mac. Target-hardware performance remains unmeasured. These are imagined interiors: tenant layouts, staffing, merchandise and finishes are not surveyed.

## Streetscape, upper storeys and light

The September 20 ultra-realism pass adds the layers a pedestrian reads first. Upper storeys carry punched windows with projecting limestone surrounds, sills and reveals, string courses and a stepped cornice, all derived from the mapped footprint and estimated height rather than from photographs. Shopfronts have a stone bulkhead, bronze glazing frames, soffit and ceiling downlights, thresholds, mats, planters and sloped awnings. Kerbs, lamp columns, planters, litter bins and mulched tree pits follow the mapped lane centrelines and the observed trunk positions; a placement test keeps them out of footprints and junctions. A GTAO ambient-occlusion pass, a coupled dusk atmosphere and a fogged context ground complete the picture. None of this is surveyed street furniture; see [the design-goal record](immersive-design-goal.md#pass-4-evidence) for the evidence and limits.

## Residents

Six MakeHuman/MPFB variants provide faces, hands, hair, clothing, shoes and independent skeletons for all 24 encounter identities. The neutral modeling pose is converted into a relaxed standing pose during export. The runtime adds breathing, conversational head motion, an immediate arm gesture and a procedural stride tied to actual distance traveled. [Resident life](resident-life.md) documents district navigation, weather reactions and reduced-motion controls.

The six cached templates total approximately 9.5 MiB; individual models have 27–36 thousand triangles and embedded WebP textures. Scene disposal releases each clone's skeleton resources and materials, while the bounded source cache can serve the next scene. A distance gate hides full meshes beyond 120 meters except the selected resident. This does not provide production character LODs or a 500-person rendering benchmark.

See [asset license and reproducible build](../preview/public/assets/characters/README.md). Public-figure encounters retain explicit fictional-portrayal labels and use these generic assets, not reconstructed likenesses.

## Verification

`preview/tests/avatars.test.js` checks every shipped profile's hash, skeleton, skinning attributes, embedded textures and asset/triangle budgets. The broader suite continues to cover walking collision, conversation memory, stale reaction rejection, finite intervention resources and voice cancellation.

`preview/e2e/visual-fidelity.js` checks 24 successful character loads, conversations, a native UHD drawing buffer, WebGL/browser errors and bounded resources across repeated scene changes after cache warmup. It saves the actual renderer counters and a short animation-frame sample in [the browser receipt](../data/reports/visual-fidelity-e2e.json). This is local Chrome evidence, not a GPU trace, a whole-district worst-case benchmark or UE5 validation.

The original larger-neighborhood verification report remains separate and still fails its generated-canopy comparison. Full-neighborhood observed canopy, photographic storefront reconstruction, production navigation/animation/audio, live Jev throughput and target-hardware UE5 execution remain outstanding.

The district now has [observed 2018 LiDAR vegetation](vegetation.md); its independent historical canopy comparison fails. This adds source-grounded vegetation without satisfying the full-neighborhood canopy or current survey gates.
