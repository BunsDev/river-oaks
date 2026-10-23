# East Garden Commons blockout

The user explicitly approved East Garden Commons through native input: “Approve East Garden Commons”. This authorizes the proposed 70 × 80 m plaza, promenade, pavilion, seating and shared table activity. The larger world-expansion objective remains active. This report covers the first source blockout and shared movement contract, not an integrated playable release.

## Artifact and spatial contract

`shared/east-garden-commons-layout.js` is the deterministic metre-based layout. `preview/src/east-garden-commons-world.js` composes it after the existing District/Gardens overlays; `preview/src/east-garden-commons.js` builds its Three.js meshes. `preview/src/walking.js` and `world-surface.js` consume the shared footprint and elevation contract. The original terrain, roads, stores, buildings, gallery and Gardens objects remain unchanged by composition. The existing client and server loading paths attach it when `RIVER_OAKS_DISTRICT_REVISION=east-garden-commons-blockout-1` is selected; existing default revisions remain unchanged.

| Element | Stable ID suffix | Dimensions and purpose |
| --- | --- | --- |
| Promenade | `/promenade` | 6 m clear width; east-edge connection to plaza; overlapping logical joins avoid a radius-induced seam gap |
| Plaza | `/plaza` | 70 × 80 m; gathering and circulation envelope |
| Pavilion | `/pavilion` | 12 × 8 m; 3.2 m clear height, 0.35 m canopy, four 0.5 m square posts |
| Table activity zone | `/table-zone` | 6 × 4 m, two players; existing authoritative chess and chair interactions |
| Benches | `/bench-0`, `/bench-1` | 2.4 × 0.65 m footprints; 0.85 m total proxy height; sit interactions pending |
| Rain garden | `/rain-garden` | 18 × 12 m obstacle footprint, 0.45 m raised edge proxy |
| Ground slab | route surface IDs | 0.2 m thick; new surface starts at existing east edge and grades over 10 m |

All IDs begin with `east-garden-commons`. Source positions are east/north/up; Three.js uses east/up/negative-north. Current layout ground is 18.37222868285045 m. Thirteen source-ground samples at 0.5 m intervals span the six-metre edge, from 18.380100295038364 to 18.35681506767278 m. These are engine surface queries, not a new terrain survey. The shared ramp interpolates those edge heights to the level plaza. The walking controller has 0.35 m radius and 1.68 m eye height; pavilion posts, benches and garden remain outside the central through-route.

The blockout reuses the existing ivory/teal/brass palette with simple geometry. Source inventory: 10 meshes, 3 unique geometries, 5 materials, 1,164 unique triangles and 1,248 submitted triangles. This excludes the reused salon table and chairs and is geometry accounting, not a measured runtime rendering cost. Dispose is idempotent and releases the owned shared resources. Route/plaza top surfaces meet without overlapping coplanar paving; slab thickness closes their sides and bottom.

## Implemented checks

`node --test preview/tests/east-garden-commons.test.js preview/tests/walking*.test.js preview/tests/flight.test.js server/tests/east-garden-commons.test.js`: 28 passed, zero failed/skipped. The real walking controller traverses the seam in both directions. Two authoritative server players take incremental poses across the seam to the plaza and back, and checkpoint restoration preserves their positions. These use controlled simulation time and a gateway fixture spawn; they are not timed browser walks from the original District arrival.

Ground samples meet the original edge within 1 mm in the tested fixture and have no sampled step above 4 cm per 10 cm interval. The surrounding reservation stays outside allowed movement/placement/flight footprints; pavilion and solid proxies block ground or flight as appropriate. The District resident planner retains its original bounded grid and produces the same tested District route after composition. Cross-location resident routing is still pending.

## Integrated revision and shared activity

Client rendering, HTTP world data and socket snapshots use the existing district revision contract for `east-garden-commons-blockout-1`. Checkpoint migration validates exact source composition before preserving Gardens player state in the expanded world. Rollback to Gardens stands up Commons table occupants through existing departure rules, then relocates outside players to clear gateway positions. Commons rollback goes through Gardens before the existing garage rollback; a direct Commons-to-garage migration is not implemented. Redis revision epochs reject stale coordinators before they can overwrite newer world state.

`REDIS_URL=redis://127.0.0.1:16389/0 node --test server/tests/east-garden-commons-migration.test.js server/tests/district-gardens-checkpoint-migration.test.js` passed 11 tests with zero skips in the owned disposable Redis service. The activity regression completes Fool's mate using existing game commands, restores the checkpoint, and verifies safe Gardens rollback. The same regression also preserves an unrelated active District chess game and its seated players across rollback. Real HTTP/WebSocket tests passed on both memory and Redis backends (two passed, zero skips), verifying revision metadata, two-peer seam crossing, reserved-land rejection, reconnect identity/position and return. Those tests use approved fixture travel to the seam and do not establish the original-arrival keyboard journey. Browser chair and chess use remain pending.

## Remaining acceptance

Render and inspect the blockout at player height; traverse from the original arrival with two browser clients; verify real chair and game use; implement bounded chunk lifecycle and error recovery; measure twenty loops. Cross-location resident routing, realistic kit/assembly, matched visual preservation and physical-device acceptance remain open. The earlier blockout core passed all 11 phases, with evidence retained in `.runtime/world-expansion/core-blockout.json` and `.log`. The first integrated core run failed one stale empty-pavilion assertion after table placement (3,779 preview tests passed, one skipped). The assertion now checks table collision and clear circulation beside it; all seven focused collision/game checks passed. Corrected integrated core session `9968` passed all 11 phases with isolated Redis (3,780 preview passed, one skipped; 999 server passed, zero skipped; 115 desktop passed, three skipped). That gate predates the subsequent manifest registration checks; browser journey session `40423` is queued on the shared lock. Do not mark #582–586 complete from controller/server-model results.
