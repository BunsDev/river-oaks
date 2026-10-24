# Likeness consent, quota and audit follow-up #518 ledger

**Goal:** Adversarial review of the merged #518 fixture-only quarantine (PR590/591/592). Fix demonstrated gaps against the issue scope: consent, auditability and multiple-player isolation. No route, provider call, real likeness data or deployment.

## Ownership and baseline

Owner `claude:likeness-consent-518-20261023`; task `likeness-consent-audit-518`. Worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-likeness-consent-518`, branch `feat/likeness-consent-audit-518-20261023`, forked from `origin/main` `f4aa1670b2073fc6c8c9aeed2b167c7c3e5f6d8f`. Prior task `likeness-intake-518` (owner `codex:likeness-intake-518-20261022`) is delivered and its worktree is preserved untouched. Baseline on that revision: both existing likeness suites passed 37/37, with zero skips.

Owned files: `server/character-likeness-quarantine.js`, `server/tests/character-likeness-{quarantine,adversarial,consent}.test.js`, `docs/character-likeness-intake.md`, this ledger. There are no other importers of the likeness modules (`git grep character-likeness`).

## Demonstrated gaps on f4aa1670 (probe before change)

1. Cross-owner denial: terminal records were retained as tombstones that counted toward the 64-record cap. After 64 submit/delete cycles by `fixture-mallory`, `fixture-bob` received `likeness_capacity` for the life of the process.
2. Consent unmodeled: `submit(owner, bytes)` took no consent. The decision package claimed "approval binds the exact digest and consent generation", but nothing implemented it. Display consent could not be withdrawn separately from processing.
3. No audit trail, although the issue scope requires auditability.

## Change

- Submission requires a fixture consent attestation with exactly five fields: `policy` must be `fixture-consent-v1`; `adult`, `selfLikeness` and `processing` must be true; `display` is a boolean. Any other shape, including an extra identity field, is refused before a record exists. The attestation is copied on admission.
- `withdrawDisplay`/`grantDisplay` increment a grant generation, discard approval and the revision, and return the record to quarantine. Approval stores `{digest, grant}`. Publication requires display consent plus a matching approval. The signed payload includes `grant`, so earlier revisions resolve to the fallback.
- Only live records are retained. Terminal records leave memory immediately. Caps are four live records per owner and 64 per process.
- An owner-private, bounded audit holds `{at, action, actor, id}` only: 32 receipts per owner and 128 owners, with the least recently active owner evicted. It contains no bytes, digests, signatures or consent fields, and it survives deletion. It does not survive a process restart.

## Checks

- Red: `node --test server/tests/character-likeness-consent.test.js` failed on the missing export (`.runtime/likeness-consent-518/consent-red.log`).
- Green: `node --test server/tests/character-likeness-*.test.js`: 52 passed, 0 failed, 0 skipped (`focused-green.log`).
- Mutations, each reverted after the run: keeping tombstones failed 12 tests; removing the owner quota failed 1; leaving `grant` unsigned failed 1; carrying approval over a consent change failed 2. Removing the `display` check in `resolve` failed 0. That check is redundant because withdrawal already clears the revision; it is kept as defense in depth and is not claimed as tested.
- Core gate, first attempt: failed in tooling. Four project prune/cancel tests failed because host `/usr/bin/python3` is 3.9.6, which lacks `tarfile.extractall(filter=)`; the repository requires Python >=3.11. This is unrelated to this change. Preserved as `core-first-py39.{log,json}`.
- Core gate, rerun with the locked uv environment first on PATH (`PATH="$PWD/.venv/bin:$PATH" pnpm run verify`, Python 3.13.16): **passed**, 2026-10-23T18:48:35Z to 18:52:55Z, receipt `.runtime/likeness-consent-518/core.json` (base revision f4aa1670 plus this working tree). Counts: tooling 204/204; preview 3877 passed with 1 existing glazing skip; server 839 passed with 218 skips; desktop 115 passed with 3 Windows skips; Python 149 passed; secret scan found no leaks. The server skips are suites that need Redis or live gateways, which core excludes; they are not evidence. All four new consent/quota/audit tests appear in the server stage output.
- Not run: `verify full` (Redis, browser, audit). This change touches no route, transport, world or browser code, and the module has no importers outside its tests.

## Gaps and next action

- Real-user pilot remains **NO-GO**; the Decisions for Val table is unchanged. The consent attestation is a test shape, not age, identity or legal verification.
- The audit is process-local and in memory. It is not a durable 90-day receipt store.
- 2026-10-23: the user authorized push and a PR (no merge), and approved the rollout gate as NO-GO. The ruling is recorded in the decision package. Commits are unsigned because no signing key is configured in this checkout.
- PR #615 head 031d7ac3: all hosted checks passed on run 40009721006 attempt 2. The first Commons failure (`alice return: stalled`, the same signature as #592) is preserved in `hosted-615-commons-first.log`.
- 2026-10-23: Val approved every Decisions row as adopted policy, now recorded in the decision package. The evidence columns remain required and the pilot stays NO-GO. Val authorized a guarded merge of #615.
- Next: `pnpm run land 615`, then record the merge evidence in the register.
