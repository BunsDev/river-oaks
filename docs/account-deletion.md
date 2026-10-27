# In-app account deletion

Added 2026-10-24 for #292 (App Review guideline 5.1.1(v): an app that lets people
create an account lets them delete it from inside the app). It is **off by default**.
`RIVER_OAKS_ACCOUNT_DELETION=1` turns it on, on the server only, and only together with
`WORKOS_WEBHOOK_SECRET`, so that a failed erasure is retried. On Vercel only the cron
runs the erasure's second pass and retries, so it also needs `CRON_SECRET`, and works
only on the production deployment, the one deployment Vercel calls the cron on. Without
them the server logs `account_deletion_off` once, with a `reason`
(`webhook_secret_missing`, `cron_secret_missing` or `cron_not_scheduled`), and keeps
deletion off. The loopback fixture
sign-in needs only the flag. Turning it on is Val's decision; see
[Before turning it on](#before-turning-it-on).

## What a resident does

Settings → Account → Delete account. The section appears only when the server says
deletion is available for the signed-in resident; with the flag off it never appears.
It says what is removed and that it can't be undone. The resident presses
**Delete account…**, types `delete my account`, and presses **Delete account
permanently**. The page then clears what this device keeps for the account and says
the account is deleted. Focus moves to **Continue**, which returns to the start page,
signed out; after ten seconds the page goes there anyway. While the request runs, and
after a refusal, focus stays on the status line, the field or the sign-in note.

The sign-in must be recent. A resident who signed in more than ten minutes ago is
asked to sign out and sign in again first. Refreshing a session in the background
doesn't count as signing in.

## What the server does

`POST /api/account/delete` (`server/account-deletion.js`), in both the standalone town
and the hosted backend, checks in this order:

1. A signed-in session (401 otherwise).
2. The same origin and the page's CSRF token (403).
3. At most 3 attempts an hour per account (429).
4. A JSON body of at most 256 bytes, `{ "confirm": "delete my account" }`, exactly (400).
5. A sign-in in the last ten minutes. Sessions record `signedInAt` when they're created,
   and keep it through refreshes. Otherwise it answers 403 with `reason: "sign_in_again"`.

Approval and bans are not checked: anyone who can sign in can delete their account.

Then:

1. WorkOS deletes the user (`deleteUser`). A user WorkOS no longer has counts as
   deleted. Any other failure answers 502 ("We couldn't delete your account right
   now"), and nothing is erased; the session stays. If WorkOS did delete the user and
   only its answer was lost, its `user.deleted` webhook erases the account.
2. The session cookie is cleared.
3. Account erasure runs ([privacy data inventory](privacy-data-inventory.md)): the
   tombstone, every session and socket, then every store and world. The request is
   recorded, and the erasure sweep runs it again a minute or more after it finishes (on
   Vercel, at the first five-minute cron after that), for a write that was already in
   flight. The standalone town keeps that record in memory, so a restart loses it: the
   second run is skipped, and so is the retry of a failed run unless a WorkOS webhook
   also covers it (see step 4).
4. The answer is 200 `{ deleted: true, complete: true }`. If erasure failed, it's 503
   `{ deleted: true, complete: false }`, and the page says the rest finishes on its
   own: the sweep retries the recorded request until it succeeds. When WorkOS deleted
   the user in step 1, its `user.deleted` webhook runs erasure again too. One gap: when
   WorkOS already had no such user (404), no webhook follows, so if the request can't
   even be recorded before anything runs, nothing retries it.

`GET /api/account/delete` answers `{ available: false }`, or
`{ available: true, recent }` for a signed-in resident when the flag is on. It always
answers 200, even with the flag off, so opening Account never logs a failed request in
the console or a problem report. It says nothing beyond whether deletion is on. With
the flag off, `POST` gets the same 404 as any unknown path. Like other routes, it
doesn't refresh an expired access token, so the page asks `/auth/session` first. The
three attempts an hour are counted before the phrase and recency checks, so a stale
attempt counts too.

If the answer to the `POST` is lost, or it's a sign-out, the page asks `/auth/session`
again. A session that has ended means the account was most likely deleted: the page
clears the device and says so. A live session means it wasn't, and the page offers to
try again. The route is in `vercel.json`,
`server/vercel-routing.js` and the Vite proxy. Its rate-limit scope,
`account_deletion`, is on the Redis security allowlist.

The local fixture sign-in (`server/dev-auth.js`) has no provider account. There,
step 1 does nothing and erasure ends the fixture session.

## On the device

`clearAccountStorage` in `preview/src/account-deletion.js` removes the keys that hold
the account's own data or other residents' ids:
- the account's saved looks;
- voice settings with their muted residents;
- World Studio, region and designer drafts;
- the one-reload chat draft.

Theme, graphics and other display preferences stay; they belong to the device. The
inventory's [client table](privacy-data-inventory.md#client-and-desktop-storage)
lists every key.

Sign-out should clear the same keys. Sign-out lives in `preview/src/access-entry.js`
(owned by `touch-network-288-290`) and `preview/src/multiplayer-client.js` (owned by
`outdoor-residents-admin-controls-20261024`), so this change doesn't edit them. Their
owners can call `clearAccountStorage({ userId })` after a successful sign-out. The
desktop shell's user-data folder is outside this change.

## Tests

- `server/tests/account-deletion.test.js`:
  - every refusal, the order (provider, sign-out, erasure) and both failure paths;
  - the limit;
  - both WorkOS session stores with a fake WorkOS: sign-in time through refreshes and
    the desktop exchange, an expired access token, a 404 user and a failing provider;
  - the recorded request and its second pass a minute later, through the sweep;
  - the flag, webhook and Vercel cron rules (the secret, and production only), in the
    helper and the hosted backend;
  - the hosted backend's 30-second sweep timer, and none on Vercel.
  The email-code sign-in path sets `signedInAt` in the same `finishSignIn`; no test
  drives it. Nor does any test drive the hosted backend's signed-in path, which needs
  real WorkOS credentials.
- `server/tests/account-deletion-town.test.js`: a standalone town over real HTTP and
  WebSocket. A resident deletes their account, their socket closes, and their contact,
  block and profile are gone while the peer keeps their own; the request then waits for
  its second pass. The town sweeps every 30 seconds. With the flag off there's no route.
- `preview/tests/account-deletion.test.js`:
  - visibility;
  - the exact phrase and the security token;
  - device clearing, with keys written by the real voice and reload modules;
  - refusals, a lost answer, the stale sign-in path, and where focus goes.
  `preview/src/sidebar.js` asks for the status when Account opens; no unit test covers
  that call.

## Before turning it on

- WorkOS must deliver `user.deleted` to `/api/workos/events`. `WORKOS_WEBHOOK_SECRET`
  is required for the flag to take effect, but the server can't check that WorkOS
  actually sends the events. On Vercel, `CRON_SECRET` is required too, and the
  `/api/erasure-sweep` cron must be scheduled. Previews keep deletion off.
- The privacy policy should say what deletion removes and keeps (the inventory's
  Decisions), and how long the rest takes.
- The native iOS shell (#286, #287) has to reach Settings → Account.
- An end-to-end check with a real test account. Because a Vercel preview keeps deletion
  off, it runs on the production deployment or on a long-lived server (the Redis backend
  off Vercel, which sweeps on its own timer). That needs Val's authorization for WorkOS,
  the account and the deployment.

## Decisions for Val

1. **Recent sign-in.** Ten minutes, and refreshes don't count. A sign-in from the
   desktop shell counts, because the shell exchanges its token right after the browser
   sign-in and keeps none. Apple allows identity checks, but "apps that make it
   unnecessarily difficult for someone to delete their account will not pass review"
   ([Offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/),
   read 2026-10-24). Signing out and in again is a common check; with an email-code
   sign-in it takes one email. The alternative is the typed phrase alone. Recommended:
   keep the window, because it stops a borrowed or left-open session from deleting the
   account. Make sure App Review's demo account can sign in without a live inbox (#293).
2. **Waitlisted and banned residents can delete.** Their reports, bans and the
   moderation audit stay (inventory Decision 3). A banned resident can delete the
   account, then sign up again with the same GitHub account. WorkOS then gives them a
   new id that the ban doesn't cover, and only the waitlist approval stands in their
   way. Recommended: keep, and decide on inventory Decision 3's hashed ban list.
3. **Drafts on the device.** World Studio and region drafts aren't stored per
   account, but they're the resident's own work, so deletion clears them on that
   device. Recommended: keep.
