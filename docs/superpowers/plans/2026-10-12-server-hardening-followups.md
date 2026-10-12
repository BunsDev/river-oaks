# Server hardening follow-ups (2026-10-12)

**Objective:** finish the follow-ups that the first hardening pass (#244, ledger `2026-10-11-server-hardening.md`) left open, with Val's approval to "proceed with your recommendations comprehensively". Starter invites stay out of scope, because that's a product decision.

**Owner:** river-oaks-c2. **Branch:** `fix/server-hardening-followups`. **Worktree:** `river-oaks-hardening-2-20261012`.

## Items

1. **Daily budget for email sign-in sends.** It's global and per UTC day, and it fails closed.
2. **Cloudflare Turnstile on `/auth/email/start`.** It's off until a site key and secret are set.
3. **Tighter CSP.** Add `default-src` and explicit directives, with a test that `vercel.json` and `security-headers.js` agree.
4. **Waitlist and session caps.** A flood of sign-ups can't lock out real users.
5. **Per-owner invite index.** Listing your invites no longer reads the whole table.
6. **Dev bridge proxy.** Restore the Python bridge's DNS-rebinding guard behind Vite.
7. **Desktop cookie encryption fuse.**
8. **Base image and pnpm pins.** Pin the Docker base image by digest, and give `packageManager` its hash.

Fixed separately and first, in #259: the chauffeur's daily budget never passed on Redis.

## Results

| Item | Result | Regression |
| --- | --- | --- |
| 1. Email send budget | `EMAIL_SIGNIN_DAILY_LIMIT` (default 2000/UTC day), spent atomically with the per-email cooldown; past it, 503 `email_paused` and no WorkOS call | `magic-auth.test.js`: route on memory and Redis, plus an atomic store test (5 concurrent starts against a budget of 2) |
| 2. Turnstile | `TURNSTILE_SECRET_KEY` and `VITE_TURNSTILE_SITE_KEY`, off by default. Verified before admission; fails closed on a missing, failed, wrong-action, slow or unreadable check | `hardening2-turnstile.test.js`, plus route tests on memory and Redis |
| 3. CSP | `default-src 'self'` with explicit directives, identical in `vercel.json` and `security-headers.js` | `hardening2-security-headers.test.js`; email-access browser test (zero violations through the 3D canvas); landing page and sign-in screen probes (zero violations) |
| 4. Session and waitlist caps | A full session table signs out its oldest session; a full waitlist gives up its oldest pending request and never removes a decided resident | `auth.test.js`, `redis-auth.test.js` (updated: 302/302, oldest evicted), `hardening2-waitlist-cap.test.js` (file and Redis, legacy rows and drift) |
| 5. Invite index | Per-owner index with lazy legacy scan; a full table forgets invites more than 90 days past expiry. File store unchanged | `hardening2-invite-index.test.js` (Redis) |
| 6. Dev bridge | Non-loopback Host or Origin gets 403 before the proxy | `preview/tests/vite-bridge.test.js` |
| 7. Desktop cookie fuse | **Kept off, deliberately.** The app is ad-hoc signed, so each update would ask for Keychain access to the cookie key, and declining leaves sessions unreadable. Turn it on with Developer ID signing, which is a release gate | Comment in `desktop/fuses.js` |
| 8. Pins | Both Docker stages pinned by index digest, with a Dependabot `docker` entry; pnpm hash in `packageManager`. Corepack from a fresh cache accepts the hash and rejects an altered one | `pnpm-policy.test.js` |

Not done: an admin purge route for the waitlist (eviction removes the need for now), and invite pruning in the file store (single-node and development only).

### Account-level settings (2026-10-12, with Val's approval)

- **Vercel Firewall:** three rate-limit rules published to production. Before any function runs, each answers 429 past:
  - 10 email sign-in starts per hour per IP;
  - 600 `/api` and `/auth` requests per minute per IP;
  - 600 large binaries (`glb`, `hdr`, `mp4`) per 10 minutes per IP.

  Smoke check after publishing: `/`, `/auth/session` and `/api/worlds` all returned 200.
- **Fork protection:** already on (`gitForkProtection: true`). Preview deployments sit behind Vercel's own sign-in.
- **Redis:** production (Redis Cloud) already runs `noeviction`, at 4.3 MB used. I read this with a read-only `INFO memory`, injecting the environment without printing it.
- **Left for Val (no API, or needs Val's account):**
  - a Vercel Spend Management hard pause (the dollar amount is Val's call);
  - a 70% memory alert in the Redis Cloud console;
  - a Turnstile widget, by creating keys in Cloudflare and setting the two env vars above.

### Found along the way

- **#259 (merged, `06859cd`):** the chauffeur's daily budget never passed on Redis (one-hour window bound) since #244.
- **Three refs archived but kept:** `fix/workplace-room-envelope`, `hardening-pre-stack` and `review/pr-243`. Each tip is in a tag and a restore-tested bundle, with aggregate proof, under `~/worktree-backups/river-oaks-workplace-20261011/superseded-refs-20261012/`. `project:prune` refuses them by design.

### Independent review (2026-10-12)

There were no critical or high findings. All eight findings are addressed:

1. **Medium: a few addresses could spend the whole email budget, and email sign-in pauses for everyone.**
   - Each client address now gets its own share: `EMAIL_SIGNIN_DAILY_PER_ADDRESS`, default 10 per UTC day.
   - It uses the same rate-limit key as the sign-in limiter. Both servers set it on the request before auth runs.
   - Past the share, the response is 429 `email_limited` with no WorkOS call.
   - Store and route tests run on memory and Redis.
   - Turnstile is still recommended to raise the cost of renting many addresses.
2. **Medium: a ban could miss an invite.** During a rolling deploy or a rollback, an older server writes invites without indexing them, and revocation read only the index.
   - Revocation (`revoke-owner`, and rejection in `decide`) reads the whole table again. Only an owner's own listing uses the index.
   - The test plants an unindexed invite after the index is complete. The listing misses it, but revocation still revokes it. The test fails if revocation goes back to the index.
3. **Low: the waitlist evicted newer requests before legacy ones.**
   - Legacy pending rows are indexed once (`ZADD NX` at score 0, behind a `pending-indexed` flag), so they go first.
   - A list full of decided residents never rescans.
   - Test: legacy rows give way before newer ones.
4. **Low: same-account eviction left a stale id.** When a full table evicts the signing-in account's own session, its owned list could keep the evicted id.
   - Evicted ids are now dropped before the list is written.
   - The test fails without the fix.
5. **Low: GitHub sign-ins that need email verification send a WorkOS code that isn't counted.** Not changed. WorkOS starts that send, and each one needs a separate GitHub account. Recorded here.
6. **Low: Turnstile accepted tokens minted on other hostnames.**
   - Tokens must match this site's hostname, which comes from the origin.
   - The server warns when `TURNSTILE_SECRET_KEY` is set without `VITE_TURNSTILE_SITE_KEY`.
7. **Low: a test deleted owner-index keys outside its prefix.** It now only deletes under its own prefix.
8. **Low: full tables could trigger repeated table scans.**
   - The invite prune scans at most once an hour (`invites:pruned`).
   - The waitlist's one-time index (item 3) never rescans.

Checks after the fixes: the affected server suites (redis-auth, magic-auth, auth, waitlist, invitations and all `hardening2-*`) pass 134 of 134 on an isolated Redis. The tests for items 2 and 4 fail with their fix reverted.

### Production, after merge (2026-10-12)

- **#264 deployed as `f7d10aa`.** The CSP header is live. The landing page loads all 7 fonts and the sign-in screen plays its art clip, both with zero CSP violations and no page errors in a real browser.
- **Turnstile on at 03:22 UTC.** Val set `TURNSTILE_SECRET_KEY` (sensitive) and gave the site key. `VITE_TURNSTILE_SITE_KEY` was set, then production was redeployed once. A start without a token gets 403 `challenge_failed`, with no email sent. Focusing the email field renders the "Verify you are human" widget with no CSP violations.
- **Still Val's:** a Vercel Spend Management hard pause and a Redis Cloud 70% memory alert. Steps are in `docs/security-review.md` under "Production owner settings".
