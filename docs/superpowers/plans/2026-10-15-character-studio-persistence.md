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
