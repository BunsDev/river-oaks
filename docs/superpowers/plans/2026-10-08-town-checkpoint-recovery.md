# Hosted town checkpoint recovery

## Objective and ownership
Repair the hosted join failure while preserving saved town and account state.
Branch `fix/town-checkpoint-recovery-20261008` in the isolated login worktree owns
the explicit default-district migration, Redis recovery seam, regressions and this ledger.

## Evidence
The reviewed login/diagnostic source tree `43f8adf4703296b96118b0ec8006d4c6927b3ad2`
passed hosted CI. The updated branch has the same tree. Vercel staged build
`dpl_HTdjCKhdyLwBz5FuYtPr1r3vEWcV` passed anonymous session 200/false and ticket
401 before promotion. Live fixed diagnostics show join/checkpoint_invalid/invalid_envelope.
Historical public district comparisons show only building heights and height provenance
changed in `297d9bb` and `9dd65d2`; mapped XY geometry, entrances, terrain and vegetation match.
These revisions changed the full-data checkpoint fingerprint. Hosted deployment
`dpl_DeBqppbur7Qp1ZnSkNRGdE8pBkce`, source `c7c0850`, passed staged anonymous
session 200/false and ticket 401 before promotion. Signed-in Chrome then opened
the town and walking controls. Fixed success diagnostics recorded
`district_height_checkpoint_migrated` from `before_photo_facade_heights` to
`photographed_heights`, confirming the cause and successful fenced recovery.
No namespaces or saved state were reset. Safe receipt: `data/reports/login-hosted-recovery-20261008.json`.

## Implementation and checks
Test exact historical public fingerprints, complete payload preservation, source and
target validation, invalid/unknown geometry rejection, and real Redis fenced recovery.
Run focused regressions, isolated Redis server suite, core verification, independent
review and exact-head hosted CI. Confirm signed-in admission and physical storefront
traversal after deployment. Never reset namespaces or discard saved state.

## Gaps and next step
Focused migration: four passed, zero skips. Both known public revisions preserve the
complete payload, including an owned seat and active wish; corrupt, unknown, wrong-room
and newly invalid roof-flight states reject. Independent source review found no blockers.

`npm run verify`: all 11 tasks passed (tooling 17; preview 2501 passed / one pre-existing
skip; server 276 passed / 102 Redis skips; desktop 9; Python 141 with two existing
deprecation warnings; build/lint/format/secrets passed).
`REDIS_URL=redis://127.0.0.1:16493 npm run test:server`: 389 passed, zero skips, using an
isolated owned Redis service, stopped after verification. The Redis regression proves
preservation, fenced persistence and no repeat migration on restart.
`RIVER_OAKS_SHARED_REPORT=login-recovery-shared-20261008.json npm run test:shared required`:
nine journeys passed with full rendering; receipt `data/reports/login-recovery-shared-20261008.json`.
The first expanded creation fixture failed due to placement/cooldown setup; corrected
fixture setup retains all production rules, and the final runs above pass.

Latest main `c64ef6f` is integrated, preserving the 0.1.5 release and Street View work.
Final `npm run verify` on that combined source passed all 11 tasks: preview 2504
passed / one pre-existing skip, server 276 passed / 102 Redis skips, tooling 17,
desktop 9 and Python 141. The two Python warnings and build chunk advisory remain.
`REDIS_URL=redis://127.0.0.1:16495 npm run test:server`: 389 passed, zero skips;
the owned loopback Redis service was stopped afterward.

## Hosted walking
`data/reports/login-hosted-walking-20261008.json` records physical entry/exit at
Hermès, Vince and Steak 48 using the existing on-foot controller and synthetic
WASD input through native Chrome UI. The existing account used snow-leopard
beast movement (2.5 m/s walk); player clearance stayed 0.35 m. Server XY positions
match within 1 mm. Every physical segment retained its travel counter and had
zero corrections. Steak 48 glazing blocked its negative attempt; retreat passed.
No F entry, direct pose assignment, collision bypass or production fixture identity
was used for these segments. Exterior arrival is separately server validated.

The first probe had stale HUD frames with DevTools open; closing diagnostics while
walking resumed rendering. A coarse eight-direction Vince exit hit its exterior
corner; public static queries confirm an outward neighbor is blocked. Recentring
through six recorded centerline waypoints passed. Preserve both receipts: this
does not establish every arbitrary diagonal exterior route. Initial admission
used source `c7c0850`; the browser retained that build while the public backend
received concurrent main deployments, recorded in the receipt timeline.

Next: final exact-head hosted CI and authorized merge of PR #187, then verify the
main production deployment and clean reload. Human accessibility, complete image-
specific pillar signoff, native traversal and target-GPU performance remain open.
