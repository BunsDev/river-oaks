# Luxe boutique interiors and a futuristic executive office

**Status:** Val approved the stores and the office on 2026-10-11 (live review on the worktree dev server); PR pending.
**Owner:** Claude session `6136f6c0-2b65-4eef-92a0-9ce4bb13c5f4` (task `luxe-interiors-office`).
**Branch / worktree:** `feat/luxe-interiors-office` at `../river-oaks-luxe-interiors-20261011`, from `main` `a4412e8`.
**Request (Val, 2026-10-11):** "update all of the stores and create very futuristic office space that is still sleek and ultra-luxurious".

## Objective

1. Refresh every walk-in boutique (30 rooms, 12 themes) without changing room plans, fixtures, staff stations or movement.
2. Give the workplace room (Coworking studio fixture, #218 plan) a finished futuristic, luxurious office art pass on the measured plan.

## What changed

| Area | Files | Behavior |
| --- | --- | --- |
| Floors in 18 of 30 rooms | `preview/src/room-ground-clip.js` (new), `preview/src/main.js` (+5 lines) | The DEM rises across many footprints, so the outdoor paver ground poked through walk-in floors (up to 0.156 m, over up to 76% of a floor: Moreau, Oliver Peoples, Laura Rathe, Toulouse, Steak 48). Outdoor ground, road and sidewalk fragments inside room footprints are now discarded. Render only: ground queries, floor height and movement are unchanged. Hiding the interiors layer turns the clip off. |
| Palette suites | `preview/src/interior-luxe.js` (new) | Each store gets a deterministic suite (champagne, blush, sage, pearl limestone, midnight lacquer, walnut library) from its theme and id, so the 12 fashion boutiques span 6 looks. Walls and ceilings are tinted per room, and emissive fill follows the tint. |
| Floors | `interior-luxe.js` | Seamless book-matched marble (white, rosa, nero with gold veins), fine Venetian terrazzo with brass dividers, large-format honed limestone, chevron oak and walnut parquet, and an art-deco cinema carpet. They replace the busy chip terrazzo and the ring-vein marble. |
| Shell | `interior-luxe.js`, `preview/src/store-interiors.js` | Shadow-gap skirting with brass hairlines, a crown light reveal at 3.3 m, a double brass floor inlay, ceiling light slots, suspended halo rings (jewelry, perfumery, gallery, wellness), a wall-wash gradient, and fluted back-wall millwork in place of the aliasing 0.11 m slats. Flat emissive fill is reduced (walls 0.3 → wash-modulated, floors 0.18 → 0.075). |
| Display tables | `store-interiors.js` | Stone tops on a brass band with lacquer pedestals, same dimensions and contact classes. |
| Office | `preview/src/workplace-office.js` (new), `preview/e2e/fixtures/workplace.{js,html}` | Obsidian floor with light-lane inlays marking the 1.8 m aisle; backlit book-matched onyx back wall; gilded curtain wall onto a procedural night skyline; fluted ivory west wall with light blades; fluted graphite entrance wall with a gold portal; graphite ceiling with a double stadium halo; floating pearl desks with curved holographic screens; cognac executive chairs; black glass review table on a backlit onyx monolith with an orbital hologram; bronze and gold cabinetry; black ceramic planter; teal velvet rug. The fixture renders the office by default; `?finish=graybox` keeps the #218 blockout, so the #221 measurements stay reproducible. Showcase views `CAM-05`/`CAM-06` sit beside the measured `CAM-01..04`. |

The workplace plan (`workplace-room.js`), contract, routes, sockets, door (2.6 m) and avatar envelope are unchanged. Every office mesh carries the plan zone it occupies, and a test holds it there.

## Checks

| Command | Result |
| --- | --- |
| `node --test preview/tests/workplace-office.test.js preview/tests/workplace-room.test.js` | pass (office zones, doorway, disposal, animation; existing room tests) |
| `node --test preview/tests/interior-luxe.test.js preview/tests/room-ground-clip.test.js` | pass |
| Zone-test mutation (hologram moved 1.2 m into the aisle) | fails as intended, then restored |
| `pnpm run verify` (core) | passed: receipt `.runtime/agent/core.json`; preview 2635 tests (2634 pass, 1 skip), server 447 (337 pass, 110 Redis skips), desktop and agent suites, 141 Python tests, secret scan clean |
| Scratch district capture of 12 stores (one per theme) and 6 office views, before and after | visual evidence in the session scratchpad; no console errors other than the absent decisions backend (503) |
| Interior build time, headless Metal Chromium | main 91–99 ms per build; branch 286 ms on first build, 17–18 ms on rebuilds (canvases are cached) |

## Gaps

- Visual acceptance: Val approved the store refresh and the office on 2026-10-11 ("i approve"), after reviewing the live dev server. This satisfies the #221/#214 review gate for the office art pass as the fixture default. Browser automation is not human accessibility review.
- The office is a fixture site. It is not placed in the district (#216: no mapped tenant displaced; site choice is Val's).
- Not run: hardware frame-time budget, mobile and low tiers, `verify full` (Redis, browser journeys), Unreal, hosted CI.
- The GTAO normal/depth pass does not apply the ground clip, so ambient occlusion still sees the ground plane up to 0.16 m above some floors. The colour pass is correct.
- The Cartier pilot (blocked on review) owns overlapping lines in `store-interiors.js` (floor/wall shell). Expect a small rebase conflict there.

## Results

- Re-run after the last edits: `pnpm test` gives 2635 tests, 0 failures, 1 skip. `pnpm run build` succeeds (the existing chunk-size warning remains).
- `pnpm run test:experience workplace-room`: passed with the office as the default render. 180 frames, p50 0.4 ms and p95 0.7 ms (CPU submit, headless Metal Chromium; not a device budget). 231 draw calls, 46,079 triangles. Re-entry ×20: geometries 33 → 33.
- `store-interiors` fails at "Walking inside must be bounded by the room" (distance 0), and `storefront-lighting` at `#destination` `selectOption` (60 s timeout). Both fail identically on the unmodified base `a4412e8` (detached worktree `../river-oaks-luxe-main-baseline-20261011`), so they are pre-existing and unrelated to this change.
- Visual: 12 stores (one per theme) captured before and after in the district, plus office CAM-01..06. Pavers no longer show through any captured floor.

## Next step

Open the PR from `feat/luxe-interiors-office` rebased on `main`, rerun the gates on the rebased head, and merge with the guard script once hosted checks pass and Val confirms the merge.
