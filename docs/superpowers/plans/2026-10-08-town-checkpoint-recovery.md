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

Latest main `79e391f` is integrated without altering its review-cleanup changes.
Next: complete physical walking and exact-head hosted CI before merging PR #187.
The first hosted route attempt is not passing evidence: browser HUD frames stayed
stale while server-approved exterior arrival updated, and the probe observed a
normal 1012 reconnect. Continue with the active rendered browser; do not treat
server travel as physical traversal or change collision rules to bypass it.
Human accessibility and native/target-GPU acceptance remain unproven.
