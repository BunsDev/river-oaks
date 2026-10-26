# Account safety for store readiness (#292, web and server)

Objective: complete account erasure, server-enforced player blocking, and in-app
account deletion behind a default-off flag, for #292 (App Review 5.1.1(v), 1.2).
This ledger covers increment A, erasure. Blocking (B), in-app deletion (C) and
reports, support and the App Review map (D) follow in their own branches.

Owner: `claude:river-oaks-0b (ebc46c90)`, task `account-safety-292-20261024`.
Worktree `river-oaks-account-safety-292`, branch `feat/account-erasure-292-20261024`,
created from origin/main `1fd53fb9`.

Authority (Val, 2026-10-24 `/goal`): signed commits, own branches, draft PRs, one
#292 evidence comment per increment, a local Redis. Not authorized: merging or
landing, deploys, real WorkOS calls, production Redis, turning a deletion flag on
outside local tests.

## Files owned (increment A)

- New: `server/account-erasure.js`, `docs/privacy-data-inventory.md`, this ledger.
- New tests: `server/tests/account-erasure.test.js` (Redis backend over the signed
  webhook), `account-erasure-town.test.js` (standalone town over real HTTP and
  WebSocket), `account-erasure-world.test.js` (world checkpoint),
  `account-erasure-stores.test.js` (every store twin, and the orchestrator).
- Changed: each store gains `eraseUser`: social, groups, profiles, presence, events,
  design library, office desk, avatar preferences, cycling miles, landmarks,
  debug reports, waitlist (file and Redis). The GitHub name stores gain `delete`.
  `auth.js`/`redis-auth.js` `revokeUser` also drops the stored GitHub name;
  `dev-auth.js` gains `revokeUser`. `world.js` gains `forgetAccount`, and offices,
  campus leases, screenings, the lantern walk and the four game modules gain
  `forget`; `ride-flush.js` gains `forget`. Crime state is not edited here:
  `server/crime.js` belongs to `onfoot-encounter-640` (PR #646), so erasure clears
  wanted stars with the existing `arrest`, and cooldowns and receipts lapse within
  a minute.
  `redis-room.js` gains the `forget` operation; `app.js` and `distributed-app.js`
  gain `forgetAccount`; `world-gateway.js` exposes `accountSteps`; `town.js` and
  `redis-backend.js` wire `createAccountErasure` into the webhook.

## Baseline (red, before any change)

`server/tests/account-erasure.test.js` seeds Erin and Pat into every store the Redis
backend builds, then delivers a signed `user.deleted` for Erin. On `1fd53fb9` it
failed with 22 keys still holding Erin: presence, store intros, waitlist usernames,
pending and users, landmarks, voice lease and index, profiles, cycling totals and
riders, the GitHub name, design library, office desk, both social indexes and the
pair, events, group records and index, avatar preferences and debug reports. Only
the character store was erased.

## Results

| Check | Result |
| --- | --- |
| Baseline webhook erasure test on `1fd53fb9` | Failed: 22 Redis keys still held the account |
| Same test after the change (isolated Redis 6421) | Passes: only the hashed tombstone and a room reply (TTL 15 s or less) remain |
| `account-erasure-stores.test.js` (memory and Redis) | 27/27, 0 skipped |
| `account-erasure-world.test.js` | 5/5 |
| `account-erasure-town.test.js` | 1/1 |
| `pnpm run test:server` with `REDIS_URL` (isolated) | 1160/1160, 0 skipped (before the store and world tests were added) |
| After both 2026-10-26 reviews, merged with main `09233cdd`: erasure, screenings, cycling, WorkOS, routing and town files with `REDIS_URL` | 94/94, 0 skipped |
| `pnpm run test:server` with `REDIS_URL`, same tree, load 42–46 | 1241/1243, 0 skipped. The two failures, a district epoch switch and a district height recovery, are each a `join` after a room restore; they pass alone and as whole files (28/28), and neither file nor the join path is changed here |

## Independent review (2026-10-24)

A separate agent read the diff with no access to this ledger. It found:

| Finding | Severity | Outcome |
| --- | --- | --- |
| Forgetting a lamplighter of a finished, still-celebrating round left a checkpoint that cannot be restored, so the world would fail on its next lease | High | Fixed in `lantern-walk.js` `forget`; regression in `lantern-walk.test.js` (red before, green after) |
| A ride banked by the erasure's own kick re-created the ride total after the cycling step | Medium | The room's `forget` drops the drained and queued metres and waits for a running bank (`ride-flush.js` `forget`); cycling and the stored look now run in an `after` stage; regression in `ride-flush.test.js` |
| A Redis waitlist name hold from an earlier login kept the raw id | Medium | Erasure now sweeps holds by value; the waitlist case renames twice (red before, green after) |
| The world step loaded every catalog world | Medium | Only loaded worlds or worlds with a checkpoint; a world that cannot load fails the step |
| One Lua script scanned the whole waitlist | Medium-low | The account's own records stay atomic; mentions go in HSCAN batches of 250, each re-read inside its script; the audit list (capped at 10,000) stays one script |
| Game tables kept an erased player while the opponent stayed seated | Low-medium | `forget` in the chess, cafe, darts and axe modules; regression in `table-games.test.js` (red before, green after) |
| Kept creations under `erased-account` counted against one owner's limit at restore | Low | Exempt at restore; the town-wide limit still applies |
| Waitlist ids of 101–128 characters made erasure throw | Low | An id the waitlist refuses has no records there; erasure is a no-op |
| Wish lines matched by display name | Low | Documented: only Jevica's owner accounts grant wishes |
| A LiveKit failure after the lease goes is swallowed | Low | Documented: the voice sweep removes participants with no lease |
| Single-flight could absorb increment C's second run | Note | C will start its second run after the first settles |
| A trivial assertion (`usernameOf(pat) === null`) | Test | Removed |

Found while fixing, not changed here: the waitlist's request path does not release
a name hold when a GitHub login changes, so the old name stays taken for everyone.
That is outside erasure and is left for its owner.

## Lander review (river-oaks-e9, 2026-10-26)

The lander's independent review of PR #661, each finding fixed red first:

| Finding | Severity | Outcome |
| --- | --- | --- |
| A profile save let in before revocation, whose body arrived after the run, wrote a fresh record | Medium | Each request is recorded under its WorkOS event id before it runs; a second whole run follows a minute after the first. `account-erasure-late-write.test.js` holds a real POST body across the run (red without the second run) |
| One world that could not load stopped the others from forgetting the account | Medium | `eraseEach` in the gateway and town worlds and landmarks steps. Regressions with a broken first world: town and hosted worlds, hosted landmarks (each red with the old loop). The town's landmark stores are in memory and cannot fail, so that loop has no failure case to test |
| A failed request left no durable record, and failures did not name the event | Medium | Memory and Redis pending stores, swept on a 30 s timer or the Vercel cron `/api/erasure-sweep`; every failure logs the event id and step names, never the account |
| Four mutations (after-stage order, drained-ride splice, room ride forget, app ride forget, non-ok room answer) survived | Medium | `account-erasure-pending`, `account-erasure-room` and `cycling-flush` tests; each mutation now fails exactly one test |
| Another host's screening receipt kept the erased host | Low | Receipts naming the host are dropped; `screenings.test.js` (red before) |
| A ride `ADD` for a tombstoned account, builds left by an erased owner, event-id dedupe | Low | Recorded: inventory Decision 4 (builds); the second run covers late ride adds |

A second agent reviewed those fixes with no access to this ledger:

| Finding | Severity | Outcome |
| --- | --- | --- |
| On Vercel without `CRON_SECRET` nothing sweeps, so no second run and records keep ids | Medium | The backend logs `account_erasure_sweep_unscheduled` at every start; `.env.example` and the inventory say so; regression in `account-erasure.test.js` (red without the log) |
| The per-world fix had no regression | Medium | Town and hosted tests above (each red with the old sequential loop) |
| The second pass deleted a newer record another server had written | Low | Compare-and-delete in both stores (Lua on Redis); contract test for both (red with HDEL) |
| A sweep that could not list the records was silent | Low | Logs `account_erasure_sweep_failed`, with no account |
| "15-second timeout" and "about a minute" were loose | Low | Docs give about 45 s for a body and up to six minutes on Vercel; a test ties `ERASURE_SETTLE_MS` to each server's request timeout plus Node's check interval (red at 40 s) |
| A query string skipped the Vercel entry's cron gate | Low | The entry matches the path without its query, for all three crons; regression (red before) |
| `process.env` restored wholesale; a fixed 50 ms wait after releasing rides | Test | Restored per key; the room tests await every add (the splice mutation still fails) |
| Sweeps have no backoff or claim across instances | Low | Recorded below |

The same agent then checked those fixes. All held; it found four low items, each fixed:

| Finding | Severity | Outcome |
| --- | --- | --- |
| A record that parses but isn't in the written form (keys reordered, a field missing or added) was rerun on every sweep and never dropped | Low | It is treated as a first run, which rewrites it; Redis test with four such records (red before) |
| The inventory's line references had moved | Low | Updated |
| The margin test checked `createGameServer`, which doesn't listen in production | Low | It also checks the world router and the hosted world server (red with the router at 60 s) |
| The landmarks loop had no regression | Low | Hosted test with one world's landmark delete failing (red with the old loop) |

## Gaps and decisions

- The lantern walk's record round keeps lamplighter display names with no account
  id; erasure cannot attribute them. Bounded to one record.
- A request authorized just before revocation can commit after its store's erase
  step; the second run a minute later erases it. A store call that stalls longer
  than that, past every server's request timeout, is not covered.
- Sweeps have no backoff and no claim across servers: with several long-lived
  gateways, each runs a due second pass, and a request that keeps failing (a world
  that cannot load) reruns every 30 s on each, logging each time. Erasure is
  idempotent, so this costs load and log volume, not correctness. Adding a per-record
  lease and an attempt count is the follow-up.
- Bans, the moderation audit and the Redis security audit are kept (Decision 3).
  Deleting an account and signing up again gets a new WorkOS id and so evades a
  ban; a hashed tombstone is a Decision for Val, not implemented.
- Desktop (`desktop/`) is owned by another session; its local state is listed, not
  changed.

## Next action

Draft PR #661. After the lander's review: `pnpm run verify` when the load is under
about 20, signed commits (the merge of main, then the fixes), push, hosted CI, and
hand back to river-oaks-e9, which lands it. Then carry the new erasure API into B to E.
