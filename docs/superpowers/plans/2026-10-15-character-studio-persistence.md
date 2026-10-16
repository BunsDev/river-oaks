# Character Studio persistence (#443)

Objective: owner-scoped durable drafts, immutable published revisions and stable
peer identity through conflicts, retry, reconnect, rollback and account deletion.
The full #440–#444 goal remains active; #442 seated garment acceptance is failed.

Base: render14031163218199aa404734d63545f9ba2d30a326, draft #462, stacked on
#461/#457. Prior turn delivered reviewed pose diagnostics/core verification and
concrete failed visual evidence; it made progress, not completion. Existing
contract/catalog validates canonical assets and permission-safe looks. Publication remains disabled until authoritative world integration is verified.

Owned files: server/character-store.js, server/tests/character-store.test.js,
docs/character-studio.md and this ledger. Live task register claim owns branch
feat/character-studio-persistence-20261015 in the existing Studio checkout.

First increment: shared state-transition logic for memory and Redis, one private
draft per owner, CAS version conflicts, server-allocated immutable revisions,
rollback as a new revision, bounded idempotency receipts, record/capacity limits,
and deletion tombstones that prevent stale commands resurrecting data. Strict
canonical validation runs on write and persisted reads. Redis CAS must execute
atomically and match memory semantics under real concurrent clients.

Next increments: authenticated CSRF/rate-limited HTTP routes, existing account
appearance/checkpoint migration, world publication/cooldown and stable revision
references, peer canonical rendering/fallback, UI save/publish/conflict handling,
then real two-player reconnect/edit/republish and unauthorized/failure journeys.
Preserve Jevica ownership, flight/beast rules and two-second appearance cooldown.

Checks: red/green contract tests against memory and isolated Redis; core gate;
review before signed commit/push/draft PR. HTTP/WebSocket and browser gates apply
when those surfaces change. No production accounts, paid services, merge or deploy.

Status: storage and private HTTP draft increments verified; draft PR #464 remains open. Full #443 acceptance is incomplete.


Store implemented with shared canonical validation and state transitions for memory
and Redis. Publication allocates contiguous revisions; rollback appends a copied
revision while retaining the private draft. An atomic Redis hash CAS compares the
entire old record, including absent/present state, so two writers cannot both win.
Repeated request IDs must match the canonical command fingerprint. Receipts retain
64 operations; an older retry still fails its stale version rather than reapplying.
Bounds:10,000 account records (including deletion tombstones),64 published revisions,
64 receipts and256KiB serialized record. Capacity refusal preserves existing data.

Account deletion removes draft/history/receipts and leaves only a hashed owner key
and tombstone. It also replaces corrupt private records; stale requests cannot
resurrect a deleted identity. Stored canonical definitions and record structure are
validated on reads; malformed/foreign/privileged input fails closed. This store is
not itself an authentication boundary: future routes must supply the authenticated
owner, and account deletion is trusted-server-only.

Red: missing module reproduced before implementation. Green:15 contract checks
passed against memory and a fresh loopback-only Redis service with persistence
disabled, zero skips,1.136s. Covers concurrent edits/duplicate publication, stale
receipts, private copies/owners, immutable history/rollback, deletion races/corrupt
records, both capacity limits and permission-invalid definitions. The test service
was terminated and temporary directory removed. Logs:
`.runtime/character-studio/store-redis.log` (copied after final rerun). Expanded tests
and review/core are in progress; route, UI, world and deletion-hook integration are
still absent and are required before #443 acceptance.


Review found no blocker in CAS/retry/immutability/rollback/deletion semantics. The
reviewer's independent run passed7 memory tests and skipped8 Redis cases; the
separate isolated run above passed all15, zero skips. Core still running. Next is
signed store increment and draft PR stacked on #462, followed by authenticated
route/world/UI integration within this persistence branch. Do not close #443.


Final focused run uses two separate Redis connections for competing writers and
passes15/15 checks, zero skips,1.112s. The prior same-connection run proved atomic
interleaved operations; this run also exercises independent client connections.
Updated receipt `.runtime/character-studio/store-redis.log`. Render parent14031163
now has successful hosted aggregate preview. This is parent evidence only.


Core gate passed via `node scripts/browser-lock.mjs 'character store core
verification' -- pnpm run verify`: tooling117; preview3319 pass/1 skip/1 todo;
server605 pass/161 Redis skips; desktop69; Python141/66 warnings. Build, lint,
format, demo expected-status and secrets passed. New Redis cases passed separately
above. Receipt `.runtime/character-studio/store-core.json`. No route/transport,
full Redis regression, browser, human or production acceptance claimed.

Ready to commit/push the reviewed store increment and create a draft PR stacked
on #462. Next executable action: add authenticated owner-scoped draft/read and
publication routes through both standalone/distributed authorization seams, with
real HTTP security tests; connect publication to world authority before exposing
it in UI. Store availability alone is not a published multiplayer appearance.


Store commit `c07822b5bb219771a41bade13978ef55050adea7` signed, signature/attribution checked and pushed to
draft PR #464 (https://github.com/BunsDev/river-oaks/pull/464), base #462. Live register records the PR
and next HTTP draft boundary. Hosted checks are a separate pending gate. Full
#443 and #440–#444 remain active; no merge/deploy or visual acceptance claim.


HTTP draft increment claimed: character-routes.js, character-transport.test.js,
app.js, distributed-app.js, world-gateway.js and town.js. No other active task owns
these exact files in the current live register. Use existing approvedIdentity and
authorized (Origin/CSRF) gates; account-scoped store shared across world instances.
GET private state and PUT draft only. Do not expose publish until world authority,
account preferences, cooldown and peer identity are integrated atomically/safely.
Test both real HTTP implementations and private WebSocket snapshots; Redis gateway
replacement must retain drafts. Keep unknown/oversized input and storage errors
bounded and generic. UI/production auth acceptance remains separate.


HTTP draft implementation: GET /api/character and PUT /api/character/draft are
mounted in both standalone/distributed servers, using the existing approved
identity and exact Origin/CSRF authorization. The authenticated identity owns all
reads/writes. Account stores are shared across world instances. Input is strict
JSON, bounded16KiB; responses are private/no-store; storage errors remain generic.
New read/write rate-limit scopes are explicitly registered in Redis security.
Publication/rollback/delete routes are not exposed yet.

Red: real HTTP request returned404 before mounting (draft-http-red.log in /tmp).
Green:18/18 store+HTTP tests passed with isolated Redis, zero skips,1.077s;
includes two independent Redis writer connections, gateway replacement, private
WebSocket snapshots, security gates, CAS/retry, payload limits and quotas. A first
Redis HTTP run revealed missing limiter scope registration; the fix preserves the
allowlist. Receipt: .runtime/character-studio/draft-http-focused.log.
Independent reviewer found no blocking defect and passed2 memory HTTP tests with
1 Redis skip; the isolated run above supplies Redis evidence. Full profile with
isolated Redis is running under the shared heavy/browser lock before commit.


Publication investigation for the next increment: world.command owns the current
appearance cooldown, ground-level/altitude constraints and movement permissions.
Redis room operations run under a lease; COMMIT_ROOM atomically writes checkpoint,
snapshot and replies. Character accounts use accountPrefixFor, which is a different
Redis hash tag from individual room keys. Do not assume a cross-slot Lua commit is
available or call store.publish ahead of permission/cooldown acceptance and report
it as atomic world publication. Design and test retry/lease-loss/account-vs-room
reconciliation explicitly. Existing avatarPreferences is a separate legacy account
store and must not overwrite a newly selected custom revision during heartbeat.
Client seams are player-avatar.js, remote-players.js and town-snapshot.js; keep
validated fallback and late-load fences while adding stable revision identity.
This is investigation, not an implemented publication guarantee.

Store head c07822b5 now has successful hosted aggregate preview. The uncommitted
HTTP patch has passed all811 server tests with isolated Redis and zero skips,
alongside tooling117, preview3319 pass/1 skip/1 todo, desktop69 and Python141.
Full browser profile remains running; no final full-pass claim yet. Live project
reconciliation reports19 unrelated lifecycle gaps and zero Studio gaps.


Candidate for publication design: distinguish an immutable published look from the
currently equipped account revision. Publishing can make a validated owner look
available without changing the world; equipping it must pass the authoritative
appearance command and its cooldown/ground rules. A failed equip must leave the
current world/account look intact and report saved-but-not-applied honestly. Join
must resolve the equipped reference, never blindly the newest published revision.
Evaluate this against the UI contract and failure tests before implementation;
permission checks, lease loss, persistence failure and restart must be covered.
This avoids claiming a nonexistent cross-slot atomic transaction, but still needs
an explicit durable selection/reconciliation design and acceptance tests.


HTTP full gate PASSED: `node scripts/browser-lock.mjs 'character draft HTTP full
verification' -- python3 .runtime/character-studio/run-http-full.py`, which starts
fresh loopback-only Redis with persistence disabled, runs `pnpm run verify full`,
and always terminates its own Redis process/removes the temporary service directory.
Run22:18:00–22:48:06 UTC,2026-10-15, exit0. All18 configured tasks passed:
dependency audit; tooling117; preview3319 pass/1 skip/1 todo; server811 pass,
zero Redis skips; desktop69; build; Python lint/format/141 tests (66 warnings);
demo/expected-status verification; working-tree/history secrets; security browser;
WebGL reflections;13 experience journeys;21 shared journeys;12 screening checks.
Browser rendering used ANGLE Metal on the Apple M3 Max with full rendering.

Existing preview gaps are explicit: Vince glazing negative approach is already
obstructed (skip); widest-body lounge passage has a1.005m gap against1.01m (todo).
These are not passes. No physical phone, human accessibility, live WorkOS,
production, native Unreal or broad Character Studio visual acceptance is claimed.

Receipts preserved at .runtime/character-studio/draft-http-full.json and .log,
draft-http-experience.json and draft-http-shared.json. Generated tracked historical
reports were restored to HEAD only after copying this run's evidence. Focused18/18
checks and independent review remain recorded above. Source did not change during
the gate. Ready for signed commit/push to #464, then world publication/equipping,
UI and peer revision integration. Keep the checkout and goal active.


Continuation after HTTP delivery675ca26fc2619e61d4ce85c68d47d68f57b3f42f: previous turn
classified PROGRESS (code pushed to #464, full gate passed, issue443 updated at
https://github.com/BunsDev/river-oaks/issues/443#issuecomment-6203907829).
Live checkout clean before claim;13 worktrees preserved; hosted new-head browser
checks still running. The full objective remains unachieved.

Claim world selection dependency: world.js, character-world.test.js, redis-room.js,
redis-room.test.js, avatar-preferences.js and its tests. No competing active owner
claims these exact files. Implement server-resolved immutable definition selection
under existing appearance/cooldown/permission authority, public canonical revision
state and strict checkpoint v12 recovery. Retain legacy checkpoint fallback and
writer-generation fencing. Client transport must never supply the trusted definition.
Account persistence/reconciliation, publication endpoints and client UI/peer rendering
remain separate required integration; this world contract does not claim them.


World selection implemented: trusted context resolves the canonical published
revision; client intent contains only its revision. Owner/catalog/permission checks,
legacy/custom shared cooldown, same-definition retry, same-base legacy clearing,
flight/beast constraints and defensive peer/account copies are covered. Checkpoint
v12 preserves selected definitions, old authored checkpoint fallback and geography
migration; v12 writer fencing prevents obsolete coordinators mutating it. Current
version assertions in existing checkpoint/office/seat/creator tests were updated;
historical v10/v11 fixtures and their semantics remain retained.

Red: seven new world tests failed before implementation; preference tests exposed
lost selected definitions before account support. Redis then caught cjson converting
empty arrays into objects; canonical JSON is now preserved during Lua saves.
Focused run:36/36 checks passed, zero skips,34.054s against isolated Redis, including
room replacement, clearing without resurrection and client-forged definition refusal.
Reviewer found no blocker; its independent memory run passed12 with2 Redis skips.
The separate real Redis run supplies that evidence.

Actual prior-v11/current-v12 audit: extracted only tracked source and required
interior fixtures from675ca26f into an ignored local fixture, no credentials/runtime
state. Initial harness attempts needed path/fixture corrections; the final lease
retake also needed to respect the coordinator's200ms tick throttle. Those were
harness failures, not evidence of successful upgrade. The corrected audit proves
actual v11 checkpoint upgrade, v12 lease preemption, canonical selection retained,
old tick/close fencing, v11 rejection of v12 recovery without partial writes and
v12 retake/recovery. Receipt .runtime/character-studio/world-upgrade.json records
seven checks and old/current source hashes. No production rollback claimed.

Full verification is next. No HTTP publication/selection resolution or client UI is
enabled by this increment; full #443 remains incomplete, including durable account/
room recovery and graceful stale-revision/asset fallback. Keep #442 visual gaps and
#444 full acceptance active. No merge/deploy/paid services.


Full issue scope re-read live during verification (#440,#441,#442,#444 remain
open; #443 already read this continuation). Completion is still unproven:
- #440: contract/design/human-beast fixtures have draft PR evidence; research is
  inaccessible, and performance targets are not accepted measurements.
- #441: reversible editor and compatible Sable colors exist, but exposed looks
  still inherit the failed seated dress fit; integrated save/publish and human
  usability/keyboard/VoiceOver acceptance remain pending.
- #442: seated human/fox garment clipping remains a verified failure. Pinned
  goldens, broader supported wardrobe/wing/hair/armor poses, crowd/device budgets
  and preview/portrait/multiplayer identity parity still require evidence.
- #443: private HTTP drafts and this internal selected-state contract are progress,
  not the full create/save/join/peer/reconnect/edit/republish journey. Transport
  resolution, durable cross-room/account selection, UI, fallback and deletion
  integration remain required.
- #444: full automated regression gates do not establish the requested novice
  usability trials, approved device/performance gates, Studio rollout flag,
  support/rollback/privacy-safe telemetry or release decision. Optional AI remains
  separate with no paid calls; no new speculative generation dependency is added.
Keep these requirements intact after the current commit; do not close the goal
or issues merely because the configured full regression profile passes.

Read-only next integration review during the full gate: current legacy appearance
writes happen after world mutation but before the Redis lease-fenced room commit.
A failed save can leave the world mutated despite an error; lease loss can leave
an account write without its room commit. Whole-preference saves also lack CAS,
so a stale movement command can overwrite another world's selected definition.
Room request UUIDs are server-generated per attempt, not durable client operation
identities. These are concrete prerequisites before enabling custom equip.

Next design to implement and verify: publication remains separate from selection;
move selected account state into the character account hash slot with conditional
legacy migration, expected preference version, bounded durable operation receipts
and tombstone/revision checks. Commit a pending equip intent under the room lease
after validating connection, permissions, flight and cooldown; deliver account CAS
idempotently, then commit the confirmed room projection and acknowledgement.
Replacement coordinators resume pending intents. Joins/heartbeats use confirmed
selection, never newest publication. Legacy appearance/movement must use the same
CAS path so they cannot erase a concurrent selection. Cover lease loss on both
sides of account CAS, process replacement between commits, failed writes, duplicate
requests, concurrent-world movement/equip and deletion during selection. This is
a reviewed next-step design, not implemented behavior or verified acceptance.


Selected-state full gate PASSED: `node scripts/browser-lock.mjs 'character selected revision full verification' -- python3 .runtime/character-studio/run-world-full.py` starts isolated loopback Redis, runs `pnpm run verify full`, and cleans up its own service.

Verification: `pnpm run verify full` passed all 18 tasks against isolated loopback Redis (2026-10-15 23:03:18–23:36:45 UTC). Tooling 117; preview 3319 passed, 1 skip, 1 todo; server 822 passed with zero Redis skips; desktop 69; Python 141 (66 warnings); dependency/build/lint/format/demo/secrets gates; security browser and reflections; 13 experience journeys, 21 shared journeys, 12 screening checks. Browser rendering used ANGLE Metal on Apple M3 Max. Focused selected-state tests passed 36/36 with zero skips; actual prior/current writer audit passed 7 checks; independent review found no blocker in this increment. Existing preview gaps remain: obstructed Vince glazing approach (skip), 1.005 m lounge passage against 1.01 m (todo). No physical-device, human accessibility, live WorkOS, production, native Unreal or full Studio visual acceptance is claimed.

Receipts: `.runtime/character-studio/world-full.json`, `world-full.log`, `world-experience.json`, `world-shared-experience.json`, `world-source-hashes.json`, `world-focused.log`, `world-upgrade.json`. All changed server source/test hashes stayed unchanged during the full gate; world/coordinator hashes match the upgrade audit. Generated tracked reports were restored only after retaining this run. Ready for signed commit/push to draft #464. No issue or goal completion claim.


Continuation after signed/pushed f1db4d5c: previous turn PROGRESS, full gate passed and issue443 updated at https://github.com/BunsDev/river-oaks/issues/443#issuecomment-6204561169. Clean owned branch reused; 14 worktrees preserved. Current next dependency is durable account selection. Extend the existing atomic character-record CAS so tombstone, immutable revision and selection cannot race across Redis slots. Keep selection version/receipts separate from private draft/publication version; publication must not equip. Add conditional legacy initialization, explicit appearance/revision/movement operations, expected-version conflict and retry receipts returning current state without replaying an old selection. Test concurrency, deletion, corruption, migration and bounds in memory and independent real Redis clients. No room/transport activation until durable pending-intent recovery is integrated and verified.

Atomic account selection implemented in character-store.js: schema v2 adds
selection and separate bounded selection receipts, conditionally migrates v1,
resolves only stored immutable owner revisions, and shares CAS/deletion fencing
with drafts and publication. Selection version changes do not invalidate a draft
editor; movement updates retain custom identity, explicit legacy changes clear it.
Initialization only seeds once, validates custom revision identity and cannot
resurrect a tombstone. Retried commands return current selection and original
applied version, never replaying a stale look.

Red: six memory cases asserted missing selection APIs before implementation.
Initial green exposed an incorrect fixture ID (`sable-fox`); corrected it to the
catalog's actual `woman-casual` ID without relaxing validation. First isolated run
passed 32 checks. Review found no blocker and requested concurrent draft/selection
and selection-only-account regressions. Added both plus selection account-capacity
coverage. Final focused run passed 36/36 with zero skips, including independent
Redis clients, v1 migration/corruption, lost CAS reply, write failure, deletion,
concurrency and existing real HTTP draft admission/replacement checks.

Core verification with isolated Redis is running. No room, browser or transport
selection wiring changes in this increment; previous full browser evidence belongs
to f1db4d5c. Keep durable room intent/CAS reconciliation and all original integration,
visual, usability and rollout requirements open. Record v2 requires compatible
store codec on rollback; the hash key remains stable and older readers fail closed.

Final review caught two additional cases: changing JSON field order reused the
same logical command but produced a different fingerprint; a selection-only v2
record could carry a private draft at version zero. Regressions reproduced each
failure, then canonical command construction and strict zero-version decoding
fixed them. The first core gate passed before those refinements; its receipt is
retained as selection-core-before-refinement.json, not final verification.

Final focused run:38/38 passed, zero skips, including the new regressions.
Actual prior-v1/current-v2 codec audit:4 checks passed. Prior f1db4d5c writer creates
its original draft/revision record; v2 conditional migration preserves both;
actual v1 reader/writer reject v2 without modifying selection; a replacement v2
store restores the canonical look. Receipt selection-upgrade.json records current
source hash and exact prior revision. Final review found no blocker. Final core
verification is running on frozen source after those fixes.


Final core PASSED 2026-10-15T23:49:59.733Z to 2026-10-15T23:52:37.024Z. `node scripts/browser-lock.mjs 'character account selection final verification' -- python3 .runtime/character-studio/run-selection-final.py` ran focused tests, actual codec audit and `pnpm run verify` against isolated loopback Redis, then terminated its own service.

Current verification: `pnpm run verify` passed all 11 core tasks with isolated Redis: tooling 117; preview 3319 passed, 1 skip, 1 todo; server 842 passed with zero skips; desktop 69; Python 141 (66 warnings); build/lint/format/demo/working-tree secrets. Focused memory/Redis/HTTP checks passed 38/38 with zero skips; actual prior/current codec audit passed four checks. Independent review found no blocker. This run does not include browser, native, live-auth, device or human acceptance.

All changed source/test hashes stayed unchanged during the final run. Receipts: selection-core.json/.log, selection-focused.log, selection-upgrade.json/.log and selection-source-hashes.json in .runtime/character-studio. Previous full-browser receipt remains scoped to f1db4d5c. Ready for signed commit/push and issue443 update, then durable room-intent implementation.


Continuation after 50c626b8: previous turn PROGRESS (signed/pushed atomic selection store, core842/zero Redis skips, focused38 and actual codec audit4; issue443 comment6204746917). Clean owned checkout reused; now15 worktrees, unrelated primary register edits preserved. Next implement optional selection-aware Redis coordinator: writer13/envelope3 with bounded durable pending intents. Prepare validates world authority without changing selected look, first fenced commit persists intent, next tick executes account CAS, final fenced commit projects confirmed current selection and replies. Only previously committed intents may call account mutation. Pending accounts reject further gameplay commands until resolved; heartbeats must not overwrite pending state. Retry lookup precedes cooldown checks; conditional legacy initialization seeds selected account once. Test before/after-CAS failures, replacement, duplicates, cross-world conflicts, deletion/auth/cooldown and malformed recovery. Gateway and memory transport activation remain required subsequent integration; no scope reduction.


Optional Redis room selection implementation: writer13/envelope3 durably prepares
bounded intents before account CAS, then projects confirmed selection and replies
through the fenced room commit. World preparation preserves appearance/cooldown;
receipt-first replay, current account version projection, authorization/deletion,
departure and uncertain-backend recovery are covered. Existing per-room cooldown
policy is preserved; no account-wide cooldown claim. Gateway remains unactivated.

Focused real Redis run passed42/42, zero skips. Three added edge regressions first
failed for duplicate queue IDs poisoning recovery, a stale account read omitting
the joined player, and a selection-version entry outside the roster. Fixes passed
all three; red receipt room-edge-red.log retained. Actual baseline50c626b8 v12/new
v13 audit passed8 checks, including old writer fencing and pending-intent recovery.
Core gate now running with isolated Redis on frozen source. Remaining gateway,
memory transport, publication, UI, peer, visual and full acceptance scope is open.

Final review found a geography-revision interaction: the migrated world clears
players/connections but retained projection versions. The new roster check then
rejects the following checkpoint. Add enabled-room revise/tick/replacement/rejoin
coverage and clear projection versions with the roster. The initial core run
failed an unchanged socket handover observer assertion (856/857 server tests,
zero skips); retain room-core-before-refinement.json/.log and rerun that test in
isolation, then the complete gate after the region fix. No success claim yet.

Next transport design to implement and verify (not current behavior): carry a
separate selection operation {expectedVersion,requestId} beside WebSocket command
metadata, keeping stable idempotency IDs distinct from per-connection response
sequence IDs. Expose current self selection version through authenticated state;
never derive ownership from client fields. Add memory preparation/account-CAS/
confirmed projection with pending-account fencing and uncertain-write receipt
recovery before gateway activation. Preserve legacy authored-look migration,
including envelope3 default-room checkpoints. Publication is an authenticated
owner-scoped store operation and does not equip; equip resolves the immutable
owner revision through the world authority checks. Real HTTP/WebSocket tests must
cover both backends and two accounts before a browser UI enables the flow.


Region regression reproduced the orphan projection map after a successful revise;
clearing selectionVersions with connections fixes the owning path. Review confirmed
the change and found no further blocker. The unchanged socket rotation suite passed
6/6 independently with isolated Redis (room-rotation.log). The final full core
rerun remains queued behind shared local rendering work; no source changes during
that run. Keep failed/pre-refinement receipts distinct from final verification.


Final core PASSED 2026-10-16T00:21:18.716Z to 2026-10-16T00:23:33.222Z. `node scripts/browser-lock.mjs 'character room final verification after geography fix' -- python3 .runtime/character-studio/run-room-final.py` ran focused tests, actual writer audit and `pnpm run verify` against isolated loopback Redis and stopped its own service.

`pnpm run verify` passed all 11 core tasks with isolated Redis: tooling117; preview3319 passed,1 skip,1 todo; server858 passed with zero skips; desktop69; Python141 (66 warnings); build/lint/format/demo/secrets. Focused memory/Redis/HTTP tests passed61/61 with zero skips. Actual prior-v12/current-v13 coordinator audit passed8 checks. Independent review found no remaining blocker. The unchanged socket handover suite passed6/6 independently after an earlier observer assertion failed; the final core rerun also passed. No browser, native, live-auth, device or human acceptance is claimed for this increment.

All changed source/test hashes stayed unchanged throughout final verification; coordinator/world hashes match the upgrade audit. Receipts: room-core.json/.log, room-focused.log, room-upgrade.json/.log, room-source-hashes.json, room-rotation.log in .runtime/character-studio. Red edge/region and failed pre-refinement core receipts retained separately. Ready for signed commit/push to draft464 and issue443 update. Remaining end-to-end goal is active; no merge/deployment or archive eligibility.


Continuation after077d887a: prior turn PROGRESS, signed/pushed durable room intents, core858/zero skips, focused61 and actual writer audit8. Reused clean owned checkout;15 worktrees preserved. Next integrate both transports: memory preparation/CAS/projection with per-account pending fences and receipt-first uncertain-write recovery, explicit custom selection metadata, legacy command compatibility, envelope3 legacy migration, owner-scoped publication/rollback and selection reads. Publication must not equip. Verify real HTTP/WebSockets with two identities, reconnect/replacement, stale/foreign/forged inputs, backend failures and unchanged legacy authority before full browser gate. Original #440–#444 acceptance remains open.


Both transports now route custom revision selection through canonical owner lookup
and account CAS. Memory keeps uncertain intents fenced and recovers receipts;
Redis uses the committed room intents. Explicit custom selection versions/IDs are
separate from wire response IDs; legacy commands get server-generated metadata.
HTTP publication/rollback use the existing approval/ban/Origin/CSRF and quota gates
and never equip. Default-room migration reads envelope3. Initial focused real
Redis run passed31/31. A new late-memory-read regression failed after replacement;
world/connection checks fixed it. Memory shutdown/newer-choice regression passes.
Full gate is queued/running on frozen source, including all character tests, the
actual writer audit and pnpm run verify full with isolated Redis. No UI/rendered
acceptance claim; remaining original scope is unchanged.

Full-profile first run stopped at one stale geography probe: world-gateway.test.js
created a default v12-only coordinator after the activated gateway wrote envelope3.
Keep old writers fail-closed; update that probe to supply the current character
store, preserving its stale-geography recovery purpose. Actual v12 rejection remains
covered by the separate executable upgrade audit. Red receipt retained as
transport-full-before-fixture.json/.log. Corrected final focused suite passed80/80,
zero Redis skips; upgrade audit passed8. Final full gate is running on frozen source
(tool session82727); poll that same process, never restart from a status timeout.

Next client work after verified backend delivery: expose character HTTP operations
through multiplayer-client's existing credential/CSRF request helper; keep stable
operation IDs and expected account/selection versions across retries; retain edits
through errors and make concurrent-save conflicts explicit. Extend the existing
Studio footer with durable save and publish/equip states. Normalize loaded published
looks to draft revision0 for editing. Bind the Studio baseline to the canonical
selected definition rather than only appearanceId. Local player-avatar and remote-
players currently ignore player.character: validate it against owner/appearance,
apply independently owned materials for same-base changes, and fence stale loads,
failures and disposal. Keep safe authored fallback while loading. Verify two-player
rendered colors, reconnect, edit/republish, conflicts and asset failures through the
real existing acceptance harness. These are unimplemented next actions, not evidence.

2026-10-16 continuation: final backend full gate82727 remains active on frozen
source; source hashes still match. Experience13 passed, shared journeys underway.
Do not restart. New user request prioritizes expandable plaza game layout in a
separate checkout; preserve this goal/worktree and finish the running gate.

Next client implementation is STAGED ONLY under ignored
.runtime/character-studio/client-next/ and has not altered verified application
source. character-account tests18 pass (lost draft/publish/equip replies, concurrent
edits, exact ID retries, request_timeout, HTTP429, real DOMException timeouts,
disposal and malformed reads). Remote controller tests13 pass; new same-base color
and late-load/departure regressions fail against old controller. Review found/fixed
real TimeoutError numeric-code retry loss and Studio auto-close while replacing the
local rig; canStayOpen now differs from entry readiness. Staged local avatar, UI,
main/HTTP adapter, and shared browser journey need integration/verification.

After backend commit: copy only intended staged files into preview src/tests/e2e,
rewrite staging relative ../../../preview/src imports to normal source paths,
rewrite test server import ../../../server to ../../server and local controller
imports to ../src. Do not copy remote-players-before.test.js (red baseline),
stage-ui.py (already-applied transform), or other scratch files. Update old Studio
journey labels Keep draft=>Close studio and Discard changes=>Discard edits. Register
new character-studio-shared journey in shared-runner and claim those files first.
Run unit/build/core and locked real browser journeys; inspect screenshots. No
rendered or local-avatar acceptance yet. Broader original #440-444 gaps unchanged.

Final backend full gate PASSED, all18 tasks, 2026-10-16. Receipt transport-full.json/.log retained with transport-focused.log, transport-upgrade.log and actual experience/shared reports. Source hashes still match. Focused80, writer audit8, server868 zero skips; experience13, shared21 and IPIC12 passed. Generated tracked reports restored after retaining actual evidence. Backend remains uncommitted while latest user game-layout task proceeds; original durable goal UI status is paused. Do not represent staged client files as integrated.

Resumed original durable goal after plaza-layout handoff. Previous goal turn made
no Character Studio progress; revalidated the completed transport receipt and all
11 source/test hashes rather than rerunning unchanged checks. Full profile passed
18/18 tasks (00:39:18 to01:12:06 UTC), focused80 and actual writer audit8; no Redis
skips. Deliver verified backend, then integrate staged client and two-player journey.
Claims renewed and shared-runner/journey claimed. Full original acceptance remains
open, especially seated Sable fit, UI/rendered persistence, fallback/lifecycle,
goldens and target-device/human acceptance. No merge/deployment/archive eligibility.

Backend signed/pushed d26762e7 to draft464; issue443 comment6207113740 records
full18/focused80/audit8 evidence and remaining scope. Client is now integrated
into source: account workflow, save/wear/conflict UI, canonical local/peer materials,
Vite and hosted routes, authenticated browser fixture and shared journey. Tests
reproduced malformed acknowledgement retry loss and missing hosted routing; fixes
pass focused tests. Independent read-only review found no blocker. Browser session
87477 queues build, shared character-studio-shared and editor character-studio on
frozen source (client-source-hashes.json). Actual material colors are asserted for
local and peer rigs; screenshots frame the worn peer. No browser success claimed
until results and visual inspection; asset failures and broader acceptance remain.

Focused command `node --test preview/tests/character-account.test.js
preview/tests/remote-players.test.js preview/tests/character-studio*.test.js
server/tests/vercel-routing.test.js` passed49/49, zero skips. Malformed partial
publication receipt regression also failed before the metadata fix and now passes.
Read-only review confirms the corrected retry and route boundaries, no new blocker.
Browser session87477 and isolated-Redis core session2140 are live queued processes
behind other owners; poll those same handles. They have not run yet. Preserve
source freeze and client-source-hashes.json. No client commit until gates pass.

2026-10-16 recovery: browser87477 and core2140 exited1 after reaching their turn.
The checkout node_modules directory was missing: build could not find Vite and
three tooling tests could not import dependencies. No application regression is
proven by these failures. Retained client-missing-deps-build.log, core.log and
core.json under .runtime/character-studio. Frozen dependency install session89502
is live in the shared queue; do not restart it. Source manifest remains unchanged.

Reviewed live #440–444 acceptance and confirmed draft464 still at d26762e7.
Documented novice usability tasks and pass criteria before any human trial; no
participant results or device approval claimed. Traced missing-assets fallback:
remote replacement preserves an old rig, but an initial failure leaves no body.
Staged a behavioral regression under .runtime/character-studio/remote-placeholder-
regression.txt for pending/failed/retried loads and resource disposal. It is not
integrated or executed; implement the fallback after validating this client slice.

Re-ran dependency-free `node --test preview/tests/character-account.test.js server/tests/vercel-routing.test.js`:28/28 pass, zero skips. All19 source hashes match the frozen client manifest. Dependency restore89502 remains live, now first queued after the active IPIC soak; sequential doctor/browser/core runner prepared, not started.

Dependency restoration89502 completed exit0 (`pnpm install --frozen-lockfile`).
New selection-view behavioral tests verify owned canonical revisions, safe defaults
for missing/unpublished/corrupt/foreign/unavailable catalog data and protected
identity migration. Combined pure account/selection/routing suite32/32 passes with
zero skips. Manifest now freezes20 client source/test files. Sequential
run-client-validation.py is queued for doctor/build/shared/editor/core.

Additional #443 investigation: Redis join catches character-account initialization
errors after world.join has read checkpoint appearance. A deleted account may keep
its previous custom projection; idle heartbeat also throws before clearing it.
No defect claim until a real Redis deletion/checkpoint-rejoin regression runs.
Existing pending-intent deletion test is narrower. Keep this next action separate
from the frozen client verification. Named device targets requested from Val; no
approval or human acceptance inferred while awaiting a reply.

Client validation session8996 is live queued: doctor/build/shared/editor/core via
run-client-validation.py. Separate immediate doctor passed after dependency
restoration. Focused restored account, selection-view, remote, editor, materials and
routing suite51/51 passes (loading suite remains covered by upcoming core).

STAGED ONLY follow-ups under .runtime/character-studio, not application edits:
- avatar-placeholder.js + remote-players-placeholder.js: first asset pending/failure
  keeps a visible asset-independent presence marker, readiness false; successful
  canonical load replaces it, departure/teardown disposes once. Behavioral red
  reproduced empty peer body. All16 remote tests pass including movement/culling.
- redis-room-deletion.js: terminal tombstone clears room appearance and selected
  version on heartbeat/rejoin, including checkpoint restoration, without changing
  account tombstone or authorization. Two real Redis red cases retained; all17
  room tests pass with zero skips, including lease-loss cleanup recovery, old
  receipt rejection and a further coordinator reload.
- character-studio-shared-fallback.js: additional fresh-peer asset failure/recovery
  screenshot scenario prepared, NOT RUN.
Read-only review found no blocker; suggested pending movement/culling and lease-loss
  deletion cases were added and passed. Idle memory-transport deletion acceptance
  still needs the real connection path (current sync closes on account errors).

Preserve source freeze until8996 finishes. followup-source-hashes.json records both
base and staged file hashes. Integrate only after comparing with any intervening
client corrections: staged browser controller imports ../../preview/src become ./;
staged remote tests restore ../src and the live controller import. Staged Redis
module ../../server becomes ./ and ../../preview becomes ../preview; its tests
restore ../ server imports and live redis-room.js. Merge the extra browser failure
scenario with fixes from the first actual client journey. Do not count staged
unit/Redis tests as application, rendered or full-profile acceptance. No new commit.

Issue443 progress recorded at https://github.com/BunsDev/river-oaks/issues/443#issuecomment-6207699788 with explicit staged/uncommitted limits. Client validation8996 remains live queued; poll this handle, not old terminal87477/2140 or restored install89502.

Continuation: prior turn was progress (dependency recovery, new fallback tests,
reviewed staged peer/deletion fixes and issue update). Session8996 remains a live
queued process;20 client source hashes still match. No client gate restarted.

Independent #442 diagnostic: seat-ring-diagnostic.mjs/json records actual runtime
skirt rows. Front waist y=.705, middle rows .640/.629, hem .697: intermediate
weighted rows collapse below the posed body before rising at the hem. Staged
seat-fold-prototype.mjs uses an explicit flat lap and lowered front fold; actual
front-camera rays expose0/673 sampled points, overhead552/673 (open waist and
self-occlusion are not accounted for, so these counts are not visual acceptance).
No garment source was changed or fix accepted.

Prepared seat-fold-browser.mjs using the real authorized fixture/renderer. The
existing queued run-client-validation.py now captures this separate static
diagnostic AFTER its unchanged doctor/build/shared/editor/core gates. It writes
seat-fold-browser.json and character-seat-baseline[-above].png /
character-seat-fold-prototype[-above].png. Inspect all four actual captures before
any garment decision; the prototype has no motion integration. Diagnostic status
is printed separately and is not a production acceptance gate. No additional
browser queue or source mutation. Poll session8996.


Validation8996 completed: doctor/build0, shared1, editor0, core0; separate seated
render diagnostic0. Core11/11 tasks passed; editor21 checks passed with actual
desktop/phone screenshots inspected. Shared stopped at ambiguous data-character
locator (Sable button plus wardrobe cache attribute); preserved failed report/log
and editor/core receipts under client-*-first / client-shared-before-selector.
Button-scoped roster/test selectors fix ambiguity and avoid aria-pressed on select.

Integrated reviewed placeholder + Redis deletion patches after verifying all frozen
and staged hashes. New memory idle-deletion transport case reproduced old custom
avatar persisting through30s reconnect grace after socket closure. Terminal deletion
now calls current-connection-fenced disconnectUser; transient errors keep1013.
Staged4 memory transport tests passed, including peer removal, erased read state,
recreation denied and other account availability. Integrated focused client54/54
passes zero skips. Follow-up source manifest freezes25 files. Review requested.
Next queued runner: isolated Redis room/equip/memoryselection tests, build/shared/
editor, then full profile only if those pass. Do not mutate source while running.

Actual baseline/prototype seated captures inspected front/side/rear/above. Prototype
rejected: knee intersections, box-like silhouette and waist discontinuity despite
front0/673 ray misses. No garment source integrated. #442 remains open; geometric
coverage counts are insufficient visual acceptance. All four captures retained.

Follow-up validation session62112 is confirmed live, queued behind5 local browser
runs. Poll this handle; old8996 is terminal. Read-only review found no blocker in
integrated deletion/current-connection fencing, placeholder, Redis and selector
changes. First core evidence counts: tooling117, preview3347 pass/1 existing skip/
1 existing todo, server869 zero skips, desktop69, Python141 (66 warnings).
These precede integrated follow-ups; do not report them as the new full gate.
No new commit; preserved dirty checkout and full #440–444 acceptance scope.


Continuation classified as progress: integrated transport27/27 passes with isolated
Redis and zero skips; shared17 checks and editor21 checks pass. Actual saved Studio,
peer rose/midnight, initial asset-failure marker and recovered Rowan screenshots
inspected. Receipt copies client-followup-{transport,shared,editor} retained.
Session62112 remains confirmed live and now runs full verification; no source
changes,25 frozen hashes match. Do not integrate staged rollout until this gate
finishes and the verified client increment is committed/reviewable.

STAGED #444 rollout follow-up in .runtime/character-studio/rollout:
- Explicit production RIVER_OAKS_CHARACTER_STUDIO=1 and browser
  VITE_CHARACTER_STUDIO=true; disabled server preserves reads, selected identity,
  reconnect, legacy appearance/movement, pending recovery and codecs. HTTP new
  draft/publish/rollback and new custom equips stop. Fixtures explicitly opt in.
- Real memory red showed ignored flag accepted a save. Staged7 real memory/Redis
  transport cases pass no skips, including disable/reconnect/blocked writes,
  authentication/rate budgets/reenable and exact pre-disable equip receipt replay.
- Review found paused WS rejection cleared the client's uncertain journal while
  server recovery could still finish. Added real client red, made paused result
  retryable, and allowed only exact existing receipts through normal authenticated
  recovery. Monotonic versions fence receipt-eviction races from new CAS writes.
  Staged23 account tests pass; second read-only review found no remaining blocker.
- source-hashes.json and wiring-hashes.json identify bases/staged copies. All staged
  JavaScript passes node --check. Two actual disabled/paused browser journeys and
  their experience-runner fixture options are prepared but NOT RUN/integrated.
- Integration must reverse staged import paths carefully and preserve intervening
  fixes. New helper belongs server/character-rollout.js; account test append belongs
  existing preview/tests/character-account.test.js. Rollout test additions belong
  server/tests/character-equip.test.js. New files are claimed; preserve other tasks.
No release flag is active in application source yet. No new commit/merge/deploy.


Review follow-up: reopening Studio after wearing Rose, closing and selecting Rowan
through the legacy picker retains Rose edits but incorrectly keeps stale account
selection, claims Rose is worn and disables Wear. Staged guarded account refresh
on reopen preserves busy actions and uncertain retry journals. Actual shared
journey regression and standalone fixture runner are prepared under
.runtime/character-studio/reopen; not yet executed or integrated. Current62112
full source remains frozen. After terminal receipt, reproduce red, integrate fix,
rerun shared/editor/core and review before committing the client increment.
Production deletion trigger choice and target device question remain unanswered.


Reopen fix received read-only review: no further lifecycle blocker found. Added
close/reopen during lost-save regression to protect retained edits and uncertain
retry identity. Red browser runner76928 queued behind the active full gate and
other local owners; preserve its queue position and do not bypass the lock.

Garment architecture review recommends an owned pose-space corrective after final
IK, driven by bilateral hip flexion and fitted against body geometry, with fixed
waist and seam/triangle constraints. No production garment mutation. New offline
seat-corrective-baseline.mjs/.json completed at seat heights0.45/0.55/0.65m.
All three actual final poses have90-degree hip flexion and equivalent deformation:
minimum triangle area ratio0.0792, edge length ratio0.1103–1.7282, waist displacement
below2e-10m. Of673 initially front-covered samples,418 front and578 overhead
probes are unoccluded. These directional probes are not complete body collision
or visible-exposure metrics. Need fitted target, collision/seam diagnostics,
intermediate flexion and locomotion controls, then actual multi-view inspection.


Isolated seat-contact-prototype.mjs completed (no production changes). It
subdivides the authored garment to1353 vertices and solves edge constraints against
a convex envelope of21407 actual posed body samples. Although non-waist contact
violations fall851→0, maximum edge ratio grows2.019→19.397 and minimum triangle
area ratio falls0.0518→0.00580; maximum correction0.2864m, waist displacement0.
Front probes miss673/673. Reject this target on geometry before browser review.
A whole-region convex envelope plus directional projection is not a valid fitted
seated corrective; contact success alone hides severe topology/shape failures.
Retained seat-contact-prototype.json and seat-contact-target.json as failed
experiment evidence. No acceptance threshold relaxed; no application integration.
Next garment work needs a locally fitted pose target with surface and seam
constraints; avoid repeating analytic folds or treating convex contact as fit.


Full62112 terminal0: pnpm run verify full passed all18 tasks with isolated Redis.
Counts: tooling117; preview3350 pass/1 existing skip/1 existing TODO; server873
pass with zero skips; desktop69; Python141 pass/66 warnings. All13 experience
journeys, all shared modes including Character Studio, security/reflections and
IPIC screening passed. Frozen25 source hashes still match. Preserved full receipt,
log, experience/shared reports and screening report as client-followup-full* in
.runtime/character-studio. Reopen P2 remains staged, so this is the baseline gate
before that fix, not acceptance of corrected reopen behavior. Red76928 is live
and queued behind3 local browser runs. No new commit. project:check failed only
on separately owned reconciliation/retirement/stash/path debt; preserved its log.


Delivery boundary: the four-file account-deletion fix is independent of the
uncommitted Studio client. Its exact memory/Redis source passed focused27/27
(no skips) and the integrated full18-task gate above, and read-only review found
no blocker. Deliver this server-only increment while the separately reviewed
client reopen regression waits; client/editor/routing changes remain uncommitted.
The full receipt records the larger dirty integration tree, not the isolated
server commit. Production deletion-trigger integration remains outstanding.

Server-only deletion increment signed and pushed:32e2b61d7d51817d36dd9c62e0c8fbd99d15e448,
draftPR464 remote head verified. SSH signature passed; forbidden tool-author
trailer check printed nothing. Client remains dirty/uncommitted; reopen regression
76928 queued. Prepared run-reopen-verification.py for shared/editor/core with
isolated Redis after fixing the reproduced bug. No merge/deployment/retirement.


Reopen red76928 terminal1 at the intended assertion: Wear remains disabled after
wearRose→close→legacyRowan→reopen. Inspected actual failure screenshot: retained
Rose preview and false currently-worn status. Preserved browser-red.json/.log.
Verified staged base hashes and integrated the reviewed guarded account refresh
and shared regressions, including uncertain-save close/reopen. Added a capture
of the corrected ready-to-rewear state. integrated-source-hashes.json freezes25
files for subsequent shared/editor/core verification. No rollback flags integrated.


Reopen verification16988 terminal1: shared25 and editor21 passed. Corrected
ready-to-rewear capture inspected previously. Core passed tooling117 and preview3350
(with existing skip/TODO), then server872/873: deletion test read an older snapshot
in flight on Bob after Alice close. World leave is synchronous; changed regression
to assert close4003 and await a snapshot without Alice within3s, well below30s
reconnect grace. Focused memory regression passes. Previous receipts/logs preserved
in reopen/first-verification. Full core has not passed this revised source.

Review found reopening during pending read/save can still retain old selection.
Deferred refresh is staged and reviewed under reopen-deferred. Red44672 exited1
on a request interception lifecycle failure (Route is already handled), with no
product-race evidence. The helper now awaits its held response fulfillment before
unrouting and captures routing errors. Corrected real-browser red63019 queued;
production UI remains unchanged until reproduction. No client commit yet.

Deletion test causality verified: focused memory1/1 and isolated memory/Redis
transports27/27 passed with zero skips. Ignored runtime mutation fixture restoring
prior socket-close-only behavior fails at the bounded disappearance assertion
(Frame timeout after3s); production source untouched. Test review found no blocker.
Evidence retained under deletion-causal. Deferred helper also attaches its capture
rejection handler immediately and cleans held requests on failure; prevents a
slow locator from producing an unhandled rejection before the intended assertion.

Deferred red63019 terminal1 with BOTH intended failures: delayed save and delayed
read each leave the retained Rose look falsely marked worn and Wear disabled after
legacy Rowan selection and reopen. Both actual captures inspected. Preserved red
results/log, verified staged base hashes, then integrated the reviewed deferred
refresh and real delayed read/save regressions. Refresh waits for a pending action
to settle and preserves uncertain retry identity; a microtask runs after the account
controller releases its busy guard. Added corrected-state screenshots. Frozen25
source hashes retained at reopen-deferred/integrated-source-hashes.json.

Verification66307 is live, queued under the shared browser lock with isolated Redis
for shared/editor/core. Final read-only review found no remaining blocker. Frozen25
source hashes match after review. Existing server32e2b61d now has all10 hosted checks
successful, including aggregate preview; client remains uncommitted. Rollout's
staged paused-message UI was rebased onto deferred refresh so later integration
cannot overwrite it; prior staged copy/manifests retained in before-deferred-refresh.
Do not restart66307 on observation timeout or edit its source until terminal.


Verification66307 terminal0 at 2026-10-16T05:39:34Z: shared37 and editor21
checks passed; core11 tasks passed with isolated Redis. Tooling117, preview3350
passed with1 existing skip/1 existing TODO, server873 zero skips, desktop69,
Python141/66warnings. Both delayed-save/read corrected captures inspected: retained
Rose look, accurate saved/unsaved state, Wear enabled after legacy selection.
All25 frozen source hashes match. Evidence preserved under
.runtime/character-studio/client-verified-20261016. Earlier full18-task gate is
separate baseline evidence; later reopen changes have focused browser plus core
coverage. Independent review found no blocker. Commit this client increment to
draft464; no merge, deployment, human/device or production acceptance claimed.

Production account deletion work remains staged only under deletion-hook. Signed
raw-body webhook and durable-tombstone auth revocation tests passed78/78 with
isolated Redis, zero skips; retries and late login/refresh/desktop exchange are
covered. Seven production wiring files are staged against their current bases,
not integrated. Still require real signed webhook to session revocation and peer
disconnect, factory wiring verification and subsequent gates. Rollout pause/disable
work remains separately staged. No provider calls or new auth schema.


Client49d1475a16839d8944ef5002cc0b5c29b422d30e signed/pushed to draft464;
SSH signature and attribution checks passed, remote head confirmed. PR description
and issue443 progress updated. Hosted checks are running; no merge/deployment.

Deletion hook integrated after reviewed staging. Real composed memory red proves
a signed erasure previously left issued sessions authenticated; now green. The
real Redis journey exposed resolved kick failures being discarded by the gateway
(200 instead of503). Review confirmed; gateway now rejects unsuccessful kick
results and the duplicate-delivery test retries real cleanup. Final focused
integrated suite90/90 passed, zero skips, with isolated Redis. Production factory
tests exercise standalone removal, disabled/local-fixture routes, Redis account
namespace and hosted rewrite. Credentials remain absent; all provider identities
are fixtures. Pending full/core gate before committing this increment.


Deletion full77638 live under browser lock with isolated Redis; server899 zero
skips and13 experience journeys passed, shared journeys running. Frozen source
hashes still match. Client49d1475a has all10 hosted checks passed, including
aggregate preview; issue443 updated. No deletion commit until full gate terminal.

Separate preparations: rollout staged copies rebased onto deletion auth/kick
wiring and corrected deletion-test causality;7 real memory/Redis tests pass.
Metrics staged under .runtime/character-studio/metrics: fixed operation/outcome
and timing-bucket aggregates, disabled by default, no caller payload/ID storage.
Review found async sink rejection; reproduced then fixed.5 tests pass including
real HTTP success/conflict/paused/abort accounting; production wiring remains open.
Additional raw-socket aborted-webhook diagnostic passes without invoking deletion
or crashing the handler; production source was unchanged.

Custom crowd diagnostic68651 queued after full: adapted existing rendered
multiplayer audit, canonical viewer and alternating Sable human/fox peer revisions,
HTTP save/publish and WS equip, actual material-color checks.1/8/16 players,30s
measurement plus10s warmup per tier; desktop and phone viewport on this host GPU.
Reviewer confirmed fixture/reconnect/teardown, and its output default was changed
to a dedicated ignored receipt. This is not a physical-phone or approved-device
performance gate. Source and full verification remain frozen while these run.


Deletion full77638 terminal0 at2026-10-16T06:19:48Z: all18 tasks passed.
Tooling117, preview3350 with1 existing skip/1 existing TODO, server899 zero
skips, desktop69, Python141; dependency audit/history/security/reflections,
13 experience and22 shared journeys including Character Studio, and IPIC
screening all passed. All15 frozen source hashes match. Receipts/logs/reports
preserved under deletion-hook/full-verified-20261016; generated tracked reports
restored. Reviewed deletion increment is ready for signed commit to draft464.
Live provider delivery and production configuration remain unverified.

Crowd68651 terminal1 before rendering: fixture used invalid movement walk.
Preserved failed log/script under crowd; corrected to canonical upright and
started30680 under the browser lock. No performance measurements yet.
Telemetry staged9 tests pass, including regression for actual policy denials
previously misclassified as outages; two real memory/Redis HTTP+WS accounting
tests pass without skips. Read-only review found no staged wiring blocker;
production collector environment/lifecycle wiring remains open. Source edits
remain frozen during the corrected crowd run. No merge or deployment.


Deletion d4301110cc0af2e28424db625c12f78557b49970 signed and pushed to
#464; signature/attribution and remote head verified. PR description and existing
issue443 progress updated with full18 evidence; exact-head hosted checks running.

Crowd30680 terminal1 after desktop1: unsupported fixture ID sable-fox. Canonical
fox ID is woman-casual. Preserved both failed fixtures, added definition preflight
and verified draft/publication/selection for both forms before rerunning72299.
Run72299 terminal0 with six samples; source hashes match d4301110 before integration.
Desktop1/8/16 p95=33.4/16.8/33.4ms; same-host phone viewport=33.3/16.7/33.4ms.
No desktop performance acceptance; physical devices remain untested. Desktop/phone
16-player captures inspected: material identity visible, overlapping name labels
obscure crowd. Full receipt/script/captures/findings retained under crowd.

Rollout integrated after all measurement handles terminal and19-target dry-run
hash validation. Reviewed gate preserves deletion wiring and accepted receipt
recovery, defaults production enablement off, and keeps legacy/read/render paths.
Actual integrated account23/23 and memory/Redis transport7/7 pass, zero skips.
Integrated source hashes frozen in rollout/integrated-source-hashes.json.
Live14376 runs shared Character Studio, disabled/paused/editor browser journeys
and core with isolated Redis under the shared browser lock. No rollout commit
before verification. Telemetry remains staged separately, including reviewed
HTTP/WS accounting; collector production opt-in/lifecycle remains outstanding.


Rollout14376 terminal0 at2026-10-16T06:33:59Z: shared37 checks;
disabled6/paused6/editor21 checks; core11 tasks passed with isolated Redis.
Tooling117, preview3351 with1 existing skip/1TODO, server901 zero skips,
desktop69, Python141/66warnings. All19 source hashes match. Actual disabled
capture preserves authored picker with no Studio entry; paused capture retains
Rose and clearly explains saved/local edits are safe with Retry. Evidence retained
rollout/verified-20261016. Ready for signed rollout commit to draft464.
Deletion d4301110 now has all10 hosted checks green including aggregate preview.

Telemetry factory lifecycle is staged and reviewed: strict env1 opt-in, collector
owned by town/gateway unless caller injects it, flush on close/failure, no per-request
payload log. Memory/Redis production-factory and transport tests4/4 pass without
skips in addition to9 focused tests. Gateway replacement retains the injected
collector and records paused attempts after replacement. No production telemetry
integration yet; do not rerun old staged generators over lifecycle changes.


Rollout51c5a6bcbf38c5e7a3a73f8a4e6f505c414beee7 signed/pushed to draft464;
PR description and issue444 updated. Current continuation rechecked exact remote
head, clean tracked state and existing ownership; previous turn was progress.
Telemetry15-file candidate normalized imports and diff reviewed against current
rollout/deletion. Integrated strict server-only opt-in, fixed aggregate counters,
HTTP/equip observations and owned/injected collector lifecycle. Additional malformed
selection/owner/definition classification regression failed before adding actual
policy codes, then passed. No request payloads or IDs enter metrics.
Focused integrated61848 now runs13 metrics plus7 equip and4 deletion-factory tests
with isolated Redis. Update source hashes after docs/env config; run core and
shared browser gate before commit. All visual/device/human gaps remain open.


Metrics verification recovered at continuation: previous goal work made concrete
progress by integrating and verifying metrics; intervening plaza work is separate.
Frozen16 source hashes still match the actual integrated files. Focused24 tests
passed with no skips; shared Character Studio37 checks passed. Core54204 terminal0
at06:42:53Z: all11 tasks passed, tooling117, preview3351 with1 existing skip/1TODO,
server914 with zero skips, desktop69, Python141/66warnings. Independent integrated
review found no blocker. Receipts/logs/hashes preserved in metrics/verified-20261016.
Rollout51c5a6bc has all10 hosted checks green. Sign/push the telemetry increment
and update issue444; then fix demonstrated crowd nameplate overlap while preserving
avatar visibility. Seated garment, full visual matrix, device/performance, human
acceptance and production/provider activation remain open.


Telemetry9b1bbb18 signed/pushed to draft464, PR and issue444 progress updated;
all10 exact-head hosted checks passed. Crowd label fix followed the measured
overlap defect. Controller regression failed3 visible overlapping names versus1;
implemented measured label packing with speaker/nearby priority, stable distance
preference, cached dimensions and invalidation/disposal. All avatars remain visible;
audit checks every anchor independently plus label containment/non-overlap.
Read-only review found no blocker.

Labels35870 completed six crowd samples and shared37 checks, then core stopped on
an office test fake DOM missing getBoundingClientRect. Retained failed receipt/log.
Added the fixture method and an isolated seated-peer visibility assertion;32 focused
tests passed without skips. Production source and six rendered samples unchanged.
Core23830 recheck passed11/11 with isolated Redis; frozen8 source hashes match.
Crowd19 source hashes also match; actual desktop/phone16 captures inspected.
Desktop8/16 retain3/7 readable labels, phone8/16 retain2/4, all peer anchors and
canonical materials preserved. Frame p95 remains33.4ms; desktop16 CPU31.7ms,
phone16 CPU31.6ms. This is not performance/device acceptance. Receipts under
labels/verified-20261016. Next: signed label commit, update issue444, and separate
CPU profile at16 peers before performance changes. Staged profiler labels/cpu-profile.mjs
has not run; do not treat it as evidence. All garment/hero/device/human gaps remain.

Final label core counts: tooling117, preview3356 passed/1 existing skip/1TODO,
server914 zero skips, desktop69, Python141/66warnings;11 tasks passed.


Continuation at335a13c1: previous goal turn made progress through signed telemetry
and label delivery plus two16-player CPU profiles. No local handles remain live.
Profile source19 hashes matched; renderer pipeline inclusive sampled time was
74.95% desktop/77.42% phone, office panel checkVisibility6.57%/4.8%. Shorter frame
samples varied; no new performance acceptance. Own office-ui.js and its tests for
the measured fix. Separate250ms panel-visibility eligibility checks from5-second
request polling, retain immediate nearby/visit paths and hidden/disconnected gates.
Add behavioral call-count/responsiveness regression, actual office browser flow,
core and repeated crowd/profile measurements before claiming improvement.


Office polling verification completed with all4 runner stages passing; session11037
terminal0. Three behavioral regressions failed before the change, then focused37
passed; read-only review found no blocker. Office-visit11 browser checks passed,
including reduced motion, access denial and revocation. Core11/11: tooling117,
preview3359 passed/1 existing skip/1TODO, server914 zero skips, desktop69,
Python141/66warnings. Frozen5 patch/script hashes and both20-file profile/crowd
source maps match. Receipts, logs and profiles retained under
.runtime/character-studio/office-poll/verified-20261016.

Measured office native checkVisibility sampled self time fell6.57% to0.029%
desktop and4.8% to0.343% phone viewport. Browser counters obey the250ms bound.
The30-second repeats still have framep95=33.4ms; CPUsubmissionp95=30.1ms desktop
and29.6ms phone viewport. This proves removal of repeated office layout reads,
not overall target-device acceptance.15/15 peer anchors,8/4 readable labels,
material identity, transport/reconnect and cleanup remain verified. No visual change.

Offline avatar inventory completed: Sable human20 visible meshes/13 materials/
115196 triangles; woman-casual resolved Sable beast48/28/202382. Textures were
stubbed, so this is topology evidence only. Existing reference accessories already
batch by attachment/material. Inspect full-avatar draw costs before choosing the
next rendering optimization; preserve canonical identity and animation.


Office86cde3b03019abeb368d8a17578bfefdcbd57de5 signed and pushed to draft464;
all10 exact-head hosted checks passed, including aggregate preview. Own issue444
progress comment and PR updated. All local office/profile/core handles terminal0.

Seated garment work continues only in ignored diagnostics; no production geometry
change yet. Static drape/lip experiments and the first final-pose corrective still
intersected thighs; retained as rejected evidence. Fitting front vertices against
the actual posed upper-thigh surface and constraining triangle interiors produced
a relative morph reproducing the fitted pose within6.1e-9m. An initial activation
onset .8rad failed40/50-degree probes; .4 to1.4rad removes those intersections.

Latest prototype v5 subdivides each authored triangle into four (567 vertices,960
triangles) to preserve the standing surface, UVs and interpolated weights/normals.
At bend0/20/40/50/60/70/80/90, sampled front garment triangle centers and edge
midpoints have zero penetrations; minimum tested clearance is4.65mm at60 degrees
and7.64mm at90. Full seated minimum triangle area ratio .502; max edge stretch
2.524 remains an unapproved deformation-quality metric. These probes only cover
the front garment against a selected upper-thigh collider, not full collision or
all wardrobe/pose acceptance. Earlier dense-strip prototype waist drift<2e-10m.
Do not infer physical-device, other-form or continuous asymmetric gait acceptance.

Evidence: .runtime/character-studio/seat-morph-subdivision-proof.json and target.json;
source hashes in seat-morph-source-hashes.json. Generation helpers remain diagnostics
with texture stubs and expensive offline contact fitting. Never move raycasting or
iterative fitting into the frame loop. A relative GPU morph is the intended runtime
path; final integration still needs behavioral regressions, disposal and render
verification. Prototype browser captures at40/50/60/90 are a separate inspection.

Next implementation: make a reproducible pinned corrective bake with asset/source
receipt, preserve exact rest topology through triangle subdivision, install bounded
position/normal morph attributes on the existing skirt/skeleton, and drive only
the influence from bilateral hip flexion. Forward reference.update in human and
Sable look updates (currently missing), preserving Lyra behavior. Use thigh/calf
local transforms in the authored pelvis frame to avoid per-frame world traversal.
Test both forms, standing/walk restoration, asymmetric bends, transformed roots,
actual seat IK, source immutability and disposal before core/browser acceptance.
Reference accessory count9880 will increase by720 triangles; draw count is unchanged.
Do not publish the prototype as an accepted garment fix.

Exact v5 browser93244 terminal0 with no page errors. Inspected50-degree front/side/rear and90-degree front/side/rear/above captures. The lap now has continuous fabric in the overhead view; the short hem/slit and torso side cutout remain visible and are not full wardrobe acceptance. All prototype hashes still match; capture/report hashes added. No local process remains live. Next is implementation plus regression coverage, not another unbounded fitting search.


Seated garment integration, 2026-10-16 continuation at86cde3b0:
- Reused the owned persistence worktree and live register. Added shared authored
  skirt geometry, offline pinned bake/receipt, two relative GPU position/normal
  targets, and update forwarding for human and Sable forms. Existing geometry,
  skeleton/material ownership and draw count are retained; +720 triangles.
- The original runtime regression failed both forms (143 penetrating samples,
  worst43mm). A single bilateral minimum influence failed asymmetric60/90 bends.
  Split targets by existing thigh skin weights; each follows its own flexion,
  with bilateral walking gate. Refined offline clearance to28mm vertices/20mm
  triangle interiors. No per-frame contact solver or geometry mutation.
- Test fixture corrections: update attached bind inverses after root transforms;
  filter thigh skin by joint weights so hands at hip height are excluded. Actual
  test failures remain in /tmp/river-studio-skirt-*.log and are not passing proof.
- Focused10/10 passed: both-form walking/seat/restoration, symmetric0/20/40/60/90
  and asymmetric30/90,45/90,60/90 both directions under transformed roots, exact
  rest subdivision, source receipt and existing accessory/disposal suite.
- Browser character-poses31 and character-studio21 passed; actual seated contact
  has1006 samples/form, zero penetrations, minimum18.429mm. Inspected both seated
  forms, human walking and fox prowl/lope. Prescribed asymmetric geometry captures
  at30/90 and60/90 both ways show continuous drape without a visible normal seam;
  these use explicit influences and do not prove the runtime angle driver. Lower
  feet intersect the floor in the prescribed diagnostic because seat root height
  is retained; it is a garment-only inspection, not grounded-pose acceptance.
- Read-only reviewer independently verified split reconstruction errors below
  7.5e-9 positions/3.0e-8 normals, nondegenerate blended normals (min length.790),
  shared skeleton and exactly-once skirt geometry disposal. No blocking finding.
- Bake --check passed; core gate is running with disposable isolated Redis and
  frozen14 source/test hashes. Receipt/log path:
  .runtime/character-studio/skirt-integration/verified-20261016/.
- Full wardrobe/animation, approved deformation thresholds (bake max edge stretch
  3.346), authored cutout review, hero goldens, device/performance and human/live
  acceptance remain open. No merge/deploy. Do not mark the full goal complete.


Final skirt gate: runner85456 terminal0. Bake --check reproduces exact output and
receipt; core11/11 passed with isolated Redis: tooling117, preview3364 passed with
1 existing skip/1TODO, server914 zero skips, desktop69, Python141/66warnings. All14
frozen source/test hashes match. Browser49910 and asymmetric49884 terminal0;
52 browser assertions total,22 capture files and evidence hashes preserved under
.runtime/character-studio/skirt-integration/verified-20261016/. No source change
followed the gate. Shared multiplayer browser journey was not rerun for this local
morph change; prior shared37 remains historical evidence. Full browser/native,
live auth, approved devices and human acceptance are separate. Ready for signed
commit/push to existing draft464; all five issues remain open.
