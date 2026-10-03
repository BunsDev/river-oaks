# Deploy the shared town

## Develop locally without WorkOS

`npm run dev` starts the shared town inside the Vite dev server. With no WorkOS
credentials, choosing Multiplayer gives each browser its own development
resident (for example "Wren (dev)") without a sign-in step. Choose Multiplayer
in a second browser profile to see another player. No `.env` is needed.
For a separate checkout while the default ports are in use, run
`RIVER_OAKS_DEV_TOWN_PORT=8797 npm run dev -- --port 5179`. The preview proxies
auth and multiplayer traffic to that checkout's own town on the chosen loopback
port.

- The default is `choice`: players begin in single player and can select
  Multiplayer from the control in the viewport. The choice is remembered in
  local storage across the WorkOS sign-in redirect. Multiplayer's sign-in
  screen and People panel both offer a return to single player. Each tab keeps
  the mode it loaded with, so choosing the other mode always switches that tab,
  even after another tab changed the remembered choice. If the browser refuses
  to store a choice, the reload carries it in the address bar as `?play=solo`
  or `?play=multiplayer` for that visit only; a choice carried this way doesn't
  survive the WorkOS sign-in redirect.
- `VITE_MULTIPLAYER=auto` joins when the town answers with a session, otherwise
  plays solo without blocking. `off` disables the shared town. `required`
  always shows the sign-in gate.
- `VITE_MULTIPLAYER=off npm run dev` plays solo with the invasion and auto visits.
- `RIVER_OAKS_DEV_AUTH=workos npm run dev` uses real WorkOS sign-in instead;
  register `http://127.0.0.1:5173/auth/callback` in that WorkOS environment.
- `npm run server -- --dev` runs the town as its own process for a separate
  `npm run dev`; the dev server then uses it instead of starting its own.

Development identities only exist on a loopback `http` origin, outside
`NODE_ENV=production`, and never on Vercel (`VERCEL` set). They live only in
the standalone server (`server/dev-auth.js`). The Vercel function and the Redis
backend always require WorkOS and fail closed with `503` without it.

While the town runs, the character panel offers 11 selectable looks built on seven shipped rigs, including fox, wolf, lynx, human, and hybrid styles.
The selection belongs to the signed-in account, is visible to other players, and
survives reconnects, logout, and server replacement through the town checkpoint.
The town retains up to 4,096 account selections; older inactive selections are
evicted as it fills. The solo-only invasion and auto visit are hidden, since
each would diverge from the shared town.
The People panel also includes town chat. Messages are visible to everyone in
the room, attributed to the signed-in player, and kept as a rolling 40-message
history across reconnects. The server limits messages to 280 characters and
one send per second per account; chat history clears when the town is reset.

Build & decorate lets a player place, move, turn, and remove up to 24 owned
creations in the shared town. A placed creation can be saved as a design, then
placed again from **Saved designs**. Each account can keep 48 designs. The
inventory is returned only to its owner; placed copies are visible to everyone.
Designs survive reconnects and town resets through the private checkpoint.
Each new placement still passes the server's reach, ground, road, collision,
and capacity checks. Deleting a design does not remove copies already placed.

The selected target is **`0xbuns/river-oaks` on Vercel**, serving `https://sim.jev.works`. `vercel.json` packages the Vite frontend and `api/server.js` Node WebSocket backend in `iad1`, with a 300-second function limit. The project has Fluid compute enabled. Connections reconnect before the function limit and recover the shared town. See [Vercel WebSockets](https://vercel.com/docs/functions/websockets).

Run `npm run test:shared` for development onboarding and authenticated fixture journeys, including mobile controls and keyboard reconnect/sign-out. See [acceptance commands and scope](experience-polish.md). This does not use live WorkOS accounts.

## Shared storage and coordination

Marketplace Redis **`river-oaks-town`** is connected to Production: 250 MB, persistence enabled, region `iad1`, high availability off, approved at $6/month (plan `26492`). Vercel supplies encrypted `REDIS_URL`. See the [provisioning receipt](../data/reports/redis-provisioning.json).

The Redis backend stores OAuth state, sessions, single-use socket tickets, request limits, bans, and the last 10,000 audit records. Session refresh and logout use atomic transactions across instances. Bans persist without an expiry, and banning invalidates outstanding connection tickets. Login requires a verified WorkOS email; missing configuration fails closed.

One renewable Redis lease controls simulation writes. A fenced transaction commits the compressed world checkpoint, public snapshot, consumed operation batch, and command acknowledgments together. A replacement instance restores residents, wishes, movement budgets, cooldowns, and conversation holds. An expired lease cannot overwrite the replacement's state. The world pauses without players; it does not simulate all elapsed offline time.

Disconnects have a ten-second reconnect grace. A new tab replaces the account's existing connection without clearing its wishes. Logout and bans remove the player and owned wishes. The backend bounds command queues and coalesces waiting movement updates without reordering travel actions.

Production defaults to Redis namespace `river-oaks:production:v1`. Preview and local Redis servers must explicitly set a different `REDIS_NAMESPACE`; previews reject the default production namespace. Share the production namespace across production deployments. District/checkpoint incompatibility fails closed and needs an explicit migration; changing the namespace starts a different town and also separates sessions and bans.

## Deployment readiness

Local tests cover separate backend instances sharing the real Marketplace database in random test namespaces, session refresh/revocation races, writer replacement, and durable state. The [Redis browser acceptance](../data/reports/redis-multiplayer-e2e.json) verifies peer avatars, shared wish effects, reload recovery, walking, and logout across those instances. `vercel build --prod` successfully packages the function and frontend. The [staged deployment receipt](../data/reports/vercel-multiplayer-staging.json) records hosted frontend HTTP 200, missing-credentials auth HTTP 503, and anonymous ticket/WebSocket HTTP 401. On the protected acceptance alias, two real WorkOS accounts signed in through the dedicated TypeSafe application, joined the same hosted roster, and each rejoined after a reload. Signing out the second account removed it from the first account's roster. A later hosted run kept a wish active while the alias moved to a new deployment: the first account rejoined there with the wish intact, and a temporary ban disconnected the second account and denied a new ticket. Unban restored its access; the wish was undone and both accounts signed out.

The TypeSafe WorkOS project now has a dedicated **River Oaks District** AuthKit application in Production (`client_01M3ZHFZDKDSTJ2RNSMP5V9SKV`) and a separate development application in Staging (`client_01M3ZHFZ8AHWXXRJNYM5WYKRPP`). Their callback and logout URLs below are registered. `PUBLIC_ORIGIN`, `WORKOS_COOKIE_PASSWORD`, `WORKOS_CLIENT_ID`, and the matching `WORKOS_API_KEY` are configured in Vercel Production. Production AuthKit offers verified email sign-in through Magic Auth. A protected server-side check confirmed the Production key can retrieve the verified acceptance user. Preview deployments need their own authorized origin, cookie secret, and Redis namespace. Do not copy production state into previews.

The local Redis tests exercise cross-instance logout and ban enforcement; the hosted run confirms the ban and unban behavior, but does not identify which Vercel worker handled each browser. The candidate was staged with `--skip-domain` on the protected `river-oaks-acceptance-0xbuns.vercel.app` alias. After promoting a deployment, smoke-check sign-in, session, and anonymous ticket rejection on `sim.jev.works`. The original single-process acceptance report is not Vercel acceptance evidence.

## Run the Redis API locally

Use Node 22.12 or newer and configure `REDIS_URL`, `REDIS_NAMESPACE=river-oaks:development:v1`, WorkOS credentials, and a localhost `PUBLIC_ORIGIN` in private `.env`. Run `npm run server:redis` and `npm run dev` in separate terminals. The Redis server exposes APIs and WebSockets; Vite serves the frontend. The standalone server below remains available for development without Redis.

## Run the current standalone server

The implementation below serves the frontend, WorkOS authentication, and multiplayer WebSocket from one Node.js process. Use Node.js 22.12 or newer. These standalone/container instructions are for local verification or a persistent host, not a Vercel Function deployment.

After configuring the private environment and WorkOS URLs below, run from the repository root:

```sh
npm ci
VITE_MULTIPLAYER=required npm run build
npm start
```

`npm start` reads `.env` when present and serves `dist/preview` alongside the API on `127.0.0.1:8787`. Your TLS proxy exposes that listener at the public origin. A static-only deployment cannot host the shared town.

## Session verification boundary

Both auth stores use `server/workos-session.js` for issuer syntax and rejection
logging. With the locked WorkOS Node SDK 10.14.0, `Session.authenticate()`
unseals the cookie and verifies the JWT against the remote JWKS selected from
the **configured** application client ID (`/sso/jwks/<clientId>`). It does not
select a key endpoint from the token's `iss` or `client_id`. The SDK does not
check issuer equality unless an issuer option is configured; River Oaks checks
WorkOS issuer syntax and requires the signed `client_id` to equal its configured
application after SDK authentication, alongside subject, session, email and
expiry checks. A matching claim cannot make a foreign signing key trusted.

Keep both `https://api.workos.com` and `https://api.workos.com/`: WorkOS documents
them in its [session token reference](https://workos.com/docs/reference/authkit/session-tokens)
and [session guide](https://workos.com/docs/authkit/sessions). Dedicated application
tokens can instead name the environment in the issuer path, so that path must
not be compared to the dedicated application's client ID. These formats are
compatibility checks, not independent proof of environment membership. The
application-specific key lookup and signed client claim are both required.
Deployments using a custom auth domain need an explicitly reviewed issuer policy.
Preview isolation requires separate client IDs, cookie secrets and Redis namespaces;
sharing production credentials does not create an isolated preview.

`server/tests/workos-sdk-fixture.js` serves a local JWKS and code-exchange endpoint.
The tests keep SDK key selection, HTTP key retrieval, sealing and signature
verification real. Both stores reject a token with a valid foreign-environment
issuer and the correct application claim when a different key signs it (even
with the same key ID). They also reject trusted-key tokens with another client
or an invalid issuer host. Redis cases exercise callback on a second node and
verify rejected tokens leave no durable session or cookie records. Run:

```bash
node --test server/tests/auth.test.js server/tests/workos-session.test.js
REDIS_URL=redis://127.0.0.1:<test-port> node --test server/tests/redis-auth.test.js
```

These are local cryptographic boundary tests, not proof of WorkOS's hosted key
provisioning or a live sign-in. Repeat the custom-domain smoke checks above after
promotion. On 2026-10-03, the current `sim.jev.works` deployment passed a
native-browser smoke check: Continue with GitHub returned to the game and the
same browser's `/auth/session` reported `authenticated: true`. Separate requests
without cookies returned `{ authenticated: false }` from `/auth/session` (200)
and rejected `POST /api/multiplayer/ticket` (401). This checks the existing live
deployment; it does not attest deployment of this follow-up patch.

Callback rejection logs contain fixed booleans, never token claims, cookies,
authorization codes or user identities.

The 20-minute one-use state lifetime accommodates email-code redirects. The
1,000-entry cap is unchanged; abandoned attempts occupy slots until expiry,
so longer retention reduces capacity during sustained abandoned-login traffic.
Successful callbacks consume their state immediately. Capacity remains bounded
and returns after expiry; this change does not add a login rate limiter.

## Configure WorkOS and private settings

Configure the WorkOS environment whose credentials you'll use with these exact URLs:

| Setting | Production value |
| --- | --- |
| Redirect URI for the authorization callback | `https://sim.jev.works/auth/callback` |
| Sign-in initiation URL | `https://sim.jev.works/auth/login` |
| Application home URL | `https://sim.jev.works/` |
| Allowed logout return URL | `https://sim.jev.works/` |

The callback redirects to `/` after sign-in. The application signs out through `POST /auth/logout` with its CSRF token, then follows WorkOS's logout URL with the home URL as `returnTo`. Register the home URL as the logout destination, rather than the application's POST endpoint.

Copy `.env.example` to `.env` if you don't already have a private environment file. Preserve your existing sidecar settings. Fill these server settings through your deployment's secret store or private environment file:

| Variable | Value |
| --- | --- |
| `PUBLIC_ORIGIN` | `https://sim.jev.works`, with no trailing slash or path |
| `WORKOS_API_KEY` | API key from the matching WorkOS environment |
| `WORKOS_CLIENT_ID` | Client ID from that same environment |
| `WORKOS_COOKIE_PASSWORD` | Random secret of at least 32 characters |
| `HOST` | `127.0.0.1` behind a host proxy, or `0.0.0.0` inside the container |
| `PORT` | `8787` unless your platform requires another port |
| `REDIS_URL` | Marketplace secret for the shared backend |
| `REDIS_NAMESPACE` | Explicit isolated namespace for preview/local Redis; Production defaults to `river-oaks:production:v1` |
| `MODERATION_FILE` | Standalone server only: path on a private writable volume |
| `MODERATOR_USER_IDS` | Comma-separated WorkOS user IDs, or empty for no moderators |
| `TRUSTED_PROXY_IPS` | Comma-separated exact IP addresses of your reverse proxies; empty trusts none |

Generate a cookie secret locally:

```sh
node --input-type=module -e 'import { randomBytes } from "node:crypto"; console.log(randomBytes(32).toString("hex"))'
```

Store that output privately. Keep WorkOS credentials and the cookie secret out of Git, build arguments, browser bundles, and `VITE_` variables. HTTPS sessions use `Secure`, `HttpOnly`, and `SameSite=Lax` cookies.

Production multiplayer requires WorkOS authentication and a verified email. There is no anonymous bypass, and development identities never run on a public origin, in production mode or on Vercel. Missing or invalid authentication configuration makes auth endpoints return `503`; a successful `/health` response alone does not prove authentication is configured.

## Standalone mode: one instance and file moderation

Run exactly one Node process and one replica. World state, active wishes, player positions, authentication sessions, and pending login attempts live in RAM. Restarting resets the town, disconnects everyone, and invalidates local sessions. Players must sign in again. Multiple replicas or cluster workers would create separate towns and break login/session routing. The world clock advances while players are connected.

Mount the entire directory containing `MODERATION_FILE`. The server writes the ban list through a temporary file and atomic rename, and writes reports and moderation actions to adjacent audit files. For example, mount `.runtime` and set:

```dotenv
MODERATION_FILE=/app/.runtime/moderation.json
```

Keep `moderation.json`, `moderation.json.audit.jsonl`, and its rotated `.previous` file private and backed up. The process needs write access to their directory. Mounting just the JSON file prevents the atomic replacement from working reliably.

## Container deployment

The root `Dockerfile` builds the frontend and runs the server as the unprivileged `node` user. It includes the shared simulation source and district data needed at runtime. Build from the repository root:

The current Dockerfile builds the production default, which starts in single
player. A shell variable passed to `docker build` does not change that frontend
bundle. For a shared-town container, build the frontend with
`VITE_MULTIPLAYER=required` in the build stage and configure WorkOS and Redis
for the runtime environment.

```sh
docker build -t river-oaks:local .
docker volume create river-oaks-moderation
docker run -d --name river-oaks --restart unless-stopped \
  --env-file .env.production \
  -e HOST=0.0.0.0 \
  -e PUBLIC_ORIGIN=https://sim.jev.works \
  -e MODERATION_FILE=/app/.runtime/moderation.json \
  -p 127.0.0.1:8787:8787 \
  -v river-oaks-moderation:/app/.runtime \
  river-oaks:local
```

Create `.env.production` privately with the WorkOS settings above before running the container. The named volume preserves moderation across container replacements. If you use a bind mount instead, make it writable by the container's `node` user (UID 1000). Run only one container against that volume.

## Configure the TLS proxy

Terminate TLS for `sim.jev.works` and forward all paths to the single Node listener. Preserve request cookies, the `Origin` header, and response `Set-Cookie` headers. Forward WebSocket upgrades at `/multiplayer`, including the query string containing the short-lived connection ticket. Use an idle timeout longer than the server's 15-second WebSocket heartbeat, such as 60 seconds.

Route `/auth/*`, `/api/*`, and `/multiplayer` directly to Node without caching or HTML fallback. Exclude WebSocket ticket query strings and authentication callback query strings from access logs. Redirect public HTTP traffic to HTTPS. The Node listener itself speaks HTTP; `PUBLIC_ORIGIN` determines the external authentication URLs and secure-cookie behavior.

Configure `TRUSTED_PROXY_IPS` so visitors behind your proxy receive separate request-limit buckets. For a host-local proxy connecting over IPv4, use `TRUSTED_PROXY_IPS=127.0.0.1`; include `::1` only if it also connects over IPv6. For a container, use the exact proxy or gateway address seen by the Node socket, not an assumed loopback address or a whole private subnet. Keep the Node port private so only your intended proxy can reach it.

At the public edge, overwrite incoming `X-Forwarded-For` with the actual client IP. If you have additional trusted proxy hops, each hop must append its observed peer and you must list those exact proxy IPs. The resolver trusts the header only from a listed direct peer, walks it from right to left, and stops at the nearest untrusted hop. IPv4-mapped IPv6 addresses are normalized. Malformed headers and chains over 16 entries or 1024 characters fall back to the direct peer. Hostnames, CIDR ranges, and wildcard trust entries are rejected.

With an empty trust list, forwarded headers are ignored. Behind a proxy this shares one request-limit bucket across all visitors, so configure and test the trusted proxy addresses before production traffic. Never trust a forwarding header supplied directly by a public client.

Check the Node listener with `curl http://127.0.0.1:8787/health`. Before opening the deployment to players, verify with two real WorkOS accounts that sign-in returns to the town, both clients see the same changes, logout closes the connection, and a persisted ban survives a restart. Live WorkOS sign-in, shared presence, replacement recovery, and ban/unban passed on the protected Vercel alias; repeat the sign-in and API smoke checks after each custom-domain promotion.

## Develop with Vite and the Node server

Use a WorkOS development environment and register `http://localhost:5173/auth/callback` as its redirect URI, `http://localhost:5173/auth/login` as the sign-in URL, and `http://localhost:5173/` as its home and logout return URL. Put its credentials and a cookie secret in your private `.env`.

Start Node in one terminal:

```sh
PUBLIC_ORIGIN=http://localhost:5173 HOST=127.0.0.1 PORT=8787 npm run server
```

Start Vite in another terminal:

```sh
npm run dev
```

Open `http://localhost:5173` consistently. Vite proxies authentication, multiplayer API requests, moderation requests, and WebSocket connections to Node on port `8787`. Don't substitute `127.0.0.1` in the browser because the origin and cookies must match. Vite's `/health` route belongs to the optional sidecar; check Node health directly at `http://127.0.0.1:8787/health`.

Local HTTP cookies omit `Secure`. This explicitly configured standalone server uses WorkOS; the default `npm run dev` flow described above uses loopback development identities instead. Run the automated server tests with `npm run test:server`; they don't replace a live WorkOS sign-in check.

On CPU-only Linux CI, run `RIVER_OAKS_SHARED_SOFTWARE=1 LIBGL_ALWAYS_SOFTWARE=1 LP_NUM_THREADS=2 xvfb-run -a npm run test:shared` after installing Playwright's Chromium and system dependencies. This opt-in profile uses Mesa/OpenGL and draws the real town geometry and skinned avatars at quarter resolution with surface-normal shading, without HDR preprocessing, MSAA, shadows, ambient occlusion, or reflection captures. Mesa is capped at two worker threads to limit contention with the browser clients and town server. Both multiplayer clients use the same 60-second navigation budget. Navigation waits for document commit followed by explicit game readiness; shared gameplay, avatar loading, keyboard, and recovery assertions remain in place. It is not visual-quality or performance acceptance; the separate reflection WebGL smoke retains the real PCF shadow path. Normal `npm run test:shared`, development, and production rendering are unchanged. The profile is disabled in production builds. CI retains the report and failure screenshots for seven days.
