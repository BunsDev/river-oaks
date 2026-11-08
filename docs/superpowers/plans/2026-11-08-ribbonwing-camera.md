# Ribbonwing camera flicker patch

The user requested a Ribbonwing flicker patch on November 8. Owner: `codex:01a1ae78-bd60-7961-9461-1bf12963ddf2`, task `five-places-sequential-20261104`, existing branch `feat/five-places-sequential-20261104`, base `d52a457fd3da0c7cc8e8f7ce43804b8a7e6802eb`. This bounded camera increment reuses the owned checkout. Preserve the separate PR #792 and #888 owners, all existing reports and the original foundation source/release holds.

## Objective and owned files

Prevent the chase camera from treating a boutique footprint as an indoor room while the Ribbonwing flies above its ceiling. Retain actual indoor ceilings, outdoor obstacles and continuous finite-canopy collision checks. Own `preview/src/third-person.js`, its focused test file, a bounded rendered camera journey and this ledger.

## Checks and results

Prerequisite doctor passed. Live task status and retirement inventory requested; unknown or unfinished worktrees remain preserved. Prior PR #792 identified the same room-height defect but has no merge or authenticated visual acceptance; its historical results do not qualify this revision.

New behavioral tests cover the current real district at 80 m in eight headings and three pitches, frame-by-frame room-boundary crossings, elevated/varying room ceilings, outdoor obstruction and continuous canopy clipping. All four new cases failed against the unchanged camera; the original three cases passed. The failure log is `.runtime/ribbonwing-camera-20261108/before.log`.

The patch classifies the target and every boom sample using the room ceiling elevation or its floor elevation plus room height. It preserves the point-camera clearance query and continuous finite-canopy segment guard from the existing repair. `node --test preview/tests/third-person.test.js preview/tests/flight.test.js preview/tests/carriage-motion.test.js preview/tests/ipic-camera.test.js preview/tests/ribbon-canopy.test.js preview/tests/ribbon-canopy-acceptance.test.js` passed 104 tests, zero failures or skips; the log is `focused.log` in the same receipt directory.

`RIVER_OAKS_E2E_REPORT=ribbonwing-camera-chromium.json pnpm run test:experience ribbonwing-camera` and the same command with `RIVER_OAKS_EXPERIENCE_BROWSER=webkit RIVER_OAKS_E2E_REPORT=ribbonwing-camera-webkit.json` passed. Each final run rendered 162 real-model frames across a real district boutique footprint in two headings. Every frame retained a 10.452870419 m camera gap, visible-body eligibility and rendered geometry, with zero page errors. Six captures per engine are under `output/playwright/ribbonwing-camera-{chromium,webkit}/`; sample captures were inspected. Final reports and source hashes are retained under `.runtime/ribbonwing-camera-20261108/`. This fixture exercises the production camera functions and current district collision environment; it does not drive the full authenticated town client.

The full fixture-client `RIVER_OAKS_E2E_REPORT=ribbonwing-camera-hover-coach.json pnpm run test:experience hover-coach` passed all 36 original boarding, driving, flight, roll, landing and exit checks, with zero page errors. Its report is retained beside the camera reports.

`pnpm run verify` completed with exit 0 and all 11 configured stages passed: tooling 307 passed; preview 5,295 passed, one skip and 30 TODOs; server 1,132 passed and 288 skips; desktop 134 passed and five skips; Python 215 passed. Production build, Python lint/format, synthetic demo/expected blocked demo-verification contract and worktree secret scan passed. Core excludes Redis/full-browser/native/live-auth acceptance, and skips are not acceptance. The terminal core receipt and log are retained in `.runtime/ribbonwing-camera-20261108/`; application and test source hashes matched after verification. Current camera bytes differ from the previously qualified C6 application, so the historical C6 full/hosted/integrated receipts remain scoped to that earlier revision.

## Gaps and next step

The camera source increment is locally verified and will be published as a signed commit in existing draft PR #902; Git records the exact owning commit. Do not equate a bounded fixture camera result with confirmation of every reported flicker, native/device acceptance, delivery or deployment. The user's optional clarification about whether the camera or aircraft surface flickers remains unanswered; the patch addresses the confirmed camera snap over shop roofs. The local inventory reports 72 worktrees and 67 branches; no cleanup candidate was removed and no checkout or branch was added. After publication, inspect the new-head hosted checks; existing #886 source-handoff and release holds remain separate blockers to delivery.
