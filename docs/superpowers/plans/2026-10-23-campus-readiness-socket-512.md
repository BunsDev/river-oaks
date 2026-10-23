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

## Verified merge and handoff — 2026-10-23

PR #605 landed through the guard at reviewed signed integration head `cfc0f159014150be59bb7dda8322130fa2ac66a4`, merge `d9d8fff3bb894b28fc215b0e1ba40ff947e75166` (11:44:54 UTC), verified on fetched main. Verify `39946197482` passed all 14 jobs. Earlier candidate `f00e7987f1a45d4d0ba64f9dece0e0db8a2a14ad` passed clean core (11 phases), local office/suite/traversal 3/3 and isolated-Redis full (18 phases, finished 09:36:37 UTC); full counted Redis/server 1014 passed with zero skips, all 16 experience and 25 shared journeys and IPIC. Each hosted office/suite/traversal shard passed in all three existing attempts of Verify `39904396877`.

The raw full receipt retains `dirty: true` because the preceding focused journey generated an untracked report. Input/final provenance proves no tracked source delta and generated-report-only changes; reports and hashes are preserved under `.runtime/campus-readiness-socket/` in the integration checkout. Only generated paths were restored afterward, and owned Redis stopped. No receipt was rewritten as clean, and those local results are not promoted to the later integration head. The original staged source checkout remains untouched. #512 and #510 remain open for Val's human/device/GPU, public-control and built-client recovery evidence; real Computer and paid mode remain separate. No cleanup, deployment or issue closure is included.
