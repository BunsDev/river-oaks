# Security review and recurring verification

Reviewed 2026-10-06. Scope: application source, locked dependencies, local HTTP,
real Redis transactions, desktop trust boundaries, local Python bridge, and
browser tests. This is a bounded engineering review, not a claim that all
possible attacks have been eliminated or a deployed penetration test.

## Changes

- Both server backends now protect published region data with authenticated,
  approved, non-banned access, matching the existing static district-data gate.
  Normal authenticated GET requests require no new token or extra interaction.
- Debug room labels render as text, including imported names containing markup.
- Hosted and Node responses restrict scripts to the same origin, block object
  embeds, and disallow framing. The email-verification response retains its
  stricter page-specific policy. Inline layout styles, game media, sockets,
  local voice connections, and gameplay controls remain available.
- Patched the locked `source-map-js` build dependency from 1.2.1 to 1.2.2.
- Added browser email/invite/revocation and debug-content regressions, and
  weekly/manual runs of the complete existing verification workflow.

## Surface inventory

| Surface | Controls reviewed / evidence | Remaining boundary |
| --- | --- | --- |
| Identity and sessions | Real WorkOS SDK signed-token fixtures; issuer/client/method checks; sealed HttpOnly cookies; browser-bound email state, expiry, cooldown and attempt limits | Actual inbox delivery, provider configuration drift and live token revocation need staging acceptance |
| Waitlist and invitations | Manual/invite-only approval; atomic redemption and starter grants; assignment, replay, expiry, rejection, ban and revocation tests with file and Redis stores | Two-invite referral growth intentionally permits multiple accounts; email is not proof of a unique human |
| HTTP authorization | Mutations enforce identity, approval, ban, Origin and CSRF; reads now gate private region data; public world directory remains intentional | Verify deployed reverse-proxy and CDN behavior after routing changes |
| Multiplayer | Short-lived single-use tickets, origin checks, session/world binding, server-authoritative movement and creation, room fencing, bounded payloads and backpressure | Distributed volumetric denial of service needs provider limits and capacity monitoring; local tests cannot establish global capacity |
| Creator and imported data | Strict bounded primitive assemblies and region validation; admin-only publishing; imported labels rendered as text | Jevica should review third-party content; no arbitrary remote mesh importer is enabled by this patch |
| User content | Access/invite controls use text nodes; debug label browser regression; same-origin script policy | New HTML sinks or same-origin executable upload features require a fresh review |
| Static assets | Canonical path, traversal/symlink and waitlist tests; private no-store cache policy for protected assets | CDN normalization and cache isolation require deployed acceptance |
| Desktop | Sandbox, context isolation, no Node integration, exact-origin navigation, denied permissions/downloads, external-link confirmation, packaged fuse tests | Signed release/notarization and real macOS testing remain release gates |
| Local voice / decision bridge | Host checks; JSON request validation; bounded voice requests/concurrency/cache/timeouts; model integrity checks | Local processes and machine administrators are trusted; protect API keys and do not expose the loopback bridge publicly |
| Dependencies and delivery | pnpm audit, Python locked-runtime audit, dependency review, SHA-pinned Actions, secret scans, CodeQL, weekly Dependabot updates | Advisory databases have unknowns; native libraries and deployment images need separate release review |

## Verification cadence

On each PR and main push, and Monday 08:23 UTC, Verify runs the existing shared
town journeys alongside server, preview, desktop, Python and security browser
tests. Its Redis service ensures storage tests do not silently skip in CI.
It audits npm dependencies at moderate severity or higher and the exported
locked Python runtime and optional-extra requirements. Dependency review checks PR additions.
Secret scanning covers both the worktree and Git history. Manual workflow
dispatch runs the same suite. Maintainers must investigate scheduled failures;
the schedule is not an autonomous incident-response service.

Local commands (use an isolated Redis database and a supported Node runtime):

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
REDIS_URL=redis://127.0.0.1:16389 pnpm run test:server
pnpm test
pnpm run test:desktop
pnpm run build
pnpm run test:security:e2e
pnpm run test:shared
pnpm audit --audit-level=moderate
uv export --frozen --all-extras --no-hashes --no-dev --no-emit-project --format requirements-txt --output-file /tmp/river-requirements-audit.txt
uvx pip-audit==2.10.1 --no-deps --disable-pip -r /tmp/river-requirements-audit.txt
python3 scripts/check_secrets.py --all
```

The email browser test uses the built UI, actual application routes, local
waitlist persistence and the real WorkOS SDK with a local identity-provider
fixture. It tests phone/desktop entry layouts, pending denial, CSRF/admin denial,
invite redemption/replay, member controls, script policy and revoked access.
No live email is sent. Shared gameplay journeys separately exercise exploration,
social features, seating, travel, and creator flows so security changes do not
silently break play.

## Deployment and release acceptance

1. Confirm the exact merged commit passes CI and the intended deployment serves it.
2. With authorized staging accounts, check email delivery, invite acceptance,
   manual approval/revocation, logout and reconnect across two browser sessions.
3. Check anonymous/pending/banned access, protected assets and response headers
   through the real CDN, not only the origin server. Confirm trusted-proxy IP
   configuration; do not trust arbitrary forwarded headers.
4. Exercise representative browser/mobile/desktop play and inspect CSP violations.
5. Before raising world capacity, run isolated load and Redis-failure tests;
   monitor latency, failed authorization, reconnect rate, memory and queue depth.
   Define provider spending/traffic limits and alert ownership outside this repo.

Preserve the two-invite/30-day policy, existing player movement budgets, and
normal gameplay rates. Add friction only in response to measured abuse, with
specific regression tests and an explicit product decision. Never weaken a
security assertion or bypass a failing gate to make the suite green.
