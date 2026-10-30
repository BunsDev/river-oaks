# iOS sign-in and protected service access

Issue [#287](https://github.com/BunsDev/river-oaks/issues/287), under
[#284](https://github.com/BunsDev/river-oaks/issues/284). Design for the native
host's sign-in, written against main `5541f831` on 2026-10-27, before the host
(#286) exists. It describes what the server already does, what the native app has
to do to fit it, and what still needs a decision. Nothing here is a live
acceptance: the server tests use synthetic WorkOS and GitHub fixtures, and the
only device evidence is the probe's GitHub route in
[iOS feasibility](ios-feasibility.md#origin-and-auth-investigation), whose
isolated round trip is still unverified.

Scoped rules that this design keeps: WorkOS identity, the waitlist, CSRF, the
sign-in rate limits, Turnstile on email starts, bans, one world per account and
server authority. No check is relaxed for the phone.

## What the server already offers

Both backends (`server/auth.js` for the single-process town, `server/redis-auth.js`
for the hosted gateway) serve the same routes with the same checks.

| Route | Who calls it | Checks before anything happens | Result |
| --- | --- | --- | --- |
| `GET /auth/login?provider=github` | Browser only | Sign-in rate limit (20 per address per 20 min); only `github` is a provider | 302 to WorkOS with PKCE; the state cookie `river_oaks_auth_state` binds that browser (20 min) |
| `GET /auth/callback` | Browser only | State in the table, state cookie equal, not expired, `code` present; the state is consumed before the code exchange | Sealed session cookie, or 303 to `/auth/verify` when WorkOS wants email verification |
| `POST /auth/email/start`, `/auth/email/verify` | Browser | Same origin, JSON, 4 KB, Turnstile (production), 60 s cooldown, daily and per-address budgets, 5 attempts, state cookie `river_oaks_magic_state` | Sealed session cookie after the six-digit code |
| `POST /auth/desktop/exchange` | Desktop shell, iOS probe, the native app | `Origin` equal to the server origin, `Content-Type: application/json`, body ≤ 4 KB, `refreshToken` 20–2048 chars, sign-in rate limit, WorkOS accepts the token, method `GitHubOAuth` or `MagicAuth`, verified email, sealed session verifies, account not tombstoned | `{ "authenticated": true }` plus one `Set-Cookie: river_oaks_session=…; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure` (no `Secure` on a loopback http origin) |
| `GET /auth/session` | Every client, on each launch and before mutations | Cookie is one the server issued; access token verified; refreshed once when only the JWT lapsed (the reply carries the rotated cookie) | `{ authenticated, user: { id, name }, csrfToken, canGrantWishes }` |
| `POST /auth/logout` | Every client | Same origin, issued cookie, `X-CSRF-Token` | Session removed, cookie cleared, `{ url }` of the WorkOS logout page |

A session lasts 7 days from sign-in; the WorkOS access token inside it lasts
5 minutes and is refreshed by `/auth/session` (and other authenticated GETs that
pass `refresh`). Each account keeps its newest 10 sessions; the table keeps
10,000 and drops the oldest. A refresh rotates the cookie: the hosted backend
accepts the previous value for 30 s (`COOKIE_GRACE`), the single-process town
not at all.

The native route is the desktop contract, unchanged since #560: the app runs the
WorkOS device flow as a public client (`WORKOS_CLIENT_ID` only, no secret), keeps
the `device_code` in memory, and posts the one refresh token it receives to
`/auth/desktop/exchange`. The server, not the app, turns that token into a sealed
session; the token itself is never stored and WorkOS rotates it on use. See
`desktop/auth.js` (`deviceSignIn`, `exchangeDesktopSession`) and
`experiments/ios-probe/Sources/ProbeCore/DeviceAuth.swift` (`ProbeDeviceAuth.run`).

```mermaid
sequenceDiagram
  participant App as Native app (URLSession, no cookie jar)
  participant Browser as ASWebAuthenticationSession (ephemeral)
  participant WorkOS
  participant Server as typesafe.place
  participant Web as WKWebView (game)
  App->>WorkOS: POST /user_management/authorize/device {client_id}
  WorkOS-->>App: device_code, user_code, verification_uri_complete, expires_in, interval
  App->>Browser: open verification_uri_complete
  Browser->>WorkOS: resident signs in (GitHub, email code, or Apple if enabled)
  loop every interval s, until expires_in
    App->>WorkOS: POST /authenticate grant_type=device_code
    WorkOS-->>App: authorization_pending | slow_down | tokens
  end
  App->>Server: POST /auth/desktop/exchange {refreshToken} Origin: https://typesafe.place
  Server->>WorkOS: authenticate(refresh_token), seal, verify
  Server-->>App: 200 + Set-Cookie river_oaks_session (HttpOnly, Secure)
  App->>App: Keychain ← cookie; refresh token discarded
  App->>Web: inject cookie, load /play
  Web->>Server: GET /auth/session, GET /api/waitlist/status, POST ticket, WebSocket
```

## Flows per retained login

### GitHub through WorkOS (proven on the probe, round trip unverified)

1. The app asks WorkOS for a device authorization and opens
   `verification_uri_complete` in `ASWebAuthenticationSession` with
   `prefersEphemeralWebBrowserSession = true`, so no GitHub or WorkOS cookie
   survives on the device. The probe accepts only `signin.workos.com`,
   `api.workos.com` and `*.authkit.app` over HTTPS on port 443.
2. It polls `authenticate` at the provider's interval (`slow_down` adds 5 s), for
   at most `min(expires_in, 600)` s, and refuses any redirect.
3. The desktop shell and the probe refuse a token whose `authentication_method`
   is not `GitHubOAuth` before exchanging it. The server accepts `GitHubOAuth`
   and `MagicAuth`; for iOS the client-side list should match whatever Val
   retains (below), not be narrower than the server.
4. The exchange reply carries the session cookie. The server resolves the
   GitHub login for the resident's name (`server/github-names.js`), so the
   first `/auth/session` reports `user.name` as the login or the approved
   username.

PKCE does not apply: the device grant has no redirect, so there is no
authorization code to bind. The browser's `/auth/login` keeps PKCE and the state
cookie; the native app never uses that route, because its callback would land in
a browser the app does not control.

### Email codes through WorkOS Magic Auth

Two ways exist today. Only the first works without the hosted origin.

- **Through the same device flow.** AuthKit's confirmation page offers every
  method enabled in the WorkOS environment, and production has Magic Auth on.
  The token then reports `MagicAuth`, which `/auth/desktop/exchange` accepts
  (covered by `server/tests/native-exchange-access.test.js`). The code email is
  sent by AuthKit, so River Oaks' own Turnstile check, 60 s cooldown and daily
  budgets do not apply to it; WorkOS's own limits and billing do. The name is
  `Visitor #<id>` until the waitlist username applies; no GitHub lookup runs.
- **In the game page** (`preview/src/access-entry.js`), posting to
  `/auth/email/start` and `/auth/email/verify` from the WKWebView. This needs
  the page to be served from `PUBLIC_ORIGIN`, because the state cookie, the
  `Origin` check and Turnstile's hostname check all assume it. The probe showed
  Turnstile working in WKWebView on the hosted origin; a bundled origin cannot
  use this path without a server change.

Recommendation for the native app: one sign-in button family that always goes
through the device flow, so GitHub, email codes and a future Apple login share
one code path and one exchange. The in-page email form stays for the browser.

### Candidate: Sign in with Apple through WorkOS

WorkOS lists Apple as an OAuth provider
([setup guide](https://workos.com/docs/integrations/apple)). With it enabled,
the AuthKit page in the device flow offers Apple beside GitHub and email, and the
token reports `authentication_method: "AppleOAuth"`. **Today the server refuses
that method** at `/auth/desktop/exchange`, `/auth/callback` and session
verification (`SESSION_METHODS` in both auth modules); the regression pins the
403 `unsupported_provider`. Enabling Apple is therefore a deliberate server
change, not a WorkOS switch:

- add `AppleOAuth` to `SESSION_METHODS` in `server/auth.js` and
  `server/redis-auth.js`, with the same method-equality checks the other two
  have, and no GitHub lookup for it (`named` in both modules already skips
  non-GitHub records only when the method is `MagicAuth`; it must skip Apple too);
- relay addresses (`@privaterelay.appleid.com`) are verified emails and work
  with the waitlist as any other email; WorkOS mail to them is delivered only
  if WorkOS's outbound domains are registered with Apple (step 5 below);
- in-app deletion (`docs/account-deletion.md`) must also revoke the Apple
  tokens (Apple guideline 5.1.1(v)); whether WorkOS's user deletion does that is
  unverified and must be checked before Apple ships;
- Apple's Human Interface Guidelines want the Apple button at least as
  prominent as the others on the native sign-in screen.

A native `ASAuthorizationAppleIDButton` (Apple's own sheet, no browser) would
need WorkOS to accept Apple's identity token directly. The WorkOS guide does not
document such an exchange, so this design treats the AuthKit web page inside
`ASWebAuthenticationSession` as the only supported route unless WorkOS confirms
otherwise.

## Callback and session exchange

There is no app callback URL and no universal link in this design. The
"callback" is the poll result plus the exchange POST, which keeps the
credential off every URL. If a later host needs a link back from Safari (for
example to show a "return to River Oaks" button), it must carry nothing but a
nonce the app already knows; the refresh token must never ride on a URL.

What the app must send and check:

- `Origin: https://typesafe.place` exactly (no trailing slash; the probe trims
  it). Any other value, including `capacitor://localhost`, `ionic://localhost`,
  `null` or none at all, gets 403 `invalid_origin` before WorkOS is asked.
- `Content-Type: application/json`; body `{ "refreshToken": "…" }` only.
- Accept the reply only when the status is 200 and the `Set-Cookie` names
  `river_oaks_session` for the server's host, with `Secure`, `HttpOnly`,
  `Path=/` and an expiry within 30 days (`probeSessionCookie`).
- Treat 4xx and 503 as final for that token. A replayed or expired refresh token
  is refused by WorkOS; the route reports that as 503 `auth_unavailable` (its
  catch-all for provider errors), so the app must not retry the same token on
  503. It starts a new device authorization instead.

### Outcome table

| Launch | What the app holds | Server answer | What the app does |
| --- | --- | --- | --- |
| Cold, never signed in | Nothing | `/auth/session` → `{ authenticated: false }` | Show the native sign-in screen; start the device flow on tap |
| Warm, cookie valid | Keychain cookie, ≤ 7 days old | `/auth/session` → authenticated; may carry a rotated cookie | Inject the cookie into the WebView, load `/play`; store the rotated value |
| Warm, access token lapsed (> 5 min) | Keychain cookie | `/auth/session` refreshes and sets a new cookie | Same as above; the old value stops working (immediately in the town, 30 s later on the hosted path) |
| Warm, session gone (7 days, 10-sessions cap, logout elsewhere, deletion, restart of the single-process town) | Keychain cookie | `{ authenticated: false }` | Delete the Keychain item and the WebView store; treat as cold |
| Duplicate: exchange sent twice with one token (retry after a timeout, two taps) | A spent token | First 200; second 503, no cookie; the first session is unaffected | Keep the first cookie if it arrived; otherwise restart the device flow. Never queue the same token twice |
| Duplicate: two device flows at once (two windows, app relaunched mid-flow) | Two device codes | Each completes on its own; the newer exchange makes a second session (10 per account, oldest evicted) | Cancel the older flow when a new one starts (`authGeneration` in the probe) |
| Expired device code (> `expires_in`, 300 s typical, capped at 600 s) | A device code | `expired_token` from WorkOS | Stop polling, say so, offer to try again |
| Expired refresh token (app backgrounded between poll and exchange) | A lapsed token | 503, no cookie | Restart the device flow |
| Denied in AuthKit (`access_denied`, wrong provider) | Nothing | — | Say the sign-in was not completed; no retry loop |
| Token from a provider the server does not list (`AppleOAuth` today) | A token | 403 `unsupported_provider`, no cookie | Say the method is not available; the token is spent either way |
| Deleted account (tombstone) | A token or a cookie | 403 `account_unavailable` on exchange; `{ authenticated: false }` after | Treat as cold |

## Storage

The only durable credential is the sealed session cookie. Keep it in the
Keychain and nowhere else:

- `kSecClassGenericPassword`, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`,
  no iCloud Keychain sync, one item per server origin, value = the cookie value,
  with its expiry as an attribute.
- The refresh token lives only in the `URLSession` task that exchanges it and is
  dropped on return. The device code lives only in the polling task. Neither is
  written to `UserDefaults`, files, logs, the probe's evidence records or any URL.
- At launch the app writes the cookie into a `WKWebsiteDataStore` it owns (the
  probe uses the default store's `httpCookieStore.setCookie`; a nonpersistent
  store plus injection on each launch keeps the Keychain the source of truth).
  The cookie stays `HttpOnly`, so page JavaScript never reads it.
- The server rotates the cookie on refresh. The app must observe the WebView's
  cookie store (`WKHTTPCookieStoreObserver`) and write the new `river_oaks_session`
  value back to the Keychain, or a warm launch will present a dead value and look
  signed out. The hosted gate cookie `river_oaks_gate` (30 min) is not worth
  keeping; the next `/api/waitlist/status` issues a new one.
- Nothing is stored in renderer storage: no `localStorage`, no page-visible
  token, no `VITE_*` secret. The WorkOS client id is public and may be bundled.

## Logout and revocation

**Sign out, started by the resident.** `POST /auth/logout` with the cookie, the
server origin and the `csrfToken` from `/auth/session`. The server deletes the
session and answers the WorkOS logout URL. The app then deletes the Keychain
item, removes the WebView's website data, and may open the WorkOS URL in an
ephemeral `ASWebAuthenticationSession` to end the WorkOS-side session; since the
sign-in browser was ephemeral, nothing else is left on the device. A second
logout with the same cookie gets 401.

**Revocation, decided elsewhere.** The app learns of it from the same answers a
browser gets; it never needs a push:

| Event | Where it is enforced | What the app sees |
| --- | --- | --- |
| Ban (`/api/moderation/ban`) | Status route (403 `access_denied`), tickets (403), assets (403 in the town; the hosted pass lapses within 30 min), sockets (401 on upgrade; an open socket closes 4001/4003) | A "cannot join" screen; the session itself still answers `/auth/session` |
| Waitlist approval withdrawn | Tickets and assets (403 `waitlist_approval_required`), sockets (401 / 4001) | The waitlist screen says *not approved* |
| Account deletion (webhook or in-app) | Tombstone first, then every session and socket | `{ authenticated: false }`; a new exchange gets 403 `account_unavailable` |
| Session evicted or expired | Session table | `{ authenticated: false }` |
| Same account joined from another device | One world per account | The older socket closes with 4009 |

An app that caches "approved" must re-ask `/api/waitlist/status` at each
foreground return; the browser page polls it every 15 s while waiting.

## Protected service access after sign-in

Every gate re-checks the account; the session cookie only identifies it.

| Gate | Single-process town (`server/app.js`) | Hosted (`server/distributed-app.js`, `middleware.js`) |
| --- | --- | --- |
| `/api/*` mutations | Issued cookie, not banned, approved, `Origin` equal, `X-CSRF-Token` equal | Same, with Redis bans and the per-address limits |
| Game chunks and `/data/*` | Each request checks the session, ban and approval | `river_oaks_gate` pass, signed per session for 30 min by `/api/waitlist/status`; without one, one server check; no session cookie, no server call |
| Join ticket | 60 s, one use, bound to the user and session, 3 live per user | Same, in Redis, 4,096 total |
| WebSocket upgrade | `Origin` equal, protocol version, identity, ban, approval, ticket consumed | Same, plus `identity.expiresAt` |

The native app does nothing special here: the WebView carries the cookie, the
page's own code fetches `/auth/session` for the CSRF token, asks for a ticket
and opens the socket with `Origin` set by WebKit to the page's origin. That is
why the page origin matters (next section).

## The Origin contract and the bundled host

Every mutation, the ticket, the socket upgrade and the exchange compare
`Origin` with `PUBLIC_ORIGIN`. WebKit sets `Origin` from the document, and page
code cannot override it. A bundled client (`capacitor://localhost` or a custom
scheme) would therefore fail CSRF, tickets, logout and the socket, even with a
valid cookie, and `SameSite=Lax` cookies would not be sent cross-site at all.
The regression pins `capacitor://localhost` as refused at the exchange and at
the ticket route.

The choices, for #286, are:

1. serve the page from the hosted origin inside the WKWebView (the probe's
   route; all checks hold as they are); or
2. a server-side allowlist of a second trusted origin for the bundled host, with
   its own CSRF and cookie contract, tests on both backends and a review of
   `SameSite`. That is a design change outside this issue's authority.

## App Review 4.8 note (Decision 4, for Val)

Guideline 4.8 says an app that offers a third-party or social login must also
offer one that limits data collection to name and email, lets people keep their
email private, and does not collect interactions for advertising without
consent. GitHub through WorkOS is such a third-party login. Email codes collect
only an email and track nothing, but they cannot hide the address. Two readings
remain, as in [App Review](app-review-292.md#48-login-services):

**Option A: add Sign in with Apple through WorkOS, keep GitHub and email codes.**

- Apple Developer: the Team ID; an App ID with the Sign in with Apple
  capability; a Services ID configured with `api.workos.com` as domain and the
  WorkOS redirect URI as return URL; a Sign in with Apple private key (`.p8`)
  with its Key ID; optionally the Private Email Relay configured with WorkOS's
  outbound email domains so codes and notices reach relay addresses.
- WorkOS Dashboard: Authentication → OAuth providers → Sign in with Apple →
  Enable, with the app's own credentials (WorkOS's defaults work only in
  Staging). Production is the environment that matters; staging first.
- River Oaks: the `SESSION_METHODS` change above on both backends with
  regressions; a name rule for Apple accounts (username or `Visitor #`);
  Apple-token revocation in account deletion, verified against WorkOS; the
  Apple button on the native screen, as prominent as the others; the privacy
  answers updated.
- Cost: one engineering increment plus Apple and WorkOS setup; recurring: none
  beyond WorkOS's per-user pricing.
- Risk: Apple reviewers check 4.8 against the login screen they see; this
  option answers it directly.

**Option B: offer only email codes on iOS.**

- River Oaks: hide GitHub on the native sign-in screen (the device flow still
  shows every enabled AuthKit method, so the client must refuse `GitHubOAuth`
  tokens on iOS the way desktop refuses non-GitHub, or WorkOS must have a
  separate environment or client with GitHub off). Residents who joined with
  GitHub on the web keep their account and sign in with the same email.
- WorkOS: nothing new; Apple: nothing.
- Risk: 4.8 is then argued under the exception for apps that use their own
  account system exclusively, with WorkOS as the processor. Email codes do not
  hide the address, so a reviewer may still ask for Apple. Email starts cost
  money per code and carry the budgets in [email access](email-access.md).

**Recommendation.** Option A, staged: enable Apple in WorkOS Staging first, land
the server change with its regressions, verify deletion revokes Apple tokens,
then production. Choose B only if the Apple Developer setup cannot be completed
before the submission date. Either way, the native screen should not show a
login the server will refuse. This is Val's decision; nothing has been changed
in WorkOS or Apple for it.

## Server regressions delivered here

`server/tests/native-exchange-access.test.js` starts a real server in the test
and drives it over HTTP and WebSocket, on both paths:

- **Standalone** (`createGameServer` + `createAuth`, file waitlist and
  moderation, a static root): always runs.
- **Hosted** (`createDistributedServer` + `createRedisAuth`,
  `createRedisSecurity`, `createRedisWaitlist`, `createRedisRoom`, and the real
  `middleware.js` asset gate pointed at the test server): runs when
  `REDIS_URL` names an isolated Redis; skipped otherwise, and a skip is not
  evidence.

What it pins: wrong, missing, trailing-slash, `null` and bundled-scheme
`Origin` refused before WorkOS; malformed bodies; the cookie attributes; no
token in the reply; a replayed and an expired refresh token issue nothing and
leave the first session intact; `AppleOAuth` refused; `MagicAuth` accepted; a
pending account kept from tickets, assets and the socket; approval; CSRF on a
native session; a ticket spent once, bound to its session, not spent by a
cross-origin attempt; ban closing every gate and dropping the live socket at
its next command (4001); the hosted pass's 30-minute lag and its lapse; approval
withdrawn; logout killing the cookie and a ticket issued before it; a
tombstoned account refused at exchange and afterwards.

WorkOS and GitHub are fixtures (`server/tests/redis-auth-fixture.js`,
`server/tests/github-fixture.js`); the fixture's refresh tokens are one-use and
expiring, which is WorkOS's documented behavior, not WorkOS. No production code
changed: no test exposed a defect. Two guards were mutated locally (the exchange
`Origin` check and ticket consumption) to confirm the test fails without them.

## Unblock list: what the remaining #287 subtasks need from #286

| Subtask | Needs from the host decision |
| --- | --- |
| Callback / link handling | Whether the page is the hosted origin (no app link needed) or bundled (then the origin contract above must be decided first, and a server change designed) |
| Keychain session | The host's WebView type (Capacitor's or a custom `WKWebView`) and whether it owns a nonpersistent data store; Capacitor's cookie plugin behavior with `HttpOnly` cookies |
| Admission in the native UI | Which login methods the native screen shows (Decision 4) and whether the iOS client refuses other methods client-side |
| Logout and revocation | The host's foreground/background hooks, to re-ask `/api/waitlist/status` and `/auth/session` on return |
| Live staging round trip | A signed build from the chosen host, a staging WorkOS environment with the retained methods on, Val present, bounded email sends, and the `github-auth-exchanged` evidence the probe never recorded |
| Account deletion on iOS | Settings → Account reachable in the host; Apple token revocation if Option A |

## Decisions for Val

1. Decision 4 (4.8): Option A or B above.
2. Whether email codes through the device flow are acceptable, given they bypass
   River Oaks' Turnstile and daily budgets and are billed by WorkOS.
3. Whether a replayed or expired refresh token should answer 403 instead of the
   current 503 `auth_unavailable`, so a client can tell "sign in again" from "try
   later". Not changed here; it is not a security defect.
4. The bundled-origin question in #286, which decides whether a server-side
   origin allowlist has to be designed.

## Known gaps

- No live WorkOS, Apple, Turnstile or device evidence in this change.
- The probe keeps the cookie in the default `WKWebsiteDataStore`, not the
  Keychain, and does not track cookie rotation.
- The desktop shell and the probe refuse non-GitHub tokens client-side; the iOS
  client needs its own list once Decision 4 is made.
- Staging and production WorkOS environments must have the same methods enabled
  as the native screen offers, or the exchange answers 403 for a method the
  resident just used.
