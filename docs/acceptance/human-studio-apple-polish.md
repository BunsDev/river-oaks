# Human Studio Apple acceptance — work in progress

Baseline source: `153471bc2075e0d02e764a97b0a72129d6da5207`. This report records measured observations, not release acceptance. The goal includes character realism, Studio reliability, runtime performance, office authority, and a verified PR. Local implementation and focused acceptance are recorded below; full verification, installed Safari, and PR checks remain in progress.

## Method and limits

`node preview/e2e/character-apple-baseline.mjs <label>` uses the existing authenticated local fixture and shared browser lock. Each character receives 60 warmup frames and 180 sampled requestAnimationFrame intervals. Reports retain OS/browser, viewport/DPR, resource counts, load durations, controls and screenshots in `output/playwright/apple-polish-<label>/`. Phone cases emulate a touch viewport on this Mac, not a physical iPhone. RAF measures scheduling responsiveness, not GPU execution time; JS heap and renderer counts do not establish total GPU memory. Local fixture auth does not establish hosted auth.

The initial interrupted Chromium run is excluded from timings. Host free disk fell to 1.1 GB during setup; later measurements are exploratory and require repeated stable-host samples before a performance improvement is claimed. Browser startup/cache differences make cross-engine loading comparisons unsuitable as an optimization result.

## Baseline observations

| Case | Character | RAF p50 / p95 / max (ms) | Evidence |
| --- | --- | --- | --- |
| Chromium desktop 1440×900 | Sable | 16.7 / 16.7 / 650 | `apple-polish-sable-baseline/report.json` |
| WebKit desktop 1440×900 | Sable | 17 / 19 / 54 | `apple-polish-webkit-baseline/report.json` |
| WebKit desktop 1440×900 | Jevica | 17 / 25 / 42 | same report |
| WebKit desktop 1440×900 | Silvan | 17 / 18 / 28 | same report |
| WebKit touch viewport 390×844, DPR 3 | Sable | 17 / 18 / 21 | `apple-polish-phone-baseline/report.json` |

Desktop controls fit without scrolling. Phone uses one workspace scroll region and has no horizontal overflow. WebKit native selects measured 20 px high and the range input box measured 3 px high. Color radios report a smaller input box inside their clickable 44 px labels; these need label-aware hit testing rather than treating the input box as the full target.

Inspected Sable and Jevica captures show coherent human silhouettes but a conspicuous waist seam and weak contact with the pedestal. These are investigation priorities, not an assertion that clothing, faces, hair, footwear or animation meet the realism target. Walking/seating/transitions and all supported looks remain to be audited.

## First verified fix

Studio selects and rotation range now have explicit 44 px hit areas, with custom control appearance retaining native semantics. Pointer/touch opening remembers the entry button for focus restoration because Safari does not focus clicked buttons.

WebKit phone follow-up (`apple-polish-phone-controls-focus/report.json`) passed eight checks: target size, keyboard range adjustment, touch range adjustment, framing selection, horizontal containment at 390×844 / 844×390 / 320×700, and closing focus. Sable RAF p50/p95/max was 17/20/37 ms; this short observation supports neither an improvement claim nor a sustained device budget. The subsequent desktop and standard Studio regressions passed, as recorded below.

## Remaining acceptance

- Matched rendering and motion inspection across supported human looks; fix prioritized realism/grounding/cloth issues.
- Repeated stable-host loading/frame/resource/lifecycle measurements and runtime improvements.
- Complete edit/save/restore/failure/shared paths and office access/revocation regressions.
- Core/full and hosted checks; reviewable PR. No merge or deploy authorized.
- Physical iOS/Safari and macOS device, VoiceOver, human usability and visual quality acceptance are not established by these automated runs.

## Visibility scheduling and ground contact

The standard Chromium Studio suite passed all 43 checks plus four dedicated layout checks after the native-control/focus fix. The WebKit desktop retry also passed; its earlier ENOSPC report remains excluded.

A separately instrumented WebKit phone run counted preview WebGL draw calls over fixed one-second windows: 1,239 visible / 1,176 entirely offscreen / 1,176 resumed before the scheduling change. The preview now uses IntersectionObserver to skip animation and rendering while outside its scroll viewport, resetting elapsed animation timing on return.

After the change: 2,460 visible / **0 offscreen** / 2,419 resumed. Visible draw count increased because this increment also adds a bounded 1024×1024 shadow map, explicitly disposed on closure, to ground the character on the pedestal. The matched short Sable run recorded RAF p50/p95/max 17/18/255 ms; this is not evidence of improved visible frame performance. The subsequent three-look desktop run and five-cycle lifecycle checks passed, as recorded below.

The preview now participates in flex layout so taller controls cannot obscure the shoes. WebKit phone checks passed nine assertions including no preview/control overlap, target sizes, rotation input, three viewport sizes and focus restoration. The follow-up image was inspected: shoes and pedestal remain visible, and the shadow establishes ground contact. Clothing seam and broader anatomical/material/animation acceptance remain unresolved.

## Bodice clipping correction

Sable's five-pose browser audit passed its existing diagnostics, but inspected side captures revealed significant torso penetration. Ray probes against the shipped rig reproduced 8–13 mm of overlap at the side panels. Sable now uses the existing Jevica bind-space fitting routine, which projects intersecting cloth outside the skin and transfers normalized skin weights. Fitted attributes are cached per source bodice; each avatar owns a separate geometry and restores/releases it on disposal. The source asset and garment topology remain intact.

Both the existing Jevica regression and new Sable side-clearance regression passed. The subsequent five-pose browser audit passed; inspected standing and seated side views show the exposed torso gap removed. Before/after captures are preserved under `apple-polish-poses-before` and `apple-polish-poses-after`. This fixes the observed clipping, not all clothing aesthetics or animation contacts. The subsequent full wardrobe matrix passed all 55 cases, as recorded below.

The final three-look WebKit desktop stage run passed with no page errors (Sable/Jevica/Silvan RAF p95 19/22/18 ms). Five reopen cycles each released their preview WebGL context and removed the canvas. Context-release evidence is not a complete native/GPU-memory measurement.


## Completed wardrobe audit and review captures

The final `pnpm run test:experience character-wardrobe` rerun passed all 55 appearance/pose cases after extending the shared bodice fitter to every non-Jevica look that uses that source garment. The combined bodice and romance-look regression run passed eight tests, including cleanup on unsupported headless rigs. Its report is retained at `.runtime/apple-polish/wardrobe-after.json`.

Inspected final seated front/side/rear captures for Lyra, Vesper, feminine Silvan, Kai explorer, and Jevica. The observed Lyra/Vesper torso holes are covered after fitting. Feminine Silvan retains opaque torso coverage; Kai and Jevica show coherent seated silhouettes. These fixture captures omit a chair and therefore do not prove world seat contact. Hair, faces, cloth folds, costume ornaments, and material response still read as stylized; this patch does not establish ultra-realistic character quality. World movement and transition acceptance needs the separate journey results.

Reviewable captures:

- [Sable before fitting](images/apple-studio/sable-before.png)
- [Sable after fitting](images/apple-studio/sable-after.png)
- [Phone controls and visible footwear](images/apple-studio/phone-controls.png)

Full verification is in progress with an isolated Redis service. Dependency audit, 121 tooling tests, 3,525 preview tests, and all 914 server tests passed. The preview suite skipped one unrelated Vince storefront-glass test because its approach is already obstructed; that skip is not glass-collision evidence. Remaining checks and the queued installed-Safari probe are not yet accepted.


## Requirement coverage and delivery gate

| Requirement | Current evidence | Remaining limit or gate |
| --- | --- | --- |
| Human-only characters, clothing and pose quality | Existing human roster retained; 55 wardrobe cases passed; real-rig side-clearance regressions and inspected before/after captures | Stylized faces, hair and materials remain; no claim of photorealism or human art approval |
| Studio editing, saving and restoring | Standard Studio journey passed 43 checks plus four layout checks, including undo/redo, retained drafts and automated keyboard saving | Fresh shared-account journey remains part of the running full gate |
| Desktop space and iPhone touch layout | Explicit 44 px select/range targets; preview avoids controls; WebKit containment at 390×844, 844×390 and 320×700 | Emulated phone viewport; physical safe-area and human touch acceptance remain unverified |
| Safari compatibility and keyboard | Automated WebKit desktop/phone controls, framing and focus restoration passed | Installed macOS Safari probe queued; physical iOS not tested |
| Loading, rendering and memory lifecycle | Fixed warmup/frame samples, resource counts, loading times, zero hidden preview draws, five released contexts on reopen | Counts do not establish GPU bytes; shadow pass adds visible rendering cost; no sustained device-performance claim |
| Sole office and server authority | All 914 server tests passed with isolated Redis, including sole-office ownership, authenticated invitations, unauthorized entry and revocation | Hosted identity/provider and production acceptance not exercised |
| Reviewable delivery | Ledger, screenshots, reproducible browser harness and task entry prepared | Full/core completion, final browser run, signed commit, PR and required hosted checks outstanding |

The final matched browser run is queued with control, visibility and lifecycle assertions enabled for Chromium desktop, WebKit desktop, and WebKit touch. Its source digest will identify the exact runtime files measured. The separate core command is also queued to satisfy the repository's explicit core gate. No merge or deployment is authorized by this goal.


### Loading and resource observations

| Run (WebKit 27.2) | Town ready | Studio ready | Resource transfer / decoded bytes |
| --- | ---: | ---: | ---: |
| Desktop baseline | 13,162 ms | 14,509 ms | 18,791,617 / 18,716,606 |
| Phone baseline | 8,364 ms | 2,653 ms | 18,791,617 / 18,716,606 |
| Desktop after stage/fitting changes | 5,779 ms | 1,604 ms | 18,796,955 / 18,721,944 |
| Phone after control/focus changes | 7,729 ms | 3,244 ms | 18,794,191 / 18,719,180 |

Each report recorded 250 resource entries. These are whole-page Resource Timing sums through the observation, not isolated avatar bytes. Different cache and host conditions prevent attributing the loading differences to this patch. WebKit exposes no `performance.memory` value here, so JS heap is unavailable; context-release counts are the available lifecycle evidence, not a memory-size estimate. Final source-digested runs remain pending.
