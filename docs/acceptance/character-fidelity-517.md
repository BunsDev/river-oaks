# Character fidelity #517 evidence

This candidate adds two human bundles in the existing Three.js runtime. It does
not establish AAA quality or an approved device budget. Review the actual
captures alongside the executable [capability contract](../../preview/src/character-fidelity-contract.js)
and [integration guide](../character-fidelity.md).

<!-- character-fidelity-current-review:start -->
Signed source `d11a6ee4ce794bc3f5f061bd48d5af8ce9a7cff9` matches all 1,330 tested
runtime/test Git blobs. Candidate M passed 21 office checks, ten suite checks,
ten readiness regressions, core's eleven tasks and full's 18 tasks. Full includes
16 world journeys, 24 shared journeys across five fixture modes with full
rendering, and 18 IPIC checks.

Execution receipts retain their actual precommit dirty-tree metadata. Check
[PR545](https://github.com/BunsDev/river-oaks/pull/545/checks) and the primary live
task register for the exact final-head hosted verdict. Historical failures and
performance limits below remain explicit.
<!-- character-fidelity-current-review:end -->

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

L adds an authoritative lift-readiness precondition after a controlled pose-publication
delay reproduced an early F, `level_portal_out_of_reach`, and the original arrival
timeout. This demonstrates a fixture ordering gap; J’s historical cause remains
unclassified. Nine regressions pass and independent review found no required issue.
Fresh L focused verification passed ten checks and core passed eleven tasks. Full verification failed at the office visitor’s hall arrival; 15 of 16 world journeys passed, including all ten suite checks. Shared/IPIC checks were not run. The J gate results below remain
historical evidence; they do not prove L’s full acceptance.

Current candidate L has runtime `74850126` and 142 changed source/test/config
inputs, integrating main `7c10f418` over signed checkpoint `54b5cd62`. Its 1,330
combined runtime/test Git blobs match the staged index. It is not yet a signed,
pushed or hosted-green final candidate.

Integration exposed a rail visibility defect: author `display: grid` overrode
hidden office cards. The scoped `[hidden]` rule passed the browser regression,
retaining the original rail assertions. See the
[rail receipt](../../data/reports/character-fidelity-review-rail-regression-517.json).

The [suite receipt](../../data/reports/character-fidelity-review-suite-regression-517.json)
retains two failed full runs. Fifteen world journeys passed in each, then the
stranger's hall arrival failed at initial spawn; shared/IPIC checks did not run.
H's attempted fresh-publication precondition and focused ten-check pass did not
repair the full workload. H core passed all eleven tasks, but that is historical
proof for its inputs, not J.

Diagnostics positively recorded missed-pong termination and delayed browser
close/reconnection during heavy scene loading. The original collector could lose
split lines, so an absent travel record does not prove it never reached the server.
The corrected longer diagnostic found a 27.689-second pong delay and a snapshot
already 12.335 seconds old after the freshness check. That run's suite passed after
an observational read-only probe; it did not reproduce H's exact failure, and two
early private helper-resolution errors keep the run outside gate evidence.

J adds a fixture-only startup barrier: a correlated read-only inventory response
on the current socket, normal recovery within one unchanged 120-second deadline,
and explicit failure on unexpected server errors. It records transport losses and
duration. No travel is replayed and no production heartbeat, permission or
backpressure policy changes. Seven loopback regressions and the actual focused
suite's ten business checks passed, including privacy, door exclusion and lease
revocation. Fresh J core passed all eleven tasks: 131 tooling, 3,737 preview
passes plus one existing Vince negative-control skip, 984 server/Redis tests
with no skips, 76 desktop and 149 Python tests (66 warnings). Build, Ruff
(472 files), offline fixtures (expected exit 2) and secret guard passed. J full
verification failed at resident lift travel after 15 world journeys passed.
Startup acknowledgements passed, but the Floor 2 arrival timed out. Shared
and IPIC checks were not reached. Raw failures are retained; current full
acceptance, signed source binding and exact-head hosted checks remain required. This does not establish
stable heavy initial rendering or repair of a demonstrated production policy bug.

Chromium's earlier G workload passed 9 fidelity, 43 Studio and 25 rail checks;
desktop WebKit passed 9, and the strict native 4K golden passed. Complete runtime
comparison shows J changes only the suite and its new helper from G. Those are
outside the explicitly selected browser/golden workloads, whose actual receipts,
execution manifests and timestamps are retained through applicability proofs.
Final signed input binding and exact-head hosted verification remain pending.

The [native applicability proof](../../data/reports/character-fidelity-review-native-applicability-517.json)
retains the actual `eb50` native measurements below. It enumerates all 15 changed
broad inputs, verifies the unchanged 113 client/asset/helper inputs and four native
harnesses, and rebuilds the 142-module memory fixture with its actual prior source:
generated execution bytes are identical. The new pure epoch export is unused;
Redis migration, rail CSS and journey/catalog changes are outside this isolated
workload. World/HUD and browser acceptance renew separately. Native receipt
manifests and measurement times are unchanged.

The current [M1](../../data/reports/character-fidelity-review-m1-517.json) and
[tier](../../data/reports/character-fidelity-review-tiers-517.json) reproductions
passed all 8 + 32 native byte comparisons and matching censuses. Repeated
[high-tier crowd cleanup](../../data/reports/character-fidelity-review-crowd-lifecycle-517.json)
has zero reported resource growth. Desktop timing reproduction remains unmet:
18/48 frame/GPU p50 comparisons agreed within the unchanged 20% band; sampled
one-minute host load was 7.69–9.78. Those samples do not establish a stable budget.

The [renewed physical receipt](../../data/reports/character-fidelity-review-iphone-517.json)
passed collection/completeness: all 48 cases, 80 viewport cycles, six native
two-camera portrait cycles and 12 native captures. Geometry/texture/program
lifecycle deltas are zero. All 12 PNGs reproduce the earlier tracked captures
byte-for-byte; fresh raw originals remain retained. Its actual tested broad
manifest is historical `c0`. The
[current phone applicability audit](../../data/reports/character-fidelity-review-phone-applicability-517.json)
rebuilt the complete 71-module graph and verified all 113 tested module, asset,
helper and dependency inputs unchanged after the newer integration. This applies
the same isolated workload; it is not renewed phone world/HUD acceptance.

Timing stability did **not** pass every comparison: 22/24 within-run p50 pairs
and 46/48 corresponding-repeat comparisons against the earlier phone run agree
within the unchanged 20% band. Morgan off at 8 figures changed from 19→23 ms p50;
Imani low at 24 changed from 46→68 ms. These observations do not isolate a cause.
The [comparison report](../../data/reports/character-fidelity-review-iphone-budgets-517.json)
preserves every original frame/CPU p95 ceiling unchanged: nine frame and eleven
CPU cases exceeded a reference. Observed maxima are separate; no threshold or
baseline receipt was changed to hide instability.

| Renewed high tier | Frame interval p50 / p95 ms at 8 | Frame interval p50 / p95 ms at 24 |
| --- | --- | --- |
| Morgan | 20 / 22 | 46–51 / 49–56 |
| Imani | 20 / 22–23 | 47–48 / 50–51 |

This is physical fixture collection and cleanup evidence, not a stable phone
budget, whole-town acceptance or thermal/soak proof. GPU timer queries remain
unavailable, and texture bytes estimate active scene storage rather than total
GPU residency. The rapid-request race is covered by the real-material regression,
not a claim that phone timing exercised that exact event sequence.

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


### M office admission precondition, verification pending

The controlled v3 baseline failed on the original guest arrival. With the ticket POST held, avatar readiness preceded admission; the original click returned a local reconnect refusal before the independent 20-second release. Admission recovered, but the original 30-second status wait failed with Alice still at spawn. The office regression receipt retains positive control timestamps and raw hashes. The exact historical L cause remains unproven.

The office fixture now tracks three pages before navigation and awaits the existing correlated read-only startup helper after all four avatar-ready waits, including owner reload. The avatar wait remains 120 seconds, followed by a separate 120-second startup budget. No arrival replay, authentication, arrival-deadline or business-assertion change was added; the existing door-entry retry loop is unchanged. The added before-first-socket test brings the focused suite to ten passes, zero skips, independently repeated.

Frozen M runtime `3e04a4ae0af73d8e452f02024685108ef2d3808cc5822461ec878400b2e0f608` binds 142 changed inputs and 1,330 staged Git blobs. Phone applicability verifies all 113 inputs; native applicability verifies the 142-module generated workload, and selected G render workloads remain unchanged. At this checkpoint, paired candidate76849, stock office/suite, core/full, signed delivery and hosted verification were pending; subsequent results follow below.
