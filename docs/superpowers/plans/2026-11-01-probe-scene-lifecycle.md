# Probe scene lifecycle implementation plan

> For agentic workers: use superpowers:executing-plans to implement this bounded repair inline.

**Goal:** Restore the existing diagnostic probe's launch on the current SDK so loading/error and lifecycle behavior can be inspected.

**Architecture:** Keep the existing ProbeController and all origin, navigation, authentication and measurement boundaries. Move its window creation from AppDelegate into one UIWindowSceneDelegate, using the already working bundled-origin experiment's scene pattern. This is not a production-host selection or scaffold.

**Tech stack:** Existing Swift/UIKit/WebKit, XcodeGen, Node simulator tooling; no new dependency.

**Spec:** #286 host-build/lifecycle requirements and the observed UIKit launch failure recorded in `2026-11-01-host-isolation-286-audit.md`.

## Constraints and review focus

- Preserve iOS 16.4 deployment target, app identity, entry allowlist, permissions, zero JS-to-native message surface and existing auth behavior.
- Keep a single window scene; connect the existing controller to the actual UIWindowScene.
- A successful simctl request is not app survival; check the actual process and inspect rendered state.
- Preserve application lifecycle recording and manual recovery controls; scene adoption alone does not prove focus restoration.
- Simulator launch is separate from physical-device, production-host, performance and accessibility acceptance.

## One repair increment

- [x] Inspect ownership/callers and build unchanged main in Release simulator configuration.
- [x] Preserve baseline screenshot and UIKit log showing the mandatory scene-lifecycle failure.
- [x] Run `scripts/ios-probe-launch-smoke.mjs` against unchanged app and retain its expected failing process/lifecycle result.
- [x] Move window ownership to ProbeSceneDelegate in `experiments/ios-probe/App/ProbeApp.swift` and register one scene in `App/Info.plist`; keep ProbeController security/auth/measurement behavior unchanged.
- [x] Rebuild unsigned Release simulator app and rerun the same launch regression; inspect screenshot and live process evidence.
- [x] Run existing 21 Swift probe-policy tests and 26 JavaScript probe tests. Inspect background/foreground recording in the built app separately if available.
- [x] Review the narrow source patch, record exact source/package evidence and update the original decision task/ledger. Keep the larger host goal open.

## Rendered-control finding

Ruling: include a bounded diagnostic toolbar repair in this increment because the actual post-launch screenshot hides Browser and truncates Reload, directly preventing the requested host recovery/control inspection. The local screenshot OCR regression found only Stop and exited 1 on `.runtime/probe-launch-green/screen.png`. This is rendered-label evidence, not accessibility or touch-hit proof.

- [x] Add `scripts/ios-probe-controls-smoke.swift` and run it against the original screenshot; preserve the missing Browser/Reload result.
- [x] Put status above an equal-width action row and use the existing shared button helper to require at least 44-point controls. Preserve Reload, Browser, Stop and optional Phases actions exactly.
- [x] Rebuild and rerun launch/lifecycle smoke, inspect both screenshots and run the same visual-label check before and after foreground.

Review also requires the smoke to record actual Info.plist configuration/source metadata, retain native JSONL and attempt simulator shutdown/deletion independently without obscuring the original error. These corrections passed the final simulator rerun; raw JSONL, metadata and cleanup results are retained. The initial green run retained event summaries but did not retain raw JSONL before teardown.

The bounded native repair and its focused checks are verified. Delivery is not ready: both final core attempts timed out in preview tests, so no commit or publication occurred. See the parent audit ledger and portable simulator evidence for exact failures and remaining full-goal requirements.


## Loading/error presentation follow-up

Source inspection after the recorded blank-loading capture found the sample callback assigns Scene ready/Sign-in/loading without preserving navigation failure or renderer termination, and only provisional failures have a native callback handler. This is a presentation gap; origin/bridge/media/navigation authorization stays unchanged.

- [x] Add red behavioral tests for loading banner, sticky failure/termination across repeated sample updates, ignored stale completion and explicit new-navigation recovery. Implement a small Foundation `ProbePagePresentation` state value consumed by the existing toolbar status label.
- [x] Fence native completion/failure presentation to the current WKNavigation identity; handle both provisional and committed failures with the same existing retry message. Keep raw error codes only and existing sample generation guards.
- [ ] Run focused Swift/JS and simulator typecheck; build and capture actual loading/error/lifecycle views when the queue permits. No rendered or physical-focus claim from unit/typecheck results.


Presentation regressions passed24Swift/26JavaScript with0failures/skips. Initial missing-model compile failure is retained in `/tmp/river-oaks-probe-presentation-red-20261101.log`; green results in `/tmp/river-oaks-probe-presentation-green-20261101.log` and `/tmp/river-oaks-probe-presentation-js-20261101.log`. All final native App/ProbeCore Swift sources typechecked for iOS16.4 Simulator, exit0 (`/tmp/river-oaks-probe-presentation-native-typecheck-20261101.log`). Read-only review found no important correctness/fencing issue. Model tests do not prove native delegate execution, actual Reload recovery or rendered focus; linked Release build and real simulator captures remain required.


Final native evidence: Release profiles at base51c28e2a plus the dirty code passed under49355, including an actual HTTP404 failure banner and all four narrow-layout labels after foreground. Main-document status correlation is conservative: repeated URLs/history ambiguity are explicitly unavailable. ProbeCore28tests and probe JavaScript26tests passed. The packet at `docs/acceptance/ios-host-followup-20261101/` preserves intermediate findings and final source/package hashes. Physical-device, human focus, highlighted/disabled, authenticated-world and manual Reload interaction acceptance remain unqualified; the implementation/review/source and recorded simulator checks are complete for this increment.
