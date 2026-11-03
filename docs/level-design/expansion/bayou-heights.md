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

The seven plans hold 1,321 pieces, 176 building shells and 521 solids, at about 783,488 authored triangles in total. Each plan stays within the kit budgets: at most 260,000 triangles, 28 materials, 160 solids and 70 draw calls per neighborhood. The client builds each in 21–62 meshes. Their 355 street trees and 329 planted beds draw once for all of Heights (see [Streaming](#streaming)).

## Gathering and activities

- **Icehouse table.** A two-chair table (`chess-icehouse`) under the existing authoritative table-game rules: chess, checkers, Connect Four, reversi and morris. Sitting, invitations, moves, checkpoints and departure rules are the existing server authority.
- **Heights Bandstand.** The landmark on the green. Its stage is solid, so it blocks bodies and low flight, as the water tower's legs do.
- **Places to linger.** The lawn and greenway benches, the picnic grove, the market stalls, the icehouse patio, the square's café tables and the esplanade benches.
- **Arrival.** The location label names Bayou Heights across the footbridge, so the walking notice says "Entering Bayou Heights". Crossing back says "Entering Bayou Market Commons". The Commons Lantern Walk status chip shows only on the Commons side of the bridge.

## Movement, authority and the manifest

Heights extends the composed Commons layout in place (`shared/bayou-heights.js`). The browser, the server and the walking, ground, collision, flight and server-bounds paths therefore read the same surfaces and solids, with no new movement code. Commons surfaces and solids keep their indices, and the Heights entries are appended after them. `layout.heights` records:
- the placed plans;
- the base revision;
- the start indices;
- the footbridge, bandstand, Hall and table;
- `bounds`, the Heights location;
- `commonsBounds`, the composed layout's bounds before Heights (District and Commons together). It is not the Commons location; that runs from `edge` to the Commons plaza's east side, which is `bounds[0]`.

Creations stay inside the District's build bounds, so Heights refuses durable creations as the Commons does.

The world manifest partitions the original `east-garden-reserve` into:
- an authored `bayou-heights` location, x 115–422.5, from the Commons edge to −2243.836;
- a smaller reserved `east-garden-reserve`.

Their union is the original reserve exactly, so nothing grows or overlaps, and adjacency stays reciprocal. Loading checks the location's revision, bounds, identity transform and entry against the layout.

## Streaming

The client streams Heights as its own location (`preview/src/heights-stream.js`, built on the #623 chunk stream), only for `bayou-heights-1`. The Commons streams separately, presented with its bayou opened for the bridge. As Heights presents it, the Commons' planted beds draw within 60 m, as Heights' own do; the Commons revision still draws them at every distance. Seen across the bayou from deep in Heights, the Commons' beds were about a million triangles a frame.

- **Parts.** Heights streams in eight parts:
  - Each of the seven neighborhoods, bounded by its plan site.
  - One shared part over the whole location: the footbridge, bandstand and Heights Hall, plus every street tree and planted bed. Built once, the oak models (3.13 MiB for the three detail levels) and the planting models are cloned once rather than once per neighborhood.
- **Ceiling.** The Commons' 16 MiB retained-geometry ceiling applies unchanged.
  - Headless, the neighborhoods own 1.84–3.14 MiB each (18.20 MiB in all) with the luxury kit pieces of #641; before it, they owned 1.29–2.49 MiB (12.95 MiB). Each chunk's estimate is its measurement plus 10 %, rounded up to 0.05 MiB.
  - The shared part holds the oak models, about 2.4 MiB of planting, and the instances.
  - Heights is therefore larger than one ceiling. Deep inside it, neighborhoods the camera cannot see give way to those it can. At Nineteenth and Yale looking north, the shared part, the crossroads, Yale Street North and Heights Boulevard South fit; the greenway, the icehouse and the north boulevard wait for room.
  - The shared part is kept first, then the neighborhood underfoot, then those in view within 150 m. Among those in view, the one nearest the centre of the view ranks first: each radian off the view axis counts as 10 m.
  - A neighborhood in view keeps its place, and the angle it was seen at, for 5 s after the camera turns away. One already loaded outranks one that isn't. So the small turns of walking do not rebuild neighborhoods.
  - Room left over can hold a neighborhood behind the camera, but never room that one still absent could take in its place.
  - Holding all of Heights at once would need a larger ceiling for this location, which is a separate decision.
- **Loading.** Each part loads within 85 m of the player or of a camera that sees it, and unloads beyond 110 m. Batches draw only while their neighborhood is attached: trees within 120 m, the kit's block-detail distance, and planting within 60 m, the trees' middle level. Beyond that the beds are a few pixels, yet across all 329 of them they are over a million triangles in each pass.
  - From the District, Heights stays unloaded, including from the gateway looking down Market Street.
  - From the Commons plaza looking east, the shared part and the greenway load before the footbridge.
- **Gate and notices.**
  - Stepping east onto the footbridge, or from presented ground onto a neighborhood that is still loading, waits for its presentation. Someone restored where Heights is not presented may still retreat west.
  - The status line explains loading, a failed load with its automatic retry, and a stall.
  - Server authority, collision and shared occupancy are unchanged; presentation gates only the local player's own steps.

## Checkpoints and rollback

`server/district-heights-checkpoint-migration.js` runs first in the Redis recovery chain.

- **Forward.** A Commons checkpoint, or anything the Commons migration recovers (Gardens, garage), restores unchanged into Heights.
- **Back to the Commons.**
  - Players at the icehouse table stand up, following ordinary departure rules, and its game ends. Other tables' games remain.
  - Anyone east of the footbridge, or airborne where the Commons cannot fly them, moves to free Commons plaza ground next to the bridge.
- **Back to Gardens.** The migration chains through the Commons.

The district epoch still fences writers.

## Evidence and remaining acceptance

- **Focused tests.** `preview/tests/bayou-heights.test.js`, `preview/tests/heights-stream.test.js`, `preview/tests/world-location-label.test.js` and `server/tests/bayou-heights.test.js`. They cover:
  - composition parity and exact detach;
  - the manifest partition;
  - locks;
  - a no-island flood fill;
  - the real walking controller from the District to Heights Hall and back;
  - streaming in parts, the ceiling, view priority, the footbridge gate and release in the District;
  - planting drawn within 60 m in Heights and in the Commons Heights presents;
  - the location label across the footbridge;
  - refusals for water, building land, the reserve and creations;
  - the icehouse game;
  - every migration direction with standing, airborne and seated occupants;
  - Redis epoch fencing, which runs only with `REDIS_URL`.
- **Browser journeys.** `pnpm run test:experience bayou-heights bayou-heights-return`. Two clients walk from both District arrivals over the bridge; the outbound journey plays at the icehouse table, reconnects in Heights and reaches Nineteenth & Yale, and the return journey walks home. Both check that Heights streams in within its ceiling, with each part within its estimate, before the footbridge; the return checks that walking home releases it. They share `preview/e2e/heights-walk.js` and run in separate hosted shards: as one journey the walk took 14–19.5 min on the hosted runner against a 20-min shard timeout.
  - In CI both clients render on the CPU, on one four-core runner. Facing west from deep in Heights, a client draws the District, the Commons and Heights at once. Even standing still, that view slowed the other client to a fifth of walking speed in some hosted runs. So whoever waits deep in Heights turns to face east, the lighter view, and the clients walk home one at a time. Each waypoint keeps the shared 120 s stall deadline, and no leg is longer than the Commons journey's longest, so the deadline asks the same pace of a CPU-rendered walker.
- **Records.** Measurements, captures and results for the exact revision tested are recorded in the [task ledger](../../superpowers/plans/2026-10-24-next-district-586.md).

Human visual approval, physical-device performance, hosted multiplayer, resident routing across locations, browser texture and GPU memory, and native Unreal equivalence remain separate acceptance.
