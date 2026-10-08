# Storefront pillar test execution

Objective: use the supplied image to select meaningful traversal tests without
requiring Val to identify a store. Continue the canonical checkout's
`2026-10-08-storefront-pillar-test.md` specification.

Baseline: `5bd8c27`, isolated branch `test/storefront-traversal-20261008`, sibling
worktree `river-oaks-storefront-test-20261008`. Canonical room-layout work is owned
by another task and was not copied or changed. Dependencies use the existing
node_modules via symlink; no credentials or private runtime state were copied.

## Image match

The screenshot's bags and hanging clothes match the fashion quadrant of
`preview/public/assets/interiors/retail-atlas.png`. The white-headed mannequins
with box-shaped sleeves match `retail-displays.js`, and their tall plinths,
shallow room depth and ceiling strips match the uncovered display-bay branch
in `district.js`. Strong inference: this is a shallow display alcove between
walk-in rooms. Exact store and capture revision remain unknown. Do not treat
every glazed display as an entrance or remove its wall collision.

Decision: test every mapped doorway, plus representative rendered entry/exit,
rather than guess the store name. The repeated backdrop is intentional generated
artwork, not proof of a fully modeled clothing rack. Actual doors are generated
separately with a pivoting leaf and pull handle.

## Reproduced issue and patch

Room planning required only ±0.35 m around the doorway center to fit inside the
room. The rendered door spans ±0.85 m. At baseline, Steak 48's left room bound
was -0.700844 m and Vince's was -0.384147 m, cutting into that aperture.
With a 0.35 m player radius, their usable left-center limits were approximately
-0.350844 m and -0.034147 m. An approach at -0.45 m therefore cannot pass.

The new regression uses the real `stepWalking` solver, without relocation or
teleport assistance: 30 stores × 3 frame rates × 2 speeds × 5 approach lines ×
2 directions = 1,800 routes, plus coverage and 30 negative glass/retreat cases.
Baseline: 1,770 passed, 60 failed, one skipped. Failures belong to Steak 48 and
Vince, across the left-edge and crossing-diagonal variants. Center paths pass.
Vince's chosen negative-test start is already obstructed; it is explicitly
skipped and provides no glass-collision proof.

Small correction: require both edges of the rendered doorway to fit in candidate
room spans using existing `DOOR_HALF_WIDTH`. No player dimensions, step limits,
server authority or glass blocking changed. The shared plan also supplies the
rendered room geometry, so this does not merely disable collision at a wall.

Focused fixed result: 1,838 passed, zero failed, one skipped, including existing
room containment/nonoverlap and all-boutique physical exit coverage.
Command: `node --test preview/tests/storefront-traversal.test.js preview/tests/store-rooms.test.js preview/tests/auto-navigation.test.js`.
Logs: `/tmp/storefront-traversal.log` (baseline), `/tmp/storefront-fixed.log`.

## Owned files and checks

- `preview/src/store-rooms.js`: candidate room-span doorway containment.
- `preview/tests/storefront-traversal.test.js`: exhaustive physical approaches.
- `preview/e2e/storefront-threshold.js`: Hermès, Vince and Steak 48 normal-keyboard
  approach, entry and exit, with second-client server-snapshot observations.
- This ledger and `data/reports/storefront-threshold-20261008.json`.

`npm run agent:doctor`: passed. `npm run verify`: passed all 11 tasks, exit 0.
Counts: tooling 17; preview 2,486 passed / one skipped; server 267 passed /
101 skipped; desktop 9; Python 141 with two warnings. Build, lint/format and
secret scan passed. Offline demo verification returned its expected blocked
exit 2, which does not establish real-world acceptance. Core receipt:
`.runtime/agent/core.json`; console log `/tmp/storefront-core.log`.

Only Steak 48 and Vince select different room extents after the patch; a direct
baseline/current plan comparison found no change to the other 28 rooms. Steak 48
keeps its width/depth with a shifted bay span; Vince selects the valid 14 × 9 m
fallback span. Existing footprint containment/nonoverlap tests pass.

Browser acceptance: **PASS**, including center entry/exit at Hermès, Vince and
Steak 48 and left-edge entry/exit at Vince and Steak 48. All 15 approach/traversal
legs reached their waypoints using real keyboard and drag-look input; a second
client observed each authoritative position. No browser errors. Command:
`RIVER_OAKS_E2E_REPORT=storefront-threshold-20261008.json npm run test:experience -- storefront-threshold`.
Receipt: `data/reports/storefront-threshold-20261008.json`; local screenshots:
`output/playwright/storefront-threshold-*.png`. The Vince interior screenshot was
visually inspected; this does not establish general visual-quality approval.

Earlier
attempts exposed harness limitations: a setup fetch failure, an eight-direction
driver drifting into adjacent glass, and fine look gestures remaining inside the
existing 5 px drag dead zone. The harness now turns using real pointer input,
accounts for the dead zone, brakes for inertia and waits for a settled waypoint.
Gameplay controller behavior was not changed to accommodate the test.

Final `git diff --check` and Node syntax checks passed. Automated doorway-fix
acceptance is complete. The broader pillar specification retains its visual,
human-review, native and production gaps. Integration must preserve the separate
canonical checkout's in-progress display-clearance changes in `store-rooms.js`.

## Delivery verification

Val authorized commit, push and merge on 2026-10-08. The branch was advanced
without conflicts to `014ea13` before repeating validation on the combined patch.
`npm run verify` passed all 11 tasks: 17 tooling, 2,498 preview, 267 server,
9 desktop and 141 Python tests passed. One obstructed negative-glass test and
101 Redis-dependent server tests skipped; two Python warnings remain. Build,
lint/format and secret scan passed. Logs: `/tmp/storefront-precommit-core.log`.
The two-client storefront journey also passed again with all 15 legs and no
browser errors; the checked-in receipt is from this rerun. Final diff and syntax
checks passed. Hosted PR checks remain the merge gate.

Full Redis, live hosted authentication, native,
human accessibility, unfamiliar-user entrance identification and target-device
performance remain outside these automated checks. Preserve worktree until
the patch and evidence are delivered.
