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


## Candidate for final-head verification

The core retry passed all 11 phases (`core-retry-passed.json`, `core-after-timing-probe.log`); preview 3,755 passed/1 skipped and server 736 passed/213 Redis-dependent skips. The offline demo verification's expected exit 2 is the repository's synthetic-fixture contract, not production acceptance. The first timing failure is retained separately.

Draft [PR #593](https://github.com/BunsDev/river-oaks/pull/593) first published signed head `f13e47bf15b6b70f00d012415c159193510ef486`; the [single increment comment](https://github.com/BunsDev/river-oaks/issues/508#issuecomment-6355742072) carries changing verification status. Hosted Verify run `39888322800` has started campus-traversal for that first head; it must run again for the final candidate.

With syntax and core verification now passing, include the test-only late-reply change in the next signed draft candidate so final core/full receipts can name its actual Git head. This supersedes the earlier plan to wait for local browser execution before committing that test. Browser execution is still pending, and this commit is not a claim that the late-reply regression has passed. Final-head gates and hosted evidence remain mandatory before review-ready status. Results will be recorded in the existing issue comment, PR description and live register, keyed to the exact head, rather than creating a documentation-only head after the final checks.

Next: preserve the existing lifecycle process and queue position; run `pnpm run verify` on the candidate and `pnpm run verify full` with isolated Redis at 16385, serialized through the shared browser lock. On a failure, preserve its first receipt and investigate the owning seam; do not weaken assertions. Only after all required final-head evidence passes, update the evidence comment/PR and mark the draft review-ready. Physical-device results and lift UX remain Decisions for Val.

## 2026-10-23 current-head traversal failure and bounded harness correction

At `2cc78e303591cb4d24a7a9b2515596d44eecf76d`, clean core passed all 11 phases and focused multiplayer-lifecycle/traversal passed, but the first clean isolated-Redis full run failed `garden-campus-traversal`: “T1 lift to Floor 2: expected garden-campus/l1, the server says null.” Suite subsequently passed; full stopped with experience failed and shared/IPIC not run. The driver stopped its owned Redis. Receipt, full log, experience report and screenshot are retained byte-for-byte under `.runtime/campus-508/current-main-gates/first-full-failure/`; the original failure remains failed.

The screenshot retains a local ground-floor lift prompt. The traversal helper previously pressed F after that local prompt without waiting for the server's published pose; pose publication has a 200 ms cadence, while the server requires unchanged 1.3 m portal reach. This identifies a race in the harness, but the original report does not retain the command refusal, so its historical cause is not proven. Reuse the existing `waitForCampusLift` before each resident's first ground lift, as the suite journey already does. Existing delayed-pose regressions prove that a local prompt cannot authorize an out-of-reach server pose. The correction keeps the existing 30-second wait, one command per lift, exact destination/height checks and all server refusals. No upper-floor helper generalization, mutating retry, authentication or production behavior change is included.

The user's frequent commit/push/guarded-merge authorization supersedes this ledger's earlier no-merge delivery boundary. Revalidate the helper regressions, syntax, focused real traversal, core and isolated-Redis full; preserve any new first failure. Final-head hosted checks and latest-main guarded integration remain required. Human/device/GPU, paid collection, real Computer and optional floor-picker acceptance remain separate; leases are owner-issued and non-charging.

Focused validation of this three-line harness increment passed: existing readiness regressions 10/10 with zero skips, journey syntax, diff whitespace, and a deterministic execution of the actual first-lift sequence against a delayed-pose page model. The old sequence sent its first command while out of authoritative reach; the corrected sequence sent none until publication, then kept its original three adjacent-floor commands. That model is not rendered-browser evidence or proof of the original refusal cause. Publish the verified increment as a signed draft commit while its existing core/real-traversal run retains its queue position; exact-head core/full and hosted gates remain mandatory before ready/merge. This supersedes the preliminary precommit-browser wait, without waiving any final gate or relabeling the first full failure.

Hosted validation of signed `8b2ce34b0365440e8d8b8ce6835872c04d8c3077` caught a coordinate mistake in that increment: the authored `campusLevels()` portal is campus-local, while `waitForCampusLift` compares authoritative source coordinates. Verify `39942057776`, traversal job `120375631820`, timed out at `garden-campus-readiness.js:98` from the new first-lift call. Raw job log, report and screenshot are preserved in `.runtime/campus-508/current-main-gates/hosted-8b-traversal-failure.zip` and its extraction. The earlier synthetic zero-origin model missed this boundary; its passing result does not supersede the hosted failure.

A real-contract execution of the actual first-lift sequence reproduced the timeout despite a published player pose at the true portal. Convert both authored portal positions with `campusToSource` before the wait. Add a real-loopback regression using that contract portal: local coordinates cannot satisfy the source predicate; even with converted coordinates, an authoritative pose at 1.31 m remains blocked until publication within 1.3 m. Keep the published first failure and require fresh focused, core/full, real journey and hosted evidence for the corrected signed candidate.

Corrected-coordinate focused verification passed: readiness 11/11, zero skips; actual first-lift sequence with the real contract accepted the published source pose and retained its three original floor actions; syntax and diff whitespace passed. The existing local core/traversal and dependent full queues remain live, with their candidate checks updated to the new signed head before execution. No real-journey or full pass is claimed for this correction yet.

## Verified corrected candidate and guarded merge — 2026-10-23

Corrected candidate `94e0756e2d7ae572639bd4f9ada600c87ab3ba52` subsequently passed clean core (11 phases, 12:43:11 UTC), real local lifecycle (17 checks) and campus traversal (31 checks), all 14 hosted Verify jobs in run `39943419214`, and clean isolated-Redis full (18 phases, 12:57:24–13:33:26 UTC). Full counted agent 201 passed/0 skipped, preview 3828 passed/1 skipped, Redis/server 1016 passed/0 skipped and desktop 115 passed/3 skipped; all 16 experience and 25 shared journeys and IPIC passed. Owned Redis stopped. The full receipt, log and byte-preserved generated reports with SHA-256 provenance remain under `.runtime/campus-508/current-main-gates/lift-fence-full/`; only generated report paths were restored, leaving a clean checkout. The state file's historical `dirtyPatchExpected` label is not the verifier's input flag: the actual core/full receipts both record `dirty: false`.

The guard updated the branch to signed integration head `9a2f951939f19935f08b4e588b66c2095c569011` against main `22403e0da6f84a76a009ee73c90bd81d03c343f4`. All 12 loopback readiness regressions passed there with zero skips. Verify `39962449091` finished with all 15 jobs successful after the guard's single failed-job rerun; PR #593 merged as `4113fbda560fb30aa3993f75ac301dbdcf5798a2` at 14:07:48 UTC, verified on fetched main. Core/full receipts remain scoped to `94e0756e`, while the hosted matrix proves this later integration.

The first integration places job `120443582070` failed the unchanged `office-computer-embed` account-change Continue click after its guest frame/button detached. Artifact `12506420868`, raw logs/report and owner-page screenshot remain under `.runtime/campus-508/current-main-gates/integration-9a2f9519-first/`; the screenshot does not show the guest teardown. The rerun passed without source, deadline or authentication changes and does not establish the original cause or a root-cause fix. Earlier `2cc78e30` full and `8b2ce34b` coordinate failures remain preserved separately.

The approved recommendation remains closing #508 only by Val's separate decision, with physical/rendered criteria retained unchecked in #505. No issue was closed. Lifts still move one floor per press; the optional floor picker, physical touch/reduced-motion and rendered-contact checklist remain human-held. Human/device/GPU, paid mode, real Computer and production acceptance are unclaimed; leases remain owner-issued and non-charging. Preserve this checkout and evidence; no retirement or cleanup is included.
