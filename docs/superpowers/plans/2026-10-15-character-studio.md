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

Browser gate finished on the first increment:
- `pnpm run test:experience player-forms beast-movement`: passed, 139 + 17 checks.
  Preserved report `.runtime/character-studio/forms-and-movement.json`.
- `pnpm run test:experience character-contract`: passed, 4 checks; report
  `.runtime/character-studio/contract-browser.json`; both 1440×1000 screenshots
  inspected with actual rendered human/fox geometry and textures visible.
- Short whole-world p50/p95 frame intervals: human 16.7/33.3 ms; fox 16.7/33.4 ms.
  Full statistics and evidence limits recorded in design doc. Proposed desktop
  p95 target is not met by this sample; no final quality/performance claim.
- Signed commit `0730ff45` pushed; signature verified and forbidden-attribution
  check printed nothing. Background Git pack-refs hit installed ref guard;
  commit and push succeeded, no guard bypass performed.
- Draft PR https://github.com/BunsDev/river-oaks/pull/457; no merge authorization.

#440 now has a reviewed design, versioned contract, actual human/beast fixtures,
permission/migration tests and measured/rendered baseline in this PR. It remains
open pending maintainer review. Full goal remains active: next implement #441's
staged reversible editor using compatible authored controls, coordinate #442
catalog/preview rendering, then #443 publication and #444 acceptance. Native 4K,
modular customization, Redis publication, crowd/device matrix and human usability
are still unimplemented/unverified. Do not archive this active checkout.

## Takeover for #440 (claude:river-oaks-1b, 2026-10-18)
- **Ownership.** Val chose on 2026-10-18 to have this session take over #440 and #457. #461, #462 and #464 stay with Codex.
  - The handoff is recorded on the live register task `character-studio-contract-20261015`, from `codex-character-studio-20261015`.
  - Codex thread `01a14128` has been idle since 2026-10-18T01:38Z, and its #457 lease expired 2026-10-16T06:12Z.
- **Rebase onto main.** `origin/main` (`c17f9f1c`, 83 commits ahead) was merged in with a signed merge, with no force-push and no rewrite, so the stacked drafts stay valid.
  - Main had not changed any character GLB or the appearance catalog. Its only change in this PR's files was an unrelated `platform` argument in `player-avatar.js`.
  - The PR no longer carries register or plans-index edits (main's copies kept), so a register change on `main` cannot make it dirty.
- **Research.** No completed Character Studio report exists on this machine; only its prompt does (`4a4334e4…`). The prompt's ten sections are reconciled against code evidence in `docs/character-studio.md`.
- **Handoff.** `docs/character-studio.md` now holds a handoff for #441–#443: the contract seam, extension rules and persistence requirements.
- **Checks on the merged head:**
  - `node --test preview/tests/character-definition.test.js preview/tests/beast-forms.test.js`: 14/14.
  - `pnpm run test:experience character-contract player-forms beast-movement`: passed, with 4, 139 and 17 checks.
- **Rendered baseline, unchanged:** human 16.7/33.3 ms and fox 16.7/33.4 ms (p50/p95, whole world at 1440×1000). Both captures were inspected.
- The runner's tracked `data/reports/experience.json` rewrite was restored, not committed.
- **`pnpm run verify` (core) on the merged head (receipt 2026-10-18T04:27:44Z): passed, all 11 steps.** Agent 116, preview 3398 (1 skip), server 599 (154 Redis skips), desktop 76, build, Python lint, format and tests, demo and secrets.
  - A first run failed only `desktop/tests/sign.test.js`, with `Cannot find package '@electron/osx-sign'`.
  - The worktree had been installed at #457's old base, before `main` added that dependency. A `pnpm install --frozen-lockfile` fixed it; it was not a code defect.
- **Next:** Val's review of #457. Landing is not authorized yet.
