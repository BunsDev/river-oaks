# Character Studio architecture decision (#440)

Status: contract increment verified on current `main` (2026-10-18, PR #457), awaiting
maintainer review. This is the first increment of #440–#444, not a shipped Studio.

## Decision and evidence
Extend the authored character system with constrained modular customization.
Keep Three.js/Vite, existing humanoid rigs and procedural beast overlays,
server-authoritative appearance, and existing photo mode. Do not introduce a
vendor or arbitrary mesh ingestion into the playable path.

`shared-appearances.js` already maps character/style/form to stable appearance
IDs. `avatars.js` loads the base rig, `romance-look.js` applies the authored look,
`animal-face.js` supplies beast heads, and `avatar-skeletons.js` shares matching
skeletons within each clone. `player-avatar.js` now resolves the versioned
contract before loading the same rig and look. No appearance IDs change.
`server/avatar-preferences.js` stores account appearance/movement versions;
`server/redis-room.js` reconciles account preferences on join and heartbeat.
These remain authoritative. The new contract is not yet a persisted record.

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
| Authored modular controls | Shipped rigs, authored garments, beast overlays and tests exist | Go, expose combinations after compatibility verification |
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
integer `revision`, canonical `appearanceId`, rig, human/beast form, parameters,
palette, hair, outfit, attachments, pinned assets and authored provenance.
Revision zero represents a migrated base. Publication will allocate revisions on
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
rejects aliases and malformed data. Never rewrite or delete old IDs. Existing
account records and checkpoint schemas stay unchanged in this increment. Before
#443 switches writes, implement dual reads, validated drafts, immutable revisions,
CAS conflicts and rollback tests in both memory and Redis implementations.

Appearance cannot grant flight, speed, admin access or companion privileges.
Continue using server confirmed appearance/movement, Jevica ownership and existing
2-second appearance cooldown. Definition ownership never replaces those checks.

## Components and delivery order
1. #440: strict baseline contract, migration and actual human/beast rig fixtures;
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
Baseline families: existing Jevica, man-casual and man-tailored base rigs, human
and procedural beast forms. First vertical fixtures: Sable human and fox.
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
attachments or broken skinning in idle/walk/run/sit/emote and beast prowl/lope.
Node rig tests retain actual geometry, skin weights and skeletons but omit image
decoding, so they establish neither texture nor rendered visual acceptance.
Human keyboard/VoiceOver review and novice usability remain explicit human gates.

## Verification evidence
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
