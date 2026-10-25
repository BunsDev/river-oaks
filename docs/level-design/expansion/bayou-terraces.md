# Bayou Terraces

The Bayou Terraces are the west bank of the bayou, north and south of [Bayou Market Commons](bayou-market-commons.md) (#586 continuation, toward the 3× reachable-ground target). Two footbridges reach them over the bayou from the Heights greenway, continuing Twentieth Street (north) and Eighteenth Street (south). Both terraces are assembled from the [city kit](../../city-kit.md).

It is the opt-in content revision `bayou-terraces-1`, composed as Gardens, then Commons, then [Bayou Heights](bayou-heights.md), then [Studewood](studewood.md), then the terraces. Select it with `RIVER_OAKS_DISTRICT_REVISION=bayou-terraces-1`. Every earlier revision keeps its geometry and world fingerprint, and Studewood is the rollback for the terraces.

## Place and inspiration

The patterns come from a Houston bayou's working west bank, with no specific building reproduced: a riverside walk, community gardens with a small market, a short lane of studios along the District edge, and footbridges to the far-bank trail. All buildings, names and lettering are original to TypeSafe Place.

## Layout

Coordinates use the Commons recipe frame: x is metres east of the District edge, y is metres north of the Market Street centreline (north −1335). Each terrace is a locked recipe in `config/destinations/`.

| Area | Recipe (seed) | Extent | Contents |
| --- | --- | --- | --- |
| Twentieth Street footbridge | `bayou-terrace-north` (1933) | x 111.5–153, y 108.5–113.5 | A paved 5 m deck over the bayou, with railings, landing on the greenway trail |
| North terrace | `bayou-terrace-north` | x 3.5–112.5, y 41–163 | A seven-shop studio row facing Terrace Lane, the bank gardens (lawns, tree rows, lamps, café tables, two market stalls and the gardens game table), and the riverside walk with benches and a bank railing |
| Eighteenth Street footbridge | `bayou-terrace-south` (1934) | x 111.5–153, y −73.5 to −68.5 | As in the north, landing on the greenway and the west end of Eighteenth Street |
| South terrace | `bayou-terrace-south` | x 3.5–112.5, y −118 to −41 | A five-shop studio row, the bank gardens with café tables and two stalls, and the riverside walk |

North is 114,772 authored triangles and south 75,452, both inside the per-neighborhood budget of 260,000 triangles, 70 draw calls, 28 materials and 160 solids.

## Gathering and activities

- **Gardens table.** A two-chair table (`chess-terrace`) on the north gardens' east lawn, under the existing authoritative table-game rules: chess, checkers, Connect Four, reversi and morris.
- **Places to linger.** The gardens market and café tables, the riverside benches, and the studio lane.
- **Arrival.** The location label names the Bayou Terraces on the west bank, so the walking notice says "Entering Bayou Terraces", and "Entering Bayou Heights" on the way back over the bridge. The bridge deck over the bayou is still named Heights.

## Movement, authority and the manifest

The terraces extend the composed Studewood layout in place (`shared/bayou-terraces.js`). Earlier surfaces, solids and plans keep their indices, and the terraces' are appended after them.

- **Only the footbridges connect.** The Commons green keeps its hedges north and south, and the District edge is not joined: the studio rows stand from 3.5 m east of the edge, and walkable terrace ground starts behind them, at Terrace Lane (x 25). Composition refuses terrace ground that touches earlier ground anywhere except where a footbridge lands on the greenway.
- **Manifest.** The two strips that stayed reserved beside the Commons become the authored `bayou-terrace-north` and `bayou-terrace-south` locations, with unchanged bounds, from the District edge to the bank (the Heights west edge). Each has its footbridge as its entry. No reserved land remains in the original east envelope.
- **Creations.** These stay inside the District's build bounds, so the terraces refuse durable creations.

## Streaming

Heights streams the two terraces as two more of its neighborhoods (`preview/src/heights-stream.js`), under the unchanged 16 MiB ceiling.

- **Gate.** The Heights gate covers the terraces as well as everything east of the bayou. Stepping from the presented greenway onto a footbridge waits for its terrace. Someone restored on an unpresented terrace, or on its footbridge, may walk back east toward the greenway, and the notices name the Bayou Terraces and the way back.
- **From the District.** Nothing streams. The terraces sit beside the District edge, but points and cameras west of that edge never load them, so the District keeps its own frame budget. They stream from the Commons and the greenway.
- **The Commons stream.** It gates only Commons ground (its location's north–south span), so an unloaded Commons never holds a terrace walker.
- **Budgets.** Headless, the terraces own 2.00 MiB (north) and 1.40 MiB (south); their estimates are 2.1 and 1.5 MiB.

## Checkpoints and rollback

`server/district-terraces-checkpoint-migration.js` runs first in the Redis recovery chain.

- **Forward.** A Studewood checkpoint, or anything the Studewood migration recovers, restores unchanged into the terraces.
- **Back to Studewood.** Players at the gardens table stand up, following ordinary departure rules. Anyone on the terraces or their footbridges, or airborne where Studewood cannot fly them, moves to free greenway ground by the nearer footbridge. People on building levels, such as the Gardens campus floors, stay where they are.
- **Back to Heights, the Commons or Gardens.** The migration chains through Studewood.

The district epoch still fences writers.

## Reachable ground

The terraces add 16,945.75 m² at 0.5 m, for a total of 131,269.5 m²: 2.8244× the Gardens baseline (2.8294× at 1 m). The figures are in [world expansion](../../world-expansion.md#bayou-terraces). The original east envelope is now fully authored. The 3× floor needs about 8,200 m² more reachable ground, which means new land: the [convergence ledger](../../superpowers/plans/2026-10-24-convergence-3x.md) carries the proposal for Val.

## Evidence and remaining acceptance

- **Focused tests.** `preview/tests/bayou-terraces.test.js` and `server/tests/bayou-terraces.test.js`. They cover:
  - composition parity and exact detach;
  - the manifest partition and registration;
  - locks and budgets;
  - footbridges as the only connections;
  - the hedged Commons green;
  - a no-island flood fill from the greenway;
  - the real walking controller and server-owned walking over the footbridge;
  - refusals;
  - the label;
  - the gardens table;
  - streaming, the gate and the Commons gate;
  - every migration direction with garden, bridge, airborne and seated occupants;
  - Redis epoch fencing, which runs only with `REDIS_URL`.
- **Browser journey.** `pnpm run test:experience bayou-terraces`. Two clients travel to the greenway, walk over the Twentieth Street footbridge into the north gardens, play at the gardens table, reconnect there and walk back.

Human visual approval (the footbridges are kit paving and railings, without the Lantern Footbridge's authored structure), physical-device performance, resident routing, matched performance and native Unreal equivalence remain separate acceptance.
