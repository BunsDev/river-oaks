# Character Studio persistence (#443)

Objective: owner-scoped durable drafts, immutable published revisions and stable
peer identity through conflicts, retry, reconnect, rollback and account deletion.
The full #440–#444 goal remains active; #442 seated garment acceptance is failed.

Base: render14031163218199aa404734d63545f9ba2d30a326, draft #462, stacked on
#461/#457. Prior turn delivered reviewed pose diagnostics/core verification and
concrete failed visual evidence; it made progress, not completion. Existing
contract/catalog validates canonical assets and permission-safe looks. No routes
or publication are enabled until their authoritative integration is verified.

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

Status: implementing first store contract. Nothing in #443 is delivered yet.


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
