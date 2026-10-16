# Character Studio architecture decision (#440)

Status: draft stack #457 (contract), #461 (editor), #462 (render), and #464
(persistence and client integration). The integrated local full gate passed; the subsequent client reopen regressions, editor journey and core gate also passed. Release acceptance remains in progress.
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
These remain authoritative. The owner-scoped character store now persists private
drafts, immutable published revisions and selected account state; see the transport
and migration details below.

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

V2 adds allowlisted dress and hair colors for Sable human and fox. Other looks
retain authored colors with explicit compatibility feedback. V1 remains readable.
Colors touch tagged, avatar-owned materials only; teardown restores their original
values and disposes the preview. Late loads are discarded, including after close,
and a stale failed load cannot drop a newer selection. The town renderer pauses
drawing behind the Studio while authoritative world/network updates continue.
The Studio editor stages local edits and offers private Save draft and Wear in town actions. Server publication and selection replicate validated definitions; the integrated client applies their owned materials to local and peer rigs. The two-account save/wear journey and actual peer material checks pass locally; the complete visual, device and human acceptance matrix remains open.

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
Studio UI or rendered peer journey; those are covered separately below. Complete
corrupt/missing revision fallback and release acceptance remain open.


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
Corrupt/stale revision fallback and asset-unavailable journeys must still be proven
across the integrated UI/rendering path before #443 acceptance.

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
Fixture opt-ins are test configuration, never authentication exceptions.

Pause new server writes first if a release must be stopped. Previously selected
looks still render and reconnect; ordinary authored appearance/movement controls
remain available. Draft/publication/rollback writes receive
`character_studio_disabled`. New custom equips stop, while an exact stored equip
receipt can still pass through authenticated recovery. Accepted pending operations
may finish during a pause. Clients retain uncertain operations and their stable
request IDs so retry cannot create a second operation. Hiding the editor is a
separate client release; it cannot undo a server operation already accepted.

A feature pause must retain writer generation13/envelope3, world codec12 and
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
