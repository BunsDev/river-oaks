# Server hardening: interruptions, lag, code execution and owner-billed costs

**Status:** implemented on `fix/server-hardening`.
**Owner:** Claude session `river-oaks-c2` (task `server-hardening`).
**Request (2026-10-11):** "work on hardening to ensure we account for attempts to abuse the server and esp as it pertains to production interruptions, lag, RCE, and charging billing I have to be responsible for."

## How

Three read-only audits of `main` at `ee7d8d6` ran in parallel:
- **Availability:** denial of service and lag.
- **Billing:** every paid or metered call.
- **Code execution and injection.**

Each finding cites file and line plus a concrete abuse case, and unverified ones are marked as plausible. I reproduced each finding below before fixing it. Each fix has a regression test that failed before the change, and several were also checked by reverting the fix to confirm the test catches it. The tests are named `*hardening-*.test.js`.

No audit found remote code execution reachable by players on the hosted app, and no provider key is exposed to a client.

## Fixed in this branch

| # | Finding (severity) | Fix | Regression |
| --- | --- | --- | --- |
| 1 | Junk-cookie floods made the asset middleware call `/api/waitlist/status` for every gated file. That's a billed function call, keyed to a rate-limit bucket real players may share. About 17 requests/s could turn everyone's game files into 403 (critical, plausible) | `river_oaks_gate`: a 30-minute HMAC pass bound to the session cookie, verified locally in the middleware. A request with no session cookie is refused without calling the server. A session with no valid pass falls back to one status call. | `server/tests/hardening-asset-gate.test.js` |
| 2 | One throwing queued operation froze a Redis world for good. Organic triggers: a full avatar store, a look removed from the catalog, a session-store error (medium, an outage) | Each operation is isolated and a half-finished join is undone. Malformed entries are dropped. An avatar-store failure keeps the default look. | `hardening-room-isolation.test.js` |
| 3 | One global table of 512 join tickets: 50–200 approved accounts could lock out every world (high) | At most 3 live tickets per user (the oldest is retired); the table holds 4,096 | `hardening-tickets.test.js` |
| 4 | One failed tick or heartbeat (a 3 s Redis timeout) disconnected everyone on an instance (medium, an outage) | Everyone is closed only after 3 failed ticks in a row; heartbeats are judged per connection | `hardening-transport-resilience.test.js` |
| 5 | The gateway ran `/api/chauffeur` and unknown `?world=` lookups before any per-address limit (billing) | The router applies the per-address budget first and marks admitted requests so they're counted once | `hardening-router-admission.test.js` |
| 6 | `/auth/desktop/exchange` let anonymous traffic reach WorkOS outside the sign-in budget. The `debug-report` scope was missing on Redis, so every problem report got 429. | Both fixed | `hardening-signin-limits.test.js` |
| 7 | Every `/assets` file was `private, no-store`, so up to 143 MB re-downloaded on every visit (billing high) | Public GLB/HDR/JPG/PNG: `public, max-age=3600, stale-while-revalidate=86400`. Gated JS/CSS, manifests and `/data` stay `private, no-store`. | `hardening-asset-cache.test.js` |
| 8 | The paid Jev driving path had no daily or global cap and retried failures at full rate (billing medium) | `CHAUFFEUR_DAILY_LIMIT` (default 6,000 per UTC day, global) and a 60 s breaker after 3 failures | `hardening-chauffeur-budget.test.js` |
| 9 | One account could be in all 17 worlds at once, so a few dozen accounts could fill the town (high) | Joining a world removes the account from its previous one, on both servers. The old socket closes with 4009, which the client treats as final. The owner accounts are exempt. | `hardening-one-world.test.js` |
| 10 | `GET /api/waitlist/invites` reads the whole invite table (up to about 20 MB) per request (medium) | 20 listings a minute per account | `hardening-invites.test.js` |
| 11 | The installed `pre-commit` still ran the checked-out branch's `check_secrets.py` (high, developer machines; follow-up to #241) | The installer copies the checker and `.gitleaks.toml` next to the hooks, and the hook runs that copy | `scripts/tests/hardening-hooks.test.js` |
| 12 | Every command rebroadcast the full snapshot (about 92 kB) to the whole world, serialized per connection (medium, lag) | The sender gets its snapshot at once and others get it on the 200 ms tick; broadcasts are serialized once | `hardening-command-broadcast.test.js` |
| 13 | Pending sign-in and email-code tables (20,000) refused everyone when full; about 1,000 addresses could lock out sign-in (high) | A full table evicts the entry closest to expiry instead of refusing | `redis-auth.test.js`, `magic-auth.test.js` (updated) |
| 14 | The companion polled a 404 every 2.5 s and the chauffeur polled every 1.5 s through refusals (billing low) | Exponential backoff to at most once a minute; normal cadence after the first decision | `preview/tests/hardening-polling.test.js` |

## Handled elsewhere

- **Desktop World Studio bridges** (high: page script steering the local agent; medium: the `pushState` sender check; low: running before consent) belong to `river-oaks-3b` in #243. That PR was reviewed with "request changes": the designer prompt and dialog still mismatch, and a regression disables the bridges after a blocked navigation.
- **Git hooks with an absolute path:** #241, merged as `eafa4e6`. Row 11 closes the gap it left.

## Owner settings: account level, not code

These are the backstops code can't provide, because a function has already been billed by the time code runs:
1. **Vercel Spend Management with a hard pause.** This caps runaway function and bandwidth bills.
2. **Vercel Firewall rate-limit rules** (they act before billing). For example, 300/min per IP on `/api/*` and `/auth/*`, about 10/hour on `/auth/email/start`, and a cap on large `/assets` binaries.
3. **Cloudflare Turnstile** (or a similar challenge) on `/auth/email/start`, against bulk account creation.
4. **Redis `noeviction` and a 70% memory alert.** Under a `volatile-*` policy, a full database evicts rate-limit counters and sessions first.
5. **Vercel Git Fork Protection on.** This stops fork-PR previews from building with Preview environment variables.

## Follow-ups (not done here)

- A per-owner invite index, so listing doesn't read the whole table; prune redeemed and expired invites.
- Session (10,000) and waitlist (10,000, never pruned) caps still refuse when full. Filling them takes many real accounts. Fix with per-user and pending-only caps plus an admin purge.
- Starter invites for invite-approved accounts let the invite tree grow quickly. That's a product decision.
- A global daily budget for email sign-in sends (WorkOS) that fails closed.
- Tighten the CSP: add `default-src`, `connect-src`, `form-action` and `frame-src`, and a test that `vercel.json` and `security-headers.js` agree.
- Vite dev proxy: forward the original Host and Origin, or use a per-launch token for the local bridge (dev only).
- Desktop cookie encryption fuse (`EnableCookieEncryption: false`).
- Dockerfile base image pinned by digest; `packageManager` hash.

## Checks

The full results are in the PR.
