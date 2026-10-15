# Character Studio architecture decision (#440)

Status: implemented contract increment, pending rendered acceptance and review.
This is the first increment of #440–#444, not a shipped Studio.

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

The Deep Research report was not provided or located. No conclusions here are
attributed to it. Existing code and asset receipts are the evidence available.

| Approach | Current evidence | Decision |
| --- | --- | --- |
| Authored modular controls | Shipped rigs, authored garments, beast overlays and tests exist | Go, expose combinations after compatibility verification |
| AI suggestions selecting approved parameters | Can be validated by the same contract, but no evaluated suggestion provider | Defer; optional, no provider needed for creation |
| Arbitrary generated meshes | No proven rig fitting, garment compatibility, licensing or cleanup pipeline | No-go for playable MVP; separate explicitly authorized pilot |

No paid calls, model downloads or production writes are required or performed.

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
