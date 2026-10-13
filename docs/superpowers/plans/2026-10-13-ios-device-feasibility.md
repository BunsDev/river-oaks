# iOS physical-device feasibility — #285

## Objective and scope
Pursue #284 through #285–#294. First establish a measured architecture decision with real iPhones. No production host selected yet. Probe code is disposable.

## Ownership
- Task: ios-device-feasibility; owner codex-ios-rollout-20261013.
- Branch: feat/ios-device-probe-20261013; external sibling worktree.
- Own experiments/ios-probe/, scripts/ios-probe.mjs, scripts/tests/ios-probe.test.js, docs/ios-feasibility.md and this ledger.
- Source baseline: 3db6a5f0e381d3e9257bff42c63ac785d08e2ba4.

## Plan
1. Reconcile current source, origin/security and platform support; document hard gates and candidate matrix.
2. Test measurement aggregation and native navigation/configuration boundaries before implementing a WKWebView probe.
3. Build Release simulator/device, install on authorized paired iPhone, capture Safari/WKWebView evidence.
4. Record missing minimum-device/live-auth/human evidence; obtain independent technical review before a go/revise/stop decision.
5. Continue eligible privacy and signing prerequisites; advance production packaging only after #285 passes.

## Required verification
Focused behavioral tests; native build/tests; actual phone measurements with raw samples and exact build/device/workload; core pnpm verification. Full/Redis/browser, CI, physical vs simulated, live auth and human checks remain separate.

## Results
- Live #284–#294 all open with zero comments, no iOS PR or existing iOS task.
- Xcode 26.6 (17F113), iOS SDK 26.5, xcodegen available.
- iPhone 16 Pro Max paired/available; development signing identities present.
- Val authorized team 9LR8Z8UQ9X, bundle ai.typesafe.place.ios-probe, development provisioning and device measurement.
- project:check reports existing unrelated ownership/unregistered-branch/retirement gaps; preserve those tasks.

## Implementation and observed checks
- Disposable WKWebView probe with exact HTTPS top-level policy, bounded Turnstile child frames, isolated measurement world, sanitized local JSONL, native deadline and final drain.
- Experimental system-browser GitHub device flow reuses the existing desktop server exchange; transient credentials remain in memory, redirects are refused, session cookie validated before import.
- Native regression suite: 12 passed. Node collector/summary suite: 11 passed (including termination reporting). Real macOS WebKit fixture loaded the actual scene and collected 21 frame intervals. Final focused checks passed. A redundant WebKit rerun was canceled while waiting behind five other browser jobs; its earlier unchanged-script result remains the available browser evidence.
- Release simulator and development-signed physical builds installed/launched. Initial Info.plist and child-frame issues were reproduced and corrected. Val confirmed Turnstile works.
- Val reported world loaded after GitHub retry, then confirmed frozen/blank view. Current raw recording lacks a GitHub exchange event: isolated flow proof remains open.
- Physical recording 087AB2FD: three ready samples, WebContent terminations at 12:25:05 and 12:25:32 UTC after reload. Last counters: 3,377,648 triangles / 931 calls, Auto scale 1 and occlusion true, native thermal 0. Not a sustained run; cause not established.
- `pnpm run verify` passed: tooling 86, preview 2,737 passed/1 skipped, server 421 passed/134 skipped, desktop 49 passed, Python 141 passed. The subsequent summary regression is covered by the final tooling rerun: 87 passed, zero skipped. Full Redis/browser, hosted CI and signed distribution not verified.
- Independent technical review findings about final drain, deadlines, navigation fences, build metadata, quality metadata, summary frame retention and write failures were addressed. Follow-up auth review found no blocking defect; monotonic auth deadline and cancellation regressions added.
- Native-only collector control also terminated twice (12:37:51/12:38:12 UTC); the injected sampler is not a necessary trigger. The first native trace recorded an exit watchdog, distinct from earlier WebContent failures; Activity Monitor trace exported its table of contents (32.28 seconds, target app exited); 28 exported samples show native-host-only peak footprint 13.35 MiB. WebContent/GPU were not captured, so combined memory and termination cause remain unknown. Browser button corrected to identify the default browser rather than falsely label it Safari.
- Privacy/data inventory (#292) and development-signing prerequisites (#293) recorded in docs/ios-feasibility.md. No distribution or production account changes.

## Evidence
Private `.runtime/ios-probe/`: core.log, auth-green.log, js-green.log, webkit.json, device-build.log, simulator-build.log, install-device.json, launch-device.json and auth-success-records/. Copy only app Documents, never login storage. Original recording 087AB2FD uses the pre-monotonic-clock build. The later C5E6607B control run includes monotonic auth and native-only mode; the Browser-label correction was built afterward. Preserve each build distinction.

## Gaps and next action
#285 remains open: reproduce termination with a targeted trace, establish hosted source and WebContent/GPU memory, compare Safari, then run sustained representative workloads only once stable. Minimum phone, touch/interior/multiplayer/recovery, human accessibility and distribution remain unverified. Verified implementation committed and pushed as 9f2096a9c22890e5f3a5adc43e91f89441ec14e0 (valid SSH signature). Draft PR #309 is open; no merge or issue closure. Do not archive the worktree.

## First-run handoff
- Draft PR: https://github.com/BunsDev/river-oaks/pull/309. Implementation source: 9f2096a9c22890e5f3a5adc43e91f89441ec14e0; clean-source signed rebuild also passed in `.runtime/ios-probe/committed-device/` (subsequently installed for the next reproduction).
- Final Release simulator/device builds and strict code-sign verification passed. Staged secret scan passed; no unrelated files included.
- Browser comparison: Val clarified Safari freezes or reloads while loading. This is human-observed behavior without a correlated Safari trace. Clean-source native-only probe C456B60A reproduced termination five seconds after launch at 12:48:23 UTC. An all-process Activity Monitor capture is being exported to include WebContent/GPU rather than only host memory.
- The task stays active and #285 stays open. Next: target WebContent/GPU memory rather than host-only metrics; preserve security and fidelity until cause is established.
- Worktree contains the ongoing experiment and private raw evidence; it is not ready for retirement or archival.

## Updated-main verification and trace gap
Integrated origin/main at e8a2c8d (email acceptance, settings, dominoes and desktop microphone work). The probe implementation and shared rendering pipeline are unchanged by that integration. `pnpm run verify` passed again: tooling 87, preview 2,750 passed/1 skipped, server 421 passed/134 skipped, desktop 51, Python 141. Receipt/log: `.runtime/agent/core.json`, `.runtime/ios-probe/core-integrated.log`.

The 45-second all-process Activity Monitor capture reached its time limit but has not finished finalizing. `xctrace export` reports `Document Missing Template Error`; a process sample shows remote device symbol-signature lookup. One SIGINT requested normal stop after more than seven minutes. Preserve the raw trace and log; no WebContent/GPU footprint or termination cause has been extracted. This is a tooling gap, not evidence of a memory limit. Next continuation should inspect the existing trace process/output before starting another capture.
