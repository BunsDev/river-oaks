# Character fidelity (#517): realistic humans in the live renderer

Task `character-fidelity-517-20261018`, branch `feat/character-fidelity-517-20261018`,
worktree `../river-oaks-character-fidelity-517`, owner `codex:character-fidelity-517-20261018`.
Val explicitly transferred the existing dirty checkout from
`claude:river-oaks (015e1f43)` to this session. Initially claimed
2026-10-18T19:33Z on main `f897c1d6`.

## Current candidate

HEAD `225acfc9eaebf67627db7337feacac130b241ad8` plus the recorded dirty patch;
runtime/asset manifest `f1f07b69267e7d47e264e4f476a04c30f65ce5cce5f619cfc826d4dac1a4472b`.
M1 reproduction, all eight fixture/tier cases, native expression captures,
rendered tier transitions, lifecycle checks, strict hero golden, Chromium and
desktop WebKit journeys pass. Selected focused tests:54; clearance:16;
full-catalog culling pose sweep:13; build-input Python:2, all without skips.
The test-only culling height correction follows the fixed bundle contract;
production culling bounds and thresholds remain unchanged.

Required core and full pass all 11/18 tasks. The final check confirms all 53
changed code/test/asset/config inputs and the complete runtime manifest stayed
unchanged. Full includes 13 experience journeys, 24 shared journeys across all
five modes, and 16 IPIC screening checks. One existing preview negative test is
skipped; offline demo verification returns its expected blocked-domain exit 2.

All 28 review PNGs and the independent crowd script match their recorded hashes.
See [the reviewable evidence](../../acceptance/character-fidelity-517.md).
Signed implementation `00a74a7c8f38c424d6baa4d2f85be4e2149e76b5` is pushed.
[Draft PR #545](https://github.com/BunsDev/river-oaks/pull/545) is open, with
handoffs posted to #517/#441/#442/#444. Final metadata receipt commit is next.
Supported mobile/device budgets, native, live-auth and human acceptance remain
gaps. Val's #441 P4/P5 waiver remains a waiver. No AAA or full-goal completion
claim. The worktree stays active.

## Objective

Put a believable, expressive, legally clean realistic human in the existing
Three.js 0.186.1 / Vite renderer. Add compatible human body and wardrobe
variants, quality tiers measured on named targets, and an executable contract
that #441 (Studio realistic controls) and #442 (asset compatibility) can build
on. Human-only per the 2026-10-18 override in #517. No engine rewrite, no paid
generation, no restricted asset.

## Acceptance (from #517, human-only reading)

| # | Criterion | Status |
| --- | --- | --- |
| A1 | Current-code architecture and vendor decision matrix with verified licences, costs and alternatives | documented in PR536 vendor matrix and local fixture decision; architecture snapshot below |
| A2 | Real runtime close-up and crowd captures with reproducible camera, light and animation settings and device-tier metrics | desktop Chromium close-up/crowd captures and metrics recorded; physical target budgets unproven |
| A3 | Human body and wardrobe fixtures with explicit supported/unsupported rig, material and wardrobe capabilities; identity stable across tiers | two fixed CC0 body/wardrobe bundles, explicit capability contract, tier identity/lifecycle verified |
| A4 | Integration contract and evidence handed to #441/#442/#444; no engine rewrite | executable contract and local consumer proof ready; PR and issue handoff pending final gates |

## Baseline facts (main `f897c1d6`, inspected 2026-10-18)

Pipeline. Every playable human is an MPFB 2.0.17 export from CC0 MakeHuman
assets (`scripts/build_characters.py`, run inside Blender). Receipts:
`preview/public/assets/characters/sources.json`, `jevica.sources.json`. Pins:
`preview/src/character-assets.js` (jevica, man-casual, man-tailored). The
playable catalog (`shared-appearances.js`) maps 11 appearances onto those three
rigs. Sable, Vesper, Lyra and feminine Silvan use the jevica rig. Aurel, Kai
and masculine Silvan use man-casual. Rowan uses man-tailored.
`romance-look.js` recolours imported materials per character.

Sources and licence. The primary checkout caches the sources in ignored
`data/raw/characters` (1.2 GB): MPFB source, CC0 system assets, faceunits01,
visemes02, facial candidates and Jevica references. MPFB's LICENSE.md section D
says output (exports, generated graphical data, renderings) carries no
restriction. MPFB code is GPLv3, so do not vendor it into the repository.

What the shipped rigs contain (parsed from the GLB JSON):

| Rig | Bytes | Body tris | Skin textures | Eyes | Hair | Joints | Morphs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| jevica | 5.78 MB | 88,912 (subdivision 1) | 2048² base colour only; no normal or roughness map; KHR specular 0.52, roughness 0.62 | high-poly, one BLEND 512² texture, roughness 0.18 | long01 BLEND 1024² | 53 (game-engine rig, no face bones) | 2 (blinks); the speech variant adds 15 visemes |
| man-casual | 2.02 MB | MPFB base | 2048² base colour only | low-poly, OPAQUE 512² | short01 BLEND 1024² | 53 | 2 |

The MakeHuman CC0 skins ship only a 2048² diffuse. Their `.mhmat` asks for SSS
(R 5, G 2.5, B 1) and bump. MPFB ships CC0 region masks (`mpfb_face`, `lips`,
`eyelids`, `ears`, `fingernails` and others) and procedural node trees
(`enhanced_skin`, `procedural_eyes`). `instantiateAvatar` converts every BLEND
material to an alpha test of 0.4, double-sided, and sets `envMapIntensity 0.8`.
The character path uses no KTX2, meshopt or Draco loader.

Measurement and capture already on main: `character-hero.js` (preset
`garden-front-v1`), `character-portrait.js` (native 4K, MSAA 4, ACES),
`scripts/character-hero-goldens.mjs` with
`preview/audit/character-image-comparison.js` (environment pinning), and
`render-quality.js` (quality modes, render-scale governor). Crowd timing
belongs to #529/#534 (`preview/audit/rendered-multiplayer.js`, `metrics.js`,
`draw-census.js`). Use them; do not edit them.

Unreal: `docs/unreal.md` records a GIS blockout on UE 5.8.2 with no character
fidelity work. It is not an integration path for the browser client.

## Decisions and assumptions pending Val

Asked once on 2026-10-18. Work continues on these defaults until Val answers:

1. Target iPhone model(s) and iOS version. Default: none named, so no
   physical-phone claim; macOS M3 Max (Chrome via Metal ANGLE; Safari) is
   measured.
2. Spend ceiling. Default: $0, CC0 or permissive licences only.
3. Jevica. Default: her shipped canonical look stays byte-identical. The first
   realistic fixture is built as a new pinned rig and does not replace
   `jevica.glb`.

## Milestones

| | Exit | State |
| --- | --- | --- |
| M0 | Claim, worktree, ledger, baseline facts | done 2026-10-18T19:50Z |
| M1 | Reproducible capture and measurement harness; two runs agree | captures/lifecycle verified; controlled timing open |
| M2 | One realistic CC0 fixture in the live renderer, matched against M1 | two fixtures built; visual acceptance in progress |
| M3 | Bounded alternatives matrix from M2's measured gaps | PR536 input; route reconciliation pending |
| M4 | Variants, expressions and capability table | two fixed bundles and expressions verified |
| M5 | Measured tiers through `render-quality.js`; identity across tiers | lifecycle passed; identity-preserving low tier pending |
| M6 | Contract, shared validator and handoff to #441/#442/#444 | executable contract and Redis checks pass; handoff pending |
| M7 | Adversarial cases and device numbers | |

## Files owned

This ledger. New: `preview/src/character-fidelity-metrics.js`,
`preview/e2e/fixtures/character-fidelity.{html,js}`,
`scripts/character-fidelity-baseline.mjs`,
`preview/tests/character-fidelity-metrics.test.js`. Later:
`scripts/build_characters.py` (realistic build options only), new pins in
`preview/src/character-assets.js`, and a new fixture with its receipt under
`preview/public/assets/characters/`.

## Log

- 2026-10-18T19:33Z: claimed in the live register. No prior #517 claim existed
  in the register, worktrees, open PRs or Codex rollouts (Codex thread
  `01a15001` proposed the goal at 19:12Z and has been idle since). Worktree
  created at `f897c1d6`. `pnpm install --frozen-lockfile` used a private store.
  `agent:doctor` passed apart from the Python environment, which
  `uv sync --locked` fixed in the worktree's own `.venv`.

## M1 results: baseline harness (2026-10-18)

Harness: `scripts/character-fidelity-baseline.mjs` driving
`preview/e2e/fixtures/character-fidelity.{html,js}`, with census helpers in
`preview/src/character-fidelity-metrics.js`. Headless Chromium 156.0.8078.4
(Playwright 1248), ANGLE Metal on an Apple M3 Max, 1920×1080 at DPR 1, vsync
off. Captures are native 3840×2160 MSAA 4 through `character-portrait.js`, in
the `garden-front-v1` (full) and new `face-closeup-v1` (head bone framed)
presets. Revision `f897c1d6`, clean tree. Receipts:
`data/reports/character-fidelity-m1-a.json` and `-b.json` (PNGs stay in the
worktree's `.runtime/character-fidelity/m1-baseline-{a,b}/`).

Run A (load average 48 on 16 cores):

| Look (rig) | Triangles | Draws | Textures | Cold load | GPU p50 ×1 / ×8 / ×24 | CPU p95 ×1 / ×8 / ×24 | Residue after 10 cycles |
| --- | --- | --- | --- | --- | --- | --- | --- |
| jevica (jevica) | 126,856 | 13 | 52.1 MiB | 584.5 ms | 3.038 / 4.567 / 7.285 ms | 4.5 / 27.05 / 82.7 ms | 10 textures |
| sable-human (jevica) | 115,916 | 20 | 25.6 MiB | 317 ms | 0.968 / 2.353 / 3.926 ms | 3.8 / 6 / 8 ms | 0 textures |
| man-tailored (man-casual) | 38,346 | 24 | 28.0 MiB | 162 ms | 1.321 / 1.6 / 2.405 ms | 3.05 / 3.75 / 9.95 ms | 0 textures |
| rowan-human (man-tailored) | 42,202 | 19 | 28.0 MiB | 118 ms | 0.869 / 1.446 / 2.459 ms | 3.65 / 4.4 / 7.85 ms | 0 textures |

First frame after load (shader compile included): jevica 316.5 ms, Sable 170 ms,
Aurel 169.5 ms, Rowan 129 ms. Census counts the figure only: the main pass,
with no shadow pass. Texture bytes are estimated GPU bytes (RGBA, mip chain),
not download size.

Reproduction (run B `--against` run A): census identical for all four looks;
all eight native 4K captures byte-identical. **Timing did not reproduce.** Load
rose to 68–99 during run B, and GPU p50 moved by up to 7.7× (Jevica ×1:
3.0 → 23.5 ms) while rAF intervals for the CPU-bound crowds stayed within 3%.
GPU timer queries on this shared machine pick up other sessions' GPU work. The
timing columns above are provisional; budgets in M5 must come from a run at
low load (load average below 16) or from interleaved A/B runs in one session,
never from these absolute numbers.

## M3 inputs: licence research (2026-10-18, read-only, primary sources)

Collected early by a read-only research agent; the decision waits for M2's
measured gaps. The deciding question is whether a GLB that every player's
browser downloads (and can extract) is allowed.

| Source | Licence | Downloadable GLB in a web game | Cost / account | Format and face rig | Confidence |
| --- | --- | --- | --- | --- | --- |
| MakeHuman / MPFB 2 (current pipeline) | Assets CC0; MPFB code GPLv3 (not vendored); LICENSE.md §D: no claim over exports | Yes (CC0 packs). Some packs are CC-BY (Hair 02/03, Dress/Shirts/Pants 02/03) and need attribution | Free, no account | Blender export; Faceunits 01 (CC0, 54 ARKit-style keys), Visemes 01/02 (CC0) | High |
| Microsoft Rocketbox | MIT (relicensed 12/2020; repo archived 2022) | Yes, with the MIT notice | Free, no account | FBX only (convert); LODs 10k/5k/2.5k/500 tris, 2K maps, 28 facial bones, ARKit-compatible blendshapes (2022) | High |
| Lee Perry-Smith head (three.js examples) | CC BY 3.0 | Yes, with attribution | Free | Head only: no rig, body or hair. A skin-shader test object, not a player | High |
| Epic MetaHuman | Unreal Engine EULA (UE 5.6+); FAQ allows use in other engines | **Unresolved**: EULA §4 requires Licensed Technology "only as an inseparable part of the Product"; an extractable GLB is not ruled on | Free under $1M revenue; Epic account and UE 5.6+ required | No glTF/FBX export; 669 blendshapes + 713 joints driven by RigLogic; iOS texture cap 2048 | FAQ High; EULA text Medium (third-party copy, official page 403) |
| Reallusion CC4/5, ActorCore, Headshot | Content EULA §6.3 and Software EULA §5 | **No**: models "must be contained in proprietary formats"; bans use in "any character generation system" | Paid | FBX/OBJ/USD; 52 ARKit + 11 tongue | High |
| Human Generator (HumGen3D) | Asset licence | No ("cannot be extracted and re-used") | Paid ($68/$128) | Blender add-on | High |
| MB-Lab | AGPL-3 for generated models | Only if every shipped model is AGPL-3 | Free | Blender add-on | High |
| Mixamo | Adobe terms + FAQ | Probably not (raw-file ban, community FAQ only) | Free, Adobe ID | Not verified | Medium/Low |
| Ready Player Me | n/a | Service offline since 2026-01-31 (press reports; domain did not resolve) | n/a | n/a | Medium |

Early reading: only CC0/MIT/CC-BY sources clearly permit the shipped form.
That keeps MPFB as the base and makes Rocketbox the only realistic,
permissively licensed comparison set with facial blendshapes. MetaHuman needs a
written answer from Epic before any use; Reallusion and Human Generator are
excluded by their own terms (and the character-generation ban conflicts with
Character Studio). Unverified: Reallusion and Unreal seat prices, a
Headshot-specific licence, Mixamo formats.

## Defects found by the harness

- **Jevica portrait leak (real, lifecycle).** Each `createCharacterHero`
  cycle for `jevica` leaves one GPU texture (10 cycles leave 10; the other
  looks leave none). Cause: the crown crystals use `transmission: .35`, and
  Three r186 caches a transmission render target per camera id inside each
  scene's render state (`WebGLRenderer.js` ~2012; viewport-sized, 4× MSAA,
  half-float, mipmapped). Nothing disposes it when a hero scene and camera go
  away, so each Jevica Studio portrait at 3840×2160 strands on the order of a
  hundred MB of GPU memory. The game's persistent camera is unaffected.
- **Jevica per-frame cost.** About 3.3 ms of CPU per instance (8 instances:
  26 ms; 24 instances: 80 ms), against about 0.3 ms per Sable. The
  transmission pre-pass re-renders opaque objects and the drape updates per
  frame. Only Jevica's account wears this look, so a crowd of them is not a
  real scenario, but her single-instance cost is.
- **Male rigs lack brows and lashes.** man-casual and man-tailored have no
  eyebrow or eyelash meshes, 172-triangle low-poly eyes, and a 15.8k-triangle
  body (jevica: 88.9k).
- **Flat hair on looks that recolour hair.** `romance-look.js` replaces the
  hair map with an opaque procedural stripe texture (alpha 255) for Sable,
  Vesper, Lyra and forest Silvan, so the cards render as solid banded sheets.
- **Red irises.** MakeHuman's `brown_eye.png` iris is hue ~9°, saturation
  0.97. That is red, not brown.
- **No cornea.** The cornea maps to a transparent disc in the eye texture. The
  rig import's alpha test discards it, and with it every eye highlight.

## Next

M1: build the harness (close-up and full-body presets, scene census, texture
bytes, load time, frame-interval p50/p95 with vsync off, 10-cycle
load/dispose), then run it twice on the shipped jevica and man-casual looks.

## Ownership handoff and M1 correction (2026-10-18)

Val explicitly transferred #517 from `claude:river-oaks (015e1f43)` to
`codex:character-fidelity-517-20261018` in chat. Existing checkout and all
untracked implementation preserved. Supporting draft PR #536 at a790766c
remains the licensing/integration input; no implementation PR exists yet.

The earlier statement "clean tree" is incorrect: the harness was untracked.
Earlier reports remain historical observations, not lifecycle acceptance.
The transmission root-cause statement above was premature before a controlled
cleanup comparison. The renderer source supports the hypothesis; browser
verification below distinguishes reproduction from proof of the fix.

New evidence module hashes executable source and public assets, including
untracked files, and refuses resource growth or missing measurements. A run
also checks for changed inputs at completion. Focused tests: 11 passed via
`node --test scripts/tests/character-fidelity-evidence.test.js preview/tests/transmission-targets.test.js preview/tests/character-fidelity-metrics.test.js`.

Negative browser control:
`node scripts/character-fidelity-baseline.mjs --appearances jevica --repeats 0 --out .runtime/character-fidelity/m1-gate-negative`
failed as required: textures 14 -> 24 after 10 cycles. Captures and full input
manifest are in that directory's report.json. This is a real retained GPU
resource regression, not just a synthetic delta test.

Hero teardown now accepts the renderer and releases transmission targets before
material disposal. The focused hero regression failed before this wiring and
then passed (5 hero/transmission tests). Controlled browser comparison is queued
through the shared browser lock; production portrait cleanup and multi-camera
coverage still need completion. Transmission remains enabled at .35.

Remaining delivery: finish M1 provenance/lifecycle acceptance and repeat captures;
verify and integrate inherited realism layer; new pinned human fixture with
brows/lashes/expressions; matched off/high portrait/world visuals; variants,
quality-system integration, persistence and executable capability contract;
core/full/browser gates; signed commits and draft PR/issue handoff. No device,
native, human, AAA-quality, merge or deployment claim. #441 P4/P5 novice trials
remain waived, not passed. Do not re-request physical-device targets.

Production `portraitPixels` now releases the current camera's transmission target
in its finally block, including readback failure. Its focused regression failed
before the fix. 13 focused evidence/hero/portrait/transmission tests now pass;
the inherited realism module's 6 tests also pass (runtime integration unproven).

`m1-cleanup-probe` observed zero geometries/textures/programs growth and both
Jevica views byte-identical to `m1-gate-negative`. Its report correctly FAILED
because source changed while it waited in the browser queue. Do not label that
receipt accepted. Fresh four-appearance comparison `m1-verified-a` is running
with source frozen against `m1-baseline-a` (exec session 69577). Core verification
is live in exec session 88492, log `.runtime/character-fidelity/core-m1.log`.
Poll those exact handles before deciding whether to rerun.

Next M1 gaps: repeat stable run, exercise actual 4K multi-camera portrait cycles
(the existing cycles method renders the viewport), and represent omitted timing
as unmeasured rather than an empty comparison passing vacuously. Capture
provenance is checked both after queue acquisition and at end. No timing samples
are requested during the current contended-host lifecycle probe.

## Remaining implementation sequence after the ownership handoff

Use the existing checkout and execute serially; no competing implementation.
The source freeze for `m1-verified-a` takes precedence over starting these edits.

1. **Close M1 evidence gaps.** In `character-fidelity-baseline.mjs`, record
   absent timing comparisons as unmeasured. Extend the fixture's repeated
   lifecycle check to actual `portraitPixels` calls through both fixed cameras,
   with cleanup in a finally block. Keep the viewport test as a separate scope.
   Reproduce twice, compare all eight original captures, and retain source
   manifests. A performance claim requires measured samples, not an empty array.
2. **Make the inherited realism layer reversible.** Before integrating it,
   add behavioral tests for high -> standard -> off -> high transitions,
   geometry/material restoration, transformed/skinned corneas, and texture
   ownership. Current `splitCornea` replaces geometry without restoring it;
   `applyCharacterRealism.dispose` removes added objects but does not restore
   modified material properties. Global texture maps also need a bounded
   ownership decision. These are concrete integration risks, not yet verified
   failures. Tests must expose each failure before the correction.
3. **Build separate realistic human assets.** Add a dedicated generator using
   the existing `build_characters.py`/`build_facial_candidates.py` conventions.
   Resolve cached CC0 sources explicitly without copying private runtime state.
   Include fitted brows/lashes, high-poly eyes, and tested facial targets. Start
   with one clothed human; then add a second body and wardrobe fixture. Preserve
   all existing GLB bytes and pins, especially Jevica. Receipts must name/hash
   every source and output, including build settings. Do not overwrite the
   existing `sources.json` with a subset of profiles.
4. **Integrate the asset and capability contract.** Add distinct immutable pins
   in `character-assets.js`, explicit supported capabilities in a DOM-free
   module, and canonical definitions through the shared validator. Inspect
   `shared-appearances.js`, customization and server character-store callers
   before choosing the smallest compatible catalog extension. Test invalid
   pins, unknown tiers/capabilities, unauthorized owners, stored reload and
   legacy definitions. Keep unsupported body editing, arbitrary clothing and
   face controls explicitly unavailable.
5. **Runtime and quality.** Apply realism after the authored look/material
   customization, with teardown owned by the avatar instance. Route tier
   selection through `render-quality.js`; test fallback on missing resources
   and repeated changes without identity or resource drift. Preserve the
   canonical Jevica path. Inspect resident-face baking and speech/eye bindings
   so expressive targets survive only where intended. Do not duplicate crowd
   or Studio polish owners' code.
6. **Measured acceptance.** Capture off/high with the same camera, light, pose
   and animation, then inspect close-up, portrait and world views. Exercise
   body/wardrobe variants, expressions, reload, missing assets, quality changes,
   and repeated teardown. Separate contended desktop timing from supported
   budgets. Reuse existing crowd measurement code. Physical/mobile and native
   gaps remain explicit; novice P4/P5 trials remain waived.
7. **Delivery.** Run focused regressions, relevant Studio/world browser
   acceptance, asset audit/goldens, core and full prerequisites/gates. Record
   exact source hashes and revisions. Then signed commits, feature-branch push,
   draft PR and issue handoff; no merge/deploy/retirement. Supporting PR #536
   supplies the source matrix and must be reconciled with actual fixture gaps.

Independent source review during the M1 queue confirmed that
`instantiateAvatar` clones materials, `bakeResidentFace` strips only its named
face-shape targets, and the shared validator recomputes exact canonical v1/v2
assets. Existing fixture loading alone cannot prove publishability.

## Verified M1 and measured M2 material increment

- `m1-verified-a` passed with input manifest SHA256
  `c4b7e671fd26e5ae8590facea066ec35b30ad3821a127fb052ce2cc6cd5a5551`:
  original four census results and eight native4K PNGs byte-identical; all
  viewport resource deltas zero. This is a dirty-tree manifest, not clean HEAD.
- `m1-portrait-verified-a` passed with input manifest SHA256
  `d05f5442bd2af28bf7015c8533c654b2e8ae3d88ec3fbeeb5ee35b2315d52069`:
  all four appearances completed 10 actual native4K cycles through two cameras
  with zero geometry/texture/program growth. Capture/census reproduction passed.
  Timing is explicitly null (unmeasured); omitted comparisons no longer pass.
- Core exec88492 is terminal FAILED: agent-tests passed; preview-tests exceeded
  600 seconds and received SIGKILL/ETIMEDOUT. Server/build/Python/later checks did
  not run. Receipt `.runtime/agent/core.json`, log `core-m1.log`. Host load peaked
  around160; this is not a passing core receipt or proof of a code defect.
- Inherited realism defects reproduced and corrected: teardown now restores
  original materials/geometry; corneas retain local transforms; generated
  iris/strand maps are per-effect owned and disposed. Bounded shared pore and
  roughness maps remain cached. A shipped-name regression caught prefixed GLB
  nodes bypassing eyes/lashes; corrected matching now upgrades Sable's cornea,
  lashes, brows, hair and skin. Focused integration set:21 passed before the
  name regression; all9 realism tests passed after that fix.
- `m2-material-probe-b` passed off/high viewport and two-camera4K lifecycle on
  Sable and Aurel. Sable high reports skin1/cornea1/hair1/brows1/lashes1;
  Aurel reports missing cornea and no brows/lashes, accurately exposing its
  current asset limits. Visual inspection: brown iris and small eye highlights
  now present on Sable; coarse hair silhouette and limited eye detail remain.
  No first-fixture or AAA acceptance from this material-only probe.

`scripts/build_realistic_humans.py` now exports two separate ~9MiB human rigs
from cached CC0 source assets: `man-realistic-casual` and
`woman-realistic-tailored`. Existing GLBs/pins untouched. Blender single-thread
build ran through the shared heavy-work queue. Ruff formatting/check passed;
the final build in `.runtime/character-fidelity/verified-humans` used that exact
formatted generator. Receipt captures asset/target inputs, complete tool-data
hash manifest and script SHA. Body subdivision1, high-poly eyes, fitted
brows/lashes, 2blinks,15visemes and3expressions are declared by the build;
exported-byte tests and rendered acceptance must prove them.

Morgan and Imani are new authored catalog entries for these fixtures. Existing
v1/v2 shared validator and fixed-bundle customization rules remain authoritative;
no arbitrary body, clothing, URL or morph publication is enabled. Compatibility
rig requirements now derive from the complete pin list. Live exec25037 runs
focused actual-asset/definition checks then off/high captures/lifecycle at
`m2-fixtures-a`. After it is terminal, continue runtime expressions and quality
integration plus executable capability/persistence/world/Studio acceptance.

## Runtime contract, expressions and neutral-export correction

New executable modules: `character-fidelity-contract.js` (DOM-free fixed-bundle
capabilities), `character-fidelity-runtime.js` (async fenced tier ownership),
`character-quality.js` (existing governor publication), and
`character-expressions.js` (bounded transient poses). `loadResidentAvatar` now
owns the layer/subscription only for the new realistic rigs by default; explicit
diagnostic tiers remain available. Hero creation suppresses the avatar's default
layer and applies the selected layer once. Existing canonical rigs default off.
No crowd culling/remote-player or Studio polish implementation was duplicated.

The initial two fixtures had neutral body weights but accessory morph weights
all1, left by the existing Blender modifier-preservation helper. The new
actual-asset regression failed on brows/hair. The new generator now zeros every
mesh's exported key values after preparing its targets. Rebuilt at
`verified-humans-v2`, repinned both new files and retained the old probe receipts.
`m2-fixtures-a` therefore records a superseded candidate, not final acceptance.
The neutral-export/expression tests now pass on actual instantiated geometry.
Smile and brow raise don't change blink or speech influences.

Focused run after the rebuild:13 passed,1 Redis skip. This includes exported
bytes/pins/neutral weights, actual expression bindings, canonical capability
validation, late-response/dispose fences, missing-map fallback, hero integration,
and in-memory save/publish/equip/reload/isolation. The Redis skip remains a gap.
Separately,15 graphics-control/quality/contract tests passed before these final
asset bytes (these tests are not asset-sensitive).

`m2-neutral-quality-a` PASSED with input SHA256
`2c443ab404a33fa48e61cd4502b387195a71a661d665f43fa1fc930254f951d0`:
2 bodies x off/standard/high;4 native4K views per case (full,close-up,smile,
browRaise); all viewport and two-camera portrait deltas zero. Both actual avatar
controllers completed5 repeated graphics-control transition cycles with zero
resource growth and unchanged rig IDs. Governor40ms samples are synthetic
transition inputs, not performance data. Visually inspected Morgan's smile:
accessory misfit is corrected; the expression is visible and skin/eyes retain
the neutral character. Hair remains card-based.

ENOSPC prevented the first attempt to create the output directory before any
browser fixture started. Removed only this checkout's ignored regenerable `dist`
and `node_modules/.vite`, preserving all source, assets, receipts and captures.
The rerun above passed; disk free space subsequently rose to1.8GiB. Final build
verification must regenerate `dist`.

Current browser delivery check: exec42859 runs
`RIVER_OAKS_E2E_REPORT=character-fidelity-experience-517.json pnpm run test:experience character-fidelity character-studio`,
log `.runtime/character-fidelity/experience-517.log`. The new journey tests actual
Studio selection, publication/equip, a shared receiving peer, reload and world
captures for both fixtures. Poll this exact live handle; don't restart it.

Next correctness gap found during contract review: the governor's lowest tier
currently selects diagnostic `off`, restoring the original red iris texture.
Separate an identity-preserving `low` material tier from diagnostic `off` before
claiming identity across quality settings. Keep off/high diagnostic comparisons.
Then rerun tier lifecycle/captures, collect interleaved descriptive timings,
Redis/browser/shared/asset/golden/core/full gates and complete signed draft-PR
handoff. Remaining quality, device/native and human gaps stay explicit. No commit,
push, PR creation, merge or retirement has occurred in this ownership run yet.


The new `character-fidelity` Studio/shared-world browser journey PASSED on the
neutral-export candidate: both fixtures selected in Studio, private draft saved,
published/equipped with exact pins, loaded by the receiving peer, and retained
after page reload. Studio/world screenshots are under `output/playwright/` with
`character-fidelity-{morgan,imani}-*` names. Existing `character-studio` journey
is still live in exec42859; no runtime changes while that page run is active.

Isolated Redis8.10.2 is live at `redis://127.0.0.1:51195/0`, process12285,
exec58311. It binds loopback, disables persistence, and is solely this task's
local test service. `REDIS_URL=redis://127.0.0.1:51195/0 node --test server/tests/character-fidelity-store.test.js`
PASSED:2 tests,0 skips, including separate Redis writer/reader clients.
Log `redis-fidelity-store.log`. Retain this instance for the required full gate;
revalidate its exact handle/port before reuse, then shut down this instance at
handoff once verification is terminal.

Low-tier regressions have been added and intentionally fail against current
code (`low-tier-red.log`): floor mapping and contract still say off, and low
material application is unavailable. After exec42859 is terminal, add low that
retains iris/cornea/hair coverage while omitting pore/scatter cost; update the
contract, governor mapping and quality fixture. Diagnostic off stays explicit.
No committed change is claimed while these regressions are red.

## Low tier and verification checkpoint

Exec42859 is terminal PASSED: new `character-fidelity` journey9 checks in141s;
existing `character-studio` journey43 checks in167s. Report
`data/reports/character-fidelity-experience-517.json`. This run preceded the
additive low tier below; final full/targeted checks must cover the final state.

Low is now a production tier retaining the natural iris/cornea/strand corrections
while omitting pore normals and diffuse wrap. The graphics floor maps to low;
`off` is diagnostic only. The capability contract exposes low/standard/high and
lists off separately. All3 low-tier regressions failed before this correction.
`focused-final-low.log`:51 passed,0 failed,0 skipped, covering the fidelity,
expression, actual-asset, hero/portrait, evidence and graphics-control modules.

Live exec63677 runs the final low/standard/high fixture matrix with expressions,
quality lifecycle,2 timing repeats,120 samples and crowds1/8/24:
`m5-tiers-timing-a`, console log `m5-tiers-timing-a.log`. Early Morgan low and
standard cases have zero reported residue; the run is not terminal yet. Preserve
the source freeze through this run. Host load remains heavily contended, so its
timing samples remain descriptive even if all other checks pass.

Live exec26550 queues `REDIS_URL=redis://127.0.0.1:51195/0 node scripts/browser-lock.mjs 'Core verification character fidelity 517' -- pnpm run verify`,
log `core-final-low.log`. It will acquire the shared heavy-work lock after the
measurement. Redis is still live in exec58311 and answered PONG. Poll these
existing handles; no restarts based on observation timeouts.

Still required: inspect final tier views and timing results; final relevant
browser/shared/asset-audit/golden checks; a successful core profile and the full
profile with this isolated Redis and browser prerequisites; exact final evidence
receipts; signed verified commits, feature push, draft PR and issue handoff to
#441/#442/#444. No merge/deploy/retirement. No performance-budget, physical-device,
native, human or AAA-quality acceptance claim. The whole #517 objective remains
active and unproven until the remaining implementation/acceptance audit passes.


### Independent review corrections (2026-10-18)

Read-only reviewer found five required corrections. Added three behavioral
regressions; all failed before patch, all pass after: missing roughness preserves
low rather than enabling standard cost; portrait hero shares controller fallback;
quality subscription starts before map loading and awaits the newest request.
`review-fallback-red.log`:3 failures; `review-fallback-green.log`:10 passed,0 skipped.

Cold-load and crowd timing scene cleanup now releases transmission targets before
materials, including error paths. A repeated load/crowd lifecycle probe is added
behind `--timing-cycles`; real-browser result pending. The contract distinguishes
15 exported visemes from integrated speech (`speechRuntime:false`); no new donor
files exist and no paid speech service is used.

Receipt generator now follows sibling mhclo/material/texture dependencies, hashes
imported generator modules, MPFB executable code/data and Blender binary. Two
synthetic cache/path-boundary tests pass; actual receipt regression is red until
the rebuild. Existing-cache build exec8978 writes isolated `verified-humans-v3`.
Ruff check passed before this exact build.

Deliberately stopped own full retry exec1657 and queued baseline exec82612 to
apply required review fixes. Full receipt shows dependency audit and agent tests
passed; preview tests ABORT_ERR at544s, remaining checks not_run. Queued baseline
terminated143. Neither is final proof. Preserved logs/reports and other sessions.
Branch fast-forwarded without commit to main59abec7790ffb165ff41b712e51fa7eb0fb4534e
after verifying no upstream overlap in edited runtime modules; local edits retained.


### Final source freeze and queued verification

Independent reviewer rechecked all five corrections and found no further required
source fix. Source-level review is not a substitute for the pending browser gates.

Receipt v3 was cancelled after source inspection caught an accidental duplicate
low-poly eye insertion during provenance editing; it was never copied or pinned.
Added exported-byte regression forbidding low-poly eyes. Corrected v4 build
(exec3421) completed from the cached source with unchanged pinned GLB bytes:
Morgan bce971f3e523419b9ee1ceaccf9a8044152dc1647dd2148c458e40aad0da4305;
Imani d341bf3a344bfd8d091ea226482d9bd51ad18732fe361e5860537052e767cdc1.
Copied only those outputs and the corrected receipt. It includes93 asset inputs,
4 generator inputs,2384 MPFB code/data inputs and Blender binary hash.
`receipt-assets-final.log`:8 passed,0 failed,0 skipped (actual GLBs + audit tests).
`asset-audit-final.log`:CLI audit passed all5 pinned rigs.
`focused-review-final.log`:55 passed,0 failed,0 skipped; build-input pytest2passed.

Source freeze active for these existing exact jobs; do not restart them on
observation timeouts or edit executable inputs while measurements are live:
- exec67552:original4 appearances + repeated timing-scene lifecycle, against
  m1-portrait-verified-a, repeats0; output m1-final-review.
- exec47858:low/standard/high2fixtures + expressions + rendered tier comparison,
  quality lifecycle,2 timing repeats120samples,crowds1/8/24,against prior M5;
  output m5-final-review.
- exec80279:matched diagnostic-off2fixtures,expressions,lifecycle,repeats0;
  output m2-final-off. This shares executable manifest with the high run.
- exec93412:strict hero goldens --check against reviewed reference.
- exec67848:character-fidelity + character-studio browser journeys. The supplied
  report env name was ignored by existing runner; collect its actual
  data/reports/experience.json into the task-specific report before full overwrites.
- exec63330:runs exact core then full profile sequentially with isolatedRedis51195;
  logs core-final-review.log/full-final-review.log,explicit exit file.

`project:check --tasks <primary>/docs/project-management/tasks.json` reports
unrelated pre-existing missing worktree records across the shared register.
Preserve those records; this task's owned checkout exists and is active.

Visual inspection of prior neutral-v2 closeups confirms brown irises, visible
brows/lashes,skin variation and specular response. Hair silhouettes remain coarse,
cloth textures visibly blurred,and fine eye detail is limited. These are known
quality gaps,not AAA acceptance. Current final captures still require inspection.


Final M1 exec67552 passed: source manifest 86e3c93b40d87352d14b1baabdc309e041e2fd90a4e81077c96e33d662929ac5,
revision59abec7790ffb165ff41b712e51fa7eb0fb4534e,dirty-tree evidence includes all executable/public inputs.
All8 original PNGs byte-identical and4 census checks reproduce prior verified M1.
Each of4appearances has0geometry/texture/program growth in viewport10cycles,
native4K two-camera10cycles,and3repeated cold-load+crowds1/8/24cycles.
Copied accepted report unchanged to data/reports/character-fidelity-m1-final-517.json.
No timing measurements were requested in this repeats0run.


Repository-wide Ruff found one inherited long dictionary line in the new
roughness-map generator. Formatted that line only; ruff check and format now pass.
No renderer or asset behavior changed. M1 proof above identifies its exact earlier
manifest; it precedes this formatting-only generator change. Cancelled only own
queued tier/off measurement processes8502/13078 before editing to avoid invalid
queued provenance. New unified off/low/standard/high run exec27503 at
m5-final-source captures matched off/high in one source manifest and includes
expressions,real rendered transitions,quality lifecycle and2timing repeats.
Core/golden/Studio jobs remain queued; their sources are read at execution or
exclude this unrelated offline generator. No timeout/threshold change.


Strict native4K hero check exec93412 passed the reviewed Sable reference, without
recording/replacing reference images or changing tolerances. Copied its report
to data/reports/character-fidelity-goldens-517.json. Exact command:
node scripts/character-hero-goldens.mjs --check preview/e2e/goldens/character-hero.
Core started22:10:07Z at59abec77; agent-tests currently live.

Existing Playwright WebKit binary is installed; queued an additional no-download
character-fidelity journey with RIVER_OAKS_EXPERIENCE_BROWSER=webkit and the
correct RIVER_OAKS_E2E_REPORT=character-fidelity-webkit-517.json. This would prove
only desktop WebKit's engine with fixture identities, not Safari/iOS hardware.


Fresh final store regression:
REDIS_URL=redis://127.0.0.1:51195/0 node --test server/tests/character-fidelity-store.test.js
passed2,failed0,skipped0 in store-final-review.log. It checks canonical pinned
publication and owner isolation with both memory and separate Redis clients.
Core agent suite125passed0failed0skipped;preview remains live. Remaining
preview workers are existing CPU-heavy coat/drape/fragrance/screening tests;
no configured timeout or threshold was changed.


### Broad-gate integration corrections

Core exec63330 exposed real patch-related integration failures after125tooling
tests passed: cloth-bake receipts pin old avatars.js SHA,and campus envelope
receipt covers11looks instead of13. Also saw the unchanged penthouse idle-slice
40ms assertion fail under contention. No threshold changed. Stopped own outer
core/full group8809 and queued Chromium8504/M5 39034/WebKit31594 before source
receipt mutation; exec63330/67848/27503/58552 terminal143, full not started.
All earlier accepted reports remain retained at their exact source state.

Claimed integration-only generated receipts in this isolated checkout (other
turning/Studio checkouts untouched). Exec1087 queues existing5cloth producers
with --write then --check,requires all generated morph-data bytes unchanged,
runs selected provenance/idle regression,and remeasures campus bounds.
Log receipt-refresh-final.log. Prior campus report copied unchanged to
data/reports/character-fidelity-campus-envelope-before-517.json.

Inspection found the existing campus producer passed seconds into the avatar's
millisecond clock and ignored morphs in seated bounds. Corrected those two
measurement operations,added source/asset provenance and self-hash,and will
refresh the receipt only after the actual13-look measurement succeeds. Existing
CAMPUS_BODY thresholds stay unchanged. No new world/collision behavior.


Independent review found a further consumer proof gap: IPIC uses directional
seated reach (side.514/front.644/back1.155m),which a campus radial bound cannot
prove. New character-fidelity-clearance.test.js is red on the missing new looks.
The same pending13-look producer now records seated left/right/front/back,
measures visible,morph-aware standing and seated vertices,and rounds outward
to1micrometre so rounding cannot hide a violation. It keeps the same campus
and IPIC thresholds. Original IPIC22-look evidence remains untouched.

Read-only inventory confirms exactly5existing receipts hash avatars.js,and no
other input in those receipts differs. integration-receipts-red.log has exactly
3selected failures (coat/lyra provenance + stale campus catalog),0skips.
Queued producer's selected provenance checks precede actual envelope capture;
the unrelated idle-slice reproduction runs last,so it cannot suppress useful
measurement evidence if the host-sensitive40ms assertion fails again.


Additional failure/recovery regression: after a transient optional-map failure,
requesting the same low/standard tier used to return its fallback forever. The
early-return now excludes fallback reports,allowing a same-tier retry to recover
without an identity/quality switch. fallback-recovery-red.log failed before;
fallback-recovery-green.log has6passed0failed0skips for all runtime scenarios.
Default successful-map and legacy off paths are unchanged. This correction was
made while all own measurements were cancelled and the receipt refresh queued.


Fast-forwarded feature branch59abec77 ->225acfc9eaebf67627db7337feacac130b241ad8
without creating a commit,retaining all dirty task changes. Main's32changed paths
include the existing #442crowd and IPIC consumer work. Static dependency walk
of the5bake producers found65local dependencies and0upstream intersections;
none of their pinned data/tool inputs changed. No fidelity/campus measurement
was running (bake refresh only),so the upcoming campus provenance will identify
this integrated state. This reuses the crowd work rather than duplicating it.
Core/full and final rendering still must run against the integrated candidate.


Exec1087 completed0. All5existing producer --write/--check pairs reproduced
unchanged morph data; only5receipt avatar-source hashes changed. Selected
coat/Lyra provenance2tests passed,0skipped. Unchanged idle-slice test passed
isolated1/1,0skipped; broad gate still requires rerun.

Fresh actual13-look receipt copied unchanged after successful measurement at
225acfc9+dirty manifest3a05312c0f8c685722044b922fb00d103ff3bc2b3c15375b2ba329b384b57c63.
All13fit campus; both new fixtures fit IPIC side.514/front.644/back1.155m.
Morgan seated left.270710,right.513297,front.614232,back.150984m;
Imani left.238424,right.439987,front.586544,back.120508m.
Corrected measurement newly observes existing forward-bound failures: Lyra
.673930,Silvan masculine.659066,feminine.673350m vs.644m. Keep these explicit
in data/reports/character-fidelity-clearance-517.json and #444 handoff. No
threshold/legacy wardrobe/runtime change and no full-catalog IPIC acceptance.
Unchanged morph/geometry bytes do not prove when those failures began.

Reviewer agrees #517's directional regression should guard its exact two new
rigs while requiring full current-catalog campus coverage. It first failed on
the old11-look receipt; exec90155 now tests the refreshed report plus full
garden contract. Prior failed all-catalog validation and original receipt are
preserved as observations,not relabelled passes. Updated brief describes the
actual refreshed method/values and links both historical and current evidence.


Integrated focused set:67passed,0failed,0skipped (focused-integrated-final.log).
Clearance plus garden contract:16passed,0failed,0skipped (clearance-green.log).
No further executable inputs should change while the aggregate gates are live.

Exec91292 now owns the sequential core/full run in
.runtime/character-fidelity/run-integrated-profiles.sh,using isolatedRedis51195.
Exact required commands remain pnpm run verify and pnpm run verify full under
the shared browser/heavy-work lock. Logs core-final-integrated.log and
full-final-integrated.log. These are queued behind other sessions,not passes.
On terminal completion the script copies each actual profile receipt into
data/reports/character-fidelity-{core,full}-517.json and writes explicit exits.

Pre-run snapshot profile-inputs.json binds HEAD225acfc9,the complete runtime
manifest3a05312c0f8c685722044b922fb00d103ff3bc2b3c15375b2ba329b384b57c63,
and49changed code/test/asset hashes (including new test files outside the render
manifest). The final step rejects any changed input or HEAD. Docs/reports/live
registry remain outside this executable freeze. Runtime measurement self-hash
remains in the copied campus receipt. Only exec91292 and isolatedRedis58311
remain live for this task; all prior verification/browser jobs are terminal.

After core/full terminal:inspect actual failures and all skips,then final
M1 reproduction + off/low/standard/high2fixture rendered matrix (including
quality-reference pixels/quality lifecycle/expressions,cold load/crowds),strict
hero reference,Chromium fidelity+Studio,desktopWebKit fixture journey,and
required/development-world shared coverage if the full profile did not establish
it. Preserve final real PNGs and exact reports for GitHub review. Then signed
verified commits,feature push,draftPR and issue handoff #517/#441/#442/#444.
No merge/deploy/retirement,and no completed goal or physical/AAA budget claim.


Final real-render jobs were queued while core remains ahead in the shared lock.
They will run before the script's subsequent full gate (which queues only after
core returns),allowing material failures to be found before another broad run.
All use the same frozen runtime manifest3a05312c...; no source mutation is planned.
- exec33613:M5off/low/standard/high2fixtures,expressions,quality-reference pixel
  checks and lifecycle,2timing repeats120samples,crowds1/8/24; m5-integrated-final.
- exec73132:M1original4,repeats0,timing-scene lifecycle,against m1-final-review;
  m1-integrated-final.
- exec51694:strictgoldens --check;golden-integrated-final.log.
- exec47041:Chromiumcharacter-fidelity+character-studio with correct
  RIVER_OAKS_E2E_REPORT=character-fidelity-experience-final-517.json.
- exec18270:desktopWebKit character-fidelity,correct task-specific report
  character-fidelity-webkit-517.json. Installed binary only,no download.

These jobs are not passes. Core/full exec91292 and isolatedRedis58311 remain
live too. Queue order between the independent render jobs follows actual lock
acquisition,not tool launch order. A source failure requires diagnosis; a mere
observation timeout never licenses a duplicate run.


### Actual caller-index stature regression

Final caller audit found player-avatar and remote-players pass indexOf(newrig)=-1,
while hero clamps0. Existing indexed height formula shortened new world bodies
by2.5cm and varied the same bundle's crowd stature. Added an actual exported-GLB
regression using the existing texture-free structural helper,indices[-1,0,1,4,8].
It failed on Morgan index-1 (stature-red.log),then passed both rig/contract
checks after fixed targetHeightM1.78/1.66 is exposed by the immutable contract
and preferred by loadResidentAvatar (stature-green.log:2pass,0skip).
No legacy NPC height formula or canonical asset bytes changed.

Stopped ONLY own queued groups57322/8485/8486/8487/8488/8489 before source edits.
Exec91292/33613/73132/51694/47041/18270 all terminal143; no integrated core/full
or new render job had started. Their old input snapshot is not current proof.
Redis exec58311/port51195 remains live and isolated.

The source hash change requires actual5cloth producer/check refresh again,even
though those old-rig paths are unchanged. Reuse exact scripted checks and require
generated morph bytes identical; no receipt stamping without execution. New
refresh writes campus-stature-final.json so the first13-look measurement remains
retained separately. After final receipt copy,rerun focused,aggregate and actual
render acceptance. Never restart an active job due to observation timeout.


### Fixed-stature final verification queue

Fresh selected focused source/asset/runtime/evidence set:54passed,0failed,
0skipped (`focused-stature-final.log`,exec76077 exit0). This is the selected
54-test set,not the prior67-test selection or an aggregate gate.

Actual5producer/check and13look refresh remains exec31656,queued behind
other browser sessions; do not stamp receipts or bypass lock. Finalrender
jobs queue behind it using wrappers so provenance is captured after lock
acquisition:M5exec48232,m1exec55253,goldenexec85059,Chromiumexec35037,
WebKitexec92313. Logs use `*-stature-final.log`; outputs `m5-stature-final`,
`m1-stature-final`. No source edits planned. Redis51195 PONG verified23:00Z.
No implementation PR exists on latest REST read. Primary live task and own
branch registry heartbeat updated only in own task block.


Receipt refresh exec31656 terminal0:all5cloth producers/checks really ran;
all5generated morph-data files remain byte-identical toHEAD. Provenance
regressions2passed0skip,isolatedidle1passed0skip. Actual13look measurement
copied unchanged from campus-stature-final.json; all13dimensions exactly
equal prior13look observation,with current runtime manifest
f1f07b69267e7d47e264e4f476a04c30f65ce5cce5f619cfc826d4dac1a4472b.
Clearance report links this provenance; scoped regression exec21104 running.

Final stricthero --check reports1native4Kcompare passed (exec85059 awaiting
terminal collection),output23-05-36.056Z. Chromium now running,other final
renders remain queued. Aggregate core/full exec14591 now queued sequentially
via unchanged run-integrated-profiles.sh,isolatedRedis51195; before snapshot
regenerated after finalsource receipts and actualcampuscopy. No aggregatepass
claim. Earlier cancelled logs are historical; newrun writes the same designated
final-integrated logpaths and actual task-specific receipts on terminalexit.

Freshclearance exec21104 terminal0:16passed0failed0skip. Strictgolden
exec85059 terminal0:1native4KSablecompare,allpixelmetrics0. Actualreport
copied unchanged to data/reports/character-fidelity-goldens-517.json.
Aggregateprechecksnapshot is currentHEAD225acfc9 +manifestf1f07b69...,
50changedcode/test/assetfiles. Finalrenders/core/full remain running/queued.

Chromiumexec35037 terminal0:character-fidelity9checks and existingStudio43
checks passed; actualreport data/reports/character-fidelity-experience-final-517.json.
PNGbytes copied unchanged before WebKit can overwrite outputpaths to
docs/acceptance/character-fidelity-517-captures/(4Studio/peerimages),with
SHA256indexchromium-captures.json. Visually inspected all4:bothworldrigs
load; worldviews are frombehind (identity/loading evidence,notfacequality).
Studio shows coarsehairsilhouettes,Imanihairstrongsilverhighlights,limited
clothdetail. Finalnative4Kcloseups/tiertransition matrix stillpending.
WebKitnowrunning; M5,M1,core/fullqueued.


M5exec48232 terminal0:8tier/fixturecases,10viewport+10twocameraportrait
cycles each,quality5triplets each,allresource deltas0. Switchedhigh/std
vsfreshsame-tier nativeportrait maxchannel0 forbothfixtures. Expression
smile/browraise actualPNGs inspected alongside full/off/highcloseups;12native
PNGs copiedunchanged withSHA256/camera index into acceptance capturesfolder.
Rawreceipt copiedunchanged to data/reports/character-fidelity-tiers-517.json.
AppleM3Max16CPU,Darwin25.6arm64,Chromium156ANGLEMetal. Tworepeats120frames
and30GPUqueries percase/crowd1/8/24. Pairedp50frame/GPU agreement39/48 within
20pct; descriptiveonly,notbudget. Disabledvsync/limit isolatedscene nottownFPS.

WebKitexec92313 terminal0:9fidelitychecks. Rawreport's inheritedscope string
saysChromium; actualenv/runnerselection WebKit documented explicitly.
NoSafari/iOS/physical acceptance claim.

M1exec55253 terminal0 atcurrentf1manifest:8originalPNGs identicalbytes,
4censusmatched,allviewport10/portrait10/timingloadcrowd3resource deltas0.
Rawreport replaces selected data/reports/character-fidelity-m1-final-517.json,
previousreport preserved in.runtime/m1-final-review. No timingrepeats requested
for deterministicrerun; timingagreement unmeasured.
Coreexec14591 nowrunning; fullqueuesafterterminalcore. Noaggregatepassyet.


### New culling fixture exposed a stale height assertion

Core tooling125passed0skip,then preview reportedImani failure. Targeted
`node --test --test-name-pattern='imani-human: the figure sphere' preview/tests/avatar-culling.test.js`
failed on its firstheightassertion (culling-stature-red.log),beforevertex
measurement:expectedlegacy1.78,actualdeclared1.66. No proven vertexoverflow.
StoppedONLYownaggregategroup30348(exec14591 terminal143),nootherjobs.
Preserved core-before-culling-contract.log/json. No aggregatepass/no fullrun.

Smalltest-onlyintegration fix:expectedheight nowprefers immutablebundlecontract;
legacyassertion and unchanged.97radius-containment threshold remain. No culling
production/geometry/limits change. Full13lookposesweep exec12645 running.
Currentrenderinputmanifest excludes preview/tests and remainsf1f07b69; actual
M1/M5/browser/golden proofs stay source matched. Aggregatechangedtestmanifest
must regenerate with51changedfiles. Primary/branchownfiles claim includes
avatar-culling.test.js. Re-runrequiredcore/full after sweep terminalgreen.


Exec12645 terminal0:full13lookcullingpose sweep13passed0skip; Morganworst
.751,Imani.746 ofunchangedradius (threshold.97). Independentreview found
no requiredissue,testcorrectlyusesfixedfixtureheight,and verified all16
savedPNGhashes/sizes/nativehashes vsreports. Evidenceclaims including39/48
timingagreement,WebKitqualification andpendinggates matchedrawreports.
Noedits/heavytests byreviewer.

Newsequentialrequiredcore/full exec88467 queuedbehindother sessions under
sharedlock. Currentprechecksnapshot51changedcode/test/assetfiles,HEAD225acfc9
andunchangedruntimef1f07b69. Nootherownbrowser/renderjob remains active.
Redis51195 remains isolated for requiredgates. Neverrestartdueobservation
timeout. Noaggregatepassyet,and no signedcommit/PRuntilverification.

Additionalcrowdartifactgap identified:timing harness renderedcrowds butdid
not savecrowdPNGs. Independentcapture scriptdocs/acceptance/character-fidelity-517-captures/capture-crowds.mjs
usesexistingfixtureframes(8/24,high,reducedmotion),immediatePNGreadbackbefore
disposal,and recordsits ownSHA256 alongsideunchangedruntimef1manifest. Its
encoding affectsCPU timing,so no timingclaim fromthisrun. Exec69016 queued
behindcurrentcore andotherqueuedbrowserwork. Thisdocsartifact isexplicitly
self-hashed,outside aggregate's51code/test/assetinputs; no runtimepatch.
CorehasnowpassedImaniheightandposeboundcaseintheactualbroadsuite.


### Secret gate: exact public tool digests

Core completed125tooling,3653preview(1skip),923server,76desktop,build,Ruff
452files,143Python tests andexpectedblockedoffline verification,thenfailed
secret scan5generic-api-key findings. Onlyskip:Vinceglassnegative-test
approachalreadyobstructed; notglassproof. Preserved rawcore receipt/report.
Redactedscanner metadata only showed5toolInputs values inrealistic-humans
receipt,all SHA256 digests ofMPFBfiles with"keys"inthefilename. Independently
hashed eachcachedfile; all5match exactreceipt. Neverreadcredentialvalues.

StoppedONLYownqueuedfullgroup77542(exec88467 terminal143) beforeguard/test
edit. Newexceptionextendsgeneric-api-keywithAND exactreceiptpath plus5exact
anchoreddigests,notallSHAvalues,notpath-only,notruledisable. Officialconfig
[documents AND criteria and inherited rule attributes](https://github.com/gitleaks/gitleaks#configuration).
Qualifiedred:1failure(knownhashreceipt),1pass(otherkeyblocked). Greenall17
secretguardtests0skip; confirms samehashesoutsidepath blocked,othergeneric
valuesinreceipt blocked. Worktree --allscanner19018 terminal0,198.99MB,
no leaks found. Rufftargetcheck/formatpass. No source/assetreceiptmutation;
renderingmanifest remainsf1f07b69. Aggregateinputsnapshot mustregenerate
with53changedcode/test/asset/configfiles. Independentreviewrequested.

Independentreview foundno requiredissue inexactdigest/pathallowlist; real
worktreescanner alreadyterminal0 and all17guardtests pass0skip. Required
core/full nowexec41419,queued,snapshot53changedfiles+runtimef1manifest.

Crowd captureexec69016 terminal1:helper attemptedprototypehook butrenderer
usesinstance render; PNGundefined causedsplitfailure,notruntimefailure.
Preservedrawfailedreportin.runtime/crowd-capture-failed-prototype.json.
Correctedindependentartifacthelper toPlaywrightcanvas.screenshot afterexisting
fixtureframes. Exec58383 nowqueued. Two readinessframesnotbenchmark; camera
metadata links hashedfixturecrowdStage(count>1). No production/harnesssource
mutation and no renderproof invalidation. Keepthese failures distinctfrom
productacceptance,andinspectactualcrowdPNGs beforepassclaim.


### Required core passed

Exec41419 sequentialdriver recorded core_exit=0. Actualrequired
`REDIS_URL=redis://127.0.0.1:51195/0 pnpm run verify` passed; rawreceipt
copydata/reports/character-fidelity-core-517.json statuspassed,all11tasks
passed. Console125tooling;3653/3654previewwith1documentedVinceglassnegative
skip;923server0skip;76desktop0skip;buildsuccess;Ruffcheck/format;Python
145tests(after2newguardtests);offlinedemoanditsrequiredverifyexit2(domain
blockedexpectedbyprofile);worktree199.22MBno leaks. Fullstillqueued,notpass.
Rendering/sourceinputsf1manifestand53changedinputsnapshot remainunchanged.
SeparatecrowdPNGexec58383 queuedaheadoffullbehindotherbrowserwork.
No commit/PRyet.


Crowdexec58383 terminal0,rawreportdata/reports/character-fidelity-crowds-517.json
statuspassed,unchangedruntimef1manifest,selfscript541a495e0cc76eef0109a2a82fffa3b739b5f43b85d53045452c51ebb6ac51c9.
All4real8/24Morgan/ImaniPNGs inspected:figures/shadows/renderedgridvisible,
no blankcaptures. Script uses Playwrightcanvas.screenshotafterexistingfixture
render,2readinessframes,no timingclaim,townocclusionexplicitlyoutside scope.
Total28savedreviewPNGfiles:12nativefixtures,4Studio/peer,8M1,4crowds.
Fullgate nowrunning preview;no fullpassyet.

Fullprofile dependency audit,repeatcoretasks,worktree/historysecrets,security
browser,andreflections passed. All13experiencejourneyspassed; exactrawreport
copiedunchanged todata/reports/character-fidelity-full-experience-517.json
beforelaterfulltasks. Sharedfull-rendering5modesnowrunning,IPICscreeningstill
notrun. Fullaggregate remainspending. Independentevidencereview verifiedall28
PNGhashes/sizes,crowdhelperhash+runtimeprovenance,andfailed14to24negative
control,norequiredissues. Noedits/heavytests byreviewer.

All24sharedjourneys passed acrossdevelopment,development-world,development-
publish,required,andcreator;rawreportstatuspassed copiedunchangedto
data/reports/character-fidelity-full-shared-517.json. Character-studio-worlds
andcharacter-studio-shared included. FinalfulltaskIPICscreeningnowrunning;
noaggregatepassclaimuntilterminaland53fileinputfreezecheck.


### Required full passed; delivery preparation

Sequentialdriver41419 terminal0:core_exit0,full_exit0,input_exit0. Required
`REDIS_URL=redis://127.0.0.1:51195/0 pnpm run verify full` passedall18tasks.
Fullincludesdependency audit,125tooling,3653preview+1Vincenegativetestskip,
923mandatoryRedisserver,76desktop,build,Ruffcheck/format452files,145Python,
syntheticdemoandexpectedverifyexit2,worktree/historysecretchecks,security
browser,reflections,13experience,24sharedall5modes,and16IPICchecks. Rawfull
receiptcopiedbydriverunchanged;IPICrawreportand53fileverificationinputmanifest
nowcopiedunchangedtodata/reports/character-fidelity-{ipic-screening,verification-inputs}-517.json.
FinalunchangedinputcheckpassedatHEAD225acfc9+runtimef1manifest;53changed
code/test/asset/configfiles unchanged. Source/artifacts reviewandfirstsigned
commit/push/draftPRnext. Existingdevice/mobilebudget/native/liveauth/human
gaps,and3newlyobservedexistingIPICfrontfailures,remainexplicit. Goalnotclaimed
complete;worktreekept.

Finalproject:check againstprimarylive register exits1 for41repository-wide
gaps(missing/orphanedothercheckouts etc). Own517branch/worktree recognized,
activeclaimvalid; noownownershipgap. No cleanup ofother sessions. Exactsource
andall28artifacthashes verified; genericexperience/sharedreports restoredtoHEAD
after savingactualtask-specific fullreports. Deliverypreparation isauthorized.

Firstcommit attempt blockedbyinstalledprecommit scanner5digest findings;
no commitcreated. Directworktree-config stagedscan returned0findings. Owning
seam:sharedhook deliberatelyusesinstalledchecker/configcopies incommonGit
river-oaks-hooks; itsconfigurationwasstale. Confirmedall6installedguard/driver
executablesbyte-identicaltotheverifiedcurrent sources(includingrenderedNode
path),thenusednormal `sh scripts/install-hooks.sh` torefreshmanagedcopies.
Refguardretained;nohooks override/bypass,noprimarysource edits. Onlyconfig
refreshneeded. Source53inputs remainunchanged;retry ordinarysignedcommit
withinstalledprecommitguard active.


### Signed delivery and issue handoff

Implementationcommit00a74a7c8f38c424d6baa4d2f85be4e2149e76b5 signedand
verifiedwithGitSSHsigning; prohibitedattributioncheckempty. All53committed
blobs matchpassedverificationinputs,andcommittedruntimehashisf1f07b69... .
Featurepushsucceeded;RESTcreateddraftPR545atthat exacthead.

- #517: https://github.com/BunsDev/river-oaks/issues/517#issuecomment-6257106326 (comment 6257106326)
- #441: https://github.com/BunsDev/river-oaks/issues/441#issuecomment-6257106505 (comment 6257106505)
- #442: https://github.com/BunsDev/river-oaks/issues/442#issuecomment-6257106716 (comment 6257106716)
- #444: https://github.com/BunsDev/river-oaks/issues/444#issuecomment-6257106892 (comment 6257106892)

GitHub reportedmergeable_state dirty against origin/main5ce4e76(65commits
aheadoftestedbase). Read-onlymerge-treewithnormalcustomregisterdriver
mergedcleanly; portabledriver-disabled simulationconfirmedonlyconflictwas
docs/project-management/tasks.json. RemovedONLYbranchclaimmirror byrestoring
thatfiletobase225acfc9;primaryliveclaim remainsauthoritativeandnowrecords
PR545/all4handoffURLs. No upstreamproductioncode imported,no runtime/test/
asset changes,andall53passedinputhashesremainmatched. This removesregistry
churnfromeffectivePRdiffandkeepsotherprimaryliveentries untouched.

Finalmetadata/docsreceiptcommitstillneeded;verifyportablemergetreeand
GitHubdrafthead/CIafterpush. HostedCIandup-to-date-mainlandingareseparate
mergegates. Userauthorizednodemerge/deploy/retirement;goalstillnotclaimed
completebecausemobile/devicebudgets andexplicitacceptancegaps remain.
