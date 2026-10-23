# Campus #508 acceptance evidence plan

> Execute this evidence pass in the current isolated worktree. The user authorized tests, signed commits, push and a reviewable PR; no merge, deployment, issue closure or lift UX implementation.

**Goal:** Map every #508 acceptance box to current tests, fill missing regressions, record the lift choice and physical-device checklist, and obtain core, isolated-Redis full and hosted campus-traversal evidence at the candidate head.

**Architecture:** Keep the existing campus-wide elevation-keyed plan, paired server portals and per-level walking environments. Add behavioral assertions against the production shared world; distinguish the older standalone support fixture, real transports, browser emulation and physical acceptance.

**Tech stack:** JavaScript ESM, Node test runner, Three.js/Vite, Playwright, isolated Redis and Python verification.

**Spec:** [#508](https://github.com/BunsDev/river-oaks/issues/508), especially the authorized October 22 evidence-pass comment. Baseline `52379be69efd395d624fedd57eeee8e283850a62` from fetched origin/main.

## Ownership and constraints

Task `garden-campus-traversal-508`; owner `codex:508-evidence-20261022`; branch `test/campus-evidence-508-20261022`; sibling checkout `../river-oaks-campus-evidence-508`. Preserve the retired implementation's register evidence and archive records. ListAgents returned only this thread; the shared register and worktree inventory identify other sessions separately. No open #508 PR was present. Do not touch `campus-readiness-512` or other branches. Preserve source/scene coordinate units, walking/collision rules, ground/upper separation and landing clearance. No env files or production revisions are changed.

Owned files: this ledger, `server/tests/garden-campus-traversal.test.js` and `preview/e2e/multiplayer-lifecycle.js` (deterministic late-result coverage identified by review).

## Review focus

Forged destination fields must not redirect a valid portal. Lateral approaches must not bypass either bridge guard. Wrong protocol/contract versions and stale grants must fail at their actual owning seams. A late command reply must not revive a disposed client. Reachability grids and HUD feet measurements must not be described as physical-device or complete visual acceptance.

## Tasks

- [x] Read current instructions, issue, live ownership, open PRs, source owners/callers and existing tests; create the authorized sibling worktree and install locked dependencies.
- [x] Add named production-world regressions for forged lift destinations and lateral bridge entry; verify unchanged authoritative state on refusal and a valid command control.
- [ ] Run focused server/levels/lease/migration tests, then `pnpm run verify`, then `pnpm run verify full` with a task-owned loopback Redis. Preserve first failures and exact receipts.
- [ ] Review the diff and acceptance scope; signed commit and push; open a PR and require its hosted campus-traversal shard to pass. Publish one evidence comment for this increment.

## Acceptance map

These are source mappings, not fresh pass claims until the verification section records the run. The seven issue boxes stay conditional on their stated scope.

| #508 box | Named evidence on baseline main | Scope and remaining gap |
| --- | --- | --- |
| 1. T1 lift/stairs → B12 → T2 → B23 → T3 → another core to street | `server/tests/garden-campus-traversal.test.js`: “a resident rides T1 up, walks Floor 4 through both skywalks into T3 and returns to the street by T3’s stairs”; browser `garden-campus-traversal` | Server walks use 0.12 m poses; browser walks use held W and view turns, with F/Shift+F portal actions. No bridge teleport. Stairs use the delivered paired-portal mechanism, not a claim of animated continuous footfall on every tread. |
| 2. Every public terrace/roof and clear circulation | `preview/tests/garden-campus-levels.test.js`: “Floor 4 is one walk from T1’s lift through both skywalks to T3, and every public floor, terrace and roof is reached from its cores”; “a free body never overhangs the edge of its floor…”; `garden-campus-layout.test.js` clear-width, landing and blocked-route assertions | All public surface regions and landings are checked in the walking environment, with 0.25 m reachability and 0.5 m edge sampling. Browser visits T2 roof; physical and rendered inspection of every route remains a separate acceptance limit. |
| 3. Two residents above/below, occupied landing | Traversal tests “a walker under B12 and a visitor on it stand at one x/z…” and “someone on a landing never keeps a resident off a floor…”; `garden-campus-traversal-transport.test.js`: memory/Redis “a walker under B12 and a visitor crossing it share the town at their own heights”; browser `garden-campus-traversal` | Real ticket/WebSocket clients agree on height; separate levels keep bodies apart; occupied landing selects a clear adjacent arrival. Emulated phone shares the browser route. |
| 4. Forged level/height/destination, wrong version, side entry, off-edge, private shortcut | Traversal “forged levels, heights, portals, edges, walls, suites, flight and travel are refused by the server”; new destination/side-entry cases below; `creator-transport.test.js`: memory/Redis rejects old/unversioned clients before joining; `campus-leases.test.js`: “clients cannot mint units, operator authority, owners or prices; wrong world, version and terms are refused” | Public portal commands carry only a portal ID; protocol compatibility is enforced at transport, lease compatibility at campus commands, persisted geometry compatibility at the world fingerprint. The support fixture's version test alone is not production-world evidence. |
| 5. Reconnect, late replies, removal and stale admission | Traversal transport reconnect resumes Floor 4 and walks again; `district-gardens-checkpoint-migration.test.js`: “the configuration rollback clears every campus floor, seated tenants included, and the garage restores”, and “the switch refuses other worlds, another campus revision, corruption and laundering”; `campus-leases.test.js`: “duplicate and late commands cannot double-acquire, revive a revoked lease or overwrite a newer version”, “guests enter only through an explicit tenant grant…”; browser `multiplayer-lifecycle` rejects pending commands on disposal and ignores queued frames | Reconnect is campus-specific; disposal is generic production client command coverage. Public poses cannot supply admission, and current server lease access is rechecked. Live lease revocation acceptance belongs to #510/#512. |
| 6. Keyboard, touch, reduced-motion arrival and exit | Browser `garden-campus-traversal`: desktop reduced motion, F/Shift+F, 390×844 hasTouch lift taps and return to T1 hall, T3 stair exit | **Unchecked physical acceptance:** phone walking in this journey still uses keyboard W, with taps for lift controls. Neither full touch locomotion nor real iOS/Android/tablet behavior is proven. Use the checklist below. |
| 7. Transport/client support agrees with rendered feet/bridges/lift/stairs | Traversal transport exact source altitude; browser `garden-campus-traversal` compares server support to HUD eye minus 1.68 m within 0.05 m, with B12/under-B12/T2-roof captures | HUD camera-foot agreement is not a measurement of animated avatar soles or lift-cabin/tread contact. Matched captures and human visual/device review remain named limits; do not check this broader box solely from numerical HUD assertions. |

## Decisions for Val

**Lift proposal:** Keep one-floor-per-press as the current verified behavior. A floor picker would make six- and seven-floor towers easier to navigate: show the current floor, public floors/terraces/roof and a clearly labeled Ground floor exit; support keyboard focus, touch and reduced motion. Selecting a floor should submit one destination ID that the server validates against the current tower, source reach, compatible plan and clear landing. Do not simulate a picker by firing a client loop of adjacent-floor commands. This would need a separately approved command/UI design and regressions for occupied landings, stale source/plan, disconnect and input parity. Val can choose the picker or retain adjacent-floor actions; no implementation is included here.

**Closure decision:** Keep #508 open while broad physical/visual criteria remain unproven, or explicitly carry physical touch/visual acceptance to #505 before closing. This pass does not close either issue or silently waive criteria.

## Physical-device checklist (human-held)

Record tester/date, exact candidate commit or deployment identifier, URL, device/model, OS/browser version, orientation, reduced-motion setting, input, route, result and evidence link. A desktop emulation result does not fill these rows.

- [ ] iPhone Safari touch: enter T1, operate lift with taps, walk B12/T2/B23 using actual touch locomotion, descend via T3, leave the hall and verify ordinary street walking.
- [ ] Android Chrome or iPad Safari touch: repeat that route; check portrait/landscape controls, More disclosure and no overlap from chat/panels.
- [ ] Repeat arrival/exit with the device's reduced-motion preference enabled; confirm server destination and supported feet without relying on an animation.
- [ ] Two devices/residents: one beneath B12, one above; occupied landing; no wrong height, body overlap, persistent correction or blocked exit.
- [ ] Visit six public terraces and three roofs; verify clear galleries/landings, rendered soles/deck and lift/stair arrival contact, then a reliable ground-floor exit from each core.
- [ ] Interrupt/reconnect at Floor 4 and on a bridge; resume on valid public support and walk to an exit. Record any loss or trapped state without changing production configuration.

## Verification and next action

Locked pnpm/uv setup completed. `agent:doctor full` initially exited 2 only because REDIS_URL had not yet been assigned; Chromium and other prerequisites were present. Baseline focused tests passed 10/10; the expanded focused suite passed 62/62 with zero skips against isolated Redis. No fresh core/full/hosted pass is claimed yet.

Next: finish the running lifecycle check and required gates, then deliver the verified candidate PR. Preserve `.runtime/campus-508/` receipts and keep historical tracked reports unchanged after copying task evidence.


## Review and first-run evidence

Independent review found the new server regressions sound and the physical/visual limits accurate. It found one important gap: the previous lifecycle journey disposed with a pending command but did not guarantee a result arrived afterward. The journey now holds a real successful `homeAccess/list` response at the production client's message listener, disposes, releases that exact event, and checks that the rejected action stays unconfirmed and client state/callbacks remain disposed. This is generic command-lifecycle coverage, not a fabricated campus destination.

Baseline traversal/levels: 10/10 passed. New traversal suite: 7/7 passed. The first new off-edge assertion expected `blocked` beyond all support; actual behavior correctly returned `invalid_ground`. The corrected test separately checks guard overlap (`blocked`) and absent support (`invalid_ground`), without changing production code. First output is retained at `.runtime/campus-508/regressions.log`; corrected output at `regressions-corrected.log`. An isolated Redis 8.10.2 runs at loopback port 16385 under this task; `agent:doctor full` now passes all prerequisites.


## Active verification checkpoint

Expanded focused command: `REDIS_URL=redis://127.0.0.1:16385/0 node --test server/tests/garden-campus-traversal.test.js server/tests/garden-campus-traversal-transport.test.js server/tests/district-gardens-checkpoint-migration.test.js server/tests/campus-leases.test.js server/tests/campus-leases-transport.test.js server/tests/creator-transport.test.js preview/tests/garden-campus-levels.test.js preview/tests/garden-campus-layout.test.js` → 62 passed, 0 failed, 0 skipped (83.76 s), `.runtime/campus-508/focused.log`.

Core is running with supported Python PATH; tooling passed and preview tests are in progress. The new `multiplayer-lifecycle` journey is queued behind 12 shared browser runs. The holder, PID 91772 (`node scripts/browser-lock.mjs world manifest full gate -- pnpm run verify full`), was confirmed live at this checkpoint. No lock bypass, cancellation or restart was performed. A queued browser check is not a pass. GitHub GraphQL became rate-limited; REST issue reads remain available.

Continue by polling the existing processes, not restarting them: core execution session 79527; lifecycle session 46552; owned Redis session 82971/PID 86328, loopback 16385. Inspect current process state before reusing these handles. After focused browser/core pass, update this ledger, signed-commit the candidate, run both required gates on that head and open the authorized PR; require its hosted `campus-traversal` shard. Use the existing SSH agent signing key via command-local Git SSH signing settings (no persistent config changes). Do not merge or close issues. The final evidence comment should link the candidate and this acceptance map, leaving physical/visual boxes explicitly unchecked.


## Core failure investigation (02:08–02:10 UTC)

The first core run failed in unchanged `preview/tests/office-penthouse-furnishings.test.js`, “surfaces are drawn in short idle slices, never one long block, and swap in when complete”: longest slice 240.0 ms against the existing 40 ms limit. Tooling passed; preview reported 3,754 passed, 1 failed, 1 skipped; later core stages did not run. Receipt preserved as `.runtime/campus-508/core-first-failure.json`, output `core-precommit.log`.

A focused invocation reproduced the failure once at 131.4 ms (`penthouse-timing-focused.log`). A diagnostic probe of the unchanged drawing path then completed 41 slices with maximum wall time 5.32 ms (`penthouse-slice-diagnostic.json`), and the same focused test passed 1/1 (`penthouse-timing-after-probe.log`). Host load averages during investigation were 31.95/101.11/88.06 and later 22.43/82.40/82.12. Resource contention is a plausible explanation, not a proven repair. Neither source nor threshold was changed. Node rejects `--test-concurrency` in NODE_OPTIONS, so the next core invocation uses the unchanged repository command and no concurrency override.

A new core run is now active, log `.runtime/campus-508/core-after-timing-probe.log`; use its recorded execution handle in the live register. The original browser lifecycle run remains queued behind the verified live lock holder; do not restart it. The first core failure remains failed regardless of subsequent outcomes.


## Incremental delivery decision

Publish the independently reviewed server-test and acceptance-ledger increment as a draft PR while local browser validation waits behind the live queue. The 62/62 focused suite verifies this increment; the unrelated first core timing failure remains disclosed and the retry remains active. The `multiplayer-lifecycle.js` late-reply edit is still uncommitted and is not part of that first PR head. Add it only after its focused browser check runs. This overlaps hosted campus validation with the local queue without claiming completion or relaxing any final gate.
