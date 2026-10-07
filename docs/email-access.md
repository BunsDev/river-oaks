# Email access and invitations

Residents can sign up or sign in from the play screen with GitHub or their email.
Email uses [WorkOS Magic Auth](https://workos.com/docs/reference/authkit/magic-auth):
a six-digit, single-use code delivered by WorkOS, valid for ten minutes.
Verification proves inbox ownership. It does not grant access to the town.

Verified accounts start pending. An account enters only after a configured
waitlist admin approves it or it redeems a valid invitation. Rejected accounts
must be reconsidered by an admin; another invitation cannot override rejection.
Existing HTTP, asset, and WebSocket approval checks still apply.

## Invitations

- First approval or successful invitation redemption grants exactly two codes.
- Each code expires 30 days after issuance and admits one account.
- Re-approval, signing in again, expiry, and spending codes do not replenish them.
- Existing approved accounts and configured admins are not retroactively granted
  starter codes. Admins can explicitly issue codes to them.
- Accepted residents open **Your invitations** to copy and privately share codes.
- Admins open the same control to create additional codes for an approved owner,
  optionally assign redemption to a registered user, change that assignment,
  or expire a code immediately. A recipient must first sign in to appear in the
  assignment list. Owners and assigned recipients are distinct fields.
- Revoking approval or banning an owner permanently revokes their unused codes.
  Previously accepted invitees are not automatically revoked.

## Authentication and abuse boundaries

Email sign-in uses a browser-bound HttpOnly state cookie, a ten-minute pending
state, five verification attempts, and a 60-second cooldown per normalized email.
The cooldown is shared across instances. Requesting from another browser during
cooldown asks the user to wait and resend there. Responses never expose codes,
tokens, or whether an email already has an account.

State admission, verification reservations, successful consumption, invite
redemption, approval, and starter grants use atomic operations. Redis keys for
each transaction share one hash slot. Local storage serializes changes and
renames a private file containing users, invitations, and the audit together.
Storage errors deny access.

Mutating invitation requests require a verified session, same origin, CSRF token,
bounded JSON body, and server-side role checks. Email and invitation mutation
endpoints use the existing per-address authentication rate limit. Codes contain
192 random bits; request bodies are not logged. Codes are indexed by SHA-256;
the private store also retains the shareable code so the owner/admin can copy it
again. Protect the Redis database and local private volume accordingly.

The two-invite policy permits accepted users to sponsor new accounts, which then
receive their own two invitations. Email verification is not proof that accounts
belong to different humans. Admin assignment and revocation provide control over
this intended referral growth; they do not prevent someone controlling multiple
inboxes from participating in that growth.

## Configuration and operations

Use existing `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`,
`PUBLIC_ORIGIN`, and `WAITLIST_ADMIN_USER_IDS`. Enable Magic Auth and Magic Auth
email delivery in the matching WorkOS environment. The application maintains its
own waitlist and invitation codes; WorkOS organization invitation settings do not
set these codes' lifetime. No additional mail provider is required.

On 2026-10-06, the TypeSafe production environment already enabled Magic Auth
and its emails. Magic Auth was enabled in TypeSafe staging for this feature;
staging email delivery was already enabled. No email was sent as part of tests.

The file store migrates existing waitlist files by adding an empty invitations
collection on the next write. Redis adds `:waitlist:invites` beside the existing
approval and audit keys. Back up the shared access namespace before deployment.
After using invitations, do not roll back to code that drops the invitations
collection or ignores invite revocation during moderation.

## Verification

Run with an isolated local Redis database:

```sh
REDIS_URL=redis://127.0.0.1:16389 npm run test:server
npm test
npm run build
```

Tests exercise the real WorkOS SDK against a local signed-token fixture and real
Redis transactions. They cover expiry, concurrent redemption, repeat approval,
assignment, unauthorized issuance, CSRF, rejected recipients, banned inviters,
and ban/unban sequencing. Browser walkthroughs cover email to pending to invite
acceptance, member invite visibility, and admin issuance/assignment/expiry at
1440×900, 390×844, and 320×568 using mocked API responses. Actual inbox delivery
and a production deployment are separate acceptance steps.
