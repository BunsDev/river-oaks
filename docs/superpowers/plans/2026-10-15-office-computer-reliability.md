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
- [ ] Reproducible command, wire-byte and latency baseline and comparison for provisioning, discovery, entry, walking, reading, saving and revocation; empty/near-limit desks, multiple residents.
- [ ] Metadata-only fresh authorization/discovery; atomic writes, immediate request denial after revocation, fail closed, no scans/cache.
- [ ] Private/shared data, memberships, versions and receipts across replacement and Redis restart; lost responses/concurrency/deletion/reinvite/reconnect/stale retries; synthetic backup/restore.
- [ ] Existing shared-office journey in hosted and local full gates; preserve legacy visits, isolation, keyboard, narrow layout, draft recovery.
- [ ] Storage/durability/schema/recovery runbook with executable local validation.
- [ ] Focused tests, office journeys, core, uninterrupted applicable full gate, review, exact hosted checks, merge evidence.

## Findings and next action
PR #390 merged as c1cfd584. Its full run was interrupted; split coverage is historical evidence, not a current full pass. Current membership and discovery paths transfer and clone task content. Measure the baseline before changing these paths; project metadata from the canonical record inside Redis, retaining atomic writes and schema compatibility. Redis still decodes the bounded canonical record; measure and document that tradeoff.

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

## Verification in progress
Focused owned-Redis run: 10/10 tests passed, zero skips, including real gateway replacement/reconnect and synthetic AOF crash/RDB restore. Independent read-only review found no must-fix issue; reviewer independently passed 8/8 store/authorization/recovery tests with zero skips. Its optional metadata-test prerequisite consistency suggestion was applied. `pnpm run verify` passed (all 11 tasks): tooling 109/109, preview 3052 passed/one existing storefront skip, server 511 passed/144 Redis skips, desktop 66/66, Python 141/141, build/lint/format/secret scan and expected synthetic demo result. The isolated full run is in progress; no full pass claimed yet.

`RIVER_OAKS_E2E_REPORT=office-reliability-browser.json pnpm run test:experience office-desk office-computer-shared office-visit` passed: 22/6/11 checks; receipt `data/reports/office-reliability-browser.json`. Final owned Redis metadata/recovery rerun: 3/3 zero skips. Browser automation does not prove human accessibility or live hosted authentication.

Project check still reports unrelated ownership/retirement/PR-head gaps; own task is actively claimed. No unrelated state was changed or retired.
