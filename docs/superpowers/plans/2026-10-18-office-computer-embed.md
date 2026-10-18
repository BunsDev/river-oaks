# #486 Office desk: Tasks and Computer (Place side)

## Goal

Add Computer beside Tasks in the existing office desk dialog, issue
[#486](https://github.com/BunsDev/river-oaks/issues/486). It uses one separate-origin
frame, the five-message lifecycle contract, honest normal close and immediate forced
teardown. Local fixture work proceeds now; hosted proof belongs to #487.

## Ownership

- **Register task:** `office-computer-embed-486`, owner `claude:office-computer-embed-486 (4fad2031)`.
- **Branch:** `feat/office-computer-embed-486-20261018`, from `origin/main` 153471bc.
- **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-office-computer-embed-486`.
- **Files owned:**
  - `preview/src/office-computer-protocol.js` (new)
  - `preview/src/office-computer-frame.js` (new)
  - `preview/src/office-desk-ui.js`
  - `preview/src/office-desk.css`
  - `preview/tests/office-computer-frame.test.js` (new)
  - `preview/e2e/office-computer-embed.js` (new)
  - `preview/e2e/fixtures/office-computer-child/` (new)
  - `preview/e2e/experience-runner.js` (fixture registration)
  - `config/agent-workflow.json` and `.github/workflows/verify.yml` (journey lists)
  - `docs/office-computer-embed.md` (new)
  - `docs/offices.md` (desk paragraph)
  - this ledger
- **Not changed:**
  - server desk APIs;
  - `office-ui.js`, whose existing `suspend`/`reset`/`dispose` hooks already cover
    forced teardown;
  - Place CSP, Vercel configuration, production environment.

## Versions and dependencies

- **Contract:** `typesafe-place-embed` version 1, defined in `docs/office-computer-embed.md`.
  Place's proposal; Computer has not published `docs/PLACE_EMBED.md`.
- **Computer:** main 062ba495 (inspected 2026-10-18). No embed branch or PR exists
  (#33 open). Sign-in is `/api/auth/login`, followed by `/api/auth/callback`, then `/`.
  The session cookie is `SameSite=Lax`, and there is no `frame-ancestors` (CSP comes
  from a meta tag).
- **Hosting #21:** staging WorkOS client still invalid or unregistered as of 2026-10-03;
  no origin pair proven.
- **Continuity #27:** decision open.

## Decisions

1. **The issue's file map is out of date.** The issue baseline c17f9f1c predates #496
   (2b5062b6, 2026-10-18). #496 removed personal offices, shared Office tasks,
   `office-workspaces-api.js` and the `office-computer-shared` journey. Tasks therefore
   means My tasks, in Jevica's office only. The shared scope is not resurrected, and
   `office-computer-shared` cannot run.
2. **Frame owner.** `office-computer-frame.js` owns the frame, timers, listener and
   fence. The desk UI owns views and choices. `office-ui.js` already routes
   leave/revoke/disconnect to `desk.suspend()`, account change to `desk.reset()` and
   world teardown to `desk.dispose()`. All three now destroy Computer first.
3. **Lifecycle choices:**
   - Sign-in-required and error states remove the frame. No hidden runtime is kept, and
     sign-in is top-level in a new tab.
   - Departure before `usable` removes the frame without `prepare-close`: no document
     was shown in that instance.
   - Computer answers `attention` immediately when it needs a decision, instead of
     holding `prepare-close` past the timeout.
4. **Timeouts:** 15 s load, 1 s `init` repeat, 8 s close (`COMPUTER_TIMEOUTS`).
5. **Policy:**
   - Sandbox without top navigation, modals or downloads.
   - Permissions denied with `allow`; `no-referrer`.
   - The child must send `frame-ancestors <place origin>`.
6. **Test loopback exception:** a development build plus
   `VITE_TYPESAFE_COMPUTER_TEST_LOOPBACK=1` only.
7. **Production frame policy unchanged.** Place `frame-src` stays Turnstile-only until
   #21 proves the origin; the change is staged, see the doc.

## Review

A separate-agent review on 2026-10-18 found no breach of the message fence or forced
teardown. Fixed:

- **Departure after use.** Departure now asks Computer whenever the instance was ever
  usable, not only when it is usable now.
- **Computer tab fencing.** The click is fenced by a desk session after the async Tasks
  save. It hides a stale confirm, refuses while the task is busy and stops autosave.
- **Dialog close listener.** The `closingDesk` flag was dead because `close` events are
  queued; the listener now relies on `close()` switching to Tasks first. An unexpected
  close with no frame finishes the bookkeeping, and `open()` destroys any frame.
- **Departure outcomes.** A `destroyed` result mid-departure finishes the departure; a
  cancelled close refocuses the frame.
- **Resume and cancel.** Both restore the child's last reported state.
- **Small fixes:**
  - The receipt is cleared when the desk opens.
  - Status text is re-announced only when it changes, and the tab/tabpanel roles are fixed.
  - The frame is inert while closing.
  - Instance ids use `getRandomValues`.
- **Docs.** Contract and doc wording is aligned: loopback hosts, a local copy before
  sign-in/error after use, re-checking before `ready`, popups and the fixture's cookie
  limitation.

## Verification

All commands run from the worktree.

| Check | Result |
| --- | --- |
| `node --test preview/tests/office-computer-frame.test.js` | 13/13 pass. Mutating the two review fixes back fails exactly the two new tests. |
| `pnpm test` (before the review fixes) | 3534 tests: 3533 pass, 0 fail, 1 skipped (already on main) |
| `pnpm run build` (before the review fixes) | exit 0 |
| `pnpm run test:experience office-computer-embed` (before the review fixes) | passed, 38 checks, 64 s; forced teardown 146 ms (visit end) and 290 ms (revocation) with a hung child |

## Gaps and next step

- After the review fixes, rerun `office-visit`, `office-desk` and `office-computer-embed`,
  then `pnpm test`, build and `pnpm run verify`. Then commit (signed) and open a PR.
- Post the contract proposal to Computer #33 and the Place status to #486 and #487.
- Staged and not in this PR:
  - the real Computer candidate (#33);
  - the origin pair, auth and frame policy (#21);
  - continuity (#27);
  - the Place `frame-src` and environment change.
