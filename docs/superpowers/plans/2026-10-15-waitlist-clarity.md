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
   - **A waiting message** that says you're signed in, your place is saved since the day you joined, and you don't need to sign in again to keep it.
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

## Independent review (88f163ac)

Nothing blocking. Both stores match; no path gives an invitee codes or stops a normal approval granting them. Follow-ups made:

- The waiting copy no longer promises "come back any time" (sessions last 7 days); it says you don't need to sign in again *to keep your place*.
- A failed re-check resets the title and hides the steps and username form; a refused request hides the kicker, steps and code field. Both are browser-checked.
- `role="list"` on the step list (Safari drops list semantics with `list-style: none`); the live-region message is only rewritten when it changes.
- The join date shows the year once it isn't this year; the browser test compares the date in the browser's own locale.
- Redis builds starter codes only for an approval. New regressions: approval after a rejection grants two codes (both stores); a full Redis invite table still admits a code holder.
- `docs/email-invites-execution.md` notes the decay.

## Column redesign (Val, 2026-10-15, from a screenshot of the waiting state)

Val: the art "looks lovely on left, but on the right we need to do a better job of spacing and sizing and widen a bit and make each section and word and button meaningful, enriching, and clearly distinct."

- Wider column (`clamp(380px, 36vw, 620px)`, card up to 460 px).
- Steps as a track with done ticks; current step filled.
- A short lead, then a *Waiting for approval* card (live pulse, what happens next).
- Name and invitation sections each get a heading with an icon, one line on what they're for, and the action beside the field (*Saved*/*Save*, *Use code* turning pink once a code is typed). *Suggest another* / *Use my GitHub name* became small secondary buttons; *Sign out* a quiet text button.
- Measured with mocked states (scratch script, built page): signed-out fits 1440×900, 1280×720, 1920×1080, 390×844 and 320×568 with no horizontal scroll; waiting fits 1440×900 and 1920×1080, and at 1280×720 overflows 73 px (only the footer below the fold).

## Checks after the review fixes and the redesign (2026-10-15 ~19:25Z)

| Check | Result |
| --- | --- |
| `REDIS_URL=<isolated> node --test` invitations, invite-index and waitlist tests | 13/13, none skipped |
| `pnpm run build` | passed; sign-in page 7 files, all served before sign-in |
| `RIVER_OAKS_SHARED_JOURNEY=access-gate pnpm run test:shared required` (adds steps done/current, the waiting card, Saved/Save, failed re-check and refused states) | passed |
| `pnpm run test:security:e2e` (the column-fit check for signed out at 1440×900 and 1280×720) | 2/2 passed |
| `REDIS_URL=<isolated> pnpm run test:server` | 783/783, none skipped |
| `pnpm run verify` | core passed: agent 111, preview 3275 + 1 skipped, server 590 + 151 Redis-only skipped, desktop 69, Python 141 |

## Gaps

- When the waitlist is full (10,000), the oldest pending request gives way and is re-requested with a new date on the next check, so "saved since" can reset for the longest waiters. Existing behaviour; documented, not changed.
- No live WorkOS or production acceptance, and no human review of the copy.
- Codes already held by earlier invitees stay valid.

## Manual walkthrough

A local demo (`dist-preview` from this branch, the real game server, the WorkOS SDK fixture, a scratch file waitlist) let Val try it at `127.0.0.1:5186`. The demo harness had two faults of its own, both outside the product: the fixture mints a single access token with a 5-minute expiry at startup, so every sign-in after that was refused (`invalid_session`), and sign-in from `localhost` instead of `127.0.0.1` fails the Origin check. The demo now creates its fixture with a day-long token and redirects `localhost`.

## Next

Independent review, PR, then landing once Val approves.
