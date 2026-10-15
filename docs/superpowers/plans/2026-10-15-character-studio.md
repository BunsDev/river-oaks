# Character Studio #440–#444 execution ledger

## Objective and sequence
Deliver all five issue acceptance criteria: #440 contract and baseline; #441
reversible editor; #442 validated assets and native 4K capture; #443 authoritative
persistence and replication; #444 complete verification and release decision.
No merge, deployment or paid provider calls are authorized.

## Ownership
Task `cancelled-feat-character-studio-20261013`; session
`codex-character-studio-20261015`; branch `feat/character-studio-contract-20261015`.
Primary live register owns coordination. This checkout starts at `6dac1b21`.
Own contract module/tests, design doc and this ledger for the first increment.

## Current evidence
- Inspected root, preview and server instructions, architecture and lifecycle docs.
- Issues #440–#444 open; no open Studio PR in live GitHub inventory.
- Earlier branch archived at `3fdc842a`; archive contains no file named character
  studio/definition. Preserve archive; inspect any relevant diff before reuse.
- Existing appearance IDs select authored looks; rigs are not arbitrary meshes.
- Deep Research report is not supplied or accessible in this workspace; findings
  from it are unverified and will not be invented.

## Checks and gaps
Pending: contract behavioral tests, actual human/beast rig fixture, core verify,
rendered inspection, measured baseline, review and PR.
No acceptance criterion is marked complete yet.

## Next action
Implement strict versioned owner-scoped definitions resolving existing IDs and
permissions, with fixture tests using the existing loader; document migration and
unsupported controls before exposing any UI.

## First increment results (2026-10-15)
- Added `character-definition.js`, pinned `character-assets.js`, actual rig tests
  and `character-contract` browser fixture. Player loader now resolves contract.
- `pnpm install --frozen-lockfile`, `uv sync --locked`: passed; no env copied.
- `pnpm run agent:doctor`: initially missing Python environment; passed after sync.
- `node --test preview/tests/character-definition.test.js preview/tests/beast-forms.test.js`:
  14 passed, 0 failed/skipped (`/tmp/river-studio-contract-tests.log`).
- `pnpm run build`: passed (`/tmp/river-studio-build.log`).
- Core verify running; tooling and preview suites passed in runner receipt;
  server suite running. Final result not yet established.
- Browser `player-forms beast-movement` and `character-contract` queued behind
  live browser-lock owner PID 65043; no bypass. No rendered evidence yet.
- Read-only independent contract review: no blocking correctness/security or
  permission regressions; contract suite rerun 6/6. Review explicitly retains
  missing rendered/performance and full-issue acceptance gaps.
- GLB inventory measured in design doc; does not establish runtime performance.
- Archived player-avatar/shared-appearances/avatars source bytes match recorded
  archive base `3fdc842a`, so there was no dirty implementation in these seams
  to recover. Archive and all unrelated work remain preserved.
- Progress posted to #440: https://github.com/BunsDev/river-oaks/issues/440#issuecomment-6201228854

## Acceptance audit
#440 decision/contract/fixture implemented, pending final verification, rendered
inspection and reviewable PR link. Research report inaccessible. No claim of
completed baseline or downstream issues. #441 editor, #442 compatibility/4K,
#443 durable publication/replication and #444 E2E/usability/release remain open.

Follow-up: continue this same checkout/task; inspect live handles and receipts,
finish queued checks without restarting live runs, inspect human/beast captures,
record baseline, then commit verified increment and open PR. Continue #441–#444
in dependency order; do not merge, deploy or use paid providers.

Core gate finished: `pnpm run verify` exit 0; `.runtime/agent/core.json` status
passed. Tooling 112/112; preview 3302 pass, 1 skipped, 1 todo; server 598 pass,
153 Redis-dependent skips; desktop 69/69; Python 141 passed (66 warnings).
Build, lint/format, synthetic demo verification and secret scan passed. This
excludes Redis, browser, native, live-auth, target-device and human acceptance.
