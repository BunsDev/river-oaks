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
