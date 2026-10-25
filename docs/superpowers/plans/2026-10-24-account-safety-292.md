# Account safety for store readiness (#292, web and server)

Objective: complete account erasure, server-enforced player blocking, and in-app
account deletion behind a default-off flag, for #292 (App Review 5.1.1(v), 1.2).
This ledger covers increment A, erasure, and increment B, player blocking. In-app
deletion (C) and reports, support and the App Review map (D) follow in their own
branches.

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

## Increment B: player blocking

Branch `feat/player-blocking-292-20261024` in worktree `river-oaks-blocking-292`,
stacked on increment A's head `772e4ade`. What a block does, the routes, storage and
the Decisions for Val are in [player blocking](../../player-blocking.md).

Files owned:
- New: `server/blocks.js`, `server/blocks-api.js`, `preview/src/player-blocks.js`,
  `docs/player-blocking.md`.
- New tests: `server/tests/blocks.test.js`, `blocks-api.test.js`, `blocks-world.test.js`,
  `blocks-town.test.js`, `blocks-distributed.test.js`, and
  `preview/tests/player-blocks.test.js`.
- Changed: `server/app.js`, `distributed-app.js`, `social-api.js`, `profile-api.js`,
  `groups-api.js`, `world.js` (`separate`, `leaveHome`), `redis-room.js` (the
  `separate` operation), `world-gateway.js`, `town.js`, `redis-security.js` (the
  `blocks` scope), `vercel-routing.js`, the four game modules (`separate`), `vercel.json`,
  `preview/vite.config.js` and `.env.example` (`BLOCKS_FILE`; `docs/multiplayer.md`
  belongs to `crime-release-599`, so its environment table isn't changed here).
  The erasure, routing and game tests gained cases.
- Not changed: `preview/src/multiplayer-client.js` and `preview/src/main.js` belong to
  `outdoor-residents-admin-controls-20261024`, so the client module is not wired in.
  `docs/player-blocking.md` lists the four calls that wire it.

Each new guard was checked by removing it and watching its test fail: snapshot
filtering, the cross-gateway sync, the erasure step in both architectures, the Vercel
route, the absent-resident answers, the request race, greeting and game invitation
clearing, and the stored-world pass.

| Check | Result |
| --- | --- |
| `pnpm run test:server` with `REDIS_URL` (isolated 6421) after the review fixes | 1222/1222, 0 skipped |
| `preview/tests/player-blocks.test.js` | 3/3 |

Independent review (2026-10-24), first pass:

| Finding | Severity | Outcome |
| --- | --- | --- |
| The block routes were missing from `vercel.json`, `vercel-routing.js` and the Vite proxy, so blocking was unreachable on the hosted deployment | High | Added; routing test, red without the allowlist entry |
| Contact actions refused a blocked resident before their own validation, so crafted requests told a block from a removed contact | High | Checks run against a resident who is never present; 22 crafted-body comparisons |
| Darts, axe and dominoes invitations were not screened or ended | Medium | Darts and axe invitations take the absent-resident path; every game module ends an invitation between the pair; views drop invitations that involve a hidden resident |
| On the hosted path a block reached only worlds loaded on the receiving gateway | Medium | A block involving Jevica reaches every loaded or stored world, one failure is logged and skipped; stored-world test |
| The standalone town lost blocks on restart | Medium-low | `BLOCKS_FILE`, atomic and mode 0600; reopen test |
| Greetings of a hidden resident still reached the viewer | Low | Filtered from players and the interactions list |
| Join-window and periodic-sync races, a request racing a block, failure after the block was stored, the reverse index read every five seconds, non-atomic Redis erasure | Low | Per-account version and a newest-read-wins load; recheck after a request; 503 and retry, and unblock removes a leftover contact; sync reads the version only; erasure runs twice |
| Jevica's invitations can't be indistinguishable | Note | Decision 2 |
| Tests that claimed more than they checked | Test | Live-socket controls, unblock travel, production sync, routing test |

Second pass, on the fixed tree: findings 1, 2 and 4 to 7 and 9 confirmed fixed; 3 fixed for
darts and axe throwing. New or remaining:

| Finding | Severity | Outcome |
| --- | --- | --- |
| A chess or café invitation hidden from both sides let its blocked sender notice it vanish | Medium | It stays in its sender's view and reaches the invited resident as nothing; red without the rule |
| A block involving Jevica reached stored worlds one after another inside the request | Low-medium | Reached together; the wait is the slowest world |
| Town tests without `BLOCKS_FILE` wrote `.runtime/blocks.json` | Low | The file is written only when a list changes; the stray file from this session's run is removed |
| A stale Unblock ended a live contact | Low | Only with the resident's own block; red without the check |
| A failed file write left the town's memory changed | Low | Written from a copy before it applies; tested with a read-only folder |
| A failed room separation skipped the immediate socket refresh | Low | Refreshed in `finally` |

The `app.js` join path also had an `await` between reading the old connection and
registering the new one (added in this increment). The hidden set now loads before
that block, which stays synchronous.

## Gaps and decisions

- The lantern walk's record round keeps lamplighter display names with no account
  id; erasure cannot attribute them. Bounded to one record.
- A request authorized just before revocation can commit after its store's
  erase step and leave one record. In-app deletion (C) narrows this by running the
  erasure again after the provider deletion; the webhook retry does not.
- Bans, the moderation audit and the Redis security audit are kept (Decision 3).
  Deleting an account and signing up again gets a new WorkOS id and so evades a
  ban; a hashed tombstone is a Decision for Val, not implemented.
- Desktop (`desktop/`) is owned by another session; its local state is listed, not
  changed.

## Next action

Increment A is draft PR #661 (head `772e4ade`). Hosted CI is green apart from the
aggregate. `verify full` on that head: the first run failed one Redis distributed test
on timing (it passed 3/3 alone). The rerun passed every non-browser stage, including the
server with Redis at 1192/1192; its browser stage waits on the shared lock.

Increment B: second review pass, `pnpm run verify` when the load is under about 20, a
signed commit and a draft PR stacked on #661. Then increment C (in-app deletion).
