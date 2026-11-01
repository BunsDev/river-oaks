# Visual foundation: default-on presentation increment

## Objective and authority

Val's latest direction is to build the visual/spatial foundation of Five Rooms and a Ribbon before new gameplay: new shape, five distinct blank architectural canvases, connected public circulation, landscaping and coherent Pink Jet-Age forms. Normal startup must not require a URL flag. This supersedes the earlier Classic-default and gameplay-first sequence in #738/#825. It does not authorize weakening verification or deleting saved ownership, character identity or permissions.

This increment addresses only the startup finish policy. It does NOT build the five venue shells, complete the Ribbon, replace ground geometry, or claim the visual foundation is complete.

## Source and ownership

Repository: BunsDev/river-oaks. Parent inspected: decb4e9ac8ee86ab0ed04fb97600550f96e502d5. Existing Ribbon stack #826 -> #827 -> #828, top head 1a85f2085a3103ccdba5947f22776c40a8aa73b3, is not modified or incorporated.

The execution container has no full checkout, cannot resolve GitHub/npm, and has no callable coding-subagent runner. Source was read through the connected GitHub tool and reconstructed locally with exact original Git blob hashes. A new remote branch isolates this increment from existing branches. The local live task register was unavailable; no register claim or running-agent status is asserted. The next executor must reconcile current main, live ownership, root/scoped AGENTS and the register before integration. No feature edit to the tasks.json snapshot is included.

## Changed behavior and files

- preview/src/render-quality.js: DEFAULT_FINISH becomes pink-jet-age. Explicit URL or saved Classic choices remain overrides. Query precedence, downstream validation, storage resilience, graphics quality and governor behavior are otherwise unchanged.
- preview/tests/kit-finish-live.test.js: update only the reader policy test and explanatory comment; keep direct builder/stream Classic fallbacks and unrelated integration assertions.
- preview/tests/finish-default-foundation.test.js: 18 behavioral tests covering no-flag startup, query/storage precedence, unavailable and blocked storage, malformed input, saved explicit Classic and unchanged graphics behavior.

A saved explicit Classic preference still selects Classic. This patch does not wipe user preferences. Unknown well-formed finish names retain the existing downstream builder-validation contract.

## Verification actually performed

Local runtime: Node v22.16.0 on a narrowly reconstructed source snapshot, not the full repository.

- [x] Original source hashes matched: render-quality.js 1f7ebf91ef153ef2ebeece76939b228ce3b79182; character-quality.js 01e682a163aa8238fbf1f1f43fe258e952093647; render-quality.test.js d862b6cad1dbfc8c6bc90c1cbc48a125b4775257; kit-finish-live.test.js 8710a4f441c777a5d252966bf434ba3fde518367.
- [x] Red test: new suite on original source had 10 pass and 8 expected failures, showing Classic rather than the requested default.
- [x] Green test: node --test preview/tests/finish-default-foundation.test.js preview/tests/render-quality.test.js: 39 passed, 0 failed, 0 skipped, including 21 unchanged governor/control tests.
- [x] Updated existing preference test block: 1 passed in isolation. This is NOT the full Three.js kit integration suite.
- [x] Syntax checks for changed JavaScript files.
- [x] git apply --check --whitespace=error; forward patch matches the candidate; reverse patch restores original files exactly; 39 tests passed on the applied reconstruction.
- [x] Uploaded source/test blob SHAs match the tested local candidate: 7a87c43246ab06fbdc0c3d13e096cb7d9b1f8586, ae21a4a9684275ea88a234ce2537ede9cf0fe276, 7f9033444e634ab925a810fc2f584b888f2f907a.
- [ ] Full repository tests, build and core/full verification in the project's declared runtime.
- [ ] Hosted CI merge gate and actual no-flag browser captures.
- [ ] Day/night, device/performance and human visual acceptance.
- [ ] Merge and production activation.

The missing gates require a full execution checkout. Isolated passing tests do not establish renderer, deployment or complete-neighborhood acceptance. Keep the PR draft until required checks are available and reviewed.

## Execution checkout results (#837, 2026-11-01)

Owner: claude:river-oaks-f0, taken over from river-oaks-6d worker:activation-837 at Val's direction (handover confirmed by river-oaks-6d). Work through `665147dd` ran in the previously registered checkout `../river-oaks-finish-default-825`. After that push, that checkout was detached at the same commit and the branch moved to a new worktree, `../river-oaks-finish-default-837`, with the `.runtime/finish-default/` and `.runtime/agent/` evidence copied there. The focused suites rerun in the new worktree: 61/61 pass, including the 4 blocked-storage tests. Live register task `finish-default-on-825-20261101`.

- Merged main `5ba4a3f0` (13 commits, includes #832 workplace finish) into the branch: merge `2ce693b2`, signed. Committed the preserved `docs/city-kit.md` live-default section (`1ec0ae58`) and a stale campus comment that still said the client "opts in" (`9d81dadb`, `preview/src/garden-campus-kit-finish.js`, comment only).
- Focused finish suites (`finish-default-foundation`, `render-quality`, `kit-finish-live`, `workplace-kit-finish`, `garden-campus-kit-finish`): 57 pass, 0 fail, 0 skipped.
- `pnpm test` (preview unit) on `2ce693b2`: 4837 tests, 4801 pass, 0 fail, 1 skipped, 35 todo. An earlier worker run on `6fce6eb3` (`.runtime/finish-default/preview-tests-1.log`) had one fail, the startup-acknowledgement timing test, which did not recur.
- `pnpm run build` with the access-entry check: passed.
- `pnpm run verify` (core) on `2ce693b2`: passed, 11/11 stages, receipt `.runtime/agent/core.json`. Agent 294/294; preview 4801 pass/1 skip/35 todo; server 1395 (1110 pass, 285 skipped: Redis-gated, outside core); desktop 132 (127 pass, 5 skipped); pytest 215 passed. Redis, browser and native coverage are not part of core.
- Browser startup evidence, `.runtime/finish-default/capture.mjs` (Commons loopback fixture, three fresh contexts, reads `window.__riverSpatialStream().finish.preference`; local evidence, not committed):
  - First capture `capture-2026-11-01T10-55-25-749Z/` on `2ce693b2`: clean no-flag ready in 4416 ms with `pink-jet-age`; explicit `?finish=classic` ready in 3876 ms with `classic`; 0 page errors. The blocked-storage page never became ready.
  - **Blocked storage found a startup bug that predates this PR, and it is fixed here.** When reading `window.localStorage` itself throws (site data blocked), the page reloaded about 31 times in 45 s and never reached the district. The cause: `createGuideMemory`'s default parameter `storage = globalThis.localStorage` ran while `main.js` was being evaluated, so the `import('./main.js')` in `access-entry.js` `checkAccess` rejected, and `reloadAfterFailedCheck` reloaded the page. The loop happened identically with `?finish=classic` and does not depend on the finish default; sessionStorage blocked alone started normally (`diag-blocked-1.log`). With that fixed, `createAxePanel` threw the same way in `initializeRenderer` ("WebGL could not initialize: Storage is blocked", `capture-2026-11-01T13-17-09-164Z/blocked.png`). The throwing sites were traced with CDP pause-on-exception (`diag-throw-{1,2,3}.log`). `salon-guide-content.js`, `throw-sounds.js`, `plaza-darts.js` and `axe-panel.js` now default to a guarded `deviceStorage()` (null when the read throws), matching the existing guards in `render-quality.js`, `voice-preferences.js` and `account-deletion.js`. Every other storage read on the startup path was already guarded. Regression test `preview/tests/blocked-storage-defaults.test.js`: 4 pass with the fix; on the original sources 2 of 4 fail (guide memory, throw sounds).
  - Final capture `capture-2026-11-01T13-20-57-160Z/report.json` (on `9d81dadb` plus this storage fix before it was committed, so the report lists those paths as dirty; all cases ok, host load 1-min 130–180, so readiness times are not performance evidence): clean no-flag ready in 8644 ms with `pink-jet-age`; `?finish=classic` ready in 6556 ms with `classic`; blocked storage (localStorage and sessionStorage getters throw `SecurityError`) ready in 6513 ms with `pink-jet-age`. 0 page errors in each; each logged two 503 resource responses from the fixture. The screenshots are startup frames taken while the district is still streaming, not matched finish comparisons.
- `pnpm run verify` (core) on `d87e25c4` (storage fix committed, worktree clean): passed, 11/11 stages, receipt `.runtime/agent/core.json`, log `.runtime/finish-default/verify-4.log`. Agent 294/294; preview 4841 (4805 pass, 0 fail; +4 regression tests); server 1395 (1110 pass, 285 Redis-gated skipped); desktop 132 (127 pass); pytest 215 passed. Host load 1-min ~100–200 during the run.
- Journeys that assumed Classic was the default: none found. Capture scripts that mean Classic already name it (`pink-jet-age-routes-plan.mjs` `districtPath`, `city-kit-review.js`, the workplace fixture). Every hosted experience and shared shard passed under the new default except depth. No assertion was relaxed.
- Hosted checks on `2ce693b2`: 29 success, 2 failure. The failures are `preview experience (depth)` and the `preview` aggregate it gates. Depth reports 10 new same-depth pairs, all `campus:jet-age:*`/campus shell and `garden-court:city-kit` trim/bronze. That is exactly #836 (Pink Jet-Age depth burndown), which is expected to stay red until #836 lands. Depth is not patched here.
- Hosted checks on `665147dd` (storage fix and ledger): 29 success, 2 failure. The failures are again `preview experience (depth)` and the `preview` aggregate, with the same 10 #836 pairs (campus jet-age/shell 7, campus core/slab 1, garden-court bronze/trim 2) and no new pair from the storage fix. Every other experience and shared shard, unit, CodeQL and verify (3.11/3.13) passed.

## Prepared specialist workstreams for the remaining foundation

These are dispatch instructions, not launched agents. Use actual isolated agent worktrees in a capable coding harness. Activation may proceed independently; publish one spatial contract before architecture and landscape run in parallel.

1. Activation: finish this increment's full repository and no-flag browser checks. Preserve explicit Classic comparison without changing graphics quality.
2. Spatial authoring: own config/ribbon and shared layout contracts. Author all five venue envelopes, public routes, entrances, camera exclusions and support heights using stable source IDs. Treat 3x imagery as design intent, not surveyed coordinates. Preserve specific Gardens 6/7/6 and B12/B23 contracts unless replaced by an explicit approved plan.
3. Architecture/materials: consume that spatial contract; own dedicated renderer/kit files. Build distinct Counter, Atelier, Screen, Garden-edge and Studio/Overlook shells with #F486A1, ivory, mint glass and approved restrained metals. Replace gray massing, not merely neon outlines. Leave coherent empty interior envelopes and future attachment points; add no gameplay.
4. Landscape/ground: consume the same contract; own planting, public ground and paths. Make courts generous, circulation legible and vegetation clear of doors/cameras. Visible walkable ground must match authoritative support/collision.
5. Integration: sole ownership of central scene wiring and any shared/server geometry reconciliation. Preserve existing functionality and saved IDs, and integrate other work without overwriting their branches. New gameplay, social systems, tenancy, media features and economy remain deferred.
6. Independent QA: inspect actual integrated source and renders. Verify clean/blocked storage no-flag startup, Classic comparison, all five shells, full route traversal, collision/camera/vehicle clearance, reduced motion, disposal and current performance budgets. Use matched noon/night street, seated, indoor and aerial captures, not generated art as evidence.

## Rollback and next action

Revert this increment to restore the prior startup default. No world IDs, persistent data or network protocols change, so no state migration is involved. The explicit Classic override remains available for comparison.

Next action: in a full authorized checkout, reconcile ownership, run focused and complete repository gates, inspect no-flag runtime output and review hosted evidence. Continue the spatial/architecture/landscape workstreams independently of new gameplay. Do not mark the overall visual foundation delivered from this selector-only increment.
