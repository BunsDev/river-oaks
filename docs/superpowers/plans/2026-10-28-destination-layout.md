# City-kit layout: blocks derived from streets

Goal (Val, 2026-10-28, `/goal`): extend the existing world-authoring pipeline to generate coherent neighborhoods efficiently from deterministic inputs, geographic references, reusable architecture and explicit artistic constraints; preserve handcrafted landmarks and manual overrides; integrate with World Studio and the build scripts; repeatable preview/export, validation and diagnostics; less production effort with artistic control, not the largest city.

Task `destination-layout-20261028`, owner `claude:river-oaks-layout (1a8107da)`, branch `feat/destination-layout-20261028`, worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-destination-layout`, base `origin/main` `1781924a295a37617a448564bc21dddfd5b3a1ff`.

## Inspection (2026-10-28)

Two generators already exist on main. The Studio-side neighborhood compiler (`scripts/neighborhood.mjs`, `shared/neighborhood/`, [neighborhood authoring](../../neighborhood-authoring.md)) builds lattices, parcels and template placements into Studio regions with approvals and tombstones, and has a Python geographic adapter. The city kit (`shared/city-kit/`, `scripts/destination.mjs`, [city kit](../../city-kit.md)) is what every shipped district since the Commons is built from: a recipe names streets, plazas, blocks, landmarks and furniture; a seed varies only what the recipe leaves open; overrides and additions live in the recipe by stable ID; locks catch unexpected regeneration.

The production cost in the city-kit pipeline is in the recipes themselves. Every one of the 14 committed recipes types each block rectangle by hand, including the arithmetic that keeps it flush with the street's lane-plus-sidewalk edge, its facing direction and which corner sides face a crossing street. Nothing derives blocks from streets. The two blocked Codex lanes hold nothing to resume for this: `neighborhood-authoring` has no file that is not already on main (its 39 dirty files landed in #623), and `neighborhood-584-586` holds a hand-placed pilot block (`shared/neighborhood-blocks.js`) that the city kit superseded. Both stay blocked and untouched per Val's 2026-10-28 register decision; this is the product goal that the register's exit condition names, and it takes a fresh lane rather than their stale bases.

## Increment 1: `layout` in destination recipes

Objective: a recipe may carry a `layout` with quarters (style, depth/storey/bay ranges, name pool, frontage policy) and reservations. The land between street corridors, plazas, reservations and authored blocks becomes blocks that face the streets bounding them; a cell bounded by streets on opposite sides splits into two back-to-back blocks; corner blocks face the crossing street. Streets, plazas, landmarks, furniture, authored blocks, overrides and additions are never moved. Derivation runs inside `assembleNeighborhood`, so the in-engine fixture, locks, overrides, budgets, connectivity and every runtime composition see derived blocks exactly as authored ones.

Files owned: `shared/city-kit/layout.js` (new), `shared/city-kit/assemble.js` (layout hook and provenance only), `scripts/destination.mjs` (`layout` command, diagnostics in report and SVG), `preview/tests/city-kit-layout.test.js` (new), `config/destinations/layout-grid-example.json` and its lock (new), `docs/city-kit.md` (layout section), this ledger.

Checks: `node --test preview/tests/city-kit*.test.js`, `pnpm run destination check` (every committed lock must still reproduce: no existing plan hash may change), `pnpm run verify`, hosted Verify on the draft PR.

Results (2026-10-28, worktree head `1781924a` plus the uncommitted files above):

- `shared/city-kit/layout.js` derives blocks inside `assembleNeighborhood`; plans without a `layout` carry no layout provenance and keep their hashes: `pnpm run destination check` reproduces all 15 committed locks (the 14 existing plus the example).
- `node --test preview/tests/city-kit-layout.test.js preview/tests/city-kit.test.js`: 21 passed, 0 failed. The layout tests prove that quarters reproduce the hand-authored Nineteenth & Yale crossroads piece for piece (three rows by the auto rule, the garden court by an explicit `front`), that the example derives three blocks (a back-to-back pair on Main and the back lane, a corner row on Main), that derivation is deterministic and local to the changed quarter, that a moved street keeps a single block's name so its override still applies while building on the lawn renames the row and orphans the override without dropping it, that reservations, authored blocks and the hand-placed tower are never covered (a landmark on land is refused with the remedy), the open/too-shallow/too-narrow/partial-frontage diagnostics, invalid layouts, and the CLI (`build` writes `layout.json`, `layout` prints the table, `--freeze` writes identical authored blocks).
- `preview/tests/city-kit.test.js`, `bayou-market-commons`, `bayou-heights`, `studewood` composition tests: 43 passed on the hooked assembler.
- Measured while sizing the example: the renderer batches about 12 draw calls per block beside about 20 for streets and plazas (Nineteenth & Yale: 4 blocks, 66 meshes), so a recipe holds about four blocks inside the 70-call budget. A first seven-block example drew 107 meshes; the committed example derives three blocks, 159,440 triangles, 62 meshes, connectivity 1, no warnings. Documented under **Budget** in `docs/city-kit.md`.
- Found and fixed a pre-existing defect in `scripts/destination.mjs`: every `plan.svg` with a building was malformed XML (`</rect/>` and unescaped `&` in shop names such as "Iron & Ivy"); `xmllint` now accepts the example and the Nineteenth & Yale drawings, and the layout test asserts escaping and closing. The rasterized example (`.runtime/destination-layout/plan-wellformed.svg.png`, local, untracked) shows the split pair, the faced sides, the pinned shop and the preserved tower.
- `pnpm run verify` (core) on this source, receipt `.runtime/agent/core.json` (revision `1781924a`, dirty with the files above), log `.runtime/destination-layout/verify-core-004.log`: passed. agent-tests 289/289; preview-tests 4315 passed, 1 skipped; server-tests 1051 passed, 280 skipped (no Redis); desktop-tests 127 passed, 5 skipped; build, python lint/format/tests (170 passed), demo and secrets (no leaks) passed. Three earlier starts were stopped to fold in fixes and are not evidence. Not run: `verify full` (Redis, browser), browser journeys, native.

Gaps and later increments: geographic reference input for city-kit streets (the Python adapter serves the Studio compiler only; kit streets are axis-aligned), World Studio opening of a city-kit plan, a plaza/furniture derivation step (benches, lamps and tree rows are still typed per item), and a Studio-side bridge from the neighborhood compiler's parcels to kit blocks.

Delivery: draft PR #730 (https://github.com/BunsDev/river-oaks/pull/730), source head `7caa2cd858d6558249bed17efde5e76b8b8fa0da` (signed; the core receipt above belongs to that tree). Hosted checks on `b64271bb` (source plus this ledger note): 29 success, 5 skipped, 0 failed, 2026-10-28 09:57 CDT. Awaiting review and merge authorization.

Next step: hosted Verify, review, then land when authorized.

## Increment 2: kit streets from a geographic reference

Task `destination-reference-20261028`, branch `feat/destination-reference-20261028` stacked on increment 1 (worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-destination-reference`); retarget to `main` after #730 merges.

Objective: `destination reference <world.json> --site w,s,e,n --id <id>` turns the mapped roads inside a site of a world export (the bundled District, a `river-oaks build` world, a Studio region) into a recipe skeleton: the dominant grid becomes the kit's east axis, runs within a tolerance of an axis become streets on the module with the map's width, pieces of one way merge, and every road the kit cannot express (bends, stubs, corridors leaving the site, overlaps, unrequested kinds) is printed and recorded under `reference.dropped` with its reason. One quarter with a placeholder name per derived block, a budget outlook, and source provenance (file name, SHA-256, CRS, origin, site, rotation). Buildings are counted, never reproduced.

Files owned: `shared/city-kit/reference.js` (new), `scripts/destination.mjs` (`reference` command, `--name=value` flags), `preview/tests/city-kit-reference.test.js` and `preview/tests/fixtures/city-kit-reference-grid.json` (new), `docs/city-kit.md` (reference section), this ledger.

Findings: the District export's roads are 86% axis-aligned within 3° over 2.97 km, but it is an apartment complex of loops and footways, not a street grid; the crop at [-2910,-1400,-2760,-1280] keeps five straight lanes, reports Westcreek Lane as bending 12° and yields seven blocks at 348,168 triangles, over the 260,000 budget. That is the right answer for that site: the command says so before anyone names a shop. The synthetic fixture (a grid turned 12° with a bend, a stub, an edge road and a parallel path) proves the turn, snap, merge and every drop reason, and a budget-sized crop of it builds clean.

Results (2026-10-28):

- `node --test preview/tests/city-kit-reference.test.js preview/tests/city-kit-layout.test.js preview/tests/city-kit.test.js`: 26 passed, 0 failed.
- `pnpm run destination check`: 15 locks reproduce (no committed recipe uses `reference`).
- `python3 -I scripts/check_secrets.py --all`: no leaks.
- The rasterized `plan.svg` of the fixture's core crop (`.runtime/destination-reference/plan.svg.png`, local) shows Main Street and Cross Street with four derived blocks facing Main.
- `pnpm run verify` (core) on this source, receipt `.runtime/agent/core.json` (revision `b64271bb`, dirty with the files above), log `.runtime/destination-reference/verify-core-001.log`: passed. agent-tests 289/289; preview-tests 4320 passed, 1 skipped; server-tests 1051 passed, 280 skipped (no Redis); desktop-tests 127 passed, 5 skipped; build, python lint/format/tests (170 passed), demo and secrets passed. Not run: `verify full` (Redis, browser), browser journeys, native.

Delivery: draft PR #733 (https://github.com/BunsDev/river-oaks/pull/733), head `cfe3207d5395b9cbb7f65ddab97a0739b3f8fe7a` (signed), base `feat/destination-layout-20261028`; retarget to `main` after #730 merges.

Hosted Verify on `1c7e37d4` (source plus a ledger note), run 40711445100 attempt 1: 20 success, 5 skipped, 2 failed, both from one shard, `preview experience (terraces)` (job 122898446092, 15:02–15:08Z). The `bayou-terraces` journey passed its streaming, footbridge, shared-game and reconnect checks, then `owner greenway: stalled` on the walk back: the record shows a server `movement_too_fast` refusal at t=30.5 s at [-2509.8, -1223] on the CPU-rendered runner, after which the owner's pose reports speed 0 with a non-zero velocity 92.8 m from the target. This PR changes no client or server file: `shared/city-kit/reference.js` is imported only by `scripts/destination.mjs` and its test; the rest is tests, a fixture and docs. No other `preview experience (terraces)` failure in the last 44 Verify runs (the two failed `main` runs today lost `preview shared (worlds-and-creator)` and `preview checks`). Rerun-failed-jobs issued once: attempt 2 passed the terraces shard (15:18–15:25Z) and the aggregate `preview`; run 40711445100 concluded success at 15:25Z. Awaiting review and merge authorization.

World Studio input: a region as **Export JSON** writes it is already a reference (`preview/public/data/sample-region.json`: the garden ring becomes four streets beside Moon Lane, 5 streets, nothing dropped), proven by a test in `city-kit-reference.test.js`; the starter districts work the same way.

## Increment 3: a plan opens in World Studio

Task `destination-studio-20261028`, branch `feat/destination-studio-20261028` stacked on increment 2 (worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-destination-studio`); retarget after #733 merges.

Objective: `destination build` writes `studio-region.json`, the plan as a schema-v1 creator region that World Studio opens with **Open JSON** and the server's region package compiler accepts: roads from streets with their lanes, a box per building shell (footprint, height, stable id), trees with crowns, places from the landmark, plazas and streets, parcels from authored and derived blocks, the arrival on the widest street's sidewalk, bounds padded 2 m. A review view for walking and marking places; edits return to the recipe as overrides by piece id. Pieces under 4 m a side and context beyond the region are listed as omitted; plans Studio would refuse are refused with the reason.

Files owned: `shared/city-kit/studio.js` (new), `scripts/destination.mjs` (build writes the region; preview says how to open it), `preview/tests/city-kit-studio.test.js` (new), `docs/city-kit.md` (Studio section), this ledger.

Results (2026-10-28):

- `node --test preview/tests/city-kit-studio.test.js preview/tests/city-kit-reference.test.js preview/tests/city-kit-layout.test.js preview/tests/city-kit.test.js`: 31 passed, 0 failed. The layout example's region is checked field by field (bounds, roads, a shell's box, places, parcels), then accepted by `editableRegion`, `parseRegion`, `createStudioDocument` and the server's `compileRegionPackage`; all 15 committed recipes export regions both accept (Heights Boulevard north omits seven rear wings under 4 m; the Commons omits context beyond the region; the greenway, with no buildings, still opens on its plazas and streets); refusals carry the reason; the CLI writes the file and reports it in build's JSON.
- `pnpm run destination check`: 15 locks reproduce (plan hashes do not cover the Studio file). `python3 -I scripts/check_secrets.py --all`: no leaks.
- A drawing of the exported Nineteenth & Yale region (`.runtime/destination-reference/yale-studio-region.svg.png`, local) shows four blocks of massing, the crossing streets with trees, the court, places and the arrival on Nineteenth's sidewalk.
- `pnpm run verify` (core), receipt `.runtime/agent/core.json` (revision `8f0c659a`, dirty with the files above), log `.runtime/destination-studio/verify-core-001.log`: passed. agent-tests 289/289; preview-tests 4325 passed, 1 skipped; server-tests 1051 passed, 280 skipped (no Redis); desktop-tests 127 passed, 5 skipped; build, python lint/format/tests (170 passed), demo, secrets passed. Not run: opening the file in a running Studio in a browser, `verify full`, Redis, native.

Delivery: draft PR #734 (https://github.com/BunsDev/river-oaks/pull/734), head `fa083cf9df69bf6fc92f24098608aa29ba6d47c7` (signed; the core receipt above belongs to that tree), base `feat/destination-reference-20261028`. Hosted Verify pending at the time of this note.

Next bridge (increment 4 candidate): the Studio neighborhood compiler's region carries `parcels` with `bounds_m`; `destination reference` can turn a region's parcels into kit quarters, so Studio-drawn parcels decide where kit blocks go.

Gaps after increment 3: plazas and furniture are still typed per item; no bridge yet from Studio parcels to kit quarters. plazas, furniture and tree rows are still typed per item; no bridge from the Studio neighborhood compiler's parcels to kit blocks; the reference adapter reads axis-aligned grids only (curves are reported for hand authoring, by design).
