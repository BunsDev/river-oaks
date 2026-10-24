# #290 background input and bfcache safety (PR B)

## Objective
R5: blur, hidden visibility and pagehide release every held input and push-to-talk; persisted pageshow resets timing and obtains a fresh authoritative snapshot. No native lifecycle or network-transition expansion. Draft PR only, no merge/deploy.
Full prompt: `/Users/buns/.codex/attachments/d6b8a0a5-bf89-4acc-954d-71b93531a5b9/pasted-text-1.txt`.
Related graphics ledger: `../river-oaks-resilient-client-290/docs/superpowers/plans/2026-10-20-resilient-client-290.md`.

## Ownership and baseline
- Owner codex:resilient-client-290 (01a15b5e-d941-7862-9948-f5ecdd3bf041).
- Worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-background-input-290`.
- Branch `feat/background-input-290-20261020`, base bd0516fb8117fc04f75e33344ec2efde42810c3b.
- Independent second worktree explicitly allowed by prompt for T6 alongside graphics. Created while graphics browser test waits for another live owner's shared browser lock. Never overlap owned gates/journeys.
- Root/scoped instructions already read. Same base as graphics baseline core: all 11 phases passed there; this branch still needs its own final gate.
- Files: background-lifecycle helper, held-input owners, main lifecycle binding, multiplayer resume boundary, tests/J2/docs.

## Tasks
- [x] Audit every held-input source and existing blur/hidden/pagehide behavior.
- [x] Shared release path and focused failing regressions, then implementation.
- [x] Persisted pageshow clock reset and authoritative snapshot resume.
- [x] J2 real-event journey and shared development journey.
- [x] Final preview tests, core receipt, docs and fresh review/fix pass.
- [x] Initial local commit, authorized unsigned push/draft PR and one #290 evidence comment.
- [x] Keyboard-tap compatibility follow-up: browser/core passed, committed/pushed and existing evidence updated.

## Commands and results
- Fetch/worktree/register claim passed.
- Dependencies install and doctor passed; no env/private runtime copied.

## Decisions for Val
The one required question was asked at23:37Z after verified local commit60078e7a: configure signing, or push unsigned? Val answered Push unsigned at23:39Z; unsigned pushes for this task are authorized. This decision is shared with graphics.

## Gaps
The keyboard-tap compatibility follow-up passes93 focused tests, J2 all14 checks, contextual desktop15/touch17 checks, standalone preview3716/1skip and all11 core phases. Shared development46 checks passed for unchanged connection code. Draft569 includes verified follow-up f6ff7257; its existing evidence comment is updated. Requested local verification and draft publication are complete. No merge or release is authorized. Physical Safari/iOS, VoiceOver, native lifecycle, live voice, real bfcache eligibility and hosted CI remain separate acceptance.

## Next action
Draft PR569 awaits review and latest-head hosted checks. Preserve this worktree; no merge/deploy or retirement is authorized. Graphics remains independent.

## Input audit (source baseline)
| Owner | blur | hidden | pagehide | Remaining delta |
| --- | --- | --- | --- | --- |
| walking-ui keys/look/PTT | keys + drag cancel | same | none | PTT only updates on next render; release immediately; capture buttons centrally |
| tablet-touch.js | n/a | n/a | n/a | Avatar tablet-hand pose math, not input; no change needed |
| office-ui | keys only | keys only | none | Clear look drag, capture, PTT immediately |
| bird-cams | keys only | none | none | Clear keys and look drag, unsubscribe on dispose |
| player-avatar ride holds | controls cleared + tour paused | same | none | Use shared release source, release captures |
| main selection gesture | cancel | cancel | none | Use shared release source |
| speech.js local/optional voice queue | cancel | cancel | none | Route through shared release, no audio restart |
| voice-chat.js | transmit off | mic off | leave pagehide | Preserve leave semantics through shared source and fence pending mic grants |
| multiplayer-client | none | resume only when visible | none | Expose fresh resume for persisted pageshow; current private resume exits while connected |

T6 helper tests: new module absent → red; implementation passed 3/3 for blur/hidden/pagehide, persisted pageshow release-before-resume, captured-pointer release and AbortSignal cleanup. Not wired yet; product R5 remains unproven.

## T6 checkpoint
HEAD bd0516fb, no commits/pushes. Shared page lifecycle is wired to walking, office/bird keys and drag, ride holds, selection and speech/voice. It releases captured pointers and immediate PTT; visibility resume never restores a hold. Persisted pageshow clears controls, resets main clock and calls public multiplayer `resume({fresh:true})`, which fences/closes the previous socket and re-admits through existing auth/ticket/snapshot handling.
Office pagehide regression failed on transmit remaining true before implementation, then passed. Voice hidden-hold regression failed because the latch stayed held, then passed. A late microphone grant regression reproduced surprise transmit after blur; microphone attempt fencing now stops that original participant and leaves state off. All 60 focused tests passed: `node --test preview/tests/background-lifecycle.test.js preview/tests/voice-chat.test.js preview/tests/office-ui.test.js`.
J2 `preview/e2e/background-input.js` authored with real fake-device mic tracks, held movement and drag, blur/hidden/pagehide/pageshow, and new socket/fresh snapshot assertions. `experience-runner.js` enables only the existing local voice fixture for this journey. Syntax/diff checks passed; journey not run yet. Tests use read-only fixture-response pose instrumentation.
Docs/testing.md labels J2 local-only and limits synthetic events/voice transport. Full preview/core, J2, shared development, fresh review, signed/authorized commits, draft PR and #290 comment remain unproven. No own browser run launched while graphics session 47431 is queued/running.
Next action: run J2 when graphics browser run ends, diagnose without weakening assertions; run all gates before commit.

### Held-key repeat checkpoint
A focused regression reproduced KeyM repeat restarting transmit after pagehide. Walking, office, bird controls and ride buttons now ignore repeated keydowns (their held sets already carry continuous input), requiring a fresh press after release. J2 dispatches repeats after return. Same 60 focused tests pass, 0 skips. Graphics repeat session98365 remains queued; B browser/full core remain not run.

## Full local gate checkpoint
`pnpm test` passed3705/3706, one existing skip,174.24s; console `/tmp/river-oaks-290-background-tests.log`. `PATH=/opt/homebrew/opt/python@3.12/libexec/bin:$PATH nice -n 19 pnpm run verify` passed all11 phases at dirty basebd0516fb (receipt `.runtime/agent/core.json`, 22:58:22–23:03:06Z). Counts: tooling160pass/3skip; preview3705/1; server732/212; desktop115/3; Python145passed/66warnings; build/lint/format/demo/secrets passed. Skips are not evidence; no Redis/browser/native/production acceptance from core. Console `/tmp/river-oaks-290-background-core.log`. No own journey overlapped.
Then fast-forwarded to origin/main a35214f38795ced1ee6867aad5c3c2723a7ceaae (#566 archive tooling only); no product overlap. Affected `pnpm run verify tooling` plus doctor now running exec48730, console `/tmp/river-oaks-290-background-tooling-refresh.log`. No feature commits or pushes.
Next: collect tooling/doctor, then run J2 and selected shared multiplayer-dev journey, review and commit. Signing remains unset and question remains unasked until a verified commit is ready for push.

Tooling refresh correction: first command omitted the required Python3.12 PATH, selecting macOS Python3.9.6. Archive tests failed on `tarfile.extractall(filter=...)`; no feature regression or source fix. Re-run with Python3.12.15 is active, exec39241, log `/tmp/river-oaks-290-background-tooling-refresh-python312.log`; doctor follows only on success. Previous exec48730 is terminal exit1.

Affected tooling refresh with required Python3.12 passed165/168,3existing skips (36.21s), receipt `.runtime/agent/tooling.json` at a35214f3; doctor passed (exec39241 terminal exit0). J2 first run started, report `background-input-first.json`, console `/tmp/river-oaks-290-j2-first.log`. No own gate overlaps.

## J2 diagnosis checkpoint
First J2 failed `blur: held movement stops before keyup`; isolated repeat also failed at load23.90/22.06/18.79 (below overload guidance). Logs `/tmp/river-oaks-290-j2-first.log`, `/tmp/river-oaks-290-j2-repeat.log`; sessions99331/47177 terminal exit1. Repeat showed velocity cleared to[0,0] but later became[0,-0.00135695], moving3.6mm: `trackVelocity` retains spring acceleration.
Root fix: new `stopWalking` clears velocity, acceleration and speed; shared walking clear/halt uses it. Regression observes the real spring over20 frames, retains exact position, then proves a fresh press moves. Focused suite68/68 passed. J2 rerun with unchanged exact-position thresholds active exec7856, console `/tmp/river-oaks-290-j2-stop.log`, report `background-input-stop.json`. Earlier core was before this fix, so final full preview/core must be refreshed. No feature commits.

## Fresh review and one fix pass (2026-10-20T23:18Z)
Read-only whole-branch review found three Important issues, no Critical/Minor. All reproduced/verified and fixed in this pass: (1) automatic microphone restoration from deferred room/town rejoin is fenced by release generation and intent; four regressions failed before and passed after. (2) release brakes the actual mounted bicycle and cancels residual held flight lift/horizontal motion; exact-position physics regressions pass, including early takeoff and fresh input. Explicitly requested landing remains autonomous. (3) movement buttons now own Enter/Space activation, prevent repeat/keyup native click restart, and retain assistive activation; focused regression passes and J2 now exercises native keyboard events.
Review boundaries ruled: World Studio separate editor viewport is outside the game-input slice; autonomous bird cruising and explicitly requested flight landing are intentional simulation, not held controls. Toggle-mode microphone remains intentional on blur; hidden/pagehide mute/end capture. No second review requested.
`node --test preview/tests/held-button.test.js preview/tests/held-movement.test.js preview/tests/voice-chat.test.js preview/tests/plaza-bicycle.test.js preview/tests/flight.test.js preview/tests/background-lifecycle.test.js preview/tests/walking.test.js preview/tests/office-ui.test.js`: 92 passed, 0 skipped. Console `/tmp/river-oaks-290-background-review-focused.log`.
J2 before review fixes passed all exact movement/drag/transmit/fresh snapshot cases (`background-input-stop.json`). `RIVER_OAKS_SHARED_JOURNEY=multiplayer-dev RIVER_OAKS_SHARED_REPORT=background-input-shared-local.json pnpm run test:shared development` passed; console `/tmp/river-oaks-290-background-shared.log`. Final expanded J2 queued as exec67583; final preview/core pending.
HEAD a35214f3; all feature edits uncommitted, generated local reports excluded. Next: collect final J2, run final preview/core serially after own journeys finish, verify owner, commit; signing question before first push.

Final expanded J2 passed at23:25Z: 13 checks in11.626s, no uncaught errors; `RIVER_OAKS_E2E_REPORT=background-input-local.json pnpm run test:experience background-input`, report `data/reports/background-input-local.json`, console `/tmp/river-oaks-290-background-final-journey.log`. Native Enter/Space repeats and stale keyup remained stopped until a new press. Selected shared journey passed46 checks in76.05s.
Final `pnpm test` then Python3.12 `nice -n 19 pnpm run verify` running under the ordinary shared lock (`#290 background final preview and core`, exec91796), avoiding concurrent owned journeys. No bypass or other process changes.

Final `pnpm test` passed3715/3716,0fail/1existing skip,198.72s; `/tmp/river-oaks-290-background-final-tests.log`. Core now running at a35214f3 with all review fixes.

## Before first commit/push checkpoint (2026-10-20T23:36Z)
Implementation and requested verification complete for PR B. Final `PATH=/opt/homebrew/opt/python@3.12/libexec/bin:$PATH nice -n 19 pnpm run verify` passed all11 phases, receipt `.runtime/agent/core.json`, start23:28:39.794Z/end23:36:11.351Z, dirty base a35214f38795ced1ee6867aad5c3c2723a7ceaae. Console `/tmp/river-oaks-290-background-final-core.log`. Counts: tooling165pass/3skip, preview3715pass/1skip, server732pass/212skip, desktop115pass/3skip, Python145pass/66warnings; build, lint, format, demo and secrets pass. Demo verification's expected exit2 is the tested synthetic-domain result. Skips are not proof; full Redis/audit/browser profile, native/live/hosted acceptance not run.
Final standalone preview3715pass/1skip, focused92/92, J2 all13 and shared all46 checks pass. Fresh review's three Important findings fixed and verified; no second review. Main refreshed before commit and remains a35214f3. Owner verified unchanged. Generated `data/reports/*.json` excluded from staging. Only owned source/tests/docs will be committed; no lockfile/env/primary edits. Commit trailer follows the exact format supplied in the task; executor is Codex/GPT-6.
No push/PR/comment yet. Signing gpg.format is unset; the task's one signing question will be asked after the verified local commit and before first push. Worktree and branch are preserved.

Local feature commit:60078e7ad45fa276b4ab68a6ee2d1d144b14eb13. Pre-commit secret guard passed. Only generated local reports remain untracked. At23:37Z asked the single required signing question (gpg.format unset); no answer/push/PR/evidence comment yet. Next: signing answer, then push own branch, REST draft PR, one #290 evidence comment, final ledger/register handoff. Graphics work continues independently.

Before first push: Val explicitly answered Push unsigned. Feature60078e7a remains unchanged and verified; only this ledger has an uncommitted approval/checkpoint update, to be finalized with PR/evidence URLs. Push own branch and create draft against main; no merge/deploy.

## Draft handoff (2026-10-20T23:40Z)
- Implementation and requested verification complete; draft opened, not merged or released.
- PR https://github.com/BunsDev/river-oaks/pull/569 against main, draft=true. Verified implementation60078e7ad45fa276b4ab68a6ee2d1d144b14eb13; this follow-up changes ledger metadata only.
- Exactly one evidence comment posted: https://github.com/BunsDev/river-oaks/issues/290#issuecomment-6304277748 .
- R5 met for browser-game input and synthetic persisted-pageshow behavior; R6 local docs/gates/register/PR/evidence complete. Device/human/live/full-profile/hosted limits above remain unverified. No native or network-transition expansion.
- Unsigned push explicitly authorized by Val. No remaining signing question. Worktree/branch retained for review; task remains active awaiting review, not delivered/retired.
- Metadata-only follow-up verification: git diff --check plus installed pre-commit secret guard. Product files are unchanged from the passing final gate and journeys.

## Keyboard tap compatibility follow-up (2026-10-20T23:44Z)
While checking existing contextual-first-visit acceptance, found that quick native Enter taps must retain the original180ms pulse; immediate keyup release could end before a rendered frame. New behavioral regression reproduced it. Held-button now keeps the minimum pulse for a fresh tap, continues a long hold until keyup, and lifecycle release cancels both timer/hold so repeat or stale Space keyup cannot revive input. Assistive activation remains unchanged. Focused suite93/93 passes. J2 now checks a quick tap as well as held release; contextual-first-visit will also run.
This is a local uncommitted compatibility correction beyond published verified implementation60078e7a (PR head f3026277 metadata). Refresh browser/full gates before committing/pushing; update the existing #290 evidence comment, never post a second one. Final endpoint not complete until this correction is delivered.

## File-by-file handoff

| File | Change and reason |
| --- | --- |
| `preview/src/background-lifecycle.js` | One document event source clears captures/holds and orders persisted resume. |
| `preview/src/held-button.js` | Native/assistive activation with retained short taps and release fences. |
| `preview/src/held-movement.js` | Stop walking, bicycle speed and manual flight lift at release. |
| `preview/src/walking.js` | Clear residual spring acceleration as well as velocity. |
| `preview/src/walking-ui.js` | Release keys/look/PTT immediately and reject stale key repeats. |
| `preview/src/flight.js` | Do not reintroduce lift from stale altitude targeting after release. |
| `preview/src/office-ui.js` | Release office keys/look/PTT and use safe held buttons. |
| `preview/src/bird-cams.js` | Release camera key/drag state through the shared lifecycle. |
| `preview/src/player-avatar.js` | Release ride holds/captures on all background events. |
| `preview/src/main.js` | Release selection gesture and reset timing/fresh multiplayer admission on persisted pageshow. |
| `preview/src/speech.js` | Cancel speech queue/playback through the same release source. |
| `preview/src/voice-chat.js` | Fence microphone grants and deferred automatic restoration after release. |
| `preview/src/multiplayer-client.js` | Fresh resume closes/fences the old socket and uses normal authorized snapshot admission. |
| `preview/e2e/background-input.js` | Real lifecycle/native keyboard events, exact stopped position and fresh snapshot assertions. |
| `preview/e2e/experience-runner.js` | Enable the existing local voice fixture for J2. |
| `preview/tests/background-lifecycle.test.js` | Release/resume ordering, pointer captures and subscriber teardown. |
| `preview/tests/held-button.test.js` | Repeat/stale keyup fences, quick taps and assistive activation. |
| `preview/tests/held-movement.test.js` | Actual walking/flight physics stop and fresh-input resumption. |
| `preview/tests/office-ui.test.js` | Office immediate PTT release on background lifecycle. |
| `preview/tests/plaza-bicycle.test.js` | Actual bicycle stop and fresh-input resumption. |
| `preview/tests/voice-chat.test.js` | Late permission and room/town reconnect cannot restore released transmit intent. |
| `preview/tests/walking.test.js` | Residual spring state cannot move the player after release. |
| `docs/testing.md` | Declare J2 local-only synthetic lifecycle/voice evidence and limits. |
| `docs/superpowers/plans/2026-10-20-background-input-290.md` | Task scope, ownership, audit, verification and delivery evidence. |

## Hosted checkpoint (2026-10-21T00:03Z)
At published head f3026277, hosted campus shard failed garden-campus-suite: resident lift to Floor 2 timed out after30s; garden-campus-office passed. Job118950316561, run39516655518; console saved `/tmp/river-oaks-290-background-hosted-campus.log`. No diff-related cause established. `gh run rerun 39516655518 --job 118950316561` returned job cannot be rerun while the overall run remains active; no rerun started. Recheck terminal run before the single authorized retry. Current local tap follow-up remains pending its own queued gates. Hosted results are not claimed green.

Hosted run39516655518 completed with only campus and its aggregate preview failing. `gh run rerun 39516655518 --failed` succeeded at00:12Z: this is the single authorized failed-job retry (attempt2), following the earlier rejected request. Do not rerun it again.

Hosted retry result at00:26Z: run39516655518 attempt2 completed success at published head f302627725f3872a2285c59457662cf62b5345db. The campus failure passed its single rerun; no production fix or assertion change. This is evidence for that published head only, not the uncommitted keyboard-tap follow-up.

## Keyboard compatibility browser proof (2026-10-21T01:05Z)
`RIVER_OAKS_E2E_REPORT=background-input-keyboard-local.json pnpm run test:experience background-input contextual-first-visit` passed: J2 all14 checks in9.605s, including fresh quick tap, native Enter/Space release, exact stopped movement and fresh authorized snapshot; contextual first visit desktop15/touch17 checks in31.047s. No browser errors. Console `/tmp/river-oaks-290-background-keyboard-journeys.log`; local report remains uncommitted. Follow-up standalone preview and core are running in exec39539; no commit until their actual results.

## Before follow-up commit/push (2026-10-21T01:11Z)
All requested follow-up verification passed. Standalone `pnpm test`:3716passed/0failed/1existing skip,124.092s; `/tmp/river-oaks-290-background-keyboard-tests.log`. `PATH=/opt/homebrew/opt/python@3.12/libexec/bin:$PATH nice -n 19 pnpm run verify`: all11 phases passed, `.runtime/agent/core.json`, start01:06:50.157Z/end01:10:41.872Z, dirty parent f302627725f3872a2285c59457662cf62b5345db. Counts tooling168pass/0skip, preview3716pass/1skip, server732pass/212skip, desktop115pass/3skip, Python145passed/66warnings. Build/lint/format/demo/secrets pass; expected demo exit2 remains the synthetic-domain result. Exec39539 ended0.
Main fetched and unchanged at a35214f3; primary checkout clean. Ownership confirmed and leases renewed through03:06Z. Uncommitted product delta is only held-button.js, its focused regression and expanded J2, plus this ledger. Local generated reports are excluded. No source change after these gates. Commit/push unsigned per Val’s explicit answer, then update PR569 and EDIT the single existing evidence comment. Published head f3026277 already passed hosted Verify attempt2; the next head requires its own hosted checks.

## Refreshed draft handoff / before metadata push (2026-10-21T01:13Z)
Verified product follow-up f6ff7257c64a138166895408a7559dd429c5c4c7 was committed with the installed secret guard passing and pushed unsigned under Val’s authorization. PR https://github.com/BunsDev/river-oaks/pull/569 remains draft against main. Its description and the original #290 comment https://github.com/BunsDev/river-oaks/issues/290#issuecomment-6304277748 were updated at01:12:29Z; exactly one B evidence comment exists.
R5 met for the scoped browser-game lifecycle; R6 local gates, docs, register and draft/evidence delivery complete. Latest-head hosted checks and previously listed device/human/live/full-profile limits remain unverified. Implementation complete, requested local verification complete, draft opened/updated; not merged or released.
This final follow-up changes only this ledger: product files match the passing core/J2/contextual source. Metadata verification is git diff --check plus the installed pre-commit secret guard. Owner rechecked before commit. Generated local reports are preserved untracked. Task remains active awaiting review, not delivered/retired.

## Open-PR sweep review fix (2026-10-24)
Val authorized landing. Session claude:river-oaks-a3 (task open-pr-sweep-20261024) did the work below.
- Merged main `641655d2` (`4112bc58`). There were four single-import conflicts, all resolved by keeping both sides.
- Fixed a review finding in `548d884e`: a plain window blur set `automaticMicAllowed = false`. An open toggle-mode microphone was then dropped at the next voice-space rejoin, and auto-unmute stayed off for the rest of the session. Blur now only ends a push-to-talk hold. Releasing a hold fences restoring it. Hidden, pagehide and persisted pageshow keep the full block.
- Added regressions: the blur, space-change, restore case, and key release during a deferred room or town rejoin. Both failed on the previous source.
- Focused tests: preview 209/209, server 40 passed with 10 Redis skips.
- `pnpm run verify` (core) on `548d884e` passed: tooling 225/225, preview 3924 passed with 1 skip, server 867 passed with 219 Redis skips, desktop 115 passed with 3 skips, build, Python, demo and secrets.
- Not run locally, because the shared browser queue was saturated: J2 and the contextual journeys.
- The original commits were unsigned and the merge guard refuses unverified commits. The history is therefore rebuilt as one SSH-signed commit whose tree is exactly the verified `548d884e` tree. The old head is preserved at `refs/sign-branch-backup/feat/background-input-290-20261020/aad16b97…`.
