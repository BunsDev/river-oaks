# Woodland Heights

Woodland Heights is a residential garden strip directly east of [Studewood](studewood.md) (land proposal A′, toward the 3× reachable-ground target). Twentieth and Eighteenth Streets continue east from the ends of Studewood's. Live Oak Lane runs the length of the strip between bungalow gardens, with shops at its corners. Both neighborhoods are assembled from the [city kit](../../city-kit.md).

It is the opt-in content revision `woodland-heights-1`, composed as Gardens, then Commons, then [Bayou Heights](bayou-heights.md), then Studewood, then the [Bayou Terraces](bayou-terraces.md), then Woodland Heights. Select it with `RIVER_OAKS_DISTRICT_REVISION=woodland-heights-1`. Every earlier revision keeps its geometry and world fingerprint, and the Terraces are the rollback for Woodland Heights.

## Place and inspiration

The patterns come from the residential streets of a Houston Heights-style neighborhood beyond a working shop street, with no specific building reproduced:
- one-storey bungalows set behind front lawns, with porches;
- side gardens between them, each with a shade tree;
- a small neighborhood green with a game table;
- shops at the corners where the cross streets meet the lane.

All buildings, names and lettering are original to TypeSafe Place.

## Layout

Coordinates use the Commons recipe frame: x is metres east of the District edge, y is metres north of the Market Street centreline (north −1335). Each area is a locked recipe in `config/destinations/`.

| Area | Recipe (seed) | Extent | Contents |
| --- | --- | --- | --- |
| Live Oak Lane | `woodland-heights-north` (1935), `woodland-heights-south` (1936) | x 523–537, y −122 to 167.5 | The spine: a 6 m lane with 4 m sidewalks, street trees and lamps, closed by a hedge at each end |
| Twentieth Street | `woodland-heights-north` | y 104.5–117.5, x 507.5–552.5 | Continues Studewood's Twentieth Street east across Live Oak Lane to a hedge at the strip's edge |
| Eighteenth Street | `woodland-heights-south` | y −77.5 to −64.5, x 507.5–552.5 | Continues Studewood's Eighteenth Street in the same way |
| Corner shops | both | x 508–523 and 537–552.5, north of each cross street | Four kit blocks of one or two storeys, with shopfronts on the cross street and on Live Oak Lane |
| The Woodland green | `woodland-heights-north` | x 536–552.5, y 4–105.5 | Two lawns and shade trees, tree rows framing a paved court with the green's game table, benches facing the lawn, lamps and an edge hedge |
| Bungalow gardens | both | x 508–524 and 536–552.5 | Fourteen one-storey bungalows, 8.5 by 9 m, behind front lawns, separated by side gardens with a shade tree each; hedges line the strip's east edge |
| The Woodland lawn | `woodland-heights-south` | x 536–552.5, y −122 to −76.5 | A lawn with shade trees, a tree row, benches, lamps and a bike rack |

The two plans hold 310 pieces, 22 building shells and 107 solids. North is 59,688 authored triangles and south 50,480, inside the per-neighborhood budget of 260,000 triangles, 70 draw calls, 28 materials and 160 solids. Built, they draw 61 and 58 meshes.

The bungalows are hand-placed `additions`, not seeded blocks. Additions share one render batch. A detached bungalow as its own kit block would cost about a dozen draw calls each. The seed varies the corner shops and the street trees.

## Gathering and activities

- **Green table.** A two-chair table (`chess-woodland`) in the green's paved court, under the existing authoritative table-game rules: chess, checkers, Connect Four, reversi and morris.
- **Places to linger.** The green's benches and lawns, the lawn benches at the south end, the side gardens and the corner shops.
- **Arrival.** The location label names Woodland Heights east of Studewood's east edge, so the walking notice says "Entering Woodland Heights", and "Entering Studewood" on the way back.

## Movement, authority and the manifest

Woodland Heights extends the composed Terraces layout in place (`shared/woodland-heights.js`). The browser and the server therefore read the same surfaces and solids, with no new movement code. Earlier surfaces, solids and plans keep their indices, and Woodland's are appended after them. The composed bounds, and the world's `bounds_m`, grow 45 m east; detaching restores the Terraces bounds exactly.

- **Seams.** Only the two cross streets, plus a 2 m ground-only seam at each, reach back into Studewood's location. Each seam overlaps the end of Studewood's street by a metre and the end of Woodland's by a metre, so the walking radius does not wall the two off, and the kit paving of the two streets meets at x 507.5 without overlapping. Everywhere else Woodland ground starts at x 508, half a metre from Studewood's hedged edge. Composition refuses Woodland ground that touches earlier ground anywhere except at the seams, and any seam that crosses an earlier building.
- **Manifest.** The authored `woodland-heights` location is new land: from Studewood's east edge (x 507.888) 45 m east, over the District's whole north/south span, 13,069.38 m² of bounds. It is the first location beyond the original east envelope, which the other locations still partition exactly. Its entry is Twentieth Street at its west edge, and it is adjacent to Studewood only.
- **Creations.** These stay inside the District's build bounds, so Woodland Heights refuses durable creations, as Studewood does.

## Streaming

Heights streams Woodland Heights as two more of its neighborhoods (`preview/src/heights-stream.js`), under the same 16 MiB retained-geometry ceiling and the same view-priority rules. The stream's bounds now reach Woodland's east edge.

- **Shared part.** It draws Woodland's 69 trees and the planting of its two street-end hedges, which raise the shared estimate by 0.43 MiB to 9.38 MiB (`HEIGHTS_SHARED_PLACEMENT_BYTES`).
- **Budgets.** Measured headless in the luxury kit (#641), the neighborhoods own 1.77 MiB (north) and 1.34 MiB (south); their estimates are 1.9 and 1.45 MiB. With the shared part, Studewood north and Woodland north fit the ceiling together (14.28 MiB estimated), so walking in along Twentieth Street does not trade one for the other.
- **Gate.** Stepping from presented ground into a Woodland neighborhood that is still loading waits for it, as everywhere in Heights. Someone restored on Woodland ground that is not yet presented may step anywhere within Woodland, not only west: its side gardens open east onto the garden strips and Live Oak Lane, so a westward-only retreat held up to 1,327.5 m² (found in review). The way out is then west along a cross street. A test flood-fills Woodland with the Heights module failing and with each neighborhood failing, and requires every free cell to walk back to Studewood.
- **Headroom.** The shared estimate grows by allowances that err high: 9.38 MiB estimated, against 8,348,178 bytes measured in the journey. On estimates alone, two Heights pairs now exceed the ceiling together with the shared part: Nineteenth and Yale with Yale Street north (16.18 MiB), and the icehouse with Nineteenth and Yale (16.13 MiB). They fit in practice, because a resident chunk counts at its measured size. The next increment that adds street trees should first record the shared part's measured size, rather than lean on the allowances.

## Checkpoints and rollback

`server/district-woodland-checkpoint-migration.js` runs first in the Redis recovery chain.

- **Forward.** A Terraces checkpoint, or anything the Terraces migration recovers (Studewood, Heights, the Commons, Gardens, garage), restores unchanged into Woodland Heights.
- **Back to the Terraces.**
  - Players at the green table stand up, following ordinary departure rules, and its game ends. Other tables' games remain.
  - Anyone east of Studewood's walkable ground (its cross streets end at x 507.5, less the 0.35 m walking radius), or airborne where the Terraces cannot fly them, moves to free Studewood street ground at the east end of the nearer of Twentieth and Eighteenth Streets.
  - People on Studewood's street under the seams, and everyone else, stay where they are.
- **Back to Studewood, Heights, the Commons or Gardens.** The migration chains through the Terraces.

The district epoch still fences writers.

## Reachable ground

Woodland Heights adds 10,394.75 m² at 0.5 m, for a total of 141,664.25 m²: 3.0480× the Gardens baseline (3.0519× at 1 m). That passes the 3× floor (139,433.25 m²) by 2,231 m², and reaches 79.5% of its own bounds. The figures are in [world expansion](../../world-expansion.md#woodland-heights).

## Evidence and remaining acceptance

- **Focused tests.** `preview/tests/woodland-heights.test.js` and `server/tests/woodland-heights.test.js`. They cover:
  - composition parity and exact, byte-identical detach;
  - the manifest registration of the new land;
  - locks and budgets;
  - the cross-street seams and the closed hedged edge;
  - a no-island flood fill from Studewood's cross streets;
  - the real walking controller and server-owned walking along Twentieth Street and back;
  - refusals for building land, the location edge and creations;
  - the location label;
  - the green table;
  - streaming within the ceiling, both sides of the seam together, and the neighborhood gate;
  - every migration direction with standing, seam and seated occupants, a flyer above Woodland, and players pinned either side of the rollback line;
  - Redis epoch fencing, which runs only with `REDIS_URL`.
- **Browser journey.** `pnpm run test:experience woodland-heights`. Two clients travel to the east end of Studewood's Twentieth Street, walk east into Woodland Heights and onto the green, play at the green table, reconnect there and walk back.

Human visual approval, physical-device performance, resident routing, browser texture and GPU memory, matched performance against Heights, and native Unreal equivalence remain separate acceptance.
