# TypeSafe Place Residential Heights

TypeSafe Place is an elevated residential neighborhood directly east of [Woodland Heights](woodland-heights.md), built from Val's concept art "TypeSafe Place Residential Heights — elevated living in a connected neighborhood" (2026-10-28). Twentieth and Eighteenth Streets continue east from the ends of Woodland's. Place Avenue, a tree-lined walking boulevard, runs the strip's length between two 20-storey towers, garden-roofed residences and shop rows, and the Neighborhood Green holds a pink ribbon sculpture. All five neighborhoods are assembled from the [city kit](../../city-kit.md).

It is the opt-in content revision `typesafe-place-1`, composed as Gardens, then Commons, then [Bayou Heights](bayou-heights.md), then [Studewood](studewood.md), then the [Bayou Terraces](bayou-terraces.md), then Woodland Heights, then TypeSafe Place. Select it with `RIVER_OAKS_DISTRICT_REVISION=typesafe-place-1`. It takes the world past 3×. Every earlier revision keeps its geometry and world fingerprint, and Woodland Heights is the rollback for TypeSafe Place.

## Concept to world

| Concept panel | In the world |
| --- | --- |
| Luxury Living | A 20-storey residential tower (71.1 m) west of Place Avenue, with a balcony slab and glass rail on every storey on all four faces and a gallery lobby |
| Penthouse Row | A 20-storey tower east of the avenue whose top two storeys set back 2.5 m behind glass-railed, planted terraces under a pink light band |
| Sky Gardens | Three 9 to 12-storey balconied residences with planted roofs: lawn, raised beds and a rose-gold pergola strung with pink lights |
| Everyday Retail | Two and three-storey shop rows along Twentieth and Eighteenth Streets, in pearl stone with blush awnings and garden roofs |
| Neighborhood Green | Four lawns round a looped pink ribbon on a pearl stone plinth, with benches facing it, tree rows and café sets along Eighteenth Street |
| Walkable Neighborhoods | Place Avenue, an 18 m tree-lined boulevard joining both cross streets, and passages from every court and garden walk to a street |

The patterns are a dense, walkable residential district, with no specific building reproduced. All names and lettering are original; the shop names nod to TypeScript (Strict Mode Coffee, Promise Kept Books, Readonly Records).

## Layout

Coordinates use the Commons recipe frame: x is metres east of the District edge, y is metres north of the Market Street centreline (north −1335). Each neighborhood is a locked recipe in `config/destinations/` (seed 2026), generated from one layout so the five agree at their joins.

| Neighborhood | Extent | Contents |
| --- | --- | --- |
| `typesafe-place-north` | x 552.5–619, y 0–117.5 | Luxury Living and its courts, the shop row on Twentieth's south side, and Twentieth Street west of the avenue |
| `typesafe-place-penthouse` | x 619–702.5, y 0–117.5 | Place Avenue north, Penthouse Row, two Sky Gardens residences, a shop row, and Twentieth Street from the avenue east |
| `typesafe-place-uptown` | y 117.5–167.5 | Place Avenue uptown, shop rows on Twentieth's north side, three garden-roofed residences and the garden walks behind the shops |
| `typesafe-place-green` | x 552.5–619, y −122.5 to 5 | The Neighborhood Green and ribbon, the shop row on Eighteenth's south side, two residences and Eighteenth Street west of the avenue |
| `typesafe-place-south` | x 619–702.5, y −122.5 to 5 | Place Avenue south, Sky Gardens on the green, a shop row, a residence and Eighteenth Street from the avenue east |

Each neighborhood is within the per-neighborhood budget of 260,000 authored triangles, 70 draw calls, 28 materials and 160 solids. The towers and residences are hand-placed `additions`, which share one render batch per neighborhood. The neighborhoods split at the avenue's west edge, so each tower streams on its own (see Streaming).

### Kit additions

- **Materials:** pearl stone, warm concrete, rose gold, blush canvas, a glass rail, lit glass, planting, and two pinks (`neon-rose`, `ribbon-rose`).
- **Styles:** `place-tower`, `place-residence` and `place-retail`.
- **Windows:** `balcony` windows: one slab, glass band and rail per storey along the whole face, full-height piers, and some homes lit. A run spans the face, so a 20-storey tower costs a few hundred boxes.
- **Roofs:** `roof/garden` (nothing over 1.9 m, inside the 3.1 m roof flight margin) and `roof/crown` (the top two storeys set back).
- **Landmarks:** `landmark/ribbon`, a 4 m solid footprint, 8.6 m tall.

## Movement, authority and the manifest

TypeSafe Place extends the composed Woodland layout in place (`shared/typesafe-place.js`), so the browser and the server read the same surfaces and solids. Earlier surfaces and plans keep their indices, and TypeSafe's are appended after them. The composed bounds and `bounds_m` grow 150 m east; detaching restores Woodland byte for byte.

- **Seams.** Only the two cross streets, plus a 2 m ground-only seam at each, reach back into Woodland's location. Three more ground-only seams join TypeSafe's own neighborhoods: each cross street where it meets the avenue's crossing, and the avenue across Twentieth's north sidewalk.
- **Woodland's street ends.** Woodland closed the east ends of its cross streets with hedges, because nothing lay beyond. In this revision only, the two hedges are suppressed from Woodland's plans and their solids and collision rings leave the composed world (`WOODLAND_OPENINGS`). Woodland's recipes, locks and own revision are unchanged, and its hedged green edge stays closed.
- **Manifest.** The authored `typesafe-place` location runs from Woodland's east edge (x 552.888) 150 m east, over the District's whole north/south span. Its entry is Twentieth Street at its west edge, and it is adjacent to Woodland Heights only.
- **Flight.** The flight ceiling now counts composed-district roofs. It is 80.5 m above ground in this revision, so Jevica flies over Penthouse Row's crown; every earlier revision keeps 41.09 m.
- **Creations.** These stay inside the District's build bounds, so TypeSafe Place refuses durable creations, as Woodland does.

## Streaming

Heights streams TypeSafe Place as five more of its neighborhoods (`preview/src/heights-stream.js`), under the unchanged 16 MiB retained-geometry ceiling.

- **Budgets.** Measured headless, the neighborhoods own 2.12 (north), 3.02 (penthouse), 2.54 (uptown), 2.40 (green) and 2.40 MiB (south); their estimates are 2.25, 3.25, 2.7, 2.55 and 2.6 MiB. The view box of each neighborhood reaches over its tallest building.
- **Why five.** As first drawn in three neighborhoods, the towers' half alone measured 8.6 MiB, then 5.3 MiB after the balconies were drawn in whole-face runs. Beside a shared part estimated at 9.77 MiB, either tower neighborhood would then have displaced everything else. Split at the avenue, a resident set holds three or four parts: from the ribbon, Luxury Living stays in view across the green; on Place Avenue, both towers are resident.
- **Gate.** As everywhere in Heights, a step from presented ground into a neighborhood still loading waits for it. Presence follows each neighborhood's site, so every court and garden walk has a passage to a street within its own site. A test flood-fills TypeSafe with the Heights module failing and with the north, penthouse and green neighborhoods failing, and requires every free cell to walk back to Woodland.
- **Ceiling.** Not every part fits together. From high over the strip, only the nearest three or four parts are resident, and the towers do not show from Woodland's far side. Raising the ceiling is Val's decision; this revision does not change it.

## Checkpoints and rollback

`server/district-typesafe-checkpoint-migration.js` runs first in the Redis recovery chain.

- **Forward:** a Woodland checkpoint, or anything the Woodland migration recovers, restores unchanged into TypeSafe Place.
- **Back to Woodland:** everyone east of Woodland's walkable ground (its cross streets end at x 552.5, less the 0.35 m walking radius), or airborne where Woodland cannot fly them, moves to free Woodland street ground at the east end of the nearer cross street. That includes anyone above Woodland's 41.09 m ceiling anywhere. Further back chains through the Woodland migration. The Redis district epoch still fences writers.

## Verification

- `preview/tests/typesafe-place.test.js`:
  - exact compose and detach, and registration;
  - locks and budgets, and the twenty-storey towers;
  - seams and Woodland's opened street ends;
  - connectivity, and the real walking controller across Place Avenue;
  - closed buildings and solids, and flight over every roof under the raised ceiling;
  - labels, meshes and measured bytes within their estimates;
  - stream residency, and the restored-player flood fill.
- `server/tests/typesafe-place.test.js`:
  - authoritative walking in and out, and refused building land;
  - forward migration from Woodland, the Terraces and Gardens;
  - rollback moves, including above Woodland's ceiling;
  - flying over Penthouse Row but not down into it;
  - Redis epoch fencing.
- `node preview/audit/world-expansion-footprint.js --reachable` measures 165,700 m² of reachable ground at 1 m, 23,668 m² more than Woodland and 3.56× the District (see [world expansion](../../world-expansion.md)).
- No browser journey covers TypeSafe Place yet. Screenshots from the dev town on `typesafe-place-1` are review evidence, not acceptance.
