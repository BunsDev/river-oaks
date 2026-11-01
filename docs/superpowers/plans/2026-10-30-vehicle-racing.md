# Vehicle handling and racing

Objective: improve motorcycle physics/animation and deliver playable racing maps demonstrating maneuverability. Clarification pending for the word “ribboning”.

Owner: Cody, cody-vehicle-racing-20261030. Branch: feat/vehicle-racing-20261030.
Worktree: /Users/buns/Documents/GitHub/BunsDev/river-oaks-vehicle-racing
Base: freshly fetched origin/main a56c0842a51c764856a5d44f9a7463105adfee8f.

Scope: carriage-motion.js, racing modules/page, Vite build entry, focused behavioral tests. Shared permissions and movement caps remain server-owned. Racing is a local practice mode without shared scores.

Checks: focused physics/race regressions, core verify, browser smoke. Results pending.

Status: incomplete. Next: tests first, motorcycle handling, standalone playable courses, verify.

Retirement: inventory saved in primary .runtime/racing-inventory.json. Existing units preserved because of active/unknown ownership, dirty/ignored data or unresolved retention; no cleanup authorized by this feature request.

## Implemented behavior

- Motorcycle: throttle limited to 4.5 m/s², 3 m/s² engine braking and stronger direction-change braking; bounded, damped lateral-acceleration lean. Existing safety brake and server speed caps preserved. Ground contact solves after lean.
- Garden Circuit at `/racing.html`: Garden Sweep, Rose Slalom, Crown Hairpins. All existing road vehicles available for local practice. Ordered forward gate crossing, countdown, stopwatch, per-course/per-vehicle local best, restart/pause, minimap, keyboard and pointer controls. Reduced-motion camera keeps its orientation fixed. Existing approval check precedes startup.
- Bicycle crank follows traveled distance in practice. No character rider added to the standalone showcase.
- The scope of “ribboning” remains unresolved; no ribbon behavior was changed.

## Verification checkpoint

- Focused tests observed failing before implementation, then passing; final log `.runtime/racing-focused-final.log`.
- All 9 vehicle/course combinations finish using the real integrator and conservative road clearance at moderate throttle. This is simulation evidence, not a human timed lap.
- `pnpm run test:experience racing`: passed 12 browser checks, including keyboard driving, pause/resume, safety brake, course reset, mobile pointer throttle and refusal without approved fixture access. `.runtime/racing-browser-final.json`.
- Desktop and 390 px screenshots inspected: `output/playwright/racing-desktop.png`, `output/playwright/racing-mobile.png`.
- `pnpm run build`: passed; `.runtime/racing-build-final.log`. Existing large-chunk warnings remain.
- `pnpm run agent:doctor`: passed after locked pnpm/uv install.
- Core and preview suite final results pending below. Core reported the unchanged land-pr directory-watcher test failing and remained alive waiting on its pending timer.

No commit, push, merge or deployment authorized/performed. Preserve the worktree; it contains undelivered edits.

## Final feature checks

- `node --test preview/tests/vehicle-racing.test.js preview/tests/carriage-motion.test.js`: 15 passed, 0 failed, 0 skipped.
- `pnpm run verify preview`: passed, exit 0; receipt `.runtime/agent/preview.json` (232533 ms).
- `git diff --check`: passed.
- Broad core gate remains incomplete until its runner terminates. No full Redis/browser suite, native runtime, live auth, human driving/accessibility or deployment acceptance is claimed.

## Final gate and delivery classification

- Preview totals: 4726 tests; 4690 passed, 0 failed, 1 skipped, 35 TODO. Existing HUD contrast TODO diagnostics are not passing accessibility evidence.
- `pnpm run verify`: failed (exit 1). The unchanged `scripts/tests/land-pr.test.js:163` test “the directory watcher alone wakes a waiter once its stream is live” failed after 15 seconds; the agent-tests stage subsequently hit its 600-second timeout. Core receipt `.runtime/agent/core.json`; full console `.runtime-racing-verify.log`. Later core stages did not run. This is not a green core gate.
- Motorcycle handling/lean: verified by focused physics/contact regressions and practice browser smoke; live shared-town rider visual acceptance remains unverified.
- Three racing courses: verified locally by simulation, browser interaction, screenshots and build. No hosted deployment or human completed-lap acceptance claimed.
- Ribboning: blocked on identifying the intended system (Rolls, bicycle riding, or ribbon movement effect).
- Overall delivery: incomplete, local uncommitted implementation on feat/vehicle-racing-20261030. Do not archive/remove this worktree. Next: clarify ribboning, finish that scope, then resolve/recheck the core gate before any separately authorized commit/PR.

## Ribbonwing continuation (Val clarified)

Ribboning means Ribbonwing. Source lives in open PR #779, branch feat/ribbonwing-20261029. Local task rebased onto dependency head dafd0bd4be636c1d2cd3478d7e2384db8625620f, with owned edits restored from `.runtime/motorcycle-racing-before-ribbonwing.patch`; no commits, remote writes or merges performed. Earlier main-base evidence is historical, not validation of this new dependency baseline.

Next implementation: bounded VTOL acceleration, turn-in-place yaw, damped flight bank/climb attitude, stable lift and obstacle-safe descent; altitude-sensitive gates and a Ribbonwing aerial racing mode using its existing mechanisms.

## Ribbonwing implementation and fresh checks

- `carriage-motion.js`: bounded airborne thrust/engine braking; turn-in-place yaw with smoothing; bank and climb attitude blended with ground clearance; lift substeps at 120 Hz, no target overshoot, descent collision check, no immediate re-takeoff within a landing frame. Existing server movement caps/admission remain unchanged.
- `racing-courses.js`, `racing-rules.js`, `racing.js`: select Ribbonwing for aerial versions of all three courses. Gates range from 8 to 13 m; ordered crossings validate interpolated altitude. Existing Ribbonwing fans, nozzles and landing-gear mechanisms animate from the current practice state. Keyboard/pointer lift and separate flight brake, altitude readout, wingspan-aware mobile camera.
- `player-avatar.js`: one garage link to `/racing.html`.
- `vehicles.test.js`: expected flight attitude updated from strictly level to bounded climb pitch.

Fresh checks on dependency head dafd0bd4 + dirty task patch:
- `node --test preview/tests/vehicle-racing.test.js preview/tests/vehicles.test.js preview/tests/carriage-motion.test.js preview/tests/ribbonwing*.test.js`: 51 passed, 0 failed/skipped (`.runtime/ribbonwing-focused-final.log`). Includes full simulated laps for all 3 aerial courses and all 9 road combinations.
- `pnpm run test:experience racing`: 17 checks passed (`.runtime/ribbonwing-racing-browser-final.json`). Earlier rerun reset to the default screen during concurrent build/verification and timed out; preserved in `.runtime/ribbonwing-racing-mobile-failure.json`. Final rerun after build passed.
- `pnpm run test:experience hover-coach`: 33 shared-town checks passed, including authoritative flight, mechanism transitions, landing and exit (`.runtime/ribbonwing-town-browser-final.json`).
- `pnpm run build`: passed (`.runtime/ribbonwing-build.log`).
- `pnpm run agent:doctor`: passed.
- `pnpm run verify`: unchanged lander directory watcher test failed again; deliberately interrupted its leftover 600-second wait with SIGINT through the runner's supported abort handler. Exit 1; `.runtime/agent/core.json` records `ABORT_ERR`, console `.runtime/ribbonwing-core.log` records original watcher failure. Later core stages not run.
- Preview suite final result pending below. No full Redis/native/live-auth/human-accessibility acceptance claimed.

Implementation is local, dependent on open PR https://github.com/BunsDev/river-oaks/pull/779. No commit, push, merge or deployment performed. Preserve this worktree.

## Current final disposition

The Ribbonwing ambiguity is resolved. Both vehicles' requested handling changes and the local road/aerial racing modes are implemented and locally verified. The latest `pnpm run verify preview` passed (exit 0, 247790 ms, `.runtime/agent/preview.json`). Earlier ambiguity and main-base records above are historical checkpoints.

The full core gate is still failed on the unchanged lander watcher test. Integration remains incomplete: no commit, PR, merge, or deployment for this task. Next action is to investigate/recheck that separate tooling failure before an authorized delivery. Preserve `/Users/buns/Documents/GitHub/BunsDev/river-oaks-vehicle-racing` on `feat/vehicle-racing-20261030`; no retirement or archive is safe while these edits are undelivered.

## Authorized delivery — 2026-10-30

Val requested commit, push, and merge into main. The racing implementation is unchanged from the playtest. The concurrent core tooling run reproduced the OS directory-notification assertion. A readiness-probe experiment did not resolve it and was reverted. A task-local temporary directory also exposed parent Git discovery in a fixture; subsequent verification uses `/Users/buns/Documents/racing-verification-tmp` outside the checkout. The complete core task list is being run through the existing `runProfile` API with only agent-test file concurrency set to 1, preserving every test and assertion. Receipt: `.runtime/agent/core-serial.json`; runner: `.runtime/verify-serial.mjs`. The watcher assertion passed in that run. No tooling source edits are included.

Main integration rehearsal is clean. The branch contains the open Ribbonwing dependency #779. Hosted verification and actual merge evidence remain pending. The installed merge guard lies outside the supplied filesystem boundary; access has been requested while verification proceeds.

Delivery core result: all 11 core stages passed using `.runtime/verify-serial.mjs`, receipt `.runtime/agent/core-serial.json`. Agent test files ran serially; all other stage commands are the configured core commands. Redis/native/live-auth and human acceptance remain outside this receipt.
