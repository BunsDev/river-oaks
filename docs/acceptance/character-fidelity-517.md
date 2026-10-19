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
file. The scanner exception requires both the exact receipt path and one of
those five exact public digests. All 17 guard tests pass, including other-path
and other-value rejection, and the complete worktree scan passes. The scanner's
default generic-key detection remains enabled.

The [core profile](../../data/reports/character-fidelity-core-517.json) passes all
11 tasks. Console counts: 125 tooling, 3,653 preview passes with one skip,
923 server, 76 desktop, and 145 Python tests. The preview skip is the existing
Vince glazing negative test whose approach is already obstructed; it proves
nothing about that glass. Offline demo verification returns its expected
blocked-domain exit 2. The [full profile](../../data/reports/character-fidelity-full-517.json) passes all
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

## Descriptive desktop measurements

The final tier run used an Apple M3 Max, 16 CPU cores, Darwin 25.6 arm64,
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

The last column loads one avatar over local HTTP. Morgan has 84,550 triangles
and Imani 88,544 at every tier; realism adds one draw (9→10). Estimated texture
storage rises from 62.7→64.3 MiB and 57.3→59.0 MiB respectively, not total GPU
memory. Production tiers keep the same pinned body, wardrobe, iris and hair
coverage; they do not provide geometric crowd LOD.

## Limits and next acceptance

Hair silhouettes remain coarse, cloth texture detail is limited, and fine eye
detail remains limited. Skin wrap approximates diffuse scattering. Hair
uses alpha cards, and tiers retain the same geometry. There is no geometric LOD,
independent clothing fitting, body editing, face-bone rig, or cloth simulation.

Local Chromium fixture identities do not prove live auth, Safari/iOS,
physical-device, native Unreal, or human accessibility acceptance. Contended-host
timing is descriptive. No supported mobile target or device budget has been established; no budget
is inferred from this machine. Val waived #441 P4/P5 novice trials; those remain
waived, not passed. Preserve prior human results.
