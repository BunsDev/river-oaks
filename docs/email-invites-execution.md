# Email authentication and controlled invitations

## Delivery requirements

- Review both local and Redis authentication, waitlist enforcement, and hosted routing.
- Add WorkOS Magic Auth email sign-in without bypassing waitlist approval.
- Allow verified users to redeem a single-use invitation; rejected users cannot bypass an admin decision.
- Give each newly accepted account exactly two invitations, expiring after 30 days; repeated approval cannot replenish them.
- Let admins issue, assign, and expire invitations, with audit records.
- Preserve CSRF, rate limits, session verification, and atomic persistence across server instances.
- Verify replay, concurrent redemption, expiry, assignment, authorization, and the login UI.

## Progress

- Reviewed the original GitHub-only WorkOS flow and independent protected HTTP,
  asset, and socket approval gates.
- Implemented email Magic Auth, controlled invitations, member/admin controls,
  local and Redis persistence, hosted routing, and operational documentation in
  the isolated `feat/email-invites` worktree.
- Spec and security reviews completed; fixed cooldown recovery and permanently
  revoked unused invitations before persisting account bans.
- Verified 377 server tests with real Redis (zero failures or skips), 717 preview
  tests, production build, whitespace checks, and the full secret scan.
- Verified the real WorkOS SDK with signed local fixtures, including email login
  remaining pending until invitation redemption permits a world ticket.
- Browser walkthroughs passed at 1440×900, 390×844, and 320×568 with mocked APIs:
  email verification, pending access, redemption, member visibility, and admin
  issuance, assignment, and expiry.
- Enabled and read back Magic Auth in TypeSafe staging. Production already had
  Magic Auth enabled. No test email was sent.

## Delivery

- Delivery is tracked in [PR #169](https://github.com/BunsDev/river-oaks/pull/169),
  together with the follow-up [security review](security-review.md).
- Updated the prior GitHub-only browser expectations for the new email form and
  pending invite flow. Both affected gameplay journeys passed locally before
  repeating the hosted suite.
- Actual inbox delivery and the deployed end-to-end flow still need verification.
