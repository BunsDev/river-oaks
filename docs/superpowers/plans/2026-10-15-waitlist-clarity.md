# Waitlist clarity and referral decay

- **Task:** `waitlist-clarity` (live register), owner `claude:river-oaks-penthouse (7a57e655)`.
- **Branch / worktree:** `feat/waitlist-clarity-20261015` in `../river-oaks-waitlist-clarity`, from `origin/main` `05a5e9fe`.
- **Request (Val, 2026-10-15):**
  - make it clear that signing up is a waitlist, so people don't feel stuck signing in again and again;
  - make clear what the redemption (invitation) code means;
  - make the journey onto the waitlist clear;
  - add referral decay: people who joined with a referral code receive no referral codes.

## What was wrong

- **The gate didn't say what signing in does.** Signed out, it read *Sign in with email or GitHub. Entry is by invitation or waitlist approval.* Nothing said that signing in is how you join the waitlist.
- **Waiting looked like a failed sign-in.** After signing in, a waiting person saw the same *Welcome to the district* card with one line: *You’re on the waitlist. An admin can approve you, or you can redeem an invite below.* Nothing said they were signed in, that their place was kept, that they never need to sign in again, or that the page already re-checks every 15 seconds and opens River Oaks by itself.
- **The code was never explained.** The field said *Have an invite code? Sign in first, then redeem your invite.*, without saying what a code is, who gives one, or how long it lasts.
- **Referral growth compounded.** Both first approval and redeeming a code granted two codes, so invitees could invite in turn.

## Decisions

1. **Referral decay, server-side, in both stores:**
   - Starter codes are granted only on approval from the waitlist. Redeeming no longer calls `grant`.
   - `grant` refuses a record carrying `inviteId`, so a later re-approval grants an invitee nothing.
   - Admin-issued codes are unchanged.
   - Accounts that joined by code before today keep the codes they already hold; nothing is revoked.
   - Changed in the Redis script (`server/invitations.js`) and the file store (`server/waitlist.js`) together.
2. **`/api/waitlist/status`** adds `requestedAt` (when they joined the waitlist) and `invited` (joined with a code).
3. **Gate copy** (`preview/index.html`, `access-entry.js`, `access-gate.css`):
   - **A one-row step list** in the kicker's place: *Sign in*, *Get approved*, *Enter*. It shows only while signed out or waiting, and the visitor's step is marked with `aria-current="step"`.
   - **Signed out:** *Signing in adds you to the waitlist. Already waiting? Sign in here to check.* The code button reads *Sign in first to use a code* until then.
   - **Fits beside the artwork.** A first three-sentence list pushed the sign-in column past a laptop screen (92 px over at 1440×900, 193 px at 1280×720, caught by the email-access browser test). The compact row, shorter copy and the hint moved into the button bring both to 0.
   - **A title per state:** *You’re on the waitlist*, or *Your request wasn’t approved*.
   - **A waiting message** that says you're signed in, your place is saved since the day you joined, and there's no need to sign in again.
   - **The invitation code explained for each state,** including the 30-day expiry. A failed code adds *You’re still on the waitlist.*
   - **The invitations dialog** explains the decay. An invitee with no codes reads *You joined with an invitation code, so you have no codes to share.*
4. **Landing page:** every waitlist note now reads *Sign in with email or GitHub to join · A member’s invitation code skips the wait* (six places).
5. **Docs:** `docs/email-access.md` gains "What the gate tells people", the decay rule, and a rewritten referral-growth paragraph.

## Checks

| Check | Result |
| --- | --- |
| Server tests written first (`invitations.test.js`) | red (`invited` missing; the invitee still got codes), then green |
| Focused invitation/waitlist/index/landing tests, no Redis | 12 passed, 7 Redis cases skipped |
| Same with an isolated `redis-server --save ''` on 16497 | 16/16, none skipped |
| `REDIS_URL=… pnpm run test:server` (isolated Redis) | 782/782, none skipped |
| `pnpm run verify` (final tree, 2026-10-15 18:42Z) | core passed: agent 111/111, preview 3275 passed + 1 skipped of 3277, server 590 passed + 150 Redis-only skipped, desktop 69/69, Python 141 |
| `RIVER_OAKS_SHARED_JOURNEY=access-gate pnpm run test:shared required` (mocked states: steps, code help, waiting message with date) | passed (final layout, 2026-10-15 13:39 local) |
| `pnpm run test:security:e2e` (real WorkOS SDK: email sign-in to waiting to code redemption; invitee has 0 codes and the dialog explains why; the sign-in column fits 1440×900 and 1280×720) | 2/2 passed (final layout) |

## Gaps

- No live WorkOS or production acceptance, and no human review of the copy.
- Codes already held by earlier invitees stay valid.

## Manual walkthrough

A local demo (`dist-preview` from this branch, the real game server, the WorkOS SDK fixture, a scratch file waitlist) let Val try it at `127.0.0.1:5186`. The demo harness had two faults of its own, both outside the product: the fixture mints a single access token with a 5-minute expiry at startup, so every sign-in after that was refused (`invalid_session`), and sign-in from `localhost` instead of `127.0.0.1` fails the Origin check. The demo now creates its fixture with a day-long token and redirects `localhost`.

## Next

Independent review, PR, then landing once Val approves.
