# Character fidelity #517 evidence

This candidate adds two human bundles in the existing Three.js runtime. It does
not establish AAA quality or an approved device budget. Review the actual
captures alongside the executable [capability contract](../../preview/src/character-fidelity-contract.js)
and [integration guide](../character-fidelity.md).

## Accepted baseline

The [M1 receipt](../../data/reports/character-fidelity-m1-final-517.json) identifies
revision `225acfc9eaebf67627db7337feacac130b241ad8` plus its complete dirty-tree
source/asset manifest. The [eight original native 3840×2160 PNGs and hashes](character-fidelity-517-captures/m1-captures.json) are byte-identical
to the earlier corrected baseline, and all four scene censuses match.

Each original appearance returns to its warm resource counts after:

- 10 viewport create/render/dispose cycles;
- 10 native 4K portrait cycles, with two cameras per cycle;
- three repeated cold-load and crowd-scene cycles at 1, 8, and 24 avatars.

All geometry, texture, and program deltas are zero. Production transmission
remains enabled. The [controlled negative run](../../data/reports/character-fidelity-leak-negative-517.json) before the fix failed on Jevica's texture
count increasing from 14 to 24; the synthetic evidence regression also proves
that positive growth cannot pass. The final run matches the corrected earlier
baseline with input manifest `f1f07b69267e7d47e264e4f476a04c30f65ce5cce5f619cfc826d4dac1a4472b`.
Timing was omitted from this deterministic rerun and remains unmeasured there.

The original [run A](../../data/reports/character-fidelity-m1-a.json) and
[run B](../../data/reports/character-fidelity-m1-b.json) are historical evidence.
Their embedded `status:passed` is not accepted: they omitted untracked provenance
and failed to enforce Jevica's positive texture delta. Their timing agreed in
only 10 of 24 comparisons within the declared 20% band.

## Fixture and integration proof

The shipped [asset receipt](../../preview/public/assets/characters/realistic-humans.sources.json)
hashes transitive material/texture dependencies, expression targets, generator
modules, MPFB code/data, Blender binary, and outputs. The corrected receipt build
reproduced both previously pinned GLBs byte-for-byte. Exported-byte tests require
neutral initial morph weights, fitted high-poly eyes, brows/lashes, 53 joints,
and the declared expression targets.

The runtime regressions cover tier teardown, late texture responses, missing
roughness at the low floor, portrait fallback, and a quality downgrade during
initial map loading. The contract declares `speechRuntime:false`: exported
visemes are not integrated with the donor-based speech loader.

The [clearance findings](../../data/reports/character-fidelity-clearance-517.json)
link the fresh 13-look measurement. All current looks fit unchanged campus
bounds. Both new fixtures fit unchanged directional IPIC limits. Newly observed
forward-bound failures in existing looks remain open: Lyra 0.673930 m, Silvan
masculine 0.659066 m, and Silvan feminine 0.673350 m exceed the old 0.644 m
limit. These are not full-catalog IPIC acceptance. Unchanged legacy geometry and
morph bytes do not establish when the failures began.

All five existing cloth producers ran with `--write` then `--check`; generated
morph bytes remained unchanged and only their avatar-source hashes changed.
The earlier idle-slice failure and isolated rerun are retained in the ledger.
The final core and full broad suites pass the unchanged test.

The [final tier receipt](../../data/reports/character-fidelity-tiers-517.json)
records revision `225acfc9eaebf67627db7337feacac130b241ad8` plus dirty input
manifest `f1f07b69267e7d47e264e4f476a04c30f65ce5cce5f619cfc826d4dac1a4472b`.
Both fixtures pass off/low/standard/high captures, ten viewport and ten two-camera
portrait disposal cycles at each tier, and five governor transition cycles.
All resource deltas are zero. Switched high and standard renders match fresh
rigs with maximum channel difference zero. Missing-map recovery and late-response
fences have focused behavioral regressions; they are separate from timing.

The [Chromium journey](../../data/reports/character-fidelity-experience-final-517.json)
passes nine fidelity checks and all 43 existing Studio checks. The
[desktop WebKit journey](../../data/reports/character-fidelity-webkit-517.json)
passes the same nine fidelity checks. Its shared journey's scope string still
says Chromium; the recorded invocation used `RIVER_OAKS_EXPERIENCE_BROWSER=webkit`,
which selects Playwright WebKit in `experience-runner.js`. This proves that engine
on this desktop, not Safari or iOS. Memory and isolated Redis persistence tests
also passed using separate store clients. The [strict hero check](../../data/reports/character-fidelity-goldens-517.json)
passes one original native 4K reference with zero pixel differences.

The secret scan initially classified five MPFB source digests as generic keys
because their filenames contain “keys.” Each digest matches its cached source
file. The initial implementation used an exception for the exact receipt path
and those five exact public digests. Main's PR #546 supersedes that configuration
with its source-manifest SHA-256 policy. After reconciling main, all 21 guard
tests pass, including staged/worktree/history checks and other-path/other-value
rejection. The scanner's default generic-key detection remains enabled. The
original core/full receipts below remain evidence of their recorded patch;
post-reconciliation verification is tracked separately in the task ledger.

The initial [core profile](../../data/reports/character-fidelity-core-517.json) passed all
11 tasks. Console counts: 125 tooling, 3,653 preview passes with one skip,
923 server, 76 desktop, and 145 Python tests. The preview skip is the existing
Vince glazing negative test whose approach is already obstructed; it proves
nothing about that glass. Offline demo verification returns its expected
blocked-domain exit 2. The initial [full profile](../../data/reports/character-fidelity-full-517.json) passed all
18 tasks, including dependency audit, required Redis, history scanning, security
browser tests, reflections, [13 experience journeys](../../data/reports/character-fidelity-full-experience-517.json),
[24 shared journeys across all five modes](../../data/reports/character-fidelity-full-shared-517.json),
and [16 IPIC screening checks](../../data/reports/character-fidelity-ipic-screening-517.json).
The [verification input manifest](../../data/reports/character-fidelity-verification-inputs-517.json)
binds both profiles to 53 changed code/test/asset/config files and the complete
runtime manifest. The final input check passed with no changes during either
profile. The same documented preview skip and expected offline-domain block
apply to full.
See the [live task ledger](../superpowers/plans/2026-10-18-character-fidelity-517.md)
for exact commands and results. A skipped check is not a pass.

## Review the real renders

These are unchanged PNG bytes from the successful run, with fixed cameras,
lighting, pose, and animation. [Native capture hashes and cameras](character-fidelity-517-captures/native-captures.json)
and [Chromium capture hashes](character-fidelity-517-captures/chromium-captures.json)
link each selected artifact to its source report.

| Fixture | Close-up comparison | Expression | Full body and consumers |
| --- | --- | --- | --- |
| Morgan | [Off](character-fidelity-517-captures/morgan-human-closeUp.png), [low](character-fidelity-517-captures/morgan-human.low-closeUp.png), [high](character-fidelity-517-captures/morgan-human.high-closeUp.png) | [Smile](character-fidelity-517-captures/morgan-human.high-expression-smile.png), [brow raise](character-fidelity-517-captures/morgan-human.high-expression-browRaise.png) | [Full body](character-fidelity-517-captures/morgan-human.high-full.png), [Studio](character-fidelity-517-captures/character-fidelity-morgan-studio.png), [world peer](character-fidelity-517-captures/character-fidelity-morgan-world-peer.png) |
| Imani | [Off](character-fidelity-517-captures/imani-human-closeUp.png), [low](character-fidelity-517-captures/imani-human.low-closeUp.png), [high](character-fidelity-517-captures/imani-human.high-closeUp.png) | [Smile](character-fidelity-517-captures/imani-human.high-expression-smile.png), [brow raise](character-fidelity-517-captures/imani-human.high-expression-browRaise.png) | [Full body](character-fidelity-517-captures/imani-human.high-full.png), [Studio](character-fidelity-517-captures/character-fidelity-imani-studio.png), [world peer](character-fidelity-517-captures/character-fidelity-imani-world-peer.png) |

Inspection confirms the red imported iris is replaced with brown, skin gains
fine surface detail, and smile/brow targets move the face. Brows and lashes are
present, but the brows remain dense and the hair silhouette coarse. Imani's bob
obscures one eye and has strong silver highlights. Cloth maps remain soft at
close range. Peer views show the back of each loaded avatar; use close-ups for
face assessment. These observations do not establish AAA quality.

The [crowd receipt](../../data/reports/character-fidelity-crowds-517.json)
records four real 1920×1080 screenshots under the same runtime manifest:
[Morgan ×8](character-fidelity-517-captures/morgan-human-crowd-8.png),
[Morgan ×24](character-fidelity-517-captures/morgan-human-crowd-24.png),
[Imani ×8](character-fidelity-517-captures/imani-human-crowd-8.png), and
[Imani ×24](character-fidelity-517-captures/imani-human-crowd-24.png).
Inspection confirms the figures and their shadows render in the existing grid.
The independently hashed [capture script](character-fidelity-517-captures/capture-crowds.mjs)
uses the existing high-tier fixture with reduced motion. Its two readiness
frames supply no timing claims. The camera, lighting and placement come from
`crowdStage(count > 1)` in the hashed fixture. These scenes establish isolated
crowd rendering; town occlusion belongs to the existing #442 workflow.

## Initial descriptive desktop measurements

The initial tier run at runtime manifest `f1f07b69...` used an Apple M3 Max, 16 CPU cores, Darwin 25.6 arm64,
Chromium 156.0.8078.4 and ANGLE Metal, at 1920×1080/DPR1. Each of two repeats
sampled 120 frames and 30 GPU queries at crowds of 1, 8, and 24 for every tier.
Frame limiting and vsync were disabled in this isolated character scene; these
are unthrottled scene measurements, not the town's frame rate or a device budget.
One-minute load ranged from 14.21 to 17.31. Only 39/48 paired frame/GPU p50
comparisons agree within the unchanged 20% band. All p50/p95 samples remain in
the raw receipt; no timing threshold was loosened.

| High tier, 24 avatars | Frame interval p50 / p95 ms | GPU p50 / p95 ms | Local cold load / first frame ms |
| --- | --- | --- | --- |
| Morgan | 4.2–4.4 / 4.9–5.3 | 2.710–3.059 / 6.968–7.319 | 129–130 / 216–217 |
| Imani | 4.2–4.3 / 4.9–5.2 | 2.780–3.497 / 6.261–8.600 | 123–124 / 205 |

The last column reports one avatar’s local HTTP load duration, then first-render
and GPU-completion duration after loading. It is not total navigation-to-visible
time. Morgan has 84,550 triangles
and Imani 88,544 at every tier; realism adds one draw (9→10). Estimated texture
storage rises from 62.7→64.3 MiB and 57.3→59.0 MiB respectively, not total GPU
memory. Production tiers keep the same pinned body, wardrobe, iris and hair
coverage; they do not provide geometric crowd LOD.

## Reconciled source and physical iPhone

This section records the earlier signed candidate `67c44177` at runtime
`426886a8...`. The reviewed candidate and renewed phone evidence are below.

The candidate was reconciled with main `2b4e4926`. The [renewed core](../../data/reports/character-fidelity-main-core-517.json),
[M1 reproduction](../../data/reports/character-fidelity-main-m1-517.json),
[tier reproduction](../../data/reports/character-fidelity-main-tiers-517.json),
[Chromium](../../data/reports/character-fidelity-main-chromium-517.json),
[desktop WebKit](../../data/reports/character-fidelity-main-webkit-517.json), and
[strict portrait check](../../data/reports/character-fidelity-main-goldens-517.json)
passed at runtime manifest `426886a8e79e3acf652a29e4985ad07ec287479e500cf6c01c41f77155c81895`.
All eight original and all 32 new tier/expression PNGs match the prior run
byte-for-byte. The WebKit invocation caveat above also applies to its renewed raw
receipt. The [renewed full gate](../../data/reports/character-fidelity-main-full-517.json)
passed all 18 tasks, including 13 experience journeys, 24 shared journeys across
five modes, and 18 IPIC screening checks. The preview suite has one existing
negative-approach skip; that skip supplies no glazing proof. The expected offline
domain-policy exit 2 is retained. The [78-input manifest](../../data/reports/character-fidelity-main-verification-inputs-517.json)
records the exact combined source.

The [focused crowd lifecycle](../../data/reports/character-fidelity-main-crowd-lifecycle-517.json)
also passed: both high-tier fixtures repeated cold loading and crowds of 1, 8
and 24 three times with zero geometry, texture or program growth. Ten viewport
and ten native two-camera portrait cycles per fixture also reported zero growth;
four native captures remained byte-identical to the tier run.

The [resource reference budgets](../../data/reports/character-fidelity-resource-budgets-517.json)
set exact per-version scene-census ceilings from both matching runs. Morgan is
84,550 triangles and Imani 88,544 at every tier. Production tiers use ten scene
census draws; high-tier estimated texture storage is 67,458,385 and 61,865,980
bytes respectively. Existing `--against` checks enforce an unchanged census.
These are structural regression budgets for the pinned bundles, not a frame-time
promise, whole-town budget or total GPU-residency measurement. Material tiers
provide no geometric crowd LOD.

The physical iPhone 16 Pro Max (`iPhone17,2`, iOS 27.0.1) Mobile Safari run
[passed](../../data/reports/character-fidelity-iphone-517.json) with unchanged
runtime and helper inputs. Both human fixtures ran all four tiers at populations
of 1, 8 and 24, with two alternated repeats and 120 intervals after 30 warmup
frames per case. All 48 cases completed; all 24 paired p50 comparisons agree
within the unchanged 20% band. Ten viewport cycles for each of eight fixture/tier
combinations and three native portrait cycles per fixture reported zero growth
in geometry, texture and program counts. Twelve native 3840×2160 PNGs completed.
The earlier [Locked launch](../../data/reports/character-fidelity-iphone-blocked-517.json)
remains a separate failed attempt with zero measurements.

| High tier, physical iPhone | Frame interval p50 / p95 ms at 8 | Frame interval p50 / p95 ms at 24 |
| --- | --- | --- |
| Morgan | 20 / 22 | 46–48 / 50–52 |
| Imani | 20 / 22–23 | 47 / 50–51 |

At population 1, both high-tier fixtures measured 17/17 ms p50/p95 with vsync
unchanged. The [device reference budgets](../../data/reports/character-fidelity-iphone-budgets-517.json)
retain every population/tier pair and set each p95 reference ceiling to the
rounded-up maximum of its two measured p95 values, with no added headroom.
These are initial same-fixture regression references, not a separately verified
production SLA. Morgan's first page load took 2,024 ms, followed by 5,277 ms for
the first render/GPU completion; Imani took 1,905 + 1,377 ms. Those are one local
Wi-Fi load per appearance, with material caches potentially shared after Morgan.
They are not Internet loading distributions. GPU timer queries were unavailable;
texture storage remains a scene estimate, not total GPU residency. This short
isolated run establishes neither whole-town performance nor thermal/soak stability.

Review the physical captures: Morgan [off](character-fidelity-517-captures/iphone-morgan-human.off-closeUp.png),
[high](character-fidelity-517-captures/iphone-morgan-human.high-closeUp.png),
[full](character-fidelity-517-captures/iphone-morgan-human.high-full.png),
[smile](character-fidelity-517-captures/iphone-morgan-human.high-expression-smile.png),
[brow](character-fidelity-517-captures/iphone-morgan-human.high-expression-browRaise.png);
Imani [off](character-fidelity-517-captures/iphone-imani-human.off-closeUp.png),
[high](character-fidelity-517-captures/iphone-imani-human.high-closeUp.png),
[full](character-fidelity-517-captures/iphone-imani-human.high-full.png),
[smile](character-fidelity-517-captures/iphone-imani-human.high-expression-smile.png),
[brow](character-fidelity-517-captures/iphone-imani-human.high-expression-browRaise.png).
Actual phone images retain natural irises, skin detail and the authored identities;
coarse hair, dense brows and soft clothing detail remain visible. These are native
canvas readbacks from the real phone, not screenshots of the phone's browser chrome.

The [bounded phone helper](character-fidelity-517-captures/capture-phone.mjs)
uses the existing fixture on one private IPv4 interface. Its smoke checks reject
private-file/key requests, stale runs and premature success; physical completion
requires all 48 timing cases, lifecycle checks and 12 native PNGs. The helper
closes its fixture after completion or its eight-minute collection deadline.

```sh
node --test docs/acceptance/character-fidelity-517-captures/phone-evidence.test.mjs
node docs/acceptance/character-fidelity-517-captures/capture-phone.mjs --smoke
# Supply the paired CoreDevice identifier locally; keep the phone unlocked.
node docs/acceptance/character-fidelity-517-captures/capture-phone.mjs --device <paired-device-id>
```

The seven gate regressions, real HTTP boundary smoke, and subsequent physical run
passed separately. Raw launch/device records stay under ignored
`.runtime/character-fidelity/physical/`. Published captures and receipts omit paired
identifiers and private launch URLs; the raw report hash is retained for audit.

## Reviewed candidate and renewed physical evidence

Independent review reproduced one quality-controller race: an older pending low
request could overwrite a newer request reaffirming the already applied high
tier. The controller now advances its generation before the cached-tier return.
Four behavioral regressions (return to high, standard, low and off) failed on the
old source and pass with the fix. The reviewer independently confirmed the
same-turn high→low→high sequence retains high and its normal map. The
[review receipt](../../data/reports/character-fidelity-review-517.json) records the
finding, red/green evidence and proof boundaries.

The candidate integrates main `b76ab77c` over remote `132e11b9`; frozen runtime:
`0a587e5f6194330ef82670f95ae5c30301813c80b63d797eef2a6777c6ffb19b`.
The exact 97 changed code/test/config inputs are frozen separately from reports
and ledgers. Independent review found no required defect in the Play rail or
GTAO integration; the latter documents small exact-depth AO seam differences.
The [renewed core](../../data/reports/character-fidelity-review-core-517.json)
passed on the current 0a source: 131 tooling, 3,709 preview passes plus one existing documented skip,
969 server/Redis tests with no skips, 76 desktop and 149 Python tests. Build,
Ruff, offline fixtures and secret guard passed. The expected offline domain-policy
exit 2 and Python warnings are retained. The [full profile](../../data/reports/character-fidelity-review-full-517.json)
passed all 18 tasks on the same source: 13 world journeys, 24 shared journeys
across five full-renderer modes, and 18 IPIC checks. Final signed delivery and
hosted checks remain separate. The render receipts below retain their actual 6e
manifest. The [render applicability audit](../../data/reports/character-fidelity-review-render-applicability-517.json)
compares every prior runtime input and confirms the only nine changed/added
code inputs are offline screening CLI/test/config files. Preview, server, shared,
assets, dependency pins and render/browser helpers are unchanged. Core/full renew
for tooling and Python coverage; render and phone receipts are not restamped.

[M1 reproduction](../../data/reports/character-fidelity-review-m1-517.json)
passed all eight native byte comparisons and four censuses with zero lifecycle
growth. The [new tier reproduction](../../data/reports/character-fidelity-review-tiers-517.json)
passed all 32 native byte comparisons, eight censuses, quality transitions and
cleanup. [Chromium](../../data/reports/character-fidelity-review-chromium-517.json)
fidelity 9 + Studio 43, [desktop WebKit](../../data/reports/character-fidelity-review-webkit-517.json)
fidelity 9, and [strict native 4K golden](../../data/reports/character-fidelity-review-goldens-517.json)
1 with zero pixel differences also passed. The WebKit raw scope-string caveat
noted above still applies; its invocation selected desktop WebKit explicitly. The [high-tier crowd check](../../data/reports/character-fidelity-review-crowd-lifecycle-517.json)
passed three repeated cold-load/1/8/24 scenes per fixture with zero growth and
four further matching native images. Desktop timing reproduction did not pass:
only 14/48 frame/GPU p50 comparisons matched the earlier run within the unchanged
20% band, with timing-sample one-minute host load around 22–31. These timings remain descriptive;
no stable desktop performance budget is inferred.

The [renewed physical receipt](../../data/reports/character-fidelity-review-iphone-517.json)
passed collection/completeness: all 48 cases, 80 viewport cycles, six native
two-camera portrait cycles and 12 native captures. All geometry/texture/program
lifecycle deltas are zero. All 12 new PNGs reproduce the earlier tracked phone
captures byte-for-byte; fresh raw captures are preserved, and the new receipt
references the identical public files. The [71-module input comparison](../../data/reports/character-fidelity-review-phone-inputs-517.json)
shows only the quality-controller module changed for that physical run; all 38
tracked character assets, the fixture, helper and dependency pins were unchanged.
The [current applicability audit](../../data/reports/character-fidelity-review-phone-applicability-517.json)
rebuilds the complete graph and verifies all 113 tested inputs still match after
current-main integration. Its broader runtime hash differs from the historical
c0 physical run. Neither world render-pipeline nor occlusion-sort is reachable
from this fixture, so this is unchanged isolated-workload evidence, not renewed
phone world/HUD acceptance.

Timing stability did **not** pass every comparison: 22/24 within-run p50 pairs
and 46/48 corresponding-repeat comparisons against the earlier phone run agree
within the unchanged 20% band. Morgan off at 8 figures changed from 19→23 ms p50;
Imani low at 24 changed from 46→68 ms. These observations do not isolate a cause.
The [comparison report](../../data/reports/character-fidelity-review-iphone-budgets-517.json)
preserves every original frame/CPU p95 ceiling unchanged: nine frame and eleven
CPU cases exceeded an initial reference. New observed maxima are separate;
no threshold or baseline receipt was changed to hide instability.

| Renewed high tier | Frame interval p50 / p95 ms at 8 | Frame interval p50 / p95 ms at 24 |
| --- | --- | --- |
| Morgan | 20 / 22 | 46–51 / 49–56 |
| Imani | 20 / 22–23 | 47–48 / 50–51 |

This is an isolated physical-fixture collection and cleanup pass, not a stable
phone performance budget, whole-town acceptance or thermal/soak proof. GPU timer
queries remain unavailable, and texture bytes remain estimates of active scene
storage rather than total GPU residency. The rapid-request race is covered by
the focused real-material regression, not by a claim that phone timing exercised
that exact event sequence.

## Limits and next acceptance

Hair silhouettes remain coarse, cloth texture detail is limited, and fine eye
detail remains limited. Skin wrap approximates diffuse scattering. Hair
uses alpha cards, and tiers retain the same geometry. There is no geometric LOD,
independent clothing fitting, body editing, face-bone rig, or cloth simulation.

Local Chromium fixtures and the separate physical Safari fixture do not prove
live auth, native Unreal, whole-town iPhone performance or human accessibility
acceptance. Contended desktop timing is descriptive. The phone's measured
reference budgets apply only to its documented isolated workload. Val waived #441 P4/P5 novice trials; those remain
waived, not passed. Preserve prior human results.
