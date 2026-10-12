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

