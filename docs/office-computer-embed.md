# TypeSafe Computer in the office desk

This page describes how River Oaks embeds TypeSafe Computer in Jevica's office desk
([#486](https://github.com/BunsDev/river-oaks/issues/486)). It also holds the
lifecycle contract that Computer's embed mode implements
([TypeSafeAI/typesafe-computer#33](https://github.com/TypeSafeAI/typesafe-computer/issues/33)).

**Status.**

- **Place side:** implemented and tested against a deterministic local child fixture.
- **Computer side:** a candidate embed build is in draft
  [TypeSafeAI/typesafe-computer#34](https://github.com/TypeSafeAI/typesafe-computer/pull/34)
  (8c0240af, 2026-10-27). Its `docs/PLACE_EMBED.md` adopts version 1 below unchanged.
  `office-computer-real` runs the desk against it locally (see [Verification](#verification)).
- **Hosting:** since 2026-10-29 the Place frame policy lists the hosted Computer origin
  `https://typesafe-computer.vercel.app` (see [Staged blockers](#staged-blockers)).
  `VITE_TYPESAFE_COMPUTER_ORIGIN` is still unset in every hosted environment, so no
  deployed desk loads a frame; setting it is the owner's configuration step. That
  origin serves Computer's main branch, which has no embed mode: until #34 deploys, a
  frame to it never answers `init`, and the desk reports that Computer did not open
  and returns to Tasks.

## Ownership

| Place owns | Computer owns |
| --- | --- |
| Access to the office and desk, the desk dialog and its Tasks view | Sign-in, the account choice, sign-out and account switching |
| One frame per desk: creating it, the message fence and removing it | Notes, layout, local working copy, account sync |
| Input isolation, focus, the Return to office control and recovery UI | Escape inside its own menus, dialogs and gestures |
| Forced teardown on access loss | Deciding whether leaving is safe, and saying what it resolved |

Place never sends Computer a credential, cookie, token, Place account id, avatar or
task. Computer never sends Place a document, screenshot, URL or command. Computer data
is never stored in Place tasks, world snapshots or monitor textures; the eleven
penthouse displays stay neutral `SCREEN_DYNAMIC` surfaces.

## Configuration

`VITE_TYPESAFE_COMPUTER_ORIGIN` is a public build variable naming Computer's exact
origin, such as `https://computer.example.test`. Place accepts it only as a bare HTTPS
origin: no path, query, fragment, credentials, surrounding spaces or default port.
Missing, invalid or `off` configuration hides the Computer tab and loads nothing. The
Tasks desk is unchanged.

Loopback `http://127.0.0.1:<port>`, `http://localhost:<port>` or `http://[::1]:<port>` is accepted only in a Vite development build with
`VITE_TYPESAFE_COMPUTER_TEST_LOOPBACK=1`. The experience runner sets both for the
`office-computer-embed` journey. Production builds never accept `http`.

Place derives three fixed, reviewed URLs from the origin (`preview/src/office-computer-protocol.js`):

| Use | URL |
| --- | --- |
| Frame | `<origin>/?embed=place` |
| Sign in (top-level, new tab) | `<origin>/api/auth/login` |
| Open Computer separately | `<origin>/` |

`embed=place` selects presentation only. It is not identity and not a parent origin;
Computer checks the parent origin against its own configuration.

## Frame policy

- **Sandbox:** `allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox`.
  There is no top navigation, modal or download permission. `allow-same-origin` lets
  Computer use its own cookies and storage.
- **Permissions:** camera, microphone, geolocation, display capture, clipboard, payment
  and USB are denied with `allow`.
- **Referrer:** `no-referrer`.
- **Computer's response:** it must allow framing by the reviewed Place origin only
  (`Content-Security-Policy: frame-ancestors <place origin>`), with no conflicting
  `X-Frame-Options`. The fixture sends exactly this.
- **Place's response:** its `frame-src` must list Computer's origin. Since 2026-10-29 it
  lists `https://typesafe-computer.vercel.app` (`vercel.json`, `server/security-headers.js`).

Computer's session cookie is `SameSite=Lax` (`src/server/auth.js`). A Lax cookie is
sent inside a same-site frame and withheld from a cross-site one. Place and Computer
therefore need separate origins within one site, as #21 proposes. A cross-site
arrangement would show every player as signed out.

## Lifecycle contract, version 1

Every message is a plain object with exactly the listed fields:

```js
{ protocol: 'typesafe-place-embed', version: 1, type, instanceId, ...fields }
```

`instanceId` and `requestId` are 16–64 characters of `[A-Za-z0-9_-]`. Place creates a
fresh random `instanceId` for every frame. It fences stale responses; it does not
authorize anything.

| Direction | `type` | Extra fields | Meaning |
| --- | --- | --- | --- |
| Place → Computer | `init` | none | Start this frame's instance. Place sends it on load, then once a second until the first valid `status`. Computer accepts the first `init` and answers a repeat of it with its current `status`. Any other instance id is ignored. |
| Computer → Place | `status` | `state`, `sync`, and `code` when `state` is `error` | Current lifecycle state. |
| Computer → Place | `request-close` | none | The person asked to leave at Computer's top level. Computer has already handled Escape in its own menus and dialogs. |
| Place → Computer | `prepare-close` | `requestId` | Resolve your saves and say whether leaving is safe. |
| Computer → Place | `close-result` | `requestId`, `result`, and `persistence` when `result` is `ready` | The answer for that request. |

**`state`:**

- `loading`
- `signin-required`
- `account-confirmation`: Computer is showing the account with Continue/Switch.
- `usable`: a confirmed account's documents are visible.
- `error`, with a `code`.

**`sync`:**

- `none`: nothing to report.
- `pending`: a save is in flight.
- `saved`: the account acknowledged the latest change.
- `offline`: changes are kept in this browser only.
- `failed`: the account save failed.

**`code`:** `auth-failed`, `account-load-failed`, `unavailable`.

**`result`:**

- `ready`: leaving is safe.
- `cancelled`: the person chose to keep editing.
- `attention`: a decision is needed in Computer; it is showing it.

**`persistence`** (with `ready` only):

- `saved`: account-acknowledged.
- `local`: the person chose to keep a local copy.
- `none`: nothing needed saving.

### Validation

Both sides use the exact peer origin as `targetOrigin`, never `*`.

Place accepts a message only if all of these hold:

- `event.origin` is the configured origin.
- `event.source` is the current frame's `contentWindow`.
- The shape is exact, with no extra fields.
- The `instanceId` is the current instance.
- For `close-result`, the `requestId` is the pending close request.

Everything else is ignored: forged, stale, malformed, wrong-version and late messages
alike.

Computer must accept only:

- `event.source === window.parent`;
- an `event.origin` from its own allowlist, never a query parameter;
- exact `init` and `prepare-close` shapes;
- its one instance per frame.

### Account gate

On every new frame, Computer shows the signed-in account with Continue and Switch before
any document. That includes reentry and a Place account change. A cached session does
not skip the gate. Place treats Computer as usable only after `status` reports `usable`.
A frame load, a closed popup or a URL parameter proves nothing.

### Ordering

1. Place creates the frame and sends `init` (repeating until answered).
2. Computer reports `loading`, then one of:
   - `signin-required`: Place removes the frame and offers top-level sign-in plus Continue.
     If this or `error` arrives after the instance was usable (for example, the session
     expired mid-edit), Computer must already have kept unsynced work in its own local
     copy, because Place removes the frame without a `prepare-close`.
   - `account-confirmation`, then `usable`.
   - `error`.
3. While usable, `status` updates `sync`. Place's status bar reflects the reported
   `sync`; it never invents a save.
4. To leave normally (tab switch, Return to office, close, Escape, `request-close`):
   - **Never usable in this instance:** no document was shown, so Place removes the
     frame immediately.
   - **Usable at any point in this instance** (whatever it reports now): Place sends
     `prepare-close` and keeps the frame mounted, but inert, for up to 8 seconds.
     Computer re-checks for changes made just before the request:
     - `ready`: Place removes the frame and shows the persistence (`saved` or `local`)
       when returning to Tasks.
     - `cancelled`: editing continues in the same frame.
     - `attention`: the frame stays. Place offers **Keep working**, **Try again** and
       **Leave without confirmation**.
     - No answer: the same three choices, saying Computer did not confirm. A timeout is
       never reported as a save, and a reply after it is ignored.
5. Computer answers `attention` at once when it needs a decision (for example, a failed
   save) rather than holding the request. The person decides in Computer and leaves
   again.

### Reloads inside the frame

If the frame's document loads again (a reload, or Computer navigating its own frame),
Place treats it as a new instance:

- it sends a fresh `init` with a new `instanceId` and re-arms the load timeout;
- nothing the old document reported carries over, so Computer must gate again;
- a pending close is reported as unanswered, never as a save.

### Forced teardown

Place removes the frame immediately, without sending a message or waiting, when any of
these happen:

- the visit ends;
- access is revoked;
- the connection drops;
- the Place account changes;
- the world is rebuilt;
- the desk is disposed.

A pending close settles at once. Removing the frame does not cancel a write that
Computer's service already accepted. Windows Computer itself opened in new tabs are
Computer's own top-level pages, not part of the frame, and are not closed. The next
Computer tab starts a fresh instance and a fresh account gate.

## Input and focus

- **Keyboard isolation:** keys typed in Computer go to its document, so no world handler
  sees them. Opening the desk also clears held movement keys and stops push-to-talk.
- **Escape:** Computer handles Escape first. Escape on Place's own controls in the
  Computer view starts a normal close. The desk ignores Escape while focus is in the frame.
- **Unexpected close:** if the browser closes the desk without a cancel event while
  Computer is mounted, Place reopens it and closes normally.
- **Return controls:** **Return to office** and the close button are always outside the
  frame. Leaving the desk restores office focus. Returning to Tasks focuses the Tasks tab.

## Tasks beside Computer

Tasks keeps its model, permissions and APIs. Opening Computer first resolves the Tasks
guard:

- A change in flight blocks opening Computer.
- A dirty task is saved first.
- If that save fails, the desk asks before switching. The draft and its retry
  operation wait in the same model.

Autosave pauses while Computer is shown. The desk always reopens on Tasks, so opening
the desk never loads Computer by itself.

Since #496 (2026-10-18), the desk is **My tasks** only, in Jevica's office. Personal
offices and shared **Office tasks** were removed before this integration, so there is
no shared scope to preserve.

## Verification

- `node --test preview/tests/office-computer-frame.test.js` covers:
  - configuration validation;
  - exact message shapes;
  - lazy single-frame creation and the sandbox;
  - origin, source and instance fencing;
  - sign-in, error and timeout removal;
  - save-close races, attention, timeout, cancel and forced teardown;
  - listener and timer cleanup.
- `pnpm run test:experience office-computer-embed` runs the real desk against the child
  fixture:
  - top-level sign-in and the account gate on every frame;
  - note save, then recovery after the frame is removed and recreated;
  - a slow save while leaving, cancel, attention, local copy and no answer;
  - forged and stale messages, and a second account;
  - denied framing;
  - with Computer hung: visit end, revocation, Place sign-out, a dropped town connection,
    a world rebuild, and a live Place account change on one page;
  - a second Place account in the same browser, and a reload inside the frame;
  - repeated visits leaving no frame or message listener behind;
  - Escape, keyboard isolation and focus;
  - 390 px and 320 px layouts.

`RIVER_OAKS_EXPERIENCE_BROWSER=webkit` runs the same journey in Playwright's WebKit (Safari's
engine on desktop). That is not iOS or a touch device.

`RIVER_OAKS_COMPUTER_CHECKOUT=<checkout> pnpm run test:experience office-computer-real`
runs the desk against a real Computer checkout instead, built with `npm run
build:renderer`. The runner starts that checkout's `server.js` on its own loopback
origin, with `TSC_AUTH=off` dev users and in-memory sync, and `TSC_PLACE_ORIGINS` naming
Place. The journey covers:

- Computer's real account gate on every frame;
- a note's account save, then recovery after the frame and Computer's local copy are gone;
- Escape after the palette;
- a refused save kept as Computer's local copy;
- ten open, edit and close cycles;
- visit end, a dropped connection and a world rebuild;
- Switch, with top-level sign-in;
- a second Computer account in the same browser;
- an expired session;
- a visitor in another browser, then revocation;
- the next Place account in that browser, then Place sign-out;
- denied framing: Computer restarted without this Place on its list, so its own
  `frame-ancestors` refuses the frame, and Place recovers to Tasks;
- privacy of the note text.

It runs on demand, not in CI, because it needs a Computer checkout. It is still not
hosted WorkOS sign-in or the real origin pair. Its receipt is
`data/reports/office-computer-real-child-browser.json`: 40 checks against Computer
8c0240af on 2026-10-28. The fixture journey still covers what the real child can't be
made to do here: hang during teardown, and a live Place account change on one page.

The fixture is not Computer. It proves Place's behavior against the contract, not
Computer's hosting, authentication or sync. Both fixture servers run on `127.0.0.1`, and
cookies ignore ports. The journey therefore cannot show that Place and Computer
cookies stay apart; that needs the real host pair (#21).

## Staged blockers

These must be resolved before a hosted pilot (tracked in
[combined acceptance #487](https://github.com/BunsDev/river-oaks/issues/487)):

1. **Computer embed build (#33).** Candidate in draft #34 (8c0240af), with
   `docs/PLACE_EMBED.md` adopting version 1. Not merged or deployed.
2. **Hosting (#21).**
   - Prove the actual origin pair: same-site, separate origins.
   - Repair the staging WorkOS registrations.
   - Prove Computer's `frame-ancestors`, its cookie behavior when framed, and top-level
     sign-in.
3. **Continuity (#27).** Record the decision for a new Computer host's origin-local data.
4. **Place frame policy and configuration.** `frame-src` in `vercel.json` and
   `server/security-headers.js` lists `https://typesafe-computer.vercel.app` since
   2026-10-29, with the expectation in `server/tests/hardening2-security-headers.test.js`
   and the origin accepted by `preview/tests/office-computer-frame.test.js`. What remains
   is the owner's step: set `VITE_TYPESAFE_COMPUTER_ORIGIN=https://typesafe-computer.vercel.app`
   for the target environment (Preview first) once Computer's embed build (#34) is
   deployed there; before that the Computer tab appears, times out and returns to
   Tasks. The origin pair is cross-site, so the Lax-cookie question in #21 still
   decides whether a framed player is signed in.

   The variable is a production configuration change that needs its own authorization.
   Leaving it unset is the rollback: the desk returns to Tasks only.
