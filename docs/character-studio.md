# Character Studio architecture decision (#440)

Status: contract in draft PR #457; editor in draft PR #461; render increment under verification.
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

## Local editor increment (#441)

The People controls open a native modal with an isolated Three.js preview.
Definitions remain staged: keep a draft in the current tab, discard back to the
opening draft, or store up to eight owner-scoped favorites on this device.
Unavailable device storage falls back to the visit. Undo/redo retains at most
50 edits; comparison, curated randomization, keyboard controls, touch, camera
framing, two lights and animated poses all use the same validated definition.
Reduced motion freezes the preview and disables turntable/animated poses.

V2 adds allowlisted dress and hair colors for Sable human and fox. Other looks
retain authored colors with explicit compatibility feedback. V1 remains readable.
Colors touch tagged, avatar-owned materials only; teardown restores their original
values and disposes the preview. Late loads are discarded, including after close,
and a stale failed load cannot drop a newer selection. The town renderer pauses
drawing behind the Studio while authoritative world/network updates continue.
Custom colors are not published or replicated yet; #443 supplies that boundary.

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

Rendered baseline (2026-10-15, HeadlessChrome 156.0.8078.4 on macOS,
Metal launch path, 1440×1000 canvas):

| Fixture | Frame p50 / p95 ms | World draw calls | World triangles |
| --- | --- | ---: | ---: |
| Sable human | 16.7 / 33.3 | 1547 | 5,275,904 |
| Sable fox | 16.7 / 33.4 | 1649 | 5,540,490 |

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
The waist stays at the pelvis and the hem follows the legs, preserving geometry
counts, materials and cleanup. Actual human/fox rig fixtures probe covered upper
thighs through opposing strides and translated/rotated/scaled parents. This fixes
the observed rigid-skirt intersection; it does not establish every animation,
wardrobe or camera angle. The intentional hem slit is excluded from coverage probes.

Current-machine captures repeat identically, but are not approved goldens. Named
physical device targets, full animation/wardrobe compatibility, measured crowd
budgets, complete procedural dependency provenance and shared custom colors remain
open. Keep unsupported shape, skin, attachment and asset combinations unavailable.

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


## Runtime pose diagnostics (#442, incomplete acceptance)

Run `pnpm run test:experience character-poses` to capture the canonical rose/espresso
Sable human and fox through idle, walk, run, sit and wave, plus fox prowl and lope.
The fixture moves the root while updating planted contacts, uses the runtime seat
height/hip offset and samples the actual visible skinned geometry and decoded
textures. It saves front, side and rear views for each of the 12 poses, plus two
seated overhead views. This is one phase per pose, not a whole animation-cycle test.

The automated checks establish finite geometry, decoded textures, active beast
locomotion and nonempty body probes. They do **not** establish visual acceptance.
At render head `7c6facc5`, inspection finds a major seated skirt coverage defect
for both supported Sable forms. Of 689 rest-covered body samples, 594 are uncovered
from above and 418 from the front diagnostic camera. Counts describe the probe
region and viewing direction, not a universal clipping metric or acceptance limit.
The side garment cutout also needs authored-reference review.

Stronger front weights and altered hems were investigated but failed runtime
coverage or appearance review; none of those experimental garment changes are
included. Resolve the seated fit using the actual runtime pose before accepting
this matrix. Other wardrobes, wing/armor cases, continuous gait phases, pinned
hero goldens, crowd/device budgets and human review remain open.


## Authoritative drafts (#443, publication integration pending)

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

Both standalone and distributed servers expose `GET /api/character` and
`PUT /api/character/draft` through existing session, approval and ban checks.
Writes require exact Origin and CSRF authorization. The body contains exactly
`definition`, `expectedVersion` and `requestId`, with JSON content type and a16KiB
limit. The owner always comes from the session. Private no-store responses,
per-owner quotas (120 reads and30 writes per minute), strict query fields and
generic backend failures keep this boundary bounded. Conflicts return409; a retry
with identical content returns its original receipt and the current account state.

The account store is shared across world instances. Real HTTP/WebSocket tests
cover memory and isolated Redis, concurrent edits, retry, owner separation,
authorization, malformed/oversized input, write quotas and gateway replacement.
Drafts remain absent from peer snapshots and do not change the current appearance.

Account-deletion hooks, legacy preference migration, two-second world publication
cooldown, peer replication and UI save/conflict behavior remain pending. Account preferences can now retain a validated selected definition, and checkpoint
v12 preserves selected revisions. Store publication and rollback are
internal operations only; no HTTP publication endpoint is enabled yet. These tests
do not establish the create/save/join/peer/reconnect/edit/republish acceptance path.


## Authoritative selection contract (#443, transport integration pending)

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

This is an internal world/account contract. HTTP publication, trusted WebSocket
revision resolution, durable account/room selection reconciliation and client
rendering/UI remain required. Corrupt/stale revision fallback and asset-unavailable
journeys must be proven across the integrated path before #443 acceptance. The
currently exposed HTTP routes still read/save private drafts only.

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

### Durable room selection (optional coordinator mode)

Passing the character store to the Redis coordinator enables writer generation 13
and room envelope 3. World checkpoint version 12 is unchanged. The coordinator
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
13/envelope 3 coordinator, version 12 world codec and version 2 character-store
codec; an older coordinator rejects the new envelope.

This mode is not yet enabled by the running gateway. The legacy avatar-preference
service remains its account store. Gateway migration wiring, standalone memory
transport integration, authenticated publication/equip routes, client version and
request-ID handling, UI and peer-rendering journeys remain required. No new
publication/equip endpoint is exposed by this increment.
