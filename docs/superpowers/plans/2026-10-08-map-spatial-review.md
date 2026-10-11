# Map spatial review

Objective: review district scaling, alignment and architecture end to end against
the repository level-design skills. **Browser corrections and acceptance are
complete; native acceptance remains open.** Overall readiness is not claimed.

Worktree: canonical `river-oaks`, branch `main`,
`014ea13bb644806ba8073cf93f15cdfb9602434a` with owned uncommitted edits.
Initial inspection used `2020849`. Other worktree edits/reports were preserved.

## Owned files

- `preview/src/store-rooms.js`: omit islands that cannot leave two 0.8 m aisles;
  narrow de Boulle display stations move 0.112 m toward the walls.
- `preview/tests/auto-navigation.test.js`: actual rear/return walking, retained
  fixture blocking and occupied center-aisle regressions.
- `preview/e2e/spatial-circulation.js`, `preview/e2e/spatial-streets.js`: normal
  rendered input, two-client/reconnect shop checks and the district loop.
- `docs/level-design/district/blockout-review.md`, this ledger, and
  `data/reports/map-spatial-*-20261008.json`: measurements, receipts and limits.
- Ignored local artifacts under `.runtime/map-spatial-review/` and
  `output/playwright/spatial-*`. The native staged district export was refreshed
  through its existing exporter after retaining a backup; no map binary changed.

## Evidence

- Source/controller/coordinate and architecture review complete. All 30 plans
  align with bays and remain inside nonoverlapping footprints. All 30 rendered
  door leaves measure 1.7 × 3 m; these are not measured net passage dimensions.
- Reproduced Zadig/de Boulle 0.519/0.469 m fixture gaps versus 0.70 m player.
  Regressions failed before correction. Current focused run: 11 passed, no skips.
- `npm run verify` after final product/test edits: passed at `014ea13`, dirty.
  Agent 17, preview 671, server 267, desktop 9, Python 141 passed. Server skipped
  101. Receipt `.runtime/agent/core.json`; `/tmp/river-oaks-spatial-occupied-core.log`.
- Debug-tools and desktop/touch contextual-first-visit browser journeys passed.
- `RIVER_OAKS_E2E_REPORT=map-spatial-final-browser-20261008.json npm run test:experience -- spatial-circulation spatial-streets`:
  exit 0, 65 checks, zero page errors. Both corrected shops pass 14 normal-input
  legs, occupied clearance, staff interaction, both camera modes, peer authority
  and reconnect. Wider district loop covers 270.55 m; all three endpoints agree
  with server positions within 0.168 m. Captures inspected.
- `RIVER_OAKS_SHARED_JOURNEY=indoor-npcs RIVER_OAKS_SHARED_REPORT=map-spatial-shared-20261008.json npm run test:shared -- required`:
  exit 0, eight checks, full Metal rendering with authenticated local fixtures.
- Native export tests: four passed. Editor Development rebuild succeeded with
  `-NoUBA`; initial UBA crash is not a pass. Native contracts: 25 passed.
- Native live transforms: all nine generated building dimensions match the
  refreshed export within 0.000001 m. Rendered street/day/night inspected.
- Actual native pawn/input stack with generated geometry: one temporary compiled
  NullRHI probe passed, 8.25 m forward and exact return plus blocking building
  sweep. This is fixed-step physics/input proof, not a timed rendered walk.
  Temporary source removed; cleanup rebuild succeeded.
- Final focused repeat passed all 11 tests; `git diff --check` passed.

## Gaps and next step

[The review report](../../level-design/district/blockout-review.md) is the durable
finding list. Native night visibility is a major unresolved issue; daylight was
only a temporary inspection control. Sustained rendered native traversal still
needs evidence: available native UI automation exposes discrete key presses,
not a controlled hold. The existing fixed-step probe is explicitly narrower.
Native boutique interiors, stairs/slopes and browser networking are unsupported.

Full Redis/audit profile, hosted CI/auth, human accessibility and performance
acceptance were not run. No native lighting redesign or broad geometry changes
were made to extend this review's scope.

Next: validate native night readability and sustained player-height traversal
before native sign-off. Browser corrections are ready for maintainer review;
commit/PR/delivery were not requested. Keep this worktree and undelivered edits;
it is not safe to archive/remove the worktree.
