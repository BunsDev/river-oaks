# Bayou Market Commons

Bayou Market Commons is the first playable expansion beyond the original District (#586). It completes the approved [East Garden Commons](destination-proposal.md). The [blockout](blockout-builder.md)'s promenade, 70 × 80 m plaza, pavilion, chess table, benches and rain garden keep their positions and stable IDs. The destination composes a neighborhood around them, assembled from the [city kit](../../city-kit.md). The opt-in content revision is `east-garden-commons-market-1`. Select it with `RIVER_OAKS_DISTRICT_REVISION=east-garden-commons-market-1`, which supersedes `east-garden-commons-blockout-1`. The garage and Gardens defaults are unchanged.

## Place and inspiration

The destination draws on Houston patterns but reproduces no specific buildings. It combines a short, tree-lined shopping street of one- to three-storey brick storefronts with canopies and awnings (the Heights' 19th Street), a shaded garden court (Montrose), a bayou-edge green (Buffalo Bayou) and an elevated water tower as the neighborhood's wayfinding landmark. All buildings, names and lettering are original to TypeSafe Place.

## Layout

Site-local metres are measured from the District's east edge at the promenade centreline (north −1335). The recipe is `config/destinations/bayou-market-commons.json` (seed 1912).

| Area | Extent | Contents |
| --- | --- | --- |
| Gateway | x −3 to 3, 6 m wide | The approved promenade ramp, unchanged, meets the measured District edge |
| Market Street | x 3–47, lane 6 m plus two 4 m sidewalks | A curbless shared street with flush granite bands, a street tree every 9 m and a lamp every 11 m. The first south tree is suppressed so the gateway lantern stays visible from the District. |
| Market Row | north frontage | Five brick shops with canopies, awnings and cornices: Teal Door Books (pinned to three storeys by override), Paletas Lucero, Bayou Bloom Florist, Lantern Lane Coffee and Little Kiln Ceramics. Lower rear buildings close the block. |
| Garden Court | south frontage | Ivory stucco loggias and a 12 × 10 m court: cafe sets, planters and the court lantern |
| Crossing | x 44–47 | A flush crossing table and bollards where the street meets the green |
| Bayou Green | the approved 70 × 80 m plaza | Two mown lawns, a planted south lawn with its own row of shade trees, two edge rows of shade trees, hedged north and south edges, a market terrace with cafe sets, benches facing the lawn, the pavilion with the shared chess table, the rain garden |
| Bayou Market | x 62–82 along the green's north side | Four striped market stalls facing the lawn: Gulf Coast Shrimp, Pecan Pralines, Bluebonnet Blooms and Rio Grande Citrus. Each has a counter, crates of produce and a lettered board. Planters close both ends. |
| Bayou Lantern | x 106 on the street axis | A 27 m water tower with a ★ BAYOU MARKET ★ band. It terminates the view down Market Street from the District, and players can walk between its legs. |
| Edges | east, north, south | A railing above a bayou with trees on the far bank, and visual-only context buildings. Walking stops at the hedges and the railing. |

The plan has 125 pieces, 19 building shells, 62 solids and 15 materials, at about 95,736 authored triangles. The client renders it with 57 meshes before trees and planting. Lawns use the District grass maps under a turf tint at low texture contrast, as on the green roofs; untinted, the maps read as bare gravel.

## Gathering and activities

- **Pavilion chess:** the existing authoritative two-player table (`chess-commons`), unchanged.
- **Lantern Walk:** this destination's own shared activity (`server/lantern-walk.js`, `preview/src/lantern-walk.js`). Five lanterns stand at the gateway, in the court, on the terrace, beside the rain garden and under the tower. Any player on foot within 2.4 m of an unlit lantern presses Z to light it, and the server checks reach on every request. When all five are lit, the tower beacon lights for everyone. The round's time and lamplighters are announced, and the best team time is kept as a reason to return. A finished round stays lit for 90 seconds. An unfinished round goes dark after five quiet minutes. Rounds persist through server checkpoints. Rolling the town back to Gardens leaves the activity behind.
- **Places to linger:** benches on the green, cafe sets on the terrace and in the court, the market stalls, and the shade of the pavilion, the south lawn's trees and the tower.
- **Arrival:** crossing the promenade announces Bayou Market Commons in the walking notice, and crossing back announces River Oaks District.

## Movement and authority

The walking contract is the Commons contract. The destination appends one walkable rectangle per street, court and plaza, plus its solids, to the approved layout (`shared/commons-destination.js`). Client rendering and server movement compose the same plan. Facades are the walkable edge, so players cannot enter or fly over closed blocks. Tests flood-fill the real walking environment from the District side of the gateway. Every walkable sample in the Commons connects to it, with no dead-end pockets, and every lantern, the court, the terrace, the pavilion, the rain-garden path and the chess seats are reachable. The real walking controller walks from the District down Market Street into the court and back.

## Evidence and remaining acceptance

The focused tests (`preview/tests/city-kit.test.js`, `preview/tests/bayou-market-commons.test.js`, `server/tests/lantern-walk.test.js`) and the existing Commons, manifest and migration suites cover composition, connectivity, collision, the activity rules and two-player completion across a restore and a rollback. The two-player browser journey (`pnpm run test:experience east-garden-commons`) covers a keyboard walk from both District arrivals, shared chess, reconnect, the Lantern Walk split between both players, and the walk home without a reload. Its results, the pedestrian-scale screenshots and the measurements are recorded in the [task ledger](../../superpowers/plans/2026-10-23-destination-slice-584-586.md) for the exact revision tested.

Human visual approval, physical-device performance, hosted multiplayer and native Unreal equivalence remain separate acceptance.
