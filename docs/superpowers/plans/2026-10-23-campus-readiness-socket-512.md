# Campus readiness socket-replacement correction (#512)

Objective: publish and land the remaining reviewed readiness delta from the preserved local task. The user explicitly authorized commits, pushes and guarded merges on 2026-10-23. Basic helper/journey integration already landed in #545; this increment owns only the missing socket-generation check, temporal loopback regression and this ledger.

Owner `codex:505-followup-20261023`, task `campus-readiness-512`; integration branch `fix/campus-readiness-socket-512-20261023`, baseline `7bf0bbf61a58166809908d75ac42fcfa010a2057`. Original source branch/checkpoint at `a35214f3` and its staged evidence are preserved unchanged in `river-oaks-campus-readiness-512`. Original audit credit: session `01a15b91-4fd2-7e20-9b2d-8bbc7cf341ef`.

## Plan and owned files

- [x] Add the previously reviewed temporal regression to `preview/tests/garden-campus-readiness.test.js`; run against current helper and preserve expected failure.
- [x] Add only the six-line generation/closed-socket check before acknowledgement lookup in `preview/e2e/garden-campus-readiness.js`. A replacement socket must re-enter admission under the original deadline; same-socket correlation remains strict.
- [x] Run the entire 11-case loopback suite; inspect diff and bootstrap doctor.
- [ ] Run core, named office/suite/traversal journeys, and isolated-Redis full through the shared browser lock. Preserve first failures and exact revisions; never weaken server refusals, auth, waitlist, CSRF or deadlines.
- [ ] Signed commit/push/PR; verify exact-head hosted campus at least three times as requested by #512, record all attempts/pass rate, review findings and guarded land. Record commit/PR/merge separately and reconcile #505/register.

## Limits

The helper is provider-free test harness infrastructure, not production authority. A fixture regression demonstrates the current-main race; it does not identify the historical Linux suite-lift failure. No paid services, environment/revision/epoch/operator changes, asset downloads or issue closure. Physical devices, GPU, human accessibility, real Computer and paid mode remain explicitly unclaimed. Leases remain owner-issued and non-charging.

## Verified publication increment

Frozen pnpm, locked uv, core doctor and catalog completed. On this integration baseline, the temporal regression failed 1/1 before the helper edit, with `Startup acknowledgement did not match this socket and probe`; `.runtime/campus-readiness-socket/red.log`. After the six-line guard, the whole loopback suite passed 11/11, zero skips; `green.log`. `git diff --check` passes. The source/test delta matches the preserved reviewed local correction; no other source or historical reports are copied.

Publish this verified small increment as a signed draft while core/full/browser gates queue; draft publication is not a green or merge claim. Exact-head local gates and three hosted campus attempts remain mandatory. The user's frequent commit/push/merge instruction supersedes the prior local-only publication boundary.
