# Plaza salon at Dior–Toulouse — 2026-10-12

**Objective:** furnish the open paving between the Dior and Etro blocks after
Val's reference set (nine images: a sunlit promenade with a chess table, a
courtyard café, a blue-hour plaza, a curved timber bench with pink cushions, a
dusty-pink timber armchair, a travertine chess table, a smoked-bronze lantern, a
round timber table and a travertine planter). It should feel like an outdoor
salon you can walk through and sit in, not a backdrop.

**Branch / worktree:** `feat/plaza-salon` in `../river-oaks-plaza-salon-20261012`,
from `0983a49`. The blocked `dior-promenade` worktree edits
`street-furniture.js` in the same area, so this work lives in new modules.
`interior-cpu-cost` (river-oaks-38) owns `main.js`; this adds one line there.

## Approach

- Everything is procedural geometry and small generated `DataTexture`s
  (slats, travertine, chessboard, sunburst veneer). No reference pixels ship and
  no assets are downloaded, so no provenance receipt is needed.
- `preview/src/plaza-salon-plan.js` is pure world data (no THREE). The browser,
  the townspeople and the authoritative town import the same footprints and
  seats. It only applies to the `district` scene with the Dior store
  (`osm-node-8172494958`).
- Furniture positions are fixed. They do not depend on the vegetation dataset,
  so a town loaded with or without `district-vegetation.json` blocks and seats
  identically. The game and the server both load that dataset. It has ten trees
  in this plaza (`district.json` alone has two), and the layout keeps clear of
  all ten trunks. Only the string lights follow the trees: a minimum spanning
  web over the trunks and the four lantern posts, no strand longer than 9 m.

## Pieces

| Piece | Where (east, north) | Notes |
|---|---|---|
| Round timber table, sunburst top, fluted pedestal | (−2797.0, −1299.2) | four café armchairs on the diagonals |
| Two travertine chess tables with pieces | (−2793.0, −1301.4), (−2786.4, −1300.4) | an armchair each side |
| Curved bench, teak slats, dusty-pink cushions | (−2781.4, −1302.0), opens north | three places, travertine drum with candle lanterns |
| Travertine planters with pink blooms | x −2802.9 and −2793.0, n −1292.85 | along the footway; the Dior door stays open |
| Smoked-bronze swan-neck lantern posts | four, 3.1 m | anchor the string lights |
| Small music stage with stools and mic | (−2806.0, −1300.6) | near Toulouse, faces the round table |
| String lights and trunk garlands | 10 trees + 4 posts, 13 strands | emissive bulbs; no dynamic lights |

## Integration

- `walking.js`: the plan's footprints join `isFree`, `canFly` and `isAreaFree`.
  Tables, the bench body and back, posts, planters and the stage block walking
  and low flight. Chairs and the bench's seat strip stay open, as storefront
  benches do, because `server/world.js` sit() needs a free seat position.
- `world-interactions.js`: `benchSeats` adds the salon's eleven seats
  (`bench:plaza-salon-bench` slots 0–2; `bench:plaza-salon-<chair>` slot 0), so
  the shared seating model, the server and residents resting at Dior use them.
- `shared-seating-ui.js`: seats are labelled "Curved bench (left/middle/right)",
  "Chess table" and "Café armchair".
- `main.js`: `worldGroup.add(buildPlazaSalon(data))` after the street furniture.

## Verification

Run on `feat/plaza-salon` from `0983a49`, before rebasing onto `f7d10aa`.

- `node --test preview/tests/plaza-salon.test.js`: 6/6.
- `pnpm test`: 2657 pass, 1 skip, 0 fail. The storefront-bench test in
  `world-interactions.test.js` now filters to storefront benches. Its stability
  check compares two full `benchSeats` lists.
- `pnpm run test:server` with a local Redis (`REDIS_URL`, port 6391): 514/514.
- `pnpm run build`: ok.
- `pnpm run verify`: core passed (`.runtime/agent/core.json`); Python 141 passed.
- Experience journeys (Metal ANGLE, `RIVER_OAKS_E2E_REPORT` redirected so the
  tracked report was not overwritten):
  - passed: `plaza-salon`, `places`, `reference-facades`, `spatial-streets`;
  - failed: `debug-tools` and `street-level`. Both fail identically on a plain
    export of main `f7d10aa`, without this change. The open town chat dock
    intercepts debug-tools' canvas click at (40, 900), and street-level waits
    for `.panel-scroll > section`. These journeys are not in the hosted shards.
- Shared journeys: `sit-and-water` (required) and `shared-seating`
  (development) passed.
- Visual review: the fixture scene (`/e2e/fixtures/facades.html?landscape`
  with vegetation) at 15:00 and 19:00 from six stations, and the running town
  (arrival, dusk, seated at a chess chair; `output/playwright/plaza-salon-*.png`).
  The review fixed bench slats hidden by the body bevel and stage slats
  stretched by default UVs.
- Cost: 35 meshes (30 instanced, 725 instances), 26 shadow casters, about 74k
  triangles, and stock `MeshStandardMaterial`s only. river-oaks-38 measured the
  district at about 1,364 draws and 5.0M triangles at spawn under SwiftShader,
  so this is roughly 2–3% more.

## Gaps

- The fixture page has no bloom, so the bulbs and lantern glass are judged
  in-game only.
- No server test sits at a salon seat directly; `resolveBenchSeat` is unit
  tested, and the `plaza-salon` journey sits through the real town.
- Hosted CI shards are curated; `plaza-salon` is in the local experience suite
  only.

## Next step

Open the PR, coordinate a merge slot with river-oaks-c2, merge through
`gh-merge-when-green.sh`.
