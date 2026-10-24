# Bayou Market Commons: luxury polish and road cohesion

Register task `bayou-luxe-polish`, branch `feat/bayou-luxe-polish-20261024`, worktree `river-oaks-destination-slice`, base `2cbc4dc4` (main after #611 landed as `00a36290`).

## Objective

Val reviewed the merged destination locally and asked for a polish pass. The roads should read as one network with the District. The destination should feel luxurious, modern and highly detailed, while keeping its own character: Market Street, the Bayou Green, the Bayou Lantern and the Lantern Walk.

## Audit (before)

The District's street vocabulary (`preview/src/street-profile.js`, `street-furniture.js`, `retro-palette.js`):

- **Roads:** crowned asphalt with 6 cm granite curbs.
- **Sidewalks:** porcelain paver sidewalks.
- **Lamps:** mid-century orbital lamps (opal globe, brass ring) on deep-teal bronze columns.
- **Tree pits:** bronze tree grates in pale stone surrounds.
- **Planters:** porcelain stone planters.
- **Palette:** ivory, porcelain, teal, deep teal and brass.

The Commons diverged on every one of these:

- **Lane:** a red brick shared lane.
- **Tree pits:** bare soil.
- **Lamps:** generic lanterns.
- **Ramp:** a flat ivory slab at the gateway.
- **Facades:** Heights-style red brick storefronts.

Captures: `.runtime/tmp/luxe-before/` (local review aid).

## Plan

1. **Road cohesion:**
   - Charcoal granite setts on Market Street, with porcelain cross bands at the tree rhythm and a flush bronze channel drain.
   - Granite curb edges.
   - The gateway ramp paved to match, so the District's sidewalk and street materials carry into the Commons.
2. **Street furniture:** District orbital lamps, bronze tree grates in stone surrounds, and modern stone-and-timber benches.
3. **Architecture:** a `luxe-modern` kit style for Market Row:
   - Honed limestone walls.
   - Full-height storefront glazing with slim black-steel mullions.
   - Cantilevered bronze canopies with downlight strips.
   - Vertical bronze fins and ribbon windows above.
   - Brass-letter signs on dark plates.
   - The garden court in travertine with brass.
4. **Landscape:** steel lawn edging and limestone-capped planter walls in place of curb-and-hedge edges.
5. **Budgets:** stay within the kit's draw-call (70), material (28) and triangle budgets. Regenerate locks. Keep connectivity at 1.0.

## Checks

- Focused city-kit and destination tests, with regressions for the new behaviour.
- `pnpm run verify`.
- `pnpm run test:experience east-garden-commons` on an untouched commit.
- In-game before/after captures at the same camera poses.

## Results

- [x] Before captures (`.runtime/tmp/luxe-before/`, base `2cbc4dc4`)
- [x] Road cohesion
- [x] Street furniture
- [x] Luxe-modern architecture
- [x] Landscape edges
- [x] Focused tests and core. The journey ran once, and its single failure is recorded below.
- [x] After captures (`.runtime/tmp/luxe-after-final/` and `luxe-evening-final/`), on merged head `4b5bbb85`

## Handoff and evidence (2026-10-24, claude:river-oaks-33)

Ownership moved to `claude:river-oaks-33 (3735c42c)` with Val's authorization (Decision 6 of `delivery-convergence-20261024`). The previous session, `claude:river-oaks-3d-d7424aaf`, ended before the 05:05Z reboot. The checkout held its uncommitted refinement pass, made after the `9a81c03f` after-captures. That pass was preserved and committed as signed `a1afd0d9`:

- gallery storefront interiors with lit display niches;
- pairs of slim limestone lane inlays in place of one porcelain band;
- honed limestone and travertine;
- locks regenerated as `934e393a`.

A signed merge of origin/main `c41c379a` followed and was clean. It gives head `4b5bbb85`.

| Check | Result on `4b5bbb85` |
| --- | --- |
| `node --test preview/tests/city-kit.test.js preview/tests/bayou-market-commons.test.js preview/tests/east-garden-commons*.test.js` | 28 passed, 0 failed |
| `pnpm run destination check` | Both locks reproduce: `934e393a5939ee60` and `333704daa8a64834` |
| `destination build` budgets | 95,928 / 260,000 triangles; 62 / 160 solids; 15 / 28 materials; connectivity 1.0; 5 of 5 lanterns reachable |
| Headless kit geometry against origin/main `c41c379a` (scratch script; trees and sign text excluded in both) | 64 against 57 meshes (draw-call budget 70); 3,605,536 against 2,277,280 geometry bytes (+58%); 37,740 against 23,904 rendered triangles |
| `pnpm run verify` (core) | Run 1, under `nice -n 19` at load 9.7, failed one test, `scripts/tests/land-pr.test.js` "a queued lander wakes on release…" (5 s), at the agent stage. That test also failed in other branches' core runs. The log is preserved. Run 2, without `nice`, passed: agent 226/226, preview 3952 with 1 skipped, server 870 with 219 skipped (Redis), desktop 115 with 3 skipped, Python 156, build, secrets. |
| `pnpm run test:experience east-garden-commons` (two clients, local, browser lock, one run) | Failed only at its final step, `alice home: stalled` (speed 0, zero velocity, standing, about 48 m inside the District, west of the Commons gateway). Every earlier step passed: walking to the Commons, shared chess, reconnect, all five lanterns, the Lantern Walk credit and the return. The signature (zero speed, standing client) matches the known intermittent walking stall behind main's red Verify (`alice plaza: stalled`, owned by `mvp-release-readiness-20261024`). One run cannot establish that, so this stays an unresolved journey failure. Receipt: `data/reports/bayou-luxe-journey-4b5bbb85….json`. |
| In-game captures | Before (`luxe-before`), and after on the merged head (`luxe-after-final`, plus `luxe-evening-final` with HOUR=19), at the same camera poses. Local review aids only. |

## Gaps and next step

- **Visual questions for Val, from the captures.** The paired lane inlays still read as white road markings from pedestrian height, although the code intends a laid stone detail. The porcelain display niches read as flat white rectangles from the court.
- **Performance.** The polish adds 7 draw calls and about 1.3 MB of kit geometry. #623's final-candidate paired comparison already shows desktop two-client CPU-submission p95 at +10.74%, over its 10% provisional allowance. The performance owner should measure this branch before release; no budget for kit geometry bytes is set.
- **Journey.** Rerun the two-client journey, or rely on hosted `preview experience (commons)`, to separate the known stall from anything this branch adds.
- Human visual approval, physical-device performance and production activation stay outside automated evidence.
- Next: draft PR, with no merge without Val's go. `commons-activation-rehearsal` (#630) reruns its rehearsal after this branch and #623 land.
