# Office computer reliability

## Objective and ownership
Bound daily office database work without new services, storage architecture, auth changes or maintainer provisioning. Prove application replacement and configured Redis recovery; maintain shared-office browser acceptance and a short operational runbook.

Task `office-computer-reliability`; session `01a13dbe-349d-79c1-aa5c-f66ecac56a50`.
Branch `fix/office-computer-reliability`; isolated sibling worktree of the same suffix.
Base `a714a8a5` from freshly fetched origin/main. Primary live register owns the claim.
Existing primary edits, stashes and other worktrees are preserved. Production operations and worktree deletion are excluded. Signed commit, push, PR and `pnpm run land` are authorized after verification.

## Owned files
Workspace store and visit authorization, focused office tests and disposable Redis helpers, cost fixture, maintained CI/profile journey lists, office operations documentation, this ledger and own task entry.

## Requirements and evidence
- [x] Reproducible command, wire-byte and latency baseline and comparison for provisioning, discovery, entry, walking, reading, saving and revocation; empty/near-limit desks, multiple residents.
- [x] Metadata-only fresh authorization/discovery; atomic writes, immediate request denial after revocation, fail closed, no scans/cache.
- [x] Private/shared data, memberships, versions and receipts across replacement and Redis restart; lost responses/concurrency/deletion/reinvite/reconnect/stale retries; synthetic backup/restore.
- [x] Existing shared-office journey in hosted and local full gates; preserve legacy visits, isolation, keyboard, narrow layout, draft recovery.
- [x] Storage/durability/schema/recovery runbook with executable local validation.
- [x] Focused tests, office journeys, core, uninterrupted full gate and independent review.
- Delivery proof: PR #394 and the primary live task register hold final-head hosted checks and merge evidence; those remain required before landing.

## Baseline findings
PR #390 merged as c1cfd584. Its full run was interrupted; split coverage is historical evidence, not a current full pass. Baseline membership and discovery paths transferred and cloned task content. The measured change projects metadata from the canonical record inside Redis, retaining atomic writes and schema compatibility. Redis still decodes the bounded canonical record; the cost table records that tradeoff.

## Measured comparison
Same host, five samples, loopback AOF always; shared desk 127,971 bytes with 24 tasks and four residents. Private desks are seeded to the same task payload. Commands include Lua subcommands. Latencies are noisy local medians, not production estimates. Full empty/near-capacity samples: `data/reports/office-database-cost.json`. Reproduce with `node scripts/office-database-cost.mjs a714a8a5` then `node scripts/office-database-cost.mjs`.

| Near-capacity operation | Sent + received bytes before → after | Commands before → after | Median ms before → after |
| --- | --- | --- | --- |
| provision-new | 2131 → 2419 | 8 → 9 | 7.20 → 5.41 |
| provision-existing | 131572 → 875 | 1 → 2 | 0.87 → 0.89 |
| discovery-four-residents | 528410 → 6258 | 11 → 18 | 5.20 → 4.68 |
| enter-four-residents | 526288 → 3500 | 4 → 8 | 2.06 → 2.83 |
| walk-40-authorizations | 5262880 → 35000 | 40 → 80 | 49.22 → 32.73 |
| reconcile-four-visits | 526288 → 3500 | 4 → 8 | 1.66 → 2.59 |
| read-four-residents | 526288 → 526288 | 4 → 4 | 3.52 → 2.26 |
| private-read-four-residents | 521484 → 521484 | 4 → 4 | 1.75 → 1.68 |
| private-save | 261194 → 261194 | 4 → 4 | 9.43 → 7.58 |
| save | 396294 → 396294 | 16 → 16 | 9.32 → 8.20 |
| revoke-and-deny | 527853 → 527853 | 16 → 16 | 9.75 → 8.51 |

Movement/discovery/entry/reconciliation/provisioning no longer transfer task documents; EVAL adds command/script overhead and still parses canonical JSON. Empty-desk transfer increases; task reads, saves and revokes intentionally retain the full-record path. No stale metadata cache or new schema is introduced.

## Focused and core verification
Focused owned-Redis run: 10/10 tests passed, zero skips, including real gateway replacement/reconnect and synthetic AOF crash/RDB restore. Independent read-only review found no must-fix issue; reviewer independently passed 8/8 store/authorization/recovery tests with zero skips. Its optional metadata-test prerequisite consistency suggestion was applied. `pnpm run verify` passed (all 11 tasks): tooling 109/109, preview 3052 passed/one existing storefront skip, server 511 passed/144 Redis skips, desktop 66/66, Python 141/141, build/lint/format/secret scan and expected synthetic demo result. At that stage the isolated full run was still in progress; its eventual result is recorded below.

`RIVER_OAKS_E2E_REPORT=office-reliability-browser.json pnpm run test:experience office-desk office-computer-shared office-visit` passed: 22/6/11 checks; receipt `data/reports/office-reliability-browser.json`. Final owned Redis metadata/recovery rerun: 3/3 zero skips. Browser automation does not prove human accessibility or live hosted authentication.

Project check still reports unrelated ownership/retirement/PR-head gaps; own task is actively claimed. No unrelated state was changed or retired.

## Delivery and full-gate recovery
Signed commit 43ae449 pushed in PR #394. Initial full gate passed dependency audit, tooling, client, 697 Redis server tests (zero skips), 66 desktop tests, build, Python 141 tests/lint/format/demo, and secret/history scans. It failed before security-browser execution because Playwright chromium_headless_shell-1248 was absent; reflections, experience and shared were not run. Failed receipt retained at `.runtime/office-reliability/full-first.json`; this is not a full pass. Installed the missing prerequisite with `pnpm exec playwright install chromium`.

Integrated origin/main cede4d1c (#391 Studio stdin, no office path changes) without application conflicts. That integration was verified before its signed merge commit; subsequent full and hosted results follow below.

Integrated `pnpm run verify` passed again (`/tmp/office-reliability-integrated-core.log`, `.runtime/agent/core.json`). The office implementation is unchanged; the incoming Studio changes are included in that core pass. At that stage the full rerun was live with the repaired browser prerequisite.

## Hosted transport-fixture correction
Hosted Verify run 38681283993 on d623eafd failed the Redis office transport case with `UND_ERR_SOCKET: other side closed`: the replacement reused the closed server's port and Undici's old connection pool. The fixture now binds a fresh endpoint before reconnecting both synthetic accounts. It proves persisted gateway state over fresh HTTP/WebSocket connections, not transparent same-origin failover. No application code changed. Five consecutive runs of `node --test server/tests/office-desk-transport.test.js` with owned Redis passed (10 cases total, zero skips). Independent review found no required issue. The continuing full run exercised the earlier fixture successfully; the correction has separate repeated coverage and must pass final-head hosted CI.

Clarified runbook assumptions: version/receipt records must not expire or be evicted, and restoring an older backup cannot retain newer deletion/revocation fences. Provider policy remains uninspected and unchanged.

## Uninterrupted full result
`REDIS_URL=<owned-loopback-service> pnpm run verify full` passed all 17 tasks. Tooling 109/109; client 3052 passed/one existing storefront skip; Redis server 697/697 with zero skips; desktop 69/69; Python 141/141; audit/build/lint/format, expected synthetic demo exit, secret/history scans, security browser (2/2), WebGL reflections, all 13 experience journeys and all 21 shared journeys passed. The owned Redis process exited and its temporary directory was removed by the fixture wrapper. No production service was used.

`data/reports/office-reliability-verification.json` records the full receipt, every browser journey and hashes of retained raw evidence. Original shared/experience reports were copied to `.runtime/office-reliability/full-{shared,experience}.json` before restoring the tracked historical reports. The earlier missing-browser failure remains a failed receipt. The full run covered the v8 runtime tree subsequently signed as d623eafd; the final fresh-HTTP-endpoint fixture correction has five repeated focused passes and green hosted checks on 20d5892.

All 16 hosted check runs on 20d5892 succeeded, including aggregate preview and office journeys. Main then advanced with IPIC checkpoint/writer v9 and the desktop walk-fixture change. Their clean integration passed final core plus focused office/checkpoint/Redis tests and the three office browser journeys. The office store/authorization implementation is unchanged. Final hosted checks on the integrated head remain the landing gate.

## Final v9 integration verification
Integrated main `0cb10518706490372223f7f763f774551d86a089`. `pnpm run verify` passed all 11 stages: tooling 109/109, preview 3056 passed/one existing storefront skip, server 522 passed/146 expected Redis skips, desktop 69/69 and Python 141/141. Owned-Redis office authorization/recovery/workspace/transport/office/checkpoint tests passed 37/37 with zero skips. `RIVER_OAKS_E2E_REPORT=office-reliability-v9-browser.json pnpm run test:experience office-desk office-computer-shared office-visit` passed 22/6/11 checks. Raw logs and receipt hashes are retained in the verification manifest.

Independent review found no office authorization/reconnect regression. It caught an incoming v9 rollout-audit assertion still expecting checkpoint 8. Corrected that assertion to 9 and executed the existing actual-prior-v3/current-v9 coordinator audit with owned loopback Redis and archived source `23f2503ecd81e4ddb230c39773022bc2828504e3`; all five checks passed, including obsolete-writer fencing and retained assembly. Receipt: `data/reports/office-reliability-v9-rollout.json`. No production database was accessed.

Local implementation, review and verification are complete. Final-head hosted checks and authorized `pnpm run land 394` remain; the primary live register will record exact merge evidence and ownership release. The worktree and raw evidence are preserved.
