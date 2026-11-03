# #287 mobile sign-in design and host-independent server tests

Task `ios-auth-design-287-20261027`, branch `feat/ios-auth-design-287-20261027`,
worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-ios-auth-287`, from
origin/main `5541f831` on 2026-10-27. Owner `claude:river-oaks-ac-sub-287`.

## Objective

Deliver the four items from the 2026-10-22 goal prompt on #287 so implementation
can start when the #286 host exists: the sign-in design (`docs/ios-auth.md`), the
App Review 4.8 note inside it, focused server regressions for
`/auth/desktop/exchange` and the gates after it, and the #286 unblock list.

## Files owned

- `docs/ios-auth.md` (new): flows, exchange, outcome table, storage, logout and
  revocation, gates, origin contract, 4.8 note, regressions, unblock list,
  decisions, gaps.
- `server/tests/native-exchange-access.test.js` (new): standalone and hosted
  regressions over real HTTP and WebSocket with synthetic WorkOS/GitHub fixtures.
- This ledger.

No production source changed: no test exposed a defect. `docs/app-review-292.md`
is owned by another task and was not touched; the 4.8 note lives in
`docs/ios-auth.md` and links to it.

## Source read before writing

`server/auth.js`, `server/redis-auth.js`, `server/magic-auth.js`,
`server/app.js` (ticket, asset gate, upgrade), `server/distributed-app.js`,
`middleware.js`, `server/asset-gate.js`, `server/waitlist-routes.js`,
`server/waitlist.js`, `server/moderation.js`, `server/redis-security.js`,
`server/ticket-policy.js`, `desktop/auth.js`, `desktop/main.js`,
`preview/src/access-entry.js`, `experiments/ios-probe/Sources/ProbeCore/DeviceAuth.swift`,
`experiments/ios-probe/App/ProbeApp.swift`, `experiments/ios-probe/App/ProbeHTTP.swift`,
the fixtures in `server/tests/` (`workos-sdk-fixture.js`, `redis-auth-fixture.js`,
`github-fixture.js`, `waitlist-fixture.js`, `reports.test.js`,
`hardening-tickets.test.js`, `hardening-asset-gate.test.js`, `auth.test.js`,
`account-deletion.test.js`). WorkOS docs fetched: the Apple integration guide
and the CLI/device authorization guide (refresh tokens rotate on use;
`invalid_grant` means discard and restart).

## Checks and results

| Check | Result |
| --- | --- |
| `node --test server/tests/native-exchange-access.test.js` (no Redis) | pass 1, skip 1 (hosted) |
| `REDIS_URL=redis://127.0.0.1:56371/0 node --test server/tests/native-exchange-access.test.js` (isolated `redis-server --save '' --appendonly no`) | pass 2, skip 0 |
| Mutation check: remove the exchange `Origin` check in `server/auth.js` | test fails (`https://evil.example` got 200); restored |
| Mutation check: do not consume the ticket in `server/app.js` upgrade | test fails; restored |
| `REDIS_URL=redis://127.0.0.1:56371/0 pnpm run test:server` | tests 1369, pass 1369, fail 0, skipped 0 (102 s) |
| `PATH=/opt/homebrew/opt/python@3.12/libexec/bin:$PATH nice -n 19 pnpm run verify` (core, load average 17–26) | passed; receipt `.runtime/agent/core.json`: agent-tests, preview-tests, server-tests, desktop-tests, build, python-lint, python-format, python-tests, demo, demo-verify, secrets all `passed`. Console counts: agent 289/289 (0 skipped); preview 4284/4285 (1 skipped); server 1048/1327 (279 skipped, the Redis cases: core sets no `REDIS_URL`; the Redis run above had 0 skips); desktop 127/132 (5 skipped); gitleaks no leaks |

Skips: browser journeys not run (not authorized, not in scope). Live WorkOS,
Apple, Turnstile and device round trips are out of scope; synthetic fixtures
do not close them.

## Gaps

- The route answers 503 `auth_unavailable` for a replayed or expired refresh
  token (WorkOS 400 `invalid_grant` hits the catch-all). Not a security defect;
  recorded for Val, not changed.
- `AppleOAuth` is refused by `SESSION_METHODS`; enabling Apple is a server change
  with its own regressions (listed in the doc).
- The probe stores the cookie in the default WebView store, not the Keychain.

## Decisions for Val

See `docs/ios-auth.md#decisions-for-val`: Decision 4 (Apple vs email-only),
email codes through the device flow (outside River Oaks' budgets), 403 vs 503
for a spent token, and the bundled-origin contract in #286.

## Next step

Open the draft PR, post one evidence comment on #287, hand off with the
register `nextAction` pointing at Val's decisions and the #286 dependency.
