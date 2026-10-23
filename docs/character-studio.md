# Character Studio architecture decision (#440)

Status: contract increment #457 is on main, and so are the editor, rendering and
persistence stack (#461, #462, #464), #441's guided creation (through #496),
human-only characters, Jevica-only invited office access and the expanded Studio.
#484 carries the remaining #441 tailoring fixes. Release acceptance remains
subject to the verification and device gates below.

## Decision and evidence
Extend the authored character system with constrained modular customization.
Keep Three.js/Vite, existing human rigs and authored human clothing,
server-authoritative appearance, and existing photo mode. Do not introduce a
vendor or arbitrary mesh ingestion into the playable path.

`shared-appearances.js` already maps character/style/form to stable appearance
IDs. `avatars.js` loads the base rig, `romance-look.js` applies the authored look,
and `avatar-skeletons.js` shares matching
skeletons within each clone. `player-avatar.js` now resolves the versioned
contract before loading the same rig and look. Retired beast appearance IDs migrate to their corresponding human look when saved records are read.
`server/avatar-preferences.js` stores account appearance/movement versions;
`server/redis-room.js` reconciles account preferences on join and heartbeat.
These remain authoritative. The owner-scoped character store now persists private
drafts, immutable published revisions and selected account state; see the transport
and migration details below.

The Deep Research report has not been completed or supplied. On 2026-10-18 the
only Character Studio research artifact on this machine was its prompt,
`~/Downloads/typesafe-place-character-studio-deep-research-prompt.md` (SHA-256
`4a4334e4…`, 2026-10-11; a byte-identical copy beside it). The six local
`deep-research-report*` files cover other subjects: A2A infrastructure, prime gaps,
virtual workplace agents, Modex decomposition, a VTuber avatar and Astra. No
conclusion here is attributed to a report. Existing code and asset receipts are
the evidence; the prompt's questions are reconciled against them below.

| Approach | Current evidence | Decision |
| --- | --- | --- |
| Authored modular controls | Shipped human rigs, authored garments and tests exist | Go, expose combinations after compatibility verification |
| AI suggestions selecting approved parameters | Can be validated by the same contract, but no evaluated suggestion provider | Defer; optional, no provider needed for creation |
| Arbitrary generated meshes | No proven rig fitting, garment compatibility, licensing or cleanup pipeline | No-go for playable MVP; separate explicitly authorized pilot |

No paid calls, model downloads or production writes are required or performed.

### The research prompt's questions, against the evidence available

| Prompt section | Answered by code and assets here | Open (needs the report, a vendor trial or a product decision) |
| --- | --- | --- |
| 1. Project baseline | Yes. Three.js/Vite client, three skinned base rigs, procedural beast overlays, the appearance catalog, server-confirmed appearance, file map below. | Target devices, audience and crowd size remain planning assumptions. |
| 2. Player experience | Partly. #441's staged editor plan reuses existing tokens, focus and reduced-motion patterns. | Natural-language and reference-image routes; usability evidence. |
| 3. Approach comparison | Partly: the go/defer/no-go table above, from rig, garment and licensing evidence in the repository. | Current vendor capabilities, pricing and terms (Meshy, Tripo, MetaHuman and others) were not researched. |
| 4. Production pipeline | Partly. Pinned rig bytes and receipts; procedural overlays tied to the catalog version. | Cleanup, retopology, auto-rigging and facial rigs for any generated input. |
| 5. Identity and editability | Yes, for v1: the versioned owner-scoped definition, immutable revisions planned for #443, alias migration on read, appearance separate from capabilities. | Face and body parameters arrive with #442's compatibility catalog. |
| 6. Playable proof | Partly. Human and fox rigs load through the contract; rendered baseline and forms and movement journeys pass. | The full body-by-outfit-by-animation matrix, crowd and device budgets (#442, #444). |
| 7. Integration architecture | Yes, for the authored path: no jobs or provider adapters are needed; publication is #443. | Async jobs, retries and charge safety only if a generation pilot is authorized. |
| 8. Rights and privacy | The authored path uses repository-owned and CC0 sources with receipts. | Generated-output, likeness and provider-data terms. |
| 9. Cost and risk | Authored path: no per-character operating cost. | Per-character generation cost at 100, 1,000 and 10,000 a month. |
| 10. First playable path | Yes: the delivery order below (#440–#444). | Effort calibration to a named team. |

**Vendor dependence: none for the playable MVP.** Every v1 path runs on shipped,
pinned assets. A generation pilot would need its own authorization, its own
adapter behind the contract (provenance `generated`, currently rejected), and the
open rows above answered first.

## Contract and migration
`preview/src/character-definition.js` is DOM-free ESM shared by Node and client.
A definition has `schemaVersion:1`, authenticated `ownerId`, nonnegative safe
integer `revision`, canonical `appearanceId`, rig, human form, parameters,
palette, hair, outfit, attachments, pinned assets and authored provenance.
Revision zero represents a migrated base. Publication allocates revisions on
the server; passing structural validation does not establish freshness or ownership
of a stored revision. The endpoint must supply ownerId from authentication.

V1 supports the existing authored bundles only: empty parameters/attachments,
`authored` palette/hair, outfit equal to the canonical appearance ID. This is a
baseline, not an assertion that customization is finished. Future controls must
extend the compatibility catalog and validator together. Reject unknown fields,
unsupported versions, mismatched rig/form/assets, foreign owners, URLs, arbitrary
parameters and client privilege fields. Return an independent canonical copy.

`character-assets.js` pins actual base GLB hashes and sizes and source receipt
paths. Procedural overlays are tied to the catalog version; a later content build
must version and pin their dependencies too. Current hashes identify runtime bytes,
not a claim that every historical source receipt hash has been refreshed.

On old account/checkpoint reads, `migrateCharacterAppearance` resolves retired
aliases and permission-safe defaults through existing policy. Strict publication
rejects aliases and malformed data. Never rewrite or delete old IDs. The contract-only increment preserved old account/checkpoint schemas. The #443
implementation adds dual reads, validated drafts, immutable revisions, CAS
conflicts and rollback tests in memory and Redis, with explicit codec floors below.

Appearance cannot grant flight, speed, admin access or companion privileges.
Continue using server confirmed appearance/movement, Jevica ownership and existing
2-second appearance cooldown. Definition ownership never replaces those checks.

## Local editor increment (#441)

The People controls open a native modal with an isolated Three.js preview.
Definitions remain staged: keep a draft in the current tab, discard back to the
opening draft, or store up to eight owner-scoped favorites on this device.
Unavailable device storage falls back to the visit. Undo/redo retains at most
50 edits; comparison, curated randomization, keyboard controls, touch, camera
framing, two lights and animated poses all use the same validated definition.
Reduced motion freezes the preview and disables turntable/animated poses.

The guided start numbers the creation steps: choose a character, choose a form,
add color. Character, form, wardrobe and color choices are native radio groups,
so each group is one tab stop with arrow keys, the same as the town picker. A
summary names the character and lists only the changes the validated catalog
supports (`character-studio-guide.js`). Wardrobe appears only for characters with
several outfits. Characters without color support show the reason in place of the
swatches. A polite live region announces undo, redo, Surprise me, favorites and
before/after. Ctrl/Cmd+Z works while a choice has focus. Remix varies only the
current character's validated forms, wardrobes and colors. Surprise me picks any
permitted look. Both always stage a look different from the current one.
Desktop Studio uses the viewport with a 12 px margin and multiple control columns.
Phones use the full safe viewport and one vertical workspace scroll area.
View labels stay in the accessibility tree.

V2 adds allowlisted dress and hair colors for Sable. Other looks
retain authored colors with explicit compatibility feedback. V1 remains readable.
Colors touch tagged, avatar-owned materials only; teardown restores their original
values and disposes the preview. Late loads are discarded, including after close,
and a stale failed load cannot drop a newer selection. The town renderer pauses
drawing behind the Studio while authoritative world/network updates continue.
The Studio editor stages local edits and offers private Save draft and Wear in town actions. Server publication and selection replicate validated definitions; the integrated client applies their owned materials to local and peer rigs. The two-account save/wear journey and actual peer material checks pass locally; the complete visual, device and human acceptance matrix remains open.

### Graphics tiers are viewer-local (#443)
A character's identity is its published definition and nothing else. Graphics
quality (Auto, Sharpest, Smoothest) is a per-viewer, per-device choice kept in
local storage. It changes how a viewer renders, never what the server selects or
replicates. No command, draft or snapshot carries quality, tier, LOD, scale or
occlusion, and the strict validator refuses such fields in a definition. A
viewer-local material tier (such as #517's `low`/`standard`/`high`) must follow
the same rule: derive it from the viewer's graphics state, keep the definition
and its pinned assets unchanged, and never send it.

`preview/e2e/character-studio-tiers.js` (shared `required` mode) proves this on
desktop Chromium: a Sharpest owner and a Smoothest peer each publish a look and
render the other's exact authoritative definition and outfit materials; cycling
the peer through every tier sends no selection and leaves both selection
versions unchanged; tier, LOD, asset URL, asset swap and foreign-owner drafts are
refused over HTTP while an untampered control save succeeds; a socket selection
with a `quality` field is refused while the untampered command is accepted; and
the peer's tier survives reconnect with identity intact.

## Components and delivery order
1. #440: strict baseline contract, migration and actual human rig fixtures;
   measure and inspect rendered baseline, then review this decision in a PR.
2. #441: People opens an in-world dialog, isolated preview scene, staged definition,
   bounded undo/redo, cancel, curated randomize/favorites and before/after. Publish
   only after #443 exists. Reuse tokens, input/focus and reduced-motion patterns.
3. #442: allowlisted material slots and rig-compatible hair/wardrobe/attachments,
   receipt/license validation, deterministic cameras and dedicated native 4K
   render target. Preserve skeleton sharing and disposal fences.
4. #443: account-owned drafts and published revisions, authenticated endpoints,
   optimistic revision checks, stable replication refs and safe load fallback.
5. #444: full desktop/touch/reduced-motion/failure/two-player matrices, pinned GPU
   goldens, measured device budgets, usability and release/rollback decision.

## Handoff to #441–#443

The contract is the seam the next increments build on. Each must keep
`validateCharacterDefinition` as the single gate for anything it accepts.

- **#441 (editor):** stage edits as candidate definitions built with
  `characterDefinitionFor`, and check every staged change with
  `validateCharacterDefinition` before preview. Undo and redo hold definitions,
  never raw parameters. With v1, only authored looks (appearance, form) are valid
  choices; finer controls arrive through #442's catalog.
- **#442 (assets and rendering):** each new control raises `CHARACTER_SCHEMA_VERSION`
  (or adds a v2 branch). It extends the allowlist and the validator together, pins any
  new asset in `character-assets.js` with its receipt, and adds an old-revision
  migration test. Untested rig and outfit combinations stay unavailable. Native 4K
  uses a dedicated render target; photo mode's 2048 px cap cannot prove it.
- **#443 (persistence):** the endpoint takes `ownerId` from authentication only.
  It stores the canonical definition that `validateCharacterDefinition` returns and
  allocates revisions on the server (compare-and-swap). It reads legacy accounts
  through `migrateCharacterAppearance`, and must pass in both the memory and Redis rooms.
  Appearance never grants flight, speed, admin or companion privileges.

Codex's drafts #461 (editor), #462 (render) and #464 (persistence) are stacked on
this PR, branched from its earlier head `b6ef443e`. The base gained a plain merge of
`main` here, not a rewrite, so each can merge the new head forward.

## Supported scope and quality gates
Current direction (2026-10-18): human characters only, with ultra-realistic human
anatomy, skin, hair and clothing as the art target. iOS and macOS are the release
platforms. Beast forms, animal anatomy and quadruped locomotion are retired.
Old saved appearance IDs migrate to their matching human character/style; new
publications must use canonical human definitions. Historical evidence below may
refer to retired forms and does not establish current visual acceptance.

Baseline families: existing Jevica, man-casual and man-tailored base rigs, human
and human forms. First vertical fixture: Sable human.
No arbitrary anatomy, uploads, free-form geometry, physical cloth or face morphs
are exposed until supported. Long hair, dress, wings and armor are separate
compatibility cases; untested combinations must remain unavailable.

Interactive target: native resolution appropriate to a named device tier, 60 Hz
frame budget (16.7 ms) on the approved desktop and 30 Hz (33.3 ms) on the approved
phone. These are proposed release gates, not measured results. Capture p50/p95
frame times after warmup for close-up and representative crowds; measure geometry,
textures, draw calls and downloads before fixing per-device asset budgets.

Hero target: dedicated 3840×2160 framebuffer, deterministic camera/lighting/pose,
linear lighting and sRGB output; verify PNG dimensions and rendering resolution.
The existing photo mode caps the longest edge at 2048 and cannot prove native 4K.
Pin browser, OS/GPU, pixel ratio and color settings before approving a golden;
set image-error tolerance from repeated captures before accepting changes.

Visual acceptance requires no missing textures, major intersections, detached
attachments or broken skinning in idle/walk/run/sit/emote.
Node rig tests retain actual geometry, skin weights and skeletons but omit image
decoding, so they establish neither texture nor rendered visual acceptance.
Human keyboard/VoiceOver review and novice usability remain explicit human gates.

## Usability trial protocol (#444, not yet run)

Use the verified local two-account fixture, a fresh account and no saved favorites.
Recruit five people unfamiliar with the Studio; record desktop or touch input and
any assistive technology separately. Do not count the implementer or browser
automation as a novice session. Explain the goal, not the controls, and do not coach
until a participant asks for help or is stuck for 60 seconds. Record that assistance.

Give each participant the same tasks:

1. Open Studio from People, choose a character and make a variation they like.
2. Undo a change, compare with the starting look, and save the draft.
3. Wear it in town and confirm that a second player sees the same look.
4. Reconnect, change the look again, and wear the new version.
5. Recover an unsaved edit after a simulated failed save, then create a second
   variation using any creative tools they discover.

Record elapsed time from opening People to the first successful Wear, completion
of each task, help requests, mistaken actions, recovery attempts, and whether the
participant can explain Save draft versus Wear in town. Ask for satisfaction on a
1–5 scale and whether they would make another look. Store anonymous participant
codes and observations, not account identifiers, reference images or recordings
without consent. Record the exact commit, browser/device and fixture configuration.

Set these criteria before the first session: at least four of five participants
complete tasks 1–4 without coaching within five minutes to first Wear; all five
recover their edit without data loss; at least four distinguish private save from
shared wear and create a second distinct variation without help; median satisfaction
is at least 4/5. Any identity leak, permission bypass or lost saved work fails the
gate regardless of totals. A failed criterion requires a documented fix and a new
trial with unfamiliar participants; do not retrospectively lower the threshold.

These are preregistered trial criteria, not results or device approval. Physical
touch, keyboard-only and VoiceOver acceptance remain separate recorded sessions.
The trial cannot establish the visual/animation matrix or crowd/GPU budgets above.

## Verification evidence

Historical receipts below describe their recorded revisions. Beast/fox captures and
former form controls are retired; they do not describe the current human-only catalog.
See the task ledger for exact commands/results. Baseline fixtures exercise the
actual loader and procedural look and dispose them afterwards. Existing beast
form regressions cover stable IDs and movement. Core, browser, Redis, hosted CI,
performance, rendered inspection and human acceptance are separate gates.

Base asset inventory measured directly from shipped GLB JSON on this branch:

| Rig | Download bytes | Position vertices | Triangles | Primitives | Textures |
| --- | ---: | ---: | ---: | ---: | ---: |
| jevica | 5,779,116 | 70,360 | 108,636 | 7 | 7 |
| man-casual | 2,024,532 | 15,966 | 27,106 | 5 | 7 |
| man-tailored | 1,848,936 | 20,327 | 35,786 | 5 | 5 |

These are base-file totals across mesh primitives, not final procedural costume
geometry, decoded texture memory, renderer calls, crowds or frame-time results.
Each file has one skin. The first Sable fixtures use the Jevica base.

Rendered baseline (2026-10-15, HeadlessChrome 156.0.8078.4 on macOS,
Metal launch path, 1440×1000 canvas):

| Fixture | Frame p50 / p95 ms | World draw calls | World triangles |
| --- | --- | ---: | ---: |
| Sable human | 16.7 / 33.3 | 1547 | 5,275,904 |
| Sable fox | 16.7 / 33.4 | 1649 | 5,540,490 |

Re-measured on current `main` (2026-10-18, after merging `c17f9f1c`, same
browser and canvas): Sable human 16.7 / 33.3 ms with 1,594 draw calls and 5,335,772
triangles; Sable fox 16.7 / 33.4 ms with 1,696 calls and 5,600,358 triangles.
`player-forms` 139 checks and `beast-movement` 17 passed. Both new captures were
inspected and match the earlier ones.

Measured 60 frame intervals per look. Scene statistics include the whole active
world, and varying residents, so differences are not isolated avatar costs.
These short samples do not pass the proposed 16.7 ms p95 desktop gate and are
not a crowd or phone benchmark. Browser/GPU is not yet a pinned golden target.
`output/playwright/character-contract-human.png` and `character-contract-beast.png`
were inspected: both authored forms render with head, hair, dress, bag and shoes
visible; the fox has its head and tail. No gross missing geometry or textures
were visible in the captured standing view. This does not establish the full pose,
clipping, lighting or high-fidelity acceptance matrix from #442.

## Native portrait and garment increment (#442)

Create 4K portrait renders the displayed validated definition into a native
3840×2160 target, independent of the viewport and DPR. Before/after changes
invalidate exports just like palette and character changes. Only one capture can
be in flight, including across edits and closing/reopening. Stale completions
cannot attach downloads; object URLs and owned hero resources are released.
Unsupported target sizes or incomplete framebuffers fail visibly without upscaling.

`garden-front-v1` uses a fresh neutral rig at time zero, a 30-degree perspective
camera at (0, 1.08, 3.8) looking at (0, 0.9, 0), and the garden daylight key,
hemisphere fill and rim. A 2048-pixel key shadow map grounds the model. The native
4-sample half-float target retains linear HDR; an OutputPass applies ACES exposure
1.1 and sRGB exactly once into an RGBA8 readback target. PNG rows are flipped
without resampling. Existing photo mode remains available independently.

Sable's skirt now uses the body's existing pelvis/thigh skeleton and bind space.
The waist stays at the pelvis and the hem follows the legs, preserving the
standing surface, materials and cleanup. The later seated corrective adds720
triangles through exact subdivision, with no additional draw calls. Actual human/fox rig fixtures probe covered upper
thighs through opposing strides and translated/rotated/scaled parents. This fixes
the observed rigid-skirt intersection; it does not establish every animation,
wardrobe or camera angle. The intentional hem slit is excluded from coverage probes.

Reviewed native4K regression references now cover the neutral human and fox
portraits on the pinned M3 Max/Chromium156 renderer (see below). They preserve the
current authored rendering; final high-fidelity art approval, named release-device
targets, full animation/wardrobe compatibility, measured crowd budgets and complete
procedural distribution provenance remain open. Shared custom colors are covered
by the later two-account journey. Keep unsupported shape, skin, attachment and
asset combinations unavailable.

## Pinned hero regression references (#442)

`node scripts/character-hero-goldens.mjs --check preview/e2e/goldens/character-hero`
compares fresh native3840×2160 human/fox exports with the reviewed PNGs and manifest
in that directory. It uses the production hero/portrait path and exact canonical
rose/espresso definitions. Three captures of each reference had zero pixel error;
a fresh browser process also matched both references exactly.

Pins include the actual launched Chromium executable SHA/version, Darwin kernel,
architecture, unmasked GPU/vendor, WebGL/Three versions, DPR1, dimensions, sample
count, garden-front-v1, ACES exposure1.1 and sRGB output. Missing GPU identity or a
different pin exits2 (incompatible), never a pass. Image/integrity errors exit1.
All references must pass maximum channel error2/255, mean error.01/255 and changed
pixel fraction.001. The maximum catches localized defects that a background-heavy
mean could hide. Tests exercise broad color drift, localized missing geometry,
alpha/buffer/dimension errors, missing and malformed pins, native PNG integrity
and canonical identity.

`--record <new-directory>` creates an unreviewed candidate with three captures per
form and repeat comparisons; it cannot overwrite an existing directory. Checking
rejects candidates until rendered inspection and its limitations are recorded as
an explicit reviewed reference. Checks never replace baseline bytes or thresholds.
Sixty source/fixture/dependency/asset entries and both PNGs are hashed. Read the
reference README for promotion steps and exact environment. Reports/current images
are kept in fresh `.runtime/character-studio/hero-goldens/` directories.

The review accepts these as a regression reference for neutral framing, identity,
colors and currently visible attachments. Faceted garment trim/hem and stylized
materials remain; these are not final art-quality approval, full wardrobe/animation
coverage, approved release-device budgets or human acceptance. Core validates the
reference files and comparator; pixel matching requires the separate pinned host
command. A different CI GPU must report incompatibility rather than silently skip
or regenerate. The Studio UI/download journey remains `pnpm run test:experience
character-portrait`.

## Shipped asset compatibility audit (#442)

`character-compatibility.js` records the authoritative appearance-to-rig/form/outfit
mapping, exact 53-bone MakeHuman game family and supported color control boundary.
Only Sable human/fox expose curated colors. Independent morphs, hair meshes and
attachments remain unavailable; original bundles keep their existing behavior and
permission checks. Definition v1/v2 shapes are unchanged.

`node scripts/character-assets-audit.mjs` audits the three pinned shipped base GLBs.
Core tooling tests run the same audit. It verifies actual hashes/sizes against CC0
source receipts, embedded buffer bounds, exact bones/shared skin, finite invertible
bind and node transforms, indexed triangles, finite bounded positions and morphs,
normalized weights/joint references, embedded WebP headers/dimensions and material
texture references. Malformed real-asset fixtures exercise each boundary. This is
a build-time gate for the shipped subset, not a general glTF upload validator.

| Base rig | Texture images | RGBA8 base-level estimate | Largest image |
| --- | ---: | ---: | --- |
| jevica | 7 | 31 MiB | 2048 × 2048 |
| man-casual | 7 | 37 MiB | 2048 × 2048 |
| man-tailored | 5 | 29 MiB | 2048 × 2048 |

These are per-file decoded-format estimates, excluding mipmaps, runtime-generated
maps, sharing, shadows and framebuffer allocations. They are not measured GPU
allocation or approved budgets. Embedded header checks do not decode images;
rendered/browser checks remain separate. Base source receipts identify MakeHuman
system/face assets as CC0-1.0. Procedural overlays are authored repository code;
complete dependency pinning/distribution provenance remains open and no additional
license is inferred from the base files. The `.5m` position-morph and 4096 texture
limits are integrity envelopes for this catalog, not interactive design controls
or device performance promises.


### Provenance of each exposed look (2026-10-18)

The human-only catalog has 11 looks, built on three pinned rigs. `CHARACTER_ASSETS`
in `character-assets.js` pins each rig's bytes and SHA-256 and points to its source
receipt. `character-definition.test.js` refuses a look whose rig is not pinned,
and `scripts/tests/character-assets-audit.test.js` fails a changed hash or an
unlicensed or mismatched receipt.

| Look | Rig (SHA-256 prefix) | Generator | License (receipt) | Source assets in the rig |
| --- | --- | --- | --- | --- |
| jevica, sable-human, woman-tailored, lyra-human, forest-aristocrat-feminine | jevica (`722b96e2fd77`) | MPFB 2.0.17 / Blender 4.5.3 LTS | CC0-1.0 (`jevica.sources.json`) | skin young_asian_female, hair long01, eyes high-poly, eyelashes01, eyebrow001; original fitted shell |
| rowan-human | man-tailored (`ae3834fbc9d9`) | MPFB 2.0.17 / Blender 5.2.1 LTS | CC0-1.0 (`sources.json`) | middleage_african_male, male_elegantsuit01, short04, shoes03 |
| man-tailored, man-workwear, kai-explorer, kai-noir, forest-aristocrat | man-casual (`e7ac712585ba`) | MPFB 2.0.17 / Blender 5.2.1 LTS | CC0-1.0 (`sources.json`) | young_caucasian_male, male_casualsuit02, short01, shoes01 |

The source assets are MakeHuman's CC0 system assets. Their credits are in
`preview/public/assets/characters/README.md` and `LICENSE-CC0.md`. MPFB itself is a
GPL build tool and is not shipped.

Everything else a look wears is authored in this repository: no third-party
garment, hair or texture asset is loaded for these looks.

- **Jevica:** `player-costume.js` → `jevica-costume.js`, with `jevica-drape.js`,
  `jevica-embroidery.js`, `bodice-fitting.js` and `riding-clothes.js`.
- **The other ten:** `romance-look.js` → `reference-archetypes.js`.
- **Baked deformation data** carries its own receipt, which hashes the authored
  inputs, the rig and the generator, and states its provenance:

  | Bake receipt | Looks |
  | --- | --- |
  | `coat-tail-morph-receipt.json` | man-tailored, man-workwear, kai-noir |
  | `lyra-drape-morph-receipt.json` | lyra-human |
  | `silvan-drape-morph-receipt.json` | forest-aristocrat, forest-aristocrat-feminine |
  | `skirt-seat-morph-receipt.json` | sable-human |
  | `vesper-skirt-morph-receipt.json` | woman-tailored |

This covers the shipped catalog's assets and their licenses. It doesn't cover
npm dependency licenses (three.js and others), which are pinned in
`pnpm-lock.yaml` and reviewed by the dependency-review check, not here.

### Reproducing garment receipts

The five offline garment receipts use schema version 2. They pin the shipped
rig and license records, the authored generator/pose/geometry sources (including
the audited local avatar import closure), and the generated output. The required
input lists live in `scripts/lib/bake-provenance.mjs`; a receipt cannot silently
drop an input or select an arbitrary file to read.

The bake toolchain is the checkout's installed Three.js package, including its
loaders and utilities. The receipt records its exact version and a SHA-256 of
sorted package-relative file names and content digests. It covers the published
package tree; root `node_modules` and macOS `.DS_Store` metadata are excluded.
pnpm's package-root symlink is supported, but internal package symlinks and
nested installations that shadow the audited package are refused. The installed
version must equal the exact `package.json` declaration. New Three.js runtime,
optional or peer dependencies require a fresh audit before rebaking.

An unrelated Electron, Playwright, server-library or lockfile change therefore
does not require garment regeneration. A Three.js implementation change, even
at the same version, does. This is a generation-input check, not a replacement
for frozen dependency installs, dependency review, package audits or rendered
acceptance. Node built-ins come from the repository's supported Node runtime;
receipts do not pin a machine path, timestamp or Node patch version.

From the repository root, install with `pnpm install --frozen-lockfile`, then
serialize the existing generators through the local heavy-work queue:

```sh
node scripts/browser-lock.mjs 'garment bake verification' -- sh -eu -c '
  for bake in bake-skirt-seat-morph bake-vesper-skirt bake-lyra-drapes bake-silvan-drapes bake-coat-tails
  do
    node "scripts/$bake.mjs" --check
  done
'
```

`--check` recomputes the fit and receipt without writing. After an intentional
input change, review the source/import and package audit, preserve the old output
hashes, and use `--write` instead. Each generator overwrites its own data/receipt
pair; the sequence stops on failure and is not an atomic multi-file transaction.
Inspect partial changes before resuming. Never repair a digest by hand. Follow
regeneration with `--check` and the garment regression suites. The existing
finite-data, weight, topology, contact and deformation assertions still apply.

Old version-1 receipts are rejected by the new verifier. Migrate by running the
real generators, not by changing a version field. For a provenance-only migration,
all five generated morph-data files must remain byte-identical. To roll back,
revert the helper/caller changes and their receipts together; runtime garment data
and user state need no migration.

When integrating another character change such as #545, preserve its authored
source changes and regenerate receipts on the combined tree. Do not choose one
side's hashes to resolve a receipt conflict. Generated corrections are checked as
outputs, not treated as authored bake recipes. Any newly imported module/package
must be reviewed into the explicit input audit.

## Runtime pose diagnostics (#442, incomplete acceptance)

Run `pnpm run test:experience character-poses` to capture the canonical rose/espresso
Sable human and fox through idle, walk, run, sit and wave, plus fox prowl and lope.
The fixture moves the root while updating planted contacts, uses the runtime seat
height/hip offset and samples the actual visible skinned geometry and decoded
textures. It saves front, side and rear views for each of the 12 poses, plus two
seated overhead views. This is one phase per pose, not a whole animation-cycle test.

The automated checks establish finite geometry, decoded textures, active beast
locomotion and sampled front-garment clearance against the actual upper thighs.
They do **not** establish whole-body collision or visual acceptance. At render
head `7c6facc5`, the seated skirt exposed the central upper thighs in both forms.
That failure is retained as baseline evidence.

The seated corrective now subdivides each authored skirt triangle into four,
preserving its rest surface and UV seam. The 567-vertex, 960-triangle garment uses
the existing skeleton and material. Two relative position/normal morphs follow
left/right hip flexion independently, with a bilateral gate that leaves opposing
walking strides unchanged. Runtime work changes only two morph weights; contact
fitting and triangle constraints run offline.

Reproduce the pinned bake with `node scripts/bake-skirt-seat-morph.mjs --check`.
After an intentional source/rig change, inspect and regenerate with `--write`.
The adjacent source receipt hashes the rig, provenance file, authored geometry,
pose dependencies and generator. It reports deformation diagnostics, including
maximum edge stretch 3.346; this is not an approved cloth-quality threshold.

Focused regressions cover both forms, actual seated IK, symmetric bends through
90 degrees, asymmetric 30/90, 45/90 and 60/90 bends in both directions, transformed
roots, standing restoration, source immutability and disposal. The browser's
seated contact probe checks 1,006 front triangle center/edge samples per form:
zero penetrations and 18.4 mm minimum clearance in that pose. The original body-ray
counts remain diagnostics, not universal clipping metrics. Inspected seated
front/side/rear/overhead views show continuous lap fabric; the short hem/slit and
side torso cutout remain visible. Those authored details still need reference review.

Other wardrobes, wing/armor cases, continuous gait phases, pinned hero goldens,
crowd/device budgets and human review remain open. Prescribed asymmetric captures
inspect silhouette and normal blending separately from runtime pose integration.


## Authoritative drafts and publication (#443)

`server/character-store.js` implements the same state transitions for memory and
Redis. The HTTP boundary supplies the authenticated owner ID; the store module
does not infer authentication from an arbitrary caller argument. Draft definitions must be
canonical and have revision zero. Every mutation requires the expected account
version and a bounded request ID. Two editors cannot both write the same version.
Publishing allocates an immutable revision; rollback copies an earlier revision
into a new revision without discarding the private draft.

A matching request retry returns its original `appliedVersion`/`revision` together
with the **current** account state. Reusing its ID for different input fails.
After a receipt expires, its old expected version still prevents reapplication.
Records allow64 immutable revisions and64 recent receipts, at most256KiB each;
10,000 account slots include deletion tombstones. Capacity errors preserve existing
records. These are explicit store limits, not measured production capacity claims.

Trusted account deletion removes all definitions and receipts, including corrupt
private records, leaving only a hashed owner key and minimal tombstone. Stale
commands cannot recreate it. Tombstones require an explicit future lifecycle policy
before reclaiming account slots; silently expiring them would reopen retry races.

Both standalone and distributed servers expose `GET /api/character`,
`PUT /api/character/draft`, `POST /api/character/publish` and
`POST /api/character/rollback` through existing session, approval and ban checks.
Writes require exact Origin and CSRF authorization, JSON content type and a 16 KiB
limit. Drafts contain exactly `definition`, `expectedVersion` and `requestId`;
publication contains the version and request ID; rollback also contains `revision`.
Reads return the private draft/publication state and the current selected account
state, whose version is independent of draft/publication versions. The owner always comes from the session. Private no-store responses,
per-owner quotas (120 reads and30 writes per minute), strict query fields and
generic backend failures keep this boundary bounded. Conflicts return409; a retry
with identical content returns its original receipt and the current account state.

The account store is shared across world instances. Real HTTP/WebSocket tests
cover memory and isolated Redis, concurrent edits, retry, owner separation,
authorization, malformed/oversized input, write quotas and gateway replacement.
Drafts remain absent from peer snapshots and do not change the current appearance.

Publication and rollback create immutable revisions without equipping them. The
server transport journey covers save, publish, equip, peer snapshot, gateway
replacement/reconnect, edit and republish for both backends. It does not prove the
Studio UI or rendered peer journey; those are covered separately below. Peer-rendered
corrupt/missing revision fallback is covered by the receiving-snapshot journey
below; broader release acceptance remains open.


## Authoritative selection contract (#443)

The world accepts a `character` intent containing only an immutable revision
number. A trusted server caller supplies the matching canonical definition in
command context; client fields cannot supply it. Ownership, revision, catalog and
appearance permissions are revalidated. Custom and legacy appearance changes share
the same two-second cooldown, flight/ground and office rules. Selecting the same
immutable definition is a no-op; returning to the same authored base clears custom
state and still observes the cooldown. Beast movement and Jevica rights remain
server-owned.

Selected canonical definitions are defensive copies in peer snapshots and trusted
account preferences. They survive departure, room replacement and geography
migration. Account preference updates retain the selected definition when movement
changes; legacy selection clears it. Redis preserves canonical empty arrays during
preference saves. No private draft is copied into this selected state.

Checkpoint v12 requires the selected-definition map, validates owner/revision and
appearance consistency before restoration, and continues loading v1–v11 authored
looks. The v12 writer generation preempts older coordinators; old writers must not
write over or downgrade the new checkpoint. A feature rollback must retain the
v12 reader/writer; deploying a v11 writer over v12 state fails closed. Invalid selected checkpoint records
fail restoration without mutating the live room.

WebSocket custom selection uses `{type: 'character', revision, selection:
{expectedVersion, requestId}}`, plus the existing response-correlation `requestId`.
The selection ID is stable across retries and distinct from a socket's response
sequence. The server resolves only the authenticated owner's immutable revision.
Legacy appearance/movement commands can omit selection metadata; the server assigns
an operation ID and current expected version to preserve existing controls. New
clients can provide explicit metadata for conflict-aware legacy changes too.
The integrated browser journey covers corrupt and retired-catalog definition
fallback, plus missing-asset recovery, across the peer rendering path. This does
not establish every admission/world-transition or hosted acceptance condition.

### Atomic account selection store

The character store now holds selected account state in the same atomic record as
immutable revisions and the deletion tombstone. `initializeSelection` conditionally
imports a trusted legacy preference once; a custom definition must exactly match
an existing owner revision. `changeSelection` accepts an explicit character
revision, legacy appearance, or movement command with an expected selection
version and request ID. It resolves character data from storage, never from a
client-supplied definition. Movement changes retain the current selected look;
legacy appearance changes clear customization.

Selection versions and bounded retry receipts are separate from draft/publication
versions. Concurrent worlds conflict on the selection version, while a concurrent
private draft save and selection preserve both changes through whole-record CAS.
A repeated operation returns its original applied version plus current selection;
it never re-equips an older look. Deletion removes selection and receipts together
with private drafts and revisions, and tombstones prevent late initialization.

Persisted record schema v2 reads and upgrades v1 without altering existing draft
or publication versions. Accounts can have selected authored preferences before
their first draft (`version: 0`). Rollback must retain the v2 character-store codec
as well as the v12 world codec; an older character-store reader rejects v2 records.
The existing Redis hash key remains stable for migration.

### Durable room selection

Passing the character store to the Redis coordinator raises the writer generation by
one and enables room envelope 3: generation 13 over world checkpoint 12, and 14 over
checkpoint 13 since the garden campus leases (#509). The world checkpoint is unchanged by it. The coordinator
validates connection, session, permissions, flight, beast movement and the existing
per-room two-second appearance cooldown before persisting a bounded pending intent.
Preparation consumes the ordinary command budget but changes neither the selected
look nor its cooldown. Only an intent loaded from a previous fenced room commit
may execute the account CAS. A second fenced commit projects the confirmed account
selection, charges the cooldown when the look changes, removes the intent and
acknowledges the request.

A backend failure retains the old view and pending intent for retry. Gameplay
commands from that account wait while an intent is pending. Receipt lookup precedes
cooldown validation, so a lost acknowledgement or lease cannot re-equip an older
look. Unapplied intents recheck their originating connection, session and expiry;
already-applied receipts can finish after departure without recreating a player.
Conflicts, deletion and invalid records reject definitively. Evicted receipts fail
with a version conflict and preserve the latest selection. Stored account versions
prevent stale reads from regressing the room or its join response.

Pending intents and projected account versions each have a 64-entry bound; a
pending account has at most eight distinct reply attachments. Restore validates
canonical fingerprints, identities, timestamps, reply uniqueness and roster
membership. Region replacement waits for pending selections. An actual v12/v13
coordinator audit covers preemption, old-writer fencing, pending-intent recovery
and replacement restoration. Rollback after activation must retain the generation
14/envelope 3 coordinator (13 before #509), version 13 world codec (12 before #509) and version 2 character-store
codec; an older coordinator rejects the new envelope.

The running Redis gateway supplies the character store to this coordinator. Its
conditional legacy import reads default-room envelopes 1–3 and validates the
contained checkpoint before importing an authored preference. The standalone
memory transport uses the same account CAS, world preparation and confirmed
projection rules. It blocks competing commands while a write is uncertain and
recovers receipts before retrying; shutdown cannot cancel an issued account write.
A replacement server restores confirmed account state on join. Late memory reads
are fenced by world and connection identity, and stale callbacks cannot overwrite
a replacement world or a newer account selection.

Server transport tests cover authenticated two-account publication/equip, peer
snapshots, reconnect/replacement, edit/republish, rollback without implicit equip,
foreign ownership, protected appearance and beast rules, cooldown, explicit stale
versions and duplicate receipts. The integrated client and two-player journey now exercise version/request-ID
handling, save/conflict recovery, peer rendering and asset fallback. The production
account-deletion lifecycle hook is integrated with local fixture proof below;
hosted activation and remaining release acceptance still need proof.


### Studio account workflow and rendered identity

`character-account.js` captures the submitted definition and keeps operation IDs
and expected versions through save, publication and equip. A lost, timed-out or
malformed acknowledgement retains the same operation for receipt recovery. A
confirmed concurrent edit becomes an explicit conflict; checking the saved
account does not replace local edits. Loading its draft is a separate action.
Closing the Studio retains edits and an uncertain operation in this tab.

The footer distinguishes private saved state from the confirmed worn revision.
Wear in town saves if needed, publishes if needed, then requests authoritative
selection and checks the resulting account state. It cannot publish another
editor's newer draft or replay an old selection over a newer choice. The modal
stays open while the local avatar asset is replaced.

`character-selection-view.js` accepts only a canonical owned revision matching
the permitted appearance. Local and remote renderers apply palette/hair to their
independently owned material slots, including same-base revisions and late asset
loads. Malformed or foreign definitions use authored appearance. Vite and Vercel
forward the four exact account routes through existing authorization; the shared
browser fixture uses the real memory character store. Read-only development
material diagnostics inspect actual loaded colors for browser assertions.

The two-account browser journey passes save/wear, actual local/peer material
colors, reconnect, edit/republish, a lost save reply, concurrent-edit recovery, and
base replacement without closing Studio. Blocking the peer's initial GLB request
keeps an asset-independent presence marker visible; restoring the request replaces
it with the canonical avatar without reconnecting. Saved, peer, fallback and
recovery captures were inspected on the local Metal renderer. This is fixture
acceptance, not live WorkOS, physical device or human accessibility acceptance.

Idle memory account deletion now removes its peer projection without reconnect
grace. Redis deletion clears custom state and projected versions on heartbeat and
checkpoint rejoin, including lease-loss recovery. These are store/transport tests;
the production account-deletion lifecycle hook now has local integration proof
but still needs hosted acceptance. Current exact
test counts, completed full-profile receipt and later reopen verification belong
in the task ledger.


### Signed account deletion

The optional `POST /api/workos/events` route accepts WorkOS AuthKit `user.deleted`
events. Configure the environment-specific signing secret as server-only
`WORKOS_WEBHOOK_SECRET`; it is not the API key or cookie password. Without that
secret the route stays closed. Local development identity mode never enables it.
Deployment and provider configuration have not been performed.

The handler verifies the exact raw request body using the WorkOS signature header,
checks the millisecond timestamp within five minutes, and validates the event and
AuthKit user identifier before deletion. JSON bodies are limited to256KiB and
five seconds, with at most eight pending deliveries per process. It rejects query
parameters, unsupported content types and ambiguous signatures. See the
[WorkOS webhook contract](https://workos.com/docs/events/data-syncing/webhooks).
No event body, credentials or private account fields are logged.

An authenticated deletion first erases private character drafts, immutable
revisions and selection state into the existing character tombstone, then revokes
all local auth sessions for that user and requests disconnects from loaded worlds.
Redis gateways share the durable tombstone and auth namespace; other active room
leaders also consult session validity in their commit loop. This does not claim
erasure of unrelated profile, social or workplace data. Memory-town state remains
process-local, while the hosted Redis tombstone survives gateway replacement.

A successful response follows completed storage/session cleanup and successful
disconnect requests. Any storage error, thrown cleanup error or refused/pending
Redis kick returns generic503. Duplicate events repeat session/disconnect cleanup
even when the tombstone and session removals already exist. The tombstone rejects
future sign-ins and late sign-in, refresh, username lookup or desktop-exchange
responses. Do not remove it or restore pre-deletion records to resolve a retry.

Local verification covers signed raw-body tampering, stale/future signatures,
bounded input/concurrency, two-session revocation, another account remaining
intact, retry after cleanup failure, failed durable kick results, actual peer
disappearance, delayed auth races, and both production factory routes. Tests use
local provider adapters; existing SDK boundary suites independently exercise real
SDK JWT/JWKS verification. These do not establish live WorkOS or hosted delivery.


## Rollout and support (#444)

This runbook accompanies the rollout implementation. Keep release disabled until
its transport, paused/disabled browser journeys and approved acceptance gates pass.
A local passing run does not authorize enabling production.

The server enables new Studio mutations and custom equips only when
`RIVER_OAKS_CHARACTER_STUDIO=1`. The browser exposes the editor only when
`VITE_CHARACTER_STUDIO=true`; changing this build-time value requires a new client
build. Missing, false or unrecognized values leave the respective feature off.
Development (`pnpm run dev`) is the exception: the editor always shows unless
`VITE_CHARACTER_STUDIO=false`, and the development town takes saves unless
`RIVER_OAKS_CHARACTER_STUDIO` is set (`0` pauses it). Builds and deployments are unchanged.
Fixture opt-ins are test configuration, never authentication exceptions.

Pause new server writes first if a release must be stopped. Previously selected
looks still render and reconnect; ordinary authored appearance/movement controls
remain available. Draft/publication/rollback writes receive
`character_studio_disabled`. New custom equips stop, while an exact stored equip
receipt can still pass through authenticated recovery. Accepted pending operations
may finish during a pause. Clients retain uncertain operations and their stable
request IDs so retry cannot create a second operation. Hiding the editor is a
separate client release; it cannot undo a server operation already accepted.

A feature pause must retain writer generation 14/envelope 3, world codec 13 (13 and 12 before #509) and
character-store codec2. Never roll back to an older reader/writer, delete a saved
revision, clear request receipts, remove tombstones or reset account versions as a
support fix. Reenable with the same compatible implementation after the failure is
resolved and recovery tests pass. Check saved account state before a fresh edit.

Support behavior:

- Save draft is private. Wear publishes and selects the validated look for town.
  A published revision alone does not establish that the town selected it.
- A lost response or paused write retains Retry for the same action. Keep the tab
  available until the action is confirmed. A full reload cannot preserve unsaved
  local edits or the in-memory retry journal; favorites on that device are separate.
- A version conflict preserves visible local edits. Check saved account refreshes
  authoritative state; Use saved draft is an explicit replacement of the local
  edit. Do not automatically overwrite another editor's draft.
- An initial peer asset failure shows a neutral fallback and retries loading the
  canonical revision. A fallback does not change the stored look or its owner.
- Account erasure uses a durable tombstone and rejects recreation/replayed writes.
  The signed `/api/workos/events` hook performs character erasure, session
  revocation and peer disconnect. Keep the hook configured and active during a
  Studio pause; local fixture tests do not prove live provider delivery. Configure
  and verify the provider subscription separately before production acceptance.

For a support report, request the release revision, browser/device, action name,
fixed error category, approximate time and whether the local draft is still shown.
Do not request cookies, tokens, complete API payloads, account identifiers, private
reference images or unsanitized browser recordings. No reference-image upload or
AI generation path is part of this release. Existing acceptance receipts use local
fixture identities and must not be confused with production usage telemetry.

Optional server-only telemetry is enabled strictly by
`RIVER_OAKS_CHARACTER_STUDIO_METRICS=1`; absent and other values keep it silent.
The town/gateway emits aggregate JSON to its existing process log once per minute
and on orderly shutdown. It does not add an endpoint or external analytics vendor.
Studio pause does not disable counts of paused attempts.

The fixed operations are read/save/publish/rollback/equip. Fixed outcomes are
success/rejected/conflict/paused/unavailable/aborted. Elapsed-time buckets are
at most100ms,500ms,2000ms, or greater than2000ms. The collector has120 saturating
integer counters (maximum2147483647 each), resets after emission and retains no
per-account data. No user/request/world IDs, definitions, palettes, raw errors,
images, cookies, URLs or free text enter the aggregate. A response finishing and
then closing contributes one observation. Known policy denials count as rejected;
unknown failures count as unavailable without serializing their cause.

These are process-local attempt counts, not unique actions, users, durable receipts,
or end-to-end player latency. Repeated recovery attempts can contribute multiple
counts. HTTP timing begins after exact route matching; equip timing begins after
transport admission and before the rollout/selection operation. Shutdown or runtime
suspension can lose unflushed counters; serverless instances may freeze before the
minute timer runs. Emission is best effort with no retry queue and sink failures
cannot reject gameplay. Use existing durable receipts for correctness decisions.

The town/gateway closes its owned collector after closing its worlds. A caller
injecting a collector owns its lifetime; gateway replacement must not close it.
Local tests cover fixed dimensions, privacy, duplicate terminal events, aborts,
policy classification, failing sinks, real memory/Redis transports, strict factory
opt-in and shutdown. Hosted log retention, operational monitoring and production
activation remain separate acceptance. Usability/device gates still require trials.


### Custom-character crowd diagnostic (2026-10-16)

At `d4301110`, Chromium156.0.8078.4 on Apple M3 Max/ANGLE Metal measured
30 seconds after10 seconds warmup per tier with sharp quality,98 NPCs and the
listed total player count. The viewer used Sable human Rose; peers alternated
human Rose and fox Midnight. Server publication/equip and actual material-color
checks established canonical identity before measurement.

| Viewport | Players | Frame p95 (ms) | CPU submission p95 (ms) | Draw calls | Triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| desktop | 1 | 33.4 | 11.4 | 1604 | 5246962 |
| desktop | 8 | 16.8 | 16.3 | 2282 | 8378714 |
| desktop | 16 | 33.4 | 32.4 | 3116 | 12193278 |
| phone-viewport | 1 | 33.3 | 8.9 | 1249 | 4204713 |
| phone-viewport | 8 | 16.7 | 16 | 1940 | 7426312 |
| phone-viewport | 16 | 33.4 | 32 | 2760 | 11207145 |

Desktop was1280x800 DPR1; phone viewport390x844 DPR2 used the same host GPU.
This does not prove physical-phone performance or approved-device acceptance.
The proposed16.7ms desktop p95 target did not pass. Non-monotonic frame intervals
need repeated pinned runs before inferring a scaling curve. Draw/triangle totals
include the environment and NPCs; they are not isolated custom-avatar costs.

All six harness rows passed roster/material/asset, command, reconnect and cleanup
assertions. Peer reconnect was34–149ms; ordinary departure converged after the
existing30-second grace. This uses loopback memory authority, not Redis or hosted
network conditions. The actual desktop/phone16-player screenshots show overlapping
name labels obscuring the crowd, especially on the narrow viewport. Label readability,
frame cost and approved-device measurements remain open. Distant crowd views cannot
prove garment deformation or the full animation matrix.

Receipt, frozen script/input hashes and inspected captures are retained locally in
`.runtime/character-studio/crowd/`. Earlier fixture failures are preserved separately;
only the corrected six-row run supplies these measurements. No release acceptance.


## Crowd nameplate follow-up (2026-10-16)

Crowded names now use measured text bounds, prioritize speakers and nearby peers,
and suppress overlapping nameplates. Existing visible names receive a one-metre
distance preference to limit flicker. Avatars and the People roster stay intact;
long labels ellipsize within the viewport. Measurements are cached until the name,
viewport or loaded fonts change. The render audit independently records all peer
anchors and tests visible-label containment and non-overlap.

A repeat of the six custom-character samples (same Chromium 156.0.8078.4, M3 Max
Metal, sharp quality, 30-second samples/10-second warmups, 98 NPCs) passed roster,
canonical materials, all-peer anchors, loading, reconnect and departure cleanup.
At desktop 8/16 players, 3/7 non-overlapping labels remained; at phone viewport
8/16 players, 2/4 remained. Both 16-player captures were inspected. The phone
viewport still runs on the host GPU and is not physical-device acceptance.

All six frame p95 values were 33.4 ms. Desktop 16 CPU submission p95 was 31.7 ms and
phone viewport 16 was 31.6 ms. This fixes crowd readability, not the proposed 16.7 ms
desktop frame gate. Next measure main-thread call costs separately from frame
timing before choosing a performance change. This repeat and the earlier varying
8-player result do not establish a stable scaling curve. Evidence and source
hashes: `.runtime/character-studio/labels/verified-20261016/`.


## Unthrottled crowd timing and remote avatar culling (#442, 2026-10-18)

**Why the earlier frame p95 couldn't move.** The audit launched Chromium with
vsync on, so each rAF interval is a multiple of the 16.7 ms refresh. That's why
every p95 above reads 33.4 or 16.7 ms. `--vsync=off` (`--disable-gpu-vsync`,
`--disable-frame-rate-limit`) measures frame cost instead. The default stays
`on`, so older reports remain comparable.

**Where a remote player's cost goes.** `window.__riverRenderAudit.drawCensus()`
is development-only. It counts one frame's draws and submitted triangles by pass
(`main`, `occlusion` for GTAO's geometry pass, `shadow`, `other`) and by owner
(`remote-player`, `player`, `scene`). The audit records it per tier.

At 16 players (desktop, vsync off), each peer costs about 79 draws, split evenly
across main, GTAO and sun shadow, and about 292,000 submitted triangles per frame
across those passes. CPU p50 rises from 12.8 ms at 1 player to 23.2 ms at 16, about
0.7 ms per peer. Frame p50 follows it, so the frame is CPU-bound on the M3 Max.

**Remote avatar culling.** Skinned meshes keep bind-pose bounds, so avatars set
`frustumCulled = false`. Every mesh of every peer within 120 m then drew in all
three passes, behind the camera or outside the shadow map. `avatar-culling.js`
now gives each remote avatar's skinned meshes one sphere around the whole figure,
in each mesh's own space: centred 0.55 h above the floor, radius 0.8 h, where h
is the standing height. It then turns culling back on. three culls the figure
against the camera in the main and GTAO passes, and against the sun's shadow
frustum in the shadow pass. Skins carried by a bone stay unculled. Rigid trims
already cull by their own geometry. The local player, store people and NPCs are
unchanged.

`avatar-culling.test.js` loads every exposed look on its shipped rig, Jevica with
her costume included. It drives idle, walk, run, all eleven gestures, hover, fast
flight and seated. After the world-matrix update a render performs, every vertex
of every visible culled skin stays within 0.751 of the sphere's radius, which is
25% headroom. A 0.55 h radius fails 9 of 11 looks.

`--view=player` keeps the game's follow camera. `--view=away` looks from the
viewer's eye away from the other players. `--compare=avatar-culling` alternates
culling in eight segments in the same page (off, on, on, off, on, off, off, on),
so load drift falls on both arms, and records each segment.

Remote work per frame at 16 players. Culling changes only which draws are
submitted, so these counts are exact:

| View | Viewport | Peers on screen | Remote draws, off → on | Remote triangles, off → on |
| --- | --- | ---: | --- | --- |
| crowd | desktop and phone | 15/15 | 1,192 → 1,192 | 4,376,556 → 4,376,556 |
| player | desktop | 13/15 | 1,158–1,174 → 1,162–1,176 | 4.37M → 4.37M |
| player | phone viewport | 6/15 | 926–960 → 898–926 | 4.24M → 3.88–3.92M |
| away | desktop | 1/15 | 634–642 → 478–500 | 3.56M → 2.24–2.31M |
| away | phone viewport | 1/15 | 634 → 451–465 | 3.56M → 1.97–2.03M |

Peers behind the camera keep their 396 shadow draws: the sun's shadow map covers
at least 36 m around the camera. On the narrow phone viewport, peers just off
the sides are still within the figure sphere's 1.4 m margin, so they stay drawn.
That margin is the price of a sphere that never culls a visible limb.

Timing, from the eight-segment away run (`ab-away8.json`, 18:15–18:19Z, load
52–87). Values are means of the four segments per arm, in ms:

| Viewport | CPU p50, off → on | Frame p50, off → on | Frames in 40 s, off → on |
| --- | --- | --- | --- |
| desktop | 17.75 → 16.73 | 20.7 → 19.9 | 1,913 → 2,000 |
| phone viewport | 15.1 → 14.2 | 16.55 → 15.7 | 2,361 → 2,454 |

Each culling-on segment's CPU p50 was lower than each culling-off segment's,
with one exception per viewport: off segment 6 on desktop (16.7) and off
segment 4 on the phone viewport (14.3). Frame p95 sits near 34.5 ms in any segment
whose p50 is below about 20.5 ms, in both arms (desktop off segment 6 included).
That's a pacing artifact of headless Chromium with vsync off, not a culling cost.
In the crowd and player views, where culling removes nothing, repeated runs
differed by up to 1.5 ms at p50 and 6 ms at p95 between arms with identical
work; that is this shared machine's noise floor.

All rows: Chromium 156.0.8078.4, M3 Max Metal, sharp quality, vsync off, 98 NPCs,
10 s per segment after a 5 s warmup. Every run passed the audit's roster,
reconnect, departure and cleanup checks, except one player-view run whose phone
16-player tier lost the viewer's town socket (`ECONNRESET` through Vite's
WebSocket proxy, load average 30–70). That tier passed in the three later runs. These
are host-GPU measurements, not approved-device budgets. Evidence:
`.runtime/crowd-442/` in the task worktree.


**Figures out of view with their shadows.** Mesh culling still drew the shadows
of peers behind the camera: the sun's shadow map covers at least 36 m around it.
`figureInView` now also asks whether the figure's shadow could reach the view.
It sweeps the figure sphere along the sun direction until the sphere is
`SHADOW_DROP` (4 m) below the figure's floor, in sub-spheres no wider than 1.5
radii, and tests each against the camera frustum. A peer whose figure and sweep
both miss the view gets `holder.visible = false`, so it skips every pass. It
keeps animating at a quarter rate and is never suspended, so its pose is at most
three frames old when it turns back into view; the reappearing frame updates
before rendering.

Only the town's main view passes a sun direction, and only while sun shadows
render. Without one, only the figure counts. The office scenes keep their
existing gates. Riders in a car and flying peers are never figure-culled,
because the vehicle extends past the figure sphere. Shadows on receivers more
than 4 m below the figure's floor are not covered, such as a street below a
high terrace; within that, the test is conservative. A seeded property test
marches 48 sampled figure points per hidden case along the light to the shadow
floor, and finds no point in view in 300 random views, figures and sun
directions. A version that ignores shadows fails it at case 46.

Eight-segment A/B at 16 players (`fig-away.json`, `fig-player.json`; load 34–64;
mesh culling on in both arms). Values are segment means, in ms:

| View | Viewport | Remote draws, off → on | Remote shadow draws, off → on | CPU p50, off → on | Frame p50, off → on | Frames in 40 s |
| --- | --- | --- | --- | --- | --- | --- |
| away | desktop | 478–494 → 286–300 | 396 → 204 | 13.5 → 12.0 | 15.6 → 14.1 | 2,489 → 2,732 |
| away | phone viewport | 451–465 → 221–254 | 396 → 166–185 | 14.3 → 11.8 | 16.0 → 13.6 | 2,468 → 2,902 |
| player | desktop | 1,154–1,176 → 1,154–1,176 | 396 → 396 | 16.8 → 17.2 | 19.8 → 20.1 | 2,013 → 1,983 |
| player | phone viewport | 884–942 → 863–924 | 396 → 377–396 | 15.4 → 15.4 | 17.2 → 17.0 | 2,275 → 2,299 |

In the away view, every figure-culling segment was faster than every segment
without it. In the desktop player view, nothing is culled: the two peers off screen
still have shadows that can reach the view, so both arms draw the same work,
and the 0.3–0.4 ms difference is within this machine's noise. On the narrow
phone viewport, 8 peers are off screen, and only one at a time sometimes loses its
shadow draws (377 of 396 in three of four segments).

**Shadow depth materials per object kind.** three draws every shadow caster
without a `customDepthMaterial` through one shared depth material, in unsorted
scene order. Each time the next caster is a different kind of object (skinned or
rigid, morph-target count, instanced), three re-derives that material's program
(`getProgram`). The census now counts these switches per pass: a material drawn
for a different kind of object than its previous draw. At 16 players in the crowd
view there are 110 per frame in the shadow pass (55 from remote avatars), 154 in
GTAO's geometry pass (one override material) and 19 in the main pass. The world
alone has 52 shadow and 55 GTAO switches.

`shadow-depth.js` gives each remote avatar's shadow casters a depth material per
kind (`programSignature`), shared across avatars. Casters whose materials need
three's own depth variant keep it: alpha cutouts (any `alphaTest`), clipping and
displacement. In every segment of the crowd-view A/B, shadow-pass switches fall
from 110 to 56 per frame (remote avatars 55 to 1). At about 3.4 µs per
re-derivation in the CPU profiles, that is roughly 0.2 ms per frame at 16
players. That's below what this shared machine can resolve: in that run load
fell abruptly mid-run, and the segment timing shows the drift, not the change.
The world's own switches and GTAO's override material are unchanged.

### Authored wardrobe matrix and Vesper wrap

`pnpm run test:experience character-wardrobe` generates coverage from all 22 shipped
appearances: idle, walk, run, sit and wave, plus prowl/lope for the 11 beast forms.
Restricted Jevica is rendered only in the existing isolated model fixture; this
adds no account permission. Independent wings, armor and arbitrary morph/hair-mesh
combinations remain unavailable and are listed as exclusions.

The 132 cases capture 330 phases and 1,012 views (front/side/rear plus seated overhead).
Moving cases use frames 144, 151, 163 and 181 after real root travel. Equal 15-frame
intervals aliased Jevica's running gait; the uneven sequence verifies actual foot
motion. Canvas PNG serialization preserves all four rows instead of clipping them
to the fixture viewport. Checks cover rig identity, finite visible/skinned/instanced
geometry, decoded textures, nonempty rendered views, active beast motion and runtime
errors. These structural checks do not establish garment quality or continuous-cycle
collision freedom. Images and metrics remain local generated evidence.

The matrix exposed Vesper's rigid pelvis-mounted wrap. Both forms failed 225 of 303
upper-thigh surface probes while seated. The wrap now shares the body's skeleton
and has its own unslit garment corrective; the decorative trim receives interpolated
cloth weights and deltas baked offline. Runtime updates only morph influences.
`node scripts/bake-vesper-skirt.mjs --check` reproduces the data and provenance receipt.
The garment adds 720 triangles; the existing accessory draw cap and exactly-once
resource disposal remain covered. The trim keeps its authored 264 vertices.

Both Vesper forms now clear 1,002 seated contact samples, with 18.429 mm minimum
clearance in the browser fixture. Real-rig regressions also cover opposing walking
strides, symmetric/asymmetric bends under transformed roots, standing restoration
and trim attachment (maximum seated surface offset 15.404 mm). Front/side/rear,
overhead and sampled walking images were inspected. Faceted cloth edges and bulky
sleeves remain art-quality work; this correction is not final costume approval.

Visual findings still open: formal/noir coat tails retain rigid panels. Silvan's
correction is described below. Lyra's correction below still needs cloth-quality
review. The full matrix is captured but has not received exhaustive visual approval.
Continuous motion, complete attachment review and approved physical-device budgets
remain open. Neutral Sable 4K references remain separate and must still pass unchanged.

### Lyra layered drapes

Lyra's opaque wrap and sheer train now use the shipped body skeleton and separate
seated correctives. The original standing recipe, materials, texture and beast
visibility remain intact. Both layers have 925 vertices and 1,728 triangles; the
combined increase is 2,304 triangles, with the existing 19 accessory draw cap.
Runtime changes only two GPU morph influences per layer. Offline fitting is
reproduced by `node scripts/bake-lyra-drapes.mjs --check`; the receipt pins the
authored inputs, Three.js implementation and generated output. No runtime
raycasts or geometry edits are introduced.

Real-rig tests cover both upright forms, all 37 waistband vertices per layer,
rear coverage, sampled moving walk/run phases, transformed/asymmetric bends and
standing restoration. Each form clears 771 opaque-body and 523 sheer-body samples
(minimum clearance 25.8 and 12.2 mm), plus 1,167 layer samples (minimum 6.07 mm).
These are directional upper-thigh/lap checks, not whole-body collision proof.
The bake records maximum edge stretch 7.309 and minimum area ratio 0.0509; there
is no approved cloth-quality threshold, and high stretch remains an art-quality
limitation. Full rendered matrix and native 4K verification are recorded separately
in the task ledger; passing contact tests alone is not visual acceptance.


### Silvan fitted panels and gold details

Both shipped Silvan rigs now skin all three drape panels and their hanging gold
leaves/chains. Each panel has 925 vertices and 1,728 triangles, an increase of
3,456 triangles across the three panels. Existing accessory draw caps remain 40
for masculine and 55 for feminine. The masculine waist rises 4 cm to clear the suit
hip; the feminine waist rises 2 cm to clear the fitted linen hip. All 37 top
vertices per panel stay pinned to the pelvis. Materials, ownership and standing restoration are retained.

`node scripts/bake-silvan-drapes.mjs --check` reproduces both rig-specific bakes;
the adjacent receipt pins the authored inputs including both rig/license sources
and the Three.js implementation. The packed
module stores lossless little-endian Float32 data and retains source-position and
source-weight validation. Runtime uses existing GPU morph influences, with no
per-frame fitting or collision queries. Gold details inherit interpolated cloth
weights and deltas; weights are clamped and normalized offline.

Real-rig tests cover all four upright appearances, seated contact, standing
restoration, eight sampled moving walk/run phases, and ten symmetric/asymmetric
bend combinations under translated/rotated/scaled roots. The three panels also
use an edge-crossing probe against the actual upper thighs. Its synthetic test
checks known crossings, clearance and short-edge skips. This does not establish
whole-body containment, exhaustive triangle overlap or continuous-motion safety.
Gold-to-cloth distance is unsigned; it does not prove the gold remains outside
cloth. High edge stretch (7.402 maximum) and compressed rear folds remain
cloth-quality limitations; final rendered acceptance is recorded in the ledger.


### Silvan continuous linen trousers

The feminine human and beast bundles replace five rigid hip/thigh/cuff pieces
with one owned skinned surface derived from the shipped CC0 Jevica lower body.
`preview/src/silvan-trousers.js` retains the source bind matrix, skeleton and skin
weights, adding 3 mm of upper-thigh clearance, smoothly increasing to 12 mm at
the knee, in the authored pelvis frame. Its cuff overlaps the boot farther down the calf.
Source geometry stays intact. The mesh has 8,796 triangles; replacing
368 cylinder triangles adds 8,428 accessory triangles, for 183,068 total in each
feminine bundle. The 55-draw accessory cap is unchanged. There is no per-frame
fitting, extra texture, download or external generation service. The source and
license receipt remains `preview/public/assets/characters/jevica.sources.json`.

The feminine drape rim and hanging gold rise 2 cm together: the former fixed rim
sat about 11 mm below the trouser surface at a 90-degree bend. Both rigs retain
pinned waist vertices and offline GPU morphs. The full bake command above covers
the changed feminine drape and gold data.

Coverage tests cast from ten exterior views toward about 2,100 real knee triangles,
compare first hits using actual material sidedness, and report occluded samples
separately. Five symmetric/asymmetric bends run under transformed roots for both
forms. A closed synthetic bent shell checks intact coverage, a removed patch and
spatial-chunk parity; an actual-rig removed knee patch provides a second negative
control. The wardrobe browser journey checks sampled knee coverage by trousers
and the two boot shafts, and outer layer edges at each captured feminine Silvan animation phase. These establish
sampled visibility and edge clearance, not whole-leg containment, every camera,
continuous-motion safety or final cloth quality. Current verification and rendered
review status are recorded in the task ledger.


### Split coat-tail deformation

Kai formal/noir and Aurel use two curved cloth panels merged into one owned
skinned mesh on the existing masculine rig. The front opening and rear vent remain
open in both forms. The 950-vertex, 1728-triangle mesh replaces two rigid boxes;
each affected accessory bundle gains1128triangles and remains within its existing
20draw cap. A cutaway front hem and wider lower rear vent clear opposing strides;
lower tails follow the calves. Boot shafts and trim follow the shins while soles
and foot lasts follow the ankles. Materials retain the authored palette and use a two-sided cloth surface.

`node scripts/bake-coat-tails.mjs --check` reproduces the two packed seated
corrections against the shipped rig and actual trouser mesh. A coat-specific offline
profile spreads the lap transition around the hip and gathers the rear tails.
Runtime only adjusts the existing GPU morph influences. The source receipts include
the authored geometry, fitter, rig and license manifest. Tests cover all six looks,
seated/walk/run samples, asymmetric bends under transformed roots, pinned waists,
source-buffer immutability, normalized weights and disposal/draw budgets. The
wardrobe browser journey additionally checks thigh and lower-trouser edge crossings
against actual posed body and boot surfaces in every captured coat phase, plus
directional lap contact while seated. Non-indexed attachments are included in the
probe, with synthetic crossing and clearance controls. These are sampled probes,
not continuous collision or final cloth-art acceptance. Broad side folds and
upper-body tailoring still require visual refinement; full frozen evidence is
recorded in the task ledger when it completes.


The coat increment passed 67 focused regressions, five deterministic garment bakes,
132 wardrobe rows / 330 phases / 867 browser checks, native 4K human/fox reference
comparisons and all 11 core tasks with isolated Redis. All 16 frozen source hashes
matched. Lower-body asymmetric/transformed-root tests and ankle-independent boot
shaft tests passed. Reviewed stride and seated captures resolve the sampled boot
crossing; broad side folds and angular calf bends remain art-quality limitations.
Evidence: `.runtime/character-studio/coat-tails/verified-lower-20261018/` and
`lower-render/`; the ledger records skip counts and verification limits.


### Coat back panel (#441, 2026-10-18)

The split tails start at a waist ring about 7 cm behind the back, which showed as
a hard shelf in profile. `coat-back.js` adds a 280-triangle panel that rises from
just outside that ring to the shoulder blades. It spans only the back (±54°), so
it stays inside the arms' swing. It is skinned to the body skeleton: pinned to the
pelvis where it meets the tails, then carried by `spine_02` and `spine_03`. The
panel is not a coat-bake input, so the tails' frozen hashes and seated morphs are
unchanged. `coat-back.test.js` checks the six coat looks: skeleton binding,
normalized weights, overlap with the waist ring, and staying behind the actual back
at rest and with the spine bent ±0.18 rad. A negative control with the panel moved
inside the back fails the check. Each look adds one draw, still within its
20-draw cap. The tails' fronts now sweep back from 20° off centre at the waist
to about 43° at the hem, like a cut-away frock, instead of hanging as two
straight boards. The waist ring and the 950-vertex topology are unchanged, and
the seated corrections were rebaked (`node scripts/bake-coat-tails.mjs --write`,
then `--check`): 0 penetrating, 0 crossings, 2.5 cm minimum clearance.

Kai's and Aurel's chest pieces were flat rounded boxes. The flat fronts stood
off the receding upper chest as slabs, and Kai's embroidery points sat at a fixed
depth that left them hanging in the air beside the arms. Those pieces now lie on
the suit's front-most surface (`measureChestFront`). It rasterizes the suit's
triangles into a 5 mm depth grid in the torso frame, once per avatar, in 1–4 ms.
They are a V-necked waistcoat, a curved shirt and vest panels, tapered lapels,
and embroidery, brocade, buttons and chain seated on the chest. Aurel's buttons
had been 2 cm inside the chest, so they were never visible. `chest-tailoring.test.js`
raycasts the skinned suit independently and requires every chest vertex of the
Kai formal, noir and explorer looks and Aurel to sit no more than 4 mm inside
it and no more than 3.5 cm in front of it, allowing for layered pieces. Negative controls with sunk panels or lifted stars fail.
The pieces use fewer triangles than the boxes they replace. Rowan's shirt,
lapels, pocket flaps and buttons, on the elegant-suit rig, use the same
measurement. His shirt had sunk 1.8 cm into the chest at the collar. The test
also covers his human and wolf looks.

### Peer revision fallback and recovery

The two-account shared Studio journey injects seven receiving-snapshot faults:
missing or unpublished definitions, retired catalog, corrupt asset hash, foreign
owner, unsupported palette, and a valid alternate definition that does not match
the authorized appearance. The server and owner account are untouched. Every case
must restore exact outfit and hair materials captured from an independent authored
Sable baseline before customization, then recover the canonical customization on
the existing connection. A positive revision number alone does not prove that a
revision was published by the server; the alternate fixture tests client validation
and matching, while server ownership/publication tests cover that authority.

The strengthened journey passed 81 checks; focused selection/remote-controller
tests passed21/21. Fallback and recovery screenshots were visually inspected.
Evidence is retained under `.runtime/character-studio/revision-fallback/verified-20261018/`.
All 11 core tasks passed with isolated Redis; preview retained one existing skip
and one TODO, while all 914 server tests ran without skips. This covers received
malformed/stale-catalog data, not continuous network fault injection, live providers,
physical devices, human accessibility or all #443 acceptance.

### Saved-character world transitions and admission recovery

The `character-studio-worlds` development-world journey creates a separate ordinary
resident after the fixture owner, saves and wears a customized Sable look through
Studio, then travels between `garden-2` and `river-oaks`. It checks the immutable
selected definition, unchanged building permissions, actual outfit/hair materials,
and the original peer observing departure followed by a correctly rendered return.
Aborting real admission tickets keeps the application inert and its initialized
walking position frozen across held input. Restoring admission preserves the look
and permits actual movement; reopening Studio shows the equipped customization.
The 27-check browser run and recovery capture are retained under
`.runtime/character-studio/worlds-20261018/verified-pose/`. This exercises loopback
development identities and real world routing, not hosted WorkOS acceptance.
