# Human Studio acceptance on Apple platforms

[PR #504](https://github.com/BunsDev/river-oaks/pull/504) targets human garment fit, Safari controls, and preview rendering. Baseline: `153471bc2075e0d02e764a97b0a72129d6da5207`. Signed implementation: `1c9c36c15bf189a33bf3d8bf9296d79ca7393dad`. Local acceptance is recorded below; hosted checks must also pass on the final PR head. No merge or deployment is authorized.

## Changes and visual evidence

- Safari selects and rotation range have explicit 44 px hit areas while retaining native keyboard semantics. Pointer/touch opening restores focus to the Studio entry on close.
- Preview sizing follows its controls, keeping footwear visible. A bounded 1024×1024 contact shadow grounds the character on the pedestal.
- Offscreen previews stop animating and drawing; returning resets elapsed timing. Closing releases the shadow, renderer, canvas, observers and preview context.
- Human looks sharing the source bodice use the existing bind-space clearance fitter. Fitted attributes are cached, each avatar owns its geometry, and disposal restores the source. Unsupported headless rigs allocate no fitted geometry. Jevica retains her existing fitting path.

[Sable before fitting](images/apple-studio/sable-before.png) · [Sable after fitting](images/apple-studio/sable-after.png) · [Phone controls and footwear](images/apple-studio/phone-controls.png)

All 55 wardrobe appearance/pose cases passed. Inspected standing/seated side views exposed and then confirmed coverage of Sable, Lyra and Vesper torso holes. Additional seated front/side/rear captures covered feminine Silvan, Kai explorer and Jevica. Fixture pose captures omit the chair; the separate shared-seating world capture has a rear view partly obscured by the bench. Neither is complete cloth/seat-contact or human art acceptance. Faces, hair, cloth folds and materials still read as stylized; this patch does not establish photorealism.

## Measurements

The acceptance harness uses authenticated local fixtures, 60 warmup frames and 180 requestAnimationFrame samples per look. WebKit 27.2 phone viewports run on this Mac, not iOS hardware. RAF intervals measure scheduling responsiveness, not GPU execution time. Reports and screenshots are retained under `output/playwright/apple-polish-<label>/`.

| Case | Character | Baseline RAF p50 / p95 / max | Follow-up RAF p50 / p95 / max |
| --- | --- | --- | --- |
| Chromium desktop 1440×900 | Sable | 16.7 / 16.7 / 650 ms | 16.7 / 16.7 / 16.8 ms |
| WebKit desktop 1440×900 | Sable | 17 / 19 / 54 ms | 17 / 21 / 28 ms |
| WebKit desktop | Jevica | 17 / 25 / 42 ms | 17 / 21 / 30 ms |
| WebKit desktop | Silvan | 17 / 18 / 28 ms | 17 / 20 / 26 ms |
| WebKit touch 390×844, DPR 3 | Sable | 17 / 18 / 21 ms | 17 / 21 / 34 ms |

Baseline labels: `sable-baseline`, `webkit-baseline`, `phone-baseline`. Final values: `final/report.json`, source digest `c2a4bd06c75a775da4033fd550f291eaf3acc42b1c5ee214a45b1b57d4509ea6`. Earlier follow-ups `stage-after` and `visibility-after` are retained, including the 255 ms phone maximum. Early interrupted Chromium and ENOSPC runs are excluded; the baseline maximum of 650 ms is retained. Short samples and variable host/cache conditions do not prove improved visible frame performance or sustained device readiness.

Instrumented one-second preview draw windows changed from **1,239 visible / 1,176 offscreen / 1,176 resumed** to **2,460 visible / 0 offscreen / 2,419 resumed**. The offscreen reduction is demonstrated. Visible cost increased with the new shadow pass; do not describe this as a general GPU speedup.

| WebKit run | Town ready | Studio ready | Resource transfer / decoded bytes |
| --- | ---: | ---: | ---: |
| Desktop baseline | 13,162 ms | 14,509 ms | 18,791,617 / 18,716,606 |
| Phone baseline | 8,364 ms | 2,653 ms | 18,791,617 / 18,716,606 |
| Desktop stage follow-up | 5,779 ms | 1,604 ms | 18,796,955 / 18,721,944 |
| Phone control/focus follow-up | 7,729 ms | 3,244 ms | 18,794,191 / 18,719,180 |

Each report counted 250 whole-page resource entries, not isolated avatar bytes. Cache and host differences prevent attributing loading differences to this patch. WebKit provides no `performance.memory` value here. Five reopen cycles each removed the canvas and released its context; these counts do not establish total GPU memory or native memory stability.

## Requirement coverage

| Requirement | Verified evidence | Limits / outstanding work |
| --- | --- | --- |
| Human-only roster, garment and pose quality | Human roster unchanged; 55 wardrobe cases; eight fitting/romance regressions; inspected before/after captures | Stylized art remains; no comprehensive human visual or gait acceptance |
| Studio edits, save and restore | Standard Studio/layout journeys: 43 + 4 checks; undo/redo, drafts and automated keyboard saving. Cross-world journey passed saved revision/material preservation, denied admission, recovery and reopened Studio | Shared-account journey passed; local fixture coverage only |
| Desktop and touch layout | WebKit 44 px selects/range; no preview/control overlap; rotation and framing; containment at 390×844, 844×390 and 320×700; focus recovery | Physical iPhone safe-area, touch and VoiceOver acceptance unverified |
| Safari compatibility | Automated WebKit desktop and touch checks passed | Installed Safari rendered the town and Studio in a private local-fixture window (capture below). WebDriver automation remains unavailable; native input sequence and physical iOS acceptance unverified |
| Loading, rendering and resource lifecycle | Measurements above; zero offscreen draws; five released contexts | Final source-digested run passed; no sustained performance or GPU-byte claim |
| Jevica-only office authority | All 914 server tests passed with Redis, including authenticated invitations and revocation. Office browser journey passed immediate guest ejection, revocation during boarding, elevator phases, collision, exit focus and reduced motion | Local fixtures do not establish hosted auth or production acceptance |
| Reviewable delivery | Signed implementation, screenshots, ledger and draft PR; all 16 hosted checks passed, including aggregate `preview` | Final automated Studio browser evidence passed; Core follow-up and Metal screening passed; native Safari rendering observed. Final acceptance commit requires fresh hosted checks |

## Verification record

[Local verification summary](apple-studio-verification.json) preserves task-level outcomes from the failed default gates and the passing follow-ups.

- `node --test preview/tests/sable-bodice-fit.test.js preview/tests/bodice-fit.test.js preview/tests/romance-look.test.js`: **8 passed** (`.runtime/apple-polish/fit-review.log`).
- `pnpm run test:experience character-wardrobe`: **55 cases passed** (`.runtime/apple-polish/wardrobe-after.json`).
- `pnpm run test:experience character-studio-layout character-studio`: **4 + 43 checks passed** (`.runtime/apple-polish/studio-controls-regressions.json`).
- `pnpm run verify full`, with isolated Redis: audit, 121 tooling tests, 3,525 preview tests, all 914 server tests, desktop tests, build, Python lint/format, 141 Python tests, demo/expected-exit verifier, secret scans, security browser tests, reflections and all 12 experience journeys passed. The shared suite finished with 23 passed and one failed (multiplayer-exclusivity ride loss); both a fresh isolated reproduction and a same-server reproduction following multiplayer and indoor-NPC journeys passed without server corrections. The original failure remains unexplained; these passes do not make the full gate green. Full exited 1 and did not run screening. A separate default SwiftShader screening run timed out at player readiness; the follow-up using ANGLE Metal passed all 12 screening checks, including synchronization (3 ms convergence, 0 ms paused spread), host authority, captions, mobile layout and cleanup. This proves local Metal behavior, not SwiftShader readiness. The preview suite has one unrelated skipped Vince glazing test whose approach is obstructed; it is not glass-collision evidence.
- Full experience results are retained at `.runtime/apple-polish/full-experience.json`; generated tracked output was restored after preserving evidence.
- Literal `pnpm run verify` failed one unchanged office texture timing assertion (65.9 ms versus 40 ms) under high host load; the complete core follow-up with four concurrent preview test files passed, preserving every assertion. Its command was `REDIS_URL=<isolated-loopback-Redis> node .runtime/apple-polish/core-bounded.mjs`, retaining every core task and replacing only the preview invocation with `node --test --test-concurrency=4 preview/tests/*.test.js` (expanded sorted file list). Counts: 121 tooling, 3,526 preview passed / one existing skip, 914 server with zero skips, 76 desktop, and 141 Python tests. Build, lint/format, demo/expected-exit verifier and secret scan also passed. Receipt: `.runtime/apple-polish/core-bounded-receipt.json`. This is a passing bounded-concurrency follow-up, not a retroactive pass for the literal default command. The final cross-browser harness passed. Installed Safari could not create a session because remote automation is disabled; direct UI inspection subsequently confirmed native rendering without changing that setting. Final harness uses controls, visibility and lifecycle assertions and computes source hashes after acquiring the browser lock.
- Hosted implementation-head proof: [successful aggregate preview](https://github.com/BunsDev/river-oaks/actions/runs/39130603519/job/117687248787). Later commits require their own checks.
- Plan-index and whitespace checks passed. Live `project:check` reports unrelated retirement, ownership, stash and missing-worktree debt; details remain in `.runtime/apple-polish/project-check.log`. No other owner's work was discarded.

Physical iPhone, human accessibility/usability, sustained target-device performance and production acceptance remain explicitly unverified. Existing licensed assets were reused; no paid services, new dependencies or large asset downloads were introduced.


## Final automated browser evidence

[Machine-readable measurements](apple-studio-final-measurements.json) · [Final desktop](images/apple-studio/final-desktop.png) · [Final touch viewport](images/apple-studio/final-phone.png)

Chromium desktop, WebKit desktop and WebKit touch all passed control/viewport/focus assertions with no page errors. Each exercised five reopen cycles with context loss and canvas removal (15 cycles total). The final touch visibility sample used Silvan: 5,664 visible / 0 offscreen / 5,760 resumed draws. It is additional suspension evidence, not a direct Sable before/after comparison. Inspected final Sable desktop and touch captures: footwear stays above controls and the desktop exposes its editing controls without scrolling.

| Final case | Town ready | Studio ready | Control checks | Reopen cycles |
| --- | ---: | ---: | ---: | ---: |
| chromium-desktop | 6534 ms | 3404 ms | 6 | 5 |
| webkit-desktop | 7295 ms | 1413 ms | 6 | 5 |
| webkit-phone | 5197 ms | 2430 ms | 9 | 5 |

## Installed Safari observation

[Native Safari capture](images/apple-studio/native-safari.png) shows a rendered feminine Silvan portrait, lighting/framing controls, wardrobe controls and the save/close footer together. The local fixture loaded the town and exposed the Studio entry. During inspection the UI changed independently, and the computer-use tool reported user interaction; further actions were paused to avoid interfering. This is native rendering evidence, not a completed agent-driven input, save/restore or accessibility test. Automated WebKit interaction results remain the evidence for those covered behaviors.
