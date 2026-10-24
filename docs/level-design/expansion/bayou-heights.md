# Bayou Heights

Bayou Heights is the second connected district beyond the original District (#586 continuation, #638 lane 3). It lies on the east bank of the bayou that edges [Bayou Market Commons](bayou-market-commons.md). You reach it on foot over the Lantern Footbridge, which continues Market Street past the Bayou Lantern. Every neighborhood is assembled from the [city kit](../../city-kit.md).

It is the opt-in content revision `bayou-heights-1`, composed as Gardens, then Commons, then Heights. Select it with `RIVER_OAKS_DISTRICT_REVISION=bayou-heights-1`. The garage default, the Gardens revision and `east-garden-commons-market-1` keep their geometry and world fingerprints, and the Commons revision is the rollback for Heights.

## Place and inspiration

The district draws on Houston Heights patterns but reproduces no specific building:
- a greenway trail along the water (Buffalo Bayou);
- a neighborhood green with a bandstand;
- an icehouse patio;
- the Nineteenth Street and Yale Street crossroads;
- a boulevard with a walking esplanade (Heights Boulevard).

All buildings, names and lettering are original to TypeSafe Place.

## Layout

Coordinates use the Commons recipe frame: x is metres east of the District edge, y is metres north of the Market Street centreline (north −1335). Each area is a locked recipe in `config/destinations/`.

| Area | Recipe (seed) | Extent | Contents |
| --- | --- | --- | --- |
| Lantern Footbridge | `bayou-greenway` (1925) | x 115–152, 6 m wide | The paved deck over the bayou, a central pier, teal railings and four brass lamps. The Commons railing and bayou part for the bridge in this revision only. |
| Bayou Greenway | `bayou-greenway`, `yale-icehouse` (1926) | x 152–161, y −118 to 163 | A shared trail along the east bank, with oaks, lamps, benches facing the water and a bike rack at the bridge |
| Heights Green | `bayou-greenway` | x 160–249.5, y 6.5–163 | A great lawn ringed by benches and edge oaks, a Saturday market of four stalls (Gulf Coast Honey, Bayou Tamales, Prairie Peaches, Heights Kolaches), a picnic grove and the Heights Bandstand |
| Nineteenth Street | `bayou-greenway`, then the crossroads, then `heights-boulevard-north` (1928) | y −7.5 to 7.5 | The main street east from the bridge to Heights Hall |
| Icehouse patio | `yale-icehouse` | Court x 190–212, y −25.5 to −6.5 | The Heights Icehouse, picnic sets, planters and the two-chair game table, with storefront rows on both sides |
| Community garden | `yale-icehouse` | x 161–249.5, y −118 to −76.5 | Twenty-four raised beds, benches and lamps south of Eighteenth Street |
| Nineteenth & Yale | `nineteenth-and-yale` (77) | x 250–365, y −64 to 64 | The promoted preview crossroads, placed by anchor with its geometry unchanged: storefronts, sawtooth workshops and the south-east garden court |
| Yale Street and Twentieth Street | `yale-street-north` (1927), `yale-street-south` (1930) | x 250–364 | Six storefront blocks, and Twentieth Street Square, which carries Heights Green through to Yale Street |
| Heights Boulevard | `heights-boulevard-north`, `heights-boulevard-south` (1929) | x 364–422.5 | Two carriageways either side of an esplanade with lawn panels, oaks and benches, and frontage shops |
| Heights Hall | authored | x 406–420.5, y −7.5 to 7.5 | A brick hall with a 26.5 m clock tower that closes the view down Nineteenth Street |

The seven plans hold 1,321 pieces, 176 building shells and 521 solids, at about 783,488 authored triangles in total. Each plan stays within the kit budgets: at most 260,000 triangles, 28 materials, 160 solids and 70 draw calls per neighborhood. The client builds them in 21–62 meshes each, before trees and planting.

## Gathering and activities

- **Icehouse table.** A two-chair table (`chess-icehouse`) under the existing authoritative table-game rules: chess, checkers, Connect Four, reversi and morris. Sitting, invitations, moves, checkpoints and departure rules are the existing server authority.
- **Heights Bandstand.** The landmark on the green. Its stage is solid, so it blocks bodies and low flight, as the water tower's legs do.
- **Places to linger.** The lawn and greenway benches, the picnic grove, the market stalls, the icehouse patio, the square's café tables and the esplanade benches.
- **Arrival.** Crossing the footbridge announces Bayou Heights in the walking notice. Crossing back announces Bayou Market Commons.

## Movement, authority and the manifest

Heights extends the composed Commons layout in place (`shared/bayou-heights.js`). The browser, the server and the walking, ground, collision, flight and server-bounds paths therefore read the same surfaces and solids, with no new movement code. Commons surfaces and solids keep their indices, and the Heights entries are appended after them. `layout.heights` records:
- the placed plans;
- the base revision;
- the start indices;
- the footbridge, bandstand, Hall and table.

Creations stay inside the District's build bounds, so Heights refuses durable creations as the Commons does.

The world manifest partitions the original `east-garden-reserve` into:
- an authored `bayou-heights` location, x 115–422.5, from the Commons edge to −2243.836;
- a smaller reserved `east-garden-reserve`.

Their union is the original reserve exactly, so nothing grows or overlaps, and adjacency stays reciprocal. Loading checks the location's revision, bounds, identity transform and entry against the layout.

## Checkpoints and rollback

`server/district-heights-checkpoint-migration.js` runs first in the Redis recovery chain.

- **Forward.** A Commons checkpoint, or anything the Commons migration recovers (Gardens, garage), restores unchanged into Heights.
- **Back to the Commons.**
  - Players at the icehouse table stand up, following ordinary departure rules, and its game ends. Other tables' games remain.
  - Anyone east of the footbridge, or airborne where the Commons cannot fly them, moves to free Commons plaza ground next to the bridge.
- **Back to Gardens.** The migration chains through the Commons.

The district epoch still fences writers.

## Evidence and remaining acceptance

- **Focused tests.** `preview/tests/bayou-heights.test.js` and `server/tests/bayou-heights.test.js`. They cover:
  - composition parity and exact detach;
  - the manifest partition;
  - locks;
  - a no-island flood fill;
  - the real walking controller from the District to Heights Hall and back;
  - refusals for water, building land, the reserve and creations;
  - the icehouse game;
  - every migration direction with standing, airborne and seated occupants;
  - Redis epoch fencing, which runs only with `REDIS_URL`.
- **Browser journey.** `pnpm run test:experience bayou-heights`. Two clients walk from both District arrivals over the bridge, play at the icehouse table, reconnect in Heights and walk home.
- **Records.** Measurements, captures and results for the exact revision tested are recorded in the [task ledger](../../superpowers/plans/2026-10-24-next-district-586.md).

Human visual approval, physical-device performance, hosted multiplayer, resident routing across locations, streaming and unload (#623), and native Unreal equivalence remain separate acceptance.
