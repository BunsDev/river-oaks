# Quaternius clip import (2026-10-26)

Task `quaternius-clip-import`. Branch `feat/quaternius-clips-20261026` from origin/main 3df540ee344261d9836a3ec27075b54801e306df, in the worktree `../river-oaks-quaternius-clips`. Current owner: `codex:quaternius-phase2-20261027` (initial owner: cody).

## Current checkpoint (2026-10-27)

Phase 2 implementation, fresh exports, focused checks, core gate and independent coverage are finished locally. The goal is not marked complete or review-ready: the required canonical `pnpm run verify full` command failed twice in the existing lander queue-wakeup test. Both failures remain preserved; independent results do not supersede them. No commit, push, merge or deployment was performed. Phase 1 remains excluded because PR #694 is still open and unmerged. See the final handoff below for exact results, the remaining blocker and resumption steps. Earlier chronological entries retain their original failures and pending states.

## Objective

Ship grouped in-place Quaternius clip packs (UAL1/UAL2, CC0) and one Quaternius base character (Regular_Female_FullBody) as a second rig family, under the pinned-asset, receipt and audit rules. Walking keeps the procedural gait.

Val approved the plan and Regular_Female_FullBody on 2026-10-26, and the order: Phase 0 + Phase 2 now; Phase 1 after `character-recipes-20261026` merges.

## Files owned (now)

- `scripts/build_quaternius_clips.py`
- `scripts/quaternius_clip_audit.py`
- `scripts/quaternius_clip_publish.py`
- `tests/test_quaternius_clip_audit.py`
- `tests/test_quaternius_clip_publish.py`
- `preview/src/animation-clips.js`
- `preview/src/animation-clip-assets.js`
- `preview/tests/animation-clips.test.js`
- `preview/e2e/quaternius-clips.js`
- `preview/public/assets/animations/`
- `docs/animation-clips.md`
- `docs/superpowers/plans/2026-10-26-quaternius-clip-import.md`

Phase 1 adds `preview/src/character-assets.js`, `preview/src/character-compatibility.js`, `preview/src/avatars.js` and `scripts/character-assets-audit.mjs` only after rebasing on the merged character-recipes work (it pins four bases and adds avatars.js bake inputs).

## Sources (untracked, `data/raw/characters/quaternius/`)

UAL1.glb and UAL2.glb (in place, not _RM), Regular_Female_FullBody.gltf/.bin, Textures/, license copies. Hashes: `archives.sha256` (source zips), `files.sha256` (copied files).

## Checks

- Phase 2: clip audit (no meshes, tracks target family joints, no root translation on in-place groups, hash/receipt match); per-group sizes recorded here.
- `pnpm test`, `pnpm run build`, `pnpm run verify`.

## Results

- Phase 0: worktree at 3df540ee344261d9836a3ec27075b54801e306df (first run was a partial zsh paste; resumed with a bash script). Sources copied and hashed. Baseline not yet run.

## Gaps

- Base is behind current origin/main; rebase before publishing.
- Phase 1 blocked on character-recipes merge. Phase 3 insertion point must be checked against avatars.js after that merge.

## Next

Phase 2: write scripts/build_quaternius_clips.py (Blender 5.2.2 headless) and export ambient-idle, seated, service, garden and interact groups.


## Script recovery (2026-10-26)

Restored the original 349-line Python block from the Phase 2 assistant message at 2026-10-27T02:12:15.303Z in local session fe8f48c6-fc34-46c7-8be1-b00b1b00930d. The prior file contained only `NOT SAVED: clipboard is not the script`; its bytes are preserved at `/private/tmp/quaternius-placeholder-before-recovery.txt`. Recovery was requested by the user in the Codex recovery session; task ownership remains with cody.

Verification: Python syntax compilation passed and the saved file exactly matches the recovered source, SHA-256 `6db8ca7a5b46d5adc354a0fd3df5c46384d6965617877dc1fcc6ca6e19f39a57`. Blender staging/export, asset audits and repository test gates were not run during recovery. No generated assets were published.

Next: run the recovered script in Blender without `--write`, inspect `.runtime/quaternius-clips/report.json`, and address any staging/audit failures before copying assets to the public directory. The broader import remains incomplete.

## Phase 2 resumption (2026-10-27)

Owner: `codex:quaternius-phase2-20261027`, following the user's explicit instruction to resume this task. The recovered script and source receipts are preserved. CWD review found only an idle zsh shell after the inspection commands exited, no competing agent or Blender process in this worktree. Phase 1 is excluded: GitHub REST confirmed PR #694 open and unmerged at `27e608049d3d153fe3cb91ca0c38c3b49a4313f1`.

Requirements: all five exact clip sets; mesh-free, valid tracks and family-compatible rest transforms; no root translation; negative audit regressions; parsing/playback through the existing GLTF loader; hashes, source and license receipts, sizes and registry; unchanged procedural walking; focused tests, pnpm test, build and core verification; reviewed diff and handoff.

First attempt: `python3 -m py_compile scripts/build_quaternius_clips.py` passed. Queued Blender staging without `--write` failed to launch with ENOENT because `/Applications/Blender.app` is absent. The terminal result is preserved at `.runtime/quaternius-phase2/01-blender-staging.log`; no export report or public assets were created. Recovered source backup: `.runtime/quaternius-phase2/recovered-exporter.py`.

Pre-flight: this revision has no `animation-clips.js` or `clip-layer.js`. Avatar assets load through `createAssetGLTFLoader` in `gltf-image-decoder.js`. Ruling: add a separate, lazy clip-group registry/loader through that existing factory, with explicit family rejection, without wiring clips into the procedural avatar gait or importing a new character. This satisfies Phase 2; incorrectly enabling a current MakeHuman rig would violate compatibility.

Startup inventory `/tmp/quaternius-retirement-start.json`: 111 worktrees, 75 branches, no retire-eligible rows. Preserve `test/mvp-regression-20261023` pending its owner's exact-head release/session review; all other blockers and owners remain in that inventory. Project-wide reconciliation gaps are retained in `/tmp/quaternius-project-check-start.json`.

Next: restore the required local Blender toolchain, run staging, preserve failures, then implement audit and loader regressions before final assets.

### Toolchain and focused checks

The required Blender 5.2.2 LTS DMG was downloaded from `https://mirror.blender.org/release/Blender5.2/blender-5.2.2-macos-arm64.dmg` and verified against the adjacent official `.sha256` manifest: `dc4125399b8bfefe283cc1624d6cfc7809d1cac20ace51072127eb371f31f210`. It is mounted read-only at `/tmp/river-oaks-quaternius-blender-5.2.2`; `Blender --version` reports 5.2.2 LTS. No application installation or user-preference changes were made. The second staging attempt is queued through the shared browser lock; log `.runtime/quaternius-phase2/02-blender-staging.log`, exec session `68063`. Do not start a duplicate while it remains live.

`pnpm install --frozen-lockfile --offline` and `uv sync --locked` completed. Initial doctor recorded the missing Python environment before sync. Source files match all four entries in the existing `files.sha256` receipt (`.runtime/quaternius-phase2/source-hash-check.log`).

Audit code extracted from the recovered exporter is under test in `scripts/quaternius_clip_audit.py`; the queued original exporter is intentionally still unchanged until its first actual run completes. The initial pytest import error is retained as `03-audit-red.log`; using the repository's `runpy.run_path` convention corrected collection. Eleven behavioral cases then failed against the recovered audit (`04-audit-red.log`), followed by 17/17 passing after validation of all samples, times, hierarchy, scale, unique channels and buffer bounds (`05-audit-green.log`). Six further malformed-buffer/index/payload cases failed (`08-audit-red.log`) and now all 23 pass (`09-audit-green.log`). Ruff check/format passes for these two files.

The new lazy loader uses `createAssetGLTFLoader`, checks pinned byte count and SHA-256, rejects unsupported rig families before fetch, validates clip sets/targets, shares only the cached template and returns independent scene/clip clones. Four local-HTTP/real-parser/playback regressions failed before implementation (`06-loader-red.log`) and passed afterward (`07-loader-green.log`). They cover playback without root movement, independent consumer state, no implicit family retargeting, explicit retry after failure and bad hashes/catalogs. The default asset registry is deliberately empty until actual staging audits pass; synthetic loader tests do not prove exported-asset acceptance.

Still pending: actual Blender staging and report, integration of the strengthened audit into the exporter, publication to the local public asset directory after a full pass, complete provenance and pinned registry, real-asset loader checks, required broad gates and final review. The shared queue's current holder PID 81742 and its browser PID 81752 were confirmed live; no bypass or restart is authorized by slowness.

The UAL1 and UAL2 skeletons have the same 65 named joints, parent names and local translation/rotation/scale values (live source comparison). Added the real-public-assets loader/playback regression before generating assets: it currently fails because the default registry is empty, while the four fixture loader tests pass (`10-real-assets-red.log`). Once exports pass, this check must load all five groups through local HTTP and the actual runtime parser, compare their receipts and evaluate all 39 clips at four times without root drift or non-finite/non-unit joint transforms. This red result is intentional unfinished acceptance, not a completed gate.

### First Blender execution

The queued original script finally ran unchanged and failed after importing both packs: `export_group` encountered `None` in `bpy.context.view_layer.objects` after deleting the imported non-target objects. Exit 1 and traceback are preserved in `02-blender-staging.log`; no report or GLBs were produced. The original script hash still matched the recovery receipt. Root cause: stale evaluated view-layer entries after direct data removal. Added `bpy.context.view_layer.update()` before selection; the same Blender staging command is the end-to-end regression, now running as exec session `65497` with log `11-blender-staging.log`. No audit assertions were changed for this fix.

### Staging passed

The view-layer refresh fixed the crash. The next run exported all five groups but failed the unchanged root-channel assertion for all 39 clips. Its report and all five GLBs are preserved under `.runtime/quaternius-phase2/11-root-channel-failure/`. Inspection found every added root translation channel had exactly two `(0, 0, 0)` samples: Blender's forced sampling recreated constant channels after the FCurves had been removed.

Added two failing regressions for normalization (`12-normalize-red.log`), then a normalization step that removes only root channels exactly equal to the root's rest position; any motion is refused before modifying the file. The binary chunk and every other channel remain unchanged. Both tests passed, making 25 audit tests (`13-normalize-green.log`). Integrated the stronger audit into the exporter, including source parent names. The same Blender staging command then exited 0 with all five groups passing (`14-blender-strict-staging.log`, `14-staging-passed.json`).

Staged byte sizes: ambient-idle 641,772; seated 821,788; service 501,716; garden 578,916; interact 402,184. Public output was still absent at this checkpoint.

Added a local bundle writer and five failing-then-passing regressions: refuse failed/incomplete audits, changed staging bytes and changed source bytes before creating public output; successful output includes matching GLBs, catalog, source receipt and both verbatim license copies (`15-publish-red.log`, `16-publish-green.log`). All 30 focused Python tests and Ruff checks pass. The explicit Blender `--write` run now repeats every export/audit before generating the public bundle; log `17-blender-write.log`.

### Motion-fidelity check and duration fix

The first public bundle passed all five loader regressions, including all 39 clips (`18-real-assets-green.log`). A separate comparison against both original source GLBs then caught a one-frame truncation in `Sitting_Idle03_Loop`: source duration 4.1666665077 s, output 4.1333332062 s. The first comparison incorrectly required every optimized track endpoint to remain identical; corrected it to require the whole clip duration while comparing values at the union of source/output key times. The clip-duration failure persisted and was real (`19-source-motion-first.log`, `20-source-motion.log`). The pre-fix public bundle and report are preserved at `17-before-duration-fix/`.

Added failing regressions for one-frame truncation and near-integer imported frame ranges (`21-duration-red.log`). Explicit integral NLA action/strip bounds preserve the final frame without rounding genuine fractional frames. Added source clip-duration checks to every group audit. All 32 focused Python tests passed (`22-duration-green.log`), and the corrected staged export passed all audits (`23-duration-staging.log`). The staged source-motion comparison then passed all 39 clips, 7,566 tracks and 554,064 sample comparisons: worst rotation dot 0.9999998903623627, worst vector delta 0.000002682209014892578 (`24-staged-motion.log`, `staged-motion-comparison.json`). The comparison script is retained at `.runtime/quaternius-phase2/compare-source-motion.py`.

The publisher now pins the original UAL1/UAL2 hashes independently of the freshly generated report, preventing changed source bytes from being mislabeled with the known original archive hashes. The new regression failed then passed (`25-source-pin-red.log`, `26-source-pin-green.log`); 33 focused Python cases pass. A final Blender `--write` run is queued as exec session `8556`, log `27-final-blender-write.log`.

Added `preview/e2e/quaternius-clips.js`: a standalone loopback Vite asset fixture with an empty temporary env directory, no app config or town/auth server, and an allowlist of the five GLBs. It exercises browser Web Crypto, the actual loader and mixer, every clip and unsupported-family rejection. Node syntax check passes; actual browser execution is pending. The verification pipeline is queued behind final export as exec session `90772`: source-motion comparison, focused Python, real-asset loader, Chromium fixture, `pnpm test`, `pnpm run build`, then `pnpm run verify`. Logs are numbered `28` through `34` and `verification-queue.log`; do not duplicate the live pipeline.

An explicit-model reviewer dispatch failed before execution because that model is unavailable for this account. The fresh read-only reviewer is running with the inherited model (`quaternius_review_default`); no review has passed yet.


### Final review and corrective pass

The inherited-model reviewer completed its whole-change review: no Critical findings; Important gaps in complete channel/motion coverage and non-joint ancestor validation; a stale-success-report finding initially graded Minor. Ruling: treat stale-success reporting as Important because an exception could leave a previous approval presented as the current rebuild result, undermining the staging/publication boundary. Cost if left unfixed: a failed candidate can appear approved.

Canceled only our two still-queued wrappers (PIDs 48707 and 74744, original exec sessions 8556 and 90772) after verifying their exact commands and absence of child processes. The other task's live queue holder was untouched. Original queue logs remain intact. The previous prompt-only turn made evidence progress by confirming the jobs were still queued and PR #694 remained open/unmerged; it did not complete the goal.

Eight behavioral regressions failed against the pre-fix implementation (`35-review-red.log`): dropped-channel coverage, changed later unit rotation, three ancestor TRS mutations, two scene-membership mutations, and stale-success invalidation. The audit now requires the full source channel set except intentionally removed root translation, compares source/output motion at all key times and interval midpoints, checks all joint ancestors and scene roots, and derives duration from referenced samplers. Each attempt preserves the previous report under `.runtime/quaternius-clips/history/`, writes a running/false status before work, and writes failed/false status on an exception. All 42 focused Python cases pass (`36-review-green.log`); Ruff and Python compilation pass. Fresh staging is queued as exec session 3813, log `37-reviewed-staging.log`.

Final: Ruling: final bundle/receipt and Chromium/broad gates were declined by the reviewer because they were pending; they remain required and will be checked against the corrected candidate. Cost if wrong: stale assets or an unexercised runtime path could be handed off as verified.

Final: Ruling: hosted CI, skinning/visual/human acceptance, Phase 1 compatibility and Phase 3 avatar binding are separate from this local Phase 2 goal. No such acceptance is claimed; PR #694 remains open and Phase 1 is excluded. Cost if wrong: users could mistake skeleton-loader proof for an accepted playable character. No deferred minor findings remain after regrading the stale-report finding.


The corrected audit was also run against the existing staged bytes using the actual exporter source-context function: all five groups, 39 clips, 7,566 tracks and 1,100,562 key/midpoint comparisons pass (`36-existing-staging-review-audit.json`). This is evidence for those bytes only; fresh Blender staging and public regeneration remain required. Additional duration-with-unused-sampler and successful-attempt-report checks bring focused Python coverage to 44 passing tests (`36-review-expanded-green.log`).

Prepared final bundle consistency checks covering current pipeline hashes, source/license bytes, public/staged GLBs, catalog and reports. Full verification will use an owned disposable loopback Redis process via `.runtime/quaternius-phase2/full-with-redis.py`; it does not use or flush an existing service. Latest retirement inventory `/tmp/quaternius-retirement-review.json` records 121 worktrees and 82 branches, no eligible rows; this local-only refresh marks remote status unknown. Preserve all blocked candidates and the active dirty clip worktree.


The previous goal turn made implementation progress: eight review regressions failed then passed, 44 focused cases now pass, and the strengthened audit accepts all existing staged motion. Fresh staging is still queued in exec session 3813. Queued the dependent final write and verification as one shared-queue run, exec session 54670 (`38-final-queue.log`). Its precondition requires fresh passed staging with all 39 motion-audited clips; it then reruns Blender with `--write`, checks bundle consistency, captures source/asset hashes, and runs the prepared focused/browser/core/full checks. Do not duplicate either live process.


Acceptance-scope check: the original recovered exporter still matches SHA-256 `6db8ca7a5b46d5adc354a0fd3df5c46384d6965617877dc1fcc6ca6e19f39a57`; its complete GROUPS mapping exactly equals the corrected exporter (8/10/6/9/6 clips). Tracked avatars.js, character-assets.js and character-compatibility.js remain unchanged from HEAD. Receipt: `.runtime/quaternius-phase2/approved-scope-check.json`. Existing staging and final-pipeline sessions remain live and queued; no fresh export or broad-gate success is claimed.


Queue observation: the external holder PID 44026 completed its rendering child and entered its existing machine-load gate (`gate()` in its acceptance wrapper, one-minute load must be <= 12, checked every 20 seconds). The observed load was 15.79. Both owned exec sessions 3813 and 54670 remain live and queued. This is a verified wait for the shared holder; no restart, bypass, priority change or intervention in another task is authorized by the delay.


Runtime-tool continuity: exec session handles 3813 and 54670 became unavailable following the tool/runtime update. Direct process inspection confirms the original staging wrapper PID 15690 and final pipeline wrapper PID 25614 remain live (now parent PID 1), with their original commands and queue logs. Neither was restarted. Added an EXIT trap to the still-queued final pipeline script to persist `.runtime/quaternius-phase2/final-pipeline-exit.txt`; `sh -n` passes. Continue observing these exact processes and their reports/logs rather than treating missing handles as terminal jobs.


While the heavy jobs remained queued, repository-wide lightweight Python checks completed: `uv run --locked ruff check .` passed (`41-python-lint.log`), and `uv run --locked ruff format --check .` passed with 585 files already formatted (`42-python-format.log`). No source edits were required. These are lint/format results only; they do not replace fresh export, runtime playback or the pending core/full profiles.


### Reviewed fresh staging passed

The original staging wrapper PID 15690 ran after the shared holder released the queue and has now terminated. Its log ends with all five groups marked ok and Blender quit (`37-reviewed-staging.log`); the original tool session handle was unavailable, so no captured process exit code is claimed. Fresh report attempt `fe69fdd9c6284ed78243d44a412aade3` has `ok: true`, `status: passed`, no group problems and `written: []`. Preserved the complete report as `.runtime/quaternius-phase2/37-reviewed-staging-passed.json` before the queued write can replace it.

Post-export consistency inspection verified the exact approved clip sets against the exporter, and every staged file against its reported byte count and SHA-256 (`37-staging-consistency.json`). All five groups contain 39 clips, 7,566 tracks and 1,100,562 motion comparisons; worst rotation dot is 0.9999998903623627 and worst vector delta is 0.000002682209014892578. Sizes are ambient-idle 641,772; seated 813,512; service 501,716; garden 578,916; interact 402,184 bytes, totaling 2,938,100 bytes.

The same final pipeline wrapper PID 25614 remains live and queued behind two existing browser runs, currently holder PID 40273. Its fresh-staging precondition is now satisfied. Public regeneration, final bundle checks, focused/runtime/browser checks and broad core/full gates remain pending. No duplicate pipeline was launched, and no review-ready or delivery claim is made.


### Final public bundle and runtime checks

The original final pipeline PID 25614 acquired the shared queue and completed Blender `--write` successfully. Fresh attempt `2fc379ef7a1a4f1b97b817220ff76043` passed all five group audits and wrote the five GLBs, two verbatim license copies, source receipt and generated runtime catalog. The report is preserved at `.runtime/quaternius-phase2/38-reviewed-write-passed.json`; log `38-reviewed-write.log` ends with Blender quit. The enclosing `set -eu` pipeline continued into verification, confirming the write command succeeded.

`39-bundle-consistency.json` passes for all five groups, 39 clips and 2,938,100 GLB bytes, including current pipeline hashes, original source/license bytes, staged/public hashes and catalog/receipt agreement. `verification-inputs.json` pins the dirty candidate's implementation, tests and generated asset hashes at HEAD `3df540ee344261d9836a3ec27075b54801e306df`. Independent source-motion comparison passed 39 clips, 7,566 tracks and 554,064 comparisons (`28-final-motion.log`).

Focused Python checks passed 44/44 (`29-focused-python.log`); runtime loader checks passed 5/5 with zero skips (`30-final-loader.log`), including all 39 actual exported clips. The Chromium 156.0.8078.4 fixture passed with all five groups, 39 clips, unsupported-family rejection and no page errors (`31-browser.log`, `browser-check.json`). The fixture exercises local fetch/Web Crypto, the production GLTF loader and mixer, finite joint transforms and unchanged root positions; it does not render a skinned character or prove human visual acceptance. These results complete the reviewer-declined bundle/runtime checks; broad regression gates remain required.

The original pipeline is now running `pnpm test`; build, core and isolated-Redis full verification remain pending. A fresh GitHub REST check confirms character-recipes PR #694 remains open and unmerged at head `27e608049d3d153fe3cb91ca0c38c3b49a4313f1`; Phase 1 remains excluded. No commit, merge, deployment or review-ready claim has been made.


The final pipeline completed `pnpm test`: 4,220 tests, 4,219 passed, zero failures and one skipped in 243,391.946458 ms (`32-pnpm-test.log`). The skip is “Vince: glazing beside the doorway blocks entry and permits retreat”: “Negative-test approach is already obstructed; not evidence about the glass.” It remains an explicit coverage gap and is not counted as acceptance of glazing behavior. `pnpm run build` then passed (`33-build.log`), including the seven-file sign-in entry check; Vite emitted its chunk-size warning for bundles above 500 kB. `pnpm run verify` is currently running in the same original pipeline; isolated-Redis full verification follows. Rechecked all 17 source/test/asset hashes against `verification-inputs.json` and the exact HEAD: unchanged.


### Core gate passed; full gate running

`pnpm run verify` passed at 2026-10-27T22:31:05.943Z for dirty HEAD `3df540ee344261d9836a3ec27075b54801e306df`. The complete receipt is preserved as `.runtime/quaternius-phase2/34-core-passed.json`; console evidence is `34-core.log`. All 11 selected checks have their expected exits: agent tests 281 passed; preview tests 4,219 passed and one previously documented skip; server tests 926 passed and 227 skipped; desktop tests 127 passed and five skipped; build, Ruff lint/format, 214 Python tests, demo, demo verifier and secret scan passed. The demo verifier intentionally expects exit 2 for the blocked synthetic fixture; it is not world acceptance. The five desktop skips require Linux `/proc` (two) or Windows PowerShell (three). Core does not establish Redis, native desktop, live authentication, visual or human accessibility acceptance. The log retains WebSocket listener warnings, Vite chunk warnings and 66 Python deprecation warnings.

The same original pipeline PID 25614 started full verification with an owned disposable loopback Redis service. All prerequisite presence checks passed (`40-full-doctor.json`), and the dependency audit reported no known vulnerabilities (`40-full.log`). Full execution is still running; no final full receipt or pipeline exit is claimed. Wait for this exact process and inspect every required result before declaring review-ready.


### First full failure and unchanged retry

The original final pipeline terminated with exit 1. Full verification passed its dependency audit, then failed agent tests: 280 passed, one failed, zero skipped. The failure is the existing `scripts/tests/land-pr.test.js:122` queue-wakeup regression: “queue release did not wake the lander” at the 30-second assertion. The worker subsequently finished at the 120-second fallback. Every later full-profile stage is `not_run`; this attempt provides no Redis/browser/full acceptance. Original log, full receipt, doctor receipt, Redis log, input hashes and terminal exit are preserved under `.runtime/quaternius-phase2/40-first-full-failure/`. The owned Redis process stopped with the pipeline.

A targeted unchanged run, `node --test --test-name-pattern='a queued lander wakes on release without waiting for the fallback or touching GitHub early' scripts/tests/land-pr.test.js`, passed 1/1; test duration 10.543792 ms (`45-lander-wakeup-focused.log`). Current live task records independently document the same intermittent queue-wakeup failure on other branches. This supports an unchanged retry, not a claim that the underlying notification issue is fixed. Queue tooling is outside this clip patch and has separately recorded ownership; no timeout/assertion or queue source was changed.

Queued one retry of the complete full profile through the shared queue, exec session 27458, using the same owned disposable-Redis helper. Logs: `46-full-retry-queue.log` and `46-full-retry.log`; terminal status will be persisted in `46-full-retry-exit.txt`. Do not restart the completed export/core pipeline or duplicate this retry. Core and clip-specific results remain valid for their unchanged inputs; full success is still required.

Local retirement refresh `/tmp/quaternius-retirement-final.json` completed: 118 worktrees, 83 branches, no eligible classified rows. GitHub/fetch were disabled, so remote status remains unknown. All blocked candidates and this dirty undelivered worktree are preserved. Whitespace inspection found no diagnostics in 12 authored/generated text files; the two verbatim licenses retain upstream CRLF/trailing whitespace. The first ad hoc checker misclassified normal no-index diff exit 1; corrected results and that limitation are recorded in `44-whitespace-check.json`.


### Second full failure; independent coverage queued

The unchanged full retry also terminated with exit 1 after the same existing queue-wakeup test failed at 30 seconds (280 agent tests passed, one failed). Its receipt/log/doctor/Redis/exit evidence is preserved under `.runtime/quaternius-phase2/46-second-full-failure/`. All later stages were again `not_run`. The complete unchanged lander test file then passed 29/29 in isolation (`47-lander-file-focused.log`). Neither isolated pass repairs or supersedes the two failed canonical full runs.

To gather the remaining required coverage without hiding the failed gate, queued one independent verification run as exec session 83254. It first runs every agent test with `node --test --test-concurrency=1` as a scheduling diagnostic, then executes each remaining task from the original full profile with its exact configured command, environment and expected exit. Each task has a separate receipt under `.runtime/quaternius-phase2/48-checks/`; failures remain visible while independent later checks continue. Aggregate evidence is `48-independent-results.json`; output is `48-independent-checks.log`, queue log `48-independent-queue.log`, terminal exit `48-independent-exit.txt`. The helper starts and cleans up only its own disposable loopback Redis; distinct service/doctor logs are `48-redis.log` and `48-doctor.json`.

This diagnostic run does not overwrite `.runtime/agent/full.json` or claim that `pnpm run verify full` passed. The canonical full gate remains failed pending diagnosis at the queue tooling seam. No production source, test assertion, timing threshold or profile definition was changed. Observe the same queued independent run rather than launching another full retry.


### Independent verification progress

The serial agent diagnostic passed all 281 tests with zero skips in 75,308.871417 ms. The unchanged preview command passed 4,219 tests with the same one glazing skip; the unchanged server command, now against the owned disposable Redis, passed all 1,195 tests with zero skips in 94,031.947333 ms. Desktop passed 127 tests with the same five platform-specific skips. Independent build, Python lint/format/tests, demo/demo-verifier, current-tree and history secret scans, security-browser and reflection checks passed. Each command and exit is recorded in its `48-checks/` receipt; complete console counts and warnings remain in `48-independent-checks.log`.

The same independent process PID 20855 / session 83254 has reached the experience journeys; Commons, shared and IPIC checks follow. These results add previously missing Redis/browser coverage. They do not convert either failed canonical full run into a pass or establish the root cause of the concurrency-sensitive queue-wakeup failure.


The independent experience stage passed all 16 requested journeys with exit 0 in 969,235 ms (`48-checks/experience.json`). Inspected and preserved the detailed report as `48-experience-passed.json`: every result is `passed`, including World Studio, spatial circulation/streets, office/Computer, campus office/traversal/suite. The run has moved to East Garden Commons; shared and IPIC follow. The tracked `data/reports/experience.json` change is this run's generated evidence, not intended patch source; its preserved copy allows restoring the tracked historical report at handoff.


East Garden Commons passed (`48-checks/experience-commons.json`); its detailed passed report is preserved as `48-commons-passed.json`. Shared-world verification then passed all 28 journeys with full Chromium rendering on the Apple M5 Max ANGLE Metal renderer, exit 0 in 1,107,246 ms (`48-checks/shared.json`, preserved `48-shared-passed.json`). The same process PID 20855 / session 83254 is running IPIC screening, the last independent stage. Its result, final candidate consistency audit and handoff remain pending; the canonical full-gate failures remain unchanged.


## Final local handoff (2026-10-27)

Worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-quaternius-clips`; branch: `feat/quaternius-clips-20261026`; HEAD: `3df540ee344261d9836a3ec27075b54801e306df`. The patch remains uncommitted. All 17 pinned implementation/test/asset files still match `verification-inputs.json`; final evidence is `49-final-candidate-audit.json` and `49-final-bundle-consistency.json` under `.runtime/quaternius-phase2/`. Exact approved GROUPS match the recovered original. All tracked source files, including procedural gait and Phase 1 registry/compatibility/avatars, remain unchanged.

The local bundle contains the five approved groups and all 39 clips, totaling 2,938,100 GLB bytes, with no meshes or root translation, source-compatible joints/ancestors, valid tracks, pinned catalog, original source/archive hashes, exact pipeline hashes and verbatim CC0 licenses. Fresh staging preceded the final public write; both passed reports remain preserved (`37-reviewed-staging-passed.json`, `38-reviewed-write-passed.json`). Maintained motion audits covered 7,566 tracks and 1,100,562 key/midpoint comparisons. The independent source comparison covered 554,064 samples. Unsupported families remain rejected; Phase 1 and avatar binding were not added.

| Verification | Result | Evidence |
| --- | --- | --- |
| Focused Python | 44 passed | `29-focused-python.log` |
| Real runtime loader | 5 passed; all 39 clips; zero skips | `30-final-loader.log` |
| Browser clip seam | Five groups, 39 clips, family rejection, no page errors | `browser-check.json` |
| `pnpm test` | 4,219 passed, zero failed, one glazing skip | `32-pnpm-test.log` |
| `pnpm run build` | Passed; chunk-size warning retained | `33-build.log` |
| `pnpm run verify` | All 11 selected checks passed; scope/skips recorded above | `34-core-passed.json` |
| `pnpm run verify full` | Failed twice in existing queue-wakeup test; later tasks not run in those attempts | `40-first-full-failure/`, `46-second-full-failure/` |
| Independent remaining checks + serial agent diagnostic | 18 stages passed; wrapper exit 0 | `48-independent-results.json`, `48-independent-exit.txt`, `48-checks/` |
| Redis-backed server | 1,195 passed, zero skips | `48-independent-checks.log` |
| Experience / Commons / shared | 16 / 1 / 28 journeys passed | `48-experience-passed.json`, `48-commons-passed.json`, `48-shared-passed.json` |
| IPIC screening | 19 checks passed, including synchronization, controls, captions, responsive layout and cleanup | `48-ipic-passed.json` |

The independent run used each remaining full-profile command with its original expected exit and environment, plus a separately labeled serial agent diagnostic (281/281). It did not alter the canonical full receipt. The actual default-concurrency core agent suite also passed 281/281. The failed queue-wakeup case passed alone and in its complete 29-test file, but the underlying intermittent notification failure is unresolved. The serial result is diagnostic, not a replacement passing full gate.

Final review rulings stand: complete channel/motion fidelity and ancestor/scene checks were Important and fixed; stale-success reporting was regraded Important and fixed. Their failing-then-passing regressions include `test_rejects_dropped_channel_with_unused_sampler_retained`, `test_rejects_changed_later_unit_rotation`, `test_rejects_changed_ancestor_or_scene_membership` and `test_failed_attempt_invalidates_success_and_preserves_history`. Broad core regression coverage passed after that single corrective pass; no second review was requested. No deferred minor findings remain. Cost-if-wrong rulings and acceptance exclusions are retained in the review section above.

Coverage limits remain explicit: the glazing negative test was skipped because its approach was already obstructed; five desktop tests require Linux `/proc` or Windows PowerShell. Core's 227 server skips were covered by the separate Redis run, but those core results themselves remain skips. Existing WebSocket listener, Vite chunk-size and Python deprecation warnings are retained in logs. Fixtures are not live auth, native desktop/Unreal, skinned-character visual acceptance, human accessibility, target-device or deployment proof. Hosted CI and an up-to-date branch remain separate publication/merge gates.

IPIC and the independent wrapper exited successfully; the original wrapper PID 20855 and owned Redis PID 23449 are no longer live. Preserved this run's modified experience/shared reports, proved their bytes matched the preserved copies, then restored only those two tracked historical reports from HEAD (`49-restored-reports.json`). Local retirement inventory `/tmp/quaternius-retirement-handoff.json` reports 118 worktrees and 83 branches with no eligible classified row; remote status is unknown because no fetch/GitHub scan was requested for this local inventory. Preserve all blocked candidates and this undelivered worktree.

Remaining blocker: the canonical full gate must pass before claiming the requested review-ready goal achieved. Queue tooling has separate recorded ownership under `delivery-throughput-20261024`; an expired lease does not authorize takeover. Do not weaken its test, timeout, profile or assertions, and do not silently substitute the independent run for the failed command. Next action: resolve the queue-wakeup failure at that owning seam (or obtain an explicit scope decision), then rerun the canonical full gate through the shared queue with disposable Redis, preserve the new result, and recheck exact candidate hashes before advancing the goal. All authorized Phase 2 implementation and independent acceptance work is preserved for that resumption. No third unchanged full retry is queued.

Fresh dependency check: PR #694 is open and unmerged at head `27e608049d3d153fe3cb91ca0c38c3b49a4313f1`. Its merge remains the Phase 1 prerequisite; no Phase 1 work was performed or claimed.


Reviewable local patch: `.runtime/quaternius-phase2/49-candidate.patch`; exact handoff file hashes: `49-handoff-manifest.json`. Both include the final documentation state and leave the Git index untouched.
