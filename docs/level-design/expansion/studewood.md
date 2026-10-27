# Studewood

Studewood is the east side of [Bayou Heights](bayou-heights.md), beyond Heights Boulevard (#586 continuation, toward the 3× reachable-ground target). Twentieth and Eighteenth Streets continue east from the boulevard through the gaps between its frontage blocks. Studewood Street runs the length of the strip behind that frontage. Both neighborhoods are assembled from the [city kit](../../city-kit.md).

It is the opt-in content revision `heights-studewood-1`, composed as Gardens, then Commons, then Heights, then Studewood. Select it with `RIVER_OAKS_DISTRICT_REVISION=heights-studewood-1`. Every earlier revision keeps its geometry and world fingerprint, and Heights is the rollback for Studewood.

## Place and inspiration

The patterns come from the working streets east of Houston Heights' boulevard, with no specific building reproduced:
- a north–south street of small shops;
- a neighborhood park with a water tower, a night market and a game table;
- a market yard with stalls and café tables;
- a quiet lawn at the south end.

All buildings, names and lettering are original to TypeSafe Place.

## Layout

Coordinates use the Commons recipe frame: x is metres east of the District edge, y is metres north of the Market Street centreline (north −1335). Each area is a locked recipe in `config/destinations/`.

| Area | Recipe (seed) | Extent | Contents |
| --- | --- | --- | --- |
| Studewood Street | `studewood-north` (1931), `studewood-south` (1932) | x 422.5–436.5, y −118 to 163 | The spine: a 7 m lane with 3.5 m sidewalks, street trees and lamps |
| Twentieth Street | `studewood-north` | y 104.5–117.5, x 406–507.5 | Continues Heights' Twentieth Street east through the frontage gap to the end of the strip |
| Eighteenth Street | `studewood-south` | y −77.5 to −64.5, x 406–507.5 | Continues Heights' Eighteenth Street east in the same way |
| Studewood Park | `studewood-north` | x 435.5–507.5, y 4–105.5 | Two lawns, three tree rows, the Studewood water tower, a three-stall night market with café tables, benches, lamps and the park game table |
| North court and shop row | `studewood-north` | x 436.5–507.5, y 116.5–163 | Five shopfronts facing the street, a lawn court with benches and a bike rack |
| Market row, green and yard | `studewood-south` | x 435.5–507.5, y −65.5 to 5 | Six market shops, a planted green with lamps, and a yard with three stalls, café tables and benches |
| South row and lawn | `studewood-south` | x 436.5–507.5, y −118 to −76.5 | Four shopfronts, a lawn with benches, lamps and a bike rack |

The two plans hold 327 pieces, 23 building shells and 162 solids. North is 45,724 authored triangles and south 74,164, both well inside the per-neighborhood budget of 260,000 triangles, 70 draw calls, 28 materials and 160 solids.

## Gathering and activities

- **Park game table.** A two-chair table (`chess-studewood`) under the existing authoritative table-game rules: chess, checkers, Connect Four, reversi and morris.
- **Water tower.** The kit landmark, lettered STUDEWOOD, closes the park's long view east.
- **Places to linger.** The night market, the market yard, the café tables, and the park, court and lawn benches.
- **Arrival.** The location label names Studewood east of x 422.5, so the walking notice says "Entering Studewood", and "Entering Bayou Heights" on the way back.

## Movement, authority and the manifest

Studewood extends the composed Heights layout in place (`shared/studewood.js`). The browser and the server therefore read the same surfaces and solids, with no new movement code. Heights surfaces, solids and plans keep their indices, and Studewood's are appended after them.

- **Seams.** Only the two cross streets, plus a 3 m ground-only seam at each, reach back into the Heights location. Each seam overlaps the end of the Heights street by a metre, so the walking radius does not wall the two off, and the kit paving of the two streets meets without overlapping. Composition refuses any seam that crosses a Heights building.
- **Manifest.** The rest of the original east reserve becomes the authored `studewood` location, with unchanged bounds: x 422.5 to the reserve's east edge, over the District's whole north/south span. Its entry is Twentieth Street at its west edge. No reserved land remains east of the bayou. The strips north and south of the Commons stay reserved in this revision; [the Bayou Terraces](bayou-terraces.md) author them next.
- **Creations.** These stay inside the District's build bounds, so Studewood refuses durable creations, as Heights does.

## Streaming

Heights streams Studewood as two more of its neighborhoods (`preview/src/heights-stream.js`), under the same 16 MiB retained-geometry ceiling and the same view-priority rules. The shared Heights landscape part draws Studewood's street trees once. Measured headless in the luxury kit (#641), the neighborhoods own 2.84 MiB (north) and 2.43 MiB (south); their estimates are 3.0 and 2.6 MiB. Stepping from presented ground into a Studewood neighborhood that is still loading waits for it, as everywhere in Heights.

## Checkpoints and rollback

`server/district-studewood-checkpoint-migration.js` runs first in the Redis recovery chain.

- **Forward.** A Heights checkpoint, or anything the Heights migration recovers (Commons, Gardens, garage), restores unchanged into Studewood.
- **Back to Heights.**
  - Players at the park table stand up, following ordinary departure rules, and its game ends. Other tables' games remain.
  - Anyone east of Heights Boulevard's east sidewalk (x 406), or airborne where Heights cannot fly them, moves to free boulevard ground by Twentieth Street.
- **Back to the Commons or Gardens.** The migration chains through Heights.

The district epoch still fences writers.

## Reachable ground

Studewood adds 20,815.75 m² at 0.5 m, for a total of 114,323.75 m²: 2.4598× the Gardens baseline (2.4661× at 1 m). The figures are in [world expansion](../../world-expansion.md#studewood). 3× is not reachable inside the current reserve at plausible density; the [convergence ledger](../../superpowers/plans/2026-10-24-convergence-3x.md) carries the land proposal for Val.

## Evidence and remaining acceptance

- **Focused tests.** `preview/tests/studewood.test.js` and `server/tests/studewood.test.js`. They cover:
  - composition parity and exact detach;
  - the manifest partition and registration;
  - locks and budgets;
  - the cross-street seams;
  - a no-island flood fill from Heights Boulevard;
  - the real walking controller and server-owned walking along Twentieth Street and back;
  - refusals for building land, the location edge and creations;
  - the location label;
  - the park table;
  - streaming within the ceiling and the neighborhood gate;
  - every migration direction with standing, seam, airborne and seated occupants;
  - Redis epoch fencing, which runs only with `REDIS_URL`.
- **Browser journey.** `pnpm run test:experience studewood`. Two clients travel to Heights Boulevard, walk along Twentieth Street into Studewood, play at the park table, reconnect there and walk back.

Human visual approval, physical-device performance, resident routing, browser texture and GPU memory, matched performance against Heights, and native Unreal equivalence remain separate acceptance.
