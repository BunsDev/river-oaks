# Account safety for store readiness (#292, web and server)

Objective: complete account erasure, server-enforced player blocking, and in-app
account deletion behind a default-off flag, for #292 (App Review 5.1.1(v), 1.2).
This ledger covers increment A (erasure), B (player blocking) and C (in-app deletion,
off by default). Reports, support and the App Review map (D) follow in their own
branch.

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

Lander review (river-oaks-e9, 2026-10-26), each finding fixed or covered red first:

| Finding | Severity | Outcome |
| --- | --- | --- |
| Campus guest grants outlasted a block, and a new grant between the two was accepted | Medium | `world.separate` ends grants either way through `campus.separate` and walks the guest out; a grant toward a blocked resident names its sender instead, so the world answers `campus_invalid_guest`. World and hosted tests (red without each half) |
| The join snapshot's filtering had no test | Medium | A reconnecting socket's first frame hides earlier lines, town and hosted (red with the filter removed) |
| A block that answered 503 left the contact in both lists and invitable to a group | Low | The settle runs in `finally`; lists already hid it, and the group invite now checks the block; `blocks-api.test.js` (red without the check) |
| A third party's greeting toward a hidden resident still showed | Low | Hidden from the viewer; `blocks-world.test.js` |
| `separate` with nothing to end bumped the world revision; removing a block that did not exist bumped versions | Low | Bumped only when something ended or existed, memory and Redis |
| A group's latest line from a hidden resident was shown | Low | Covered: the list shows none when the latest is theirs (red with the filter removed) |
| The blocks step belongs in erasure's `after` stage; MGET and rebuild only when needed | Low | Recorded, not changed |

Found while fixing: on the hosted path a block between two residents reached only
worlds loaded on that gateway, but campus guest access outlasts either of them being
in the world. Such a block now also reaches the default world, which serves the
campus, if it is loaded or stored; `blocks-distributed.test.js` (red without it).
A retry of a campus grant first sent before the block is answered as a conflicting
operation (`docs/player-blocking.md`).

A second agent reviewed those fixes with no access to this ledger. Every claim held but
the third-party greeting; mutations of each fix went red except two:

| Finding | Severity | Outcome |
| --- | --- | --- |
| A third party's greeting toward a hidden resident still played: a snapshot gives a greeting as the gesture too | Low-medium | The gesture goes with it; the fixture now matches a real snapshot (red before) |
| A grant checked before a block was stored could land after its separation and keep access, longest on the hosted path | Low | Once a campus grant or Jevica's invitation succeeds, the server checks again and ends it; `blocks-campus-race.test.js`, town and hosted (red before) |
| The campus walk-out and the lease version bump had no test | Low | `blocks-world.test.js` unit case (red with either removed) |
| An unblock loaded the stored default world | Low | Reached only for a block; not tested |
| `updatedAt` could go backwards across gateways; Redis remove left a stale reverse entry | Nit | `Math.max`, as `end` does, tested with a clock a minute behind; remove clears both and bumps if either went. Both red before |
| Docs: the campus exception to "never told", the grant names its sender, operator offers | Doc | Corrected; operator offers listed as not covered |
| `campus.separate` also edits an inert campus section | Nit | Kept, as `forget` does: access recorded there must not outlast a block if the campus is served again |

The same agent then checked those fixes: all correct, the race test genuine (red with
either server's recheck removed, or campus grants dropped from `grantedPeer`). Its nits:
a failed recheck was silent (now logged as `block_recheck_failed`), the sender's reply
still shows a grant ended by the recheck (documented), and the `Math.max` clamp had no
test (added, red with the raw time).

## Increment C: in-app account deletion

Branch `feat/account-deletion-292-20261024` in worktree `river-oaks-deletion-292`,
stacked on increment B's head `075e3876`. Off unless `RIVER_OAKS_ACCOUNT_DELETION=1`.
Behaviour, prerequisites and Decisions for Val are in
[in-app account deletion](../../account-deletion.md).

Files owned:
- New: `server/account-deletion.js`, `preview/src/account-deletion.js`,
  `docs/account-deletion.md`.
- New tests: `server/tests/account-deletion.test.js`, `account-deletion-town.test.js`,
  `preview/tests/account-deletion.test.js`.
- Changed: `server/auth.js`, `redis-auth.js` and `dev-auth.js` (`signedInAt`,
  `deleteProviderUser`, `clearSession`); `server/town.js` and `redis-backend.js` (the
  route); `redis-security.js` (the `account_deletion` scope); `vercel-routing.js`,
  `vercel.json` and `preview/vite.config.js` (the route); `preview/src/sidebar.js` (the
  control, refreshed when Account opens); `preview/src/settings-dialog.css`;
  `.env.example`; the inventory, security review and architecture docs.
- Not changed: sign-out in `preview/src/access-entry.js` (`touch-network-288-290`) and
  `preview/src/multiplayer-client.js` (`outdoor-residents-admin-controls-20261024`)
  still keeps device data. `clearAccountStorage` is exported for their owners.

Each guard was checked by removing it and watching its test fail:
- the sign-in time, in Redis sessions and through single-process refreshes;
- a WorkOS failure that isn't a 404;
- erasure before the provider;
- the recency check;
- the Redis scope;
- the flag, in the hosted backend and the town;
- the client's refresh fence, saved looks and world drafts, the exact phrase and the
  CSRF header.

Independent review (2026-10-24). It found no way around CSRF, the origin, the flag, the
phrase or the limit, and nothing erased before WorkOS deletes the user.

| Finding | Severity | Outcome |
| --- | --- | --- |
| The status check didn't refresh an expired access token, so the control vanished about five minutes after sign-in | High | The page asks `/auth/session` first. Server test pins that the route alone doesn't refresh; client test pins the order. Red without either |
| With the flag on and no webhook secret, "finishes on its own" could be false | Medium | With WorkOS the flag takes effect only with `WORKOS_WEBHOOK_SECRET`, otherwise it logs `account_deletion_off`. Tested in the helper, the hosted backend and the town |
| A lost answer or a timeout misled the resident | Low | A lost answer or a sign-out triggers a session re-check; 502 says "couldn't delete right now"; client test |
| `GET` answers with the flag off | Low | Kept on purpose: a 404 would log a failed request each time Account opens. It reveals only that deletion is off. Documented |
| Stale inventory row and line references | Low | Fixed |
| Focus fell to the page; the redirect after 1.5 s could cut off the announcement | Low | Focus goes to the status line, the field or the note. Continue button, then leaves after 10 s |
| A banned resident can delete and return under a new WorkOS id | Decision | Added to Decision 2 |
| Stale attempts count toward the limit | Note | Documented |
| No test for the desktop exchange's sign-in time | Test | Added for both stores; red without it |

| Check | Result |
| --- | --- |
| `pnpm run test:server` with `REDIS_URL` (isolated 6421), before review fixes | 1235/1235, 0 skipped |
| `pnpm test` (preview unit), before review fixes | 4108/4109, 1 skip that predates this change |
| `pnpm run test:server` with `REDIS_URL`, after review fixes | 1236/1236, 0 skipped |
| `pnpm test` (preview unit), after review fixes | 4109/4110, the same 1 skip |

Erasure's recorded second pass (2026-10-26, `9dfe0497` and the fix after it). With
increment A's pending record and sweep, deletion runs the erasure once; the sweep runs it
again and retries a failure. An independent review found:

| Finding | Severity | Outcome |
| --- | --- | --- |
| A Vercel preview could turn deletion on, but Vercel calls the cron only on production, so no second run or retry would happen | Medium | On Vercel the flag also needs `VERCEL_ENV=production`, else `account_deletion_off` with `cron_not_scheduled`. Helper and hosted-backend tests; red without the clause |
| Nothing tested that the second pass is wired | Medium | The town test asserts the request waits for its second pass; new tests capture the 30 s sweep timer in the town and the hosted backend, and none on Vercel. Red with no town timer, no town record, no Redis timer, and a Redis timer on Vercel |
| The docs claimed a hosted-backend test of the Vercel rule that didn't exist | Low | Added (no `CRON_SECRET`, preview, production) |
| "A minute later", and step 4 said WorkOS always sends `user.deleted` | Low | Wording fixed; the 404 case without a recorded request is named as the one gap |
| The town keeps its records in memory | Low | Documented: a restart skips the second run, and a failed run's retry unless a webhook covers it |

The reviewer's second pass found no regressions; its two notes are the town wording
above and the webhook gap below.

| Check | Result |
| --- | --- |
| Deletion, erasure, town deletion and webhook files with `REDIS_URL` | 76/77, then 1/1: the Redis erasure test (`account-erasure.test.js`, unchanged here) timed out at 10 s at load 68 and passed alone |

## Increment D: reports, support contact, App Review map

Branch `feat/account-safety-review-292-20261024` in worktree `river-oaks-review-292`,
stacked on increment C's head `b33ad8ec`. The guideline map, gaps and Decisions for Val
are in [App Review readiness](../../app-review-292.md).

Files owned:
- New: `preview/src/support-contact.js`, `docs/app-review-292.md`.
- New tests: `server/tests/reports.test.js`, `preview/tests/support-contact.test.js`.
- Changed: `server/app.js` and `server/distributed-app.js` (the report confirmation);
  `preview/src/sidebar.js` (Support in Account); `preview/src/settings-dialog.css`;
  `.env.example` (`VITE_SUPPORT_CONTACT`); `docs/architecture.md`,
  `docs/security-review.md`, `docs/player-blocking.md`, `docs/privacy-data-inventory.md`
  (report retention).
- Not edited, owned elsewhere: `preview/src/multiplayer-client.js` (the Report button
  sends only `disruption`; the Block button isn't wired in), `preview/src/main.js`,
  `preview/src/access-entry.js` (the sign-in and waitlist pages show no contact).

Red first: both report tests failed on the old confirmation ("Report sent to the town
moderators."). The town one also failed because the refusals had used up the reporter's
limit; the test now makes them from a third resident and checks that limit.

Mutation checks (each red, then restored):
- no reserved-domain check on an email address;
- no https check; no credential check; no `rel` on the https link;
- no named-host check; a loose address pattern.

Independent review (2026-10-24):

| Finding | Severity | Outcome |
| --- | --- | --- |
| The map called blocking met, but residents have no Block button: `player-blocks.js` isn't wired in (B) | High | The map marks it a blocking gap for the owner of `multiplayer-client.js`. The #292 B comment and the #665 body were corrected |
| The list of resident content missed direct messages, groups, public events and chosen usernames | Medium | Listed, with the filter's scope widened; none of them can be reported |
| GitHub tokens: WorkOS can hand the resident's token to the server (5.1.1(v)) | Medium | Now Decision 7: turn token return off; the code already falls back |
| "Saved for the moderators to review" promised a review nobody owns; the town log also drops old reports | Medium | Now "Report saved."; both losses documented; inventory retention corrected. Tests red first |
| The support contact isn't shown before approval | Medium | Recorded as a gap for the owner of `access-entry.js` |
| The address pattern allowed mailto fields (an added Bcc), direction overrides, trailing dots and IP hosts | Low | Plain ASCII addresses and named hosts only; tests red first |
| Dark-mode link contrast 2.97:1 | Low | `--hud-focus` in dark mode (#a8ecd6 on #203e43) |
| Hosted report test didn't block anyone; rate limits differ by server | Low | Block step added to the hosted test; the difference is documented |
| The sidebar wiring has no test | Low | Kept, as for deletion: no sidebar unit test exists. Recorded |
| "Every store forgets the account" contradicted the kept audit; audit formats differ; `import.meta.env` without `?.` | Note | Reworded; formats documented; `?.` used |

| Check | Result |
| --- | --- |
| `pnpm run test:server` with `REDIS_URL` (isolated 6421), after review fixes | 1238/1238, 0 skipped |
| `pnpm test` (preview unit), after review fixes | 4111/4112, the same 1 skip that predates this work |
| `pnpm run verify` (core) | passed |

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
- A Vercel preview with `WORKOS_WEBHOOK_SECRET` and `CRON_SECRET` would record webhook
  erasures that no cron sweeps (Vercel calls it only on production), keeping their
  account ids, with no warning; `account_erasure_sweep_unscheduled` covers only a
  missing `CRON_SECRET`. It matters only if WorkOS delivers to a preview. Follow-up on
  increment A: warn when not production too, and say so in the inventory. In-app
  deletion stays off on previews.
- The standalone town keeps erasure records in memory, while some of its stores are on
  disk. Example from river-oaks-e9's re-review of A: an `invite-redeem` let in before
  the deletion lands after the first run, and the town restarts inside the 60 to 90 s
  before the second run; the name and email stay in `WAITLIST_FILE`. Documented in
  `town.js` and the inventory; the follow-up is a file-backed record beside
  `BLOCKS_FILE`.
- Bans, the moderation audit and the Redis security audit are kept (Decision 3).
  Deleting an account and signing up again gets a new WorkOS id and so evades a
  ban; a hashed tombstone is a Decision for Val, not implemented.
- Desktop (`desktop/`) is owned by another session; its local state is listed, not
  changed.
- Hosted `preview experience (places)` failed once on #665 and once on #666, both in
  `office-computer-embed`. The #666 failure is a race in the journey, present on main:
  - `preview/src/access-entry.js` checks the session every 15 s and reloads when the
    account differs from `document.body.dataset.accountId`, which is set once at entry.
  - The journey switches accounts on a live page, then keeps working on it. The reload
    lands within 15 s of the switch; when the steps after the switch run slowly
    (8.5 s against 5 s in a passing run), it detaches the desk mid-click. The log shows
    the page navigating to its own URL.
  - The journey's tasks are retired, and the file isn't in #292's scope. A fix: wait for
    that reload after the switch, or have the journey assert the reload itself.
  - The #665 failure, a click inside the Computer frame after the first switch, has no
    diagnosis. Each PR used its one rerun.
- Hosted `preview checks` failed on #667's first head (`c7bcae1f`) in B's own test,
  `blocking keeps its own write limit`: 200, not 429. The hosted limiter counts per clock
  minute, and that run crossed a minute boundary (02:34:58-02:35:00Z). The test now fixes
  the security store's clock inside one minute (B commit `f9d865fa`, merged up the stack
  as `d06d9fcd` into C and `b626616b` into D). It's red without the fix when started a
  second before a boundary, and red when the limit is raised to 100.

## Next action

Status, 2026-10-26. river-oaks-e9 lands the stack in order (#661, #665, #666, #667,
#682), each after its own re-review and hosted CI; Val authorized that in e9's session.
The lander's reviews of #661 and #665 are fixed, each followed by two independent
reviews, and each increment carries the one below it. C now runs the erasure once and
relies on its recorded second pass. Each PR goes back to e9 after verify, push and
hosted CI.

Still open from the 2026-10-25 handoff:
1. Val decides on the numbered Decisions in `docs/app-review-292.md`, `docs/account-deletion.md`, `docs/player-blocking.md` and the inventory.
2. Owners to ask:
   - The owner of `multiplayer-client.js` and `main.js` (`outdoor-residents-admin-controls-20261024`): wire blocking with the four calls in `docs/player-blocking.md`, and add a report reason.
   - The owner of `access-entry.js` (`touch-network-288-290-20261024`): show the support contact before approval, and call `clearAccountStorage` on sign-out.
3. After the policy Decisions: a content filter and a moderator reports view. Both are gaps that block review.
4. Native work stays with #286, #287 and #293.
