# Police pursuit #598 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make wanted stars meaningful through readable, fair, deterministic pursuit and capture without overwhelming the multiplayer simulation.

**Architecture:** A bounded server director uses the existing resident navigation with roads allowed, current collision and sight-line authority, and existing crime wanted state. Fixed stable officer slots, deterministic round-robin target allocation and bounded route replanning feed compact snapshots; private search/arrest timers and surrender state persist in the world checkpoint. Client actors reuse the remote-player renderer and existing accessible crime HUD.

**Tech Stack:** JavaScript ESM, existing Node simulation/Redis transport, Three.js renderer and browser journeys.

**Spec:** User attachment `/Users/buns/.codex/attachments/0fcf05f9-8827-4e37-9d99-ef55f78cdb29/pasted-text-1.txt` and GitHub issue #598.

## Global constraints

Preserve peaceful default, server identity/position authority, existing navigation, bounded work, unrelated edits and historical receipts. No cars, jail, economy, external inference or new navigation framework. The maintainer subsequently authorized commit, push and merge to main; deployment and production activation remain outside the task.

## Design decisions

Use at most six officers with one slot per eligible wanted player before assigning extra units by stars, stable lexical account ordering, and a rotating allocation cursor when more than six players need response. Acquire players only in sight and within a bounded sight radius; pursue visible positions, search only the last seen position after sight loss, then return. Danger-zone exit, protected interiors/upper levels, disconnect, zero stars or disabled policy immediately cancels capture and returns officers; emergency off clears surrender. Officers originate at authored validated street posts, never at the target. Return timeout permits bounded despawn if routes are blocked.

Surrender is authenticated intent without identity/position fields. It prevents attacks and movement during the short capture transition; withdrawal occurs through explicit resume intent before capture begins. Arrest requires actual sight and range, lasts a short server-owned interval, clears stars once, releases owned interactions and restores the existing validated arrival spawn. Existing #597 does not damage players (PvP has no consent path); incapacitation is handled defensively when authoritative health is zero, without inventing a player damage system.

## Review focus

- Hidden targets must not update last-seen positions or cause omniscient routing.
- More wanted accounts than officer slots must not permanently starve later accounts.
- Restore must validate all police state before mutation and avoid duplicate completed arrests.
- Policy changes and disconnects during capture must cancel safely.
- Client controls must follow the snapshot, preserve keyboard focus and communicate without motion or audio.

## Tasks and evidence

- [x] Task 1: Add `server/police.js` and behavioral `server/tests/police.test.js`. Test visible pursuit, blocked sight, obstacle routes, caps/fairness, search/return timers, surrender/capture and validated save/load. Run red before implementation and green after.
- [x] Task 2: Integrate director with `server/world.js`, existing crime resolver, command gates, collision/navigation updates and checkpoint migration. Add real-world and transport tests including Redis writer takeover/reconnect, forged surrender, policy-off and exactly-once arrest.
- [x] Task 3: Validate snapshot police fields in `preview/src/town-snapshot.js`, render police through existing remote actors, extend crime HUD with surrender/status and restrained cues using existing assets. Add focused client tests and actual two-browser journey with rendered captures and reduced motion.
- [ ] Task 4: Run focused suites, `pnpm run agent:doctor`, `pnpm run verify`, isolated-Redis `pnpm run verify full`, affected multiplayer browser journeys and bounded performance measurements. Preserve first failures and exact revisions. Obtain independent review, address findings, and prepare reviewable delivery with explicit remaining acceptance gaps.

## Ownership and current evidence

Owned worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-police-598`; branch `feat/police-pursuit-598-20261023`; base `f4aa1670`. Task register `police-pursuit-598`. Prior crime checkout contains unrelated dirty edits and is preserved. #598 remains open; prerequisite implementation is present on base. Repository-wide GitHub inventory is running separately; direct issue and open-PR checks found no competing police PR.

No implementation or verification complete yet. Next: first failing director test, then one-officer pursuit.

## Implementation checkpoint

Director, authoritative world/command/checkpoint integration, compact snapshot validation, existing-rig police figures, text/keyboard surrender controls and shared optional sound confirmation are implemented locally. Checkpoint is version 16 and Redis generations are 19/20; existing assertions were updated while historical malformed/legacy fixtures remain intact. No commit, push, PR, merge or deployment has occurred.

Focused director suite: 8/8, including actual existing navigation around a wall, bounded route budget, fairness, last-seen search and incapacity. Combined focused director/world/client suite: 24/24, no skips (`/tmp/police598-focused-final.txt`). Real memory WebSocket police test passed. Redis focused run: 27/28, no skips; one existing two-level migration join returned `request_timeout`. Its unchanged targeted rerun passed 1/1 (`/tmp/police598-redis-first-rerun.txt`); retain the original `/tmp/police598-redis-focused.txt` and do not replace it with rerun evidence. Both new Redis police and attack transport tests passed in that original run.

`pnpm install --frozen-lockfile` and `uv sync --locked` completed. First baseline attempt failed because the new worktree had no dependencies; after installation existing crime tests passed 9/9. First doctor reported missing Python environment; doctor passed after the locked sync. `pnpm run verify` remains live as session88682, with logs `/tmp/police598-core.txt`; runtime changed after its launch, so it is diagnostic and cannot certify the final source. Shared police browser journey is live in session6267, queued under the common browser lock; do not duplicate or bypass it. Isolated Redis is owned by session88757/PID40681, loopback16498, no persistence. Keep it until remaining Redis/full checks finish, then stop only this owned instance.

Independent review requested through requesting-code-review skill. Preliminary findings: patrol posts must be revalidated after collider changes, and checkpoint unit positions/targets need stronger validation. Await consolidated report, write reproducing regressions and fix in one pass. Full verification, rendered capture inspection, final review dispositions and reviewable delivery remain incomplete. Goal remains active with its full original scope.

## Independent review and fixes

Final review returned five findings. All five were reproduced with failing behavioral regressions and fixed: later wanted accounts now receive a first response ahead of retained extra units; posts are rechecked against current collision at spawn; restored officer positions, elevation, targets and transition times are validated against the restored geography/players before mutation; incapacitated capture restores authoritative health to 100; and the HUD consumes explicit server eligibility rather than inferring surrender permission from stars. Placement checks now prevent building through active officers, keeping generated checkpoints geometrically restorable. Keyboard focus moves to the status when capture disables or hides the surrender action. No deferred review findings or design rulings were required.

After fixes, combined focused director/world/client tests passed 29/29 without skips; two additional real-world tests then passed as part of the 6/6 world suite (actual wall occlusion and emergency off during an active arrest). Final focused Redis transport/director/world run passed 22/22, zero skips (`/tmp/police598-redis-final-focused.txt`). These results do not establish broad-suite or rendered acceptance.

First `pnpm run verify` failed in unchanged `office-penthouse-furnishings.test.js`: a rendering slice took 120.6 ms against a 40 ms bound. Its unchanged focused rerun passed 1/1. Original core log/receipt and original Redis timeout are preserved in `.runtime/police598/first-failures/`. Final core rerun is live as session3479, log `/tmp/police598-core-final.txt`. Do not restart it based on observation timeouts.

Final-source local interleaved 32-player measurement retained six as the maximum officer count. Baseline median 0.937 ms / police median 1.121 ms; baseline p95 92.46 ms / police p95 76.82 ms; maxima 891.73/1057.28 ms. Host contention prevents a stable timing acceptance claim. Original pre-review measurement is retained in `/tmp/police598-performance.txt`; final raw summary and reproducible fixture are `.runtime/police598/performance.json` and `.runtime/police598/measure.mjs`. No hosted, quiet-host, GPU or physical-device performance claim.

Browser session6267 is still queued; latest observed preceding owner was live PID43220 (Phase 2 matched rendering comparison). Full profile and actual capture inspection remain required. Keep goal active, preserve checkout and Redis, and continue directly when the queued browser and current core return.

## Verified-wait handoff

Latest focused suite passed **31/31 with zero skips**, `/tmp/police598-focused-31.txt`. No source changes after that run. A live tool orchestrator (functions cell64) now owns polling core session3479; **do not poll/restart core separately while it owns that handle**. On core success it starts `REDIS_URL=redis://127.0.0.1:16498 pnpm run verify full`, writing `/tmp/police598-full.txt`, and stores its returned exec session under `police598-full-session`. Resume with functions.wait cell64, then use the actual returned full session. On core failure, cell64 records failure and does not start full; preserve its receipt before any rerun.

Browser session6267 remains the single owned police journey; poll that exact handle and retain the common browser queue. Redis session88757/PID40681 remains owned and live. Required next actions: inspect core/full results and fix demonstrated failures without weakening checks; inspect actual police screenshots after the journey runs; complete pending rendered/input acceptance; retain exact results/source hashes, make reviewable verified delivery, reconcile register. This turn is progress followed by a verified wait, not a blocked or completed goal.

## Continuation: acceptance coverage audit

Previous turn classified as progress followed by a verified wait. Attachment and live source were reread. Core remains owned by cell64; browser6267 is still live/queued, so neither was restarted. Tightened the queued browser journey to require the actual local walking pose to converge to the authoritative arrest arrival before the screenshot; a snapshot-only check is insufficient rendered relocation proof. Runtime source remains unchanged. This browser assertion is new and still unverified until the existing queued journey runs.

## Core compatibility correction

Cell64 completed with core exit1; full was not started. Second core reached server tests and found three real compatibility failures in `server/tests/avatar-preferences.test.js`: `legacyDefaultAppearance()` accepted checkpoints only through version15, rejecting the new police checkpoint. Reproduced the original failures and added a behavioral current-version/future-writer regression; changed only that reader's supported-version list to include16. Focused result: 7 passed, 3 Redis cases skipped without Redis, zero failures. An all-server run with isolated Redis is now live as session86950 (`/tmp/police598-server-all.txt`) to prove those Redis cases and the broader persistence boundary. Original second core log/receipt retained in `.runtime/police598/first-failures/core-second.*`.

The new browser assertion remains in the single existing queued session6267. A third core run has been started after the reader fix; record its live handle from the tool response, then start full only after current failures are resolved. Do not wait on completed cell64 or restart the queued browser.

## Verification checkpoint after reader correction

`REDIS_URL=redis://127.0.0.1:16498 pnpm run test:server` passed **1104/1104, zero failures, zero skips** (`/tmp/police598-server-all.txt`, session86950 terminal exit0). This covers the full server suite including Redis writer takeover, reconnect, checkpoint migration and the new police transport tests. Third core session14014 is live and now exclusively polled by functions cell77; on success that cell starts full and returns/stores the actual session handle (`police598-full-session`). Do not poll the old cell64 or duplicate core/browser/full runs. Browser6267 remains live/queued behind a confirmed live owner. The task claim is renewed with the exact 33 owned source/test/doc paths.

## Late-response correction

A new deferred-reply behavioral test reproduced an authority/UX mismatch: a surrender reply arriving after a newer completed-arrest snapshot overwrote “You are no longer wanted” with “Surrender accepted. Stay still.” The handler now fences identity/disconnection and ignores successful replies that contradict a newer authoritative hold state. Focused client suite passed8/8 after RED→GREEN. The third core started before this small client correction; full must validate the final source, and any earlier core pass must be labelled with that scope. No server source changed since the1104/1104 Redis server pass.

## Full-profile audit correction and final-source run

Third core passed all11 phases; retained receipt `.runtime/police598/core-third-passed.json`. It predates the final late-surrender-reply fence and the visible-target allocation correction: a newly added regression proved an unseen/unreachable wanted account could reserve first-response priority indefinitely and suppress star-scaled extras for a visible account. The director now reserves that priority only for accounts that can actually receive a response. Combined final focused suite passes33/33 with zero skips (`/tmp/police598-focused-final34.txt`; filename predates the final count).

Cell77 started full after core passed, but full terminated immediately in dependency audit. Its returned process had already exited, so storing an absent session failed; authoritative full log/receipt confirmed terminal audit failure, and no duplicate process was started. Original full log/receipt are retained as `.runtime/police598/first-failures/full-first.*`.

The audit found high-severity GHSA-mrhx-c7xc-m3w5 in transitive Zod4.1.11, pinned exactly by `@vercel/cli-config@0.3.1`. The current parent release still pins that version. After checking live ownership, added a narrowly scoped `@vercel/cli-config@0.3.1>zod: 4.6.6` override in `pnpm-workspace.yaml` and regenerated `pnpm-lock.yaml`; no unrelated dependency versions changed. `pnpm install --frozen-lockfile` passed, `pnpm why zod` confirms4.6.6, and `pnpm audit --audit-level=moderate` reports no known vulnerabilities. This is a gate-required dependency correction, not an audit suppression. Sources: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5 and https://pnpm.io/10.x/settings#overrides.

Final-source full profile has now been started separately with the owned isolated Redis (`/tmp/police598-full-final.txt`); use its actual returned exec session, not completed cell77. It must establish final-source broad acceptance after the small source/dependency corrections. Browser6267 remains the single queued focused police journey. Goal remains active; rendered acceptance and successful final full profile remain unproved.

## Requirement audit (implementation evidence; final acceptance pending)

| Requested requirement | Current implementation and direct evidence | Remaining proof |
| --- | --- | --- |
| Existing server/navigation/LOS authority | `server/world.js` integrates `server/police.js` with existing `createResidentNavigation`, walking geometry, placed-object updates and chest-height sight lines. Actual-world wall test and existing-nav obstacle-route test pass. | Final full profile and rendered journey |
| Global cap, stable IDs, star scaling and deterministic fairness | Six fixed officer slots; one first response before extras; bounded response turns; regressions cover ten wanted accounts, later arrivals to a saturated director, unseen accounts and route-search cap. | Final full profile |
| Pursue/search/arrest/return, bounded last-seen search and no teleport | World-owned positions/timers, 8-second last-seen search, 15-second blocked-return timeout, one route search per tick, short movement collision rechecks. Tests assert immutable hidden last-seen position and every real-wall movement segment. | Final full profile and actor captures |
| Authenticated surrender and bounded exactly-once capture | Strict session-owned command, held-action/pose gates, sight/range checks, 1.4-second arrest, health100 recovery and validated arrival. Actual-world mid-arrest restore, repeated post-arrest surrender, real WebSocket reconnect/coordinator-replacement tests pass. | Final full profile and local rendered relocation |
| Leaving danger and emergency off stand down safely | Eligibility uses authoritative risk and protected-place state; command/disconnect paths cancel immediately. Tests cover off-switch during active arrest without clearing stars or moving player, plus disconnect cleanup. | Final full profile |
| Compact snapshots/checkpoints, recovery and old-writer fencing | Public units/surrender/eligibility only; checkpoint16 stores private timers and last-seen state, validates restored geometry/players before mutation; Redis19/20 fencing and appearance-reader migration are tested. | Final full profile on final dependency tree |
| Recognizable actors, readable audio/visual/reduced-motion behavior, matching HUD | Shipped Sable rig with midnight palette, labelled state, polite text, accessible Surrender/Resume controls, existing optional tap; focused tests cover eligibility, focus, disposal and late replies. | Actual two-browser screenshots, reduced-motion keyboard flow, safe local pose convergence and broader browser gates |
| No cars/jail/economy/external model agent; preserve performance envelope | No new asset or navigation framework; bounded director; local32-player measurements retain cap6 but host contention prevents stable timing conclusions. | Final browser/full receipts; report timing limitation without claiming quiet-host/device/hosted scalability |

The matrix does not mark rendered or full acceptance complete based on implementation, helper tests or a prior core pass. Full session97376 is the current authoritative broad gate, log `/tmp/police598-full-final.txt`; browser6267 is still the focused rendered gate. Completed cell77 and old full-first failure have no live work remaining.

## Final-source non-browser milestone and exclusive-browser dependency

The final full run has passed13 non-browser phases: dependency audit, tooling204/204, preview3882 passed/1 skipped, Redis server1105/1105 with zero skips, desktop115 passed/3 skipped, build, Python lint/format/tests, synthetic demo and its declared verification contract, secrets and secret-history scans. Interim receipt retained as `.runtime/police598/full-nonbrowser-passed-interim.json`; this is explicitly not a completed full-profile receipt. The preview skip is the already-obstructed Vince negative-test approach (no glass-collision evidence); desktop skips are three Windows PowerShell cases (no Windows-native evidence). No source edits occurred during this continuation.

All remaining required work now depends on the shared browser resource: focused police journey session6267/PID50959 is queued with3 predecessors; final full session97376 has reached security-browser, queued under PID80862 with7 predecessors. Latest confirmed live holder is Phase2 eager/streamed comparison PID35899. Both owned exec sessions were polled and confirmed live; owned isolated Redis PID40681 is live. Preserve these exact jobs and do not restart or bypass the lock.

This continuation made progress by establishing final-source non-browser acceptance, followed by a verified wait. It is the first checkpoint at which the exclusive browser dependency is the only remaining executable work; earlier continuations still had implementation fixes and non-browser checks available. If that genuine dependency persists without new progress across three consecutive goal turns, apply the blocked audit rather than repeating active status indefinitely. For now the goal remains active. Next: poll6267/97376, inspect any terminal results and captures, fix actual failures, complete the full-profile/visual audit and verified delivery. No commit, push, PR or deployment yet.

## Scoped plans-index integration

`pnpm run plans:index --check` detected that the baseline index was already missing unrelated ledgers. A full regeneration would add unrelated active/historical entries, so the existing generator was applied to the original indexed scope plus this task's new ledger. The resulting README diff is exactly one generated police-ledger row and its count increment. A byte-exact comparison proves the original indexed scope was preserved; `.runtime/police598/plans-index-scope.json` records pre-existing full-index debt. The two generator tests pass, `git diff --check` passes, and `docs/project-management/tasks.json` remains unchanged. Global index freshness remains pre-existing project debt; no global freshness pass is claimed for this scoped update.

The current continuation is progress (scoped documentation integration) followed by a verified wait. The exclusive-browser dependency persists, but the queue has advanced: focused6267/PID50959 is next after live studio-core owner PID76255, and full97376/security PID80862 has five predecessors. Both owned session handles were polled live. Preserve them; do not replace them. The same resource dependency has now been observed at two browser-only checkpoints. No rendered acceptance or delivery is claimed.

## Rendered acceptance exposed body overlap

Focused browser session6267 completed successfully on Chromium/Apple M5 Max Metal with full rendering:20 checks, including keyboard surrender/reduced motion, peer-visible arrest, safe arrival and actual local walking-pose convergence. Its report and original images are retained in `.runtime/police598/focused-browser-first-passed.json` and `.runtime/police598/captures-first/`. Manual inspection found the open character panel covered the world, so those images do not prove recognizable police actors.

Applying camera-framing skill, inspected the normal walker camera (vertical65deg perspective FOV, eye1.68m, near.06m) and existing menu/first-person controls. A real-world regression then reproduced a gameplay defect: a healthy wanted player was approached to0.08m, causing body overlap. The director now stops1.25m from visible targets, still within1.5m arrest reach. After RED→GREEN, focused suite passes34/34. The existing development-only camera diagnostic exposes live lens/aspect/clip metadata; the journey collapses menus through real controls, switches with V to the normal first-person camera, faces a real officer, verifies visibility/separation and records camera station POLICE-EYE-01 before capture. No detached camera, geometry, FOV or asset change was used to conceal overlap.

The earlier note calling the transient studio-core holder confirmed live was corrected by process observation: PID76255 had exited by the next ps check; own focused50959 then ran and completed. No other owner's process was interrupted.

## Full timeout and corrected scheduling

Full session97376 terminated exit1 at security-browser with ETIMEDOUT/SIGKILL after600012ms, entirely in the shared browser queue; no security-browser test ran. Original log/receipt are retained in `.runtime/police598/first-failures/full-second-browser-queue.*`. Its13 non-browser passes remain historical evidence for the prior source, not final acceptance after the stand-off correction.

A single new acceptance pipeline is queued as session53965 (`/tmp/police598-final-acceptance.txt`): `node scripts/browser-lock.mjs 'police598 final acceptance' -- node .runtime/police598/run-final-acceptance.mjs`, with owned Redis16498. The wrapper acquires the shared lock before starting the improved focused journey and then `pnpm run verify full`; normal nested runners inherit the documented held-lock token. This prevents shared-queue time from consuming individual phase deadlines, without bypassing serialization or weakening timeouts. Focused log: `/tmp/police598-browser-v2.txt`; full log: `/tmp/police598-full-v3.txt`. If focused fails, full does not start. Only this pipeline is live;6267/97376 are terminal.

Resource dependency audit is no longer an impasse: actual browser evidence arrived, exposed a defect and led to a tested fix plus improved captures. Goal remains active at full original scope. Next: poll53965, inspect actual new camera capture/report, address any failure and complete final-source gates and verified delivery. Preserve Redis40681 until acceptance finishes.

## Camera station and renderer-heading follow-up

The improved station is now POLICE-OBSERVER-01: the peaceful owner's ordinary first-person camera, reached through validated normal travel at source east/north(-2904,-1316), aimed at the stopped officer's torso1.1m above ground. This allows the officer and wanted visitor to be seen together from about4m away; the wanted visitor retains the390px HUD. Live camera lens/aspect/clip/position, actor/player positions, axes and eye height are recorded in the journey result. These remain planned measurements until the queued run returns, not completed capture evidence. The visitor's reduced-motion preference is now set before page startup; the first receipt only established input under a media query changed after startup and does not establish initial controller motion settings.

A rendering-adapter regression also reproduced that a newly created stationary officer faced opposite the authoritative travel heading: the existing peer renderer adds pi to camera-style yaw, while the director stores body heading. Only `policeFigures` now converts that convention; player/rival behavior is unchanged. Final focused suite passes35/35 after RED→GREEN (`/tmp/police598-final-focused35.txt`).

The queued acceptance wrapper preserves focused report/images into `.runtime/police598/focused-v2/` before broader journeys overwrite report paths. It records runtime-source hashes before/after and fails if source changes during verification. No further runtime changes should be made while that pipeline is executing. The same live session53965 remains queued; no duplicate run has been started.

## Final queued source checkpoint

Runtime source and the improved journey are now frozen while pipeline53965 waits for its turn. Syntax checks for the journey, main integration, crime UI and director pass, and `git diff --check` passes. Final focused35/35 includes body stand-off and renderer-heading regressions. The camera station uses the peaceful observer (normal motion), while the wanted visitor starts with reduced motion enabled before load. First capture reports and failure receipts remain preserved; no new capture is claimed before the queued run actually executes.

## Active pipeline handoff

Current turn made progress: the original GPU journey ran; manual screenshot inspection exposed missing actor evidence; a real body-overlap failure and renderer-heading failure were reproduced and fixed;35 focused tests now pass; and a stronger normal-observer capture plus full profile are queued in one serialized pipeline. This is not a completion claim. Session53965 remains live with two preceding runs in its latest log; current owner was reported as studio-core PID48072. Preserve the exact pipeline and Redis40681. Next poll53965, inspect `.runtime/police598/focused-v2/` and `/tmp/police598-browser-v2.txt`, then `/tmp/police598-full-v3.txt` and the final receipt. No new runtime edits until it finishes. No commit, push, PR, merge or deployment has occurred.

## Pipeline result and scheduling investigation

Pipeline53965 is terminal exit1. The improved focused journey passed24 checks and preserved its report and captures under `.runtime/police598/focused-v2/`. Actual image inspection established a visible labelled midnight-palette officer standing apart from the wanted player, a readable390px surrender HUD, and the rendered safe-arrival state. POLICE-OBSERVER-01 used the peaceful observer's normal65-degree first-person camera, eye1.68m,1280x860 viewport; the wanted visitor started with reduced motion before startup. Runtime source hashes match before/after the pipeline. This is local Chromium/Apple M5 Max Metal engineering evidence, without physical-device or human accessibility acceptance.

Full-v3 failed in preview tests:3882 passed,1 failed,1 skipped of3884. The unchanged furnishing idle-slice test measured41.9ms against its40ms limit. Original receipt/log are preserved in `.runtime/police598/first-failures/full-third-preview.*`; later full phases did not run. An unchanged isolated rerun passed1/1. The assertion measures callback wall time, including scheduling pauses, and the host currently reports heavy CPU contention. This supports testing a scheduling hypothesis, not dismissing the failure.

Running every preview test with `node --test --test-concurrency=4 preview/tests/*.test.js` as session91800, log `/tmp/police598-preview-concurrency4.txt`, to test bounded file concurrency without changing coverage, assertions or deadlines. Node rejects `--test-concurrency` in NODE_OPTIONS; that failed configuration probe did not run any tests. No package script or product change has been made for this experiment. Redis40681/16498 remains owned and live. Final core/full acceptance and reviewable delivery remain incomplete.

The complete preview collection reached the furnishing regression successfully at four-file concurrency (871.8ms test duration; its internal40ms assertion passed). The experiment remains live, so this does not claim the entire preview suite passed. Claimed only the `package.json` test-script hunk and applied the same four-file limit; other ownership is preserved in separate checkouts. Agent catalog/runner regressions pass10/10. A new direct world test proves danger-zone departure releases surrender and pursuit while preserving wanted stars and the safe-ground position;1/1 passed after correcting the test's initial mistaken assumption about the existing tuple snapshot shape. No gameplay behavior change was required.

Prepared `.runtime/police598/run-final-gates.mjs` to run exact `pnpm run verify core` then `pnpm run verify full` under the ordinary shared browser lock with owned Redis. It preserves each receipt and hashes changed runtime/test/package files before and after. It has not been started while preview experiment91800 is live, to avoid contaminating the scheduling experiment with another owned broad test run.

## Bounded preview pass and final-gates queue

Experiment91800 completed exit0:3884 total,3883 passed,0 failed,1 existing skip,263821.5ms (`/tmp/police598-preview-concurrency4.txt`). This retains all preview assertions and completes well within the unchanged600000ms phase limit. The new final focused suite passes36/36 with zero skips (`/tmp/police598-focused36.txt`), including direct safe-zone departure. Task3 is now checked against actual focused browser24-check and manually inspected rendered evidence; Task4 remains incomplete.

Final-gates pipeline is live as session85190, log `/tmp/police598-final-gates.txt`: `REDIS_URL=redis://127.0.0.1:16498 node scripts/browser-lock.mjs 'police598 final core and full' -- node .runtime/police598/run-final-gates.mjs`. It is waiting behind the existing Bayou run; preserve it rather than starting duplicate core/full jobs. Runtime/test/package source is frozen until this pipeline finishes. This continuation made concrete progress through a bounded-concurrency full preview pass,36 focused passes and the rendered-evidence audit, followed by a verified wait. Final core/full, verified commit and reviewable delivery remain required; no merge/deploy or production activation is authorized.

## Final-gates verified wait, first checkpoint

The previous goal turn made progress (complete bounded preview pass,36 focused checks and direct safe-zone coverage). This continuation reread the full attachment and re-polled session85190: it remains live and waiting for the common browser lock. Confirmed holder90733 is still running `bayou-full-remaining`; Redis40681 is live. Neither final core nor final full has started. Source remains frozen, `git diff --check` passes, and the37-file source checkpoint remains preserved with restore/hash verification. No tests were restarted or scope reduced.

This is the first browser-only dependency checkpoint since the scheduling correction; goal remains active. There is no final-gates result to inspect yet, and committing before required verification is disallowed. Next action remains polling85190 and inspecting actual core-v4/full-v4 receipts, then fixing demonstrated failures and completing reviewable delivery. Historical passing narrower checks do not substitute for these gates.

## Final-gates verified wait, second checkpoint

Previous goal turn was a verified wait. This turn reread the attachment, polled the same85190 handle twice and confirmed it remains live/queued behind live90733. Final core/full have not started. Compared all34 owned runtime/test/package files with the restore-tested source checkpoint: zero changed. Redis40681 remains live; diff whitespace check passes. No source edit or duplicate verification job was introduced.

The same exclusive-browser dependency has now persisted across two consecutive browser-only goal turns. Completion remains unproven and the goal remains active; pending core/full results are required before commit/reviewable delivery. Continue with85190 rather than restarting it. If the same genuine impasse persists on a third consecutive goal turn without another safe action or new results, apply the required blocked audit while preserving the live job.

## Final-gates blocked audit, third checkpoint

Previous turn was a verified wait. Reread the attachment and polled85190 again: live and still queued, with final core/full not started. The preceding Bayou holder90733 and owned Redis40681 are independently confirmed live. The same exclusive-browser dependency has persisted across three consecutive goal turns since the scheduling correction. All independently available implementation, focused/rendered review, source preservation and preview verification work is finished; required broad verification prevents a verified commit/delivery, and bypassing the shared holder or duplicating the job would violate the workflow.

The goal is therefore blocked on external browser-queue progress, not complete. Preserve85190, Redis40681/16498, the source checkout and all failure/passing receipts. Resume when the holder releases the resource or85190 produces new results; poll that exact handle, inspect core-v4/full-v4 receipts and source-hash checks, fix actual failures and finish verified delivery. No merge/deployment/production activation is authorized. The running job is intentionally left intact.

## Resumed attachment and current-state audit

Read the current attachment `/Users/buns/.codex/attachments/ae5253c9-1932-4e51-8d1f-b55e64283a6d/pasted-text-1.txt`; its full pursuit/capture objective matches this existing implementation plan. The previous goal turn was a verified wait. The original tool session85190 is unavailable in the resumed tool registry, but independent process inspection confirms its original queue process51055 remains alive, waiting behind live Bayou90733. No verification was restarted. New observation-only session61026 watches that original process/log and does not launch tests. Owned Redis40681/16498 remains live.

Compared all owned runtime/test/package paths against the restore-tested223659Z source checkpoint: zero differences. `git diff --check` passes. Inspected the current director, world tests and transport test, plus the preserved focused-v2 browser receipt and actual desktop officer capture. This is current artifact inspection; historical passing tests retain their recorded scope.

| Requirement | Existing evidence inspected | Remaining proof |
| --- | --- | --- |
| Capped deterministic response, peaceful-player exclusion, star scaling and fair allocation | Director and behavioral tests for six-unit cap, ten wanted accounts, later first responses and unseen accounts | Final-source core/full receipts |
| Real walkable paths, LOS loss, last-seen search, emergency off | Actual navigation wall test, world sight-occlusion test, search and active-arrest cancellation tests | Final-source broad regression receipts |
| Authenticated surrender/incapacity, exactly-once recovery and safe arrival | World restore/incapacity tests, memory/Redis gateway takeover test and focused-v2 browser arrival checks | Final-source full receipt |
| Compact snapshots/checkpoints and consistent client HUD/actors | Snapshot validation tests; focused-v2 report passed24 checks; inspected visible labelled officer with body separation | Final-source broad browser/transport gates |
| Bounded simulation work | Six-unit bound, one route-search-per-tick test and retained local32-player measurement | Stable timing acceptance remains limited by host contention; no hosted/device performance claim |
| Reviewable delivery | Existing independent findings and RED-to-GREEN fixes recorded above; source checkpoint preserved | Core/full completion, verified commit and delivery handoff; no merge/deploy authorization |

The final core/full-v4 jobs have not started while the common browser resource is held. This resumed turn establishes the current source/process/artifact state and preserves the original pipeline. Completion is unproven; continue observing51055 and `/tmp/police598-final-gates.txt`, then inspect actual receipts and source hashes before committing.

## Resumed wait, second checkpoint

The previous resumed turn made progress by recovering authoritative process/source state and auditing requirement coverage, then entered a verified wait. This continuation reread the current attachment, confirmed original queued process51055 and predecessor90733 are live, and polled observation-only session61026. Final core/full-v4 receipts remain absent because the original pipeline has not acquired the browser resource. The predecessor completed shared seating and advanced to world-rules-shared. All34 runtime/test/package paths still match the restore-tested source checkpoint; no runtime changes, duplicated test jobs or lock bypass occurred. Owned Redis40681 remains live.

This is the second resumed browser-dependency checkpoint. Goal remains active, with completion unproven. Next: observe the same51055 process/log, inspect actual core-v4/full-v4 results when available and finish verified reviewable delivery. If the same genuine external-resource impasse persists for a third consecutive resumed goal turn with no further safe work, apply the blocked audit while preserving the original pipeline and Redis.

## Resumed blocked audit, third checkpoint

Previous goal turn was a verified wait. Reread the current attachment and polled observation-only session61026; independently confirmed queued pipeline51055, preceding browser holder90733 and owned Redis40681 remain live. The predecessor advanced through crime-shared and world-boundary to world-map, but the police pipeline still has not acquired the common browser resource. Final core-v4/full-v4 receipts remain absent. All34 runtime/test/package paths match the preserved source checkpoint and `git diff --check` passes.

The same exclusive-browser dependency has persisted across three consecutive resumed goal turns. No independently actionable implementation or verification work remains before the frozen pipeline runs; committing would violate the required verification gate, and duplicating the pipeline or bypassing the browser holder would violate resource coordination. Mark the goal blocked on external queue progress, preserving original process51055 and Redis40681/16498. Resume by inspecting `/tmp/police598-final-gates.txt`, process51055 and actual core-v4/full-v4 receipts/source hashes, then address failures and complete verified delivery. No commit, merge, deployment or production activation has occurred.

## New explicit resume: live handle and overlapping claim

User explicitly resumed the goal and replaced root AGENTS instructions, including mandatory final serialized Markdown preflight. Reread the original objective attachment. Fresh blocker audit starts with this resumed turn. The original tool handle85190 is accessible in this tool context and was polled live; its queue process51055 is also independently live. Bayou90733 still holds the browser resource; final core/full have not started. Redis40681 is live, and all34 runtime/test/package hashes match the restore-tested checkpoint.

Current worktree inventory revealed a new separate task `crime-police-598`, owner `claude:crime-police-598-20261023`, branch `feat/crime-police-598-20261023`, checkout `../river-oaks-crime-police-598`, claiming `server/crime.js` and `server/police*` for the same issue. At inspection that checkout was clean on the same f4aa1670 base. Preserve both owners' work; do not adopt, overwrite or discard the second checkout, create another implementation, or label either task delivered. Our existing implementation and queued acceptance remain in the original owned checkout. Reconcile this overlap before any eventual integration; it does not justify interrupting the confirmed existing verification job.

This turn established new ownership-overlap evidence and a verified wait. Keep the goal active. Next: poll original85190/process51055 and inspect final receipts when available; then address actual failures, reconcile overlapping delivery ownership and complete verified reviewable delivery without merge/deploy authorization.

## West-side pursuit regression and full walking-area correction

The other task's ledger flagged navigation boundary/performance concerns. Inspected the actual shared navigation rather than accepting those statements as proof. It applies the resident `site_ring` to all routes; Westcreek's danger rectangle includes walkable public ground outside that ring. Added a real-world test placing a wanted/surrendered account1.2m west of the authored rival. Original code failed after15 simulated seconds with wanted stars and surrender still present (`/tmp/police598-west-side-red.txt`): officers could see that account but could not route to its legal position.

Corrected only `server/world.js`: the police navigation receives a world-data view with `site_ring:null`, retaining the same grid-size limit, terrain, physical collision, placed objects and navigation implementation. Restored-unit validation uses that same view. Shared resident navigation and other ownership remain untouched. The regression now passes, including checkpoint restoration during arrest outside the old boundary. Final focused director/world/client suite passes37/37 with zero skips (`/tmp/police598-focused37.txt`). `git diff --check` passes. Documentation now describes the full walking-area coverage.

The queued pipeline still has not started, so this demonstrated defect justifies updating its pending final source rather than preserving a known-broken freeze. Original85190/process51055 is retained; no restart or duplicate job. Its source hashes will be captured when it actually acquires the lock. Prior36-check/full-preview/GPU evidence retains its earlier source scope; final core/full must cover this runtime correction.

Added an ignored final-source32-player performance fixture, `.runtime/police598/measure-final.mjs`, to run after successful core/full inside the existing serialized pipeline. It compares identical wanted/player positions with policy off versus police enabled, interleaves worlds, separates cold/warm samples, records main-thread CPU and wall time plus snapshot size/source hashes, and asserts the six-officer/policy-off bounds. This is not yet measured evidence; earlier contended measurements are preserved. The performance concern is still an acceptance question until actual results arrive. This continuation made progress through a reproduced coverage failure and verified fix; the blocked audit no longer has three consecutive wait-only turns.

The current37 owned source files were archived again and restored to a fresh temporary directory with every SHA256 matched; `.runtime/police598/latest-source-checkpoint.json` points to the new snapshot. The full shared runner's default modes include `development` and `crime-shared`, so the existing queued full profile will rerun the affected real browser flow on the corrected source. Syntax checks for the measurement/pipeline scripts and thread-CPU delta support pass; this does not substitute for the pending measurement or full profile. Original85190 was polled live again and is still waiting behind Bayou90733. Keep source frozen again until results arrive.

## Post-correction verified wait, first checkpoint

The previous turn made progress by reproducing/fixing the Westcreek boundary failure and passing37 focused tests. This continuation reread the attachment, polled original85190 live and independently confirmed51055, preceding holder90733 and Redis40681 are running. The pipeline still has not acquired the shared resource, so final core/full and final-source performance remain unrun. All34 runtime/test/package hashes match the new225830Z restore-tested checkpoint; diff check passes. No source edits or duplicate jobs were introduced. This is the first wait-only checkpoint after that correction. Keep the goal active and inspect this existing pipeline when it advances.

## Post-correction verified wait, second checkpoint

Previous goal turn was a verified wait. Reread the objective and polled85190 twice live;51055, holder90733 and Redis40681 are independently live. Final core-v4,full-v4 and performance-final receipts remain absent; the original queue has not reached our job. Diff check passes, with no source edits, duplicate runs or workflow bypass. This is the second consecutive wait-only checkpoint after the Westcreek correction. Completion is unproven; keep the goal active and preserve the exact pipeline. If the same genuine dependency persists a third consecutive turn with no other safe required work, apply the blocked audit.

## Post-correction blocked audit, third checkpoint

Previous goal turn was a verified wait. Reread the objective and polled85190 live again;51055, preceding holder90733 and owned Redis40681 remain independently live. The original acceptance pipeline is still waiting for the common browser resource; final core/full receipts are absent and final-source performance has not run. The same exclusive-resource dependency has now persisted across three consecutive wait-only goal turns after the Westcreek fix. No independently executable required work remains before those frozen-source gates, and committing before verification or bypassing/duplicating the live queue is disallowed.

Mark the goal blocked on external browser-queue progress, preserving the original job and Redis. It is not complete: final broad verification, updated performance evidence, delivery-overlap reconciliation and verified reviewable delivery remain required. Resume by polling85190/process51055 and inspecting core-v4/full-v4/performance-final artifacts plus source hashes when available; fix demonstrated failures. Do not restart the job merely because it waits. No commit, merge, deployment or production activation has occurred.

## Maintainer-authorized delivery

The maintainer explicitly requested “commit push and merge to main please.” This authorizes protected integration without another approval question. Current origin/main was fetched and still equals the exact f4aa1670 base; REST open-PR inspection found no existing police PR. The external protected merge guard exists and is executable. Fresh precommit focused validation passes37/37 with zero skips (`/tmp/police598-precommit-focused.txt`), and `git diff --check` passes. Broader final core/full/performance remain pending in the same live85190/51055 pipeline; they are required before protected landing, not represented as passing evidence in the PR.

Prepare a source-only verified commit and push, open a PR with pending checks explicit so hosted CI can run while the original local pipeline waits, then land through `pnpm run land` only after required final local gates pass. Generated `data/reports/shared-experience.json` and ignored evidence are excluded from the commit. The queued hash guard now includes the stable owned runtime/test/package file list even after those files become committed, retaining source-identity checks across commit creation. Keep other owners' checkouts and claims intact.
