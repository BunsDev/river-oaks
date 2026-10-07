# Agent workflow execution ledger

Objective: make repository discovery, setup, scoped changes, verification, and handoff executable for coding agents without changing game behavior.

Baseline: 35355a3. The original checkout contains unrelated native diagnostics work; implementation lives in the external `agent-workflow` worktree.

## Work

- [x] Inventory runtime seams, current CI, tests, docs, and dirty work.
- [x] Add root and scoped agent guidance and a concise architecture/task map.
- [x] Add checked-in verification profiles, environment diagnostics, and machine-readable receipts.
- [x] Exercise failure propagation and missing-prerequisite behavior with regression tests.
- [x] Connect tooling to CI and document bootstrap, browser/native limits, and handoff.
- [x] Run applicable checks, review diff, and record actual results and remaining gaps.

## Review findings

Existing strengths: locked npm/uv dependencies; hermetic Python and Node tests; real browser fixtures; pinned CI actions; staged and history secret guards; explicit evidence limitations.

Gaps: no agent entry point; verification commands scattered among docs; no unified receipt or dependency diagnostics; Redis skips can be mistaken for full acceptance; browser fixtures and native checks need explicit routing; local nested worktrees are not ignored.

Boundary: no paid calls, live account actions, asset downloads, deployment, commits, pushes, or cleanup of existing worktrees. Native binaries and production acceptance remain separate evidence requirements.

## Implementation

Root and five subsystem AGENTS.md files route agents to source, contracts, tests,
and evidence limits. Architecture and workflow docs provide bootstrap, scoped gates,
fixture usage, secret handling and handoff. `config/agent-workflow.json` is the
executable task catalog; `scripts/agent.mjs` provides JSON discovery/diagnostics and
sequential verification receipts with fail-stop, timeout and interruption handling.
CI runs the tooling gate and uploads its receipt. A PR template prompts exact
verification and remaining acceptance. Nested `.worktrees/` are ignored.

## Verification on 2026-10-06

- `npm run verify -- tooling`: 10 passed, including actual subprocess failures,
  missing executables/env, expected domain exits, timeouts, interruption, catalog
  resolution and CLI JSON/error behavior.
- `npm run verify -- python`: Ruff lint/format passed; 139 tests passed (2 warnings);
  synthetic demo generated and its expected blocked exit 2 verified.
- `npm run verify -- build`: production preview and landing build passed; existing
  chunk-size/plugin-timing warnings remain.
- `npm run verify -- server`: 240 passed, 78 skipped, zero failed. Skips are not Redis evidence.
- `npm run verify -- desktop`: 8 passed, zero skipped/failed.
- `npm run agent:doctor`: core prerequisites present. Full diagnostics correctly
  exit 2 for absent REDIS_URL; Chromium is installed.
- `npm run verify -- security`: worktree scan passed (113 MB), full local history scan passed (315 commits); no leaks found.
- `git diff --check`: passed. Original native working files remain untouched.
- The core run was deliberately stopped after about 7.6 minutes in unchanged
  `preview/tests/fragrance-release.test.js` under concurrent host load. Its receipt
  is failed/incomplete, not passing (711 preview passes were recorded). Only the owned runner/test processes were stopped.
  Other checks above ran through separate profiles. No preview behavior was changed.

## Remaining evidence and follow-ups

- Finish the uninterrupted core/preview gate on an available host. Full Redis/browser,
  native, packaged, live-auth, human accessibility and GPU acceptance were not run.
- npm audit reports one existing high-severity transitive `source-map-js` advisory,
  GHSA-68fv-2mgg-jv7q (fixed version indicated: 1.2.2). Dependency updates are separate
  from this workflow patch; no lockfile or dependency versions were changed.
- Changes are uncommitted on `chore/agent-workflow` in the external `agent-workflow`
  worktree. No push/merge/deploy. Keep this worktree until the patch is delivered.

## Delivery verification

Val authorized commit, push and merge. Rebased onto `297d9bb` (current main at
verification), preserving the upstream dependency audits, email/security checks and
reference-facade journey. Conflict resolutions received an independent review;
no important code issues remained. The local full/browser profiles now include the
new security-browser suite; full also includes npm audit. Documentation explicitly
keeps the hosted Python matrix and Python dependency audit as separate CI gates.

The uninterrupted core gate passed: 10 tooling tests, 725 preview tests, 267 server
passes with 101 skips, 9 desktop tests, 139 Python tests, lint/format, production
build, offline demo/expected-blocked verification and secret scan. The later catalog
update was verified with another passing tooling run and the two security-browser
checks. The npm advisory recorded above is resolved by the upstream lockfile update;
`npm audit --audit-level=moderate` reports zero vulnerabilities. The original
interrupted run is historical and no longer an outstanding core verification gap.

Hosted CI and PR state are the final delivery record. Native, live auth, packaging,
real OS share completion and human acceptance limits remain as described above.

## Shared-only main integration

Integrated main `772cab2` after PR #170 removed the solo runtime. Photo mode now
requires a connected, non-traveling shared session; account landmarks and removed
solo controls remain as on main. Independent integration review found no important
issues. Fresh `npm run verify` passed: 10 tooling, 650 preview, 267 server (101
Redis skips), 9 desktop and 139 Python tests, build, Ruff, offline pipeline and
secret scan. Named photo-mode, rail-navigation and connection-required browser
journeys passed. Development Electron photo acceptance passed again. The checked-in
photo receipts record these new runs; manual acceptance limits above still apply.
